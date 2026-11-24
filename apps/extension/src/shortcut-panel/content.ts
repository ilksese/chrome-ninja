import { theme } from "@/content-ui/theme"
import { pageUnavailableReason } from "@/cookie-editor/types"
import { mergeOptions } from "@/store/options"
import { getUserAgentOption } from "@/user-agent"
import {
  browserPresetStatus,
  bossStatus,
  HOME_FEATURE_ORDER_KEY,
  netmonStatus,
  orderShortcutActions,
  recorderStatus,
  translateStatus,
  userAgentStatus,
  type ShortcutAction
} from "./catalog"
import { ShortcutPanel, type ShortcutExecuteResult, type ShortcutRow } from "./panel"

const UI_TARGET = "shortcut-panel-ui"
const HOST_ATTR = "data-shortcut-panel"
const installedFlag = "__chromeNinjaShortcutPanel"

type PanelHandle = {
  dispose: () => void
  focus: () => void
  restore: () => void
}

let current: PanelHandle | undefined

function lockScroll() {
  const html = document.documentElement
  const body = document.body
  const previous = { html: html.style.overflow, body: body?.style.overflow ?? "" }
  html.style.overflow = "hidden"
  if (body) body.style.overflow = "hidden"
  return () => {
    html.style.overflow = previous.html
    if (body) body.style.overflow = previous.body
  }
}

async function loadRows(): Promise<ShortcutRow[]> {
  const stored = (await chrome.storage.local.get([HOME_FEATURE_ORDER_KEY, "options"]).catch(() => ({}))) as Record<string, unknown>
  const options = mergeOptions(stored.options as Parameters<typeof mergeOptions>[0])
  const ordered = orderShortcutActions(stored[HOME_FEATURE_ORDER_KEY])
  const rows = new Map<string, ShortcutRow>(ordered.map((action) => [action.id, { ...action, status: "", disabled: false }]))
  const assign = (id: ShortcutAction["id"], patch: Partial<ShortcutRow>) => {
    const row = rows.get(id)
    if (row) rows.set(id, { ...row, ...patch })
  }

  assign("boss", { status: bossStatus(options.boss.enabled) })
  assign("recorder", { status: recorderStatus(options.recorder.enabled) })
  assign("translate", { status: translateStatus(options.translate) })
  assign("user-agent", { status: userAgentStatus(getUserAgentOption(options.userAgent).label, false) })

  const cookieReason = pageUnavailableReason(location.href)
  assign("cookie-editor", { status: cookieReason || "在网页中查询、编辑与持续禁用 Cookie", disabled: Boolean(cookieReason) })

  await Promise.all([
    chrome.runtime
      .sendMessage({ target: "browser-preset", type: "status" })
      .then(async (status: { ok?: boolean; presetId?: string } | undefined) => {
        const presetId = status?.ok ? status.presetId : undefined
        if (!presetId) {
          assign("browser-presets", { status: browserPresetStatus() })
          return
        }
        const list = (await chrome.runtime.sendMessage({ target: "browser-preset", type: "list" })) as
          | { presets?: { id: string; name: string }[] }
          | undefined
        const name = list?.presets?.find((preset) => preset.id === presetId)?.name ?? presetId
        assign("user-agent", { status: userAgentStatus("", true), disabled: true })
        assign("browser-presets", { status: browserPresetStatus(name) })
      })
      .catch(() => assign("browser-presets", { status: "" })),
    chrome.runtime
      .sendMessage({ target: "netmon", type: "GET_STATE" })
      .then((response: { state?: { enabled?: boolean; rules?: unknown[] } } | undefined) => {
        assign("network-monitor", { status: netmonStatus(Boolean(response?.state?.enabled), response?.state?.rules?.length ?? 0) })
      })
      .catch(() => undefined)
  ])

  return ordered.map((action) => rows.get(action.id) ?? { ...action, status: "", disabled: false })
}

async function execute(row: ShortcutRow): Promise<ShortcutExecuteResult> {
  if (row.id === "network-monitor") {
    const toggled = (await chrome.runtime.sendMessage({
      target: "netmon",
      type: "COMMAND",
      command: { name: "toggle" }
    })) as { ok?: boolean; error?: string } | undefined
    if (toggled && toggled.ok === false) return { ok: false, error: toggled.error || "网络监视开关失败" }
    const state = (await chrome.runtime.sendMessage({ target: "netmon", type: "GET_STATE" })) as
      | { state?: { enabled?: boolean; rules?: unknown[] } }
      | undefined
    return { ok: true, toast: netmonStatus(Boolean(state?.state?.enabled), state?.state?.rules?.length ?? 0) }
  }
  const response = (await chrome.runtime.sendMessage({
    target: "shortcut-panel",
    type: "execute",
    action: row.id
  })) as { ok?: boolean; error?: string; status?: string } | undefined
  if (!response?.ok) return { ok: false, error: response?.error || "执行失败" }
  if (row.kind === "toggle") return { ok: true, toast: response.status }
  return { ok: true }
}

function openPanel() {
  if (current) {
    current.focus()
    return
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const unlock = lockScroll()
  const host = document.createElement("div")
  host.setAttribute(HOST_ATTR, "")
  host.setAttribute("data-chrome-ninja-ui", "")
  host.style.cssText = `all:initial;position:fixed;top:0;right:0;bottom:0;left:0;z-index:${theme.layer};pointer-events:none;color-scheme:light;font-family:${theme.font}`
  // 只有快捷面板使用关闭的 Shadow DOM，避免宿主样式改掉输入框和列表。
  const shadow = host.attachShadow({ mode: "closed" })
  const panel = ShortcutPanel({
    loadRows,
    execute,
    onDismiss: () => closePanel(true),
    onSuccess: () => closePanel(false)
  })
  shadow.append(panel.element)
  const stopWheel = (event: WheelEvent) => event.stopPropagation()
  const onPointerDown = (event: PointerEvent) => {
    if (event.composedPath().includes(host)) return
    closePanel(false)
  }
  host.addEventListener("wheel", stopWheel)
  document.addEventListener("pointerdown", onPointerDown, true)
  document.documentElement.append(host)
  panel.focus()
  current = {
    dispose: () => {
      panel.dispose()
      host.removeEventListener("wheel", stopWheel)
      document.removeEventListener("pointerdown", onPointerDown, true)
      host.remove()
      unlock()
    },
    focus: () => panel.focus(),
    restore: () => {
      if (previous?.isConnected) previous.focus()
    }
  }
}

function closePanel(restoreFocus: boolean) {
  const handle = current
  current = undefined
  handle?.dispose()
  // 成功打开其他界面后不抢回焦点，否则会把弹窗或 Cookie 编辑器立刻关掉或盖住。
  if (restoreFocus) handle?.restore()
}

function install() {
  chrome.runtime.onMessage.addListener((message: { target?: string; type?: string }, _sender, respond) => {
    if (message?.target !== UI_TARGET) return false
    if (message.type === "ping") {
      respond({ ok: true, open: Boolean(current) })
      return false
    }
    if (message.type === "open") {
      openPanel()
      respond({ ok: true, open: true })
      return false
    }
    if (message.type === "close") {
      closePanel(true)
      respond({ ok: true, open: false })
      return false
    }
    if (message.type === "toggle") {
      if (current) closePanel(true)
      else openPanel()
      respond({ ok: true, open: Boolean(current) })
      return false
    }
    return false
  })
  window.addEventListener("pagehide", () => closePanel(false))
}

const globalFlag = globalThis as typeof globalThis & { [installedFlag]?: boolean }
if (!globalFlag[installedFlag]) {
  globalFlag[installedFlag] = true
  install()
}
