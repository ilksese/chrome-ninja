import type {
  LoginStateBackgroundRequest,
  LoginStateExportRequest,
  LoginStateExportResponse,
  LoginStateTab,
  LoginStateTabsResponse,
  PlaywrightCookie,
  PlaywrightIndexedDBDatabase,
  PlaywrightIndexedDBIndex,
  PlaywrightIndexedDBObjectStore,
  PlaywrightIndexedDBRecord,
  PlaywrightOriginStorage
} from "./types"

type ChromeCookieWithPartitionKey = chrome.cookies.Cookie & { partitionKey?: unknown }
type ChromeCookiePartitionKey = { topLevelSite?: string }
type OriginStorageResult = chrome.scripting.InjectionResult<PlaywrightOriginStorage>

export function registerLoginStateExportBackground() {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isLoginStateMessage(message)) {
      return false
    }

    void (async () => {
      const response = message.type === "listLoginStateTabs" ? await listLoginStateTabs() : await exportLoginState(message)
      sendResponse(response)
    })()

    return true
  })
}

function isLoginStateMessage(message: unknown): message is LoginStateBackgroundRequest {
  const value = message as Partial<LoginStateBackgroundRequest> | null
  return value?.target === "background" && (value.type === "listLoginStateTabs" || value.type === "exportLoginState")
}

async function listLoginStateTabs(): Promise<LoginStateTabsResponse> {
  try {
    const [tabs, lastFocusedWindow] = await Promise.all([chrome.tabs.query({}), chrome.windows.getLastFocused()])
    return {
      ok: true,
      tabs: tabs.flatMap((tab) => toLoginStateTab(tab, lastFocusedWindow.id))
    }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) }
  }
}

function toLoginStateTab(tab: chrome.tabs.Tab, lastFocusedWindowId?: number): LoginStateTab[] {
  if (typeof tab.id !== "number" || !tab.url) {
    return []
  }

  const url = parseHttpUrl(tab.url)
  if (!url) {
    return []
  }

  return [
    {
      id: tab.id,
      title: tab.title || url.href,
      url: url.href,
      host: url.hostname,
      active: Boolean(tab.active),
      lastFocusedWindow: tab.windowId === lastFocusedWindowId
    }
  ]
}

async function exportLoginState(request: LoginStateExportRequest): Promise<LoginStateExportResponse> {
  const warnings: string[] = []
  if (typeof request.tabId !== "number") {
    return { ok: false, error: "找不到目标标签" }
  }

  try {
    const tab = await getTargetTab(request.tabId)
    if (!tab) {
      return { ok: false, error: "找不到目标标签" }
    }
    const url = tab.url ? parseHttpUrl(tab.url) : undefined
    if (!url) {
      return { ok: false, error: "目标标签不是可导出的 http/https 页面" }
    }

    const origin = url.origin
    const host = url.hostname.toLowerCase()
    const origins = await collectOriginStorage(request.tabId, origin, request.includeIndexedDB)
    const cookies = await collectCookies(request.tabId, origins.map((originStorage) => new URL(originStorage.origin).hostname.toLowerCase()), warnings)

    return {
      ok: true,
      state: { cookies, origins },
      warnings: warnings.length ? warnings : undefined,
      filename: createFilename(host)
    }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error), warnings: warnings.length ? warnings : undefined }
  }
}

async function getTargetTab(tabId: number) {
  try {
    return await chrome.tabs.get(tabId)
  } catch {
    return undefined
  }
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined
  } catch {
    return undefined
  }
}

async function collectCookies(tabId: number, hosts: string[], warnings: string[]) {
  const stores = await chrome.cookies.getAllCookieStores()
  const store = stores.find((item) => item.tabIds.includes(tabId))
  const cookies = store ? await chrome.cookies.getAll({ storeId: store.id }) : await chrome.cookies.getAll({})

  return cookies.flatMap((cookie) => toPlaywrightCookie(cookie, hosts, warnings))
}

function toPlaywrightCookie(cookie: chrome.cookies.Cookie, hosts: string[], warnings: string[]): PlaywrightCookie[] {
  const partitionedCookie = cookie as ChromeCookieWithPartitionKey
  const partitionKey = toPlaywrightPartitionKey(partitionedCookie.partitionKey)
  if (partitionedCookie.partitionKey && !partitionKey) {
    warnings.push(`已跳过无法映射的分区 Cookie: ${cookie.name}`)
    return []
  }

  const cookieDomain = cookie.domain.replace(/^\./, "").toLowerCase()
  if (!hosts.some((host) => (cookie.hostOnly ? cookieDomain === host : host === cookieDomain || host.endsWith(`.${cookieDomain}`)))) {
    return []
  }

  return [
    {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate ?? -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: mapSameSite(cookie.sameSite),
      ...(partitionKey ? { partitionKey } : {})
    }
  ]
}

function toPlaywrightPartitionKey(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  const { topLevelSite } = value as ChromeCookiePartitionKey
  return typeof topLevelSite === "string" && topLevelSite ? topLevelSite : undefined
}

function mapSameSite(sameSite: chrome.cookies.SameSiteStatus): PlaywrightCookie["sameSite"] {
  switch (sameSite) {
    case "strict":
      return "Strict"
    case "no_restriction":
      return "None"
    case "unspecified":
      return "Lax"
    case "lax":
    default:
      return "Lax"
  }
}

async function collectOriginStorage(tabId: number, expectedOrigin: string, includeIndexedDB: boolean): Promise<PlaywrightOriginStorage[]> {
  const frameStorages = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: collectOriginStorageInPage,
    args: [false]
  })

  const originsByFrame = new Map<string, OriginStorageResult>()
  for (const result of frameStorages) {
    const storage = result.result
    if (!storage || !parseHttpUrl(storage.origin)) continue
    originsByFrame.set(storage.origin, result)
  }

  if (!originsByFrame.has(expectedOrigin)) {
    throw new Error("目标页面 origin 校验失败")
  }

  if (!includeIndexedDB) {
    return Array.from(originsByFrame.values(), ({ result }) => result!)
  }

  return await Promise.all(
    Array.from(originsByFrame.values(), async (frameStorage) => {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameStorage.frameId] },
        func: collectOriginStorageInPage,
        args: [true]
      })
      const storage = result?.result
      if (!storage || storage.origin !== frameStorage.result?.origin) {
        throw new Error("目标页面 origin 校验失败")
      }
      return storage
    })
  )
}

async function collectOriginStorageInPage(includeIndexedDB: boolean): Promise<PlaywrightOriginStorage> {
  function requestToPromise<T>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error("IndexedDB 读取失败"))
    })
  }

  function openDatabase(name: string) {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error(`无法打开 IndexedDB: ${name}`))
      request.onblocked = () => reject(new Error(`IndexedDB 被阻塞: ${name}`))
    })
  }

  function assertJsonSafe(value: unknown, path: string, seen = new WeakSet<object>()): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return value
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${path} 包含非有限 number`)
      return value
    }
    if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
      throw new Error(`${path} 包含当前版本暂不支持的复杂值`)
    }
    if (value instanceof Date || value instanceof Blob || value instanceof File || value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set) {
      throw new Error(`${path} 包含当前版本暂不支持的复杂值`)
    }
    if (typeof value !== "object") {
      throw new Error(`${path} 包含当前版本暂不支持的复杂值`)
    }
    if (seen.has(value)) {
      throw new Error(`${path} 包含循环引用`)
    }

    seen.add(value)
    if (Array.isArray(value)) {
      return value.map((item, index) => assertJsonSafe(item, `${path}[${index}]`, seen))
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} 包含当前版本暂不支持的复杂值`)
    }

    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      output[key] = assertJsonSafe(item, `${path}.${key}`, seen)
    }
    return output
  }

  function keyPathFields(keyPath: string | string[] | null) {
    if (Array.isArray(keyPath) || typeof keyPath === "string") return { keyPath }
    return {}
  }

  async function collectDatabase(name: string): Promise<PlaywrightIndexedDBDatabase> {
    const database = await openDatabase(name)
    try {
      const stores: PlaywrightIndexedDBObjectStore[] = []
      for (const storeName of Array.from(database.objectStoreNames)) {
        const transaction = database.transaction(storeName, "readonly")
        const store = transaction.objectStore(storeName)
        const keys = await requestToPromise(store.getAllKeys())
        const records: PlaywrightIndexedDBRecord[] = []
        for (const key of keys) {
          const value = await requestToPromise(store.get(key))
          const record: PlaywrightIndexedDBRecord = { value: assertJsonSafe(value, `${name}.${storeName}.value`) }
          if (store.keyPath === null) {
            record.key = assertJsonSafe(key, `${name}.${storeName}.key`)
          }
          records.push(record)
        }

        const indexes: PlaywrightIndexedDBIndex[] = Array.from(store.indexNames).map((indexName) => {
          const index = store.index(indexName)
          return {
            name: index.name,
            ...keyPathFields(index.keyPath),
            multiEntry: index.multiEntry,
            unique: index.unique
          }
        })

        stores.push({
          name: store.name,
          autoIncrement: store.autoIncrement,
          ...keyPathFields(store.keyPath),
          indexes,
          records
        })
      }
      return { name: database.name, version: database.version, stores }
    } finally {
      database.close()
    }
  }

  const storage: PlaywrightOriginStorage = {
    origin: location.origin,
    localStorage: Object.keys(localStorage).map((name) => ({ name, value: localStorage.getItem(name) ?? "" }))
  }

  if (!includeIndexedDB) {
    return storage
  }
  if (!("databases" in indexedDB) || typeof indexedDB.databases !== "function") {
    throw new Error("当前浏览器不支持 indexedDB.databases()，无法导出 IndexedDB")
  }

  const databases = await indexedDB.databases()
  storage.indexedDB = await Promise.all(databases.flatMap((database) => (database.name ? [collectDatabase(database.name)] : [])))
  JSON.stringify(storage.indexedDB)
  return storage
}

function createFilename(host: string) {
  const safeHost = host.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "origin"
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  return `chrome-ninja-storage-state-${safeHost}-${timestamp}.json`
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "登录态导出失败"
}
