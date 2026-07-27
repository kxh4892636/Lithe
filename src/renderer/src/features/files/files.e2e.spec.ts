import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import type { LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-010 opens duplicate shared file views and explicitly saves the existing file', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-files-project-'))
  const filePath = join(projectDirectory, 'note.txt')
  let workspaceId: string | undefined
  writeFileSync(filePath, 'before')

  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, projectDirectory)
    const window = await electronSession.application.firstWindow()
    await window.getByRole('button', { name: '添加项目' }).click()
    await window.getByRole('button', { name: '选择已有文件夹' }).click()
    await window.getByRole('button', { name: '创建项目' }).click()
    await expect(window.getByRole('button', { name: basename(projectDirectory), exact: true })).toBeVisible()
    workspaceId = await window.evaluate(async (): Promise<string | undefined> => {
      const browserWindow = globalThis.window as unknown as Window & { lithe: LitheBridge }
      return (await browserWindow.lithe.projects.getNavigation()).activeWorkspaceId ?? undefined
    })

    await window.getByRole('button', { name: 'note.txt', exact: true }).click()
    await expect(window.locator('.monaco-editor')).toBeVisible()
    await window.getByRole('button', { name: 'note.txt', exact: true }).click()
    await expect(window.getByRole('tab', { name: 'note.txt' })).toHaveCount(2)

    const editor = window.locator('.monaco-editor').last()
    await editor.click()
    await window.keyboard.press('Control+A')
    await window.keyboard.type('saved from Lithe')
    await window.keyboard.press('Control+S')

    await expect.poll((): string => readFileSync(filePath, 'utf8')).toBe('saved from Lithe')

    await editor.click()
    await window.keyboard.press('Control+A')
    await window.keyboard.type('local draft')
    writeFileSync(filePath, 'external change')
    const activePanel = window.getByRole('tabpanel')
    await expect(activePanel.getByText('磁盘内容已改变，本地未保存内容未被覆盖。')).toBeVisible()
    await activePanel.getByRole('button', { name: '使用磁盘版本' }).click()

    await editor.click()
    await window.keyboard.press('Control+A')
    await window.keyboard.type('discard this draft')
    await electronSession.application.evaluate(({ dialog }): void => {
      dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 1 })
    })
    await window.locator('.flexlayout__tab_button--selected .flexlayout__tab_button_trailing').click()
    await expect(window.getByRole('tab', { name: 'note.txt' })).toHaveCount(1)
    await window.locator('.flexlayout__tab_button--selected .flexlayout__tab_button_trailing').click()
    await expect(window.getByRole('tab', { name: 'note.txt' })).toHaveCount(0)
    await window.getByRole('button', { name: 'note.txt', exact: true }).click()
    await expect(window.getByRole('tabpanel').getByText('未保存')).toHaveCount(0)
    expect(readFileSync(filePath, 'utf8')).toBe('external change')
  } finally {
    if (workspaceId) {
      const window = await electronSession.application.firstWindow()
      await window
        .evaluate(
          async ({ relativePath, selectedWorkspaceId }): Promise<void> => {
            const browserWindow = globalThis.window as unknown as Window & { lithe: LitheBridge }
            await browserWindow.lithe.files.clearDraft(selectedWorkspaceId, relativePath)
          },
          { relativePath: 'note.txt', selectedWorkspaceId: workspaceId },
        )
        .catch((): void => undefined)
    }
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})

test('E2E-LITHE-011 saves dirty documents through the application exit confirmation', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-file-exit-project-'))
  const filePath = join(projectDirectory, 'exit.txt')
  writeFileSync(filePath, 'before exit')
  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
      dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 2 })
    }, projectDirectory)
    const window = await electronSession.application.firstWindow()
    await window.getByRole('button', { name: '添加项目' }).click()
    await window.getByRole('button', { name: '选择已有文件夹' }).click()
    await window.getByRole('button', { name: '创建项目' }).click()
    await window.getByRole('button', { name: 'exit.txt', exact: true }).click()
    const editor = window.locator('.monaco-editor')
    await editor.click()
    await window.keyboard.press('Control+A')
    await window.keyboard.type('saved while exiting')

    const closed = electronSession.application.waitForEvent('close')
    await electronSession.application.evaluate(({ app }): void => app.quit())
    await closed

    expect(readFileSync(filePath, 'utf8')).toBe('saved while exiting')
  } finally {
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})
