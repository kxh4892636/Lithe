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
}
