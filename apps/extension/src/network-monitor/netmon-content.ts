import { createElement, render } from "preact"
import type {
  NetmonError,
  NetmonFormEntry,
  NetmonHookEventPayload,
  NetmonOutcome,
  NetmonRequestBody,
  NetmonTabState
} from "./types"
import { NETMON_POST_SOURCE, PANEL_HOST_ATTR, PANEL_HOST_SELECTOR } from "./types"
import Panel from "./Panel"

const HOOK_URL = "src/network-monitor/hook.js"

const isTopFrame = window === window.top

let enabled = false
let panelHost: HTMLElement | null = null
let hookInjected = false

function injectHook(): void {
  if (hookInjected) return
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL(HOOK_URL)
  ;(document.head || document.documentElement).append(script)
  hookInjected = true
}

function mountPanel(state: NetmonTabState) {
  if (!isTopFrame) return
  let host = document.querySelector<HTMLElement>(PANEL_HOST_SELECTOR)
  if (!host) {
    host = document.createElement("div")
    host.setAttribute(PANEL_HOST_ATTR, "")
    document.documentElement.appendChild(host)
  }
  panelHost = host
  render(createElement(Panel, { initial: state }), host)
}

function applyState(state: NetmonTabState) {
  setEnabled(Boolean(state.enabled))
  if (state.enabled) {
    mountPanel(state)
  } else {
    unmountPanel()
  }
}

function unmountPanel() {
  if (!panelHost) return
  render(null, panelHost)
  panelHost.remove()
  panelHost = null
}

function setEnabled(next: boolean) {
  enabled = next
  if (enabled) {
    injectHook()
    window.addEventListener("message", onWindowMessage)
  } else {
    window.removeEventListener("message", onWindowMessage)
    unmountPanel()
  }
}

function parseHeaders(raw: unknown): NetmonHookEventPayload["requestHeaders"] {
  if (!Array.isArray(raw)) return []
  return raw.filter((header): header is { name: string; value: string } =>
    Boolean(header && typeof header.name === "string" && typeof header.value === "string")
  )
}

function parseBody(raw: unknown): NetmonHookEventPayload["body"] {
  if (!raw || typeof raw !== "object") return null
  const body = raw as Record<string, unknown>
  if ((body.mode !== "json" && body.mode !== "raw") || typeof body.text !== "string") return null
  return { mode: body.mode, text: body.text, truncated: Boolean(body.truncated) }
}

function parseRequestBody(raw: unknown): NetmonRequestBody | null {
  if (raw === null) return null
  if (!raw || typeof raw !== "object") return { kind: "unavailable", description: "此记录未提供请求体信息" }
  const body = raw as Record<string, unknown>
  if (body.kind === "text") {
    const text = parseBody(body)
    if (text) return { kind: "text", ...text, ...(typeof body.note === "string" ? { note: body.note } : {}) }
  }
  if (body.kind === "unavailable" && typeof body.description === "string") {
    return { kind: "unavailable", description: body.description }
  }
  if (body.kind === "urlencoded" && typeof body.text === "string" && Array.isArray(body.entries)) {
    const entries = parseHeaders(body.entries)
    return {
      kind: "urlencoded",
      text: body.text,
      entries,
      truncated: Boolean(body.truncated) || entries.length !== body.entries.length,
      ...(typeof body.note === "string" ? { note: body.note } : {})
    }
  }
  if (body.kind === "formdata" && Array.isArray(body.entries)) {
    const entries: NetmonFormEntry[] = []
    for (const entry of body.entries) {
      if (!entry || typeof entry.name !== "string") continue
      if (typeof entry.value === "string") entries.push({ name: entry.name, value: entry.value })
      else if (
        entry.file &&
        typeof entry.file.name === "string" &&
        typeof entry.file.type === "string" &&
        Number.isFinite(entry.file.size)
      ) {
        entries.push({
          name: entry.name,
          file: { name: entry.file.name, type: entry.file.type, size: entry.file.size }
        })
      }
    }
    return { kind: "formdata", entries, truncated: Boolean(body.truncated) || entries.length !== body.entries.length }
  }
  return { kind: "unavailable", description: "请求体信息无法解析" }
}

function parseEvent(raw: string): NetmonHookEventPayload | null {
  let payload: {
    source?: string
    type?: string
    requestId?: string
    method?: string
    url?: string
    frameUrl?: string
    status?: number
    duration?: number
    requestHeaders?: unknown
    responseHeaders?: unknown
    requestBody?: unknown
    body?: unknown
    bodyNote?: unknown
    outcome?: unknown
    error?: unknown
  }
  try {
    payload = JSON.parse(raw)
  } catch {
    return null
  }
  if (payload?.source !== NETMON_POST_SOURCE || payload?.type !== "event") return null
  const rawUrl = String(payload.url || "")
  let url = rawUrl
  try {
    url = new URL(rawUrl, location.href).href
  } catch {
    // keep raw
  }
  const status = Number(payload.status) || 0
  const outcomes: NetmonOutcome[] = ["success", "http-error", "network-error", "aborted", "timeout", "unknown"]
  const outcome = outcomes.includes(payload.outcome as NetmonOutcome)
    ? (payload.outcome as NetmonOutcome)
    : status >= 400 && status <= 599
      ? "http-error"
      : status === 0
        ? "unknown"
        : "success"
  const rawError = payload.error as Partial<NetmonError> | null
  const error =
    rawError && typeof rawError.name === "string" && typeof rawError.message === "string"
      ? { name: rawError.name, message: rawError.message }
      : null
  return {
    requestId: payload.requestId || "",
    method: String(payload.method || "GET").toUpperCase(),
    url,
    frameUrl: String(payload.frameUrl || location.href),
    status,
    duration: Number(payload.duration) || 0,
    requestHeaders: parseHeaders(payload.requestHeaders),
    responseHeaders: parseHeaders(payload.responseHeaders),
    requestBody: parseRequestBody(payload.requestBody),
    body: parseBody(payload.body),
    bodyNote: typeof payload.bodyNote === "string" ? payload.bodyNote : null,
    outcome,
    error
  }
}

function forwardEvent(payload: NetmonHookEventPayload) {
  if (!enabled || !payload.url || !/^https?:/i.test(payload.url)) return
  void chrome.runtime.sendMessage({ target: "netmon", type: "EVENT", event: payload })
}

function onWindowMessage(event: MessageEvent<unknown>) {
  if (event.source !== window || typeof event.data !== "string") return
  const payload = parseEvent(event.data)
  if (payload) forwardEvent(payload)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "netmon-frame") return false
  if (message.type === "SYNC") {
    setEnabled(Boolean(message.enabled))
    sendResponse({ ok: true })
    return true
  }
  if (message.type === "STATE") {
    applyState(message.state as NetmonTabState)
    return false
  }
  return false
})

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    enabled = false
    unmountPanel()
  }
})

chrome.runtime.sendMessage({ target: "netmon", type: "GET_STATE" }).then((res) => {
  const state = (res as { state?: NetmonTabState } | undefined)?.state
  if (state) applyState(state)
})
