import { describe, expect, it } from "vitest"
import { getUaIdentity, mobileConflictOf } from "../src/browser-preset/identity"
import { USER_AGENT_OPTIONS } from "../src/user-agent"

const CHROME_DESKTOP_BRANDS = [
  { brand: "Not)A;Brand", version: "99" },
  { brand: "Google Chrome", version: "127" },
  { brand: "Chromium", version: "127" }
]

describe("UA 身份包", () => {
  it("每个内置 UA 都能查到身份，UA 串与既有常量完全一致", () => {
    for (const option of USER_AGENT_OPTIONS.filter((item) => item.value !== "default")) {
      const identity = getUaIdentity(option.value)
      expect(identity, option.value).not.toBeNull()
      expect(identity!.userAgent, option.value).toBe(option.ua)
      expect(identity!.platform, option.value).not.toBe("")
    }
  })

  it("不覆盖身份没有 UA 串、platform 与 metadata", () => {
    expect(getUaIdentity("default")).toBeNull()
  })

  it("Chrome 桌面身份带完整 metadata，字段与 UA 串的 Chrome/127 一致", () => {
    const identity = getUaIdentity("chrome-desktop")!
    expect(identity.platform).toBe("Win32")
    expect(identity.userAgentMetadata).toEqual({
      brands: CHROME_DESKTOP_BRANDS,
      fullVersionList: [
        { brand: "Not)A;Brand", version: "99.0.0.0" },
        { brand: "Google Chrome", version: "127.0.0.0" },
        { brand: "Chromium", version: "127.0.0.0" }
      ],
      platform: "Windows",
      platformVersion: "10.0.0",
      architecture: "x86",
      model: "",
      mobile: false,
      bitness: "64",
      wow64: false,
      formFactors: ["Desktop"]
    })
  })

  it("Chrome Android 身份不残留桌面的架构与位数特征", () => {
    const identity = getUaIdentity("chrome-android")!
    expect(identity.platform).toBe("Linux armv81")
    expect(identity.userAgentMetadata).toMatchObject({
      platform: "Android",
      platformVersion: "14.0.0",
      architecture: "",
      model: "Pixel 8 Pro",
      mobile: true,
      bitness: "",
      wow64: false,
      formFactors: ["Mobile"]
    })
  })

  it("Safari 类身份不下发 metadata", () => {
    for (const value of ["safira-desktop", "safira-ios"] as const) {
      const identity = getUaIdentity(value)!
      expect(identity.userAgent).not.toBe("")
      expect(identity.platform).not.toBe("")
      expect(identity.userAgentMetadata).toBeUndefined()
    }
    expect(getUaIdentity("safira-desktop")!.platform).toBe("MacIntel")
    expect(getUaIdentity("safira-ios")!.platform).toBe("iPhone")
  })

  it("metadata 的 brand 版本号与 UA 串的 Chrome/127 保持一致", () => {
    for (const value of ["chrome-desktop", "chrome-android"] as const) {
      const identity = getUaIdentity(value)!
      expect(identity.userAgent).toContain("Chrome/127.0.0.0")
      const chromeBrands = identity.userAgentMetadata!.fullVersionList.filter((item) => item.brand !== "Not)A;Brand")
      expect(chromeBrands.map((item) => item.version)).toEqual(["127.0.0.0", "127.0.0.0"])
      expect(
        identity.userAgentMetadata!.brands
          .filter((item) => item.brand !== "Not)A;Brand")
          .every((item) => item.version === "127")
      ).toBe(true)
    }
  })

  it("移动端判定冲突只在身份 mobile 与视口 mobile 不一致时成立", () => {
    expect(mobileConflictOf("chrome-android", false)).toEqual({
      userAgentMobile: true,
      viewportMobile: false,
      secChUaMobile: "?1",
      layout: "desktop"
    })
    expect(mobileConflictOf("chrome-desktop", true)).toEqual({
      userAgentMobile: false,
      viewportMobile: true,
      secChUaMobile: "?0",
      layout: "mobile"
    })
    expect(mobileConflictOf("chrome-android", true)).toBeNull()
    expect(mobileConflictOf("chrome-desktop", false)).toBeNull()
    expect(mobileConflictOf("safira-ios", false)).toBeNull()
    expect(mobileConflictOf("default", true)).toBeNull()
  })
})
