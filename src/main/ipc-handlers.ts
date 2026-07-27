import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import { app, type BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'

import type {
  ProjectCreateInput,
  ProjectWithWorkspaces,
  RuntimeInfo,
  Theme,
  Workspace,
  WorkspaceNavigation,
} from '../shared/app-contract'
import { themeValues } from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'
import type { AppDatabase } from './database/app-database'
import { detectGitBranch } from './projects/git-branch'
import { createProjectService } from './projects/project-service'
import { registerWorkspaceIpc, removeWorkspaceIpc } from './workspaces/workspace-ipc'
import type { WorktreeService } from './workspaces/worktree-service'

interface RegisterIpcHandlersOptions {
  database: AppDatabase
  forgetInvalidProject?: (projectId: string, confirmation: string) => Promise<boolean>
  managedProjectsRoot: string
  window: BrowserWindow
  worktrees?: WorktreeService
}

const assertTrustedSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('拒绝来自非主窗口的 IPC 请求')
  }
}

const assertTheme = (value: unknown): Theme => {
  if (typeof value === 'string' && themeValues.some((theme: Theme): boolean => theme === value)) return value as Theme
  throw new TypeError('无效的主题参数')
}

const assertIdentifier = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  throw new TypeError('无效的工作区标识')
}

const assertBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  throw new TypeError('无效的布尔参数')
}

const assertSidebarWidth = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 280 && value <= 360) return Math.round(value)
  throw new TypeError('无效的侧栏宽度')
}

const logBoundaryError = (message: string, error: unknown): void => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`Lithe ${message}: ${detail}\n`)
}

const assertProjectCreateInput = (value: unknown): ProjectCreateInput => {
  if (!value || typeof value !== 'object') throw new TypeError('无效的项目参数')
  const { name, sourcePath } = value as { name?: unknown; sourcePath?: unknown }
  if (typeof name !== 'string' || name.length > 255) throw new TypeError('无效的项目名称')
  if (sourcePath !== undefined && (typeof sourcePath !== 'string' || sourcePath.length > 32_768)) {
    throw new TypeError('无效的 Source folder')
  }
  return { name, ...(sourcePath === undefined ? {} : { sourcePath }) }
}

const normalizedRealPath = (path: string): string => {
  let realPath: string
  try {
    realPath = realpathSync.native(resolve(path))
  } catch {
    realPath = resolve(path)
  }
  return process.platform === 'win32' ? realPath.toLocaleLowerCase() : realPath
}

export const registerIpcHandlers = ({
  database,
  forgetInvalidProject = async (): Promise<boolean> => false,
  managedProjectsRoot,
  window,
  worktrees,
}: RegisterIpcHandlersOptions): void => {
  const projectService = createProjectService({
    addProject: (project): void => {
      const [workspace] = project.workspaces
      if (!workspace) throw new Error('项目必须包含默认工作区')
      database.projects.addAndSelect(project, workspace)
    },
    createId: randomUUID,
    detectGitBranch: async (rootPath): Promise<string | null> => detectGitBranch(rootPath, logBoundaryError),
    findProjectByRoot: (rootPath): ProjectWithWorkspaces | undefined =>
      database.projects
        .list()
        .find((project): boolean => normalizedRealPath(project.rootPath) === normalizedRealPath(rootPath)),
    logError: logBoundaryError,
    managedProjectsRoot,
    now: (): Date => new Date(),
    platform: process.platform,
    selectWorkspace: database.navigation.setActiveWorkspace,
  })

  ipcMain.handle(ipcChannels.getRuntimeInfo, (event): RuntimeInfo => {
    assertTrustedSender(event, window)
    return {
      appVersion: app.getVersion(),
      architecture: process.arch,
      electronVersion: process.versions.electron,
      platform: process.platform,
      refreshedAt: new Date().toISOString(),
    }
  })
  ipcMain.handle(ipcChannels.getWindowMaximized, (event): boolean => {
    assertTrustedSender(event, window)
    return window.isMaximized()
  })
  ipcMain.handle(ipcChannels.getWindowSnapped, (event): boolean => {
    assertTrustedSender(event, window)
    return window.snapped
  })
  ipcMain.handle(ipcChannels.toggleWindowMaximized, (event): boolean => {
    assertTrustedSender(event, window)
    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }
    window.maximize()
    return true
  })
  ipcMain.handle(ipcChannels.getTheme, (event): Theme => {
    assertTrustedSender(event, window)
    return database.preferences.getTheme()
  })
  ipcMain.handle(ipcChannels.getSidebarOpen, (event): boolean => {
    assertTrustedSender(event, window)
    return database.preferences.getSidebarOpen()
  })
  ipcMain.handle(ipcChannels.getSidebarWidth, (event): number => {
    assertTrustedSender(event, window)
    return database.preferences.getSidebarWidth()
  })
  ipcMain.handle(ipcChannels.getPinnedGroupOpen, (event): boolean => {
    assertTrustedSender(event, window)
    return database.preferences.getPinnedGroupOpen()
  })
  ipcMain.handle(ipcChannels.getNotificationsEnabled, (event): boolean => {
    assertTrustedSender(event, window)
    return database.preferences.getNotificationsEnabled()
  })
  ipcMain.handle(ipcChannels.getProjectGroupOpen, (event): boolean => {
    assertTrustedSender(event, window)
    return database.preferences.getProjectGroupOpen()
  })
  ipcMain.handle(ipcChannels.setTheme, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setTheme(assertTheme(value))
  })
  ipcMain.handle(ipcChannels.setSidebarOpen, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setSidebarOpen(assertBoolean(value))
  })
  ipcMain.handle(ipcChannels.setSidebarWidth, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setSidebarWidth(assertSidebarWidth(value))
  })
  ipcMain.handle(ipcChannels.setPinnedGroupOpen, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setPinnedGroupOpen(assertBoolean(value))
  })
  ipcMain.handle(ipcChannels.setNotificationsEnabled, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setNotificationsEnabled(assertBoolean(value))
  })
  ipcMain.handle(ipcChannels.setProjectGroupOpen, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setProjectGroupOpen(assertBoolean(value))
  })
  ipcMain.handle(ipcChannels.pickProjectSourceFolder, async (event): Promise<string | null> => {
    assertTrustedSender(event, window)
    const selection = await dialog.showOpenDialog(window, {
      buttonLabel: '选择文件夹',
      properties: ['openDirectory'],
      title: '选择 Source folder',
    })
    const [rootPath] = selection.filePaths
    if (selection.canceled || !rootPath) return null
    return rootPath
  })
  ipcMain.handle(ipcChannels.createProject, async (event, input: unknown): Promise<ProjectWithWorkspaces> => {
    assertTrustedSender(event, window)
    return await projectService.create(assertProjectCreateInput(input))
  })
  ipcMain.handle(ipcChannels.getWorkspaceNavigation, (event): WorkspaceNavigation => {
    assertTrustedSender(event, window)
    return {
      activeWorkspaceId: database.navigation.getActiveWorkspace(),
      projects: database.projects.list(),
      scratchWorkspaces: database.projects.listScratch(),
    }
  })
  ipcMain.handle(ipcChannels.selectWorkspace, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.navigation.setActiveWorkspace(assertIdentifier(value))
  })
  ipcMain.handle(ipcChannels.setWorkspacePinned, (event, workspaceId: unknown, isPinned: unknown): Workspace => {
    assertTrustedSender(event, window)
    return database.projects.setPinned(assertIdentifier(workspaceId), assertBoolean(isPinned) ? new Date() : null)
  })
  if (worktrees) registerWorkspaceIpc({ forgetInvalidProject, window, worktrees })
}

export const removeIpcHandlers = (): void => {
  removeWorkspaceIpc()
  ipcMain.removeHandler(ipcChannels.getRuntimeInfo)
  ipcMain.removeHandler(ipcChannels.getWindowMaximized)
  ipcMain.removeHandler(ipcChannels.getWindowSnapped)
  ipcMain.removeHandler(ipcChannels.toggleWindowMaximized)
  ipcMain.removeHandler(ipcChannels.getTheme)
  ipcMain.removeHandler(ipcChannels.getSidebarOpen)
  ipcMain.removeHandler(ipcChannels.getSidebarWidth)
  ipcMain.removeHandler(ipcChannels.getPinnedGroupOpen)
  ipcMain.removeHandler(ipcChannels.getNotificationsEnabled)
  ipcMain.removeHandler(ipcChannels.getProjectGroupOpen)
  ipcMain.removeHandler(ipcChannels.setTheme)
  ipcMain.removeHandler(ipcChannels.setSidebarOpen)
  ipcMain.removeHandler(ipcChannels.setSidebarWidth)
  ipcMain.removeHandler(ipcChannels.setPinnedGroupOpen)
  ipcMain.removeHandler(ipcChannels.setNotificationsEnabled)
  ipcMain.removeHandler(ipcChannels.setProjectGroupOpen)
  ipcMain.removeHandler(ipcChannels.createProject)
  ipcMain.removeHandler(ipcChannels.pickProjectSourceFolder)
  ipcMain.removeHandler(ipcChannels.getWorkspaceNavigation)
  ipcMain.removeHandler(ipcChannels.selectWorkspace)
  ipcMain.removeHandler(ipcChannels.setWorkspacePinned)
}
