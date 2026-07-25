# Agent 进程采用声明式命令与成熟运行时

WS04 不为 Coding Agent CLI 建立提供方 SDK 或自行实现终端协议。Codex、Claude
Code 和自定义 Agent 都先归一为同一个声明式 Adapter：一个可执行文件，以及
`start`、`resume`、`fork` 三组 argv 模板。模板只做白名单变量替换并直接交给
`node-pty`，不经过 shell 拼接。

可执行文件发现使用成熟的 `which` 包；命令行入口和子命令解析使用 Commander；
Agent 面板继续复用 WS02 的 `node-pty`、xterm.js 和 FlexLayout。Lithe 自己只实现
任务、不可变 Adapter 版本、最小权限 capability 和提供方会话 ID 绑定等领域规则，
不复制进程、终端、布局或命令解析引擎。

进程停止使用 `pidtree` 在发送终止信号前捕获整棵进程树，并由 `tree-kill` 先发送
优雅终止信号；两秒后仍对已捕获的 PID 逐个强制终止。根进程先退出不会取消强制
清理，从而避免 Coding Agent 启动的后台子进程脱离 PTY 后残留。

内置 Codex Adapter 使用官方公开的 `codex resume <SESSION_ID>` 与
`codex fork <SESSION_ID>`；内置 Claude Code Adapter 使用官方公开的
`claude --resume <session-id>`，并按已确认契约用 `--fork-session` 派生。上述
参数仍通过相同声明模型执行，不在业务代码中建立提供方条件分支。

Adapter 配置不接受 shell 字符串、任意环境变量、Hook 或脚本正文。需要额外逻辑
时，用户应将逻辑放在自己可独立测试的外部包装程序中，再把包装程序声明为
`executable`。这让 Lithe 的执行边界保持窄小，也避免配置内容获得超出启动 Agent
所需的权限。

任务创建时固定当前 Adapter 版本 ID。编辑自定义 Adapter 会追加新版本，删除只从
后续选择列表隐藏，旧任务仍能用原版本恢复或 fork。渲染层只能取得启动结果和
不可变配置，不取得注入 Agent 子进程的 capability。
