import type { UserAgentType } from "@/types"

export type BrowserPresetViewport = {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

export type BrowserPreset = {
  id: string
  name: string
  userAgent: UserAgentType
  viewport: BrowserPresetViewport
}

export type BrowserPresetDraft = Omit<BrowserPreset, "id">

export type BrowserPresetCommand =
  | { type: "list" }
  | { type: "create" | "update"; preset: BrowserPresetDraft; id?: string }
  | { type: "delete"; id: string }
  | { type: "apply"; id: string }
  | { type: "status" }

export type BrowserPresetRequest = { target: "browser-preset" } & BrowserPresetCommand

export type BrowserPresetResponse = {
  ok: boolean
  error?: string
  presets?: BrowserPreset[]
  preset?: BrowserPreset
  /** 目标标签页 id；`status` 返回。 */
  tabId?: number
  /** 目标标签页不可模拟的原因，空串表示可以模拟；`status` 返回。 */
  unavailableReason?: string
}

/** 后台内存中「标签页正在模拟哪个预设」的映射，不持久化，扩展重启即丢失。 */
export type AppliedPreset = { presetId: string }

export const BROWSER_PRESETS_KEY = "browserPresets"
