export function parsePageControlBody(value) {
  if (!Array.isArray(value)) return { ok: false, error: "正文必须是操作数组" }
  if (value.length === 0) return { ok: false, error: "至少包含一个操作" }

  const actions = []
  for (const [index, item] of value.entries()) {
    const parsed = parseAction(item, index)
    if (!parsed.ok) return parsed
    actions.push(parsed.action)
  }
  return { ok: true, actions }
}

function parseAction(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, error: `第 ${index} 项必须是操作对象` }
  }
  if (item.action === "scroll") return parseScroll(item, index)
  if (item.action === "click") return parseClick(item, index)
  if (item.action === "snapshot") return { ok: true, action: { action: "snapshot" } }
  if (item.action === "navigation") return parseNavigation(item, index)
  if (item.action === "tab-list") return { ok: true, action: { action: "tab-list" } }
  return { ok: false, error: `第 ${index} 项的 action 不受支持` }
}

function parseScroll(item, index) {
  if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) {
    return { ok: false, error: `第 ${index} 项的 x 和 y 必须是有限数字` }
  }
  return { ok: true, action: { action: "scroll", x: item.x, y: item.y } }
}

function parseClick(item, index) {
  const selector = readTarget(item.selector)
  const xpath = readTarget(item.xpath)
  if ((selector && xpath) || (!selector && !xpath)) {
    return { ok: false, error: `第 ${index} 项必须只提供 selector 或 xpath 其中一个` }
  }
  return selector
    ? { ok: true, action: { action: "click", selector } }
    : { ok: true, action: { action: "click", xpath } }
}

function parseNavigation(item, index) {
  if (typeof item.newPage !== "boolean") return { ok: false, error: `第 ${index} 项的 newPage 必须是布尔值` }
  if (!isHttpUrl(item.url)) return { ok: false, error: `第 ${index} 项的 url 必须是 http 或 https 地址` }
  return { ok: true, action: { action: "navigation", url: item.url, newPage: item.newPage } }
}

function readTarget(value) {
  return typeof value === "string" && value.trim() ? value : ""
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
