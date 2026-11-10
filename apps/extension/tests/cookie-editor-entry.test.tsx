import { fireEvent, render, screen, waitFor } from "@testing-library/preact"
import { beforeEach, expect, it, vi } from "vitest"
import CookieEditor from "../src/components/settings/CookieEditor"

beforeEach(() => {
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]) },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) }
  })
  vi.spyOn(window, "close").mockImplementation(() => {})
})
it("only opens the webpage panel and closes the Popup after success", async () => {
  render(<CookieEditor />)
  const button = screen.getByRole("button", { name: /Cookie 编辑器/ })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await waitFor(() => expect(window.close).toHaveBeenCalledOnce())
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ target: "cookie-editor", type: "open", tabId: 7 })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
it.each([
  "chrome://settings",
  "chrome-extension://other/index.html",
  "https://chromewebstore.google.com/detail/test",
  "https://chrome.google.com/webstore/detail/test"
])("disables the entry with a reason on %s", async (url) => {
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 7, url }] as chrome.tabs.Tab[])
  render(<CookieEditor />)
  await waitFor(() => expect(screen.queryByText("正在检查当前网页…")).not.toBeInTheDocument())
  expect(screen.getByRole("button", { name: /Cookie 编辑器/ })).toBeDisabled()
  expect(screen.getByText(/仅支持普通|禁止扩展注入/)).toBeInTheDocument()
})
it("keeps the Popup open and displays injection failures", async () => {
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: false, error: "页面禁止注入" })
  render(<CookieEditor />)
  const button = screen.getByRole("button", { name: /Cookie 编辑器/ })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  expect(await screen.findByRole("alert")).toHaveTextContent("页面禁止注入")
  expect(window.close).not.toHaveBeenCalled()
})
