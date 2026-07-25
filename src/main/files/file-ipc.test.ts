import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'

import type { FileDraft } from '../../shared/app-contract'
import { ipcChannels } from '../../shared/ipc-channels'
import { registerFileIpc } from './file-ipc'
import type { FileService } from './file-service'

type Handler = (event: IpcMainInvokeEvent, ...arguments_: unknown[]) => unknown
const { handlers, showMessageBox } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  showMessageBox: vi.fn<() => Promise<{ response: number }>>(),
}))

vi.mock('electron', () => ({
  dialog: { showMessageBox },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel)
    },
  },
}))

const draft: FileDraft = {
  content: 'draft',
  fingerprint: 'before',
  relativePath: 'note.txt',
  workspaceId: 'workspace-1',
}

const fixtures = () => {
  const mainFrame = {}
  const webContents = { mainFrame }
  const window = { webContents } as unknown as BrowserWindow
  const clearDraft = vi.fn<(workspaceId: string, relativePath: string) => void>()
  const listDirectory = vi.fn<() => Promise<[]>>(async () => [])
  const setDraft = vi.fn<(value: FileDraft) => Promise<void>>(async () => undefined)
  const service = {
    clearDraft,
    getDrafts: (): FileDraft[] => [draft],
    listDirectory,
    setDraft,
  } as unknown as FileService
  registerFileIpc({ service, window })
  return {
    clearDraft,
    listDirectory,
    setDraft,
    trusted: { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
  }
}

beforeEach((): void => {
  handlers.clear()
  showMessageBox.mockReset()
})

it('rejects file requests from any sender except the registered main frame', async (): Promise<void> => {
  fixtures()
  const handler = handlers.get(ipcChannels.fileListDirectory)
  if (!handler) throw new Error('List directory handler is missing')

  await expect(
    handler({ sender: {}, senderFrame: {} } as unknown as IpcMainInvokeEvent, 'workspace-1', '', false),
  ).rejects.toThrow(/Untrusted/)
})

it('validates inputs before invoking the privileged file service', async (): Promise<void> => {
  const { listDirectory, trusted } = fixtures()
  const handler = handlers.get(ipcChannels.fileListDirectory)
  if (!handler) throw new Error('List directory handler is missing')

  await expect(handler(trusted, 'workspace-1', '', 'false')).rejects.toThrow(/showIgnored is invalid/)
  expect(listDirectory).not.toHaveBeenCalled()
  await expect(handler(trusted, 'workspace-1', '', false)).resolves.toEqual([])
})

it('accepts file content larger than metadata fields within the editor byte limit', async (): Promise<void> => {
  const { setDraft, trusted } = fixtures()
  const handler = handlers.get(ipcChannels.fileSetDraft)
  if (!handler) throw new Error('Set draft handler is missing')
  const largeDraft = { ...draft, content: 'a'.repeat(8_192) }

  await expect(handler(trusted, largeDraft)).resolves.toBeUndefined()
  expect(setDraft).toHaveBeenCalledWith(largeDraft)
})

it('returns a typed discard result and clears the tracked draft', async (): Promise<void> => {
  showMessageBox.mockResolvedValueOnce({ response: 1 })
  const { clearDraft, trusted } = fixtures()
  const handler = handlers.get(ipcChannels.fileCloseLastView)
  if (!handler) throw new Error('Close view handler is missing')

  await expect(handler(trusted, 'workspace-1', 'note.txt')).resolves.toBe('discarded')
  expect(clearDraft).toHaveBeenCalledWith('workspace-1', 'note.txt')
})
