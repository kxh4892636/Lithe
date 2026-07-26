import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ipcChannels } from '../shared/ipc-channels'
import { createAppDatabase, type AppDatabase } from './database/app-database'
import type { PtyRuntime } from './terminal/pty-runtime'

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
import { registerTerminalIpc, removeTerminalIpc } from './terminal/terminal-ipc'
import { createWorkspaceLayoutPersistence } from './terminal/workspace-layout-persistence'

const temporaryDirectories: string[] = []
const openDatabases: AppDatabase[] = []

afterEach((): void => {
  removeIpcHandlers()
  removeTerminalIpc()
  vi.clearAllMocks()
  for (const database of openDatabases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('terminal IPC', (): void => {
  it('creates a PTY only inside the requested workspace', async (): Promise<void> => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-ipc-'))
    const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-project-'))
    const terminalDirectory = join(projectDirectory, 'nested')
    const outsideLink = join(projectDirectory, 'outside-link')
    mkdirSync(terminalDirectory)
    symlinkSync(userDataDirectory, outsideLink, 'junction')
    temporaryDirectories.push(userDataDirectory, projectDirectory)
    const database = createAppDatabase({ databasePath: join(userDataDirectory, 'lithe.db') })
    openDatabases.push(database)
    const createdAt = new Date('2026-07-25T00:00:00.000Z')
    database.projects.add(
      { createdAt, id: 'project-1', isValid: true, name: 'terminal', rootPath: projectDirectory },
      {
        createdAt,
        gitBranch: null,
        id: 'workspace-1',
        kind: 'default',
        name: '默认',
        projectId: 'project-1',
        rootPath: projectDirectory,
      },
    )
    const runtime: PtyRuntime = {
      close: vi.fn<(sessionId: string) => void>(),
      closeAll: vi.fn<() => Promise<void>>(async (): Promise<void> => undefined),
      create: vi.fn<PtyRuntime['create']>(),
      resize: vi.fn<PtyRuntime['resize']>(),
      write: vi.fn<PtyRuntime['write']>(),
    }
    const webContents = { mainFrame: {} }
    const window = { webContents } as unknown as BrowserWindow
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent
    registerTerminalIpc({
      database,
      detectShells: async (): Promise<string[]> => ['pwsh.exe', 'cmd.exe'],
      runtime,
      window,
      workspaceLayouts: createWorkspaceLayoutPersistence(database.workspaceLayouts),
    })
    const createTerminal = electronMocks.handlers.get(ipcChannels.createTerminal)
    const saveWorkspaceLayout = electronMocks.handlers.get(ipcChannels.saveWorkspaceLayout)
    const setDefaultShell = electronMocks.handlers.get(ipcChannels.setDefaultShell)
    if (!createTerminal) throw new Error('终端创建 IPC 未注册')

    const session = await createTerminal(event, {
      columns: 80,
      cwd: terminalDirectory,
      panelId: 'panel-1',
      rows: 24,
      shell: 'cmd.exe',
      workspaceId: 'workspace-1',
    })

    expect(runtime.create).toHaveBeenCalledWith({
      columns: 80,
      cwd: terminalDirectory,
      rows: 24,
      sessionId: 'panel-1',
      shell: 'cmd.exe',
    })
    expect(session).toEqual({ cwd: terminalDirectory, panelId: 'panel-1', shell: 'cmd.exe' })
    const isolatedSession = await createTerminal(event, {
      columns: 80,
      cwd: userDataDirectory,
      panelId: 'panel-2',
      rows: 24,
      workspaceId: 'workspace-1',
    })
    expect(runtime.create).toHaveBeenLastCalledWith({
      columns: 80,
      cwd: projectDirectory,
      rows: 24,
      sessionId: 'panel-2',
      shell: 'pwsh.exe',
    })
    expect(isolatedSession).toEqual({ cwd: projectDirectory, panelId: 'panel-2', shell: 'pwsh.exe' })
    const linkedSession = await createTerminal(event, {
      columns: 80,
      cwd: outsideLink,
      panelId: 'panel-3',
      rows: 24,
      workspaceId: 'workspace-1',
    })
    expect(linkedSession).toEqual({ cwd: projectDirectory, panelId: 'panel-3', shell: 'pwsh.exe' })
    await expect(
      createTerminal(event, { columns: '80', panelId: 'invalid', rows: 24, workspaceId: 'workspace-1' }),
    ).rejects.toThrow('expected number')
    await expect(setDefaultShell?.(event, 'missing.exe')).rejects.toThrow('Shell 不可用')
    expect(() =>
      saveWorkspaceLayout?.(event, 'workspace-1', {
        layout: { oversized: 'x'.repeat(2_097_152) },
        version: 1,
      }),
    ).toThrow('无效工作区布局')
  })
})

describe('project IPC', (): void => {
  it('reports whether the native window is arranged by Windows Snap', (): void => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-window-ipc-'))
    temporaryDirectories.push(userDataDirectory)
    const database = createAppDatabase({ databasePath: join(userDataDirectory, 'lithe.db') })
    openDatabases.push(database)
    const webContents = { mainFrame: {} }
    const window = { snapped: true, webContents } as unknown as BrowserWindow
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent

    registerIpcHandlers({ database, window })

    const getWindowSnapped = electronMocks.handlers.get(ipcChannels.getWindowSnapped)
    expect(getWindowSnapped?.(event)).toBe(true)
  })

  it('toggles the native window maximized state', (): void => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-window-toggle-ipc-'))
    temporaryDirectories.push(userDataDirectory)
    const database = createAppDatabase({ databasePath: join(userDataDirectory, 'lithe.db') })
    openDatabases.push(database)
    const webContents = { mainFrame: {} }
    const maximize = vi.fn<() => void>()
    const unmaximize = vi.fn<() => void>()
    const window = {
      isMaximized: vi.fn<() => boolean>(() => false),
      maximize,
      unmaximize,
      webContents,
    } as unknown as BrowserWindow
    const event = { sender: webContents, senderFrame: webContents.mainFrame } as unknown as IpcMainInvokeEvent

    registerIpcHandlers({ database, window })

    const toggleWindowMaximized = electronMocks.handlers.get(ipcChannels.toggleWindowMaximized)
    expect(toggleWindowMaximized?.(event)).toBe(true)
    expect(maximize).toHaveBeenCalledOnce()
    expect(unmaximize).not.toHaveBeenCalled()
  })

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
