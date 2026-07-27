import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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
    const managedProjectsRoot = join(createDirectory(), 'projects')
    const saved: ProjectWithWorkspaces[] = []
    const service = createProjectService({
      addProject: (project): void => {
        saved.push(project)
      },
      createId: (): string => `id-${saved.length + 1}`,
      detectGitBranch: async (): Promise<null> => null,
      findProjectByRoot: (): undefined => undefined,
      logError: (): void => undefined,
      managedProjectsRoot,
      now: (): Date => new Date('2026-07-25T00:00:00.000Z'),
      platform: 'win32',
      selectWorkspace: (): void => undefined,
    })

    const project = await service.create({ name: 'My project', sourcePath: rootPath })

    expect(project).toMatchObject({
      name: 'My project',
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
      findProjectByRoot: (): undefined => undefined,
      logError: (): void => undefined,
      managedProjectsRoot: join(createDirectory(), 'projects'),
      now: (): Date => new Date('2026-07-25T00:00:00.000Z'),
      platform: 'win32',
      selectWorkspace: (): void => undefined,
    })

    const project = await service.create({ name: basename(rootPath), sourcePath: rootPath })

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
      findProjectByRoot: (): undefined => undefined,
      logError: (): void => undefined,
      managedProjectsRoot: join(createDirectory(), 'projects'),
      now: (): Date => new Date(),
      platform: 'win32',
      selectWorkspace: (): void => undefined,
    })

    await expect(service.create({ name: 'missing', sourcePath: missingPath })).rejects.toThrow('项目根目录不存在')
  })

  it('creates a blank non-Git project under the managed project root', async (): Promise<void> => {
    const managedProjectsRoot = join(createDirectory(), 'projects')
    const service = createProjectService({
      addProject: (): void => undefined,
      createId: (() => {
        let id = 0
        return (): string => `id-${++id}`
      })(),
      detectGitBranch: async (): Promise<null> => null,
      findProjectByRoot: (): undefined => undefined,
      logError: (): void => undefined,
      managedProjectsRoot,
      now: (): Date => new Date(0),
      platform: 'win32',
      selectWorkspace: (): void => undefined,
    })

    const project = await service.create({ name: 'Blank project' })

    expect(project.rootPath).toBe(join(managedProjectsRoot, 'Blank project'))
    expect(project.workspaces[0]?.gitBranch).toBeNull()
    expect(existsSync(project.rootPath)).toBe(true)
    expect(existsSync(join(project.rootPath, '.git'))).toBe(false)
  })

  it('focuses the existing project when the same real Source folder is selected again', async (): Promise<void> => {
    const rootPath = createDirectory()
    const existing = {
      id: 'project-existing',
      name: 'Existing',
      rootPath,
      isValid: true,
      createdAt: new Date(0),
      workspaces: [
        {
          id: 'workspace-existing',
          projectId: 'project-existing',
          name: '默认',
          rootPath,
          gitBranch: null,
          kind: 'default' as const,
          createdAt: new Date(0),
        },
      ],
    }
    const selected: string[] = []
    const service = createProjectService({
      addProject: (): void => {
        throw new Error('duplicate project must not be persisted')
      },
      createId: (): string => 'unused',
      detectGitBranch: async (): Promise<null> => null,
      findProjectByRoot: (): ProjectWithWorkspaces => existing,
      logError: (): void => undefined,
      managedProjectsRoot: join(createDirectory(), 'projects'),
      now: (): Date => new Date(0),
      platform: 'win32',
      selectWorkspace: (workspaceId: string): void => {
        selected.push(workspaceId)
      },
    })

    await expect(service.create({ name: 'Another name', sourcePath: rootPath })).resolves.toBe(existing)
    expect(selected).toEqual(['workspace-existing'])
  })

  it('rejects unsafe blank project directory names and existing targets', async (): Promise<void> => {
    const managedProjectsRoot = join(createDirectory(), 'projects')
    mkdirSync(join(managedProjectsRoot, 'occupied'), { recursive: true })
    const service = createProjectService({
      addProject: (): void => undefined,
      createId: (): string => 'unused',
      detectGitBranch: async (): Promise<null> => null,
      findProjectByRoot: (): undefined => undefined,
      logError: (): void => undefined,
      managedProjectsRoot,
      now: (): Date => new Date(0),
      platform: 'win32',
      selectWorkspace: (): void => undefined,
    })

    await expect(service.create({ name: 'CON' })).rejects.toThrow('项目名称不能用作文件夹名称')
    await expect(service.create({ name: 'nested/name' })).rejects.toThrow('项目名称不能用作文件夹名称')
    await expect(service.create({ name: 'occupied' })).rejects.toThrow('项目目录已存在')
  })
})
