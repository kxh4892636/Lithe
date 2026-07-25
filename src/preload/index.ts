import { contextBridge, ipcRenderer } from 'electron'

import type {
  AdapterDefinition,
  AdapterSummary,
  AgentLaunch,
  BackgroundAgentLaunch,
  LitheBridge,
  ProjectWithWorkspaces,
  RuntimeInfo,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSession,
  Task,
  TaskChangeEvent,
  Theme,
  Workspace,
  WorkspaceLayoutSnapshot,
  WorkspaceNavigation,
} from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'

const bridge: LitheBridge = {
  adapters: {
    create: async (name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      ipcRenderer.invoke(ipcChannels.adapterCreate, name, definition) as Promise<AdapterSummary>,
    delete: async (adapterId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.adapterDelete, adapterId) as Promise<void>,
    get: async (versionId: string): Promise<AdapterSummary | null> =>
      ipcRenderer.invoke(ipcChannels.adapterGet, versionId) as Promise<AdapterSummary | null>,
    list: async (): Promise<AdapterSummary[]> =>
      ipcRenderer.invoke(ipcChannels.adapterList) as Promise<AdapterSummary[]>,
    setDefault: async (versionId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.adapterSetDefault, versionId) as Promise<void>,
    update: async (adapterId: string, name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      ipcRenderer.invoke(ipcChannels.adapterUpdate, adapterId, name, definition) as Promise<AdapterSummary>,
  },
  agents: {
    fork: async (taskId: string): Promise<AgentLaunch> =>
      ipcRenderer.invoke(ipcChannels.agentFork, taskId) as Promise<AgentLaunch>,
    onBackgroundLaunch: (listener: (event: BackgroundAgentLaunch) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: BackgroundAgentLaunch): void => listener(value)
      ipcRenderer.on(ipcChannels.agentBackgroundLaunch, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.agentBackgroundLaunch, wrapped)
      }
    },
    resume: async (taskId: string): Promise<AgentLaunch> =>
      ipcRenderer.invoke(ipcChannels.agentResume, taskId) as Promise<AgentLaunch>,
    start: async (taskId: string): Promise<AgentLaunch> =>
      ipcRenderer.invoke(ipcChannels.agentStart, taskId) as Promise<AgentLaunch>,
    stop: async (taskId: string): Promise<void> => ipcRenderer.invoke(ipcChannels.agentStop, taskId) as Promise<void>,
    shouldRestore: async (): Promise<boolean> => ipcRenderer.invoke(ipcChannels.agentShouldRestore) as Promise<boolean>,
  },
  preferences: {
    getPinnedGroupOpen: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.getPinnedGroupOpen) as Promise<boolean>,
    getNotificationsEnabled: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.getNotificationsEnabled) as Promise<boolean>,
    getProjectGroupOpen: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.getProjectGroupOpen) as Promise<boolean>,
    getSidebarOpen: async (): Promise<boolean> => ipcRenderer.invoke(ipcChannels.getSidebarOpen) as Promise<boolean>,
    getSidebarWidth: async (): Promise<number> => ipcRenderer.invoke(ipcChannels.getSidebarWidth) as Promise<number>,
    getTheme: async (): Promise<Theme> => ipcRenderer.invoke(ipcChannels.getTheme) as Promise<Theme>,
    setPinnedGroupOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setPinnedGroupOpen, isOpen) as Promise<void>,
    setNotificationsEnabled: async (isEnabled: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setNotificationsEnabled, isEnabled) as Promise<void>,
    setProjectGroupOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setProjectGroupOpen, isOpen) as Promise<void>,
    setSidebarOpen: async (isOpen: boolean): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setSidebarOpen, isOpen) as Promise<void>,
    setSidebarWidth: async (width: number): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setSidebarWidth, width) as Promise<void>,
    setTheme: async (theme: Theme): Promise<void> => ipcRenderer.invoke(ipcChannels.setTheme, theme) as Promise<void>,
  },
  runtime: {
    getInfo: async (): Promise<RuntimeInfo> => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  },
  projects: {
    addDirectory: async (): Promise<ProjectWithWorkspaces | null> =>
      ipcRenderer.invoke(ipcChannels.addProjectDirectory) as Promise<ProjectWithWorkspaces | null>,
    getNavigation: async (): Promise<WorkspaceNavigation> =>
      ipcRenderer.invoke(ipcChannels.getWorkspaceNavigation) as Promise<WorkspaceNavigation>,
    onNavigationChanged: (listener: () => void): (() => void) => {
      const wrapped = (): void => listener()
      ipcRenderer.on(ipcChannels.workspaceNavigationChanged, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.workspaceNavigationChanged, wrapped)
      }
    },
    selectWorkspace: async (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.selectWorkspace, workspaceId) as Promise<void>,
    setWorkspacePinned: async (workspaceId: string, isPinned: boolean): Promise<Workspace> =>
      ipcRenderer.invoke(ipcChannels.setWorkspacePinned, workspaceId, isPinned) as Promise<Workspace>,
  },
  shells: {
    getDefault: async (): Promise<string> => ipcRenderer.invoke(ipcChannels.getDefaultShell) as Promise<string>,
    list: async (): Promise<string[]> => ipcRenderer.invoke(ipcChannels.listShells) as Promise<string[]>,
    setDefault: async (shell: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.setDefaultShell, shell) as Promise<void>,
  },
  terminals: {
    close: async (panelId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.closeTerminal, panelId) as Promise<void>,
    create: async (request: TerminalCreateRequest): Promise<TerminalSession> =>
      ipcRenderer.invoke(ipcChannels.createTerminal, request) as Promise<TerminalSession>,
    onData: (listener: (event: TerminalDataEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: TerminalDataEvent): void => listener(value)
      ipcRenderer.on(ipcChannels.terminalData, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.terminalData, wrapped)
      }
    },
    onExit: (listener: (event: TerminalExitEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: TerminalExitEvent): void => listener(value)
      ipcRenderer.on(ipcChannels.terminalExit, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.terminalExit, wrapped)
      }
    },
    resize: async (panelId: string, columns: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.resizeTerminal, panelId, columns, rows) as Promise<void>,
    write: async (panelId: string, data: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.writeTerminal, panelId, data) as Promise<void>,
  },
  tasks: {
    archive: async (taskId: string): Promise<Task> =>
      ipcRenderer.invoke(ipcChannels.taskArchive, taskId) as Promise<Task>,
    create: async (workspaceId: string, name: string): Promise<AgentLaunch> =>
      ipcRenderer.invoke(ipcChannels.taskCreate, workspaceId, name) as Promise<AgentLaunch>,
    delete: async (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.taskDelete, taskId) as Promise<boolean>,
    list: async (workspaceId: string): Promise<Task[]> =>
      ipcRenderer.invoke(ipcChannels.taskList, workspaceId) as Promise<Task[]>,
    listArchived: async (): Promise<Task[]> => ipcRenderer.invoke(ipcChannels.taskListArchived) as Promise<Task[]>,
    markViewed: async (taskId: string): Promise<Task> =>
      ipcRenderer.invoke(ipcChannels.taskViewed, taskId) as Promise<Task>,
    onChanged: (listener: (event: TaskChangeEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: TaskChangeEvent): void => listener(value)
      ipcRenderer.on(ipcChannels.taskChanged, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.taskChanged, wrapped)
      }
    },
    onNavigate: (listener: (taskId: string) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, taskId: string): void => listener(taskId)
      ipcRenderer.on(ipcChannels.taskNavigate, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.taskNavigate, wrapped)
      }
    },
    rename: async (taskId: string, name: string): Promise<Task> =>
      ipcRenderer.invoke(ipcChannels.taskRename, taskId, name) as Promise<Task>,
    restore: async (taskId: string): Promise<Task> =>
      ipcRenderer.invoke(ipcChannels.taskRestore, taskId) as Promise<Task>,
    setVisible: async (taskId: string | null): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.taskSetVisible, taskId) as Promise<void>,
  },
  workspaceLayouts: {
    get: async (workspaceId: string): Promise<WorkspaceLayoutSnapshot | null> =>
      ipcRenderer.invoke(ipcChannels.getWorkspaceLayout, workspaceId) as Promise<WorkspaceLayoutSnapshot | null>,
    save: async (workspaceId: string, snapshot: WorkspaceLayoutSnapshot): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.saveWorkspaceLayout, workspaceId, snapshot) as Promise<void>,
  },
}

contextBridge.exposeInMainWorld('lithe', bridge)
