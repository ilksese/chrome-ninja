export const NETMON_HOOK_FLAG = "__chromeNinjaNetmonHooked"
export const NETMON_POST_SOURCE = "chrome-ninja-netmon"

export const PANEL_HOST_ATTR = "data-netmon-panel"
export const PANEL_HOST_SELECTOR = `[${PANEL_HOST_ATTR}]`

export const RECORD_LIMIT = 50
export const SESSION_STATE_KEY = "netmon:tabs"

export type NetmonHeader = {
  name: string
  value: string
}

export type NetmonBody = {
  mode: "json" | "raw"
  text: string
  truncated?: boolean
  note?: string
}

export type NetmonParameter = {
  name: string
  value: string
}

export type NetmonFormEntry = NetmonParameter | { name: string; file: { name: string; type: string; size: number } }

export type NetmonRequestBody =
  | (NetmonBody & { kind: "text" })
  | { kind: "urlencoded"; text: string; entries: NetmonParameter[]; truncated: boolean; note?: string }
  | { kind: "formdata"; entries: NetmonFormEntry[]; truncated: boolean }
  | { kind: "unavailable"; description: string }

export type NetmonOutcome = "success" | "http-error" | "network-error" | "aborted" | "timeout" | "unknown"

export type NetmonError = {
  name: string
  message: string
}

export type NetmonRecord = {
  id: string
  tabId: number
  frameId: number
  frameUrl: string
  method: string
  url: string
  status: number
  duration: number
  requestHeaders: NetmonHeader[]
  responseHeaders: NetmonHeader[]
  requestBody: NetmonRequestBody | null
  body: NetmonBody | null
  bodyNote: string | null
  outcome: NetmonOutcome
  error: NetmonError | null
  ts: number
}

export type NetmonRule = {
  id: string
  pattern: string
}

export type NetmonTabState = {
  enabled: boolean
  rules: NetmonRule[]
  records: NetmonRecord[]
}

export type NetmonCommand =
  { name: "toggle" } | { name: "addRule"; pattern: string } | { name: "removeRule"; id: string } | { name: "stop" }

export type NetmonHookEventPayload = {
  requestId: string
  method: string
  url: string
  frameUrl: string
  status: number
  duration: number
  requestHeaders: NetmonHeader[]
  responseHeaders: NetmonHeader[]
  requestBody: NetmonRequestBody | null
  body: NetmonBody | null
  bodyNote: string | null
  outcome: NetmonOutcome
  error: NetmonError | null
}

export type NetmonGetStateMessage = {
  target: "netmon"
  type: "GET_STATE"
}

export type NetmonEventMessage = {
  target: "netmon"
  type: "EVENT"
  event: NetmonHookEventPayload
}

export type NetmonCommandMessage = {
  target: "netmon"
  type: "COMMAND"
  command: NetmonCommand
}

export type NetmonStateMessage = {
  target: "netmon-frame"
  type: "STATE"
  state: NetmonTabState
}
