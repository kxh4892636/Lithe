# 前端架构

FE 运行在沙箱化 Electron renderer 中，源码根是 `src/renderer/src`。

| 位置                | 职责                                                            |
| ------------------- | --------------------------------------------------------------- |
| `main.tsx`          | 初始化主题，装配 QueryClient、TooltipProvider 和 RouterProvider |
| `router.tsx`        | TanStack Router 代码路由与 hash history                         |
| `app-shell.tsx`     | 窗口壳、侧栏导航、标题栏和 `<Outlet />`                         |
| `features/<domain>` | 页面、领域状态和同域测试                                        |
| `components/ui`     | shadcn `base-nova` UI primitives                                |
| `assets/main.css`   | Tailwind 入口、CSS variables、主题与窗口 drag region            |
| `i18n.ts`           | i18next 资源；首版固定为 `zh-CN`                                |

异步读取使用 TanStack React Query；跨组件客户端状态使用 Zustand。当前主题状态由 Zustand 管理，通过 `window.lithe.preferences` 持久化到 main 的 SQLite。
