import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import type { FileCloseResult, FileDraft } from '../../shared/app-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import { fileContentMaxBytes, type FileService } from './file-service'

interface FileIpcOptions {
  service: FileService
  window: BrowserWindow
}

const assertSender = (event: IpcMainInvokeEvent, window: BrowserWindow): void => {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new TypeError('Untrusted file IPC sender')
  }
}

const stringValue = (value: unknown, name: string, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value) || value.length > 4_096) {
    throw new TypeError(`${name} is invalid`)
  }
  return value
}

const contentValue = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > fileContentMaxBytes) {
    throw new TypeError(`${name} is invalid`)
  }
  return value
}

const booleanValue = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new TypeError(`${name} is invalid`)
  return value
}

const draftValue = (value: unknown): FileDraft => {
  if (!value || typeof value !== 'object') throw new TypeError('Draft is invalid')
  const draft = value as Partial<FileDraft>
  const content = contentValue(draft.content, 'content')
  return {
    content,
    fingerprint: stringValue(draft.fingerprint, 'fingerprint'),
    relativePath: stringValue(draft.relativePath, 'relativePath'),
    workspaceId: stringValue(draft.workspaceId, 'workspaceId'),
  }
}

const dirtyDraft = (service: FileService, workspaceId: string, relativePath: string): FileDraft | undefined =>
  service
    .getDrafts()
    .find((candidate): boolean => candidate.workspaceId === workspaceId && candidate.relativePath === relativePath)

const closeLastView = async (
  service: FileService,
  window: BrowserWindow,
  workspaceId: string,
  relativePath: string,
): Promise<FileCloseResult> => {
  const draft = dirtyDraft(service, workspaceId, relativePath)
  if (!draft) return 'discarded'
  const result = await dialog.showMessageBox(window, {
    buttons: ['取消', '不保存', '保存'],
    cancelId: 0,
    defaultId: 2,
    message: `保存对“${relativePath}”的更改吗？`,
    title: '未保存的文件',
    type: 'question',
  })
  if (result.response === 0) return 'cancel'
  if (result.response === 1) {
    service.clearDraft(workspaceId, relativePath)
    return 'discarded'
  }
  try {
    await service.save(workspaceId, relativePath, draft.content, draft.fingerprint)
    return 'saved'
  } catch (error: unknown) {
    await dialog.showMessageBox(window, {
      detail: error instanceof Error ? error.message : String(error),
      message: '文件保存失败，面板保持打开。',
      title: '无法保存文件',
      type: 'error',
    })
    return 'cancel'
  }
}

const registerReadHandlers = ({ service, window }: FileIpcOptions): void => {
  ipcMain.handle(
    ipcChannels.fileListDirectory,
    async (event, workspaceId: unknown, relativeDirectory: unknown, showIgnored: unknown) => {
      assertSender(event, window)
      return await service.listDirectory(
        stringValue(workspaceId, 'workspaceId'),
        stringValue(relativeDirectory, 'relativeDirectory', true),
        booleanValue(showIgnored, 'showIgnored'),
      )
    },
  )
  ipcMain.handle(ipcChannels.fileRead, async (event, workspaceId: unknown, relativePath: unknown) => {
    assertSender(event, window)
    return await service.read(stringValue(workspaceId, 'workspaceId'), stringValue(relativePath, 'relativePath'))
  })
  ipcMain.handle(ipcChannels.fileWatch, async (event, workspaceId: unknown): Promise<void> => {
    assertSender(event, window)
    await service.watch(stringValue(workspaceId, 'workspaceId'))
  })
}

const registerWriteHandlers = ({ service, window }: FileIpcOptions): void => {
  ipcMain.handle(
    ipcChannels.fileSave,
    async (
      event,
      workspaceId: unknown,
      relativePath: unknown,
      content: unknown,
      fingerprint: unknown,
      force: unknown = false,
    ) => {
      assertSender(event, window)
      return await service.save(
        stringValue(workspaceId, 'workspaceId'),
        stringValue(relativePath, 'relativePath'),
        contentValue(content, 'content'),
        stringValue(fingerprint, 'fingerprint'),
        booleanValue(force, 'force'),
      )
    },
  )
  ipcMain.handle(ipcChannels.fileSetDraft, async (event, draft: unknown): Promise<void> => {
    assertSender(event, window)
    await service.setDraft(draftValue(draft))
  })
  ipcMain.handle(ipcChannels.fileClearDraft, (event, workspaceId: unknown, relativePath: unknown): void => {
    assertSender(event, window)
    service.clearDraft(stringValue(workspaceId, 'workspaceId'), stringValue(relativePath, 'relativePath'))
  })
  ipcMain.handle(ipcChannels.fileCloseLastView, (event, workspaceId: unknown, relativePath: unknown) => {
    assertSender(event, window)
    return closeLastView(
      service,
      window,
      stringValue(workspaceId, 'workspaceId'),
      stringValue(relativePath, 'relativePath'),
    )
  })
}

export const registerFileIpc = (options: FileIpcOptions): (() => void) => {
  registerReadHandlers(options)
  registerWriteHandlers(options)
  return (): void => {
    for (const channel of [
      ipcChannels.fileListDirectory,
      ipcChannels.fileRead,
      ipcChannels.fileSave,
      ipcChannels.fileSetDraft,
      ipcChannels.fileClearDraft,
      ipcChannels.fileWatch,
      ipcChannels.fileCloseLastView,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
