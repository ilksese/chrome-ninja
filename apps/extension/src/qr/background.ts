import { ninjaLog } from "@chrome-ninja/utils"
import { createElementCopyMenus, handleElementCopyMenu } from "@/element-copy/background"
import { toggleNetmonForTab } from "@/network-monitor/background"
import { mergeOptions } from "@/store/options"
import type { UserAgentType } from "@/types"
import { applyUserAgentRule, getUserAgentOption, USER_AGENT_OPTIONS } from "@/user-agent"

const QR_MENU_PARENT_ID = "chrome-ninja"
const QR_MENU_GENERATE_ID = "chrome-ninja-generate-qr"
const NETMON_MENU_TOGGLE_ID = "chrome-ninja-toggle-netmon"
const USER_AGENT_MENU_ID = "chrome-ninja-user-agent"
const QR_PAGE_PATH = "src/qr/index.html"

export function registerQrBackground() {
  const menusReady = createQrMenus()
  void menusReady.catch((error) => console.error("创建右键菜单失败", error))

  chrome.storage.onChanged.addListener((changes, areaName) => {
    const options = changes.options
    if (areaName !== "local" || !options || options.oldValue?.userAgent === options.newValue?.userAgent) return
    const option = getUserAgentOption(mergeOptions(options.newValue).userAgent)
    void menusReady
      .then(() => chrome.contextMenus.update(userAgentMenuItemId(option.value), { checked: true }))
      .catch((error) => console.error("同步右键菜单 User-Agent 失败", error))
  })

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (handleElementCopyMenu(info, tab)) return
    const userAgent = USER_AGENT_OPTIONS.find((option) => userAgentMenuItemId(option.value) === info.menuItemId)
    if (userAgent) {
      if (!info.wasChecked) {
        void switchUserAgent(userAgent.value, tab?.id).catch((error) => console.error("右键切换 User-Agent 失败", error))
      }
      return
    }
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

function userAgentMenuItemId(value: UserAgentType) {
  return `${USER_AGENT_MENU_ID}-${value}`
}

async function switchUserAgent(userAgent: UserAgentType, tabId?: number) {
  const { options } = await chrome.storage.local.get("options")
  const currentOptions = mergeOptions(options)
  try {
    await applyUserAgentRule(userAgent)
    await chrome.storage.local.set({ options: { ...currentOptions, userAgent } })
  } catch (error) {
    const current = getUserAgentOption(currentOptions.userAgent)
    await chrome.contextMenus.update(userAgentMenuItemId(current.value), { checked: true })
    throw error
  }
  if (currentOptions.reloadOnUserAgentChange && tabId !== undefined) await chrome.tabs.reload(tabId)
}

async function createQrMenus() {
  const { options } = await chrome.storage.local.get("options")
  const currentUserAgent = getUserAgentOption(mergeOptions(options).userAgent)
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({ id: QR_MENU_PARENT_ID, title: "chrome ninja", contexts: ["all"] })
  createElementCopyMenus(QR_MENU_PARENT_ID)
  chrome.contextMenus.create({
    id: QR_MENU_GENERATE_ID,
    parentId: QR_MENU_PARENT_ID,
    title: "生成二维码（当前页面链接）",
    contexts: ["all"]
  })
  chrome.contextMenus.create({
    id: NETMON_MENU_TOGGLE_ID,
    parentId: QR_MENU_PARENT_ID,
    title: "开启／关闭网络监视器",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  })
  chrome.contextMenus.create({
    id: USER_AGENT_MENU_ID,
    parentId: QR_MENU_PARENT_ID,
    title: "Switch User-Agent",
    contexts: ["all"]
  })
  for (const option of USER_AGENT_OPTIONS) {
    chrome.contextMenus.create({
      id: userAgentMenuItemId(option.value),
      parentId: USER_AGENT_MENU_ID,
      title: option.label,
      type: "radio",
      checked: option.value === currentUserAgent.value,
      contexts: ["all"]
    })
  }
  ninjaLog("qr menu ready")
}
