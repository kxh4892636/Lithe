import type { WorkspaceLayoutSnapshot } from '../../shared/app-contract'
import type { WorkspaceLayoutRepository } from '../database/repositories'

export interface WorkspaceLayoutPersistence {
  flushAll: (retryFailures?: boolean) => void
  get: (workspaceId: string) => WorkspaceLayoutSnapshot | undefined
  schedule: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot) => void
}

export const createWorkspaceLayoutPersistence = (
  repository: WorkspaceLayoutRepository,
  delay = 250,
  onError: (workspaceId: string, error: unknown) => void = (workspaceId, error): void => {
    globalThis.console.error(`Lithe workspace layout persistence failed for ${workspaceId}`, error)
  },
): WorkspaceLayoutPersistence => {
  const pending = new Map<string, WorkspaceLayoutSnapshot>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flushAll = (retryFailures = true): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
    for (const [workspaceId, snapshot] of pending) {
      try {
        repository.save(workspaceId, snapshot)
        pending.delete(workspaceId)
      } catch (error: unknown) {
        onError(workspaceId, error)
      }
    }
    if (retryFailures && pending.size > 0) {
      timer = setTimeout((): void => flushAll(true), delay)
    }
  }

  return {
    flushAll,
    get: (workspaceId: string): WorkspaceLayoutSnapshot | undefined =>
      pending.get(workspaceId) ?? repository.get(workspaceId),
    schedule: (workspaceId: string, snapshot: WorkspaceLayoutSnapshot): void => {
      pending.set(workspaceId, snapshot)
      if (timer) return
      timer = setTimeout(flushAll, delay)
    },
  }
}
