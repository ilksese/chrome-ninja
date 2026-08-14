import { handler as baiduHandler } from "./baidu"
import { handler as biliHandler } from "./bilibili"

console.log("content-script: chrome-ninja is runing")

const CONTENT_SCRIPT_PATH = "https://localhost:80/src/content-script/"

function injectJS(name: string, base: string = CONTENT_SCRIPT_PATH) {
  const url = new URL(name, base)
  const script = document.createElement("script")
  script.type = "module"
  script.src = chrome.runtime.getURL(url.pathname + ".js")
  script.crossOrigin = ""
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
  chrome.storage.local.get(["options"], ({ options }) => {
    const matcher = [biliHandler, baiduHandler]
    for (const handler of matcher) {
      if (options && handler.optionName && Object.prototype.hasOwnProperty.call(options, handler.optionName)) {
        const h = handler(options[handler.optionName], { injectCSS, injectJS })
        if (h.test()) {
          h.exec()
          break
        }
      }
    }
  })
}
main()
