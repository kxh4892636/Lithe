import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import type { ElectronApplication, Locator, Page } from '@playwright/test'
import type { OpenDialogReturnValue } from 'electron'

import type { LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

const processExists = (processId: number): boolean => {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

const addProject = async (application: ElectronApplication, page: Page, directory: string): Promise<void> => {
  await application.evaluate(({ dialog }: typeof import('electron'), selectedDirectory: string): void => {
    dialog.showOpenDialog = async (): Promise<OpenDialogReturnValue> => ({
      canceled: false,
      filePaths: [selectedDirectory],
    })
  }, directory)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '选择已有文件夹' }).click()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('button', { exact: true, name: basename(directory) })).toBeVisible()
}

const workspaceRowOf = (page: Page, projectName: string): Locator =>
  page
    .locator('li', { has: page.getByRole('button', { exact: true, name: projectName }) })
    .locator('[data-sidebar="menu-sub-item"]')
    .first()

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
    await page.getByRole('button', { name: '选择已有文件夹' }).click()
    await page.getByRole('button', { name: '创建项目' }).click()
    await page.getByRole('button', { name: '在此标签组新建终端' }).click()
    const terminals = page.locator('.xterm')
    await expect(terminals).toHaveCount(1)

    const terminalPanel = terminals.first().locator('xpath=ancestor::*[@data-terminal-id][1]')
    await expect(terminalPanel).toHaveAttribute('data-terminal-ready', 'true')
    await expect
      .poll(async (): Promise<number> => {
        const panelBounds = await terminalPanel.boundingBox()
        const hostBounds = await terminalPanel.locator('[data-terminal-host]').boundingBox()
        if (!panelBounds || !hostBounds) return Number.POSITIVE_INFINITY
        return Math.abs(panelBounds.height - 8 - hostBounds.height)
      })
      .toBeLessThanOrEqual(2)
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
    await terminalPanel.locator('[data-terminal-host]').evaluate((element: HTMLElement): void => {
      element.setAttribute('data-view-identity', 'ordinary-terminal')
    })
    const tuiScript = [
      'let frame=0',
      "const timer=setInterval(()=>{process.stdout.write('\\x1b[2J\\x1b[HFRAME '+(++frame));if(frame===20){clearInterval(timer);process.stdout.write('\\r\\nLITHE_TUI_DONE\\r\\n')}},30)",
    ].join(';')
    const encodedTui = Buffer.from(tuiScript).toString('base64')
    await page.evaluate(
      async ({ command, panelId }: { command: string; panelId: string }): Promise<void> => {
        await (window as typeof window & { lithe: LitheBridge }).lithe.terminals.write(panelId, `${command}\r`)
      },
      {
        command: `node -e "eval(Buffer.from('${encodedTui}','base64').toString())"`,
        panelId: terminalId,
      },
    )
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_TUI_DONE')
    await expect(page.locator('[data-view-identity="ordinary-terminal"]')).toHaveCount(1)

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

test('E2E-LITHE-018 keeps an ordinary terminal alive while switching workspaces', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const firstDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-switch-first-'))
  const secondDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-switch-second-'))
  let page: Page | undefined
  try {
    page = await electronSession.application.firstWindow()
    await addProject(electronSession.application, page, firstDirectory)
    const firstWorkspaceRow = workspaceRowOf(page, basename(firstDirectory))
    await page.getByRole('button', { name: '在此标签组新建终端' }).click()
    const terminalPanel = page.locator('[data-terminal-id]').first()
    await expect(terminalPanel).toHaveAttribute('data-terminal-ready', 'true')
    const terminalId = await terminalPanel.getAttribute('data-terminal-id')
    if (!terminalId) throw new Error('终端面板缺少标识')
    await terminalPanel.locator('[data-terminal-host]').evaluate((element: HTMLElement): void => {
      element.setAttribute('data-view-identity', 'workspace-switch-terminal')
    })
    const tickingScript = "let tick=0;setInterval(()=>console.log('LITHE_TERMINAL_TICK '+(++tick)),150)"
    const encodedScript = Buffer.from(tickingScript).toString('base64')
    await page.evaluate(
      async ({ command, panelId }: { command: string; panelId: string }): Promise<void> => {
        await (window as typeof window & { lithe: LitheBridge }).lithe.terminals.write(panelId, `${command}\r`)
      },
      {
        command: `node -e "eval(Buffer.from('${encodedScript}','base64').toString())"`,
        panelId: terminalId,
      },
    )
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_TERMINAL_TICK 1')

    await addProject(electronSession.application, page, secondDirectory)
    const secondWorkspaceRow = workspaceRowOf(page, basename(secondDirectory))
    await secondWorkspaceRow.getByRole('button', { exact: true, name: '默认' }).click()
    await expect(terminalPanel).toBeHidden()
    await page.waitForTimeout(700)

    await firstWorkspaceRow.getByRole('button', { exact: true, name: '默认' }).click()
    await expect(terminalPanel).toBeVisible()
    await expect(page.locator('[data-view-identity="workspace-switch-terminal"]')).toHaveCount(1)
    await expect(page.locator('.xterm-rows')).toContainText(/LITHE_TERMINAL_TICK (?:[3-9]|[1-9]\d+)/)
  } finally {
    await electronSession.close()
    page = undefined
    rmSync(firstDirectory, { force: true, recursive: true })
    rmSync(secondDirectory, { force: true, recursive: true })
  }
})

test('E2E-LITHE-017 closes the ordinary terminal process tree with its tab', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-terminal-close-'))
  const processIdFile = join(projectDirectory, 'terminal-child.pid')
  let childProcessId: number | undefined
  let page: Page | undefined
  try {
    await electronSession.application.evaluate(
      ({ dialog }: typeof import('electron'), selectedDirectory: string): void => {
        dialog.showOpenDialog = async (): Promise<OpenDialogReturnValue> => ({
          canceled: false,
          filePaths: [selectedDirectory],
        })
      },
      projectDirectory,
    )
    page = await electronSession.application.firstWindow()
    await page.getByRole('button', { name: '添加项目' }).click()
    await page.getByRole('button', { name: '选择已有文件夹' }).click()
    await page.getByRole('button', { name: '创建项目' }).click()
    await page.getByRole('button', { name: '在此标签组新建终端' }).click()
    const terminalPanel = page.locator('[data-terminal-id]').first()
    await expect(terminalPanel).toHaveAttribute('data-terminal-ready', 'true')
    const terminalId = await terminalPanel.getAttribute('data-terminal-id')
    if (!terminalId) throw new Error('终端面板缺少标识')
    const childScript = [
      `require('node:fs').writeFileSync(${JSON.stringify(processIdFile)},String(process.pid))`,
      'setInterval(()=>{},1000)',
    ].join(';')
    const encodedScript = Buffer.from(childScript).toString('base64')
    await page.evaluate(
      async ({ command, panelId }: { command: string; panelId: string }): Promise<void> => {
        await (window as typeof window & { lithe: LitheBridge }).lithe.terminals.write(panelId, `${command}\r`)
      },
      { command: `node -e "eval(Buffer.from('${encodedScript}','base64').toString())"`, panelId: terminalId },
    )
    await expect.poll((): boolean => existsSync(processIdFile)).toBe(true)
    childProcessId = Number(readFileSync(processIdFile, 'utf8'))
    expect(processExists(childProcessId)).toBe(true)

    await page.locator('.flexlayout__tab_button--selected .flexlayout__tab_button_trailing').click()

    await expect(page.locator(`[data-terminal-id="${terminalId}"]`)).toHaveCount(0)
    await expect.poll((): boolean => (childProcessId ? processExists(childProcessId) : true)).toBe(false)
  } finally {
    if (childProcessId && processExists(childProcessId)) process.kill(childProcessId)
    await electronSession.close()
    page = undefined
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})
