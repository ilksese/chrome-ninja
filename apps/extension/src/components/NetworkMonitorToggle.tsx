import { useEffect, useState } from "preact/hooks"
import type { NetmonTabState } from "@/network-monitor/types"

function NetworkMonitorToggle() {
  const [enabled, setEnabled] = useState(false)
  const [ruleCount, setRuleCount] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState("")

  const refresh = async () => {
    const res = (await chrome.runtime.sendMessage({
      target: "netmon",
      type: "GET_STATE"
    })) as { ok?: boolean; state?: NetmonTabState } | undefined
    setEnabled(Boolean(res?.state?.enabled))
    setRuleCount(res?.state?.rules.length ?? 0)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const toggle = async () => {
    setToggling(true)
    setError("")
    try {
      await chrome.runtime.sendMessage({ target: "netmon", type: "COMMAND", command: { name: "toggle" } })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络监视开关失败")
    } finally {
      setToggling(false)
    }
  }

  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff] disabled:opacity-60"
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="网络监视器"
      disabled={toggling}
      onClick={() => void toggle()}>
      <span className={`grid size-10 place-items-center rounded-xl text-[11px] font-semibold shadow-sm ${enabled ? "bg-[#101828] text-white" : "bg-slate-100 text-slate-500"}`}>
        {enabled ? "ON" : "OFF"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-950">网络监视器</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {enabled ? (ruleCount > 0 ? `已开启 · ${ruleCount} 条规则` : "已开启 · 待添加规则") : "当前标签页关闭"}
        </span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-[#101828]" : "bg-slate-300"}`} aria-hidden="true">
        <span className={`absolute top-0.5 block size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      {error && <span className="absolute inset-x-0 -bottom-1 text-xs text-red-600">{error}</span>}
    </button>
  )
}

export default NetworkMonitorToggle
