import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { CheckRepoActions, simpleGit, type FileStatusResult, type SimpleGit } from 'simple-git'

import type {
  GitChangeEntry,
  GitChangeKind,
  GitChangeList,
  GitDiffSnapshot,
  Workspace,
} from '../../shared/app-contract'
import { fileContentMaxBytes } from '../files/file-service'

interface GitDiffServiceOptions {
  getWorkspace: (workspaceId: string) => Workspace | undefined
}

interface GitMetadataPaths {
  headPath: string
  indexPath: string
  packedRefs?: PackedRefsCache
  packedRefsLoading?: Promise<PackedRefsCache>
  packedRefsPath: string
  refs: Map<string, string>
}

interface PackedRefsCache {
  refs: Map<string, string>
  version: string
}

export interface GitDiffService {
  list: (workspaceId: string) => Promise<GitChangeList>
  read: (workspaceId: string, kind: GitChangeKind, relativePath: string) => Promise<GitDiffSnapshot>
  version: (workspaceId: string, relativePath?: string) => Promise<string | null>
}

const isWithin = (root: string, path: string): boolean => {
  const boundary = relative(root, path)
  return boundary === '' || (!boundary.startsWith('..') && !isAbsolute(boundary))
}

const workspaceRoot = async (options: GitDiffServiceOptions, workspaceId: string): Promise<string> => {
  const workspace = options.getWorkspace(workspaceId)
  if (!workspace) throw new TypeError('Workspace does not exist')
  return await realpath(workspace.rootPath)
}

const change = (kind: GitChangeKind, relativePath: string): GitChangeEntry => ({
  id: `${kind}:${relativePath}`,
  kind,
  relativePath,
})

const hasKind = (file: FileStatusResult, kind: GitChangeKind): boolean => {
  if (kind === 'untracked') return file.index === '?' && file.working_dir === '?'
  if (file.index === '?' && file.working_dir === '?') return false
  return kind === 'staged' ? file.index !== ' ' : file.working_dir !== ' '
}

const listChanges = (files: FileStatusResult[]): GitChangeEntry[] => {
  const staged: GitChangeEntry[] = []
  const unstaged: GitChangeEntry[] = []
  const untracked: GitChangeEntry[] = []
  for (const file of files) {
    if (hasKind(file, 'staged')) staged.push(change('staged', file.path))
    if (hasKind(file, 'unstaged')) unstaged.push(change('unstaged', file.path))
    if (hasKind(file, 'untracked')) untracked.push(change('untracked', file.path))
  }
  const byPath = (left: GitChangeEntry, right: GitChangeEntry): number =>
    left.relativePath.localeCompare(right.relativePath)
  return [...staged.sort(byPath), ...unstaged.sort(byPath), ...untracked.sort(byPath)]
}

const gitContent = async (git: SimpleGit, revision: string): Promise<string> => {
  const size = Number((await git.raw(['cat-file', '-s', revision])).trim())
  if (!Number.isSafeInteger(size) || size > fileContentMaxBytes) throw new TypeError('File is too large to review')
  const content = await git.raw(['show', revision])
  if (Buffer.byteLength(content, 'utf8') > fileContentMaxBytes) throw new TypeError('File is too large to review')
  if (content.includes('\0')) throw new TypeError('Binary files cannot be reviewed')
  return content
}

const workingContent = async (root: string, relativePath: string): Promise<string> => {
  const lexical = resolve(root, relativePath)
  if (!relativePath || isAbsolute(relativePath) || !isWithin(root, lexical)) {
    throw new TypeError('File is outside the workspace boundary')
  }
  const actual = await realpath(lexical)
  if (!isWithin(root, actual)) throw new TypeError('File is outside the workspace boundary')
  if ((await stat(actual)).size > fileContentMaxBytes) throw new TypeError('File is too large to review')
  const content = await readFile(actual, 'utf8')
  if (Buffer.byteLength(content, 'utf8') > fileContentMaxBytes) throw new TypeError('File is too large to review')
  if (content.includes('\0')) throw new TypeError('Binary files cannot be reviewed')
  return content
}

const comparison = async (
  git: SimpleGit,
  root: string,
  kind: GitChangeKind,
  file: FileStatusResult,
): Promise<Pick<GitDiffSnapshot, 'modified' | 'original'>> => {
  const relativePath = file.path
  if (kind === 'staged') {
    return {
      modified: file.index === 'D' ? '' : await gitContent(git, `:${relativePath}`),
      original: file.index === 'A' ? '' : await gitContent(git, `HEAD:${file.from ?? relativePath}`),
    }
  }
  const modified = file.working_dir === 'D' ? '' : await workingContent(root, relativePath)
  return kind === 'unstaged'
    ? { modified, original: file.index === 'D' ? '' : await gitContent(git, `:${relativePath}`) }
    : { modified, original: '' }
}

const readOnlyGit = (root: string): SimpleGit => simpleGit(root).env('GIT_OPTIONAL_LOCKS', '0')

const gitPath = async (git: SimpleGit, root: string, name: string): Promise<string> => {
  const value = (await git.revparse(['--git-path', name])).trim()
  return isAbsolute(value) ? value : resolve(root, value)
}

const pathsFor = async (
  cache: Map<string, GitMetadataPaths>,
  git: SimpleGit,
  root: string,
): Promise<GitMetadataPaths> => {
  const cached = cache.get(root)
  if (cached) return cached
  const paths = {
    headPath: await gitPath(git, root, 'HEAD'),
    indexPath: await gitPath(git, root, 'index'),
    packedRefsPath: await gitPath(git, root, 'packed-refs'),
    refs: new Map<string, string>(),
  }
  cache.set(root, paths)
  return paths
}

const packedRefs = async (paths: GitMetadataPaths): Promise<PackedRefsCache> => {
  let version = 'missing'
  try {
    const metadata = await stat(paths.packedRefsPath)
    version = `${metadata.mtimeMs}:${metadata.size}`
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (paths.packedRefs?.version === version) return paths.packedRefs
  if (paths.packedRefsLoading) return await paths.packedRefsLoading
  paths.packedRefsLoading = (async (): Promise<PackedRefsCache> => {
    const values = version === 'missing' ? '' : await readFile(paths.packedRefsPath, 'utf8')
    const refs = new Map<string, string>()
    for (const line of values.split(/\r?\n/u)) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue
      const separator = line.indexOf(' ')
      if (separator > 0) refs.set(line.slice(separator + 1), line.slice(0, separator))
    }
    return { refs, version }
  })()
  try {
    paths.packedRefs = await paths.packedRefsLoading
    return paths.packedRefs
  } finally {
    paths.packedRefsLoading = undefined
  }
}

const headVersion = async (git: SimpleGit, root: string, paths: GitMetadataPaths): Promise<string> => {
  const head = (await readFile(paths.headPath, 'utf8')).trim()
  if (!head.startsWith('ref: ')) return head
  const name = head.slice(5)
  let path = paths.refs.get(name)
  if (!path) {
    path = await gitPath(git, root, name)
    paths.refs.set(name, path)
  }
  try {
    return `${head}:${(await readFile(path, 'utf8')).trim()}`
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return `${head}:${(await packedRefs(paths)).refs.get(name) ?? 'unborn'}`
  }
}

const workingVersion = async (root: string, relativePath?: string): Promise<string> => {
  if (!relativePath) return ''
  const lexical = resolve(root, relativePath)
  if (isAbsolute(relativePath) || !isWithin(root, lexical))
    throw new TypeError('File is outside the workspace boundary')
  try {
    const actual = await realpath(lexical)
    if (!isWithin(root, actual)) throw new TypeError('File is outside the workspace boundary')
    const metadata = await stat(actual)
    return `${metadata.mtimeMs}:${metadata.size}`
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw error
  }
}

export const createGitDiffService = (options: GitDiffServiceOptions): GitDiffService => {
  const metadataPaths = new Map<string, GitMetadataPaths>()
  return {
    list: async (workspaceId): Promise<GitChangeList> => {
      const root = await workspaceRoot(options, workspaceId)
      const git = readOnlyGit(root)
      if (!(await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT))) return { changes: [], isRepository: false }
      return { changes: listChanges((await git.status()).files), isRepository: true }
    },
    read: async (workspaceId, kind, relativePath): Promise<GitDiffSnapshot> => {
      const root = await workspaceRoot(options, workspaceId)
      const git = readOnlyGit(root)
      if (!(await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)))
        throw new TypeError('Workspace is not a Git repository')
      const file = (await git.status()).files.find(
        (candidate): boolean => candidate.path === relativePath && hasKind(candidate, kind),
      )
      if (!file) throw new TypeError('Git change does not exist')
      return {
        ...change(kind, relativePath),
        ...(await comparison(git, root, kind, file)),
      }
    },
    version: async (workspaceId, relativePath): Promise<string | null> => {
      const root = await workspaceRoot(options, workspaceId)
      const git = readOnlyGit(root)
      try {
        await stat(resolve(root, '.git'))
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          metadataPaths.delete(root)
          return `no-git:${await workingVersion(root, relativePath)}`
        }
        throw error
      }
      let paths = metadataPaths.get(root)
      if (!paths) {
        if (!(await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT))) return null
        paths = await pathsFor(metadataPaths, git, root)
      }
      let index = 'missing'
      try {
        const metadata = await stat(paths.indexPath)
        index = `${metadata.mtimeMs}:${metadata.size}`
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      return `${index}:${await headVersion(git, root, paths)}:${await workingVersion(root, relativePath)}`
    },
  }
}
