# 后端架构

Lithe 的 BE 是 Electron 特权侧，不是独立 HTTP 服务：

| 位置                       | 职责                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `src/main/index.ts`        | 单实例、应用生命周期、BrowserWindow、安全设置、窗口状态持久化和启动失败处理 |
| `src/main/ipc-handlers.ts` | IPC sender/参数校验与领域 handler                                           |
| `src/preload/index.ts`     | contextBridge 适配器，把 IPC 包装为 `window.lithe`                          |
| `src/preload/index.d.ts`   | renderer 全局 bridge 类型                                                   |
| `src/shared`               | 跨进程契约和 channel                                                        |
| `src/main/database`        | `node:sqlite` + Drizzle schema、repository 和迁移入口                       |

main 拥有 Node/Electron、文件系统、进程、网络和数据库等特权；preload 只桥接已批准的领域方法；renderer 保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
