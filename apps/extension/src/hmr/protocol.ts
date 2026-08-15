export const HMR_HEALTH_URLS = ["https://127.0.0.1:8787/health", "http://127.0.0.1:8787/health"]
export const HMR_CLIENT_PORT_PREFIX = "hmr:"
export const HMR_EXECUTE_TIMEOUT_MS = 10000
export const HMR_ENABLED = import.meta.env.DEV || import.meta.env.VITE_CHROME_NINJA_HMR === "true"

export const HMR_CLIENT_SCOPES = ["popup", "content", "options"] as const

export type HmrClientScope = (typeof HMR_CLIENT_SCOPES)[number]
export type HmrExecuteTarget = HmrClientScope | "page"
export type HmrClientCounts = Record<HmrClientScope, number>
export type HmrJsonValue = null | boolean | number | string | HmrJsonValue[] | { [key: string]: HmrJsonValue }

export type HmrHealthResponse = {
  ok: boolean
  service?: string
  version?: string
  uptimeMs?: number
  webSocketUrl?: string
  features?: string[]
  clients?: HmrClientCounts & { background: number }
}

export type HmrPingMessage = {
  type: "hmr:ping"
  sentAt?: number
}

export type HmrReloadExtensionMessage = {
  type: "hmr:reload-extension"
  reason?: string
}

export type HmrReloadClientMessage = {
  type: "hmr:reload-client"
  scopes?: HmrClientScope[]
  reason?: string
}

export type HmrReloadTabsMessage = {
  type: "hmr:reload-tabs"
  matches?: string[]
  reason?: string
}

export type HmrExecuteJsMessage = {
  type: "hmr:execute-js"
  requestId: string
  target: HmrExecuteTarget
  code: string
  tabId?: number
  allFrames?: boolean
}

export type HmrServerMessage = HmrPingMessage | HmrReloadExtensionMessage | HmrReloadClientMessage | HmrReloadTabsMessage | HmrExecuteJsMessage

export type HmrExecuteJsResultMessage = {
  type: "hmr:execute-js:result"
  requestId: string
  target: HmrExecuteTarget
  ok: boolean
  result?: HmrJsonValue
  error?: string
}

export type HmrClientHelloMessage = {
  type: "hmr:client:hello"
  scope: HmrClientScope
}

export type HmrClientExecuteResultMessage = {
  type: "hmr:client:execute-result"
  requestId: string
  scope: HmrClientScope
  ok: boolean
  result?: HmrJsonValue
  error?: string
}

export function createEmptyHmrClientCounts(): HmrClientCounts {
  return { popup: 0, content: 0, options: 0 }
}

export function isHmrClientScope(value: unknown): value is HmrClientScope {
  return typeof value === "string" && HMR_CLIENT_SCOPES.includes(value as HmrClientScope)
}

export function normalizeHmrResult(value: unknown): HmrJsonValue {
  try {
    const json = JSON.stringify(value, (_, nextValue: unknown) => {
      if (typeof nextValue === "bigint") return nextValue.toString()
      if (typeof nextValue === "function") return `[Function ${nextValue.name || "anonymous"}]`
      if (typeof nextValue === "symbol") return String(nextValue)
      return nextValue
    })
    return json === undefined ? null : (JSON.parse(json) as HmrJsonValue)
  } catch {
    return stringifyFallback(value)
  }
}

export function getHmrErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return stringifyFallback(error)
}

function stringifyFallback(value: unknown) {
  try {
    return String(value)
  } catch {
    return "[unserializable]"
  }
}
