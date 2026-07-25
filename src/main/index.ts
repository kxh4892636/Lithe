import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { electronApp, is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog } from 'electron'

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
import { createTaskService } from './tasks/task-service'
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
let shutdownStarted = false
let shutdownComplete = false
let skillConflicts: string[] = []

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
  window.on('close', persistWindowState)
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
    database: appDatabase,
    inspectAvailability: inspectAdapterAvailability,
    manager: agentManager,
    tasks: taskService,
  })
  registerAgentToolCommands({
    application: agentApplication,
    capabilities: toolControlRuntime.capabilities,
    commands: toolControlRuntime.commands,
    manager: agentManager,
  })
  registerAgentIpc({
    adapters: adapterService,
    application: agentApplication,
    database: appDatabase,
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
    if (persistTimer) clearTimeout(persistTimer)
    persistWindowState()
    removeIpcHandlers()
    removeAgentIpc()
    removeTerminalIpc()
    ptyRuntime?.closeAll()
    ptyRuntime = undefined
    agentManager = undefined
    workspaceLayoutPersistence?.flushAll(false)
    workspaceLayoutPersistence = undefined
    void (async (): Promise<void> => {
      try {
        await toolControlRuntime?.close()
      } catch (error: unknown) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
        process.stderr.write(`Lithe tool control shutdown failed: ${message}\n`)
      } finally {
        toolControlRuntime = undefined
        try {
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
    })()
  })
}
