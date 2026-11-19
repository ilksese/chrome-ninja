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
let tabGroupIds: Map<number, number>
let groups: Map<number, string>
let nextGroupId = 100
let tabUpdated: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void
let groupRemoved: (group: chrome.tabGroups.TabGroup) => void
let debuggerDetached: (source: chrome.debugger.Debuggee, reason: string) => void
/** 已关闭的标签页：反查它们时与 Chrome 一样抛错。 */
let closedTabs: Set<number>
const sender = { id: "extension" } as chrome.runtime.MessageSender
const popupSender = { id: "extension", url: "chrome-extension://extension/index.html" } as chrome.runtime.MessageSender
/** 对第二个标签页发起命令时的发送方；目标标签页由发送方推导。 */
const secondTabSender = {
  id: "extension",
  frameId: 0,
  tab: { id: 8, url: "https://example.com/other" }
} as chrome.runtime.MessageSender

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

/** 模拟 Chrome 的行为：分组里的标签页都离开后，分组自动关闭并触发 onRemoved。 */
const closeGroupIfEmpty = (groupId: number) => {
  if (!groups.has(groupId)) return
  if ([...tabGroupIds.values()].includes(groupId)) return
  const title = groups.get(groupId)!
  groups.delete(groupId)
  groupRemoved?.({ id: groupId, title } as chrome.tabGroups.TabGroup)
}

/** 模拟用户把标签页拖出分组：先改归属，再让空分组自行关闭。 */
const userMovesTabOut = (tabId: number) => {
  const groupId = tabGroupIds.get(tabId)
  if (groupId === undefined || groupId === -1) return
  tabGroupIds.set(tabId, -1)
  tabUpdated?.(tabId, { groupId: -1 })
  closeGroupIfEmpty(groupId)
}

const groupTitles = () => [...groups.values()]

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
  tabGroupIds = new Map()
  groups = new Map()
  closedTabs = new Set()
  nextGroupId = 100
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
      get: vi.fn(async (tabId: number) => {
        if (closedTabs.has(tabId)) throw new Error("No tab with id: " + tabId)
        return { id: tabId, url: tabUrl, windowId: 3, groupId: tabGroupIds.get(tabId) ?? -1 }
      }),
      query: vi.fn(async (query: chrome.tabs.QueryInfo) => [
        { id: 7, url: tabUrl, active: true, windowId: 3, groupId: tabGroupIds.get(7) ?? -1, ...query }
      ]),
      reload: vi.fn(async (tabId: number) => {
        commands.push(["reload", { tabId }])
      }),
      group: vi.fn(async (options: chrome.tabs.GroupOptions) => {
        const tabIds = Array.isArray(options.tabIds) ? options.tabIds : [options.tabIds ?? 0]
        if (options.groupId !== undefined && !groups.has(options.groupId)) {
          throw new Error("No group with id: " + options.groupId)
        }
        const groupId = options.groupId ?? ++nextGroupId
        if (options.groupId === undefined) groups.set(groupId, "")
        const previous = new Set<number>()
        for (const tabId of tabIds) {
          const before = tabGroupIds.get(tabId)
          if (before !== undefined) previous.add(before)
          tabGroupIds.set(tabId, groupId)
        }
        // 与 Chrome 一致：加入新分组会把标签页移出原分组，空掉的分组随即关闭。
        for (const groupId of previous) closeGroupIfEmpty(groupId)
        return groupId
      }),
      ungroup: vi.fn(async (tabIds: number | number[]) => {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds]
        const touched = new Set<number>()
        for (const tabId of ids) {
          const groupId = tabGroupIds.get(tabId)
          if (groupId === undefined || groupId === -1) continue
          tabGroupIds.set(tabId, -1)
          touched.add(groupId)
        }
        for (const groupId of touched) closeGroupIfEmpty(groupId)
      }),
      onUpdated: {
        addListener: (fn: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) => {
          tabUpdated = fn
        }
      }
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      get: vi.fn(async (groupId: number) => {
        if (!groups.has(groupId)) throw new Error("No group with id: " + groupId)
        return { id: groupId, title: groups.get(groupId) ?? "" } as chrome.tabGroups.TabGroup
      }),
      update: vi.fn(async (groupId: number, properties: chrome.tabGroups.UpdateProperties) => {
        if (!groups.has(groupId)) throw new Error("No group with id: " + groupId)
        groups.set(groupId, properties.title ?? groups.get(groupId)!)
        return { id: groupId, title: groups.get(groupId) ?? "" } as chrome.tabGroups.TabGroup
      }),
      onRemoved: {
        addListener: (fn: (group: chrome.tabGroups.TabGroup) => void) => {
          groupRemoved = fn
        }
      }
    },
    debugger: {
      getTargets: vi.fn(async (): Promise<chrome.debugger.TargetInfo[]> => []),
      attach: vi.fn(async (target: chrome.debugger.Debuggee) => {
        commands.push(["attach", target])
      }),
      detach: vi.fn(async (target: chrome.debugger.Debuggee) => {
        commands.push(["detach", target])
        // 与 Chrome 一致：主动分离也会触发 onDetach。
        debuggerDetached?.(target, "canceled_by_user")
      }),
      sendCommand: vi.fn(async (target: chrome.debugger.Debuggee, method: string, params: object) => {
        commands.push([method, params])
        return {}
      }),
      onDetach: {
        addListener: (fn: (source: chrome.debugger.Debuggee, reason: string) => void) => {
          debuggerDetached = fn
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

describe("标签页分组生命周期", () => {
  const create = async (patched: Partial<PresetDraft> = {}) => {
    const created = await request({ type: "create", preset: draft(patched) })
    expect(created.ok, created.error).toBe(true)
    return created.preset!
  }

  const apply = (presetId: string) => request({ type: "apply", id: presetId }, popupSender)

  const status = async () => {
    const response = await request({ type: "status" }, popupSender)
    expect(response.ok, response.error).toBe(true)
    return response
  }

  it("应用预设后标签页进入以 [ninja] 加预设名命名的分组", async () => {
    const preset = await create({ name: "iPhone 15" })
    const response = await apply(preset.id)
    expect(response.ok, response.error).toBe(true)
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
  })

  it("同一预设已有扩展自建分组时复用，不重复新建", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    const firstGroupId = tabGroupIds.get(7)
    await apply(preset.id)
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
    expect(tabGroupIds.get(7)).toBe(firstGroupId)
  })

  it("复用失败时新建分组并记录新 id", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    const firstGroupId = tabGroupIds.get(7)!
    groups.delete(firstGroupId)
    const response = await apply(preset.id)
    expect(response.ok, response.error).toBe(true)
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
    expect(tabGroupIds.get(7)).not.toBe(firstGroupId)
  })

  it("用户自建的同名分组不被认领", async () => {
    const preset = await create({ name: "iPhone 15" })
    groups.set(9, "[ninja] iPhone 15")
    const response = await apply(preset.id)
    expect(response.ok, response.error).toBe(true)
    expect(tabGroupIds.get(7)).not.toBe(9)
    expect(groups.has(9)).toBe(true)
  })

  it("用户自建分组变空关闭时不清理扩展的映射", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    const ownGroupId = tabGroupIds.get(7)!
    groups.set(9, "我的分组")
    groupRemoved?.({ id: 9, title: "我的分组" } as chrome.tabGroups.TabGroup)
    expect(tabGroupIds.get(7)).toBe(ownGroupId)
    const response = await apply(preset.id)
    expect(response.ok, response.error).toBe(true)
    expect(tabGroupIds.get(7)).toBe(ownGroupId)
    expect(chrome.tabs.group).toHaveBeenLastCalledWith({ tabIds: [7], groupId: ownGroupId })
  })

  it("用户把标签页移出扩展分组即视为退出模拟", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    commands = []
    userMovesTabOut(7)
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    expect(commands).toContainEqual(["detach", { tabId: 7 }])
    expect(await status()).toMatchObject({ presetId: undefined })
  })

  it("分组关闭后再次应用时进入新分组", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    userMovesTabOut(7)
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    const response = await apply(preset.id)
    expect(response.ok, response.error).toBe(true)
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
  })

  it("同一预设的多个标签页共用一个分组", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    const fromSecondTab = await request({ type: "apply", id: preset.id }, secondTabSender)
    expect(fromSecondTab.ok, fromSecondTab.error).toBe(true)
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
    expect(tabGroupIds.get(8)).toBe(tabGroupIds.get(7))
  })

  it("分组仍有标签页时用户移出一个，只退出该标签页的模拟", async () => {
    const preset = await create({ name: "iPhone 15" })
    await apply(preset.id)
    await request({ type: "apply", id: preset.id }, secondTabSender)
    commands = []
    userMovesTabOut(7)
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    expect(commands).not.toContainEqual(["detach", { tabId: 8 }])
    expect(groupTitles()).toEqual(["[ninja] iPhone 15"])
    const second = await request({ type: "status" }, secondTabSender)
    expect(second.presetId).toBe(preset.id)
  })

  it("标签页已在用户自建分组时，应用前要求确认且不附加调试器", async () => {
    const preset = await create({ name: "iPhone 15" })
    groups.set(9, "我的分组")
    tabGroupIds.set(7, 9)
    commands = []
    const first = await apply(preset.id)
    expect(first.ok).toBe(false)
    expect(first.needsGroupMoveConfirmation).toBe(true)
    expect(commands).toEqual([])
    expect(tabGroupIds.get(7)).toBe(9)
  })

  it("确认后把标签页移出用户自建分组并归入预设分组", async () => {
    const preset = await create({ name: "iPhone 15" })
    groups.set(9, "我的分组")
    tabGroupIds.set(7, 9)
    const confirmed = await request({ type: "apply", id: preset.id, confirmGroupMove: true }, popupSender)
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(groups.get(tabGroupIds.get(7)!)).toBe("[ninja] iPhone 15")
    expect(groups.has(9)).toBe(false)
  })

  it("未分组或已在扩展分组内时应用不需要确认", async () => {
    const preset = await create({ name: "iPhone 15" })
    const ungrouped = await apply(preset.id)
    expect(ungrouped.ok, ungrouped.error).toBe(true)
    expect(ungrouped.needsGroupMoveConfirmation).toBeUndefined()

    const again = await apply(preset.id)
    expect(again.ok, again.error).toBe(true)
    expect(again.needsGroupMoveConfirmation).toBeUndefined()
  })
})

describe("会话终止归因", () => {
  const create = async (patched: Partial<PresetDraft> = {}) => {
    const created = await request({ type: "create", preset: draft(patched) })
    expect(created.ok, created.error).toBe(true)
    return created.preset!
  }

  const apply = (presetId: string) => request({ type: "apply", id: presetId }, popupSender)

  const status = async () => {
    const response = await request({ type: "status" }, popupSender)
    expect(response.ok, response.error).toBe(true)
    return response
  }

  /** 只对指定标签页生效的分离事件，避开主动分离带来的连带触发。 */
  const detachOnly = (tabId: number, reason: string) => debuggerDetached?.({ tabId }, reason)

  it("会话被终止后标签页仍在时判定为 DevTools 抢占，执行退出模拟", async () => {
    const preset = await create()
    await apply(preset.id)
    commands = []
    detachOnly(7, "replaced_with_devtools")
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    const state = await status()
    expect(state).toMatchObject({ presetId: undefined })
    expect(state.notice).toBe("DevTools 已接管，模拟已取消")
  })

  it("用户在浏览器提示条点取消导致分离时同样退出模拟", async () => {
    const preset = await create()
    await apply(preset.id)
    commands = []
    detachOnly(7, "canceled_by_user")
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    const state = await status()
    expect(state).toMatchObject({ presetId: undefined })
    expect(state.notice).toBe("模拟已取消")
  })

  it("标签页已关闭时静默清理，不重新加载也不报错", async () => {
    const preset = await create()
    await apply(preset.id)
    commands = []
    closedTabs.add(7)
    detachOnly(7, "tab_closed")
    // 反查关闭的标签页会抛错，这正是静默清理的判定依据。
    await vi.waitFor(() => expect(chrome.tabs.get).toHaveBeenCalledWith(7))
    // 关闭的标签页既不能 detach 也不能 reload：只清内存，不产生任何浏览器调用。
    expect(commands).toEqual([])

    // 同 id 的标签页重新出现时是新会话，不应继承已关闭标签页的模拟状态。
    closedTabs.delete(7)
    tabGroupIds.set(7, -1)
    const revived = await status()
    expect(revived.presetId).toBeUndefined()
    // 静默清理不留下任何提示。
    expect(revived.notice).toBeUndefined()
  })

  it("被动终止后预设恢复为可编辑、可删除的空闲状态", async () => {
    const preset = await create()
    await apply(preset.id)
    detachOnly(7, "devtools")
    await vi.waitFor(async () => expect((await status()).presetId).toBeUndefined())

    const renamed = await request({ type: "update", id: preset.id, preset: draft({ name: "改名后" }) })
    expect(renamed.ok, renamed.error).toBe(true)
    const removed = await request({ type: "delete", id: preset.id })
    expect(removed.ok, removed.error).toBe(true)
    expect(await list()).toEqual([])
  })

  it("主动退出模拟不会重复触发退出流程", async () => {
    const preset = await create()
    await apply(preset.id)
    commands = []
    userMovesTabOut(7)
    await vi.waitFor(() => expect(commands).toContainEqual(["reload", { tabId: 7 }]))
    // 主动 detach 会触发 onDetach，但映射已清空，不应再走一遍并多发一次 reload。
    await vi.waitFor(() => expect(commands.filter(([name]) => name === "reload")).toHaveLength(1))
    expect(commands.filter(([name]) => name === "detach")).toHaveLength(1)
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

  it("用户把标签页移出分组退出模拟时同样恢复全局规则", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    dnrWrites = []

    userMovesTabOut(7)
    await vi.waitFor(() => expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: desktopUaValue }))
  })

  it("标签页关闭导致的被动终止同样归还全局规则", async () => {
    await syncGlobalRule("chrome-desktop")
    await apply(android)
    dnrWrites = []

    // 关闭的标签页无法 detach 或 reload，但借走的全局让位必须还回来。
    closedTabs.add(7)
    debuggerDetached?.({ tabId: 7 }, "tab_closed")
    await vi.waitFor(() => expect(dnrWrites.at(-1)).toEqual({ removed: true, addedUa: desktopUaValue }))
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

  it("分组加入失败时全局规则保持原状", async () => {
    await syncGlobalRule("chrome-desktop")
    const created = await request({ type: "create", preset: draft(android) })
    const group = vi.mocked(chrome.tabs.group)
    group.mockRejectedValueOnce(new Error("No group with id: 1")).mockRejectedValueOnce(new Error("Cannot move tab"))
    dnrWrites = []

    // 入组在让位之前失败：既没有借走全局规则，也就不需要恢复，规则应原封不动。
    const failed = await request({ type: "apply", id: created.preset!.id }, popupSender)
    expect(failed.ok).toBe(false)
    expect(dnrWrites).toEqual([])
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
