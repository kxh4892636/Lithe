import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export interface WorkspaceCreateRecovery {
  branch: string
  kind: 'existing' | 'new'
  projectId: string
  rootPath: string
  sourceRoot: string
}

export interface WorkspaceCreateRecoveryStore {
  clear: (rootPath: string) => void
  load: (rootPath: string) => WorkspaceCreateRecovery | undefined
  save: (recovery: WorkspaceCreateRecovery) => void
}

const assertManagedPath = (worktreeRoot: string, path: string): string => {
  const candidate = resolve(path)
  const boundary = relative(resolve(worktreeRoot), candidate)
  if (!boundary || boundary.startsWith('..') || isAbsolute(boundary)) {
    throw new TypeError('Workspace recovery is outside the Lithe-managed worktree root')
  }
  return candidate
}

const markerPath = (worktreeRoot: string, rootPath: string): string =>
  `${assertManagedPath(worktreeRoot, rootPath)}.lithe-create.json`

const parseRecovery = (value: unknown): WorkspaceCreateRecovery => {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid workspace recovery marker')
  const recovery = value as Partial<WorkspaceCreateRecovery>
  if (
    typeof recovery.branch !== 'string' ||
    (recovery.kind !== 'existing' && recovery.kind !== 'new') ||
    typeof recovery.projectId !== 'string' ||
    typeof recovery.rootPath !== 'string' ||
    typeof recovery.sourceRoot !== 'string'
  ) {
    throw new TypeError('Invalid workspace recovery marker')
  }
  return recovery as WorkspaceCreateRecovery
}

export const createWorkspaceRecoveryStore = (worktreeRoot: string): WorkspaceCreateRecoveryStore => ({
  clear: (rootPath): void => {
    const path = markerPath(worktreeRoot, rootPath)
    if (existsSync(path)) unlinkSync(path)
  },
  load: (rootPath): WorkspaceCreateRecovery | undefined => {
    const path = markerPath(worktreeRoot, rootPath)
    if (!existsSync(path)) return undefined
    return parseRecovery(JSON.parse(readFileSync(path, 'utf8')) as unknown)
  },
  save: (recovery): void => {
    const path = markerPath(worktreeRoot, recovery.rootPath)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    mkdirSync(dirname(path), { recursive: true })
    const descriptor = openSync(temporaryPath, 'wx')
    try {
      writeFileSync(descriptor, JSON.stringify(recovery), { encoding: 'utf8' })
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporaryPath, path)
  },
})
