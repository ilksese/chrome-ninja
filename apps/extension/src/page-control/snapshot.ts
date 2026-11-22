export type PageSnapshot = {
  url: string
  title: string
  truncated: boolean
  tree: SnapshotNode[]
  text: string
}

type SnapshotNode = {
  role: string
  name?: string
  url?: string
  value?: string
  level?: number
  disabled?: boolean
  checked?: boolean
  expanded?: boolean
  selected?: boolean
  children?: SnapshotNode[]
}

export function snapshotPage(): PageSnapshot {
  const maxNodes = 250
  let count = 0
  let truncated = false

  const clip = (value: string) => {
    const text = value.replace(/\s+/g, " ").trim()
    return text.length > 120 ? text.slice(0, 120) : text
  }

  const hidden = (element: Element) => {
    if (element.closest("[data-chrome-ninja-ui]")) return true
    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true
    const style = getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden") return true
    const rect = element.getBoundingClientRect()
    return rect.top < -2000 || rect.left < -2000
  }

  const roleOf = (element: Element) => {
    const explicit = element.getAttribute("role")
    if (explicit) return explicit
    const tag = element.tagName.toLowerCase()
    if (tag === "a" && element.hasAttribute("href")) return "link"
    if (tag === "button") return "button"
    if (/^h[1-6]$/.test(tag)) return "heading"
    if (tag === "img") return "image"
    if (tag === "nav") return "navigation"
    if (tag === "main") return "main"
    if (tag === "header") return "banner"
    if (tag === "footer") return "contentinfo"
    if (tag === "aside") return "complementary"
    if (tag === "form") return "form"
    if (tag === "ul" || tag === "ol") return "list"
    if (tag === "li") return "listitem"
    if (tag === "textarea") return "textbox"
    if (tag === "select") return "combobox"
    if (tag === "dialog") return "dialog"
    if (tag === "table") return "table"
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase()
      if (type === "hidden") return ""
      if (type === "checkbox") return "checkbox"
      if (type === "radio") return "radio"
      if (type === "button" || type === "submit" || type === "reset") return "button"
      if (type === "search") return "searchbox"
      return "textbox"
    }
    return ""
  }

  const nameOf = (element: Element, role: string) => {
    const labelledBy = element.getAttribute("aria-labelledby")
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
      if (text.trim()) return clip(text)
    }
    const ariaLabel = element.getAttribute("aria-label")
    if (ariaLabel) return clip(ariaLabel)
    if (element instanceof HTMLImageElement) return clip(element.alt || element.getAttribute("title") || "")
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return clip(element.labels?.[0]?.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "")
    }
    if (role === "link" || role === "button" || role === "heading" || role === "listitem") return clip(element.textContent || "")
    return ""
  }

  const statesOf = (element: Element, role: string) => {
    const states: Partial<SnapshotNode> = {}
    const controlDisabled =
      element instanceof HTMLInputElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    if (element.getAttribute("aria-disabled") === "true" || (controlDisabled && element.disabled)) states.disabled = true
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) states.checked = element.checked
    const expanded = element.getAttribute("aria-expanded")
    if (expanded === "true" || expanded === "false") states.expanded = expanded === "true"
    if (element.getAttribute("aria-selected") === "true") states.selected = true
    if (role === "heading") {
      const level = Number(element.getAttribute("aria-level") || element.tagName.slice(1))
      if (level) states.level = level
    }
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.type !== "password" && element.value) {
      states.value = clip(element.value)
    }
    return states
  }

  const walk = (element: Element): SnapshotNode[] => {
    if (count >= maxNodes) {
      truncated = true
      return []
    }
    if (hidden(element)) return []
    const role = roleOf(element)
    const children: SnapshotNode[] = []
    for (const child of element.children) children.push(...walk(child))
    if (!role) return children
    count += 1
    const node: SnapshotNode = { role, ...statesOf(element, role) }
    const name = nameOf(element, role)
    if (name) node.name = name
    if (role === "link" && element instanceof HTMLAnchorElement && element.href) node.url = element.href
    if (children.length && role !== "link" && role !== "button") node.children = children
    return [node]
  }

  const render = (nodes: SnapshotNode[], indent = 0): string =>
    nodes
      .map((node) => {
        const flags = [
          node.level ? `level=${node.level}` : "",
          node.disabled ? "disabled" : "",
          node.checked ? "checked" : "",
          node.expanded === true ? "expanded" : "",
          node.expanded === false ? "collapsed" : "",
          node.selected ? "selected" : ""
        ].filter(Boolean)
        const name = node.name ? ` "${node.name.replace(/"/g, '\\"')}"` : ""
        const value = node.value ? ` =${JSON.stringify(node.value)}` : ""
        const flag = flags.length ? ` [${flags.join(" ")}]` : ""
        const line = `${"  ".repeat(indent)}- ${node.role}${name}${value}${flag}`
        const url = node.url ? `\n${"  ".repeat(indent + 1)}- /url: ${node.url}` : ""
        const children = node.children?.length ? `\n${render(node.children, indent + 1)}` : ""
        return line + url + children
      })
      .join("\n")

  const tree: SnapshotNode[] = []
  for (const child of document.body?.children || []) tree.push(...walk(child))
  return { url: location.href, title: document.title, truncated, tree, text: render(tree) }
}
