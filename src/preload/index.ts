import { contextBridge, ipcRenderer } from 'electron'

import type {
  AdapterDefinition,
  AdapterSummary,
  AgentLaunch,
  BackgroundAgentLaunch,
  FileChangeEvent,
  FileCloseResult,
  FileDocumentSnapshot,
  FileDraft,
  FileTreeEntry,
  GitChangeKind,
  GitChangeList,
  GitDiffSnapshot,
  LitheBridge,
  ProjectRemovalPreview,
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
  WorkspaceCreateInput,
  WorkspaceCreatePreview,
  WorkspaceDeletePreview,
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
  files: {
    clearDraft: async (workspaceId: string, relativePath: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.fileClearDraft, workspaceId, relativePath) as Promise<void>,
    closeLastView: async (workspaceId: string, relativePath: string): Promise<FileCloseResult> =>
      ipcRenderer.invoke(ipcChannels.fileCloseLastView, workspaceId, relativePath) as Promise<FileCloseResult>,
    listDirectory: async (
      workspaceId: string,
      relativeDirectory: string,
      showIgnored: boolean,
    ): Promise<FileTreeEntry[]> =>
      ipcRenderer.invoke(ipcChannels.fileListDirectory, workspaceId, relativeDirectory, showIgnored) as Promise<
        FileTreeEntry[]
      >,
    onChanged: (listener: (event: FileChangeEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: FileChangeEvent): void => listener(value)
      ipcRenderer.on(ipcChannels.fileChanged, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.fileChanged, wrapped)
      }
    },
    read: async (workspaceId: string, relativePath: string): Promise<FileDocumentSnapshot> =>
      ipcRenderer.invoke(ipcChannels.fileRead, workspaceId, relativePath) as Promise<FileDocumentSnapshot>,
    save: async (
      workspaceId: string,
      relativePath: string,
      content: string,
      expectedFingerprint: string,
      force?: boolean,
    ): Promise<FileDocumentSnapshot> =>
      ipcRenderer.invoke(
        ipcChannels.fileSave,
        workspaceId,
        relativePath,
        content,
        expectedFingerprint,
        force,
      ) as Promise<FileDocumentSnapshot>,
    setDraft: async (draft: FileDraft): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.fileSetDraft, draft) as Promise<void>,
    watch: async (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.fileWatch, workspaceId) as Promise<void>,
  },
  gitDiff: {
    list: async (workspaceId: string): Promise<GitChangeList> =>
      ipcRenderer.invoke(ipcChannels.gitDiffList, workspaceId) as Promise<GitChangeList>,
    read: async (workspaceId: string, kind: GitChangeKind, relativePath: string): Promise<GitDiffSnapshot> =>
      ipcRenderer.invoke(ipcChannels.gitDiffRead, workspaceId, kind, relativePath) as Promise<GitDiffSnapshot>,
    version: async (workspaceId: string, relativePath?: string): Promise<string | null> =>
      ipcRenderer.invoke(ipcChannels.gitDiffVersion, workspaceId, relativePath) as Promise<string | null>,
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
    previewRemove: async (projectId: string): Promise<ProjectRemovalPreview> =>
      ipcRenderer.invoke(ipcChannels.previewProjectRemoval, projectId) as Promise<ProjectRemovalPreview>,
    remove: async (projectId: string, branchConfirmations?: Record<string, string>): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.removeProject, projectId, branchConfirmations) as Promise<boolean>,
    forgetInvalid: async (projectId: string, confirmation: string): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.forgetInvalidProject, projectId, confirmation) as Promise<boolean>,
    selectWorkspace: async (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.selectWorkspace, workspaceId) as Promise<void>,
    setWorkspacePinned: async (workspaceId: string, isPinned: boolean): Promise<Workspace> =>
      ipcRenderer.invoke(ipcChannels.setWorkspacePinned, workspaceId, isPinned) as Promise<Workspace>,
  },
  workspaces: {
    create: async (input: WorkspaceCreateInput, confirmedDirtyFingerprint?: string): Promise<Workspace | null> =>
      ipcRenderer.invoke(ipcChannels.createWorkspace, input, confirmedDirtyFingerprint) as Promise<Workspace | null>,
    delete: async (workspaceId: string, branchConfirmation?: string): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.deleteWorkspace, workspaceId, branchConfirmation) as Promise<boolean>,
    previewCreate: async (input: WorkspaceCreateInput): Promise<WorkspaceCreatePreview> =>
      ipcRenderer.invoke(ipcChannels.previewWorkspaceCreate, input) as Promise<WorkspaceCreatePreview>,
    previewDelete: async (workspaceId: string): Promise<WorkspaceDeletePreview> =>
      ipcRenderer.invoke(ipcChannels.previewWorkspaceDelete, workspaceId) as Promise<WorkspaceDeletePreview>,
    rename: async (workspaceId: string, name: string): Promise<Workspace> =>
      ipcRenderer.invoke(ipcChannels.renameWorkspace, workspaceId, name) as Promise<Workspace>,
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
    create: async (workspaceId: string, name: string, adapterId?: string): Promise<AgentLaunch> =>
      ipcRenderer.invoke(ipcChannels.taskCreate, workspaceId, name, adapterId) as Promise<AgentLaunch>,
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
  window: {
    getMaximized: async (): Promise<boolean> => ipcRenderer.invoke(ipcChannels.getWindowMaximized) as Promise<boolean>,
    getSnapped: async (): Promise<boolean> => ipcRenderer.invoke(ipcChannels.getWindowSnapped) as Promise<boolean>,
    toggleMaximized: async (): Promise<boolean> =>
      ipcRenderer.invoke(ipcChannels.toggleWindowMaximized) as Promise<boolean>,
    onMaximizedChanged: (listener: (isMaximized: boolean) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: boolean): void => listener(value)
      ipcRenderer.on(ipcChannels.windowMaximizedChanged, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.windowMaximizedChanged, wrapped)
      }
    },
    onSnappedChanged: (listener: (isSnapped: boolean) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, value: boolean): void => listener(value)
      ipcRenderer.on(ipcChannels.windowSnappedChanged, wrapped)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.windowSnappedChanged, wrapped)
      }
    },
  },
  workspaceLayouts: {
    get: async (workspaceId: string): Promise<WorkspaceLayoutSnapshot | null> =>
      ipcRenderer.invoke(ipcChannels.getWorkspaceLayout, workspaceId) as Promise<WorkspaceLayoutSnapshot | null>,
    save: async (workspaceId: string, snapshot: WorkspaceLayoutSnapshot): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.saveWorkspaceLayout, workspaceId, snapshot) as Promise<void>,
  },
}

contextBridge.exposeInMainWorld('lithe', bridge)
