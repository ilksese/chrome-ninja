import { createElement, render } from "preact"
import type { NetmonHookEventPayload, NetmonTabState } from "./types"
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
    body?: unknown
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
  return {
    requestId: payload.requestId || "",
    method: String(payload.method || "GET").toUpperCase(),
    url,
    frameUrl: String(payload.frameUrl || location.href),
    status: Number(payload.status) || 0,
    duration: Number(payload.duration) || 0,
    requestHeaders: Array.isArray(payload.requestHeaders) ? (payload.requestHeaders as NetmonHookEventPayload["requestHeaders"]) : [],
    responseHeaders: Array.isArray(payload.responseHeaders) ? (payload.responseHeaders as NetmonHookEventPayload["responseHeaders"]) : [],
    body: payload.body && typeof payload.body === "object" ? (payload.body as NetmonHookEventPayload["body"]) : null
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
