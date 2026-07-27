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
  agentStatus: 'idle',
  agentSessionId: 'provider-1',
  archivedAt: null,
  createdAt: new Date(0),
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
    const forked = { ...source, id: 'task-2', agentSessionId: null }
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
      { workspaceId: source.workspaceId, name: source.name },
      source.adapterVersionId,
    )
    expect(manager.launch).toHaveBeenCalledWith(forked.id, 'fork', source.agentSessionId)
  })

  it('rejects Fork while the source task is running', async (): Promise<void> => {
    const runningSource = { ...source, agentStatus: 'running' as const }
    const application = createAgentApplication({
      database: {
        adapters: { getVersion: (): AdapterVersion => adapter },
        tasks: { get: (): Task => runningSource },
      } as unknown as AppDatabase,
      inspectAvailability: async (): Promise<{ forkAvailable: boolean; resumeAvailable: boolean }> => ({
        forkAvailable: true,
        resumeAvailable: true,
      }),
      manager: { launch: vi.fn<AgentManager['launch']>() } as unknown as AgentManager,
      tasks: { createPinned: vi.fn<TaskService['createPinned']>() } as unknown as TaskService,
    })

    await expect(application.fork(source.id)).rejects.toThrow('Running task cannot be forked')
  })

  it('removes an incomplete fork when its Code Agent cannot start', async (): Promise<void> => {
    const forked = { ...source, id: 'task-2', agentStatus: 'closed' as const, agentSessionId: null }
    const deleteTask = vi.fn<(taskId: string) => void>()
    const application = createAgentApplication({
      database: {
        adapters: { getVersion: (): AdapterVersion => adapter },
        tasks: { delete: deleteTask, get: (): Task => source },
      } as unknown as AppDatabase,
      inspectAvailability: async (): Promise<{ forkAvailable: boolean; resumeAvailable: boolean }> => ({
        forkAvailable: true,
        resumeAvailable: true,
      }),
      manager: {
        launch: vi.fn<AgentManager['launch']>().mockReturnValue({
          args: [],
          cwd: 'D:\\projects\\lithe',
          error: 'spawn failed',
          executable: 'agent',
          isOpen: false,
          sessionId: 'agent:task-2',
          task: forked,
        }),
      } as unknown as AgentManager,
      tasks: {
        createPinned: vi.fn<TaskService['createPinned']>().mockReturnValue(forked),
      } as unknown as TaskService,
    })

    await expect(application.fork(source.id)).rejects.toThrow('spawn failed')
    expect(deleteTask).toHaveBeenCalledWith(forked.id)
  })

  it('stops the Code Agent and removes its panel', (): void => {
    const closed = { ...source, agentStatus: 'closed' as const }
    const removeTaskPanel = vi.fn<(workspaceId: string, taskId: string) => void>()
    const application = createAgentApplication({
      database: { tasks: { get: (): Task => source } } as unknown as AppDatabase,
      inspectAvailability: vi.fn<() => Promise<{ forkAvailable: boolean; resumeAvailable: boolean }>>(),
      manager: {
        stop: vi.fn<AgentManager['stop']>().mockReturnValue(closed),
      } as unknown as AgentManager,
      removeTaskPanel,
      tasks: {} as TaskService,
    })

    expect(application.stop(source.id)).toEqual(closed)
    expect(removeTaskPanel).toHaveBeenCalledWith(source.workspaceId, source.id)
  })

  it('keeps the panel when stopping the Code Agent fails', (): void => {
    const removeTaskPanel = vi.fn<(workspaceId: string, taskId: string) => void>()
    const application = createAgentApplication({
      database: { tasks: { get: (): Task => source } } as unknown as AppDatabase,
      inspectAvailability: vi.fn<() => Promise<{ forkAvailable: boolean; resumeAvailable: boolean }>>(),
      manager: {
        stop: vi.fn<AgentManager['stop']>().mockImplementation((): never => {
          throw new Error('close failed')
        }),
      } as unknown as AgentManager,
      removeTaskPanel,
      tasks: {} as TaskService,
    })

    expect(() => application.stop(source.id)).toThrow('close failed')
    expect(removeTaskPanel).not.toHaveBeenCalled()
  })
})
