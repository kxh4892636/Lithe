# 工作区概述

Lithe 是单仓、单 package 的 Electron 桌面应用。仓库根同时是 Git 根和 pnpm package 根；当前没有 workspace 子包、Git submodule 或嵌套子仓。

Git 分支、远端和工作树状态会变化，开始工作时读取实时信息：

```powershell
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git log -1 --oneline --decorate
```

| 路径                 | 定位                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `src/main`           | Electron 生命周期、BrowserWindow、IPC handler、系统能力和 SQLite |
| `src/preload`        | context bridge；把允许的 IPC 能力暴露为 `window.lithe`           |
| `src/renderer`       | React renderer、代码路由、页面、状态、i18n 与 UI                 |
| `src/shared`         | main、preload、renderer 共用的类型和 IPC channel                 |
| `drizzle`            | Drizzle 生成并提交的 SQLite migrations                           |
| `tests/e2e`          | Playwright Electron 真实应用路径                                 |
| `build`、`resources` | 安装包资源、图标与 macOS entitlements                            |
| `.github/workflows`  | Windows、Linux、macOS 的质量、打包和 E2E CI                      |

`out`、`dist`、`test-results`、`playwright-report` 和本地 `*.db*` 是忽略的运行或构建产物。
