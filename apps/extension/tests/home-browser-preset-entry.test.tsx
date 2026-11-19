import { beforeEach, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/preact"

const navigate = vi.fn()
let simulatingId: string | undefined
let sendMessage: ReturnType<typeof vi.fn>

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }))

const presets = [
  {
    id: "preset-1",
    name: "iPhone 15",
    userAgent: "safira-ios",
    viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true }
  }
]

const reply = (command: { type: string }) => {
  if (command.type === "status") return { ok: true, tabId: 7, unavailableReason: "", ...(simulatingId ? { presetId: simulatingId } : {}) }
  if (command.type === "list") return { ok: true, presets }
  if (command.type === "simulate-exit") {
    simulatingId = undefined
    return { ok: true, tabId: 7 }
  }
  return { ok: true }
}

beforeEach(() => {
  navigate.mockReset()
  simulatingId = undefined
  sendMessage = vi.fn(async (command: { type: string }) => reply(command))
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    // Home 的 Cookie 编辑器入口会读当前活动标签页，虽与浏览器预设无关，仍需可用。
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]) },
    runtime: { sendMessage }
  })
})

it("首页卡片可进入浏览器预设页", async () => {
  const { default: Home } = await import("../src/pages/Home")
  render(<Home layout="popup" />)
  const card = await screen.findByRole("button", { name: /浏览器预设/ })
  expect(card).toHaveTextContent("为单个标签页切换 User-Agent 与 viewport")
  fireEvent.click(card)
  expect(navigate).toHaveBeenCalledWith("/browser-presets")
})

it("当前标签页没有模拟时首页卡片明确说明", async () => {
  const { default: Home } = await import("../src/pages/Home")
  render(<Home layout="popup" />)
  expect(await screen.findByText("当前没有模拟")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "退出模拟" })).not.toBeInTheDocument()
})

it("首页卡片展示正在模拟的预设名并可直接退出模拟", async () => {
  simulatingId = "preset-1"
  const { default: Home } = await import("../src/pages/Home")
  render(<Home layout="popup" />)
  expect(await screen.findByText("正在模拟「iPhone 15」")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "退出模拟" }))
  expect(await screen.findByText("当前没有模拟")).toBeInTheDocument()
  expect(sendMessage).toHaveBeenCalledWith({ target: "browser-preset", type: "simulate-exit" })
  expect(navigate).not.toHaveBeenCalled()
})
