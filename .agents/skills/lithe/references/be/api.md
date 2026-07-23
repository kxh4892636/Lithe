# 如何创建一个 API/RPC 接口

Lithe 当前没有 HTTP 或 RPC server；跨进程接口使用 `ipcRenderer.invoke` / `ipcMain.handle`：

1. 在 `src/shared/app-contract.ts` 定义可结构化克隆的输入输出和 bridge 方法。
2. 在 `src/shared/ipc-channels.ts` 增加领域化 channel。
3. 在 `src/main/ipc-handlers.ts` 注册 handler，先执行 `assertTrustedSender`，再验证所有 renderer 输入。
4. 在 `src/preload/index.ts` 暴露窄方法，并同步 `src/preload/index.d.ts`。
5. renderer 按 [FE API](./../fe/api.md) 消费并 Mock bridge。
6. 应用窗口重建或退出时保持 handler 注册/移除对称。

preload 只暴露领域方法；通用 `invoke(channel, payload)`、`ipcRenderer` 和 Node 对象留在隔离边界内。完成标准是非法 sender/参数被拒绝，合法调用返回契约值，跨进程 E2E 通过。
