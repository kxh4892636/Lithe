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
  } finally {
    await electronSession.close()
    page = undefined
    rmSync(projectDirectory, { force: true, recursive: true })
  }
})
