# lithe-tool 提供离线集成安装

`lithe-tool` 新增 `install`，用于在本机安装 Lithe Tool Skill、统一会话绑定助手，
以及 Codex、Claude Code、Kimi Code 的 `SessionStart` Hook 配置。该命令直接操作
当前用户的集成文件，不经过本地控制通道，不要求 Lithe 应用正在运行，也不要求
项目、工作区、任务或 Agent capability；安装完成后新启动的 Coding Agent 才加载
这些资源。

安装与更新只由用户显式执行 `lithe-tool install` 触发。Lithe 应用启动和升级不
自动修改 Coding Agent 的用户配置；应用版本更新后，用户重新执行该命令才更新
受管集成。卸载 Lithe 时只询问清理能够确认由 Lithe 管理的 Skill、Hook 与发现
入口，不删除或重写用户自有配置。

三种受管 Hook 统一执行 `lithe-tool agent bind --hook-input`。该模式只接受
`SessionStart` Hook JSON，并从 stdin 读取非空 `session_id`；有 capability 时
绑定当前任务，无 capability 时静默成功。成功不输出 stdout，失败只写 stderr
并返回非零退出码。手工与 Agent 继续使用
`lithe-tool agent bind --session-id <id>` 及原有 JSON 输出。

`install` 始终安装通用 Lithe Tool Skill 与会话绑定助手，并自动检测当前用户环境
中可执行的 Codex、Claude Code、Kimi Code。它只为检测到的 CLI 写入 Hook 配置；
未检测到的提供方返回 `skipped`，用户以后安装对应 CLI 后重新执行即可。命令不
进入交互式提供方选择，以便脚本化和重复执行。

安装过程按提供方隔离且可重复执行：它解析并保留用户现有配置，只追加带 Lithe
标记的 Hook；同版本受管资源返回 `unchanged`，升级只更新能够确认由 Lithe 管理
的条目。同名但不受 Lithe 管理的 Skill 或 Hook、以及无法安全解析的配置，都使该
提供方保持原样并返回 `conflict`，但不回滚其他提供方。

命令只输出一个 JSON 对象。任一冲突令顶层 `ok` 为 `false`，同时在
`data.providers` 中为每个提供方报告 `installed`、`updated`、`unchanged`、
`skipped` 或 `conflict`，使部分成功与后续修复都可明确判断。

Codex 对非托管命令 Hook 的官方信任审核保持生效。`install` 不修改 Codex 信任
记录，也不向内置 Adapter 添加绕过信任的危险参数；Hook 尚未信任时 Codex 可以
启动，但任务保持未绑定。安装结果不额外透传 `requiresAction` 或提示字段，审核
与 Hook 更新后的重新信任都由 Codex 自身的 `/hooks` 界面负责。

受管 Hook 会在所有对应 Coding Agent CLI 会话中触发，但只有继承了
`LITHE_CAPABILITY` 的 Lithe 会话才尝试绑定。普通外部会话立即静默成功，不连接
Lithe；Lithe 会话从官方 Hook JSON 读取 `session_id` 并绑定当前任务。同一 ID
重复绑定幂等且静默成功；绑定失败只报告简短错误并保留未绑定任务，不阻止 Coding
Agent CLI 启动。

这项决定取代 ADR-0045 的“固定十六个命令”数量边界。原有管理命令及其权限约束
保持不变，`install` 也不开放布局、终端、标签或其他业务管理能力。
