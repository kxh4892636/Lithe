#!/usr/bin/env node
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Command } from 'commander'
import which from 'which'

import litheToolSkillContent from '../../resources/lithe-tool/SKILL.md'
import {
  readControlDiscovery,
  resolveControlDiscoveryPath,
  type ControlDiscovery,
} from '../main/tool-control/control-discovery'
import type { ToolRequest } from '../shared/tool-protocol'
import { parseSessionStartHookInput } from './hook-input'
import { installAgentIntegrations } from './integration-installer'
import { requestTool, responseToStdout } from './tool-client'

const resolveDiscovery = (): ControlDiscovery | undefined => {
  const endpoint = process.env.LITHE_CONTROL_ENDPOINT
  const token = process.env.LITHE_CONTROL_TOKEN
  if (endpoint && token) return { endpoint, token }
  try {
    return readControlDiscovery(
      process.env.LITHE_CONTROL_DISCOVERY_PATH ??
        resolveControlDiscoveryPath(join(homedir(), '.lithe'), process.platform),
    )
  } catch {
    return undefined
  }
}

const unavailable = (): void => {
  process.stdout.write(
    `${JSON.stringify({
      id: null,
      ok: false,
      error: { code: 'LITHE_NOT_RUNNING', message: 'Lithe is not running' },
    })}\n`,
  )
  process.exitCode = 1
}

const execute = async (command: string, payload?: Record<string, unknown>): Promise<void> => {
  const discovery = resolveDiscovery()
  if (!discovery) {
    unavailable()
    return
  }
  const capability = process.env.LITHE_CAPABILITY
  const authorization: ToolRequest['authorization'] = capability
    ? { kind: 'agent', capability }
    : { kind: 'external', token: discovery.token }
  const response = await requestTool({ authorization, command, endpoint: discovery.endpoint, payload })
  process.stdout.write(responseToStdout(response))
  process.exitCode = response.ok ? 0 : 1
}

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  return Buffer.concat(chunks).toString('utf8')
}

const executeHookBind = async (): Promise<void> => {
  const capability = process.env.LITHE_CAPABILITY
  if (!capability) return
  try {
    const sessionId = parseSessionStartHookInput(await readStdin())
    const discovery = resolveDiscovery()
    if (!discovery) throw new TypeError('Lithe is not running')
    const response = await requestTool({
      authorization: { kind: 'agent', capability },
      command: 'agent.bind',
      endpoint: discovery.endpoint,
      payload: { sessionId },
    })
    if (!response.ok) throw new TypeError(response.error.message)
  } catch (error: unknown) {
    process.stderr.write(`lithe-tool hook bind failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

const program = new Command()
  .name('lithe-tool')
  .description('Manage Lithe and its Coding Agent integrations')
  .version(__LITHE_TOOL_VERSION__)
  .exitOverride()

program
  .command('install')
  .description('Install the Lithe Tool Skill and detected Coding Agent hooks')
  .action((): void => {
    const result = installAgentIntegrations({
      homeDirectory: homedir(),
      isCommandAvailable: (command: string): boolean => which.sync(command, { nothrow: true }) !== null,
      skillContent: litheToolSkillContent,
    })
    process.stdout.write(`${JSON.stringify({ id: null, ...result })}\n`)
    process.exitCode = result.ok ? 0 : 1
  })

program
  .command('context')
  .description('Return the current Lithe project and workspace hierarchy')
  .action((): Promise<void> => execute('context'))

const task = program.command('task').description('Manage Lithe tasks')
task
  .command('create')
  .option('--workspace-id <id>')
  .option('--adapter-id <id>')
  .requiredOption('--name <name>')
  .action(
    (options: { adapterId?: string; workspaceId?: string; name: string }): Promise<void> =>
      execute('task.create', {
        adapterId: options.adapterId,
        workspaceId: options.workspaceId,
        name: options.name,
      }),
  )
task
  .command('rename')
  .requiredOption('--task-id <id>')
  .requiredOption('--name <name>')
  .action(
    (options: { taskId: string; name: string }): Promise<void> =>
      execute('task.rename', { taskId: options.taskId, name: options.name }),
  )

for (const operation of ['unread', 'archive', 'delete'] as const) {
  task
    .command(operation)
    .option('--task-id <id>')
    .action((options: { taskId?: string }): Promise<void> => execute(`task.${operation}`, { taskId: options.taskId }))
}

for (const operation of ['running', 'idle'] as const) {
  task.command(operation).action((): Promise<void> => execute(`task.${operation}`))
}

const agent = program.command('agent').description('Manage coding Agent processes')
agent
  .command('bind')
  .option('--session-id <id>')
  .option('--hook-input')
  .action((options: { hookInput?: boolean; sessionId?: string }): Promise<void> => {
    if (options.hookInput && !options.sessionId) return executeHookBind()
    if (options.sessionId && !options.hookInput) return execute('agent.bind', { sessionId: options.sessionId })
    throw new TypeError('Choose exactly one Agent binding input')
  })

for (const operation of ['start', 'resume', 'stop', 'fork'] as const) {
  agent
    .command(operation)
    .requiredOption('--task-id <id>')
    .action((options: { taskId: string }): Promise<void> => execute(`agent.${operation}`, options))
}

const workspace = program.command('workspace').description('Manage Lithe Git workspaces')
workspace
  .command('create')
  .requiredOption('--project-id <id>')
  .option('--new-branch <branch>')
  .option('--from <commit>')
  .option('--existing-branch <branch>')
  .option('--name <name>')
  .option('--source-workspace-id <id>')
  .action(
    (options: {
      existingBranch?: string
      from?: string
      name?: string
      newBranch?: string
      projectId: string
      sourceWorkspaceId?: string
    }): Promise<void> => execute('workspace.create', options),
  )
workspace
  .command('rename')
  .requiredOption('--workspace-id <id>')
  .requiredOption('--name <name>')
  .action((options: { name: string; workspaceId: string }): Promise<void> => execute('workspace.rename', options))
workspace
  .command('delete')
  .requiredOption('--workspace-id <id>')
  .option('--confirm-branch <branch>')
  .action(
    (options: { confirmBranch?: string; workspaceId: string }): Promise<void> =>
      execute('workspace.delete', {
        branchConfirmation: options.confirmBranch,
        workspaceId: options.workspaceId,
      }),
  )

const projectCommand = program.command('project').description('Manage Lithe projects')
projectCommand
  .command('remove')
  .requiredOption('--project-id <id>')
  .option(
    '--confirm-branch <workspace-id=branch...>',
    'Confirm unmerged branches',
    (value: string, previous: string[]) => [...previous, value],
    [],
  )
  .action((options: { confirmBranch: string[]; projectId: string }): Promise<void> => {
    const branchConfirmations = Object.fromEntries(
      options.confirmBranch.map((entry): [string, string] => {
        const separator = entry.indexOf('=')
        if (separator < 1) return ['', '']
        return [entry.slice(0, separator), entry.slice(separator + 1)]
      }),
    )
    return execute('project.remove', { branchConfirmations, projectId: options.projectId })
  })

program.configureOutput({
  writeErr: (): void => undefined,
  writeOut: (text: string): void => {
    process.stdout.write(text)
  },
})

const run = async (): Promise<void> => {
  try {
    await program.parseAsync(process.argv)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const code = String(error.code)
      if (code === 'commander.helpDisplayed' || code === 'commander.version') return
      process.stdout.write(
        `${JSON.stringify({
          id: null,
          ok: false,
          error: { code: 'UNKNOWN_COMMAND', message: 'Unknown command' },
        })}\n`,
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(
      `${JSON.stringify({
        id: null,
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected CLI failure' },
      })}\n`,
    )
    process.exitCode = 1
  }
}

void run()
