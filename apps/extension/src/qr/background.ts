import { ninjaLog } from "@chrome-ninja/utils"

const QR_MENU_PARENT_ID = "chrome-ninja"
const QR_MENU_GENERATE_ID = "chrome-ninja-generate-qr"
const QR_PAGE_PATH = "src/qr/index.html"

export function registerQrBackground() {
  void createQrMenus()

  chrome.contextMenus.onClicked.addListener((info) => {
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
  ninjaLog("qr menu ready")
}
