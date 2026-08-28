export type ListLoginStateTabsRequest = {
  target: "background"
  type: "listLoginStateTabs"
}

export type LoginStateExportRequest = {
  target: "background"
  type: "exportLoginState"
  tabId: number
  includeIndexedDB: boolean
}

export type LoginStateTab = {
  id: number
  title: string
  url: string
  host: string
  active: boolean
  lastFocusedWindow: boolean
}

export type PlaywrightCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
  partitionKey?: string
}

export type PlaywrightLocalStorageItem = {
  name: string
  value: string
}

export type PlaywrightIndexedDBIndex = {
  name: string
  keyPath?: string | string[]
  multiEntry: boolean
  unique: boolean
}

export type PlaywrightIndexedDBRecord = {
  key?: unknown
  value: unknown
}

export type PlaywrightIndexedDBObjectStore = {
  name: string
  autoIncrement: boolean
  keyPath?: string | string[]
  indexes: PlaywrightIndexedDBIndex[]
  records: PlaywrightIndexedDBRecord[]
}

export type PlaywrightIndexedDBDatabase = {
  name: string
  version: number
  stores: PlaywrightIndexedDBObjectStore[]
}

export type PlaywrightOriginStorage = {
  origin: string
  localStorage: PlaywrightLocalStorageItem[]
  indexedDB?: PlaywrightIndexedDBDatabase[]
}

export type PlaywrightStorageState = {
  cookies: PlaywrightCookie[]
  origins: PlaywrightOriginStorage[]
}

export type LoginStateExportSuccess = {
  ok: true
  state: PlaywrightStorageState
  warnings?: string[]
  filename: string
}

export type LoginStateExportFailure = {
  ok: false
  error: string
  warnings?: string[]
}

export type LoginStateTabsSuccess = {
  ok: true
  tabs: LoginStateTab[]
}

export type LoginStateTabsFailure = LoginStateExportFailure

export type LoginStateExportResponse = LoginStateExportSuccess | LoginStateExportFailure
export type LoginStateTabsResponse = LoginStateTabsSuccess | LoginStateTabsFailure
export type LoginStateBackgroundRequest = ListLoginStateTabsRequest | LoginStateExportRequest
