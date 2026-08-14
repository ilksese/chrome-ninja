const DEBUG_HEALTH_URLS = ["https://127.0.0.1:8787/health", "http://127.0.0.1:8787/health"]

export function connectDebugSocket() {
  if (typeof WebSocket === "undefined") return

  void resolveDebugUrl().then((url) => {
    if (url) connect(url)
  })
}

function connect(url: string) {
  const socket = new WebSocket(url)
  let opened = false

  socket.addEventListener("open", () => {
    opened = true
    sendDebugEvent(socket, "popup:open")
    bindStyleTelemetry(socket)
  })
  socket.addEventListener("close", () => {
    if (opened) {
      window.setTimeout(() => connect(url), 1000)
    }
  })
}

async function resolveDebugUrl() {
  for (const healthUrl of DEBUG_HEALTH_URLS) {
    try {
      const response = await fetch(healthUrl)
      if (!response.ok) continue
      const body = (await response.json()) as { webSocketUrl?: string }
      if (body.webSocketUrl) return body.webSocketUrl
    } catch {
      // Local debug server is optional.
    }
  }

  return ""
}

function sendDebugEvent(socket: WebSocket, event: string) {
  const root = document.querySelector("#root")
  const navs = [...document.querySelectorAll("nav")]
  const buttons = [...document.querySelectorAll("button")]

  socket.send(
    JSON.stringify({
      event,
      href: location.href,
      root: root ? getBox(root) : undefined,
      navCount: navs.length,
      navs: navs.map(getBox),
      buttons: buttons.map((button) => ({ text: button.innerText, ...getBox(button) })),
      scrollHeight: root?.scrollHeight,
      clientHeight: root?.clientHeight,
      text: document.body.innerText.slice(0, 500)
    })
  )
}

function bindStyleTelemetry(socket: WebSocket) {
  let timer = 0
  const schedule = (event: string) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => sendDebugEvent(socket, event), 80)
  }

  document.addEventListener("click", () => schedule("popup:click"), { passive: true })
  window.addEventListener("resize", () => schedule("popup:resize"), { passive: true })

  const observer = new MutationObserver(() => schedule("popup:mutation"))
  observer.observe(document.body, { childList: true, subtree: true, attributes: true })
}

function getBox(element: Element) {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}
