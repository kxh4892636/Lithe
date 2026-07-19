import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

let application: ElectronApplication | undefined
let userDataDirectory: string

const launchApplication = async (): Promise<ElectronApplication> =>
  electron.launch({
    args: process.env.LITHE_EXECUTABLE_PATH ? [] : ['.'],
    ...(process.env.LITHE_EXECUTABLE_PATH
      ? { executablePath: process.env.LITHE_EXECUTABLE_PATH }
      : { cwd: process.cwd() }),
    env: { ...process.env, LITHE_USER_DATA_DIR: userDataDirectory },
  })

test.beforeEach((): void => {
  userDataDirectory = mkdtempSync(join(tmpdir(), 'lithe-e2e-'))
})

test.afterEach(async (): Promise<void> => {
  await application?.close()
  application = undefined
  rmSync(userDataDirectory, { force: true, recursive: true })
})

test('E2E-LITHE-001 startup, navigation, theme and restart persistence', async (): Promise<void> => {
  application = await launchApplication()
  let window = await application.firstWindow()

  await expect(window.getByRole('heading', { name: '一眼确认应用状态' })).toBeVisible()
  await expect(window.getByText(/Electron 43/)).toBeVisible()
  await window.getByRole('link', { name: '设置' }).click()
  await expect(window.getByRole('heading', { name: '让界面适应你的工作环境' })).toBeVisible()
  await window.getByText('深色', { exact: true }).click()
  await expect(window.locator('html')).toHaveClass(/dark/)
  await window.screenshot({ path: 'test-results/E2E-LITHE-001-dark-theme.png' })

  await application.close()
  application = await launchApplication()
  window = await application.firstWindow()
  await window.getByRole('link', { name: '设置' }).click()

  await expect(window.locator('html')).toHaveClass(/dark/)
  await expect(window.getByRole('radio', { name: /深色/ })).toHaveAttribute('aria-checked', 'true')
})
