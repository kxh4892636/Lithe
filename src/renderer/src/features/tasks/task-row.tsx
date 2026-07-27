import { ArchiveIcon, BotIcon, CircleIcon, GitForkIcon, PencilIcon, SquareIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import type { AdapterSummary, Task } from '../../../../shared/app-contract'
import { useTaskStore, type TaskState } from './task-store'

const reportTaskAction = (action: Promise<unknown>): void => {
  void action.catch(globalThis.console.error)
}

interface TaskRenameDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
  task: Task
}

const TaskRenameDialog = ({ onOpenChange, open, task }: TaskRenameDialogProps): React.JSX.Element => {
  const renameTask = useTaskStore((state: TaskState) => state.renameTask)
  const [name, setName] = useState(task.name)
  useEffect((): void => {
    if (open) setName(task.name)
  }, [open, task.name])
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名任务</DialogTitle>
          <DialogDescription>只修改任务显示名称。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event): void => {
            event.preventDefault()
            reportTaskAction(renameTask(task.id, name).then((): void => onOpenChange(false)))
          }}
        >
          <Input aria-label="任务名称" onChange={(event): void => setName(event.target.value)} value={name} />
          <DialogFooter>
            <Button onClick={(): void => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={!name.trim()} type="submit">
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface TaskRowProps {
  adapter?: AdapterSummary
  onOpen: () => void
  selected?: boolean
  task: Task
}

interface TaskActionsProps {
  archive: () => void
  canStop: boolean
  fork: () => void
  forkDisabledReason: string | null
  isRunning: boolean
  onRename: () => void
  stop: () => void
  taskName: string
}

interface TaskToolbarProps extends TaskActionsProps {
  containerRef: RefObject<HTMLDivElement | null>
}

interface TaskTitleProps {
  actionsRef: RefObject<HTMLDivElement | null>
  name: string
}

interface TaskTitleMetrics {
  distance: number
  overflow: boolean
}

const taskTitleGap = 32
const taskTitleSpeed = 30

const TaskTitle = (props: TaskTitleProps): React.JSX.Element => {
  const { actionsRef, name } = props
  const textRef = useRef<HTMLSpanElement>(null)
  const viewportRef = useRef<HTMLSpanElement>(null)
  const [metrics, setMetrics] = useState<TaskTitleMetrics>({ distance: 0, overflow: false })
  const measure = useCallback((): void => {
    const textWidth = textRef.current?.scrollWidth ?? 0
    const viewportWidth = viewportRef.current?.clientWidth ?? 0
    const actionsWidth = actionsRef.current?.offsetWidth ?? 0
    const overflow = textWidth > Math.max(0, viewportWidth - actionsWidth)
    const distance = overflow ? textWidth + taskTitleGap : 0
    setMetrics(
      (current): TaskTitleMetrics =>
        current.distance === distance && current.overflow === overflow ? current : { distance, overflow },
    )
  }, [actionsRef])
  useLayoutEffect((): (() => void) => {
    measure()
    if (!globalThis.ResizeObserver) return (): void => undefined
    const observer = new ResizeObserver(measure)
    if (viewportRef.current) observer.observe(viewportRef.current)
    if (textRef.current) observer.observe(textRef.current)
    if (actionsRef.current) observer.observe(actionsRef.current)
    return (): void => observer.disconnect()
  }, [actionsRef, measure, name])
  const style = {
    '--task-title-distance': `${metrics.distance}px`,
    '--task-title-duration': `${metrics.distance / taskTitleSpeed}s`,
  } as CSSProperties
  return (
    <span
      className="min-w-0 flex-1 overflow-hidden"
      data-overflow={String(metrics.overflow)}
      data-slot="task-title"
      ref={viewportRef}
      style={style}
      title={name}
    >
      <span className="task-title-track">
        <span ref={textRef}>{name}</span>
        {metrics.overflow ? (
          <span aria-hidden className="ml-8">
            {name}
          </span>
        ) : null}
      </span>
    </span>
  )
}

const TaskToolbar = (props: TaskToolbarProps): React.JSX.Element => {
  const { archive, containerRef, fork, forkDisabledReason, isRunning, taskName } = props
  return (
    <div
      className="invisible absolute top-1/2 right-0 z-10 flex -translate-y-1/2 items-center group-focus-within/task:visible group-hover/task:visible"
      data-slot="task-actions"
      ref={containerRef}
    >
      <Button
        aria-label={`Fork ${taskName}`}
        disabled={forkDisabledReason !== null}
        onClick={fork}
        size="icon-xs"
        title={forkDisabledReason ?? 'Fork'}
        variant="ghost"
      >
        <GitForkIcon />
      </Button>
      <Button
        aria-label={`归档 ${taskName}`}
        disabled={isRunning}
        onClick={archive}
        size="icon-xs"
        title={isRunning ? '运行中任务不能归档' : '归档'}
        variant="ghost"
      >
        <ArchiveIcon />
      </Button>
    </div>
  )
}

const TaskContextMenu = (props: TaskActionsProps): React.JSX.Element => {
  const { archive, canStop, fork, forkDisabledReason, isRunning, onRename, stop } = props
  return (
    <ContextMenuContent className="[&_svg]:size-3">
      <ContextMenuItem onClick={onRename}>
        <PencilIcon className="size-3" />
        重命名
      </ContextMenuItem>
      <ContextMenuItem disabled={forkDisabledReason !== null} onClick={fork} title={forkDisabledReason ?? 'Fork'}>
        <GitForkIcon className="size-3" />
        Fork
      </ContextMenuItem>
      {canStop ? (
        <ContextMenuItem onClick={stop}>
          <SquareIcon className="size-3" />
          停止
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={isRunning} onClick={archive}>
        <ArchiveIcon className="size-3" />
        归档
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export const TaskRow = ({ adapter, onOpen, selected, task }: TaskRowProps): React.JSX.Element => {
  const archiveTask = useTaskStore((state: TaskState) => state.archiveTask)
  const forkTask = useTaskStore((state: TaskState) => state.forkTask)
  const stopTask = useTaskStore((state: TaskState) => state.stopTask)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const isRunning = task.agentStatus === 'running'
  const canStop = task.agentStatus !== 'closed'
  const forkDisabledReason = isRunning
    ? '请先停止任务'
    : !task.agentSessionId
      ? '任务尚未绑定 Agent 会话'
      : !adapter?.forkAvailable
        ? '当前 Adapter 不支持 Fork'
        : null
  const fork = (): void => reportTaskAction(forkTask(task.id))
  const archive = (): void => reportTaskAction(archiveTask(task.id))
  const stop = (): void => reportTaskAction(stopTask(task.id))
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={
                selected
                  ? 'group/task relative flex items-center rounded-md bg-sidebar-accent/60 ml-3 mt-0.5'
                  : 'group/task relative flex items-center rounded-md hover:bg-sidebar-accent/50 focus-within:bg-sidebar-accent/50 ml-3 mt-0.5'
              }
              data-selected={String(selected ?? false)}
            />
          }
        >
          <button
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1 py-1 pl-2 text-left text-sm"
            onClick={onOpen}
            type="button"
          >
            {task.agentStatus === 'running' ? (
              <span aria-label="运行中" title="运行中">
                <CircleIcon aria-hidden className="size-3 shrink-0 fill-emerald-500 text-emerald-500" />
              </span>
            ) : task.agentStatus === 'idle' ? (
              <span aria-label="空闲" title="空闲">
                <CircleIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              </span>
            ) : (
              <span aria-label="关闭" title="关闭">
                <BotIcon aria-hidden className="size-3 shrink-0" />
              </span>
            )}
            <Badge className="h-4 shrink-0 px-1 text-xs" variant="secondary">
              {adapter?.name ?? 'agent'}
            </Badge>
            <TaskTitle actionsRef={actionsRef} name={task.name} />
            {task.isUnread ? <span className="bg-unread ml-auto size-1.5 rounded-full" aria-label="未读" /> : null}
          </button>
          <TaskToolbar
            archive={archive}
            canStop={canStop}
            containerRef={actionsRef}
            fork={fork}
            forkDisabledReason={forkDisabledReason}
            isRunning={isRunning}
            onRename={(): void => setRenaming(true)}
            stop={stop}
            taskName={task.name}
          />
        </ContextMenuTrigger>
        <TaskContextMenu
          archive={archive}
          canStop={canStop}
          fork={fork}
          forkDisabledReason={forkDisabledReason}
          isRunning={isRunning}
          onRename={(): void => setRenaming(true)}
          stop={stop}
          taskName={task.name}
        />
      </ContextMenu>
      <TaskRenameDialog onOpenChange={setRenaming} open={renaming} task={task} />
    </>
  )
}
