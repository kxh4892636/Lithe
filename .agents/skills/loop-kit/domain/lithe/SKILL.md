---
name: lithe
description: Lithe 桌面应用领域开发路由。处理 Electron main/preload/renderer、IPC、node:sqlite 与 Drizzle、桌面打包、测试或交付验证时使用。
---

# Lithe

本 skill 只负责分流。先判断影响面，再读取适用 reference；具体架构、命令和边界只在 reference 中维护。

## Common

| 任务                          | 必读 reference                                               |
| ----------------------------- | ------------------------------------------------------------ |
| Git 信息、仓库结构或子仓定位  | [workspace.md](references/common/workspace.md)               |
| 代码开发约束                  | [code-development.md](references/common/code-development.md) |
| 子仓或进程依赖关系            | [dependencies.md](references/common/dependencies.md)         |
| 本地门禁、E2E、打包或交付验收 | [acceptance.md](references/common/acceptance.md)             |

## FE

| 任务                                       | 必读 reference                                     |
| ------------------------------------------ | -------------------------------------------------- |
| renderer 架构、Provider、路由、状态或 i18n | [architecture.md](references/fe/architecture.md)   |
| 启动或调试 renderer                        | [development.md](references/fe/development.md)     |
| 开发页面或组件                             | [component.md](references/fe/component.md)         |
| 接入 IPC 或数据读取接口                    | [api.md](references/fe/api.md)                     |
| Mock renderer 接口                         | [mocking.md](references/fe/mocking.md)             |
| 前端埋点、日志或错误观测                   | [observability.md](references/fe/observability.md) |
| renderer 单测或用户路径测试                | [test.md](references/fe/test.md)                   |

## BE

| 任务                                 | 必读 reference                                     |
| ------------------------------------ | -------------------------------------------------- |
| Electron main/preload 架构或安全边界 | [architecture.md](references/be/architecture.md)   |
| 启动或调试 main                      | [development.md](references/be/development.md)     |
| 创建 IPC、API 或 RPC 接口            | [api.md](references/be/api.md)                     |
| SQLite、Drizzle、schema 或 migration | [database.md](references/be/database.md)           |
| 后台或异步任务                       | [async-task.md](references/be/async-task.md)       |
| Mock 主进程外部依赖                  | [mocking.md](references/be/mocking.md)             |
| 主进程日志、指标或 Trace             | [observability.md](references/be/observability.md) |
| main、preload 或跨进程测试           | [test.md](references/be/test.md)                   |

## DW

| 任务                          | 必读 reference                                                     |
| ----------------------------- | ------------------------------------------------------------------ |
| 数仓边界或架构                | [architecture.md](references/dw/architecture.md)                   |
| 启动或调试数仓应用            | [development.md](references/dw/development.md)                     |
| 分析模型或数据表              | [data-model.md](references/dw/data-model.md)                       |
| 数据任务、调度、发布或重跑    | [data-task.md](references/dw/data-task.md)                         |
| 数据输入输出契约              | [contract.md](references/dw/contract.md)                           |
| 样例数据、Mock 上游或历史回放 | [fixtures-replay.md](references/dw/fixtures-replay.md)             |
| 数据可观测性或质量            | [observability-quality.md](references/dw/observability-quality.md) |
| 数仓测试                      | [test.md](references/dw/test.md)                                   |

跨 renderer 与 main 的 IPC 改动同时读取 FE `api.md`、BE `api.md` 与 Common `dependencies.md`。代码、依赖、构建或交付变更再读取对应 Common reference；纯解释任务只读取问题对应的主题文件。

## 分流边界

- `src/renderer/**` 属于 FE。
- `src/main/**` 与 `src/preload/**` 属于 BE；这里的 BE 指桌面应用的特权进程，不是独立服务端。
- `src/shared/**` 是 FE/BE 共享契约；修改它通常是跨端任务。
- `drizzle/**` 与 `src/main/database/**` 是应用运行数据层，属于 BE，不属于 DW。
- Lithe 当前没有数仓应用；只有任务明确引入分析模型、数据管道或数据质量体系时才进入 DW 分支。

完成分流的标准：每个受影响路径、主题和运行边界都已映射到具体 Markdown，且所有适用 reference 已读取。
