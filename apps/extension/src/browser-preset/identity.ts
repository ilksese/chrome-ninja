import type { MobileConflict, UserAgentIdentity, UserAgentMetadata } from "./types"
import type { UserAgentType } from "@/types"
import { getUserAgentOption } from "@/user-agent"

/**
 * 内置 UA 与 Chrome/127 对齐。UA 串本身来自 `USER_AGENT_OPTIONS`，这里只补身份的另一半：
 * `navigator.platform` 与 `userAgentMetadata`。版本号改动时只改这几个常量。
 */
const CHROME_BRAND_VERSION = "127"
const CHROME_FULL_VERSION = "127.0.0.0"

/**
 * 完整 metadata 是硬要求：`brands`、`fullVersionList`、`bitness`、`wow64`、`formFactors`
 * 缺省时会回退成宿主 Chrome 的真实值，站点据此即可判定身份不一致。
 * 因此每个身份都给全字段，不依赖任何回退。
 */
const chromeBrands = (): UserAgentMetadata["brands"] => [
  { brand: "Not)A;Brand", version: "99" },
  { brand: "Google Chrome", version: CHROME_BRAND_VERSION },
  { brand: "Chromium", version: CHROME_BRAND_VERSION }
]

const chromeFullVersionList = (): UserAgentMetadata["fullVersionList"] => [
  { brand: "Not)A;Brand", version: "99.0.0.0" },
  { brand: "Google Chrome", version: CHROME_FULL_VERSION },
  { brand: "Chromium", version: CHROME_FULL_VERSION }
]

type IdentityFields = Omit<UserAgentIdentity, "userAgent">

const IDENTITIES: Record<Exclude<UserAgentType, "default">, IdentityFields> = {
  "chrome-desktop": {
    platform: "Win32",
    userAgentMetadata: {
      brands: chromeBrands(),
      fullVersionList: chromeFullVersionList(),
      platform: "Windows",
      platformVersion: "10.0.0",
      architecture: "x86",
      model: "",
      mobile: false,
      bitness: "64",
      wow64: false,
      formFactors: ["Desktop"]
    }
  },
  "chrome-android": {
    platform: "Linux armv81",
    userAgentMetadata: {
      brands: chromeBrands(),
      fullVersionList: chromeFullVersionList(),
      platform: "Android",
      platformVersion: "14.0.0",
      // 架构与位数为空：UA 串无法判定具体架构，留空也不会继承宿主的 x86 / "64"。
      architecture: "",
      model: "Pixel 8 Pro",
      mobile: true,
      bitness: "",
      wow64: false,
      formFactors: ["Mobile"]
    }
  },
  // Safari 类身份不下发 metadata，效果是全部 sec-ch-ua-* 请求头不出现。
  "safira-desktop": { platform: "MacIntel" },
  "safira-ios": { platform: "iPhone" }
}

/** 查询内置 UA 身份包；「不覆盖」没有身份，返回 null。 */
export function getUaIdentity(value: UserAgentType): UserAgentIdentity | null {
  if (value === "default") return null
  const fields = IDENTITIES[value]
  if (!fields) return null
  return { userAgent: getUserAgentOption(value).ua, ...fields }
}

/**
 * 比对 UA 身份声明的 `mobile`（决定实际发出的 `sec-ch-ua-mobile`）与视口的 `mobile`
 * （决定布局）。Safari 类身份没有 metadata、不产生 client hints，因此不参与比对。
 */
export function mobileConflictOf(userAgent: UserAgentType, viewportMobile: boolean): MobileConflict | null {
  const metadata = getUaIdentity(userAgent)?.userAgentMetadata
  if (!metadata || metadata.mobile === viewportMobile) return null
  return {
    userAgentMobile: metadata.mobile,
    viewportMobile,
    secChUaMobile: metadata.mobile ? "?1" : "?0",
    layout: viewportMobile ? "mobile" : "desktop"
  }
}
