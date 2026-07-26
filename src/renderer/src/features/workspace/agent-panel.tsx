import { useEffect, useRef } from 'react'

import type { Task } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { TerminalView } from '../terminal-view'
import type { AgentPanelConfig } from './layout-adapter'

interface AgentPanelProps {
  config: AgentPanelConfig
  task: Task
}

const AgentTerminal = ({ config, isRunning }: { config: AgentPanelConfig; isRunning: boolean }): React.JSX.Element => {
  return (
    <div className="min-h-0 flex-1 bg-[#111318] p-1" data-agent-id={config.taskId} data-agent-ready={isRunning}>
      <TerminalView exitLabel="Agent 已退出" interactive={isRunning} lifetime="task" panelId={config.panelId} />
    </div>
  )
}

export const AgentPanel = ({ config, task }: AgentPanelProps): React.JSX.Element => {
  const activationError = useTaskStore((state: TaskState) => state.activationErrorsByTask[task.id])
  const autoRestoreTask = useTaskStore((state: TaskState) => state.autoRestoreTask)
  const launch = useTaskStore((state: TaskState) => state.launchesByTask[task.id])
  const error = launch?.error ?? activationError
  const isRunning = launch?.isRunning ?? task.isRunning ?? false
  const restoreAttempted = useRef(false)
  useEffect((): void => {
    if (restoreAttempted.current || launch || task.lifecycle !== 'active' || !task.shouldAutoRestore) return
    restoreAttempted.current = true
    void autoRestoreTask(task.id).catch((): void => undefined)
  }, [autoRestoreTask, launch, task.id, task.lifecycle, task.shouldAutoRestore])

  return (
    <div className="relative flex size-full min-h-0 flex-col overflow-hidden">
      <AgentTerminal config={config} isRunning={isRunning} />
      {error ? (
        <div className="bg-destructive/10 text-destructive pointer-events-none absolute inset-x-3 top-3 rounded-md px-3 py-2 text-xs">
          {error}
        </div>
      ) : null}
    </div>
  )
}
