# 如何接入一个接口

Lithe 当前没有 HTTP API 客户端。renderer 的接口是 `window.lithe` IPC bridge：

1. 在 `src/shared/app-contract.ts` 增加输入、输出和 `LitheBridge` 方法。
2. 在 `src/shared/ipc-channels.ts` 增加稳定 channel。
3. 按 [BE API](./../be/api.md) 补 main handler 和 preload bridge。
4. renderer 的异步读取用 React Query 建立稳定 `queryKey`；写操作成功后更新本地状态或失效相关 query。
5. 为 loading、error、empty 和 success 中适用的状态提供界面结果。

renderer 只消费 `window.lithe` 领域方法；Electron、`node:sqlite` 和 main 实现留在特权侧。完成标准是 shared、main、preload、renderer 与测试五层契约一致。
