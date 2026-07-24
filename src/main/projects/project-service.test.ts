import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ProjectWithWorkspaces } from '../../shared/app-contract'
import { createProjectService } from './project-service'

const temporaryDirectories: string[] = []

const createDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-project-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach((): void => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('project service', (): void => {
  it('adds an ordinary directory without initializing Git', async (): Promise<void> => {
    const rootPath = createDirectory()
    const saved: ProjectWithWorkspaces[] = []
    const service = createProjectService({
      addProject: (project): void => {
        saved.push(project)
      },
      createId: (): string => `id-${saved.length + 1}`,
      detectGitBranch: async (): Promise<null> => null,
      logError: (): void => undefined,
      now: (): Date => new Date('2026-07-25T00:00:00.000Z'),
    })

    const project = await service.addDirectory(rootPath)

    expect(project).toMatchObject({
      name: basename(rootPath),
      rootPath,
      workspaces: [{ gitBranch: null, kind: 'default', name: '默认', rootPath }],
    })
    expect(saved).toEqual([project])
  })

  it('records the current branch without turning branches into workspaces', async (): Promise<void> => {
    const rootPath = createDirectory()
    const service = createProjectService({
      addProject: (): void => undefined,
      createId: (() => {
        let id = 0
        return (): string => `id-${++id}`
      })(),
      detectGitBranch: async (): Promise<string> => 'feature/navigation',
      logError: (): void => undefined,
      now: (): Date => new Date('2026-07-25T00:00:00.000Z'),
    })

    const project = await service.addDirectory(rootPath)

    expect(project.workspaces).toHaveLength(1)
    expect(project.workspaces[0]?.gitBranch).toBe('feature/navigation')
  })

  it('rejects paths that are not directories', async (): Promise<void> => {
    const parent = createDirectory()
    const missingPath = join(parent, 'missing')
    mkdirSync(join(parent, 'present'))
    const service = createProjectService({
      addProject: (): void => undefined,
      createId: (): string => 'unused',
      detectGitBranch: async (): Promise<null> => null,
      logError: (): void => undefined,
      now: (): Date => new Date(),
    })

    await expect(service.addDirectory(missingPath)).rejects.toThrow('项目根目录不存在')
  })
})
