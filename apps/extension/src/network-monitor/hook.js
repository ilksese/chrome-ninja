;(function () {
  "use strict"

  const SOURCE = "chrome-ninja-netmon"
  const HOOK_FLAG = "__chromeNinjaNetmonHooked"
  if (window[HOOK_FLAG]) return
  window[HOOK_FLAG] = true

  const BODY_LIMIT = 1024 * 1024
  const BODY_READ_TIMEOUT = 2000
  const ERROR_LIMIT = 2000
  const FORM_ENTRY_LIMIT = 1000
  const xhrStates = new WeakMap()

  function id() {
    return Math.random().toString(36).slice(2)
  }

  function absoluteUrl(value) {
    const raw = String(value)
    try {
      return new URL(raw, document.baseURI || window.location.href).href
    } catch {
      return raw
    }
  }

  function postEvent(request, result) {
    try {
      window.postMessage(JSON.stringify({ source: SOURCE, type: "event", ...request, ...result }), "*")
    } catch {
      // 采集失败不能影响页面请求。
    }
  }

  function normalizeHeaders(headers) {
    try {
      return [...new Headers(headers).entries()].map(([name, value]) => ({ name, value }))
    } catch {
      return []
    }
  }

  function keepBodyText(text, truncated = false) {
    const value = String(text)
    const kept = value.slice(0, BODY_LIMIT)
    truncated = truncated || kept.length < value.length
    let mode = "raw"
    if (!truncated) {
      try {
        JSON.parse(kept)
        mode = "json"
      } catch {
        // 非 JSON 正文保留原文。
      }
    }
    return { mode, text: kept, truncated }
  }

  function unavailable(description) {
    return { kind: "unavailable", description }
  }

  function snapshotEntries(form) {
    const entries = []
    let size = 0
    let truncated = false
    for (const [name, value] of form.entries()) {
      if (entries.length >= FORM_ENTRY_LIMIT || size + name.length > BODY_LIMIT) {
        truncated = true
        break
      }
      size += name.length
      if (typeof value === "string") {
        const kept = value.slice(0, BODY_LIMIT - size)
        entries.push({ name, value: kept })
        size += kept.length
        if (kept.length < value.length) {
          truncated = true
          break
        }
      } else {
        entries.push({ name, file: { name: value.name, type: value.type, size: value.size } })
        size += value.name.length + value.type.length
      }
    }
    return { entries, truncated }
  }

  function snapshotBody(body) {
    if (body == null) return null
    if (typeof body === "string") return { kind: "text", ...keepBodyText(body) }
    if (body instanceof URLSearchParams) {
      const text = keepBodyText(body.toString())
      const { entries, truncated } = snapshotEntries(body)
      return { kind: "urlencoded", text: text.text, entries, truncated: text.truncated || truncated }
    }
    if (body instanceof FormData) return { kind: "formdata", ...snapshotEntries(body) }
    if (body instanceof Blob) {
      return unavailable(`二进制正文：${body.type || "未知类型"}，${body.size} 字节；未读取文件内容`)
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return unavailable(`二进制正文：${body.byteLength} 字节；未读取内容`)
    }
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return unavailable("流式请求体未读取，以免消费页面原始流")
    }
    return unavailable("此类型的请求体未采集")
  }

  function isTextContentType(contentType) {
    return (
      !contentType ||
      /^(text\/|application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript|x-www-form-urlencoded))/i.test(contentType)
    )
  }

  function readBodyStream(source) {
    if (!source.body) return Promise.resolve({ body: null, note: null })
    let reader
    try {
      reader = source.body.getReader()
    } catch {
      return Promise.resolve({ body: null, note: "正文副本无法读取" })
    }
    return new Promise((resolve) => {
      const decoder = new TextDecoder()
      let text = ""
      let bytes = 0
      let settled = false
      const finish = (truncated, note) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        text += decoder.decode()
        resolve({ body: text || !note ? keepBodyText(text, truncated) : null, note })
        if (truncated || note) {
          // tee 副本取消可能等待页面原流，不能 await，也不能取消原请求。
          try {
            void reader.cancel().catch(() => undefined)
          } catch {
            // 副本可能已经关闭。
          }
        }
      }
      const timer = setTimeout(
        () => finish(true, "正文读取超过 2 秒，仅保留已读取部分；不代表请求超时"),
        BODY_READ_TIMEOUT
      )
      void (async () => {
        try {
          while (!settled) {
            const chunk = await reader.read()
            if (settled) return
            if (chunk.done) {
              finish(false, null)
              return
            }
            const available = BODY_LIMIT - bytes
            text += decoder.decode(chunk.value.subarray(0, available), { stream: true })
            bytes += Math.min(chunk.value.byteLength, available)
            if (chunk.value.byteLength > available) {
              finish(true, "正文超过 1 MiB，仅保留前面的内容")
            }
          }
        } catch {
          finish(true, "正文副本读取失败，仅保留已读取部分")
        } finally {
          try {
            reader.releaseLock()
          } catch {
            // 未结束的副本读取由取消操作清理。
          }
        }
      })()
    })
  }

  function readRequestBody(request) {
    if (!request.body) return Promise.resolve(null)
    const contentType = request.headers.get("content-type") || ""
    if (!isTextContentType(contentType)) {
      return Promise.resolve(unavailable("Request 内部的二进制或 multipart 正文未读取"))
    }
    let copy
    try {
      copy = request.clone()
    } catch {
      return Promise.resolve(unavailable("Request 正文无法创建副本，可能已被读取或锁定"))
    }
    return readBodyStream(copy).then(({ body, note }) => {
      if (!body) return unavailable(note || "Request 正文未获取")
      if (/^application\/x-www-form-urlencoded\b/i.test(contentType)) {
        const { entries, truncated } = snapshotEntries(new URLSearchParams(body.text))
        return {
          kind: "urlencoded",
          text: body.text,
          entries,
          truncated: body.truncated || truncated,
          ...(note ? { note } : {})
        }
      }
      return { kind: "text", ...body, ...(note ? { note } : {}) }
    })
  }

  function readResponseBody(response) {
    if (response.type === "opaque" || response.type === "opaqueredirect") {
      return Promise.resolve({ body: null, note: "浏览器未开放此响应的状态、头和正文" })
    }
    const contentType = response.headers.get("content-type") || ""
    if (!isTextContentType(contentType)) {
      return Promise.resolve({ body: null, note: `二进制响应（${contentType}）未读取` })
    }
    try {
      return readBodyStream(response.clone())
    } catch {
      return Promise.resolve({ body: null, note: "响应正文无法创建副本，未读取页面原始正文" })
    }
  }

  function errorInfo(error) {
    try {
      const name = typeof error?.name === "string" ? error.name : "Error"
      const message =
        typeof error?.message === "string"
          ? error.message
          : typeof error === "string"
            ? error
            : "未提供可读取的错误详情"
      return { name: name.slice(0, ERROR_LIMIT), message: message.slice(0, ERROR_LIMIT) }
    } catch {
      return { name: "Error", message: "错误详情不可读取" }
    }
  }

  function rejectedResult(error, signal) {
    const info = errorInfo(error)
    let outcome = "unknown"
    try {
      const reason = signal?.aborted && signal.reason === error ? errorInfo(signal.reason) : null
      if (info.name === "TimeoutError" || reason?.name === "TimeoutError") outcome = "timeout"
      else if (info.name === "AbortError" || reason) outcome = "aborted"
    } catch {
      // 无法确定时保留未知分类，不猜测 CORS、DNS 等原因。
    }
    return { outcome, error: info }
  }

  function httpResult(status, statusText) {
    if (status >= 400 && status <= 599) {
      return {
        outcome: "http-error",
        error: { name: `HTTP ${status}`, message: statusText || "服务器返回了 HTTP 错误响应" }
      }
    }
    if (status === 0) {
      return {
        outcome: "unknown",
        error: { name: "UnknownResponse", message: "无法获取 HTTP 状态，不能据此判定为网络失败" }
      }
    }
    return { outcome: "success", error: null }
  }

  function fetchRequest(input, init) {
    const request = typeof Request !== "undefined" && input instanceof Request ? input : null
    const method = String(init?.method !== undefined ? init.method : request?.method || "GET").toUpperCase()
    const requestHeaders = normalizeHeaders(init?.headers !== undefined ? init.headers : request?.headers)
    const directBody = init?.body != null ? init.body : null
    let requestBody
    if (directBody != null) {
      requestBody = Promise.resolve(snapshotBody(directBody))
      const contentType =
        typeof directBody === "string"
          ? "text/plain;charset=UTF-8"
          : directBody instanceof URLSearchParams
            ? "application/x-www-form-urlencoded;charset=UTF-8"
            : ""
      if (contentType && !requestHeaders.some((header) => header.name.toLowerCase() === "content-type"))
        requestHeaders.push({ name: "content-type", value: contentType })
    } else {
      requestBody = request ? readRequestBody(request) : Promise.resolve(null)
    }
    return {
      requestId: id(),
      method,
      url: absoluteUrl(request ? request.url : input),
      frameUrl: window.location.href,
      requestHeaders,
      requestBody,
      signal: init?.signal !== undefined ? init.signal : request?.signal
    }
  }

  const originalFetch = window.fetch
  const originalXhrOpen = XMLHttpRequest.prototype.open
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
  const originalXhrSend = XMLHttpRequest.prototype.send
  const originalXhrAbort = XMLHttpRequest.prototype.abort

  const hookedFetch = function (input, init) {
    let request
    try {
      request = fetchRequest(input, init)
    } catch {
      request = {
        requestId: id(),
        method: "GET",
        url: "",
        frameUrl: window.location.href,
        requestHeaders: [],
        requestBody: Promise.resolve(unavailable("请求信息无法采集"))
      }
    }
    const { requestBody, signal, ...details } = request
    const bodyPromise = requestBody.catch(() => unavailable("请求正文采集失败"))
    const start = performance.now()
    const finish = (result, responseBody) => {
      void Promise.all([bodyPromise, responseBody || Promise.resolve({ body: null, note: null })])
        .then(([body, response]) => {
          postEvent({ ...details, requestBody: body }, { ...result, body: response.body, bodyNote: response.note })
        })
        .catch(() => undefined)
    }
    let promise
    try {
      promise = originalFetch.apply(this, arguments)
    } catch (error) {
      finish({
        status: 0,
        duration: Math.round(performance.now() - start),
        responseHeaders: [],
        outcome: "unknown",
        error: errorInfo(error)
      })
      throw error
    }
    void promise
      .then(
        (response) => {
          const result = {
            status: response.status,
            duration: Math.round(performance.now() - start),
            responseHeaders: normalizeHeaders(response.headers),
            ...httpResult(response.status, response.statusText)
          }
          let body
          try {
            body = readResponseBody(response)
          } catch {
            body = Promise.resolve({ body: null, note: "响应正文采集失败" })
          }
          finish(result, body)
        },
        (error) =>
          finish({
            status: 0,
            duration: Math.round(performance.now() - start),
            responseHeaders: [],
            ...rejectedResult(error, signal)
          })
      )
      .catch(() => undefined)
    return promise
  }

  Object.defineProperty(window, "fetch", { configurable: true, writable: true, value: hookedFetch })

  const hookedAbort = function () {
    const state = xhrStates.get(this)
    const response =
      state?.active && this.readyState === 4 && this.status !== 0
        ? { status: this.status, ...httpResult(this.status, this.statusText), ...xhrResponse(this) }
        : null
    if (state?.active) {
      state.aborting = true
      state.abortResponse = response
    }
    try {
      const result = originalXhrAbort.apply(this, arguments)
      if (state?.active) {
        if (response) state.finish?.("load", null, response)
        else state.finish?.("abort")
      }
      return result
    } finally {
      if (state) {
        state.aborting = false
        state.abortResponse = null
      }
    }
  }

  const hookedOpen = function (method, url) {
    const previous = xhrStates.get(this)
    if (previous?.active && previous.aborting) {
      previous.finish?.(previous.abortResponse ? "load" : "abort", null, previous.abortResponse)
    } else if (previous?.active && this.readyState === 4) {
      previous.finish?.(
        this.status !== 0 ? "load" : "unknown",
        this.status === 0 ? new Error("XHR 已结束，但在观察到具体终态前被重新初始化") : undefined
      )
    }
    const result = originalXhrOpen.apply(this, arguments)
    previous?.cleanup?.()
    try {
      xhrStates.set(this, {
        method: String(method).toUpperCase(),
        url: absoluteUrl(url),
        frameUrl: window.location.href,
        headers: new Headers(),
        active: false,
        cleanup: null
      })
    } catch {
      xhrStates.delete(this)
    }
    return result
  }

  const hookedSetRequestHeader = function (name, value) {
    const result = originalSetRequestHeader.apply(this, arguments)
    try {
      xhrStates.get(this)?.headers.append(name, value)
    } catch {
      // 原生方法成功后才更新观察侧的请求头。
    }
    return result
  }

  function xhrResponse(xhr) {
    const headers = []
    try {
      for (const line of xhr.getAllResponseHeaders().split(/\r?\n/)) {
        const colon = line.indexOf(":")
        if (colon > 0) headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() })
      }
      if (xhr.responseType === "json") {
        return {
          responseHeaders: headers,
          body: xhr.response == null ? null : keepBodyText(JSON.stringify(xhr.response)),
          bodyNote: "JSON 响应由浏览器解析后展示，不是原始响应字节"
        }
      }
      if (xhr.responseType === "" || xhr.responseType === "text") {
        return { responseHeaders: headers, body: keepBodyText(xhr.responseText), bodyNote: null }
      }
      return { responseHeaders: headers, body: null, bodyNote: `响应类型 ${xhr.responseType} 未读取正文` }
    } catch {
      return { responseHeaders: headers, body: null, bodyNote: "响应正文无法读取" }
    }
  }

  const hookedSend = function (body) {
    const xhr = this
    const state = xhrStates.get(xhr)
    if (state?.active && xhr.readyState === 4 && xhr.status !== 0) state.finish?.("load")
    if (!state || state.active) return originalXhrSend.apply(xhr, arguments)
    const start = performance.now()
    let requestBody
    try {
      requestBody = state.method === "GET" || state.method === "HEAD" ? null : snapshotBody(body)
    } catch {
      requestBody = unavailable("请求正文无法采集")
    }
    const request = {
      requestId: id(),
      method: state.method,
      url: state.url,
      frameUrl: state.frameUrl,
      requestHeaders: normalizeHeaders(state.headers),
      requestBody
    }
    let finalized = false
    const listeners = []
    const cleanup = () => {
      finalized = true
      for (const [type, listener] of listeners) xhr.removeEventListener(type, listener, true)
      state.active = false
      state.cleanup = null
      state.finish = null
    }
    const finish = (type, error, response) => {
      if (finalized) return
      cleanup()
      const duration = Math.round(performance.now() - start)
      if (type === "load") {
        postEvent(request, {
          duration,
          ...(response || { status: xhr.status, ...httpResult(xhr.status, xhr.statusText), ...xhrResponse(xhr) })
        })
        return
      }
      const outcome =
        type === "error" ? "network-error" : type === "abort" ? "aborted" : type === "timeout" ? "timeout" : "unknown"
      const info = error
        ? errorInfo(error)
        : {
            name: type === "timeout" ? "TimeoutError" : type === "abort" ? "AbortError" : "NetworkError",
            message:
              type === "timeout"
                ? `XHR 超时（timeout=${xhr.timeout}ms）`
                : type === "abort"
                  ? "XHR 请求已取消"
                  : "浏览器报告网络请求失败，未提供更具体原因"
          }
      postEvent(request, { status: 0, duration, responseHeaders: [], body: null, bodyNote: null, outcome, error: info })
    }
    for (const type of ["load", "error", "abort", "timeout"]) {
      const listener = () => finish(type)
      listeners.push([type, listener])
      xhr.addEventListener(type, listener, true)
    }
    state.active = true
    state.cleanup = cleanup
    state.finish = finish
    try {
      return originalXhrSend.apply(xhr, arguments)
    } catch (error) {
      finish("unknown", error)
      throw error
    }
  }

  XMLHttpRequest.prototype.open = hookedOpen
  XMLHttpRequest.prototype.setRequestHeader = hookedSetRequestHeader
  XMLHttpRequest.prototype.send = hookedSend
  XMLHttpRequest.prototype.abort = hookedAbort

  window.postMessage({ source: SOURCE, type: "ready" }, "*")
})()
