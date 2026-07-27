import type { AdapterVersion } from '../../shared/agent-contract'

const createdAt = new Date(0)

export const builtinAdapterVersions: AdapterVersion[] = [
  {
    id: 'builtin-codex-v1',
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
    id: 'builtin-claude-code-v1',
    adapterId: 'builtin-claude-code',
    name: 'Claude Code',
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
    id: 'builtin-kimi-code-v1',
    adapterId: 'builtin-kimi-code',
    name: 'Kimi Code',
    kind: 'builtin',
    version: 1,
    definition: {
      executable: 'kimi',
      start: [],
      resume: ['--session', '{{agentSessionId}}'],
      fork: ['--session', '{{agentSessionId}}'],
      interactions: {
        fork: [{ input: '/fork\r', timeoutMs: 30_000, waitFor: '›' }],
      },
    },
    createdAt,
  },
]
