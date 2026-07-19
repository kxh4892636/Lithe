# 如何验收

先按影响面选择最小门禁，再为跨进程或用户可见改动补真实路径：

| 影响面                            | 必跑门禁                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 任意代码或配置                    | `pnpm run format:check`、`pnpm run lint`、适用的 typecheck                                          |
| renderer                          | `pnpm run typecheck:web`、`pnpm run test:renderer`、`pnpm run build`                                |
| main、preload、shared、SQLite     | `pnpm run typecheck:node`、`pnpm run test:node`、`pnpm run build`                                   |
| IPC、持久化、导航、主题或启动流程 | `pnpm run test:e2e`                                                                                 |
| migration                         | `pnpm exec drizzle-kit generate`，确认无未提交或意外 migration，再跑 node test 与 E2E               |
| 安装包或平台配置                  | 在目标系统运行 `pnpm run build:win`、`build:linux` 或 `build:mac`，并对解包应用或安装产物做启动冒烟 |

完整本地门禁：

```powershell
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:e2e
```

Playwright 默认从源码构建产物启动 Electron。验证解包应用时设置 `LITHE_EXECUTABLE_PATH` 指向可执行文件后运行同一测试；测试使用独立临时 `userData`，会验证关闭重启后的 SQLite 持久化。

CI 的 quality job 覆盖 Windows、Linux、macOS；package job 生成 Windows x64 NSIS、Linux x64 AppImage、macOS x64/arm64 DMG；Windows 另跑 Electron E2E。需要交付证据时同时使用 `e2e` 与 `verifying` skill，并以本文件的路径和命令作为 Lithe profile。
