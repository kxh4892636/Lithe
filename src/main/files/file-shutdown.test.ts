import { beforeEach, expect, it, vi } from 'vitest'

import type { FileDraft } from '../../shared/app-contract'
import type { FileService } from './file-service'
import { commitDiscardedDrafts, prepareDirtyFilesBeforeQuit } from './file-shutdown'

const { showMessageBox } = vi.hoisted(() => ({
  showMessageBox: vi.fn<() => Promise<{ response: number }>>(),
}))

vi.mock('electron', () => ({
  dialog: { showMessageBox },
}))

const draft: FileDraft = {
  content: 'local',
  fingerprint: 'before',
  relativePath: 'note.txt',
  workspaceId: 'workspace-1',
}

const serviceFixture = (): {
  clearDraft: ReturnType<typeof vi.fn<(workspaceId: string, relativePath: string) => void>>
  save: ReturnType<typeof vi.fn<() => Promise<{ content: string; fingerprint: string; relativePath: string }>>>
  service: FileService
} => {
  const clearDraft = vi.fn<(workspaceId: string, relativePath: string) => void>()
  const save = vi.fn<() => Promise<{ content: string; fingerprint: string; relativePath: string }>>(async () => ({
    content: draft.content,
    fingerprint: 'saved',
    relativePath: draft.relativePath,
  }))
  const service = {
    clearDraft,
    getDrafts: (): FileDraft[] => [draft],
    save,
  } as unknown as FileService
  return { clearDraft, save, service }
}

beforeEach((): void => {
  showMessageBox.mockReset()
})

it('defers discard until later shutdown gates have succeeded', async (): Promise<void> => {
  showMessageBox.mockResolvedValueOnce({ response: 1 })
  const { clearDraft, service } = serviceFixture()

  const decision = await prepareDirtyFilesBeforeQuit(service, undefined)

  expect(decision).toEqual({
    discard: [{ relativePath: 'note.txt', workspaceId: 'workspace-1' }],
    proceed: true,
  })
  expect(clearDraft).not.toHaveBeenCalled()
  commitDiscardedDrafts(service, decision)
  expect(clearDraft).toHaveBeenCalledWith('workspace-1', 'note.txt')
})

it('keeps drafts when the user cancels quitting', async (): Promise<void> => {
  showMessageBox.mockResolvedValueOnce({ response: 0 })
  const { clearDraft, service } = serviceFixture()

  await expect(prepareDirtyFilesBeforeQuit(service, undefined)).resolves.toEqual({ discard: [], proceed: false })
  expect(clearDraft).not.toHaveBeenCalled()
})

it('saves every draft before allowing quit when the user chooses save', async (): Promise<void> => {
  showMessageBox.mockResolvedValueOnce({ response: 2 })
  const { save, service } = serviceFixture()

  await expect(prepareDirtyFilesBeforeQuit(service, undefined)).resolves.toEqual({ discard: [], proceed: true })
  expect(save).toHaveBeenCalledWith('workspace-1', 'note.txt', 'local', 'before')
})
