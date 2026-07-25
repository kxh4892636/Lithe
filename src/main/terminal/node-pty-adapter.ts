import * as nodePty from 'node-pty'
import pidtree from 'pidtree'
import treeKill from 'tree-kill'

import type { PtyAdapter, PtyCreateRequest, PtyProcess } from './pty-runtime'

const processEnvironment = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )

export const createNodePtyAdapter = (): PtyAdapter => ({
  spawn: (request: PtyCreateRequest): PtyProcess => {
    const process = nodePty.spawn(request.shell, request.args ?? [], {
      cols: request.columns,
      cwd: request.cwd,
      env: { ...processEnvironment(), ...request.environment },
      name: 'xterm-256color',
      rows: request.rows,
    })
    let terminationStarted = false
    return {
      kill: (): void => {
        if (terminationStarted) return
        terminationStarted = true
        const rootPid = process.pid
        void pidtree(rootPid, { root: true })
          .catch((): number[] => [rootPid])
          .then((processIds: number[]): void => {
            treeKill(rootPid, 'SIGTERM', (): void => undefined)
            const forceTimer = setTimeout((): void => {
              for (const processId of processIds.reverse()) {
                treeKill(processId, 'SIGKILL', (): void => undefined)
              }
            }, 2_000)
            forceTimer.unref()
          })
      },
      onData: (listener: (data: string) => void): void => {
        process.onData(listener)
      },
      onExit: (listener: (exitCode: number) => void): void => {
        process.onExit(({ exitCode }): void => {
          listener(exitCode)
        })
      },
      resize: (columns: number, rows: number): void => process.resize(columns, rows),
      write: (data: string): void => process.write(data),
    }
  },
})
