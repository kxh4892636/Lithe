import type { DatabaseSync } from 'node:sqlite'

import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'

import {
  themeValues,
  type Project,
  type ProjectWithWorkspaces,
  type Theme,
  type WindowState,
  type Workspace,
  type WorkspaceLayoutSnapshot,
} from '../../shared/app-contract'
import { parseWorkspaceLayoutSnapshot, workspaceLayoutMaxLength } from '../../shared/workspace-layout-schema'
import { appPreferences, navigationState, projects, windowState, workspaceLayouts, workspaces } from './schema'

type Database = ReturnType<typeof drizzle>

export interface PreferenceRepository {
  getDefaultShell: () => string | null
  getPinnedGroupOpen: () => boolean
  getProjectGroupOpen: () => boolean
  getSidebarOpen: () => boolean
  getSidebarWidth: () => number
  getTheme: () => Theme
  setPinnedGroupOpen: (isOpen: boolean) => void
  setProjectGroupOpen: (isOpen: boolean) => void
  setSidebarOpen: (isOpen: boolean) => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: Theme) => void
  setDefaultShell: (shell: string) => void
}

export interface WindowStateRepository {
  get: () => WindowState | undefined
  save: (state: WindowState) => void
}

export interface ProjectRepository {
  add: (project: Project, workspace: Workspace) => void
  addAndSelect: (project: Project, workspace: Workspace) => void
  list: () => ProjectWithWorkspaces[]
  getWorkspace: (workspaceId: string) => Workspace | undefined
}

export interface NavigationRepository {
  getActiveWorkspace: () => string | null
  setActiveWorkspace: (workspaceId: string) => void
}

export interface WorkspaceLayoutRepository {
  get: (workspaceId: string) => WorkspaceLayoutSnapshot | undefined
  save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot) => void
}

const isTheme = (value: string): value is Theme => themeValues.some((theme: Theme): boolean => theme === value)

export const createPreferenceRepository = (database: Database): PreferenceRepository => {
  const getBoolean = (key: string, fallback: boolean): boolean => {
    const preference = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, key))
      .get()
    return preference ? preference.value === 'true' : fallback
  }
  const set = (key: string, value: string): void => {
    database
      .insert(appPreferences)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appPreferences.key, set: { value, updatedAt: new Date() } })
      .run()
  }

  return {
    getDefaultShell: (): string | null => {
      const preference = database
        .select({ value: appPreferences.value })
        .from(appPreferences)
        .where(eq(appPreferences.key, 'default-shell'))
        .get()
      return preference?.value ?? null
    },
    getPinnedGroupOpen: (): boolean => getBoolean('pinned-group-open', true),
    getProjectGroupOpen: (): boolean => getBoolean('project-group-open', true),
    getSidebarOpen: (): boolean => getBoolean('sidebar-open', true),
    getSidebarWidth: (): number => {
      const preference = database
        .select({ value: appPreferences.value })
        .from(appPreferences)
        .where(eq(appPreferences.key, 'sidebar-width'))
        .get()
      const width = Number(preference?.value)
      return Number.isFinite(width) && width >= 200 && width <= 360 ? width : 256
    },
    getTheme: (): Theme => {
      const preference = database
        .select({ value: appPreferences.value })
        .from(appPreferences)
        .where(eq(appPreferences.key, 'theme'))
        .get()
      return preference && isTheme(preference.value) ? preference.value : 'system'
    },
    setPinnedGroupOpen: (isOpen: boolean): void => set('pinned-group-open', String(isOpen)),
    setProjectGroupOpen: (isOpen: boolean): void => set('project-group-open', String(isOpen)),
    setSidebarOpen: (isOpen: boolean): void => set('sidebar-open', String(isOpen)),
    setSidebarWidth: (width: number): void => set('sidebar-width', String(width)),
    setTheme: (theme: Theme): void => set('theme', theme),
    setDefaultShell: (shell: string): void => set('default-shell', shell),
  }
}

export const createNavigationRepository = (database: Database): NavigationRepository => ({
  getActiveWorkspace: (): string | null => {
    const state = database
      .select({ activeWorkspaceId: navigationState.activeWorkspaceId })
      .from(navigationState)
      .where(eq(navigationState.id, 1))
      .get()
    return state?.activeWorkspaceId ?? null
  },
  setActiveWorkspace: (workspaceId: string): void => {
    const exists = database.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).get()
    if (!exists) throw new TypeError('工作区不存在')
    database
      .insert(navigationState)
      .values({ id: 1, activeWorkspaceId: workspaceId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: navigationState.id,
        set: { activeWorkspaceId: workspaceId, updatedAt: new Date() },
      })
      .run()
  },
})

export const createProjectRepository = (database: Database, sqlite: DatabaseSync): ProjectRepository => {
  const add = (project: Project, workspace: Workspace, selectWorkspace: boolean): void => {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      database.insert(projects).values(project).run()
      database.insert(workspaces).values(workspace).run()
      if (selectWorkspace) {
        database
          .insert(navigationState)
          .values({ id: 1, activeWorkspaceId: workspace.id, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: navigationState.id,
            set: { activeWorkspaceId: workspace.id, updatedAt: new Date() },
          })
          .run()
      }
      sqlite.exec('COMMIT')
    } catch (error: unknown) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }

  return {
    add: (project: Project, workspace: Workspace): void => add(project, workspace, false),
    addAndSelect: (project: Project, workspace: Workspace): void => add(project, workspace, true),
    getWorkspace: (workspaceId: string): Workspace | undefined =>
      database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get(),
    list: (): ProjectWithWorkspaces[] => {
      const projectRows = database.select().from(projects).orderBy(asc(projects.createdAt)).all()
      const workspaceRows = database.select().from(workspaces).orderBy(asc(workspaces.createdAt)).all()
      return projectRows.map(
        (project): ProjectWithWorkspaces => ({
          ...project,
          workspaces: workspaceRows.filter((workspace): boolean => workspace.projectId === project.id),
        }),
      )
    },
  }
}

export const createWindowStateRepository = (database: Database): WindowStateRepository => ({
  get: (): WindowState | undefined => {
    const state = database.select().from(windowState).where(eq(windowState.id, 1)).get()
    if (!state) return undefined
    return {
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      isMaximized: state.isMaximized,
    }
  },
  save: (state: WindowState): void => {
    database
      .insert(windowState)
      .values({ id: 1, ...state, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: windowState.id,
        set: { ...state, updatedAt: new Date() },
      })
      .run()
  },
})

export const createWorkspaceLayoutRepository = (database: Database): WorkspaceLayoutRepository => ({
  get: (workspaceId: string): WorkspaceLayoutSnapshot | undefined => {
    const row = database
      .select({ snapshot: workspaceLayouts.snapshot })
      .from(workspaceLayouts)
      .where(eq(workspaceLayouts.workspaceId, workspaceId))
      .get()
    if (!row) return undefined
    if (row.snapshot.length > workspaceLayoutMaxLength) throw new TypeError('工作区布局过大')
    return parseWorkspaceLayoutSnapshot(JSON.parse(row.snapshot))
  },
  save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot): void => {
    database
      .insert(workspaceLayouts)
      .values({ workspaceId, snapshot: JSON.stringify(snapshot), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workspaceLayouts.workspaceId,
        set: { snapshot: JSON.stringify(snapshot), updatedAt: new Date() },
      })
      .run()
  },
})
