# 首版 Git Diff 只提供只读审阅

首版 Git Diff 只展示 staged、unstaged 与 untracked 文件及其差异，并随文件变化
刷新，不执行 stage、unstage、discard、commit、checkout 或冲突解决等 Git 写
操作。文件修改交给文件编辑面板，其他 Git 操作交给终端或 Coding Agent，避免
GUI 与 Agent 并发修改工作树时提供高风险的一键破坏操作。

审阅范围只限当前 working tree：staged 比较 `HEAD` 与 index，unstaged 比较 index
与 working tree，untracked 与空文件比较；同一文件可分别出现在 staged 与
unstaged 分组。不推断默认分支、远端或 merge-base，也不提供 branch-to-branch
Diff。
