import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'

import { themeValues, type Theme, type WindowState } from '../../shared/app-contract'
import { appPreferences, windowState } from './schema'

interface CreateAppDatabaseOptions {
  databasePath: string
  migrationsFolder?: string
}

interface PreferenceRepository {
  getTheme: () => Theme
  setTheme: (theme: Theme) => void
}

interface WindowStateRepository {
  get: () => WindowState | undefined
  save: (state: WindowState) => void
}

export interface AppDatabase {
  close: () => void
  preferences: PreferenceRepository
  windowState: WindowStateRepository
}

const isTheme = (value: string): value is Theme => themeValues.some((theme: Theme): boolean => theme === value)

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
    close: (): void => {
      sqlite.close()
    },
    preferences: {
      getTheme: (): Theme => {
        const preference = database
          .select({ value: appPreferences.value })
          .from(appPreferences)
          .where(eq(appPreferences.key, 'theme'))
          .get()
        return preference && isTheme(preference.value) ? preference.value : 'system'
      },
      setTheme: (theme: Theme): void => {
        database
          .insert(appPreferences)
          .values({ key: 'theme', value: theme, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: appPreferences.key,
            set: { value: theme, updatedAt: new Date() },
          })
          .run()
      },
    },
    windowState: {
      get: (): WindowState | undefined => {
        const state = database.select().from(windowState).where(eq(windowState.id, 1)).get()
        if (!state) return undefined
        return {
          x: state.x,
          y: state.y,
          width: state.width,
          height: state.height,
          isMaximized: state.isMaximized,
        }
      },
      save: (state: WindowState): void => {
        database
          .insert(windowState)
          .values({ id: 1, ...state, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: windowState.id,
            set: { ...state, updatedAt: new Date() },
          })
          .run()
      },
    },
  }
}
