import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge } from '../../../shared/app-contract'
import { disposeTerminalView, TerminalView } from './terminal-view'

const terminalInstances = vi.hoisted(
  (): Array<{
    dispose: ReturnType<typeof vi.fn>
    loadAddon: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    onResize: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    writeln: ReturnType<typeof vi.fn>
  }> => [],
)
const terminalDataListeners = vi.hoisted((): Array<(event: { data: string; panelId: string }) => void> => [])

vi.mock('@xterm/addon-fit', (): { FitAddon: new () => { fit: ReturnType<typeof vi.fn<() => void>> } } => ({
  FitAddon: class {
    fit = vi.fn<() => void>()
  },
}))

vi.mock('@xterm/xterm', (): { Terminal: new () => (typeof terminalInstances)[number] } => ({
  Terminal: class {
    cols = 80
    dispose = vi.fn<() => void>()
    loadAddon = vi.fn<(...arguments_: unknown[]) => void>()
    onData = vi.fn<() => { dispose: () => void }>(() => ({ dispose: vi.fn<() => void>() }))
    onResize = vi.fn<() => { dispose: () => void }>(() => ({ dispose: vi.fn<() => void>() }))
    open = vi.fn<(...arguments_: unknown[]) => void>()
    rows = 24
    write = vi.fn<(...arguments_: unknown[]) => void>()
    writeln = vi.fn<(...arguments_: unknown[]) => void>()

    constructor() {
      terminalInstances.push(this)
    }
  },
}))

beforeEach((): void => {
  globalThis.ResizeObserver = class {
    disconnect = vi.fn<() => void>()
    observe = vi.fn<() => void>()
    unobserve = vi.fn<() => void>()
  }
  window.lithe = {
    terminals: {
      onData: vi.fn<() => () => void>(() => (): void => undefined),
      onExit: vi.fn<() => () => void>(() => (): void => undefined),
      resize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      write: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as LitheBridge
})

afterEach((): void => {
  cleanup()
  disposeTerminalView('agent:task-1')
  terminalDataListeners.length = 0
  terminalInstances.length = 0
  vi.clearAllMocks()
})

describe('terminal view', (): void => {
  it('keeps one terminal and one event subscription while the same panel changes interaction state', (): void => {
    const { rerender } = render(
      <TerminalView exitLabel="Agent 已退出" interactive lifetime="task" panelId="agent:task-1" />,
    )

    rerender(<TerminalView exitLabel="Agent 已退出" interactive={false} lifetime="task" panelId="agent:task-1" />)

    expect(terminalInstances).toHaveLength(1)
    expect(window.lithe.terminals.onData).toHaveBeenCalledOnce()
    expect(window.lithe.terminals.onExit).toHaveBeenCalledOnce()
    expect(terminalInstances[0]?.dispose).not.toHaveBeenCalled()
  })

  it('keeps consuming output while a task-owned terminal view has no open tab', (): void => {
    vi.mocked(window.lithe.terminals.onData).mockImplementation(
      (listener: (event: { data: string; panelId: string }) => void): (() => void) => {
        terminalDataListeners.push(listener)
        return (): void => undefined
      },
    )
    const first = render(<TerminalView exitLabel="Agent 已退出" interactive lifetime="task" panelId="agent:task-1" />)
    first.unmount()

    terminalDataListeners[0]?.({ data: 'BACKGROUND_OUTPUT', panelId: 'agent:task-1' })
    render(<TerminalView exitLabel="Agent 已退出" interactive lifetime="task" panelId="agent:task-1" />)

    expect(terminalInstances).toHaveLength(1)
    expect(terminalInstances[0]?.write).toHaveBeenCalledWith('BACKGROUND_OUTPUT')
    expect(window.lithe.terminals.onData).toHaveBeenCalledOnce()
  })
})
