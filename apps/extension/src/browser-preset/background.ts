import type {
  AppliedPreset,
  BrowserPreset,
  BrowserPresetRequest,
  BrowserPresetResponse,
  BrowserPresetUsage,
  UserAgentIdentity
} from "./types"
import { pageUnavailableReason } from "@/cookie-editor/types"
import { BROWSER_PRESETS_KEY } from "./types"
import { getUaIdentity, mobileConflictOf } from "./identity"
import { firstPresetError, validatePreset } from "./validation"
import { resumeUserAgentRule, suspendUserAgentRule } from "@/user-agent"

const appliedByTab = new Map<number, AppliedPreset>()

/**
 * 已让全局 UA 改写让位的标签页。与 `appliedByTab` 分开记录，是因为两者的进出条件不同：
 * 「不覆盖」UA 的预设只模拟视口，不碰全局规则；切到这类预设时必须归还上一次借走的让位。
 */
const suspendedTabs = new Set<number>()

/** 扩展自己创建的标签页分组；用户自建的分组永远不在此集合内。 */
const ownedGroupIds = new Set<number>()

/**
 * 正在执行扩展自身分组变更的标签页。`chrome.tabs.group` 会异步派发 `tabs.onUpdated` 的
 * `groupId` 变更，而派发可能早于调用方拿到新 id 并写入映射：此时事件既不对应映射里的旧分组，
 * 新分组也还没进 `ownedGroupIds`，只看数据就会误判成「用户把标签页拖了出去」。
 * 因此标记要覆盖从调用换组到写回映射的整段时间，事件在此期间一律忽略。
 */
const groupTransitions = new Set<number>()

/** 被动终止后待展示的一次性提示；只活在后台内存里，被读取即清空。 */
const notices = new Map<number, string>()

const GROUP_TITLE_PREFIX = "[ninja] "

const groupTitleOf = (preset: BrowserPreset) => `${GROUP_TITLE_PREFIX}${preset.name}`

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

function assertSender(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id) throw new Error("不受信任的扩展消息")
  if (sender.tab && sender.frameId !== 0) throw new Error("仅支持顶层网页")
  if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("请求必须来自扩展页面")
}

async function targetTabId(sender: chrome.runtime.MessageSender) {
  assertSender(sender)
  if (sender.tab?.id !== undefined) return sender.tab.id
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true })
  if (tab?.id === undefined) throw new Error("无法读取当前标签页")
  return tab.id
}

/**
 * 返回标签页不能模拟的原因，空串表示可以模拟。DevTools 已占用调试器时无法附加。
 * `getTargets` 不区分附加者：本扩展自己附加后该标签页同样 `attached: true`，
 * 因此已在 `appliedByTab` 的标签页要排除在「DevTools 占用」之外，否则切换预设会永远被自己挡住。
 */
async function unavailableReasonFor(tabId: number) {
  const [tab, targets] = await Promise.all([chrome.tabs.get(tabId), chrome.debugger.getTargets()])
  const reason = pageUnavailableReason(tab.url)
  if (reason) return reason
  if (appliedByTab.has(tabId)) return ""
  if (targets.some((target) => target.tabId === tabId && target.attached)) return "该标签页已打开 DevTools，无法模拟"
  return ""
}

async function inForeignGroup(tabId: number) {
  const tab = await chrome.tabs.get(tabId)
  const groupId = tab.groupId ?? -1
  return groupId >= 0 && !ownedGroupIds.has(groupId)
}

/** 只清内存；标签页已消失时浏览器自己会清掉覆盖。 */
async function forgetTab(tabId: number) {
  if (suspendedTabs.delete(tabId)) await resumeUserAgentRule()
  appliedByTab.delete(tabId)
}

/**
 * 退出模拟的唯一收尾路径：归还让位、分离调试会话、离开模拟分组、重新加载，最后清空内存映射。
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
    // 「不覆盖」也必须考虑上一次的覆盖：复用会话时旧 UA 还留在标签页里，不显式清除就还是旧身份。
    if (identity) await applyUaOverride(tabId, identity)
    else if (reusing) await clearUaOverride(tabId)
    // 换组到写回映射之间必然有一段旧映射与新归属不一致的窗口，扩展自己的事件必须在这段时间内被忽略。
    groupTransitions.add(tabId)
    let groupId: number
    try {
      groupId = await joinPresetGroup(preset, tabId)
      appliedByTab.set(tabId, { presetId: preset.id, groupId })
    } finally {
      groupTransitions.delete(tabId)
    }
    await syncGlobalUserAgentRule(tabId, Boolean(identity))
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

/**
 * 清除 UA 覆盖，回到宿主浏览器的真实身份。
 * CDP 没有单独的 clear 命令，空 `userAgent` 就是「不覆盖」的表达：Chromium 的 `EmulationHandler`
 * 只在 `user_agent_` 非空时改写 `User-Agent` 头、且空串时不再下发 client hints，
 * Blink 侧同样在覆盖串为空时回退到真实 `navigator.userAgent`。
 * 空串与 `platform`、`userAgentMetadata` 同时给出会被拒绝（"Empty userAgent invalid with userAgentMetadata provided"），
 * 因此只传 `userAgent: ""`。`navigator.platform` 的覆盖值为空时也自动回退真实值，无需单独清除。
 */
async function clearUaOverride(tabId: number) {
  await chrome.debugger.sendCommand({ tabId }, "Emulation.setUserAgentOverride", { userAgent: "" })
}

/**
 * 停止一个预设，逐个走统一的 `endSession`。
 * 先快照标签页再退出——`endSession` 会删 `appliedByTab`，边迭代边删会漏掉后面的标签页。
 */
async function stopPreset(presetId: string) {
  const tabIds = [...appliedByTab.entries()]
    .filter(([, applied]) => applied.presetId === presetId)
    .map(([tabId]) => tabId)
  for (const tabId of tabIds) await endSession(tabId)
}

async function loadPresets(): Promise<BrowserPreset[]> {
  const stored = await chrome.storage.local.get([BROWSER_PRESETS_KEY])
  const value = stored[BROWSER_PRESETS_KEY]
  return Array.isArray(value) ? (value as BrowserPreset[]) : []
}

async function savePresets(presets: BrowserPreset[]) {
  await chrome.storage.local.set({ [BROWSER_PRESETS_KEY]: presets })
}

function usageCountOf(presetId: string) {
  let count = 0
  for (const applied of appliedByTab.values()) if (applied.presetId === presetId) count += 1
  return count
}

/**
 * 锁定判定：只要还有标签页在用这个预设，它的名称与参数就不能变。
 * 重命名会让 `[ninja] <预设名>` 分组名与预设脱节，改参数会让同一分组下的标签页模拟出不同身份，
 * 删除则会让分组失去对应的预设（见 ADR 0003）。因此编辑、重命名与删除共用这一条拒绝规则。
 */
function assertPresetUnused(presetId: string) {
  if (usageCountOf(presetId) > 0) throw new Error("预设正在被使用，请先停止")
}

/**
 * 按预设 id 汇总使用数量。单独成表而不是并进预设记录，是为了让 `presets` 保持存储里的原样：
 * 预设本身是可持久化的数据，使用数量只活在后台内存里。
 */
function usageOf(presets: BrowserPreset[]): BrowserPresetUsage {
  return Object.fromEntries(presets.map((preset) => [preset.id, usageCountOf(preset.id)]))
}

export function registerBrowserPresetBackground() {
  // 用户把标签页移出扩展分组即视为退出模拟；用户自建分组不在 ownedGroupIds 内，不受影响。
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.groupId === undefined) return
    if (groupTransitions.has(tabId)) return
    const applied = appliedByTab.get(tabId)
    if (!applied || changeInfo.groupId === applied.groupId) return
    void endSession(tabId)
  })

  // DevTools 抢占、浏览器提示条取消与标签页关闭都会走到这里，来源需要按标签页反查。
  chrome.debugger.onDetach.addListener((source, reason) => {
    void attributeDetach(source, reason)
  })

  // 分组空掉后由 Chrome 自行关闭；这里只把 id 从记账里去掉，用户自建分组的删除是空操作。
  chrome.tabGroups.onRemoved.addListener((group) => {
    ownedGroupIds.delete(group.id)
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
        if (message.type === "list") return { ok: true, presets, usage: usageOf(presets) }
        if (message.type === "create" || message.type === "update") {
          const existing =
            message.type === "update" ? presets.find((preset) => preset.id === message.id) : undefined
          if (message.type === "update" && !existing) throw new Error("预设不存在，可能已被删除")
          // 编辑与重命名走同一条命令，锁定必须在写入前拒绝。
          if (existing) assertPresetUnused(existing.id)
          const { draft, errors } = validatePreset(message.preset, presets, existing?.id)
          const error = firstPresetError(errors)
          if (error) throw new Error(error)
          // 冲突且未确认时什么都不写：取消保存就是保持现状。
          const conflict = mobileConflictOf(draft.userAgent, draft.viewport.mobile)
          if (conflict && message.confirmConflict !== true) return { ok: false, needsConfirmation: true, conflict }
          const preset: BrowserPreset = { id: existing?.id ?? crypto.randomUUID(), ...draft }
          const next = existing
            ? presets.map((item) => (item.id === preset.id ? preset : item))
            : [...presets, preset]
          await savePresets(next)
          return { ok: true, preset, presets: next, usage: usageOf(next) }
        }
        if (message.type === "delete") {
          if (!presets.some((preset) => preset.id === message.id)) throw new Error("预设不存在，可能已被删除")
          assertPresetUnused(message.id)
          const next = presets.filter((preset) => preset.id !== message.id)
          await savePresets(next)
          return { ok: true, presets: next, usage: usageOf(next) }
        }
        if (message.type === "stop") {
          if (!presets.some((preset) => preset.id === message.id)) throw new Error("预设不存在，可能已被删除")
          await stopPreset(message.id)
          return { ok: true, presets, usage: usageOf(presets) }
        }
        if (message.type === "status") {
          const tabId = await targetTabId(sender)
          const notice = notices.get(tabId)
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
          // 未在模拟时保持现状：重新加载只会丢掉页面当前状态。
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
