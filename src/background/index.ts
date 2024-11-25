import { ninjaLog } from "@lib/utils"
import { DEFAULT_OPTIONS } from "@/constant"

ninjaLog("background runing")

type StorageCache = {
  options: ChromeNinja.Options
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
      })
    }
  }
})

chrome.runtime.onMessage.addListener(handleMessages)

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
