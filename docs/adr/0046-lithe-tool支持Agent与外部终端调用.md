# lithe-tool 支持 Agent 与外部终端调用

`lithe-tool` 全局安装到 `PATH`，通过 Windows Named Pipe 或 macOS、Linux Unix
Domain Socket 控制同一用户正在运行的 Lithe，不监听 TCP，也不自动启动应用。
Agent 调用使用 Lithe 注入、绑定当前项目、工作区、任务与实例的临时 capability；
外部终端先通过 `context` 查询层级与当前选择，再用稳定 ID 显式指定目标。实例停止
后撤销 capability，破坏性外部调用仍不能绕过 Lithe UI 确认。`task running` 与
`task idle` 是例外：它们只作用于 capability 绑定的当前任务，不接受目标 ID，
也不允许外部终端调用。
