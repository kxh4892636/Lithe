import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test as base, type ElectronApplication } from '@playwright/test'

export interface ElectronTestSession {
  application: ElectronApplication
  restart: () => Promise<ElectronApplication>
}

export interface ElectronTestFixtures {
  electronSession: ElectronTestSession
}

const logBoundaryError = (operation: string, error: unknown): void => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`Lithe E2E ${operation} failed: ${message}\n`)
}

const createUserDataDirectory = (): string => {
  try {
    return mkdtempSync(join(tmpdir(), 'lithe-e2e-'))
  } catch (error: unknown) {
    logBoundaryError('userData creation', error)
    throw error
  }
}

const removeUserDataDirectory = (userDataDirectory: string): void => {
  try {
    rmSync(userDataDirectory, { force: true, recursive: true })
  } catch (error: unknown) {
    logBoundaryError('userData cleanup', error)
    throw error
  }
}

const resolveExecutablePath = (): string | undefined => {
  const candidate = process.env.LITHE_EXECUTABLE_PATH?.trim()
  if (!candidate) return undefined

  const executablePath = resolve(candidate)
  try {
    if (!statSync(executablePath).isFile()) throw new TypeError('LITHE_EXECUTABLE_PATH 必须指向文件')
    return executablePath
  } catch (error: unknown) {
    logBoundaryError('executable validation', error)
    throw error
  }
}

const launchApplication = async (userDataDirectory: string): Promise<ElectronApplication> => {
  const executablePath = resolveExecutablePath()
  try {
    return await electron.launch({
      args: executablePath ? [] : ['.'],
      ...(executablePath ? { executablePath } : { cwd: process.cwd() }),
      env: { ...process.env, LITHE_USER_DATA_DIR: userDataDirectory },
    })
  } catch (error: unknown) {
    logBoundaryError('application launch', error)
    throw error
  }
}

const closeApplication = async (application: ElectronApplication): Promise<void> => {
  try {
    await application.close()
  } catch (error: unknown) {
    logBoundaryError('application close', error)
    throw error
  }
}

export const test = base.extend<ElectronTestFixtures>({
  // Playwright requires object destructuring even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  electronSession: async ({}: object, use: (session: ElectronTestSession) => Promise<void>): Promise<void> => {
    const userDataDirectory = createUserDataDirectory()
    let application: ElectronApplication | undefined
    const errors: unknown[] = []
    try {
      application = await launchApplication(userDataDirectory)
      const electronSession: ElectronTestSession = {
        application,
        restart: async (): Promise<ElectronApplication> => {
          if (!application) throw new Error('Electron 应用尚未启动')
          await closeApplication(application)
          application = undefined
          application = await launchApplication(userDataDirectory)
          electronSession.application = application
          return application
        },
      }

      await use(electronSession)
    } catch (error: unknown) {
      errors.push(error)
    } finally {
      if (application) {
        try {
          await closeApplication(application)
        } catch (error: unknown) {
          errors.push(error)
        }
      }
      try {
        removeUserDataDirectory(userDataDirectory)
      } catch (error: unknown) {
        errors.push(error)
      }
    }

    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'Lithe E2E fixture encountered multiple failures')
  },
})

export { expect }
