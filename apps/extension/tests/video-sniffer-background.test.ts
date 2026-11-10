import { beforeEach, describe, expect, it, vi } from "vitest"

type Options = { videoSniffer?: { enabled: boolean } }
let readOptions: (value: { options?: Options }) => void
let changeOptions: (changes: { options: { newValue?: Options } }, area: string) => void
let receiveHeaders: (details: { tabId: number; url: string; type: string }) => void
let onMessage: (message: object, sender: object, respond: (value: unknown) => void) => void
const report = () => onMessage({ target: "video-sniffer", type: "report", resources: [{ url: "https://example.com/video.mp4" }] }, { tab: { id: 1 } }, vi.fn())
const list = () => {
  const respond = vi.fn()
  onMessage({ target: "video-sniffer", type: "list", tabId: 1 }, {}, respond)
  return respond.mock.calls[0][0].resources
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal("chrome", {
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
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: {
        addListener: (listener: typeof onMessage) => {
          onMessage = listener
        }
      }
    },
    webRequest: {
      onHeadersReceived: {
        addListener: (listener: typeof receiveHeaders) => {
          receiveHeaders = listener
        }
      }
    },
    webNavigation: { onCommitted: { addListener: vi.fn() } },
    tabs: { onRemoved: { addListener: vi.fn() } }
  })
  const { registerVideoSnifferBackground } = await import("../src/video-sniffer/background")
  registerVideoSnifferBackground()
})

describe("video sniffer background switch", () => {
  it("ignores media before settings load and when no opt-in exists", () => {
    receiveHeaders({ tabId: 1, url: "https://example.com/video.mp4", type: "media" })
    expect(list()).toHaveLength(0)
    readOptions({})
    report()
    expect(list()).toHaveLength(0)
  })

  it("clears resources on disable and ignores late page reports", () => {
    readOptions({ options: { videoSniffer: { enabled: true } } })
    report()
    expect(list()).toHaveLength(1)
    changeOptions({ options: { newValue: { videoSniffer: { enabled: false } } } }, "local")
    expect(list()).toHaveLength(0)
    report()
    expect(list()).toHaveLength(0)
  })

  it("keeps newer settings when the initial storage read finishes late", () => {
    changeOptions({ options: { newValue: { videoSniffer: { enabled: false } } } }, "local")
    readOptions({ options: { videoSniffer: { enabled: true } } })
    receiveHeaders({ tabId: 1, url: "https://example.com/video.mp4", type: "media" })
    expect(list()).toHaveLength(0)
  })

  it("stops collecting when persisted options are removed", () => {
    readOptions({ options: { videoSniffer: { enabled: true } } })
    report()
    changeOptions({ options: {} }, "local")
    expect(list()).toHaveLength(0)
  })
})
