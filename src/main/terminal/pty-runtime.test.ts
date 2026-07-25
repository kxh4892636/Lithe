import { describe, expect, it, vi } from 'vitest'

import { createPtyRuntime, type PtyAdapter, type PtyProcess } from './pty-runtime'

const createFakeProcess = (): PtyProcess => ({
  kill: vi.fn<() => void>(),
  onData: vi.fn<(listener: (data: string) => void) => void>(),
  onExit: vi.fn<(listener: (exitCode: number) => void) => void>(),
  resize: vi.fn<(columns: number, rows: number) => void>(),
  write: vi.fn<(data: string) => void>(),
})

describe('PTY runtime', (): void => {
  it('owns input, resize, output, exit, and cleanup behind one interface', (): void => {
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

    runtime.closeAll()
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

  it('removes all sessions before close callbacks can reenter the runtime', (): void => {
    const process = createFakeProcess()
    let runtime: ReturnType<typeof createPtyRuntime>
    runtime = createPtyRuntime({
      adapter: { spawn: (): PtyProcess => process },
      onClose: (sessionId: string): void => runtime.close(sessionId),
      onData: (): void => undefined,
      onExit: (): void => undefined,
    })
    runtime.create({ columns: 80, cwd: '.', rows: 24, sessionId: 'agent:task-1', shell: 'agent' })

    runtime.closeAll()

    expect(process.kill).toHaveBeenCalledOnce()
  })
})
