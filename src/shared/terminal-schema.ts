import { z } from 'zod'

const identifier = z.string().min(1).max(128)

const terminalCreateRequestSchema = z
  .object({
    columns: z.number().int().min(2).max(1_000),
    cwd: z.string().min(1).max(4_096).optional(),
    panelId: identifier,
    rows: z.number().int().min(1).max(500),
    shell: z.string().min(1).max(4_096).optional(),
    workspaceId: identifier,
  })
  .strict()

export type TerminalCreateRequest = z.infer<typeof terminalCreateRequestSchema>

export const parseTerminalCreateRequest = (value: unknown): TerminalCreateRequest =>
  terminalCreateRequestSchema.parse(value)
