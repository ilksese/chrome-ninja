import { ninjaLog } from "@chrome-ninja/utils"
import { DEFAULT_OPTIONS, mergeOptions } from "@/store/options"
import type { Options } from "@/types"
import { applyUserAgentRule } from "@/user-agent"

ninjaLog("background runing")

type StorageCache = {
  options: Options
}

const storageCache: StorageCache = {
  options: DEFAULT_OPTIONS
}

chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case chrome.runtime.OnInstalledReason.INSTALL:
    case chrome.runtime.OnInstalledReason.UPDATE: {
      chrome.storage.local.set(storageCache, () => {
        ninjaLog("初始化设置成功😄")
        void syncUserAgentRule(storageCache.options)
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
async function handleMessages(message: any) {
  // Return early if this message isn't meant for the background script
  if (message.target !== "background") {
    return
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
  }
}
