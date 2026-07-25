import { randomUUID } from 'node:crypto'

import type { AgentLaunch, Task } from '../../shared/agent-contract'
import type { AppDatabase } from '../database/app-database'
import type { PtyRuntime } from '../terminal/pty-runtime'
import type { CapabilityRegistry } from '../tool-control/capability-registry'
import { renderAdapterCommand, type AdapterOperation } from './adapter-executor'

interface RunningAgent {
  capability: string
  instanceId: string
  sessionId: string
  taskId: string
}

interface AgentManagerOptions {
  capabilities: CapabilityRegistry
  createId?: () => string
  database: AppDatabase
  onInstanceExit?: (instanceId: string) => void
  runtime: PtyRuntime
}

export interface AgentManager {
  bind: (capability: string, providerSessionId: string) => Task
  handleExit: (sessionId: string) => void
  isRunning: (taskId: string) => boolean
  launch: (taskId: string, operation: AdapterOperation, sourceAgentSessionId?: string) => AgentLaunch
  stop: (taskId: string) => void
}

export const createAgentManager = ({
  capabilities,
  createId = randomUUID,
  database,
  onInstanceExit = (): void => undefined,
  runtime,
}: AgentManagerOptions): AgentManager => {
  const runningByTask = new Map<string, RunningAgent>()
  const taskBySession = new Map<string, string>()

  const stop = (taskId: string): void => {
    const running = runningByTask.get(taskId)
    if (!running) return
    runningByTask.delete(taskId)
    taskBySession.delete(running.sessionId)
    capabilities.revokeInstance(running.instanceId)
    onInstanceExit(running.instanceId)
    runtime.close(running.sessionId)
  }

  return {
    bind: (capability: string, providerSessionId: string): Task => {
      const binding = capabilities.resolve(capability)
      if (!binding) throw new TypeError('Capability is invalid or expired')
      const running = runningByTask.get(binding.taskId)
      if (!running || running.capability !== capability) throw new TypeError('Capability is not active for task')
      return database.tasks.bindSession(binding.taskId, providerSessionId)
    },
    handleExit: (sessionId: string): void => {
      const taskId = taskBySession.get(sessionId)
      if (taskId) stop(taskId)
    },
    isRunning: (taskId: string): boolean => runningByTask.has(taskId),
    launch: (taskId: string, operation: AdapterOperation, sourceAgentSessionId?: string): AgentLaunch => {
      const task = database.tasks.get(taskId)
      if (!task) throw new TypeError('Task does not exist')
      if (runningByTask.has(taskId)) throw new TypeError('Task Agent is already running')
      if (operation === 'start' && task.agentSessionId) throw new TypeError('Task already has an Agent session')
      if (operation === 'resume' && !task.agentSessionId) throw new TypeError('Task Agent session is not bound')
      if (operation === 'fork' && !sourceAgentSessionId) throw new TypeError('Source Agent session is not bound')
      const workspace = database.projects.getWorkspace(task.workspaceId)
      if (!workspace) throw new TypeError('Workspace does not exist')
      const adapter = database.adapters.getVersion(task.adapterVersionId)
      if (!adapter) throw new TypeError('Task Adapter version does not exist')
      const command = renderAdapterCommand(adapter.definition, operation, {
        agentSessionId: operation === 'fork' ? sourceAgentSessionId : (task.agentSessionId ?? undefined),
        taskName: task.name,
        workspacePath: workspace.rootPath,
      })
      database.tasks.setAutoRestore?.(taskId, true)
      const instanceId = createId()
      const sessionId = `agent:${task.id}`
      const capability = capabilities.issue({
        instanceId,
        projectId: workspace.projectId,
        workspaceId: workspace.id,
        taskId: task.id,
      })
      try {
        runtime.create({
          args: command.args,
          columns: 80,
          cwd: workspace.rootPath,
          environment: { LITHE_CAPABILITY: capability },
          rows: 24,
          sessionId,
          shell: command.executable,
        })
      } catch (error: unknown) {
        capabilities.revokeInstance(instanceId)
        return {
          args: command.args,
          cwd: workspace.rootPath,
          error: error instanceof Error ? error.message : String(error),
          executable: command.executable,
          isRunning: false,
          sessionId,
          task,
        }
      }
      const running = { capability, instanceId, sessionId, taskId }
      runningByTask.set(taskId, running)
      taskBySession.set(sessionId, taskId)
      return {
        args: command.args,
        cwd: workspace.rootPath,
        error: null,
        executable: command.executable,
        isRunning: true,
        sessionId,
        task,
      }
    },
    stop,
  }
}
