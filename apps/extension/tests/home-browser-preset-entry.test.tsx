import { beforeEach, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/preact"

const navigate = vi.fn()

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }))

beforeEach(() => {
  navigate.mockReset()
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]) },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) }
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
