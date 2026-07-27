import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import type { WorkspaceLayoutSnapshot } from '../../shared/app-contract'
import { createAppDatabase, type AppDatabase } from './app-database'

const temporaryDirectories: string[] = []
const openDatabases: AppDatabase[] = []

const createTestDatabase = (): AppDatabase => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-database-'))
  temporaryDirectories.push(directory)
  const database = createAppDatabase({ databasePath: join(directory, 'lithe.db') })
  openDatabases.push(database)
  return database
}

afterEach((): void => {
  for (const database of openDatabases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('app database', (): void => {
  it('persists the selected theme', (): void => {
    const database = createTestDatabase()

    expect(database.preferences.getTheme()).toBe('system')
    database.preferences.setTheme('dark')

    expect(database.preferences.getTheme()).toBe('dark')
  })

  it('persists navigation appearance', (): void => {
    const database = createTestDatabase()

    expect(database.preferences.getSidebarOpen()).toBe(true)
    expect(database.preferences.getSidebarWidth()).toBe(280)
    expect(database.preferences.getPinnedGroupOpen()).toBe(true)
    expect(database.preferences.getProjectGroupOpen()).toBe(true)
    database.preferences.setSidebarOpen(false)
    database.preferences.setSidebarWidth(304)
    database.preferences.setPinnedGroupOpen(false)
    database.preferences.setProjectGroupOpen(false)

    expect(database.preferences.getSidebarOpen()).toBe(false)
    expect(database.preferences.getSidebarWidth()).toBe(304)
    expect(database.preferences.getPinnedGroupOpen()).toBe(false)
    expect(database.preferences.getProjectGroupOpen()).toBe(false)
  })

  it('persists navigation row collapse per row key', (): void => {
    const database = createTestDatabase()

    expect(database.preferences.getRowOpen('project-row-open:project-1')).toBe(true)
    expect(database.preferences.getRowOpen('workspace-row-open:workspace-1')).toBe(true)
    database.preferences.setRowOpen('workspace-row-open:workspace-1', false)

    expect(database.preferences.getRowOpen('workspace-row-open:workspace-1')).toBe(false)
    expect(database.preferences.getRowOpen('workspace-row-open:workspace-2')).toBe(true)
    expect(database.preferences.getRowOpen('project-row-open:project-1')).toBe(true)
  })

  it('persists the latest window state', (): void => {
    const database = createTestDatabase()
    const state = { x: 120, y: 80, width: 1100, height: 720, isMaximized: true }

    database.windowState.save(state)

    expect(database.windowState.get()).toEqual(state)
  })

  it('persists projects, their default workspace, and active navigation', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-1',
      name: 'lithe',
      rootPath: 'D:\\projects\\lithe',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-1',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      isValid: true,
      createdAt: project.createdAt,
    }

    database.projects.addAndSelect(project, workspace)

    expect(database.projects.list()).toEqual([{ ...project, workspaces: [workspace] }])
    expect(database.navigation.getActiveWorkspace()).toBe(workspace.id)
  })

  it('rejects a second project for the same root directory', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-1',
      name: 'lithe',
      rootPath: 'D:\\projects\\lithe',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-1',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: null,
      kind: 'default' as const,
      createdAt: project.createdAt,
    }

    database.projects.add(project, workspace)

    expect(() =>
      database.projects.add(
        { ...project, id: 'project-2' },
        { ...workspace, id: 'workspace-2', projectId: 'project-2' },
      ),
    ).toThrow('UNIQUE constraint failed')
  })

  it('persists a workspace layout snapshot without terminal output', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-layout',
      name: 'layout',
      rootPath: 'D:\\projects\\layout',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-layout',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: null,
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    const snapshot: WorkspaceLayoutSnapshot = {
      version: 1,
      layout: {
        borders: [],
        global: {},
        layout: { type: 'row', children: [{ type: 'tabset', id: 'root-group', children: [] }] },
      },
    }
    database.projects.add(project, workspace)

    database.workspaceLayouts.save(workspace.id, snapshot)

    expect(database.workspaceLayouts.get(workspace.id)).toEqual(snapshot)
    expect(JSON.stringify(database.workspaceLayouts.get(workspace.id))).not.toContain('secret output')
  })

  it('seeds immutable built-in Adapters and binds tasks idempotently', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-agent',
      name: 'agent',
      rootPath: 'D:\\projects\\agent',
      isValid: true,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-agent',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    database.projects.add(project, workspace)
    const codex = database.adapters.listCurrent().find((adapter): boolean => adapter.name === 'Codex')
    if (!codex) throw new Error('Codex Adapter was not seeded')
    database.adapters.setDefault(codex.adapterId)
    const task = {
      id: 'task-agent',
      workspaceId: workspace.id,
      name: 'Review',
      adapterId: codex.adapterId,
      adapterVersion: codex.version,
      agentStatus: 'closed' as const,
      agentSessionId: null,
      archivedAt: null,
      createdAt: project.createdAt,
      isUnread: false,
      lastAttentionAt: null,
      lastViewedAt: null,
      lifecycle: 'active' as const,
      shouldAutoRestore: true,
    }

    database.tasks.add(task)

    expect(database.adapters.getDefault()).toMatchObject({
      adapterId: codex.adapterId,
      version: codex.version,
    })
    expect(database.tasks.list(workspace.id)).toEqual([task])
    expect(database.tasks.bindSession(task.id, 'provider-1').agentSessionId).toBe('provider-1')
    expect(database.tasks.bindSession(task.id, 'provider-1').agentSessionId).toBe('provider-1')
    expect(() => database.tasks.bindSession(task.id, 'provider-2')).toThrow('already bound')
    database.tasks.add({ ...task, id: 'task-agent-2', name: 'Review 2' })
    expect(() => database.tasks.bindSession('task-agent-2', 'provider-1')).toThrow('another task')
  })

  it('persists one authoritative Agent status and resets it to closed', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-status',
      name: 'status',
      rootPath: 'D:\\projects\\status',
      isValid: true,
      createdAt: new Date('2026-07-28T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-status',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    database.projects.add(project, workspace)
    const adapter = database.adapters.listCurrent()[0]
    if (!adapter) throw new Error('Expected a built-in Adapter')
    database.tasks.add({
      id: 'task-status',
      workspaceId: workspace.id,
      name: 'Status',
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      agentStatus: 'closed',
      agentSessionId: null,
      archivedAt: null,
      createdAt: project.createdAt,
      isUnread: false,
      lifecycle: 'active',
      lastAttentionAt: null,
      lastViewedAt: null,
      shouldAutoRestore: true,
    })

    database.tasks.recordAttention('task-status', 'event-status', new Date('2026-07-28T01:00:00.000Z'))

    expect(database.tasks.setAgentStatus('task-status', 'idle')).toMatchObject({
      agentStatus: 'idle',
      isUnread: true,
    })
    expect(database.tasks.setAgentStatus('task-status', 'running').agentStatus).toBe('running')
    expect(database.tasks.listRunning().map((task): string => task.id)).toEqual(['task-status'])

    database.tasks.resetAgentStatuses()

    expect(database.tasks.get('task-status')?.agentStatus).toBe('closed')
    expect(database.tasks.listRunning()).toEqual([])
  })

  it('sorts active tasks by latest attention with creation time fallback', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-order',
      name: 'order',
      rootPath: 'D:\\projects\\order',
      isValid: true,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-order',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    database.projects.add(project, workspace)
    const adapter = database.adapters.listCurrent()[0]
    if (!adapter) throw new Error('Expected a built-in Adapter')
    const base = {
      workspaceId: workspace.id,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      agentStatus: 'closed' as const,
      agentSessionId: null,
      archivedAt: null,
      isUnread: false,
      lastAttentionAt: null,
      lastViewedAt: null,
      lifecycle: 'active' as const,
      shouldAutoRestore: true,
    }
    database.tasks.add({ ...base, id: 'task-older', name: 'Older', createdAt: new Date('2026-07-20T00:00:00.000Z') })
    database.tasks.add({ ...base, id: 'task-newer', name: 'Newer', createdAt: new Date('2026-07-25T00:00:00.000Z') })
    database.tasks.add({
      ...base,
      id: 'task-attended',
      name: 'Attended',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
    })
    database.tasks.recordAttention('task-attended', 'event-1', new Date('2026-07-24T00:00:00.000Z'))
    database.tasks.recordAttention('task-attended', 'event-2', new Date('2026-07-26T00:00:00.000Z'))

    expect(database.tasks.list(workspace.id).map((task): string => task.id)).toEqual([
      'task-attended',
      'task-newer',
      'task-older',
    ])
  })

  it('breaks attention ties by creation time and then id', (): void => {
    const database = createTestDatabase()
    const project = {
      id: 'project-tie',
      name: 'tie',
      rootPath: 'D:\\projects\\tie',
      isValid: true,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
    }
    const workspace = {
      id: 'workspace-tie',
      projectId: project.id,
      name: '默认',
      rootPath: project.rootPath,
      gitBranch: 'main',
      kind: 'default' as const,
      createdAt: project.createdAt,
    }
    database.projects.add(project, workspace)
    const adapter = database.adapters.listCurrent()[0]
    if (!adapter) throw new Error('Expected a built-in Adapter')
    const base = {
      workspaceId: workspace.id,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.version,
      agentStatus: 'closed' as const,
      agentSessionId: null,
      archivedAt: null,
      isUnread: false,
      lastAttentionAt: null,
      lastViewedAt: null,
      lifecycle: 'active' as const,
      shouldAutoRestore: true,
    }
    const attentionAt = new Date('2026-07-26T00:00:00.000Z')
    database.tasks.add({ ...base, id: 'task-a', name: 'A', createdAt: new Date('2026-07-20T00:00:00.000Z') })
    database.tasks.add({ ...base, id: 'task-b', name: 'B', createdAt: new Date('2026-07-22T00:00:00.000Z') })
    database.tasks.recordAttention('task-a', 'event-a', attentionAt)
    database.tasks.recordAttention('task-b', 'event-b', attentionAt)
    database.tasks.add({ ...base, id: 'task-d', name: 'D', createdAt: new Date('2026-07-23T00:00:00.000Z') })
    database.tasks.add({ ...base, id: 'task-c', name: 'C', createdAt: new Date('2026-07-23T00:00:00.000Z') })

    expect(database.tasks.list(workspace.id).map((task): string => task.id)).toEqual([
      'task-b',
      'task-a',
      'task-c',
      'task-d',
    ])
  })

  it('refreshes built-in Adapter names and definitions when the application reopens', (): void => {
    const directory = mkdtempSync(join(tmpdir(), 'lithe-database-'))
    const databasePath = join(directory, 'lithe.db')
    temporaryDirectories.push(directory)
    createAppDatabase({ databasePath }).close()
    const sqlite = new DatabaseSync(databasePath)
    sqlite.prepare("UPDATE adapters SET name = 'Kimi Code' WHERE id = 'builtin-kimi-code'").run()
    sqlite.prepare('UPDATE adapter_versions SET definition = ? WHERE adapter_id = ? AND version = ?').run(
      JSON.stringify({
        executable: 'kimi',
        start: [],
        resume: ['--session', '{{agentSessionId}}'],
        fork: ['--session', '{{agentSessionId}}'],
        interactions: { fork: [{ input: '/fork\r', timeoutMs: 30_000, waitFor: '›' }] },
      }),
      'builtin-kimi-code',
      1,
    )
    sqlite.close()

    const database = createAppDatabase({ databasePath })
    openDatabases.push(database)

    expect(database.adapters.getVersion('builtin-kimi-code', 1)?.name).toBe('Kimi')
    expect(database.adapters.getVersion('builtin-kimi-code', 1)?.definition.interactions?.fork).toEqual([
      { input: '/fork\r', timeoutMs: 30_000, waitFor: '>' },
    ])
  })

  it('keeps an old custom Adapter version readable after edits and deletion', (): void => {
    const database = createTestDatabase()
    const first = database.adapters.createCustom('custom-1', 'Wrapper', {
      executable: 'wrapper',
      start: [],
      resume: null,
      fork: null,
    })
    const second = database.adapters.updateCustom('custom-1', 'Wrapper 2', {
      executable: 'wrapper',
      start: ['--new'],
      resume: null,
      fork: null,
    })

    database.adapters.deleteCustom('custom-1')

    expect(first.version).toBe(1)
    expect(second.version).toBe(2)
    expect(database.adapters.listCurrent().some((adapter): boolean => adapter.adapterId === 'custom-1')).toBe(false)
    expect(database.adapters.getVersion(first.adapterId, first.version)?.definition.start).toEqual([])
  })

  it('resolves the default Adapter to its current version after an edit', (): void => {
    const database = createTestDatabase()
    const first = database.adapters.createCustom('custom-default', 'Wrapper', {
      executable: 'wrapper',
      start: [],
      resume: null,
      fork: null,
    })
    database.adapters.setDefault(first.adapterId)

    const second = database.adapters.updateCustom(first.adapterId, 'Wrapper 2', {
      executable: 'wrapper',
      start: ['--new'],
      resume: null,
      fork: null,
    })

    expect(database.adapters.getDefault()).toMatchObject({
      adapterId: first.adapterId,
      version: second.version,
      definition: { start: ['--new'] },
    })
    expect(() => database.adapters.deleteCustom(first.adapterId)).toThrow('Default Adapter cannot be deleted')
  })

  it('migrates Adapter version references without losing tasks or attention events', (): void => {
    const directory = mkdtempSync(join(tmpdir(), 'lithe-adapter-version-migration-'))
    temporaryDirectories.push(directory)
    const sqlite = new DatabaseSync(join(directory, 'lithe.db'))
    try {
      sqlite.exec('PRAGMA foreign_keys = ON')
      const migrationsRoot = join(process.cwd(), 'drizzle')
      const migrationDirectories = readdirSync(migrationsRoot, { withFileTypes: true })
        .filter(
          (entry): boolean => entry.isDirectory() && existsSync(join(migrationsRoot, entry.name, 'migration.sql')),
        )
        .map((entry): string => entry.name)
        .sort()
      const currentMigration = migrationDirectories.find((name): boolean =>
        name.endsWith('_adapter-version-composite-key'),
      )
      if (!currentMigration) throw new Error('Adapter version migration was not found')
      for (const migration of migrationDirectories) {
        if (migration === currentMigration) break
        sqlite.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
      }
      const definition = JSON.stringify({ executable: 'agent', start: [], resume: null, fork: null })
      sqlite.exec(`
      INSERT INTO adapters (id, name, kind, current_version, is_deleted, created_at)
      VALUES ('custom', 'Custom', 'custom', 2, 0, 0);
      INSERT INTO adapter_versions (id, adapter_id, version, definition, created_at)
      VALUES ('custom-v1', 'custom', 1, '${definition}', 0);
      INSERT INTO adapter_versions (id, adapter_id, version, definition, created_at)
      VALUES ('custom-v2', 'custom', 2, '${definition}', 1);
      INSERT INTO projects (id, name, root_path, is_valid, created_at)
      VALUES ('project', 'Project', 'D:\\projects\\migration', 1, 0);
      INSERT INTO workspaces (
        id, project_id, name, root_path, git_branch, kind, is_valid, pinned_at, created_at
      )
      VALUES ('workspace', 'project', 'Default', 'D:\\projects\\migration', 'main', 'default', 1, NULL, 0);
      INSERT INTO tasks (
        id, workspace_id, name, name_key, adapter_version_id, agent_status, agent_session_id,
        lifecycle, archived_at, last_viewed_at, should_auto_restore, created_at
      )
      VALUES ('task', 'workspace', 'Task', 'task', 'custom-v1', 'idle', 'session', 'active', NULL, NULL, 1, 0);
      INSERT INTO task_attention_events (id, task_id, created_at) VALUES ('event', 'task', 1);
      INSERT INTO app_preferences (key, value, updated_at)
      VALUES ('default-adapter-version', 'custom-v2', 1);
    `)

      sqlite.exec(readFileSync(join(migrationsRoot, currentMigration, 'migration.sql'), 'utf8'))

      expect(sqlite.prepare('SELECT adapter_id, adapter_version FROM tasks WHERE id = ?').get('task')).toEqual({
        adapter_id: 'custom',
        adapter_version: 1,
      })
      expect(sqlite.prepare('SELECT task_id FROM task_attention_events WHERE id = ?').get('event')).toEqual({
        task_id: 'task',
      })
      expect(sqlite.prepare('SELECT value FROM app_preferences WHERE key = ?').get('default-adapter')).toEqual({
        value: 'custom',
      })
      expect(
        sqlite.prepare("SELECT name FROM pragma_table_info('adapter_versions') WHERE name = 'id'").get(),
      ).toBeUndefined()
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
