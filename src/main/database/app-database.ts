import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'

import {
  createNavigationRepository,
  createPreferenceRepository,
  createProjectRepository,
  createWindowStateRepository,
  createWorkspaceLayoutRepository,
  type NavigationRepository,
  type PreferenceRepository,
  type ProjectRepository,
  type WindowStateRepository,
  type WorkspaceLayoutRepository,
} from './repositories'

interface CreateAppDatabaseOptions {
  databasePath: string
  migrationsFolder?: string
}

export interface AppDatabase {
  close: () => void
  navigation: NavigationRepository
  preferences: PreferenceRepository
  projects: ProjectRepository
  windowState: WindowStateRepository
  workspaceLayouts: WorkspaceLayoutRepository
}

export const createAppDatabase = ({
  databasePath,
  migrationsFolder = join(process.cwd(), 'drizzle'),
}: CreateAppDatabaseOptions): AppDatabase => {
  const sqlite = new DatabaseSync(databasePath, { timeout: 5_000 })
  sqlite.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
  )
  const database = drizzle({ client: sqlite })
  migrate(database, { migrationsFolder })

  return {
    close: (): void => sqlite.close(),
    navigation: createNavigationRepository(database),
    preferences: createPreferenceRepository(database),
    projects: createProjectRepository(database, sqlite),
    windowState: createWindowStateRepository(database),
    workspaceLayouts: createWorkspaceLayoutRepository(database),
  }
}
