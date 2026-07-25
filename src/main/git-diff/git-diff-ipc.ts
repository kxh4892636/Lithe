import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import type { GitChangeKind } from '../../shared/app-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import type { GitDiffService } from './git-diff-service'

interface GitDiffIpcOptions {
  service: GitDiffService
  window: BrowserWindow
}

const assertSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new TypeError('Untrusted Git diff IPC sender')
  }
}

const stringValue = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value || value.length > 4_096) throw new TypeError(`${name} is invalid`)
  return value
}

const kindValue = (value: unknown): GitChangeKind => {
  if (value !== 'staged' && value !== 'unstaged' && value !== 'untracked') {
    throw new TypeError('kind is invalid')
  }
  return value
}

export const registerGitDiffIpc = ({ service, window }: GitDiffIpcOptions): (() => void) => {
  ipcMain.handle(ipcChannels.gitDiffList, async (event, workspaceId: unknown) => {
    assertSender(event, window)
    return await service.list(stringValue(workspaceId, 'workspaceId'))
  })
  ipcMain.handle(ipcChannels.gitDiffRead, async (event, workspaceId: unknown, kind: unknown, path: unknown) => {
    assertSender(event, window)
    return await service.read(stringValue(workspaceId, 'workspaceId'), kindValue(kind), stringValue(path, 'path'))
  })
  ipcMain.handle(ipcChannels.gitDiffVersion, async (event, workspaceId: unknown, path: unknown) => {
    assertSender(event, window)
    return await service.version(
      stringValue(workspaceId, 'workspaceId'),
      path === undefined ? undefined : stringValue(path, 'path'),
    )
  })
  return (): void => {
    ipcMain.removeHandler(ipcChannels.gitDiffList)
    ipcMain.removeHandler(ipcChannels.gitDiffRead)
    ipcMain.removeHandler(ipcChannels.gitDiffVersion)
  }
}
