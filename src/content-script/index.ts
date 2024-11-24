import type { SettingFormData } from "@/pages/Settings"
import { handler as baiduHandler } from "./baidu"
import { handler as biliHandler } from "./bilibili"

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
  script.src = chrome.runtime.getURL(url.pathname + ".js")
  // @ts-ignore
  script.crossorigin = true
  script.defer = true
  document.querySelector("html")?.append(script)
}

function injectCSS(name: string, base: string = CONTENT_SCRIPT_PATH) {
  const url = new URL(name, base)
  const style = document.createElement("link")
  style.rel = "stylesheet"
  style.href = chrome.runtime.getURL(url.pathname + ".css")
  document.querySelector("html")?.append(style)
}

export interface IContentScriptAPI {
  injectJS: typeof injectJS
  injectCSS: typeof injectCSS
}

const main = async () => {
  const options: SettingFormData = (await chrome.storage.local.get(["options"])).options
  const matcher = [biliHandler, baiduHandler]
  for (const handler of matcher) {
    // @ts-ignore
    const h = handler(options[handler.optionName], { injectCSS, injectJS })
    if (h.test()) {
      h.exec()
      break
    }
  }
}
main()
