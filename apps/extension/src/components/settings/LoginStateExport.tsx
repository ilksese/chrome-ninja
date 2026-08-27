import { useEffect, useMemo, useState } from "preact/hooks"
import type { LoginStateExportResponse, LoginStateTab, LoginStateTabsResponse } from "@/login-state/types"

function LoginStateExport() {
  const [tabs, setTabs] = useState<LoginStateTab[]>([])
  const [selectedTabId, setSelectedTabId] = useState<number | undefined>()
  const [includeIndexedDB, setIncludeIndexedDB] = useState(false)
  const [isLoadingTabs, setIsLoadingTabs] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    setIsLoadingTabs(true)
    sendMessage<LoginStateTabsResponse>({ target: "background", type: "listLoginStateTabs" })
      .then((response) => {
        if (!alive) return
        if (!response.ok) {
          setError(response.error)
          return
        }
        setTabs(response.tabs)
        setSelectedTabId(response.tabs.find((tab) => tab.active && tab.lastFocusedWindow)?.id ?? response.tabs[0]?.id)
      })
      .catch((reason) => {
        if (alive) setError(getErrorMessage(reason))
      })
      .finally(() => {
        if (alive) setIsLoadingTabs(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const selectedTab = useMemo(() => tabs.find((tab) => tab.id === selectedTabId), [selectedTabId, tabs])
  const canExport = typeof selectedTabId === "number" && !isExporting && !isLoadingTabs

  const exportState = async () => {
    if (typeof selectedTabId !== "number") return
    setError("")
    setWarnings([])
    setIsExporting(true)
    try {
      const response = await sendMessage<LoginStateExportResponse>({
        target: "background",
        type: "exportLoginState",
        tabId: selectedTabId,
        includeIndexedDB
      })
      if (!response.ok) {
        setError(response.error)
        setWarnings(response.warnings ?? [])
        return
      }

      downloadJson(response.filename, JSON.stringify(response.state, null, 2))
      setWarnings(response.warnings ?? [])
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-950">登录态导出</h3>
        <p className="mt-1 text-xs leading-4 text-slate-500">导出所选网页标签的 cookies 和 localStorage。</p>
      </div>

      <label className="block text-xs font-medium text-slate-600">
        目标标签
        <select
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all hover:border-slate-300 focus:border-[#0077ff] disabled:bg-slate-50 disabled:text-slate-400"
          disabled={tabs.length === 0 || isLoadingTabs || isExporting}
          value={selectedTabId ?? ""}
          onChange={(event) => setSelectedTabId(Number((event.target as HTMLSelectElement).value))}>
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>{`${tab.host} - ${tab.title}`}</option>
          ))}
        </select>
      </label>

      {selectedTab && <p className="mt-1 truncate text-xs text-slate-500">{selectedTab.url}</p>}
      {!isLoadingTabs && tabs.length === 0 && <p className="mt-2 text-xs leading-4 text-amber-700">没有可导出的 http/https 标签。</p>}

      <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-4 text-slate-600">
        <input
          className="mt-0.5 size-4 accent-[#101828]"
          type="checkbox"
          checked={includeIndexedDB}
          disabled={isExporting}
          onChange={(event) => setIncludeIndexedDB((event.target as HTMLInputElement).checked)}
        />
        <span>
          <span className="block font-medium text-slate-900">包含 IndexedDB</span>
          <span className="mt-0.5 block text-slate-500">适用于 Firebase 等站点，可能较慢或失败。</span>
        </span>
      </label>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-4 text-red-700">{error}</p>}
      {warnings.length > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-4 text-amber-800">{warnings.join("；")}</p>}

      <button
        className="mt-3 w-full rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={!canExport}
        onClick={() => void exportState()}>
        {isExporting ? "导出中" : "导出所选标签登录态"}
      </button>
    </section>
  )
}

function sendMessage<T>(message: unknown) {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(response)
    })
  })
}

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "登录态导出失败"
}

export default LoginStateExport
