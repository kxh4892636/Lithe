# lithe-tool 管理命令统一输出 JSON

除 `--help` 与 `--version` 外，`lithe-tool` 每次只向 stdout 输出一个 JSON 对象：
成功使用 `ok: true` 与 `data`，失败使用 `ok: false` 及稳定英文 `error.code` 和简短
英文 `message`。stdout 不混入日志、进度动画或本地化文案，成功退出码为零、失败
为非零；诊断进入 Lithe 日志系统且不得包含 capability。
