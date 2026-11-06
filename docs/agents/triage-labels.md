# 分诊标签

工程技能使用以下五个标准分诊角色。本地 Markdown 任务的
`Status:` 字段使用对应的状态字符串。

| 标准角色          | 本仓库状态        | 含义                                    |
| ----------------- | ----------------- | --------------------------------------- |
| `needs-triage`    | `needs-triage`    | 等待维护者评估                          |
| `needs-info`      | `needs-info`      | 等待报告者补充信息                      |
| `ready-for-agent` | `ready-for-agent` | 规格已明确，可交由无人值守的 agent 实现 |
| `ready-for-human` | `ready-for-human` | 需要人工实现                            |
| `wontfix`         | `wontfix`         | 不予处理                                |

技能提到某个分诊角色时，使用表中对应的本仓库状态。
调整命名时修改“本仓库状态”列。
