import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

import type { TerminalSession, WorkspaceLayoutSnapshot } from '../../shared/app-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import { parseTerminalCreateRequest } from '../../shared/terminal-schema'
import { parseWorkspaceLayoutSnapshot } from '../../shared/workspace-layout-schema'
import type { AppDatabase } from '../database/app-database'
import type { PtyRuntime } from './pty-runtime'
import { detectSystemShells } from './shell-detector'
import type { WorkspaceLayoutPersistence } from './workspace-layout-persistence'

interface RegisterTerminalIpcOptions {
  database: AppDatabase
  detectShells?: () => Promise<string[]>
  runtime: PtyRuntime
  window: BrowserWindow
  workspaceLayouts: WorkspaceLayoutPersistence
}

const assertTrustedSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('拒绝来自非主窗口的 IPC 请求')
  }
}

const assertIdentifier = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  throw new TypeError('无效标识')
}

const assertDimensions = (columns: unknown, rows: unknown): { columns: number; rows: number } => {
  if (
    typeof columns !== 'number' ||
    typeof rows !== 'number' ||
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    columns > 1_000 ||
    rows < 1 ||
    rows > 500
  ) {
    throw new TypeError('无效终端尺寸')
  }
  return { columns, rows }
}

const assertLayout = (value: unknown): WorkspaceLayoutSnapshot => {
  try {
    return parseWorkspaceLayoutSnapshot(value)
  } catch (error: unknown) {
    globalThis.console.error('Lithe workspace layout validation failed', error)
    throw new TypeError('无效工作区布局')
  }
}

const resolveDefaultShell = async (database: AppDatabase, detectShells: () => Promise<string[]>): Promise<string> => {
  const detected = await detectShells()
  const saved = database.preferences.getDefaultShell()
  if (saved && detected.includes(saved)) return saved
  const [fallback] = detected
  if (!fallback) throw new Error('未检测到可用 Shell')
  database.preferences.setDefaultShell(fallback)
  return fallback
}

const resolveTerminalShell = async (
  requested: string | undefined,
  database: AppDatabase,
  detectShells: () => Promise<string[]>,
): Promise<string> => {
  if (requested && (await detectShells()).includes(requested)) return requested
  return await resolveDefaultShell(database, detectShells)
}

const resolveTerminalCwd = async (requested: string | undefined, workspaceRoot: string): Promise<string> => {
  const canonicalRoot = await realpath(workspaceRoot)
  if (!requested) return canonicalRoot
  try {
    const canonicalRequested = await realpath(requested)
    const pathFromRoot = relative(canonicalRoot, canonicalRequested)
    const isInsideRoot =
      pathFromRoot === '' ||
      (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
    return isInsideRoot ? canonicalRequested : canonicalRoot
  } catch (error: unknown) {
    const code = (error as { code?: unknown }).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return canonicalRoot
    globalThis.console.error('Lithe terminal cwd resolution failed', error)
    throw error
  }
}

export const registerTerminalIpc = ({
  database,
  detectShells = detectSystemShells,
  runtime,
  window,
  workspaceLayouts,
}: RegisterTerminalIpcOptions): void => {
  ipcMain.handle(ipcChannels.listShells, async (event): Promise<string[]> => {
    assertTrustedSender(event, window)
    return await detectShells()
  })
  ipcMain.handle(ipcChannels.getDefaultShell, async (event): Promise<string> => {
    assertTrustedSender(event, window)
    return await resolveDefaultShell(database, detectShells)
  })
  ipcMain.handle(ipcChannels.setDefaultShell, async (event, value: unknown): Promise<void> => {
    assertTrustedSender(event, window)
    const shell = assertIdentifier(value)
    if (!(await detectShells()).includes(shell)) throw new TypeError('Shell 不可用')
    database.preferences.setDefaultShell(shell)
  })
  ipcMain.handle(ipcChannels.createTerminal, async (event, value: unknown): Promise<TerminalSession> => {
    assertTrustedSender(event, window)
    const request = parseTerminalCreateRequest(value)
    const workspace = database.projects.getWorkspace(request.workspaceId)
    if (!workspace) throw new TypeError('工作区不存在')
    const cwd = await resolveTerminalCwd(request.cwd, workspace.rootPath)
    const shell = await resolveTerminalShell(request.shell, database, detectShells)
    runtime.create({ columns: request.columns, cwd, rows: request.rows, sessionId: request.panelId, shell })
    return { cwd, panelId: request.panelId, shell }
  })
  ipcMain.handle(ipcChannels.writeTerminal, (event, panelId: unknown, data: unknown): void => {
    assertTrustedSender(event, window)
    if (typeof data !== 'string' || data.length > 1_048_576) throw new TypeError('无效终端输入')
    runtime.write(assertIdentifier(panelId), data)
  })
  ipcMain.handle(ipcChannels.resizeTerminal, (event, panelId: unknown, columns: unknown, rows: unknown): void => {
    assertTrustedSender(event, window)
    const dimensions = assertDimensions(columns, rows)
    runtime.resize(assertIdentifier(panelId), dimensions.columns, dimensions.rows)
  })
  ipcMain.handle(ipcChannels.closeTerminal, (event, panelId: unknown): void => {
    assertTrustedSender(event, window)
    runtime.close(assertIdentifier(panelId))
  })
  ipcMain.handle(ipcChannels.getWorkspaceLayout, (event, workspaceId: unknown): WorkspaceLayoutSnapshot | null => {
    assertTrustedSender(event, window)
    return workspaceLayouts.get(assertIdentifier(workspaceId)) ?? null
  })
  ipcMain.handle(ipcChannels.saveWorkspaceLayout, (event, workspaceId: unknown, snapshot: unknown): void => {
    assertTrustedSender(event, window)
    const id = assertIdentifier(workspaceId)
    if (!database.projects.getWorkspace(id)) throw new TypeError('工作区不存在')
    workspaceLayouts.schedule(id, assertLayout(snapshot))
  })
}

export const removeTerminalIpc = (): void => {
  for (const channel of [
    ipcChannels.listShells,
    ipcChannels.getDefaultShell,
    ipcChannels.setDefaultShell,
    ipcChannels.createTerminal,
    ipcChannels.writeTerminal,
    ipcChannels.resizeTerminal,
    ipcChannels.closeTerminal,
    ipcChannels.getWorkspaceLayout,
    ipcChannels.saveWorkspaceLayout,
  ]) {
    ipcMain.removeHandler(channel)
  }
}
