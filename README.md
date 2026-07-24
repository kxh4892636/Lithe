# Lithe

Lithe 是一个轻、快、可信的本地桌面应用底座，基于 Electron、React、TypeScript 和 electron-vite。首版界面语言为中文，内置 SQLite + Drizzle 数据层以及受限的类型安全 IPC bridge。

## 技术栈

- Electron 43、electron-vite 5、React 19、TypeScript 7、React Compiler
- Tailwind CSS 4、shadcn `bcivVKXQ` preset（Base Nova）
- TanStack Router（代码路由 + hash history）、TanStack React Query、Zustand
- i18next、dayjs、es-toolkit
- Electron 内置 `node:sqlite`、Drizzle ORM RC、代码优先 SQL migrations
- Oxlint（含类型感知检查）、Oxfmt、Commitlint、lint-staged、Vitest、Testing Library、Playwright Electron

## 环境要求

- Node.js 24 LTS
- pnpm 11（版本已由 `packageManager` 固定）

## 开发

```powershell
corepack enable
pnpm install
pnpm run dev
```

数据库位于 Electron `userData/lithe.db`。应用直接使用 Electron 内置的 `node:sqlite`，无需下载或编译原生扩展。启动时会自动执行 `drizzle/` 中已提交的 migrations，并启用 WAL、foreign keys、5 秒 busy timeout 与 `synchronous=NORMAL`。

## 质量门禁

```powershell
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:e2e
```

`pnpm install` 会通过 Husky 启用 Git hooks：提交前仅对暂存文件运行 Oxfmt/Oxlint，创建提交前使用 Conventional Commits 规则校验提交信息。

## 打包

```powershell
pnpm run build:win
pnpm run build:linux
pnpm run build:mac
```

目标产物为 Windows x64 NSIS、Linux x64 AppImage，以及 macOS x64/arm64 DMG。首版产物不签名、不公证、不自动发布。

## 安全边界

renderer 启用 `sandbox` 和 `contextIsolation`，关闭 `nodeIntegration` 与 `webviewTag`。文件、运行时与 SQLite 等能力只能通过 main 进程提供的窄 IPC 接口访问；main 会校验 IPC sender 与参数，并阻止新窗口和外部导航。

## License

[MIT](./LICENSE) © 2026 kxh
