import { mountContentUI } from "../content-ui/lifecycle"
import { loadPanelLayout } from "../content-ui/panel-geometry"
import { CookiePanel } from "./panel"

let active: { dispose: () => void; focus: () => void } | undefined
let opening: Promise<void> | undefined

async function openPanel() {
  if (window.top !== window) return
  if (opening) {
    await opening
    active?.focus()
    return
  }
  if (active) {
    active.focus()
    return
  }
  opening = (async () => {
    let hidden = false
    const close = () => {
      active?.dispose()
      active = undefined
    }
    const unload = () => {
      hidden = true
      close()
    }
    window.addEventListener("pagehide", unload)
    try {
      const layout = await loadPanelLayout("cookie-editor")
      if (hidden) throw new Error("页面已离开，面板打开已取消")
      const panel = CookiePanel(close, layout)
      let mounted: ReturnType<typeof mountContentUI>
      try {
        mounted = mountContentUI("chrome-ninja-cookie-editor", "data-cookie-editor", panel)
      } catch (reason) {
        panel.dispose()
        throw reason
      }
      active = {
        focus: panel.focus,
        dispose: () => {
          window.removeEventListener("pagehide", unload)
          mounted.dispose()
        }
      }
      panel.focus()
    } catch (reason) {
      window.removeEventListener("pagehide", unload)
      throw reason
    }
  })().finally(() => {
    opening = undefined
  })
  await opening
}

export async function onExecute() {
  if (window.top !== window) return
  let error: string | undefined
  try {
    await openPanel()
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "面板打开失败"
  }
  void chrome.runtime
    .sendMessage({ target: "cookie-editor-opened", ok: !error, ...(error ? { error } : {}) })
    .catch(() => {})
}
