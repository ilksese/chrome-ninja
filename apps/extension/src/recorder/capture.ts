import type { RecorderLocator } from "./types"
import type { CapturedEvent } from "./messages"
import { PANEL_HOST_SELECTOR } from "./messages"

const CLICKABLE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=menuitem]",
  "[role=option]",
  "[role=tab]",
  "[contenteditable]",
  "[tabindex]",
  "[onclick]",
].join(",")

export type CaptureHandler = (event: CapturedEvent) => void

function isVisible(el: Element): boolean {
  if (el instanceof HTMLElement) {
    const style = getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isDisabled(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.disabled
  }
  return el.getAttribute("aria-disabled") === "true"
}

function isClickable(el: Element): boolean {
  if (el.matches(CLICKABLE_SELECTOR)) return true
  return el instanceof HTMLElement && getComputedStyle(el).cursor === "pointer"
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text
}

function buildCss(el: Element): string | undefined {
  if (el.id) {
    return `#${CSS.escape(el.id)}`
  }
  const className = el.getAttribute("class")
  if (className) {
    const cls = className.trim().split(/\s+/)[0]
    if (cls) {
      return `${el.tagName.toLowerCase()}.${CSS.escape(cls)}`
    }
  }
  return undefined
}

function buildPath(el: Element): string | undefined {
  const parts: string[] = []
  let node: Element | null = el

  while (node && node !== document.body && node.parentElement) {
    const current: Element = node
    const parent = current.parentElement
    if (!parent) break
    const sameTag = Array.from(parent.children).filter((child: Element) => child.tagName === current.tagName)
    let part = current.tagName.toLowerCase()
    if (sameTag.length > 1) {
      part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
    }
    parts.unshift(part)
    node = parent
  }

  return parts.join(" > ") || undefined
}

function buildLocator(el: Element): RecorderLocator {
  const tag = el.tagName.toLowerCase()
  const id = el.id || undefined
  const name = el.getAttribute("name") || undefined
  const ariaLabel = el.getAttribute("aria-label") || undefined
  const role = el.getAttribute("role") || undefined
  const rawText = (el.textContent || "").trim()
  const text = rawText ? truncate(rawText, 50) : undefined
  const css = buildCss(el)
  const path = buildPath(el)
  return { tag, id, name, ariaLabel, role, text, css, path }
}

function closestClickable(el: Element | null): Element | null {
  let node = el
  while (node) {
    if (isClickable(node)) return node
    node = node.parentElement
  }
  return null
}

function getClickTarget(ev: MouseEvent): Element | null {
  for (const node of ev.composedPath()) {
    if (!(node instanceof Element)) continue
    if (node.closest(PANEL_HOST_SELECTOR)) return null
    const clickable = closestClickable(node)
    if (clickable) return clickable
  }

  const target = ev.target instanceof Element ? ev.target : null
  if (!target || target === document.body || target === document.documentElement) return null
  // Framework event listeners are not inspectable from a content script, so keep visible non-body clicks.
  return target
}

export function startCapture(handler: CaptureHandler): () => void {
  let scrollTimer: ReturnType<typeof setTimeout> | null = null

  const safeEmit = (fn: () => void) => {
    try {
      fn()
    } catch {
      // ignore page exceptions during capture
    }
  }

  const onClick = (ev: MouseEvent) => {
    safeEmit(() => {
      const el = getClickTarget(ev)
      if (!el) return
      if (el instanceof HTMLElement && !isVisible(el)) return
      if (isDisabled(el)) return
      handler({ kind: "click", target: buildLocator(el), text: el.textContent?.trim() || undefined })
    })
  }

  const readValue = (el: Element): string | undefined => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      return el.textContent || ""
    }
    return undefined
  }

  const onInput = (ev: Event) => {
    safeEmit(() => {
      const target = ev.target as Element | null
      if (!target) return
      if (target.closest(PANEL_HOST_SELECTOR)) return
      const value = readValue(target)
      if (value === undefined) return
      handler({ kind: "input", target: buildLocator(target), value })
    })
  }

  const findScrollContainer = (el: Element): Element | null => {
    let node: Element | null = el
    while (node) {
      if (node.scrollHeight > node.clientHeight) return node
      node = node.parentElement
    }
    return null
  }

  const onScroll = (ev: Event) => {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      safeEmit(() => {
        const target = ev.target
        if (target instanceof Element) {
          if (target.closest(PANEL_HOST_SELECTOR)) return
          const container = findScrollContainer(target)
          if (container) {
            handler({
              kind: "scroll",
              scrollTop: Math.round(container.scrollTop),
              scrollLeft: Math.round(container.scrollLeft),
              target: buildLocator(container),
            })
            return
          }
        }
        handler({
          kind: "scroll",
          scrollTop: Math.round(window.scrollY),
          scrollLeft: Math.round(window.scrollX),
        })
      })
    }, 300)
  }

  document.addEventListener("click", onClick, true)
  document.addEventListener("input", onInput, true)
  document.addEventListener("scroll", onScroll, true)

  return () => {
    document.removeEventListener("click", onClick, true)
    document.removeEventListener("input", onInput, true)
    document.removeEventListener("scroll", onScroll, true)
    if (scrollTimer) clearTimeout(scrollTimer)
  }
}
