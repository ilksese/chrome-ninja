import type { VideoResourceKind, VideoSnifferResponse } from "./types"

const VIDEO_URL_PATTERN = /\.(?:mp4|webm|mov|m4v|mkv|avi|flv|m2ts|m3u8|mpd|ogv|ogg|m4a|mp3|aac|wav)(?:$|[?#])/i
const MEDIA_SEGMENT_PATTERN = /\.(?:ts|m4s|cmfv|cmfa)(?:$|[?#])/i
const observedUrls = new Set<string>()
const videoOverlays = new Map<HTMLVideoElement, HTMLElement>()
let flushTimer: number | undefined
let overlayFrame: number | undefined
let enabled = true
let domObserver: MutationObserver | undefined
let performanceObserver: PerformanceObserver | undefined

function getKind(url: string, mimeType = ""): VideoResourceKind {
  const normalizedMime = mimeType.toLowerCase()
  if (url.startsWith("blob:")) return "blob"
  if (/\.m3u8(?:$|[?#])/i.test(url) || normalizedMime.includes("mpegurl")) return "playlist"
  if (/\.mpd(?:$|[?#])/i.test(url) || normalizedMime.includes("dash+xml")) return "manifest"
  if (normalizedMime.startsWith("audio/") || /\.(?:m4a|mp3|aac|wav|ogg)(?:$|[?#])/i.test(url)) return "audio"
  if (normalizedMime.startsWith("video/") || VIDEO_URL_PATTERN.test(url)) return "video"
  return "media"
}

function resolveUrl(value?: string | null) {
  if (!value) return ""
  try {
    return new URL(value, document.baseURI).href
  } catch {
    return ""
  }
}

function findMimeType(url: string) {
  const element = Array.from(document.querySelectorAll<HTMLSourceElement>("video source, audio source, source")).find((source) => resolveUrl(source.src) === url)
  return element?.type || ""
}

function collectPageResources(force = false) {
  const urls = new Set<string>()
  const addCandidate = (value?: string | null) => {
    const resolved = resolveUrl(value)
    if (resolved && (VIDEO_URL_PATTERN.test(resolved) || /\.(?:m3u8|mpd)(?:$|[?#])/i.test(resolved))) urls.add(resolved)
  }

  try {
    const pageUrl = new URL(location.href)
    for (const value of pageUrl.searchParams.values()) addCandidate(value)
  } catch {
    // Ignore malformed page URLs.
  }

  document.querySelectorAll<HTMLVideoElement | HTMLAudioElement>("video, audio").forEach((element) => {
    const currentUrl = resolveUrl(element.currentSrc || element.src)
    if (currentUrl) urls.add(currentUrl)
    element.querySelectorAll<HTMLSourceElement>("source[src]").forEach((source) => {
      const sourceUrl = resolveUrl(source.src)
      if (sourceUrl) urls.add(sourceUrl)
    })
  })
  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    addCandidate(anchor.href)
  })
  document.querySelectorAll<HTMLIFrameElement>("iframe[src]").forEach((frame) => {
    addCandidate(frame.src)
    try {
      const frameUrl = new URL(frame.src)
      for (const value of frameUrl.searchParams.values()) addCandidate(value)
    } catch {
      // Ignore malformed iframe URLs.
    }
  })
  performance.getEntriesByType("resource").forEach((entry) => {
    const resource = entry as PerformanceResourceTiming
    if (VIDEO_URL_PATTERN.test(resource.name) || resource.initiatorType === "video" || resource.initiatorType === "audio") urls.add(resource.name)
  })
  return Array.from(urls)
    .filter((url) => !MEDIA_SEGMENT_PATTERN.test(url))
    .filter((url) => force || !observedUrls.has(url))
    .map((url) => {
      observedUrls.add(url)
      const mimeType = findMimeType(url)
      return { url, mimeType, kind: getKind(url, mimeType) }
    })
}

function reportResources(force = false) {
  const resources = collectPageResources(force)
  if (!resources.length) return
  void chrome.runtime.sendMessage({
    target: "video-sniffer",
    type: "report",
    pageUrl: location.href,
    title: document.title,
    resources
  })
}

function getDownloadUrl(video: HTMLVideoElement) {
  const directUrl = resolveUrl(video.currentSrc || video.src)
  if (/^(?:https?|data):/i.test(directUrl) && !MEDIA_SEGMENT_PATTERN.test(directUrl)) return directUrl
  const resources = collectPageResources(true)
  return resources.find((item) => item.kind === "playlist" || item.kind === "manifest")?.url || resources.find((item) => item.kind === "video" && /^(?:https?|data):/i.test(item.url))?.url || ""
}

function setOverlayButtonState(button: HTMLButtonElement, label: string, disabled: boolean) {
  button.textContent = label
  button.disabled = disabled
}

function copyTextWithSelection(value: string) {
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.readOnly = true
  textarea.setAttribute("aria-hidden", "true")
  textarea.style.setProperty("position", "fixed", "important")
  textarea.style.setProperty("left", "-9999px", "important")
  textarea.style.setProperty("top", "0", "important")
  textarea.style.setProperty("opacity", "0", "important")
  textarea.style.setProperty("pointer-events", "none", "important")
  document.documentElement.append(textarea)
  textarea.select()
  textarea.setSelectionRange(0, value.length)
  const copied = document.execCommand("copy")
  textarea.remove()
  return copied
}

async function writeClipboard(value: string) {
  if (copyTextWithSelection(value)) return
  await navigator.clipboard.writeText(value)
}

async function copyVideoUrl(video: HTMLVideoElement, button: HTMLButtonElement) {
  const url = getDownloadUrl(video)
  if (!url) {
    setOverlayButtonState(button, "无地址", true)
    window.setTimeout(() => setOverlayButtonState(button, "复制", false), 1600)
    return
  }
  try {
    await writeClipboard(url)
    setOverlayButtonState(button, "已复制", true)
  } catch {
    setOverlayButtonState(button, "失败", true)
  }
  window.setTimeout(() => setOverlayButtonState(button, "复制", false), 1600)
}

async function downloadVideo(video: HTMLVideoElement, button: HTMLButtonElement) {
  const url = getDownloadUrl(video)
  if (!url) {
    setOverlayButtonState(button, "未找到地址", true)
    window.setTimeout(() => setOverlayButtonState(button, "↓ 下载", false), 1600)
    return
  }

  setOverlayButtonState(button, "下载中…", true)
  reportResources(true)
  try {
    const response = (await chrome.runtime.sendMessage({ target: "video-sniffer", type: "download", url })) as VideoSnifferResponse
    if (response.error) throw new Error(response.error)
    setOverlayButtonState(button, "✓ 已添加", true)
  } catch {
    setOverlayButtonState(button, "下载失败", true)
  }
  window.setTimeout(() => setOverlayButtonState(button, "↓ 下载", false), 1600)
}

function createVideoOverlay(video: HTMLVideoElement) {
  const host = document.createElement("div")
  host.dataset.chromeNinjaVideoDownload = ""
  host.style.setProperty("position", "fixed", "important")
  host.style.setProperty("display", "block", "important")
  host.style.setProperty("width", "140px", "important")
  host.style.setProperty("height", "32px", "important")
  host.style.setProperty("margin", "0", "important")
  host.style.setProperty("padding", "0", "important")
  host.style.setProperty("z-index", "2147483647", "important")
  host.style.setProperty("pointer-events", "none", "important")
  host.style.setProperty("contain", "layout style paint", "important")
  host.style.transition = "opacity 120ms ease"

  const shadow = host.attachShadow({ mode: "closed" })
  shadow.innerHTML = "<style>:host{all:initial}.actions{display:flex;gap:4px}button{all:unset;pointer-events:auto;box-sizing:border-box;width:68px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:rgba(11,17,27,.88);backdrop-filter:blur(10px);box-shadow:0 8px 22px rgba(0,0,0,.28);color:#fff;font:600 12px/1 Microsoft YaHei UI,PingFang SC,sans-serif;cursor:pointer;transition:background .15s,transform .15s}button.copy{color:#dbeafe;background:rgba(15,23,42,.9)}button.download{background:#0077ff}button:hover{background:#0064d8}button.copy:hover{background:#334155}button:active{transform:scale(.96)}button:disabled{cursor:default;opacity:.82}</style><div class='actions'><button class='copy' type='button' title='复制视频下载地址'>复制</button><button class='download' type='button' title='使用 Chrome Ninja 下载视频'>↓ 下载</button></div>"
  const copyButton = shadow.querySelector("button.copy") as HTMLButtonElement
  const downloadButton = shadow.querySelector("button.download") as HTMLButtonElement
  copyButton.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void copyVideoUrl(video, copyButton)
  })
  downloadButton.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void downloadVideo(video, downloadButton)
  })
  document.documentElement.append(host)
  videoOverlays.set(video, host)
}

function updateVideoOverlays() {
  overlayFrame = undefined
  for (const [video, host] of videoOverlays) {
    if (!video.isConnected || !enabled) {
      host.remove()
      videoOverlays.delete(video)
      continue
    }
    const rect = video.getBoundingClientRect()
    const visible = rect.width >= 160 && rect.height >= 90 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    host.hidden = !visible
    if (!visible) continue
    host.style.left = Math.max(6, rect.right - 148) + "px"
    host.style.top = Math.max(6, rect.top + 8) + "px"
  }
}

function scheduleOverlayLayout() {
  if (overlayFrame !== undefined) return
  overlayFrame = window.requestAnimationFrame(updateVideoOverlays)
}

function syncVideoOverlays() {
  if (!enabled) return
  document.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    if (!videoOverlays.has(video)) createVideoOverlay(video)
  })
  scheduleOverlayLayout()
}

function scheduleReport() {
  if (!enabled) return
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(reportResources, 180)
  syncVideoOverlays()
}

function startObservers() {
  if (domObserver || !document.documentElement) return
  domObserver = new MutationObserver(scheduleReport)
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "href"]
  })
  try {
    performanceObserver = new PerformanceObserver(scheduleReport)
    performanceObserver.observe({ type: "resource", buffered: true })
  } catch {
    // PerformanceObserver is not available on every page type.
  }
  document.addEventListener("scroll", scheduleOverlayLayout, true)
  window.addEventListener("resize", scheduleOverlayLayout)
  document.addEventListener("fullscreenchange", scheduleOverlayLayout)
  reportResources()
  syncVideoOverlays()
  window.addEventListener("load", scheduleReport, { once: true })
}

function stopObservers() {
  domObserver?.disconnect()
  performanceObserver?.disconnect()
  domObserver = undefined
  performanceObserver = undefined
  document.removeEventListener("scroll", scheduleOverlayLayout, true)
  window.removeEventListener("resize", scheduleOverlayLayout)
  document.removeEventListener("fullscreenchange", scheduleOverlayLayout)
  window.clearTimeout(flushTimer)
  flushTimer = undefined
  if (overlayFrame !== undefined) window.cancelAnimationFrame(overlayFrame)
  overlayFrame = undefined
  for (const host of videoOverlays.values()) host.remove()
  videoOverlays.clear()
  observedUrls.clear()
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== "video-sniffer-content" || message.type !== "scan") return false
  if (enabled) {
    reportResources(true)
    syncVideoOverlays()
  }
  return false
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.options?.newValue) return
  const nextEnabled = changes.options.newValue.videoSniffer?.enabled ?? true
  enabled = nextEnabled
  if (enabled) startObservers()
  else stopObservers()
})

chrome.storage.local.get(["options"], ({ options }) => {
  enabled = options?.videoSniffer?.enabled ?? true
  if (enabled) startObservers()
})
