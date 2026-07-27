# lithe-tool 通过 Agent Skill 说明调用契约

Lithe 将 `lithe-tool` 的上下文、Agent 会话绑定、任务状态和管理命令写成 Coding
Agent 可读取的 Skill。Coding Agent CLI 自己发现并读取该 Skill，再按需调用全局
可用的 `lithe-tool`；Lithe 不向 Agent 会话注入启动消息、系统指令，也不为了
注册而自动创建一次模型回合。由 `lithe-tool install` 安装的受管
`SessionStart` Hook 只负责提交官方提供的会话 ID。

Skill 只说明如何使用既有命令，不增加第二个可执行入口或隐藏管理命令。Agent
没有读取 Skill 或没有成功执行 `agent bind` 时，任务继续处于未绑定状态，不能
恢复或 fork，Lithe 不猜测或补写提供方会话 ID。

该 Skill 作为 Lithe 随应用交付的受管资源，只在用户显式执行
`lithe-tool install` 时安装或更新；Lithe 应用启动与升级不自动修改 Coding
Agent 配置。安装过程只更新能够确认由自身安装的副本；目标位置已存在同名但不受
Lithe 管理的 Skill 时报告冲突，不覆盖、合并或删除用户文件。

权威副本保存在 `~/.lithe/skills/lithe-tool`。Lithe 分别在 Codex CLI 的
`~/.agents/skills/lithe-tool` 和 Claude Code 的
`~/.claude/skills/lithe-tool` 创建受管发现入口；平台支持时入口链接到权威
副本，不支持可靠链接时使用带版本与内容摘要的受管副本。禁用或卸载单个 Adapter
不删除这些入口；卸载 Lithe 时才询问是否清理能够确认由 Lithe 管理的 Skill、
Hook、发现入口和权威副本。

Skill 说明 `lithe-tool` 的全部公开管理命令，不为 Coding Agent 裁剪出另一套
接口。对于工作区删除、任务删除等破坏性命令，Skill 要求只有在用户意图明确时
才能请求；实际执行仍必须经过 Lithe 既定的三分钟 UI 审批门禁。Agent 不能绕过、
代替或预先假定用户批准。

Codex CLI 与 Claude Code 读取同一份权威 `SKILL.md`。该文件只使用两者共同支持
的 Agent Skills 基础字段与语义，不依赖 Claude Code 的 `allowed-tools`、
`context` 等扩展，也不加入 Codex 专属行为。确有必要的提供方差异只能作为正文
说明，不能分裂为两份独立调用契约。

受管 Hook 调用 `lithe-tool agent bind --hook-input`，由该命令读取 Codex、
Claude Code 或 Kimi Code 官方 `SessionStart` JSON 中的 `session_id`。Skill 仍
说明 `agent bind --session-id <id>` 供 Agent 或用户显式修复绑定；两种入口都
不得扫描历史目录、解析终端输出或猜测 ID。
