import type { AdapterDefinition, AdapterSummary, AgentLaunch, Task } from './agent-contract'
import type { TerminalCreateRequest } from './terminal-schema'
import type { WorkspaceLayoutSnapshot } from './workspace-layout-schema'

export type { TerminalCreateRequest } from './terminal-schema'
export type { WorkspaceLayoutSnapshot } from './workspace-layout-schema'
export type { AdapterDefinition, AdapterSummary, AdapterVersion, AgentLaunch, Task } from './agent-contract'

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

export type WorkspaceKind = 'default' | 'derived' | 'scratch'

export interface Workspace {
  id: string
  projectId: string | null
  name: string
  rootPath: string
  gitBranch: string | null
  kind: WorkspaceKind
  pinnedAt?: Date | null
  createdAt: Date
}

export interface ProjectWithWorkspaces extends Project {
  workspaces: Workspace[]
}

export interface WorkspaceNavigation {
  activeWorkspaceId: string | null
  projects: ProjectWithWorkspaces[]
  scratchWorkspaces: Workspace[]
}

export interface WorkspaceCreateInput {
  existingBranch?: string
  from?: string
  name?: string
  newBranch?: string
  projectId: string
  sourceWorkspaceId?: string
}

export interface WorkspaceCreatePreview {
  dirtyFingerprint: string
  dirtyPaths: string[]
  headCommit: string
  input: WorkspaceCreateInput
}

export interface WorkspaceDeletePreview {
  branch: string
  dirtyPaths: string[]
  unmergedCommits: Array<{ hash: string; subject: string }>
  workspace: Workspace
}

export interface ProjectRemovalPreview {
  project: ProjectWithWorkspaces
  workspaces: WorkspaceDeletePreview[]
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

export interface FileTreeEntry {
  children?: FileTreeEntry[]
  externalSymlink: boolean
  id: string
  isDirectory: boolean
  name: string
  relativePath: string
}

export interface FileDocumentSnapshot {
  content: string
  fingerprint: string
  relativePath: string
}

export interface FileDraft extends FileDocumentSnapshot {
  workspaceId: string
}

export interface FileChangeEvent {
  relativePath: string
  type: 'add' | 'change' | 'unlink'
  workspaceId: string
}

export type FileCloseResult = 'cancel' | 'discarded' | 'saved'

export type GitChangeKind = 'staged' | 'unstaged' | 'untracked'

export interface GitChangeEntry {
  id: string
  kind: GitChangeKind
  relativePath: string
}

export interface GitChangeList {
  changes: GitChangeEntry[]
  isRepository: boolean
}

export interface GitDiffSnapshot extends GitChangeEntry {
  modified: string
  original: string
}

export interface LitheBridge {
  adapters: {
    create: (name: string, definition: AdapterDefinition) => Promise<AdapterSummary>
    delete: (adapterId: string) => Promise<void>
    get: (versionId: string) => Promise<AdapterSummary | null>
    list: () => Promise<AdapterSummary[]>
    setDefault: (versionId: string) => Promise<void>
    update: (adapterId: string, name: string, definition: AdapterDefinition) => Promise<AdapterSummary>
  }
  agents: {
    fork: (taskId: string) => Promise<AgentLaunch>
    onBackgroundLaunch: (listener: (event: BackgroundAgentLaunch) => void) => () => void
    resume: (taskId: string) => Promise<AgentLaunch>
    start: (taskId: string) => Promise<AgentLaunch>
    stop: (taskId: string) => Promise<void>
    shouldRestore: () => Promise<boolean>
  }
  files: {
    clearDraft: (workspaceId: string, relativePath: string) => Promise<void>
    closeLastView: (workspaceId: string, relativePath: string) => Promise<FileCloseResult>
    listDirectory: (workspaceId: string, relativeDirectory: string, showIgnored: boolean) => Promise<FileTreeEntry[]>
    onChanged: (listener: (event: FileChangeEvent) => void) => () => void
    read: (workspaceId: string, relativePath: string) => Promise<FileDocumentSnapshot>
    save: (
      workspaceId: string,
      relativePath: string,
      content: string,
      expectedFingerprint: string,
      force?: boolean,
    ) => Promise<FileDocumentSnapshot>
    setDraft: (draft: FileDraft) => Promise<void>
    watch: (workspaceId: string) => Promise<void>
  }
  gitDiff: {
    list: (workspaceId: string) => Promise<GitChangeList>
    read: (workspaceId: string, kind: GitChangeKind, relativePath: string) => Promise<GitDiffSnapshot>
    version: (workspaceId: string, relativePath?: string) => Promise<string | null>
  }
  preferences: {
    getPinnedGroupOpen: () => Promise<boolean>
    getNotificationsEnabled: () => Promise<boolean>
    getProjectGroupOpen: () => Promise<boolean>
    getSidebarOpen: () => Promise<boolean>
    getSidebarWidth: () => Promise<number>
    getTheme: () => Promise<Theme>
    setPinnedGroupOpen: (isOpen: boolean) => Promise<void>
    setNotificationsEnabled: (isEnabled: boolean) => Promise<void>
    setProjectGroupOpen: (isOpen: boolean) => Promise<void>
    setSidebarOpen: (isOpen: boolean) => Promise<void>
    setSidebarWidth: (width: number) => Promise<void>
    setTheme: (theme: Theme) => Promise<void>
  }
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
  window: {
    getMaximized: () => Promise<boolean>
    getSnapped: () => Promise<boolean>
    onMaximizedChanged: (listener: (isMaximized: boolean) => void) => () => void
    onSnappedChanged: (listener: (isSnapped: boolean) => void) => () => void
  }
  projects: {
    addDirectory: () => Promise<ProjectWithWorkspaces | null>
    getNavigation: () => Promise<WorkspaceNavigation>
    onNavigationChanged: (listener: () => void) => () => void
    selectWorkspace: (workspaceId: string) => Promise<void>
    setWorkspacePinned: (workspaceId: string, isPinned: boolean) => Promise<Workspace>
    previewRemove: (projectId: string) => Promise<ProjectRemovalPreview>
    remove: (projectId: string, branchConfirmations?: Record<string, string>) => Promise<boolean>
    forgetInvalid: (projectId: string, confirmation: string) => Promise<boolean>
  }
  workspaces: {
    create: (input: WorkspaceCreateInput, confirmedDirtyFingerprint?: string) => Promise<Workspace | null>
    delete: (workspaceId: string, branchConfirmation?: string) => Promise<boolean>
    previewCreate: (input: WorkspaceCreateInput) => Promise<WorkspaceCreatePreview>
    previewDelete: (workspaceId: string) => Promise<WorkspaceDeletePreview>
    rename: (workspaceId: string, name: string) => Promise<Workspace>
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
  tasks: {
    archive: (taskId: string) => Promise<Task>
    create: (workspaceId: string, name: string, adapterId?: string) => Promise<AgentLaunch>
    delete: (taskId: string) => Promise<boolean>
    list: (workspaceId: string) => Promise<Task[]>
    listArchived: () => Promise<Task[]>
    markViewed: (taskId: string) => Promise<Task>
    onChanged: (listener: (event: TaskChangeEvent) => void) => () => void
    onNavigate: (listener: (taskId: string) => void) => () => void
    rename: (taskId: string, name: string) => Promise<Task>
    restore: (taskId: string) => Promise<Task>
    setVisible: (taskId: string | null) => Promise<void>
  }
  workspaceLayouts: {
    get: (workspaceId: string) => Promise<WorkspaceLayoutSnapshot | null>
    save: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot) => Promise<void>
  }
}

export type TaskChangeEvent = Task | { deletedTaskId: string; workspaceId: string }
export interface BackgroundAgentLaunch {
  afterTaskId?: string
  launch: AgentLaunch
}
