// Leave 1s of the 8s server budget for the extension to return the result.
const maxWaitMs = 7000
const defaultWaitMs = 5000

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
  if (item.action === "tab-list") {
    if (Object.hasOwn(item, "tabId")) return { ok: false, error: `第 ${index} 项不能指定 tabId` }
    return { ok: true, action: { action: item.action } }
  }
  if (item.action === "screenshot") return withTabId(item, index, { action: "screenshot" })
  if (item.action === "scroll") return parseScroll(item, index)
  if (item.action === "click") return parseTargeted(item, index, "click")
  if (item.action === "hover") return parseTargeted(item, index, "hover")
  if (item.action === "fill") return parseFill(item, index)
  if (item.action === "select") return parseSelect(item, index)
  if (item.action === "press") return parsePress(item, index)
  if (item.action === "wait") return parseWait(item, index)
  if (item.action === "history") return parseHistory(item, index)
  if (item.action === "snapshot") return withTabId(item, index, { action: "snapshot" })
  if (item.action === "activate") return withTabId(item, index, { action: "activate" })
  if (item.action === "navigation") return parseNavigation(item, index)
  return { ok: false, error: `第 ${index} 项的 action 不受支持` }
}

function parseScroll(item, index) {
  if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) {
    return { ok: false, error: `第 ${index} 项的 x 和 y 必须是有限数字` }
  }
  const target = parseTarget(item, index, false)
  if (!target.ok) return target
  return withTabId(item, index, { action: "scroll", x: item.x, y: item.y, ...target.target })
}

function parseTargeted(item, index, action) {
  const target = parseTarget(item, index, true)
  if (!target.ok) return target
  return withTabId(item, index, { action, ...target.target })
}

function parseFill(item, index) {
  const target = parseTarget(item, index, true)
  if (!target.ok) return target
  if (typeof item.value !== "string") return { ok: false, error: `第 ${index} 项的 value 必须是字符串` }
  return withTabId(item, index, { action: "fill", ...target.target, value: item.value })
}

function parseSelect(item, index) {
  const target = parseTarget(item, index, true)
  if (!target.ok) return target
  const hasValue = Object.hasOwn(item, "value")
  const hasLabel = Object.hasOwn(item, "label")
  if (hasValue === hasLabel || (hasValue && typeof item.value !== "string") || (hasLabel && typeof item.label !== "string")) {
    return { ok: false, error: `第 ${index} 项必须只提供 value 或 label 其中一个` }
  }
  return withTabId(
    item,
    index,
    hasValue
      ? { action: "select", ...target.target, value: item.value }
      : { action: "select", ...target.target, label: item.label }
  )
}

function withTabId(item, index, action) {
  const tabId = readTabId(item, index)
  if (!tabId.ok) return tabId
  return { ok: true, action: { ...action, tabId: tabId.value } }
}

function readTabId(item, index) {
  if (!Number.isInteger(item.tabId) || item.tabId < 1) {
    return { ok: false, error: `第 ${index} 项的 tabId 必须是正整数` }
  }
  return { ok: true, value: item.tabId }
}

function parsePress(item, index) {
  if (item.key !== "Enter" && item.key !== "Escape" && item.key !== "Tab") {
    return { ok: false, error: `第 ${index} 项的 key 必须是 Enter、Escape 或 Tab` }
  }
  const target = parseTarget(item, index, false)
  if (!target.ok) return target
  const modifiers = {}
  for (const name of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    if (item[name] === undefined) continue
    if (typeof item[name] !== "boolean") return { ok: false, error: `第 ${index} 项的 ${name} 必须是布尔值` }
    if (item[name]) modifiers[name] = true
  }
  return withTabId(item, index, { action: "press", key: item.key, ...target.target, ...modifiers })
}

function parseWait(item, index) {
  const timeout = parseTimeout(item.timeout, index)
  if (!timeout.ok) return timeout
  if (item.until === "load") {
    if (item.selector !== undefined || item.xpath !== undefined || item.ref !== undefined || item.text !== undefined) {
      return { ok: false, error: `第 ${index} 项的 load 不能带目标` }
    }
    return withTabId(item, index, { action: "wait", until: "load", timeout: timeout.value })
  }
  if (item.until === "selector") {
    const selector = readTarget(item.selector)
    if (!selector || item.xpath !== undefined || item.ref !== undefined || item.text !== undefined) {
      return { ok: false, error: `第 ${index} 项的 selector 等待必须只提供非空 selector` }
    }
    return withTabId(item, index, { action: "wait", until: "selector", selector, timeout: timeout.value })
  }
  if (item.until === "text") {
    const text = readTarget(item.text)
    if (!text || item.selector !== undefined || item.xpath !== undefined || item.ref !== undefined) {
      return { ok: false, error: `第 ${index} 项的 text 等待必须只提供非空 text` }
    }
    return withTabId(item, index, { action: "wait", until: "text", text, timeout: timeout.value })
  }
  return { ok: false, error: `第 ${index} 项的 until 必须是 load、selector 或 text` }
}

function parseHistory(item, index) {
  if (item.direction !== "back" && item.direction !== "forward" && item.direction !== "reload") {
    return { ok: false, error: `第 ${index} 项的 direction 必须是 back、forward 或 reload` }
  }
  return withTabId(item, index, { action: "history", direction: item.direction })
}

function parseTarget(item, index, required) {
  const selector = readTarget(item.selector)
  const xpath = readTarget(item.xpath)
  const ref = readRef(item.ref)
  if (ref === "invalid") return { ok: false, error: `第 ${index} 项的 ref 必须是 e 加正整数` }
  const present = [selector, xpath, ref === "absent" ? "" : ref].filter(Boolean)
  if (required && present.length !== 1) return { ok: false, error: `第 ${index} 项必须只提供 selector、xpath 或 ref 其中一个` }
  if (!required && present.length > 1) return { ok: false, error: `第 ${index} 项只能提供 selector、xpath 或 ref 其中一个` }
  if (selector) return { ok: true, target: { selector } }
  if (xpath) return { ok: true, target: { xpath } }
  if (ref !== "absent") return { ok: true, target: { ref } }
  return { ok: true, target: {} }
}

function parseNavigation(item, index) {
  if (typeof item.newPage !== "boolean") return { ok: false, error: `第 ${index} 项的 newPage 必须是布尔值` }
  if (!isHttpUrl(item.url)) return { ok: false, error: `第 ${index} 项的 url 必须是 http 或 https 地址` }
  return withTabId(item, index, { action: "navigation", url: item.url, newPage: item.newPage })
}

function readTarget(value) {
  return typeof value === "string" && value.trim() ? value : ""
}

function readRef(value) {
  if (value === undefined) return "absent"
  return typeof value === "string" && /^e[1-9]\d*$/.test(value) ? value : "invalid"
}

function parseTimeout(value, index) {
  if (value === undefined) return { ok: true, value: defaultWaitMs }
  if (!Number.isInteger(value) || value < 1 || value > maxWaitMs) {
    return { ok: false, error: `第 ${index} 项的 timeout 必须是 1 到 ${maxWaitMs} 的整数` }
  }
  return { ok: true, value }
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
