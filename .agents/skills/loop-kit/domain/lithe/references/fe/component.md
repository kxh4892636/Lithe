# 如何开发一个组件

1. 领域 UI 放在对应 `features/<domain>`；可复用 UI primitive 通过项目现有 shadcn 配置生成：

   ```powershell
   pnpm exec shadcn add <component>
   ```

2. shadcn primitive 保持在 `components/ui`，业务语义、数据读取和状态留在 feature。
3. 使用 Tailwind utilities 和 `main.css` 中的语义变量；深色模式由根元素 `dark` class 驱动。
4. 用户可见文案在 `i18n.ts` 中定义，再通过 `useTranslation` 读取。
5. 在 feature 旁新增 `*.test.tsx`，覆盖用户交互和可观察结果。

新增页面时同时更新 `router.tsx` 的 route tree；需要出现在主导航时再更新 `app-shell.tsx`。完成标准是路由可通过 hash 直接进入、导航状态正确、组件测试通过。
