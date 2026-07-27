import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import type { ElectronApplication, Locator, Page } from '@playwright/test'

import type { AdapterDefinition, LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

const cliPath = resolve('packages/lithe-tool/dist/index.cjs')

const addProject = async (application: ElectronApplication, page: Page, projectDirectory: string): Promise<void> => {
  await application.evaluate(({ dialog }, selectedDirectory): void => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
  }, projectDirectory)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '选择已有文件夹' }).click()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('button', { name: basename(projectDirectory), exact: true })).toBeVisible()
}

const createDefaultAdapter = async (page: Page, script: string): Promise<void> => {
  await page.evaluate(
    async ({ executable, scriptBody, toolPath }): Promise<void> => {
      const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
      const bindPrefix = `const {spawnSync}=require('node:child_process');spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id','fake-session-panels'],{stdio:'inherit'});`
      const definition: AdapterDefinition = {
        executable,
        fork: null,
        start: ['-e', bindPrefix + scriptBody],
        resume: ['-e', bindPrefix + scriptBody, '{{agentSessionId}}'],
      }
      const adapter = await bridge.adapters.create('Deterministic Agent', definition)
      await bridge.adapters.setDefault(adapter.currentVersion.id)
    },
    { executable: process.execPath, scriptBody: script, toolPath: cliPath },
  )
}

const workspaceRowOf = (page: Page, projectName: string): Locator =>
  page
    .locator('li', { has: page.getByRole('button', { exact: true, name: projectName }) })
    .locator('[data-sidebar="menu-sub-item"]')
    .first()

const createTask = async (page: Page, workspaceRow: Locator, taskName: string): Promise<void> => {
  await workspaceRow.hover()
  await workspaceRow.getByRole('button', { name: /创建任务/ }).click()
  const taskDialog = page.getByRole('dialog')
  await taskDialog.getByLabel('任务名称').fill(taskName)
  await taskDialog.getByRole('button', { name: '创建任务' }).click()
}

const selectedTab = (page: Page): Locator => page.locator('.flexlayout__tab_button--selected')

const latestTick = async (terminal: Locator): Promise<number> => {
  const text = await terminal.textContent()
  const ticks = [...(text ?? '').matchAll(/LITHE_AGENT_TICK (\d+)/g)]
  return Number(ticks.at(-1)?.[1] ?? 0)
}

test('E2E-LITHE-015 keeps a closed or manually switched Agent panel as the final state', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-agent-panels-'))
  let page: Page | undefined
  try {
    page = await electronSession.application.firstWindow()
    await addProject(electronSession.application, page, projectDirectory)
    await createDefaultAdapter(
      page,
      [
        "let tick=0;setTimeout(()=>console.log('LITHE_AGENT_READY'),300)",
        "setInterval(()=>console.log('LITHE_AGENT_TICK '+(++tick)),150)",
      ].join(';'),
    )
    const workspaceRow = workspaceRowOf(page, basename(projectDirectory))

    await createTask(page, workspaceRow, 'Alpha')
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_AGENT_READY')
    await createTask(page, workspaceRow, 'Beta')
    await expect(page.locator('[data-agent-id]')).toHaveCount(2)

    // 侧边栏点击任务始终聚焦对应 Agent 面板（ADR 0021）
    await page.getByText('-Alpha', { exact: true }).locator('..').click()
    await expect(selectedTab(page)).toContainText('Alpha')
    const alphaTaskId = await page.evaluate(async (): Promise<string> => {
      const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
      const navigation = await bridge.projects.getNavigation()
      if (!navigation.activeWorkspaceId) throw new Error('Active workspace is missing')
      const alpha = (await bridge.tasks.list(navigation.activeWorkspaceId)).find(
        (task: { name: string }): boolean => task.name === 'Alpha',
      )
      if (!alpha) throw new Error('Alpha task is missing')
      return alpha.id
    })
    const alphaTerminal = page.locator(`[data-agent-id="${alphaTaskId}"] .xterm-rows`)
    await expect(alphaTerminal).toContainText('LITHE_AGENT_TICK')
    const tickBeforeClose = await latestTick(alphaTerminal)

    // ADR 0069：关闭面板是有效终态，任务事件不再复活它
    await page.locator('.flexlayout__tab_button--selected .flexlayout__tab_button_trailing').click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(selectedTab(page)).toContainText('Beta')
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(selectedTab(page)).toContainText('Beta')

    // ADR 0069：手动切换标签不被任务事件拉回
    await page.getByText('-Alpha', { exact: true }).locator('..').click()
    await expect(selectedTab(page)).toContainText('Alpha')
    await expect.poll(async (): Promise<number> => latestTick(alphaTerminal)).toBeGreaterThan(tickBeforeClose + 3)
    await page.locator('.flexlayout__tab_button', { hasText: 'Beta' }).click()
    await expect(selectedTab(page)).toContainText('Beta')
    await page.waitForTimeout(1500)
    await expect(selectedTab(page)).toContainText('Beta')
  } finally {
    await electronSession.close()
    page = undefined
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})

test('E2E-LITHE-016 repaints the Agent panel after switching projects away and back', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const firstDirectory = mkdtempSync(join(tmpdir(), 'lithe-repaint-first-'))
  const secondDirectory = mkdtempSync(join(tmpdir(), 'lithe-repaint-second-'))
  let page: Page | undefined
  try {
    page = await electronSession.application.firstWindow()
    await addProject(electronSession.application, page, firstDirectory)
    await createDefaultAdapter(
      page,
      ["setTimeout(()=>console.log('LITHE_AGENT_READY'),300)", 'setInterval(()=>{},1000)'].join(';'),
    )
    const activePage = page
    const firstWorkspaceRow = workspaceRowOf(activePage, basename(firstDirectory))

    await createTask(activePage, firstWorkspaceRow, 'Echo')
    await expect(activePage.locator('[data-agent-id]')).toHaveCount(1)
    await expect(activePage.locator('.xterm-rows')).toContainText('LITHE_AGENT_READY')
    // 布局持久化有 250ms 防抖，等待 Agent 面板进入快照再切换
    await expect
      .poll(async (): Promise<boolean> => {
        return activePage.evaluate(async (): Promise<boolean> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          const navigation = await bridge.projects.getNavigation()
          if (!navigation.activeWorkspaceId) return false
          const snapshot = await bridge.workspaceLayouts.get(navigation.activeWorkspaceId)
          return JSON.stringify(snapshot).includes('"component":"agent"')
        })
      })
      .toBe(true)

    await page.locator('[data-agent-id] [data-terminal-host]').evaluate((element: HTMLElement): void => {
      element.setAttribute('data-view-identity', 'project-switch-agent')
    })
    // 切到第二个项目：原工作区保留挂载，只切换可见性
    await addProject(electronSession.application, activePage, secondDirectory)
    const secondWorkspaceRow = workspaceRowOf(activePage, basename(secondDirectory))
    await secondWorkspaceRow.getByRole('button', { exact: true, name: '默认' }).click()
    await expect(activePage.locator('[data-agent-id]')).toBeHidden()

    // 切回：同一终端视图恢复可见，不重建、不依赖 ConPTY 重放
    await firstWorkspaceRow.getByRole('button', { exact: true, name: '默认' }).click()
    await expect(activePage.locator('[data-agent-id]')).toHaveCount(1)
    await expect(activePage.locator('.xterm-rows')).toContainText('LITHE_AGENT_READY')
    await expect(activePage.locator('[data-view-identity="project-switch-agent"]')).toHaveCount(1)
  } finally {
    await electronSession.close()
    page = undefined
    rmSync(firstDirectory, { force: true, recursive: true })
    rmSync(secondDirectory, { force: true, recursive: true })
  }
})
