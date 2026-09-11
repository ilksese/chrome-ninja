(function () {
  "use strict"

  const SOURCE = "chrome-ninja-netmon"
  const HOOK_FLAG = "__chromeNinjaNetmonHooked"
  if (window[HOOK_FLAG]) return
  window[HOOK_FLAG] = true

  const BODY_LIMIT = 1024 * 1024

  function id() {
    return Math.random().toString(36).slice(2)
  }

  function postHooked() {
    window.postMessage({ source: SOURCE, type: "ready" }, "*")
  }

  function postEvent(method, url, status, duration, requestHeaders, responseHeaders, body) {
    const payload = {
      source: SOURCE,
      type: "event",
      requestId: id(),
      method,
      url,
      frameUrl: window.location.href,
      status,
      duration,
      requestHeaders,
      responseHeaders,
      body
    }
    window.postMessage(JSON.stringify(payload), "*")
  }

  function normalizeHeaders(headers) {
    const result = []
    if (!headers || typeof headers.forEach !== "function") return result
    try {
      headers.forEach((value, name) => {
        result.push({ name, value: String(value) })
      })
    } catch {
      // fall through
    }
    return result
  }

  function keepBodyText(text) {
    if (text == null || text === "") return null
    const trimmed = String(text).slice(0, BODY_LIMIT)
    let mode = "raw"
    try {
      JSON.parse(trimmed)
      mode = "json"
    } catch {
      // not valid JSON, keep raw
    }
    return { mode, text: trimmed }
  }

  function readResponseBody(response, contentType) {
    if (!response || typeof response.arrayBuffer !== "function") return null
    let source
    try {
      source = typeof response.clone === "function" ? response.clone() : response
    } catch {
      source = response
    }
    let text
    try {
      const isJson = typeof contentType === "string" && contentType.indexOf("json") !== -1
      text = isJson ? source.text() : source.arrayBuffer()
    } catch {
      return null
    }

    if (typeof text === "object" && text && typeof text.then === "function") {
      return text
        .then((data) => {
          if (typeof data === "string") return data
          if (data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data)
            return new TextDecoder("utf-8").decode(bytes)
          }
          return ""
        })
        .then(keepBodyText)
    }
    return null
  }

  const originalFetch = window.fetch
  const originalXhROpen = XMLHttpRequest.prototype.open
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
  const originalXhrSend = XMLHttpRequest.prototype.send

  const hookedFetch = function (input, init) {
    const requestUrl = typeof input === "string" ? input : input && input.url ? input.url : String(input)
    const method = ((init && init.method) || (typeof input === "object" && input && input.method) || "GET").toUpperCase()
    const start = performance.now()

    const requestHeaders = []
    if (init && init.headers && typeof init.headers.forEach === "function") {
      init.headers.forEach((value, name) => requestHeaders.push({ name, value: String(value) }))
    } else if (init && init.headers && typeof init.headers === "object") {
      for (const key of Object.keys(init.headers)) requestHeaders.push({ name: key, value: String(init.headers[key]) })
    }

    const promise = originalFetch.apply(this, arguments)
    promise
      .then((response) => {
        const duration = performance.now() - start
        const status = response.status
        const contentType = response.headers ? response.headers.get("content-type") || "" : ""
        const bodyPromise = readResponseBody(response, contentType)
        bodyPromise.then((body) =>
          postEvent(
            method,
            requestUrl,
            status,
            Math.round(duration),
            requestHeaders,
            normalizeHeaders(response.headers),
            body
          )
        )
      })
      .catch(function () {
        postEvent(
          method,
          requestUrl,
          0,
          Math.round(performance.now() - start),
          requestHeaders,
          [],
          null
        )
      })
    return promise
  }

  Object.defineProperty(window, "fetch", {
    configurable: true,
    writable: true,
    value: hookedFetch
  })
  try {
    globalThis.fetch = hookedFetch
  } catch {
    // ignore
  }

  const hookedOpen = function (method, url, async, user, password) {
    this.__netmonMethod = String(method || "GET").toUpperCase()
    this.__netmonUrl = url == null ? "" : String(url)
    this.__netmonStart = performance.now()
    return originalXhROpen.apply(this, arguments)
  }

  function readXhrRequestHeaders(xhr) {
    const raw = xhr.__netmonHeaders || null
    if (!raw) return []
    const headers = []
    raw.forEach(function (value, name) {
      headers.push({ name, value: String(value) })
    })
    return headers
  }

  const hookedSetRequestHeader = function (name, value) {
    this.__netmonHeaders = this.__netmonHeaders || new Headers()
    try {
      this.__netmonHeaders.set(name, value)
    } catch {
      // ignore
    }
    return originalSetRequestHeader.apply(this, arguments)
  }

  const hookedSend = function (body) {
    const method = this.__netmonMethod || "GET"
    const rawUrl = this.__netmonUrl || ""
    const start = this.__netmonStart || performance.now()
    this.__netmonSent = true

    this.addEventListener("load", function () {
      const responseHeaders = []
      const allHeaders = this.getAllResponseHeaders
      if (allHeaders) {
        const text = this.getAllResponseHeaders()
        text.split(/\r?\n/).forEach((line) => {
          const colon = line.indexOf(":")
          if (colon > 0) responseHeaders.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() })
        })
      }

      const contentType = this.getResponseHeader ? this.getResponseHeader("content-type") || "" : ""
      const status = this.status || 0
      let body = null
      if (typeof this.response === "string") {
        body = keepBodyText(this.response)
      } else if (this.responseType === "" || this.responseType === "text") {
        const response = this.response
        if (typeof response === "string") body = keepBodyText(response)
      }

      const duration = performance.now() - start
      postEvent(method, rawUrl, status, Math.round(duration), readXhrRequestHeaders(this), responseHeaders, body)
    })

    this.addEventListener("error", function () {
      postEvent(method, rawUrl, 0, Math.round(performance.now() - start), [], [], null)
    })
    return originalXhrSend.apply(this, arguments)
  }

  XMLHttpRequest.prototype.open = hookedOpen
  XMLHttpRequest.prototype.setRequestHeader = hookedSetRequestHeader
  XMLHttpRequest.prototype.send = hookedSend

  postHooked()
})()
