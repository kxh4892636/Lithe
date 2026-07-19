import { app, type BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { RuntimeInfo, Theme } from '../shared/app-contract'
import { themeValues } from '../shared/app-contract'
import { ipcChannels } from '../shared/ipc-channels'
import type { AppDatabase } from './database/app-database'

interface RegisterIpcHandlersOptions {
  database: AppDatabase
  window: BrowserWindow
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

export const registerIpcHandlers = ({ database, window }: RegisterIpcHandlersOptions): void => {
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
  ipcMain.handle(ipcChannels.getTheme, (event): Theme => {
    assertTrustedSender(event, window)
    return database.preferences.getTheme()
  })
  ipcMain.handle(ipcChannels.setTheme, (event, value: unknown): void => {
    assertTrustedSender(event, window)
    database.preferences.setTheme(assertTheme(value))
  })
}

export const removeIpcHandlers = (): void => {
  ipcMain.removeHandler(ipcChannels.getRuntimeInfo)
  ipcMain.removeHandler(ipcChannels.getTheme)
  ipcMain.removeHandler(ipcChannels.setTheme)
}
