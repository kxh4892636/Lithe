import type { TerminalCreateRequest } from './terminal-schema'
import type { WorkspaceLayoutSnapshot } from './workspace-layout-schema'

export type { TerminalCreateRequest } from './terminal-schema'
export type { WorkspaceLayoutSnapshot } from './workspace-layout-schema'

export const themeValues = ['light', 'dark', 'system'] as const

export type Theme = (typeof themeValues)[number]

export interface RuntimeInfo {
  appVersion: string
  electronVersion: string
  platform: string
  architecture: string
  refreshedAt: string
}

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

export interface Project {
  id: string
  name: string
  rootPath: string
  isValid: boolean
  createdAt: Date
}

export type WorkspaceKind = 'default' | 'derived'

export interface Workspace {
  id: string
  projectId: string
  name: string
  rootPath: string
  gitBranch: string | null
  kind: WorkspaceKind
  createdAt: Date
}

export interface ProjectWithWorkspaces extends Project {
  workspaces: Workspace[]
}

export interface WorkspaceNavigation {
  activeWorkspaceId: string | null
  projects: ProjectWithWorkspaces[]
}

export interface TerminalSession {
  cwd: string
  panelId: string
  shell: string
}

export interface TerminalDataEvent {
  data: string
  panelId: string
}

export interface TerminalExitEvent {
  exitCode: number
  panelId: string
}

export interface LitheBridge {
  preferences: {
    getPinnedGroupOpen: () => Promise<boolean>
    getProjectGroupOpen: () => Promise<boolean>
    getSidebarOpen: () => Promise<boolean>
    getSidebarWidth: () => Promise<number>
    getTheme: () => Promise<Theme>
    setPinnedGroupOpen: (isOpen: boolean) => Promise<void>
    setProjectGroupOpen: (isOpen: boolean) => Promise<void>
    setSidebarOpen: (isOpen: boolean) => Promise<void>
    setSidebarWidth: (width: number) => Promise<void>
    setTheme: (theme: Theme) => Promise<void>
  }
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
  projects: {
    addDirectory: () => Promise<ProjectWithWorkspaces | null>
    getNavigation: () => Promise<WorkspaceNavigation>
    selectWorkspace: (workspaceId: string) => Promise<void>
  }
  shells: {
    getDefault: () => Promise<string>
    list: () => Promise<string[]>
    setDefault: (shell: string) => Promise<void>
  }
  terminals: {
    close: (panelId: string) => Promise<void>
    create: (request: TerminalCreateRequest) => Promise<TerminalSession>
    onData: (listener: (event: TerminalDataEvent) => void) => () => void
    onExit: (listener: (event: TerminalExitEvent) => void) => () => void
    resize: (panelId: string, columns: number, rows: number) => Promise<void>
    write: (panelId: string, data: string) => Promise<void>
  }
  workspaceLayouts: {
    get: (workspaceId: string) => Promise<WorkspaceLayoutSnapshot | null>
    save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot) => Promise<void>
  }
}
