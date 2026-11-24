import contentScript from "./content.ts?script"
import { bossStatus, isPopupIntentAction, isShortcutActionId, recorderStatus, type PopupIntentAction, type ShortcutActionId } from "./catalog"
import type { ShortcutPopupIntent } from "./popup-bridge"
import { mergeOptions } from "@/store/options"

const COMMAND = "open-shortcut-panel"
const POPUP_PORT = "shortcut-panel-popup"
const UI_TARGET = "shortcut-panel-ui"
const INTENT_TIMEOUT_MS = 3000

type InjectGate = { cancelled: boolean }

type PendingIntent = {
  intent: ShortcutPopupIntent
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const gates = new Map<number, InjectGate>()
const popupPorts = new Set<chrome.runtime.Port>()
let pendingIntent: PendingIntent | undefined

function intentError(error: unknown) {
  return error instanceof Error ? error.message : "弹窗没有进入该功能"
}

function clearPendingIntent() {
  if (!pendingIntent) return
  clearTimeout(pendingIntent.timer)
  pendingIntent = undefined
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab?.id === undefined || tab.id < 0) return undefined
  return tab
}

function sendUi(tabId: number, type: "ping" | "open" | "close" | "toggle") {
  return chrome.tabs.sendMessage(tabId, { target: UI_TARGET, type }).catch(() => undefined) as Promise<
    { ok?: boolean; open?: boolean } | undefined
  >
}

/**
 * 注入完成前再按一次必须保持关闭。
 * 取消标记在任何 await 之前写上，避免注入结束后又把面板打开。
 */
async function togglePanel() {
  const tab = await activeTab()
  if (!tab?.id) return
  const tabId = tab.id
  const existing = gates.get(tabId)
  if (existing) {
    existing.cancelled = true
    void sendUi(tabId, "close")
    return
  }
  const gate: InjectGate = { cancelled: false }
  gates.set(tabId, gate)
  try {
    const ping = await sendUi(tabId, "ping")
    if (gate.cancelled) {
      await sendUi(tabId, "close")
      return
    }
    if (ping?.ok) {
      await sendUi(tabId, "toggle")
      return
    }
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [contentScript] })
    if (gate.cancelled) {
      await sendUi(tabId, "close")
      return
    }
    await sendUi(tabId, "open")
  } catch {
    // 受限页面和注入失败保持静默，不发系统通知。
  } finally {
    gates.delete(tabId)
  }
}

async function toggleStoredOption(key: "boss" | "recorder") {
  const stored = await chrome.storage.local.get("options")
  const current = mergeOptions(stored.options)
  const enabled = !current[key].enabled
  await chrome.storage.local.set({ options: { ...current, [key]: { ...current[key], enabled } } })
  return key === "boss" ? bossStatus(enabled) : recorderStatus(enabled)
}

async function focusWindow(windowId: number) {
  const browserWindow = await chrome.windows.get(windowId)
  const update: chrome.windows.UpdateInfo = { focused: true }
  if (browserWindow.state === "minimized") update.state = "normal"
  await chrome.windows.update(windowId, update)
}

async function openToolbarPopup(windowId: number) {
  if (popupPorts.size > 0) return
  await focusWindow(windowId)
  try {
    await chrome.action.openPopup({ windowId })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("inactive window")) throw error
    await focusWindow(windowId)
    await chrome.action.openPopup({ windowId })
  }
}

function notifyPopup() {
  for (const port of popupPorts) port.postMessage({ type: "intent-ready" })
}

function deliverIntent(intent: ShortcutPopupIntent, windowId: number) {
  clearPendingIntent()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingIntent?.intent.id !== intent.id) return
      pendingIntent = undefined
      reject(new Error("弹窗没有进入该功能"))
    }, INTENT_TIMEOUT_MS)
    pendingIntent = { intent, resolve, reject, timer }
    void openToolbarPopup(windowId)
      .then(() => {
        if (pendingIntent?.intent.id === intent.id) notifyPopup()
      })
      .catch((error: unknown) => {
        if (pendingIntent?.intent.id !== intent.id) return
        clearPendingIntent()
        reject(error instanceof Error ? error : new Error("弹窗没有打开"))
      })
  })
}

function consumeIntent() {
  const current = pendingIntent
  if (!current) return undefined
  clearPendingIntent()
  current.resolve()
  return current.intent
}

async function executeAction(action: ShortcutActionId, tabId: number, openCookieEditor: (tabId: number) => Promise<unknown>) {
  if (action === "boss" || action === "recorder") return { ok: true, status: await toggleStoredOption(action) }
  if (action === "cookie-editor") {
    await openCookieEditor(tabId)
    return { ok: true }
  }
  if (!isPopupIntentAction(action)) return { ok: false, error: "未知快捷动作" }
  const tab = await chrome.tabs.get(tabId)
  if (tab.windowId === undefined) return { ok: false, error: "弹窗没有打开" }
  const intent: ShortcutPopupIntent = {
    id: crypto.randomUUID(),
    action: action as PopupIntentAction,
    ...(action === "qr" ? { text: tab.url ?? "" } : {})
  }
  try {
    await deliverIntent(intent, tab.windowId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: intentError(error) }
  }
}

/** 注册快捷键、按需注入和弹窗一次性意图。 */
export function registerShortcutPanelBackground(openCookieEditor: (tabId: number) => Promise<unknown>) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === COMMAND) void togglePanel()
  })

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT) return
    popupPorts.add(port)
    port.onDisconnect.addListener(() => popupPorts.delete(port))
  })

  chrome.runtime.onMessage.addListener((message: { target?: string; type?: string; action?: string; tabId?: number }, sender, respond) => {
    if (message?.target !== "shortcut-panel") return false
    if (message.type === "consume-intent") {
      respond({ ok: true, intent: consumeIntent() ?? null })
      return false
    }
    if (message.type !== "execute" || !message.action || !isShortcutActionId(message.action)) return false
    const tabId = sender.tab?.id ?? message.tabId
    if (tabId === undefined) {
      respond({ ok: false, error: "找不到当前标签页" })
      return false
    }
    void executeAction(message.action, tabId, openCookieEditor).then(
      (result) => respond(result),
      (error: unknown) => respond({ ok: false, error: intentError(error) })
    )
    return true
  })
}
