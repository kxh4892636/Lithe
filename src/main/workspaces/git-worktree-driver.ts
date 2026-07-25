import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git'

export interface GitCommitSummary {
  hash: string
  subject: string
}

export interface GitSourceState {
  branch: string
  dirtyFingerprint: string
  dirtyPaths: string[]
  headCommit: string
}

export interface GitWorktreeDriver {
  branchExists: (rootPath: string, branch: string) => Promise<boolean>
  createExistingBranch: (rootPath: string, targetPath: string, branch: string) => Promise<void>
  createNewBranch: (rootPath: string, targetPath: string, branch: string, commit: string) => Promise<void>
  deleteBranch: (rootPath: string, branch: string) => Promise<void>
  inspectSource: (rootPath: string) => Promise<GitSourceState>
  isBranchCheckedOut: (rootPath: string, branch: string) => Promise<boolean>
  removeWorktree: (rootPath: string, targetPath: string) => Promise<void>
  resolveCommit: (rootPath: string, reference: string) => Promise<string>
  status: (rootPath: string) => Promise<string[]>
  unmergedCommits: (rootPath: string, baseBranch: string, branch: string) => Promise<GitCommitSummary[]>
  worktreeExists: (rootPath: string, targetPath: string) => Promise<boolean>
}

const git = (rootPath: string): SimpleGit => simpleGit({ baseDir: rootPath, binary: 'git', maxConcurrentProcesses: 1 })

const dirtyPaths = (status: StatusResult): string[] =>
  status.files.map((file): string => file.path).filter((path, index, paths): boolean => paths.indexOf(path) === index)

const worktreeBlocks = (value: string): string[][] =>
  value
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block): string[] => block.split(/\r?\n/))

const normalizedPath = (value: string): string => normalize(value).toLocaleLowerCase()

const branchExists = async (rootPath: string, branch: string): Promise<boolean> =>
  (await git(rootPath).branchLocal()).all.includes(branch)

const worktreeExists = async (rootPath: string, targetPath: string): Promise<boolean> => {
  const blocks = worktreeBlocks(await git(rootPath).raw(['worktree', 'list', '--porcelain']))
  return blocks.some((block): boolean => {
    const entry = block.find((line): boolean => line.startsWith('worktree '))
    return entry ? normalizedPath(entry.slice('worktree '.length)) === normalizedPath(targetPath) : false
  })
}

const dirtyFingerprint = async (repository: SimpleGit, status: StatusResult): Promise<string> => {
  const [porcelain, trackedDiff, ...untrackedHashes] = await Promise.all([
    repository.raw(['status', '--porcelain=v1', '-z']),
    repository.raw(['diff', '--binary', 'HEAD']),
    ...status.not_added.map(async (path): Promise<string> => {
      try {
        return await repository.raw(['hash-object', '--no-filters', '--', path])
      } catch {
        return `unreadable:${path}`
      }
    }),
  ])
  return createHash('sha256').update(porcelain).update(trackedDiff).update(untrackedHashes.join('\0')).digest('hex')
}

export const createGitWorktreeDriver = (): GitWorktreeDriver => ({
  branchExists,
  createExistingBranch: async (rootPath: string, targetPath: string, branch: string): Promise<void> => {
    await git(rootPath).raw(['worktree', 'add', targetPath, branch])
  },
  createNewBranch: async (rootPath: string, targetPath: string, branch: string, commit: string): Promise<void> => {
    await git(rootPath).raw(['worktree', 'add', '-b', branch, targetPath, commit])
  },
  deleteBranch: async (rootPath: string, branch: string): Promise<void> => {
    if (!(await branchExists(rootPath, branch))) return
    await git(rootPath).deleteLocalBranch(branch, true)
  },
  inspectSource: async (rootPath: string): Promise<GitSourceState> => {
    const repository = git(rootPath)
    if (!(await repository.checkIsRepo())) throw new TypeError('Project root is not a Git repository')
    const [branch, headCommit, status] = await Promise.all([
      repository.revparse(['--abbrev-ref', 'HEAD']),
      repository.revparse(['HEAD^{commit}']),
      repository.status(),
    ])
    return {
      branch: branch.trim(),
      dirtyFingerprint: await dirtyFingerprint(repository, status),
      dirtyPaths: dirtyPaths(status),
      headCommit: headCommit.trim(),
    }
  },
  isBranchCheckedOut: async (rootPath: string, branch: string): Promise<boolean> => {
    const blocks = worktreeBlocks(await git(rootPath).raw(['worktree', 'list', '--porcelain']))
    return blocks.some((block): boolean => block.includes(`branch refs/heads/${branch}`))
  },
  removeWorktree: async (rootPath: string, targetPath: string): Promise<void> => {
    if (!(await worktreeExists(rootPath, targetPath))) return
    await git(rootPath).raw(['worktree', 'remove', targetPath])
  },
  resolveCommit: async (rootPath: string, reference: string): Promise<string> =>
    (await git(rootPath).revparse([`${reference}^{commit}`])).trim(),
  status: async (rootPath: string): Promise<string[]> => dirtyPaths(await git(rootPath).status()),
  unmergedCommits: async (rootPath: string, baseBranch: string, branch: string): Promise<GitCommitSummary[]> => {
    const output = await git(rootPath).raw(['log', '--format=%H%x09%s', `${baseBranch}..${branch}`])
    return output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line): GitCommitSummary => {
        const [hash = '', ...subject] = line.split('\t')
        return { hash, subject: subject.join('\t') }
      })
  },
  worktreeExists,
})
import { createHash } from 'node:crypto'
import { normalize } from 'node:path'
