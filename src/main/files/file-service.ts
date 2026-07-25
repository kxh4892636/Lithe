import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import chokidar, { type FSWatcher } from 'chokidar'
import createIgnore, { type Ignore } from 'ignore'

import type {
  FileChangeEvent,
  FileDocumentSnapshot,
  FileDraft,
  FileTreeEntry,
  Workspace,
} from '../../shared/app-contract'

const runFile = promisify(execFile)
export const fileContentMaxBytes = 5 * 1024 * 1024

interface FileServiceOptions {
  changed: (event: FileChangeEvent) => void
  getWorkspace: (workspaceId: string) => Workspace | undefined
  onError?: (error: unknown) => void
  platform?: NodeJS.Platform
}

export interface FileService {
  clearDraft: (workspaceId: string, relativePath: string) => void
  close: () => Promise<void>
  getDrafts: () => FileDraft[]
  listDirectory: (workspaceId: string, relativeDirectory: string, showIgnored: boolean) => Promise<FileTreeEntry[]>
  read: (workspaceId: string, relativePath: string) => Promise<FileDocumentSnapshot>
  save: (
    workspaceId: string,
    relativePath: string,
    content: string,
    expectedFingerprint: string,
    force?: boolean,
  ) => Promise<FileDocumentSnapshot>
  setDraft: (draft: FileDraft) => Promise<void>
  watch: (workspaceId: string) => Promise<void>
}

const fingerprint = (content: string): string => createHash('sha256').update(content).digest('hex')
const slash = (path: string): string => path.replaceAll('\\', '/')

const isWithin = (root: string, path: string): boolean => {
  const boundary = relative(root, path)
  return boundary === '' || (!boundary.startsWith('..') && !isAbsolute(boundary))
}

const workspaceRoot = async (options: FileServiceOptions, workspaceId: string): Promise<string> => {
  const workspace = options.getWorkspace(workspaceId)
  if (!workspace) throw new TypeError('Workspace does not exist')
  return await realpath(workspace.rootPath)
}

const resolveExisting = async (root: string, relativePath: string): Promise<string> => {
  if (!relativePath || isAbsolute(relativePath)) throw new TypeError('File path must be workspace-relative')
  const lexical = resolve(root, relativePath)
  if (!isWithin(root, lexical)) throw new TypeError('File is outside the workspace boundary')
  const actual = await realpath(lexical)
  if (!isWithin(root, actual)) throw new TypeError('File symlink target is outside the workspace boundary')
  return actual
}

const resolveFile = async (root: string, relativePath: string): Promise<string> => {
  const actual = await resolveExisting(root, relativePath)
  const metadata = await stat(actual)
  if (!metadata.isFile()) throw new TypeError('Path is not an existing file')
  if (metadata.size > fileContentMaxBytes) throw new TypeError('File is too large to edit')
  return actual
}

const snapshot = async (root: string, relativePath: string): Promise<FileDocumentSnapshot> => {
  const content = await readFile(await resolveFile(root, relativePath), 'utf8')
  if (Buffer.byteLength(content, 'utf8') > fileContentMaxBytes) throw new TypeError('File is too large to edit')
  if (content.includes('\0')) throw new TypeError('Binary files cannot be edited')
  return { content, fingerprint: fingerprint(content), relativePath }
}

const hiddenPaths = async (directory: string, names: string[], platform: NodeJS.Platform): Promise<Set<string>> => {
  if (names.length === 0 || platform === 'linux') return new Set()
  if (platform === 'win32') {
    const { stdout } = await runFile('attrib.exe', ['/D', join(directory, '*')], { windowsHide: true })
    return new Set(
      names.filter((name): boolean => {
        const path = resolve(directory, name)
        return stdout
          .split(/\r?\n/u)
          .some(
            (line): boolean =>
              line.endsWith(path) && line.slice(0, Math.max(0, line.length - path.length)).includes('H'),
          )
      }),
    )
  }
  if (platform === 'darwin') {
    const { stdout } = await runFile('find', [
      directory,
      '-mindepth',
      '1',
      '-maxdepth',
      '1',
      '-flags',
      'hidden',
      '-print0',
    ])
    return new Set(
      stdout
        .split('\0')
        .filter(Boolean)
        .map((path): string => slash(relative(directory, path))),
    )
  }
  return new Set()
}

const rebaseIgnoreLine = (base: string, line: string): string => {
  if (!base || !line || line.startsWith('#')) return line
  const negated = line.startsWith('!')
  const pattern = negated ? line.slice(1) : line
  const unanchored = pattern.replace(/\/$/u, '').includes('/') === false
  const rebased = unanchored ? `${base}/**/${pattern}` : `${base}/${pattern.replace(/^\//u, '')}`
  return `${negated ? '!' : ''}${rebased}`
}

const ignoreRules = async (root: string, relativeDirectory: string): Promise<Ignore> => {
  const matcher = createIgnore()
  const segments = relativeDirectory ? slash(relativeDirectory).split('/') : []
  for (let depth = 0; depth <= segments.length; depth += 1) {
    const base = segments.slice(0, depth).join('/')
    try {
      const rules = await readFile(resolve(root, base, '.gitignore'), 'utf8')
      matcher.add(rules.split(/\r?\n/u).map((line): string => rebaseIgnoreLine(base, line)))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return matcher
}

const ancestorRealPaths = async (root: string, relativeDirectory: string): Promise<Set<string>> => {
  const paths = new Set<string>([root])
  const segments = relativeDirectory ? slash(relativeDirectory).split('/') : []
  for (let depth = 1; depth <= segments.length; depth += 1) {
    paths.add(await realpath(resolve(root, ...segments.slice(0, depth))))
  }
  return paths
}

interface ListContext {
  ancestors: Set<string>
  hidden: Set<string>
  matcher: Ignore
  relativeDirectory: string
  root: string
}

const treeEntry = async (context: ListContext, name: string): Promise<FileTreeEntry | undefined> => {
  if (name === '.git') return undefined
  const path = resolve(context.root, context.relativeDirectory, name)
  if (context.hidden.has(name)) return undefined
  const relativePath = slash(join(context.relativeDirectory, name))
  let actual = path
  const link = (await lstat(path)).isSymbolicLink()
  try {
    if (link) actual = await realpath(path)
  } catch {
    return { externalSymlink: true, id: relativePath, isDirectory: false, name, relativePath }
  }
  const blockedLink = link && (!isWithin(context.root, actual) || context.ancestors.has(actual))
  const isDirectory = !blockedLink && (await stat(actual)).isDirectory()
  const ignored = context.matcher.ignores(isDirectory ? `${relativePath}/` : relativePath)
  if (ignored) return undefined
  return {
    children: isDirectory ? [] : undefined,
    externalSymlink: blockedLink,
    id: relativePath,
    isDirectory,
    name,
    relativePath,
  }
}

const mapConcurrent = async <Input, Output>(
  values: Input[],
  concurrency: number,
  map: (value: Input) => Promise<Output>,
): Promise<Output[]> => {
  const results = Array.from<Output>({ length: values.length })
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await map(values[index])
    }
  }
  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(Array.from({ length: workerCount }, async (): Promise<void> => await worker()))
  return results
}

const listDirectory = async (
  options: FileServiceOptions,
  workspaceId: string,
  relativeDirectory: string,
  showIgnored: boolean,
): Promise<FileTreeEntry[]> => {
  const root = await workspaceRoot(options, workspaceId)
  const directory = relativeDirectory ? await resolveExisting(root, relativeDirectory) : root
  if (!(await stat(directory)).isDirectory()) throw new TypeError('Path is not a directory')
  const names = await readdir(directory)
  if (names.length > 10_000) throw new TypeError('Directory has too many entries')
  const context: ListContext = {
    ancestors: await ancestorRealPaths(root, relativeDirectory),
    hidden: await hiddenPaths(directory, names, options.platform ?? process.platform),
    matcher: showIgnored ? createIgnore() : await ignoreRules(root, relativeDirectory),
    relativeDirectory,
    root,
  }
  const entries = (await mapConcurrent(names, 32, async (name) => await treeEntry(context, name))).filter(
    (entry): entry is FileTreeEntry => entry !== undefined,
  )
  return entries.sort((left, right): number =>
    left.isDirectory === right.isDirectory ? left.name.localeCompare(right.name) : left.isDirectory ? -1 : 1,
  )
}

export const createFileService = (options: FileServiceOptions): FileService => {
  const drafts = new Map<string, FileDraft>()
  const watchers = new Map<string, FSWatcher>()
  const draftKey = (workspaceId: string, relativePath: string): string => `${workspaceId}\0${relativePath}`
  return {
    clearDraft: (workspaceId, relativePath): void => {
      drafts.delete(draftKey(workspaceId, relativePath))
    },
    close: async (): Promise<void> => {
      await Promise.all([...watchers.values()].map(async (watcher): Promise<void> => await watcher.close()))
      watchers.clear()
    },
    getDrafts: (): FileDraft[] => [...drafts.values()],
    listDirectory: async (workspaceId, relativeDirectory, showIgnored): Promise<FileTreeEntry[]> =>
      await listDirectory(options, workspaceId, relativeDirectory, showIgnored),
    read: async (workspaceId, relativePath): Promise<FileDocumentSnapshot> =>
      await snapshot(await workspaceRoot(options, workspaceId), relativePath),
    save: async (workspaceId, relativePath, content, expectedFingerprint, force = false) => {
      if (Buffer.byteLength(content, 'utf8') > fileContentMaxBytes) throw new TypeError('File is too large to edit')
      const root = await workspaceRoot(options, workspaceId)
      const current = await snapshot(root, relativePath)
      if (!force && current.fingerprint !== expectedFingerprint) throw new TypeError('File changed on disk')
      await writeFile(await resolveFile(root, relativePath), content, 'utf8')
      drafts.delete(draftKey(workspaceId, relativePath))
      return await snapshot(root, relativePath)
    },
    setDraft: async (draft): Promise<void> => {
      if (Buffer.byteLength(draft.content, 'utf8') > fileContentMaxBytes) throw new TypeError('Draft is too large')
      await resolveFile(await workspaceRoot(options, draft.workspaceId), draft.relativePath)
      drafts.set(draftKey(draft.workspaceId, draft.relativePath), draft)
    },
    watch: async (workspaceId): Promise<void> => {
      if (watchers.has(workspaceId)) return
      const root = await workspaceRoot(options, workspaceId)
      const platform = options.platform ?? process.platform
      const watcher = chokidar.watch(root, {
        followSymlinks: false,
        ignoreInitial: true,
        ignored: (path): boolean => path === resolve(root, '.git') || isWithin(resolve(root, '.git'), resolve(path)),
        usePolling: platform === 'win32',
      })
      const notify = (type: FileChangeEvent['type'], path: string): void => {
        const relativePath = slash(relative(root, path))
        if (relativePath && isWithin(root, resolve(path))) options.changed({ relativePath, type, workspaceId })
      }
      watcher.on('add', (path): void => notify('add', path))
      watcher.on('change', (path): void => notify('change', path))
      watcher.on('unlink', (path): void => notify('unlink', path))
      watcher.on('error', (error): void => (options.onError ?? globalThis.console.error)(error))
      watchers.set(workspaceId, watcher)
      await new Promise<void>((resolveReady, reject): void => {
        watcher.once('ready', resolveReady)
        watcher.once('error', reject)
      })
    },
  }
}
