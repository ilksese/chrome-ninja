import type { ElementCopyFormat } from "./types"
import feedbackScript from "./feedback-entry.ts?script"
import { ELEMENT_COPY_FORMATS } from "./types"

const MENU_ID = "chrome-ninja-copy-element"

export function createElementCopyMenus(parentId: string) {
  chrome.contextMenus.create({
    id: MENU_ID,
    parentId,
    title: "复制元素",
    contexts: ["all"]
  })
  for (const { format, title } of ELEMENT_COPY_FORMATS) {
    chrome.contextMenus.create({ id: `${MENU_ID}-${format}`, parentId: MENU_ID, title, contexts: ["all"] })
  }
}

export function handleElementCopyMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): boolean {
  const entry = ELEMENT_COPY_FORMATS.find(({ format }) => info.menuItemId === `${MENU_ID}-${format}`)
  if (!entry) return false
  if (tab?.id != null) void copyElement(tab.id, info.frameId ?? 0, entry.format)
  return true
}

async function copyElement(tabId: number, frameId: number, format: ElementCopyFormat) {
  try {
    await chrome.tabs.sendMessage(tabId, { target: "element-copy", format }, { frameId })
  } catch (error) {
    console.error("右键复制元素失败", error)
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: [feedbackScript]
      })
    } catch (feedbackError) {
      console.error("无法在受限页面显示复制提示", feedbackError)
    }
  }
}
