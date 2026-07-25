import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { electronApp, is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, type MessageBoxOptions, Notification, shell } from 'electron'

import type { Task } from '../shared/agent-contract'
import { ipcChannels } from '../shared/ipc-channels'
import { createAdapterService } from './agents/adapter-service'
import { createAgentApplication } from './agents/agent-application'
import { registerAgentIpc, removeAgentIpc } from './agents/agent-ipc'
import { createAgentManager, type AgentManager } from './agents/agent-manager'
import { registerAgentToolCommands } from './agents/agent-tool-commands'
import { inspectAdapterAvailability, isAdapterAvailable } from './agents/command-availability'
import { installLitheToolSkill, readLitheToolSkill } from './agents/skill-installer'
import type { AppDatabase } from './database/app-database'
import { createAppDatabase } from './database/app-database'
import { registerIpcHandlers, removeIpcHandlers } from './ipc-handlers'
import { createScratchWorkspaceService } from './tasks/scratch-workspace-service'
import { createTaskService } from './tasks/task-service'
import { createTaskStateService, type TaskStateService } from './tasks/task-state-service'
import { createNodePtyAdapter } from './terminal/node-pty-adapter'
import { createPtyRuntime, type PtyRuntime } from './terminal/pty-runtime'
import { registerTerminalIpc, removeTerminalIpc } from './terminal/terminal-ipc'
import {
  createWorkspaceLayoutPersistence,
  type WorkspaceLayoutPersistence,
} from './terminal/workspace-layout-persistence'
import { createToolControlRuntime, type ToolControlRuntime } from './tool-control/tool-control-runtime'
import { resolveWindowOptions } from './window-state'

const userDataOverride = process.env.LITHE_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

let appDatabase: AppDatabase | undefined
let agentManager: AgentManager | undefined
let mainWindow: BrowserWindow | undefined
let persistTimer: NodeJS.Timeout | undefined
let ptyRuntime: PtyRuntime | undefined
let workspaceLayoutPersistence: WorkspaceLayoutPersistence | undefined
let toolControlRuntime: ToolControlRuntime | undefined
let taskStateService: TaskStateService | undefined
let shutdownStarted = false
let shutdownComplete = false
let skillConflicts: string[] = []
let visibleTaskId: string | null = null
let restoreAgentsThisLaunch = true
const taskNotifications = new Map<string, Notification>()
const scratchRoot = resolve(homedir(), '.lithe', 'scratch')
const scratchTrashStagingRoot = resolve(homedir(), '.lithe', 'trash-staging')

const assertScratchPath = (path: string): string => {
  const resolved = resolve(path)
  const child = relative(scratchRoot, resolved)
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new TypeError('Temporary workspace path is outside the managed scratch root')
  }
  return resolved
}

const removeScratchDirectory = (path: string): void => {
  rmSync(assertScratchPath(path), { force: true, recursive: true })
}

const assertStagedScratchPath = (path: string): string => {
  const resolved = resolve(path)
  const child = relative(scratchTrashStagingRoot, resolved)
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new TypeError('Staged temporary workspace path is outside the managed cleanup root')
  }
  return resolved
}

interface ScratchDeletionManifest {
  originalPath: string
  workspaceId: string
}

const readScratchDeletionManifest = (jobDirectory: string): ScratchDeletionManifest => {
  const value = JSON.parse(
    readFileSync(join(jobDirectory, 'manifest.json'), 'utf8'),
  ) as Partial<ScratchDeletionManifest>
  if (typeof value.workspaceId !== 'string' || typeof value.originalPath !== 'string') {
    throw new TypeError('Invalid scratch deletion manifest')
  }
  return {
    originalPath: assertScratchPath(value.originalPath),
    workspaceId: value.workspaceId,
  }
}

const retryStagedScratchCleanup = async (database: AppDatabase): Promise<void> => {
  if (!existsSync(scratchTrashStagingRoot)) return
  for (const entry of readdirSync(scratchTrashStagingRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const jobDirectory = assertStagedScratchPath(join(scratchTrashStagingRoot, entry.name))
    try {
      const manifest = readScratchDeletionManifest(jobDirectory)
      const contentPath = assertStagedScratchPath(join(jobDirectory, 'content'))
      const workspace = database.projects.getWorkspace(manifest.workspaceId)
      if (workspace) {
        if (resolve(workspace.rootPath) !== manifest.originalPath) {
          throw new TypeError('Scratch deletion manifest does not match workspace metadata')
        }
        if (existsSync(contentPath) && !existsSync(manifest.originalPath)) {
          renameSync(contentPath, manifest.originalPath)
        }
        if (!existsSync(contentPath) && existsSync(manifest.originalPath)) {
          rmSync(jobDirectory, { force: true, recursive: true })
        }
        continue
      }
      await shell.trashItem(jobDirectory)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Lithe staged scratch cleanup deferred: ${message}\n`)
    }
  }
}

const countDirectoryEntries = (path: string): number => {
  let count = 0
  const pending = [assertScratchPath(path)]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      continue
    }
    for (const entry of entries) {
      count += 1
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(join(current, entry.name))
    }
  }
  return count
}

const deleteManagedTask = async (task: Task): Promise<void> => {
  if (!appDatabase || !taskStateService) throw new Error('Task state service is unavailable')
  const workspace = appDatabase.projects.getWorkspace(task.workspaceId)
  const recycleScratch = workspace?.kind === 'scratch' && appDatabase.tasks.listAll(workspace.id).length === 1
  if (!recycleScratch || !workspace) {
    taskStateService.delete(task.id)
    return
  }

  agentManager?.stop(task.id)
  appDatabase.tasks.clearRunMarks(task.id)
  mkdirSync(scratchTrashStagingRoot, { recursive: true })
  const originalPath = assertScratchPath(workspace.rootPath)
  const jobDirectory = assertStagedScratchPath(join(scratchTrashStagingRoot, randomUUID()))
  const stagedPath = assertStagedScratchPath(join(jobDirectory, 'content'))
  mkdirSync(jobDirectory)
  writeFileSync(
    join(jobDirectory, 'manifest.json'),
    `${JSON.stringify({ originalPath, workspaceId: workspace.id })}\n`,
    { encoding: 'utf8', flush: true },
  )
  renameSync(originalPath, stagedPath)
  try {
    appDatabase.projects.deleteWorkspace(workspace.id)
  } catch (error: unknown) {
    renameSync(stagedPath, originalPath)
    rmSync(jobDirectory, { force: true, recursive: true })
    throw error
  }
  mainWindow?.webContents.send(ipcChannels.taskChanged, {
    deletedTaskId: task.id,
    workspaceId: workspace.id,
  })
  mainWindow?.webContents.send(ipcChannels.workspaceNavigationChanged)
  try {
    await shell.trashItem(jobDirectory)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Lithe staged scratch cleanup deferred: ${message}\n`)
  }
}

const resolveMigrationsFolder = (): string =>
  is.dev ? join(app.getAppPath(), 'drizzle') : join(process.resourcesPath, 'drizzle')

const installAgentSkill = (): string[] => {
  const resourcePath = is.dev ? join(app.getAppPath(), 'resources') : process.resourcesPath
  const result = installLitheToolSkill(process.env.LITHE_SKILL_HOME ?? homedir(), readLitheToolSkill(resourcePath))
  for (const conflict of result.conflicts) {
    process.stderr.write(`Lithe Tool Skill conflict: ${conflict}\n`)
  }
  return result.conflicts
}

const persistWindowState = (): void => {
  if (!appDatabase || !mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getNormalBounds()
  appDatabase.windowState.save({ ...bounds, isMaximized: mainWindow.isMaximized() })
}

const scheduleWindowStatePersistence = (): void => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(persistWindowState, 250)
}

const createWindow = (): BrowserWindow => {
  if (!appDatabase) throw new Error('数据库尚未初始化')
  const savedState = appDatabase.windowState.get()
  const window = new BrowserWindow({
    ...resolveWindowOptions(savedState),
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', vibrancy: 'under-window', visualEffectState: 'active' }
      : { titleBarOverlay: { color: '#00000000', height: 56, symbolColor: '#64748b' }, titleBarStyle: 'hidden' }),
    ...(process.platform === 'win32' ? { backgroundMaterial: 'mica' } : {}),
    show: false,
    title: 'Lithe',
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: false,
    },
  })

  if (savedState?.isMaximized) window.maximize()
  window.once('ready-to-show', (): void => window.show())
  window.on('maximize', scheduleWindowStatePersistence)
  window.on('move', scheduleWindowStatePersistence)
  window.on('resize', scheduleWindowStatePersistence)
  window.on('unmaximize', scheduleWindowStatePersistence)
  window.on('close', (event): void => {
    persistWindowState()
    if (!shutdownStarted && !shutdownComplete) {
      event.preventDefault()
      app.quit()
    }
  })
  window.on('closed', (): void => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.webContents.on('will-navigate', (event): void => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

const openMainWindow = (): void => {
  if (!appDatabase) return
  removeIpcHandlers()
  removeAgentIpc()
  removeTerminalIpc()
  ptyRuntime?.closeAll()
  visibleTaskId = null
  mainWindow = createWindow()
  if (skillConflicts.length > 0) {
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Lithe Tool Skill 未安装',
      message: '检测到同名的用户 Skill，Lithe 未覆盖任何现有文件。',
      detail: skillConflicts.join('\n'),
    })
    skillConflicts = []
  }
  registerIpcHandlers({ database: appDatabase, window: mainWindow })
  ptyRuntime = createPtyRuntime({
    adapter: createNodePtyAdapter(),
    onClose: (panelId: string): void => agentManager?.handleExit(panelId),
    onData: (panelId, data): void => mainWindow?.webContents.send(ipcChannels.terminalData, { panelId, data }),
    onExit: (panelId, exitCode): void => {
      agentManager?.handleExit(panelId)
      mainWindow?.webContents.send(ipcChannels.terminalExit, { panelId, exitCode })
    },
  })
  if (!toolControlRuntime) throw new Error('本地控制通道尚未初始化')
  agentManager = createAgentManager({
    capabilities: toolControlRuntime.capabilities,
    database: appDatabase,
    onInstanceExit: appDatabase.tasks.clearInstanceRunMark,
    runtime: ptyRuntime,
  })
  const taskService = createTaskService({
    createId: randomUUID,
    getDefaultAdapter: appDatabase.adapters.getDefault,
    getWorkspace: appDatabase.projects.getWorkspace,
    isAdapterAvailable,
    listTasks: appDatabase.tasks.list,
    now: (): Date => new Date(),
    saveTask: appDatabase.tasks.add,
    updateTask: appDatabase.tasks.rename,
  })
  const adapterService = createAdapterService({
    inspectAvailability: inspectAdapterAvailability,
    repository: appDatabase.adapters,
  })
  const agentApplication = createAgentApplication({
    createScratchWorkspace: createScratchWorkspaceService({
      add: appDatabase.projects.addScratch,
      createId: randomUUID,
      mkdir: (path: string): void => {
        mkdirSync(assertScratchPath(path), { recursive: true })
      },
      now: (): Date => new Date(),
      remove: removeScratchDirectory,
      scratchRoot,
    }).create,
    database: appDatabase,
    inspectAvailability: inspectAdapterAvailability,
    manager: agentManager,
    removeScratchWorkspace: (workspace): void => {
      removeScratchDirectory(workspace.rootPath)
      appDatabase?.projects.deleteWorkspace(workspace.id)
    },
    tasks: taskService,
  })
  const isTaskVisible = (taskId: string): boolean =>
    visibleTaskId === taskId && mainWindow?.isFocused() === true && mainWindow.isMinimized() !== true
  taskStateService = createTaskStateService({
    archive: appDatabase.tasks.archive,
    changed: (event): void => {
      mainWindow?.webContents.send(ipcChannels.taskChanged, event)
    },
    clearRunMarks: appDatabase.tasks.clearRunMarks,
    deleteTask: appDatabase.tasks.delete,
    get: appDatabase.tasks.get,
    markIdle: appDatabase.tasks.markIdle,
    markRunning: appDatabase.tasks.markRunning,
    markViewed: appDatabase.tasks.markViewed,
    notify: (task): void => {
      if (!appDatabase?.preferences.getNotificationsEnabled() || !Notification.isSupported()) return
      const workspace = appDatabase.projects.getWorkspace(task.workspaceId)
      if (!workspace) return
      const project = workspace.projectId
        ? appDatabase.projects.list().find((candidate): boolean => candidate.id === workspace.projectId)
        : undefined
      taskNotifications.get(task.id)?.close()
      const notification = new Notification({
        body: [project?.name, workspace.kind === 'scratch' ? null : workspace.name, task.name]
          .filter(Boolean)
          .join(' · '),
        silent: false,
        title: 'Lithe 任务需要关注',
      })
      notification.on('click', (): void => {
        if (!mainWindow) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send(ipcChannels.taskNavigate, task.id)
      })
      notification.on('close', (): void => {
        if (taskNotifications.get(task.id) === notification) taskNotifications.delete(task.id)
      })
      taskNotifications.set(task.id, notification)
      notification.show()
    },
    now: (): Date => new Date(),
    recordAttention: (taskId, createdAt) => {
      if (!appDatabase) throw new Error('Database is unavailable')
      return appDatabase.tasks.recordAttention(taskId, randomUUID(), createdAt)
    },
    removeTaskPanel: (workspaceId: string, taskId: string): void => {
      appDatabase?.workspaceLayouts.removeTaskPanel?.(workspaceId, taskId)
    },
    restore: appDatabase.tasks.restore,
    stopAgent: agentManager.stop,
  })
  const requestDeleteApproval = async (
    context: import('./tool-control/command-dispatcher').ToolCommandContext,
    task: import('../shared/agent-contract').Task,
  ): Promise<'approved' | 'rejected' | 'timed-out'> => {
    if (!mainWindow || !toolControlRuntime || !appDatabase) return 'rejected'
    const database = appDatabase
    const pending = toolControlRuntime.approvals.request(context.requestId, context.connectionId)
    const workspace = database.projects.getWorkspace(task.workspaceId)
    const isLastScratch = workspace?.kind === 'scratch' && database.tasks.listAll(workspace.id).length === 1
    const fileCount = isLastScratch && workspace ? countDirectoryEntries(workspace.rootPath) : 0
    void dialog
      .showMessageBox(mainWindow, {
        buttons: ['取消', '删除'],
        cancelId: 0,
        defaultId: 0,
        detail: isLastScratch
          ? `这也是该临时工作区的最后一个任务。目录及其中 ${fileCount} 个条目将移入系统回收站。`
          : '任务记录和对应 Agent 面板将被移除，此操作不可撤销。',
        message: `删除任务“${task.name}”？`,
        title: '确认删除任务',
        type: 'warning',
      })
      .then((result): void => {
        toolControlRuntime?.approvals.decide(context.requestId, result.response === 1 ? 'approved' : 'rejected')
      })
    const decision = await pending
    return decision === 'approved' || decision === 'timed-out' ? decision : 'rejected'
  }
  registerAgentToolCommands({
    application: agentApplication,
    capabilities: toolControlRuntime.capabilities,
    commands: toolControlRuntime.commands,
    deleteTask: deleteManagedTask,
    isTaskVisible,
    manager: agentManager,
    onBackgroundLaunch: (launch, afterTaskId): void => {
      appDatabase?.workspaceLayouts.addAgentPanel?.(
        launch.task.workspaceId,
        launch.task.id,
        launch.task.name,
        afterTaskId,
      )
      mainWindow?.webContents.send(ipcChannels.taskChanged, launch.task)
      mainWindow?.webContents.send(ipcChannels.workspaceNavigationChanged)
      mainWindow?.webContents.send(ipcChannels.agentBackgroundLaunch, { afterTaskId, launch })
    },
    requestDeleteApproval,
    states: taskStateService,
  })
  registerAgentIpc({
    adapters: adapterService,
    application: agentApplication,
    database: appDatabase,
    deleteTask: async (task): Promise<boolean> => {
      if (!mainWindow || !taskStateService) return false
      const workspace = appDatabase?.projects.getWorkspace(task.workspaceId)
      const isLastScratch = workspace?.kind === 'scratch' && appDatabase?.tasks.listAll(workspace.id).length === 1
      const fileCount = isLastScratch && workspace ? countDirectoryEntries(workspace.rootPath) : 0
      const result = await dialog.showMessageBox(mainWindow, {
        buttons: ['取消', '删除'],
        cancelId: 0,
        defaultId: 0,
        detail: isLastScratch
          ? `这也是该临时工作区的最后一个任务。目录及其中 ${fileCount} 个条目将移入系统回收站。`
          : '任务记录和对应 Agent 面板将被移除，此操作不可撤销。',
        message: `删除任务“${task.name}”？`,
        title: '确认删除任务',
        type: 'warning',
      })
      if (result.response !== 1) return false
      await deleteManagedTask(task)
      return true
    },
    isTaskVisible,
    setVisibleTask: (taskId: string | null): void => {
      visibleTaskId = taskId
    },
    shouldRestoreAgents: (): boolean => restoreAgentsThisLaunch,
    states: taskStateService,
    window: mainWindow,
  })
  if (!workspaceLayoutPersistence) {
    workspaceLayoutPersistence = createWorkspaceLayoutPersistence(appDatabase.workspaceLayouts)
  }
  registerTerminalIpc({
    database: appDatabase,
    runtime: ptyRuntime,
    window: mainWindow,
    workspaceLayouts: workspaceLayoutPersistence,
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (): void => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app
    .whenReady()
    .then(async (): Promise<void> => {
      electronApp.setAppUserModelId('com.kxh.lithe')
      appDatabase = createAppDatabase({
        databasePath: join(app.getPath('userData'), 'lithe.db'),
        migrationsFolder: resolveMigrationsFolder(),
      })
      const previousExitWasClean = appDatabase.preferences.getLastExitClean()
      if (!previousExitWasClean) appDatabase.tasks.clearAllRunMarks()
      appDatabase.preferences.setLastExitClean(false)
      if (!previousExitWasClean) {
        const result = await dialog.showMessageBox({
          buttons: ['暂不恢复', '恢复 Agent'],
          cancelId: 0,
          defaultId: 0,
          detail: 'Lithe 上次没有正常退出。为避免重复崩溃，请确认是否恢复当前工作区中的 Agent。',
          message: '检测到异常退出',
          title: '恢复确认',
          type: 'warning',
        })
        restoreAgentsThisLaunch = result.response === 1
      }
      await retryStagedScratchCleanup(appDatabase)
      skillConflicts = installAgentSkill()
      toolControlRuntime = createToolControlRuntime(
        appDatabase,
        process.env.LITHE_E2E === '1' ? { discoveryPath: join(app.getPath('userData'), 'control.json') } : {},
      )
      await toolControlRuntime.listen()
      openMainWindow()
      app.on('activate', (): void => {
        if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
      })
    })
    .catch((error: unknown): void => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
      process.stderr.write(`Lithe startup failed: ${message}\n`)
      dialog.showErrorBox('Lithe 启动失败', message)
      app.quit()
    })

  app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event): void => {
    if (shutdownComplete) return
    event.preventDefault()
    if (shutdownStarted) return
    shutdownStarted = true
    void (async (): Promise<void> => {
      try {
        const runningTasks = appDatabase?.tasks.listRunning() ?? []
        if (runningTasks.length > 0) {
          const options: MessageBoxOptions = {
            buttons: ['继续工作', '退出并停止'],
            cancelId: 0,
            defaultId: 0,
            detail: runningTasks.map((task): string => task.name).join('\n'),
            message: `仍有 ${runningTasks.length} 个任务标记为运行中`,
            title: '确认退出 Lithe',
            type: 'warning',
          }
          const result = mainWindow
            ? await dialog.showMessageBox(mainWindow, options)
            : await dialog.showMessageBox(options)
          if (result.response !== 1) {
            shutdownStarted = false
            return
          }
          for (const task of runningTasks) {
            agentManager?.stop(task.id)
            appDatabase?.tasks.clearRunMarks(task.id)
          }
        }
        if (persistTimer) clearTimeout(persistTimer)
        persistWindowState()
        removeIpcHandlers()
        removeAgentIpc()
        removeTerminalIpc()
        ptyRuntime?.closeAll()
        ptyRuntime = undefined
        agentManager = undefined
        taskStateService = undefined
        workspaceLayoutPersistence?.flushAll(false)
        workspaceLayoutPersistence = undefined
        try {
          await toolControlRuntime?.close()
        } catch (error: unknown) {
          const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
          process.stderr.write(`Lithe tool control shutdown failed: ${message}\n`)
        } finally {
          toolControlRuntime = undefined
          try {
            appDatabase?.preferences.setLastExitClean(true)
            appDatabase?.close()
          } catch (error: unknown) {
            const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
            process.stderr.write(`Lithe database shutdown failed: ${message}\n`)
          } finally {
            appDatabase = undefined
            shutdownComplete = true
            app.quit()
          }
        }
      } catch (error: unknown) {
        shutdownStarted = false
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
        process.stderr.write(`Lithe shutdown failed: ${message}\n`)
      }
    })()
  })
}
