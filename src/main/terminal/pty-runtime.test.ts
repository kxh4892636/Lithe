import { describe, expect, it, vi } from 'vitest'

import { createPtyRuntime, type PtyAdapter, type PtyProcess } from './pty-runtime'

const createFakeProcess = (): PtyProcess => {
  let exit: ((exitCode: number) => void) | undefined
  return {
    kill: vi.fn<() => void>(() => exit?.(0)),
    onData: vi.fn<(listener: (data: string) => void) => void>(),
    onExit: vi.fn<(listener: (exitCode: number) => void) => void>((listener) => {
      exit = listener
    }),
    resize: vi.fn<(columns: number, rows: number) => void>(),
    write: vi.fn<(data: string) => void>(),
  }
}

describe('PTY runtime', (): void => {
  it('owns input, resize, output, exit, and cleanup behind one interface', async (): Promise<void> => {
    const process = createFakeProcess()
    const adapter: PtyAdapter = { spawn: vi.fn<() => PtyProcess>().mockReturnValue(process) }
    const onData = vi.fn<(sessionId: string, data: string) => void>()
    const onExit = vi.fn<(sessionId: string, exitCode: number) => void>()
    const runtime = createPtyRuntime({ adapter, onData, onExit })

    runtime.create({
      columns: 80,
      cwd: 'D:\\projects\\lithe',
      rows: 24,
      sessionId: 'terminal-1',
      shell: 'pwsh.exe',
    })
    runtime.write('terminal-1', 'echo ready\r')
    runtime.resize('terminal-1', 120, 40)

    expect(process.write).toHaveBeenCalledWith('echo ready\r')
    expect(process.resize).toHaveBeenCalledWith(120, 40)

    await runtime.closeAll()
    expect(process.kill).toHaveBeenCalledOnce()
  })

  it('rejects duplicate and unknown session identities', (): void => {
    const process = createFakeProcess()
    const runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    const request = { columns: 80, cwd: '.', rows: 24, sessionId: 'terminal-1', shell: 'pwsh.exe' }

    runtime.create(request)

    expect(() => runtime.create(request)).toThrow('终端会话已存在')
    expect(() => runtime.write('missing', 'data')).toThrow('终端会话不存在')
  })

  it('sends ordered simulated input only after matching ANSI-stripped output', (): void => {
    let data: ((value: string) => void) | undefined
    const process = createFakeProcess()
    process.onData = (listener): void => {
      data = listener
    }
    const runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })

    runtime.create({
      columns: 80,
      cwd: '.',
      interactions: [
        { input: 'first\r', timeoutMs: 5_000, waitFor: 'Ready' },
        { input: 'second\r', timeoutMs: 5_000, waitFor: 'Continue' },
      ],
      rows: 24,
      sessionId: 'agent:task-1',
      shell: 'agent',
    })
    data?.('\u001B[32mRe')
    expect(process.write).not.toHaveBeenCalled()
    data?.('ady\u001B[0m')
    expect(process.write).toHaveBeenNthCalledWith(1, 'first\r')
    data?.('Continue')
    expect(process.write).toHaveBeenNthCalledWith(2, 'second\r')
  })

  it('reports and terminates an interaction that times out', async (): Promise<void> => {
    vi.useFakeTimers()
    try {
      const process = createFakeProcess()
      const onData = vi.fn<(sessionId: string, data: string) => void>()
      const onClose = vi.fn<(sessionId: string) => void>()
      const runtime = createPtyRuntime({
        adapter: { spawn: (): PtyProcess => process },
        onClose,
        onData,
        onExit: (): void => undefined,
      })

      runtime.create({
        columns: 80,
        cwd: '.',
        interactions: [{ input: '/fork\r', timeoutMs: 1_000, waitFor: 'Ready' }],
        rows: 24,
        sessionId: 'agent:task-1',
        shell: 'agent',
      })
      await vi.advanceTimersByTimeAsync(1_000)

      expect(onData).toHaveBeenCalledWith('agent:task-1', expect.stringContaining('interaction step 1 timed out'))
      expect(process.kill).toHaveBeenCalledOnce()
      expect(onClose).toHaveBeenCalledWith('agent:task-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a stale exit after the same panel identity is reopened', (): void => {
    let firstExit: ((exitCode: number) => void) | undefined
    const first = createFakeProcess()
    first.onExit = (listener): void => {
      firstExit = listener
    }
    const second = createFakeProcess()
    const adapter: PtyAdapter = {
      spawn: vi.fn<() => PtyProcess>().mockReturnValueOnce(first).mockReturnValueOnce(second),
    }
    const onExit = vi.fn<(sessionId: string, exitCode: number) => void>()
    const runtime = createPtyRuntime({ adapter, onData: (): void => undefined, onExit })
    const request = { columns: 80, cwd: '.', rows: 24, sessionId: 'terminal-1', shell: 'pwsh.exe' }

    runtime.create(request)
    runtime.close('terminal-1')
    runtime.create(request)
    firstExit?.(0)
    runtime.write('terminal-1', 'still running')

    expect(second.write).toHaveBeenCalledWith('still running')
    expect(onExit).not.toHaveBeenCalled()
  })

  it('removes a session when its current process exits unexpectedly', (): void => {
    let exit: ((exitCode: number) => void) | undefined
    const process = createFakeProcess()
    process.onExit = (listener): void => {
      exit = listener
    }
    const onExit = vi.fn<(sessionId: string, exitCode: number) => void>()
    const runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onData: (): void => undefined,
      onExit,
    })
    const request = { columns: 80, cwd: '.', rows: 24, sessionId: 'terminal-1', shell: 'pwsh.exe' }

    runtime.create(request)
    exit?.(9)

    expect(onExit).toHaveBeenCalledWith('terminal-1', 9)
    expect(() => runtime.write('terminal-1', 'data')).toThrow('终端会话不存在')
  })

  it('does not retain a session when the adapter fails to spawn', (): void => {
    const runtime = createPtyRuntime({
      adapter: {
        spawn: (): PtyProcess => {
          throw new Error('spawn failed')
        },
      },
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    const request = { columns: 80, cwd: '.', rows: 24, sessionId: 'terminal-1', shell: 'pwsh.exe' }

    expect(() => runtime.create(request)).toThrow('spawn failed')
    expect(() => runtime.write('terminal-1', 'data')).toThrow('终端会话不存在')
  })

  it('reports intentional close so Agent capabilities can be revoked', (): void => {
    const process = createFakeProcess()
    const onClose = vi.fn<(sessionId: string) => void>()
    const runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onClose,
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'agent:task-1', shell: 'agent' })

    runtime.close('agent:task-1')

    expect(onClose).toHaveBeenCalledWith('agent:task-1')
  })

  it('removes all sessions before close callbacks can reenter the runtime', async (): Promise<void> => {
    const process = createFakeProcess()
    let runtime: ReturnType<typeof createPtyRuntime>
    runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onClose: (sessionId: string): void => runtime.close(sessionId),
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'agent:task-1', shell: 'agent' })

    await runtime.closeAll()

    expect(process.kill).toHaveBeenCalledOnce()
  })

  it('keeps current and remaining sessions reachable when sequential shutdown fails', async (): Promise<void> => {
    const first = createFakeProcess()
    first.kill = vi.fn<() => void>(() => {
      throw new Error('native close failed')
    })
    const second = createFakeProcess()
    const runtime = createPtyRuntime({
      adapter: { spawn: vi.fn<() => PtyProcess>().mockReturnValueOnce(first).mockReturnValueOnce(second) },
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'first', shell: 'pwsh' })
    runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'second', shell: 'pwsh' })

    await expect(runtime.closeAll()).rejects.toThrow(/native close failed/)
    runtime.write('first', 'still reachable')
    runtime.write('second', 'still reachable')
    expect(second.kill).not.toHaveBeenCalled()
  })

  it('does not commit close side effects when shutdown times out', async (): Promise<void> => {
    vi.useFakeTimers()
    try {
      const process = createFakeProcess()
      process.kill = vi.fn<() => void>()
      const onClose = vi.fn<(sessionId: string) => void>()
      const runtime = createPtyRuntime({
        adapter: { spawn: (): PtyProcess => process },
        onClose,
        onData: (): void => undefined,
        onExit: (): void => undefined,
      })
      runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'agent:task-1', shell: 'agent' })

      const closing = runtime.closeAll()
      let rejection: unknown
      const handled = closing.catch((error: unknown): void => {
        rejection = error
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await handled

      expect(rejection).toEqual(expect.objectContaining({ message: expect.stringMatching(/did not exit/) }))
      expect(onClose).not.toHaveBeenCalled()
      expect(() => runtime.write('agent:task-1', 'still reachable')).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })
})
