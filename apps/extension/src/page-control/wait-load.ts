const loadGraceMs = 200

type TabListener = (tabId: number, info: { status?: string }) => void

type PageControlTabs = {
  get: (tabId: number) => Promise<{ status?: string }>
  onUpdated: {
    addListener: (listener: TabListener) => void
    removeListener: (listener: TabListener) => void
  }
}

export function waitForTabLoad(tabId: number, timeoutMs: number, tabs: PageControlTabs = chrome.tabs) {
  return new Promise<void>((resolve, reject) => {
    let loading = false
    let sawComplete = false
    let settled = false
    let grace: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => finish(new Error("等待超时")), timeoutMs)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (grace !== undefined) clearTimeout(grace)
      tabs.onUpdated.removeListener(onUpdated)
      if (error) reject(error)
      else resolve()
    }
    const onUpdated = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId !== tabId || !info.status) return
      if (info.status === "loading") loading = true
      if (info.status === "complete") {
        sawComplete = true
        if (loading) finish()
      }
    }
    tabs.onUpdated.addListener(onUpdated)
    void tabs.get(tabId).then(
      (tab) => {
        if (settled) return
        if (loading || tab.status === "loading") {
          loading = true
          if (sawComplete) finish()
          return
        }
        // shortcut: a quiet 200ms counts as already loaded, so a navigation that starts later is missed
        grace = setTimeout(() => {
          if (!loading) finish()
        }, Math.min(loadGraceMs, timeoutMs))
      },
      (error: unknown) => finish(error instanceof Error ? error : new Error("等待超时"))
    )
  })
}
