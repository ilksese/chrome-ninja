import type { ElementCopyFormat } from "./types"

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`
}

function getXPath(element: Element): string {
  if (element.getRootNode() !== element.ownerDocument) {
    throw new Error("XPath 不支持定位 Shadow DOM 内的元素")
  }

  const segments: string[] = []
  for (let current: Element | null = element; current; current = current.parentElement) {
    let index = 1
    for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.localName === current.localName && sibling.namespaceURI === current.namespaceURI) index++
    }

    const name = current.localName
    const namespace = current.namespaceURI || ""
    const test =
      namespace === "http://www.w3.org/1999/xhtml" && /^[a-z][a-z0-9-]*$/.test(name)
        ? name
        : `*[local-name()=${xpathLiteral(name)} and namespace-uri()=${xpathLiteral(namespace)}]`
    segments.unshift(`${test}[${index}]`)
  }
  return `/${segments.join("/")}`
}

function getVisibleText(element: Element): string {
  if (element instanceof HTMLElement) return element.innerText
  const style = getComputedStyle(element)
  if (style.display === "none") return ""
  return Array.from(element.childNodes, (node) => {
    if (node instanceof Element) return getVisibleText(node)
    return node.nodeType === Node.TEXT_NODE && style.visibility === "visible" ? node.textContent || "" : ""
  }).join("")
}

export function extractElement(element: Element, format: ElementCopyFormat): string {
  if (!element.isConnected) throw new Error("目标元素已移除，请重新右键选择")

  switch (format) {
    case "outerHTML":
      return element.outerHTML
    case "selfhost":
      return (element.cloneNode(false) as Element).outerHTML
    case "innerText": {
      const text = getVisibleText(element)
      if (!text.trim()) throw new Error("该元素没有可复制的可见文本")
      return text
    }
    case "xpath":
      return getXPath(element)
  }
}
