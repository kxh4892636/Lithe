import { useEffect, useMemo, useState } from 'react'

import type { AdapterSummary } from '../../../../shared/app-contract'

interface AdapterVersionReference {
  adapterId: string
  version: number
}

export const adapterVersionKey = (adapterId: string, version: number): string => `${adapterId}\0${version}`

export const useAdaptersByVersion = (references: AdapterVersionReference[]): Map<string, AdapterSummary> => {
  const [adapters, setAdapters] = useState<AdapterSummary[]>([])
  const versionKey = [
    ...new Set(references.map((reference): string => adapterVersionKey(reference.adapterId, reference.version))),
  ]
    .sort()
    .join('\x01')

  useEffect((): (() => void) => {
    let active = true
    const hydrate = async (): Promise<void> => {
      const current = await window.lithe.adapters.list()
      const currentKeys = new Set(
        current.map((adapter): string =>
          adapterVersionKey(adapter.currentVersion.adapterId, adapter.currentVersion.version),
        ),
      )
      const missing = versionKey
        ? versionKey
            .split('\x01')
            .filter((key): boolean => !currentKeys.has(key))
            .map((key): AdapterVersionReference => {
              const separator = key.lastIndexOf('\0')
              return { adapterId: key.slice(0, separator), version: Number(key.slice(separator + 1)) }
            })
        : []
      const historical = await Promise.all(
        missing.map(
          (reference): Promise<AdapterSummary | null> =>
            window.lithe.adapters.get(reference.adapterId, reference.version),
        ),
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
      new Map(
        adapters.map((adapter): [string, AdapterSummary] => [
          adapterVersionKey(adapter.currentVersion.adapterId, adapter.currentVersion.version),
          adapter,
        ]),
      ),
    [adapters],
  )
}
