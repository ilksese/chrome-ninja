import type { UserAgentIdentity, UserAgentMetadata } from "./types"

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

export const IDENTITIES: Record<"laptop" | "pixel" | "iphone" | "ipad", UserAgentIdentity> = {
  laptop: {
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Safari/537.36`,
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
  pixel: {
    userAgent: `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_FULL_VERSION} Mobile Safari/537.36`,
    platform: "Linux armv8l",
    userAgentMetadata: {
      brands: chromeBrands(),
      fullVersionList: chromeFullVersionList(),
      platform: "Android",
      platformVersion: "14.0.0",
      // 架构与位数为空：UA 串无法判定具体架构，留空也不会继承宿主的 x86 / "64"。
      architecture: "",
      model: "Pixel 8",
      mobile: true,
      bitness: "",
      wow64: false,
      formFactors: ["Mobile"]
    }
  },
  // Safari 类身份不下发 metadata，效果是全部 sec-ch-ua-* 请求头不出现。
  iphone: {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    platform: "iPhone"
  },
  ipad: {
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    platform: "iPad"
  }
}
