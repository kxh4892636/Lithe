# 首版 CLI Adapter 仅支持声明式配置

首版 CLI Adapter 只声明可执行文件、参数模板、PTY 交互步骤与 `start`、`resume`、
`fork` 能力，Lithe 通过通用执行器创建进程并执行交互步骤，不加载 JavaScript、
Node 模块或其他进程内插件。需要声明模型之外的条件判断或额外集成逻辑时，Agent
可以显式配置独立外部包装程序，从而保留扩展能力，同时不把第三方代码引入
Electron main 进程的特权边界。

Adapter 不提供通用 `env` 配置，也不保存、引用、校验或展示 Coding Agent 的
API Key 与认证环境变量。CLI 继承 Lithe 启动时的系统环境并使用自身认证配置；
Lithe 只额外注入访问 `lithe-tool` 所需的当前 CLI 实例 capability。

声明模型不增加 `sessionIdEnv`、会话 ID 提取命令或用于推断会话 ID 的提供方输出
解析规则。除内置 Adapter 在 Lithe Tool Skill 中说明的已知方式外，自定义 Coding
Agent 负责自行判断如何取得当前会话 ID 并调用 `agent bind`；无法取得时保持未
绑定，不能恢复或 fork，Lithe 不替其推断。

Lithe 对自定义 Adapter 只做静态校验：可执行文件能够解析、模板变量合法，并且
`resume`、`fork` 模板引用必要的源会话 ID。校验不得实际启动 CLI 或探测提供方
能力，以免创建会话、产生费用或造成其他副作用。错误的能力声明在运行时失败并
保留任务，不自动降级为其他操作。

每个命令模板由一个可执行文件和 argv 数组组成，不接受整段 shell command
string。Lithe 直接创建进程，不经 PowerShell、`cmd.exe`、Bash 或用户 shell
二次解释。需要管道、重定向、条件或其他 shell 逻辑时，用户必须把逻辑封装为
明确的外部包装程序，并将该程序配置为 executable。

首版 argv 模板只提供 `{{workspacePath}}`、`{{taskName}}` 和
`{{agentSessionId}}`。进程 cwd 始终由 Lithe 直接设置为工作区路径；
`workspacePath` 只供需要显式路径参数的 CLI 使用，`taskName` 可用于提供方会话
显示名称，`agentSessionId` 只在 `resume` 与 `fork` 模板中可用。Lithe 内部 ID、
capability 与审批信息不得进入模板。

一个 Adapter 只声明一个 executable，`start`、`resume`、`fork` 只分别声明 argv
模板，不允许按操作更换可执行文件。需要组合多个程序时，由用户配置的单一外部
包装程序根据参数自行分发。
