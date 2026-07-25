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
  get: (versionId: string) => Promise<AdapterSummary | null>
  list: () => Promise<AdapterSummary[]>
  setDefault: (versionId: string) => Promise<void>
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
  const summarize = async (version: AdapterVersion, defaultVersionId?: string): Promise<AdapterSummary> => {
    const availability = await inspectAvailability(version)
    return {
      id: version.adapterId,
      name: version.name,
      kind: version.kind,
      currentVersion: version,
      forkAvailable: availability.forkAvailable,
      isDefault: version.id === defaultVersionId,
      isAvailable: availability.isAvailable,
      resumeAvailable: availability.resumeAvailable,
      unavailableReason: availability.reason,
      usageCount: repository.getUsageCount(version.adapterId),
    }
  }

  return {
    create: async (name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      summarize(
        repository.createCustom(createId(), createId(), assertName(name), validateAdapterDefinition(definition)),
        repository.getDefault()?.id,
      ),
    delete: (adapterId: string): void => repository.deleteCustom(adapterId),
    get: async (versionId: string): Promise<AdapterSummary | null> => {
      const version = repository.getVersion(versionId)
      return version ? summarize(version, repository.getDefault()?.id) : null
    },
    list: async (): Promise<AdapterSummary[]> => {
      const defaultVersionId = repository.getDefault()?.id
      return Promise.all(
        repository.listCurrent().map((version: AdapterVersion) => summarize(version, defaultVersionId)),
      )
    },
    setDefault: async (versionId: string): Promise<void> => {
      const version = repository.getVersion(versionId)
      if (!version) throw new TypeError('Adapter version does not exist')
      if (!repository.listCurrent().some((current: AdapterVersion): boolean => current.id === versionId)) {
        throw new TypeError('Only the current visible Adapter version can be selected')
      }
      if (!(await inspectAvailability(version)).isAvailable) {
        throw new TypeError('Adapter executable is unavailable')
      }
      repository.setDefault(versionId)
    },
    update: async (adapterId: string, name: string, definition: AdapterDefinition): Promise<AdapterSummary> =>
      summarize(
        repository.updateCustom(adapterId, createId(), assertName(name), validateAdapterDefinition(definition)),
        repository.getDefault()?.id,
      ),
  }
}
