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

export type BrowserPresetRequest = { target: "browser-preset" } & BrowserPresetCommand

export type BrowserPresetResponse = {
  ok: boolean
  error?: string
  presets?: BrowserPreset[]
  preset?: BrowserPreset
}

export const BROWSER_PRESETS_KEY = "browserPresets"
