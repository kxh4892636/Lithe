export interface PtyProcess {
  kill: () => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: (exitCode: number) => void) => void
  resize: (columns: number, rows: number) => void
  write: (data: string) => void
}

export interface PtyAdapter {
  spawn: (request: PtyCreateRequest) => PtyProcess
}

export interface PtyCreateRequest {
  args?: string[]
  columns: number
  cwd: string
  environment?: Record<string, string>
  interactions?: PtyInteractionStep[]
  rows: number
  sessionId: string
  shell: string
}

export interface PtyRuntime {
  close: (sessionId: string) => void
  closeAll: () => Promise<void>
  create: (request: PtyCreateRequest) => void
  resize: (sessionId: string, columns: number, rows: number) => void
  write: (sessionId: string, data: string) => void
}

interface CreatePtyRuntimeOptions {
  adapter: PtyAdapter
  onClose?: (sessionId: string) => void
  onData: (sessionId: string, data: string) => void
  onExit: (sessionId: string, exitCode: number) => void
}

interface InteractionController {
  dispose: () => void
  onData: (data: string) => void
}

const oscSequence = new RegExp(String.raw`\u001B\][^\u0007]*(?:\u0007|\u001B\\)`, 'g')
const csiSequence = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g')
const stripAnsi = (value: string): string => value.replaceAll(oscSequence, '').replaceAll(csiSequence, '')

const createInteractionController = (
  steps: PtyInteractionStep[],
  write: (data: string) => void,
  fail: (message: string) => void,
): InteractionController => {
  let buffer = ''
  let index = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = (): void => {
    const step = steps[index]
    if (!step) return
    timer = setTimeout((): void => {
      fail(`interaction step ${index + 1} timed out waiting for "${step.waitFor}"`)
    }, step.timeoutMs)
  }
  const dispose = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const onData = (data: string): void => {
    buffer += stripAnsi(data)
    let step = steps[index]
    while (step) {
      const matchIndex = buffer.indexOf(step.waitFor)
      if (matchIndex < 0) return
      dispose()
      buffer = buffer.slice(matchIndex + step.waitFor.length)
      write(step.input)
      index += 1
      step = steps[index]
      if (step) arm()
    }
  }
  if (steps.length > 0) arm()
  return { dispose, onData }
}

export const createPtyRuntime = ({ adapter, onClose, onData, onExit }: CreatePtyRuntimeOptions): PtyRuntime => {
  const sessions = new Map<string, PtyProcess>()
  const interactions = new Map<string, InteractionController>()
  const closing = new Map<string, { finish: () => void; session: PtyProcess }>()
  const requireSession = (sessionId: string): PtyProcess => {
    const session = sessions.get(sessionId)
    if (!session) throw new TypeError('终端会话不存在')
    return session
  }
  const closeSession = async (sessionId: string, session: PtyProcess, timeoutMilliseconds: number): Promise<void> => {
    await new Promise<void>((resolve, reject): void => {
      const timer = setTimeout((): void => {
        closing.delete(sessionId)
        reject(new Error(`PTY ${sessionId} did not exit during shutdown`))
      }, timeoutMilliseconds)
      closing.set(sessionId, {
        finish: (): void => {
          clearTimeout(timer)
          resolve()
        },
        session,
      })
      try {
        session.kill()
      } catch (error: unknown) {
        clearTimeout(timer)
        closing.delete(sessionId)
        reject(error)
      }
    })
    onClose?.(sessionId)
  }

  return {
    close: (sessionId: string): void => {
      const session = sessions.get(sessionId)
      if (!session) return
      sessions.delete(sessionId)
      interactions.get(sessionId)?.dispose()
      interactions.delete(sessionId)
      session.kill()
      onClose?.(sessionId)
    },
    closeAll: async (): Promise<void> => {
      const queued = [...sessions]
      sessions.clear()
      for (const controller of interactions.values()) controller.dispose()
      interactions.clear()
      const deadline = Date.now() + 10_000
      for (const [index, [sessionId, session]] of queued.entries()) {
        try {
          const remaining = deadline - Date.now()
          if (remaining <= 0) throw new Error('PTY shutdown deadline exceeded')
          await closeSession(sessionId, session, remaining)
        } catch (error: unknown) {
          for (const [remainingId, remainingSession] of queued.slice(index)) {
            sessions.set(remainingId, remainingSession)
          }
          throw error
        }
      }
    },
    create: (request: PtyCreateRequest): void => {
      if (sessions.has(request.sessionId)) throw new TypeError('终端会话已存在')
      const session = adapter.spawn(request)
      sessions.set(request.sessionId, session)
      const interaction = createInteractionController(
        request.interactions ?? [],
        (data): void => session.write(data),
        (message): void => {
          if (sessions.get(request.sessionId) !== session) return
          onData(request.sessionId, `\r\n[Lithe] PTY ${message}\r\n`)
          sessions.delete(request.sessionId)
          interactions.get(request.sessionId)?.dispose()
          interactions.delete(request.sessionId)
          session.kill()
          onClose?.(request.sessionId)
        },
      )
      interactions.set(request.sessionId, interaction)
      session.onData((data): void => {
        onData(request.sessionId, data)
        interaction.onData(data)
      })
      session.onExit((exitCode): void => {
        const pendingClose = closing.get(request.sessionId)
        if (pendingClose?.session === session) {
          closing.delete(request.sessionId)
          pendingClose.finish()
          return
        }
        if (sessions.get(request.sessionId) !== session) return
        sessions.delete(request.sessionId)
        interactions.get(request.sessionId)?.dispose()
        interactions.delete(request.sessionId)
        onExit(request.sessionId, exitCode)
      })
    },
    resize: (sessionId: string, columns: number, rows: number): void => requireSession(sessionId).resize(columns, rows),
    write: (sessionId: string, data: string): void => requireSession(sessionId).write(data),
  }
}
import type { PtyInteractionStep } from '../../shared/agent-contract'
