/* oxlint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from 'vitest'

import { createScratchWorkspaceService } from './scratch-workspace-service'

describe('scratch workspace service', () => {
  it('creates a hidden workspace below the managed scratch root', () => {
    const add = vi.fn()
    const mkdir = vi.fn()
    const service = createScratchWorkspaceService({
      add,
      createId: () => 'workspace-1',
      mkdir,
      now: () => new Date('2026-07-25T00:00:00Z'),
      remove: vi.fn(),
      scratchRoot: 'C:\\Users\\me\\.lithe\\scratch',
    })

    const workspace = service.create()

    expect(workspace).toMatchObject({
      id: 'workspace-1',
      kind: 'scratch',
      projectId: null,
      rootPath: 'C:\\Users\\me\\.lithe\\scratch\\workspace-1',
    })
    expect(mkdir).toHaveBeenCalledWith(workspace.rootPath)
    expect(add).toHaveBeenCalledWith(workspace)
  })

  it('rolls back the directory when metadata persistence fails', () => {
    const remove = vi.fn()
    const service = createScratchWorkspaceService({
      add: vi.fn(() => {
        throw new Error('database failed')
      }),
      createId: () => 'workspace-1',
      mkdir: vi.fn(),
      now: () => new Date(),
      remove,
      scratchRoot: 'C:\\Users\\me\\.lithe\\scratch',
    })

    expect(() => service.create()).toThrow(/database failed/)
    expect(remove).toHaveBeenCalledWith('C:\\Users\\me\\.lithe\\scratch\\workspace-1')
  })
})
