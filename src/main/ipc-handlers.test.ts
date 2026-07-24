import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '../shared/ipc-channels'
import { createAppDatabase, type AppDatabase } from './database/app-database'

type InvokeHandler = (event: IpcMainInvokeEvent, ...arguments_: unknown[]) => unknown

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, InvokeHandler>()
  return {
    handlers,
    showOpenDialog: vi.fn<(...arguments_: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>>(),
    handle: vi.fn<(channel: string, handler: InvokeHandler) => void>((channel, handler): void => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn<(channel: string) => void>((channel): void => {
      handlers.delete(channel)
    }),
  }
})

vi.mock('electron', () => ({
  app: { getVersion: (): string => '1.0.0' },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler,
  },
}))

import { registerIpcHandlers, removeIpcHandlers } from './ipc-handlers'

const temporaryDirectories: string[] = []
const openDatabases: AppDatabase[] = []

afterEach((): void => {
  removeIpcHandlers()
  vi.clearAllMocks()
  for (const database of openDatabases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('project IPC', (): void => {
  it('adds a selected directory through the trusted narrow channel', async (): Promise<void> => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-ipc-'))
    const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-ipc-project-'))
    temporaryDirectories.push(userDataDirectory, projectDirectory)
    const database = createAppDatabase({ databasePath: join(userDataDirectory, 'lithe.db') })
    openDatabases.push(database)
    const webContents = { mainFrame: {} }
    const window = { webContents } as unknown as BrowserWindow
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [projectDirectory] })
    registerIpcHandlers({ database, window })

    const addProject = electronMocks.handlers.get(ipcChannels.addProjectDirectory)
    const getNavigation = electronMocks.handlers.get(ipcChannels.getWorkspaceNavigation)
    expect(addProject).toBeDefined()
    expect(getNavigation).toBeDefined()

    await addProject?.(event)
    const navigation = await getNavigation?.(event)

    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ properties: expect.arrayContaining(['openDirectory', 'createDirectory']) }),
    )
    expect(navigation).toMatchObject({
      activeWorkspaceId: expect.any(String),
      projects: [{ rootPath: projectDirectory, workspaces: [{ name: '默认', rootPath: projectDirectory }] }],
    })
  })

  it('rejects project requests from an untrusted sender', async (): Promise<void> => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-ipc-'))
    temporaryDirectories.push(userDataDirectory)
    const database = createAppDatabase({ databasePath: join(userDataDirectory, 'lithe.db') })
    openDatabases.push(database)
    const webContents = { mainFrame: {} }
    registerIpcHandlers({ database, window: { webContents } as unknown as BrowserWindow })
    const getNavigation = electronMocks.handlers.get(ipcChannels.getWorkspaceNavigation)
    const event = { sender: {}, senderFrame: {} } as unknown as IpcMainInvokeEvent

    expect(() => getNavigation?.(event)).toThrow('拒绝来自非主窗口的 IPC 请求')
  })
})
