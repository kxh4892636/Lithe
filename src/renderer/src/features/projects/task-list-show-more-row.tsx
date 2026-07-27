interface TaskListShowMoreRowProps {
  onClick: () => void
}

// 与任务行保持同一缩进（ml-3），样式弱于任务行；全部展开后由调用方移除
export const TaskListShowMoreRow = ({ onClick }: TaskListShowMoreRowProps): React.JSX.Element => (
  <div className="ml-3">
    <button
      className="text-muted-foreground/60 hover:text-muted-foreground flex w-full items-center rounded-md px-2 py-1 text-left text-xs"
      onClick={onClick}
      type="button"
    >
      展开更多
    </button>
  </div>
)
