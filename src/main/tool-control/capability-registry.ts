import { randomBytes } from 'node:crypto'

export interface AgentBinding {
  instanceId: string
  projectId: string | null
  workspaceId: string
  taskId: string
}

export interface CapabilityRegistry {
  issue: (binding: AgentBinding) => string
  resolve: (capability: string) => AgentBinding | undefined
  revokeInstance: (instanceId: string) => void
}

export const createCapabilityRegistry = (): CapabilityRegistry => {
  const bindings = new Map<string, AgentBinding>()

  return {
    issue: (binding: AgentBinding): string => {
      const capability = randomBytes(32).toString('base64url')
      bindings.set(capability, { ...binding })
      return capability
    },
    resolve: (capability: string): AgentBinding | undefined => {
      const binding = bindings.get(capability)
      return binding ? { ...binding } : undefined
    },
    revokeInstance: (instanceId: string): void => {
      for (const [capability, binding] of bindings) {
        if (binding.instanceId === instanceId) bindings.delete(capability)
      }
    },
  }
}
