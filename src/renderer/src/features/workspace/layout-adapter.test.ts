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

  it('opens every file click as a new panel in the active group', (): void => {
    const layout = createLayoutAdapter()

    layout.openFile({ panelId: 'file:view-1', relativePath: 'src/index.ts' }, 'index.ts')
    layout.openFile({ panelId: 'file:view-2', relativePath: 'src/index.ts' }, 'index.ts')

    expect(layout.listPanelIds()).toEqual(['file:view-1', 'file:view-2'])
    expect(layout.getModel().getActiveTabset()?.getSelectedNode()?.getId()).toBe('file:view-2')
  })

  it('opens every Git change click as a new panel in the active group', (): void => {
    const layout = createLayoutAdapter()

    layout.openDiff({ kind: 'staged', panelId: 'diff:view-1', relativePath: 'src/index.ts' }, 'index.ts')
    layout.openDiff({ kind: 'staged', panelId: 'diff:view-2', relativePath: 'src/index.ts' }, 'index.ts')

    expect(layout.listPanelIds()).toEqual(['diff:view-1', 'diff:view-2'])
    expect(layout.getModel().getActiveTabset()?.getSelectedNode()?.getId()).toBe('diff:view-2')
  })
})
