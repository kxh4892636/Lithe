import { useEffect } from 'react'
import { create } from 'zustand'

export type NavigationRowKind = 'project' | 'workspace'

export const navigationRowPreferenceKey = (kind: NavigationRowKind, id: string): string => `${kind}-row-open:${id}`

interface NavigationRowCollapseState {
  openByKey: Record<string, boolean>
  hydrateRow: (kind: NavigationRowKind, id: string) => void
  toggleRow: (kind: NavigationRowKind, id: string) => void
}

// 同一 key 的水合只发一次请求，避免 StrictMode 双调用或并发挂载重复读取
const pendingHydrations = new Set<string>()

export const useNavigationRowCollapse = create<NavigationRowCollapseState>((set, get): NavigationRowCollapseState => {
  const persist = (key: string, isOpen: boolean): void => {
    void window.lithe.preferences.setRowOpen(key, isOpen).catch((error: unknown): void => {
      globalThis.console.error('Lithe navigation row preference persistence failed', error)
    })
  }
  return {
    openByKey: {},
    hydrateRow: (kind: NavigationRowKind, id: string): void => {
      const key = navigationRowPreferenceKey(kind, id)
      if (get().openByKey[key] !== undefined || pendingHydrations.has(key)) return
      pendingHydrations.add(key)
      void window.lithe.preferences
        .getRowOpen(key)
        .then((isOpen: boolean): void => {
          // 水合期间用户可能已切换过该行，已有内存值时不回填持久化旧值
          if (get().openByKey[key] === undefined) {
            set((state): Partial<NavigationRowCollapseState> => ({ openByKey: { ...state.openByKey, [key]: isOpen } }))
          }
        })
        .catch((error: unknown): void => {
          globalThis.console.error('Lithe navigation row preference hydration failed', error)
        })
        .finally((): void => {
          pendingHydrations.delete(key)
        })
    },
    toggleRow: (kind: NavigationRowKind, id: string): void => {
      const key = navigationRowPreferenceKey(kind, id)
      const isOpen = !(get().openByKey[key] ?? true)
      set((state): Partial<NavigationRowCollapseState> => ({ openByKey: { ...state.openByKey, [key]: isOpen } }))
      persist(key, isOpen)
    },
  }
})

export const useNavigationRowOpen = (kind: NavigationRowKind, id: string): { isOpen: boolean; toggle: () => void } => {
  const key = navigationRowPreferenceKey(kind, id)
  const isOpen = useNavigationRowCollapse((state): boolean => state.openByKey[key] ?? true)
  const hydrateRow = useNavigationRowCollapse((state) => state.hydrateRow)
  const toggleRow = useNavigationRowCollapse((state) => state.toggleRow)
  useEffect((): void => hydrateRow(kind, id), [hydrateRow, kind, id])
  return { isOpen, toggle: (): void => toggleRow(kind, id) }
}
