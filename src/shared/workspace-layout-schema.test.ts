import { describe, expect, it } from 'vitest'

import { parseWorkspaceLayoutSnapshot } from './workspace-layout-schema'

describe('workspace layout schema', (): void => {
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
