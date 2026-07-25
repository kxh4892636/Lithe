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
  rows: number
  sessionId: string
  shell: string
}

export interface PtyRuntime {
  close: (sessionId: string) => void
  closeAll: () => void
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

export const createPtyRuntime = ({ adapter, onClose, onData, onExit }: CreatePtyRuntimeOptions): PtyRuntime => {
  const sessions = new Map<string, PtyProcess>()
  const requireSession = (sessionId: string): PtyProcess => {
    const session = sessions.get(sessionId)
    if (!session) throw new TypeError('终端会话不存在')
    return session
  }

  return {
    close: (sessionId: string): void => {
      const session = sessions.get(sessionId)
      if (!session) return
      sessions.delete(sessionId)
      session.kill()
      onClose?.(sessionId)
    },
    closeAll: (): void => {
      const closing = [...sessions]
      sessions.clear()
      for (const [sessionId, session] of closing) {
        session.kill()
        onClose?.(sessionId)
      }
    },
    create: (request: PtyCreateRequest): void => {
      if (sessions.has(request.sessionId)) throw new TypeError('终端会话已存在')
      const session = adapter.spawn(request)
      sessions.set(request.sessionId, session)
      session.onData((data): void => onData(request.sessionId, data))
      session.onExit((exitCode): void => {
        if (sessions.get(request.sessionId) !== session) return
        sessions.delete(request.sessionId)
        onExit(request.sessionId, exitCode)
      })
    },
    resize: (sessionId: string, columns: number, rows: number): void => requireSession(sessionId).resize(columns, rows),
    write: (sessionId: string, data: string): void => requireSession(sessionId).write(data),
  }
}
