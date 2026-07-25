import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestContext } from '../../cli/tool-client'
import type { ProjectWithWorkspaces } from '../../shared/app-contract'
import { toolProtocolVersion, type ToolRequest, type ToolResponse } from '../../shared/tool-protocol'
import { createApprovalQueue } from './approval-queue'
import { createCapabilityRegistry } from './capability-registry'
import { createToolCommandDispatcher } from './command-dispatcher'
import { createContextCommand } from './context-command'
import { createLocalControlServer, type LocalControlServer } from './local-control-server'
import { resolveLocalControlEndpoint } from './local-endpoint'

const temporaryDirectories: string[] = []
const servers: LocalControlServer[] = []

const project: ProjectWithWorkspaces = {
  id: 'project-1',
  name: 'lithe',
  rootPath: 'D:\\projects\\lithe',
  isValid: true,
  createdAt: new Date('2026-07-25T00:00:00.000Z'),
  workspaces: [
    {
      id: 'workspace-1',
      projectId: 'project-1',
      name: '默认',
      rootPath: 'D:\\projects\\lithe',
      gitBranch: 'main',
      kind: 'default',
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
    },
  ],
}

const createEndpoint = (): string => {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\lithe-test-${randomUUID()}`
  }
  const directory = mkdtempSync(join(tmpdir(), 'lithe-control-'))
  temporaryDirectories.push(directory)
  return join(directory, 'control.sock')
}

const sendRawRequest = (endpoint: string, request: string): Promise<string> =>
  new Promise<string>((resolve: (value: string) => void, reject: (reason?: unknown) => void): void => {
    const socket = createConnection(endpoint)
    let output = ''
    socket.on('connect', (): void => {
      socket.write(request)
    })
    socket.on('data', (chunk: Buffer): void => {
      output += chunk.toString()
    })
    socket.on('end', (): void => {
      resolve(output)
    })
    socket.on('error', reject)
  })

afterEach(async (): Promise<void> => {
  vi.useRealTimers()
  for (const server of servers.splice(0)) await server.close()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe('local tool control', (): void => {
  it('uses a per-user named pipe on Windows and a user socket elsewhere', (): void => {
    const windows = resolveLocalControlEndpoint({
      homeDirectory: 'C:\\Users\\kxh',
      platform: 'win32',
      userIdentity: 'kxh',
    })
    const unix = resolveLocalControlEndpoint({
      homeDirectory: '/home/kxh',
      platform: 'linux',
      userIdentity: 'kxh',
    })

    expect(windows).toMatch(/^\\\\\.\\pipe\\lithe-[a-f0-9]{20}$/)
    expect(unix).toBe('/home/kxh/.lithe/control.sock')
  })

  it('scopes Agent context and revokes it with the instance', (): void => {
    const capabilities = createCapabilityRegistry()
    const command = createContextCommand({
      capabilities,
      externalToken: 'e'.repeat(32),
      getActiveWorkspaceId: (): string => 'workspace-1',
      listProjects: (): ProjectWithWorkspaces[] => [project],
    })
    const capability = capabilities.issue({
      instanceId: 'instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      taskId: 'task-1',
    })

    expect(command.executeAgent(capability)?.projects[0]?.workspaces[0]?.id).toBe('workspace-1')
    capabilities.revokeInstance('instance-1')
    expect(command.executeAgent(capability)).toBeUndefined()
  })

  it('rejects a forged binding that does not exist in the hierarchy', (): void => {
    const capabilities = createCapabilityRegistry()
    const command = createContextCommand({
      capabilities,
      externalToken: 'e'.repeat(32),
      getActiveWorkspaceId: (): string => 'workspace-1',
      listProjects: (): ProjectWithWorkspaces[] => [project],
    })
    const capability = capabilities.issue({
      instanceId: 'instance-1',
      projectId: 'project-forged',
      workspaceId: 'workspace-1',
      taskId: 'task-1',
    })

    expect(command.executeAgent(capability)).toBeUndefined()
  })

  it('serves a real cross-process-style socket request and rejects an invalid capability', async (): Promise<void> => {
    const endpoint = createEndpoint()
    const capabilities = createCapabilityRegistry()
    const context = createContextCommand({
      capabilities,
      externalToken: 'e'.repeat(32),
      getActiveWorkspaceId: (): string => 'workspace-1',
      listProjects: (): ProjectWithWorkspaces[] => [project],
    })
    const server = createLocalControlServer({ dispatcher: createToolCommandDispatcher(context), endpoint })
    servers.push(server)
    await server.listen()

    await expect(
      requestContext({ authorization: { kind: 'external', token: 'e'.repeat(32) }, endpoint }),
    ).resolves.toMatchObject({
      ok: true,
      data: { activeWorkspaceId: 'workspace-1', projects: [{ id: 'project-1' }] },
    })
    await expect(
      requestContext({ authorization: { kind: 'agent', capability: 'x'.repeat(32) }, endpoint }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
    await expect(
      requestContext({ authorization: { kind: 'external', token: 'f'.repeat(32) }, endpoint }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('bounds malformed input and closes the connection after one JSON response', async (): Promise<void> => {
    const endpoint = createEndpoint()
    const capabilities = createCapabilityRegistry()
    const server = createLocalControlServer({
      dispatcher: createToolCommandDispatcher(
        createContextCommand({
          capabilities,
          externalToken: 'e'.repeat(32),
          getActiveWorkspaceId: (): null => null,
          listProjects: (): ProjectWithWorkspaces[] => [],
        }),
      ),
      endpoint,
      platform: process.platform,
    })
    servers.push(server)
    await server.listen()

    const response = await sendRawRequest(endpoint, 'not-json\n')

    expect(response.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(response)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })

  it('returns UNKNOWN_COMMAND for a valid envelope with an unregistered command', async (): Promise<void> => {
    const endpoint = createEndpoint()
    const server = createLocalControlServer({
      dispatcher: createToolCommandDispatcher(
        createContextCommand({
          capabilities: createCapabilityRegistry(),
          externalToken: 'e'.repeat(32),
          getActiveWorkspaceId: (): null => null,
          listProjects: (): ProjectWithWorkspaces[] => [],
        }),
      ),
      endpoint,
    })
    servers.push(server)
    await server.listen()

    const response = await sendRawRequest(
      endpoint,
      `${JSON.stringify({
        version: toolProtocolVersion,
        id: 'unknown-1',
        command: 'unknown',
        authorization: { kind: 'external', token: 'e'.repeat(32) },
      })}\n`,
    )

    expect(JSON.parse(response)).toMatchObject({
      id: 'unknown-1',
      ok: false,
      error: { code: 'UNKNOWN_COMMAND' },
    })
  })

  it('replaces an oversized response with a bounded stable error', async (): Promise<void> => {
    const endpoint = createEndpoint()
    const server = createLocalControlServer({
      dispatcher: {
        dispatch: async (request: ToolRequest, _connectionId: string): Promise<ToolResponse> => ({
          id: request.id,
          ok: true,
          data: {
            activeWorkspaceId: null,
            projects: [
              {
                id: 'project-large',
                name: 'large',
                rootPath: 'x'.repeat(70_000),
                isValid: true,
                workspaces: [],
              },
            ],
          },
        }),
      },
      endpoint,
    })
    servers.push(server)
    await server.listen()

    await expect(
      requestContext({
        authorization: { kind: 'external', token: 'e'.repeat(32) },
        endpoint,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Response is too large' },
    })
  })

  it('notifies the approval boundary when a real connection disconnects', async (): Promise<void> => {
    const endpoint = createEndpoint()
    const disconnected: string[] = []
    let dispatchedConnectionId: string | undefined
    const server = createLocalControlServer({
      dispatcher: {
        dispatch: async (request: ToolRequest, connectionId: string): Promise<ToolResponse> => {
          dispatchedConnectionId = connectionId
          return { id: request.id, ok: true, data: { activeWorkspaceId: null, projects: [] } }
        },
      },
      endpoint,
      onDisconnect: (connectionId: string): void => {
        disconnected.push(connectionId)
      },
    })
    servers.push(server)
    await server.listen()

    await requestContext({
      authorization: { kind: 'external', token: 'e'.repeat(32) },
      endpoint,
    })

    await expect.poll((): number => disconnected.length).toBe(1)
    expect(disconnected[0]).toBe(dispatchedConnectionId)
  })

  it('resolves pending approval when its connection disconnects', async (): Promise<void> => {
    const queue = createApprovalQueue()
    const decision = queue.request('request-1', 'connection-1')

    queue.cancelConnection('connection-1')

    await expect(decision).resolves.toBe('cancelled')
    queue.close()
  })

  it('defaults approval expiry to three minutes', async (): Promise<void> => {
    vi.useFakeTimers()
    const queue = createApprovalQueue()
    const decision = queue.request('request-1', 'connection-1')

    await vi.advanceTimersByTimeAsync(179_999)
    let settled = false
    void decision.then((): void => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(decision).resolves.toBe('timed-out')
  })
})
