// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { CookieEntry, CookieNotice } from "../src/cookie-editor/types"
import { onExecute } from "../src/cookie-editor/content"
import { startCapture } from "../src/recorder/capture"

let entries: CookieEntry[]
const listeners = new Set<(notice: CookieNotice) => void>()
const tick = () => vi.advanceTimersByTimeAsync(20)
const findButton = (label: string) => {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === label)
  if (!button) throw new Error(`Missing button ${label}`)
  return button
}
beforeEach(() => {
  vi.useFakeTimers()
  entries = [
    {
      id: "one",
      revision: "1",
      disabled: false,
      cookie: {
        name: "Token",
        value: "Secret",
        domain: "example.com",
        path: "/",
        hostOnly: true,
        storeId: "0",
        secure: true,
        httpOnly: true,
        session: true,
        sameSite: "lax"
      }
    },
    {
      id: "two",
      revision: "2",
      disabled: true,
      cookie: {
        name: "Other",
        value: "hidden VALUE",
        domain: "example.com",
        path: "/",
        hostOnly: true,
        storeId: "0",
        secure: true,
        httpOnly: false,
        session: true,
        sameSite: "lax"
      }
    }
  ]
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async () => ({
        ok: true,
        entries: structuredClone(entries),
        hostname: "example.com",
        secure: true,
        storeId: "0"
      })),
      onMessage: {
        addListener: (fn: (notice: CookieNotice) => void) => listeners.add(fn),
        removeListener: (fn: (notice: CookieNotice) => void) => listeners.delete(fn)
      }
    }
  })
})
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  listeners.clear()
  vi.useRealTimers()
})

it("mounts only one panel, searches name or value including disabled entries, and removes subscriptions on close", async () => {
  onExecute()
  onExecute()
  await tick()
  expect(document.querySelectorAll("chrome-ninja-cookie-editor")).toHaveLength(1)
  expect(listeners.size).toBe(1)
  const search = document.querySelector<HTMLInputElement>('input[aria-label="搜索 Cookie"]')!
  const visible = () =>
    [...document.querySelectorAll<HTMLElement>("[data-cookie-id]")].filter((row) => row.style.display !== "none")
  search.value = "tOkEn"
  search.dispatchEvent(new Event("input"))
  expect(visible()).toHaveLength(1)
  expect(visible()[0].textContent).toContain("Token")
  search.value = "value"
  search.dispatchEvent(new Event("input"))
  expect(visible()).toHaveLength(1)
  expect(visible()[0].textContent).toContain("已禁用")
  search.value = ""
  search.dispatchEvent(new Event("input"))
  expect(visible()).toHaveLength(2)
  document.querySelector<HTMLButtonElement>('[aria-label="关闭Cookie 编辑器"]')!.click()
  expect(document.querySelector("chrome-ninja-cookie-editor")).toBeNull()
  expect(listeners.size).toBe(0)
})

const submit = (form: HTMLFormElement) => form.requestSubmit()
it("keeps a draft and selection during external updates, blocks conflicts, and reloads only when requested", async () => {
  onExecute()
  await tick()
  findButton("编辑").click()
  const input = document.querySelector<HTMLInputElement>('input[aria-label="值"]')!
  input.value = "my unsaved draft"
  input.focus()
  input.setSelectionRange(2, 6)
  const panel = document.querySelector<HTMLElement>('[role="region"]')!
  panel.style.width = "450px"
  panel.style.height = "550px"
  const scroll = document.querySelector<HTMLElement>("[data-cookie-id]")!.parentElement!
  scroll.scrollTop = 60
  entries[0] = { ...entries[0], revision: "new", cookie: { ...entries[0].cookie, value: "website update" } }
  listeners.forEach((fn) => fn({ target: "cookie-editor-ui", type: "changed" }))
  await tick()
  expect(document.querySelector('input[aria-label="值"]')).toBe(input)
  expect(input.value).toBe("my unsaved draft")
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6])
  expect(findButton("保存").disabled).toBe(true)
  expect(document.body.textContent + document.documentElement.textContent!).toContain("草稿已保留")
  expect(scroll.scrollTop).toBe(60)
  expect([panel.style.width, panel.style.height]).toEqual(["450px", "550px"])
  submit(input.closest("form")!)
  await tick()
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "save" }))
  findButton("重新载入最新版本").click()
  const latestInput = document.querySelector<HTMLInputElement>('input[aria-label="值"]')!
  expect(latestInput.value).toBe("website update")
  latestInput.value = "saved"
  submit(latestInput.closest("form")!)
  await tick()
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "save",
      original: { id: "one", revision: "new" },
      cookie: expect.objectContaining({ value: "saved" })
    })
  )
})
it("uses new Cookie defaults, writes only on save, and discards drafts on close", async () => {
  onExecute()
  await tick()
  findButton("新增 Cookie").click()
  const read = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  expect(read("名称").value).toBe("")
  expect(read("Domain").value).toBe("example.com")
  expect(read("Path").value).toBe("/")
  expect(read("Secure").checked).toBe(true)
  expect(read("HttpOnly").checked).toBe(false)
  expect(read("仅当前主机").checked).toBe(true)
  expect(read("会话 Cookie").checked).toBe(true)
  expect(document.querySelector<HTMLSelectElement>('select[aria-label="SameSite"]')!.value).toBe("lax")
  read("名称").value = "created"
  read("值").value = ""
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "save" }))
  submit(read("名称").closest("form")!)
  await tick()
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    target: "cookie-editor",
    type: "save",
    cookie: expect.objectContaining({
      name: "created",
      value: "",
      hostOnly: true,
      secure: true,
      session: true,
      storeId: "0"
    })
  })
  vi.mocked(chrome.runtime.sendMessage).mockClear()
  findButton("新增 Cookie").click()
  read("名称").value = "discarded"
  document.querySelector<HTMLButtonElement>('[aria-label="关闭Cookie 编辑器"]')!.click()
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "save" }))
  onExecute()
  await tick()
  expect(document.querySelector('input[aria-label="名称"]')).toBeNull()
  expect(listeners.size).toBe(1)
})
it("survives document routes and cleans listeners and dragging on page unload", async () => {
  onExecute()
  await tick()
  const panel = document.querySelector<HTMLElement>('[role="region"]')!
  const header = panel.firstElementChild!
  header.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 200, clientY: 20 }))
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 80 }))
  expect(panel.style.left).toBe("60px")
  window.dispatchEvent(new PopStateEvent("popstate"))
  expect(panel.isConnected).toBe(true)
  window.dispatchEvent(new Event("pagehide"))
  expect(panel.isConnected).toBe(false)
  expect(listeners.size).toBe(0)
  const left = panel.style.left
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 600, clientY: 300 }))
  expect(panel.style.left).toBe(left)
})

it("keeps a failed save draft visible and excludes editor interaction from recording", async () => {
  onExecute()
  await tick()
  const capture = vi.fn()
  const stop = startCapture(capture)
  try {
    findButton("编辑").click()
    const input = document.querySelector<HTMLInputElement>('input[aria-label="值"]')!
    input.value = "keep on failure"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    document.querySelector('[role="region"]')!.dispatchEvent(new Event("scroll"))
    await vi.advanceTimersByTimeAsync(350)
    expect(capture).not.toHaveBeenCalled()
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ ok: false, error: "持久化失败" })
    submit(input.closest("form")!)
    await tick()
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe("keep on failure")
    expect(input.closest("form")!.textContent).toContain("持久化失败")
    expect(findButton("保存").disabled).toBe(false)
  } finally {
    stop()
  }
})

it("submits persistent Cookies with expiration seconds through native form validation", async () => {
  entries[0].cookie = { ...entries[0].cookie, session: false, expirationDate: 2000000036 }
  onExecute()
  await tick()
  findButton("编辑").click()
  const form = document.querySelector("form")!
  const input = document.querySelector<HTMLInputElement>('input[aria-label="值"]')!
  input.value = "changed persistent value"
  expect(form.checkValidity()).toBe(true)
  form.requestSubmit()
  await tick()
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "save",
      cookie: expect.objectContaining({ value: "changed persistent value", expirationDate: 2000000036, session: false })
    })
  )
})
