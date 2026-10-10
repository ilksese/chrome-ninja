import { ninjaLog } from "@chrome-ninja/utils"
import { toggleNetmonForTab } from "@/network-monitor/background"

const QR_MENU_PARENT_ID = "chrome-ninja"
const QR_MENU_GENERATE_ID = "chrome-ninja-generate-qr"
const NETMON_MENU_TOGGLE_ID = "chrome-ninja-toggle-netmon"
const QR_PAGE_PATH = "src/qr/index.html"

export function registerQrBackground() {
  void createQrMenus()

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === NETMON_MENU_TOGGLE_ID) {
      void toggleNetmonForTab(tab).catch((error) => console.error("右键切换网络监视器失败", error))
      return
    }
    if (info.menuItemId !== QR_MENU_GENERATE_ID) {
      return
    }
    const baseUrl = chrome.runtime.getURL(QR_PAGE_PATH)
    const pageUrl = info.pageUrl || ""
    chrome.tabs.create({ url: pageUrl ? `${baseUrl}?url=${encodeURIComponent(pageUrl)}` : baseUrl })
  })
}

async function createQrMenus() {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({ id: QR_MENU_PARENT_ID, title: "chrome ninja" })
  chrome.contextMenus.create({
    id: QR_MENU_GENERATE_ID,
    parentId: QR_MENU_PARENT_ID,
    title: "生成二维码（当前页面链接）",
    contexts: ["page"]
  })
  chrome.contextMenus.create({
    id: NETMON_MENU_TOGGLE_ID,
    parentId: QR_MENU_PARENT_ID,
    title: "开启／关闭网络监视器",
    contexts: ["page"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  })
  ninjaLog("qr menu ready")
}
