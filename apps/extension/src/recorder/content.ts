import { mountContentUI } from "@/content-ui/lifecycle"
import { loadPanelLayout } from "@/content-ui/panel-geometry"
import { startCapture } from "./capture"
import { executeStep } from "./execute"
import { PANEL_HOST_ATTR } from "./messages"
import Panel from "./panel"

const isTopFrame = window === window.top

function isRecorderEnabled(options: unknown): boolean {
  return Boolean((options as { recorder?: { enabled?: unknown } } | undefined)?.recorder?.enabled)
}

async function main() {
  let stopCapture: (() => void) | null = null
  let panel: ReturnType<typeof mountContentUI> | null = null
  let recorderEnabled = false
  let disposed = false
  let mounting: Promise<void> | null = null

  const mountPanel = () => {
    if (!isTopFrame || panel || mounting || disposed) return
    mounting = loadPanelLayout("recorder")
      .then((layout) => {
        if (disposed || !recorderEnabled || panel) return
        const view = Panel(layout)
        try {
          panel = mountContentUI("chrome-ninja-recorder", PANEL_HOST_ATTR, view)
        } catch (error) {
          view.dispose()
          throw error
        }
      })
      .catch((error) => console.warn("步骤记录器面板挂载失败", error))
      .finally(() => {
        mounting = null
      })
  }

  const unmountPanel = () => {
    stopCapture?.()
    stopCapture = null

    if (!isTopFrame || !panel) return
    panel.dispose()
    panel = null
  }

  const syncRecorder = (enabled: boolean) => {
    if (disposed) return
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
    if (!event.persisted) {
      // 卸载后，等待中的布局或配置读取不得重新启动捕获与面板。
      disposed = true
      recorderEnabled = false
      unmountPanel()
    }
  })

  const { options } = await chrome.storage.local.get(["options"])
  syncRecorder(isRecorderEnabled(options))
}

void (async () => {
  await main()
})()
