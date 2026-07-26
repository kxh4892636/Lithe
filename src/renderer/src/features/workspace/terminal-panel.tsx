import { useCallback, useEffect, useRef, useState } from 'react'

import { TerminalView, type TerminalDimensions, writeTerminalViewLine } from '../terminal-view'
import type { TerminalPanelConfig } from './layout-adapter'
import { terminalSessionCoordinator } from './terminal-session-lifecycle'

interface TerminalPanelProps {
  config: TerminalPanelConfig
  updateTerminal: (panelId: string, panel: TerminalPanelConfig) => void
  workspaceId: string
}

const openTerminalSession = async (
  config: TerminalPanelConfig,
  dimensions: TerminalDimensions,
  updateTerminal: TerminalPanelProps['updateTerminal'],
  workspaceId: string,
): Promise<void> => {
  const session = await window.lithe.terminals.create({
    columns: dimensions.columns,
    cwd: config.cwd,
    panelId: config.panelId,
    rows: dimensions.rows,
    shell: config.shell,
    workspaceId,
  })
  if (session.cwd !== config.cwd || session.shell !== config.shell) {
    updateTerminal(config.panelId, { ...config, cwd: session.cwd, shell: session.shell })
  }
}

const useTerminalSession = (
  config: TerminalPanelConfig,
  updateTerminal: TerminalPanelProps['updateTerminal'],
  workspaceId: string,
): { onExit: () => void; onReady: (dimensions: TerminalDimensions) => void; ready: boolean } => {
  const initialConfig = useRef(config)
  const lease = useRef<ReturnType<typeof terminalSessionCoordinator.acquire>>(undefined)
  const exited = useRef(false)
  const mounted = useRef(true)
  const update = useRef(updateTerminal)
  const [ready, setReady] = useState(false)
  update.current = updateTerminal
  if (initialConfig.current.panelId !== config.panelId) initialConfig.current = config

  const onReady = useCallback(
    (dimensions: TerminalDimensions): void => {
      if (lease.current) return
      const launch = initialConfig.current
      exited.current = false
      lease.current = terminalSessionCoordinator.acquire(
        launch.panelId,
        async (): Promise<void> => openTerminalSession(launch, dimensions, update.current, workspaceId),
        async (): Promise<void> => window.lithe.terminals.close(launch.panelId),
      )
      void lease.current.ready
        .then((): void => {
          if (mounted.current && !exited.current) setReady(true)
        })
        .catch((error: unknown): void => {
          writeTerminalViewLine(
            launch.panelId,
            `[终端启动失败: ${error instanceof Error ? error.message : String(error)}]`,
          )
          globalThis.console.error('Lithe terminal creation failed', error)
        })
    },
    [workspaceId],
  )

  useEffect((): (() => void) => {
    mounted.current = true
    return (): void => {
      mounted.current = false
      const session = lease.current
      if (!session) return
      void session.release().catch((error: unknown): void => {
        globalThis.console.error('Lithe terminal cleanup failed', error)
      })
    }
  }, [])
  return {
    onExit: (): void => {
      exited.current = true
      setReady(false)
    },
    onReady,
    ready,
  }
}

export const TerminalPanel = ({ config, updateTerminal, workspaceId }: TerminalPanelProps): React.JSX.Element => {
  const session = useTerminalSession(config, updateTerminal, workspaceId)
  return (
    <div className="size-full bg-[#111318] p-1" data-terminal-id={config.panelId} data-terminal-ready={session.ready}>
      <TerminalView
        exitLabel="进程已退出"
        focused={session.ready}
        interactive={session.ready}
        lifetime="panel"
        onExit={session.onExit}
        onReady={session.onReady}
        panelId={config.panelId}
      />
    </div>
  )
}
