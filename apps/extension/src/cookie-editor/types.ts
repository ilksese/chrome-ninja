export type Cookie = chrome.cookies.Cookie
export type CookieEntry = { id: string; revision: string; cookie: Cookie; disabled: boolean }
export type CookieOriginal = Pick<CookieEntry, "id" | "revision">
export type CookieCommand =
  | { type: "open" | "list" }
  | { type: "save"; original?: CookieOriginal; cookie: Cookie }
  | { type: "disable" | "enable"; original: CookieOriginal }
export type CookieRequest = { target: "cookie-editor"; tabId?: number } & CookieCommand
export type CookieResponse = {
  ok: boolean
  error?: string
  entries?: CookieEntry[]
  hostname?: string
  storeId?: string
  secure?: boolean
  warning?: string
}
export type CookieNotice = { target: "cookie-editor-ui"; type: "changed"; error?: string }

export function cookieId(cookie: Cookie): string {
  return JSON.stringify([
    cookie.name,
    cookie.domain,
    cookie.path,
    cookie.storeId,
    cookie.partitionKey ? [cookie.partitionKey.topLevelSite, cookie.partitionKey.hasCrossSiteAncestor ?? false] : null
  ])
}

export function pageUnavailableReason(value?: string): string {
  if (!value) return "无法读取当前网页"
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return "仅支持普通 HTTP/HTTPS 网页"
    if (
      url.hostname === "chromewebstore.google.com" ||
      (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"))
    )
      return "Chrome 网上应用店禁止扩展注入"
    return ""
  } catch {
    return "无法读取当前网页"
  }
}
