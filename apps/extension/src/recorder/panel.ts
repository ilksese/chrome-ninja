import van from "vanjs-core"
import { Button, Column, Input, PanelHeader, Row, Status, Surface, Text } from "@/content-ui/components"
import { createScope, type View } from "@/content-ui/lifecycle"
import { theme } from "@/content-ui/theme"
import type { RecorderCommand, RecorderViewState } from "./messages"
import type { RecorderHistoryItem } from "./types"

const STATUS_TEXT: Record<string, string> = { recording: "录制中", paused: "已暂停", replaying: "复现中" }

function sendCommand(command: RecorderCommand) {
  void chrome.runtime.sendMessage({ target: "recorder", type: "COMMAND", command })
}

export default function Panel(): View {
  const scope = createScope()
  const state = van.state<RecorderViewState>({ enabled: false, task: null, history: [] })
  const active = () => state.val.task !== null
  const task = () => state.val.task
  const historyList = Column()
  const items = new Map<string, { element: HTMLElement; update: (item: RecorderHistoryItem) => void }>()

  const historyItem = (initial: RecorderHistoryItem) => {
    const item = van.state(initial)
    const editing = van.state(false)
    const name = van.state(initial.name)
    const save = () => {
      if (name.val.trim()) sendCommand({ name: "renameHistory", historyId: item.val.id, newName: name.val.trim() })
      editing.val = false
    }
    const input = Input({
      "aria-label": "历史记录名称",
      value: () => name.val,
      style: { flex: 1, fontSize: 14, padding: "4px 8px" },
      oninput: (event: Event) => {
        name.val = (event.target as HTMLInputElement).value
      },
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === "Enter") save()
        if (event.key === "Escape") editing.val = false
      }
    })
    const replay = (step: boolean) =>
      sendCommand({ name: step ? "replayStep" : "replayAll", historyId: item.val.id, inNewTab: false })
    const small = { fontSize: 12, padding: "4px 8px" }
    const element = Surface(
      { style: { padding: 12 } },
      Row(
        { style: () => ({ display: editing.val ? "flex" : "none", marginBottom: 8 }) },
        input,
        Button({ variant: "primary", style: small, onclick: save }, "保存")
      ),
      Text(
        {
          style: () => ({
            display: editing.val ? "none" : "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 600
          })
        },
        () => item.val.name
      ),
      Status({ style: { marginBottom: 8 } }, () => `${item.val.steps.length} 个步骤`),
      Row(
        { style: { gap: 4 } },
        Button({ disabled: active, style: { ...small, flex: 1 }, onclick: () => replay(false) }, "复现"),
        Button({ disabled: active, style: { ...small, flex: 1 }, onclick: () => replay(true) }, "单步"),
        Button(
          {
            disabled: active,
            style: small,
            onclick: () => {
              name.val = item.val.name
              editing.val = true
              queueMicrotask(() => {
                if (!scope.disposed) input.focus()
              })
            }
          },
          "重命名"
        ),
        Button(
          {
            variant: "danger",
            style: small,
            onclick: () => sendCommand({ name: "deleteHistory", historyId: item.val.id })
          },
          "删除"
        )
      )
    )
    return {
      element,
      update: (next: RecorderHistoryItem) => {
        item.val = next
      }
    }
  }

  const syncHistory = (history: RecorderHistoryItem[]) => {
    const ids = new Set(history.map(({ id }) => id))
    for (const [id, item] of items)
      if (!ids.has(id)) {
        item.element.remove()
        items.delete(id)
      }
    let cursor = historyList.firstChild
    for (const item of history) {
      let entry = items.get(item.id)
      if (!entry) {
        entry = historyItem(item)
        items.set(item.id, entry)
      } else entry.update(item)
      if (entry.element !== cursor) historyList.insertBefore(entry.element, cursor)
      cursor = entry.element.nextSibling
    }
  }

  const taskControls = Surface(
    { style: () => ({ display: active() ? "block" : "none", background: theme.colors.surface, padding: 12 }) },
    Row(
      { style: { justifyContent: "space-between", marginBottom: 8 } },
      Text({ style: { fontSize: 12 } }, () => STATUS_TEXT[task()?.status ?? ""] ?? task()?.status ?? ""),
      Text(
        { style: { fontSize: 12, color: theme.colors.muted } },
        () => `步骤 ${task()?.currentStepIndex ?? 0}/${task()?.steps.length ?? 0}`
      )
    ),
    Status({ tone: "danger" }, () => task()?.error ?? ""),
    Row(
      {},
      Button(
        {
          style: { flex: 1 },
          onclick: () =>
            sendCommand(
              task()?.mode === "replay" && task()?.status === "paused" && task()?.isStepMode
                ? { name: "nextReplayStep" }
                : { name: "togglePause" }
            )
        },
        () =>
          task()?.status !== "paused"
            ? "暂停"
            : task()?.mode === "record"
              ? "继续录制"
              : task()?.isStepMode
                ? "下一步"
                : "继续"
      ),
      Button(
        {
          variant: "primary",
          style: { flex: 1 },
          onclick: () => sendCommand({ name: task()?.mode === "record" ? "stopRecord" : "stopReplay" })
        },
        () => (task()?.mode === "record" ? "停止录制" : "停止复现")
      )
    )
  )

  const element = Surface(
    {
      style: {
        position: "fixed",
        right: 16,
        top: 16,
        width: 300,
        maxHeight: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: theme.radius.panel,
        boxShadow: theme.shadow
      }
    },
    PanelHeader({ title: "步骤记录器", label: "recorder" }),
    Column(
      { style: { minHeight: 0, overflowY: "auto", padding: 16, flex: 1 } },
      taskControls,
      Button(
        {
          variant: "primary",
          style: () => ({ display: active() ? "none" : "flex", width: "100%" }),
          onclick: () => sendCommand({ name: "startRecord" })
        },
        "开始录制"
      ),
      Text(
        { style: () => ({ display: active() ? "block" : "none", color: theme.colors.subtle, fontSize: 12 }) },
        "有活动任务，历史操作需先停止。"
      ),
      Text(
        {
          style: () => ({
            display: state.val.history.length ? "block" : "none",
            color: theme.colors.primary,
            fontSize: 12,
            fontWeight: 600
          })
        },
        "历史记录"
      ),
      historyList
    )
  )

  const onMessage = (message: { target?: string; type?: string; state?: RecorderViewState }) => {
    if (message?.target !== "recorder-panel" || message.type !== "STATE" || !message.state || scope.disposed) return
    state.val = message.state
    syncHistory(message.state.history)
  }
  chrome.runtime.onMessage.addListener(onMessage)
  scope.add(() => chrome.runtime.onMessage.removeListener(onMessage))
  void chrome.runtime.sendMessage({ target: "recorder", type: "SUBSCRIBE" })
  return { element, dispose: scope.dispose }
}
