import { z } from 'zod'

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
  })
  .strict()

export type ToolRequest = z.infer<typeof toolRequestSchema>

export interface ToolContextWorkspace {
  id: string
  name: string
  rootPath: string
  gitBranch: string | null
  kind: 'default' | 'derived'
  tasks: ToolContextTask[]
}

export interface ToolContextTask {
  id: string
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
}

export type ToolErrorCode =
  | 'APPROVAL_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'LITHE_NOT_RUNNING'
  | 'REQUEST_TIMEOUT'
  | 'UNAUTHORIZED'
  | 'UNKNOWN_COMMAND'
  | 'USER_REJECTED'

export type ToolResponse =
  | { id: string; ok: true; data: ToolContext }
  | { id: string | null; ok: false; error: { code: ToolErrorCode; message: string } }

const toolContextTaskSchema = z.object({ id: z.string(), name: z.string() }).strict()
const toolContextWorkspaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rootPath: z.string(),
    gitBranch: z.string().nullable(),
    kind: z.enum(['default', 'derived']),
    tasks: z.array(toolContextTaskSchema),
  })
  .strict()
const toolContextProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rootPath: z.string(),
    isValid: z.boolean(),
    workspaces: z.array(toolContextWorkspaceSchema),
  })
  .strict()
const toolContextSchema = z
  .object({
    activeWorkspaceId: z.string().nullable(),
    projects: z.array(toolContextProjectSchema),
  })
  .strict()
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
const toolResponseSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.string(), ok: z.literal(true), data: toolContextSchema }).strict(),
  z
    .object({
      id: z.string().nullable(),
      ok: z.literal(false),
      error: z.object({ code: toolErrorCodeSchema, message: z.string() }).strict(),
    })
    .strict(),
])

export const parseToolRequest = (value: unknown): ToolRequest => toolRequestSchema.parse(value)
export const parseToolResponse = (value: unknown): ToolResponse => toolResponseSchema.parse(value)

export const serializeToolResponse = (response: ToolResponse): string => `${JSON.stringify(response)}\n`
