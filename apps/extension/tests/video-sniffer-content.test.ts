// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Options = { videoSniffer?: { enabled: boolean } }
let readOptions: (value: { options?: Options }) => void
let changeOptions: (changes: { options: { newValue?: Options } }, area: string) => void
let scan: (message: { target: string; type: string }) => void
let frames: Map<number, FrameRequestCallback>
let video: HTMLVideoElement
let rect: DOMRect
const overlays = () => document.querySelectorAll<HTMLElement>("[data-chrome-ninja-video-download]")
const flushLayout = () => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}
const setEnabled = (enabled: boolean) => changeOptions({ options: { newValue: { videoSniffer: { enabled } } } }, "local")

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  frames = new Map()
  let frameId = 0
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
  vi.stubGlobal("CSS", { supports: vi.fn().mockReturnValue(true) })
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([])
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: {
        addListener: (listener: typeof scan) => {
          scan = listener
        }
      }
    },
    storage: {
      local: {
        get: (_keys: string[], callback: typeof readOptions) => {
          readOptions = callback
        }
      },
      onChanged: {
        addListener: (listener: typeof changeOptions) => {
          changeOptions = listener
        }
      }
    }
  })
  video = document.createElement("video")
  video.src = "https://example.com/video.mp4"
  document.body.append(video)
  rect = new DOMRect(100, 100, 640, 360)
  vi.spyOn(video, "getBoundingClientRect").mockImplementation(() => rect)
  const getRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.chromeNinjaVideoDownload !== undefined) return new DOMRect(rect.right - 148, rect.top + 8, 140, 32)
    return getRect.call(this)
  })
})

afterEach(() => {
  setEnabled(false)
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe("video sniffer content", () => {
  it("does not scan or show buttons before settings load or without explicit opt-in", async () => {
    await import("../src/video-sniffer/content")
    scan({ target: "video-sniffer-content", type: "scan" })
    flushLayout()
    expect(overlays()).toHaveLength(0)
    readOptions({})
    flushLayout()
    expect(overlays()).toHaveLength(0)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it("keeps an explicitly disabled setting off", async () => {
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: false } } })
    scan({ target: "video-sniffer-content", type: "scan" })
    flushLayout()
    expect(overlays()).toHaveLength(0)
  })

  it("does not let a stale initial read undo a more recent disable", async () => {
    await import("../src/video-sniffer/content")
    setEnabled(false)
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    expect(overlays()).toHaveLength(0)
  })

  it("lets CSS anchor positioning follow document and nested scroll", async () => {
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    const host = overlays()[0]
    const anchor = video.style.getPropertyValue("anchor-name")
    expect(anchor).toMatch(/^--chrome-ninja-video-/)
    expect(host.style.getPropertyValue("position-anchor")).toBe(anchor)
    expect(host.style.top).toContain("anchor(top)")
    expect(host.style.left).toContain("anchor(right)")

    const scroller = document.createElement("div")
    document.body.append(scroller)
    scroller.append(video)
    rect = new DOMRect(80, 60, 640, 360)
    scroller.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(host.style.top).toContain("anchor(top)")
    expect(host.style.left).toContain("anchor(right)")

    rect = new DOMRect(80, -60, 640, 360)
    document.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(host.style.top).toContain("anchor(top)")
    expect(getComputedStyle(host).display).toBe("none")
    scroller.remove()
  })

  it("hides buttons when their anchor corner is clipped by a nested scroller", async () => {
    const scroller = document.createElement("div")
    scroller.style.overflow = "auto"
    document.body.append(scroller)
    scroller.append(video)
    Object.defineProperties(scroller, {
      getBoundingClientRect: { value: () => new DOMRect(100, 400, 640, 200) },
      clientWidth: { value: 640 },
      clientHeight: { value: 200 },
      offsetWidth: { value: 640 },
      offsetHeight: { value: 200 }
    })
    rect = new DOMRect(100, 400, 640, 360)
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    const host = overlays()[0]
    expect(getComputedStyle(host).display).toBe("flex")

    rect = new DOMRect(100, 200, 640, 360)
    scroller.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(getComputedStyle(host).display).toBe("none")

    rect = new DOMRect(100, 400, 640, 360)
    scroller.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(getComputedStyle(host).display).toBe("flex")
    scroller.remove()
  })

  it("preserves existing anchor names and restores their inline priority on disable", async () => {
    video.style.setProperty("anchor-name", "--player", "important")
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    const anchor = overlays()[0].style.getPropertyValue("position-anchor")
    expect(
      video.style
        .getPropertyValue("anchor-name")
        .split(",")
        .map((name) => name.trim())
    ).toEqual(["--player", anchor])
    setEnabled(false)
    expect(video.style.getPropertyValue("anchor-name")).toBe("--player")
    expect(video.style.getPropertyPriority("anchor-name")).toBe("important")
  })

  it("preserves anchors supplied by the page stylesheet without leaving an inline override", async () => {
    const stylesheet = document.createElement("style")
    stylesheet.textContent = "video { anchor-name: --player-from-stylesheet; }"
    document.body.append(stylesheet)
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    expect(video.style.getPropertyValue("anchor-name")).toContain("--player-from-stylesheet,")
    setEnabled(false)
    expect(video.style.getPropertyValue("anchor-name")).toBe("")
    expect(getComputedStyle(video).getPropertyValue("anchor-name")).toBe("--player-from-stylesheet")
  })

  it("hides buttons clipped horizontally without hiding them for visible overflow", async () => {
    const container = document.createElement("div")
    container.style.overflowX = "hidden"
    container.style.overflowY = "visible"
    document.body.append(container)
    container.append(video)
    Object.defineProperties(container, {
      getBoundingClientRect: { value: () => new DOMRect(100, 0, 500, 600) },
      clientWidth: { value: 500 },
      offsetWidth: { value: 500 }
    })
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    expect(getComputedStyle(overlays()[0]).display).toBe("none")
    container.style.overflowX = "visible"
    window.dispatchEvent(new Event("resize"))
    flushLayout()
    expect(getComputedStyle(overlays()[0]).display).toBe("flex")
  })

  it("assigns independent anchors and cleans them up when videos are removed", async () => {
    const otherVideo = document.createElement("video")
    document.body.append(otherVideo)
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    expect(overlays()).toHaveLength(2)
    expect(otherVideo.style.getPropertyValue("anchor-name")).not.toBe(video.style.getPropertyValue("anchor-name"))
    otherVideo.remove()
    document.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(overlays()).toHaveLength(1)
    expect(otherVideo.style.getPropertyValue("anchor-name")).toBe("")
    setEnabled(false)
    expect(video.style.getPropertyValue("anchor-name")).toBe("")
  })

  it("does not override anchor styles changed by the page after injection", async () => {
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    video.style.setProperty("anchor-name", "--page-updated")
    setEnabled(false)
    expect(video.style.getPropertyValue("anchor-name")).toBe("--page-updated")
  })

  it("keeps resource sniffing but omits buttons when CSS anchors are unsupported", async () => {
    vi.mocked(CSS.supports).mockReturnValue(false)
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    expect(overlays()).toHaveLength(0)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "report" }))
  })

  it("preserves flex layout and button spacing when restoring offscreen overlays", async () => {
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    const host = overlays()[0]
    expect(getComputedStyle(host).display).toBe("flex")
    expect(getComputedStyle(host).gap).toBe("4px")
    rect = new DOMRect(100, -500, 640, 360)
    document.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(getComputedStyle(host).display).toBe("none")
    rect = new DOMRect(100, 100, 640, 360)
    document.dispatchEvent(new Event("scroll"))
    flushLayout()
    expect(getComputedStyle(host).display).toBe("flex")
    expect(getComputedStyle(host).gap).toBe("4px")
  })

  it("removes buttons and pending work immediately when disabled or settings are deleted", async () => {
    await import("../src/video-sniffer/content")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    flushLayout()
    document.dispatchEvent(new Event("scroll"))
    setEnabled(false)
    flushLayout()
    expect(overlays()).toHaveLength(0)
    expect(frames.size).toBe(0)
    setEnabled(true)
    flushLayout()
    expect(overlays()).toHaveLength(1)
    changeOptions({ options: {} }, "local")
    flushLayout()
    expect(overlays()).toHaveLength(0)
  })
})
