import { EyeOffIcon, PanelRightCloseIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { GitChangeTree } from '@/features/git-diff/git-change-tree'

import type { GitChangeEntry } from '../../../../shared/app-contract'
import { FileTree } from './file-tree'
import { useNavigatorResize } from './use-navigator-resize'

interface WorkspaceNavigatorProps {
  onClose: () => void
  onOpenDiff: (change: GitChangeEntry) => void
  onOpenFile: (relativePath: string) => void
  onShowIgnoredChange: (show: boolean) => void
  onWidthChange: (width: number) => void
  showIgnored: boolean
  width: number
  workspaceId: string
}

export const WorkspaceNavigator = ({
  onClose,
  onOpenDiff,
  onOpenFile,
  onShowIgnoredChange,
  onWidthChange,
  showIgnored,
  width,
  workspaceId,
}: WorkspaceNavigatorProps): React.JSX.Element => {
  const [isRepository, setIsRepository] = useState<boolean>()
  const [tab, setTab] = useState<'changes' | 'files'>((): 'changes' | 'files' =>
    localStorage.getItem(`lithe:navigator:${workspaceId}:tab`) === 'changes' ? 'changes' : 'files',
  )
  const startResize = useNavigatorResize(width, onWidthChange)
  const selectTab = (value: 'changes' | 'files'): void => {
    setTab(value)
    localStorage.setItem(`lithe:navigator:${workspaceId}:tab`, value)
  }
  useEffect((): void => {
    setIsRepository(undefined)
    setTab(localStorage.getItem(`lithe:navigator:${workspaceId}:tab`) === 'changes' ? 'changes' : 'files')
  }, [workspaceId])
  return (
    <aside
      className="bg-background relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l"
      aria-label="工作区文件导航"
      data-git-repository={isRepository === undefined ? 'loading' : String(isRepository)}
      style={{ width }}
    >
      <hr
        aria-label="调整右侧导航宽度"
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
        onPointerDown={startResize}
      />
      <header className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <button className="px-1 text-xs font-medium" onClick={(): void => selectTab('files')} type="button">
          文件
        </button>
        {isRepository ? (
          <button className="px-1 text-xs font-medium" onClick={(): void => selectTab('changes')} type="button">
            变更
          </button>
        ) : null}
        <span className="flex-1" />
        {tab === 'files' ? (
          <Button
            aria-label={showIgnored ? '隐藏 Git 忽略文件' : '显示 Git 忽略文件'}
            onClick={(): void => onShowIgnoredChange(!showIgnored)}
            size="icon-xs"
            variant={showIgnored ? 'secondary' : 'ghost'}
          >
            <EyeOffIcon />
          </Button>
        ) : null}
        <Button aria-label="关闭右侧导航" onClick={onClose} size="icon-xs" variant="ghost">
          <PanelRightCloseIcon />
        </Button>
      </header>
      <div className={tab === 'files' ? 'flex min-h-0 flex-1' : 'hidden'}>
        <FileTree onOpenFile={onOpenFile} showIgnored={showIgnored} workspaceId={workspaceId} />
      </div>
      <div className={tab === 'changes' ? 'relative min-h-0 flex-1 overflow-hidden' : 'hidden'}>
        <GitChangeTree
          active={tab === 'changes'}
          onOpenDiff={onOpenDiff}
          onRepositoryChange={(value): void => {
            setIsRepository(value)
            if (!value && tab === 'changes') selectTab('files')
          }}
          workspaceId={workspaceId}
        />
      </div>
    </aside>
  )
}
