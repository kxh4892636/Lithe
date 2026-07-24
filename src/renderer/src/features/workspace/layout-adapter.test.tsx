import { describe, expect, it } from 'vitest'

import { createLayoutAdapter } from './layout-adapter'

describe('workspace layout adapter', (): void => {
  it('creates recursive splits and moves panels while preserving identity', (): void => {
    const layout = createLayoutAdapter()
    layout.addTerminal({ cwd: 'D:\\repo', panelId: 'terminal-1', shell: 'pwsh.exe' })
    layout.addTerminal(
      { cwd: 'D:\\repo', panelId: 'terminal-2', shell: 'pwsh.exe' },
      { placement: 'right', targetGroupId: layout.getActiveGroupId() },
    )
    layout.addTerminal(
      { cwd: 'D:\\repo', panelId: 'terminal-3', shell: 'pwsh.exe' },
      { placement: 'bottom', targetGroupId: layout.getActiveGroupId() },
    )
    const targetGroupId = layout.getActiveGroupId()

    layout.movePanel('terminal-1', targetGroupId)

    expect(layout.listPanelIds()).toEqual(expect.arrayContaining(['terminal-1', 'terminal-2', 'terminal-3']))
    expect(layout.getActiveTerminalConfig()?.shell).toBe('pwsh.exe')
    layout.updateTerminal('terminal-3', { cwd: 'D:\\repo\\nested', panelId: 'terminal-3', shell: 'cmd.exe' })
    expect(JSON.stringify(layout.serialize())).toContain('D:\\\\repo\\\\nested')
    expect(JSON.stringify(layout.serialize())).toContain('cmd.exe')
  })

  it('does not persist temporary maximization or output', (): void => {
    const layout = createLayoutAdapter()
    layout.addTerminal({ cwd: '/repo', panelId: 'terminal-1', shell: '/bin/zsh' })
    layout.toggleMaximize(layout.getActiveGroupId())

    const serialized = JSON.stringify(layout.serialize())

    expect(serialized).not.toContain('maximized')
    expect(serialized).not.toContain('scrollback')
  })
})
