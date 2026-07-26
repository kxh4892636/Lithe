import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'

import type { Task, TerminalDataEvent, TerminalExitEvent } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import type { AgentPanelConfig } from './layout-adapter'

interface AgentPanelProps {
  config: AgentPanelConfig
  task: Task
}

const createEmulator = (): Terminal =>
  new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
    fontSize: 13,
    theme: { background: '#111318', foreground: '#e5e7eb' },
  })

const AgentTerminal = ({ config, isRunning }: { config: AgentPanelConfig; isRunning: boolean }): React.JSX.Element => {
  const container = useRef<HTMLDivElement>(null)

  useEffect((): (() => void) => {
    const element = container.current
    if (!element) return (): void => undefined
    const terminal = createEmulator()
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)
    fit.fit()
    const stopData = window.lithe.terminals.onData((event: TerminalDataEvent): void => {
      if (event.panelId === config.panelId) terminal.write(event.data)
    })
    const stopExit = window.lithe.terminals.onExit((event: TerminalExitEvent): void => {
      if (event.panelId === config.panelId) terminal.writeln(`\r\n[Agent 已退出: ${event.exitCode}]`)
    })
    const input = terminal.onData((data: string): void => {
      if (!isRunning) return
      void window.lithe.terminals.write(config.panelId, data).catch((error: unknown): void => {
        globalThis.console.error('Lithe Agent input failed', error)
      })
    })
    const resize = terminal.onResize(({ cols, rows }: { cols: number; rows: number }): void => {
      if (!isRunning) return
      void window.lithe.terminals.resize(config.panelId, cols, rows).catch((error: unknown): void => {
        globalThis.console.error('Lithe Agent resize failed', error)
      })
    })
    const observer = new ResizeObserver((): void => {
      if (element.clientWidth > 0 && element.clientHeight > 0) fit.fit()
    })
    observer.observe(element)
    return (): void => {
      observer.disconnect()
      input.dispose()
      resize.dispose()
      stopData()
      stopExit()
      terminal.dispose()
    }
  }, [config, isRunning])

  return (
    <div
      className="min-h-0 flex-1 bg-[#111318] p-1"
      data-agent-id={config.taskId}
      data-agent-ready={isRunning}
      ref={container}
    />
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
