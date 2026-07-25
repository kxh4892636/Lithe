import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { simpleGit } from 'simple-git'
import { expect, it } from 'vitest'

import type { ProjectWithWorkspaces, Workspace } from '../../shared/app-contract'
import { createWorkspaceRecoveryStore } from './create-recovery-store'
import { createGitWorktreeDriver } from './git-worktree-driver'
import { createWorktreeService } from './worktree-service'

it('creates and deletes only Lithe-managed worktrees through real Git', async () => {
  const testRoot = join(process.cwd(), 'temp')
  mkdirSync(testRoot, { recursive: true })
  const root = mkdtempSync(join(testRoot, 'worktree-integration-'))
  const repositoryPath = join(root, 'repository')
  const managedRoot = join(root, 'managed')
  const externalPath = join(root, 'external')
  mkdirSync(repositoryPath)
  const git = simpleGit(repositoryPath)
  const stored = new Map<string, Workspace>()

  try {
    await git.init(['--initial-branch=main'])
    await git.addConfig('user.name', 'Lithe Test')
    await git.addConfig('user.email', 'lithe@example.test')
    writeFileSync(join(repositoryPath, 'tracked.txt'), 'committed\n')
    await git.add('tracked.txt')
    await git.commit('initial')
    const project: ProjectWithWorkspaces = {
      createdAt: new Date(0),
      id: '12345678-project',
      isValid: true,
      name: 'Integration',
      rootPath: repositoryPath,
      workspaces: [],
    }
    const service = createWorktreeService({
      addWorkspace: (workspace): void => {
        stored.set(workspace.id, workspace)
      },
      createId: () => 'derived-1',
      driver: createGitWorktreeDriver(),
      getProject: () => ({ ...project, workspaces: [...stored.values()] }),
      getWorkspace: (workspaceId) => stored.get(workspaceId),
      hasRunningTasks: () => false,
      now: () => new Date(0),
      recovery: createWorkspaceRecoveryStore(managedRoot),
      removeProject: () => undefined,
      removeWorkspace: (workspaceId): void => {
        stored.delete(workspaceId)
      },
      renameWorkspace: (workspaceId, name): Workspace => ({ ...stored.get(workspaceId)!, name }),
      worktreeRoot: managedRoot,
    })

    writeFileSync(join(repositoryPath, 'dirty.txt'), 'not committed\n')
    const input = { from: 'HEAD', name: 'Review', newBranch: 'feature/review', projectId: project.id }
    const preview = await service.previewCreate(input)
    expect(preview.dirtyPaths).toContain('dirty.txt')
    await expect(service.create(input)).rejects.toThrow(/preview confirmation/i)
    writeFileSync(join(repositoryPath, 'dirty.txt'), 'changed after preview\n')
    await expect(service.create(input, preview.dirtyFingerprint)).rejects.toThrow(/preview confirmation/i)

    const refreshedPreview = await service.previewCreate(input)
    const workspace = await service.create(input, refreshedPreview.dirtyFingerprint)
    expect(existsSync(workspace.rootPath)).toBe(true)
    expect(existsSync(join(workspace.rootPath, 'dirty.txt'))).toBe(false)
    await service.delete(workspace.id)
    expect(existsSync(workspace.rootPath)).toBe(false)
    expect(await createGitWorktreeDriver().branchExists(repositoryPath, 'feature/review')).toBe(false)

    unlinkSync(join(repositoryPath, 'dirty.txt'))
    await git.branch(['external'])
    await git.raw(['worktree', 'add', externalPath, 'external'])
    await expect(
      service.create({ existingBranch: 'external', name: 'External', projectId: project.id }),
    ).rejects.toThrow(/already checked out/i)
    expect(existsSync(externalPath)).toBe(true)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}, 15_000)
