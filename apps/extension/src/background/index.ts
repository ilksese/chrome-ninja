import { ninjaLog } from "@chrome-ninja/utils"
import { connectDevBridgeBackground, DEV_BRIDGE_ENABLED } from "@chrome-ninja/dev-bridge/client"
import { mergeOptions } from "@/store/options"
import type { Options } from "@/types"
import { applyUserAgentRule, switchUserAgent, USER_AGENT_OPTIONS, USER_AGENT_RULE_ID } from "@/user-agent"
import { registerBossAntiDetectionBackground } from "@/user-agent/boss-navigation"
import { registerLoginStateExportBackground } from "@/login-state/background"
import { registerQrBackground } from "@/qr/background"
import { registerRecorderBackground } from "@/recorder/background"
import { registerTranslateBackground } from "@/translate/background"
import { registerVideoSnifferBackground } from "@/video-sniffer/background"
import { registerNetmonBackground } from "@/network-monitor/background"
import { registerCookieEditorBackground } from "@/cookie-editor/background"
import { registerBrowserPresetBackground } from "@/browser-preset/background"
import { registerPageControlBackground } from "@/page-control/background"

ninjaLog("background runing")
const openCookieEditor = registerCookieEditorBackground()
registerBrowserPresetBackground()
registerPageControlBackground()
registerBossAntiDetectionBackground()
registerRecorderBackground()
registerLoginStateExportBackground()
registerQrBackground(openCookieEditor)
registerTranslateBackground()
registerVideoSnifferBackground()
registerNetmonBackground()
void chrome.action.setBadgeText({ text: DEV_BRIDGE_ENABLED ? "dev" : "" }).catch((error) => {
  console.warn("Failed to update toolbar badge", error)
})
connectDevBridgeBackground()

chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case chrome.runtime.OnInstalledReason.INSTALL:
    case chrome.runtime.OnInstalledReason.UPDATE: {
      void chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [USER_AGENT_RULE_ID] }).catch(console.error)
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
function handleMessages(message: any, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void) {
  // Return early if this message isn't meant for the background script
  if (message.target !== "background") {
    return false
  }

  // Dispatch the message to an appropriate handler.
  switch (message.type) {
    case "set-user-agent": {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false
      const option = USER_AGENT_OPTIONS.find((option) => option.value === message.userAgent)
      if (!option || typeof message.reload !== "boolean") return false
      void chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true })
        .then(([tab]) => switchUserAgent(option.value, tab?.id, message.reload))
        .then(
          () => respond({ ok: true }),
          (error: unknown) => respond({ ok: false, error: error instanceof Error ? error.message : "User-Agent 应用失败" })
        )
      return true
    }
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
