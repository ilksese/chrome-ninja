import { pageControlTargetError } from "@/page-control/target"
import { snapshotPage, type PageSnapshot } from "@/page-control/snapshot"
import { toPageControlTabs, type PageControlTab } from "@/page-control/tabs"
import { mergeOptions } from "@/store/options"

const pageControlPort = import.meta.env.VITE_CHROME_NINJA_PAGE_CONTROL_PORT || "8788"
const PAGE_CONTROL_SOCKET = `ws://127.0.0.1:${pageControlPort}`
const PAGE_CONTROL_ALARM = "page-control:reconnect"

let enabled = false
let socket: WebSocket | undefined
let retryTimer: number | undefined

export function registerPageControlBackground() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.options) void syncPageControlConnection()
  })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PAGE_CONTROL_ALARM) void syncPageControlConnection()
  })
  void syncPageControlConnection()
}

async function syncPageControlConnection() {
  const { options } = await chrome.storage.local.get(["options"])
  enabled = mergeOptions(options).pageControl.enabled
  if (!enabled) {
    disconnect()
    await chrome.alarms.clear(PAGE_CONTROL_ALARM)
    return
  }

  await chrome.alarms.create(PAGE_CONTROL_ALARM, { periodInMinutes: 1 })
  connect()
}

function connect() {
  if (!enabled || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
  const nextSocket = new WebSocket(PAGE_CONTROL_SOCKET)
  socket = nextSocket
  nextSocket.addEventListener("message", (event) => {
    void handleScrollMessage(nextSocket, String(event.data))
  })
  nextSocket.addEventListener("close", () => {
    if (socket === nextSocket) socket = undefined
    scheduleRetry()
  })
  nextSocket.addEventListener("error", () => {
    if (socket === nextSocket) nextSocket.close()
  })
}

function disconnect() {
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  socket?.close()
  socket = undefined
}

function scheduleRetry() {
  if (!enabled || retryTimer !== undefined) return
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    connect()
  }, 2000)
}

async function handleScrollMessage(source: WebSocket, data: string) {
  let message: { type?: string; requestId?: string; action?: PageControlAction }
  try {
    message = JSON.parse(data) as { type?: string; requestId?: string; action?: PageControlAction }
  } catch {
    return
  }
  if (message.type !== "page-control:action" || typeof message.requestId !== "string") return
  if (!enabled || !message.action) {
    sendResult(source, message.requestId, false, "页面控制未开启")
    return
  }

  try {
    const result = await runPageAction(message.action)
    sendResult(source, message.requestId, true, undefined, result)
  } catch (error) {
    sendResult(source, message.requestId, false, error instanceof Error ? error.message : "页面操作失败")
  }
}

async function runPageAction(action: PageControlAction): Promise<PageActionResult | undefined> {
  if (action.action === "tab-list") {
    return { tabs: toPageControlTabs(await chrome.tabs.query({ lastFocusedWindow: true })) }
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (action.action === "navigation") {
    await navigatePage(action.url, action.newPage, tab?.windowId)
    return
  }
  if (!tab?.id) throw new Error("没有可控制的活动标签页")
  const error = pageControlTargetError(tab.url)
  if (error) throw new Error(error)
  if (action.action === "scroll") {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollTopDocument,
      args: [action.x, action.y]
    })
    return
  }
  if (action.action === "snapshot") {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: snapshotPage
    })
    if (!injected?.result) throw new Error("没有生成页面快照")
    return { snapshot: injected.result }
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: clickPageTarget,
    args: [action.selector ?? "", action.xpath ?? ""]
  })
}

async function navigatePage(url: string, newPage: boolean, windowId?: number) {
  if (newPage) {
    await chrome.tabs.create({ url, active: true, windowId })
    return
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id) throw new Error("没有可控制的活动标签页")
  await chrome.tabs.update(tab.id, { url })
}

function scrollTopDocument(x: number, y: number) {
  const scroller = document.scrollingElement ?? document.documentElement
  scroller.scrollBy({ left: x, top: y, behavior: "instant" })
}

function clickPageTarget(selector: string, xpath: string) {
  const target = selector
    ? document.querySelector(selector)
    : document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
  const clickable = target as { click?: unknown } | null
  if (!clickable || typeof clickable.click !== "function") throw new Error("没有找到要点击的元素")
  clickable.click()
}

function sendResult(source: WebSocket, requestId: string, ok: boolean, error?: string, result?: PageActionResult) {
  if (source.readyState !== WebSocket.OPEN) return
  source.send(
    JSON.stringify({
      type: "page-control:action-result",
      requestId,
      ok,
      error,
      snapshot: result?.snapshot,
      tabs: result?.tabs
    })
  )
}

type PageActionResult = {
  snapshot?: PageSnapshot
  tabs?: PageControlTab[]
}

type PageControlAction =
  | { action: "scroll"; x: number; y: number }
  | { action: "click"; selector?: string; xpath?: string }
  | { action: "snapshot" }
  | { action: "navigation"; url: string; newPage: boolean }
  | { action: "tab-list" }
