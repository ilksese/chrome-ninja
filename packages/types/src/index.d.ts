export = ChromeNinja
export as namespace ChromeNinja
declare namespace ChromeNinja {
  type BilibiliOptionsType = {
    enabled: boolean
    notify: boolean
    blockAD: boolean
  }
  type BaiduSettingType = {
    clearSearch: boolean
  }
  type Options = {
    bilibili: BilibiliOptionsType
    baidu: BaiduSettingType
  }
}
