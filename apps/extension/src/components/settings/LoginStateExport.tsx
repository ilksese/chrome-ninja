import type { ComponentChildren } from "preact"
import { useEffect, useMemo, useState } from "preact/hooks"
import Dialog from "@components/Dialog"
import type { LoginStateExportResponse, LoginStateTab, LoginStateTabsResponse, PlaywrightStorageState } from "@/login-state/types"

type LoginStateExportProps = {
  onClose?: () => void
  renderActions?: (actions: ComponentChildren) => ComponentChildren
}

type ExportPreview = {
  filename: string
  content: string
}

function LoginStateExport({ onClose, renderActions }: LoginStateExportProps) {
  const [tabs, setTabs] = useState<LoginStateTab[]>([])
  const [selectedTabId, setSelectedTabId] = useState<number | undefined>()
  const [includeCookies, setIncludeCookies] = useState(true)
  const [includeLocalStorage, setIncludeLocalStorage] = useState(true)
  const [includeIndexedDB, setIncludeIndexedDB] = useState(false)
  const [compactJson, setCompactJson] = useState(false)
  const [excludedKeys, setExcludedKeys] = useState("")
  const [isLoadingTabs, setIsLoadingTabs] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [preview, setPreview] = useState<ExportPreview | null>(null)

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
  const hasSelectedFields = includeCookies || includeLocalStorage || includeIndexedDB
  const canExport = typeof selectedTabId === "number" && hasSelectedFields && !isExporting && !isLoadingTabs

  const createExportPayload = async () => {
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

      const state = filterStorageState(response.state, parseExcludedKeys(excludedKeys), { includeCookies, includeLocalStorage, includeIndexedDB })
      setWarnings(response.warnings ?? [])
      return { filename: response.filename, content: JSON.stringify(state, null, compactJson ? 0 : 2) }
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setIsExporting(false)
    }
  }

  const exportState = async () => {
    const payload = await createExportPayload()
    if (payload) downloadJson(payload.filename, payload.content)
  }

  const previewState = async () => {
    const payload = await createExportPayload()
    if (payload) setPreview(payload)
  }

  const actions = (
    <div className="flex gap-2">
      {onClose && (
        <button
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
          type="button"
          onClick={onClose}>
          关闭
        </button>
      )}
      <button
        className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={!canExport}
        onClick={() => void previewState()}>
        {isExporting ? "处理中" : "预览导出"}
      </button>
      <button
        className="flex-1 rounded-xl bg-[#101828] px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={!canExport}
        onClick={() => void exportState()}>
        {isExporting ? "导出中" : "导出登录态"}
      </button>
    </div>
  )

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

      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-4 text-slate-600">
        <input
          className="size-4 accent-[#101828]"
          type="checkbox"
          checked={includeCookies}
          disabled={isExporting}
          onChange={(event) => setIncludeCookies((event.target as HTMLInputElement).checked)}
        />
        <span className="font-medium text-slate-900">包含 Cookie</span>
      </label>

      <label className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-4 text-slate-600">
        <input
          className="size-4 accent-[#101828]"
          type="checkbox"
          checked={includeLocalStorage}
          disabled={isExporting}
          onChange={(event) => setIncludeLocalStorage((event.target as HTMLInputElement).checked)}
        />
        <span className="font-medium text-slate-900">包含 localStorage</span>
      </label>

      <label className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-4 text-slate-600">
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

      {!hasSelectedFields && <p className="mt-2 text-xs leading-4 text-amber-700">至少选择一个导出字段。</p>}

      <label className="mt-3 block text-xs font-medium text-slate-600">
        排除 key
        <textarea
          className="mt-1 min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0077ff] disabled:bg-slate-50 disabled:text-slate-400"
          value={excludedKeys}
          disabled={isExporting}
          placeholder="token, debugFlag, firebase:authUser"
          onInput={(event) => setExcludedKeys((event.target as HTMLTextAreaElement).value)}
        />
        <span className="mt-1 block text-slate-500">用逗号、空格或换行分隔；匹配 Cookie/localStorage 名称和 IndexedDB key。</span>
      </label>

      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-4 text-slate-600">
        <input
          className="size-4 accent-[#101828]"
          type="checkbox"
          checked={compactJson}
          disabled={isExporting}
          onChange={(event) => setCompactJson((event.target as HTMLInputElement).checked)}
        />
        <span className="font-medium text-slate-900">紧凑 JSON</span>
      </label>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-4 text-red-700">{error}</p>}
      {warnings.length > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-4 text-amber-800">{warnings.join("；")}</p>}

      {renderActions ? renderActions(actions) : <div className="mt-6">{actions}</div>}

      <Dialog
        open={preview !== null}
        titleId="login-state-preview-title"
        onClose={() => setPreview(null)}
        panelClassName="max-w-[720px]">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 id="login-state-preview-title" className="text-sm font-semibold text-slate-950">导出预览</h3>
          {preview && <p className="mt-1 truncate text-xs text-slate-500">{preview.filename}</p>}
        </div>
        <pre className="max-h-[62vh] overflow-auto bg-slate-950 p-4 text-xs leading-5 text-slate-100">{preview?.content}</pre>
        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
            type="button"
            onClick={() => setPreview(null)}>
            关闭
          </button>
          <button
            className="flex-1 rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={!preview}
            onClick={() => {
              if (preview) downloadJson(preview.filename, preview.content)
            }}>
            导出
          </button>
        </div>
      </Dialog>
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
      if (response == null) {
        reject(new Error("后台未返回登录态导出结果，请刷新扩展后重试"))
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

function filterStorageState(
  state: PlaywrightStorageState,
  excludedKeys: Set<string>,
  options: { includeCookies: boolean; includeLocalStorage: boolean; includeIndexedDB: boolean }
): PlaywrightStorageState {
  const shouldExclude = (key: string) => excludedKeys.has(key)

  return {
    cookies: options.includeCookies ? state.cookies.filter((cookie) => !shouldExclude(cookie.name)) : [],
    origins: state.origins.map((origin) => ({
      ...origin,
      localStorage: options.includeLocalStorage ? origin.localStorage.filter((item) => !shouldExclude(item.name)) : [],
      ...(options.includeIndexedDB && origin.indexedDB
        ? {
            indexedDB: origin.indexedDB.map((database) => ({
              ...database,
              stores: database.stores.map((store) => ({
                ...store,
                records: store.records.filter((record) => !shouldExclude(getIndexedDBRecordKey(record.value, record.key, store.keyPath)))
              }))
            }))
          }
        : {})
    }))
  }
}

function parseExcludedKeys(value: string) {
  return new Set(value.split(/[\s,]+/).filter(Boolean))
}

function getIndexedDBRecordKey(value: unknown, key: unknown, keyPath?: string | string[]) {
  if (typeof key === "string" || typeof key === "number") return String(key)
  if (typeof keyPath === "string") return getValueByPath(value, keyPath)
  if (Array.isArray(keyPath)) return keyPath.map((path) => getValueByPath(value, path)).join(",")
  return ""
}

function getValueByPath(value: unknown, path: string) {
  const result = path.split(".").reduce<unknown>((current, part) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined
  }, value)
  return typeof result === "string" || typeof result === "number" ? String(result) : ""
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "登录态导出失败"
}

export default LoginStateExport
