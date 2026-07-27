import { FolderIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

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

import { useProjectStore } from './project-store'

interface ProjectCreateDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
}

const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''

export const ProjectCreateDialog = (props: ProjectCreateDialogProps): React.JSX.Element => {
  const { onOpenChange, open } = props
  const createProject = useProjectStore((state) => state.createProject)
  const isLoading = useProjectStore((state) => state.isLoading)
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState<string>()
  useEffect((): void => {
    if (!open) return
    setName('')
    setSourcePath(undefined)
  }, [open])
  const pickSourceFolder = async (): Promise<void> => {
    const selected = await window.lithe.projects.pickSourceFolder()
    if (!selected) return
    setSourcePath(selected)
    setName((current): string => current.trim() || folderName(selected))
  }
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>创建项目</DialogTitle>
          <DialogDescription>选择已有文件夹，或不选择 Source folder 创建空白项目。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event): void => {
            event.preventDefault()
            void createProject({ name, ...(sourcePath ? { sourcePath } : {}) })
              .then((): void => onOpenChange(false))
              .catch(globalThis.console.error)
          }}
        >
          <Input
            aria-label="项目名称"
            onChange={(event): void => setName(event.target.value)}
            placeholder="项目名称"
            value={name}
          />
          <div className="space-y-2">
            <p className="text-xs font-medium">Source folder</p>
            {sourcePath ? (
              <div className="border-border flex h-11 items-center gap-2 rounded-lg border px-3">
                <FolderIcon className="text-muted-foreground size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-xs" title={sourcePath}>
                  {sourcePath}
                </span>
                <Button
                  aria-label="移除 Source folder"
                  onClick={(): void => setSourcePath(undefined)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            ) : (
              <button
                className="border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border text-xs transition-colors"
                onClick={(): void => {
                  void pickSourceFolder().catch(globalThis.console.error)
                }}
                type="button"
              >
                <FolderIcon className="size-3" />
                <span>选择已有文件夹</span>
              </button>
            )}
          </div>
          <DialogFooter>
            <Button onClick={(): void => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={!name.trim() || isLoading} type="submit">
              创建项目
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
