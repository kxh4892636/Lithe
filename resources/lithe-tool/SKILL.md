---
name: lithe-tool
description: 管理 Lithe 的项目、工作区、任务与 Coding Agent 会话；在需要查询上下文、报告任务状态、绑定会话或执行管理命令时使用。
---

# Lithe Tool

在 Lithe 中工作时，使用 PATH 中全局可用的 `lithe-tool` 命令。
除 `--help`、`--version` 和下述 Hook 专用绑定外，每次调用都只向 stdout
输出一个 JSON 对象；仅在 `ok` 为 `true` 时使用 `data`。

## 安装与升级

Lithe Tool 以 npm 包分发，不内置运行时，要求 PATH 中存在 Node.js 20 或更高版本。
在 Lithe 仓库根目录执行：

```sh
pnpm run build:cli
npm install --global ./packages/lithe-tool
lithe-tool install
```

安装或升级全局包后，显式运行 `lithe-tool install`，安装当前版本的 Skill，
并为检测到的 Codex、Claude Code 和 Kimi Code 安装受管 `SessionStart` Hook。

## 建立调用上下文

先运行 `lithe-tool context`，取得稳定的项目、工作区和任务 ID。普通终端调用必须
传入相应命令要求的显式 ID；Lithe 启动的 Agent 只能操作其注入 capability
允许的上下文。

新的提供方对话开始后，通过该 Coding Agent 官方支持的方式取得不透明的提供方
会话 ID，再运行：

```sh
lithe-tool agent bind --session-id <id>
```

Lithe 不管理提供方历史，也不推断该 ID。受管 Hook 使用
`lithe-tool agent bind --hook-input` 从 stdin 读取官方 JSON；手工绑定统一使用
`--session-id`。

## 报告 Agent 状态

在 Lithe 中运行的 Coding Agent 必须按以下顺序报告自身状态：

1. 开始或恢复工作时运行 `lithe-tool task running`，并在整个工作期间保持运行中。
2. 产生需要用户关注的输出后运行 `lithe-tool task unread`，包括完成结果、阻塞、
   问题或审批请求。
3. 将控制权交还用户或等待后续工作前，立即运行 `lithe-tool task idle`。

每次 `running` 最终都必须与一次 `idle` 配对，即使工作以错误或阻塞结束；需要用户
关注时，先报告 `unread`，再报告 `idle`。

在 Lithe Agent 内，`running` 和 `idle` 只作用于当前 capability 绑定的任务，
不接受目标参数；普通外部终端不能报告 Agent 状态。其他任务命令在没有绑定当前
任务时需要 `--task-id`。运行中的任务不能归档或派生。

## 命令参考

任务：

- `lithe-tool task create [--workspace-id <id>] [--adapter-id <id>] --name <name>`
  （省略 `--workspace-id` 时创建受管临时工作区）
- `lithe-tool task rename --task-id <id> --name <name>`
- `lithe-tool task unread [--task-id <id>]`
- `lithe-tool task running`
- `lithe-tool task idle`
- `lithe-tool task archive [--task-id <id>]`
- `lithe-tool task delete [--task-id <id>]`

工作区：

- `lithe-tool workspace create --project-id <id> [--source-workspace-id <id>] [--name <name>] [--new-branch <branch>] [--from <commit>] [--existing-branch <branch>]`
- `lithe-tool workspace rename --workspace-id <id> --name <name>`
- `lithe-tool workspace delete --workspace-id <id> [--confirm-branch <branch>]`

项目：

- `lithe-tool project remove --project-id <id> [--confirm-branch <workspace-id=branch> ...]`

Agent：

- `lithe-tool agent bind --session-id <id>`
- `lithe-tool agent start --task-id <id>`
- `lithe-tool agent resume --task-id <id>`
- `lithe-tool agent stop --task-id <id>`
- `lithe-tool agent fork --task-id <id>`

运行 `lithe-tool --help` 查看当前安装版本的完整命令说明。破坏性操作只在用户意图
明确时请求；Lithe 发出 UI 审批请求后，等待命令返回成功再视为已获批准。任务删除
最多等待三分钟的显式 UI 审批。
