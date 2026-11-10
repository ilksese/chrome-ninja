import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve("vite"))("esbuild")
const htmlNamespace = "http://www.w3.org/1999/xhtml"
let checks = 0
const check = (actual, expected) => {
  assert.deepEqual(actual, expected)
  checks++
}

// 无浏览器自检仅模拟本功能依赖的 DOM 接口，不替代真实剪贴板与原生右键菜单验收。
class Element {
  constructor(name, namespace = htmlNamespace) {
    this.localName = name
    this.namespaceURI = namespace
    this.ownerDocument = document
    this.parentElement = null
    this.childNodes = []
    this.isConnected = true
    this.style = {}
    this.attributes = ""
    this.text = ""
    this.display = "block"
    this.visibility = "visible"
  }
  getRootNode() {
    return this.root || this.parentElement?.getRootNode() || this.ownerDocument
  }
  get previousElementSibling() {
    const siblings = this.parentElement?.childNodes.filter((node) => node instanceof Element) || []
    return siblings[siblings.indexOf(this) - 1] || null
  }
  get outerHTML() {
    return `<${this.localName}${this.attributes}>${this.text}${this.childNodes.map((node) => node.outerHTML || node.textContent).join("")}</${this.localName}>`
  }
  append(...nodes) {
    nodes.forEach((node) => {
      node.parentElement = this
      this.childNodes.push(node)
    })
  }
  cloneNode(deep) {
    check(deep, false)
    const clone = new Element(this.localName, this.namespaceURI)
    clone.attributes = this.attributes
    return clone
  }
  setAttribute() {}
  attachShadow() {
    return { append() {} }
  }
  remove() {
    this.parentElement?.childNodes.splice(this.parentElement.childNodes.indexOf(this), 1)
  }
}
class HTMLElement extends Element {
  get innerText() {
    return this.text
  }
  select() {
    document.activeElement = this
  }
  focus() {
    document.activeElement = this
  }
}
class HTMLInputElement extends HTMLElement {}
class HTMLTextAreaElement extends HTMLElement {}
const listeners = new Map()
const document = {
  activeElement: null,
  createElement: (name) => (name === "textarea" ? new HTMLTextAreaElement(name) : new HTMLElement(name)),
  querySelector: () => null,
  execCommand: () => true
}
document.documentElement = new HTMLElement("html")
const window = {
  addEventListener: (type, listener) => listeners.set(type, listener),
  removeEventListener: (type) => listeners.delete(type),
  getSelection: () => null,
  setTimeout: () => 0
}
let onMessage
const chrome = {
  runtime: {
    id: "self",
    onMessage: {
      addListener: (listener) => {
        onMessage = listener
      }
    }
  }
}
const writes = []
const navigator = {
  clipboard: {
    writeText: async (text) => {
      writes.push(text)
    }
  }
}
const globals = {
  document,
  window,
  Element,
  HTMLElement,
  HTMLInputElement,
  HTMLTextAreaElement,
  Node: { TEXT_NODE: 3 },
  navigator,
  chrome,
  getComputedStyle: (element) => ({ display: element.display, visibility: element.visibility })
}
async function load(file, extra = {}) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/${file}`, import.meta.url))],
    bundle: true,
    write: false,
    platform: "browser",
    format: "cjs",
    target: "chrome120",
    plugins: [{
      name: "content-ui-test-boundary",
      setup(plugin) {
        // Toast DOM 与生命周期由 content-ui.test.ts 验证，此脚本保留复制与注入协议断言。
        plugin.onLoad({ filter: /element-copy\/feedback\.ts$/ }, () => ({ contents: "export function showCopyToast() {}" }))
        plugin.onResolve({ filter: /\?script$/ }, () => ({ path: "feedback-loader", namespace: "script-entry" }))
        plugin.onLoad({ filter: /.*/, namespace: "script-entry" }, () => ({ contents: 'export default "assets/feedback-entry-loader.js"' }))
      }
    }]
  })
  const module = { exports: {} }
  const context = vm.createContext({
    ...globals,
    ...extra,
    module,
    exports: module.exports,
    console: extra.console || console
  })
  vm.runInContext(result.outputFiles[0].text, context)
  return module.exports
}
const { extractElement } = await load("element-copy/extract.ts")
const body = new HTMLElement("body")
document.documentElement.append(body)
const first = new HTMLElement("div")
const section = new HTMLElement("section")
const second = new HTMLElement("div")
body.append(first, section, second)
const button = new HTMLElement("button")
button.attributes = ' class="buy"'
button.text = "购买 "
const icon = new HTMLElement("span")
icon.text = "¥99"
button.append(icon)
second.append(button)
check(extractElement(button, "outerHTML"), '<button class="buy">购买 <span>¥99</span></button>')
check(extractElement(button, "selfhost"), '<button class="buy"></button>')
check(extractElement(button, "innerText"), "购买 ")
check(extractElement(button, "xpath"), "/html[1]/body[1]/div[2]/button[1]")
check(extractElement(icon, "xpath"), "/html[1]/body[1]/div[2]/button[1]/span[1]")
check(button.childNodes.length, 1)
const svg = new Element("svg", "http://www.w3.org/2000/svg")
const path = new Element("path", svg.namespaceURI)
svg.append(path)
body.append(svg)
check(
  extractElement(path, "xpath"),
  "/html[1]/body[1]/*[local-name()='svg' and namespace-uri()='http://www.w3.org/2000/svg'][1]/*[local-name()='path' and namespace-uri()='http://www.w3.org/2000/svg'][1]"
)
const custom = new Element("item", `urn:a'b"c`)
body.append(custom)
check(
  extractElement(custom, "xpath"),
  `/html[1]/body[1]/*[local-name()='item' and namespace-uri()=concat('urn:a', "'", 'b"c')][1]`
)
const text = { nodeType: 3, textContent: "图中文字" }
svg.append(text)
check(extractElement(svg, "innerText"), "图中文字")
svg.display = "none"
assert.throws(() => extractElement(svg, "innerText"), /没有可复制/)
checks++
svg.display = "block"
icon.root = {}
assert.throws(() => extractElement(icon, "xpath"), /Shadow DOM/)
checks++
check(extractElement(icon, "outerHTML"), "<span>¥99</span>")
icon.root = null
const frameDocument = {}
const frameHtml = new HTMLElement("html")
frameHtml.ownerDocument = frameDocument
const frameButton = new HTMLElement("button")
frameButton.ownerDocument = frameDocument
frameHtml.append(frameButton)
check(extractElement(frameButton, "xpath"), "/html[1]/button[1]")
button.isConnected = false
assert.throws(() => extractElement(button, "outerHTML"), /已移除/)
checks++
button.isConnected = true

await load("element-copy/content.ts")
const select = (element) => listeners.get("contextmenu")({ isTrusted: true, composedPath: () => [element, body] })
const copy = (format) =>
  new Promise((resolve) => {
    const accepted = onMessage({ target: "element-copy", format }, { id: "self" }, resolve)
    assert.equal(accepted, true)
  })
check(
  onMessage({ target: "element-copy", format: "xpath" }, { id: "other" }, () => {}),
  false
)
check(
  onMessage({ target: "element-copy", format: "invalid" }, { id: "self" }, () => {}),
  false
)
check((await copy("outerHTML")).ok, false)
select(icon)
check((await copy("outerHTML")).ok, true)
check(writes.at(-1), "<span>¥99</span>")
listeners.get("contextmenu")({ isTrusted: false, composedPath: () => [button] })
await copy("outerHTML")
check(writes.at(-1), "<span>¥99</span>")
const before = writes.length
icon.text = "  "
check((await copy("innerText")).ok, false)
check(writes.length, before)
icon.root = {}
check((await copy("xpath")).ok, false)
check(writes.length, before)
icon.root = null
select(button)
navigator.clipboard.writeText = async () => {
  throw new Error("不支持 Clipboard API")
}
document.execCommand = (command) => {
  check(command, "copy")
  let prevented = false
  listeners.get("copy")({
    preventDefault: () => {
      prevented = true
    },
    stopImmediatePropagation() {},
    clipboardData: {
      setData: (type, value) => {
        check(type, "text/plain")
        writes.push(value)
      }
    }
  })
  check(prevented, true)
  return true
}
check((await copy("selfhost")).ok, true)
check(writes.at(-1), '<button class="buy"></button>')
check(listeners.has("copy"), false)
const beforeFailedCopy = writes.length
document.execCommand = () => false
check((await copy("outerHTML")).ok, false)
check(writes.length, beforeFailedCopy)
check(listeners.has("copy"), false)
document.execCommand = () => {
  throw new Error("复制被拒绝")
}
check((await copy("outerHTML")).ok, false)
check(writes.length, beforeFailedCopy)
check(listeners.has("copy"), false)
button.isConnected = false
check((await copy("selfhost")).ok, false)
check(writes.length, beforeFailedCopy)
button.isConnected = true
listeners.get("pagehide")()
check((await copy("xpath")).ok, false)

const menus = []
const sent = []
const injected = []
let rejectMessage = false
const background = await load("element-copy/background.ts", {
  chrome: {
    contextMenus: { create: (menu) => menus.push(menu) },
    tabs: {
      sendMessage: async (...args) => {
        sent.push(args)
        if (rejectMessage) throw new Error("无法访问")
      }
    },
    scripting: {
      executeScript: async (args) => {
        injected.push(args)
      }
    }
  },
  console: { error() {} }
})
background.createElementCopyMenus("chrome-ninja")
check(menus.length, 5)
check(menus[0].parentId, "chrome-ninja")
check(JSON.stringify(menus[0].contexts), '["all"]')
for (const format of ["outerHTML", "innerText", "selfhost", "xpath"]) {
  check(
    background.handleElementCopyMenu({ menuItemId: `chrome-ninja-copy-element-${format}`, frameId: 7 }, { id: 42 }),
    true
  )
  check(JSON.stringify(sent.at(-1)), JSON.stringify([42, { target: "element-copy", format }, { frameId: 7 }]))
}
check(background.handleElementCopyMenu({ menuItemId: "unrelated" }, { id: 42 }), false)
background.handleElementCopyMenu({ menuItemId: "chrome-ninja-copy-element-xpath" }, { id: 42 })
check(sent.at(-1)[2].frameId, 0)
rejectMessage = true
background.handleElementCopyMenu({ menuItemId: "chrome-ninja-copy-element-xpath", frameId: 9 }, { id: 42 })
await new Promise((resolve) => setImmediate(resolve))
check(JSON.stringify(injected[0].target), '{"tabId":42,"frameIds":[9]}')
check(JSON.stringify(injected[0].files), '["assets/feedback-entry-loader.js"]')
console.log(`通过 ${checks} 项元素复制断言（DOM 与 Chrome API 模拟，无浏览器）`)
