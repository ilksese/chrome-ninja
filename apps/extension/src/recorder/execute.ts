import type { RecorderLocator, RecorderStep } from "./types"
import type { RecorderReplayStepResponse } from "./messages"
import { REPLAY_WAIT_MS } from "./storage"

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

function matchesText(el: Element, text: string): boolean {
  return Boolean(el.textContent && el.textContent.includes(text))
}

function findBySelector(el: Element, selector: string): Element | null {
  try {
    if (el.matches(selector)) return el
    return el.querySelector(selector)
  } catch {
    return null
  }
}

function locate(el: Element, target: RecorderLocator): Element | null {
  if (target.id) {
    const found = findBySelector(el, `#${CSS.escape(target.id)}`)
    if (found) return found
  }
  if (target.ariaLabel) {
    const found = findBySelector(el, `[aria-label="${CSS.escape(target.ariaLabel)}"]`)
    if (found) return found
  }
  if (target.name) {
    const found = findBySelector(el, `[name="${CSS.escape(target.name)}"]`)
    if (found) return found
  }
  if (target.path) {
    const found = findBySelector(el, target.path)
    if (found) return found
  }
  if (target.role && target.text) {
    const byRole = Array.from(el.querySelectorAll(`[role="${CSS.escape(target.role)}"]`))
    const found = byRole.find((n) => matchesText(n, target.text!))
    if (found) return found
  }
  if (target.css) {
    const found = findBySelector(el, target.css)
    if (found) return found
  }
  if (target.text) {
    const candidates = Array.from(el.querySelectorAll(CLICKABLE_SELECTOR))
    const found = candidates.find((n) => matchesText(n, target.text!))
    if (found) return found
  }
  if (/^[a-z][a-z\d-]*$/i.test(target.tag)) {
    const found = findBySelector(el, target.tag)
    if (found) return found
  }
  return null
}

async function waitForElement(el: Element, target: RecorderLocator, timeoutMs: number): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = locate(el, target)
    if (found) return found
    await new Promise((r) => setTimeout(r, 200))
  }
  return locate(el, target)
}

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  if (setter) {
    setter.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

async function executeOnTarget(step: Extract<RecorderStep, { target: RecorderLocator }>): Promise<RecorderReplayStepResponse> {
  const el = await waitForElement(document.body, step.target, REPLAY_WAIT_MS)
  if (!el) {
    return { ok: false, error: `定位超时: ${JSON.stringify(step.target)}` }
  }

  if (step.kind === "click") {
    if (el instanceof HTMLElement) {
      el.click()
    } else {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    }
    return { ok: true }
  }

  if (step.kind === "input") {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, step.value)
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      el.textContent = step.value
      el.dispatchEvent(new Event("input", { bubbles: true }))
    } else {
      return { ok: false, error: "目标不可输入" }
    }
    return { ok: true }
  }

  return { ok: false, error: "不支持的步骤类型" }
}

export async function executeStep(step: RecorderStep): Promise<RecorderReplayStepResponse> {
  try {
    if (step.kind === "scroll") {
      const withTarget = step as typeof step & { target?: RecorderLocator }
      if (withTarget.target) {
        const el = await waitForElement(document.body, withTarget.target, REPLAY_WAIT_MS)
        if (!el) {
          return { ok: false, error: `定位超时: ${JSON.stringify(withTarget.target)}` }
        }
        el.scrollTop = step.scrollTop
        el.scrollLeft = step.scrollLeft
      } else {
        window.scrollTo(step.scrollLeft, step.scrollTop)
      }
      return { ok: true }
    }
    return executeOnTarget(step)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
