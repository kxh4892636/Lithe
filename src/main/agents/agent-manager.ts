import { randomUUID } from 'node:crypto'

import type { AgentLaunch, Task } from '../../shared/agent-contract'
import type { AppDatabase } from '../database/app-database'
import { isExistingDirectory } from '../directory-validity'
import type { PtyRuntime } from '../terminal/pty-runtime'
import type { CapabilityRegistry } from '../tool-control/capability-registry'
import { renderAdapterCommand, type AdapterOperation } from './adapter-executor'
import { resolveExecutablePath } from './command-availability'

interface OpenAgent {
  capability: string
  instanceId: string
  sessionId: string
  taskId: string
}

interface AgentManagerOptions {
  capabilities: CapabilityRegistry
  controlDiscoveryPath?: string
  createId?: () => string
  database: AppDatabase
  isDirectory?: (path: string) => boolean
  onTaskChanged?: (task: Task) => void
  resolveExecutable?: (executable: string) => string | null
  runtime: PtyRuntime
}

export interface AgentManager {
  bind: (capability: string, providerSessionId: string) => Task
  handleExit: (sessionId: string) => void
  isOpen: (taskId: string) => boolean
  launch: (taskId: string, operation: AdapterOperation, sourceAgentSessionId?: string) => AgentLaunch
  stop: (taskId: string) => Task
}

interface AgentLauncherOptions {
  capabilities: CapabilityRegistry
  controlDiscoveryPath?: string
  createId: () => string
  database: AppDatabase
  isDirectory: (path: string) => boolean
  onTaskChanged?: (task: Task) => void
  resolveExecutable: (executable: string) => string | null
  openByTask: Map<string, OpenAgent>
  runtime: PtyRuntime
  taskBySession: Map<string, string>
}

const createAgentLauncher =
  (options: AgentLauncherOptions): AgentManager['launch'] =>
  (taskId: string, operation: AdapterOperation, sourceAgentSessionId?: string): AgentLaunch => {
    const task = options.database.tasks.get(taskId)
    if (!task) throw new TypeError('Task does not exist')
    if (options.openByTask.has(taskId)) throw new TypeError('Task Agent is already open')
    if (operation === 'start' && task.agentSessionId) throw new TypeError('Task already has an Agent session')
    if (operation === 'resume' && !task.agentSessionId) throw new TypeError('Task Agent session is not bound')
    if (operation === 'fork' && !sourceAgentSessionId) throw new TypeError('Source Agent session is not bound')
    const workspace = options.database.projects.getWorkspace(task.workspaceId)
    if (!workspace) throw new TypeError('Workspace does not exist')
    if (workspace.projectId && options.database.projects.get?.(workspace.projectId)?.isValid === false) {
      throw new TypeError('Project is invalid')
    }
    const adapter = options.database.adapters.getVersion(task.adapterVersionId)
    if (!adapter) throw new TypeError('Task Adapter version does not exist')
    const command = renderAdapterCommand(adapter.definition, operation, {
      agentSessionId: operation === 'fork' ? sourceAgentSessionId : (task.agentSessionId ?? undefined),
      taskName: task.name,
      workspacePath: workspace.rootPath,
    })
    const sessionId = `agent:${task.id}`
    const launch = {
      args: command.args,
      cwd: workspace.rootPath,
      executable: command.executable,
      sessionId,
      task,
    }
    const failedLaunch = (error: unknown): AgentLaunch => {
      const closed = options.database.tasks.setAgentStatus(taskId, 'closed')
      return {
        ...launch,
        error: error instanceof Error ? error.message : String(error),
        isOpen: false,
        task: closed,
      }
    }
    if (!options.isDirectory(workspace.rootPath)) return failedLaunch('工作区目录不存在')
    options.database.tasks.setAutoRestore?.(taskId, true)
    const instanceId = options.createId()
    const capability = options.capabilities.issue({
      instanceId,
      projectId: workspace.projectId,
      workspaceId: workspace.id,
      taskId: task.id,
    })
    try {
      options.runtime.create({
        args: command.args,
        columns: 80,
        cwd: workspace.rootPath,
        environment: {
          LITHE_CAPABILITY: capability,
          ...(options.controlDiscoveryPath ? { LITHE_CONTROL_DISCOVERY_PATH: options.controlDiscoveryPath } : {}),
        },
        interactions: command.interactions,
        rows: 24,
        sessionId,
        shell: options.resolveExecutable(command.executable) ?? command.executable,
      })
    } catch (error: unknown) {
      options.capabilities.revokeInstance(instanceId)
      return failedLaunch(error)
    }
    options.openByTask.set(taskId, { capability, instanceId, sessionId, taskId })
    options.taskBySession.set(sessionId, taskId)
    const idle = options.database.tasks.setAgentStatus(taskId, 'idle')
    options.onTaskChanged?.(idle)
    return { ...launch, error: null, isOpen: true, task: idle }
  }

export const createAgentManager = ({
  capabilities,
  controlDiscoveryPath,
  createId = randomUUID,
  database,
  isDirectory = isExistingDirectory,
  onTaskChanged,
  resolveExecutable = resolveExecutablePath,
  runtime,
}: AgentManagerOptions): AgentManager => {
  const openByTask = new Map<string, OpenAgent>()
  const taskBySession = new Map<string, string>()
  const launch = createAgentLauncher({
    capabilities,
    controlDiscoveryPath,
    createId,
    database,
    isDirectory,
    onTaskChanged,
    openByTask,
    resolveExecutable,
    runtime,
    taskBySession,
  })

  const stop = (taskId: string): Task => {
    const open = openByTask.get(taskId)
    if (open) {
      openByTask.delete(taskId)
      taskBySession.delete(open.sessionId)
      try {
        runtime.close(open.sessionId)
      } catch (error: unknown) {
        openByTask.set(taskId, open)
        taskBySession.set(open.sessionId, taskId)
        throw error
      }
      capabilities.revokeInstance(open.instanceId)
    }
    const closed = database.tasks.setAgentStatus(taskId, 'closed')
    onTaskChanged?.(closed)
    return closed
  }

  return {
    bind: (capability: string, providerSessionId: string): Task => {
      const binding = capabilities.resolve(capability)
      if (!binding) throw new TypeError('Capability is invalid or expired')
      const open = openByTask.get(binding.taskId)
      if (!open || open.capability !== capability) throw new TypeError('Capability is not active for task')
      const task = database.tasks.bindSession(binding.taskId, providerSessionId)
      onTaskChanged?.(task)
      return task
    },
    handleExit: (sessionId: string): void => {
      const taskId = taskBySession.get(sessionId)
      if (taskId) stop(taskId)
    },
    isOpen: (taskId: string): boolean => openByTask.has(taskId),
    launch,
    stop,
  }
}
