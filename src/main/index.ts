import { join } from 'node:path'

import { electronApp, is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog } from 'electron'

import type { AppDatabase } from './database/app-database'
import { createAppDatabase } from './database/app-database'
import { registerIpcHandlers, removeIpcHandlers } from './ipc-handlers'
import { resolveWindowOptions } from './window-state'

const userDataOverride = process.env.LITHE_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

let appDatabase: AppDatabase | undefined
let mainWindow: BrowserWindow | undefined
let persistTimer: NodeJS.Timeout | undefined

const resolveMigrationsFolder = (): string =>
  is.dev ? join(app.getAppPath(), 'drizzle') : join(process.resourcesPath, 'drizzle')

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
    backgroundColor: '#f6f8fb',
    show: false,
    title: 'Lithe',
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
  mainWindow = createWindow()
  registerIpcHandlers({ database: appDatabase, window: mainWindow })
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
    .then((): void => {
      electronApp.setAppUserModelId('com.kxh.lithe')
      appDatabase = createAppDatabase({
        databasePath: join(app.getPath('userData'), 'lithe.db'),
        migrationsFolder: resolveMigrationsFolder(),
      })
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

  app.on('before-quit', (): void => {
    if (persistTimer) clearTimeout(persistTimer)
    persistWindowState()
    removeIpcHandlers()
    appDatabase?.close()
    appDatabase = undefined
  })
}
