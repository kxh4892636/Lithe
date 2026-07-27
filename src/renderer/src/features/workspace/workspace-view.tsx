import { Layout, TabNode, TabSetNode } from 'flexlayout-react'
import { PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { disposeTerminalView } from '@/features/terminal-view'

import type { Task, Workspace } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { AgentPanel } from './agent-panel'
import {
  createLayoutAdapter,
  type AgentPanelConfig,
  type TerminalPanelConfig,
  type WorkspaceLayoutAdapter,
} from './layout-adapter'
import { TerminalPanel } from './terminal-panel'

interface WorkspaceViewProps {
  visible: boolean
  workspace: Workspace
}

const noTasks: never[] = []

type PanelFactory = (node: TabNode) => React.ReactNode

const createPanelFactory =
  (layout: WorkspaceLayoutAdapter, tasks: Task[], workspaceId: string): PanelFactory =>
  (node: TabNode): React.ReactNode => {
    if (node.getComponent() === 'agent') {
      const config = node.getConfig() as AgentPanelConfig
      const task = tasks.find((candidate: Task): boolean => candidate.id === config.taskId)
      return task ? <AgentPanel config={config} task={task} /> : null
    }
    const config = node.getConfig() as TerminalPanelConfig
    return <TerminalPanel config={config} updateTerminal={layout.updateTerminal} workspaceId={workspaceId} />
  }

const useHydratedLayout = (workspaceId: string): WorkspaceLayoutAdapter | undefined => {
  const [layout, setLayout] = useState<WorkspaceLayoutAdapter>()
  useEffect((): (() => void) => {
    let active = true
    setLayout(undefined)
    void window.lithe.workspaceLayouts
      .get(workspaceId)
      .then((snapshot): void => {
        if (active) setLayout(createLayoutAdapter(snapshot ?? undefined))
      })
      .catch((error: unknown): void => {
        if (active) setLayout(createLayoutAdapter())
        globalThis.console.error('Lithe workspace layout hydration failed', error)
      })
    return (): void => {
      active = false
    }
  }, [workspaceId])
  return layout
}

const useWorkspaceTaskPanels = (workspaceId: string, layout: WorkspaceLayoutAdapter | undefined) => {
  const archivedTasks = useTaskStore((state: TaskState) => state.archivedTasks)
  const backgroundPanels = useTaskStore((state: TaskState) => state.backgroundPanels)
  const clearOpenTask = useTaskStore((state: TaskState) => state.clearOpenTask)
  const consumePanelRemovals = useTaskStore((state: TaskState) => state.consumePanelRemovals)
  const deletedTaskIds = useTaskStore((state: TaskState) => state.deletedTaskIds)
  const error = useTaskStore((state: TaskState) => state.error)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTaskId = useTaskStore((state: TaskState) => state.openTaskId)
  const openTaskAfterId = useTaskStore((state: TaskState) => state.openTaskAfterId)
  const panelRemovals = useTaskStore((state: TaskState) => state.panelRemovals)
  const tasks = useTaskStore((state: TaskState) => state.tasksByWorkspace[workspaceId] ?? noTasks)
  useEffect((): void => {
    void hydrateWorkspace(workspaceId)
  }, [hydrateWorkspace, workspaceId])
  // ADR 0069：openTaskId 是一次性「打开并聚焦」命令，成功消费后即清除；
  // 之后关闭或切换面板是有效终态，任务事件不再复活已关闭的面板。
  useEffect((): void => {
    if (!layout || !openTaskId) return
    const task = tasks.find((candidate): boolean => candidate.id === openTaskId)
    if (!task) return
    layout.openAgent(
      { panelId: `agent:${task.id}`, taskId: task.id },
      task.name,
      openTaskAfterId ? `agent:${openTaskAfterId}` : undefined,
    )
    clearOpenTask()
  }, [clearOpenTask, layout, openTaskAfterId, openTaskId, tasks])
  useEffect((): void => {
    if (!layout) return
    let changed = false
    for (const event of backgroundPanels) {
      if (event.launch.task.workspaceId !== workspaceId) continue
      const panelId = `agent:${event.launch.task.id}`
      if (layout.listPanelIds().includes(panelId)) continue
      layout.openAgent(
        { panelId, taskId: event.launch.task.id },
        event.launch.task.name,
        event.afterTaskId ? `agent:${event.afterTaskId}` : undefined,
        false,
      )
      changed = true
    }
    if (changed) {
      void window.lithe.workspaceLayouts.save(workspaceId, layout.serialize()).catch(globalThis.console.error)
    }
  }, [backgroundPanels, layout, workspaceId])
  useEffect((): void => {
    if (!layout) return
    let changed = false
    for (const task of archivedTasks) {
      if (task.workspaceId !== workspaceId) continue
      const panelId = `agent:${task.id}`
      disposeTerminalView(panelId)
      if (!layout.listPanelIds().includes(panelId)) continue
      layout.removePanel(panelId)
      changed = true
    }
    if (changed) {
      void window.lithe.workspaceLayouts.save(workspaceId, layout.serialize()).catch(globalThis.console.error)
    }
  }, [archivedTasks, layout, workspaceId])
  useEffect((): void => {
    if (!layout) return
    const removals = panelRemovals.filter((removal): boolean => removal.workspaceId === workspaceId)
    if (removals.length === 0) return
    let changed = false
    for (const removal of removals) {
      const panelId = `agent:${removal.taskId}`
      if (!layout.listPanelIds().includes(panelId)) continue
      layout.removePanel(panelId)
      changed = true
    }
    if (changed) {
      void window.lithe.workspaceLayouts.save(workspaceId, layout.serialize()).catch(globalThis.console.error)
    }
    consumePanelRemovals(workspaceId)
  }, [consumePanelRemovals, layout, panelRemovals, workspaceId])
  useEffect((): void => {
    if (!layout) return
    let changed = false
    for (const taskId of deletedTaskIds) {
      const panelId = `agent:${taskId}`
      disposeTerminalView(panelId)
      if (!layout.listPanelIds().includes(panelId)) continue
      layout.removePanel(panelId)
      changed = true
    }
    if (changed) {
      void window.lithe.workspaceLayouts.save(workspaceId, layout.serialize()).catch(globalThis.console.error)
    }
  }, [deletedTaskIds, layout, workspaceId])
  return { error, tasks }
}

const selectedTaskId = (layout: WorkspaceLayoutAdapter): string | null => {
  const selected = layout.getModel().getActiveTabset()?.getSelectedNode()
  return selected instanceof TabNode && selected.getComponent() === 'agent'
    ? (selected.getConfig() as AgentPanelConfig).taskId
    : null
}

const reportVisibleTask = (layout: WorkspaceLayoutAdapter): void => {
  const taskId = selectedTaskId(layout)
  useTaskStore.getState().setVisibleTaskId(taskId)
  void window.lithe.tasks
    .setVisible(taskId)
    .then((): Promise<Task> | undefined => (taskId ? window.lithe.tasks.markViewed(taskId) : undefined))
    .catch(globalThis.console.error)
}

const useVisibleTaskReporting = (layout: WorkspaceLayoutAdapter | undefined, visible: boolean): void => {
  useEffect((): (() => void) | undefined => {
    if (!layout || !visible) return undefined
    const report = (): void => reportVisibleTask(layout)
    report()
    globalThis.addEventListener('focus', report)
    return (): void => {
      globalThis.removeEventListener('focus', report)
      useTaskStore.getState().setVisibleTaskId(null)
      void window.lithe.tasks.setVisible(null).catch(globalThis.console.error)
    }
  }, [layout, visible])
}

interface WorkspaceLayoutBodyProps {
  layout: WorkspaceLayoutAdapter
  taskError: string | null
  tasks: Task[]
  workspace: Workspace
}

const WorkspaceLayoutBody = ({ layout, taskError, tasks, workspace }: WorkspaceLayoutBodyProps): React.JSX.Element => {
  const { t } = useTranslation()
  const addTerminal = async (targetGroupId: string): Promise<void> => {
    const shell = await window.lithe.shells.getDefault()
    const panel: TerminalPanelConfig = {
      cwd: workspace.rootPath,
      panelId: crypto.randomUUID(),
      shell,
    }
    layout.addTerminal(panel, {
      placement: 'center',
      targetGroupId,
    })
  }
  return (
    <section
      className="flex size-full min-h-0 flex-col overflow-hidden"
      data-slot="workspace-main"
      aria-label={t('terminal.workspaceLabel', { name: workspace.name })}
    >
      {taskError ? <p className="text-destructive border-b px-3 py-1 text-xs">{taskError}</p> : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <Layout
            factory={createPanelFactory(layout, tasks, workspace.id)}
            model={layout.getModel()}
            onModelChange={(): void => {
              reportVisibleTask(layout)
              void window.lithe.workspaceLayouts
                .save(workspace.id, layout.serialize())
                .catch((error: unknown): void => {
                  globalThis.console.error('Lithe workspace layout persistence failed', error)
                })
            }}
            onRenderTabSet={(node, renderValues): void => {
              if (!(node instanceof TabSetNode)) return
              renderValues.stickyButtons.push(
                <Button
                  aria-label="在此标签组新建终端"
                  key={`terminal:${node.getId()}`}
                  onClick={(): void => {
                    void addTerminal(node.getId()).catch(globalThis.console.error)
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <PlusIcon />
                </Button>,
              )
            }}
            realtimeResize
          />
        </div>
      </div>
    </section>
  )
}

export const WorkspaceView = (props: WorkspaceViewProps): React.JSX.Element => {
  const { visible, workspace } = props
  const { t } = useTranslation()
  const layout = useHydratedLayout(workspace.id)
  const taskPanels = useWorkspaceTaskPanels(workspace.id, layout)
  useVisibleTaskReporting(layout, visible)
  if (!layout) {
    return (
      <div className={visible ? 'text-muted-foreground grid size-full place-items-center text-sm' : 'hidden'}>
        {t('terminal.restoring')}
      </div>
    )
  }
  return (
    <div className={visible ? 'size-full' : 'hidden'}>
      <WorkspaceLayoutBody
        layout={layout}
        taskError={taskPanels.error}
        tasks={taskPanels.tasks}
        workspace={workspace}
      />
    </div>
  )
}
