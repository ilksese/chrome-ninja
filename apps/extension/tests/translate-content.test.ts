// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Options = { translate: { enabled: boolean } }
let change: (changes: { options: { newValue: Options } }, area: string) => void
let resolveRequest: (response: { ok: boolean; data: string }) => void
let selectedText: string
const roots = () => document.querySelectorAll<HTMLElement>("[data-translate-ui]")
const tick = () => vi.advanceTimersByTimeAsync(10)
const enable = (enabled: boolean) => change({ options: { newValue: { translate: { enabled } } } }, "local")
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  selectedText = "selected text"
  const range = { cloneRange: () => range, getBoundingClientRect: () => new DOMRect(20, 30, 100, 20) }
  vi.spyOn(window, "getSelection").mockImplementation(
    () =>
      ({
        rangeCount: 1,
        isCollapsed: false,
        toString: () => selectedText,
        getRangeAt: () => range
      }) as unknown as Selection
  )
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve
          })
      )
    },
    storage: {
      local: {
        get: (_keys: string[], callback: (result: { options: Options }) => void) =>
          callback({ options: { translate: { enabled: true } } })
      },
      onChanged: {
        addListener: (listener: typeof change) => {
          change = listener
        }
      }
    }
  })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
  })
})

afterEach(() => {
  enable(false)
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe("VanJS translation content UI", () => {
  it("keeps positioned bubble visible on hover and preserves the selection while copying", async () => {
    await import("../src/content-script/translate/index")
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    const bubble = button("翻译选中文本")
    const position = bubble.parentElement!
    expect(position.style.display).toBe("flex")
    const left = position.style.left
    bubble.dispatchEvent(new MouseEvent("mouseenter"))
    await tick()
    expect(position.style.display).toBe("flex")
    expect(position.style.left).toBe(left)
    expect(bubble.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))).toBe(false)
    bubble.click()
    resolveRequest({ ok: true, data: "翻译结果" })
    await tick()
    expect(roots()[0].textContent).toContain("翻译结果")
    const copy = [...roots()[0].querySelectorAll("button")].find((node) => node.textContent === "复制")!
    copy.click()
    await tick()
    expect(copy.textContent).toBe("已复制")
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("翻译结果")
    expect(roots()[0].shadowRoot).toBeNull()
  })

  it("ignores responses after close, new selection or disable, and does not duplicate roots on re-enable", async () => {
    await import("../src/content-script/translate/index")
    document.dispatchEvent(new MouseEvent("mouseup"))
    button("翻译选中文本").click()
    const old = resolveRequest
    button("关闭AI 翻译").click()
    old({ ok: true, data: "stale close" })
    await tick()
    expect(roots()[0].textContent).not.toContain("stale close")
    button("翻译选中文本").click()
    const previousSelection = resolveRequest
    selectedText = "new selection"
    document.dispatchEvent(new MouseEvent("mouseup"))
    button("翻译选中文本").click()
    previousSelection({ ok: true, data: "stale selection" })
    await tick()
    expect(roots()[0].textContent).not.toContain("stale selection")
    const pending = resolveRequest
    enable(false)
    pending({ ok: true, data: "stale disable" })
    await tick()
    expect(roots()).toHaveLength(0)
    enable(true)
    enable(true)
    expect(roots()).toHaveLength(1)
    expect(roots()[0].textContent).not.toContain("stale disable")
  })
})
