import type { BilibiliSettingType } from "@components/settings/BilibiliSetting"
import type { IContentScriptAPI } from "../index"

export function handler(options: BilibiliSettingType | null, api: IContentScriptAPI) {
  const { injectCSS, injectJS } = api
  const bilibiliHandler = {
    test: function () {
      return location.host.endsWith("bilibili.com")
    },
    /**是否在直播间 */
    inLiveRoom: function () {
      return location.host.startsWith("live")
    },
    /**在视频播放页 */
    inVideo: function () {
      return location.pathname.startsWith("/video/BV")
    },
    /**
     * 切换画质到已有最高
     */
    switchQuality: function () {
      if (this.inLiveRoom() || this.inVideo()) {
        injectJS("bilibili/switchQuality")
      }
    },
    /**
     * css去广告
     */
    blockAD: function () {
      injectJS("common/@document-polyfill")
      injectCSS("bilibili/blockAD")
    },
    exec: function () {
      if (options?.enabled) {
        this.switchQuality()
      }
      if (options?.blockAD) {
        this.blockAD()
      }
    }
  }
  return bilibiliHandler
}
handler.optionName = "bilibili"
