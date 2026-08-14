export type BilibiliOptionsType = {
  enabled: boolean
  notify: boolean
  blockAD: boolean
}

export type BaiduSettingType = {
  clearSearch: boolean
}

export type Options = {
  bilibili: BilibiliOptionsType
  baidu: BaiduSettingType
}
