import { ninjaLog } from "@chrome-ninja/utils"
import { connectHmrBackground } from "@chrome-ninja/hmr/client"
import { mergeOptions } from "@/store/options"
import type { Options } from "@/types"
import { applyUserAgentRule } from "@/user-agent"
import { registerBossAntiDetectionBackground } from "@/user-agent/boss-navigation"
import { registerLoginStateExportBackground } from "@/login-state/background"
import { registerQrBackground } from "@/qr/background"
import { registerRecorderBackground } from "@/recorder/background"
import { registerTranslateBackground } from "@/translate/background"

ninjaLog("background runing")
registerBossAntiDetectionBackground()
registerRecorderBackground()
registerLoginStateExportBackground()
registerQrBackground()
registerTranslateBackground()
connectHmrBackground()

chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case chrome.runtime.OnInstalledReason.INSTALL:
    case chrome.runtime.OnInstalledReason.UPDATE: {
      chrome.storage.local.get(["options"], ({ options }) => {
        const merged = mergeOptions(options)
        chrome.storage.local.set({ options: merged }, () => {
          ninjaLog("初始化设置成功😄")
          void syncUserAgentRule(merged)
        })
      })
    }
  }
})

chrome.runtime.onMessage.addListener(handleMessages)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.options?.newValue) {
    void syncUserAgentRule(changes.options.newValue)
  }
})
void syncUserAgentRule()

async function syncUserAgentRule(options?: Partial<Options>) {
  const nextOptions = options ? mergeOptions(options) : await getStoredOptions()
  try {
    await applyUserAgentRule(nextOptions.userAgent)
  } catch (error) {
    console.error("Failed to apply User-Agent rule", error)
  }
}

async function getStoredOptions() {
  return await chrome.storage.local.get(["options"]).then(({ options }) => mergeOptions(options))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMessages(message: any) {
  // Return early if this message isn't meant for the background script
  if (message.target !== "background") {
    return false
  }

  // Dispatch the message to an appropriate handler.
  switch (message.type) {
    case "executeScript":
      chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true }).then(([tab]) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          files: message.files,
          func: message.func
        })
      })
      break
    default:
      console.warn(`Unexpected message type received: '${message.type}'.`)
      return false
  }

  return false
}
