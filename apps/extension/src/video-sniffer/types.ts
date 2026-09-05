export type VideoResourceKind = "video" | "audio" | "playlist" | "manifest" | "blob" | "media"

export type VideoResourceSource = "network" | "page"

export type VideoResource = {
  id: string
  tabId: number
  url: string
  pageUrl: string
  title: string
  filename: string
  mimeType: string
  size?: number
  kind: VideoResourceKind
  source: VideoResourceSource
  detectedAt: number
}

export type VideoSnifferResponse = {
  resources?: VideoResource[]
  error?: string
  downloadId?: number
}
