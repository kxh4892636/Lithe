import { randomUUID } from 'node:crypto'

import {
  validateAdapterDefinition,
  type AdapterDefinition,
  type AdapterSummary,
  type AdapterVersion,
} from '../../shared/agent-contract'
import type { AdapterRepository } from '../database/agent-repositories'

interface AdapterServiceOptions {
  createId?: () => string
  inspectAvailability: (adapter: AdapterVersion) => Promise<{
    forkAvailable: boolean
    isAvailable: boolean
    reason: string | null
    resumeAvailable: boolean
  }>
  repository: AdapterRepository
}

export interface AdapterService {
  create: (name: string, definition: AdapterDefinition) => Promise<AdapterSummary>
  delete: (adapterId: string) => void
  get: (adapterId: string, version: number) => Promise<AdapterSummary | null>
  list: () => Promise<AdapterSummary[]>
  setDefault: (adapterId: string) => Promise<void>
  update: (adapterId: string, name: string, definition: AdapterDefinition) => Promise<AdapterSummary>
}

const assertName = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new TypeError('Adapter name is invalid')
  return trimmed
}

export const createAdapterService = ({
  createId = randomUUID,
  inspectAvailability,
  repository,
}: AdapterServiceOptions): AdapterService => {
  const summarize = async (version: AdapterVersion, defaultAdapterId?: string): Promise<AdapterSummary> => {
    const availability = await inspectAvailability(version)
    return {
      id: version.adapterId,
      name: version.name,
      kind: version.kind,
      currentVersion: version,
      forkAvailable: availability.forkAvailable,
      isDefault: version.adapterId === defaultAdapterId,
      isAvailable: availability.isAvailable,
      resumeAvailable: availability.resumeAvailable,
      unavailableReason: availability.reason,
      usageCount: repository.getUsageCount(version.adapterId),
    }
  }

  return {
    create: async (name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      summarize(
        repository.createCustom(createId(), assertName(name), validateAdapterDefinition(definition)),
        repository.getDefault()?.adapterId,
      ),
    delete: (adapterId: string): void => repository.deleteCustom(adapterId),
    get: async (adapterId: string, versionNumber: number): Promise<AdapterSummary | null> => {
      const version = repository.getVersion(adapterId, versionNumber)
      return version ? summarize(version, repository.getDefault()?.adapterId) : null
    },
    list: async (): Promise<AdapterSummary[]> => {
      const defaultAdapterId = repository.getDefault()?.adapterId
      return Promise.all(
        repository.listCurrent().map((version: AdapterVersion) => summarize(version, defaultAdapterId)),
      )
    },
    setDefault: async (adapterId: string): Promise<void> => {
      const version = repository
        .listCurrent()
        .find((current: AdapterVersion): boolean => current.adapterId === adapterId)
      if (!version) throw new TypeError('Adapter does not exist')
      if (!(await inspectAvailability(version)).isAvailable) {
        throw new TypeError('Adapter executable is unavailable')
      }
      repository.setDefault(adapterId)
    },
    update: async (adapterId: string, name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      summarize(
        repository.updateCustom(adapterId, assertName(name), validateAdapterDefinition(definition)),
        repository.getDefault()?.adapterId,
      ),
  }
}
