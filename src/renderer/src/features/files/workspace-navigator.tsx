import { EyeOffIcon, PanelRightCloseIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { FileTree } from './file-tree'

interface WorkspaceNavigatorProps {
  onClose: () => void
  onOpenFile: (relativePath: string) => void
  onShowIgnoredChange: (show: boolean) => void
  onWidthChange: (width: number) => void
  showIgnored: boolean
  width: number
  workspaceId: string
}

export const WorkspaceNavigator = ({
  onClose,
  onOpenFile,
  onShowIgnoredChange,
  onWidthChange,
  showIgnored,
  width,
  workspaceId,
}: WorkspaceNavigatorProps): React.JSX.Element => (
  <aside
    className="bg-background relative flex min-h-0 shrink-0 flex-col border-l"
    aria-label="工作区文件导航"
    style={{ width }}
  >
    <hr
      aria-label="调整右侧导航宽度"
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
      onPointerDown={(event): void => {
        const startX = event.clientX
        const startWidth = width
        const move = (moveEvent: PointerEvent): void => onWidthChange(startWidth + startX - moveEvent.clientX)
        const stop = (): void => {
          globalThis.removeEventListener('pointermove', move)
          globalThis.removeEventListener('pointerup', stop)
        }
        globalThis.addEventListener('pointermove', move)
        globalThis.addEventListener('pointerup', stop)
      }}
    />
    <header className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <span className="flex-1 text-xs font-medium">文件</span>
      <Button
        aria-label={showIgnored ? '隐藏 Git 忽略文件' : '显示 Git 忽略文件'}
        onClick={(): void => onShowIgnoredChange(!showIgnored)}
        size="icon-xs"
        variant={showIgnored ? 'secondary' : 'ghost'}
      >
        <EyeOffIcon />
      </Button>
      <Button aria-label="关闭右侧导航" onClick={onClose} size="icon-xs" variant="ghost">
        <PanelRightCloseIcon />
      </Button>
    </header>
    <FileTree onOpenFile={onOpenFile} showIgnored={showIgnored} workspaceId={workspaceId} />
  </aside>
)
