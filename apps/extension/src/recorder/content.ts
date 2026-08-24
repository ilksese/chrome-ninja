import { createElement } from "preact"
import { render } from "preact"
import "./panel.css"
import Panel from "./panel"
import { startCapture } from "./capture"
import { executeStep } from "./execute"
import { PANEL_HOST_ATTR, PANEL_HOST_SELECTOR } from "./messages"

const isTopFrame = window === window.top

function isRecorderEnabled(options: unknown): boolean {
  return Boolean((options as { recorder?: { enabled?: unknown } } | undefined)?.recorder?.enabled)
}

async function main() {
  let stopCapture: (() => void) | null = null
  let panelHost: HTMLElement | null = null
  let ownsPanelHost = false
  let recorderEnabled = false

  const mountPanel = () => {
    if (!isTopFrame || panelHost) return

    let host = document.querySelector<HTMLElement>(PANEL_HOST_SELECTOR)
    if (!host) {
      host = document.createElement("div")
      host.setAttribute(PANEL_HOST_ATTR, "")
      document.body.appendChild(host)
      ownsPanelHost = true
    }
    panelHost = host
    render(createElement(Panel, null), host)
  }

  const unmountPanel = () => {
    stopCapture?.()
    stopCapture = null

    if (!isTopFrame || !panelHost) return
    render(null, panelHost)
    if (ownsPanelHost) panelHost.remove()
    panelHost = null
    ownsPanelHost = false
  }

  const syncRecorder = (enabled: boolean) => {
    recorderEnabled = enabled
    if (!enabled) {
      unmountPanel()
      return
    }

    if (!stopCapture) {
      stopCapture = startCapture((event) => {
        chrome.runtime.sendMessage({ target: "recorder", type: "EVENT", event })
      })
    }
    mountPanel()
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "recorder-frame") return false

    if (message.type === "SYNC") {
      void chrome.storage.local
        .get(["options"])
        .then(({ options }) => {
          syncRecorder(isRecorderEnabled(options))
          sendResponse({ ok: true })
        })
        .catch(() => sendResponse({ ok: false, error: "读取录制配置失败" }))
      return true
    }

    if (message.type === "EXECUTE") {
      if (!recorderEnabled) {
        sendResponse({ ok: false, error: "步骤录制已关闭" })
        return false
      }
      executeStep(message.step).then(sendResponse)
      return true
    }
    return false
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.options) return
    syncRecorder(isRecorderEnabled(changes.options.newValue))
  })
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) unmountPanel()
  })

  const { options } = await chrome.storage.local.get(["options"])
  syncRecorder(isRecorderEnabled(options))
}

void (async () => {
  await main()
})()
