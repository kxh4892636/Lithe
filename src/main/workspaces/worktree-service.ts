import { isAbsolute, join, relative, resolve } from 'node:path'

import type {
  ProjectWithWorkspaces,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceCreatePreview,
  WorkspaceDeletePreview,
  ProjectRemovalPreview,
} from '../../shared/app-contract'
import type { WorkspaceCreateRecovery, WorkspaceCreateRecoveryStore } from './create-recovery-store'
import type { GitWorktreeDriver } from './git-worktree-driver'

interface WorktreeServiceOptions {
  addWorkspace: (workspace: Workspace) => void
  createId: () => string
  driver: GitWorktreeDriver
  getProject: (projectId: string) => ProjectWithWorkspaces | undefined
  getWorkspace: (workspaceId: string) => Workspace | undefined
  hasRunningTasks: (workspaceId: string) => boolean
  now: () => Date
  recovery: WorkspaceCreateRecoveryStore
  removeProject: (projectId: string) => void
  removeWorkspace: (workspaceId: string) => void
  renameWorkspace: (workspaceId: string, name: string) => Workspace
  worktreeRoot: string
}

export interface WorktreeService {
  create: (input: WorkspaceCreateInput, confirmedDirtyFingerprint?: string) => Promise<Workspace>
  delete: (workspaceId: string, branchConfirmation?: string) => Promise<void>
  previewProjectRemoval: (projectId: string) => Promise<ProjectRemovalPreview>
  previewCreate: (input: WorkspaceCreateInput) => Promise<WorkspaceCreatePreview>
  previewDelete: (workspaceId: string) => Promise<WorkspaceDeletePreview>
  removeProject: (projectId: string, branchConfirmations?: Record<string, string>) => Promise<void>
  rename: (workspaceId: string, name: string) => Workspace
}

const normalizedName = (value: string): string => {
  const name = value.trim()
  if (!name || name.length > 80) throw new TypeError('Workspace name must be between 1 and 80 characters')
  return name
}

const directoryName = (value: string): string => {
  const safe = value
    .trim()
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/[. ]+$/g, '')
  if (!safe || safe === '.' || safe === '..') throw new TypeError('Workspace name cannot form a safe directory')
  return safe.slice(0, 80)
}

const assertManagedPath = (worktreeRoot: string, path: string): void => {
  const boundary = relative(resolve(worktreeRoot), resolve(path))
  if (!boundary || boundary.startsWith('..') || isAbsolute(boundary)) {
    throw new TypeError('Workspace is outside the Lithe-managed worktree root')
  }
}

const validateInput = (input: WorkspaceCreateInput): { branch: string; kind: 'existing' | 'new'; name: string } => {
  const newBranch = input.newBranch?.trim()
  const existingBranch = input.existingBranch?.trim()
  if (Boolean(newBranch) === Boolean(existingBranch)) {
    throw new TypeError('Exactly one of newBranch or existingBranch is required')
  }
  if (newBranch && !input.from?.trim()) throw new TypeError('New branch requires an explicit from commit')
  if (existingBranch && input.from) throw new TypeError('Existing branch cannot specify from')
  const branch = newBranch ?? existingBranch ?? ''
  return {
    branch,
    kind: newBranch ? 'new' : 'existing',
    name: normalizedName(input.name ?? branch),
  }
}

const project = (options: WorktreeServiceOptions, projectId: string): ProjectWithWorkspaces => {
  const value = options.getProject(projectId)
  if (!value) throw new TypeError('Project does not exist')
  if (!value.isValid) throw new TypeError('Project is invalid')
  return value
}

const createSource = (
  options: WorktreeServiceOptions,
  input: WorkspaceCreateInput,
): { project: ProjectWithWorkspaces; rootPath: string } => {
  const sourceProject = project(options, input.projectId)
  if (!input.sourceWorkspaceId) return { project: sourceProject, rootPath: sourceProject.rootPath }
  const sourceWorkspace = options.getWorkspace(input.sourceWorkspaceId)
  if (!sourceWorkspace || sourceWorkspace.projectId !== sourceProject.id) {
    throw new TypeError('Source workspace does not belong to the project')
  }
  return { project: sourceProject, rootPath: sourceWorkspace.rootPath }
}

const workspace = (options: WorktreeServiceOptions, workspaceId: string): Workspace => {
  const value = options.getWorkspace(workspaceId)
  if (!value) throw new TypeError('Workspace does not exist')
  if (value.kind !== 'derived' || !value.projectId || !value.gitBranch) {
    throw new TypeError('Only derived Git workspaces can be deleted')
  }
  assertManagedPath(options.worktreeRoot, value.rootPath)
  return value
}

const previewCreate = async (
  options: WorktreeServiceOptions,
  input: WorkspaceCreateInput,
): Promise<WorkspaceCreatePreview> => {
  validateInput(input)
  const state = await options.driver.inspectSource(createSource(options, input).rootPath)
  return {
    dirtyFingerprint: state.dirtyFingerprint,
    dirtyPaths: state.dirtyPaths,
    headCommit: state.headCommit,
    input,
  }
}

const previewDelete = async (options: WorktreeServiceOptions, workspaceId: string): Promise<WorkspaceDeletePreview> => {
  const target = workspace(options, workspaceId)
  if (options.hasRunningTasks(target.id)) throw new TypeError('Workspace has running tasks')
  const source = project(options, target.projectId ?? '')
  const worktreeExists = await options.driver.worktreeExists(source.rootPath, target.rootPath)
  const dirtyPaths = worktreeExists ? await options.driver.status(target.rootPath) : []
  const sourceState = await options.driver.inspectSource(source.rootPath)
  const branchExists = await options.driver.branchExists(source.rootPath, target.gitBranch ?? '')
  const unmergedCommits = branchExists
    ? await options.driver.unmergedCommits(source.rootPath, sourceState.branch, target.gitBranch ?? '')
    : []
  return { branch: target.gitBranch ?? '', dirtyPaths, unmergedCommits, workspace: target }
}

const assertDeletable = (preview: WorkspaceDeletePreview, branchConfirmation?: string): void => {
  if (preview.dirtyPaths.length > 0) throw new TypeError(`Workspace is dirty: ${preview.dirtyPaths.join(', ')}`)
  if (preview.unmergedCommits.length > 0 && branchConfirmation !== preview.branch) {
    throw new TypeError('Full branch name confirmation is required')
  }
}

const removeGitWorkspace = async (options: WorktreeServiceOptions, preview: WorkspaceDeletePreview): Promise<void> => {
  const source = project(options, preview.workspace.projectId ?? '')
  await options.driver.removeWorktree(source.rootPath, preview.workspace.rootPath)
  await options.driver.deleteBranch(source.rootPath, preview.branch)
}

const previewProjectRemoval = async (
  options: WorktreeServiceOptions,
  projectId: string,
): Promise<ProjectRemovalPreview> => {
  const target = project(options, projectId)
  const derived = target.workspaces.filter((candidate): boolean => candidate.kind === 'derived')
  return {
    project: target,
    workspaces: await Promise.all(derived.map((candidate) => previewDelete(options, candidate.id))),
  }
}

const cleanupRecovery = async (options: WorktreeServiceOptions, recovery: WorkspaceCreateRecovery): Promise<void> => {
  await options.driver.removeWorktree(recovery.sourceRoot, recovery.rootPath)
  if (recovery.kind === 'new') await options.driver.deleteBranch(recovery.sourceRoot, recovery.branch)
  options.recovery.clear(recovery.rootPath)
}

const recoverInterruptedCreate = async (
  options: WorktreeServiceOptions,
  expected: WorkspaceCreateRecovery,
): Promise<Workspace | undefined> => {
  const recovery = options.recovery.load(expected.rootPath)
  if (!recovery) return undefined
  if (
    recovery.branch !== expected.branch ||
    recovery.kind !== expected.kind ||
    recovery.projectId !== expected.projectId ||
    resolve(recovery.rootPath) !== resolve(expected.rootPath) ||
    resolve(recovery.sourceRoot) !== resolve(expected.sourceRoot)
  ) {
    throw new TypeError('Workspace recovery marker does not match this create request')
  }
  const persisted = options
    .getProject(expected.projectId)
    ?.workspaces.find((candidate): boolean => resolve(candidate.rootPath) === resolve(expected.rootPath))
  if (persisted) {
    options.recovery.clear(expected.rootPath)
    return persisted
  }
  await cleanupRecovery(options, recovery)
  return undefined
}

const createWorkspace = async (
  options: WorktreeServiceOptions,
  input: WorkspaceCreateInput,
  confirmedDirtyFingerprint?: string,
): Promise<Workspace> => {
  const validated = validateInput(input)
  const { project: source, rootPath: sourceRoot } = createSource(options, input)
  const rootPath = join(
    options.worktreeRoot,
    `${directoryName(source.name)}-${source.id.slice(0, 8)}`,
    directoryName(validated.name),
  )
  const recovered = await recoverInterruptedCreate(options, {
    branch: validated.branch,
    kind: validated.kind,
    projectId: source.id,
    rootPath,
    sourceRoot,
  })
  if (recovered) return recovered
  const state = await options.driver.inspectSource(sourceRoot)
  if (state.dirtyPaths.length > 0 && confirmedDirtyFingerprint !== state.dirtyFingerprint) {
    throw new TypeError('Dirty source preview confirmation is required')
  }
  const commit = await options.driver.resolveCommit(
    sourceRoot,
    validated.kind === 'new' ? (input.from ?? '') : validated.branch,
  )
  const branchExists = await options.driver.branchExists(sourceRoot, validated.branch)
  if (validated.kind === 'new' && branchExists) throw new TypeError('New branch already exists')
  if (validated.kind === 'existing' && !branchExists) throw new TypeError('Existing branch does not exist')
  if (await options.driver.isBranchCheckedOut(sourceRoot, validated.branch)) {
    throw new TypeError('Branch is already checked out in another worktree')
  }
  const created: Workspace = {
    createdAt: options.now(),
    gitBranch: validated.branch,
    id: options.createId(),
    kind: 'derived',
    name: validated.name,
    pinnedAt: null,
    projectId: source.id,
    rootPath,
  }
  const recovery: WorkspaceCreateRecovery = {
    branch: validated.branch,
    kind: validated.kind,
    projectId: source.id,
    rootPath,
    sourceRoot,
  }
  options.recovery.save(recovery)
  try {
    if (validated.kind === 'new') {
      await options.driver.createNewBranch(sourceRoot, rootPath, validated.branch, commit)
    } else {
      await options.driver.createExistingBranch(sourceRoot, rootPath, validated.branch)
    }
    options.addWorkspace(created)
  } catch (error: unknown) {
    const failures: unknown[] = [error]
    try {
      await cleanupRecovery(options, recovery)
    } catch (cleanupError: unknown) {
      failures.push(cleanupError)
    }
    throw new AggregateError(failures, error instanceof Error ? error.message : 'Workspace creation failed')
  }
  options.recovery.clear(rootPath)
  return created
}

export const createWorktreeService = (options: WorktreeServiceOptions): WorktreeService => ({
  create: (input, confirmedDirtyFingerprint): Promise<Workspace> =>
    createWorkspace(options, input, confirmedDirtyFingerprint),
  delete: async (workspaceId, branchConfirmation): Promise<void> => {
    const preview = await previewDelete(options, workspaceId)
    assertDeletable(preview, branchConfirmation)
    await removeGitWorkspace(options, preview)
    options.removeWorkspace(preview.workspace.id)
  },
  previewCreate: (input): Promise<WorkspaceCreatePreview> => previewCreate(options, input),
  previewDelete: (workspaceId): Promise<WorkspaceDeletePreview> => previewDelete(options, workspaceId),
  previewProjectRemoval: (projectId): Promise<ProjectRemovalPreview> => previewProjectRemoval(options, projectId),
  removeProject: async (projectId, branchConfirmations = {}): Promise<void> => {
    const preview = await previewProjectRemoval(options, projectId)
    for (const candidate of preview.workspaces) {
      assertDeletable(candidate, branchConfirmations[candidate.workspace.id])
    }
    for (const candidate of preview.workspaces) await removeGitWorkspace(options, candidate)
    options.removeProject(projectId)
  },
  rename: (workspaceId, name): Workspace => {
    workspace(options, workspaceId)
    return options.renameWorkspace(workspaceId, normalizedName(name))
  },
})
