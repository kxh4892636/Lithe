import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LitheBridge } from '../../../shared/app-contract'
import { TerminalPanel } from './workspace/terminal-panel'

const terminalInstances = vi.hoisted(
  (): Array<{
    dispose: ReturnType<typeof vi.fn>
  }> => [],
)

vi.mock('@xterm/addon-fit', (): { FitAddon: new () => { fit: ReturnType<typeof vi.fn<() => void>> } } => ({
  FitAddon: class {
    fit = vi.fn<() => void>()
  },
}))

vi.mock('@xterm/xterm', (): { Terminal: new () => (typeof terminalInstances)[number] } => ({
  Terminal: class {
    cols = 80
    dispose = vi.fn<() => void>()
    focus = vi.fn<() => void>()
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
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      create: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        cwd: 'D:\\repo',
        panelId: 'terminal-1',
        shell: 'pwsh.exe',
      }),
      onData: vi.fn<() => () => void>(() => (): void => undefined),
      onExit: vi.fn<() => () => void>(() => (): void => undefined),
      resize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      write: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as LitheBridge
})

afterEach((): void => {
  cleanup()
  terminalInstances.length = 0
  vi.clearAllMocks()
})

describe('terminal panel', (): void => {
  it('keeps one session across config updates and closes it with the tab', async (): Promise<void> => {
    const updateTerminal = vi.fn<(panelId: string, panel: { cwd: string; panelId: string; shell: string }) => void>()
    const config = { cwd: 'D:\\repo', panelId: 'terminal-1', shell: 'pwsh.exe' }
    const { rerender, unmount } = render(
      <TerminalPanel config={config} updateTerminal={updateTerminal} workspaceId="workspace-1" />,
    )
    await waitFor((): void => {
      expect(window.lithe.terminals.create).toHaveBeenCalledOnce()
    })

    rerender(
      <TerminalPanel
        config={{ ...config, cwd: 'D:\\repo\\.' }}
        updateTerminal={updateTerminal}
        workspaceId="workspace-1"
      />,
    )

    expect(window.lithe.terminals.create).toHaveBeenCalledOnce()
    expect(terminalInstances).toHaveLength(1)
    unmount()
    await waitFor((): void => {
      expect(window.lithe.terminals.close).toHaveBeenCalledOnce()
    })
    expect(terminalInstances[0]?.dispose).toHaveBeenCalledOnce()
  })
})
