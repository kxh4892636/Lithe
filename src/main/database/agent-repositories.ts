import type { DatabaseSync } from 'node:sqlite'

import { and, asc, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'

import {
  parseAdapterDefinition,
  type AdapterDefinition,
  type AdapterVersion,
  type Task,
} from '../../shared/agent-contract'
import { adapterVersions, adapters, appPreferences, taskAttentionEvents, taskRunMarkers, tasks } from './schema'

type Database = ReturnType<typeof drizzle>

export interface AdapterRepository {
  createCustom: (adapterId: string, versionId: string, name: string, definition: AdapterDefinition) => AdapterVersion
  deleteCustom: (adapterId: string) => void
  ensureVersions: (versions: AdapterVersion[]) => void
  getDefault: () => AdapterVersion | undefined
  getUsageCount: (adapterId: string) => number
  getVersion: (versionId: string) => AdapterVersion | undefined
  incrementUsage: (adapterId: string) => void
  listCurrent: () => AdapterVersion[]
  setDefault: (versionId: string) => void
  updateCustom: (adapterId: string, versionId: string, name: string, definition: AdapterDefinition) => AdapterVersion
}

export interface TaskRepository {
  add: (task: Task) => void
  archive: (taskId: string, archivedAt: Date) => Task
  bindSession: (taskId: string, sessionId: string) => Task
  clearInstanceRunMark: (instanceId: string) => void
  clearAllRunMarks: () => void
  clearRunMarks: (taskId: string) => void
  delete: (taskId: string) => void
  get: (taskId: string) => Task | undefined
  list: (workspaceId: string) => Task[]
  listAll: (workspaceId: string) => Task[]
  listArchived: () => Task[]
  listRunning: () => Task[]
  markIdle: (taskId: string, instanceId: string) => Task
  markRunning: (taskId: string, instanceId: string, createdAt: Date) => Task
  markViewed: (taskId: string, viewedAt: Date) => Task
  recordAttention: (taskId: string, eventId: string, createdAt: Date) => Task
  rename: (taskId: string, name: string) => Task
  restore: (taskId: string) => Task
  setAutoRestore?: (taskId: string, value: boolean) => void
}

const mapVersion = (
  row: typeof adapterVersions.$inferSelect,
  adapter: typeof adapters.$inferSelect,
): AdapterVersion => ({
  id: row.id,
  adapterId: row.adapterId,
  name: adapter.name,
  kind: adapter.kind,
  version: row.version,
  definition: parseAdapterDefinition(row.definition),
  createdAt: row.createdAt,
})

const createTaskMapper =
  (database: Database) =>
  (row: typeof tasks.$inferSelect): Task => {
    const attention = database
      .select({ createdAt: taskAttentionEvents.createdAt })
      .from(taskAttentionEvents)
      .where(eq(taskAttentionEvents.taskId, row.id))
      .orderBy(desc(taskAttentionEvents.createdAt))
      .get()
    const running = database
      .select({ instanceId: taskRunMarkers.instanceId })
      .from(taskRunMarkers)
      .where(eq(taskRunMarkers.taskId, row.id))
      .get()
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      adapterVersionId: row.adapterVersionId,
      agentSessionId: row.agentSessionId,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      isRunning: Boolean(running),
      isUnread: Boolean(attention && (!row.lastViewedAt || attention.createdAt > row.lastViewedAt)),
      lifecycle: row.lifecycle,
      lastAttentionAt: attention?.createdAt ?? null,
      lastViewedAt: row.lastViewedAt,
      shouldAutoRestore: row.shouldAutoRestore,
    }
  }

const getAdapterVersion = (database: Database, versionId: string): AdapterVersion | undefined => {
  const row = database.select().from(adapterVersions).where(eq(adapterVersions.id, versionId)).get()
  if (!row) return undefined
  const adapter = database.select().from(adapters).where(eq(adapters.id, row.adapterId)).get()
  return adapter ? mapVersion(row, adapter) : undefined
}

const createCustomAdapter = (
  database: Database,
  sqlite: DatabaseSync,
  adapterId: string,
  versionId: string,
  name: string,
  definition: AdapterDefinition,
): AdapterVersion => {
  const createdAt = new Date()
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    database
      .insert(adapters)
      .values({ id: adapterId, name, kind: 'custom', currentVersion: 1, isDeleted: false, createdAt })
      .run()
    database
      .insert(adapterVersions)
      .values({ id: versionId, adapterId, version: 1, definition: JSON.stringify(definition), createdAt })
      .run()
    sqlite.exec('COMMIT')
  } catch (error: unknown) {
    sqlite.exec('ROLLBACK')
    throw error
  }
  const saved = getAdapterVersion(database, versionId)
  if (!saved) throw new Error('Adapter version was not persisted')
  return saved
}

const updateCustomAdapter = (
  database: Database,
  sqlite: DatabaseSync,
  adapterId: string,
  versionId: string,
  name: string,
  definition: AdapterDefinition,
): AdapterVersion => {
  const current = database.select().from(adapters).where(eq(adapters.id, adapterId)).get()
  if (!current || current.kind !== 'custom') throw new TypeError('Custom Adapter does not exist')
  const nextVersion = current.currentVersion + 1
  const createdAt = new Date()
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    database
      .insert(adapterVersions)
      .values({ id: versionId, adapterId, version: nextVersion, definition: JSON.stringify(definition), createdAt })
      .run()
    database
      .update(adapters)
      .set({ name, currentVersion: nextVersion, isDeleted: false })
      .where(eq(adapters.id, adapterId))
      .run()
    sqlite.exec('COMMIT')
  } catch (error: unknown) {
    sqlite.exec('ROLLBACK')
    throw error
  }
  const saved = getAdapterVersion(database, versionId)
  if (!saved) throw new Error('Adapter version was not persisted')
  return saved
}

export const createAdapterRepository = (database: Database, sqlite: DatabaseSync): AdapterRepository => ({
  createCustom: (adapterId: string, versionId: string, name: string, definition: AdapterDefinition): AdapterVersion =>
    createCustomAdapter(database, sqlite, adapterId, versionId, name, definition),
  deleteCustom: (adapterId: string): void => {
    const adapter = database.select().from(adapters).where(eq(adapters.id, adapterId)).get()
    if (!adapter || adapter.kind !== 'custom') throw new TypeError('Custom Adapter does not exist')
    const preference = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, 'default-adapter-version'))
      .get()
    if (preference) {
      const selected = getAdapterVersion(database, preference.value)
      if (selected?.adapterId === adapterId) throw new TypeError('Default Adapter cannot be deleted')
    }
    database.update(adapters).set({ isDeleted: true }).where(eq(adapters.id, adapterId)).run()
  },
  ensureVersions: (versions: AdapterVersion[]): void => {
    for (const version of versions) {
      database
        .insert(adapters)
        .values({
          id: version.adapterId,
          name: version.name,
          kind: version.kind,
          currentVersion: version.version,
          isDeleted: false,
          createdAt: version.createdAt,
        })
        .onConflictDoNothing()
        .run()
      database
        .insert(adapterVersions)
        .values({
          id: version.id,
          adapterId: version.adapterId,
          version: version.version,
          definition: JSON.stringify(version.definition),
          createdAt: version.createdAt,
        })
        .onConflictDoUpdate({
          target: adapterVersions.id,
          set: { definition: JSON.stringify(version.definition) },
        })
        .run()
    }
  },
  getDefault: (): AdapterVersion | undefined => {
    const preference = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, 'default-adapter-version'))
      .get()
    if (!preference) return undefined
    const version = getAdapterVersion(database, preference.value)
    const adapter = version
      ? database.select().from(adapters).where(eq(adapters.id, version.adapterId)).get()
      : undefined
    return adapter && !adapter.isDeleted && adapter.currentVersion === version?.version ? version : undefined
  },
  getUsageCount: (adapterId: string): number => {
    const row = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, `adapter-usage:${adapterId}`))
      .get()
    const count = Number.parseInt(row?.value ?? '0', 10)
    return Number.isSafeInteger(count) && count >= 0 ? count : 0
  },
  getVersion: (versionId: string): AdapterVersion | undefined => getAdapterVersion(database, versionId),
  incrementUsage: (adapterId: string): void => {
    const key = `adapter-usage:${adapterId}`
    const current = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, key))
      .get()
    const parsed = Number.parseInt(current?.value ?? '0', 10)
    const next = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed + 1 : 1
    database
      .insert(appPreferences)
      .values({ key, value: String(next), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appPreferences.key,
        set: { value: String(next), updatedAt: new Date() },
      })
      .run()
  },
  listCurrent: (): AdapterVersion[] => {
    const adapterRows = database
      .select()
      .from(adapters)
      .where(eq(adapters.isDeleted, false))
      .orderBy(asc(adapters.createdAt))
      .all()
    return adapterRows.flatMap((adapter: typeof adapters.$inferSelect): AdapterVersion[] => {
      const version = database
        .select()
        .from(adapterVersions)
        .where(and(eq(adapterVersions.adapterId, adapter.id), eq(adapterVersions.version, adapter.currentVersion)))
        .get()
      return version ? [mapVersion(version, adapter)] : []
    })
  },
  setDefault: (versionId: string): void => {
    if (!getAdapterVersion(database, versionId)) throw new TypeError('Adapter version does not exist')
    database
      .insert(appPreferences)
      .values({ key: 'default-adapter-version', value: versionId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appPreferences.key,
        set: { value: versionId, updatedAt: new Date() },
      })
      .run()
  },
  updateCustom: (adapterId: string, versionId: string, name: string, definition: AdapterDefinition): AdapterVersion =>
    updateCustomAdapter(database, sqlite, adapterId, versionId, name, definition),
})

export const createTaskRepository = (database: Database): TaskRepository => ({
  add: (task: Task): void => {
    database
      .insert(tasks)
      .values({
        id: task.id,
        workspaceId: task.workspaceId,
        name: task.name,
        nameKey: task.name.trim().toLocaleLowerCase(),
        adapterVersionId: task.adapterVersionId,
        agentSessionId: task.agentSessionId,
        lifecycle: task.lifecycle,
        archivedAt: task.archivedAt,
        lastViewedAt: task.lastViewedAt,
        shouldAutoRestore: task.shouldAutoRestore,
        createdAt: task.createdAt,
      })
      .run()
  },
  archive: (taskId: string, archivedAt: Date): Task => {
    database
      .update(tasks)
      .set({ lifecycle: 'archived', archivedAt, shouldAutoRestore: false })
      .where(eq(tasks.id, taskId))
      .run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  bindSession: (taskId: string, sessionId: string): Task => {
    const task = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!task) throw new TypeError('Task does not exist')
    const existing = database.select().from(tasks).where(eq(tasks.agentSessionId, sessionId)).get()
    if (existing && existing.id !== taskId) throw new TypeError('Agent session is already bound to another task')
    if (task.agentSessionId && task.agentSessionId !== sessionId) {
      throw new TypeError('Agent session is already bound')
    }
    if (!task.agentSessionId) {
      database.update(tasks).set({ agentSessionId: sessionId }).where(eq(tasks.id, taskId)).run()
    }
    const bound = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!bound) throw new Error('Task binding was not persisted')
    return createTaskMapper(database)(bound)
  },
  clearInstanceRunMark: (instanceId: string): void => {
    database.delete(taskRunMarkers).where(eq(taskRunMarkers.instanceId, instanceId)).run()
  },
  clearAllRunMarks: (): void => {
    database.delete(taskRunMarkers).run()
  },
  clearRunMarks: (taskId: string): void => {
    database.delete(taskRunMarkers).where(eq(taskRunMarkers.taskId, taskId)).run()
  },
  delete: (taskId: string): void => {
    database.delete(tasks).where(eq(tasks.id, taskId)).run()
  },
  get: (taskId: string): Task | undefined => {
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    return row ? createTaskMapper(database)(row) : undefined
  },
  list: (workspaceId: string): Task[] =>
    database
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.lifecycle, 'active')))
      .orderBy(asc(tasks.createdAt))
      .all()
      .map(createTaskMapper(database)),
  listAll: (workspaceId: string): Task[] =>
    database
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(asc(tasks.createdAt))
      .all()
      .map(createTaskMapper(database)),
  listArchived: (): Task[] =>
    database
      .select()
      .from(tasks)
      .where(eq(tasks.lifecycle, 'archived'))
      .orderBy(desc(tasks.archivedAt))
      .all()
      .map(createTaskMapper(database)),
  listRunning: (): Task[] => {
    const taskIds = new Set(
      database
        .select({ taskId: taskRunMarkers.taskId })
        .from(taskRunMarkers)
        .all()
        .map((row) => row.taskId),
    )
    return database
      .select()
      .from(tasks)
      .all()
      .filter((row): boolean => taskIds.has(row.id))
      .map(createTaskMapper(database))
  },
  markIdle: (taskId: string, instanceId: string): Task => {
    database
      .delete(taskRunMarkers)
      .where(and(eq(taskRunMarkers.taskId, taskId), eq(taskRunMarkers.instanceId, instanceId)))
      .run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  markRunning: (taskId: string, instanceId: string, createdAt: Date): Task => {
    const existing = database.select().from(taskRunMarkers).where(eq(taskRunMarkers.instanceId, instanceId)).get()
    if (existing && existing.taskId !== taskId) throw new TypeError('CLI instance is already bound to another task')
    database.insert(taskRunMarkers).values({ instanceId, taskId, createdAt }).onConflictDoNothing().run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  markViewed: (taskId: string, viewedAt: Date): Task => {
    database.update(tasks).set({ lastViewedAt: viewedAt }).where(eq(tasks.id, taskId)).run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  recordAttention: (taskId: string, eventId: string, createdAt: Date): Task => {
    database.insert(taskAttentionEvents).values({ id: eventId, taskId, createdAt }).run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  rename: (taskId: string, name: string): Task => {
    database.update(tasks).set({ name, nameKey: name.trim().toLocaleLowerCase() }).where(eq(tasks.id, taskId)).run()
    const renamed = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!renamed) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(renamed)
  },
  restore: (taskId: string): Task => {
    database.update(tasks).set({ lifecycle: 'active', archivedAt: null }).where(eq(tasks.id, taskId)).run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  setAutoRestore: (taskId: string, value: boolean): void => {
    database.update(tasks).set({ shouldAutoRestore: value }).where(eq(tasks.id, taskId)).run()
  },
})
