import van from "vanjs-core"
import {
  Button,
  Code,
  Collapsible,
  Column,
  IconButton,
  Input,
  PanelHeader,
  Row,
  Status,
  Surface,
  Text
} from "@/content-ui/components"
import { createScope, type View } from "@/content-ui/lifecycle"
import { theme, type Style } from "@/content-ui/theme"
import type {
  NetmonBody,
  NetmonCommand,
  NetmonFormEntry,
  NetmonHeader,
  NetmonRecord,
  NetmonRequestBody,
  NetmonTabState
} from "./types"
import { RECORD_LIMIT } from "./types"
import { curlCopyReason, queryParameters, requestCopyReason, toCurl, toFetch } from "./requests"

type SortDir = "asc" | "desc"
const MARGIN = 16
const colors = theme.colors
const smallButton: Style = { fontSize: 11, padding: "3px 8px" }
const recordKey = (record: NetmonRecord) => `${record.frameId}:${record.id}`

function sendCommand(command: NetmonCommand) {
  void chrome.runtime.sendMessage({ target: "netmon", type: "COMMAND", command })
}

function formatJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function pathOf(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function copyControl(scope: ReturnType<typeof createScope>) {
  const copied = van.state(false)
  const error = van.state("")
  let revision = 0
  const copy = async (text: string) => {
    const token = ++revision
    error.val = ""
    copied.val = false
    try {
      if (!navigator.clipboard) throw new Error("剪贴板不可用")
      await navigator.clipboard.writeText(text)
      if (scope.disposed || token !== revision) return false
      copied.val = true
      scope.timeout(() => {
        if (token === revision) copied.val = false
      }, 2000)
      return true
    } catch {
      if (!scope.disposed && token === revision) error.val = "复制失败，请检查页面安全上下文或剪贴板权限后重试"
      return false
    }
  }
  return { copied, error, copy }
}

function HeaderSection(title: string, headers: NetmonHeader[]) {
  if (!headers.length) return null
  return Collapsible(
    `${title} · ${headers.length}`,
    Column(
      { style: { maxHeight: 160, overflowY: "auto", gap: 4 } },
      ...headers.map((header) =>
        Row(
          { style: { alignItems: "flex-start", gap: 8 } },
          Text(
            {
              style: {
                maxWidth: "45%",
                minWidth: 0,
                wordBreak: "break-all",
                color: colors.muted,
                fontSize: 12,
                fontWeight: 500
              }
            },
            header.name || "（空名称）"
          ),
          Text(
            { style: { minWidth: 0, flex: 1, wordBreak: "break-all", whiteSpace: "pre-wrap", fontSize: 12 } },
            header.value || "（空值）"
          )
        )
      )
    )
  )
}

function BodySection(
  title: string,
  body: NetmonBody | null,
  note: string | null | undefined,
  scope: ReturnType<typeof createScope>
) {
  if (!body && !note) return null
  const mode = van.state<"json" | "raw">(body?.mode ?? "raw")
  const { copied, error, copy } = copyControl(scope)
  const modeStyle = (value: "json" | "raw"): Style => ({
    ...smallButton,
    background: mode.val === value ? colors.primary : colors.background,
    color: mode.val === value ? colors.background : colors.muted
  })
  return Collapsible(
    `${title}${body?.truncated ? " · 已截断" : !body ? " · 不可用" : ""}`,
    note ? Status({ tone: "warning" }, note) : null,
    body?.truncated ? Status({ tone: "warning" }, "仅展示已采集片段，不是完整正文") : null,
    body
      ? Column(
          {},
          Row(
            { style: { gap: 4 } },
            Button(
              {
                disabled: body.mode !== "json",
                style: () => modeStyle("json"),
                onclick: () => {
                  mode.val = "json"
                }
              },
              "JSON"
            ),
            Button(
              {
                style: () => modeStyle("raw"),
                onclick: () => {
                  mode.val = "raw"
                }
              },
              "RAW"
            ),
            IconButton(
              {
                style: { marginLeft: "auto", width: "auto", padding: "2px 6px", fontSize: 12 },
                title: body.truncated ? `复制${title}片段` : `复制${title}`,
                "aria-label": body.truncated ? `复制${title}片段` : `复制${title}`,
                onclick: () => {
                  void copy(body.text)
                }
              },
              () => (copied.val ? "已复制" : "复制")
            )
          ),
          Status({ tone: "danger" }, () => error.val),
          Code({ style: { maxHeight: 256 } }, () =>
            body.text === ""
              ? "（空正文）"
              : body.mode === "json" && mode.val === "json"
                ? formatJson(body.text)
                : body.text
          )
        )
      : null
  )
}

function RequestBodySection(body: NetmonRequestBody | null, scope: ReturnType<typeof createScope>): HTMLElement | null {
  if (!body) return Status({}, "请求体：无")
  if (body.kind === "unavailable") return BodySection("请求体", null, body.description, scope)
  if (body.kind === "text") return BodySection("请求体", body, body.note, scope)
  const fileCount = body.entries.filter((entry) => "file" in entry).length
  const fields = body.entries.map((entry: NetmonFormEntry) => ({
    name: entry.name,
    value:
      "file" in entry
        ? `文件：${entry.file.name || "未命名"} · ${entry.file.type || "未知类型"} · ${entry.file.size} 字节`
        : entry.value
  }))
  return Column(
    { style: { gap: 4 } },
    HeaderSection(body.kind === "urlencoded" ? "请求体 · URL-encoded" : "请求体 · FormData", fields),
    !fields.length ? Status({}, "请求体：空表单") : null,
    body.truncated ? Status({ tone: "warning" }, "表单已截断，仅展示已采集字段") : null,
    fileCount ? Status({ tone: "warning" }, "文件仅展示元数据，不含上传内容") : null,
    body.kind === "urlencoded"
      ? BodySection("请求体原文", { mode: "raw", text: body.text, truncated: body.truncated }, body.note, scope)
      : null
  )
}

function ErrorSection(record: NetmonRecord) {
  const outcome = record.outcome ?? (record.status >= 400 ? "http-error" : record.status === 0 ? "unknown" : "success")
  if (outcome === "success") return null
  const labels = {
    "http-error": "HTTP 错误",
    "network-error": "网络失败",
    aborted: "已取消",
    timeout: "超时",
    unknown: "未知／请求失败"
  }
  return Surface(
    { style: { background: colors.dangerSoft, padding: 8 } },
    Status({ tone: "danger" }, `${labels[outcome]}${outcome === "http-error" ? ` · ${record.status}` : ""}`),
    Status(
      { tone: "danger", style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } },
      record.error ? `${record.error.name}: ${record.error.message}` : "未提供错误详情"
    ),
    outcome === "unknown" ? Status({}, "浏览器未提供足够信息，无法确定具体原因。") : null
  )
}

function ActionBar(record: NetmonRecord, scope: ReturnType<typeof createScope>) {
  const { copied, error, copy } = copyControl(scope)
  const last = van.state("")
  const copying = van.state(false)
  const reason = requestCopyReason(record)
  const curlReason = curlCopyReason(record)
  const actions = [
    { label: "Copy Link", text: record.url, reason: undefined },
    { label: "Copy Curl", text: toCurl(record), reason: curlReason },
    { label: "Copy Fetch", text: toFetch(record), reason }
  ]
  return Column(
    { style: { gap: 4 } },
    Row(
      { style: { flexWrap: "wrap", gap: 4 } },
      ...actions.map((action) =>
        Button(
          {
            style: () => ({
              ...smallButton,
              color: copied.val && last.val === action.label ? colors.success : colors.text
            }),
            title: action.reason || action.label,
            disabled: () => action.text === null || copying.val,
            onclick: async () => {
              if (action.text === null) return
              copying.val = true
              if (await copy(action.text)) last.val = action.label
              if (!scope.disposed) copying.val = false
            }
          },
          () => (copied.val && last.val === action.label ? `${action.label} · 已复制` : action.label)
        )
      )
    ),
    Status(
      { tone: reason ? "warning" : "muted", style: { fontSize: 10, wordBreak: "break-word" } },
      reason || "复制仅包含可获取的请求信息，不含浏览器自动添加的全部请求头／Cookie。"
    ),
    !reason && curlReason ? Status({ tone: "warning", style: { fontSize: 10 } }, curlReason) : null,
    Status({ tone: "danger" }, () => error.val)
  )
}

function FramePath(url: string, scope: ReturnType<typeof createScope>) {
  const { copied, error, copy } = copyControl(scope)
  return Column(
    { style: { gap: 0, padding: "0 12px 4px" } },
    Button(
      {
        variant: "ghost",
        disabled: () => copied.val,
        title: url,
        style: () => ({
          display: "block",
          width: "100%",
          padding: 0,
          fontSize: 10,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: copied.val ? colors.success : colors.subtle
        }),
        onclick: () => {
          void copy(url)
        }
      },
      () => (copied.val ? "已复制" : pathOf(url))
    ),
    Status({ tone: "danger" }, () => error.val)
  )
}

function RecordItem(record: NetmonRecord): View {
  const scope = createScope()
  const open = van.state(false)
  // Build request details once, on first expansion, and retain their local state.
  const details = Column({
    style: () => ({
      display: open.val ? "flex" : "none",
      gap: 6,
      borderTop: `1px solid ${colors.border}`,
      padding: "8px 12px"
    })
  })
  let built = false
  const toggle = () => {
    if (!built) {
      van.add(
        details,
        ActionBar(record, scope),
        ErrorSection(record),
        HeaderSection("Query 参数", queryParameters(record.url)),
        HeaderSection("请求头", record.requestHeaders),
        RequestBodySection(record.requestBody, scope),
        HeaderSection("响应头", record.responseHeaders),
        BodySection("响应体", record.body, record.bodyNote, scope)
      )
      built = true
    }
    open.val = !open.val
  }
  const statusColor =
    record.status === 0 || record.status >= 500
      ? colors.danger
      : record.status < 300
        ? colors.success
        : record.status < 400
          ? colors.primary
          : colors.warning
  const duration =
    record.duration < 1000 ? `${Math.max(0, Math.round(record.duration))}ms` : `${(record.duration / 1000).toFixed(2)}s`
  const element = Surface(
    { style: { borderRadius: 12 } },
    Button(
      {
        variant: "ghost",
        "aria-expanded": () => open.val,
        onclick: toggle,
        style: { width: "100%", alignItems: "flex-start", justifyContent: "flex-start", padding: "8px 12px", gap: 8 }
      },
      Text(
        {
          style: {
            flexShrink: 0,
            color: statusColor,
            fontSize: 10,
            padding: "2px 6px",
            border: `1px solid ${colors.border}`,
            borderRadius: 6
          }
        },
        record.status === 0 ? "ERR" : String(record.status)
      ),
      Column(
        { style: { minWidth: 0, flex: 1, gap: 2 } },
        Text(
          {
            title: record.url,
            style: {
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              fontWeight: 600
            }
          },
          record.url
        ),
        Text(
          {
            style: {
              alignSelf: "flex-start",
              fontSize: 9,
              borderRadius: 4,
              background: colors.surface,
              color: colors.muted,
              padding: "1px 6px"
            }
          },
          record.method
        )
      ),
      Text({ style: { flexShrink: 0, fontSize: 10, color: colors.subtle } }, duration)
    ),
    record.frameUrl && record.frameId !== 0 ? FramePath(record.frameUrl, scope) : null,
    details
  )
  return { element, dispose: scope.dispose }
}

function sortRecords(records: NetmonRecord[], dir: SortDir) {
  return [...records].sort((a, b) => (dir === "asc" ? a.ts - b.ts : b.ts - a.ts))
}

function reconcile(parent: HTMLElement, children: HTMLElement[]) {
  const keep = new Set(children)
  for (const child of Array.from(parent.children)) if (!keep.has(child as HTMLElement)) child.remove()
  let cursor = parent.firstChild
  for (const child of children) {
    if (child !== cursor) parent.insertBefore(child, cursor)
    cursor = child.nextSibling
  }
}

function SortButton(dir: () => SortDir, toggle: () => void) {
  return Button(
    { style: smallButton, title: () => (dir() === "desc" ? "当前：最新在前" : "当前：最旧在前"), onclick: toggle },
    () => `时间 ${dir() === "desc" ? "↓" : "↑"}`
  )
}

export default function Panel(initial: NetmonTabState): View & { update: (state: NetmonTabState) => void } {
  const scope = createScope()
  const state = van.state(initial)
  const ruleInput = van.state("")
  const sortDir = van.state<SortDir>("asc")
  let pos = { x: window.innerWidth - 300 - MARGIN, y: MARGIN }
  const list = Column({ style: { minHeight: 0, flex: 1, overflowY: "auto", padding: 12 } })
  const rules = Row({ style: { flexWrap: "wrap", gap: 4 } })
  const recordViews = new Map<string, View>()
  const groupViews = new Map<string, { element: HTMLElement; update: (records: NetmonRecord[]) => void }>()
  let stopDrag = () => {}
  scope.add(() => stopDrag())
  scope.add(() => recordViews.forEach((view) => view.dispose()))

  const recordNodes = (records: NetmonRecord[], dir: SortDir) =>
    sortRecords(records, dir).map((record) => {
      const key = recordKey(record)
      let view = recordViews.get(key)
      if (!view) {
        view = RecordItem(record)
        recordViews.set(key, view)
      }
      return view.element
    })

  const frameGroup = (url: string, initialRecords: NetmonRecord[]) => {
    const open = van.state(true)
    const dir = van.state<SortDir>("asc")
    const count = van.state(initialRecords.length)
    let records = initialRecords
    const content = Column({ style: () => ({ display: open.val ? "flex" : "none", padding: 8 }) })
    const refresh = () => reconcile(content, recordNodes(records, dir.val))
    const element = Surface(
      { style: { overflow: "hidden", borderRadius: 12 } },
      Row(
        { style: { padding: "8px 12px", background: colors.surface } },
        Button(
          {
            variant: "ghost",
            "aria-expanded": () => open.val,
            style: { flex: 1, minWidth: 0, justifyContent: "flex-start", padding: 0 },
            onclick: () => {
              open.val = !open.val
            }
          },
          Text(
            { style: { flexShrink: 0, fontSize: 9, color: colors.primary } },
            initialRecords[0]?.frameId === 0 ? "TOP" : "IFRAME"
          ),
          Text(
            {
              style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }
            },
            hostOf(url)
          ),
          Text({ style: { fontSize: 10, color: colors.subtle } }, count),
          () => (open.val ? "▾" : "▸")
        ),
        SortButton(
          () => dir.val,
          () => {
            dir.val = dir.val === "asc" ? "desc" : "asc"
            refresh()
          }
        )
      ),
      Text(
        {
          title: url,
          style: {
            display: "block",
            padding: "0 8px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 10,
            color: colors.subtle
          }
        },
        pathOf(url)
      ),
      content
    )
    refresh()
    return {
      element,
      update: (next: NetmonRecord[]) => {
        records = next
        count.val = next.length
        refresh()
      }
    }
  }

  const empty = Status({ style: { textAlign: "center", padding: "24px 0" } }, "暂无匹配请求")
  const refreshRecords = () => {
    const scroll = list.scrollTop
    const following = sortDir.val === "desc" ? scroll < 4 : list.scrollHeight - scroll - list.clientHeight < 4
    const records = state.val.records
    const ids = new Set(records.map(recordKey))
    for (const [id, view] of recordViews)
      if (!ids.has(id)) {
        view.dispose()
        view.element.remove()
        recordViews.delete(id)
      }
    const hasFrames = records.some((record) => record.frameId !== 0)
    if (hasFrames) {
      const groups = new Map<string, NetmonRecord[]>()
      for (const record of records) {
        const key = record.frameUrl || hostOf(record.url)
        const entries = groups.get(key)
        if (entries) entries.push(record)
        else groups.set(key, [record])
      }
      for (const [url, group] of groupViews)
        if (!groups.has(url)) {
          group.element.remove()
          groupViews.delete(url)
        }
      const ordered = [...groups].sort((a, b) => {
        const diff = Math.min(...a[1].map((record) => record.ts)) - Math.min(...b[1].map((record) => record.ts))
        return sortDir.val === "asc" ? diff : -diff
      })
      reconcile(
        list,
        ordered.map(([url, entries]) => {
          let group = groupViews.get(url)
          if (!group) {
            group = frameGroup(url, entries)
            groupViews.set(url, group)
          } else group.update(entries)
          return group.element
        })
      )
    } else {
      groupViews.clear()
      reconcile(list, records.length ? recordNodes(records, sortDir.val) : [empty])
    }
    list.scrollTop = following ? (sortDir.val === "desc" ? 0 : list.scrollHeight) : scroll
  }

  const update = (next: NetmonTabState) => {
    if (scope.disposed) return
    state.val = next
    rules.replaceChildren(
      ...next.rules.map((rule) =>
        Button(
          {
            title: "点击移除",
            style: { ...smallButton, borderRadius: 999 },
            onclick: () => sendCommand({ name: "removeRule", id: rule.id })
          },
          Text(
            {
              style: { maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }
            },
            rule.pattern
          ),
          "×"
        )
      )
    )
    refreshRecords()
  }

  const onDragStart = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return
    stopDrag()
    const dx = event.clientX - pos.x,
      dy = event.clientY - pos.y
    const onMove = (next: MouseEvent) => {
      pos = {
        x: Math.min(Math.max(MARGIN, next.clientX - dx), Math.max(MARGIN, window.innerWidth - 300 - MARGIN)),
        y: Math.min(Math.max(MARGIN, next.clientY - dy), Math.max(MARGIN, window.innerHeight - 40 - MARGIN))
      }
      element.style.left = `${pos.x}px`
      element.style.top = `${pos.y}px`
    }
    stopDrag = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", stopDrag)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", stopDrag)
  }

  const addRule = () => {
    const pattern = ruleInput.val.trim()
    if (!pattern) return
    sendCommand({ name: "addRule", pattern })
    ruleInput.val = ""
  }
  const input = Input({
    "aria-label": "URL 片段",
    placeholder: "输入 URL 片段",
    value: () => ruleInput.val,
    style: { flex: 1, fontSize: 12 },
    oninput: (event: Event) => {
      ruleInput.val = (event.target as HTMLInputElement).value
    },
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter") addRule()
    }
  })
  const element = Surface(
    {
      "data-netmon-panel-root": "",
      style: {
        position: "fixed",
        top: pos.y,
        left: pos.x,
        width: 300,
        maxHeight: "calc(100vh - 32px)",
        minWidth: 260,
        minHeight: 200,
        maxWidth: "calc(100vw - 32px)",
        resize: "both",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: theme.radius.panel,
        boxShadow: theme.shadow
      }
    },
    PanelHeader({
      title: "网络监视器",
      label: "network",
      onclose: () => sendCommand({ name: "stop" }),
      class: "netmon-drag-header",
      style: { cursor: "move", touchAction: "none", userSelect: "none" },
      onmousedown: onDragStart
    }),
    Column(
      { style: { borderBottom: `1px solid ${colors.border}`, padding: 12 } },
      Row({}, input, Button({ variant: "primary", style: smallButton, onclick: addRule }, "添加")),
      rules,
      Row(
        { style: { justifyContent: "space-between" } },
        Status({ style: { fontSize: 11 } }, () =>
          state.val.rules.length === 0
            ? "添加一个 URL 片段才开始监视"
            : `命中 ${state.val.rules.length} 条规则，最新 ${RECORD_LIMIT} 条`
        ),
        SortButton(
          () => sortDir.val,
          () => {
            sortDir.val = sortDir.val === "asc" ? "desc" : "asc"
            refreshRecords()
            list.scrollTop = sortDir.val === "desc" ? 0 : list.scrollHeight
          }
        )
      )
    ),
    list
  )
  update(initial)
  return { element, update, dispose: scope.dispose }
}
