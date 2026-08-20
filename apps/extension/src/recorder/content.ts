import { createElement } from "preact"
import { render } from "preact"
import "./panel.css"
import Panel from "./panel"
import { startCapture } from "./capture"
import { executeStep } from "./execute"
import { PANEL_HOST_ATTR, PANEL_HOST_SELECTOR } from "./messages"

const isTopFrame = window === window.top

async function main() {
  const { options } = await chrome.storage.local.get(["options"])
  if (!options?.recorder?.enabled) return

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target === "recorder-frame" && message.type === "EXECUTE") {
      executeStep(message.step).then(sendResponse)
      return true
    }
    return false
  })

  const stopCapture = startCapture((event) => {
    chrome.runtime.sendMessage({ target: "recorder", type: "EVENT", event })
  })
  window.addEventListener("pagehide", stopCapture, { once: true })

  if (isTopFrame) {
    let host = document.querySelector<HTMLElement>(PANEL_HOST_SELECTOR)
    if (!host) {
      host = document.createElement("div")
      host.setAttribute(PANEL_HOST_ATTR, "")
      document.body.appendChild(host)
    }
    render(createElement(Panel, null), host)
  }
}

void (async () => {
  await main()
})()
