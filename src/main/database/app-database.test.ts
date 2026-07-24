import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { WorkspaceLayoutSnapshot } from '../../shared/app-contract'
import { createAppDatabase, type AppDatabase } from './app-database'

const temporaryDirectories: string[] = []
const openDatabases: AppDatabase[] = []

const createTestDatabase = (): AppDatabase => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-database-'))
  temporaryDirectories.push(directory)
  const database = createAppDatabase({ databasePath: join(directory, 'lithe.db') })
  openDatabases.push(database)
  return database
}

afterEach((): void => {
  for (const database of openDatabases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('app database', (): void => {
  it('persists the selected theme', (): void => {
    const database = createTestDatabase()

    expect(database.preferences.getTheme()).toBe('system')
    database.preferences.setTheme('dark')

    expect(database.preferences.getTheme()).toBe('dark')
  })

  it('persists navigation appearance', (): void => {
    const database = createTestDatabase()

    expect(database.preferences.getSidebarOpen()).toBe(true)
    expect(database.preferences.getSidebarWidth()).toBe(256)
    expect(database.preferences.getPinnedGroupOpen()).toBe(true)
    expect(database.preferences.getProjectGroupOpen()).toBe(true)
    database.preferences.setSidebarOpen(false)
    database.preferences.setSidebarWidth(304)
    database.preferences.setPinnedGroupOpen(false)
    database.preferences.setProjectGroupOpen(false)

    expect(database.preferences.getSidebarOpen()).toBe(false)
    expect(database.preferences.getSidebarWidth()).toBe(304)
    expect(database.preferences.getPinnedGroupOpen()).toBe(false)
    expect(database.preferences.getProjectGroupOpen()).toBe(false)
  })

  it('persists the latest window state', (): void => {
    const database = createTestDatabase()
    const state = { x: 120, y: 80, width: 1100, height: 720, isMaximized: true }

    database.windowState.save(state)

    expect(database.windowState.get()).toEqual(state)
  })

  it('persists projects, their default workspace, and active navigation', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-1',
      name: 'lithe',
      rootPath: 'D:\\projects\\lithe',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-1',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      createdAt: project.createdAt,
    }

    database.projects.addAndSelect(project, workspace)

    expect(database.projects.list()).toEqual([{ ...project, workspaces: [workspace] }])
    expect(database.navigation.getActiveWorkspace()).toBe(workspace.id)
  })

  it('rejects a second project for the same root directory', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-1',
      name: 'lithe',
      rootPath: 'D:\\projects\\lithe',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-1',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: null,
      kind: 'default' as const,
      createdAt: project.createdAt,
    }

    database.projects.add(project, workspace)

    expect(() =>
      database.projects.add(
        { ...project, id: 'project-2' },
        { ...workspace, id: 'workspace-2', projectId: 'project-2' },
      ),
    ).toThrow('UNIQUE constraint failed')
  })

  it('persists a workspace layout snapshot without terminal output', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-layout',
      name: 'layout',
      rootPath: 'D:\\projects\\layout',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-layout',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: null,
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    const snapshot: WorkspaceLayoutSnapshot = {
      version: 1,
      layout: {
        borders: [],
        global: {},
        layout: { type: 'row', children: [{ type: 'tabset', id: 'root-group', children: [] }] },
      },
    }
    database.projects.add(project, workspace)

    database.workspaceLayouts.save(workspace.id, snapshot)

    expect(database.workspaceLayouts.get(workspace.id)).toEqual(snapshot)
    expect(JSON.stringify(database.workspaceLayouts.get(workspace.id))).not.toContain('secret output')
  })
})
