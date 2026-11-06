const BASE_STYLES = `
:host { color-scheme: light; }
[data-chrome-ninja-root] {
  font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", Roboto, ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #101828;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
@layer base {
  *, ::before, ::after { box-sizing: border-box; }
  body, h1, h2, h3, p { margin: 0; }
  button, input, textarea, select { font: inherit; }
}
`

function createStyles(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet()
  // 不在页面注册 Tailwind 属性，也不复用宿主已注册的 --tw-* 名称。
  sheet.replaceSync(css.replace(/--tw-/g, "--chrome-ninja-tw-"))
  const defaults: string[] = []

  const collectProperties = (rules: CSSStyleSheet | CSSGroupingRule) => {
    for (let index = rules.cssRules.length - 1; index >= 0; index--) {
      const rule = rules.cssRules[index]
      if (rule instanceof CSSPropertyRule) {
        defaults.push(`${rule.name}: ${rule.initialValue || "initial"};`)
        rules.deleteRule(index)
      } else if (rule instanceof CSSGroupingRule) {
        collectProperties(rule)
      }
    }
  }

  collectProperties(sheet)
  // Shadow DOM 内无法依赖 @property；逐元素默认值模拟 inherits: false。
  const properties = `@layer properties { :host, *, ::before, ::after, ::backdrop { ${defaults.join("\n")} } }`
  const styles = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n")
  sheet.replaceSync(`${styles}\n${properties}\n${BASE_STYLES}`)
  return sheet
}

export function mountShadowPanel(tagName: string, hostAttribute: string, css = "") {
  const selector = `${tagName}[${hostAttribute}]`
  const existing = document.querySelector<HTMLElement>(selector)
  if (existing?.shadowRoot) {
    const container = existing.shadowRoot.querySelector<HTMLElement>("[data-chrome-ninja-root]")
    if (container) return { host: existing, container }
  }

  const host = document.createElement(tagName)
  host.setAttribute(hostAttribute, "")
  host.setAttribute("data-chrome-ninja-ui", "")
  host.style.cssText =
    "all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important;"
  const shadow = host.attachShadow({ mode: "open" })
  shadow.adoptedStyleSheets = [createStyles(css)]
  const container = document.createElement("div")
  container.setAttribute("data-chrome-ninja-root", "")
  shadow.appendChild(container)
  document.documentElement.appendChild(host)
  return { host, container }
}

export function isShadowPanelEvent(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof Element && node.hasAttribute("data-chrome-ninja-ui"))
}
