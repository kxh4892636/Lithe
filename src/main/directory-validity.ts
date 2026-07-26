import { statSync } from 'node:fs'

type ErrorReporter = (message: string, error: unknown) => void

const isMissingPathError = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export const isExistingDirectory = (
  path: string,
  reportError: ErrorReporter = globalThis.console.error,
  stat: typeof statSync = statSync,
): boolean => {
  try {
    return stat(path).isDirectory()
  } catch (error: unknown) {
    if (!isMissingPathError(error)) reportError(`无法检查目录：${path}`, error)
    return false
  }
}
