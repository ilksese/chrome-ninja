import type { View } from "@/content-ui/lifecycle"
import { showToast } from "@/content-ui/toast"
import { css, theme } from "@/content-ui/theme"
import van from "vanjs-core"
import { nextSelectedId, orderShortcutActions, type ShortcutAction } from "./catalog"
import { filterShortcutActions } from "./search"

export type ShortcutRow = ShortcutAction & {
  status: string
  disabled: boolean
}

export type ShortcutExecuteResult = {
  ok: boolean
  error?: string
  toast?: string
}

const colors = theme.colors
const EMPTY_TEXT = "没有匹配的快捷动作"
const MARK = css({ background: "transparent", color: colors.primary, fontWeight: 700 })

function titleNodes(title: string, indexes: readonly number[]) {
  if (indexes.length === 0) return [title]
  const marked = new Set(indexes)
  const nodes: Array<string | HTMLElement> = []
  let index = 0
  while (index < title.length) {
    const hit = marked.has(index)
    let end = index + 1
    while (end < title.length && marked.has(end) === hit) end += 1
    const text = title.slice(index, end)
    nodes.push(hit ? van.tags.mark({ style: MARK }, text) : text)
    index = end
  }
  return nodes
}

/**
 * 快捷面板：盖在当前网页上的搜索列表，供人执行已有扩展动作。
 * 调用方负责把它放进关闭的 Shadow DOM，并在关闭时恢复页面焦点。
 */
export function ShortcutPanel(options: {
  loadRows: () => Promise<ShortcutRow[]>
  execute: (row: ShortcutRow) => Promise<ShortcutExecuteResult>
  onDismiss: () => void
  onSuccess: () => void
}): View & { focus: () => void } {
  const rows = van.state<ShortcutRow[]>(orderShortcutActions(null).map((action) => ({ ...action, status: "", disabled: false })))
  const query = van.state("")
  const selectedId = van.state<string | undefined>(rows.val[0]?.id)
  const errors = van.state<Record<string, string>>({})
  let disposed = false
  let running = false
  let composing = false

  const visible = () => filterShortcutActions(rows.val, query.val)
  let rankedFor = query.val
  van.derive(() => {
    const needle = query.val
    // 查询变了就选最匹配的一项；状态刷新不改当前选中。
    const selected = needle === rankedFor ? selectedId.val : undefined
    rankedFor = needle
    const next = nextSelectedId(visible().map((row) => row.id), selected)
    if (next !== selectedId.val) selectedId.val = next
  })

  const input = van.tags.input({
    type: "text",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-controls": "shortcut-panel-list",
    "aria-label": "搜索快捷动作",
    placeholder: "搜索快捷动作",
    style: css({
      appearance: "none",
      width: "100%",
      boxSizing: "border-box",
      border: "none",
      borderBottom: `1px solid ${colors.border}`,
      background: colors.background,
      color: colors.text,
      fontFamily: theme.font,
      fontSize: theme.fontSize.normal,
      lineHeight: 1.5,
      padding: "14px 16px",
      outline: "none"
    }),
    oninput: (event: Event) => {
      query.val = (event.currentTarget as HTMLInputElement).value
    },
    oncompositionstart: () => {
      composing = true
    },
    oncompositionend: () => {
      composing = false
    }
  })

  const list = van.tags.ul({
    id: "shortcut-panel-list",
    role: "listbox",
    "aria-label": "快捷动作",
    style: css({
      listStyle: "none",
      margin: 0,
      padding: "6px",
      boxSizing: "border-box",
      maxHeight: 474,
      overflowY: "auto",
      minHeight: 0
    })
  })

  const empty = van.tags.p(
    {
      style: css({
        margin: 0,
        padding: "20px 16px",
        color: colors.muted,
        fontSize: theme.fontSize.small,
        textAlign: "center"
      })
    },
    EMPTY_TEXT
  )

  const renderRows = () => {
    const items = visible()
    const selected = selectedId.val
    const rowErrors = errors.val
    list.replaceChildren(
      ...items.map((row) => {
        const active = row.id === selected
        const lines = row.disabled ? [row.status] : [row.detail, row.status].filter((line, index, all) => line && all.indexOf(line) === index)
        const error = rowErrors[row.id]
        return van.tags.li(
          {
            id: `shortcut-action-${row.id}`,
            role: "option",
            "aria-selected": active ? "true" : "false",
            "aria-disabled": row.disabled ? "true" : "false",
            style: css({
              borderRadius: theme.radius.normal,
              background: active ? colors.primarySoft : "transparent",
              cursor: row.disabled ? "not-allowed" : "pointer",
              padding: "8px 10px"
            }),
            onmouseenter: () => {
              selectedId.val = row.id
            },
            onclick: (event: MouseEvent) => {
              event.stopPropagation()
              void run(row)
            }
          },
          van.tags.div(
            { style: css({ fontWeight: 600, color: colors.text, fontSize: theme.fontSize.normal }) },
            ...titleNodes(row.title, row.titleIndexes)
          ),
          ...lines.map((line) =>
            van.tags.div({ style: css({ color: colors.muted, fontSize: theme.fontSize.small, marginTop: 2 }) }, line)
          ),
          error
            ? van.tags.div(
                { role: "alert", style: css({ color: colors.danger, fontSize: theme.fontSize.small, marginTop: 2 }) },
                error
              )
            : null
        )
      })
    )
    list.hidden = items.length === 0
    empty.hidden = items.length > 0
    input.setAttribute("aria-activedescendant", selected ? `shortcut-action-${selected}` : "")
    const current = list.querySelector<HTMLElement>('[aria-selected="true"]')
    current?.scrollIntoView({ block: "nearest" })
  }
  van.derive(renderRows)

  const run = async (row: ShortcutRow | undefined) => {
    if (!row || row.disabled || running || disposed) return
    running = true
    errors.val = { ...errors.val, [row.id]: "" }
    try {
      const result = await options.execute(row)
      if (disposed) return
      if (!result.ok) {
        errors.val = { ...errors.val, [row.id]: result.error || "执行失败" }
        return
      }
      if (result.toast) showToast(result.toast)
      options.onSuccess()
    } catch (error) {
      if (disposed) return
      errors.val = { ...errors.val, [row.id]: error instanceof Error ? error.message : "执行失败" }
    } finally {
      running = false
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      input.focus()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      // 组字中的 Esc 只取消输入法，不关闭面板。
      if (event.isComposing || composing) return
      options.onDismiss()
      return
    }
    const items = visible()
    const index = items.findIndex((row) => row.id === selectedId.val)
    if (event.key === "ArrowDown") {
      event.preventDefault()
      event.stopPropagation()
      if (index < items.length - 1) selectedId.val = items[index + 1]?.id
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      event.stopPropagation()
      if (index > 0) selectedId.val = items[index - 1]?.id
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      if (event.isComposing || composing) return
      void run(items.find((row) => row.id === selectedId.val))
    }
  }

  const panel = van.tags.div(
    {
      role: "dialog",
      "aria-modal": "false",
      "aria-label": "快捷面板",
      style: css({
        display: "flex",
        flexDirection: "column",
        width: "min(750px, calc(100% - 32px))",
        margin: "12vh auto 0",
        pointerEvents: "auto",
        background: colors.background,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: theme.radius.panel,
        boxShadow: theme.shadow,
        overflow: "hidden",
        fontFamily: theme.font
      })
    },
    input,
    list,
    empty
  )
  panel.addEventListener("keydown", onKey, true)
  list.addEventListener("wheel", (event) => event.stopPropagation())

  void options.loadRows().then((loaded) => {
    if (disposed) return
    rows.val = loaded
  }).catch(() => {
    // 状态读不到时保留已显示的标题，次要状态留空。
  })

  return {
    element: panel,
    focus: () => input.focus(),
    dispose: () => {
      disposed = true
      panel.removeEventListener("keydown", onKey, true)
    }
  }
}
