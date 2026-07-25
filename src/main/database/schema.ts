import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const appPreferences = sqliteTable('app_preferences', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const windowState = sqliteTable('window_state', {
  id: integer('id').primaryKey(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  isMaximized: integer('is_maximized', { mode: 'boolean' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  isValid: integer('is_valid', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  gitBranch: text('git_branch'),
  kind: text('kind', { enum: ['default', 'derived'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const navigationState = sqliteTable('navigation_state', {
  id: integer('id').primaryKey(),
  activeWorkspaceId: text('active_workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const workspaceLayouts = sqliteTable('workspace_layouts', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  snapshot: text('snapshot').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const adapters = sqliteTable('adapters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['builtin', 'custom'] }).notNull(),
  currentVersion: integer('current_version').notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const adapterVersions = sqliteTable(
  'adapter_versions',
  {
    id: text('id').primaryKey(),
    adapterId: text('adapter_id')
      .notNull()
      .references(() => adapters.id),
    version: integer('version').notNull(),
    definition: text('definition').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('adapter_versions_adapter_version_unique').on(table.adapterId, table.version)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    adapterVersionId: text('adapter_version_id')
      .notNull()
      .references(() => adapterVersions.id),
    agentSessionId: text('agent_session_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('tasks_workspace_name_unique').on(table.workspaceId, table.nameKey),
    uniqueIndex('tasks_agent_session_unique').on(table.agentSessionId),
  ],
)
