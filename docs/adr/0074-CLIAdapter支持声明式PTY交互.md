# CLI Adapter 支持声明式 PTY 交互

任意内置或自定义 CLI Adapter 都可以为 `start`、`resume`、`fork` 声明 PTY
交互步骤，由 Lithe 在启动进程后模拟终端输入。这使只有交互命令、没有独立启动
参数的 Coding Agent CLI 也能接入完整会话能力；Kimi Code CLI 的 fork 因而可以
恢复源会话后输入 `/fork`，不需要专用进程内插件。

PTY 交互仍是受静态校验的声明式配置，不允许 Adapter 执行 JavaScript 或进入
Electron main 进程。内置与自定义 Adapter 使用同一模型，Lithe 不把这一能力
限制为 Kimi 特例；它也不用于解析或猜测提供方会话 ID，派生后的 Agent 仍须通过
`lithe-tool agent bind` 显式绑定自己的会话 ID。

交互步骤采用输出驱动而不是立即写入或固定延迟：每一步声明等待的终端文本、超时
时间和随后发送的输入，并按顺序执行。Lithe 先从 PTY 输出中去除 ANSI 控制序列，
再匹配声明的文本；只有匹配成功才发送该步输入，从而避免 CLI 启动速度变化造成
输入丢失。

任一步骤等待超时或匹配失败时，Lithe 终止该 CLI 进程，并在 Agent 面板显示失败
步骤与具体原因。`fork` 已创建的新任务保持活跃但不绑定 Agent 会话，不因自动
清理而丢失；用户可以删除该任务，或把它作为普通新任务重新启动。
