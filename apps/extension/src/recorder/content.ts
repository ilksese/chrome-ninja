import { mountContentUI } from "@/content-ui/lifecycle"
import Panel from "./panel"
import { startCapture } from "./capture"
import { executeStep } from "./execute"
import { PANEL_HOST_ATTR } from "./messages"

const isTopFrame = window === window.top

function isRecorderEnabled(options: unknown): boolean {
  return Boolean((options as { recorder?: { enabled?: unknown } } | undefined)?.recorder?.enabled)
}

async function main() {
  let stopCapture: (() => void) | null = null
  let panel: ReturnType<typeof mountContentUI> | null = null
  let recorderEnabled = false

  const mountPanel = () => {
    if (!isTopFrame || panel) return

    panel = mountContentUI("chrome-ninja-recorder", PANEL_HOST_ATTR, Panel())
  }

  const unmountPanel = () => {
    stopCapture?.()
    stopCapture = null

    if (!isTopFrame || !panel) return
    panel.dispose()
    panel = null
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
