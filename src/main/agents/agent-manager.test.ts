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
  adapterId: 'adapter',
  adapterVersion: 1,
  agentStatus: 'closed',
  agentSessionId: null,
  archivedAt: null,
  createdAt: new Date(0),
  isUnread: false,
  lifecycle: 'active',
  lastAttentionAt: null,
  lastViewedAt: null,
  shouldAutoRestore: true,
}
const workspace: Workspace = {
  id: 'workspace-1',
  projectId: 'project-1',
  name: '默认',
  rootPath: 'D:\\projects\\lithe',
  gitBranch: 'main',
  kind: 'default',
  pinnedAt: null,
  createdAt: new Date(0),
}
const adapter: AdapterVersion = {
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

const setup = (
  resolveExecutable = (executable: string): string => executable,
  isDirectory = (_path: string): boolean => true,
  controlDiscoveryPath?: string,
) => {
  let savedTask = { ...task }
  const runtime = {
    close: vi.fn<(sessionId: string) => void>(),
    closeAll: vi.fn<() => Promise<void>>(async (): Promise<void> => undefined),
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
      setAgentStatus: (_taskId: string, agentStatus: Task['agentStatus']): Task => {
        savedTask = { ...savedTask, agentStatus }
        return savedTask
      },
    },
  } as unknown as AppDatabase
  const capabilities = createCapabilityRegistry()
  const onTaskChanged = vi.fn<(task: Task) => void>()
  const manager = createAgentManager({
    capabilities,
    ...(controlDiscoveryPath ? { controlDiscoveryPath } : {}),
    createId: (): string => 'instance-1',
    database,
    isDirectory,
    onTaskChanged,
    resolveExecutable,
    runtime,
  })
  return { capabilities, database, manager, onTaskChanged, runtime }
}

describe('Agent manager', (): void => {
  it('injects a scoped capability and binds the provider session idempotently', (): void => {
    const { capabilities, database, manager, onTaskChanged, runtime } = setup()

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
    expect(manager.isOpen(task.id)).toBe(true)
    expect(database.tasks.get(task.id)?.agentStatus).toBe('idle')
    expect(manager.bind(capability, 'provider-1').agentSessionId).toBe('provider-1')
    expect(manager.bind(capability, 'provider-1').agentSessionId).toBe('provider-1')
    expect(onTaskChanged).toHaveBeenLastCalledWith(expect.objectContaining({ agentSessionId: 'provider-1' }))
    expect(() => manager.bind(capability, 'provider-2')).toThrow('already bound')
  })

  it('launches the resolved executable path instead of the Adapter command name', (): void => {
    const { manager, runtime } = setup((): string => 'C:\\Tools\\fake-agent.exe')

    manager.launch(task.id, 'start')

    expect(runtime.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shell: 'C:\\Tools\\fake-agent.exe',
      }),
    )
  })

  it('pins an Agent to the control discovery file of its runtime profile', (): void => {
    const discoveryPath = 'C:\\Users\\kxh\\.lithe-development\\control.json'
    const { manager, runtime } = setup(undefined, undefined, discoveryPath)

    manager.launch(task.id, 'start')

    expect(runtime.create.mock.calls[0]?.[0].environment).toMatchObject({
      LITHE_CONTROL_DISCOVERY_PATH: discoveryPath,
    })
  })

  it('revokes capability when the Agent instance exits', (): void => {
    const { capabilities, manager, onTaskChanged, runtime } = setup()
    const launch = manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY
    if (!capability) throw new TypeError('Expected Agent capability')

    manager.handleExit(launch.sessionId)

    expect(capabilities.resolve(capability)).toBeUndefined()
    expect(manager.isOpen(task.id)).toBe(false)
    expect(onTaskChanged).toHaveBeenLastCalledWith(expect.objectContaining({ agentStatus: 'closed' }))
  })

  it('keeps the Agent open and idle when stopping its PTY fails', (): void => {
    const { capabilities, database, manager, onTaskChanged, runtime } = setup()
    manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY
    if (!capability) throw new TypeError('Expected Agent capability')
    runtime.close.mockImplementation((): never => {
      throw new Error('close failed')
    })

    expect(() => manager.stop(task.id)).toThrow('close failed')

    expect(manager.isOpen(task.id)).toBe(true)
    expect(capabilities.resolve(capability)).toBeDefined()
    expect(database.tasks.get(task.id)?.agentStatus).toBe('idle')
    expect(onTaskChanged).toHaveBeenLastCalledWith(expect.objectContaining({ agentStatus: 'idle' }))
  })

  it('returns a retryable launch result when spawning fails', (): void => {
    const { capabilities, manager, onTaskChanged, runtime } = setup()
    runtime.create.mockImplementation((): never => {
      throw new Error('spawn failed')
    })

    const launch = manager.launch(task.id, 'start')
    const capability = runtime.create.mock.calls[0]?.[0].environment?.LITHE_CAPABILITY

    expect(launch).toMatchObject({
      error: 'spawn failed',
      isOpen: false,
      task: { agentStatus: 'closed', id: task.id },
    })
    expect(capability ? capabilities.resolve(capability) : undefined).toBeUndefined()
    expect(onTaskChanged).not.toHaveBeenCalled()
    expect(() => manager.launch(task.id, 'start')).not.toThrow()
  })

  it('rejects a missing workspace directory before creating a PTY', (): void => {
    const { manager, runtime } = setup(undefined, (): boolean => false)

    const launch = manager.launch(task.id, 'start')

    expect(launch).toMatchObject({
      cwd: workspace.rootPath,
      error: '工作区目录不存在',
      isOpen: false,
      task: { agentStatus: 'closed', id: task.id },
    })
    expect(runtime.create).not.toHaveBeenCalled()
  })
})
