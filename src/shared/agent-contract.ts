import { z } from 'zod'

export const adapterTemplateVariables = ['workspacePath', 'taskName', 'agentSessionId'] as const
export type AdapterTemplateVariable = (typeof adapterTemplateVariables)[number]

const argumentSchema = z.string().max(2048)
const commandTemplateSchema = z.array(argumentSchema).max(64)
const ptyInteractionStepSchema = z
  .object({
    input: z.string().max(8192),
    timeoutMs: z.number().int().min(100).max(120_000),
    waitFor: z.string().min(1).max(2048),
  })
  .strict()
const ptyInteractionStepsSchema = z.array(ptyInteractionStepSchema).max(16)

export const adapterDefinitionSchema = z
  .object({
    executable: z.string().trim().min(1).max(512),
    start: commandTemplateSchema,
    resume: commandTemplateSchema.nullable(),
    fork: commandTemplateSchema.nullable(),
    interactions: z
      .object({
        fork: ptyInteractionStepsSchema.optional(),
        resume: ptyInteractionStepsSchema.optional(),
        start: ptyInteractionStepsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type AdapterDefinition = z.infer<typeof adapterDefinitionSchema>
export type PtyInteractionStep = z.infer<typeof ptyInteractionStepSchema>

export interface AdapterVersion {
  id: string
  adapterId: string
  name: string
  kind: 'builtin' | 'custom'
  version: number
  definition: AdapterDefinition
  createdAt: Date
}

export interface AdapterSummary {
  id: string
  name: string
  kind: 'builtin' | 'custom'
  currentVersion: AdapterVersion
  forkAvailable: boolean
  isDefault: boolean
  isAvailable: boolean
  resumeAvailable: boolean
  unavailableReason: string | null
  usageCount: number
}

export interface Task {
  id: string
  workspaceId: string
  name: string
  adapterVersionId: string
  agentSessionId: string | null
  archivedAt?: Date | null
  createdAt: Date
  isRunning?: boolean
  isUnread?: boolean
  lifecycle?: 'active' | 'archived'
  lastAttentionAt?: Date | null
  lastViewedAt?: Date | null
  shouldAutoRestore?: boolean
}

export interface AgentLaunch {
  args: string[]
  cwd: string
  error: string | null
  executable: string
  isRunning: boolean
  sessionId: string
  task: Task
}

const variablePattern = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g

export const validateAdapterDefinition = (value: unknown): AdapterDefinition => {
  const definition = adapterDefinitionSchema.parse(value)
  const validateTemplate = (operation: 'fork' | 'resume' | 'start', template: string[] | null): void => {
    if (!template) return
    const variables = new Set<string>()
    for (const argument of template) {
      for (const match of argument.matchAll(variablePattern)) variables.add(match[1] ?? '')
    }
    for (const variable of variables) {
      if (!adapterTemplateVariables.includes(variable as AdapterTemplateVariable)) {
        throw new TypeError(`Unknown Adapter variable: ${variable}`)
      }
    }
    if (operation === 'start' && variables.has('agentSessionId')) {
      throw new TypeError('start cannot reference agentSessionId')
    }
    if ((operation === 'resume' || operation === 'fork') && !variables.has('agentSessionId')) {
      throw new TypeError(`${operation} must reference agentSessionId`)
    }
  }
  validateTemplate('start', definition.start)
  validateTemplate('resume', definition.resume)
  validateTemplate('fork', definition.fork)
  return definition
}

export const parseAdapterDefinition = (serialized: string): AdapterDefinition =>
  validateAdapterDefinition(JSON.parse(serialized))
