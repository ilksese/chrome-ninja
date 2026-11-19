import type {
  AppliedPreset,
  BrowserPreset,
  BrowserPresetRequest,
  BrowserPresetResponse,
  UserAgentIdentity
} from "./types"
import { pageUnavailableReason } from "@/cookie-editor/types"
import { BROWSER_PRESETS_KEY } from "./types"
import { getUaIdentity, mobileConflictOf } from "./identity"
import { firstPresetError, validatePreset } from "./validation"
import { resumeUserAgentRule, suspendUserAgentRule } from "@/user-agent"

/** 正在模拟的标签页；只活在后台内存里，扩展重启即清空。 */
const appliedByTab = new Map<number, AppliedPreset>()

/**
 * 已让全局 UA 改写让位的标签页。与 `appliedByTab` 分开记录，是因为两者的进出条件不同：
 * 「不覆盖」UA 的预设只模拟视口，不碰全局规则；切到这类预设时必须归还上一次借走的让位。
 */
const suspendedTabs = new Set<number>()

/** 扩展自己创建的标签页分组；用户自建的分组永远不在此集合内。 */
const ownedGroupIds = new Set<number>()

/** 被动终止后待展示的一次性提示；只活在后台内存里，被读取即清空。 */
const notices = new Map<number, string>()

const GROUP_TITLE_PREFIX = "[ninja] "

const groupTitleOf = (preset: BrowserPreset) => `${GROUP_TITLE_PREFIX}${preset.name}`

/** 建组、命名并记录 id；标签页同时离开原分组。 */
async function createGroupFor(preset: BrowserPreset, tabId: number) {
  const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: {} })
  ownedGroupIds.add(groupId)
  await chrome.tabGroups.update(groupId, { title: groupTitleOf(preset) })
  return groupId
}

/** 扩展自建、且仍对应本预设的分组：按记录的 id 反查标题，不按名称猜用户自建分组。 */
async function findOwnGroup(preset: BrowserPreset) {
  for (const groupId of ownedGroupIds) {
    try {
      const group = await chrome.tabGroups.get(groupId)
      if (group.title === groupTitleOf(preset)) return groupId
    } catch {
      ownedGroupIds.delete(groupId)
    }
  }
  return undefined
}

/** 复用同预设的扩展分组；分组已消失或加入失败时退回新建。 */
async function joinPresetGroup(preset: BrowserPreset, tabId: number) {
  // 先在扩展分组之间腾挪：chrome.tabs.group 会自动把标签页移出原分组，无需单独 ungroup。
  const existing = await findOwnGroup(preset)
  if (existing !== undefined) {
    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing })
      return existing
    } catch {
      ownedGroupIds.delete(existing)
    }
  }
  return await createGroupFor(preset, tabId)
}

/** 应用与状态查询只接受扩展页面或顶层网页发起，目标标签页随后从发起方推导。 */
function assertSender(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id) throw new Error("不受信任的扩展消息")
  if (sender.tab && sender.frameId !== 0) throw new Error("仅支持顶层网页")
  if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("请求必须来自扩展页面")
}

/** 网页取自身标签页；扩展页面取当前窗口的活动标签页。 */
async function targetTabId(sender: chrome.runtime.MessageSender) {
  assertSender(sender)
  if (sender.tab?.id !== undefined) return sender.tab.id
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true })
  if (tab?.id === undefined) throw new Error("无法读取当前标签页")
  return tab.id
}

/** 返回标签页不能模拟的原因，空串表示可以模拟。DevTools 已占用调试器时无法附加。 */
async function unavailableReasonFor(tabId: number) {
  const [tab, targets] = await Promise.all([chrome.tabs.get(tabId), chrome.debugger.getTargets()])
  const reason = pageUnavailableReason(tab.url)
  if (reason) return reason
  if (targets.some((target) => target.tabId === tabId && target.attached)) return "该标签页已打开 DevTools，无法模拟"
  return ""
}

/** 标签页当前是否在别人（用户或其他扩展）的分组里；扩展自建分组不算。 */
async function inForeignGroup(tabId: number) {
  const tab = await chrome.tabs.get(tabId)
  const groupId = tab.groupId ?? -1
  return groupId >= 0 && !ownedGroupIds.has(groupId)
}

/**
 * 只清内存：归还让位、清空会话映射，不触碰浏览器。
 * 标签页已经消失时浏览器自己会清掉覆盖，这两步是唯一还有意义的部分。
 */
async function forgetTab(tabId: number) {
  if (suspendedTabs.delete(tabId)) await resumeUserAgentRule()
  appliedByTab.delete(tabId)
}

/**
 * 退出模拟的唯一收尾路径：归还全局改写让位、分离调试会话（Chromium 随分离清除全部模拟覆盖）、
 * 离开模拟分组，再重新加载，最后清空内存映射。标题相同的用户自建分组不在 `ownedGroupIds` 内，不会被认领。
 * 用户移出分组触发的退出与预设页/首页发起的退出共用这里。
 */
async function endSession(tabId: number) {
  if (!appliedByTab.has(tabId)) return
  // 让位是应用时借的，必须在这个统一出口归还，否则全局改写会一直处于移除状态。
  await forgetTab(tabId)
  await chrome.debugger.detach({ tabId }).catch(() => {})
  // ungroup 只处理仍在扩展分组内的标签页；分组空掉后 Chrome 会自行关闭。
  await chrome.tabs.ungroup(tabId).catch(() => {})
  await chrome.tabs.reload(tabId).catch(() => {})
}

/** 分离事件不带来源，只能按标签页是否还在反查归因。 */
async function attributeDetach(source: chrome.debugger.Debuggee, reason: string) {
  const tabId = source.tabId
  if (tabId === undefined || !appliedByTab.has(tabId)) return
  // 标签页已关闭：映射随标签页失效，静默清理，不留任何提示。
  const tabExists = await chrome.tabs.get(tabId).then(
    () => true,
    () => false
  )
  if (!tabExists) {
    await forgetTab(tabId)
    return
  }
  notices.set(tabId, reason === "canceled_by_user" ? "模拟已取消" : "DevTools 已接管，模拟已取消")
  await endSession(tabId)
}

async function applyPreset(preset: BrowserPreset, tabId: number) {
  const reason = await unavailableReasonFor(tabId)
  if (reason) throw new Error(reason)
  const identity = getUaIdentity(preset.userAgent)
  // 已在本扩展的调试会话里时只覆盖参数：重新 attach 会让浏览器重弹调试提示条。
  // 会话随标签页存续，因此只要 appliedByTab 有记录就认定会话仍可用；真掉线时 sendCommand 会失败。
  const reusing = appliedByTab.has(tabId)
  if (!reusing) await chrome.debugger.attach({ tabId }, "1.3")
  try {
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", preset.viewport)
    if (identity) await applyUaOverride(tabId, identity)
    const groupId = await joinPresetGroup(preset, tabId)
    await syncGlobalUserAgentRule(tabId, Boolean(identity))
    appliedByTab.set(tabId, { presetId: preset.id, groupId })
  } catch (error) {
    // 复用中的会话失败可能只是参数非法：保留已有会话与映射，退出模拟仍可正常分离。
    if (!reusing) {
      // 失败时可能已让全局改写让位（入组成功后才切换），这里成对归还，避免规则一直处于移除状态。
      if (suspendedTabs.delete(tabId)) await resumeUserAgentRule()
      await chrome.debugger.detach({ tabId }).catch(() => {})
      appliedByTab.delete(tabId)
    }
    throw error
  }
  // 全部覆盖下发完成后才 reload，避免先加载出未模拟的页面。
  await chrome.tabs.reload(tabId)
}

/**
 * 让全局 UA 改写与标签页级模拟互斥：具体 UA 期间移除全局规则，否则同一请求会带上两套身份。
 * 「不覆盖」的预设只模拟视口，全局规则的启用状态必须原样保留，因此这里只在状态真正切换时写规则。
 * 原始选择由 `user-agent` 模块记住，退出时按用户最新的选择恢复（见 `resumeUserAgentRule`）。
 */
async function syncGlobalUserAgentRule(tabId: number, shouldSuspend: boolean) {
  if (shouldSuspend === suspendedTabs.has(tabId)) return
  if (shouldSuspend) {
    suspendedTabs.add(tabId)
    await suspendUserAgentRule()
  } else {
    suspendedTabs.delete(tabId)
    await resumeUserAgentRule()
  }
}

/**
 * 下发完整 UA 身份。`platform` 与 `userAgentMetadata` 必须随 `userAgent` 一起给：
 * 只改 UA 串会让 `navigator.platform`、`navigator.userAgentData` 与 `sec-ch-ua-*` 残留宿主值，
 * 站点据此即可判定身份不一致（见 ADR 0003）。
 * Safari 类身份刻意不下发 `userAgentMetadata`——这是 CDP 中「不发 client hints」的表达方式，
 * 效果是全部 `sec-ch-ua-*` 请求头消失。
 */
async function applyUaOverride(tabId: number, identity: UserAgentIdentity) {
  const { userAgent, platform, userAgentMetadata } = identity
  await chrome.debugger.sendCommand(
    { tabId },
    "Emulation.setUserAgentOverride",
    userAgentMetadata ? { userAgent, platform, userAgentMetadata } : { userAgent, platform }
  )
}

async function loadPresets(): Promise<BrowserPreset[]> {
  const stored = await chrome.storage.local.get([BROWSER_PRESETS_KEY])
  const value = stored[BROWSER_PRESETS_KEY]
  return Array.isArray(value) ? (value as BrowserPreset[]) : []
}

async function savePresets(presets: BrowserPreset[]) {
  await chrome.storage.local.set({ [BROWSER_PRESETS_KEY]: presets })
}

export function registerBrowserPresetBackground() {
  // 用户把标签页移出扩展分组即视为退出模拟；用户自建分组不在 ownedGroupIds 内，不受影响。
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.groupId === undefined) return
    const applied = appliedByTab.get(tabId)
    if (!applied || changeInfo.groupId === applied.groupId) return
    void endSession(tabId)
  })

  // DevTools 抢占、浏览器提示条取消与标签页关闭都会走到这里，来源需要按标签页反查。
  chrome.debugger.onDetach.addListener((source, reason) => {
    void attributeDetach(source, reason)
  })

  chrome.runtime.onMessage.addListener(
    (
      incoming: BrowserPresetRequest,
      sender: chrome.runtime.MessageSender,
      respond: (result: BrowserPresetResponse) => void
    ) => {
      if (incoming?.target !== "browser-preset") return false
      const message = incoming
      const handle = async (): Promise<BrowserPresetResponse> => {
        if (sender.id !== chrome.runtime.id) throw new Error("不受信任的扩展消息")
        const presets = await loadPresets()
        if (message.type === "list") return { ok: true, presets }
        if (message.type === "create") {
          const { draft, errors } = validatePreset(message.preset, presets)
          const error = firstPresetError(errors)
          if (error) throw new Error(error)
          const conflict = mobileConflictOf(draft.userAgent, draft.viewport.mobile)
          // 冲突且未确认时什么都不写：取消保存就是保持现状。
          if (conflict && message.confirmConflict !== true) return { ok: false, needsConfirmation: true, conflict }
          const preset: BrowserPreset = { id: crypto.randomUUID(), ...draft }
          const next = [...presets, preset]
          await savePresets(next)
          return { ok: true, preset, presets: next }
        }
        if (message.type === "update") {
          const existing = presets.find((preset) => preset.id === message.id)
          if (!existing) throw new Error("预设不存在，可能已被删除")
          const { draft, errors } = validatePreset(message.preset, presets, message.id)
          const error = firstPresetError(errors)
          if (error) throw new Error(error)
          const conflict = mobileConflictOf(draft.userAgent, draft.viewport.mobile)
          if (conflict && message.confirmConflict !== true) return { ok: false, needsConfirmation: true, conflict }
          const id = existing.id
          const preset: BrowserPreset = { id, ...draft }
          const next = presets.map((item) => (item.id === id ? preset : item))
          await savePresets(next)
          return { ok: true, preset, presets: next }
        }
        if (message.type === "delete") {
          if (!presets.some((preset) => preset.id === message.id)) throw new Error("预设不存在，可能已被删除")
          const next = presets.filter((preset) => preset.id !== message.id)
          await savePresets(next)
          return { ok: true, presets: next }
        }
        if (message.type === "status") {
          const tabId = await targetTabId(sender)
          const notice = notices.get(tabId)
          // 一次性提示：读走即清，避免每次查状态都重复弹。
          notices.delete(tabId)
          return {
            ok: true,
            tabId,
            unavailableReason: await unavailableReasonFor(tabId),
            presetId: appliedByTab.get(tabId)?.presetId,
            notice
          }
        }
        if (message.type === "apply") {
          const preset = presets.find((item) => item.id === message.id)
          if (!preset) throw new Error("预设不存在，可能已被删除")
          const tabId = await targetTabId(sender)
          // 打断用户自建分组是有损操作，未经确认什么都不做。
          if ((await inForeignGroup(tabId)) && message.confirmGroupMove !== true)
            return { ok: false, needsGroupMoveConfirmation: true }
          await applyPreset(preset, tabId)
          return { ok: true, preset }
        }
        if (message.type === "simulate-exit") {
          const tabId = await targetTabId(sender)
          // 未在模拟时保持现状：没有覆盖可清，重新加载只会丢掉页面当前状态。
          await endSession(tabId)
          return { ok: true, tabId }
        }
        throw new Error("未知的浏览器预设命令")
      }
      void handle().then(respond, (error: unknown) =>
        respond({ ok: false, error: error instanceof Error ? error.message : "浏览器预设操作失败" })
      )
      return true
    }
  )
}
