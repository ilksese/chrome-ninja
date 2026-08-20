export type BilibiliOptionsType = {
  enabled: boolean
  notify: boolean
  blockAD: boolean
}

export type BaiduSettingType = {
  clearSearch: boolean
}

export type BossSettingType = {
  enabled: boolean
}

export type RecorderOptionsType = {
  enabled: boolean
}

export type UserAgentType = "default" | "chrome-desktop" | "chrome-android" | "safira-desktop" | "safira-ios"

export type Options = {
  bilibili: BilibiliOptionsType
  baidu: BaiduSettingType
  boss: BossSettingType
  recorder: RecorderOptionsType
  userAgent: UserAgentType
}
