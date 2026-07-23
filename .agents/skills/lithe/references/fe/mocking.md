# 如何 Mock 接口

renderer 单测直接设置类型化的 `window.lithe`：使用 `vi.fn<签名>()` 返回契约形状；React Query 测试创建独立 QueryClient，并关闭 retry，避免跨测试缓存和重试噪声。现有示例在 `home-page.test.tsx` 与 `settings-page.test.tsx`。

E2E 使用真实 preload、IPC 和 SQLite，不替换 bridge。测试通过临时 `LITHE_USER_DATA_DIR` 隔离数据，结束后关闭 Electron 并清理目录。
