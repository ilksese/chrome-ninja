import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact"
import BrowserPresets from "../src/pages/BrowserPresets"

type Preset = {
  id: string
  name: string
  userAgent: string
  viewport: { width: number; height: number; deviceScaleFactor: number; mobile: boolean }
}

let presets: Preset[] = []
let sendMessage = vi.fn()
let unavailableReason = ""
let applyResult: { ok: boolean; error?: string } | undefined

const preset = (patch: Partial<Preset> = {}): Preset => ({
  id: "preset-1",
  name: "iPhone 15",
  userAgent: "safira-ios",
  viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true },
  ...patch
})

const reply = (command: { type: string; [key: string]: unknown }) => {
  if (command.type === "list") return { ok: true, presets: structuredClone(presets) }
  if (command.type === "status") return { ok: true, tabId: 7, unavailableReason }
  if (command.type === "apply") return applyResult ?? { ok: true }
  if (command.type === "create" || command.type === "update") {
    const draft = command.preset as Omit<Preset, "id">
    const id = (command.id as string | undefined) ?? `preset-${presets.length + 1}`
    const stored = { id, ...draft }
    presets = command.type === "create" ? [...presets, stored] : presets.map((item) => (item.id === id ? stored : item))
    return { ok: true, preset: structuredClone(stored), presets: structuredClone(presets) }
  }
  if (command.type === "delete") {
    presets = presets.filter((item) => item.id !== command.id)
    return { ok: true, presets: structuredClone(presets) }
  }
  return { ok: false, error: "未知命令" }
}

const renderPage = () => render(<BrowserPresets layout="popup" />)

const commands = (type: string) =>
  sendMessage.mock.calls.map(([command]) => command).filter((command) => command.type === type)

beforeEach(() => {
  presets = []
  unavailableReason = ""
  applyResult = undefined
  sendMessage = vi.fn(async (command: { type: string; [key: string]: unknown }) => reply(command))
  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: "https://example.com" }]) }
  })
})

describe("浏览器预设页", () => {
  it("空列表显示说明并提示需要附加调试权限", async () => {
    renderPage()
    expect(await screen.findByText(/尚未创建浏览器预设/)).toBeInTheDocument()
    expect(screen.getByText(/需要附加调试权限/)).toBeInTheDocument()
  })

  it("创建表单展示全部字段并在越界时给出校验提示", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "新建预设" }))
    const form = screen.getByRole("form", { name: "预设表单" })
    expect(within(form).getByLabelText("预设名称")).toBeInTheDocument()
    expect(within(form).getByLabelText("User-Agent")).toBeInTheDocument()
    expect(within(form).getByLabelText("视口宽度")).toBeInTheDocument()
    expect(within(form).getByLabelText("视口高度")).toBeInTheDocument()
    expect(within(form).getByLabelText("设备像素比")).toBeInTheDocument()
    expect(within(form).getByLabelText("移动端布局")).toBeInTheDocument()

    fireEvent.input(within(form).getByLabelText("视口宽度"), { target: { value: "100" } })
    expect(await within(form).findByText("视口宽度必须是 200–4000 之间的整数")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存预设" })).toBeDisabled()
  })

  it("重名时给出名称冲突提示", async () => {
    presets = [preset()]
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "新建预设" }))
    fireEvent.input(screen.getByLabelText("预设名称"), { target: { value: "iphone 15" } })
    expect(await screen.findByText("预设名称已存在，请换一个名称")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存预设" })).toBeDisabled()
  })

  it("设备档位按钮填入数值后仍可微调", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "新建预设" }))
    fireEvent.click(screen.getByRole("button", { name: "iPhone 15 Pro" }))
    const width = screen.getByLabelText("视口宽度") as HTMLInputElement
    expect(width.value).toBe("393")
    fireEvent.input(width, { target: { value: "400" } })
    expect(width.value).toBe("400")
  })

  it("创建成功后列表展示新预设", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "新建预设" }))
    fireEvent.input(screen.getByLabelText("预设名称"), { target: { value: "iPad 调试" } })
    fireEvent.click(screen.getByRole("button", { name: "iPad mini" }))
    fireEvent.click(screen.getByRole("button", { name: "保存预设" }))
    expect(await screen.findByText("iPad 调试")).toBeInTheDocument()
    expect(commands("create")).toHaveLength(1)
  })

  it("编辑时表单带入现有字段并可重命名", async () => {
    presets = [preset()]
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "编辑 iPhone 15" }))
    const name = screen.getByLabelText("预设名称") as HTMLInputElement
    expect(name.value).toBe("iPhone 15")
    fireEvent.input(name, { target: { value: "iPhone 15 改" } })
    fireEvent.click(screen.getByRole("button", { name: "保存预设" }))
    expect(await screen.findByText("iPhone 15 改")).toBeInTheDocument()
    expect(commands("update")).toHaveLength(1)
  })

  it("删除前二次确认展示预设名，取消不删除", async () => {
    presets = [preset()]
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "删除 iPhone 15" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText(/iPhone 15/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
    expect(commands("delete")).toHaveLength(0)
    expect(screen.getByText("iPhone 15")).toBeInTheDocument()
  })

  it("确认删除后移除预设", async () => {
    presets = [preset()]
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "删除 iPhone 15" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认删除" }))
    await waitFor(() => expect(screen.queryByText("iPhone 15")).not.toBeInTheDocument())
  })

  it("应用预设成功后给出可见反馈", async () => {
    presets = [preset()]
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "应用 iPhone 15" }))
    expect(await screen.findByRole("status")).toHaveTextContent("已应用「iPhone 15」")
    expect(commands("apply")).toMatchObject([{ target: "browser-preset", type: "apply", id: "preset-1" }])
  })

  it("受限页面上禁用在点击前应用并说明原因", async () => {
    presets = [preset()]
    unavailableReason = "Chrome 网上应用店禁止扩展注入"
    renderPage()
    const button = await screen.findByRole("button", { name: "应用 iPhone 15" })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Chrome 网上应用店禁止扩展注入/)).toBeInTheDocument()
    fireEvent.click(button)
    expect(commands("apply")).toHaveLength(0)
  })

  it("应用失败时展示可读原因", async () => {
    presets = [preset()]
    applyResult = { ok: false, error: "该标签页已打开 DevTools，无法模拟" }
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "应用 iPhone 15" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("该标签页已打开 DevTools，无法模拟")
  })

  it("后台返回错误时展示原因", async () => {
    sendMessage = vi.fn(async (command: { type: string }) =>
      command.type === "list" ? { ok: true, presets: [] } : { ok: false, error: "存储写入失败" }
    )
    vi.stubGlobal("chrome", { runtime: { sendMessage }, tabs: { query: vi.fn().mockResolvedValue([{ id: 7 }]) } })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "新建预设" }))
    fireEvent.input(screen.getByLabelText("预设名称"), { target: { value: "测试" } })
    fireEvent.click(screen.getByRole("button", { name: "iPad mini" }))
    fireEvent.click(screen.getByRole("button", { name: "保存预设" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("存储写入失败")
  })
})
