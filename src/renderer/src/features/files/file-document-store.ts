import { create } from 'zustand'

import type { FileDocumentSnapshot } from '../../../../shared/app-contract'

export interface FileDocument extends FileDocumentSnapshot {
  conflict: FileDocumentSnapshot | null
  dirty: boolean
  error: string | null
  savedContent: string
  workspaceId: string
}

interface FileDocumentState {
  documents: Record<string, FileDocument>
  acceptDisk: (workspaceId: string, relativePath: string) => void
  close: (workspaceId: string, relativePath: string) => void
  handleExternalChange: (workspaceId: string, relativePath: string) => Promise<void>
  load: (workspaceId: string, relativePath: string) => Promise<void>
  save: (workspaceId: string, relativePath: string, force?: boolean) => Promise<void>
  update: (workspaceId: string, relativePath: string, content: string) => void
}

export const fileDocumentKey = (workspaceId: string, relativePath: string): string => `${workspaceId}\0${relativePath}`

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const withDocument = (
  documents: Record<string, FileDocument>,
  key: string,
  update: (document: FileDocument) => FileDocument,
): Record<string, FileDocument> => {
  const document = documents[key]
  return document ? { ...documents, [key]: update(document) } : documents
}

export const useFileDocumentStore = create<FileDocumentState>((set, get) => ({
  acceptDisk: (workspaceId, relativePath): void => {
    const key = fileDocumentKey(workspaceId, relativePath)
    set((state) => ({
      documents: withDocument(
        state.documents,
        key,
        (document): FileDocument =>
          document.conflict
            ? {
                ...document,
                ...document.conflict,
                conflict: null,
                dirty: false,
                error: null,
                savedContent: document.conflict.content,
              }
            : document,
      ),
    }))
    void window.lithe.files.clearDraft(workspaceId, relativePath)
  },
  close: (workspaceId, relativePath): void => {
    const key = fileDocumentKey(workspaceId, relativePath)
    set((state) => {
      const documents = { ...state.documents }
      delete documents[key]
      return { documents }
    })
  },
  documents: {},
  handleExternalChange: async (workspaceId, relativePath): Promise<void> => {
    const key = fileDocumentKey(workspaceId, relativePath)
    const current = get().documents[key]
    if (!current) return
    try {
      const disk = await window.lithe.files.read(workspaceId, relativePath)
      if (disk.fingerprint === current.fingerprint) return
      const matchesLocal = current.dirty && disk.content === current.content
      set((state) => ({
        documents: withDocument(
          state.documents,
          key,
          (document): FileDocument =>
            document.dirty && !matchesLocal
              ? { ...document, conflict: disk }
              : { ...document, ...disk, conflict: null, dirty: false, error: null, savedContent: disk.content },
        ),
      }))
      if (matchesLocal) await window.lithe.files.clearDraft(workspaceId, relativePath)
    } catch (error: unknown) {
      set((state) => ({
        documents: withDocument(
          state.documents,
          key,
          (document): FileDocument => ({
            ...document,
            error: errorMessage(error),
          }),
        ),
      }))
    }
  },
  load: async (workspaceId, relativePath): Promise<void> => {
    const key = fileDocumentKey(workspaceId, relativePath)
    if (get().documents[key]) return
    const snapshot = await window.lithe.files.read(workspaceId, relativePath)
    set((state) => ({
      documents: {
        ...state.documents,
        [key]: {
          ...snapshot,
          conflict: null,
          dirty: false,
          error: null,
          savedContent: snapshot.content,
          workspaceId,
        },
      },
    }))
  },
  save: async (workspaceId, relativePath, force = false): Promise<void> => {
    const key = fileDocumentKey(workspaceId, relativePath)
    const document = get().documents[key]
    if (!document) return
    try {
      const saved = await window.lithe.files.save(
        workspaceId,
        relativePath,
        document.content,
        document.fingerprint,
        force,
      )
      set((state) => ({
        documents: withDocument(
          state.documents,
          key,
          (current): FileDocument => ({
            ...current,
            ...saved,
            conflict: null,
            dirty: false,
            error: null,
            savedContent: saved.content,
          }),
        ),
      }))
    } catch (error: unknown) {
      set((state) => ({
        documents: withDocument(
          state.documents,
          key,
          (current): FileDocument => ({
            ...current,
            conflict: current.conflict,
            error: errorMessage(error),
          }),
        ),
      }))
      throw error
    }
  },
  update: (workspaceId, relativePath, content): void => {
    const key = fileDocumentKey(workspaceId, relativePath)
    set((state) => ({
      documents: withDocument(
        state.documents,
        key,
        (document): FileDocument => ({
          ...document,
          content,
          dirty: content !== document.savedContent,
          error: null,
        }),
      ),
    }))
    const document = get().documents[key]
    if (document?.dirty) {
      void window.lithe.files.setDraft({
        content: document.content,
        fingerprint: document.fingerprint,
        relativePath,
        workspaceId,
      })
    } else {
      void window.lithe.files.clearDraft(workspaceId, relativePath)
    }
  },
}))
