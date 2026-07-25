import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'

import { ipcChannels } from '../../shared/ipc-channels'
import { registerGitDiffIpc } from './git-diff-ipc'
import type { GitDiffService } from './git-diff-service'

type Handler = (event: IpcMainInvokeEvent, ...arguments_: unknown[]) => unknown
const handlers = vi.hoisted(() => new Map<string, Handler>())

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel)
    },
  },
}))

const fixture = () => {
  const mainFrame = {}
  const webContents = { mainFrame }
  const window = { webContents } as unknown as BrowserWindow
  const list = vi.fn<GitDiffService['list']>(async () => ({ changes: [], isRepository: true }))
  const read = vi.fn<GitDiffService['read']>()
  registerGitDiffIpc({ service: { list, read } as unknown as GitDiffService, window })
  return {
    list,
    read,
    trusted: { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
  }
}

beforeEach((): void => handlers.clear())

it('rejects untrusted senders and invalid change kinds before reading Git', async (): Promise<void> => {
  const { read, trusted } = fixture()
  const listHandler = handlers.get(ipcChannels.gitDiffList)
  const readHandler = handlers.get(ipcChannels.gitDiffRead)
  if (!listHandler || !readHandler) throw new Error('Git diff handlers are missing')

  await expect(listHandler({ sender: {}, senderFrame: {} } as IpcMainInvokeEvent, 'workspace-1')).rejects.toThrow(
    /Untrusted/,
  )
  await expect(readHandler(trusted, 'workspace-1', 'branch', 'file.txt')).rejects.toThrow(/kind is invalid/)
  expect(read).not.toHaveBeenCalled()
})
