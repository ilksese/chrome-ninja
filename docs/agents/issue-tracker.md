# Issue 跟踪：GitHub

本仓库的需求、规格和任务保存在 `ilksese/chrome-ninja` 的 GitHub Issues 中。
所有操作使用 `gh` CLI。

## 约定

- 创建：`gh issue create --title "..." --body "..."`。
  多行正文使用 heredoc 或 `--body-file`。
- 读取：`gh issue view <number> --json number,title,body,labels,comments`。
- 列表：`gh issue list --state open --json number,title,body,labels`，
  按需添加 `--label` 和 `--state` 筛选。
- 评论：`gh issue comment <number> --body "..."`。
- 添加或移除标签：
  `gh issue edit <number> --add-label "..."` /
  `gh issue edit <number> --remove-label "..."`。
  分诊标签映射见 `triage-labels.md`。
- 关闭：先通过评论记录结论，再执行 `gh issue close <number>`。
  已关闭的 Issue 也使用独立评论命令补充结论。
- 父子任务：优先使用 GitHub 原生 sub-issues。
  不可用时，在子任务正文顶部写 `Part of #<parent>`，
  并在父任务正文的任务列表中链接子任务。
- 阻塞关系：优先使用 GitHub 原生 issue dependencies。
  不可用时，在任务正文顶部写 `Blocked by: #<n>, #<n>`。
  所有前置任务关闭后，任务才解除阻塞。
- 使用原生关联 API 时，区分 Issue 编号和数据库 ID；
  API 所需数据库 ID 通过 `gh api repos/ilksese/chrome-ninja/issues/<n> --jq .id` 获取。

在仓库目录内执行命令，由 `gh` 根据 Git remote 识别目标仓库。
每个会话首次创建 Issue 前，执行 `gh repo view --json nameWithOwner`，
确认目标为 `ilksese/chrome-ninja`；不一致时先向用户确认。
不得将项目任务发布到技能来源仓库。

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub Issues 和 PR 共用编号空间。
仅提供编号且类型不明确时，先确认它是 Issue 还是 PR。

## 技能要求“发布到 Issue 跟踪器”时

创建 GitHub Issue，不在 `.scratch/` 中创建替代任务。

## 技能要求“获取相关任务”时

使用 `gh issue view` 读取对应 Issue 及其评论。

## Wayfinding 操作

供 `/wayfinder` 使用；map 是一个父 Issue，子任务为独立 Issue。

- Map：使用 `wayfinder:map` 标签，正文保存
  Notes、Decisions-so-far 和 Fog。
- 子任务：关联为 map 的 sub-issue。
  不支持时，使用父任务列表及 `Part of #<map>` 关联。
- 类型：使用 `wayfinder:research`、`wayfinder:prototype`、
  `wayfinder:grilling` 或 `wayfinder:task` 标签。
- 阻塞关系：遵循上方阻塞约定，只计算尚未关闭的阻塞项。
- 下一任务：按 map 顺序选择第一个未关闭、无阻塞且未分配的子任务。
- 认领：开始工作前执行 `gh issue edit <n> --add-assignee @me`。
- 完成：评论记录答案，关闭子任务，
  再将结论摘要和链接补充到 map 的 Decisions-so-far。
