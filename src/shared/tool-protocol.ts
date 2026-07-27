import { z } from 'zod'

import type { AgentStatus } from './agent-contract'

export const toolProtocolVersion = 1 as const
export const toolMessageMaxBytes = 64 * 1024

const externalAuthorizationSchema = z
  .object({
    kind: z.literal('external'),
    token: z.string().min(32).max(256),
  })
  .strict()
const agentAuthorizationSchema = z
  .object({
    kind: z.literal('agent'),
    capability: z.string().min(32).max(256),
  })
  .strict()

export const toolRequestSchema = z
  .object({
    version: z.literal(toolProtocolVersion),
    id: z.string().min(1).max(128),
    command: z.string().min(1).max(64),
    authorization: z.discriminatedUnion('kind', [externalAuthorizationSchema, agentAuthorizationSchema]),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type ToolRequest = z.infer<typeof toolRequestSchema>

export interface ToolContextWorkspace {
  id: string
  name: string
  rootPath: string
  gitBranch: string | null
  kind: 'default' | 'derived' | 'scratch'
  tasks: ToolContextTask[]
}

export interface ToolContextTask {
  agentStatus: AgentStatus
  id: string
  isUnread?: boolean
  lifecycle?: 'active' | 'archived'
  name: string
}

export interface ToolContextProject {
  id: string
  name: string
  rootPath: string
  isValid: boolean
  workspaces: ToolContextWorkspace[]
}

export interface ToolContext {
  activeWorkspaceId: string | null
  projects: ToolContextProject[]
  scratchWorkspaces: ToolContextWorkspace[]
}

export type ToolJson = boolean | null | number | string | ToolJson[] | { [key: string]: ToolJson }

export type ToolErrorCode =
  | 'APPROVAL_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'LITHE_NOT_RUNNING'
  | 'REQUEST_TIMEOUT'
  | 'UNAUTHORIZED'
  | 'UNKNOWN_COMMAND'
  | 'USER_REJECTED'

export type ToolResponse<T = ToolJson> =
  | { id: string; ok: true; data: T }
  | { id: string | null; ok: false; error: { code: ToolErrorCode; message: string } }

const toolErrorCodeSchema = z.enum([
  'APPROVAL_TIMEOUT',
  'INTERNAL_ERROR',
  'INVALID_REQUEST',
  'LITHE_NOT_RUNNING',
  'REQUEST_TIMEOUT',
  'UNAUTHORIZED',
  'UNKNOWN_COMMAND',
  'USER_REJECTED',
])
const toolJsonSchema: z.ZodType<ToolJson> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number().finite(),
    z.string(),
    z.array(toolJsonSchema),
    z.record(z.string(), toolJsonSchema),
  ]),
)
const toolContextTaskSchema = z
  .object({
    agentStatus: z.enum(['closed', 'idle', 'running']),
    id: z.string(),
    isUnread: z.boolean().optional(),
    lifecycle: z.enum(['active', 'archived']).optional(),
    name: z.string(),
  })
  .strict()
const toolContextWorkspaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rootPath: z.string(),
    gitBranch: z.string().nullable(),
    kind: z.enum(['default', 'derived', 'scratch']),
    tasks: z.array(toolContextTaskSchema),
  })
  .strict()
const toolContextSchema = z
  .object({
    activeWorkspaceId: z.string().nullable(),
    projects: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          rootPath: z.string(),
          isValid: z.boolean(),
          workspaces: z.array(toolContextWorkspaceSchema),
        })
        .strict(),
    ),
    scratchWorkspaces: z.array(toolContextWorkspaceSchema).default([]),
  })
  .strict()
const toolResponseSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.string(), ok: z.literal(true), data: toolJsonSchema }).strict(),
  z
    .object({
      id: z.string().nullable(),
      ok: z.literal(false),
      error: z.object({ code: toolErrorCodeSchema, message: z.string() }).strict(),
    })
    .strict(),
])

export const parseToolRequest = (value: unknown): ToolRequest => toolRequestSchema.parse(value)
export const parseToolContext = (value: unknown): ToolContext => toolContextSchema.parse(value)
export const parseToolJson = (value: unknown): ToolJson => toolJsonSchema.parse(value)
export const parseToolResponse = (value: unknown): ToolResponse => toolResponseSchema.parse(value)

export const serializeToolResponse = <T>(response: ToolResponse<T>): string => `${JSON.stringify(response)}\n`
