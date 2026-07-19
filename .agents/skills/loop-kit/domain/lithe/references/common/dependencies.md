# 子仓依赖关系

Lithe 没有子仓；依赖关系是同一应用内的单向进程边界：

```text
renderer -> window.lithe -> preload -> shared contract/channel -> main IPC -> database/system
```

- renderer 依赖 React、TanStack Router/Query、Zustand、i18next、Tailwind 和 shadcn UI。
- preload 依赖 shared 契约，只做桥接。
- main 依赖 Electron、`node:sqlite`、Drizzle 和 shared 契约。
- `src/shared` 不依赖 renderer、preload 或 main 的实现。
- 打包由 electron-vite 先生成 `out`，electron-builder 再把运行文件、生产依赖、LICENSE 和 `drizzle` migrations 组装到 `dist`。

修改共享契约时，按 shared → main handler → preload bridge → renderer consumer → tests 的顺序同步；完成标准是链路中每一层都已处理。
