import { useEffect, useMemo, useState } from 'react'

import type { AdapterSummary } from '../../../../shared/app-contract'

export const useAdaptersByVersion = (adapterVersionIds: string[]): Map<string, AdapterSummary> => {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([])
  const versionKey = [...new Set(adapterVersionIds)].sort().join('\0')

  useEffect((): (() => void) => {
    let active = true
    const hydrate = async (): Promise<void> => {
      const current = await window.lithe.adapters.list()
      const currentIds = new Set(current.map((adapter): string => adapter.currentVersion.id))
      const missingIds = versionKey ? versionKey.split('\0').filter((id): boolean => !currentIds.has(id)) : []
      const historical = await Promise.all(
        missingIds.map((id): Promise<AdapterSummary | null> => window.lithe.adapters.get(id)),
      )
      if (active)
        setAdapters([...current, ...historical.filter((adapter): adapter is AdapterSummary => adapter !== null)])
    }
    void hydrate().catch(globalThis.console.error)
    return (): void => {
      active = false
    }
  }, [versionKey])

  return useMemo(
    (): Map<string, AdapterSummary> =>
      new Map(adapters.map((adapter): [string, AdapterSummary] => [adapter.currentVersion.id, adapter])),
    [adapters],
  )
}
