export const DEV_BRIDGE_CLIENT_PORT_PREFIX = "dev-bridge:"

export const DEV_BRIDGE_CLIENT_SCOPES = ["popup", "content", "options"] as const
export const DEV_BRIDGE_COMMANDS = ["storage:get", "storage:set", "tabs:query", "tabs:reload", "dom:query"] as const

export type DevBridgeClientScope = (typeof DEV_BRIDGE_CLIENT_SCOPES)[number]
export type DevBridgeExecuteTarget = DevBridgeClientScope | "page"
export type DevBridgeCommandTarget = DevBridgeClientScope | "background"
export type DevBridgeCommandName = (typeof DEV_BRIDGE_COMMANDS)[number]
export type DevBridgeClientCounts = Record<DevBridgeClientScope, number>
export type DevBridgeJsonValue = null | boolean | number | string | DevBridgeJsonValue[] | { [key: string]: DevBridgeJsonValue }

export type DevBridgeHealthResponse = {
  ok: boolean
  service?: string
  version?: string
  uptimeMs?: number
  webSocketUrl?: string
  features?: string[]
  clients?: DevBridgeClientCounts & { background: number }
}

export type DevBridgePingMessage = {
  type: "dev-bridge:ping"
  sentAt?: number
}

export type DevBridgeReloadExtensionMessage = {
  type: "dev-bridge:reload-extension"
  reason?: string
}

export type DevBridgeReloadClientMessage = {
  type: "dev-bridge:reload-client"
  scopes?: DevBridgeClientScope[]
  reason?: string
}

export type DevBridgeReloadTabsMessage = {
  type: "dev-bridge:reload-tabs"
  matches?: string[]
  reason?: string
}

export type DevBridgeExecuteJsMessage = {
  type: "dev-bridge:execute-js"
  requestId: string
  target: DevBridgeExecuteTarget
  code: string
  tabId?: number
  allFrames?: boolean
}

export type DevBridgeCommandMessage = {
  type: "dev-bridge:command"
  requestId: string
  target: DevBridgeCommandTarget
  command: DevBridgeCommandName
  payload?: DevBridgeJsonValue
  tabId?: number
  allFrames?: boolean
}

export type DevBridgeServerMessage =
  | DevBridgePingMessage
  | DevBridgeReloadExtensionMessage
  | DevBridgeReloadClientMessage
  | DevBridgeReloadTabsMessage
  | DevBridgeExecuteJsMessage
  | DevBridgeCommandMessage

export type DevBridgeExecuteJsResultMessage = {
  type: "dev-bridge:execute-js:result"
  requestId: string
  target: DevBridgeExecuteTarget
  ok: boolean
  result?: DevBridgeJsonValue
  error?: string
}

export type DevBridgeClientHelloMessage = {
  type: "dev-bridge:client:hello"
  scope: DevBridgeClientScope
}

export type DevBridgeClientExecuteResultMessage = {
  type: "dev-bridge:client:execute-result"
  requestId: string
  scope: DevBridgeClientScope
  ok: boolean
  result?: DevBridgeJsonValue
  error?: string
}

export type DevBridgeCommandResultMessage = {
  type: "dev-bridge:command:result"
  requestId: string
  target: DevBridgeCommandTarget
  command: DevBridgeCommandName
  ok: boolean
  result?: DevBridgeJsonValue
  error?: string
}

export type DevBridgeClientCommandResultMessage = {
  type: "dev-bridge:client:command-result"
  requestId: string
  scope: DevBridgeClientScope
  command: DevBridgeCommandName
  ok: boolean
  result?: DevBridgeJsonValue
  error?: string
}

export function createEmptyDevBridgeClientCounts(): DevBridgeClientCounts {
  return { popup: 0, content: 0, options: 0 }
}

export function isDevBridgeClientScope(value: unknown): value is DevBridgeClientScope {
  return typeof value === "string" && DEV_BRIDGE_CLIENT_SCOPES.includes(value as DevBridgeClientScope)
}

export function isDevBridgeCommandName(value: unknown): value is DevBridgeCommandName {
  return typeof value === "string" && DEV_BRIDGE_COMMANDS.includes(value as DevBridgeCommandName)
}

export function normalizeDevBridgeResult(value: unknown): DevBridgeJsonValue {
  try {
    const json = JSON.stringify(value, (_, nextValue: unknown) => {
      if (typeof nextValue === "bigint") return nextValue.toString()
      if (typeof nextValue === "function") return `[Function ${nextValue.name || "anonymous"}]`
      if (typeof nextValue === "symbol") return String(nextValue)
      return nextValue
    })
    return json === undefined ? null : (JSON.parse(json) as DevBridgeJsonValue)
  } catch {
    return stringifyFallback(value)
  }
}

export function getDevBridgeErrorMessage(error: unknown): string {
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
