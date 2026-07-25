import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { Page } from '@playwright/test'

import type { AdapterDefinition, LitheBridge } from '../../../../shared/app-contract'
import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

test('E2E-LITHE-008 creates, binds, stops, resumes, and forks an Agent task', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-agent-project-'))
  const cliPath = resolve('packages/lithe-tool/dist/index.cjs')
  let page: Page | undefined
  try {
    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] })
    }, projectDirectory)
    page = await electronSession.application.firstWindow()
    await page.getByRole('button', { name: '添加项目' }).click()

    await page.evaluate(
      async ({ executable, toolPath }): Promise<void> => {
        const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
        const bindScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id','fake-session-1'],{stdio:'inherit'})`,
          "setTimeout(()=>console.log('LITHE_AGENT_READY'),300)",
          'setInterval(()=>{},1000)',
        ].join(';')
        const resumeScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id',process.argv[1]],{stdio:'inherit'})`,
          "setTimeout(()=>console.log('LITHE_AGENT_RESUMED '+process.argv[1]),300)",
          'setInterval(()=>{},1000)',
        ].join(';')
        const forkScript = [
          "const {spawnSync}=require('node:child_process')",
          `spawnSync(process.execPath,[${JSON.stringify(toolPath)},'agent','bind','--session-id','fake-session-fork-1'],{stdio:'inherit'})`,
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
      { executable: process.execPath, toolPath: cliPath },
    )

    await page.getByLabel('任务名称').fill('Review')
    await page.getByRole('button', { name: '创建任务' }).click()
    await expect(page.locator('[data-agent-id]')).toHaveCount(1)
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_AGENT_READY')

    await page.getByRole('button', { name: '停止' }).click()
    await page.getByRole('button', { name: '恢复' }).click()
    await expect(page.locator('.xterm-rows')).toContainText('LITHE_AGENT_RESUMED fake-session-1')

    await page.getByRole('button', { name: 'Fork' }).click()
    await expect(page.getByRole('button', { name: /Review-1/ })).toBeVisible()
    await expect
      .poll(async (): Promise<string | null> => {
        if (!page) return null
        return page.evaluate(async (): Promise<string | null> => {
          const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
          const navigation = await bridge.projects.getNavigation()
          if (!navigation.activeWorkspaceId) return null
          const tasks = await bridge.tasks.list(navigation.activeWorkspaceId)
          return tasks.find((task): boolean => task.name === 'Review-1')?.agentSessionId ?? null
        })
      })
      .toBe('fake-session-fork-1')

    const sourceTaskId = await page.evaluate(async (): Promise<string> => {
      const bridge = (window as typeof window & { lithe: LitheBridge }).lithe
      const navigation = await bridge.projects.getNavigation()
      if (!navigation.activeWorkspaceId) throw new Error('Active workspace is missing')
      const source = (await bridge.tasks.list(navigation.activeWorkspaceId)).find(
        (task): boolean => task.name === 'Review',
      )
      if (!source) throw new Error('Source task is missing')
      await bridge.tasks.setVisible(null)
      return source.id
    })
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
          if (!scratch || !scratch.rootPath.includes('.lithe')) return false
          return (await bridge.tasks.list(scratch.id)).some((task): boolean => task.name === 'Scratch review')
        })
      })
      .toBe(true)

    expect(runTool('task', 'unread', '--task-id', sourceTaskId).status).toBe(0)
    await expect(page.getByLabel('未读').first()).toBeVisible()

    expect(runTool('task', 'running', '--task-id', sourceTaskId, '--instance-id', 'e2e-external-agent').status).toBe(0)
    expect(runTool('task', 'archive', '--task-id', sourceTaskId).status).toBe(1)
    expect(runTool('task', 'idle', '--task-id', sourceTaskId, '--instance-id', 'e2e-external-agent').status).toBe(0)
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
