# Lithe 不代管 Coding Agent CLI 安装与认证

Lithe 自动检测内置 Codex CLI、Claude Code 与 Kimi Code Adapter 所需的可执行
文件和兼容版本；提供方公开非交互式认证状态命令时，Lithe 也在启动前检测认证
状态。Kimi Code 未提供该命令，因此由首次启动结果暴露未登录错误。Lithe 在不可
用时展示具体原因及官方安装指引，但不安装、升级、卸载 Coding Agent CLI，也不
发起或代管提供方登录。

不可用的 Adapter 保留在设置中但不能被选为全局默认值。已是全局默认值的
Adapter 后续变为不可用时，创建任务必须失败并提示修复，不得静默切换到另一个
Adapter；已有任务仍保留其固定的 Adapter 版本和 Agent 会话信息。
