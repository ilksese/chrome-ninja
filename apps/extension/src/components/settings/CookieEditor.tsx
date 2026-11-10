import { useEffect, useState } from "preact/hooks"
import { pageUnavailableReason, type CookieResponse } from "@/cookie-editor/types"

export default function CookieEditor() {
  const [tabId, setTabId] = useState<number>()
  const [reason, setReason] = useState("正在检查当前网页…")
  const [error, setError] = useState("")
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    let active = true
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!active) return
        setTabId(tab?.id)
        setReason(pageUnavailableReason(tab?.url))
      })
      .catch(() => {
        if (active) setReason("无法读取当前标签页")
      })
    return () => {
      active = false
    }
  }, [])
  const open = async () => {
    if (tabId === undefined) return
    setOpening(true)
    setError("")
    try {
      const response: CookieResponse | undefined = await chrome.runtime.sendMessage({
        target: "cookie-editor",
        type: "open",
        tabId
      })
      if (!response?.ok) throw new Error(response?.error ?? "无法打开编辑器，请刷新网页后重试")
      window.close()
    } catch (error) {
      setError(error instanceof Error ? error.message : "打开失败")
    } finally {
      setOpening(false)
    }
  }
  return (
    <div>
      <button
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={!!reason || tabId === undefined || opening}
        title={reason || "在当前网页打开 Cookie 编辑器"}
        onClick={() => void open()}>
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e8f2ff] text-lg text-[#005bd1]"
          aria-hidden="true">
          ◉
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950">Cookie 编辑器</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {reason || (opening ? "正在打开…" : "在网页中查询、编辑与持续禁用 Cookie")}
          </span>
        </span>
        <span aria-hidden="true" className="text-[#005bd1]">
          ›
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
