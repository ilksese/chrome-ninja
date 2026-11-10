import { extractElement } from "./extract"
import { showCopyToast } from "./feedback"
import { isElementCopyFormat } from "./types"

let target: Element | null = null

window.addEventListener(
  "contextmenu",
  (event) => {
    if (!event.isTrusted) return
    target = event.composedPath().find((node): node is Element => node instanceof Element) || null
  },
  true
)
window.addEventListener("pagehide", () => {
  target = null
})

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // shortcut: HTTP 页面仍依赖已弃用的选区复制；Chrome 移除此 API 时改用扩展文档复制。
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.readOnly = true
  textarea.style.cssText = "position: fixed; left: -9999px; top: 0; opacity: 0;"
  const activeElement = document.activeElement
  const selection = window.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : []
  const inputSelection =
    activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? {
          start: activeElement.selectionStart,
          end: activeElement.selectionEnd,
          direction: activeElement.selectionDirection
        }
      : null
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    event.clipboardData?.setData("text/plain", text)
  }
  try {
    document.documentElement.append(textarea)
    textarea.select()
    window.addEventListener("copy", onCopy, true)
    if (!document.execCommand("copy")) throw new Error("复制失败，请检查页面焦点或剪贴板权限后重试")
  } finally {
    window.removeEventListener("copy", onCopy, true)
    textarea.remove()
    if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true })
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
    if (
      inputSelection?.start != null &&
      inputSelection.end != null &&
      (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
    ) {
      activeElement.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction || undefined)
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "element-copy" || !isElementCopyFormat(message.format))
    return false

  void (async () => {
    try {
      if (!target) throw new Error("未找到右键目标，请重新右键选择元素")
      const text = extractElement(target, message.format)
      await writeClipboard(text)
      showCopyToast("已复制")
      sendResponse({ ok: true })
    } catch (error) {
      const text = error instanceof Error ? error.message : "复制失败，请重试"
      showCopyToast(text)
      sendResponse({ ok: false, error: text })
    }
  })()
  return true
})
