import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileDocumentSnapshot, FileDraft } from '../../../../shared/app-contract'
import { fileDocumentKey, useFileDocumentStore } from './file-document-store'

const initial: FileDocumentSnapshot = {
  content: 'before',
  fingerprint: 'fingerprint-before',
  relativePath: 'note.txt',
}

const installFilesBridge = () => {
  const read = vi.fn<(workspaceId: string, relativePath: string) => Promise<FileDocumentSnapshot>>()
  const setDraft = vi.fn<(draft: FileDraft) => Promise<void>>(async (): Promise<void> => undefined)
  const clearDraft = vi.fn<(workspaceId: string, relativePath: string) => Promise<void>>(
    async (): Promise<void> => undefined,
  )
  Object.defineProperty(window, 'lithe', {
    configurable: true,
    value: {
      files: {
        clearDraft,
        read,
        save: vi.fn<() => Promise<FileDocumentSnapshot>>(),
        setDraft,
      },
    },
  })
  return { clearDraft, read, setDraft }
}

describe('shared file document store', (): void => {
  beforeEach((): void => {
    useFileDocumentStore.setState({ documents: {} })
  })

  it('shares local edits and preserves them when the disk changes', async (): Promise<void> => {
    const files = installFilesBridge()
    files.read.mockResolvedValueOnce(initial)
    await useFileDocumentStore.getState().load('workspace-1', 'note.txt')

    useFileDocumentStore.getState().update('workspace-1', 'note.txt', 'local')
    expect(files.setDraft).toHaveBeenCalledWith({
      content: 'local',
      fingerprint: initial.fingerprint,
      relativePath: 'note.txt',
      workspaceId: 'workspace-1',
    })
    files.read.mockResolvedValueOnce({
      content: 'external',
      fingerprint: 'fingerprint-external',
      relativePath: 'note.txt',
    })
    await useFileDocumentStore.getState().handleExternalChange('workspace-1', 'note.txt')

    expect(useFileDocumentStore.getState().documents[fileDocumentKey('workspace-1', 'note.txt')]).toMatchObject({
      conflict: { content: 'external' },
      content: 'local',
      dirty: true,
    })
  })

  it('refreshes a clean document after an external change', async (): Promise<void> => {
    const files = installFilesBridge()
    files.read.mockResolvedValueOnce(initial).mockResolvedValueOnce({
      content: 'external',
      fingerprint: 'fingerprint-external',
      relativePath: 'note.txt',
    })
    await useFileDocumentStore.getState().load('workspace-1', 'note.txt')
    await useFileDocumentStore.getState().handleExternalChange('workspace-1', 'note.txt')

    expect(useFileDocumentStore.getState().documents[fileDocumentKey('workspace-1', 'note.txt')]).toMatchObject({
      conflict: null,
      content: 'external',
      dirty: false,
    })
  })

  it('forgets the shared document after its last view resolves the close decision', async (): Promise<void> => {
    const files = installFilesBridge()
    files.read.mockResolvedValueOnce(initial)
    await useFileDocumentStore.getState().load('workspace-1', 'note.txt')
    useFileDocumentStore.getState().update('workspace-1', 'note.txt', 'discarded draft')

    useFileDocumentStore.getState().close('workspace-1', 'note.txt')

    expect(useFileDocumentStore.getState().documents[fileDocumentKey('workspace-1', 'note.txt')]).toBeUndefined()
  })
})
