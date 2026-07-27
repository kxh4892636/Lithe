import type { DatabaseSync } from 'node:sqlite'

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'

import {
  parseAdapterDefinition,
  type AdapterDefinition,
  type AdapterVersion,
  type AgentStatus,
  type Task,
} from '../../shared/agent-contract'
import { adapterVersions, adapters, appPreferences, taskAttentionEvents, tasks } from './schema'

type Database = ReturnType<typeof drizzle>

export interface AdapterRepository {
  createCustom: (adapterId: string, name: string, definition: AdapterDefinition) => AdapterVersion
  deleteCustom: (adapterId: string) => void
  ensureVersions: (versions: AdapterVersion[]) => void
  getDefault: () => AdapterVersion | undefined
  getUsageCount: (adapterId: string) => number
  getVersion: (adapterId: string, version: number) => AdapterVersion | undefined
  incrementUsage: (adapterId: string) => void
  listCurrent: () => AdapterVersion[]
  setDefault: (adapterId: string) => void
  updateCustom: (adapterId: string, name: string, definition: AdapterDefinition) => AdapterVersion
}

export interface TaskRepository {
  add: (task: Task) => void
  archive: (taskId: string, archivedAt: Date) => Task
  bindSession: (taskId: string, sessionId: string) => Task
  delete: (taskId: string) => void
  get: (taskId: string) => Task | undefined
  list: (workspaceId: string) => Task[]
  listAll: (workspaceId: string) => Task[]
  listArchived: () => Task[]
  listRunning: () => Task[]
  markViewed: (taskId: string, viewedAt: Date) => Task
  recordAttention: (taskId: string, eventId: string, createdAt: Date) => Task
  rename: (taskId: string, name: string) => Task
  resetAgentStatuses: () => void
  restore: (taskId: string) => Task
  setAgentStatus: (taskId: string, status: AgentStatus) => Task
  setAutoRestore?: (taskId: string, value: boolean) => void
}

const mapVersion = (
  row: typeof adapterVersions.$inferSelect,
  adapter: typeof adapters.$inferSelect,
): AdapterVersion => ({
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
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      adapterId: row.adapterId,
      adapterVersion: row.adapterVersion,
      agentStatus: row.agentStatus,
      agentSessionId: row.agentSessionId,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      isUnread: Boolean(attention && (!row.lastViewedAt || attention.createdAt > row.lastViewedAt)),
      lifecycle: row.lifecycle,
      lastAttentionAt: attention?.createdAt ?? null,
      lastViewedAt: row.lastViewedAt,
      shouldAutoRestore: row.shouldAutoRestore,
    }
  }

const getAdapterVersion = (database: Database, adapterId: string, version: number): AdapterVersion | undefined => {
  const row = database
    .select()
    .from(adapterVersions)
    .where(and(eq(adapterVersions.adapterId, adapterId), eq(adapterVersions.version, version)))
    .get()
  if (!row) return undefined
  const adapter = database.select().from(adapters).where(eq(adapters.id, row.adapterId)).get()
  return adapter ? mapVersion(row, adapter) : undefined
}

const createCustomAdapter = (
  database: Database,
  sqlite: DatabaseSync,
  adapterId: string,
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
      .values({ adapterId, version: 1, definition: JSON.stringify(definition), createdAt })
      .run()
    sqlite.exec('COMMIT')
  } catch (error: unknown) {
    sqlite.exec('ROLLBACK')
    throw error
  }
  const saved = getAdapterVersion(database, adapterId, 1)
  if (!saved) throw new Error('Adapter version was not persisted')
  return saved
}

const updateCustomAdapter = (
  database: Database,
  sqlite: DatabaseSync,
  adapterId: string,
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
      .values({ adapterId, version: nextVersion, definition: JSON.stringify(definition), createdAt })
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
  const saved = getAdapterVersion(database, adapterId, nextVersion)
  if (!saved) throw new Error('Adapter version was not persisted')
  return saved
}

export const createAdapterRepository = (database: Database, sqlite: DatabaseSync): AdapterRepository => ({
  createCustom: (adapterId: string, name: string, definition: AdapterDefinition): AdapterVersion =>
    createCustomAdapter(database, sqlite, adapterId, name, definition),
  deleteCustom: (adapterId: string): void => {
    const adapter = database.select().from(adapters).where(eq(adapters.id, adapterId)).get()
    if (!adapter || adapter.kind !== 'custom') throw new TypeError('Custom Adapter does not exist')
    const preference = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, 'default-adapter'))
      .get()
    if (preference?.value === adapterId) throw new TypeError('Default Adapter cannot be deleted')
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
        .onConflictDoUpdate({
          target: adapters.id,
          set: { name: version.name },
        })
        .run()
      database
        .insert(adapterVersions)
        .values({
          adapterId: version.adapterId,
          version: version.version,
          definition: JSON.stringify(version.definition),
          createdAt: version.createdAt,
        })
        .onConflictDoUpdate({
          target: [adapterVersions.adapterId, adapterVersions.version],
          set: { definition: JSON.stringify(version.definition) },
        })
        .run()
    }
  },
  getDefault: (): AdapterVersion | undefined => {
    const preference = database
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, 'default-adapter'))
      .get()
    if (!preference) return undefined
    const adapter = database.select().from(adapters).where(eq(adapters.id, preference.value)).get()
    return adapter && !adapter.isDeleted ? getAdapterVersion(database, adapter.id, adapter.currentVersion) : undefined
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
  getVersion: (adapterId: string, version: number): AdapterVersion | undefined =>
    getAdapterVersion(database, adapterId, version),
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
  setDefault: (adapterId: string): void => {
    const adapter = database.select().from(adapters).where(eq(adapters.id, adapterId)).get()
    if (!adapter || adapter.isDeleted) throw new TypeError('Adapter does not exist')
    database
      .insert(appPreferences)
      .values({ key: 'default-adapter', value: adapterId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appPreferences.key,
        set: { value: adapterId, updatedAt: new Date() },
      })
      .run()
  },
  updateCustom: (adapterId: string, name: string, definition: AdapterDefinition): AdapterVersion =>
    updateCustomAdapter(database, sqlite, adapterId, name, definition),
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
        adapterId: task.adapterId,
        adapterVersion: task.adapterVersion,
        agentStatus: task.agentStatus,
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
      .set({ agentStatus: 'closed', lifecycle: 'archived', archivedAt, shouldAutoRestore: false })
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
  delete: (taskId: string): void => {
    database.delete(tasks).where(eq(tasks.id, taskId)).run()
  },
  get: (taskId: string): Task | undefined => {
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    return row ? createTaskMapper(database)(row) : undefined
  },
  list: (workspaceId: string): Task[] => {
    // 侧栏任务按最新关注事件降序，无关注事件回退创建时间；与 renderer 的
    // applyChange 增量排序（compareTasksByAttention）保持同一规则。
    const lastAttentionAt = sql`(select max(${taskAttentionEvents.createdAt}) from ${taskAttentionEvents} where ${taskAttentionEvents.taskId} = ${tasks.id})`
    return database
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.lifecycle, 'active')))
      .orderBy(desc(sql`coalesce(${lastAttentionAt}, ${tasks.createdAt})`), desc(tasks.createdAt), tasks.id)
      .all()
      .map(createTaskMapper(database))
  },
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
  listRunning: (): Task[] =>
    database.select().from(tasks).where(eq(tasks.agentStatus, 'running')).all().map(createTaskMapper(database)),
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
  resetAgentStatuses: (): void => {
    database.update(tasks).set({ agentStatus: 'closed' }).run()
  },
  restore: (taskId: string): Task => {
    database.update(tasks).set({ lifecycle: 'active', archivedAt: null }).where(eq(tasks.id, taskId)).run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  setAgentStatus: (taskId: string, status: AgentStatus): Task => {
    database.update(tasks).set({ agentStatus: status }).where(eq(tasks.id, taskId)).run()
    const row = database.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!row) throw new TypeError('Task does not exist')
    return createTaskMapper(database)(row)
  },
  setAutoRestore: (taskId: string, value: boolean): void => {
    database.update(tasks).set({ shouldAutoRestore: value }).where(eq(tasks.id, taskId)).run()
  },
})
