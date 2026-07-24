import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'

interface DetectShellsOptions {
  environment: NodeJS.ProcessEnv
  exists: (command: string) => Promise<boolean>
  platform: NodeJS.Platform
}

const execFileAsync = promisify(execFile)

const systemCommandExists = async (command: string): Promise<boolean> => {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('where.exe', [command], { windowsHide: true })
    } else {
      await access(command, constants.X_OK)
    }
    return true
  } catch (error: unknown) {
    const code = (error as { code?: unknown }).code
    if ((process.platform === 'win32' && code === 1) || code === 'ENOENT' || code === 'EACCES') return false
    throw error
  }
}

export const detectShells = async ({ environment, exists, platform }: DetectShellsOptions): Promise<string[]> => {
  if (platform !== 'win32') {
    const loginShell = environment.SHELL?.trim()
    if (loginShell && (await exists(loginShell))) return [loginShell]
    return (await exists('/bin/sh')) ? ['/bin/sh'] : []
  }

  const candidates = ['pwsh.exe', 'powershell.exe', 'cmd.exe']
  const detected: string[] = []
  for (const candidate of candidates) {
    if (await exists(candidate)) detected.push(candidate)
  }
  return detected
}

export const detectSystemShells = async (): Promise<string[]> =>
  detectShells({ environment: process.env, exists: systemCommandExists, platform: process.platform })
