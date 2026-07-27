import { describe, expect, it } from 'vitest'

import { parseWorkspaceLayoutSnapshot } from './workspace-layout-schema'

describe('workspace layout schema', (): void => {
  it('silently drops removed file and git-diff tabs from persisted snapshots', (): void => {
    const snapshot = parseWorkspaceLayoutSnapshot({
      layout: {
        borders: [],
        layout: {
          children: [
            {
              children: [
                {
                  component: 'file',
                  config: { panelId: 'file:1', relativePath: 'src/a.ts' },
                  id: 'file:1',
                  name: 'a.ts',
                  type: 'tab',
                },
                {
                  component: 'git-diff',
                  config: { kind: 'staged', panelId: 'diff:1', relativePath: 'src/a.ts' },
                  id: 'diff:1',
                  name: 'a.ts',
                  type: 'tab',
                },
                {
                  component: 'terminal',
                  config: { cwd: '/repo', panelId: 'terminal-1', shell: '/bin/zsh' },
                  id: 'terminal-1',
                  name: '终端',
                  type: 'tab',
                },
              ],
              selected: 2,
              type: 'tabset',
            },
            {
              children: [],
              type: 'tabset',
            },
          ],
          type: 'row',
        },
      },
      version: 1,
    })

    const tabsets = snapshot.layout.layout.children
    expect(tabsets[0]).toMatchObject({ children: [{ component: 'terminal', id: 'terminal-1' }], type: 'tabset' })
    expect(tabsets[0]).not.toHaveProperty('selected')
    expect(tabsets[1]).toMatchObject({ children: [], type: 'tabset' })
  })

  it('rejects unknown panel components and malformed recursive children', (): void => {
    expect(() =>
      parseWorkspaceLayoutSnapshot({
        layout: {
          borders: [],
          layout: {
            children: [
              {
                children: [{ component: 'browser', config: {}, id: 'panel-1', name: 'Browser', type: 'tab' }],
                type: 'tabset',
              },
            ],
            type: 'row',
          },
        },
        version: 1,
      }),
    ).toThrow('Invalid input')
  })

  it('rejects a layout deeper than the supported recursive limit', (): void => {
    let child: unknown = { children: [], type: 'tabset' }
    for (let depth = 0; depth < 33; depth += 1) child = { children: [child], type: 'row' }

    expect(() =>
      parseWorkspaceLayoutSnapshot({
        layout: { borders: [], layout: child },
        version: 1,
      }),
    ).toThrow('工作区布局嵌套过深')
  })
})
