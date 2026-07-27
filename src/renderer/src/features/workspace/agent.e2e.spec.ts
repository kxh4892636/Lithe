import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import type { Page } from '@playwright/test'

import type { AdapterDefinition, LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-008 creates, binds, stops, resumes, and forks an Agent task', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-agent-project-'))
  const stateControlPath = join(projectDirectory, '.agent-state')
  const cliPath = resolve('packages/lithe-tool/dist/index.cjs')
  const taskName = 'Review this deliberately long agent task title beneath its floating actions'
  let page: Page | undefined
  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, projectDirectory)
    page = await electronSession.application.firstWindow()
    await page.getByRole('button', { name: '添加项目' }).click()
    await page.getByRole('button', { name: '选择已有文件夹' }).click()
    await page.getByRole('button', { name: '创建项目' }).click()

    await page.evaluate(
      async ({ executable, statePath, toolPath }): Promise<void> => {
        const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
        const stateWatcher = [
          "const fs=require('node:fs')",
          'let lastState=""',
          `setInterval(()=>{let state;try{state=fs.readFileSync(${JSON.stringify(statePath)},'utf8').trim()}catch{return}if(state===lastState)return;lastState=state;if(state==='running'||state==='idle'){const result=spawnSync(process.execPath,[${JSON.stringify(toolPath)},'task',state],{stdio:'inherit'});console.log('LITHE_AGENT_STATE '+state+' '+result.status)}},100)`,
        ].join(';')
        const bindScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id','fake-session-1'],{stdio:'inherit'})`,
          stateWatcher,
          "setTimeout(()=>console.log('LITHE_AGENT_READY'),300)",
          'setInterval(()=>{},1000)',
        ].join(';')
        const resumeScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id',process.argv[1]],{stdio:'inherit'})`,
          stateWatcher,
          "setTimeout(()=>console.log('LITHE_AGENT_RESUMED '+process.argv[1]),300)",
          'setInterval(()=>{},1000)',
        ].join(';')
        const forkScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id','fake-session-fork-1'],{stdio:'inherit'})`,
          stateWatcher,
          "setTimeout(()=>console.log('LITHE_AGENT_FORKED'),300)",
          'setInterval(()=>{},1000)',
        ].join(';')
        const definition: AdapterDefinition = {
          executable,
          start: ['-e', bindScript],
          resume: ['-e', resumeScript, '{{agentSessionId}}'],
          fork: ['-e', forkScript, '{{agentSessionId}}'],
        }
        const adapter = await bridge.adapters.create('Deterministic Agent', definition)
        await bridge.adapters.setDefault(adapter.currentVersion.id)
      },
      { executable: process.execPath, statePath: stateControlPath, toolPath: cliPath },
    )

    await expect(page.getByRole('button', { name: basename(projectDirectory), exact: true })).toBeVisible()
    const workspaceRow = page
      .locator('li', { has: page.getByRole('button', { exact: true, name: basename(projectDirectory) }) })
      .locator('[data-sidebar="menu-sub-item"]')
      .first()
    await expect(workspaceRow).toBeVisible()
    await workspaceRow.hover()
    await workspaceRow.getByRole('button', { name: /创建任务/ }).click()
    const taskDialog = page.getByRole('dialog')
    await taskDialog.getByLabel('任务名称').fill(taskName)
    await taskDialog.getByRole('button', { name: '创建任务' }).click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(workspaceRow.locator('[data-slot="workspace-row"]')).toHaveAttribute('data-active', 'false')
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_AGENT_READY')
    await page.locator('[data-agent-id] [data-terminal-host]').evaluate((element: HTMLElement): void => {
      element.setAttribute('data-view-identity', 'source-agent-terminal')
    })
    await expect
      .poll(
        async (): Promise<boolean> =>
          page?.evaluate((): boolean => {
            const main = document.querySelector('[data-slot="workspace-main"]')
            if (!(main instanceof HTMLElement)) return false
            return (
              document.documentElement.scrollHeight === globalThis.innerHeight && main.scrollHeight <= main.clientHeight
            )
          }) ?? false,
      )
      .toBe(true)

    const sourceTaskTitle = page.getByTitle(taskName, { exact: true })
    const sourceTaskButton = sourceTaskTitle.locator('..')
    const sourceTaskRow = sourceTaskButton.locator('..')
    await expect(sourceTaskButton.getByLabel('空闲')).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await sourceTaskButton.hover()
    await expect(sourceTaskTitle).toHaveAttribute('data-overflow', 'true')
    await expect(sourceTaskTitle.locator('.task-title-track')).toHaveCSS('animation-name', 'task-title-marquee')
    await expect(sourceTaskRow.locator('[data-slot="task-actions"]')).toHaveCSS('position', 'absolute')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(sourceTaskTitle.locator('.task-title-track')).toHaveCSS('animation-name', 'none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.getByRole('button', { name: '停止' })).toHaveCount(0)
    await sourceTaskButton.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '停止' }).click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(0)
    await expect(sourceTaskButton.getByLabel('关闭')).toBeVisible()
    await sourceTaskButton.click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_AGENT_RESUMED fake-session-1')
    await expect(page.locator('[data-view-identity="source-agent-terminal"]')).toHaveCount(1)
    await expect(sourceTaskButton.getByLabel('空闲')).toBeVisible()

    writeFileSync(stateControlPath, 'running')
    await expect(sourceTaskButton.getByLabel('运行中')).toBeVisible()
    await sourceTaskButton.hover()
    await expect(page.getByRole('button', { name: `Fork ${taskName}` })).toBeDisabled()
    await expect(page.getByRole('button', { name: `归档 ${taskName}` })).toBeDisabled()
    writeFileSync(stateControlPath, 'idle')
    await expect(sourceTaskButton.getByLabel('空闲')).toBeVisible()

    await sourceTaskButton.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '停止' }).click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(0)
    await sourceTaskButton.hover()
    await page.getByRole('button', { name: `Fork ${taskName}` }).click()
    await expect(page.getByTitle(taskName, { exact: true })).toHaveCount(2)
    await expect
      .poll(async (): Promise<string | null> => {
        if (!page) return null
        return page.evaluate(async (): Promise<string | null> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          const navigation = await bridge.projects.getNavigation()
          if (!navigation.activeWorkspaceId) return null
          const tasks = await bridge.tasks.list(navigation.activeWorkspaceId)
          return tasks.find((task): boolean => task.agentSessionId === 'fake-session-fork-1')?.agentSessionId ?? null
        })
      })
      .toBe('fake-session-fork-1')

    const sourceTaskId = await page.evaluate(async (expectedName: string): Promise<string> => {
      const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
      const navigation = await bridge.projects.getNavigation()
      if (!navigation.activeWorkspaceId) throw new Error('Active workspace is missing')
      const source = (await bridge.tasks.list(navigation.activeWorkspaceId)).find(
        (task): boolean => task.name === expectedName,
      )
      if (!source) throw new Error('Source task is missing')
      await bridge.tasks.setVisible(null)
      return source.id
    }, taskName)
    const runTool = (...arguments_: string[]): ReturnType<typeof spawnSync> =>
      spawnSync(process.execPath, [cliPath, ...arguments_], {
        encoding: 'utf8',
        env: {
          ...process.env,
          LITHE_CONTROL_DISCOVERY_PATH: electronSession.controlDiscoveryPath,
        },
      })

    expect(runTool('task', 'create', '--name', 'Scratch review').status).toBe(0)
    await expect
      .poll(async (): Promise<boolean> => {
        if (!page) return false
        return page.evaluate(async (): Promise<boolean> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          const navigation = await bridge.projects.getNavigation()
          const scratch = navigation.scratchWorkspaces.find((workspace): boolean => workspace.kind === 'scratch')
          if (!scratch) return false
          return (await bridge.tasks.list(scratch.id)).some((task): boolean => task.name === 'Scratch review')
        })
      })
      .toBe(true)

    expect(runTool('task', 'unread', '--task-id', sourceTaskId).status).toBe(0)
    await expect
      .poll(
        async (): Promise<boolean> =>
          page?.evaluate(async (taskId: string): Promise<boolean> => {
            const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
            const navigation = await bridge.projects.getNavigation()
            if (!navigation.activeWorkspaceId) return false
            return (await bridge.tasks.list(navigation.activeWorkspaceId)).some(
              (task): boolean => task.id === taskId && Boolean(task.isUnread),
            )
          }, sourceTaskId) ?? false,
      )
      .toBe(true)

    expect(runTool('task', 'running').status).toBe(1)
    expect(runTool('task', 'idle').status).toBe(1)
    expect(runTool('task', 'archive', '--task-id', sourceTaskId).status).toBe(0)
    await expect
      .poll(async (): Promise<boolean> => {
        if (!page) return false
        return page.evaluate(async (taskId: string): Promise<boolean> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          return (await bridge.tasks.listArchived()).some((task): boolean => task.id === taskId)
        }, sourceTaskId)
      })
      .toBe(true)
  } finally {
    await electronSession.close()
    page = undefined
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})
