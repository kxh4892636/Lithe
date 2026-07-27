import { beforeEach, describe, expect, it } from 'vitest'

import { scratchTaskListKey, taskListPageSize, useTaskListExpansion } from './task-list-expansion'

describe('task list expansion', (): void => {
  beforeEach((): void => {
    useTaskListExpansion.setState({ visibleCountByKey: {} })
  })

  it('shows one page by default and appends one page per expansion', (): void => {
    expect(useTaskListExpansion.getState().visibleCountByKey['workspace-1']).toBeUndefined()

    useTaskListExpansion.getState().showMore('workspace-1')
    expect(useTaskListExpansion.getState().visibleCountByKey['workspace-1']).toBe(taskListPageSize * 2)

    useTaskListExpansion.getState().showMore('workspace-1')
    expect(useTaskListExpansion.getState().visibleCountByKey['workspace-1']).toBe(taskListPageSize * 3)
  })

  it('tracks expansion per list key without resetting sibling lists', (): void => {
    useTaskListExpansion.getState().showMore('workspace-1')

    expect(useTaskListExpansion.getState().visibleCountByKey['workspace-1']).toBe(taskListPageSize * 2)
    expect(useTaskListExpansion.getState().visibleCountByKey['workspace-2']).toBeUndefined()
    expect(useTaskListExpansion.getState().visibleCountByKey[scratchTaskListKey]).toBeUndefined()
  })
})
