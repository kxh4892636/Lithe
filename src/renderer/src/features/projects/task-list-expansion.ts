import { create } from 'zustand'

export const taskListPageSize = 8
export const scratchTaskListKey = 'scratch'

interface TaskListExpansionState {
  visibleCountByKey: Record<string, number>
  showMore: (key: string) => void
}

// 展开计数只存内存：折叠工作区再展开不重置，重启自然回到一页。
export const useTaskListExpansion = create<TaskListExpansionState>(
  (set): TaskListExpansionState => ({
    visibleCountByKey: {},
    showMore: (key: string): void => {
      set(
        (state): Partial<TaskListExpansionState> => ({
          visibleCountByKey: {
            ...state.visibleCountByKey,
            [key]: (state.visibleCountByKey[key] ?? taskListPageSize) + taskListPageSize,
          },
        }),
      )
    },
  }),
)

interface VisibleTaskList<T> {
  hasMore: boolean
  showMore: () => void
  visibleTasks: T[]
}

// 搜索过滤生效时忽略上限；计数保留，清空搜索后恢复
export const useVisibleTaskList = <T>(key: string, tasks: T[], query: string): VisibleTaskList<T> => {
  const visibleCount = useTaskListExpansion((state): number => state.visibleCountByKey[key] ?? taskListPageSize)
  const showMore = useTaskListExpansion((state) => state.showMore)
  return {
    hasMore: !query && tasks.length > visibleCount,
    showMore: (): void => showMore(key),
    visibleTasks: query ? tasks : tasks.slice(0, visibleCount),
  }
}
