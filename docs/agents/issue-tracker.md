# Issue 跟踪：本地 Markdown

本仓库的需求、规格和任务保存在 `.scratch/` 中。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`。
- 规格文件：`.scratch/<feature-slug>/spec.md`。
- 实现任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，
  从 `01` 开始编号，每个任务独立成文件。
- 分诊状态写在任务文件顶部附近的 `Status:` 行中；
  状态名称见 `triage-labels.md`。
- 评论和讨论按时间顺序追加到文件底部的 `## Comments` 下。

## 技能要求“发布到 Issue 跟踪器”时

在 `.scratch/<feature-slug>/` 下创建对应文件，按需创建目录。

## 技能要求“获取相关任务”时

读取指定路径的文件。若只提供编号，先确定所属功能目录；
多个目录存在相同编号时向用户确认。

## Wayfinding 操作

供 `/wayfinder` 使用；map 文件对应多个独立的子任务文件。

- Map：`.scratch/<effort>/map.md`，
  保存 Notes、Decisions-so-far 和 Fog。
- 子任务：`.scratch/<effort>/issues/<NN>-<slug>.md`，
  从 `01` 开始编号，正文记录待解答的问题。
- 类型：`Type:` 使用 `research`、`prototype`、`grilling` 或 `task`。
- 执行状态：此工作流的 `Status:` 使用 `open`、`claimed`、
  `resolved`，与普通任务的分诊状态区分。
- 阻塞关系：在顶部附近记录 `Blocked by: NN, NN`；
  所有前置任务均为 `resolved` 时解除阻塞。
- 下一任务：扫描该目录中状态为 `open` 且无阻塞的任务，
  按编号选择第一个。
- 认领：开始工作前先写入并保存 `Status: claimed`。
- 完成：在 `## Answer` 下追加结论，设置 `Status: resolved`，
  再将摘要和链接追加到 map 的 Decisions-so-far。
