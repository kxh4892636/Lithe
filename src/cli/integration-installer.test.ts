import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as parseToml } from 'smol-toml'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installAgentIntegrations } from './integration-installer'

const directories: string[] = []
const temporaryHome = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lithe-integrations-'))
  directories.push(directory)
  return directory
}

afterEach((): void => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe('Agent integration installer', (): void => {
  it('installs the Skill and detected provider SessionStart hooks idempotently', (): void => {
    const home = temporaryHome()
    const available = new Set(['codex', 'claude', 'kimi'])

    const first = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (command: string): boolean => available.has(command),
      skillContent: 'managed skill',
    })
    const second = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (command: string): boolean => available.has(command),
      skillContent: 'managed skill',
    })

    expect(first).toEqual({
      ok: true,
      data: {
        skill: 'installed',
        providers: { claude: 'installed', codex: 'installed', kimi: 'installed' },
      },
    })
    expect(second).toEqual({
      ok: true,
      data: {
        skill: 'unchanged',
        providers: { claude: 'unchanged', codex: 'unchanged', kimi: 'unchanged' },
      },
    })
    const codex = JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    expect(codex.hooks.SessionStart[0]?.hooks[0]?.command).toBe('lithe-tool agent bind --hook-input')
    const claude = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    expect(claude.hooks.SessionStart[0]?.hooks[0]?.command).toBe('lithe-tool agent bind --hook-input')
    expect(() => parseToml(readFileSync(join(home, '.kimi-code', 'config.toml'), 'utf8'))).not.toThrow()
  })

  it('skips unavailable providers and isolates an invalid provider config conflict', (): void => {
    const home = temporaryHome()
    mkdirSync(join(home, '.codex'), { recursive: true })
    writeFileSync(join(home, '.codex', 'hooks.json'), '{ invalid', 'utf8')

    const result = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (command: string): boolean => command !== 'kimi',
      skillContent: 'managed skill',
    })

    expect(result).toEqual({
      ok: false,
      data: {
        skill: 'installed',
        providers: { claude: 'installed', codex: 'conflict', kimi: 'skipped' },
      },
    })
    expect(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8')).toBe('{ invalid')
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toContain('SessionStart')
  })

  it('preserves existing Kimi TOML text while appending the managed hook block', (): void => {
    const home = temporaryHome()
    const directory = join(home, '.kimi-code')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'config.toml'), 'model = "kimi-for-coding"\n', 'utf8')

    const result = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (command: string): boolean => command === 'kimi',
      skillContent: 'managed skill',
    })
    const content = readFileSync(join(directory, 'config.toml'), 'utf8')

    expect(result.data.providers.kimi).toBe('updated')
    expect(content).toMatch(/^model = "kimi-for-coding"/)
    expect(content).toContain('event = "SessionStart"')
    expect(content).toContain('command = "lithe-tool agent bind --hook-input"')
  })

  it('reports a filesystem failure for one provider and continues the others', (): void => {
    const home = temporaryHome()
    const logError = vi.fn<(message: string, error: unknown) => void>()
    writeFileSync(join(home, '.kimi-code'), 'not a directory', 'utf8')

    const result = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (): boolean => true,
      logError,
      skillContent: 'managed skill',
    })

    expect(result.data.providers).toEqual({ claude: 'installed', codex: 'installed', kimi: 'conflict' })
    expect(result.ok).toBe(false)
    expect(logError).toHaveBeenCalledWith('Kimi Code integration installation failed', expect.any(Error))
    expect(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8')).toContain('SessionStart')
  })

  it('rejects an unmanaged matching JSON hook instead of claiming ownership', (): void => {
    const home = temporaryHome()
    const directory = join(home, '.codex')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'hooks.json'),
      `${JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: 'startup',
              hooks: [{ type: 'command', command: 'lithe-tool agent bind --hook-input', timeout: 30 }],
            },
          ],
        },
      })}\n`,
      'utf8',
    )

    const result = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: (command: string): boolean => command === 'codex',
      skillContent: 'managed skill',
    })

    expect(result.data.providers.codex).toBe('conflict')
  })

  it('upgrades a changed managed JSON hook using its sidecar marker', (): void => {
    const home = temporaryHome()
    const available = (command: string): boolean => command === 'codex'
    installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: available,
      skillContent: 'managed skill',
    })
    const hookPath = join(home, '.codex', 'hooks.json')
    const changed = JSON.parse(readFileSync(hookPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ timeout: number }> }> }
    }
    const hook = changed.hooks.SessionStart[0]?.hooks[0]
    if (!hook) throw new Error('Managed Codex hook is missing')
    hook.timeout = 30
    writeFileSync(hookPath, `${JSON.stringify(changed, null, 2)}\n`, 'utf8')

    const result = installAgentIntegrations({
      homeDirectory: home,
      isCommandAvailable: available,
      skillContent: 'managed skill',
    })
    const upgraded = JSON.parse(readFileSync(hookPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ timeout: number }> }> }
    }

    expect(result.data.providers.codex).toBe('updated')
    expect(upgraded.hooks.SessionStart[0]?.hooks[0]?.timeout).toBe(5)
  })
})
