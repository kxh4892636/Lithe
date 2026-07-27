import { describe, expect, it } from 'vitest'

import type { AdapterVersion, Task } from '../../shared/agent-contract'
import type { Workspace } from '../../shared/app-contract'
import { createTaskService } from './task-service'

const workspace: Workspace = {
  id: 'workspace-1',
  projectId: 'project-1',
  name: '默认',
  rootPath: 'D:\\projects\\lithe',
  gitBranch: 'main',
  kind: 'default',
  createdAt: new Date(0),
}

const adapter: AdapterVersion = {
  id: 'adapter-v1',
  adapterId: 'adapter',
  name: 'Test Agent',
  kind: 'custom',
  version: 1,
  definition: { executable: 'test-agent', start: [], resume: null, fork: null },
  createdAt: new Date(0),
}

const setup = (
  overrides: {
    adapters?: AdapterVersion[]
    available?: boolean
    defaultAdapter?: AdapterVersion
  } = {},
) => {
  const tasks: Task[] = []
  const usage: string[] = []
  const service = createTaskService({
    createId: (): string => `task-${tasks.length + 1}`,
    getDefaultAdapter: (): AdapterVersion | undefined => overrides.defaultAdapter,
    getAdapter: (adapterId: string): AdapterVersion | undefined =>
      overrides.adapters?.find((candidate): boolean => candidate.adapterId === adapterId),
    getWorkspace: (workspaceId: string): Workspace | undefined =>
      workspaceId === workspace.id ? workspace : undefined,
    incrementAdapterUsage: (adapterId: string): void => {
      usage.push(adapterId)
    },
    isAdapterAvailable: async (): Promise<boolean> => overrides.available ?? true,
    now: (): Date => new Date('2026-07-25T00:00:00.000Z'),
    saveTask: (task: Task): void => {
      tasks.push(task)
    },
    updateTask: (taskId: string, name: string): Task => {
      const index = tasks.findIndex((task: Task): boolean => task.id === taskId)
      const current = tasks[index]
      if (!current) throw new TypeError('Task does not exist')
      const updated = { ...current, name }
      tasks[index] = updated
      return updated
    },
  })
  return { service, tasks, usage }
}

describe('task service', (): void => {
  it('requires an available global default before writing a task', async (): Promise<void> => {
    const missing = setup()
    await expect(missing.service.create({ workspaceId: workspace.id, name: 'Review' })).rejects.toThrow(
      'Default Adapter is not configured',
    )
    expect(missing.tasks).toEqual([])

    const unavailable = setup({ defaultAdapter: adapter, available: false })
    await expect(unavailable.service.create({ workspaceId: workspace.id, name: 'Review' })).rejects.toThrow(
      'Default Adapter executable is unavailable',
    )
    expect(unavailable.tasks).toEqual([])
  })

  it('creates ID-identified tasks with repeatable display names', async (): Promise<void> => {
    const { service, tasks, usage } = setup({ defaultAdapter: adapter })
    const first = await service.create({ workspaceId: workspace.id, name: '  Review  ' })
    const second = await service.create({ workspaceId: workspace.id, name: 'Review' })

    expect(first).toMatchObject({ id: 'task-1', name: 'Review', adapterVersionId: 'adapter-v1' })
    expect(second).toMatchObject({ id: 'task-2', name: 'Review', adapterVersionId: 'adapter-v1' })
    expect(tasks).toHaveLength(2)
    expect(usage).toEqual(['adapter', 'adapter'])
  })

  it('uses an explicitly selected available Adapter instead of the global default', async (): Promise<void> => {
    const selected = { ...adapter, id: 'selected-v2', adapterId: 'selected', version: 2 }
    const { service, usage } = setup({ adapters: [selected], defaultAdapter: adapter })

    const task = await service.create({
      workspaceId: workspace.id,
      name: 'Review',
      adapterId: selected.adapterId,
    })

    expect(task.adapterVersionId).toBe(selected.id)
    expect(usage).toEqual([selected.adapterId])
  })

  it('renames tasks without treating another task name as identity', async (): Promise<void> => {
    const { service } = setup({ defaultAdapter: adapter })
    const first = await service.create({ workspaceId: workspace.id, name: 'research' })
    const second = await service.create({ workspaceId: workspace.id, name: 'review' })

    expect(service.rename(second, first.name)).toMatchObject({ id: second.id, name: 'research' })
  })
})
