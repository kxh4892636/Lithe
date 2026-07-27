# Claude Code 通过公开参数派生 Agent 会话

Claude Code 内置 Adapter 的 `fork` 能力通过新 PTY 执行以下声明式命令模板：

```text
claude --resume <源-session-id> --fork-session
```

该命令复制源会话历史并创建新的提供方会话 ID，不改变源会话及其 CLI 进程。
新会话由受管 `SessionStart` Hook 调用
`lithe-tool agent bind --hook-input`，从官方 Hook JSON 提交新会话 ID 并绑定
新任务；手工绑定仍可使用 `--session-id <新-session-id>`。Lithe 不解析终端
输出或扫描 Claude Code 历史目录。Claude Code 内置 Adapter 使用公开参数完成
派生，不需要额外的 PTY 交互步骤；尚未绑定时沿用未绑定 Agent 会话的既定限制。

Adapter 在启动前检查已安装 Claude Code 是否满足该参数所需的兼容版本。不支持
时禁用 `fork` 并提示升级，不回退到交互命令模拟。独立进程派生不继承源进程中
仅对当前会话批准的权限。
