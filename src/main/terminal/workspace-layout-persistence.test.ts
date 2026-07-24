import { describe, expect, it, vi } from 'vitest'

import type { WorkspaceLayoutSnapshot } from '../../shared/app-contract'
import type { WorkspaceLayoutRepository } from '../database/repositories'
import { createWorkspaceLayoutPersistence } from './workspace-layout-persistence'

describe('workspace layout persistence', (): void => {
  it('coalesces writes and synchronously flushes the latest layout on shutdown', (): void => {
    vi.useFakeTimers()
    const save = vi.fn<WorkspaceLayoutRepository['save']>()
    const repository: WorkspaceLayoutRepository = { get: (): undefined => undefined, save }
    const persistence = createWorkspaceLayoutPersistence(repository)
    const first = { layout: { revision: 1 }, version: 1 } as unknown as WorkspaceLayoutSnapshot
    const latest = { layout: { revision: 2 }, version: 1 } as unknown as WorkspaceLayoutSnapshot

    persistence.schedule('workspace-1', first)
    persistence.schedule('workspace-1', latest)
    expect(persistence.get('workspace-1')).toBe(latest)
    persistence.flushAll()

    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('workspace-1', latest)
    vi.useRealTimers()
  })

  it('logs one failed workspace, continues others, and retains it for retry', (): void => {
    vi.useFakeTimers()
    const failed = { layout: { revision: 1 }, version: 1 } as unknown as WorkspaceLayoutSnapshot
    const saved = { layout: { revision: 2 }, version: 1 } as unknown as WorkspaceLayoutSnapshot
    const save = vi
      .fn<WorkspaceLayoutRepository['save']>()
      .mockImplementationOnce((): never => {
        throw new Error('database busy')
      })
      .mockImplementation((): void => undefined)
    const onError = vi.fn<(workspaceId: string, error: unknown) => void>()
    const repository: WorkspaceLayoutRepository = { get: (): undefined => undefined, save }
    const persistence = createWorkspaceLayoutPersistence(repository, 250, onError)

    persistence.schedule('workspace-failed', failed)
    persistence.schedule('workspace-saved', saved)
    persistence.flushAll()

    expect(onError).toHaveBeenCalledWith('workspace-failed', expect.any(Error))
    expect(save).toHaveBeenCalledWith('workspace-saved', saved)
    expect(persistence.get('workspace-failed')).toBe(failed)

    persistence.flushAll()
    expect(save).toHaveBeenCalledWith('workspace-failed', failed)
    vi.useRealTimers()
  })
})
