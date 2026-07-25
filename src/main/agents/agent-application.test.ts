import { describe, expect, it, vi } from 'vitest'

import type { AgentLaunch, AdapterVersion, Task } from '../../shared/agent-contract'
import type { AppDatabase } from '../database/app-database'
import type { TaskService } from '../tasks/task-service'
import { createAgentApplication } from './agent-application'
import type { AgentManager } from './agent-manager'

const source: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-v1',
  agentSessionId: 'provider-1',
  archivedAt: null,
  createdAt: new Date(0),
  isRunning: false,
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: true,
}
const adapter: AdapterVersion = {
  id: 'adapter-v1',
  adapterId: 'adapter-1',
  name: 'Test Agent',
  kind: 'custom',
  version: 1,
  definition: { executable: 'agent', start: [], resume: null, fork: ['fork', '{{agentSessionId}}'] },
  createdAt: new Date(0),
}

describe('Agent application', (): void => {
  it('forks into a sibling task pinned to the source Adapter version', async (): Promise<void> => {
    const forked = { ...source, id: 'task-2', name: 'Review-1', agentSessionId: null }
    const launch = { sessionId: 'agent:task-2', task: forked } as AgentLaunch
    const manager = {
      launch: vi
        .fn<(taskId: string, operation: 'fork', sourceSessionId: string) => AgentLaunch>()
        .mockReturnValue(launch),
    } as unknown as AgentManager
    const tasks = {
      createPinned: vi
        .fn<(input: { workspaceId: string; name: string }, versionId: string) => Task>()
        .mockReturnValue(forked),
      nextForkName: vi.fn<(task: Task) => string>().mockReturnValue('Review-1'),
    } as unknown as TaskService
    const database = {
      adapters: { getVersion: (): AdapterVersion => adapter },
      tasks: { get: (): Task => source },
    } as unknown as AppDatabase
    const application = createAgentApplication({
      database,
      inspectAvailability: async (): Promise<{ forkAvailable: boolean; resumeAvailable: boolean }> => ({
        forkAvailable: true,
        resumeAvailable: true,
      }),
      manager,
      tasks,
    })

    await expect(application.fork(source.id)).resolves.toBe(launch)
    expect(tasks.createPinned).toHaveBeenCalledWith(
      { workspaceId: source.workspaceId, name: 'Review-1' },
      source.adapterVersionId,
    )
    expect(manager.launch).toHaveBeenCalledWith(forked.id, 'fork', source.agentSessionId)
  })
})
