import van, { type State } from "vanjs-core"
import { Button, Row } from "@/content-ui/components"
import { createScope } from "@/content-ui/lifecycle"
import { theme } from "@/content-ui/theme"
import type { VideoResourceKind, VideoSnifferResponse } from "./types"

const VIDEO_URL_PATTERN = /\.(?:mp4|webm|mov|m4v|mkv|avi|flv|m2ts|m3u8|mpd|ogv|ogg|m4a|mp3|aac|wav)(?:$|[?#])/i
const MEDIA_SEGMENT_PATTERN = /\.(?:ts|m4s|cmfv|cmfa)(?:$|[?#])/i
const observedUrls = new Set<string>()
type VideoOverlay = {
  host: HTMLElement
  dispose: () => void
  anchorName: string
  previousAnchorName: string
  previousAnchorPriority: string
}
const videoOverlays = new Map<HTMLVideoElement, VideoOverlay>()
let nextVideoAnchorId = 0
let flushTimer: number | undefined
let overlayFrame: number | undefined
let enabled = false
let optionsChanged = false
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
  const element = Array.from(document.querySelectorAll<HTMLSourceElement>("video source, audio source, source")).find(
    (source) => resolveUrl(source.src) === url
  )
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
    if (
      VIDEO_URL_PATTERN.test(resource.name) ||
      resource.initiatorType === "video" ||
      resource.initiatorType === "audio"
    )
      urls.add(resource.name)
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
  if (!enabled) return
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
  return (
    resources.find((item) => item.kind === "playlist" || item.kind === "manifest")?.url ||
    resources.find((item) => item.kind === "video" && /^(?:https?|data):/i.test(item.url))?.url ||
    ""
  )
}

type OverlayButtonState = State<{ label: string; disabled: boolean }>

function setOverlayButtonState(button: OverlayButtonState, label: string, disabled: boolean) {
  button.val = { label, disabled }
}

function copyTextWithSelection(value: string) {
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.readOnly = true
  textarea.setAttribute("aria-hidden", "true")
  textarea.style.setProperty("position", "fixed", "")
  textarea.style.setProperty("left", "-9999px", "")
  textarea.style.setProperty("top", "0", "")
  textarea.style.setProperty("opacity", "0", "")
  textarea.style.setProperty("pointer-events", "none", "")
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

async function copyVideoUrl(
  video: HTMLVideoElement,
  button: OverlayButtonState,
  scope: ReturnType<typeof createScope>
) {
  const url = getDownloadUrl(video)
  if (!url) {
    setOverlayButtonState(button, "无地址", true)
    scope.timeout(() => setOverlayButtonState(button, "复制", false), 1600)
    return
  }
  try {
    await writeClipboard(url)
    setOverlayButtonState(button, "已复制", true)
  } catch {
    setOverlayButtonState(button, "失败", true)
  }
  scope.timeout(() => setOverlayButtonState(button, "复制", false), 1600)
}

async function downloadVideo(
  video: HTMLVideoElement,
  button: OverlayButtonState,
  scope: ReturnType<typeof createScope>
) {
  const url = getDownloadUrl(video)
  if (!url) {
    setOverlayButtonState(button, "未找到地址", true)
    scope.timeout(() => setOverlayButtonState(button, "↓ 下载", false), 1600)
    return
  }

  setOverlayButtonState(button, "下载中…", true)
  reportResources(true)
  try {
    const response = (await chrome.runtime.sendMessage({
      target: "video-sniffer",
      type: "download",
      url
    })) as VideoSnifferResponse
    if (response.error) throw new Error(response.error)
    setOverlayButtonState(button, "✓ 已添加", true)
  } catch {
    setOverlayButtonState(button, "下载失败", true)
  }
  scope.timeout(() => setOverlayButtonState(button, "↓ 下载", false), 1600)
}

function createVideoOverlay(video: HTMLVideoElement) {
  const previousAnchorName = video.style.getPropertyValue("anchor-name")
  const previousAnchorPriority = video.style.getPropertyPriority("anchor-name")
  const existingAnchors = getComputedStyle(video).getPropertyValue("anchor-name").trim()
  const anchor = `--chrome-ninja-video-${chrome.runtime.id}-${++nextVideoAnchorId}`
  video.style.setProperty(
    "anchor-name",
    existingAnchors && existingAnchors !== "none" ? `${existingAnchors}, ${anchor}` : anchor,
    ""
  )
  const scope = createScope()
  const host = Row({
    "data-chrome-ninja-video-download": "",
    "data-chrome-ninja-ui": "",
    style: {
      position: "fixed",
      display: "none",
      width: 140,
      height: 32,
      gap: 4,
      margin: 0,
      padding: 0,
      zIndex: theme.layer,
      pointerEvents: "none",
      contain: "layout style paint",
      transition: "opacity 120ms ease"
    }
  })
  host.style.setProperty("position-anchor", anchor)
  host.style.setProperty("position-visibility", "anchors-visible")
  host.style.setProperty("inset", "auto")
  host.style.setProperty("left", "calc(anchor(right) - 148px)")
  host.style.setProperty("top", "calc(anchor(top) + 8px)")
  const buttonStyle = { pointerEvents: "auto", width: 68, height: 32, padding: 0, fontSize: 12 }
  const copyState = van.state({ label: "复制", disabled: false })
  const downloadState = van.state({ label: "↓ 下载", disabled: false })
  const copyButton = Button(
    { title: "复制视频下载地址", style: buttonStyle, disabled: () => copyState.val.disabled },
    () => copyState.val.label
  )
  const downloadButton = Button(
    {
      variant: "primary",
      title: "使用 Chrome Ninja 下载视频",
      style: buttonStyle,
      disabled: () => downloadState.val.disabled
    },
    () => downloadState.val.label
  )
  host.append(copyButton, downloadButton)
  copyButton.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void copyVideoUrl(video, copyState, scope)
  })
  downloadButton.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    void downloadVideo(video, downloadState, scope)
  })
  document.documentElement.append(host)
  videoOverlays.set(video, {
    host,
    dispose: scope.dispose,
    anchorName: video.style.getPropertyValue("anchor-name"),
    previousAnchorName,
    previousAnchorPriority
  })
}

function removeVideoOverlay(video: HTMLVideoElement, overlay: VideoOverlay) {
  overlay.dispose()
  overlay.host.remove()
  if (video.style.getPropertyValue("anchor-name") === overlay.anchorName) {
    if (overlay.previousAnchorName)
      video.style.setProperty("anchor-name", overlay.previousAnchorName, overlay.previousAnchorPriority)
    else video.style.removeProperty("anchor-name")
  }
  videoOverlays.delete(video)
}

function isOverlayVisible(video: HTMLVideoElement, host: HTMLElement) {
  const rect = video.getBoundingClientRect()
  if (rect.width < 160 || rect.height < 90 || getComputedStyle(video).visibility !== "visible") return false
  const buttons = host.getBoundingClientRect()
  let left = 0
  let top = 0
  let right = window.innerWidth
  let bottom = window.innerHeight
  for (let parent = video.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow)
    const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow)
    if (!clipX && !clipY) continue
    const bounds = parent.getBoundingClientRect()
    const scaleX = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1
    const scaleY = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1
    if (clipX) {
      left = Math.max(left, bounds.left + parent.clientLeft * scaleX)
      right = Math.min(right, bounds.left + (parent.clientLeft + parent.clientWidth) * scaleX)
    }
    if (clipY) {
      top = Math.max(top, bounds.top + parent.clientTop * scaleY)
      bottom = Math.min(bottom, bounds.top + (parent.clientTop + parent.clientHeight) * scaleY)
    }
  }
  return (
    buttons.width > 0 &&
    buttons.height > 0 &&
    buttons.left >= left &&
    buttons.top >= top &&
    buttons.right <= right &&
    buttons.bottom <= bottom
  )
}

function updateVideoOverlays() {
  overlayFrame = undefined
  for (const [video, overlay] of videoOverlays) {
    if (!video.isConnected || !enabled) {
      removeVideoOverlay(video, overlay)
      continue
    }
    const { host } = overlay
    host.style.setProperty("display", "flex", "")
    const visible = isOverlayVisible(video, host)
    host.style.setProperty("display", visible ? "flex" : "none", "")
  }
}

function scheduleOverlayLayout() {
  if (overlayFrame !== undefined) return
  overlayFrame = window.requestAnimationFrame(updateVideoOverlays)
}

function syncVideoOverlays() {
  if (!enabled || !CSS.supports("anchor-name", "--chrome-ninja-video") || !CSS.supports("top", "anchor(top)")) return
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
  window.removeEventListener("load", scheduleReport)
  window.clearTimeout(flushTimer)
  flushTimer = undefined
  if (overlayFrame !== undefined) window.cancelAnimationFrame(overlayFrame)
  overlayFrame = undefined
  for (const [video, overlay] of videoOverlays) removeVideoOverlay(video, overlay)
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
  if (areaName !== "local" || !changes.options) return
  optionsChanged = true
  const nextEnabled = changes.options.newValue?.videoSniffer?.enabled === true
  enabled = nextEnabled
  if (enabled) startObservers()
  else stopObservers()
})

chrome.storage.local.get(["options"], ({ options }) => {
  if (optionsChanged) return
  enabled = options?.videoSniffer?.enabled === true
  if (enabled) startObservers()
})

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    enabled = false
    stopObservers()
  }
})
