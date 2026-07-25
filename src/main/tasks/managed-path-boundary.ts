import { isAbsolute, relative, resolve } from 'node:path'

export const createManagedPathBoundary =
  (root: string, message: string): ((path: string) => string) =>
  (path: string): string => {
    const resolved = resolve(path)
    const child = relative(root, resolved)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new TypeError(message)
    return resolved
  }
