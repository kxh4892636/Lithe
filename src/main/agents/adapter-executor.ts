import type { AdapterDefinition } from '../../shared/agent-contract'

export interface AdapterTemplateContext {
  agentSessionId?: string
  taskName: string
  workspacePath: string
}

export type AdapterOperation = 'fork' | 'resume' | 'start'

export interface AdapterCommand {
  args: string[]
  executable: string
}

const replaceVariables = (argument: string, context: AdapterTemplateContext): string =>
  argument.replaceAll(
    /\{\{(workspacePath|taskName|agentSessionId)\}\}/g,
    (_match: string, variable: 'agentSessionId' | 'taskName' | 'workspacePath'): string => {
      const value = context[variable]
      if (value === undefined) throw new TypeError(`Missing Adapter variable: ${variable}`)
      return value
    },
  )

export const renderAdapterCommand = (
  definition: AdapterDefinition,
  operation: AdapterOperation,
  context: AdapterTemplateContext,
): AdapterCommand => {
  const template = definition[operation]
  if (!template) throw new TypeError(`Adapter does not support ${operation}`)
  return {
    executable: definition.executable,
    args: template.map((argument: string): string => replaceVariables(argument, context)),
  }
}
