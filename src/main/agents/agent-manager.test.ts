import { describe, expect, it, vi } from 'vitest'

import type { AdapterVersion, Task } from '../../shared/agent-contract'
import type { Workspace } from '../../shared/app-contract'
import type { AppDatabase } from '../database/app-database'
import type { PtyRuntime } from '../terminal/pty-runtime'
import { createCapabilityRegistry } from '../tool-control/capability-registry'
import { createAgentManager } from './agent-manager'

const task: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Review',
  adapterVersionId: 'adapter-v1',
  agentSessionId: null,
  createdAt: new Date(0),
}
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
  name: 'Test',
  kind: 'custom',
  version: 1,
  definition: {
    executable: 'fake-agent',
    start: ['--name', '{{taskName}}'],
    resume: ['resume', '{{agentSessionId}}'],
    fork: null,
  },
  createdAt: new Date(0),
}

const setup = () => {
  let savedTask = { ...task }
  const runtime = {
    close: vi.fn<(sessionId: string) => void>(),
    closeAll: vi.fn<() => void>(),
    create: vi.fn<(request: Parameters<PtyRuntime['create']>[0]) => void>(),
    resize: vi.fn<(sessionId: string, columns: number, rows: number) => void>(),
    write: vi.fn<(sessionId: string, data: string) => void>(),
  } satisfies PtyRuntime
  const database = {
    adapters: { getVersion: (): AdapterVersion => adapter },
    projects: { getWorkspace: (): Workspace => workspace },
    tasks: {
      bindSession: (_taskId: string, sessionId: string): Task => {
        if (savedTask.agentSessionId && savedTask.agentSessionId !== sessionId) {
          throw new TypeError('Agent session is already bound')
        }
        savedTask = { ...savedTask, agentSessionId: sessionId }
        return savedTask
      },
      get: (): Task => savedTask,
    },
  } as unknown as AppDatabase
  const capabilities = createCapabilityRegistry()
  const manager = createAgentManager({
    capabilities,
    createId: (): string => 'instance-1',
    database,
    runtime,
  })
  return { capabilities, manager, runtime }
}

describe('Agent manager', (): void => {
  it('injects a scoped capability and binds the provider session idempotently', (): void => {
    const { capabilities, manager, runtime } = setup()

    manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY
    expect(capability).toEqual(expect.any(String))
    if (!capability) throw new TypeError('Expected Agent capability')

    expect(runtime.create).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['--name', 'Review'],
        environment: { LITHE_CAPABILITY: capability },
        sessionId: 'agent:task-1',
        shell: 'fake-agent',
      }),
    )
    expect(capabilities.resolve(capability)).toMatchObject({ taskId: task.id, instanceId: 'instance-1' })
    expect(manager.bind(capability, 'provider-1').agentSessionId).toBe('provider-1')
    expect(manager.bind(capability, 'provider-1').agentSessionId).toBe('provider-1')
    expect(() => manager.bind(capability, 'provider-2')).toThrow('already bound')
  })

  it('revokes capability when the Agent instance exits', (): void => {
    const { capabilities, manager, runtime } = setup()
    const launch = manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY
    if (!capability) throw new TypeError('Expected Agent capability')

    manager.handleExit(launch.sessionId)

    expect(capabilities.resolve(capability)).toBeUndefined()
  })

  it('returns a retryable launch result when spawning fails', (): void => {
    const { capabilities, manager, runtime } = setup()
    runtime.create.mockImplementation((): never => {
      throw new Error('spawn failed')
    })

    const launch = manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY

    expect(launch).toMatchObject({ error: 'spawn failed', isRunning: false, task: { id: task.id } })
    expect(capability ? capabilities.resolve(capability) : undefined).toBeUndefined()
    expect(() => manager.launch(task.id, 'start')).not.toThrow()
  })
})
