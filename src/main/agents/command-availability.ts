import { execFile } from 'node:child_process'

import which from 'which'

import type { AdapterVersion } from '../../shared/agent-contract'

export interface AdapterAvailability {
  forkAvailable: boolean
  isAvailable: boolean
  reason: string | null
  resumeAvailable: boolean
}

interface ProbeResult {
  output: string
  succeeded: boolean
}

export const resolveExecutablePath = (executable: string): string | null => which.sync(executable, { nothrow: true })

const probe = (executable: string, arguments_: string[]): Promise<ProbeResult> =>
  new Promise((resolve: (value: ProbeResult) => void): void => {
    execFile(
      executable,
      arguments_,
      { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      (error: Error | null, stdout: string, stderr: string): void => {
        resolve({ output: `${stdout}\n${stderr}`, succeeded: !error })
      },
    )
  })

const availability = (
  isAvailable: boolean,
  reason: string | null,
  resumeAvailable: boolean,
  forkAvailable: boolean,
): AdapterAvailability => ({ forkAvailable, isAvailable, reason, resumeAvailable })

export const inspectAdapterAvailability = async (adapter: AdapterVersion): Promise<AdapterAvailability> => {
  const executable = await which(adapter.definition.executable, { nothrow: true })
  if (!executable) return availability(false, `Executable not found: ${adapter.definition.executable}`, false, false)
  if (adapter.kind === 'custom') {
    return availability(true, null, adapter.definition.resume !== null, adapter.definition.fork !== null)
  }

  const help = await probe(executable, ['--help'])
  if (!help.succeeded) return availability(false, `${adapter.name} version could not be inspected`, false, false)
  if (adapter.adapterId === 'builtin-kimi-code') {
    const sessionAvailable = /--session\b/i.test(help.output)
    return availability(
      true,
      null,
      sessionAvailable && adapter.definition.resume !== null,
      sessionAvailable && adapter.definition.fork !== null,
    )
  }
  const resumeAvailable =
    adapter.adapterId === 'builtin-codex' ? /\bresume\b/i.test(help.output) : /--resume\b/i.test(help.output)
  const forkAvailable =
    adapter.adapterId === 'builtin-codex' ? /\bfork\b/i.test(help.output) : /--fork-session\b/i.test(help.output)
  const authentication =
    adapter.adapterId === 'builtin-codex'
      ? await probe(executable, ['login', 'status'])
      : await probe(executable, ['auth', 'status'])
  return availability(
    authentication.succeeded,
    authentication.succeeded ? null : `${adapter.name} is not authenticated`,
    resumeAvailable,
    forkAvailable,
  )
}

export const isAdapterAvailable = async (adapter: AdapterVersion): Promise<boolean> =>
  (await inspectAdapterAvailability(adapter)).isAvailable
