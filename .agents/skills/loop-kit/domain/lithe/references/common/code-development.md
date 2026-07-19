# 代码开发约束

通用 TypeScript、React 和 CSS 规范读取 `code-spec` skill；本文件只持有 Lithe 的领域边界：

- 使用根目录固定的 pnpm，并只维护 `pnpm-lock.yaml`。
- renderer 保持沙箱化，通过 `window.lithe` 使用特权能力；Node、Electron、文件系统和 SQLite 实现留在 main/preload。
- IPC 类型放在 `src/shared/app-contract.ts`，channel 放在 `src/shared/ipc-channels.ts`；preload 只暴露窄的领域方法，`ipcRenderer` 保留在隔离边界内。
- main 的 IPC handler 校验 sender 和外部参数；跨进程值保持可结构化克隆。
- 数据库先改 `src/main/database/schema.ts`，再生成并审查 migration；应用启动时自动迁移。
- renderer 的 `@` alias 只指向 `src/renderer/src`。main、preload 与 shared 使用相对导入。
- Oxfmt 是格式事实源，Oxlint 以 type-aware、type-check 和 deny-warnings 运行。

环境基线是 Node.js 24 与 `packageManager` 固定的 pnpm 11。安装和日常开发从仓库根执行：

```powershell
corepack enable
pnpm install
pnpm run dev
```
