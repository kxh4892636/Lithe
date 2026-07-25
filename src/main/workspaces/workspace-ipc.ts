import { type BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'

import type {
  ProjectRemovalPreview,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceCreatePreview,
  WorkspaceDeletePreview,
} from '../../shared/app-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import type { WorktreeService } from './worktree-service'

interface RegisterWorkspaceIpcOptions {
  forgetInvalidProject: (projectId: string, confirmation: string) => Promise<boolean>
  window: BrowserWindow
  worktrees: WorktreeService
}

const assertTrustedSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('拒绝来自非主窗口的 IPC 请求')
  }
}

const identifier = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value
  throw new TypeError('无效的标识')
}

const optionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value === 'string' && value.length <= 256) return value
  throw new TypeError(`无效的 ${name}`)
}

const createInput = (value: unknown): WorkspaceCreateInput => {
  if (!value || typeof value !== 'object') throw new TypeError('无效的工作区创建参数')
  const input = value as Record<string, unknown>
  return {
    existingBranch: optionalString(input.existingBranch, 'existingBranch'),
    from: optionalString(input.from, 'from'),
    name: optionalString(input.name, 'name'),
    newBranch: optionalString(input.newBranch, 'newBranch'),
    projectId: identifier(input.projectId),
  }
}

const confirmations = (value: unknown): Record<string, string> => {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('无效的分支确认参数')
  return Object.fromEntries(
    Object.entries(value).map(([key, confirmation]): [string, string] => [
      identifier(key),
      optionalString(confirmation, 'branchConfirmation') ?? '',
    ]),
  )
}

const registerWorkspaceCreationIpc = (options: RegisterWorkspaceIpcOptions): void => {
  ipcMain.handle(ipcChannels.previewWorkspaceCreate, async (event, value: unknown): Promise<WorkspaceCreatePreview> => {
    assertTrustedSender(event, options.window)
    return await options.worktrees.previewCreate(createInput(value))
  })
  ipcMain.handle(
    ipcChannels.createWorkspace,
    async (event, value: unknown, confirmedDirtyFingerprint: unknown): Promise<Workspace | null> => {
      assertTrustedSender(event, options.window)
      const input = createInput(value)
      const preview = await options.worktrees.previewCreate(input)
      if (
        preview.dirtyPaths.length > 0 &&
        optionalString(confirmedDirtyFingerprint, 'confirmedDirtyFingerprint') !== preview.dirtyFingerprint
      ) {
        return null
      }
      const created = await options.worktrees.create(
        input,
        preview.dirtyPaths.length > 0 ? preview.dirtyFingerprint : undefined,
      )
      options.window.webContents.send(ipcChannels.workspaceNavigationChanged)
      return created
    },
  )
}

export const registerWorkspaceIpc = ({
  forgetInvalidProject,
  window,
  worktrees,
}: RegisterWorkspaceIpcOptions): void => {
  registerWorkspaceCreationIpc({ forgetInvalidProject, window, worktrees })
  ipcMain.handle(
    ipcChannels.previewWorkspaceDelete,
    async (event, workspaceId: unknown): Promise<WorkspaceDeletePreview> => {
      assertTrustedSender(event, window)
      return await worktrees.previewDelete(identifier(workspaceId))
    },
  )
  ipcMain.handle(
    ipcChannels.deleteWorkspace,
    async (event, workspaceId: unknown, branchConfirmation: unknown): Promise<boolean> => {
      assertTrustedSender(event, window)
      const id = identifier(workspaceId)
      const preview = await worktrees.previewDelete(id)
      const result = await dialog.showMessageBox(window, {
        buttons: ['取消', '删除工作区'],
        cancelId: 0,
        defaultId: 0,
        detail: `将删除托管目录和分支 ${preview.branch}，此操作不可撤销。`,
        message: `删除工作区“${preview.workspace.name}”？`,
        title: '确认删除工作区',
        type: 'warning',
      })
      if (result.response !== 1) return false
      await worktrees.delete(id, optionalString(branchConfirmation, 'branchConfirmation'))
      window.webContents.send(ipcChannels.workspaceNavigationChanged)
      return true
    },
  )
  ipcMain.handle(ipcChannels.renameWorkspace, (event, workspaceId: unknown, name: unknown): Workspace => {
    assertTrustedSender(event, window)
    const renamed = worktrees.rename(identifier(workspaceId), optionalString(name, 'name') ?? '')
    window.webContents.send(ipcChannels.workspaceNavigationChanged)
    return renamed
  })
  ipcMain.handle(
    ipcChannels.previewProjectRemoval,
    async (event, projectId: unknown): Promise<ProjectRemovalPreview> => {
      assertTrustedSender(event, window)
      return await worktrees.previewProjectRemoval(identifier(projectId))
    },
  )
  ipcMain.handle(
    ipcChannels.removeProject,
    async (event, projectId: unknown, branchConfirmations: unknown): Promise<boolean> => {
      assertTrustedSender(event, window)
      const id = identifier(projectId)
      const preview = await worktrees.previewProjectRemoval(id)
      const result = await dialog.showMessageBox(window, {
        buttons: ['取消', '移除项目'],
        cancelId: 0,
        defaultId: 0,
        detail: '项目根目录会保留；Lithe 托管的派生工作区目录及其分支会被删除。',
        message: `移除项目“${preview.project.name}”？`,
        title: '确认移除项目',
        type: 'warning',
      })
      if (result.response !== 1) return false
      await worktrees.removeProject(id, confirmations(branchConfirmations))
      window.webContents.send(ipcChannels.workspaceNavigationChanged)
      return true
    },
  )
  ipcMain.handle(
    ipcChannels.forgetInvalidProject,
    async (event, projectId: unknown, confirmation: unknown): Promise<boolean> => {
      assertTrustedSender(event, window)
      const removed = await forgetInvalidProject(
        identifier(projectId),
        optionalString(confirmation, 'confirmation') ?? '',
      )
      if (removed) window.webContents.send(ipcChannels.workspaceNavigationChanged)
      return removed
    },
  )
}

export const removeWorkspaceIpc = (): void => {
  ipcMain.removeHandler(ipcChannels.forgetInvalidProject)
  ipcMain.removeHandler(ipcChannels.previewProjectRemoval)
  ipcMain.removeHandler(ipcChannels.removeProject)
  ipcMain.removeHandler(ipcChannels.createWorkspace)
  ipcMain.removeHandler(ipcChannels.deleteWorkspace)
  ipcMain.removeHandler(ipcChannels.previewWorkspaceCreate)
  ipcMain.removeHandler(ipcChannels.previewWorkspaceDelete)
  ipcMain.removeHandler(ipcChannels.renameWorkspace)
}
