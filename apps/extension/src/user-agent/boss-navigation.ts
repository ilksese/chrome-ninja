const BOSS_HOST_RE = /(^|\.)zhipin\.com$|(^|\.)bosszhipin\.com$/
const RESTORE_DELAY_MS = 80

const lastBossUrlByTab = new Map<number, string>()
const restoreTimerByTab = new Map<number, ReturnType<typeof setTimeout>>()
let bossAntiDetectionEnabled = false

function isBossUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol.startsWith("http") && BOSS_HOST_RE.test(parsed.hostname)
  } catch {
    return false
  }
}

function isBlankUrl(url: string) {
  return url === "about:blank" || url === ""
}

function rememberBossUrl(tabId: number, url: string) {
  if (isBossUrl(url)) {
    lastBossUrlByTab.set(tabId, url)
  }
}

function restoreIfBlank(tabId: number, url: string) {
  if (!bossAntiDetectionEnabled) {
    return
  }

  if (!isBlankUrl(url)) {
    return
  }

  const lastBossUrl = lastBossUrlByTab.get(tabId)
  if (!lastBossUrl) {
    return
  }

  clearTimeout(restoreTimerByTab.get(tabId))
  restoreTimerByTab.set(
    tabId,
    setTimeout(() => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab || !isBlankUrl(tab.url || "")) {
          return
        }

        void chrome.tabs.update(tabId, { url: lastBossUrl })
      })
    }, RESTORE_DELAY_MS)
  )
}

function syncBossAntiDetectionEnabled(options?: unknown) {
  bossAntiDetectionEnabled = Boolean((options as { boss?: { enabled?: boolean } } | undefined)?.boss?.enabled)
}

async function loadBossAntiDetectionEnabled() {
  const { options } = await chrome.storage.local.get(["options"])
  syncBossAntiDetectionEnabled(options)
}

export function registerBossAntiDetectionBackground() {
  void loadBossAntiDetectionEnabled()

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.options) {
      syncBossAntiDetectionEnabled(changes.options.newValue)
    }
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab.url || ""
    rememberBossUrl(tabId, url)
    restoreIfBlank(tabId, url)
  })

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }

    rememberBossUrl(details.tabId, details.url || "")
    restoreIfBlank(details.tabId, details.url || "")
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    lastBossUrlByTab.delete(tabId)
    clearTimeout(restoreTimerByTab.get(tabId))
    restoreTimerByTab.delete(tabId)
  })
}
