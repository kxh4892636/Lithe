import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import type { LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-006 runs a local PTY and restores tabbed panels without output', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-project-'))
  let page: Page | undefined

  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, projectDirectory)
    page = await electronSession.application.firstWindow()
    await page.getByRole('button', { name: '添加项目' }).click()
    await page.getByRole('button', { name: '在此标签组新建终端' }).click()
    const terminals = page.locator('.xterm')
    await expect(terminals).toHaveCount(1)

    const terminalPanel = terminals.first().locator('..')
    await expect(terminalPanel).toHaveAttribute('data-terminal-ready', 'true')
    const terminalId = await terminalPanel.getAttribute('data-terminal-id')
    if (!terminalId) throw new Error('终端面板缺少标识')
    await page.evaluate(
      async ({ panelId }): Promise<void> => {
        await (window as typeof window & { lithe: LitheBridge }).lithe.terminals.write(
          panelId,
          'echo LITHE_PTY_READY\r',
        )
      },
      { panelId: terminalId },
    )
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_PTY_READY')

    await page.getByRole('button', { name: '在此标签组新建终端' }).click()
    await expect(terminals).toHaveCount(2)
    const activePage = page
    await expect
      .poll(async (): Promise<number> => {
        return await activePage.evaluate(async (): Promise<number> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          const navigation = await bridge.projects.getNavigation()
          if (!navigation.activeWorkspaceId) return 0
          const snapshot = await bridge.workspaceLayouts.get(navigation.activeWorkspaceId)
          return JSON.stringify(snapshot).match(/"component":"terminal"/g)?.length ?? 0
        })
      })
      .toBe(2)

    await electronSession.restart()
    page = await electronSession.application.firstWindow()
    await expect(page.locator('.xterm')).toHaveCount(2)
    await expect(page.locator('[data-terminal-ready="true"]')).toHaveCount(2)
    await expect(page.locator('.flexlayout__tabset-maximized')).toHaveCount(0)
    await expect
      .poll(async (): Promise<boolean> => {
        const rows = await page?.locator('.xterm-rows').allTextContents()
        return rows?.some((text): boolean => text.includes('LITHE_PTY_READY')) ?? false
      })
      .toBe(false)
  } finally {
    await electronSession.close()
    page = undefined
    await expect
      .poll(
        (): boolean => {
          try {
            rmSync(projectDirectory, { force: true, recursive: true })
            return true
          } catch {
            return false
          }
        },
        { timeout: 10_000 },
      )
      .toBe(true)
  }
})
