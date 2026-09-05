import type { VideoResource, VideoResourceKind, VideoSnifferResponse } from "./types"

const VIDEO_URL_PATTERN = /\.(?:mp4|webm|mov|m4v|mkv|avi|flv|m2ts|m3u8|mpd|ogv|ogg|m4a|mp3|aac|wav)(?:$|[?#])/i
const MEDIA_SEGMENT_PATTERN = /\.(?:ts|m4s|cmfv|cmfa)(?:$|[?#])/i
const resourcesByTab = new Map<number, Map<string, VideoResource>>()
let videoSnifferEnabled = true

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function getHeader(headers: chrome.webRequest.HttpHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name)?.value || ""
}

function getKind(url: string, mimeType = ""): VideoResourceKind {
  const normalizedMime = mimeType.toLowerCase()
  if (url.startsWith("blob:")) return "blob"
  if (/\.m3u8(?:$|[?#])/i.test(url) || normalizedMime.includes("mpegurl")) return "playlist"
  if (/\.mpd(?:$|[?#])/i.test(url) || normalizedMime.includes("dash+xml")) return "manifest"
  if (normalizedMime.startsWith("audio/") || /\.(?:m4a|mp3|aac|wav|ogg)(?:$|[?#])/i.test(url)) return "audio"
  if (normalizedMime.startsWith("video/") || VIDEO_URL_PATTERN.test(url)) return "video"
  return "media"
}

function isMediaResource(url: string, mimeType: string, requestType?: chrome.webRequest.ResourceType) {
  const normalizedMime = mimeType.toLowerCase()
  if (MEDIA_SEGMENT_PATTERN.test(url) || normalizedMime.includes("mp2t") || normalizedMime.includes("iso.segment")) return false
  return (
    requestType === "media" ||
    normalizedMime.startsWith("video/") ||
    normalizedMime.startsWith("audio/") ||
    normalizedMime.includes("mpegurl") ||
    normalizedMime.includes("dash+xml") ||
    VIDEO_URL_PATTERN.test(url)
  )
}

function extensionForMime(mimeType: string) {
  const mimeExtensions: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "application/vnd.apple.mpegurl": ".m3u8",
    "application/x-mpegurl": ".m3u8",
    "application/dash+xml": ".mpd"
  }
  return mimeExtensions[mimeType.toLowerCase().split(";")[0]] || ""
}

function sanitizeFilename(value: string) {
  return Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? "_" : character))
    .join("")
    .slice(0, 180)
}

function filenameFromUrl(url: string, mimeType = "") {
  try {
    const pathname = new URL(url).pathname
    const rawName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "")
    const fallback = "video-" + Date.now() + extensionForMime(mimeType)
    const filename = rawName || fallback
    return sanitizeFilename(filename)
  } catch {
    return "video-" + Date.now() + extensionForMime(mimeType)
  }
}

function filenameFromHeaders(headers: chrome.webRequest.HttpHeader[] | undefined, url: string, mimeType: string) {
  const disposition = getHeader(headers, "content-disposition")
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plainMatch = disposition.match(/filename=["']?([^;"']+)/i)
  const candidate = utf8Match?.[1] || plainMatch?.[1]
  if (!candidate) return filenameFromUrl(url, mimeType)
  try {
    return sanitizeFilename(decodeURIComponent(candidate))
  } catch {
    return sanitizeFilename(candidate)
  }
}

function addResource(resource: Omit<VideoResource, "id" | "detectedAt">) {
  const tabResources = resourcesByTab.get(resource.tabId) || new Map<string, VideoResource>()
  const existing = tabResources.get(resource.url)
  tabResources.set(resource.url, {
    ...existing,
    ...resource,
    source: existing?.source === "network" ? "network" : resource.source,
    id: existing?.id || hash(resource.url),
    detectedAt: existing?.detectedAt || Date.now()
  })
  while (tabResources.size > 200) {
    const oldestUrl = tabResources.keys().next().value
    if (!oldestUrl) break
    tabResources.delete(oldestUrl)
  }
  resourcesByTab.set(resource.tabId, tabResources)
  void chrome.runtime.sendMessage({ target: "video-sniffer-ui", type: "resources-updated", tabId: resource.tabId }).catch(() => undefined)
}

function getResources(tabId: number) {
  return Array.from(resourcesByTab.get(tabId)?.values() || []).sort((a, b) => b.detectedAt - a.detectedAt)
}

function clearTab(tabId: number) {
  resourcesByTab.delete(tabId)
  void chrome.runtime.sendMessage({ target: "video-sniffer-ui", type: "resources-updated", tabId }).catch(() => undefined)
}

export function registerVideoSnifferBackground() {
  chrome.storage.local.get(["options"], ({ options }) => {
    videoSnifferEnabled = options?.videoSniffer?.enabled ?? true
  })
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.options?.newValue) return
    videoSnifferEnabled = changes.options.newValue.videoSniffer?.enabled ?? true
    if (!videoSnifferEnabled) {
      for (const tabId of resourcesByTab.keys()) clearTab(tabId)
    }
  })

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (!videoSnifferEnabled || details.tabId < 0) return
      const mimeType = getHeader(details.responseHeaders, "content-type")
      if (!isMediaResource(details.url, mimeType, details.type)) return
      const rawSize = Number(getHeader(details.responseHeaders, "content-length"))
      addResource({
        tabId: details.tabId,
        url: details.url,
        pageUrl: details.initiator || "",
        title: "",
        filename: filenameFromHeaders(details.responseHeaders, details.url, mimeType),
        mimeType,
        size: Number.isFinite(rawSize) && rawSize > 0 ? rawSize : undefined,
        kind: getKind(details.url, mimeType),
        source: "network"
      })
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  )

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) clearTab(details.tabId)
  })
  chrome.tabs.onRemoved.addListener(clearTab)

  chrome.runtime.onMessage.addListener((message, sender, sendResponse: (response: VideoSnifferResponse) => void) => {
    if (message?.target !== "video-sniffer") return false

    if (message.type === "report" && sender.tab?.id !== undefined) {
      const tabId = sender.tab.id
      const pageUrl = typeof message.pageUrl === "string" ? message.pageUrl : sender.tab.url || ""
      const title = typeof message.title === "string" ? message.title : sender.tab.title || ""
      for (const item of message.resources || []) {
        if (!item?.url || typeof item.url !== "string") continue
        addResource({
          tabId,
          url: item.url,
          pageUrl,
          title,
          filename: filenameFromUrl(item.url, item.mimeType || ""),
          mimeType: item.mimeType || "",
          kind: item.kind || getKind(item.url, item.mimeType || ""),
          source: "page"
        })
      }
      sendResponse({ resources: getResources(tabId) })
      return false
    }

    if (message.type === "list" && Number.isInteger(message.tabId)) {
      sendResponse({ resources: getResources(message.tabId) })
      return false
    }

    if (message.type === "clear" && Number.isInteger(message.tabId)) {
      clearTab(message.tabId)
      sendResponse({ resources: [] })
      return false
    }

    if (message.type === "download" && typeof message.url === "string") {
      const resource = Array.from(resourcesByTab.values()).flatMap((items) => Array.from(items.values())).find((item) => item.url === message.url)
      if (!/^(?:https?|data):/i.test(message.url)) {
        sendResponse({ error: "该资源是临时媒体流，无法直接下载" })
        return false
      }
      void chrome.downloads
        .download({ url: message.url, filename: resource?.filename, conflictAction: "uniquify", saveAs: false })
        .then((downloadId) => sendResponse({ downloadId }))
        .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : "下载失败" }))
      return true
    }

    return false
  })
}
