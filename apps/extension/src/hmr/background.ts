import {
  createEmptyHmrClientCounts,
  getHmrErrorMessage,
  HMR_CLIENT_PORT_PREFIX,
  HMR_ENABLED,
  HMR_EXECUTE_TIMEOUT_MS,
  HMR_HEALTH_URLS,
  isHmrClientScope,
  normalizeHmrResult,
  type HmrClientCounts,
  type HmrClientExecuteResultMessage,
  type HmrClientScope,
  type HmrExecuteJsMessage,
  type HmrExecuteJsResultMessage,
  type HmrHealthResponse,
	type HmrJsonValue,
	type HmrReloadClientMessage,
	type HmrReloadTabsMessage,
	type HmrServerMessage
} from "./protocol"

type ClientExecutionResult = {
  scope: HmrClientScope
  index: number
  ok: boolean
  result?: HmrJsonValue
  error?: string
}

const clientPorts: Record<HmrClientScope, Set<chrome.runtime.Port>> = {
  popup: new Set(),
  content: new Set(),
  options: new Set()
}

let started = false
let connecting = false
let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined
let heartbeatTimer: ReturnType<typeof globalThis.setInterval> | undefined

export function connectHmrBackground() {
  if (!HMR_ENABLED || started) return

  started = true
  chrome.runtime.onConnect.addListener(handlePort)
  void connectSocket()
}

async function connectSocket() {
  if (connecting || (socket && socket.readyState < WebSocket.CLOSING)) return

  connecting = true
  try {
    const webSocketUrl = await resolveWebSocketUrl()
    if (!webSocketUrl) {
      scheduleReconnect()
      return
    }

    socket = new WebSocket(webSocketUrl)
    socket.addEventListener("open", () => {
      sendSocketMessage({ type: "hmr:hello", scope: "background", clients: getClientCounts() })
      startHeartbeat()
    })
    socket.addEventListener("message", (event) => {
      void handleSocketMessage(event.data)
    })
    socket.addEventListener("close", () => {
      stopHeartbeat()
      socket = undefined
      scheduleReconnect()
    })
    socket.addEventListener("error", () => {
      socket?.close()
    })
  } finally {
    connecting = false
  }
}

async function resolveWebSocketUrl() {
  for (const healthUrl of HMR_HEALTH_URLS) {
    try {
      const response = await fetch(healthUrl)
      if (!response.ok) continue
      const body = (await response.json()) as HmrHealthResponse
      if (body.webSocketUrl) return body.webSocketUrl
    } catch {
      // The local HMR service is optional during normal extension development.
    }
  }

  return ""
}

async function handleSocketMessage(data: unknown) {
  if (typeof data !== "string") return

  let message: HmrServerMessage
  try {
    message = JSON.parse(data) as HmrServerMessage
  } catch {
    return
  }

  switch (message.type) {
    case "hmr:ping":
      sendSocketMessage({ type: "hmr:pong", clients: getClientCounts() })
      break
		case "hmr:reload-extension":
			chrome.runtime.reload()
			break
		case "hmr:reload-client":
			reloadClients(message)
			break
		case "hmr:reload-tabs":
			await reloadTabs(message)
			break
		case "hmr:execute-js":
			await handleExecuteMessage(message)
			break
	}
}

function reloadClients(message: HmrReloadClientMessage) {
  const scopes = getReloadClientScopes(message.scopes)

  for (const scope of scopes) {
    for (const port of clientPorts[scope]) {
      try {
        port.postMessage({ type: "hmr:reload-client", scopes: [scope], reason: message.reason })
      } catch {
        clientPorts[scope].delete(port)
      }
    }
  }

  sendHeartbeat()
}

async function reloadTabs(message: HmrReloadTabsMessage) {
  const matches = Array.isArray(message.matches) && message.matches.length > 0 ? message.matches : ["*://*/*"]
  const tabs = await chrome.tabs.query({})

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !matchesAnyPattern(tab.url, matches)) return

      try {
        await chrome.tabs.reload(tab.id)
      } catch (error) {
        console.warn("Failed to reload tab for HMR", error)
      }
    })
  )
}

function getReloadClientScopes(scopes: HmrReloadClientMessage["scopes"]): HmrClientScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) return Object.keys(clientPorts) as HmrClientScope[]
  return Array.from(new Set(scopes)).filter(isHmrClientScope)
}

function matchesAnyPattern(url: string, patterns: string[]) {
  return patterns.some((pattern) => matchesPattern(url, pattern))
}

function matchesPattern(url: string, pattern: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (pattern === "<all_urls>") return isReloadableProtocol(parsed.protocol)

  const match = /^(\*|http|https|file):\/\/([^/]*)(\/.*)$/.exec(pattern)
  if (!match) return false

  const [, schemePattern, hostPattern, pathPattern] = match
  return matchesScheme(parsed.protocol, schemePattern) && matchesHost(parsed.hostname, hostPattern) && matchesPath(parsed.pathname, pathPattern)
}

function matchesScheme(protocol: string, schemePattern: string) {
  const scheme = protocol.replace(/:$/, "")
  if (schemePattern === "*") return scheme === "http" || scheme === "https"
  return scheme === schemePattern
}

function matchesHost(hostname: string, hostPattern: string) {
  if (hostPattern === "" || hostPattern === "*") return true
  if (!hostPattern.startsWith("*.")) return hostname === hostPattern

  const baseHost = hostPattern.slice(2)
  return hostname === baseHost || hostname.endsWith(`.${baseHost}`)
}

function matchesPath(pathname: string, pathPattern: string) {
  return wildcardToRegExp(pathPattern || "/*").test(pathname)
}

function isReloadableProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:" || protocol === "file:"
}

function wildcardToRegExp(pattern: string) {
  return new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, ".*")}$`)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function handleExecuteMessage(message: HmrExecuteJsMessage) {
  try {
    const result = message.target === "page" ? await executeInPage(message) : await executeInClients(message)
    sendSocketMessage(result)
  } catch (error) {
    sendSocketMessage({
      type: "hmr:execute-js:result",
      requestId: message.requestId,
      target: message.target,
      ok: false,
      error: getHmrErrorMessage(error)
    })
  }
}

async function executeInPage(message: HmrExecuteJsMessage): Promise<HmrExecuteJsResultMessage> {
  const tabId = message.tabId ?? (await getActiveTabId())
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: Boolean(message.allFrames) },
    world: "MAIN",
    func: async (source: string) => {
      return await Promise.resolve(globalThis.eval(source))
    },
    args: [message.code]
  })

  return {
    type: "hmr:execute-js:result",
    requestId: message.requestId,
    target: message.target,
    ok: true,
    result: normalizeHmrResult(results.map(({ frameId, result }) => ({ frameId, result })))
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab available")
  return tab.id
}

async function executeInClients(message: HmrExecuteJsMessage): Promise<HmrExecuteJsResultMessage> {
  if (!isHmrClientScope(message.target)) {
    return createExecuteResult(message, false, undefined, `Unsupported target: ${message.target}`)
  }

  const ports = [...clientPorts[message.target]]
  if (ports.length === 0) {
    return createExecuteResult(message, false, undefined, `No ${message.target} clients connected`)
  }

  const results = await Promise.all(ports.map((port, index) => executeInPort(message.target as HmrClientScope, port, index, message)))
  const ok = results.every((result) => result.ok)
  const errors = results.filter((result) => !result.ok && result.error).map((result) => `${result.scope}[${result.index}]: ${result.error}`)

  return createExecuteResult(message, ok, normalizeHmrResult(results), errors.length > 0 ? errors.join("; ") : undefined)
}

function executeInPort(scope: HmrClientScope, port: chrome.runtime.Port, index: number, message: HmrExecuteJsMessage): Promise<ClientExecutionResult> {
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(() => {
      cleanup()
      resolve({ scope, index, ok: false, error: "Client execution timed out" })
    }, HMR_EXECUTE_TIMEOUT_MS)

    const onMessage = (response: unknown) => {
      if (!isClientExecuteResult(response) || response.requestId !== message.requestId) return
      cleanup()
      resolve({ scope, index, ok: response.ok, result: response.result, error: response.error })
    }
    const onDisconnect = () => {
      cleanup()
      resolve({ scope, index, ok: false, error: "Client disconnected" })
    }
    function cleanup() {
      globalThis.clearTimeout(timer)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
    }

    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try {
      port.postMessage(message)
    } catch (error) {
      cleanup()
      resolve({ scope, index, ok: false, error: getHmrErrorMessage(error) })
    }
  })
}

function createExecuteResult(message: HmrExecuteJsMessage, ok: boolean, result?: HmrJsonValue, error?: string): HmrExecuteJsResultMessage {
  return {
    type: "hmr:execute-js:result",
    requestId: message.requestId,
    target: message.target,
    ok,
    result,
    error
  }
}

function handlePort(port: chrome.runtime.Port) {
  const scope = getScopeFromPortName(port.name)
  if (scope) {
    registerPort(scope, port)
    return
  }

  const onMessage = (message: unknown) => {
    const messageScope = getScopeFromHello(message)
    if (!messageScope) return
    port.onMessage.removeListener(onMessage)
    registerPort(messageScope, port)
  }
  port.onMessage.addListener(onMessage)
}

function registerPort(scope: HmrClientScope, port: chrome.runtime.Port) {
  clientPorts[scope].add(port)
  sendHeartbeat()

  port.onDisconnect.addListener(() => {
    clientPorts[scope].delete(port)
    sendHeartbeat()
  })
}

function getScopeFromPortName(name: string) {
  if (!name.startsWith(HMR_CLIENT_PORT_PREFIX)) return undefined
  const scope = name.slice(HMR_CLIENT_PORT_PREFIX.length)
  return isHmrClientScope(scope) ? scope : undefined
}

function getScopeFromHello(message: unknown) {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as { type?: unknown; scope?: unknown }
  return candidate.type === "hmr:client:hello" && isHmrClientScope(candidate.scope) ? candidate.scope : undefined
}

function isClientExecuteResult(message: unknown): message is HmrClientExecuteResultMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrClientExecuteResultMessage>
  return candidate.type === "hmr:client:execute-result" && typeof candidate.requestId === "string" && typeof candidate.ok === "boolean"
}

function getClientCounts(): HmrClientCounts {
  const counts = createEmptyHmrClientCounts()
  for (const scope of Object.keys(clientPorts) as HmrClientScope[]) {
    counts[scope] = clientPorts[scope].size
  }
  return counts
}

function sendHeartbeat() {
  sendSocketMessage({ type: "hmr:heartbeat", clients: getClientCounts() })
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = globalThis.setInterval(sendHeartbeat, 15000)
}

function stopHeartbeat() {
  if (heartbeatTimer === undefined) return
  globalThis.clearInterval(heartbeatTimer)
  heartbeatTimer = undefined
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined) return
  reconnectTimer = globalThis.setTimeout(() => {
    reconnectTimer = undefined
    void connectSocket()
  }, 1000)
}

function sendSocketMessage(message: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}
