import type { AdapterVersion } from '../../shared/agent-contract'

const createdAt = new Date(0)

export const builtinAdapterVersions: AdapterVersion[] = [
  {
    adapterId: 'builtin-codex',
    name: 'Codex',
    kind: 'builtin',
    version: 1,
    definition: {
      executable: 'codex',
      start: [],
      resume: ['resume', '{{agentSessionId}}'],
      fork: ['fork', '{{agentSessionId}}'],
    },
    createdAt,
  },
  {
    adapterId: 'builtin-claude-code',
    name: 'Claude',
    kind: 'builtin',
    version: 1,
    definition: {
      executable: 'claude',
      start: [],
      resume: ['--resume', '{{agentSessionId}}'],
      fork: ['--resume', '{{agentSessionId}}', '--fork-session'],
    },
    createdAt,
  },
  {
    adapterId: 'builtin-kimi-code',
    name: 'Kimi',
    kind: 'builtin',
    version: 1,
    definition: {
      executable: 'kimi',
      start: [],
      resume: ['--session', '{{agentSessionId}}'],
      fork: ['--session', '{{agentSessionId}}'],
      interactions: {
        fork: [{ input: '/fork\r', timeoutMs: 30_000, waitFor: '>' }],
      },
    },
    createdAt,
  },
]
