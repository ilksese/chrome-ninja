import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"

const host = process.env.HOST || "127.0.0.1"
const port = Number(process.env.PORT || 8787)
const certPath = process.env.CHROME_NINJA_HMR_CERT || process.env.CHROME_NINJA_DEBUG_CERT
const keyPath = process.env.CHROME_NINJA_HMR_KEY || process.env.CHROME_NINJA_DEBUG_KEY
const service = "@chrome-ninja/hmr"
const version = process.env.npm_package_version || "0.1.0"
const startTime = Date.now()
const executeTimeoutMs = Number(process.env.CHROME_NINJA_HMR_EXECUTE_TIMEOUT_MS || 15000)
const inactiveTimeoutMs = 60000
const pingIntervalMs = 15000
const maxBodyBytes = 5 * 1024 * 1024
const features = ["heartbeat", "health", "execute-js", "reload-extension", "reload-client", "reload-tabs"]
const webSocketClients = new Set()
const pendingExecutes = new Map()
let backgroundSequence = 0

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>chrome ninja hmr</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; background: #f7f4ed; color: #1f2933; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      main { display: grid; gap: 16px; max-width: 980px; margin: 0 auto; padding: 24px; }
      h1 { font-size: 18px; margin: 0; }
      form { display: grid; gap: 10px; padding: 14px; border: 1px solid #d8d0c2; border-radius: 8px; background: #fffaf1; }
      label { display: grid; gap: 5px; font-size: 12px; color: #52616f; }
      select, input, textarea, button { font: inherit; }
      select, input, textarea { border: 1px solid #c7bdad; border-radius: 6px; padding: 8px; background: #fffefb; color: #1f2933; }
      textarea { min-height: 120px; resize: vertical; }
      button { width: fit-content; border: 0; border-radius: 6px; padding: 9px 12px; background: #0f766e; color: white; cursor: pointer; }
      pre { min-height: 260px; max-height: 52vh; margin: 0; overflow: auto; border: 1px solid #d8d0c2; border-radius: 8px; padding: 14px; background: #111827; color: #e5e7eb; }
      .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .muted { color: #6b7280; }
      @media (max-width: 720px) { .row { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>chrome ninja hmr <span class="muted" id="state">connecting</span></h1>
      <form id="execute-form">
        <div class="row">
          <label>target
            <select id="target">
              <option value="popup">popup</option>
              <option value="page">page</option>
              <option value="content">content</option>
              <option value="options">options</option>
            </select>
          </label>
          <label>tabId
            <input id="tab-id" inputmode="numeric" placeholder="active tab" />
          </label>
          <label>allFrames
            <select id="all-frames">
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </label>
        </div>
        <label>code
          <textarea id="code">document.title</textarea>
        </label>
        <button type="submit">execute</button>
      </form>
      <pre id="log"></pre>
    </main>
    <script>
      const log = document.querySelector('#log')
      const state = document.querySelector('#state')
      const form = document.querySelector('#execute-form')
      const target = document.querySelector('#target')
      const tabId = document.querySelector('#tab-id')
      const allFrames = document.querySelector('#all-frames')
      const code = document.querySelector('#code')
      const socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host)
      socket.addEventListener('open', () => state.textContent = 'connected')
      socket.addEventListener('close', () => state.textContent = 'closed')
      socket.addEventListener('message', (event) => {
        append(event.data)
      })
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const tabIdValue = tabId.value.trim()
        const numericTabId = Number(tabIdValue)
        const payload = {
          target: target.value,
          code: code.value,
          tabId: tabIdValue && Number.isInteger(numericTabId) ? numericTabId : undefined,
          allFrames: allFrames.value === 'true'
        }
        const response = await fetch('/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
        append(JSON.stringify({ status: response.status, body: await response.json() }))
      })
      async function refreshHealth() {
        const response = await fetch('/health')
        append(JSON.stringify(await response.json()))
      }
      function append(line) {
        log.textContent += line + '\\n'
        log.scrollTop = log.scrollHeight
      }
      refreshHealth().catch(() => {})
      setInterval(() => refreshHealth().catch(() => {}), 5000)
    </script>
  </body>
</html>`

const server = createServer()
server.on("upgrade", handleUpgrade)
server.listen(port, host, () => {
  const protocol = server instanceof https.Server ? "https" : "http"
  const socketProtocol = server instanceof https.Server ? "wss" : "ws"
  console.log(`hmr page: ${protocol}://${host}:${port}`)
  console.log(`hmr socket: ${socketProtocol}://${host}:${port}`)
})
setInterval(pingBackgrounds, pingIntervalMs)

function createServer() {
  const handler = async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`)

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders())
      response.end()
      return
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, getHealth())
      return
    }

    if (request.method === "POST" && url.pathname === "/execute") {
      await handleExecute(request, response)
      return
    }

		if (request.method === "POST" && url.pathname === "/reload") {
			await handleReload(request, response)
			return
		}

    if (request.method !== "GET" || url.pathname !== "/") {
      sendJson(response, 404, { ok: false, error: "Not found" })
      return
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...corsHeaders() })
    response.end(page)
  }

  if (certPath && keyPath) {
    return https.createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      },
      handler
    )
  }

  return http.createServer(handler)
}

async function handleExecute(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const status = error.status || 400
    sendJson(response, status, { ok: false, error: error.message || "Invalid JSON" })
    return
  }

  const validationError = validateExecuteBody(body)
  if (validationError) {
    sendJson(response, 400, { ok: false, error: validationError })
    return
  }

  const background = getLatestBackground()
  if (!background) {
    sendJson(response, 503, { ok: false, error: "No background client connected" })
    return
  }

  try {
    const result = await executeInBackground(background, body)
    sendJson(response, 200, result)
  } catch (error) {
    sendJson(response, error.status || 500, { ok: false, error: error.message || "Execution failed" })
  }
}

async function handleReload(request, response) {
	let body
	try {
		body = await readJsonBody(request)
	} catch (error) {
		const status = error.status || 400
		sendJson(response, status, { ok: false, error: error.message || "Invalid JSON" })
		return
	}

	const reload = createReloadMessage(body)
	if (reload.error) {
		sendJson(response, 400, { ok: false, error: reload.error })
		return
	}

	const background = getLatestBackground()
	if (!background) {
		sendJson(response, 503, { ok: false, error: "No background client connected" })
		return
	}

	if (!sendMessage(background, reload.message)) {
		sendJson(response, 503, { ok: false, error: "Background client disconnected" })
		return
	}

	logEvent("reload", reload.log)
	sendJson(response, 200, { ok: true, ...reload.log })
}

function createReloadMessage(body) {
	const target = body?.target || "extension"
	const reason = typeof body?.reason === "string" ? body.reason : "build"

	if (target === "extension") {
		return {
			message: { type: "hmr:reload-extension", reason },
			log: { target, reason }
		}
	}

	if (target === "clients") {
		const scopes = normalizeStringArray(body?.scopes)
		if (body?.scopes !== undefined && scopes.length === 0) return { error: "scopes must be an array containing popup, options, or content" }
		if (scopes.some((scope) => !["popup", "options", "content"].includes(scope))) return { error: "scopes must contain only popup, options, or content" }

		return {
			message: { type: "hmr:reload-client", scopes, reason },
			log: { target, scopes, reason }
		}
	}

	if (target === "tabs") {
		const matches = normalizeStringArray(body?.matches)
		if (body?.matches !== undefined && matches.length === 0) return { error: "matches must be an array of Chrome match patterns" }

		return {
			message: { type: "hmr:reload-tabs", matches, reason },
			log: { target, matches, reason }
		}
	}

	return { error: "target must be extension, clients, or tabs" }
}

function normalizeStringArray(value) {
	if (value === undefined) return []
	if (!Array.isArray(value)) return []
	return value.filter((item) => typeof item === "string" && item.length > 0)
}

function handleUpgrade(request, socket) {
  const key = request.headers["sec-websocket-key"]
  if (!key) {
    socket.destroy()
    return
  }

  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"))

  const client = {
    socket,
    role: "debug",
    buffer: Buffer.alloc(0),
    clients: emptyClientStats(),
    connectedAt: Date.now(),
    lastActive: Date.now(),
    sequence: 0
  }

  webSocketClients.add(client)
  socket.on("data", (chunk) => readFrames(client, chunk))
  socket.on("close", () => removeClient(client))
  socket.on("error", () => removeClient(client))
}

function readFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk])

  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0]
    const secondByte = client.buffer[1]
    const opcode = firstByte & 0x0f
    const masked = Boolean(secondByte & 0x80)
    let offset = 2
    let length = secondByte & 0x7f

    if (length === 126) {
      if (client.buffer.length < offset + 2) return
      length = client.buffer.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return
      const bigLength = client.buffer.readBigUInt64BE(offset)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        client.socket.destroy()
        return
      }
      length = Number(bigLength)
      offset += 8
    }

    const maskOffset = offset
    offset += masked ? 4 : 0
    if (client.buffer.length < offset + length) return

    const mask = masked ? client.buffer.subarray(maskOffset, maskOffset + 4) : undefined
    const payload = client.buffer.subarray(offset, offset + length)
    client.buffer = client.buffer.subarray(offset + length)
    handleFrame(client, opcode, masked ? unmask(payload, mask) : payload)
  }
}

function handleFrame(client, opcode, payload) {
  client.lastActive = Date.now()

  if (opcode === 0x8) {
    client.socket.end(writeFrame("", 0x8))
    return
  }

  if (opcode === 0x9) {
    client.socket.write(writeFrame(payload, 0xA))
    return
  }

  if (opcode === 0xA) return
  if (opcode !== 0x1) return

  let message
  try {
    message = JSON.parse(payload.toString("utf8"))
  } catch {
    logEvent("invalid-json", { size: payload.length })
    return
  }

  handleSocketMessage(client, message)
}

function handleSocketMessage(client, message) {
  switch (message.type) {
    case "hmr:hello":
      client.role = "background"
      client.sequence = ++backgroundSequence
      updateReportedClients(client, message.clients)
      logEvent("background:hello", { clients: client.clients })
      break
    case "hmr:heartbeat":
      updateReportedClients(client, message.clients)
      break
    case "hmr:pong":
      updateReportedClients(client, message.clients)
      break
    case "hmr:execute-js:result":
      completeExecute(message)
      logEvent("execute:result", { requestId: message.requestId, ok: Boolean(message.ok), target: message.target })
      break
    default:
      logEvent("message", { type: message.type || "unknown" })
  }
}

function executeInBackground(background, payload) {
  const requestId = crypto.randomUUID()
  const message = {
    type: "hmr:execute-js",
    requestId,
    target: payload.target,
    code: payload.code,
    tabId: payload.tabId,
    allFrames: payload.allFrames
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingExecutes.delete(requestId)
      reject(httpError(504, "Timed out waiting for execute-js result"))
    }, executeTimeoutMs)

    pendingExecutes.set(requestId, { resolve, reject, timer, socket: background.socket })

    if (!sendMessage(background, message)) {
      clearTimeout(timer)
      pendingExecutes.delete(requestId)
      reject(httpError(503, "Background client disconnected"))
    }
  })
}

function completeExecute(message) {
  const pending = pendingExecutes.get(message.requestId)
  if (!pending) return

  clearTimeout(pending.timer)
  pendingExecutes.delete(message.requestId)
  pending.resolve({
    ok: Boolean(message.ok),
    requestId: message.requestId,
    target: message.target,
    result: message.result,
    error: message.error
  })
}

function pingBackgrounds() {
  const now = Date.now()
  for (const client of webSocketClients) {
    if (client.role !== "background") continue
    if (now - client.lastActive > inactiveTimeoutMs) {
      logEvent("background:timeout", { lastActiveMs: now - client.lastActive })
      client.socket.destroy()
      continue
    }
    sendMessage(client, { type: "hmr:ping", sentAt: now })
  }
}

function removeClient(client) {
  if (!webSocketClients.delete(client)) return

  for (const [requestId, pending] of pendingExecutes) {
    if (pending.socket !== client.socket) continue
    clearTimeout(pending.timer)
    pendingExecutes.delete(requestId)
    pending.reject(httpError(503, "Background client disconnected"))
  }

  if (client.role === "background") {
    logEvent("background:disconnect", { clients: getClientStats() })
  }
}

function getLatestBackground() {
  let latest
  for (const client of webSocketClients) {
    if (client.role !== "background" || client.socket.destroyed) continue
    if (!latest || client.sequence > latest.sequence) latest = client
  }
  return latest
}

function updateReportedClients(client, reported) {
  const next = emptyClientStats()
  if (reported && typeof reported === "object") {
    next.popup = normalizeCount(reported.popup)
    next.content = normalizeCount(reported.content)
    next.options = normalizeCount(reported.options)
  }
  client.clients = next
}

function getHealth() {
  const socketProtocol = server instanceof https.Server ? "wss" : "ws"
  return {
    ok: true,
    service,
    version,
    uptimeMs: Date.now() - startTime,
    webSocketUrl: `${socketProtocol}://${host}:${port}`,
    features,
    clients: getClientStats()
  }
}

function getClientStats() {
  const stats = emptyClientStats()

  for (const client of webSocketClients) {
    if (client.role !== "background") continue
    stats.background += 1
    stats.popup += client.clients.popup
    stats.content += client.clients.content
    stats.options += client.clients.options
  }

  return stats
}

function emptyClientStats() {
  return { background: 0, popup: 0, content: 0, options: 0 }
}

function normalizeCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

function validateExecuteBody(body) {
  if (!body || typeof body !== "object") return "Request body must be a JSON object"
  if (!["popup", "page", "content", "options"].includes(body.target)) return "target must be popup, page, content, or options"
  if (typeof body.code !== "string") return "code must be a string"
  if (body.tabId !== undefined && (!Number.isInteger(body.tabId) || body.tabId < 0)) return "tabId must be a positive integer"
  if (body.allFrames !== undefined && typeof body.allFrames !== "boolean") return "allFrames must be a boolean"
  return ""
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    let settled = false

    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
      if (Buffer.byteLength(body) > maxBodyBytes && !settled) {
        settled = true
        reject(httpError(413, "Request body too large"))
        request.destroy()
      }
    })
    request.on("end", () => {
      if (settled) return
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(httpError(400, "Invalid JSON"))
      }
    })
    request.on("error", (error) => {
      if (!settled) reject(error)
    })
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...corsHeaders() })
  response.end(JSON.stringify(body))
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  }
}

function sendMessage(client, message) {
  if (client.socket.destroyed) return false
  try {
    client.socket.write(writeFrame(JSON.stringify(message)))
    return true
  } catch {
    client.socket.destroy()
    return false
  }
}

function logEvent(event, details = {}) {
  const entry = { type: "hmr:log", time: new Date().toISOString(), event, ...details }
  const line = JSON.stringify(entry)
  console.log(line)
  const frame = writeFrame(line)

  for (const client of webSocketClients) {
    if (client.role === "background" || client.socket.destroyed) continue
    try {
      client.socket.write(frame)
    } catch {
      client.socket.destroy()
    }
  }
}

function unmask(payload, mask) {
  const decoded = Buffer.allocUnsafe(payload.length)
  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4]
  }
  return decoded
}

function writeFrame(message, opcode = 0x1) {
  const payload = Buffer.isBuffer(message) ? message : Buffer.from(message)
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload])
  }

  if (payload.length <= 0xffff) {
    const header = Buffer.allocUnsafe(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
    return Buffer.concat([header, payload])
  }

  const header = Buffer.allocUnsafe(10)
  header[0] = 0x80 | opcode
  header[1] = 127
  header.writeBigUInt64BE(BigInt(payload.length), 2)
  return Buffer.concat([header, payload])
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
