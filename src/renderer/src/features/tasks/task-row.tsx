import { ArchiveIcon, BotIcon, CircleIcon, GitForkIcon, PencilIcon, SquareIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

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
  task: Task
}

export const TaskRow = ({ adapter, onOpen, task }: TaskRowProps): React.JSX.Element => {
  const archiveTask = useTaskStore((state: TaskState) => state.archiveTask)
  const forkTask = useTaskStore((state: TaskState) => state.forkTask)
  const launch = useTaskStore((state: TaskState) => state.launchesByTask[task.id])
  const stopTask = useTaskStore((state: TaskState) => state.stopTask)
  const [renaming, setRenaming] = useState(false)
  const isRunning = launch?.isRunning ?? task.isRunning
  const canFork = Boolean(task.agentSessionId && adapter?.forkAvailable)
  const fork = (): void => reportTaskAction(forkTask(task.id))
  const archive = (): void => reportTaskAction(archiveTask(task.id))
  const stop = (): void => reportTaskAction(stopTask(task.id))
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div className="group/task flex items-center focus-within:bg-sidebar-accent/50 hover:bg-sidebar-accent/50" />
          }
        >
          <button
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1 py-1 pl-7 text-left text-xs"
            onClick={onOpen}
            type="button"
          >
            {isRunning ? (
              <CircleIcon className="size-3 shrink-0 fill-emerald-500 text-emerald-500" />
            ) : (
              <BotIcon className="size-3 shrink-0" />
            )}
            <Badge className="h-4 shrink-0 px-1 text-[9px]" variant="secondary">
              {adapter?.name ?? 'agent'}
            </Badge>
            <span className={task.isUnread ? 'text-foreground truncate font-medium' : 'truncate'}>-{task.name}</span>
            {task.isUnread ? <span className="bg-primary ml-auto size-1.5 rounded-full" aria-label="未读" /> : null}
          </button>
          <div className="invisible flex items-center pr-1 group-focus-within/task:visible group-hover/task:visible">
            {canFork ? (
              <Button aria-label={`Fork ${task.name}`} onClick={fork} size="icon-xs" title="Fork" variant="ghost">
                <GitForkIcon />
              </Button>
            ) : null}
            <Button
              aria-label={`归档 ${task.name}`}
              disabled={isRunning}
              onClick={archive}
              size="icon-xs"
              title={isRunning ? '运行中任务不能归档' : '归档'}
              variant="ghost"
            >
              <ArchiveIcon />
            </Button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={(): void => setRenaming(true)}>
            <PencilIcon />
            重命名
          </ContextMenuItem>
          {canFork ? (
            <ContextMenuItem onClick={fork}>
              <GitForkIcon />
              Fork
            </ContextMenuItem>
          ) : null}
          {isRunning ? (
            <ContextMenuItem onClick={stop}>
              <SquareIcon />
              停止
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem disabled={isRunning} onClick={archive}>
            <ArchiveIcon />
            归档
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <TaskRenameDialog onOpenChange={setRenaming} open={renaming} task={task} />
    </>
  )
}
