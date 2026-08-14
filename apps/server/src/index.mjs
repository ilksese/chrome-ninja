import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"

const host = process.env.HOST || "127.0.0.1"
const port = Number(process.env.PORT || 8787)
const certPath = process.env.CHROME_NINJA_DEBUG_CERT
const keyPath = process.env.CHROME_NINJA_DEBUG_KEY
const clients = new Set()

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>chrome ninja debug</title>
    <style>
      body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      main { max-width: 960px; margin: 0 auto; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      pre { min-height: 70vh; margin: 0; overflow: auto; border: 1px solid #334155; border-radius: 8px; padding: 16px; background: #020617; }
      .muted { color: #94a3b8; }
    </style>
  </head>
  <body>
    <main>
      <h1>chrome ninja debug <span class="muted" id="state">connecting</span></h1>
      <pre id="log"></pre>
    </main>
    <script>
      const log = document.querySelector('#log')
      const state = document.querySelector('#state')
      const socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host)
      socket.addEventListener('open', () => state.textContent = 'connected')
      socket.addEventListener('close', () => state.textContent = 'closed')
      socket.addEventListener('message', (event) => {
        log.textContent += event.data + '\\n'
        log.scrollTop = log.scrollHeight
      })
    </script>
  </body>
</html>`

const server = createServer()
server.on("upgrade", handleUpgrade)
server.listen(port, host, () => {
  const protocol = server instanceof https.Server ? "https" : "http"
  const socketProtocol = server instanceof https.Server ? "wss" : "ws"
  console.log(`debug page: ${protocol}://${host}:${port}`)
  console.log(`popup socket: ${socketProtocol}://${host}:${port}`)
})

function createServer() {
  const handler = (request, response) => {
    if (request.url === "/health") {
      const socketProtocol = server instanceof https.Server ? "wss" : "ws"
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" })
      response.end(JSON.stringify({ ok: true, webSocketUrl: `${socketProtocol}://${host}:${port}` }))
      return
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
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

  clients.add(socket)
  socket.on("data", (chunk) => {
    const message = readFrame(chunk)
    if (message) {
      const line = JSON.stringify({ time: new Date().toISOString(), message })
      console.log(line)
      broadcast(line)
    }
  })
  socket.on("close", () => clients.delete(socket))
  socket.on("error", () => clients.delete(socket))
}

function readFrame(buffer) {
  if (buffer.length < 6) return ""
  const opcode = buffer[0] & 0x0f
  if (opcode === 0x8) return ""

  let offset = 2
  let length = buffer[1] & 0x7f
  if (length === 126) {
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset))
    offset += 8
  }

  const masked = Boolean(buffer[1] & 0x80)
  const mask = masked ? buffer.subarray(offset, offset + 4) : undefined
  offset += masked ? 4 : 0
  const payload = buffer.subarray(offset, offset + length)
  if (!masked) return payload.toString("utf8")

  const decoded = Buffer.allocUnsafe(payload.length)
  for (let index = 0; index < payload.length; index += 1) {
    decoded[index] = payload[index] ^ mask[index % 4]
  }
  return decoded.toString("utf8")
}

function broadcast(message) {
  const frame = writeFrame(message)
  for (const client of clients) {
    client.write(frame)
  }
}

function writeFrame(message) {
  const payload = Buffer.from(message)
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
  }

  const header = Buffer.allocUnsafe(4)
  header[0] = 0x81
  header[1] = 126
  header.writeUInt16BE(payload.length, 2)
  return Buffer.concat([header, payload])
}
