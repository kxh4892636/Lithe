import { describe, expect, it } from 'vitest'

import { createLayoutAdapter } from './layout-adapter'

describe('workspace Agent layout', (): void => {
  it('opens one Agent panel per task and reselects the existing tab', (): void => {
    const layout = createLayoutAdapter()

    layout.openAgent({ panelId: 'agent:task-1', taskId: 'task-1' }, 'Review')
    layout.addTerminal({ cwd: '.', panelId: 'terminal-1', shell: 'pwsh.exe' })
    layout.openAgent({ panelId: 'agent:task-1', taskId: 'task-1' }, 'Review')
    layout.openAgent({ panelId: 'agent:task-2', taskId: 'task-2' }, 'Review-1', 'agent:task-1')

    expect(layout.listPanelIds()).toEqual(['agent:task-1', 'agent:task-2', 'terminal-1'])
    expect(layout.getModel().getActiveTabset()?.getSelectedNode()?.getId()).toBe('agent:task-2')
    expect(layout.serialize().layout.layout).toBeDefined()
  })
})
