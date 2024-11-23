import type { SettingFormData } from "@/pages/Settings"

console.log("content-script: chrome-ninja is runing")

// @ts-ignore
async function getTabId(): Promise<number> {
  return new Promise((resolve) => {
    const recive = (tabId: number) => {
      chrome.runtime.onMessage.removeListener(recive)
      resolve(tabId)
    }
    chrome.runtime.onMessage.addListener(recive)
    chrome.runtime.sendMessage({
      type: "get_tab_id"
    })
  })
}

const CONTENT_SCRIPT_PATH = "https://localhost:80/src/content-script/"

function injectJS(name: string, base: string = CONTENT_SCRIPT_PATH) {
  const url = new URL(name, base)
  const script = document.createElement("script")
  script.type = "module"
  script.src = chrome.runtime.getURL(url.pathname)
  // @ts-ignore
  script.crossorigin = true
  script.defer = true
  document.head.appendChild(script)
}

function injectCSS(name: string, base: string = CONTENT_SCRIPT_PATH) {
  const url = new URL(name, base)
  const style = document.createElement("link")
  style.rel = "stylesheet"
  style.href = chrome.runtime.getURL(url.pathname)
  document.head.appendChild(style)
}

const main = async () => {
  const options: SettingFormData = (await chrome.storage.local.get(["options"])).options
  const bilibiliHandler = {
    test: function () {
      return location.host.endsWith("bilibili.com")
    },
    /**是否在直播间 */
    inLiveRoom: function () {
      return location.host.startsWith("live")
    },
    /**
     * 切换画质到已有最高
     */
    switchQuality: function () {
      if (this.inLiveRoom()) {
        injectJS("bilibili/index.js")
      }
    },
    /**
     * css去广告
     */
    blockAD: function () {
      injectJS("bilibili/@document-polyfill.js")
      injectCSS("bilibili/blockAD.css")
    },
    exec: function () {
      if (options?.bilibili?.enabled) {
        this.switchQuality()
      }
      if (options?.bilibili?.blockAD) {
        this.blockAD()
      }
    }
  }
  const matcher = [bilibiliHandler]
  for (const handler of matcher) {
    if (handler.test()) {
      handler.exec()
      break
    }
  }
}
main()
