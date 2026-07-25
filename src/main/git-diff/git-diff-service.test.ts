import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { simpleGit } from 'simple-git'
import { describe, expect, it } from 'vitest'

import type { Workspace } from '../../shared/app-contract'
import { createGitDiffService } from './git-diff-service'

const fixture = (): { root: string; workspace: Workspace } => {
  const tempRoot = join(process.cwd(), 'temp')
  mkdirSync(tempRoot, { recursive: true })
  const root = mkdtempSync(join(tempRoot, 'git-diff-'))
  return {
    root,
    workspace: {
      createdAt: new Date(),
      gitBranch: 'main',
      id: 'workspace-1',
      kind: 'default',
      name: 'Diff',
      projectId: 'project-1',
      rootPath: root,
    },
  }
}

describe('git diff service', (): void => {
  it('keeps staged, unstaged, and untracked changes as distinct comparisons', async (): Promise<void> => {
    const { root, workspace } = fixture()
    const git = simpleGit(root)
    try {
      await git.init(['--initial-branch=main'])
      await git.addConfig('user.name', 'Lithe Test')
      await git.addConfig('user.email', 'lithe@example.test')
      writeFileSync(join(root, 'shared.txt'), 'base\n')
      await git.add('shared.txt')
      await git.commit('initial')
      writeFileSync(join(root, 'shared.txt'), 'staged\n')
      await git.add('shared.txt')
      writeFileSync(join(root, 'shared.txt'), 'unstaged\n')
      writeFileSync(join(root, 'new.txt'), 'untracked\n')
      const service = createGitDiffService({ getWorkspace: () => workspace })

      await expect(service.list(workspace.id)).resolves.toEqual({
        changes: [
          { id: 'staged:shared.txt', kind: 'staged', relativePath: 'shared.txt' },
          { id: 'unstaged:shared.txt', kind: 'unstaged', relativePath: 'shared.txt' },
          { id: 'untracked:new.txt', kind: 'untracked', relativePath: 'new.txt' },
        ],
        isRepository: true,
      })
      await expect(service.read(workspace.id, 'staged', 'shared.txt')).resolves.toMatchObject({
        modified: 'staged\n',
        original: 'base\n',
      })
      await expect(service.read(workspace.id, 'unstaged', 'shared.txt')).resolves.toMatchObject({
        modified: 'unstaged\n',
        original: 'staged\n',
      })
      await expect(service.read(workspace.id, 'untracked', 'new.txt')).resolves.toMatchObject({
        modified: 'untracked\n',
        original: '',
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('reports non-Git workspaces and observes newly created changes on every list', async (): Promise<void> => {
    const { root, workspace } = fixture()
    try {
      const service = createGitDiffService({ getWorkspace: () => workspace })
      await expect(service.list(workspace.id)).resolves.toEqual({ changes: [], isRepository: false })

      const git = simpleGit(root)
      await git.init(['--initial-branch=main'])
      writeFileSync(join(root, 'later.txt'), 'later\n')
      await expect(service.list(workspace.id)).resolves.toMatchObject({
        changes: [{ kind: 'untracked', relativePath: 'later.txt' }],
        isRepository: true,
      })
      await expect(service.version(workspace.id)).resolves.not.toBeNull()
      rmSync(join(root, '.git'), { force: true, recursive: true })
      await expect(service.version(workspace.id)).resolves.toMatch(/^no-git:/u)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('uses the old path for staged renames and rejects binary blobs', async (): Promise<void> => {
    const { root, workspace } = fixture()
    const git = simpleGit(root)
    try {
      await git.init(['--initial-branch=main'])
      await git.addConfig('user.name', 'Lithe Test')
      await git.addConfig('user.email', 'lithe@example.test')
      writeFileSync(join(root, 'old.txt'), 'renamed content\n')
      await git.add('old.txt')
      await git.commit('initial')
      await git.mv('old.txt', 'new.txt')
      const service = createGitDiffService({ getWorkspace: () => workspace })

      await expect(service.read(workspace.id, 'staged', 'new.txt')).resolves.toMatchObject({
        modified: 'renamed content\n',
        original: 'renamed content\n',
      })
      writeFileSync(join(root, 'new.txt'), Buffer.from([0, 1, 2]))
      await git.add('new.txt')
      await expect(service.read(workspace.id, 'staged', 'new.txt')).rejects.toThrow(/Binary/)
      await expect(service.version(workspace.id)).resolves.toMatch(/^\d/u)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('changes the version when HEAD moves without changing the index', async (): Promise<void> => {
    const { root, workspace } = fixture()
    const git = simpleGit(root)
    try {
      await git.init(['--initial-branch=main'])
      await git.addConfig('user.name', 'Lithe Test')
      await git.addConfig('user.email', 'lithe@example.test')
      writeFileSync(join(root, 'head.txt'), 'one\n')
      await git.add('head.txt')
      await git.commit('first')
      writeFileSync(join(root, 'head.txt'), 'two\n')
      await git.add('head.txt')
      await git.commit('second')
      const service = createGitDiffService({ getWorkspace: () => workspace })
      const before = await service.version(workspace.id)

      await git.reset(['--soft', 'HEAD~1'])
      await expect(service.version(workspace.id)).resolves.not.toBe(before)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
