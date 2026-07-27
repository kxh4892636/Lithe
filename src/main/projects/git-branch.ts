import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const detectGitBranch = async (
  rootPath: string,
  logError: (message: string, error: unknown) => void,
): Promise<string | null> => {
  try {
    await stat(join(rootPath, '.git'))
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    logError('Git metadata detection failed', error)
    throw error
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', rootPath, 'branch', '--show-current'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    })
    const branchName = stdout.trim()
    if (branchName) return branchName

    const { stdout: shortSha } = await execFileAsync('git', ['-C', rootPath, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    })
    return `HEAD@${shortSha.trim()}`
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      logError('Git executable unavailable', error)
      return null
    }
    logError('Git branch detection failed', error)
    throw error
  }
}
