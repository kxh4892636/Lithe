import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjectStore } from '@/features/projects/project-store'

import type { AdapterSummary, Workspace } from '../../../../shared/app-contract'
import { useTaskStore } from './task-store'

const drafts = new Map<string, string>()

interface TaskCreateDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
  workspace: Workspace | null
}

export const TaskCreateDialog = ({ onOpenChange, open, workspace }: TaskCreateDialogProps): React.JSX.Element => {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([])
  const [adapterId, setAdapterId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createTask = useTaskStore((state) => state.createTask)
  const selectWorkspace = useProjectStore((state) => state.selectWorkspace)
  const available = useMemo(
    (): AdapterSummary[] =>
      adapters
        .filter((adapter): boolean => adapter.isAvailable)
        .sort(
          (left, right): number =>
            right.usageCount - left.usageCount ||
            Number(right.isDefault) - Number(left.isDefault) ||
            left.name.localeCompare(right.name),
        ),
    [adapters],
  )

  useEffect((): void => {
    if (!open || !workspace) return
    setName(drafts.get(workspace.id) ?? '')
    setError(null)
    void window.lithe.adapters
      .list()
      .then((items): void => {
        setAdapters(items)
        setAdapterId(items.find((adapter): boolean => adapter.isDefault && adapter.isAvailable)?.id ?? null)
      })
      .catch((cause: unknown): void => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [open, workspace])

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!workspace || !adapterId || !name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await selectWorkspace(workspace.id)
      await createTask(workspace.id, name, adapterId)
      drafts.delete(workspace.id)
      onOpenChange(false)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建任务</DialogTitle>
          <DialogDescription>{workspace ? `在“${workspace.name}”中启动新的 Agent 会话。` : ''}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event): void => void submit(event)}>
          <label className="grid gap-1.5 text-xs font-medium" htmlFor="task-name">
            任务名称
            <Input
              id="task-name"
              onChange={(event): void => {
                const value = event.target.value
                setName(value)
                if (workspace) drafts.set(workspace.id, value)
              }}
              placeholder="例如：修复登录流程"
              value={name}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium" htmlFor="task-adapter">
            Coding Agent
            <Select<string>
              disabled={available.length === 0}
              id="task-adapter"
              items={available.map((adapter) => ({ label: adapter.name, value: adapter.id }))}
              onValueChange={(value): void => setAdapterId(value)}
              value={adapterId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择 Adapter" />
              </SelectTrigger>
              <SelectContent className="max-h-52">
                {available.map((adapter) => (
                  <SelectItem className="h-8 text-xs" key={adapter.id} value={adapter.id}>
                    <span>{adapter.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{adapter.usageCount}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              没有可用的 Coding Agent。{' '}
              <Link className="text-primary underline-offset-4 hover:underline" to="/settings">
                打开设置
              </Link>
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button onClick={(): void => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={submitting || !name.trim() || !adapterId} type="submit">
              创建任务
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
