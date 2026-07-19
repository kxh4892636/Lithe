# 如何启动和调试前端应用

```powershell
pnpm install
pnpm run dev
```

VS Code 使用 `Debug All` 同时启动 Electron main 并附加 renderer，或使用 `Debug Renderer Process` 附加到 9222 端口。只验证生产 renderer 时先执行 `pnpm run build`，再执行 `pnpm run start`。

调试跨进程问题时依次确认 renderer 调用参数、`window.lithe` 方法、preload 转发、IPC channel 和 main handler；接口定义和 handler 规则读取 [BE API](../be/api.md)。
