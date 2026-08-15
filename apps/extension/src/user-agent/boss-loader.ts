type StoredOptions = {
  boss?: {
    enabled?: boolean
  }
}

function isBossEnabled(options?: StoredOptions) {
  return Boolean(options?.boss?.enabled)
}

function injectBossAntiDetection() {
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL("src/user-agent/boss-anti-detection.js")
  script.onload = () => script.remove()
  ;(document.documentElement || document.head).append(script)
}

chrome.storage.local.get(["options"], ({ options }) => {
  if (isBossEnabled(options)) {
    injectBossAntiDetection()
  }
})
