import type { BrowserPreset, BrowserPresetRequest, BrowserPresetResponse } from "./types"
import { BROWSER_PRESETS_KEY } from "./types"
import { mobileConflictOf } from "./identity"
import { firstPresetError, validatePreset } from "./validation"

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
        throw new Error("未知的浏览器预设命令")
      }
      void handle().then(respond, (error: unknown) =>
        respond({ ok: false, error: error instanceof Error ? error.message : "浏览器预设操作失败" })
      )
      return true
    }
  )
}
