# 如何测试

- main/database：Vitest node 环境，文件位于 `src/main/**/*.test.ts`。
- renderer 对 main 契约的消费：在 FE 测试中 Mock `window.lithe`。
- 跨进程行为：Playwright Electron E2E，使用独立临时 `userData`。
- BE 门禁：

  ```powershell
  pnpm run typecheck:node
  pnpm run test:node
  pnpm run lint
  pnpm run build
  pnpm run test:e2e
  ```

当前 node test 覆盖主题和窗口状态持久化；E2E 覆盖启动、运行信息 IPC、导航、主题和重启恢复。
