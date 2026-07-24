import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test as base, type ElectronApplication } from '@playwright/test'

interface ElectronTestSession {
  application: ElectronApplication
  restart: () => Promise<ElectronApplication>
}

interface ElectronTestFixtures {
  electronSession: ElectronTestSession
}

const launchApplication = async (userDataDirectory: string): Promise<ElectronApplication> =>
  electron.launch({
    args: process.env.LITHE_EXECUTABLE_PATH ? [] : ['.'],
    ...(process.env.LITHE_EXECUTABLE_PATH
      ? { executablePath: process.env.LITHE_EXECUTABLE_PATH }
      : { cwd: process.cwd() }),
    env: { ...process.env, LITHE_USER_DATA_DIR: userDataDirectory },
  })

export const test = base.extend<ElectronTestFixtures>({
  // Playwright requires object destructuring even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  electronSession: async ({}, use): Promise<void> => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-e2e-'))
    let application = await launchApplication(userDataDirectory)
    const electronSession: ElectronTestSession = {
      application,
      restart: async (): Promise<ElectronApplication> => {
        await application.close()
        application = await launchApplication(userDataDirectory)
        electronSession.application = application
        return application
      },
    }

    await use(electronSession)
    await application.close()
    rmSync(userDataDirectory, { force: true, recursive: true })
  },
})

export { expect }
