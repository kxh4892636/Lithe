import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge, Task } from '../../../../shared/app-contract'
import { useTaskStore } from './task-store'

const restoredTask: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-v1',
  agentSessionId: 'session-1',
  archivedAt: null,
  createdAt: new Date(0),
  isRunning: false,
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: false,
}

describe('task store', (): void => {
  beforeEach((): void => {
    useTaskStore.setState({
      archivedTasks: [{ ...restoredTask, archivedAt: new Date(1), lifecycle: 'archived' }],
      tasksByWorkspace: { 'workspace-1': [] },
    })
  })

  it('keeps a restored task unique when the change event arrives before the IPC response', async (): Promise<void> => {
    const restore = vi.fn<LitheBridge['tasks']['restore']>().mockImplementation(async (): Promise<Task> => {
      useTaskStore.getState().applyChange(restoredTask)
      return restoredTask
    })
    window.lithe = { tasks: { restore } } as unknown as LitheBridge

    await useTaskStore.getState().restoreTask(restoredTask.id)

    expect(useTaskStore.getState().tasksByWorkspace['workspace-1']).toEqual([restoredTask])
  })
})
