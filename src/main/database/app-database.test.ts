import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

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

  it('persists the latest window state', (): void => {
    const database = createTestDatabase()
    const state = { x: 120, y: 80, width: 1100, height: 720, isMaximized: true }

    database.windowState.save(state)

    expect(database.windowState.get()).toEqual(state)
  })
})
