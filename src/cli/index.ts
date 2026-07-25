#!/usr/bin/env node
import { homedir } from 'node:os'

import { Command } from 'commander'

import {
  readControlDiscovery,
  resolveControlDiscoveryPath,
  type ControlDiscovery,
} from '../main/tool-control/control-discovery'
import { requestContext, responseToStdout } from './tool-client'

const program = new Command()
  .name('lithe-tool')
  .description('Control a running Lithe instance')
  .version('1.0.0')
  .exitOverride()

program
  .command('context')
  .description('Return the current Lithe project and workspace hierarchy')
  .action(async (): Promise<void> => {
    const capability = process.env.LITHE_CAPABILITY
    const discovery = ((): ControlDiscovery | undefined => {
      const endpoint = process.env.LITHE_CONTROL_ENDPOINT
      const token = process.env.LITHE_CONTROL_TOKEN
      if (endpoint && token) return { endpoint, token }
      try {
        return readControlDiscovery(
          process.env.LITHE_CONTROL_DISCOVERY_PATH ?? resolveControlDiscoveryPath(homedir(), process.platform),
        )
      } catch {
        return undefined
      }
    })()
    if (!discovery) {
      process.stdout.write(
        `${JSON.stringify({
          id: null,
          ok: false,
          error: { code: 'LITHE_NOT_RUNNING', message: 'Lithe is not running' },
        })}\n`,
      )
      process.exitCode = 1
      return
    }
    const response = await requestContext({
      authorization: capability ? { kind: 'agent', capability } : { kind: 'external', token: discovery.token },
      endpoint: discovery.endpoint,
    })
    process.stdout.write(responseToStdout(response))
    process.exitCode = response.ok ? 0 : 1
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
