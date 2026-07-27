import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseToml } from 'smol-toml'

import { installLitheToolSkill, type SkillInstallResult } from '../main/agents/skill-installer'

export type InstallStatus = 'conflict' | 'installed' | 'skipped' | 'unchanged' | 'updated'

interface IntegrationInstallResult {
  data: {
    providers: { claude: InstallStatus; codex: InstallStatus; kimi: InstallStatus }
    skill: SkillInstallResult['status']
  }
  ok: boolean
}

interface IntegrationInstallerOptions {
  homeDirectory: string
  isCommandAvailable: (command: string) => boolean
  logError?: (message: string, error: unknown) => void
  skillContent: string
}

const hookCommand = 'lithe-tool agent bind --hook-input'
const jsonHookMarkerName = '.lithe-managed-session-start.json'
const managedJsonHook = {
  matcher: 'startup|resume',
  hooks: [{ type: 'command', command: hookCommand, timeout: 5 }],
}
const defaultLogError = (message: string, error: unknown): void => {
  process.stderr.write(`${message}: ${error instanceof Error ? error.message : String(error)}\n`)
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const findHookCommand = (groups: unknown[]): number =>
  groups.findIndex((group: unknown): boolean => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) return false
    return group.hooks.some(
      (hook: unknown): boolean => isRecord(hook) && hook.type === 'command' && hook.command === hookCommand,
    )
  })

const installJsonHook = (path: string): InstallStatus => {
  const existed = existsSync(path)
  const markerPath = join(dirname(path), jsonHookMarkerName)
  const markerExists = existsSync(markerPath)
  const originalConfig = existed ? readFileSync(path, 'utf8') : undefined
  const originalMarker = markerExists ? readFileSync(markerPath, 'utf8') : undefined
  let root: Record<string, unknown> = {}
  if (existed) {
    try {
      const parsed: unknown = JSON.parse(originalConfig ?? '')
      if (!isRecord(parsed)) return 'conflict'
      root = parsed
    } catch {
      return 'conflict'
    }
  }
  if (root.hooks !== undefined && !isRecord(root.hooks)) return 'conflict'
  const hooks = (root.hooks ?? {}) as Record<string, unknown>
  if (hooks.SessionStart !== undefined && !Array.isArray(hooks.SessionStart)) return 'conflict'
  const sessionStart = (hooks.SessionStart ?? []) as unknown[]
  const managedIndex = findHookCommand(sessionStart)
  if (managedIndex >= 0 && !markerExists) return 'conflict'
  if (managedIndex < 0 && markerExists) return 'conflict'
  if (markerExists) {
    try {
      const saved: unknown = JSON.parse(originalMarker ?? '')
      if (!isRecord(saved) || saved.version !== 1 || saved.command !== hookCommand) return 'conflict'
    } catch {
      return 'conflict'
    }
  }
  if (managedIndex >= 0 && JSON.stringify(sessionStart[managedIndex]) === JSON.stringify(managedJsonHook)) {
    return 'unchanged'
  }
  if (managedIndex >= 0) sessionStart[managedIndex] = managedJsonHook
  else sessionStart.push(managedJsonHook)
  hooks.SessionStart = sessionStart
  root.hooks = hooks
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(root, null, 2)}\n`, 'utf8')
    writeFileSync(markerPath, `${JSON.stringify({ command: hookCommand, version: 1 }, null, 2)}\n`, 'utf8')
  } catch (error: unknown) {
    try {
      if (originalConfig === undefined) rmSync(path, { force: true })
      else writeFileSync(path, originalConfig, 'utf8')
      if (originalMarker === undefined) rmSync(markerPath, { force: true })
      else writeFileSync(markerPath, originalMarker, 'utf8')
    } catch (rollbackError: unknown) {
      throw new Error('JSON hook installation and rollback failed', { cause: rollbackError })
    }
    throw error
  }
  return managedIndex >= 0 || existed ? 'updated' : 'installed'
}

const kimiMarkerStart = '# lithe-managed:session-start-hook:start'
const kimiMarkerEnd = '# lithe-managed:session-start-hook:end'
const kimiBlock = `${kimiMarkerStart}
[[hooks]]
event = "SessionStart"
matcher = "startup|resume"
command = "${hookCommand}"
timeout = 5
${kimiMarkerEnd}`

const installKimiHook = (path: string): InstallStatus => {
  const existed = existsSync(path)
  const current = existed ? readFileSync(path, 'utf8') : ''
  try {
    parseToml(current)
  } catch {
    return 'conflict'
  }
  const hasStart = current.includes(kimiMarkerStart)
  const hasEnd = current.includes(kimiMarkerEnd)
  if (hasStart !== hasEnd) return 'conflict'
  if (hasStart && hasEnd) return current.includes(kimiBlock) ? 'unchanged' : 'conflict'
  if (current.includes(`command = "${hookCommand}"`)) return 'conflict'
  const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n'
  const updated = `${current}${separator}${current.length === 0 ? '' : '\n'}${kimiBlock}\n`
  try {
    parseToml(updated)
  } catch {
    return 'conflict'
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, updated, 'utf8')
  return existed ? 'updated' : 'installed'
}

export const installAgentIntegrations = (options: IntegrationInstallerOptions): IntegrationInstallResult => {
  const logError = options.logError ?? defaultLogError
  const installProvider = (name: string, install: () => InstallStatus): InstallStatus => {
    try {
      return install()
    } catch (error: unknown) {
      logError(`${name} integration installation failed`, error)
      return 'conflict'
    }
  }
  const skill = installLitheToolSkill(options.homeDirectory, options.skillContent, logError)
  const providers = {
    claude: options.isCommandAvailable('claude')
      ? installProvider(
          'Claude Code',
          (): InstallStatus => installJsonHook(join(options.homeDirectory, '.claude', 'settings.json')),
        )
      : ('skipped' as const),
    codex: options.isCommandAvailable('codex')
      ? installProvider(
          'Codex',
          (): InstallStatus => installJsonHook(join(options.homeDirectory, '.codex', 'hooks.json')),
        )
      : ('skipped' as const),
    kimi: options.isCommandAvailable('kimi')
      ? installProvider(
          'Kimi Code',
          (): InstallStatus => installKimiHook(join(options.homeDirectory, '.kimi-code', 'config.toml')),
        )
      : ('skipped' as const),
  }
  return {
    ok: skill.status !== 'conflict' && !Object.values(providers).includes('conflict'),
    data: { providers, skill: skill.status },
  }
}
