# Shell 仅自动检测并选择全局默认

Lithe 自动检测当前系统可用 shell，并允许用户从检测结果中选择唯一全局默认值；
Windows 默认优先 `pwsh`、Windows PowerShell、`cmd.exe`，Linux 与 macOS 默认使用
登录 shell。首版不允许自定义 shell executable、参数、环境变量或 profile；
手动新建终端使用全局默认值，拆分终端沿用源 shell，默认修改只影响新终端。
