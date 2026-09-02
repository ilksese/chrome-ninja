import { TRANSLATE_MAX_LENGTH } from "@/translate/constants"

const MIN_LENGTH = 2
const HOST_STYLE = "all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;"

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
.cn-t-bubble { position: fixed; display: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #101828; border: 1px solid rgba(255,255,255,0.14); color: #fff; font-size: 13px; font-weight: 600; box-shadow: 0 8px 20px rgba(16,24,40,0.28); cursor: pointer; user-select: none; }
.cn-t-bubble:hover { background: #1d2939; }
.cn-t-card { position: fixed; display: none; width: 320px; max-width: calc(100vw - 16px); background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 18px 44px rgba(15,23,42,0.22); overflow: hidden; font-size: 13px; color: #0f172a; }
.cn-t-card-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.cn-t-card-title { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #005bd1; }
.cn-t-card-close { border: 0; background: transparent; padding: 2px 6px; border-radius: 6px; font-size: 16px; line-height: 1; color: #64748b; cursor: pointer; }
.cn-t-card-close:hover { background: #e2e8f0; color: #0f172a; }
.cn-t-card-body { padding: 12px; }
.cn-t-card-loading { display: flex; align-items: center; gap: 8px; color: #64748b; }
.cn-t-spinner { width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #005bd1; border-radius: 50%; animation: cn-t-spin 0.8s linear infinite; }
@keyframes cn-t-spin { to { transform: rotate(360deg); } }
.cn-t-card-error { color: #b42318; line-height: 1.5; }
.cn-t-card-text { line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; }
.cn-t-card-note { margin-top: 8px; font-size: 11px; color: #94a3b8; }
.cn-t-card-foot { display: flex; justify-content: flex-end; padding: 0 12px 12px; }
.cn-t-card-copy { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
.cn-t-card-copy:hover { background: #f1f5f9; }
.cn-t-card-copy.copied { background: #ecfdf3; border-color: #a7f3d0; color: #067647; }
`

type TranslateResponse = {
  ok: boolean
  data?: string
  truncated?: boolean
  error?: string
}

type CardState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; text: string; truncated: boolean; copied: boolean }

let enabled = false
let attached = false
let host: HTMLElement | null = null
let shadow: ShadowRoot | null = null
let bubble: HTMLDivElement | null = null
let card: HTMLDivElement | null = null
let currentRange: Range | null = null
let currentText = ""
let cardState: CardState | null = null
let requestToken = 0

function readEnabled(options: unknown): boolean {
  const translate = (options as { translate?: { enabled?: boolean } } | undefined)?.translate
  return Boolean(translate?.enabled)
}

function attach() {
  if (attached) return
  const root = document.body ?? document.documentElement
  if (!root) return

  host = document.createElement("div")
  host.style.cssText = HOST_STYLE
  root.appendChild(host)
  shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = STYLES
  shadow.appendChild(style)

  bubble = document.createElement("div")
  bubble.className = "cn-t-bubble"
  bubble.textContent = "译"
  bubble.addEventListener("mousedown", (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  bubble.addEventListener("click", () => void startTranslate())
  shadow.appendChild(bubble)

  card = document.createElement("div")
  card.className = "cn-t-card"
  card.addEventListener("mousedown", (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  shadow.appendChild(card)

  document.addEventListener("mouseup", syncSelection, true)
  document.addEventListener("keyup", syncSelection, true)
  document.addEventListener("mousedown", closeCard, true)
  document.addEventListener("selectionchange", onSelectionChange, true)
  window.addEventListener("scroll", onScroll, true)
  attached = true
}

function detach() {
  if (!attached) return
  document.removeEventListener("mouseup", syncSelection, true)
  document.removeEventListener("keyup", syncSelection, true)
  document.removeEventListener("mousedown", closeCard, true)
  document.removeEventListener("selectionchange", onSelectionChange, true)
  window.removeEventListener("scroll", onScroll, true)
  host?.remove()
  host = null
  shadow = null
  bubble = null
  card = null
  currentRange = null
  currentText = ""
  cardState = null
  attached = false
}

function syncSelection() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    hideAll()
    return
  }
  const text = selection.toString().trim()
  if (text.length < MIN_LENGTH) {
    hideAll()
    return
  }
  currentRange = selection.getRangeAt(0).cloneRange()
  currentText = text
  closeCard()
  positionBubble()
}

function onSelectionChange() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.toString().trim().length < MIN_LENGTH) {
    hideAll()
  }
}

function hideAll() {
  currentRange = null
  currentText = ""
  cardState = null
  if (bubble) bubble.style.display = "none"
  if (card) card.style.display = "none"
}

function closeCard() {
  cardState = null
  if (card) card.style.display = "none"
}

function onScroll() {
  if (!currentRange) return
  if (cardState && card) positionCard()
  if (bubble) positionBubble()
}

function isRectEmpty(rect: DOMRect) {
  return !rect.left && !rect.right && !rect.top && !rect.bottom
}

function positionBubble() {
  if (!bubble || !currentRange) return
  const rect = currentRange.getBoundingClientRect()
  if (isRectEmpty(rect)) {
    bubble.style.display = "none"
    return
  }
  bubble.style.display = "flex"
  const left = Math.min(Math.max(8, rect.right - bubble.offsetWidth), window.innerWidth - bubble.offsetWidth - 8)
  let top = rect.bottom + 6
  if (top + bubble.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - bubble.offsetHeight - 6)
  bubble.style.left = `${left}px`
  bubble.style.top = `${top}px`
}

function positionCard() {
  if (!card || !currentRange || !cardState) return
  const rect = currentRange.getBoundingClientRect()
  if (isRectEmpty(rect)) {
    closeCard()
    return
  }
  card.style.display = "block"
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - card.offsetWidth - 8)
  let top = rect.bottom + 8
  if (top + card.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - card.offsetHeight - 8)
  card.style.left = `${left}px`
  card.style.top = `${top}px`
}

async function startTranslate() {
  if (!currentRange || !currentText) return
  const token = ++requestToken
  cardState = { kind: "loading" }
  renderCard()
  positionCard()

  let response: TranslateResponse | undefined
  try {
    response = (await chrome.runtime.sendMessage({ target: "translate", type: "TRANSLATE", text: currentText })) as
      | TranslateResponse
      | undefined
  } catch {
    response = undefined
  }
  if (token !== requestToken) return
  if (!response) {
    cardState = { kind: "error", message: "扩展上下文已失效，请刷新页面" }
  } else if (response.ok) {
    cardState = { kind: "result", text: response.data ?? "", truncated: Boolean(response.truncated), copied: false }
  } else {
    cardState = { kind: "error", message: response.error ?? "翻译失败" }
  }
  renderCard()
  positionCard()
}

function renderCard() {
  if (!card || !cardState) return
  card.replaceChildren()

  const head = document.createElement("div")
  head.className = "cn-t-card-head"
  const title = document.createElement("span")
  title.className = "cn-t-card-title"
  title.textContent = "AI 翻译"
  const close = document.createElement("button")
  close.className = "cn-t-card-close"
  close.type = "button"
  close.textContent = "×"
  close.setAttribute("aria-label", "关闭翻译结果")
  close.addEventListener("click", closeCard)
  head.append(title, close)
  card.append(head)

  const body = document.createElement("div")
  body.className = "cn-t-card-body"
  if (cardState.kind === "loading") {
    const loading = document.createElement("div")
    loading.className = "cn-t-card-loading"
    const spinner = document.createElement("span")
    spinner.className = "cn-t-spinner"
    loading.append(spinner)
    loading.append(document.createTextNode("翻译中…"))
    body.append(loading)
  } else if (cardState.kind === "error") {
    const error = document.createElement("div")
    error.className = "cn-t-card-error"
    error.textContent = cardState.message
    body.append(error)
  } else {
    const text = document.createElement("div")
    text.className = "cn-t-card-text"
    text.textContent = cardState.text
    body.append(text)
    if (cardState.truncated) {
      const note = document.createElement("div")
      note.className = "cn-t-card-note"
      note.textContent = `已截取前 ${TRANSLATE_MAX_LENGTH} 字`
      body.append(note)
    }
  }
  card.append(body)

  if (cardState.kind === "result") {
    const foot = document.createElement("div")
    foot.className = "cn-t-card-foot"
    const copy = document.createElement("button")
    copy.className = "cn-t-card-copy"
    copy.type = "button"
    copy.textContent = cardState.copied ? "已复制" : "复制"
    const resultText = cardState.text
    copy.addEventListener("click", () => {
      void copyText(resultText).then(() => {
        if (cardState?.kind !== "result" || cardState.text !== resultText) return
        cardState = { ...cardState, copied: true }
        renderCard()
      })
    })
    foot.append(copy)
    card.append(foot)
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.cssText = "position: fixed; opacity: 0"
    document.body?.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    textarea.remove()
  }
}

const main = () => {
  chrome.storage.local.get(["options"], ({ options }) => {
    enabled = readEnabled(options)
    if (enabled) attach()
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.options) return
    const next = readEnabled(changes.options.newValue)
    if (next === enabled) return
    enabled = next
    if (next) attach()
    else detach()
  })
}
main()
