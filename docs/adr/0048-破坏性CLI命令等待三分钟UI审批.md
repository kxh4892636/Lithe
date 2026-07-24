# 破坏性 CLI 命令等待三分钟 UI 审批

`task delete`、`workspace delete` 等破坏性 `lithe-tool` 调用在发送请求后阻塞，
由 Lithe UI 展示来源、目标与影响并排队审批；确认后执行并返回最终 JSON，拒绝
返回 `USER_REJECTED`。三分钟未处理返回 `APPROVAL_TIMEOUT`，调用进程退出也取消
待审批请求；窗口失焦时只请求用户注意而不强行抢焦点。
