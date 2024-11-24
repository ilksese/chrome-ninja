import type { BaiduSettingType } from "@components/settings/BiaduSetting"
import type { IContentScriptAPI } from "../index"

export function handler(options: BaiduSettingType | null, api: IContentScriptAPI) {
  const { injectCSS, injectJS } = api
  const bilibiliHandler = {
    test: function () {
      return location.host.endsWith("baidu.com")
    },
    clearSearch: function () {
      injectJS("common/@document-polyfill.js")
      injectCSS("baidu/search")
    },
    exec: function () {
      if (options?.clearSearch) this.clearSearch()
    }
  }
  return bilibiliHandler
}
handler.optionName = "baidu"
