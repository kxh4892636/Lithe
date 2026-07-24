import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'

import type { TerminalPanelConfig } from './layout-adapter'
import { terminalSessionCoordinator } from './terminal-session-lifecycle'

interface TerminalPanelProps {
  config: TerminalPanelConfig
  updateTerminal: (panelId: string, panel: TerminalPanelConfig) => void
  workspaceId: string
}

const createTerminalEmulator = (): Terminal =>
  new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
    fontSize: 13,
    theme: { background: '#111318', foreground: '#e5e7eb' },
  })

const observeTerminalSize = (element: HTMLElement, fitAddon: FitAddon): ResizeObserver => {
  const observer = new ResizeObserver((): void => {
    if (element.clientWidth > 0 && element.clientHeight > 0) fitAddon.fit()
  })
  observer.observe(element)
  return observer
}

const openTerminalSession = async (
  config: TerminalPanelConfig,
  terminal: Terminal,
  updateTerminal: TerminalPanelProps['updateTerminal'],
  workspaceId: string,
): Promise<void> => {
  const session = await window.lithe.terminals.create({
    columns: terminal.cols,
    cwd: config.cwd,
    panelId: config.panelId,
    rows: terminal.rows,
    shell: config.shell,
    workspaceId,
  })
  if (session.cwd !== config.cwd || session.shell !== config.shell) {
    updateTerminal(config.panelId, { ...config, cwd: session.cwd, shell: session.shell })
  }
}

const useTerminalPanel = (
  config: TerminalPanelConfig,
  updateTerminal: TerminalPanelProps['updateTerminal'],
  workspaceId: string,
): React.RefObject<HTMLDivElement | null> => {
  const container = useRef<HTMLDivElement>(null)

  useEffect((): (() => void) => {
    const element = container.current
    if (!element) return (): void => undefined

    const terminal = createTerminalEmulator()
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(element)
    fitAddon.fit()
    const stopData = window.lithe.terminals.onData((event): void => {
      if (event.panelId === config.panelId) terminal.write(event.data)
    })
    let disposed = false
    let sessionCreated = false
    let sessionExited = false
    const stopExit = window.lithe.terminals.onExit((event): void => {
      if (event.panelId !== config.panelId) return
      sessionExited = true
      sessionCreated = false
      delete element.dataset.terminalReady
      terminal.writeln(`\r\n[进程已退出: ${event.exitCode}]`)
    })
    const sessionLease = terminalSessionCoordinator.acquire(
      config.panelId,
      async (): Promise<void> => openTerminalSession(config, terminal, updateTerminal, workspaceId),
      async (): Promise<void> => {
        await window.lithe.terminals.close(config.panelId)
      },
    )
    const sessionReady = sessionLease.ready
      .then((): void => {
        if (sessionExited) return
        sessionCreated = true
        if (disposed) return
        element.dataset.terminalReady = 'true'
        terminal.focus()
      })
      .catch((error: unknown): void => {
        if (disposed) return
        terminal.writeln(`\r\n[终端启动失败: ${error instanceof Error ? error.message : String(error)}]`)
        globalThis.console.error('Lithe terminal creation failed', error)
      })
    const input = terminal.onData((data): void => {
      void sessionReady
        .then(async (): Promise<void> => {
          if (!disposed && sessionCreated) await window.lithe.terminals.write(config.panelId, data)
        })
        .catch((error: unknown): void => {
          globalThis.console.error('Lithe terminal input failed', error)
        })
    })
    const resize = terminal.onResize(({ cols, rows }): void => {
      void sessionReady
        .then(async (): Promise<void> => {
          if (!disposed && sessionCreated) await window.lithe.terminals.resize(config.panelId, cols, rows)
        })
        .catch((error: unknown): void => {
          globalThis.console.error('Lithe terminal resize failed', error)
        })
    })
    const observer = observeTerminalSize(element, fitAddon)

    return (): void => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      stopData()
      stopExit()
      terminal.dispose()
      void sessionLease.release().catch((error: unknown): void => {
        globalThis.console.error('Lithe terminal cleanup failed', error)
      })
    }
  }, [config, updateTerminal, workspaceId])

  return container
}

export const TerminalPanel = ({ config, updateTerminal, workspaceId }: TerminalPanelProps): React.JSX.Element => {
  const container = useTerminalPanel(config, updateTerminal, workspaceId)
  return <div className="size-full bg-[#111318] p-1" data-terminal-id={config.panelId} ref={container} />
}
