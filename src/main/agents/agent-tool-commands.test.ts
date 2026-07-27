import { describe, expect, it, vi } from 'vitest'

import type { TaskStateService } from '../tasks/task-state-service'
import { createCapabilityRegistry } from '../tool-control/capability-registry'
import { createToolCommandDispatcher } from '../tool-control/command-dispatcher'
import type { AgentApplication } from './agent-application'
import type { AgentManager } from './agent-manager'
import { registerAgentToolCommands } from './agent-tool-commands'

const authorization = { kind: 'agent' as const, capability: 'c'.repeat(32) }

describe('Agent tool commands', (): void => {
  it('binds only through the current Agent capability', async (): Promise<void> => {
    const manager = {
      bind: vi.fn<(capability: string, providerSessionId: string) => object>().mockReturnValue({ id: 'task-1' }),
    } as unknown as AgentManager
    const application = {} as AgentApplication
    const capabilities = createCapabilityRegistry()
    const commands = createToolCommandDispatcher({
      executeAgent: () => ({
        activeWorkspaceId: 'workspace-1',
        projects: [],
        scratchWorkspaces: [],
      }),
      executeExternal: () => ({
        activeWorkspaceId: null,
        projects: [],
        scratchWorkspaces: [],
      }),
    })
    registerAgentToolCommands({ application, capabilities, commands, manager })

    const response = await commands.dispatch(
      {
        version: 1,
        id: 'request-1',
        command: 'agent.bind',
        authorization,
        payload: { sessionId: 'provider-1' },
      },
      'connection-1',
    )

    expect(response).toMatchObject({ ok: true, data: { id: 'task-1' } })
    expect(manager.bind).toHaveBeenCalledWith(authorization.capability, 'provider-1')
  })

  it('rejects bind from a normal external terminal', async (): Promise<void> => {
    const commands = createToolCommandDispatcher({
      executeAgent: (): undefined => undefined,
      executeExternal: () => ({
        activeWorkspaceId: null,
        projects: [],
        scratchWorkspaces: [],
      }),
    })
    registerAgentToolCommands({
      application: {} as AgentApplication,
      capabilities: createCapabilityRegistry(),
      commands,
      manager: { bind: vi.fn<(capability: string, providerSessionId: string) => object>() } as unknown as AgentManager,
    })

    const response = await commands.dispatch(
      {
        version: 1,
        id: 'request-1',
        command: 'agent.bind',
        authorization: { kind: 'external', token: 'e'.repeat(32) },
        payload: { sessionId: 'provider-1' },
      },
      'connection-1',
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('rejects an Agent operation targeting another task', async (): Promise<void> => {
    const capabilities = createCapabilityRegistry()
    const capability = capabilities.issue({
      instanceId: 'instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      taskId: 'task-1',
    })
    const commands = createToolCommandDispatcher({
      executeAgent: () => ({
        activeWorkspaceId: 'workspace-1',
        projects: [],
        scratchWorkspaces: [],
      }),
      executeExternal: (): undefined => undefined,
    })
    registerAgentToolCommands({
      application: { stop: vi.fn<(taskId: string) => void>() } as unknown as AgentApplication,
      capabilities,
      commands,
      manager: {} as AgentManager,
    })

    const response = await commands.dispatch(
      {
        version: 1,
        id: 'request-1',
        command: 'agent.stop',
        authorization: { kind: 'agent', capability },
        payload: { taskId: 'task-2' },
      },
      'connection-1',
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('reports running and idle for the capability-bound task without target parameters', async (): Promise<void> => {
    const capabilities = createCapabilityRegistry()
    const capability = capabilities.issue({
      instanceId: 'instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      taskId: 'task-1',
    })
    const commands = createToolCommandDispatcher({
      executeAgent: () => ({
        activeWorkspaceId: 'workspace-1',
        projects: [],
        scratchWorkspaces: [],
      }),
      executeExternal: (): undefined => undefined,
    })
    const states = {
      markIdle: vi.fn<TaskStateService['markIdle']>().mockReturnValue({ id: 'task-1', agentStatus: 'idle' } as never),
      markRunning: vi
        .fn<TaskStateService['markRunning']>()
        .mockReturnValue({ id: 'task-1', agentStatus: 'running' } as never),
    } as unknown as TaskStateService
    registerAgentToolCommands({
      application: {} as AgentApplication,
      capabilities,
      commands,
      manager: {} as AgentManager,
      states,
    })

    const running = await commands.dispatch(
      { version: 1, id: 'running', command: 'task.running', authorization: { kind: 'agent', capability } },
      'connection-1',
    )
    const idle = await commands.dispatch(
      { version: 1, id: 'idle', command: 'task.idle', authorization: { kind: 'agent', capability } },
      'connection-1',
    )

    expect(running).toMatchObject({ ok: true, data: { agentStatus: 'running', id: 'task-1' } })
    expect(idle).toMatchObject({ ok: true, data: { agentStatus: 'idle', id: 'task-1' } })
    expect(states.markRunning).toHaveBeenCalledWith('task-1')
    expect(states.markIdle).toHaveBeenCalledWith('task-1')
  })

  it('rejects running state reports from an external terminal', async (): Promise<void> => {
    const commands = createToolCommandDispatcher({
      executeAgent: (): undefined => undefined,
      executeExternal: () => ({
        activeWorkspaceId: null,
        projects: [],
        scratchWorkspaces: [],
      }),
    })
    const states = { markRunning: vi.fn<TaskStateService['markRunning']>() } as unknown as TaskStateService
    registerAgentToolCommands({
      application: {} as AgentApplication,
      capabilities: createCapabilityRegistry(),
      commands,
      manager: {} as AgentManager,
      states,
    })

    const response = await commands.dispatch(
      {
        version: 1,
        id: 'running',
        command: 'task.running',
        authorization: { kind: 'external', token: 'e'.repeat(32) },
        payload: { taskId: 'task-1' },
      },
      'connection-1',
    )

    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(states.markRunning).not.toHaveBeenCalled()
  })
})
