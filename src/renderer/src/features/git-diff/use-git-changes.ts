import { useCallback, useEffect, useRef, useState } from 'react'

import type { GitChangeEntry } from '../../../../shared/app-contract'
import { useGitIndexRefresh } from './use-git-index-refresh'

interface GitChanges {
  changes: GitChangeEntry[]
  error: string | null
  refresh: () => void
}

export const useGitChanges = (workspaceId: string, onRepositoryChange: (isRepository: boolean) => void): GitChanges => {
  const [changes, setChanges] = useState<GitChangeEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isRepository, setIsRepository] = useState(false)
  const inFlight = useRef(false)
  const repositoryChange = useRef(onRepositoryChange)
  const pending = useRef(false)
  const workspace = useRef(workspaceId)
  repositoryChange.current = onRepositoryChange
  workspace.current = workspaceId
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
          const result = await window.lithe.gitDiff.list(workspaceId)
          if (workspace.current !== workspaceId) continue
          setChanges(result.changes)
          setError(null)
          setIsRepository(result.isRepository)
          repositoryChange.current(result.isRepository)
        } catch (cause: unknown) {
          if (workspace.current === workspaceId) setError(cause instanceof Error ? cause.message : String(cause))
        }
      } while (pending.current)
      inFlight.current = false
    })()
  }, [workspaceId])
  useGitIndexRefresh(workspaceId, refresh)
  useEffect((): (() => void) | undefined => {
    if (!isRepository) return undefined
    const timer = globalThis.setInterval(refresh, 5_000)
    return (): void => globalThis.clearInterval(timer)
  }, [isRepository, refresh])
  useEffect((): (() => void) => {
    refresh()
    let timer: number | undefined
    const dispose = window.lithe.files.onChanged((event): void => {
      if (event.workspaceId !== workspaceId) return
      if (timer !== undefined) globalThis.clearTimeout(timer)
      timer = globalThis.setTimeout(refresh, 150)
    })
    return (): void => {
      if (timer !== undefined) globalThis.clearTimeout(timer)
      dispose()
    }
  }, [refresh, workspaceId])
  return { changes, error, refresh }
}
