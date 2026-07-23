# 如何启动和调试后端应用

```powershell
pnpm install
pnpm run dev
```

VS Code 使用 `Debug Main Process` 或 `Debug All`。需要隔离本地数据库时，在同一 PowerShell 会话设置临时目录后启动：

```powershell
$env:LITHE_USER_DATA_DIR = Join-Path $env:TEMP 'lithe-dev-user-data'
pnpm run dev
```

数据库默认位于 Electron `userData/lithe.db`。生产迁移从 `process.resourcesPath/drizzle` 读取，开发迁移从仓库 `drizzle` 读取。启动失败会写入 stderr、显示错误框并退出。
