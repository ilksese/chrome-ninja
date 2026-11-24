// Injected through chrome.scripting.executeScript, so this function cannot close over imports.
export async function runPageDomAction(action: PageDomAction): Promise<void> {
  const blockedInputTypes = new Set(["checkbox", "radio", "file", "button", "submit", "reset", "hidden", "image", "color", "range"])

  const isEditable = (element: Element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return false
    if (element.isContentEditable) return true
    const value = element.getAttribute("contenteditable")
    return value === "" || value === "true" || value === "plaintext-only"
  }

  if (action.action === "scroll") {
    scrollByAction(action)
    return
  }
  if (action.action === "wait") {
    await waitForPage(action)
    return
  }
  if (action.action === "history") {
    if (action.direction === "back") {
      if (history.length <= 1) throw new Error("没有可返回的历史记录")
      history.back()
      return
    }
    history.forward()
    return
  }
  if (action.action === "press" && !action.selector && !action.xpath && !action.ref) {
    pressKey(action)
    return
  }
  const element = targetOf(action)
  if (action.action === "click") {
    clickElement(element)
    return
  }
  if (action.action === "hover") {
    hoverElement(element)
    return
  }
  if (action.action === "fill") {
    fillElement(element, action.value)
    return
  }
  if (action.action === "press") {
    pressKey(action, element)
    return
  }
  selectOption(element, action)

  function targetOf(target: { selector?: string; xpath?: string; ref?: string }) {
    if (target.ref) {
      const found = document.querySelector(`[data-chrome-ninja-ref="${CSS.escape(target.ref)}"]`)
      if (!found) throw new Error("没有找到目标元素")
      return found
    }
    if (target.selector) {
      let found: Element | null = null
      try {
        found = document.querySelector(target.selector)
      } catch {
        throw new Error("selector 无效")
      }
      if (!found) throw new Error("没有找到目标元素")
      return found
    }
    if (!target.xpath) throw new Error("没有找到目标元素")
    let found: Node | null = null
    try {
      found = document.evaluate(target.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
    } catch {
      throw new Error("xpath 无效")
    }
    if (!(found instanceof Element)) throw new Error("没有找到目标元素")
    return found
  }

  function scrollByAction(scroll: { x: number; y: number; selector?: string; xpath?: string; ref?: string }) {
    const hasTarget = Boolean(scroll.selector || scroll.xpath || scroll.ref)
    const scroller = hasTarget ? scrollableAncestor(targetOf(scroll)) : (document.scrollingElement ?? document.documentElement)
    if (!scroller) throw new Error("目标元素不能滚动")
    scroller.scrollBy({ left: scroll.x, top: scroll.y, behavior: "instant" })
  }

  function scrollableAncestor(element: Element) {
    let current: Element | null = element
    while (current) {
      if (canScroll(current)) return current
      current = current.parentElement
    }
    return null
  }

  function canScroll(element: Element) {
    const top = document.scrollingElement ?? document.documentElement
    if (element === top || element === document.body || element === document.documentElement) {
      return top.scrollHeight > top.clientHeight + 1 || top.scrollWidth > top.clientWidth + 1
    }
    const style = getComputedStyle(element)
    const scrollsY = style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowY === "overlay"
    const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowX === "overlay"
    return (scrollsY && element.scrollHeight > element.clientHeight + 1) || (scrollsX && element.scrollWidth > element.clientWidth + 1)
  }

  function clickElement(element: Element) {
    const point = centerOf(element)
    if (element instanceof HTMLElement) element.focus({ preventScroll: true })
    for (const type of ["pointerover", "pointerenter", "pointermove", "pointerdown", "pointerup"]) dispatchAt(element, point, "pointer", type)
    for (const type of ["mouseover", "mouseenter", "mousemove", "mousedown", "mouseup", "click"]) dispatchAt(element, point, "mouse", type)
  }

  function hoverElement(element: Element) {
    // shortcut: scripted hover cannot set CSS :hover, needs CDP which ADR 0004 forbids
    const point = centerOf(element)
    for (const type of ["pointerover", "pointerenter", "pointermove"]) dispatchAt(element, point, "pointer", type)
    for (const type of ["mouseover", "mouseenter", "mousemove"]) dispatchAt(element, point, "mouse", type)
  }

  function centerOf(element: Element) {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    const rect = element.getBoundingClientRect()
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
  }

  function dispatchAt(element: Element, point: { clientX: number; clientY: number }, kind: "pointer" | "mouse", type: string) {
    const view = document.defaultView ?? window
    const PointerEventCtor = view.PointerEvent
    if (!PointerEventCtor) throw new Error("页面不支持指针事件")
    if (kind === "pointer") {
      element.dispatchEvent(
        new PointerEventCtor(type, { bubbles: true, cancelable: true, ...point, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 })
      )
      return
    }
    element.dispatchEvent(new view.MouseEvent(type, { bubbles: true, cancelable: true, ...point, button: 0 }))
  }

  function fillElement(element: Element, value: string) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element instanceof HTMLInputElement && blockedInputTypes.has(element.type)) throw new Error("目标不是可填写元素")
      element.focus()
      // React tracks the DOM value property; assigning element.value alone does not notify it.
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
      if (setter) setter.call(element, value)
      else element.value = value
      emitInput(element, value)
      return
    }
    if (isEditable(element)) {
      element.focus()
      element.textContent = value
      emitInput(element, value)
      return
    }
    throw new Error("目标不是可填写元素")
  }

  function emitInput(element: Element, value: string) {
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function selectOption(element: Element, select: { value?: string; label?: string }) {
    if (!(element instanceof HTMLSelectElement)) throw new Error("目标不是 select")
    if (element.multiple) throw new Error("不支持多选 select")
    const option = [...element.options].find((item) => {
      if (item.disabled) return false
      if (select.value !== undefined) return item.value === select.value
      return item.label === select.label || item.text.trim() === select.label
    })
    if (!option) throw new Error("没有找到要选择的选项")
    element.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
    if (setter) setter.call(element, option.value)
    else element.value = option.value
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function pressKey(press: PressAction, element?: Element) {
    const target = element ?? (document.activeElement instanceof Element ? document.activeElement : document.body)
    if (target instanceof HTMLElement) target.focus()
    const init: KeyboardEventInit = {
      key: press.key,
      code: press.key,
      bubbles: true,
      cancelable: true,
      altKey: press.altKey === true,
      ctrlKey: press.ctrlKey === true,
      metaKey: press.metaKey === true,
      shiftKey: press.shiftKey === true
    }
    const down = new KeyboardEvent("keydown", init)
    target.dispatchEvent(down)
    if (!down.defaultPrevented) applyUntrustedDefault(target, press)
    target.dispatchEvent(new KeyboardEvent("keyup", init))
  }

  function applyUntrustedDefault(target: Element, press: PressAction) {
    // shortcut: untrusted Tab/Enter do not run browser defaults; Tab moves focus and plain Enter calls requestSubmit. Real defaults need CDP, which ADR 0004 forbids.
    if (press.key === "Tab") {
      moveFocus(press.shiftKey === true)
      return
    }
    if (press.key !== "Enter" || press.altKey || press.ctrlKey || press.metaKey) return
    if (target instanceof HTMLTextAreaElement || isEditable(target)) return
    if (target instanceof HTMLButtonElement && target.form) {
      target.form.requestSubmit(target)
      return
    }
    if (target instanceof HTMLInputElement && target.form) target.form.requestSubmit()
  }

  function moveFocus(backward: boolean) {
    const tabbables = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter((element) => {
      if (element.tabIndex < 0) return false
      if ("disabled" in element && Boolean(element.disabled)) return false
      const style = getComputedStyle(element)
      return style.display !== "none" && style.visibility !== "hidden"
    })
    if (tabbables.length === 0) return
    const index = tabbables.indexOf(document.activeElement as HTMLElement)
    const next = backward ? tabbables[(index <= 0 ? tabbables.length : index) - 1] : tabbables[(index + 1) % tabbables.length]
    next?.focus()
  }

  async function waitForPage(wait: { until: "selector"; selector: string; timeout: number } | { until: "text"; text: string; timeout: number }) {
    const timeout = Math.min(Math.max(wait.timeout, 1), 7000)
    const start = performance.now()
    while (performance.now() - start <= timeout) {
      if (wait.until === "selector") {
        let found: Element | null = null
        try {
          found = document.querySelector(wait.selector)
        } catch {
          throw new Error("selector 无效")
        }
        if (found) return
      } else if ((document.body?.textContent || "").includes(wait.text)) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("等待超时")
  }
}

type Target = { selector?: string; xpath?: string; ref?: string }

type PressAction = Target & {
  action: "press"
  key: "Enter" | "Escape" | "Tab"
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export type PageDomAction =
  | (Target & { action: "scroll"; x: number; y: number })
  | (Target & { action: "click" })
  | (Target & { action: "hover" })
  | (Target & { action: "fill"; value: string })
  | (Target & { action: "select"; value?: string; label?: string })
  | PressAction
  | { action: "wait"; until: "selector"; selector: string; timeout: number }
  | { action: "wait"; until: "text"; text: string; timeout: number }
  | { action: "history"; direction: "back" | "forward" }
