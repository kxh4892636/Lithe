import { useEffect, useRef } from 'react'

export const useGitIndexRefresh = (
  workspaceId: string,
  refresh: () => void,
  enabled = true,
  relativePath?: string,
): void => {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect((): (() => void) => {
    if (!enabled) return (): void => undefined
    let active = true
    let previous: string | null | undefined
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const current = await window.lithe.gitDiff.version(workspaceId, relativePath)
        if (previous !== undefined && current !== previous) refreshRef.current()
        previous = current
      } catch (error: unknown) {
        globalThis.console.error('Lithe Git index polling failed', error)
      } finally {
        if (active) timer = globalThis.setTimeout((): void => void poll(), 3_000)
      }
    }
    void poll()
    return (): void => {
      active = false
      if (timer !== undefined) globalThis.clearTimeout(timer)
    }
  }, [enabled, relativePath, workspaceId])
}
