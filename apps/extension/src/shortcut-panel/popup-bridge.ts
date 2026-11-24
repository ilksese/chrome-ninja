import type { PopupIntentAction } from "./catalog"

export type ShortcutPopupIntent = {
  id: string
  action: PopupIntentAction
  text?: string
}

type Listener = (intent: ShortcutPopupIntent) => void

const listeners = new Set<Listener>()
let staged: ShortcutPopupIntent | undefined

export function isRouteIntent(action: PopupIntentAction) {
  return action === "video-sniffer" || action === "browser-presets"
}

/** 对话框意图先暂存，首页挂载或已打开时取用。路由意图不暂存。 */
export function stageShortcutIntent(intent: ShortcutPopupIntent) {
  if (isRouteIntent(intent.action)) return
  staged = intent
  listeners.forEach((listener) => listener(intent))
}

export function takeStagedShortcutIntent(): ShortcutPopupIntent | undefined {
  const intent = staged
  staged = undefined
  return intent
}

export function subscribeShortcutIntent(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function connectShortcutPanelPopup(apply: {
  route: (intent: ShortcutPopupIntent) => void
  dialog: (intent: ShortcutPopupIntent) => void
}) {
  const port = chrome.runtime.connect({ name: "shortcut-panel-popup" })
  const consume = () => {
    void chrome.runtime.sendMessage({ target: "shortcut-panel", type: "consume-intent" }).then((response: { intent?: ShortcutPopupIntent | null }) => {
      const intent = response?.intent
      if (!intent) return
      if (isRouteIntent(intent.action)) apply.route(intent)
      else apply.dialog(intent)
    })
  }
  port.onMessage.addListener((message: { type?: string }) => {
    if (message?.type === "intent-ready") consume()
  })
  consume()
  return () => port.disconnect()
}
