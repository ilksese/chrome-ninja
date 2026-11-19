import type { BrowserPresetViewport } from "./types"

export type DevicePreset = { label: string; viewport: BrowserPresetViewport }

/** 设备档位只用于一键填入视口数值，不进入存储。 */
export const DEVICE_PRESETS: DevicePreset[] = [
  { label: "iPhone 15 Pro", viewport: { width: 393, height: 852, deviceScaleFactor: 3, mobile: true } },
  { label: "Pixel 8", viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true } },
  { label: "iPad mini", viewport: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true } },
  { label: "笔记本 1440", viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } }
]
