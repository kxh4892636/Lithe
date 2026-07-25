import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { GitForkIcon, PlayIcon, SquareIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import type {
  AdapterDefinition,
  AdapterSummary,
  AgentLaunch,
  Task,
  TerminalDataEvent,
  TerminalExitEvent,
} from '../../../../shared/app-contract'
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
  const addLaunch = useTaskStore((state: TaskState) => state.addLaunch)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const launch = useTaskStore((state: TaskState) => state.launchesByTask[task.id])
  const [adapter, setAdapter] = useState<AdapterSummary>()
  const definition: AdapterDefinition | undefined = adapter?.currentVersion.definition
  const [error, setError] = useState<string | null>(launch?.error ?? null)
  const [isRunning, setIsRunning] = useState(launch?.isRunning ?? false)
  useEffect((): void => {
    void window.lithe.adapters
      .get(task.adapterVersionId)
      .then((summary: AdapterSummary | null): void => setAdapter(summary ?? undefined))
      .catch((reason: unknown): void => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [task.adapterVersionId])
  const run = (operation: 'fork' | 'resume' | 'start' | 'stop'): void => {
    const request =
      operation === 'fork'
        ? window.lithe.agents.fork(task.id)
        : operation === 'resume'
          ? window.lithe.agents.resume(task.id)
          : operation === 'start'
            ? window.lithe.agents.start(task.id)
            : window.lithe.agents.stop(task.id)
    void request
      .then((launch: AgentLaunch | void): void => {
        if (launch) {
          addLaunch(launch, operation === 'fork' ? task.id : undefined)
          if (operation !== 'fork') setIsRunning(launch.isRunning)
          setError(launch.error)
        } else {
          setIsRunning(false)
          void hydrateWorkspace(task.workspaceId)
          setError(null)
        }
      })
      .catch((reason: unknown): void => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }

  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex h-9 items-center gap-1 border-b px-2">
        {!isRunning && !task.agentSessionId ? (
          <Button onClick={(): void => run('start')} size="sm" variant="ghost">
            <PlayIcon />
            启动
          </Button>
        ) : null}
        {!isRunning && task.agentSessionId && definition?.resume && adapter?.resumeAvailable ? (
          <Button onClick={(): void => run('resume')} size="sm" variant="ghost">
            <PlayIcon />
            恢复
          </Button>
        ) : null}
        {isRunning ? (
          <Button onClick={(): void => run('stop')} size="sm" variant="ghost">
            <SquareIcon />
            停止
          </Button>
        ) : null}
        {isRunning && definition?.fork && adapter?.forkAvailable ? (
          <Button onClick={(): void => run('fork')} size="sm" variant="ghost">
            <GitForkIcon />
            Fork
          </Button>
        ) : null}
        {error ? <span className="text-destructive ml-2 text-xs">{error}</span> : null}
      </div>
      <AgentTerminal config={config} isRunning={isRunning} />
    </div>
  )
}
