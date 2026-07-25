import { Layout, TabNode } from 'flexlayout-react'
import { Columns2Icon, Rows2Icon, SquareTerminalIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { AdapterSummary, Task, Workspace } from '../../../../shared/app-contract'
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
  workspace: Workspace
}

type TerminalPlacement = 'center' | 'right' | 'bottom'
const noTasks: never[] = []

interface WorkspaceToolbarProps {
  addTerminal: (placement: TerminalPlacement) => Promise<void>
  createTask: (name: string) => Promise<void>
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

const WorkspaceToolbar = ({ addTerminal, createTask }: WorkspaceToolbarProps): React.JSX.Element => {
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
    const config = node.getConfig() as TerminalPanelConfig
    return <TerminalPanel config={config} updateTerminal={layout.updateTerminal} workspaceId={workspaceId} />
  }

export const WorkspaceView = ({ workspace }: WorkspaceViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [layout, setLayout] = useState<WorkspaceLayoutAdapter>()
  const createTask = useTaskStore((state: TaskState) => state.createTask)
  const backgroundPanels = useTaskStore((state: TaskState) => state.backgroundPanels)
  const deletedTaskIds = useTaskStore((state: TaskState) => state.deletedTaskIds)
  const taskError = useTaskStore((state: TaskState) => state.error)
  const hydrateWorkspace = useTaskStore((state: TaskState) => state.hydrateWorkspace)
  const openTaskId = useTaskStore((state: TaskState) => state.openTaskId)
  const openTaskAfterId = useTaskStore((state: TaskState) => state.openTaskAfterId)
  const tasks = useTaskStore((state: TaskState) => state.tasksByWorkspace[workspace.id] ?? noTasks)

  useEffect((): (() => void) => {
    let active = true
    setLayout(undefined)
    void window.lithe.workspaceLayouts
      .get(workspace.id)
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
  }, [workspace.id])

  useEffect((): void => {
    void hydrateWorkspace(workspace.id)
  }, [hydrateWorkspace, workspace.id])

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
      if (event.launch.task.workspaceId !== workspace.id) continue
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
      void window.lithe.workspaceLayouts.save(workspace.id, layout.serialize()).catch(globalThis.console.error)
    }
  }, [backgroundPanels, layout, workspace.id])

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
      void window.lithe.workspaceLayouts.save(workspace.id, layout.serialize()).catch(globalThis.console.error)
    }
  }, [deletedTaskIds, layout, workspace.id])

  useEffect((): (() => void) | undefined => {
    if (!layout) return undefined
    const reportVisibleTask = (): void => {
      const selected = layout.getModel().getActiveTabset()?.getSelectedNode()
      const taskId =
        selected instanceof TabNode && selected.getComponent() === 'agent'
          ? (selected.getConfig() as AgentPanelConfig).taskId
          : null
      void window.lithe.tasks
        .setVisible(taskId)
        .then((): Promise<Task> | undefined => (taskId ? window.lithe.tasks.markViewed(taskId) : undefined))
        .catch(globalThis.console.error)
    }
    reportVisibleTask()
    globalThis.addEventListener('focus', reportVisibleTask)
    return (): void => {
      globalThis.removeEventListener('focus', reportVisibleTask)
      void window.lithe.tasks.setVisible(null).catch(globalThis.console.error)
    }
  }, [layout])

  const addTerminal = async (placement: TerminalPlacement): Promise<void> => {
    if (!layout) return
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

  if (!layout) {
    return (
      <div className="text-muted-foreground grid size-full place-items-center text-sm">{t('terminal.restoring')}</div>
    )
  }

  return (
    <section
      className="flex size-full min-h-0 flex-col"
      aria-label={t('terminal.workspaceLabel', { name: workspace.name })}
    >
      <WorkspaceToolbar addTerminal={addTerminal} createTask={createNamedTask} />
      {taskError ? <p className="text-destructive border-b px-3 py-1 text-xs">{taskError}</p> : null}
      <div className="relative min-h-0 flex-1">
        <Layout
          factory={createPanelFactory(layout, tasks, workspace.id)}
          model={layout.getModel()}
          onModelChange={(): void => {
            const selected = layout.getModel().getActiveTabset()?.getSelectedNode()
            const taskId =
              selected instanceof TabNode && selected.getComponent() === 'agent'
                ? (selected.getConfig() as AgentPanelConfig).taskId
                : null
            void window.lithe.tasks
              .setVisible(taskId)
              .then((): Promise<Task> | undefined => (taskId ? window.lithe.tasks.markViewed(taskId) : undefined))
              .catch(globalThis.console.error)
            void window.lithe.workspaceLayouts.save(workspace.id, layout.serialize()).catch((error: unknown): void => {
              globalThis.console.error('Lithe workspace layout persistence failed', error)
            })
          }}
          realtimeResize
        />
      </div>
    </section>
  )
}
