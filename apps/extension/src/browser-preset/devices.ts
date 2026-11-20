import type { BrowserPreset } from "./types"
import { IDENTITIES } from "./identity"

const devices = [
  { id: "iphone", name: "iPhone 15 Pro", mobile: true, width: 393, height: 852, deviceScaleFactor: 3 },
  { id: "pixel", name: "Pixel 8", mobile: true, width: 412, height: 915, deviceScaleFactor: 2.625 },
  { id: "ipad", name: "iPad mini", mobile: true, width: 768, height: 1024, deviceScaleFactor: 2 },
  { id: "laptop", name: "笔记本 1440", mobile: false, width: 1440, height: 900, deviceScaleFactor: 1 }
] as const

export const BUILTIN_PRESETS: BrowserPreset[] = devices.map(({ id, name, mobile, ...viewport }) => ({
  id,
  deviceId: id,
  name,
  viewport,
  ...(mobile ? { touchMode: "touch" } : {})
}))

export function getDevicePreset(id: string | undefined) {
  const device = devices.find((device) => device.id === id)
  return device && { ...device, identity: IDENTITIES[device.id] }
}
