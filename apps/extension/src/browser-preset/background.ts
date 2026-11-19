import type { AppliedPreset, BrowserPreset, BrowserPresetRequest, BrowserPresetResponse } from "./types"
import { pageUnavailableReason } from "@/cookie-editor/types"
import { BROWSER_PRESETS_KEY } from "./types"
import { mobileConflictOf } from "./identity"
import { firstPresetError, validatePreset } from "./validation"

/** 正在模拟的标签页；只活在后台内存里，扩展重启即清空。 */
const appliedByTab = new Map<number, AppliedPreset>()

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

async function applyPreset(preset: BrowserPreset, tabId: number) {
  const reason = await unavailableReasonFor(tabId)
  if (reason) throw new Error(reason)
  await chrome.debugger.attach({ tabId }, "1.3")
  try {
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", preset.viewport)
  } catch (error) {
    await chrome.debugger.detach({ tabId }).catch(() => {})
    appliedByTab.delete(tabId)
    throw error
  }
  appliedByTab.set(tabId, { presetId: preset.id })
  // 全部覆盖下发完成后才 reload，避免先加载出未模拟的页面。
  await chrome.tabs.reload(tabId)
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
          return { ok: true, tabId, unavailableReason: await unavailableReasonFor(tabId) }
        }
        if (message.type === "apply") {
          const preset = presets.find((item) => item.id === message.id)
          if (!preset) throw new Error("预设不存在，可能已被删除")
          await applyPreset(preset, await targetTabId(sender))
          return { ok: true, preset }
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
