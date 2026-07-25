import { Actions, Layout, TabNode, type Action } from 'flexlayout-react'
import { Columns2Icon, PanelRightOpenIcon, Rows2Icon, SquareTerminalIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fileDocumentKey, useFileDocumentStore } from '@/features/files/file-document-store'
import { FileEditorPanel } from '@/features/files/file-editor-panel'
import { WorkspaceNavigator } from '@/features/files/workspace-navigator'

import type { AdapterSummary, Task, Workspace } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from '../tasks/task-store'
import { AgentPanel } from './agent-panel'
import {
  createLayoutAdapter,
  type AgentPanelConfig,
  type FilePanelConfig,
  type TerminalPanelConfig,
  type WorkspaceLayoutAdapter,
} from './layout-adapter'
import { TerminalPanel } from './terminal-panel'

interface WorkspaceViewProps {
  workspace: Workspace
}

type TerminalPlacement = 'center' | 'right' | 'bottom'
const noTasks: never[] = []

interface WorkspaceToolbarProps {
  addTerminal: (placement: TerminalPlacement) => Promise<void>
  createTask: (name: string) => Promise<void>
  navigatorOpen: boolean
  openNavigator: () => void
}

const DefaultAdapterPicker = (): React.JSX.Element | null => {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([])
  useEffect((): void => {
    void window.lithe.adapters.list().then(setAdapters).catch(globalThis.console.error)
  }, [])
  if (adapters.some((adapter: AdapterSummary): boolean => adapter.isDefault)) return null
  const available = adapters.filter((adapter: AdapterSummary): boolean => adapter.isAvailable)
  return (
    <select
      aria-label="默认 Coding Agent"
      className="bg-background h-7 max-w-44 rounded-md border px-2 text-xs"
      defaultValue=""
      onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
        const adapter = available.find(
          (candidate: AdapterSummary): boolean => candidate.currentVersion.id === event.target.value,
        )
        if (!adapter) return
        void window.lithe.adapters
          .setDefault(adapter.currentVersion.id)
          .then((): void => {
            setAdapters((current: AdapterSummary[]): AdapterSummary[] =>
              current.map(
                (candidate: AdapterSummary): AdapterSummary => ({
                  ...candidate,
                  isDefault: candidate.currentVersion.id === adapter.currentVersion.id,
                }),
              ),
            )
          })
          .catch(globalThis.console.error)
      }}
    >
      <option disabled value="">
        选择默认 Agent
      </option>
      {available.map((adapter: AdapterSummary) => (
        <option key={adapter.id} value={adapter.currentVersion.id}>
          {adapter.name}
        </option>
      ))}
    </select>
  )
}

const WorkspaceToolbar = ({
  addTerminal,
  createTask,
  navigatorOpen,
  openNavigator,
}: WorkspaceToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [taskName, setTaskName] = useState('')
  const button = (
    placement: TerminalPlacement,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
  ): React.JSX.Element => (
    <Button
      onClick={(): void => {
        void addTerminal(placement).catch((error: unknown): void => {
          globalThis.console.error('Lithe terminal panel creation failed', error)
        })
      }}
      size="sm"
      variant="ghost"
    >
      <Icon />
      {label}
    </Button>
  )

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
      {button('center', t('terminal.new'), SquareTerminalIcon)}
      {button('right', t('terminal.horizontalSplit'), Columns2Icon)}
      {button('bottom', t('terminal.verticalSplit'), Rows2Icon)}
      {!navigatorOpen ? (
        <Button aria-label="打开右侧文件导航" onClick={openNavigator} size="sm" variant="ghost">
          <PanelRightOpenIcon />
          文件
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <DefaultAdapterPicker />
        <Input
          aria-label="任务名称"
          className="h-7 w-40"
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setTaskName(event.target.value)}
          placeholder="新任务"
          value={taskName}
        />
        <Button
          disabled={!taskName.trim()}
          onClick={(): void => {
            void createTask(taskName)
              .then((): void => setTaskName(''))
              .catch((): void => undefined)
          }}
          size="sm"
        >
          创建任务
        </Button>
      </div>
    </div>
  )
}

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
  const createTask = useTaskStore((state: TaskState) => state.createTask)
  const backgroundPanels = useTaskStore((state: TaskState) => state.backgroundPanels)
  const deletedTaskIds = useTaskStore((state: TaskState) => state.deletedTaskIds)
  const error = useTaskStore((state: TaskState) => state.error)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTaskId = useTaskStore((state: TaskState) => state.openTaskId)
  const openTaskAfterId = useTaskStore((state: TaskState) => state.openTaskAfterId)
  const tasks = useTaskStore((state: TaskState) => state.tasksByWorkspace[workspaceId] ?? noTasks)
  useEffect((): void => {
    void hydrateWorkspace(workspaceId)
  }, [hydrateWorkspace, workspaceId])
  useEffect((): void => {
    if (!layout || !openTaskId) return
    const task = tasks.find((candidate): boolean => candidate.id === openTaskId)
    if (!task) return
    layout.openAgent(
      { panelId: `agent:${task.id}`, taskId: task.id },
      task.name,
      openTaskAfterId ? `agent:${openTaskAfterId}` : undefined,
    )
  }, [layout, openTaskAfterId, openTaskId, tasks])
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
    for (const taskId of deletedTaskIds) {
      const panelId = `agent:${taskId}`
      if (!layout.listPanelIds().includes(panelId)) continue
      layout.removePanel(panelId)
      changed = true
    }
    if (changed) {
      void window.lithe.workspaceLayouts.save(workspaceId, layout.serialize()).catch(globalThis.console.error)
    }
  }, [deletedTaskIds, layout, workspaceId])
  return { createTask, error, tasks }
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

const useVisibleTaskReporting = (layout: WorkspaceLayoutAdapter | undefined): void => {
  useEffect((): (() => void) | undefined => {
    if (!layout) return undefined
    const report = (): void => reportVisibleTask(layout)
    report()
    globalThis.addEventListener('focus', report)
    return (): void => {
      globalThis.removeEventListener('focus', report)
      void window.lithe.tasks.setVisible(null).catch(globalThis.console.error)
    }
  }, [layout])
}

interface WorkspaceLayoutBodyProps {
  createTask: (workspaceId: string, name: string) => Promise<unknown>
  layout: WorkspaceLayoutAdapter
  taskError: string | null
  tasks: Task[]
  workspace: Workspace
}

const WorkspaceLayoutBody = ({
  createTask,
  layout,
  taskError,
  tasks,
  workspace,
}: WorkspaceLayoutBodyProps): React.JSX.Element => {
  const { t } = useTranslation()
  const navigation = useFileNavigation(workspace.id)
  const approvedCloseIds = useRef(new Set<string>())
  const addTerminal = async (placement: TerminalPlacement): Promise<void> => {
    const source = placement === 'center' ? undefined : layout.getActiveTerminalConfig()
    const shell = source?.shell ?? (await window.lithe.shells.getDefault())
    const panel: TerminalPanelConfig = {
      cwd: source?.cwd ?? workspace.rootPath,
      panelId: crypto.randomUUID(),
      shell,
    }
    layout.addTerminal(panel, {
      placement,
      targetGroupId: layout.getActiveGroupId(),
    })
  }
  const createNamedTask = async (name: string): Promise<void> => {
    await createTask(workspace.id, name)
  }
  const openFile = (relativePath: string): void => {
    layout.openFile(
      { panelId: `file:${crypto.randomUUID()}`, relativePath },
      relativePath.split('/').at(-1) ?? relativePath,
    )
  }
  return (
    <section
      className="flex size-full min-h-0 flex-col"
      aria-label={t('terminal.workspaceLabel', { name: workspace.name })}
    >
      <WorkspaceToolbar
        addTerminal={addTerminal}
        createTask={createNamedTask}
        navigatorOpen={navigation.open}
        openNavigator={(): void => navigation.setOpen(true)}
      />
      {taskError ? <p className="text-destructive border-b px-3 py-1 text-xs">{taskError}</p> : null}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
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
            realtimeResize
          />
        </div>
        {navigation.open ? (
          <WorkspaceNavigator
            onClose={(): void => navigation.setOpen(false)}
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

export const WorkspaceView = ({ workspace }: WorkspaceViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const layout = useHydratedLayout(workspace.id)
  const taskPanels = useWorkspaceTaskPanels(workspace.id, layout)
  useVisibleTaskReporting(layout)
  if (!layout) {
    return (
      <div className="text-muted-foreground grid size-full place-items-center text-sm">{t('terminal.restoring')}</div>
    )
  }
  return (
    <WorkspaceLayoutBody
      createTask={taskPanels.createTask}
      layout={layout}
      taskError={taskPanels.error}
      tasks={taskPanels.tasks}
      workspace={workspace}
    />
  )
}
