import { z } from 'zod'

const identifier = z.string().min(1).max(128)
const terminalConfigSchema = z
  .object({
    cwd: z.string().min(1).max(4_096),
    panelId: identifier,
    shell: z.string().min(1).max(4_096),
  })
  .strict()

const terminalTabSchema = z
  .object({
    component: z.literal('terminal'),
    config: terminalConfigSchema,
    enableRenderOnDemand: z.boolean().optional(),
    id: identifier,
    name: z.string().min(1).max(128),
    type: z.literal('tab'),
  })
  .strict()

const agentConfigSchema = z
  .object({
    panelId: identifier,
    taskId: identifier,
  })
  .strict()

const agentTabSchema = z
  .object({
    component: z.literal('agent'),
    config: agentConfigSchema,
    enableRenderOnDemand: z.boolean().optional(),
    id: identifier,
    name: z.string().min(1).max(128),
    type: z.literal('tab'),
  })
  .strict()

const tabSchema = z.discriminatedUnion('component', [terminalTabSchema, agentTabSchema])

const tabSetSchema = z
  .object({
    active: z.boolean().optional(),
    children: z.array(tabSchema).max(256),
    id: identifier.optional(),
    selected: z.number().int().min(-1).max(255).optional(),
    type: z.literal('tabset'),
    weight: z.number().positive().finite().optional(),
  })
  .strict()

interface LayoutRow {
  children: Array<LayoutRow | z.infer<typeof tabSetSchema>>
  id?: string
  type: 'row'
  weight?: number
}

const createRowSchema = (remainingDepth: number): z.ZodType<LayoutRow> =>
  z
    .object({
      children: z
        .array(remainingDepth > 0 ? z.union([createRowSchema(remainingDepth - 1), tabSetSchema]) : tabSetSchema)
        .max(128),
      id: identifier.optional(),
      type: z.literal('row'),
      weight: z.number().positive().finite().optional(),
    })
    .strict()

const snapshotSchema = z
  .object({
    layout: z
      .object({
        borders: z.array(z.never()).length(0),
        global: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).optional(),
        layout: createRowSchema(31),
        subLayouts: z.record(z.string(), z.never()).optional(),
      })
      .strict(),
    version: z.literal(1),
  })
  .strict()

export type WorkspaceLayoutSnapshot = z.infer<typeof snapshotSchema>
export const workspaceLayoutMaxLength = 2_097_152

const assertBoundedInput = (value: unknown): void => {
  const pending: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }]
  const seen = new WeakSet<object>()
  let budget = 0
  let entryCount = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    if (current.depth > 40) throw new TypeError('工作区布局嵌套过深')
    entryCount += 1
    if (entryCount > 4_096) throw new TypeError('工作区布局条目过多')
    budget += typeof current.value === 'string' ? current.value.length + 8 : 16
    if (budget > workspaceLayoutMaxLength) throw new TypeError('工作区布局过大')
    if (!current.value || typeof current.value !== 'object') continue
    if (seen.has(current.value)) throw new TypeError('工作区布局不能循环引用')
    seen.add(current.value)
    for (const [key, child] of Object.entries(current.value)) {
      budget += key.length + 8
      pending.push({ depth: current.depth + 1, value: child })
    }
  }
}

const assertNodeLimits = (snapshot: WorkspaceLayoutSnapshot): void => {
  const pending: Array<LayoutRow | z.infer<typeof tabSetSchema>> = [snapshot.layout.layout]
  let nodeCount = 0
  let panelCount = 0
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue
    nodeCount += 1
    if (nodeCount > 1_024) throw new TypeError('工作区布局节点过多')
    if (node.type === 'tabset') {
      panelCount += node.children.length
      if (panelCount > 256) throw new TypeError('工作区终端面板过多')
    } else {
      pending.push(...node.children)
    }
  }
}

export const parseWorkspaceLayoutSnapshot = (value: unknown): WorkspaceLayoutSnapshot => {
  assertBoundedInput(value)
  const snapshot = snapshotSchema.parse(value)
  assertNodeLimits(snapshot)
  if (JSON.stringify(snapshot).length > workspaceLayoutMaxLength) throw new TypeError('工作区布局过大')
  return snapshot
}
