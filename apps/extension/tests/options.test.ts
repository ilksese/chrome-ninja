import { createStore } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_OPTIONS, mergeOptions, optionsAtom } from "@/store/options"

describe("mergeOptions", () => {
  it("restores defaults when no persisted options exist", () => {
    expect(mergeOptions()).toEqual(DEFAULT_OPTIONS)
    expect(mergeOptions().videoSniffer.enabled).toBe(false)
  })

  it("merges nested settings without dropping defaults or explicit false values", () => {
    const result = mergeOptions({
      userAgent: "custom-agent",
      videoSniffer: { enabled: false },
      translate: { ...DEFAULT_OPTIONS.translate, apiKey: "test-key" }
    })

    expect(result.userAgent).toBe("custom-agent")
    expect(result.videoSniffer.enabled).toBe(false)
    expect(result.translate).toEqual({ ...DEFAULT_OPTIONS.translate, apiKey: "test-key" })
    expect(result.boss).toEqual(DEFAULT_OPTIONS.boss)
  })

  it("does not mutate nested defaults", () => {
    const result = mergeOptions()
    result.translate.apiKey = "changed"
    result.boss.enabled = true

    expect(DEFAULT_OPTIONS.translate.apiKey).toBe("")
    expect(DEFAULT_OPTIONS.boss.enabled).toBe(false)
  })
})

describe("optionsAtom", () => {
  it("loads persisted settings on subscription and saves changes to Chrome storage", async () => {
    const persisted = { videoSniffer: { enabled: false } }
    const get = vi.fn((_keys, callback) => callback({ options: persisted }))
    const set = vi.fn((_value, callback) => callback())
    vi.stubGlobal("chrome", { storage: { local: { get, set } } })
    const store = createStore()
    const unsubscribe = store.sub(optionsAtom, () => {})

    try {
      expect(get).toHaveBeenCalledWith(["options"], expect.any(Function))
      expect(store.get(optionsAtom)).toEqual(mergeOptions(persisted))

      const updated = mergeOptions({ userAgent: "custom-agent" })
      await store.set(optionsAtom, updated)

      expect(set).toHaveBeenCalledWith({ options: updated }, expect.any(Function))
      expect(store.get(optionsAtom)).toEqual(updated)
    } finally {
      unsubscribe()
    }
  })
})
