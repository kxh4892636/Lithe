# lithe-tool 通过 Agent Skill 说明调用契约

Lithe 将 `lithe-tool` 的上下文、Agent 会话绑定、任务状态和管理命令写成 Coding
Agent 可读取的 Skill。Coding Agent CLI 自己发现并读取该 Skill，再按需调用全局
可用的 `lithe-tool`；Lithe 不向 Agent 会话注入启动消息、系统指令或提供方 Hook，
也不为了注册而自动创建一次模型回合。

Skill 只说明如何使用既有命令，不增加第二个可执行入口或隐藏管理命令。Agent
没有读取 Skill 或没有成功执行 `agent bind` 时，任务继续处于未绑定状态，不能
恢复或 fork，Lithe 不猜测或补写提供方会话 ID。

该 Skill 作为 Lithe 随应用交付的受管资源，由 Lithe 安装并在应用升级时同步
更新。Lithe 只更新能够确认由自身安装的副本；目标位置已存在同名但不受 Lithe
管理的 Skill 时停止安装并提示冲突，不覆盖、合并或删除用户文件。

权威副本保存在 `~/.lithe/skills/lithe-tool`。Lithe 分别在 Codex CLI 的
`~/.agents/skills/lithe-tool` 和 Claude Code 的
`~/.claude/skills/lithe-tool` 创建受管发现入口；平台支持时入口链接到权威
副本，不支持可靠链接时使用带版本与内容摘要的受管副本。禁用或卸载单个 Adapter
不删除这些入口；卸载 Lithe 时才询问是否清理能够确认由 Lithe 管理的入口和
权威副本。

Skill 说明 `lithe-tool` 的全部十六个公开管理命令，不为 Coding Agent 裁剪出
另一套接口。对于工作区删除、任务删除等破坏性命令，Skill 要求只有在用户意图
明确时才能请求；实际执行仍必须经过 Lithe 既定的三分钟 UI 审批门禁。Agent
不能绕过、代替或预先假定用户批准。

Codex CLI 与 Claude Code 读取同一份权威 `SKILL.md`。该文件只使用两者共同支持
的 Agent Skills 基础字段与语义，不依赖 Claude Code 的 `allowed-tools`、
`context` 等扩展，也不加入 Codex 专属行为。确有必要的提供方差异只能作为正文
说明，不能分裂为两份独立调用契约。

Skill 指示 Codex CLI 从 `CODEX_THREAD_ID`、Claude Code 从
`CLAUDE_CODE_SESSION_ID` 读取当前提供方会话 ID，再调用 `agent bind`。环境变量
不存在时必须停止绑定并报告 CLI 版本不兼容，不得扫描历史目录、解析终端内容或
猜测 ID。Claude Code 变量采用其公开接口；Codex 变量作为内置 Adapter 必须经过
版本兼容性验证的实现依赖，验证不通过时该 Adapter 不可用。
