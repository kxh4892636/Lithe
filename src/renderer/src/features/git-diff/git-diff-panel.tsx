import { DiffEditor } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { GitChangeKind, GitDiffSnapshot } from '../../../../shared/app-contract'
import '../files/monaco'
import { useGitIndexRefresh } from './use-git-index-refresh'

interface GitDiffPanelProps {
  kind: GitChangeKind
  relativePath: string
  workspaceId: string
}

const languageFor = (path: string): string | undefined => {
  const extension = path.split('.').at(-1)?.toLowerCase()
  return {
    css: 'css',
    go: 'go',
    html: 'html',
    js: 'javascript',
    json: 'json',
    md: 'markdown',
    ts: 'typescript',
    tsx: 'typescript',
    yaml: 'yaml',
    yml: 'yaml',
  }[extension ?? '']
}

export const GitDiffPanel = ({ kind, relativePath, workspaceId }: GitDiffPanelProps): React.JSX.Element => {
  const [snapshot, setSnapshot] = useState<GitDiffSnapshot>()
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const pending = useRef(false)
  const key = `${workspaceId}\0${kind}\0${relativePath}`
  const currentKey = useRef(key)
  currentKey.current = key
  const refresh = useCallback((): void => {
    if (inFlight.current) {
      pending.current = true
      return
    }
    inFlight.current = true
    void (async (): Promise<void> => {
      do {
        pending.current = false
        try {
          const value = await window.lithe.gitDiff.read(workspaceId, kind, relativePath)
          if (currentKey.current !== key) continue
          setSnapshot(value)
          setError(null)
        } catch (cause: unknown) {
          if (currentKey.current === key) setError(cause instanceof Error ? cause.message : String(cause))
        }
      } while (pending.current)
      inFlight.current = false
    })()
  }, [key, kind, relativePath, workspaceId])
  useGitIndexRefresh(workspaceId, refresh, true, relativePath)
  useEffect((): (() => void) => {
    refresh()
    return window.lithe.files.onChanged((event): void => {
      if (event.workspaceId === workspaceId && event.relativePath === relativePath) refresh()
    })
  }, [refresh, relativePath, workspaceId])
  if (error) return <p className="text-destructive p-3 text-sm">{error}</p>
  if (!snapshot) return <p className="text-muted-foreground p-3 text-sm">正在读取差异…</p>
  const modelRoot = `lithe-git://${workspaceId}/${kind}/${relativePath}`
  return (
    <div
      aria-label={`Git Diff ${kind} ${relativePath}`}
      className="size-full"
      data-modified-length={snapshot.modified.length}
      data-original-length={snapshot.original.length}
    >
      <DiffEditor
        language={languageFor(relativePath)}
        modified={snapshot.modified}
        modifiedModelPath={`${modelRoot}?modified`}
        options={{ automaticLayout: true, readOnly: true, renderSideBySide: true }}
        original={snapshot.original}
        originalModelPath={`${modelRoot}?original`}
        theme="vs-dark"
      />
    </div>
  )
}
