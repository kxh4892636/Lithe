export type ApprovalDecision = 'approved' | 'cancelled' | 'rejected' | 'timed-out'

interface PendingApproval {
  connectionId: string
  finish: (decision: ApprovalDecision) => void
  timer: NodeJS.Timeout
}

export interface ApprovalQueue {
  request: (requestId: string, connectionId: string) => Promise<ApprovalDecision>
  decide: (requestId: string, decision: ApprovalDecision) => boolean
  cancelConnection: (connectionId: string) => void
  close: () => void
}

export const createApprovalQueue = (timeoutMilliseconds: number = 180_000): ApprovalQueue => {
  const pending = new Map<string, PendingApproval>()

  const finish = (requestId: string, decision: ApprovalDecision): boolean => {
    const request = pending.get(requestId)
    if (!request) return false
    clearTimeout(request.timer)
    pending.delete(requestId)
    request.finish(decision)
    return true
  }

  return {
    request: (requestId: string, connectionId: string): Promise<ApprovalDecision> =>
      new Promise((resolve: (value: ApprovalDecision) => void): void => {
        if (pending.has(requestId)) throw new TypeError('Duplicate approval request')
        const timer = setTimeout((): void => {
          pending.delete(requestId)
          resolve('timed-out')
        }, timeoutMilliseconds)
        pending.set(requestId, { connectionId, finish: resolve, timer })
      }),
    decide: (requestId: string, decision: ApprovalDecision): boolean => finish(requestId, decision),
    cancelConnection: (connectionId: string): void => {
      for (const [requestId, request] of pending) {
        if (request.connectionId === connectionId) finish(requestId, 'cancelled')
      }
    },
    close: (): void => {
      for (const requestId of pending.keys()) finish(requestId, 'cancelled')
    },
  }
}
