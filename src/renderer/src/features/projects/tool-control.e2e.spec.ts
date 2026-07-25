import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { expect, test, type ElectronTestFixtures } from '../../test/electron-application'

interface CommandResult {
  exitCode: number
  stderr: string
  stdout: string
}

const runCommand = (
  command: string,
  arguments_: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> =>
  new Promise((resolve: (value: CommandResult) => void, reject: (reason?: unknown) => void): void => {
    const child = spawn(command, arguments_, {
      ...options,
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (chunk: Buffer): void => {
      stderr += chunk.toString()
    })
    child.stdout.on('data', (chunk: Buffer): void => {
      stdout += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (exitCode: number | null): void => {
      resolve({ exitCode: exitCode ?? 1, stderr, stdout })
    })
  })

test('E2E-LITHE-007 queries the running app through the built global CLI entry', async ({
  electronSession,
}: ElectronTestFixtures): Promise<void> => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'lithe-tool-project-'))
  const cliInstallDirectory = mkdtempSync(join(tmpdir(), 'lithe-tool-global-'))
  const packageArchiveDirectory = join(cliInstallDirectory, 'package')
  mkdirSync(packageArchiveDirectory)

  try {
    const packed = await runCommand('npm', ['pack', '--silent', '--pack-destination', packageArchiveDirectory], {
      cwd: join(process.cwd(), 'packages', 'lithe-tool'),
    })
    expect(packed.exitCode).toBe(0)
    const archiveName = readdirSync(packageArchiveDirectory).find((name: string): boolean => name.endsWith('.tgz'))
    if (!archiveName) throw new Error('lithe-tool package archive was not created')
    const installed = await runCommand('npm', [
      'install',
      '--global',
      '--ignore-scripts',
      '--prefix',
      cliInstallDirectory,
      join(packageArchiveDirectory, archiveName),
    ])
    expect(installed.exitCode).toBe(0)

    await electronSession.application.evaluate(({ dialog }, selectedDirectory): void => {
      dialog.showOpenDialog = async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
        canceled: false,
        filePaths: [selectedDirectory],
      })
    }, projectDirectory)
    const window = await electronSession.application.firstWindow()
    await window.getByRole('button', { name: '添加项目' }).click()

    const cliBinDirectory = process.platform === 'win32' ? cliInstallDirectory : join(cliInstallDirectory, 'bin')
    const cliEnvironment = {
      ...process.env,
      LITHE_CONTROL_DISCOVERY_PATH: electronSession.controlDiscoveryPath,
      PATH: `${cliBinDirectory}${delimiter}${process.env.PATH ?? ''}`,
    }
    const { exitCode, stderr, stdout } = await runCommand('lithe-tool', ['context'], {
      env: cliEnvironment,
    })
    const lines = stdout.trim().split('\n')
    const response = JSON.parse(stdout) as {
      ok: boolean
      data: { activeWorkspaceId: string; projects: Array<{ rootPath: string }> }
    }

    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(lines).toHaveLength(1)
    expect(response.ok).toBe(true)
    expect(response.data.activeWorkspaceId).toBeTruthy()
    expect(response.data.projects).toContainEqual(expect.objectContaining({ rootPath: projectDirectory }))

    await electronSession.close()
    const stopped = await runCommand('lithe-tool', ['context'], { env: cliEnvironment })
    expect(stopped.exitCode).toBe(1)
    expect(JSON.parse(stopped.stdout)).toMatchObject({
      ok: false,
      error: { code: 'LITHE_NOT_RUNNING' },
    })
  } finally {
    rmSync(projectDirectory, { force: true, recursive: true })
    rmSync(cliInstallDirectory, { force: true, recursive: true })
  }
})
