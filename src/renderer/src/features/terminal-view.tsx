import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'

import type { TerminalDataEvent, TerminalExitEvent } from '../../../shared/app-contract'

type TerminalViewLifetime = 'panel' | 'task'

export interface TerminalDimensions {
  columns: number
  rows: number
}

interface TerminalViewProps {
  exitLabel: string
  focused?: boolean
  interactive: boolean
  lifetime: TerminalViewLifetime
  onExit?: () => void
  onReady?: (dimensions: TerminalDimensions) => void
  panelId: string
}

interface TerminalViewEntry {
  exitLabel: string
  fit: FitAddon
  host: HTMLDivElement
  input: { dispose: () => void }
  interactive: boolean
  onExit?: () => void
  onReady?: TerminalViewProps['onReady']
  observer?: ResizeObserver
  panelId: string
  resize: { dispose: () => void }
  stopData: () => void
  stopExit: () => void
  terminal: Terminal
}

const entries = new Map<string, TerminalViewEntry>()

const reportTerminalError = (operation: string, error: unknown): void => {
  globalThis.console.error(`Lithe terminal ${operation} failed`, error)
}

const createTerminal = (): Terminal =>
  new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
    fontSize: 13,
    theme: { background: '#111318', foreground: '#e5e7eb' },
  })

const createEntry = (
  panelId: string,
  exitLabel: string,
  interactive: boolean,
  onExit?: () => void,
  onReady?: TerminalViewProps['onReady'],
): TerminalViewEntry => {
  const terminal = createTerminal()
  const fit = new FitAddon()
  const host = document.createElement('div')
  host.className = 'size-full'
  host.dataset.terminalHost = panelId
  terminal.loadAddon(fit)
  terminal.open(host)
  let entry: TerminalViewEntry
  entry = {
    exitLabel,
    fit,
    host,
    interactive,
    onExit,
    onReady,
    panelId,
    terminal,
    stopData: window.lithe.terminals.onData((event: TerminalDataEvent): void => {
      if (event.panelId === panelId) terminal.write(event.data)
    }),
    stopExit: window.lithe.terminals.onExit((event: TerminalExitEvent): void => {
      if (event.panelId !== panelId) return
      terminal.writeln(`\r\n[${entry.exitLabel}: ${event.exitCode}]`)
      entry.onExit?.()
    }),
    input: terminal.onData((data: string): void => {
      if (!entry.interactive) return
      void window.lithe.terminals.write(panelId, data).catch((error: unknown): void => {
        reportTerminalError('input', error)
      })
    }),
    resize: terminal.onResize(({ cols, rows }: { cols: number; rows: number }): void => {
      if (!entry.interactive) return
      void window.lithe.terminals.resize(panelId, cols, rows).catch((error: unknown): void => {
        reportTerminalError('resize', error)
      })
    }),
  }
  entries.set(panelId, entry)
  return entry
}

const attachEntry = (entry: TerminalViewEntry, element: HTMLDivElement): void => {
  element.append(entry.host)
  entry.fit.fit()
  entry.observer?.disconnect()
  entry.observer = new ResizeObserver((): void => {
    if (element.clientWidth > 0 && element.clientHeight > 0) entry.fit.fit()
  })
  entry.observer.observe(element)
  entry.onReady?.({ columns: entry.terminal.cols, rows: entry.terminal.rows })
}

const detachEntry = (entry: TerminalViewEntry): void => {
  entry.observer?.disconnect()
  entry.observer = undefined
  entry.host.remove()
}

export const disposeTerminalView = (panelId: string): void => {
  const entry = entries.get(panelId)
  if (!entry) return
  entries.delete(panelId)
  detachEntry(entry)
  entry.input.dispose()
  entry.resize.dispose()
  entry.stopData()
  entry.stopExit()
  entry.terminal.dispose()
}

export const writeTerminalViewLine = (panelId: string, line: string): void => {
  entries.get(panelId)?.terminal.writeln(`\r\n${line}`)
}

export const TerminalView = (props: TerminalViewProps): React.JSX.Element => {
  const { exitLabel, focused = false, interactive, lifetime, onExit, onReady, panelId } = props
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef({ exitLabel, interactive, onExit, onReady })
  latest.current = { exitLabel, interactive, onExit, onReady }

  useEffect((): void => {
    const entry = entries.get(panelId)
    if (!entry) return
    entry.exitLabel = exitLabel
    entry.interactive = interactive
    entry.onExit = onExit
    entry.onReady = onReady
    if (focused) entry.terminal.focus()
  }, [exitLabel, focused, interactive, onExit, onReady, panelId])

  useEffect((): (() => void) => {
    const element = container.current
    if (!element) return (): void => undefined
    const entry = entries.get(panelId) ?? createEntry(panelId, latest.current.exitLabel, latest.current.interactive)
    entry.onExit = latest.current.onExit
    entry.onReady = latest.current.onReady
    attachEntry(entry, element)
    return (): void => {
      detachEntry(entry)
      if (lifetime === 'panel') disposeTerminalView(panelId)
    }
  }, [lifetime, panelId])

  return <div className="size-full" ref={container} />
}
