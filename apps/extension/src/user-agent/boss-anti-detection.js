(function () {
  "use strict"

  const BOSS_HOST_RE = /(^|\.)zhipin\.com$|(^|\.)bosszhipin\.com$/
  const patchedWindows = new WeakSet()

  function isBossHost(hostname) {
    return BOSS_HOST_RE.test(hostname || "")
  }

  function isBossUrl(url) {
    try {
      return isBossHost(new URL(url).hostname)
    } catch {
      return false
    }
  }

  function isBossContext() {
    if (isBossHost(location.hostname) || isBossUrl(document.referrer)) {
      return true
    }

    try {
      if (window.parent && window.parent !== window && isBossHost(window.parent.location.hostname)) {
        return true
      }
    } catch {}

    try {
      if (window.top && window.top !== window && isBossHost(window.top.location.hostname)) {
        return true
      }
    } catch {}

    return false
  }

  if (!isBossContext()) {
    return
  }

  function setNativeToString(fn, source) {
    try {
      Object.defineProperty(fn, "toString", {
        value() {
          return source
        },
        configurable: true
      })
    } catch {}
  }

  function hookProperty(obj, prop, value, configurable) {
    if (!obj) {
      return
    }

    try {
      Object.defineProperty(obj, prop, {
        get() {
          return value
        },
        set() {},
        configurable: configurable !== false,
        enumerable: true
      })
    } catch {}
  }

  function patchRuntime(win) {
    try {
      win.chrome = win.chrome || {}
      win.chrome.runtime = win.chrome.runtime || {}
      win.chrome.runtime.connect = win.chrome.runtime.connect || function () {
        return { postMessage() {}, onMessage: { addListener() {} } }
      }
      win.chrome.runtime.sendMessage = win.chrome.runtime.sendMessage || function () {}
      win.chrome.runtime.onMessage = win.chrome.runtime.onMessage || { addListener() {} }
      win.chrome.runtime.onConnect = win.chrome.runtime.onConnect || { addListener() {} }
    } catch {}
  }

  function patchNavigator(win) {
    try {
      hookProperty(win.navigator, "webdriver", false, true)
      if (win.Navigator && win.Navigator.prototype) {
        hookProperty(win.Navigator.prototype, "webdriver", false, true)
      }
    } catch {}

    try {
      hookProperty(win.navigator, "languages", ["zh-CN", "zh", "en"], true)
      hookProperty(win.navigator, "language", "zh-CN", true)
      hookProperty(win.navigator, "platform", "Win32", true)
      hookProperty(win.navigator, "vendor", "Google Inc.", true)
      hookProperty(win.navigator, "deviceMemory", 8, true)
      hookProperty(win.navigator, "hardwareConcurrency", 8, true)
      hookProperty(win.navigator, "maxTouchPoints", 0, true)
    } catch {}

    try {
      const connection = win.navigator.connection || win.navigator.mozConnection || win.navigator.webkitConnection
      if (connection) {
        hookProperty(connection, "rtt", 50 + Math.floor(Math.random() * 100), true)
        hookProperty(connection, "downlink", 10 + Math.random() * 5, true)
        hookProperty(connection, "effectiveType", "4g", true)
      }
    } catch {}
  }

  function patchConsole(win) {
    try {
      const consoleObj = win.console
      if (!consoleObj || consoleObj.__bossConsolePatched) {
        return
      }

      consoleObj.table = function () {}
      setNativeToString(consoleObj.table, "function table() { [native code] }")
      consoleObj.clear = function () {}
      setNativeToString(consoleObj.clear, "function clear() { [native code] }")

      Object.defineProperty(consoleObj, "__bossConsolePatched", {
        value: true,
        configurable: true
      })
    } catch {}
  }

  function patchNavigation(win) {
    try {
      win.close = function () {}
      setNativeToString(win.close, "function close() { [native code] }")
    } catch {}

    try {
      if (win.Window && win.Window.prototype) {
        win.Window.prototype.close = function () {}
        setNativeToString(win.Window.prototype.close, "function close() { [native code] }")
      }
    } catch {}

    try {
      const originalOpen = win.open
      win.open = function (url, target, features) {
        if (typeof url === "string" && (url === "about:blank" || url === "")) {
          return null
        }

        return originalOpen.call(win, url, target, features)
      }
      setNativeToString(win.open, "function open() { [native code] }")
    } catch {}

    try {
      const originalReplace = win.Location.prototype.replace
      win.Location.prototype.replace = function (url) {
        if (typeof url === "string" && url === "about:blank") {
          return
        }

        return originalReplace.call(this, url)
      }
      setNativeToString(win.Location.prototype.replace, "function replace() { [native code] }")
    } catch {}

    try {
      const originalAssign = win.Location.prototype.assign
      win.Location.prototype.assign = function (url) {
        if (typeof url === "string" && url === "about:blank") {
          return
        }

        return originalAssign.call(this, url)
      }
      setNativeToString(win.Location.prototype.assign, "function assign() { [native code] }")
    } catch {}

    try {
      if (win.navigation && win.navigation.addEventListener) {
        win.navigation.addEventListener("navigate", (event) => {
          const url = event && event.destination && event.destination.url
          if (url === "about:blank" && event.cancelable) {
            event.preventDefault()
          }
        })
      }
    } catch {}
  }

  function patchIntrospection(win) {
    try {
      const originalDefineProperty = win.Object.defineProperty
      win.Object.defineProperty = function (target, prop, descriptor) {
        if (target && target === win.Navigator.prototype && prop === "webdriver") {
          return originalDefineProperty.call(win.Object, target, prop, {
            get() {
              return false
            },
            set() {},
            configurable: true,
            enumerable: true
          })
        }

        return originalDefineProperty.call(win.Object, target, prop, descriptor)
      }
      setNativeToString(win.Object.defineProperty, "function defineProperty() { [native code] }")
    } catch {}

    try {
      const originalGetOwnPropertyDescriptor = win.Object.getOwnPropertyDescriptor
      win.Object.getOwnPropertyDescriptor = function (obj, prop) {
        const desc = originalGetOwnPropertyDescriptor.call(win.Object, obj, prop)
        if (prop === "webdriver" && (obj === win.navigator || obj === win.Navigator.prototype)) {
          return {
            get() {
              return false
            },
            set() {},
            configurable: true,
            enumerable: true
          }
        }

        return desc
      }
      setNativeToString(win.Object.getOwnPropertyDescriptor, "function getOwnPropertyDescriptor() { [native code] }")
    } catch {}

    try {
      const originalFnToString = win.Function.prototype.toString
      win.Function.prototype.toString = function () {
        const name = this.name || ""
        if (name.toLowerCase().includes("webdriver")) {
          return "function get webdriver() { [native code] }"
        }

        return originalFnToString.apply(this, arguments)
      }
    } catch {}
  }

  function patchWindow(win) {
    if (!win || patchedWindows.has(win)) {
      return
    }

    patchedWindows.add(win)
    patchNavigator(win)
    patchConsole(win)
    patchNavigation(win)
    patchRuntime(win)
    patchIntrospection(win)
  }

  function patchFrame(frame) {
    try {
      if (frame && frame.contentWindow) {
        patchWindow(frame.contentWindow)
      }
    } catch {}
  }

  function patchFrames(root) {
    try {
      const frames = (root || document).querySelectorAll("iframe")
      for (const frame of frames) {
        patchFrame(frame)
      }
    } catch {}
  }

  function patchInsertedNode(node) {
    try {
      if (!node || node.nodeType !== 1) {
        return
      }

      if (node.tagName === "IFRAME") {
        patchFrame(node)
      }

      if (node.querySelectorAll) {
        patchFrames(node)
      }
    } catch {}
  }

  function wrapInsertion(proto, method) {
    try {
      const original = proto && proto[method]
      if (!original) {
        return
      }

      proto[method] = function () {
        const ret = original.apply(this, arguments)
        for (const node of arguments) {
          patchInsertedNode(node)
        }

        return ret
      }
      setNativeToString(proto[method], "function " + method + "() { [native code] }")
    } catch {}
  }

  function patchFrameInsertion() {
    wrapInsertion(Node.prototype, "appendChild")
    wrapInsertion(Node.prototype, "insertBefore")
    wrapInsertion(Element.prototype, "append")
    wrapInsertion(Element.prototype, "prepend")
    wrapInsertion(Element.prototype, "insertAdjacentElement")

    try {
      const originalCreateElement = Document.prototype.createElement
      Document.prototype.createElement = function (tagName, options) {
        const el = originalCreateElement.call(this, tagName, options)
        if (String(tagName).toLowerCase() === "iframe") {
          setTimeout(() => patchFrame(el), 0)
        }

        return el
      }
      setNativeToString(Document.prototype.createElement, "function createElement() { [native code] }")
    } catch {}

    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            patchInsertedNode(node)
          }
        }
      })
      observer.observe(document.documentElement || document, { childList: true, subtree: true })
    } catch {}
  }

  patchWindow(window)
  patchFrameInsertion()
  patchFrames(document)
})()
