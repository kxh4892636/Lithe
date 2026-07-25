import { describe, expect, it } from 'vitest'

import { validateAdapterDefinition } from '../../shared/agent-contract'
import { renderAdapterCommand } from './adapter-executor'
import { builtinAdapterVersions } from './builtin-adapters'

describe('declarative Adapter executor', (): void => {
  it('renders argv without invoking a shell', (): void => {
    const definition = validateAdapterDefinition({
      executable: 'agent-wrapper',
      start: ['--cwd', '{{workspacePath}}', '--name={{taskName}}'],
      resume: ['resume', '{{agentSessionId}}'],
      fork: null,
    })

    expect(
      renderAdapterCommand(definition, 'start', {
        taskName: 'review & publish',
        workspacePath: 'D:\\work space',
      }),
    ).toEqual({
      executable: 'agent-wrapper',
      args: ['--cwd', 'D:\\work space', '--name=review & publish'],
    })
  })

  it('rejects unknown variables and invalid session templates', (): void => {
    expect(() =>
      validateAdapterDefinition({
        executable: 'agent',
        start: ['{{capability}}'],
        resume: null,
        fork: null,
      }),
    ).toThrow('Unknown Adapter variable')
    expect(() =>
      validateAdapterDefinition({
        executable: 'agent',
        start: [],
        resume: ['resume'],
        fork: null,
      }),
    ).toThrow('resume must reference agentSessionId')
  })

  it('defines Codex and Claude Code through the same immutable model', (): void => {
    expect(builtinAdapterVersions.map((adapter) => adapter.name)).toEqual(['Codex', 'Claude Code'])
    expect(builtinAdapterVersions[0]?.definition.fork).toEqual(['fork', '{{agentSessionId}}'])
    expect(builtinAdapterVersions[1]?.definition.fork).toEqual(['--resume', '{{agentSessionId}}', '--fork-session'])
  })
})
