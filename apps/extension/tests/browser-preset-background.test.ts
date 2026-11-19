import type { BrowserPresetResponse } from "../src/browser-preset/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

type PresetDraft = {
  name: string
  userAgent: string
  viewport: { width: number; height: number; deviceScaleFactor: number; mobile: boolean }
}
let receive: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (result: BrowserPresetResponse) => void
) => boolean
let storage: Record<string, unknown>
const sender = { id: "extension" } as chrome.runtime.MessageSender

const draft = (patch: Partial<PresetDraft> = {}): PresetDraft => ({
  name: "iPhone 15",
  userAgent: "safira-ios",
  viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true },
  ...patch
})

const request = (command: object) =>
  new Promise<BrowserPresetResponse>((resolve) => {
    receive({ target: "browser-preset", ...command }, sender, resolve)
  })

const list = async () => {
  const response = await request({ type: "list" })
  expect(response.ok, response.error).toBe(true)
  return response.presets!
}

beforeEach(async () => {
  storage = {}
  vi.resetModules()
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension",
      onMessage: {
        addListener: (fn: typeof receive) => {
          receive = fn
        }
      }
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          structuredClone(Object.fromEntries(keys.map((key) => [key, storage[key]])))
        ),
        set: vi.fn(async (values: object) => {
          Object.assign(storage, structuredClone(values))
        })
      }
    }
  })
  const { registerBrowserPresetBackground } = await import("../src/browser-preset/background")
  registerBrowserPresetBackground()
})

describe("浏览器预设后台协议", () => {
  it("首次安装时预设列表为空", async () => {
    expect(await list()).toEqual([])
  })

  it("创建预设后写入独立存储键并回读", async () => {
    const created = await request({ type: "create", preset: draft() })
    expect(created.ok, created.error).toBe(true)
    expect(created.preset).toMatchObject({
      name: "iPhone 15",
      userAgent: "safira-ios",
      viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true }
    })
    expect(created.preset!.id).toEqual(expect.any(String))
    expect(storage.browserPresets).toEqual([created.preset])
    expect(await list()).toEqual([created.preset])
  })

  it("拒绝重名并在大小写不敏感范围内去重", async () => {
    await request({ type: "create", preset: draft({ name: "iPhone 15" }) })
    const duplicate = await request({ type: "create", preset: draft({ name: "  IPHONE 15 " }) })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toBe("预设名称已存在，请换一个名称")
    expect(await list()).toHaveLength(1)
  })

  it("拒绝空名称、越界宽高与越界像素比", async () => {
    const blank = await request({ type: "create", preset: draft({ name: "   " }) })
    expect(blank.ok).toBe(false)
    expect(blank.error).toBe("预设名称不能为空")

    const narrow = await request({
      type: "create",
      preset: draft({ viewport: { width: 199, height: 852, deviceScaleFactor: 3, mobile: true } })
    })
    expect(narrow.ok).toBe(false)
    expect(narrow.error).toBe("视口宽度必须是 200–4000 之间的整数")

    const tall = await request({
      type: "create",
      preset: draft({ viewport: { width: 393, height: 4001, deviceScaleFactor: 3, mobile: true } })
    })
    expect(tall.ok).toBe(false)
    expect(tall.error).toBe("视口高度必须是 200–4000 之间的整数")

    const scale = await request({
      type: "create",
      preset: draft({ viewport: { width: 393, height: 852, deviceScaleFactor: 4.5, mobile: true } })
    })
    expect(scale.ok).toBe(false)
    expect(scale.error).toBe("设备像素比必须在 1–4 之间")

    expect(await list()).toEqual([])
  })

  it("更新预设全部字段并保留 id", async () => {
    const created = await request({ type: "create", preset: draft() })
    const updated = await request({
      type: "update",
      id: created.preset!.id,
      preset: draft({
        name: "Pixel 8",
        userAgent: "chrome-android",
        viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
      })
    })
    expect(updated.ok, updated.error).toBe(true)
    expect(updated.preset).toMatchObject({
      id: created.preset!.id,
      name: "Pixel 8",
      userAgent: "chrome-android",
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
    })
    expect(await list()).toEqual([updated.preset])
  })

  it("删除预设后从存储中移除", async () => {
    const created = await request({ type: "create", preset: draft() })
    const removed = await request({ type: "delete", id: created.preset!.id })
    expect(removed.ok, removed.error).toBe(true)
    expect(await list()).toEqual([])
    expect(storage.browserPresets).toEqual([])
  })

  it("预设存放在独立存储键中，不触碰 options", async () => {
    storage.options = { userAgent: "chrome-android" }
    await request({ type: "create", preset: draft() })
    expect(storage.options).toEqual({ userAgent: "chrome-android" })
    expect(Object.keys(storage)).toEqual(["options", "browserPresets"])
  })

  it("UA 身份声明的移动端与视口开关一致时直接保存，不要求确认", async () => {
    const android = await request({
      type: "create",
      preset: draft({
        name: "Pixel 8",
        userAgent: "chrome-android",
        viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
      })
    })
    expect(android.ok, android.error).toBe(true)
    expect(android.needsConfirmation).toBeUndefined()

    const desktop = await request({
      type: "create",
      preset: draft({ name: "桌面", userAgent: "chrome-desktop", viewport: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false } })
    })
    expect(desktop.ok, desktop.error).toBe(true)
    expect(desktop.needsConfirmation).toBeUndefined()
    expect(await list()).toHaveLength(2)
  })

  it("不覆盖 UA 时不做移动端判定比对", async () => {
    const created = await request({
      type: "create",
      preset: draft({ name: "只测视口", userAgent: "default", viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true } })
    })
    expect(created.ok, created.error).toBe(true)
    expect(created.needsConfirmation).toBeUndefined()
  })

  it("移动端判定冲突时返回需要确认的信号，且不写入存储", async () => {
    const response = await request({
      type: "create",
      preset: draft({ name: "冲突", userAgent: "chrome-android", viewport: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false } })
    })
    expect(response.ok).toBe(false)
    expect(response.needsConfirmation).toBe(true)
    expect(response.conflict).toEqual({
      userAgentMobile: true,
      viewportMobile: false,
      secChUaMobile: "?1",
      layout: "desktop"
    })
    expect(await list()).toEqual([])
    expect(storage.browserPresets).toBeUndefined()
  })

  it("确认风险后保存冲突配置，用户填写的值不被修正", async () => {
    const response = await request({
      type: "create",
      confirmConflict: true,
      preset: draft({ name: "冲突", userAgent: "chrome-android", viewport: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false } })
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.preset!.viewport.mobile).toBe(false)
    expect(response.preset!.userAgent).toBe("chrome-android")
    expect(await list()).toEqual([response.preset])
  })

  it("更新时同样拦截未确认的冲突，取消即保持原值", async () => {
    const created = await request({
      type: "create",
      preset: draft({ name: "Pixel", userAgent: "chrome-android", viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true } })
    })
    const conflicted = await request({
      type: "update",
      id: created.preset!.id,
      preset: draft({ name: "Pixel", userAgent: "chrome-android", viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: false } })
    })
    expect(conflicted.needsConfirmation).toBe(true)
    expect((await list())[0].viewport.mobile).toBe(true)

    const confirmed = await request({
      type: "update",
      id: created.preset!.id,
      confirmConflict: true,
      preset: draft({ name: "Pixel", userAgent: "chrome-android", viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: false } })
    })
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect((await list())[0].viewport.mobile).toBe(false)
  })

  it("忽略不属于浏览器预设的消息目标", () => {
    expect(receive({ target: "cookie-editor", type: "list" }, sender as chrome.runtime.MessageSender, vi.fn())).toBe(
      false
    )
  })
})
