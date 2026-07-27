import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { detectGitBranch } from './git-branch'

const temporaryDirectories: string[] = []

const createDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-git-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach((): void => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Git branch detection', (): void => {
  it('returns null for an ordinary directory', async (): Promise<void> => {
    const logError = vi.fn<(message: string, error: unknown) => void>()

    await expect(detectGitBranch(createDirectory(), logError)).resolves.toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })

  it('reads the actual branch of a Git root', async (): Promise<void> => {
    const rootPath = createDirectory()
    execFileSync('git', ['init', '--initial-branch=ws01', rootPath], { windowsHide: true })

    await expect(detectGitBranch(rootPath, vi.fn<(message: string, error: unknown) => void>())).resolves.toBe('ws01')
  })

  it('uses HEAD@shortSHA while the repository is detached', async (): Promise<void> => {
    const rootPath = createDirectory()
    execFileSync('git', ['init', '--initial-branch=main', rootPath], { windowsHide: true })
    execFileSync('git', ['-C', rootPath, 'config', 'user.email', 'lithe@example.test'], { windowsHide: true })
    execFileSync('git', ['-C', rootPath, 'config', 'user.name', 'Lithe Test'], { windowsHide: true })
    execFileSync('git', ['-C', rootPath, 'commit', '--allow-empty', '-m', 'initial'], { windowsHide: true })
    const shortSha = execFileSync('git', ['-C', rootPath, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
    execFileSync('git', ['-C', rootPath, 'checkout', '--detach'], { windowsHide: true })

    await expect(detectGitBranch(rootPath, vi.fn<(message: string, error: unknown) => void>())).resolves.toBe(
      `HEAD@${shortSha}`,
    )
  })

  it('logs and rethrows malformed Git metadata errors', async (): Promise<void> => {
    const rootPath = createDirectory()
    mkdirSync(join(rootPath, '.git'))
    const logError = vi.fn<(message: string, error: unknown) => void>()

    await expect(detectGitBranch(rootPath, logError)).rejects.toBeInstanceOf(Error)
    expect(logError).toHaveBeenCalledWith('Git branch detection failed', expect.any(Error))
  })
})
