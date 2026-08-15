export const HMR_CLIENT_PORT_PREFIX = "hmr:"

export const HMR_CLIENT_SCOPES = ["popup", "content", "options"] as const
export const HMR_COMMANDS = ["storage:get", "storage:set", "tabs:query", "tabs:reload", "dom:query"] as const

export type HmrClientScope = (typeof HMR_CLIENT_SCOPES)[number]
export type HmrExecuteTarget = HmrClientScope | "page"
export type HmrCommandTarget = HmrClientScope | "background"
export type HmrCommandName = (typeof HMR_COMMANDS)[number]
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

export type HmrCommandMessage = {
  type: "hmr:command"
  requestId: string
  target: HmrCommandTarget
  command: HmrCommandName
  payload?: HmrJsonValue
  tabId?: number
  allFrames?: boolean
}

export type HmrServerMessage =
  | HmrPingMessage
  | HmrReloadExtensionMessage
  | HmrReloadClientMessage
  | HmrReloadTabsMessage
  | HmrExecuteJsMessage
  | HmrCommandMessage

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

export type HmrCommandResultMessage = {
  type: "hmr:command:result"
  requestId: string
  target: HmrCommandTarget
  command: HmrCommandName
  ok: boolean
  result?: HmrJsonValue
  error?: string
}

export type HmrClientCommandResultMessage = {
  type: "hmr:client:command-result"
  requestId: string
  scope: HmrClientScope
  command: HmrCommandName
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

export function isHmrCommandName(value: unknown): value is HmrCommandName {
  return typeof value === "string" && HMR_COMMANDS.includes(value as HmrCommandName)
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
