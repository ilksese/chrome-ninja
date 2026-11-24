import { runPageDomAction, type PageDomAction } from "@/page-control/dom-action"
import { snapshotPage, type PageSnapshot } from "@/page-control/snapshot"
import { pageControlTargetError } from "@/page-control/target"
import { toPageControlTabs, type PageControlTab } from "@/page-control/tabs"
import { clearRootedTab, linkOpenedTab, type PageControlTabTree } from "@/page-control/tab-tree"
import { singlePageControlGroup } from "@/page-control/tab-group"
import { waitForTabLoad } from "@/page-control/wait-load"
import { mergeOptions } from "@/store/options"

const pageControlPort = import.meta.env.VITE_CHROME_NINJA_PAGE_CONTROL_PORT || "8788"
const PAGE_CONTROL_SOCKET = `ws://127.0.0.1:${pageControlPort}`
const PAGE_CONTROL_ALARM = "page-control:reconnect"
const screenshotQuality = 60
const pageControlGroupTitle = "page-control"

let enabled = false
let socket: WebSocket | undefined
let retryTimer: number | undefined
// shortcut: records disappear when the service worker restarts, persist only if a restart must keep them
const openedTabs: PageControlTabTree = new Map()
// shortcut: id disappears when the service worker restarts, re-find the titled group after a restart
let pageControlGroupId: number | undefined

export function registerPageControlBackground() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.options) void syncPageControlConnection()
  })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PAGE_CONTROL_ALARM) void syncPageControlConnection()
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearRootedTab(openedTabs, tabId)
  })
  chrome.tabGroups.onRemoved.addListener((group) => {
    if (group.id === pageControlGroupId) pageControlGroupId = undefined
  })
  void syncPageControlConnection()
}

async function syncPageControlConnection() {
  const { options } = await chrome.storage.local.get(["options"])
  enabled = mergeOptions(options).pageControl.enabled
  if (!enabled) {
    disconnect()
    openedTabs.clear()
    pageControlGroupId = undefined
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
  const tab = await requireTab(action.tabId)
  if (action.action === "screenshot") {
    return captureActiveTab(tab)
  }
  if (injectsPage(action)) {
    const error = pageControlTargetError(tab.url)
    if (error) throw new Error(error)
  }
  await groupControlledTab(tab)
  if (action.action === "activate") {
    await activateTab(tab)
    return
  }
  if (action.action === "navigation") {
    return navigatePage(tab, action.url, action.newPage)
  }
  if (action.action === "history" && action.direction === "reload") {
    await chrome.tabs.reload(tab.id)
    return
  }
  if (action.action === "wait" && action.until === "load") {
    await waitForTabLoad(tab.id, action.timeout)
    return
  }
  if (action.action === "history") {
    // chrome.tabs.goBack/goForward throw even when history.length shows an entry.
    await injectDomAction(tab.id, action)
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
  await injectDomAction(tab.id, action)
}

function injectsPage(action: PageControlAction) {
  if (!("tabId" in action)) return false
  if (action.action === "activate" || action.action === "navigation" || action.action === "screenshot") return false
  if (action.action === "history" && action.direction === "reload") return false
  if (action.action === "wait" && action.until === "load") return false
  return true
}

async function captureActiveTab(tab: chrome.tabs.Tab & { id: number; windowId: number }): Promise<PageActionResult> {
  const error = pageControlTargetError(tab.url)
  if (error) throw new Error(error)
  await groupControlledTab(tab)
  // captureVisibleTab only sees the window's visible tab, so a background tab is shown and then restored.
  const previousId = tab.active ? undefined : await visibleTabId(tab.windowId)
  if (!tab.active) await chrome.tabs.update(tab.id, { active: true })
  try {
  // jpeg is only for checking the page, not a lossless capture.
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: screenshotQuality })
  if (!screenshot) throw new Error("没有生成页面截图")
  return { screenshot }
  } finally {
    if (previousId !== undefined && previousId !== tab.id) await chrome.tabs.update(previousId, { active: true })
  }
}

async function visibleTabId(windowId: number) {
  const [visible] = await chrome.tabs.query({ active: true, windowId })
  return visible?.id
}

async function requireTab(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab.id === undefined || tab.windowId === undefined) throw new Error("没有可控制的标签页")
    return tab as chrome.tabs.Tab & { id: number; windowId: number }
  } catch (error) {
    if (error instanceof Error && error.message === "没有可控制的标签页") throw error
    throw new Error("没有可控制的标签页")
  }
}

async function groupControlledTab(tab: chrome.tabs.Tab) {
  if (tab.id === undefined) throw new Error("没有可分组的标签页")
  const tabId = tab.id
  if (pageControlGroupId !== undefined) {
    try {
      await chrome.tabGroups.get(pageControlGroupId)
    } catch {
      pageControlGroupId = undefined
    }
  }
  // Querying by title before the title is written creates a second group.
  const titled = await chrome.tabGroups.query({ title: pageControlGroupTitle })
  const plan = singlePageControlGroup(
    pageControlGroupId,
    titled.map((group) => group.id)
  )
  const groupId = plan.keep ?? (await createPageControlGroup(tabId, tab.windowId))
  pageControlGroupId = groupId
  if (plan.keep !== undefined) await chrome.tabs.group({ tabIds: [tabId], groupId })
  await chrome.tabGroups.update(groupId, { title: pageControlGroupTitle })
  for (const extraId of plan.merge) {
    const members = await chrome.tabs.query({ groupId: extraId })
    const tabIds = members.flatMap((item) => (typeof item.id === "number" ? [item.id] : []))
    if (tabIds.length > 0) await chrome.tabs.group({ tabIds, groupId })
  }
}

async function createPageControlGroup(tabId: number, windowId: number | undefined) {
  return chrome.tabs.group({
    tabIds: [tabId],
    createProperties: windowId === undefined ? undefined : { windowId }
  })
}

async function activateTab(tab: chrome.tabs.Tab) {
  if (tab.id === undefined || tab.windowId === undefined) throw new Error("没有可控制的标签页")
  await chrome.windows.update(tab.windowId, { focused: true })
  await chrome.tabs.update(tab.id, { active: true })
}

async function injectDomAction(tabId: number, action: PageDomAction & { tabId: number }) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: runPageDomAction,
    args: [action]
  })
}

async function navigatePage(tab: chrome.tabs.Tab, url: string, newPage: boolean): Promise<PageActionResult | undefined> {
  if (tab.id === undefined || tab.windowId === undefined) throw new Error("没有可控制的标签页")
  if (!newPage) {
    await chrome.tabs.update(tab.id, { url })
    return
  }
  const child = await chrome.tabs.create({ url, active: true, windowId: tab.windowId, openerTabId: tab.id })
  if (child.id === undefined || child.windowId === undefined) throw new Error("没有打开新标签页")
  linkOpenedTab(openedTabs, tab.id, child.id)
  await groupControlledTab(child)
  return { tabId: child.id }
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
      tabs: result?.tabs,
      screenshot: result?.screenshot,
      tabId: result?.tabId
    })
  )
}

type PageActionResult = {
  snapshot?: PageSnapshot
  tabs?: PageControlTab[]
  screenshot?: string
  tabId?: number
}

type WithTab<T> = T & { tabId: number }

type PageControlAction =
  | WithTab<PageDomAction>
  | WithTab<{ action: "snapshot" }>
  | WithTab<{ action: "screenshot" }>
  | WithTab<{ action: "navigation"; url: string; newPage: boolean }>
  | WithTab<{ action: "history"; direction: "reload" }>
  | WithTab<{ action: "wait"; until: "load"; timeout: number }>
  | WithTab<{ action: "activate" }>
  | { action: "tab-list" }
