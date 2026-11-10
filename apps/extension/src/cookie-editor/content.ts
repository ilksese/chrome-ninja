import { mountContentUI } from "../content-ui/lifecycle"
import { CookiePanel } from "./panel"

let active: { dispose: () => void; focus: () => void } | undefined

function openPanel() {
  if (window.top !== window) return
  if (active) {
    active.focus()
    return
  }
  const close = () => {
    active?.dispose()
    active = undefined
  }
  const panel = CookiePanel(close)
  const mounted = mountContentUI("chrome-ninja-cookie-editor", "data-cookie-editor", panel)
  const unload = () => close()
  window.addEventListener("pagehide", unload)
  active = {
    focus: panel.focus,
    dispose: () => {
      window.removeEventListener("pagehide", unload)
      mounted.dispose()
    }
  }
  panel.focus()
}

export function onExecute() {
  if (window.top !== window) return
  let error: string | undefined
  try {
    openPanel()
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "面板打开失败"
  }
  void chrome.runtime
    .sendMessage({ target: "cookie-editor-opened", ok: !error, ...(error ? { error } : {}) })
    .catch(() => {})
}
