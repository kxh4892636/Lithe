# CLI Adapter 按能力降级且不提供重启

CLI Adapter 只必须提供新建 Agent 会话的 `start` 能力，`resume` 与 `fork` 可选；
Lithe 根据能力禁用不支持的操作，不模拟提供方没有的语义。`stop` 由 Lithe 优雅
终止对应进程树并在超时后强制终止。产品与 `lithe-tool` 均不提供 `restart`，
需要继续已有上下文或创建新上下文时必须分别选择明确的恢复或启动操作。

`start` 只能为没有 Agent 会话的任务创建新会话，`resume` 只能恢复已有会话，
`stop` 保留任务和会话，`fork` 则创建新任务及派生会话；错误上下文中的调用直接
失败，不能在新建与恢复之间静默降级。
