# Claude Code 通过公开参数派生 Agent 会话

首版内置 Codex CLI 与 Claude Code Adapter。Claude Code 的 `fork` 能力通过新
PTY 执行以下声明式命令模板：

```text
claude --resume <源-session-id> --fork-session
```

该命令复制源会话历史并创建新的提供方会话 ID，不改变源会话及其 CLI 进程。
新会话的 Coding Agent 负责取得自己的会话 ID，并且只通过
`lithe-tool agent bind --session-id <新-session-id>` 绑定新任务。Lithe 不为
`agent bind` 增加 Hook 输入模式，不注入 Claude Code Hook，也不得解析终端文本、
扫描 Claude Code 历史目录、注入启动指令或向 PTY 模拟输入 `/fork`。Coding
Agent 从 Lithe Tool Skill 读取绑定契约并自行执行；尚未绑定时沿用未绑定 Agent
会话的既定限制。

Adapter 在启动前检查已安装 Claude Code 是否满足该参数所需的兼容版本。不支持
时禁用 `fork` 并提示升级，不回退到交互命令模拟。独立进程派生不继承源进程中
仅对当前会话批准的权限。
