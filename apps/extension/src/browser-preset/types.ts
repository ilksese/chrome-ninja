export type BrowserPresetViewport = {
  width: number
  height: number
  deviceScaleFactor: number
}

export type TouchMode = "mouse" | "touch"

export type BrowserPreset = {
  id: string
  name: string
  deviceId: string
  viewport: BrowserPresetViewport
  touchMode?: TouchMode
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

export type BrowserPresetCommand =
  | { type: "list" }
  | { type: "create" | "update"; preset: BrowserPresetDraft; id?: string }
  | { type: "delete"; id: string }
  | { type: "apply"; id: string; confirmGroupMove?: boolean }
  | { type: "simulate-exit" }
  | { type: "stop"; id: string }
  | { type: "status" }

export type BrowserPresetRequest = { target: "browser-preset" } & BrowserPresetCommand

export type BrowserPresetResponse = {
  ok: boolean
  error?: string
  /** 标签页在用户自建分组中：本次未做任何改动，确认移出分组后带 `confirmGroupMove` 重发。 */
  needsGroupMoveConfirmation?: boolean
  presets?: BrowserPreset[]
  /** 预设 id 到正在使用它的标签页数；计数大于 0 即锁定。下发预设的每个命令都一并返回。 */
  usage?: BrowserPresetUsage
  preset?: BrowserPreset
  /** 目标标签页 id；`status` 返回。 */
  tabId?: number
  /** 目标标签页正在模拟的预设 id；`status` 返回，未模拟时缺省。 */
  presetId?: string
  /** 目标标签页不可模拟的原因，空串表示可以模拟；`status` 返回。 */
  unavailableReason?: string
  /** 待展示的一次性提示，读取后即清空；`status` 返回。 */
  notice?: string
}

/** 后台内存中「标签页正在模拟哪个预设」的映射，不持久化，扩展重启即丢失。 */
export type AppliedPreset = { presetId: string; groupId: number }

/**
 * 预设 id 到「正在使用它的标签页数」的映射，由后台按 `appliedByTab` 现算，不落存储。
 * 计数大于 0 即表示该预设处于锁定状态，因此不再单独下发锁定标记。
 */
export type BrowserPresetUsage = Record<string, number>

export const BROWSER_PRESETS_KEY = "customBrowserPresets"
