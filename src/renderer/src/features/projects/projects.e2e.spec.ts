import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { simpleGit } from 'simple-git'

import type { LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-003 adds a directory and restores its default workspace', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-project-'))

  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })
    }, projectDirectory)
    let window = await electronSession.application.firstWindow()

    await window.getByRole('button', { name: '添加项目' }).click()
    await expect(window.getByRole('button', { name: basename(projectDirectory), exact: true })).toBeVisible()
    await expect(window.getByRole('region', { name: '默认 工作区' })).toBeVisible()
    await expect(window.getByRole('button', { name: '默认' })).toBeVisible()

    await electronSession.restart()
    window = await electronSession.application.firstWindow()
    await expect(window.getByRole('region', { name: '默认 工作区' })).toBeVisible()
  } finally {
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})

test('E2E-LITHE-004 adds a newly created directory from the system picker', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const parentDirectory = mkdtempSync(join(tmpdir(), 'lithe-new-project-parent-'))
  const projectDirectory = join(parentDirectory, 'new-project')

  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })
    }, projectDirectory)
    mkdirSync(projectDirectory)
    const window = await electronSession.application.firstWindow()

    await window.getByRole('button', { name: '添加项目' }).click()

    await expect(window.getByRole('button', { name: 'new-project', exact: true })).toBeVisible()
    await expect(window.getByRole('region', { name: '默认 工作区' })).toBeVisible()
    await expect(window.getByRole('button', { name: '默认' })).toBeVisible()
  } finally {
    rmSync(parentDirectory, { force: true, recursive: true })
  }
})

test('E2E-LITHE-005 restores a collapsed sidebar and expands it as an overlay on hover', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  let window = await electronSession.application.firstWindow()
  const sidebar = window.locator('[data-slot="sidebar"]').first()
  await expect(window.locator('[data-slot="sidebar-inner"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const resizeHandle = window.getByRole('separator', { name: '调整侧栏宽度' })
  const resizeBox = await resizeHandle.boundingBox()
  if (!resizeBox) throw new Error('侧栏宽度控制柄不可见')
  await window.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 20)
  await window.mouse.down()
  await window.mouse.move(resizeBox.x + 40, resizeBox.y + 20)
  await window.mouse.up()
  await expect
    .poll(async (): Promise<number> => (await window.locator('[data-slot="sidebar-gap"]').boundingBox())?.width ?? 0)
    .toBeGreaterThan(285)

  const projectGroup = window.getByRole('button', { name: '项目', exact: true })
  await projectGroup.click()
  await expect(projectGroup).toHaveAttribute('aria-expanded', 'false')

  await window.getByRole('button', { name: '切换侧栏' }).click()
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  await expect
    .poll(async (): Promise<number> => (await window.locator('[data-slot="sidebar-gap"]').boundingBox())?.width ?? 0)
    .toBeLessThan(50)
  const collapsedGap = await window.locator('[data-slot="sidebar-gap"]').boundingBox()

  await window.locator('[data-slot="sidebar-container"]').hover()
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  await expect(sidebar).toHaveAttribute('data-overlay-expanded', 'true')
  const hoveredGap = await window.locator('[data-slot="sidebar-gap"]').boundingBox()
  expect(Math.abs((collapsedGap?.width ?? 0) - (hoveredGap?.width ?? 0))).toBeLessThan(2)

  await electronSession.restart()
  window = await electronSession.application.firstWindow()
  await expect(window.locator('[data-slot="sidebar"]').first()).toHaveAttribute('data-state', 'collapsed')
  await window.getByRole('button', { name: '切换侧栏' }).click()
  await expect
    .poll(async (): Promise<number> => (await window.locator('[data-slot="sidebar-gap"]').boundingBox())?.width ?? 0)
    .toBeGreaterThan(285)
  await expect(window.getByRole('button', { name: '项目', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('E2E-LITHE-009 creates and deletes a managed Git workspace from project navigation', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-worktree-project-'))
  const git = simpleGit(projectDirectory)

  try {
    await git.init(['--initial-branch=main'])
    await git.addConfig('user.name', 'Lithe E2E')
    await git.addConfig('user.email', 'lithe@example.test')
    writeFileSync(join(projectDirectory, 'tracked.txt'), 'committed\n')
    await git.add('tracked.txt')
    await git.commit('initial')
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
      dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 1 })
    }, projectDirectory)
    const window = await electronSession.application.firstWindow()

    await window.getByRole('button', { name: '添加项目' }).click()
    await window.getByRole('button', { name: `为 ${basename(projectDirectory)} 创建工作区` }).click()
    await window.getByRole('textbox', { name: '分支名称' }).fill('feature/e2e')
    await window.getByRole('textbox', { name: '工作区名称' }).fill('Review')
    await window.getByRole('button', { name: '创建工作区', exact: true }).click()
    await expect(window.getByRole('button', { name: 'Review', exact: true })).toBeVisible()

    const managedPath = await window.evaluate(async (): Promise<string> => {
      const browserWindow = globalThis.window as unknown as Window & { lithe: LitheBridge }
      const navigation = await browserWindow.lithe.projects.getNavigation()
      const derived = navigation.projects
        .flatMap((project) => project.workspaces)
        .find((workspace) => workspace.kind === 'derived')
      if (!derived) throw new Error('Derived workspace is missing')
      return derived.rootPath
    })
    await window.getByRole('button', { name: '删除 Review' }).click()
    await window.getByRole('button', { name: '确认操作' }).click()
    await expect(window.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0)
    await expect.poll((): boolean => existsSync(managedPath)).toBe(false)
  } finally {
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})
