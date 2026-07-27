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
type WorkspaceRow = typeof workspaces.$inferSelect

export interface PreferenceRepository {
  getDefaultShell: () => string | null
  getPinnedGroupOpen: () => boolean
  getProjectGroupOpen: () => boolean
  getRowOpen: (key: string) => boolean
  getSidebarOpen: () => boolean
  getSidebarWidth: () => number
  getTheme: () => Theme
  getLastExitClean: () => boolean
  getNotificationsEnabled: () => boolean
  setPinnedGroupOpen: (isOpen: boolean) => void
  setProjectGroupOpen: (isOpen: boolean) => void
  setRowOpen: (key: string, isOpen: boolean) => void
  setSidebarOpen: (isOpen: boolean) => void
  setSidebarWidth: (width: number) => void
  setTheme: (theme: Theme) => void
  setLastExitClean: (isClean: boolean) => void
  setNotificationsEnabled: (isEnabled: boolean) => void
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
  listScratch: () => Workspace[]
  getWorkspace: (workspaceId: string) => Workspace | undefined
  addScratchAndSelect: (workspace: Workspace) => void
  addScratch: (workspace: Workspace) => void
  addWorkspace: (workspace: Workspace) => void
  deleteWorkspace: (workspaceId: string) => void
  get: (projectId: string) => ProjectWithWorkspaces | undefined
  remove: (projectId: string) => void
  renameWorkspace: (workspaceId: string, name: string) => Workspace
  setValidity: (projectId: string, isValid: boolean) => void
  setWorkspaceValidity: (workspaceId: string, isValid: boolean) => void
  setPinned: (workspaceId: string, pinnedAt: Date | null) => Workspace
}

export interface NavigationRepository {
  getActiveWorkspace: () => string | null
  setActiveWorkspace: (workspaceId: string) => void
}

export interface WorkspaceLayoutRepository {
  addAgentPanel?: (workspaceId: string, taskId: string, taskName: string, afterTaskId?: string) => void
  get: (workspaceId: string) => WorkspaceLayoutSnapshot | undefined
  removeTaskPanel?: (workspaceId: string, taskId: string) => void
  save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot) => void
}

const isTheme = (value: string): value is Theme => themeValues.some((theme: Theme): boolean => theme === value)
const mapWorkspace = (workspace: WorkspaceRow): Workspace => {
  const { pinnedAt, ...rest } = workspace
  return pinnedAt ? { ...rest, pinnedAt } : rest
}

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
    getRowOpen: (key: string): boolean => getBoolean(key, true),
    getSidebarOpen: (): boolean => getBoolean('sidebar-open', true),
    getSidebarWidth: (): number => {
      const preference = database
        .select({ value: appPreferences.value })
        .from(appPreferences)
        .where(eq(appPreferences.key, 'sidebar-width'))
        .get()
      const width = Number(preference?.value)
      return Number.isFinite(width) && width >= 280 && width <= 360 ? width : 280
    },
    getTheme: (): Theme => {
      const preference = database
        .select({ value: appPreferences.value })
        .from(appPreferences)
        .where(eq(appPreferences.key, 'theme'))
        .get()
      return preference && isTheme(preference.value) ? preference.value : 'system'
    },
    getLastExitClean: (): boolean => getBoolean('last-exit-clean', true),
    getNotificationsEnabled: (): boolean => getBoolean('notifications-enabled', true),
    setPinnedGroupOpen: (isOpen: boolean): void => set('pinned-group-open', String(isOpen)),
    setProjectGroupOpen: (isOpen: boolean): void => set('project-group-open', String(isOpen)),
    setRowOpen: (key: string, isOpen: boolean): void => set(key, String(isOpen)),
    setSidebarOpen: (isOpen: boolean): void => set('sidebar-open', String(isOpen)),
    setSidebarWidth: (width: number): void => set('sidebar-width', String(width)),
    setTheme: (theme: Theme): void => set('theme', theme),
    setLastExitClean: (isClean: boolean): void => set('last-exit-clean', String(isClean)),
    setNotificationsEnabled: (isEnabled: boolean): void => set('notifications-enabled', String(isEnabled)),
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
    addScratchAndSelect: (workspace: Workspace): void => {
      if (workspace.kind !== 'scratch' || workspace.projectId !== null) {
        throw new TypeError('Temporary workspace must not belong to a project')
      }
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        database.insert(workspaces).values(workspace).run()
        database
          .insert(navigationState)
          .values({ id: 1, activeWorkspaceId: workspace.id, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: navigationState.id,
            set: { activeWorkspaceId: workspace.id, updatedAt: new Date() },
          })
          .run()
        sqlite.exec('COMMIT')
      } catch (error: unknown) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    addScratch: (workspace: Workspace): void => {
      if (workspace.kind !== 'scratch' || workspace.projectId !== null) {
        throw new TypeError('Temporary workspace must not belong to a project')
      }
      database.insert(workspaces).values(workspace).run()
    },
    addWorkspace: (workspace: Workspace): void => {
      if (workspace.kind === 'scratch' || !workspace.projectId) {
        throw new TypeError('Project workspace must belong to a project')
      }
      database.insert(workspaces).values(workspace).run()
    },
    deleteWorkspace: (workspaceId: string): void => {
      database.delete(workspaces).where(eq(workspaces.id, workspaceId)).run()
    },
    getWorkspace: (workspaceId: string): Workspace | undefined => {
      const workspace = database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()
      return workspace ? mapWorkspace(workspace) : undefined
    },
    get: (projectId: string): ProjectWithWorkspaces | undefined => {
      const project = database.select().from(projects).where(eq(projects.id, projectId)).get()
      if (!project) return undefined
      const projectWorkspaces = database
        .select()
        .from(workspaces)
        .where(eq(workspaces.projectId, projectId))
        .orderBy(asc(workspaces.createdAt))
        .all()
        .map(mapWorkspace)
      return { ...project, workspaces: projectWorkspaces }
    },
    list: (): ProjectWithWorkspaces[] => {
      const projectRows = database.select().from(projects).orderBy(asc(projects.createdAt)).all()
      const workspaceRows = database.select().from(workspaces).orderBy(asc(workspaces.createdAt)).all()
      return projectRows.map(
        (project): ProjectWithWorkspaces => ({
          ...project,
          workspaces: workspaceRows
            .filter((workspace): boolean => workspace.projectId === project.id)
            .map(mapWorkspace),
        }),
      )
    },
    listScratch: (): Workspace[] =>
      database
        .select()
        .from(workspaces)
        .where(eq(workspaces.kind, 'scratch'))
        .orderBy(asc(workspaces.createdAt))
        .all()
        .map(mapWorkspace),
    setPinned: (workspaceId: string, pinnedAt: Date | null): Workspace => {
      database.update(workspaces).set({ pinnedAt }).where(eq(workspaces.id, workspaceId)).run()
      const workspace = database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()
      if (!workspace) throw new TypeError('工作区不存在')
      return mapWorkspace(workspace)
    },
    remove: (projectId: string): void => {
      database.delete(projects).where(eq(projects.id, projectId)).run()
    },
    renameWorkspace: (workspaceId: string, name: string): Workspace => {
      database.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId)).run()
      const workspace = database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()
      if (!workspace) throw new TypeError('Workspace does not exist')
      return mapWorkspace(workspace)
    },
    setValidity: (projectId: string, isValid: boolean): void => {
      database.update(projects).set({ isValid }).where(eq(projects.id, projectId)).run()
    },
    setWorkspaceValidity: (workspaceId: string, isValid: boolean): void => {
      database.update(workspaces).set({ isValid }).where(eq(workspaces.id, workspaceId)).run()
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

const removeAgentTabs = (value: unknown, taskId: string): void => {
  if (!value || typeof value !== 'object') return
  if ('children' in value && Array.isArray(value.children)) {
    value.children = value.children.filter(
      (child: unknown): boolean =>
        !(
          child &&
          typeof child === 'object' &&
          'component' in child &&
          child.component === 'agent' &&
          'config' in child &&
          child.config &&
          typeof child.config === 'object' &&
          'taskId' in child.config &&
          child.config.taskId === taskId
        ),
    )
  }
  for (const child of Object.values(value)) removeAgentTabs(child, taskId)
}

interface MutableLayoutNode {
  active?: boolean
  children?: MutableLayoutNode[]
  component?: string
  config?: { taskId?: string }
  id?: string
  selected?: number
  type?: string
}

const emptyWorkspaceLayout = (): WorkspaceLayoutSnapshot =>
  parseWorkspaceLayoutSnapshot({
    version: 1,
    layout: {
      borders: [],
      global: {
        tabEnablePopout: false,
        tabEnableRename: false,
        tabSetEnableDeleteWhenEmpty: true,
        tabSetEnableDivide: true,
        tabSetEnableMaximize: true,
      },
      layout: {
        type: 'row',
        children: [{ type: 'tabset', id: 'root-group', active: true, children: [] }],
      },
    },
  })

const addAgentTab = (
  snapshot: WorkspaceLayoutSnapshot,
  taskId: string,
  taskName: string,
  afterTaskId?: string,
): WorkspaceLayoutSnapshot => {
  const mutable = structuredClone(snapshot) as WorkspaceLayoutSnapshot
  const root = mutable.layout.layout as MutableLayoutNode
  const tabsets: MutableLayoutNode[] = []
  const pending = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue
    if (node.type === 'tabset') tabsets.push(node)
    if (node.children) pending.push(...node.children)
  }
  const panelId = `agent:${taskId}`
  if (tabsets.some((tabset): boolean => tabset.children?.some((child): boolean => child.id === panelId) ?? false)) {
    return mutable
  }
  const sourcePanelId = afterTaskId ? `agent:${afterTaskId}` : undefined
  const sourceGroup = sourcePanelId
    ? tabsets.find((tabset): boolean => tabset.children?.some((child): boolean => child.id === sourcePanelId) ?? false)
    : undefined
  const target = sourceGroup ?? tabsets.find((tabset): boolean => tabset.active === true) ?? tabsets[0]
  if (!target) throw new TypeError('Workspace layout has no tab group')
  const children = target.children ?? []
  const sourceIndex = sourcePanelId ? children.findIndex((child): boolean => child.id === sourcePanelId) : -1
  const insertionIndex = sourceIndex >= 0 ? sourceIndex + 1 : children.length
  children.splice(insertionIndex, 0, {
    component: 'agent',
    config: { panelId, taskId },
    id: panelId,
    type: 'tab',
    name: taskName,
  } as MutableLayoutNode)
  if (typeof target.selected === 'number' && target.selected >= insertionIndex) target.selected += 1
  target.children = children
  return parseWorkspaceLayoutSnapshot(mutable)
}

const persistWorkspaceLayout = (database: Database, workspaceId: string, snapshot: WorkspaceLayoutSnapshot): void => {
  database
    .insert(workspaceLayouts)
    .values({ workspaceId, snapshot: JSON.stringify(snapshot), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: workspaceLayouts.workspaceId,
      set: { snapshot: JSON.stringify(snapshot), updatedAt: new Date() },
    })
    .run()
}

export const createWorkspaceLayoutRepository = (database: Database): WorkspaceLayoutRepository => ({
  addAgentPanel: (workspaceId: string, taskId: string, taskName: string, afterTaskId?: string): void => {
    const row = database
      .select({ snapshot: workspaceLayouts.snapshot })
      .from(workspaceLayouts)
      .where(eq(workspaceLayouts.workspaceId, workspaceId))
      .get()
    const snapshot = row ? parseWorkspaceLayoutSnapshot(JSON.parse(row.snapshot)) : emptyWorkspaceLayout()
    persistWorkspaceLayout(database, workspaceId, addAgentTab(snapshot, taskId, taskName, afterTaskId))
  },
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
  removeTaskPanel: (workspaceId: string, taskId: string): void => {
    const row = database
      .select({ snapshot: workspaceLayouts.snapshot })
      .from(workspaceLayouts)
      .where(eq(workspaceLayouts.workspaceId, workspaceId))
      .get()
    if (!row) return
    const snapshot: unknown = JSON.parse(row.snapshot)
    removeAgentTabs(snapshot, taskId)
    const parsed = parseWorkspaceLayoutSnapshot(snapshot)
    database
      .update(workspaceLayouts)
      .set({ snapshot: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(workspaceLayouts.workspaceId, workspaceId))
      .run()
  },
  save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot): void => {
    persistWorkspaceLayout(database, workspaceId, snapshot)
  },
})
