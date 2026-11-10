// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import van from "vanjs-core"
import { Button, Input, Row } from "../src/content-ui/components"
import { createScope, isContentUIEvent, mountContentUI } from "../src/content-ui/lifecycle"
import { showToast } from "../src/content-ui/toast"
import RecorderPanel from "../src/recorder/panel"
import NetmonPanel from "../src/network-monitor/Panel"
import type { RecorderViewState } from "../src/recorder/messages"
import type { NetmonRecord } from "../src/network-monitor/types"
import { startCapture } from "../src/recorder/capture"

type StateListener = (message: { target: string; type: string; state: RecorderViewState }) => void
const listeners = new Set<StateListener>()
const disposals: (() => void)[] = []
const tick = () => vi.advanceTimersByTimeAsync(10)

beforeEach(() => {
  vi.useFakeTimers()
  listeners.clear()
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: {
        addListener: (listener: StateListener) => listeners.add(listener),
        removeListener: (listener: StateListener) => listeners.delete(listener)
      }
    }
  })
})

afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose())
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  document.querySelectorAll("[data-chrome-ninja-ui]").forEach((element) => element.remove())
  vi.useRealTimers()
})

const mount = (view: { element: HTMLElement; dispose: () => void }) => {
  const mounted = mountContentUI("chrome-ninja-test", "data-test-ui", view)
  disposals.push(mounted.dispose)
  return mounted.element
}

const findButton = (element: Element, label: string) => {
  const result = [...element.querySelectorAll("button")].find((button) => button.textContent === label)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}

describe("content UI", () => {
  it("reacts to disabled and focus state without replacing input or installing stylesheets", async () => {
    const disabled = van.state(false)
    const input = Input({ value: "draft" })
    const button = Button({ disabled: () => disabled.val }, "提交")
    const root = mount({ element: Row({}, input, button), dispose: () => {} })
    input.focus()
    input.setSelectionRange(1, 3)
    disabled.val = true
    await tick()
    expect(button.disabled).toBe(true)
    expect(button.style.opacity).toBe("0.5")
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(3)
    expect(root.shadowRoot).toBeNull()
    expect(root.querySelector("style, link")).toBeNull()
    for (const node of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
      for (const property of Array.from(node.style)) expect(node.style.getPropertyPriority(property)).toBe("")
    }
    const listener = vi.fn((event: Event) => expect(isContentUIEvent(event)).toBe(true))
    root.addEventListener("click", listener)
    input.click()
    expect(listener).toHaveBeenCalledOnce()
  })

  it("disposes a replaced mount and cancels its pending resources", async () => {
    const scope = createScope()
    const callback = vi.fn()
    scope.timeout(callback, 20)
    const cleanup = vi.fn()
    scope.add(cleanup)
    mount({ element: Row(), dispose: scope.dispose })
    mount({ element: Row(), dispose: () => {} })
    await vi.advanceTimersByTimeAsync(30)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(callback).not.toHaveBeenCalled()
    expect(document.querySelectorAll("chrome-ninja-test")).toHaveLength(1)
  })

  it("excludes content UI click, input and scroll from recording while retaining page input", async () => {
    const captured = vi.fn()
    const stop = startCapture(captured)
    disposals.push(stop)
    const input = Input({ value: "UI value" })
    const root = mount({ element: Row({}, input, Button({}, "UI action")), dispose: () => {} })
    input.dispatchEvent(new Event("input", { bubbles: true }))
    root.querySelector("button")!.click()
    root.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(350)
    expect(captured).not.toHaveBeenCalled()
    const pageInput = document.createElement("input")
    pageInput.value = "page value"
    document.body.append(pageInput)
    pageInput.dispatchEvent(new Event("input", { bubbles: true }))
    expect(captured).toHaveBeenCalledWith(expect.objectContaining({ kind: "input", value: "page value" }))
  })

  it("shows the shared Toast on every execution of the fallback entry", async () => {
    const { onExecute } = await import("../src/element-copy/feedback-entry")
    onExecute()
    await vi.advanceTimersByTimeAsync(2000)
    onExecute()
    expect(document.querySelectorAll("chrome-ninja-copy-toast")).toHaveLength(1)
    expect(document.querySelector("chrome-ninja-copy-toast")?.textContent).toContain("刷新页面")
    await vi.advanceTimersByTimeAsync(2000)
    expect(document.querySelector("chrome-ninja-copy-toast")).not.toBeNull()
  })

  it("replaces a toast and expires it three seconds after the latest message", async () => {
    showToast("first")
    await vi.advanceTimersByTimeAsync(2000)
    showToast("second")
    expect(document.querySelectorAll("chrome-ninja-copy-toast")).toHaveLength(1)
    expect(document.querySelector("[role=status]")?.textContent).toBe("second")
    await vi.advanceTimersByTimeAsync(2000)
    expect(document.querySelector("chrome-ninja-copy-toast")).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(document.querySelector("chrome-ninja-copy-toast")).toBeNull()
  })

  it("keeps recorder rename input and selection across background state updates and removes subscription", async () => {
    const panel = RecorderPanel()
    const root = mount(panel)
    const state: RecorderViewState = {
      enabled: true,
      task: null,
      history: [
        {
          id: "history",
          name: "original",
          rootUrl: "https://example.com",
          rootDomain: "example.com",
          createdAt: 1,
          steps: []
        }
      ]
    }
    const broadcast = () =>
      listeners.forEach((listener) =>
        listener({ target: "recorder-panel", type: "STATE", state: structuredClone(state) })
      )
    broadcast()
    await tick()
    findButton(root, "重命名").click()
    await tick()
    const input = root.querySelector("input")!
    input.value = "changed"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await tick()
    input.focus()
    input.setSelectionRange(2, 4)
    broadcast()
    await tick()
    expect(root.querySelector("input")).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe("changed")
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4])
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      target: "recorder",
      type: "COMMAND",
      command: { name: "renameHistory", historyId: "history", newName: "changed" }
    })
    panel.dispose()
    expect(listeners.size).toBe(0)
  })

  it("keeps network input, expanded details, scroll and resized dimensions during updates and drag", async () => {
    const record: NetmonRecord = {
      id: "one",
      tabId: 1,
      ts: 1,
      method: "GET",
      url: "https://example.com/api",
      frameUrl: "https://example.com",
      frameId: 0,
      status: 200,
      duration: 20,
      requestHeaders: [],
      responseHeaders: [],
      requestBody: null,
      body: { mode: "json", text: '{"ok":true}', truncated: false },
      bodyNote: null,
      outcome: "success",
      error: null
    }
    const panel = NetmonPanel({ enabled: true, rules: [], records: [record] })
    const root = mount(panel)
    const input = root.querySelector("input")!
    input.value = "draft"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await tick()
    input.focus()
    input.setSelectionRange(1, 3)
    const recordToggle = root.querySelector<HTMLButtonElement>("button[aria-expanded]")!
    recordToggle.click()
    await tick()
    const responseToggle = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.startsWith("响应体")
    )!
    responseToggle.click()
    await tick()
    const code = root.querySelector("pre")!
    const list = panel.element.lastElementChild as HTMLElement
    Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } })
    list.scrollTop = 120
    panel.element.style.width = "420px"
    panel.element.style.height = "500px"
    panel.update({ enabled: true, rules: [], records: [record, { ...record, id: "two", ts: 2 }] })
    await tick()
    expect(root.querySelector("input")).toBe(input)
    expect(input.value).toBe("draft")
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
    expect(root.querySelector("pre")).toBe(code)
    expect(responseToggle.getAttribute("aria-expanded")).toBe("true")
    expect(list.scrollTop).toBe(120)
    root
      .querySelector(".netmon-drag-header")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 750, clientY: 20 }))
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700, clientY: 50 }))
    expect(panel.element.style.width).toBe("420px")
    expect(panel.element.style.height).toBe("500px")
    panel.dispose()
    const left = panel.element.style.left
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }))
    expect(panel.element.style.left).toBe(left)
  })
})
