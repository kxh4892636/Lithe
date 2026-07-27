import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  skillContent: string
}

const hookCommand = 'lithe-tool agent bind --hook-input'
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const containsHookCommand = (groups: unknown[]): boolean =>
  groups.some((group: unknown): boolean => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) return false
    return group.hooks.some(
      (hook: unknown): boolean => isRecord(hook) && hook.type === 'command' && hook.command === hookCommand,
    )
  })

const installJsonHook = (path: string): InstallStatus => {
  const existed = existsSync(path)
  let root: Record<string, unknown> = {}
  if (existed) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
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
  if (containsHookCommand(sessionStart)) return 'unchanged'
  sessionStart.push({
    matcher: 'startup|resume',
    hooks: [{ type: 'command', command: hookCommand, timeout: 5 }],
  })
  hooks.SessionStart = sessionStart
  root.hooks = hooks
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(root, null, 2)}\n`, 'utf8')
  return existed ? 'updated' : 'installed'
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
  const skill = installLitheToolSkill(options.homeDirectory, options.skillContent)
  const providers = {
    claude: options.isCommandAvailable('claude')
      ? installJsonHook(join(options.homeDirectory, '.claude', 'settings.json'))
      : ('skipped' as const),
    codex: options.isCommandAvailable('codex')
      ? installJsonHook(join(options.homeDirectory, '.codex', 'hooks.json'))
      : ('skipped' as const),
    kimi: options.isCommandAvailable('kimi')
      ? installKimiHook(join(options.homeDirectory, '.kimi-code', 'config.toml'))
      : ('skipped' as const),
  }
  return {
    ok: skill.status !== 'conflict' && !Object.values(providers).includes('conflict'),
    data: { providers, skill: skill.status },
  }
}
