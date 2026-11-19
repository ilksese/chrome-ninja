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

export type UserAgentMetadata = {
  brands: { brand: string; version: string }[]
  fullVersionList: { brand: string; version: string }[]
  platform: string
  platformVersion: string
  architecture: string
  model: string
  mobile: boolean
  bitness: string
  wow64: boolean
  formFactors: string[]
}

/** 内置 UA 身份包：预设只存枚举值，身份在应用时查表得到。Safari 类身份没有 metadata。 */
export type UserAgentIdentity = {
  userAgent: string
  platform: string
  userAgentMetadata?: UserAgentMetadata
}

/** 移动端判定冲突的详情，供预设页解释「实际发什么」与风险。 */
export type MobileConflict = {
  userAgentMobile: boolean
  viewportMobile: boolean
  secChUaMobile: "?0" | "?1"
  layout: "mobile" | "desktop"
}

export type BrowserPresetCommand =
  | { type: "list" }
  | { type: "create" | "update"; preset: BrowserPresetDraft; id?: string; confirmConflict?: boolean }
  | { type: "delete"; id: string }
  | { type: "apply"; id: string }
  /** 退出当前标签页的模拟。UI 入口由 #21 接入，后台路径先在此固定。 */
  | { type: "simulate-exit" }
  | { type: "status" }

export type BrowserPresetRequest = { target: "browser-preset" } & BrowserPresetCommand

export type BrowserPresetResponse = {
  ok: boolean
  error?: string
  /** 移动端判定冲突：本次未写入任何内容，需要用户确认后带 `confirmConflict` 重发。 */
  needsConfirmation?: boolean
  conflict?: MobileConflict
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
