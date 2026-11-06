import type {
  NetmonCommand,
  NetmonCommandMessage,
  NetmonEventMessage,
  NetmonGetStateMessage,
  NetmonRecord,
  NetmonStateMessage,
  NetmonTabState
} from "./types"
import { RECORD_LIMIT, SESSION_STATE_KEY } from "./types"

interface NetmonPersistedState {
  enabled: boolean
  rules: NetmonTabState["rules"]
}

const tabsState = new Map<number, NetmonTabState>()
const injecting = new Set<number>()
let restoringTabs: Promise<void> = Promise.resolve()

function randomId(): string {
  return Math.random().toString(36).slice(2)
}

function createState(): NetmonTabState {
  return { enabled: false, rules: [], records: [] }
}

async function persistTabSettings(): Promise<void> {
  const map: Record<string, NetmonPersistedState> = {}
  for (const [tabId, state] of tabsState) {
    map[String(tabId)] = { enabled: state.enabled, rules: state.rules }
  }
  try {
    await chrome.storage.session.set({ [SESSION_STATE_KEY]: map })
  } catch {
    // Best-effort persistence; session storage may be unavailable mid-shutdown.
  }
}

async function loadAndRestoreTabs(): Promise<void> {
  try {
    const all = await chrome.storage.session.get(SESSION_STATE_KEY)
    const map = (all[SESSION_STATE_KEY] as Record<string, NetmonPersistedState> | undefined) ?? {}
    for (const [key, saved] of Object.entries(map)) {
      const tabId = Number(key)
      if (!Number.isInteger(tabId) || !saved) continue
      const state = getTabState(tabId)
      state.enabled = Boolean(saved.enabled)
      state.rules = Array.isArray(saved.rules) ? saved.rules : []
      if (state.enabled) void broadcastState(tabId)
    }
  } catch {
    // Restore is best-effort.
  }
}

function snapshot(state: NetmonTabState): NetmonTabState {
  return { enabled: state.enabled, rules: [...state.rules], records: [...state.records] }
}

function matchesAnyRule(url: string, rules: NetmonTabState["rules"]): boolean {
  return rules.some((rule) => url.includes(rule.pattern))
}

async function broadcastState(tabId: number): Promise<void> {
  const state = tabsState.get(tabId)
  if (!state) return
  const message: NetmonStateMessage = { target: "netmon-frame", type: "STATE", state: snapshot(state) }
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined)
}

function getTabState(tabId: number): NetmonTabState {
  let state = tabsState.get(tabId)
  if (!state) {
    state = createState()
    tabsState.set(tabId, state)
  }
  return state
}

function handleEvent(event: NetmonEventMessage["event"], tabId: number, frameId: number): void {
  const state = getTabState(tabId)
  if (!state.enabled) return
  // No rules means nothing is being observed.
  if (state.rules.length === 0 || !matchesAnyRule(event.url, state.rules)) return
  if (event.requestId && state.records.some((record) => record.id === event.requestId && record.frameId === frameId))
    return

  const record: NetmonRecord = {
    id: event.requestId || randomId(),
    tabId,
    frameId,
    frameUrl: event.frameUrl,
    method: event.method,
    url: event.url,
    status: event.status,
    duration: event.duration,
    requestHeaders: event.requestHeaders,
    responseHeaders: event.responseHeaders,
    requestBody: event.requestBody,
    body: event.body,
    bodyNote: event.bodyNote,
    outcome: event.outcome,
    error: event.error,
    ts: Date.now()
  }
  state.records = [...state.records, record].slice(-RECORD_LIMIT)
  void broadcastState(tabId)
}

function handleCommand(command: NetmonCommand, tabId: number, tabUrl?: string): void {
  const state = getTabState(tabId)
  switch (command.name) {
    case "toggle":
      state.enabled = !state.enabled
      if (!state.enabled) state.records = []
      break
    case "addRule": {
      const pattern = (command.pattern ?? "").trim()
      if (!pattern) return
      if (!state.rules.some((rule) => rule.pattern === pattern)) {
        state.rules = [...state.rules, { id: randomId(), pattern }]
      }
      break
    }
    case "removeRule":
      state.rules = state.rules.filter((rule) => rule.id !== command.id)
      if (state.rules.length === 0) {
        state.records = []
      }
      break
    case "stop":
      state.enabled = false
      state.records = []
      state.rules = []
      break
  }
  void persistTabSettings()
  void broadcastState(tabId)
  if (state.enabled) void ensureTabNetmon(tabId, tabUrl ?? "")
}

function canInject(url?: string): boolean {
  if (!url) return false
  try {
    return ["http:", "https:", "file:", "ftp:"].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function getNetmonScriptFiles(): string | null {
  const entry = chrome.runtime
    .getManifest()
    .content_scripts?.find(({ js }) => js?.some((file) => file.includes("netmon-content.ts")))
  return entry?.js?.find((file) => file.includes("netmon-content.ts")) ?? null
}

async function ensureTabNetmon(tabId: number, url: string): Promise<void> {
  if (!canInject(url) || injecting.has(tabId)) return
  try {
    await chrome.tabs.sendMessage(tabId, { target: "netmon-frame", type: "SYNC", enabled: true })
    void broadcastState(tabId)
  } catch {
    const js = getNetmonScriptFiles()
    if (!js) return
    injecting.add(tabId)
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [js] })
      await chrome.tabs.sendMessage(tabId, { target: "netmon-frame", type: "SYNC", enabled: true })
      void broadcastState(tabId)
    } finally {
      injecting.delete(tabId)
    }
  }
}

async function getContextTab(sender: chrome.runtime.MessageSender): Promise<chrome.tabs.Tab | undefined> {
  if (sender.tab?.id) return sender.tab
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tab
}

export async function toggleNetmonForTab(tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab || tab.id === undefined || tab.id < 0 || !/^https?:\/\//i.test(tab.url ?? "")) return
  await restoringTabs
  handleCommand({ name: "toggle" }, tab.id, tab.url)
}

export function registerNetmonBackground(): void {
  restoringTabs = loadAndRestoreTabs()

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const msg = message as NetmonEventMessage | NetmonCommandMessage | NetmonGetStateMessage
    if (msg?.target !== "netmon") return false

    void (async () => {
      await restoringTabs
      const tab = await getContextTab(sender)
      const tabId = tab?.id
      if (!tabId) {
        sendResponse({ ok: false, error: "找不到目标标签页" })
        return
      }
      switch (msg.type) {
        case "EVENT":
          handleEvent(msg.event, tabId, sender.frameId ?? 0)
          break
        case "COMMAND": {
          handleCommand(msg.command, tabId, tab.url)
          break
        }
        case "GET_STATE": {
          sendResponse({ ok: true, state: snapshot(getTabState(tabId)) })
          return
        }
      }
      sendResponse({ ok: true })
    })()

    return true
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabsState.delete(tabId)
    injecting.delete(tabId)
    void persistTabSettings()
  })

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    tabsState.delete(removedTabId)
    injecting.delete(removedTabId)
    tabsState.delete(addedTabId)
    void persistTabSettings()
  })
}
