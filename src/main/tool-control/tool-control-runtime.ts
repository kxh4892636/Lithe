import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname } from 'node:path'

import type { AppDatabase } from '../database/app-database'
import { createApprovalQueue, type ApprovalQueue } from './approval-queue'
import { createCapabilityRegistry, type CapabilityRegistry } from './capability-registry'
import { createToolCommandDispatcher, type ToolCommandDispatcher } from './command-dispatcher'
import { createContextCommand } from './context-command'
import { removeControlDiscovery, resolveControlDiscoveryPath, writeControlDiscovery } from './control-discovery'
import { createLocalControlServer, type LocalControlServer } from './local-control-server'
import { resolveLocalControlEndpoint } from './local-endpoint'

export interface ToolControlRuntime {
  approvals: ApprovalQueue
  capabilities: CapabilityRegistry
  close: () => Promise<void>
  commands: ToolCommandDispatcher
  listen: () => Promise<void>
}

interface ToolControlRuntimeOptions {
  discoveryPath?: string
}

export const createToolControlRuntime = (
  database: AppDatabase,
  options: ToolControlRuntimeOptions = {},
): ToolControlRuntime => {
  const approvals = createApprovalQueue()
  const capabilities = createCapabilityRegistry()
  const homeDirectory = homedir()
  const externalToken = randomBytes(32).toString('base64url')
  const endpoint = resolveLocalControlEndpoint({
    homeDirectory,
    platform: process.platform,
    userIdentity: userInfo().username,
  })
  const commands = createToolCommandDispatcher(
    createContextCommand({
      capabilities,
      externalToken,
      getActiveWorkspaceId: database.navigation.getActiveWorkspace,
      listProjects: database.projects.list,
      listTasks: database.tasks.list,
    }),
  )
  const server: LocalControlServer = createLocalControlServer({
    dispatcher: commands,
    endpoint,
    onDisconnect: approvals.cancelConnection,
    onSocketError: (error: Error): void => {
      const code = 'code' in error ? String(error.code) : error.name
      process.stderr.write(`Lithe local control socket error: ${code}\n`)
    },
  })
  const discoveryPath = options.discoveryPath ?? resolveControlDiscoveryPath(homeDirectory, process.platform)

  return {
    approvals,
    capabilities,
    commands,
    listen: async (): Promise<void> => {
      await server.listen()
      mkdirSync(dirname(discoveryPath), { recursive: true, mode: 0o700 })
      if (process.platform !== 'win32') chmodSync(dirname(discoveryPath), 0o700)
      writeControlDiscovery(discoveryPath, { endpoint, token: externalToken })
    },
    close: async (): Promise<void> => {
      approvals.close()
      removeControlDiscovery(discoveryPath)
      await server.close()
    },
  }
}
