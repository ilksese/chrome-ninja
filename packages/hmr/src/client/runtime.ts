import {
  getHmrErrorMessage,
  HMR_CLIENT_PORT_PREFIX,
  normalizeHmrResult,
  type HmrClientScope,
  type HmrCommandMessage,
  type HmrExecuteJsMessage,
  type HmrJsonValue,
  type HmrReloadClientMessage
} from "../protocol"
import { HMR_ENABLED } from "./config"

const DOM_QUERY_MAX_SELECTORS = 50
const DOM_QUERY_DEFAULT_TEXT_LIMIT = 160
const DOM_QUERY_MAX_TEXT_LIMIT = 1000
const DOM_QUERY_DEFAULT_HTML_LIMIT = 2000
const DOM_QUERY_MAX_HTML_LIMIT = 10000
const DOM_QUERY_DEFAULT_CHILDREN_LIMIT = 20
const DOM_QUERY_MAX_CHILDREN_LIMIT = 100
const DOM_QUERY_MAX_COMPUTED_STYLE_PROPS = 80
const DOM_QUERY_DEFAULT_COMPUTED_STYLE_PROPS = [
  "display",
  "visibility",
  "position",
  "box-sizing",
  "width",
  "height",
  "margin",
  "padding",
  "border",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "opacity",
  "z-index",
  "overflow",
  "transform"
]

export function connectHmrClient(scope: HmrClientScope) {
  if (!HMR_ENABLED) return
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return

  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined

  const connect = () => {
    let port: chrome.runtime.Port
    try {
      port = chrome.runtime.connect({ name: `${HMR_CLIENT_PORT_PREFIX}${scope}` })
    } catch {
      reconnectTimer = globalThis.setTimeout(connect, 1000)
      return
    }

    port.postMessage({ type: "hmr:client:hello", scope })
    port.onMessage.addListener((message: unknown) => {
      if (isReloadClientMessage(message, scope)) {
        reloadClient()
        return
      }
      if (isExecuteMessage(message)) void executeCode(port, scope, message)
      if (isCommandMessage(message)) void executeCommand(port, scope, message)
    })
    port.onDisconnect.addListener(() => {
      reconnectTimer = globalThis.setTimeout(connect, 1000)
    })
  }

  connect()

  return () => {
    if (reconnectTimer !== undefined) globalThis.clearTimeout(reconnectTimer)
  }
}

async function executeCommand(port: chrome.runtime.Port, scope: HmrClientScope, message: HmrCommandMessage) {
  try {
    const result = await runCommand(message)
    postResult(port, {
      type: "hmr:client:command-result",
      requestId: message.requestId,
      scope,
      command: message.command,
      ok: true,
      result: normalizeHmrResult(result)
    })
  } catch (error) {
    postResult(port, {
      type: "hmr:client:command-result",
      requestId: message.requestId,
      scope,
      command: message.command,
      ok: false,
      error: getHmrErrorMessage(error)
    })
  }
}

async function runCommand(message: HmrCommandMessage) {
  switch (message.command) {
    case "dom:query":
      return queryDom(message.payload)
    default:
      throw new Error(`Unsupported command for client: ${message.command}`)
  }
}

function queryDom(payload: HmrJsonValue | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object")

  const selectors = (payload as { selectors?: unknown }).selectors
  if (!selectors || typeof selectors !== "object" || Array.isArray(selectors))
    throw new Error("payload.selectors must be an object")

  const entries = Object.entries(selectors as Record<string, unknown>)
  if (entries.length > DOM_QUERY_MAX_SELECTORS)
    throw new Error(`payload.selectors supports at most ${DOM_QUERY_MAX_SELECTORS} selectors`)

  const include = normalizeInclude((payload as { include?: unknown }).include)
  const limitText = normalizeTextLimit((payload as { limitText?: unknown }).limitText)
  const limitHtml = normalizeHtmlLimit((payload as { limitHtml?: unknown }).limitHtml)
  const childrenLimit = normalizeChildrenLimit((payload as { childrenLimit?: unknown }).childrenLimit)
  const computedStyle = normalizeComputedStyle((payload as { computedStyle?: unknown }).computedStyle)
  const result: Record<string, HmrJsonValue> = {}

  for (const [name, selector] of entries) {
    if (typeof selector !== "string" || selector.trim().length === 0)
      throw new Error(`selector ${name} must be a non-empty string`)
    result[name] = inspectSelector(selector, include, { limitText, limitHtml, childrenLimit, computedStyle })
  }

  return result
}

function normalizeInclude(value: unknown) {
  const defaults = ["exists", "visible", "display"]
  if (!Array.isArray(value)) return defaults

  const allowed = new Set([
    "exists",
    "visible",
    "display",
    "visibility",
    "text",
    "href",
    "src",
    "count",
    "node",
    "attributes",
    "dataset",
    "rect",
    "box",
    "computedStyle",
    "outerHTML",
    "children",
    "cssPath"
  ])
  const include = value.filter((item): item is string => typeof item === "string" && allowed.has(item))
  return include.length > 0 ? include : defaults
}

function normalizeTextLimit(value: unknown) {
  if (!Number.isInteger(value)) return DOM_QUERY_DEFAULT_TEXT_LIMIT
  return Math.min(Math.max(value as number, 0), DOM_QUERY_MAX_TEXT_LIMIT)
}

function normalizeHtmlLimit(value: unknown) {
  if (!Number.isInteger(value)) return DOM_QUERY_DEFAULT_HTML_LIMIT
  return Math.min(Math.max(value as number, 0), DOM_QUERY_MAX_HTML_LIMIT)
}

function normalizeChildrenLimit(value: unknown) {
  if (!Number.isInteger(value)) return DOM_QUERY_DEFAULT_CHILDREN_LIMIT
  return Math.min(Math.max(value as number, 0), DOM_QUERY_MAX_CHILDREN_LIMIT)
}

function normalizeComputedStyle(value: unknown) {
  if (!Array.isArray(value)) return DOM_QUERY_DEFAULT_COMPUTED_STYLE_PROPS

  const props = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => normalizeCssPropertyName(item.trim()))

  return Array.from(new Set(props)).slice(0, DOM_QUERY_MAX_COMPUTED_STYLE_PROPS)
}

type DomQueryOptions = {
  limitText: number
  limitHtml: number
  childrenLimit: number
  computedStyle: string[]
}

function inspectSelector(selector: string, include: string[], options: DomQueryOptions): HmrJsonValue {
  let nodes: Element[]
  try {
    nodes = Array.from(document.querySelectorAll(selector))
  } catch (error) {
    return { selector, count: 0, exists: false, error: getHmrErrorMessage(error) }
  }

  const node = nodes[0]
  const output: Record<string, HmrJsonValue> = { selector }
  if (include.includes("count")) output.count = nodes.length
  if (include.includes("exists")) output.exists = Boolean(node)
  if (!node) return output

  const style = globalThis.getComputedStyle(node)
  const rect = node.getBoundingClientRect()
  if (include.includes("visible"))
    output.visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
  if (include.includes("display")) output.display = style.display
  if (include.includes("visibility")) output.visibility = style.visibility
  if (include.includes("text")) output.text = normalizeText(node.textContent || "", options.limitText)
  if (include.includes("href"))
    output.href =
      node instanceof HTMLAnchorElement || node instanceof HTMLLinkElement ? node.href : node.getAttribute("href") || ""
  if (include.includes("src"))
    output.src =
      node instanceof HTMLImageElement || node instanceof HTMLScriptElement || node instanceof HTMLIFrameElement
        ? node.src
        : node.getAttribute("src") || ""
  if (include.includes("node")) output.node = inspectNode(node)
  if (include.includes("attributes")) output.attributes = inspectAttributes(node)
  if (include.includes("dataset")) output.dataset = inspectDataset(node)
  if (include.includes("rect")) output.rect = inspectRect(rect)
  if (include.includes("box")) output.box = inspectBox(node)
  if (include.includes("computedStyle")) output.computedStyle = inspectComputedStyle(style, options.computedStyle)
  if (include.includes("outerHTML")) output.outerHTML = normalizeText(node.outerHTML, options.limitHtml)
  if (include.includes("children")) output.children = inspectChildren(node, options.childrenLimit, options.limitText)
  if (include.includes("cssPath")) output.cssPath = getCssPath(node)

  return output
}

function inspectNode(node: Element): HmrJsonValue {
  return {
    tagName: node.tagName.toLowerCase(),
    nodeName: node.nodeName,
    nodeType: node.nodeType,
    id: node.id,
    className: typeof node.className === "string" ? node.className : String(node.className),
    role: node.getAttribute("role") || "",
    ariaLabel: node.getAttribute("aria-label") || "",
    testId: node.getAttribute("data-testid") || "",
    childElementCount: node.childElementCount
  }
}

function inspectAttributes(node: Element): HmrJsonValue {
  const attributes: Record<string, HmrJsonValue> = {}
  for (const attribute of Array.from(node.attributes)) attributes[attribute.name] = attribute.value
  return attributes
}

function inspectDataset(node: Element): HmrJsonValue {
  if (!(node instanceof HTMLElement)) return {}
  const dataset: Record<string, HmrJsonValue> = {}
  for (const [key, value] of Object.entries(node.dataset)) dataset[key] = value || ""
  return dataset
}

function inspectRect(rect: DOMRect): HmrJsonValue {
  return {
    x: roundLayoutNumber(rect.x),
    y: roundLayoutNumber(rect.y),
    width: roundLayoutNumber(rect.width),
    height: roundLayoutNumber(rect.height),
    top: roundLayoutNumber(rect.top),
    right: roundLayoutNumber(rect.right),
    bottom: roundLayoutNumber(rect.bottom),
    left: roundLayoutNumber(rect.left)
  }
}

function inspectBox(node: Element): HmrJsonValue {
  const element = node as HTMLElement
  return {
    offsetWidth: element.offsetWidth || 0,
    offsetHeight: element.offsetHeight || 0,
    offsetTop: element.offsetTop || 0,
    offsetLeft: element.offsetLeft || 0,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    scrollLeft: element.scrollLeft
  }
}

function inspectComputedStyle(style: CSSStyleDeclaration, properties: string[]): HmrJsonValue {
  const output: Record<string, HmrJsonValue> = {}
  for (const property of properties) output[property] = style.getPropertyValue(property)
  return output
}

function inspectChildren(node: Element, limit: number, limitText: number): HmrJsonValue {
  return Array.from(node.children)
    .slice(0, limit)
    .map((child) => ({
      tagName: child.tagName.toLowerCase(),
      id: child.id,
      className: typeof child.className === "string" ? child.className : String(child.className),
      role: child.getAttribute("role") || "",
      ariaLabel: child.getAttribute("aria-label") || "",
      text: normalizeText(child.textContent || "", limitText),
      cssPath: getCssPath(child)
    }))
}

function normalizeCssPropertyName(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function getCssPath(node: Element) {
  const parts: string[] = []
  let current: Element | null = node

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let part = current.tagName.toLowerCase()
    if (current.id) {
      part += `#${escapeCssIdent(current.id)}`
      parts.unshift(part)
      break
    }

    const parent: Element | null = current.parentElement
    if (parent) {
      const tagName = current.tagName
      const siblings = Array.from(parent.children as HTMLCollectionOf<Element>).filter(
        (child) => child.tagName === tagName
      )
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`
    }

    parts.unshift(part)
    current = parent
  }

  return parts.join(" > ")
}

function escapeCssIdent(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

function roundLayoutNumber(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeText(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim()
  return limit > 0 ? text.slice(0, limit) : ""
}

async function executeCode(port: chrome.runtime.Port, scope: HmrClientScope, message: HmrExecuteJsMessage) {
  try {
    const result = await Promise.resolve(globalThis.eval(message.code))
    postResult(port, {
      type: "hmr:client:execute-result",
      requestId: message.requestId,
      scope,
      ok: true,
      result: normalizeHmrResult(result)
    })
  } catch (error) {
    postResult(port, {
      type: "hmr:client:execute-result",
      requestId: message.requestId,
      scope,
      ok: false,
      error: getHmrErrorMessage(error)
    })
  }
}

function postResult(port: chrome.runtime.Port, message: unknown) {
  try {
    port.postMessage(message)
  } catch {
    // The background port can disappear while a script is running.
  }
}

function reloadClient() {
  globalThis.setTimeout(() => {
    globalThis.location.reload()
  }, 0)
}

function isReloadClientMessage(message: unknown, scope: HmrClientScope): message is HmrReloadClientMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrReloadClientMessage>
  return (
    candidate.type === "hmr:reload-client" && (!Array.isArray(candidate.scopes) || candidate.scopes.includes(scope))
  )
}

function isExecuteMessage(message: unknown): message is HmrExecuteJsMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrExecuteJsMessage>
  return (
    candidate.type === "hmr:execute-js" && typeof candidate.requestId === "string" && typeof candidate.code === "string"
  )
}

function isCommandMessage(message: unknown): message is HmrCommandMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrCommandMessage>
  return (
    candidate.type === "hmr:command" && typeof candidate.requestId === "string" && typeof candidate.command === "string"
  )
}
