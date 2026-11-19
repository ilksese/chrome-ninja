import type { BrowserPreset, BrowserPresetDraft } from "./types"
import { USER_AGENT_OPTIONS } from "@/user-agent"

export const PRESET_NAME_MAX_LENGTH = 40
export const VIEWPORT_MIN = 200
export const VIEWPORT_MAX = 4000
export const DEVICE_SCALE_MIN = 1
export const DEVICE_SCALE_MAX = 4

export type PresetField = "name" | "userAgent" | "width" | "height" | "deviceScaleFactor" | "mobile"
export type PresetFieldErrors = Partial<Record<PresetField, string>>

/** 按字段顺序返回第一条错误，供后台协议与预设页共用。 */
export const PRESET_FIELD_ORDER: PresetField[] = ["name", "userAgent", "width", "height", "deviceScaleFactor", "mobile"]

export const normalizePresetName = (name: string) => name.trim().toLowerCase()

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

/** 校验预设草稿；`editingId` 用于在重命名时排除自身。 */
export function validatePreset(
  value: unknown,
  presets: BrowserPreset[],
  editingId?: string
): { draft: BrowserPresetDraft; errors: PresetFieldErrors } {
  const input = (value ?? {}) as Partial<BrowserPresetDraft>
  const viewport = (input.viewport ?? {}) as Partial<BrowserPresetDraft["viewport"]>
  const errors: PresetFieldErrors = {}

  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name) errors.name = "预设名称不能为空"
  else if (name.length > PRESET_NAME_MAX_LENGTH) errors.name = `预设名称不能超过 ${PRESET_NAME_MAX_LENGTH} 个字符`
  else if (
    presets.some((preset) => preset.id !== editingId && normalizePresetName(preset.name) === normalizePresetName(name))
  )
    errors.name = "预设名称已存在，请换一个名称"

  if (!USER_AGENT_OPTIONS.some((option) => option.value === input.userAgent))
    errors.userAgent = "请选择内置的 User-Agent 身份"

  if (!isIntegerInRange(viewport.width, VIEWPORT_MIN, VIEWPORT_MAX))
    errors.width = `视口宽度必须是 ${VIEWPORT_MIN}–${VIEWPORT_MAX} 之间的整数`
  if (!isIntegerInRange(viewport.height, VIEWPORT_MIN, VIEWPORT_MAX))
    errors.height = `视口高度必须是 ${VIEWPORT_MIN}–${VIEWPORT_MAX} 之间的整数`
  if (
    typeof viewport.deviceScaleFactor !== "number" ||
    !Number.isFinite(viewport.deviceScaleFactor) ||
    viewport.deviceScaleFactor < DEVICE_SCALE_MIN ||
    viewport.deviceScaleFactor > DEVICE_SCALE_MAX
  )
    errors.deviceScaleFactor = `设备像素比必须在 ${DEVICE_SCALE_MIN}–${DEVICE_SCALE_MAX} 之间`
  if (typeof viewport.mobile !== "boolean") errors.mobile = "请选择布局类型"

  return {
    draft: {
      name,
      userAgent: input.userAgent as BrowserPresetDraft["userAgent"],
      viewport: {
        width: viewport.width as number,
        height: viewport.height as number,
        deviceScaleFactor: viewport.deviceScaleFactor as number,
        mobile: viewport.mobile as boolean
      }
    },
    errors
  }
}

/** 返回第一条错误文案，没有错误时返回 undefined。 */
export function firstPresetError(errors: PresetFieldErrors) {
  return PRESET_FIELD_ORDER.map((field) => errors[field]).find(Boolean)
}
