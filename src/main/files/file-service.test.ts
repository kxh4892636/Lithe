import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { FileChangeEvent, Workspace } from '../../shared/app-contract'
import { createFileService, fileContentMaxBytes } from './file-service'

const fixture = (): { root: string; workspace: Workspace } => {
  const tempRoot = join(process.cwd(), 'temp')
  mkdirSync(tempRoot, { recursive: true })
  const root = mkdtempSync(join(tempRoot, 'file-service-'))
  return {
    root,
    workspace: {
      createdAt: new Date(),
      gitBranch: null,
      id: 'workspace-1',
      kind: 'default',
      name: 'Files',
      projectId: 'project-1',
      rootPath: root,
    },
  }
}

describe('file service', (): void => {
  it('hides Git metadata and ignored files while preserving ordinary dotfiles', async (): Promise<void> => {
    const { root, workspace } = fixture()
    try {
      mkdirSync(join(root, '.git'))
      writeFileSync(join(root, '.git', 'config'), 'hidden')
      writeFileSync(join(root, '.gitignore'), 'ignored.txt\ndist/\n')
      writeFileSync(join(root, '.env'), 'visible')
      writeFileSync(join(root, 'ignored.txt'), 'ignored')
      mkdirSync(join(root, 'dist'))
      writeFileSync(join(root, 'dist', 'bundle.js'), 'ignored directory')
      mkdirSync(join(root, 'package'))
      writeFileSync(join(root, 'package', '.gitignore'), 'generated.txt\n*.log\n')
      writeFileSync(join(root, 'package', 'generated.txt'), 'nested ignored')
      mkdirSync(join(root, 'package', 'deep'))
      writeFileSync(join(root, 'package', 'top.log'), 'ignored at the rule root')
      writeFileSync(join(root, 'package', 'deep', 'nested.log'), 'ignored recursively')
      const service = createFileService({
        changed: vi.fn<(event: FileChangeEvent) => void>(),
        getWorkspace: () => workspace,
        platform: 'linux',
      })

      expect((await service.listDirectory(workspace.id, '', false)).map((entry) => entry.name)).toEqual([
        'package',
        '.env',
        '.gitignore',
      ])
      expect((await service.listDirectory(workspace.id, 'package', false)).map((entry) => entry.name)).toEqual([
        'deep',
        '.gitignore',
      ])
      expect(await service.listDirectory(workspace.id, 'package/deep', false)).toEqual([])
      expect((await service.listDirectory(workspace.id, '', true)).map((entry) => entry.name)).toEqual([
        'dist',
        'package',
        '.env',
        '.gitignore',
        'ignored.txt',
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects traversal and external symlink targets', async (): Promise<void> => {
    const { root, workspace } = fixture()
    const outside = mkdtempSync(join(process.cwd(), 'temp', 'file-outside-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret')
      symlinkSync(outside, join(root, 'external'), 'junction')
      const service = createFileService({
        changed: vi.fn<(event: FileChangeEvent) => void>(),
        getWorkspace: () => workspace,
        platform: 'linux',
      })

      expect((await service.listDirectory(workspace.id, '', false))[0]).toMatchObject({
        externalSymlink: true,
        name: 'external',
      })
      await expect(service.read(workspace.id, '..\\file-outside\\secret.txt')).rejects.toThrow(/boundary/)
      await expect(service.read(workspace.id, 'external/secret.txt')).rejects.toThrow(/outside/)
    } finally {
      rmSync(root, { force: true, recursive: true })
      rmSync(outside, { force: true, recursive: true })
    }
  })

  it('shows an internal symlink cycle without allowing it to expand', async (): Promise<void> => {
    const { root, workspace } = fixture()
    try {
      mkdirSync(join(root, 'folder'))
      symlinkSync(root, join(root, 'folder', 'back'), 'junction')
      const service = createFileService({
        changed: vi.fn<(event: FileChangeEvent) => void>(),
        getWorkspace: () => workspace,
        platform: 'linux',
      })

      expect(await service.listDirectory(workspace.id, 'folder', false)).toEqual([
        expect.objectContaining({ externalSymlink: true, name: 'back' }),
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it.runIf(process.platform === 'win32')(
    'hides files carrying the Windows hidden attribute',
    async (): Promise<void> => {
      const { root, workspace } = fixture()
      try {
        const hiddenPath = join(root, 'secret.txt')
        writeFileSync(hiddenPath, 'secret')
        execFileSync('attrib.exe', ['+H', hiddenPath], { windowsHide: true })
        const service = createFileService({
          changed: vi.fn<(event: FileChangeEvent) => void>(),
          getWorkspace: () => workspace,
        })

        expect(await service.listDirectory(workspace.id, '', false)).toEqual([])
      } finally {
        rmSync(root, { force: true, recursive: true })
      }
    },
  )

  it('saves existing files only when the expected disk fingerprint still matches', async (): Promise<void> => {
    const { root, workspace } = fixture()
    try {
      const path = join(root, 'note.txt')
      writeFileSync(path, 'before')
      const service = createFileService({
        changed: vi.fn<(event: FileChangeEvent) => void>(),
        getWorkspace: () => workspace,
      })
      const loaded = await service.read(workspace.id, 'note.txt')
      writeFileSync(path, 'external')

      await expect(service.save(workspace.id, 'note.txt', 'local', loaded.fingerprint)).rejects.toThrow(
        /changed on disk/,
      )
      await expect(service.save(workspace.id, 'note.txt', 'local', loaded.fingerprint, true)).resolves.toMatchObject({
        content: 'local',
      })
      await expect(service.save(workspace.id, 'missing.txt', 'new', loaded.fingerprint)).rejects.toThrow(
        /ENOENT|existing file/,
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects files above the editor size boundary before reading content', async (): Promise<void> => {
    const { root, workspace } = fixture()
    try {
      writeFileSync(join(root, 'large.txt'), Buffer.alloc(fileContentMaxBytes + 1))
      const service = createFileService({
        changed: vi.fn<(event: FileChangeEvent) => void>(),
        getWorkspace: () => workspace,
      })

      await expect(service.read(workspace.id, 'large.txt')).rejects.toThrow(/too large/)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('emits a workspace-relative event after a watched file changes', async (): Promise<void> => {
    const { root, workspace } = fixture()
    const changed = vi.fn<(event: FileChangeEvent) => void>()
    const service = createFileService({ changed, getWorkspace: () => workspace })
    try {
      const path = join(root, 'watched.txt')
      writeFileSync(path, 'before')
      await service.watch(workspace.id)
      writeFileSync(path, 'after')
      await vi.waitFor((): void => {
        expect(changed).toHaveBeenCalledWith({
          relativePath: 'watched.txt',
          type: 'change',
          workspaceId: workspace.id,
        })
      })
    } finally {
      await service.close()
      rmSync(root, { force: true, recursive: true })
    }
  })
})
