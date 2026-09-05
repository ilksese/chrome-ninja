import { cn } from "@chrome-ninja/utils"
import { useCallback, useEffect, useMemo, useState } from "preact/hooks"
import type { VideoResource, VideoSnifferResponse } from "@/video-sniffer/types"

type VideoSnifferProps = {
  layout: "popup" | "options"
}

const KIND_LABELS: Record<VideoResource["kind"], string> = {
  video: "视频",
  audio: "音频",
  playlist: "HLS 清单",
  manifest: "DASH 清单",
  blob: "临时流",
  media: "媒体"
}

function RadarIcon() {
  return (
    <svg aria-hidden="true" className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" opacity=".55" />
      <path d="M12 12 18.5 7.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg aria-hidden="true" className={cn("size-4", spinning && "animate-spin")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9" />
      <path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
    </svg>
  )
}

function formatBytes(size?: number) {
  if (!size) return "大小未知"
  if (size < 1024) return size + " B"
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB"
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB"
  return (size / 1024 / 1024 / 1024).toFixed(2) + " GB"
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return "页面资源"
  }
}

function VideoSniffer({ layout }: VideoSnifferProps) {
  const isOptions = layout === "options"
  const [resources, setResources] = useState<VideoResource[]>([])
  const [tabId, setTabId] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState("")
  const [copiedId, setCopiedId] = useState("")
  const [notice, setNotice] = useState("")
  const groupedCount = useMemo(() => resources.filter((item) => item.kind === "video").length, [resources])

  const loadResources = useCallback(async (scanPage = false) => {
    setLoading(true)
    setNotice("")
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab.id === undefined) throw new Error("无法读取当前标签页")
      setTabId(tab.id)
      if (scanPage) {
        await chrome.tabs.sendMessage(tab.id, { target: "video-sniffer-content", type: "scan" }).catch(() => undefined)
        await new Promise((resolve) => window.setTimeout(resolve, 120))
      }
      const response = (await chrome.runtime.sendMessage({ target: "video-sniffer", type: "list", tabId: tab.id })) as VideoSnifferResponse
      setResources(response.resources || [])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "扫描失败，请刷新页面后重试")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadResources(true)
    const handleMessage = (message: { target?: string; type?: string; tabId?: number }) => {
      if (message.target === "video-sniffer-ui" && message.type === "resources-updated" && message.tabId === tabId) void loadResources(false)
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [loadResources, tabId])

  const clearResources = async () => {
    if (tabId === undefined) return
    await chrome.runtime.sendMessage({ target: "video-sniffer", type: "clear", tabId })
    setResources([])
    setNotice("已清空当前页面的捕获记录")
  }

  const copyResourceUrl = async (resource: VideoResource) => {
    try {
      await navigator.clipboard.writeText(resource.url)
      setCopiedId(resource.id)
      setNotice("下载地址已复制")
      window.setTimeout(() => setCopiedId((current) => (current === resource.id ? "" : current)), 1600)
    } catch {
      setNotice("复制失败，请检查剪贴板权限")
    }
  }

  const downloadResource = async (resource: VideoResource) => {
    setDownloadingId(resource.id)
    setNotice("")
    try {
      const response = (await chrome.runtime.sendMessage({ target: "video-sniffer", type: "download", url: resource.url })) as VideoSnifferResponse
      if (response.error) throw new Error(response.error)
      setNotice(resource.kind === "playlist" || resource.kind === "manifest" ? "媒体清单已加入下载" : "视频已加入下载队列")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "下载失败")
    } finally {
      setDownloadingId("")
    }
  }

  return (
    <div className={cn("relative", isOptions ? "mx-auto max-w-4xl" : "space-y-3")}>
      <section className="relative overflow-hidden rounded-[14px] border border-slate-800 bg-[#0b111b] text-white shadow-[0_12px_28px_rgba(11,17,27,0.22)]">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className={cn("relative flex items-center gap-2.5", isOptions ? "px-4 py-3" : "px-3 py-2.5")}>
          <span className="relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#ff7a3d] text-[#111827] shadow-[0_0_0_3px_rgba(255,122,61,.12)]">
            <RadarIcon />
            <span className="absolute -right-1 -top-1 size-2 animate-pulse rounded-full border-2 border-[#0b111b] bg-[#7dff8a]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[#ff9b6c]">Media Signal Lab</span>
            <h1 className="text-sm font-bold leading-5 tracking-tight">视频嗅探器</h1>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[10px] font-semibold tabular-nums">
            <span className="text-slate-400">{groupedCount} 个视频</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-300">{resources.length} 条</span>
            <span className="text-[#7dff8a]">● 在线</span>
          </span>
        </div>
      </section>

      <div className={cn("flex items-center gap-2", isOptions && "mt-4")}>
        <button className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50" type="button" disabled={loading} onClick={() => void loadResources(true)}>
          <RefreshIcon spinning={loading} />
          {loading ? "扫描中" : "重新扫描"}
        </button>
        <button className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" type="button" disabled={!resources.length} onClick={() => void clearResources()}>
          清空
        </button>
      </div>

      {notice && <div className="rounded-xl border border-[#f4d7c9] bg-[#fff5ef] px-3 py-2 text-xs leading-5 text-[#9a431d]">{notice}</div>}

      <section className={cn("space-y-2", isOptions && "mt-4 grid grid-cols-2 gap-3 space-y-0 max-[760px]:grid-cols-1")} aria-live="polite">
        {!loading && resources.length === 0 && (
          <div className={cn("rounded-[16px] border border-dashed border-slate-300 bg-white/72 px-5 py-8 text-center", isOptions && "col-span-2 max-[760px]:col-span-1")}>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"><RadarIcon /></span>
            <h2 className="mt-3 text-sm font-semibold text-slate-800">还没有发现视频信号</h2>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">先在当前页面播放视频，再回来点击“重新扫描”。受保护的 DRM 视频无法直接下载。</p>
          </div>
        )}

        {resources.map((resource, index) => {
          const downloadable = resource.kind !== "blob"
          return (
            <article key={resource.id} className="group relative overflow-hidden rounded-[15px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,.07)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_13px_28px_rgba(16,24,40,.10)]">
              <span className="absolute inset-y-0 left-0 w-1 bg-[#ff7a3d] opacity-0 transition group-hover:opacity-100" />
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#101828] text-[10px] font-black uppercase tracking-tight text-white shadow-sm">{resource.kind === "playlist" ? "HLS" : resource.kind === "manifest" ? "DASH" : resource.kind === "audio" ? "AUD" : "VID"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="truncate text-xs font-semibold text-slate-900" title={resource.filename}>{resource.filename}</strong>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">#{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-slate-400" title={resource.url}>{getHostname(resource.url)}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded-full bg-[#fff0e9] px-2 py-0.5 font-semibold text-[#b64b1b]">{KIND_LABELS[resource.kind]}</span>
                    <span className="text-slate-400">{formatBytes(resource.size)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{resource.source === "network" ? "网络捕获" : "页面发现"}</span>
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95" type="button" title="复制下载地址" aria-label="复制下载地址" onClick={() => void copyResourceUrl(resource)}>
                    {copiedId === resource.id ? <span className="text-sm font-bold text-[#159447]">✓</span> : <CopyIcon />}
                  </button>
                  <button className="grid size-9 place-items-center rounded-xl bg-[#0077ff] text-white shadow-[0_8px_18px_rgba(0,119,255,.25)] transition hover:bg-[#0064d8] active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none" type="button" title={downloadable ? "下载资源" : "临时流无法直接下载"} aria-label={downloadable ? "下载 " + resource.filename : "临时流无法直接下载"} disabled={!downloadable || downloadingId === resource.id} onClick={() => void downloadResource(resource)}>
                    {downloadingId === resource.id ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <DownloadIcon />}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

export default VideoSniffer
