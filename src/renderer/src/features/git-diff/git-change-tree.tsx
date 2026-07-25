import { FileDiffIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'

import type { GitChangeEntry, GitChangeKind } from '../../../../shared/app-contract'
import { useGitChanges } from './use-git-changes'

interface GitChangeTreeProps {
  active: boolean
  onOpenDiff: (change: GitChangeEntry) => void
  onRepositoryChange: (isRepository: boolean) => void
  workspaceId: string
}

const groupLabels: Record<GitChangeKind, string> = {
  staged: '已暂存',
  unstaged: '未暂存',
  untracked: '未跟踪',
}

export const GitChangeTree = ({
  active,
  onOpenDiff,
  onRepositoryChange,
  workspaceId,
}: GitChangeTreeProps): React.JSX.Element => {
  const { changes, error, refresh } = useGitChanges(workspaceId, onRepositoryChange)
  const container = useRef<HTMLDivElement>(null)
  useEffect((): (() => void) | undefined => {
    if (!active || changes.length === 0) return undefined
    const frame = globalThis.requestAnimationFrame((): void => {
      if (container.current) {
        container.current.scrollTop = Number(localStorage.getItem(`lithe:git-changes:${workspaceId}:scroll`)) || 0
      }
    })
    return (): void => globalThis.cancelAnimationFrame(frame)
  }, [active, changes.length, workspaceId])

  return (
    <div
      aria-label="Git 变更树"
      className="absolute inset-0 overflow-auto"
      onScroll={(event): void =>
        localStorage.setItem(`lithe:git-changes:${workspaceId}:scroll`, String(event.currentTarget.scrollTop))
      }
      ref={container}
    >
      <div className="flex h-8 items-center justify-end border-b px-2">
        <Button aria-label="刷新 Git 变更" onClick={refresh} size="icon-xs" variant="ghost">
          <RefreshCwIcon />
        </Button>
      </div>
      {error ? <p className="text-destructive p-2 text-xs">{error}</p> : null}
      {(['staged', 'unstaged', 'untracked'] as const).map((kind) => {
        const entries = changes.filter((entry): boolean => entry.kind === kind)
        if (entries.length === 0) return null
        return (
          <section key={kind} aria-label={groupLabels[kind]}>
            <h3 className="text-muted-foreground px-2 py-1.5 text-[11px] font-medium">{groupLabels[kind]}</h3>
            {entries.map((entry) => (
              <button
                className="hover:bg-accent flex h-7 w-full items-center gap-2 px-3 text-left text-xs"
                key={entry.id}
                onClick={(): void => onOpenDiff(entry)}
                title={entry.relativePath}
                type="button"
              >
                <FileDiffIcon className="size-3.5 shrink-0" />
                <span className="truncate">{entry.relativePath}</span>
              </button>
            ))}
          </section>
        )
      })}
      {!error && changes.length === 0 ? (
        <p className="text-muted-foreground p-3 text-center text-xs">没有变更</p>
      ) : null}
    </div>
  )
}
