import { Actions, DockLocation, Model, TabNode, TabSetNode, type IJsonModel, type IJsonTabNode } from 'flexlayout-react'

import type { WorkspaceLayoutSnapshot } from '../../../../shared/app-contract'
import { parseWorkspaceLayoutSnapshot } from '../../../../shared/workspace-layout-schema'

export interface TerminalPanelConfig {
  cwd: string
  panelId: string
  shell: string
}

export interface AgentPanelConfig {
  panelId: string
  taskId: string
}

type Placement = 'center' | 'right' | 'bottom'

interface AddPanelOptions {
  placement: Placement
  targetGroupId: string
}

export interface WorkspaceLayoutAdapter {
  openAgent: (panel: AgentPanelConfig, taskName: string, afterPanelId?: string, select?: boolean) => void
  addTerminal: (panel: TerminalPanelConfig, options?: AddPanelOptions) => void
  getActiveGroupId: () => string
  getActiveTerminalConfig: () => TerminalPanelConfig | undefined
  getModel: () => Model
  listPanelIds: () => string[]
  movePanel: (panelId: string, targetGroupId: string) => void
  removePanel: (panelId: string) => void
  serialize: () => WorkspaceLayoutSnapshot
  toggleMaximize: (groupId: string) => void
  updateTerminal: (panelId: string, panel: TerminalPanelConfig) => void
}

const emptyLayout = (): IJsonModel => ({
  global: {
    tabEnablePopout: false,
    tabEnableRename: false,
    tabSetEnableDeleteWhenEmpty: true,
    tabSetEnableDivide: true,
    tabSetEnableMaximize: true,
  },
  borders: [],
  layout: {
    type: 'row',
    children: [{ type: 'tabset', id: 'root-group', active: true, children: [] }],
  },
})

const locationByPlacement: Record<Placement, DockLocation> = {
  bottom: DockLocation.BOTTOM,
  center: DockLocation.CENTER,
  right: DockLocation.RIGHT,
}

const sanitizeLayout = (model: Model): IJsonModel => {
  const layout = structuredClone(model.toJson())
  const clearMaximized = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if ('maximized' in value) delete value.maximized
    for (const child of Object.values(value)) clearMaximized(child)
  }
  clearMaximized(layout)
  return layout
}

export const createLayoutAdapter = (snapshot?: WorkspaceLayoutSnapshot): WorkspaceLayoutAdapter => {
  const validated = snapshot ? parseWorkspaceLayoutSnapshot(snapshot) : undefined
  const model = Model.fromJson((validated?.layout as IJsonModel | undefined) ?? emptyLayout())
  const activeGroup = (): TabSetNode => {
    const active = model.getActiveTabset()
    if (active) return active
    let first: TabSetNode | undefined
    model.visitNodes((node): void => {
      if (!first && node instanceof TabSetNode) first = node
    })
    if (!first) throw new Error('布局中不存在标签组')
    return first
  }

  return {
    addTerminal: (panel: TerminalPanelConfig, options?: AddPanelOptions): void => {
      const target = options?.targetGroupId ?? activeGroup().getId()
      const placement = options?.placement ?? 'center'
      const tab: IJsonTabNode = {
        type: 'tab',
        component: 'terminal',
        config: panel,
        enableRenderOnDemand: false,
        id: panel.panelId,
        name: '终端',
      }
      model.doAction(Actions.addTab(tab, target, locationByPlacement[placement], -1, true))
    },
    getActiveGroupId: (): string => activeGroup().getId(),
    getActiveTerminalConfig: (): TerminalPanelConfig | undefined => {
      const selected = activeGroup().getSelectedNode()
      return selected instanceof TabNode && selected.getComponent() === 'terminal'
        ? (selected.getConfig() as TerminalPanelConfig)
        : undefined
    },
    getModel: (): Model => model,
    listPanelIds: (): string[] => {
      const ids: string[] = []
      model.visitNodes((node): void => {
        if (node instanceof TabNode) ids.push(node.getId())
      })
      return ids
    },
    movePanel: (panelId: string, targetGroupId: string): void => {
      model.doAction(Actions.moveNode(panelId, targetGroupId, DockLocation.CENTER, -1, true))
    },
    removePanel: (panelId: string): void => {
      if (model.getNodeById(panelId)) model.doAction(Actions.deleteTab(panelId))
    },
    openAgent: (panel: AgentPanelConfig, taskName: string, afterPanelId?: string, select = true): void => {
      if (model.getNodeById(panel.panelId)) {
        if (select) model.doAction(Actions.selectTab(panel.panelId))
        return
      }
      const tab: IJsonTabNode = {
        type: 'tab',
        component: 'agent',
        config: panel,
        enableRenderOnDemand: false,
        id: panel.panelId,
        name: taskName,
      }
      const source = afterPanelId ? model.getNodeById(afterPanelId) : undefined
      const sourceGroup = source?.getParent()
      const targetGroup = sourceGroup instanceof TabSetNode ? sourceGroup : activeGroup()
      const targetIndex = source ? targetGroup.getChildren().indexOf(source) + 1 : -1
      model.doAction(Actions.addTab(tab, targetGroup.getId(), DockLocation.CENTER, targetIndex, select))
    },
    serialize: (): WorkspaceLayoutSnapshot =>
      parseWorkspaceLayoutSnapshot({ version: 1, layout: sanitizeLayout(model) }),
    toggleMaximize: (groupId: string): void => {
      model.doAction(Actions.maximizeToggle(groupId))
    },
    updateTerminal: (panelId: string, panel: TerminalPanelConfig): void => {
      model.doAction(Actions.updateNodeAttributes(panelId, { config: panel }))
    },
  }
}
