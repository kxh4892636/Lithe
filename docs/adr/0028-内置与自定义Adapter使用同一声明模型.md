# 内置与自定义 Adapter 使用同一声明模型

Lithe 随应用提供不可直接修改的内置 Adapter，同时允许用户在设置中创建、复制、
编辑和删除自定义声明式 Adapter；内置项可复制后定制，全局默认 CLI 可以选择
任一种。两类 Adapter 使用相同的校验与执行逻辑，自定义项保存在 SQLite，从而让
新 Coding Agent CLI 无需等待 Lithe 发版即可接入，又避免内置配置被本地修改后
无法随应用可靠升级。
