# lithe-tool 以 npm 包分发并独占集成安装

## 状态

已接受。

## 决策

`lithe-tool` 只以 npm 包形态分发：不再打包原生 exe，也不再内置 Node
运行时，要求用户系统 PATH 上有 Node 20 或更高版本。当前不发布 registry，
用户在仓库根目录执行 `pnpm run build:cli` 后以
`npm install --global ./packages/lithe-tool` 本地路径全局安装；`bin`
入口使 `lithe-tool` 可被终端直接识别。`npm pack` tarball 仅作为脱离仓库
分发时的备用形态，不建立额外流程。

Lithe 桌面应用不再内置 `resources/lithe-tool`，也不再代为安装 Lithe Tool
Skill。Skill 与 Coding Agent Hook 的唯一安装入口是 `lithe-tool install`
（沿用 ADR-0075 的离线集成安装语义），SKILL.md 只随 npm 包内联发布。应用
不检测、不提示 `lithe-tool` 的缺失；安装与升级始终是用户显式执行的手动
行为。

本地控制通道增加协议版本握手：lithe-tool 请求继续携带 `version`；服务端
把缺失 `version` 的请求视为协议版本 1，把不等于当前支持版本的请求拒绝为
`INCOMPATIBLE_VERSION`，错误消息说明本端支持的版本并指引升级 Lithe 或
重装匹配的 lithe-tool，替代原先笼统的 `INVALID_REQUEST`。

## 原因

exe 与内置 Node 需要逐平台构建、签名并承担运行时体积，而 lithe-tool 的
用户必然已经具备 Node（各 Coding Agent CLI 均依赖之），原生包装层没有
实际受益人。npm 全局 `bin` 是让终端识别命令的标准机制，升级路径
（重装即升级）对用户透明。

应用与 CLI 双发布源会让同一份 SKILL.md 出现版本漂移；既然 Skill 的全部
命令都以本机装有 lithe-tool 为前提，由 lithe-tool 独占集成安装最自洽。
npm 化之后两端版本必然漂移，显式握手让不兼容成为带升级指引的明确失败，
而不是 Agent 自动化链路里难以诊断的泛泛解析错误。

## 后果

没有 Node 的机器无法使用 lithe-tool；ADR-0064 中"未来可替换为同名原生
可执行包装层"的预留方向取消，若未来恢复，必须保持本协议与握手行为不变。
正式发布 registry 前需重新确认包名（`@lithe/tool` 在公共 npm 的 scope
未必可用，无 scope 的 `lithe-tool` 当前未被占用）。
