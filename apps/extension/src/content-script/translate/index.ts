import van from "vanjs-core"
import { Button, Column, IconButton, PanelHeader, Row, Status, Surface, Text } from "@/content-ui/components"
import { createScope, isContentUIEvent, mountContentUI } from "@/content-ui/lifecycle"
import { theme } from "@/content-ui/theme"
import { TRANSLATE_MAX_LENGTH } from "@/translate/constants"

const MIN_LENGTH = 2
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
let disposeUI: (() => void) | null = null
let uiScope: ReturnType<typeof createScope> | null = null
let cardBody: HTMLDivElement | null = null
let copyButton: HTMLButtonElement | null = null
let copyFooter: HTMLDivElement | null = null
let cancelSpinner: (() => void) | null = null
const copied = van.state(false)
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
  if (!document.documentElement) return

  uiScope = createScope()
  const preserveSelection = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  bubble = Row(
    { style: { position: "fixed", display: "none", width: 30, height: 30 } },
    IconButton(
      {
        "aria-label": "翻译选中文本",
        title: "翻译选中文本",
        variant: "primary",
        style: { width: 30, height: 30, borderRadius: "50%", boxShadow: theme.shadow },
        onmousedown: preserveSelection,
        onclick: () => {
          void startTranslate()
        }
      },
      "译"
    )
  )
  cardBody = Column({ style: { padding: 12 } })
  copyButton = Button(
    {
      style: { marginLeft: "auto", marginRight: 12, marginBottom: 12, fontSize: 12 },
      onclick: () => {
        if (cardState?.kind !== "result") return
        const resultText = cardState.text
        const token = requestToken
        void copyText(resultText)
          .then(() => {
            if (token === requestToken && cardState?.kind === "result" && cardState.text === resultText)
              copied.val = true
          })
          .catch(() => {
            if (token === requestToken) cardBody?.append(Status({ tone: "danger" }, "复制失败，请重试"))
          })
      }
    },
    () => (copied.val ? "已复制" : "复制")
  )
  copyFooter = Row({ style: { justifyContent: "flex-end" } }, copyButton)
  card = Surface(
    {
      onmousedown: preserveSelection,
      style: {
        position: "fixed",
        display: "none",
        width: 320,
        maxWidth: "calc(100vw - 16px)",
        borderRadius: 12,
        boxShadow: theme.shadow,
        overflow: "hidden"
      }
    },
    PanelHeader({ title: "AI 翻译", onclose: closeCard }),
    cardBody,
    copyFooter
  )
  const content = Column({}, bubble, card)
  const view = mountContentUI("chrome-ninja-translate", "data-translate-ui", {
    element: content,
    dispose: uiScope.dispose
  })
  host = view.element
  disposeUI = view.dispose

  document.addEventListener("mouseup", onSelectionEvent, true)
  document.addEventListener("keyup", onSelectionEvent, true)
  document.addEventListener("mousedown", onOutsideDown, true)
  document.addEventListener("selectionchange", onSelectionChange, true)
  window.addEventListener("scroll", onScroll, true)
  attached = true
}

function detach() {
  if (!attached) return
  document.removeEventListener("mouseup", onSelectionEvent, true)
  document.removeEventListener("keyup", onSelectionEvent, true)
  document.removeEventListener("mousedown", onOutsideDown, true)
  document.removeEventListener("selectionchange", onSelectionChange, true)
  window.removeEventListener("scroll", onScroll, true)
  requestToken++
  disposeUI?.()
  disposeUI = null
  uiScope = null
  host = null
  cardBody = null
  copyButton = null
  copyFooter = null
  cancelSpinner?.()
  cancelSpinner = null
  bubble = null
  card = null
  currentRange = null
  currentText = ""
  cardState = null
  attached = false
}

function onSelectionEvent(event: Event) {
  if (!isContentUIEvent(event)) syncSelection()
}

function onOutsideDown(event: Event) {
  if (!host || !event.composedPath().includes(host)) closeCard()
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
  cancelSpinner?.()
  requestToken++
  currentRange = null
  currentText = ""
  cardState = null
  if (bubble) bubble.style.display = "none"
  if (card) card.style.display = "none"
}

function closeCard() {
  cancelSpinner?.()
  requestToken++
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
  copied.val = false
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
  if (token !== requestToken || !attached) return
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
  if (!cardBody || !copyFooter || !cardState) return
  cancelSpinner?.()
  cancelSpinner = null
  cardBody.replaceChildren()
  copyFooter.style.display = cardState.kind === "result" ? "flex" : "none"
  if (cardState.kind === "loading") {
    const spinner = Text({
      "aria-hidden": "true",
      style: {
        display: "inline-block",
        width: 14,
        height: 14,
        border: `2px solid ${theme.colors.border}`,
        borderTopColor: theme.colors.primary,
        borderRadius: "50%"
      }
    })
    const animation = spinner.animate?.([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 800,
      iterations: Infinity
    })
    if (animation) cancelSpinner = () => animation.cancel()
    cardBody.append(Row({}, spinner, Status({}, "翻译中…")))
  } else if (cardState.kind === "error") {
    cardBody.append(Status({ tone: "danger" }, cardState.message))
  } else {
    cardBody.append(
      Text(
        {
          style: {
            display: "block",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 320,
            overflowY: "auto",
            lineHeight: 1.6
          }
        },
        cardState.text
      )
    )
    if (cardState.truncated) cardBody.append(Status({}, `已截取前 ${TRANSLATE_MAX_LENGTH} 字`))
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

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) detach()
})
