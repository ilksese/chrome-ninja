import crypto from "node:crypto"
import http from "node:http"
import { parsePageControlBody } from "./actions.mjs"

const actionTimeoutMs = 8000
const maxBodyBytes = 8 * 1024

export function startPageControlServer({ host = "127.0.0.1", port = 8788 } = {}) {
  /** @type {ExtensionClient | undefined} */
  let extensionClient
  /** @type {Map<string, PendingScroll>} */
  const pendingScrolls = new Map()

  const server = http.createServer((request, response) => {
    void handleRequest(request, response)
  })
  server.on("upgrade", handleUpgrade)

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.off("error", reject)
      const address = server.address()
      resolve({
        host,
        port: typeof address === "object" && address ? address.port : port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            extensionClient?.socket.destroy()
            rejectPending("页面控制服务已关闭")
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          })
      })
    })
  })

  async function handleRequest(request, response) {
    const url = new URL(request.url || "/", `http://${host}:${port}`)
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "@chrome-ninja/page-control",
          connected: Boolean(extensionClient)
        })
        return
      }

      if (request.method === "POST" && url.pathname === "/page-control") {
        await handlePageControl(request, response)
        return
      }

      sendJson(response, 404, { ok: false, error: "Not found" })
    } catch (error) {
      sendJson(response, statusOf(error), { ok: false, error: messageOf(error) })
    }
  }

  async function handlePageControl(request, response) {
    const parsed = parsePageControlBody(parseJson(await readBody(request)))
    if (!parsed.ok) {
      sendJson(response, 400, parsed)
      return
    }
    if (!extensionClient) {
      sendJson(response, 503, { ok: false, error: "页面控制服务没有连接到扩展" })
      return
    }

    const snapshots = []
    const tabLists = []
    for (const [index, action] of parsed.actions.entries()) {
      const result = await requestAction(extensionClient, action)
      if (!result.ok) {
        sendJson(response, 422, { ok: false, index, error: result.error })
        return
      }
      if (result.snapshot) snapshots.push(result.snapshot)
      if (result.tabs) tabLists.push(result.tabs)
    }
    const body = { ok: true }
    if (snapshots.length === 1) body.snapshot = snapshots[0]
    if (snapshots.length > 1) body.snapshots = snapshots
    if (tabLists.length === 1) body.tabs = tabLists[0]
    if (tabLists.length > 1) body.tabLists = tabLists
    sendJson(response, 200, body)
  }

  function requestAction(client, action) {
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingScrolls.delete(requestId)
        reject(httpError(504, "扩展没有在时限内完成操作"))
      }, actionTimeoutMs)
      pendingScrolls.set(requestId, { resolve, reject, timeout })
      client.socket.write(writeFrame(JSON.stringify({ type: "page-control:action", requestId, action })))
    })
  }

  function handleUpgrade(request, socket) {
    const key = request.headers["sec-websocket-key"]
    if (!key) {
      socket.destroy()
      return
    }

    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64")
    socket.write(
      ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join(
        "\r\n"
      )
    )

    extensionClient?.socket.destroy()
    rejectPending("扩展连接已更换")
    const client = { socket, buffer: Buffer.alloc(0) }
    extensionClient = client
    socket.setNoDelay(true)
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
        length = Number(client.buffer.readBigUInt64BE(offset))
        offset += 8
      }

      const maskOffset = offset
      offset += masked ? 4 : 0
      if (client.buffer.length < offset + length) return

      const payload = client.buffer.subarray(offset, offset + length)
      const mask = masked ? client.buffer.subarray(maskOffset, maskOffset + 4) : undefined
      client.buffer = client.buffer.subarray(offset + length)
      handleFrame(client, opcode, mask ? unmask(payload, mask) : payload, Boolean(firstByte & 0x80))
    }
  }

  function handleFrame(client, opcode, payload, fin) {
    if (opcode === 0x8) {
      client.socket.end(writeFrame("", 0x8))
      removeClient(client)
      return
    }
    if (opcode === 0x9) {
      client.socket.write(writeFrame(payload, 0xa))
      return
    }
    if (opcode === 0x0) {
      if (!client.fragment) return
      client.fragment = Buffer.concat([client.fragment, payload])
      if (fin) finishText(client, client.fragment)
      return
    }
    if (opcode !== 0x1) return
    if (!fin) {
      client.fragment = payload
      return
    }
    finishText(client, payload)
  }

  function finishText(client, payload) {
    client.fragment = undefined

    let message
    try {
      message = JSON.parse(payload.toString("utf8"))
    } catch {
      return
    }
    if (message.type !== "page-control:action-result" || typeof message.requestId !== "string") return
    const pending = pendingScrolls.get(message.requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    pendingScrolls.delete(message.requestId)
    pending.resolve({
      ok: message.ok === true,
      error: message.ok === true ? undefined : typeof message.error === "string" ? message.error : "页面操作失败",
      snapshot: message.snapshot,
      tabs: Array.isArray(message.tabs) ? message.tabs : undefined
    })
  }

  function removeClient(client) {
    if (extensionClient !== client) return
    extensionClient = undefined
    rejectPending("页面控制服务没有连接到扩展")
  }

  function rejectPending(message) {
    for (const [requestId, pending] of pendingScrolls) {
      clearTimeout(pending.timeout)
      pendingScrolls.delete(requestId)
      pending.reject(httpError(503, message))
    }
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    throw httpError(400, "无效的 JSON")
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on("data", (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(httpError(413, "请求正文过大"))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", () => reject(httpError(400, "无法读取请求正文")))
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

function unmask(payload, mask) {
  const decoded = Buffer.allocUnsafe(payload.length)
  for (let index = 0; index < payload.length; index += 1) decoded[index] = payload[index] ^ mask[index % 4]
  return decoded
}

function writeFrame(message, opcode = 0x1) {
  const payload = Buffer.isBuffer(message) ? message : Buffer.from(message)
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload])
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

function statusOf(error) {
  return typeof error?.status === "number" ? error.status : 400
}

function messageOf(error) {
  return error instanceof Error ? error.message : "请求无效"
}
