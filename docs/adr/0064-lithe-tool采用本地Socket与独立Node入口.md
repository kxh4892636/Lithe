# lithe-tool 采用本地 Socket 与独立 Node 入口

## 状态

已接受。

## 决策

首版 `lithe-tool` 使用 Commander 提供独立 CLI 命令解析，由 tsup 构建为 Node
可执行入口。独立的 `@lithe/tool` 包内联运行依赖，并通过 `bin` 声明全局安装到
`PATH`；它不包含 Electron 主进程产物，不复用 `Lithe.exe` 作为命令入口，也不
负责启动桌面应用。

桌面主进程使用 Node `net`：Windows 监听按当前用户派生名称的 Named Pipe，
macOS/Linux 监听 `~/.lithe/control.sock` Unix Domain Socket。Unix 目录权限为
`0700`，Socket 权限为 `0600`；任何平台都不监听 TCP。

传输采用一连接一请求、换行分隔的有界 JSON。请求和响应上限为 64 KiB；服务端
只接受版本化、严格校验的命令信封。CLI 除帮助和版本外只向 stdout 写一个 JSON
对象。

`context` 由数据库仓储映射，不复制项目业务逻辑。外部终端得到完整层级；
Agent 必须提交随机 capability，并且只得到其绑定项目和工作区。capability
绑定 Agent 实例，实例结束即撤销，不写入日志或持久化。

破坏性命令共享可取消的审批队列：默认三分钟超时，连接断开即取消。首个工作流
只建立此基础，不提前注册后续领域命令。

## 原因

Commander、Node `net` 和 tsup 都是成熟、MIT 兼容的现成能力。Lithe 只保留权限、
协议与领域映射这一小层，避免自行实现参数解析、跨平台本地传输或新的业务后端。

## 后果

全局 CLI 要求安装包的 `bin` 入口可被系统 Node 运行。同名原生可执行
包装层的预留方向已由 ADR-0076 取消，`lithe-tool` 只以 npm 包分发。
