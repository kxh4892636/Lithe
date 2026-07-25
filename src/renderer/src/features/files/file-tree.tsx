import { ChevronRightIcon, FileIcon, FolderIcon, LinkIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist'

import { cn } from '@/lib/utils'

import type { FileTreeEntry } from '../../../../shared/app-contract'

interface FileTreeProps {
  onOpenFile: (relativePath: string) => void
  showIgnored: boolean
  workspaceId: string
}

const storageKey = (workspaceId: string, field: string): string => `lithe:navigator:${workspaceId}:${field}`

const storedOpenIds = (workspaceId: string): Set<string> => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(workspaceId, 'expanded')) ?? '[]') as unknown
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

const replaceChildren = (entries: FileTreeEntry[], id: string, children: FileTreeEntry[]): FileTreeEntry[] =>
  entries.map(
    (entry): FileTreeEntry =>
      entry.id === id
        ? { ...entry, children }
        : entry.children
          ? { ...entry, children: replaceChildren(entry.children, id, children) }
          : entry,
  )

const FileNode = ({ node, style }: NodeRendererProps<FileTreeEntry>): React.JSX.Element => {
  const Icon = node.data.externalSymlink ? LinkIcon : node.isInternal ? FolderIcon : FileIcon
  return (
    <button
      className={cn(
        'hover:bg-accent flex w-full items-center gap-1.5 rounded px-1.5 text-left text-xs',
        node.isSelected && 'bg-accent',
        node.data.externalSymlink && 'text-muted-foreground',
      )}
      style={style}
      title={node.data.externalSymlink ? '符号链接无法在工作区边界内安全展开' : node.data.relativePath}
      type="button"
    >
      {node.isInternal ? (
        <ChevronRightIcon className={cn('size-3 transition-transform', node.isOpen && 'rotate-90')} />
      ) : (
        <span className="w-3" />
      )}
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{node.data.name}</span>
    </button>
  )
}

const loadExpandedTree = async (
  workspaceId: string,
  showIgnored: boolean,
  openIds: Set<string>,
): Promise<FileTreeEntry[]> => {
  let entries = await window.lithe.files.listDirectory(workspaceId, '', showIgnored)
  const ordered = [...openIds].sort((left, right): number => left.split('/').length - right.split('/').length)
  for (const id of ordered) {
    const children = await window.lithe.files.listDirectory(workspaceId, id, showIgnored)
    entries = replaceChildren(entries, id, children)
  }
  return entries
}

export const FileTree = ({ onOpenFile, showIgnored, workspaceId }: FileTreeProps): React.JSX.Element => {
  const container = useRef<HTMLDivElement>(null)
  const tree = useRef<TreeApi<FileTreeEntry>>(null)
  const openIds = useRef(storedOpenIds(workspaceId))
  const initialOpenState = useMemo(
    (): Record<string, boolean> =>
      Object.fromEntries([...storedOpenIds(workspaceId)].map((id): [string, boolean] => [id, true])),
    [workspaceId],
  )
  const [data, setData] = useState<FileTreeEntry[]>([])
  const [size, setSize] = useState({ height: 0, width: 0 })
  const [error, setError] = useState<string | null>(null)
  useEffect((): (() => void) => {
    const observer = new ResizeObserver(([entry]): void => {
      if (entry) setSize({ height: entry.contentRect.height, width: entry.contentRect.width })
    })
    if (container.current) observer.observe(container.current)
    return (): void => observer.disconnect()
  }, [])
  useEffect((): (() => void) => {
    let active = true
    openIds.current = storedOpenIds(workspaceId)
    const load = (): void => {
      void loadExpandedTree(workspaceId, showIgnored, openIds.current).then(
        (entries): void => {
          if (!active) return
          setData(entries)
          setError(null)
          tree.current?.scrollToOffset(Number(localStorage.getItem(storageKey(workspaceId, 'scroll'))) || 0)
        },
        (cause: unknown): void => {
          if (active) setError(cause instanceof Error ? cause.message : String(cause))
        },
      )
    }
    load()
    const dispose = window.lithe.files.onChanged((event): void => {
      if (event.workspaceId === workspaceId) load()
    })
    void window.lithe.files.watch(workspaceId).catch(globalThis.console.error)
    return (): void => {
      active = false
      dispose()
    }
  }, [showIgnored, workspaceId])

  const toggle = (id: string): void => {
    if (openIds.current.delete(id)) {
      localStorage.setItem(storageKey(workspaceId, 'expanded'), JSON.stringify([...openIds.current]))
      return
    }
    openIds.current.add(id)
    localStorage.setItem(storageKey(workspaceId, 'expanded'), JSON.stringify([...openIds.current]))
    void window.lithe.files
      .listDirectory(workspaceId, id, showIgnored)
      .then((children): void => setData((current): FileTreeEntry[] => replaceChildren(current, id, children)))
      .catch((cause: unknown): void => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  return (
    <div className="min-h-0 flex-1" ref={container}>
      {error ? <p className="text-destructive p-2 text-xs">{error}</p> : null}
      {size.height > 0 && size.width > 0 ? (
        <Tree
          data={data}
          disableDrag
          disableDrop
          height={size.height}
          indent={14}
          initialOpenState={initialOpenState}
          key={`${workspaceId}:${String(showIgnored)}`}
          onActivate={(node): void => {
            if (!node.isInternal && !node.data.externalSymlink) onOpenFile(node.data.relativePath)
          }}
          onScroll={({ scrollOffset }): void =>
            localStorage.setItem(storageKey(workspaceId, 'scroll'), String(scrollOffset))
          }
          onToggle={toggle}
          openByDefault={false}
          ref={tree}
          rowHeight={26}
          width={size.width}
        >
          {FileNode}
        </Tree>
      ) : null}
    </div>
  )
}
