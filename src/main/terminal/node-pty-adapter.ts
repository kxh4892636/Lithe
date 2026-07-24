import * as nodePty from 'node-pty'

import type { PtyAdapter, PtyCreateRequest, PtyProcess } from './pty-runtime'

const processEnvironment = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )

export const createNodePtyAdapter = (): PtyAdapter => ({
  spawn: (request: PtyCreateRequest): PtyProcess => {
    const process = nodePty.spawn(request.shell, [], {
      cols: request.columns,
      cwd: request.cwd,
      env: processEnvironment(),
      name: 'xterm-256color',
      rows: request.rows,
    })
    return {
      kill: (): void => process.kill(),
      onData: (listener: (data: string) => void): void => {
        process.onData(listener)
      },
      onExit: (listener: (exitCode: number) => void): void => {
        process.onExit(({ exitCode }): void => listener(exitCode))
      },
      resize: (columns: number, rows: number): void => process.resize(columns, rows),
      write: (data: string): void => process.write(data),
    }
  },
})
