---
status: superseded by ADR-0075
---

# lithe-tool 固定为十六个命令

首版 `lithe-tool` 只暴露只读的 `context`，`workspace create|rename|delete`，
`task create|rename|unread|running|idle|archive|delete`，以及
`agent bind|start|resume|stop|fork`。布局、终端、标签移动、面板最大化、
`agent restart` 与 `task read` 都只由 UI、Lithe 内部流程或既定自动行为负责，
不进入工具命令面。
