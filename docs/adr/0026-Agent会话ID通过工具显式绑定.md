# Agent 会话 ID 通过工具显式绑定

Agent 创建或 fork 会话后，CLI 集成必须调用 `lithe-tool agent bind --session-id
<opaque-id>`，由当前 capability 自动绑定任务。Lithe 不解析终端输出，也不扫描
提供方历史目录猜测会话。首次调用写入绑定；同一任务与同一 Agent 会话 ID 的
后续调用幂等成功，用于恢复后的 CLI 实例重新验证关系。同一任务绑定不同 ID，
或当前 CLI capability 与任务不匹配时拒绝，任何实例都不能覆盖既有身份。

在绑定前任务可以停止，但不能恢复或 fork；进程退出仍未绑定时，任务保留但没有
可恢复的 Agent 会话。

绑定是 Agent 与 Lithe 之间的集成细节，不增加任务状态，也不在 Agent 面板或
左侧导航显示“等待绑定”等提示。绑定命令失败时由 Coding Agent 在自身交互中处理
和报告，Lithe 不另建持久通知。
