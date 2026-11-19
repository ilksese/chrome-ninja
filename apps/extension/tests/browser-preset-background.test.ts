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
let commands: Array<[string, unknown]>
/** 全局 DNR 规则的写操作记录：`remove` 表示移除规则，`add` 携带新规则。 */
let dnrWrites: Array<{ removed: boolean; addedUa?: string }> = []
let tabUrl = "https://example.com/page"
const sender = { id: "extension" } as chrome.runtime.MessageSender
const popupSender = { id: "extension", url: "chrome-extension://extension/index.html" } as chrome.runtime.MessageSender

const draft = (patch: Partial<PresetDraft> = {}): PresetDraft => ({
  name: "iPhone 15",
  userAgent: "safira-ios",
  viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true },
  ...patch
})

const request = (command: object, from = sender) =>
  new Promise<BrowserPresetResponse>((resolve) => {
    receive({ target: "browser-preset", ...command }, from, resolve)
  })

const list = async () => {
  const response = await request({ type: "list" })
  expect(response.ok, response.error).toBe(true)
  return response.presets!
}

beforeEach(async () => {
  storage = {}
  commands = []
  dnrWrites = []
  tabUrl = "https://example.com/page"
  vi.resetModules()
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension",
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      onMessage: {
        addListener: (fn: typeof receive) => {
          receive = fn
        }
      }
    },
    declarativeNetRequest: {
      RuleActionType: { MODIFY_HEADERS: "modifyHeaders" },
      HeaderOperation: { SET: "set" },
      ResourceType: {
        MAIN_FRAME: "main_frame",
        SUB_FRAME: "sub_frame",
        XMLHTTPREQUEST: "xmlhttprequest",
        SCRIPT: "script",
        IMAGE: "image",
        STYLESHEET: "stylesheet",
        FONT: "font",
        MEDIA: "media",
        WEBSOCKET: "websocket",
        OTHER: "other"
      },
      updateDynamicRules: vi.fn(
        async (update: {
          removeRuleIds?: number[]
          addRules?: Array<{ action: { requestHeaders: Array<{ value?: string }> } }>
        }) => {
          dnrWrites.push({
            removed: (update.removeRuleIds ?? []).length > 0,
            addedUa: update.addRules?.[0]?.action.requestHeaders[0].value
          })
        }
      )
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: tabUrl })),
      query: vi.fn(async (query: chrome.tabs.QueryInfo) => [
        { id: 7, url: tabUrl, active: true, windowId: 3, ...query }
      ]),
      reload: vi.fn(async (tabId: number) => {
        commands.push(["reload", { tabId }])
      })
    },
    debugger: {
      getTargets: vi.fn(async (): Promise<chrome.debugger.TargetInfo[]> => []),
      attach: vi.fn(async (target: chrome.debugger.Debuggee) => {
        commands.push(["attach", target])
      }),
      detach: vi.fn(async (target: chrome.debugger.Debuggee) => {
        commands.push(["detach", target])
      }),
      sendCommand: vi.fn(async (target: chrome.debugger.Debuggee, method: string, params: object) => {
        commands.push([method, params])
        return {}
      })
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
      preset: draft({
        name: "桌面",
        userAgent: "chrome-desktop",
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }
      })
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

describe("应用预设", () => {
  const apply = async (patched: Partial<PresetDraft> = {}, id?: string) => {
    const created = await request({ type: "create", preset: draft(patched) })
    expect(created.ok, created.error).toBe(true)
    return request({ type: "apply", id: id ?? created.preset!.id }, popupSender)
  }

  it("按附加、设备度量覆盖、UA 覆盖、重新加载的顺序作用到当前标签页", async () => {
    const response = await apply()
    expect(response.ok, response.error).toBe(true)
    expect(commands.map(([method]) => method)).toEqual([
      "attach",
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setUserAgentOverride",
      "reload"
    ])
    expect(commands[1][1]).toEqual({ width: 393, height: 852, deviceScaleFactor: 3, mobile: true })
  })

  it("Safari 类预设不下发 userAgentMetadata", async () => {
    const response = await apply()
    expect(response.ok, response.error).toBe(true)
    const [, params] = commands.find(([method]) => method === "Emulation.setUserAgentOverride")!
    expect(params).toEqual({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      platform: "iPhone"
    })
    expect(params).not.toHaveProperty("userAgentMetadata")
  })

  it("模拟 Android 时显式下发空 bitness 与空 architecture", async () => {
    const response = await apply({
      name: "Pixel 8",
      userAgent: "chrome-android",
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
    })
    expect(response.ok, response.error).toBe(true)
    const [, params] = commands.find(([method]) => method === "Emulation.setUserAgentOverride")!
    expect(params).toMatchObject({
      platform: "Linux armv81",
      userAgentMetadata: {
        platform: "Android",
        platformVersion: "14.0.0",
        architecture: "",
        model: "Pixel 8 Pro",
        mobile: true,
        bitness: "",
        wow64: false,
        formFactors: ["Mobile"]
      }
    })
  })

  it("UA 覆盖同时下发 userAgent、platform 与完整 userAgentMetadata", async () => {
    const response = await apply({
      name: "桌面",
      userAgent: "chrome-desktop",
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }
    })
    expect(response.ok, response.error).toBe(true)
    expect(commands).toEqual([
      ["attach", { tabId: 7 }],
      ["Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }],
      [
        "Emulation.setUserAgentOverride",
        {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
          platform: "Win32",
          userAgentMetadata: {
            brands: [
              { brand: "Not)A;Brand", version: "99" },
              { brand: "Google Chrome", version: "127" },
              { brand: "Chromium", version: "127" }
            ],
            fullVersionList: [
              { brand: "Not)A;Brand", version: "99.0.0.0" },
              { brand: "Google Chrome", version: "127.0.0.0" },
              { brand: "Chromium", version: "127.0.0.0" }
            ],
            platform: "Windows",
            platformVersion: "10.0.0",
            architecture: "x86",
            model: "",
            mobile: false,
            bitness: "64",
            wow64: false,
            formFactors: ["Desktop"]
          }
        }
      ],
      ["reload", { tabId: 7 }]
    ])
  })

  it("受限页面上拒绝应用并给出原因，不附加调试器", async () => {
    tabUrl = "chrome://settings/"
    const response = await apply()
    expect(response.ok).toBe(false)
    expect(response.error).toBe("仅支持普通 HTTP/HTTPS 网页")
    expect(commands).toEqual([])
  })

  it("应用失败时回传可读原因", async () => {
    vi.mocked(chrome.debugger.attach).mockRejectedValueOnce(new Error("Cannot attach to this target"))
    const response = await apply()
    expect(response.ok).toBe(false)
    expect(response.error).toBe("Cannot attach to this target")
    expect(commands).toEqual([])
  })

  it("拒绝 iframe 发起的应用命令", async () => {
    const created = await request({ type: "create", preset: draft() })
    const response = await request(
      { type: "apply", id: created.preset!.id },
      { id: "extension", frameId: 3, tab: { id: 9 }, url: "https://example.com/page" }
    )
    expect(response.ok).toBe(false)
    expect(response.error).toBe("仅支持顶层网页")
    expect(commands).toEqual([])
  })

  it("标签页已打开 DevTools 时不发起附加", async () => {
    vi.mocked(chrome.debugger.getTargets).mockResolvedValue([
      { type: "page", id: "target", tabId: 7, attached: true, title: "示例", url: "https://example.com/page" }
    ])
    const response = await apply()
    expect(response.ok).toBe(false)
    expect(response.error).toBe("该标签页已打开 DevTools，无法模拟")
    expect(commands).toEqual([])
  })

  it("查询当前标签页状态时给出受限原因", async () => {
    tabUrl = "chrome://settings/"
    const response = await request({ type: "status" }, popupSender)
    expect(response.ok, response.error).toBe(true)
    expect(response.tabId).toBe(7)
    expect(response.unavailableReason).toBe("仅支持普通 HTTP/HTTPS 网页")
  })

  it("普通网页上状态没有受限原因", async () => {
    const response = await request({ type: "status" }, popupSender)
    expect(response.ok, response.error).toBe(true)
    expect(response.unavailableReason).toBe("")
  })

  it("标签页已打开 DevTools 时状态给出原因", async () => {
    vi.mocked(chrome.debugger.getTargets).mockResolvedValue([
      { type: "page", id: "target", tabId: 7, attached: true, title: "示例", url: "https://example.com/page" }
    ])
    const response = await request({ type: "status" }, popupSender)
    expect(response.ok, response.error).toBe(true)
    expect(response.unavailableReason).toBe("该标签页已打开 DevTools，无法模拟")
  })
})

describe("与全局 UA 改写的协调", () => {
  /** 全局规则由后台入口的 storage 变更监听重建；这里直接复现该入口。 */
  let syncGlobalRule: (userAgent: string) => Promise<void>
  const desktopUaValue =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

  beforeEach(async () => {
    const { applyUserAgentRule } = await import("../src/user-agent")
    syncGlobalRule = (userAgent) => applyUserAgentRule(userAgent as never)
  })

  const apply = async (patched: Partial<PresetDraft> = {}) => {
    const created = await request({ type: "create", preset: draft(patched) })
    expect(created.ok, created.error).toBe(true)
    return request({ type: "apply", id: created.preset!.id }, popupSender)
  }

    const android = {
      name: "Pixel 8",
      userAgent: "chrome-android",
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }
    }
    const viewportOnly = {
      name: "只测视口",
      userAgent: "default",
      viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true }
    }

  it("具体 UA 应用期间移除全局改写规则", async () => {
    await syncGlobalRule("chrome-desktop")
    expect(dnrWrites).toEqual([{ removed: true, addedUa: desktopUaValue }])

    const response = await apply(android)
    expect(response.ok, response.error).toBe(true)
    expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: undefined })
  })

  it("不覆盖 UA 时完全不触碰全局规则", async () => {
    await syncGlobalRule("chrome-desktop")
    dnrWrites = []

    const response = await apply(viewportOnly)
    expect(response.ok, response.error).toBe(true)
    expect(commands.map(([method]) => method)).not.toContain("Emulation.setUserAgentOverride")
    expect(dnrWrites).toEqual([])
  })

  it("全局规则被重新同步时保持移除，不把规则加回来", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    dnrWrites = []

    // 用户此时在首页改了全局设置：监听器会重新下发规则。
    await syncGlobalRule("chrome-desktop")
    expect(dnrWrites).toEqual([])
  })

  it("退出模拟后恢复全局规则的原始选择", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    dnrWrites = []

    const response = await request({ type: "simulate-exit" } as object, popupSender)
    expect(response.ok, response.error).toBe(true)
    expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: desktopUaValue })
  })

  it("原先关闭全局规则时退出后仍保持关闭", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    await syncGlobalRule("default")
    dnrWrites = []

    const response = await request({ type: "simulate-exit" } as object, popupSender)
    expect(response.ok, response.error).toBe(true)
    expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: undefined })
  })

  it("全局规则只在最后一个模拟标签页退出后恢复", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    const otherTab = await request(
      { type: "apply", id: (await list())[0].id },
      { id: "extension", frameId: 0, tab: { id: 8 }, url: "https://example.com/other" }
    )
    expect(otherTab.ok, otherTab.error).toBe(true)
    dnrWrites = []

    await request({ type: "simulate-exit" } as object, popupSender)
    expect(dnrWrites).toEqual([])

    const last = await request(
      { type: "simulate-exit" } as object,
      { id: "extension", frameId: 0, tab: { id: 8 }, url: "https://example.com/other" }
    )
    expect(last.ok, last.error).toBe(true)
    expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: desktopUaValue })
  })

  it("同一标签页切换到不覆盖 UA 的预设时归还全局规则", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    const created = await request({ type: "create", preset: draft(viewportOnly) })
    dnrWrites = []

    // 切换复用同一会话，不重复附加；#21 拥有切换命令，这里直接复现它调用的应用路径。
    const switched = await request({ type: "apply", id: created.preset!.id }, popupSender)
    expect(switched.ok, switched.error).toBe(true)
    expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: desktopUaValue })
  })

  it("UA 覆盖下发失败时不残留让位状态", async () => {
    await syncGlobalRule("chrome-desktop")
    const created = await request({ type: "create", preset: draft(android) })
    vi.mocked(chrome.debugger.sendCommand).mockRejectedValueOnce(new Error("Target closed"))
    dnrWrites = []

    const failed = await request({ type: "apply", id: created.preset!.id }, popupSender)
    expect(failed.ok).toBe(false)
    expect(dnrWrites).toEqual([])
  })
})
