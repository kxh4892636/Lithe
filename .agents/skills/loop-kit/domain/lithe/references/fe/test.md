# 如何测试

- 组件测试：Vitest + jsdom + Testing Library，文件与 feature 共置为 `*.test.tsx`。
- 测试初始化：`src/renderer/src/test/setup.ts` 加载 jest-dom 和中文 i18n。
- FE 门禁：

  ```powershell
  pnpm run typecheck:web
  pnpm run test:renderer
  pnpm run lint
  pnpm run build
  ```

- e2e 测试使用 `pnpm run test:e2e`。E2E 断言用户可见结果和持久化结果，不绑定组件内部状态。
