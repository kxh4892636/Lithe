/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest'

import type { ProjectWithWorkspaces, Workspace } from '../../shared/app-contract'
import type { WorkspaceCreateRecovery, WorkspaceCreateRecoveryStore } from './create-recovery-store'
import type { GitWorktreeDriver } from './git-worktree-driver'
import { createWorktreeService } from './worktree-service'

const project: ProjectWithWorkspaces = {
  id: 'project-12345678',
  name: 'lithe',
  rootPath: 'D:\\projects\\lithe',
  isValid: true,
  createdAt: new Date(0),
  workspaces: [],
}

const driver = (overrides: Partial<GitWorktreeDriver> = {}): GitWorktreeDriver =>
  ({
    branchExists: vi.fn(async (): Promise<boolean> => false),
    createExistingBranch: vi.fn(async (): Promise<void> => undefined),
    createNewBranch: vi.fn(async (): Promise<void> => undefined),
    deleteBranch: vi.fn(async (): Promise<void> => undefined),
    inspectSource: vi.fn(async () => ({
      branch: 'main',
      dirtyFingerprint: 'clean',
      dirtyPaths: [],
      headCommit: 'abc123',
    })),
    isBranchCheckedOut: vi.fn(async (): Promise<boolean> => false),
    removeWorktree: vi.fn(async (): Promise<void> => undefined),
    resolveCommit: vi.fn(async (): Promise<string> => 'abc123'),
    status: vi.fn(async (): Promise<string[]> => []),
    unmergedCommits: vi.fn(async () => []),
    worktreeExists: vi.fn(async (): Promise<boolean> => true),
    ...overrides,
  }) as GitWorktreeDriver

const recoveryStore = (): WorkspaceCreateRecoveryStore => {
  const records = new Map<string, WorkspaceCreateRecovery>()
  return {
    clear: (rootPath): void => {
      records.delete(rootPath)
    },
    load: (rootPath): WorkspaceCreateRecovery | undefined => records.get(rootPath),
    save: (recovery): void => {
      records.set(recovery.rootPath, recovery)
    },
  }
}

describe('worktree service', () => {
  it('creates a new branch from an explicit commit before persisting metadata', async () => {
    const git = driver()
    const addWorkspace = vi.fn<(workspace: Workspace) => void>()
    const service = createWorktreeService({
      addWorkspace,
      createId: () => 'workspace-1',
      driver: git,
      getProject: () => project,
      getWorkspace: vi.fn(),
      hasRunningTasks: () => false,
      now: () => new Date(0),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\Users\\me\\.lithe\\worktree',
    })

    const workspace = await service.create({
      projectId: project.id,
      newBranch: 'feature/review',
      from: 'HEAD',
      name: 'Review',
    })

    expect(git.createNewBranch).toHaveBeenCalledWith(
      project.rootPath,
      expect.stringContaining('lithe-project-\\Review'),
      'feature/review',
      'abc123',
    )
    expect(addWorkspace).toHaveBeenCalledWith(workspace)
  })

  it('rolls back the worktree and new branch when SQLite persistence fails', async () => {
    const git = driver()
    const service = createWorktreeService({
      addWorkspace: vi.fn(() => {
        throw new Error('database failed')
      }),
      createId: () => 'workspace-1',
      driver: git,
      getProject: () => project,
      getWorkspace: vi.fn(),
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\Users\\me\\.lithe\\worktree',
    })

    await expect(service.create({ projectId: project.id, newBranch: 'feature/review', from: 'HEAD' })).rejects.toThrow(
      /database failed/,
    )
    expect(git.removeWorktree).toHaveBeenCalledOnce()
    expect(git.deleteBranch).toHaveBeenCalledWith(project.rootPath, 'feature/review')
  })

  it('recovers an interrupted create before retrying the same managed workspace', async () => {
    let removeAttempts = 0
    const git = driver({
      removeWorktree: vi.fn(async (): Promise<void> => {
        removeAttempts += 1
        if (removeAttempts === 1) throw new Error('worktree busy')
      }),
    })
    let persistAttempts = 0
    const addWorkspace = vi.fn((): void => {
      persistAttempts += 1
      if (persistAttempts === 1) throw new Error('database failed')
    })
    const service = createWorktreeService({
      addWorkspace,
      createId: () => 'workspace-1',
      driver: git,
      getProject: () => project,
      getWorkspace: vi.fn(),
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\Users\\me\\.lithe\\worktree',
    })
    const input = {
      from: 'HEAD',
      name: 'Review',
      newBranch: 'feature/review',
      projectId: project.id,
    }

    await expect(service.create(input)).rejects.toThrow(/database failed/)
    await expect(service.create(input)).resolves.toMatchObject({ gitBranch: 'feature/review' })

    expect(git.removeWorktree).toHaveBeenCalledTimes(2)
    expect(git.deleteBranch).toHaveBeenCalledOnce()
    expect(git.createNewBranch).toHaveBeenCalledTimes(2)
  })

  it('returns persisted metadata when recovery finds the completed create', async () => {
    const existing: Workspace = {
      createdAt: new Date(),
      gitBranch: 'feature/review',
      id: 'workspace-existing',
      kind: 'derived',
      name: 'Review',
      projectId: project.id,
      rootPath: 'C:\\Users\\me\\.lithe\\worktree\\lithe-project-\\Review',
    }
    const recovery = recoveryStore()
    recovery.save({
      branch: 'feature/review',
      kind: 'new',
      projectId: project.id,
      rootPath: existing.rootPath,
      sourceRoot: project.rootPath,
    })
    const git = driver()
    const service = createWorktreeService({
      addWorkspace: vi.fn(),
      createId: () => 'unused',
      driver: git,
      getProject: () => ({ ...project, workspaces: [existing] }),
      getWorkspace: () => existing,
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery,
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\Users\\me\\.lithe\\worktree',
    })

    await expect(
      service.create({
        from: 'HEAD',
        name: 'Review',
        newBranch: 'feature/review',
        projectId: project.id,
      }),
    ).resolves.toEqual(existing)
    expect(git.inspectSource).not.toHaveBeenCalled()
    expect(recovery.load(existing.rootPath)).toBeUndefined()
  })

  it('refuses deletion while tasks run or the worktree is dirty', async () => {
    const workspace: Workspace = {
      id: 'workspace-1',
      projectId: project.id,
      name: 'Review',
      rootPath: 'C:\\managed\\Review',
      gitBranch: 'feature/review',
      kind: 'derived',
      createdAt: new Date(),
    }
    const running = createWorktreeService({
      addWorkspace: vi.fn(),
      createId: () => 'unused',
      driver: driver(),
      getProject: () => ({ ...project, workspaces: [workspace] }),
      getWorkspace: () => workspace,
      hasRunningTasks: () => true,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\managed',
    })
    await expect(running.previewDelete(workspace.id)).rejects.toThrow(/running/i)

    const dirty = createWorktreeService({
      addWorkspace: vi.fn(),
      createId: () => 'unused',
      driver: driver({ status: vi.fn(async (): Promise<string[]> => ['changed.txt']) }),
      getProject: () => ({ ...project, workspaces: [workspace] }),
      getWorkspace: () => workspace,
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\managed',
    })
    await expect(dirty.previewDelete(workspace.id)).resolves.toMatchObject({ dirtyPaths: ['changed.txt'] })
    await expect(dirty.delete(workspace.id)).rejects.toThrow(/dirty/i)
  })

  it('validates every derived workspace before removing project metadata', async () => {
    const workspaces: Workspace[] = ['one', 'two'].map(
      (suffix): Workspace => ({
        createdAt: new Date(),
        gitBranch: `feature/${suffix}`,
        id: `workspace-${suffix}`,
        kind: 'derived',
        name: suffix,
        projectId: project.id,
        rootPath: `C:\\managed\\${suffix}`,
      }),
    )
    const git = driver({
      branchExists: vi.fn(async (): Promise<boolean> => true),
      unmergedCommits: vi.fn(async () => [{ hash: 'abc', subject: 'unmerged' }]),
    })
    const removeProject = vi.fn()
    const service = createWorktreeService({
      addWorkspace: vi.fn(),
      createId: () => 'unused',
      driver: git,
      getProject: () => ({ ...project, workspaces }),
      getWorkspace: (workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId),
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject,
      removeWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\managed',
    })

    await expect(service.removeProject(project.id, { 'workspace-one': 'feature/one' })).rejects.toThrow(/confirmation/i)
    expect(git.removeWorktree).not.toHaveBeenCalled()
    expect(removeProject).not.toHaveBeenCalled()

    await service.removeProject(project.id, {
      'workspace-one': 'feature/one',
      'workspace-two': 'feature/two',
    })
    expect(git.removeWorktree).toHaveBeenCalledTimes(2)
    expect(removeProject).toHaveBeenCalledWith(project.id)
  })

  it('retries deletion after the worktree was removed but branch deletion failed', async () => {
    const workspace: Workspace = {
      createdAt: new Date(),
      gitBranch: 'feature/retry',
      id: 'workspace-retry',
      kind: 'derived',
      name: 'Retry',
      projectId: project.id,
      rootPath: 'C:\\managed\\Retry',
    }
    let exists = true
    let deleteAttempts = 0
    const git = driver({
      deleteBranch: vi.fn(async (): Promise<void> => {
        deleteAttempts += 1
        if (deleteAttempts === 1) throw new Error('branch busy')
      }),
      removeWorktree: vi.fn(async (): Promise<void> => {
        exists = false
      }),
      status: vi.fn(async (): Promise<string[]> => {
        if (!exists) throw new Error('missing path')
        return []
      }),
      worktreeExists: vi.fn(async (): Promise<boolean> => exists),
    })
    const removeWorkspace = vi.fn()
    const service = createWorktreeService({
      addWorkspace: vi.fn(),
      createId: () => 'unused',
      driver: git,
      getProject: () => ({ ...project, workspaces: [workspace] }),
      getWorkspace: () => workspace,
      hasRunningTasks: () => false,
      now: () => new Date(),
      recovery: recoveryStore(),
      removeProject: vi.fn(),
      removeWorkspace,
      renameWorkspace: vi.fn(),
      worktreeRoot: 'C:\\managed',
    })

    await expect(service.delete(workspace.id)).rejects.toThrow(/branch busy/)
    expect(removeWorkspace).not.toHaveBeenCalled()
    await expect(service.delete(workspace.id)).resolves.toBeUndefined()
    expect(removeWorkspace).toHaveBeenCalledWith(workspace.id)
  })
})
