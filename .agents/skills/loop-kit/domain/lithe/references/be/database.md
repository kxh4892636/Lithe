# 如何接入数据库

SQLite 使用 Electron 内置 `node:sqlite` 的 `DatabaseSync`，Drizzle driver 为 `drizzle-orm/node-sqlite`：

1. 修改 `src/main/database/schema.ts`。
2. 从仓库根生成 migration：

   ```powershell
   pnpm exec drizzle-kit generate
   ```

3. 审查 `drizzle/<timestamp>_<name>/migration.sql` 与 snapshot，并提交两者。
4. 在 `createAppDatabase` 暴露面向领域的 repository 方法；renderer 通过 IPC 使用，不传递数据库连接或 SQL。
5. 使用临时目录中的真实 SQLite 文件编写 node test，再用 E2E 验证跨重启持久化。

启动时自动执行 migrations，并启用 WAL、foreign keys、5 秒 busy timeout 与 `synchronous=NORMAL`。打包配置把整个 `drizzle` 目录作为 extra resource；新增 migration 后同时验证解包或安装产物包含它。
