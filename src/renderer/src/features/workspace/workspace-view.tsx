import { Actions, Layout, TabNode, TabSetNode, type Action } from 'flexlayout-react'
import { PanelRightOpenIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { fileDocumentKey, useFileDocumentStore } from '@/features/files/file-document-store'
import { FileEditorPanel } from '@/features/files/file-editor-panel'
import { WorkspaceNavigator } from '@/features/files/workspace-navigator'
import { GitDiffPanel } from '@/features/git-diff/git-diff-panel'
import { disposeTerminalView } from '@/features/terminal-view'

import type { GitChangeEntry, Task, Workspace } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { AgentPanel } from './agent-panel'
import {
  createLayoutAdapter,
  type AgentPanelConfig,
  type FilePanelConfig,
  type GitDiffPanelConfig,
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
    if (node.getComponent() === 'file') {
      const config = node.getConfig() as FilePanelConfig
      return <FileEditorPanel relativePath={config.relativePath} workspaceId={workspaceId} />
    }
    if (node.getComponent() === 'git-diff') {
      const config = node.getConfig() as GitDiffPanelConfig
      return <GitDiffPanel kind={config.kind} relativePath={config.relativePath} workspaceId={workspaceId} />
    }
    const config = node.getConfig() as TerminalPanelConfig
    return <TerminalPanel config={config} updateTerminal={layout.updateTerminal} workspaceId={workspaceId} />
  }

const fileViewCount = (layout: WorkspaceLayoutAdapter, relativePath: string): number => {
  let count = 0
  layout.getModel().visitNodes((node): void => {
    if (
      node instanceof TabNode &&
      node.getComponent() === 'file' &&
      (node.getConfig() as FilePanelConfig).relativePath === relativePath
    ) {
      count += 1
    }
  })
  return count
}

const handleCloseAction = (
  action: Action,
  approved: Set<string>,
  layout: WorkspaceLayoutAdapter,
  workspaceId: string,
): Action | undefined => {
  if (action.type !== Actions.DELETE_TAB) return action
  const panelId = String(action.data.node)
  if (approved.delete(panelId)) return action
  const node = layout.getModel().getNodeById(panelId)
  if (!(node instanceof TabNode) || node.getComponent() !== 'file') return action
  const config = node.getConfig() as FilePanelConfig
  const document = useFileDocumentStore.getState().documents[fileDocumentKey(workspaceId, config.relativePath)]
  if (!document?.dirty || fileViewCount(layout, config.relativePath) > 1) return action
  void window.lithe.files.closeLastView(workspaceId, config.relativePath).then((result): void => {
    if (result === 'cancel') return
    useFileDocumentStore.getState().close(workspaceId, config.relativePath)
    approved.add(panelId)
    layout.getModel().doAction(Actions.deleteTab(panelId))
  })
  return undefined
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

const useFileNavigation = (workspaceId: string) => {
  const [open, setOpen] = useState(
    (): boolean => localStorage.getItem(`lithe:navigator:${workspaceId}:open`) !== 'false',
  )
  const [showIgnored, setShowIgnored] = useState(
    (): boolean => localStorage.getItem(`lithe:navigator:${workspaceId}:ignored`) === 'true',
  )
  const [width, setWidth] = useState(
    (): number => Number(localStorage.getItem(`lithe:navigator:${workspaceId}:width`)) || 288,
  )
  useEffect((): (() => void) => {
    setOpen(localStorage.getItem(`lithe:navigator:${workspaceId}:open`) !== 'false')
    setShowIgnored(localStorage.getItem(`lithe:navigator:${workspaceId}:ignored`) === 'true')
    setWidth(Number(localStorage.getItem(`lithe:navigator:${workspaceId}:width`)) || 288)
    return window.lithe.files.onChanged((event): void => {
      if (event.workspaceId === workspaceId && event.type === 'change') {
        void useFileDocumentStore.getState().handleExternalChange(workspaceId, event.relativePath)
      }
    })
  }, [workspaceId])
  const updateOpen = (value: boolean): void => {
    setOpen(value)
    localStorage.setItem(`lithe:navigator:${workspaceId}:open`, String(value))
  }
  const updateIgnored = (value: boolean): void => {
    setShowIgnored(value)
    localStorage.setItem(`lithe:navigator:${workspaceId}:ignored`, String(value))
  }
  const updateWidth = (value: number): void => {
    const next = Math.min(560, Math.max(220, value))
    setWidth(next)
    localStorage.setItem(`lithe:navigator:${workspaceId}:width`, String(next))
  }
  return { open, setOpen: updateOpen, setShowIgnored: updateIgnored, setWidth: updateWidth, showIgnored, width }
}

const useWorkspaceTaskPanels = (workspaceId: string, layout: WorkspaceLayoutAdapter | undefined) => {
  const archivedTasks = useTaskStore((state: TaskState) => state.archivedTasks)
  const backgroundPanels = useTaskStore((state: TaskState) => state.backgroundPanels)
  const clearOpenTask = useTaskStore((state: TaskState) => state.clearOpenTask)
  const deletedTaskIds = useTaskStore((state: TaskState) => state.deletedTaskIds)
  const error = useTaskStore((state: TaskState) => state.error)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTaskId = useTaskStore((state: TaskState) => state.openTaskId)
  const openTaskAfterId = useTaskStore((state: TaskState) => state.openTaskAfterId)
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
    for (const task of archivedTasks) {
      if (task.workspaceId === workspaceId) disposeTerminalView(`agent:${task.id}`)
    }
  }, [archivedTasks, workspaceId])
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
      void window.lithe.tasks.setVisible(null).catch(globalThis.console.error)
    }
  }, [layout, visible])
}

const topRightTabsetId = (layout: WorkspaceLayoutAdapter): string => {
  const tabsets: TabSetNode[] = []
  layout.getModel().visitNodes((node): void => {
    if (node instanceof TabSetNode) tabsets.push(node)
  })
  return (
    tabsets
      .sort((left, right): number => {
        const leftRect = left.getRect()
        const rightRect = right.getRect()
        return leftRect.y - rightRect.y || rightRect.x + rightRect.width - (leftRect.x + leftRect.width)
      })
      .at(0)
      ?.getId() ?? layout.getActiveGroupId()
  )
}

interface WorkspaceLayoutBodyProps {
  layout: WorkspaceLayoutAdapter
  taskError: string | null
  tasks: Task[]
  workspace: Workspace
}

const WorkspaceLayoutBody = ({ layout, taskError, tasks, workspace }: WorkspaceLayoutBodyProps): React.JSX.Element => {
  const { t } = useTranslation()
  const navigation = useFileNavigation(workspace.id)
  const approvedCloseIds = useRef(new Set<string>())
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
  const openFile = (relativePath: string): void => {
    layout.openFile(
      { panelId: `file:${crypto.randomUUID()}`, relativePath },
      relativePath.split('/').at(-1) ?? relativePath,
    )
  }
  const openDiff = (change: GitChangeEntry): void => {
    layout.openDiff(
      { kind: change.kind, panelId: `git-diff:${crypto.randomUUID()}`, relativePath: change.relativePath },
      change.relativePath.split('/').at(-1) ?? change.relativePath,
    )
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
            onAction={(action): Action | undefined =>
              handleCloseAction(action, approvedCloseIds.current, layout, workspace.id)
            }
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
              renderValues.buttons.push(
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
              if (!navigation.open && node.getId() === topRightTabsetId(layout)) {
                renderValues.buttons.push(
                  <Button
                    aria-label="打开右侧文件导航"
                    key={`navigator:${node.getId()}`}
                    onClick={(): void => navigation.setOpen(true)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <PanelRightOpenIcon />
                  </Button>,
                )
              }
            }}
            realtimeResize
          />
        </div>
        {navigation.open ? (
          <WorkspaceNavigator
            key={workspace.id}
            onClose={(): void => navigation.setOpen(false)}
            onOpenDiff={openDiff}
            onOpenFile={openFile}
            onShowIgnoredChange={navigation.setShowIgnored}
            onWidthChange={navigation.setWidth}
            showIgnored={navigation.showIgnored}
            width={navigation.width}
            workspaceId={workspace.id}
          />
        ) : null}
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
