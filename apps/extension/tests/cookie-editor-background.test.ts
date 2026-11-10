import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CookieEntry, CookieResponse } from "../src/cookie-editor/types"

vi.mock("../src/cookie-editor/content.ts?script", () => ({ default: "cookie-content.js" }))
type Cookie = chrome.cookies.Cookie
let receive: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (result: CookieResponse) => void
) => boolean
let changed: (event: chrome.cookies.CookieChangeInfo) => void
let jar: Cookie[]
let storage: Record<string, unknown>
let sessionStorage: Record<string, unknown>
let failStorage = false
let failSet = false
let readStorageGate: Promise<void> | undefined
let delayedRemoval: (() => void) | undefined
let delayRemoval = false
const sender = { id: "extension", tab: { id: 1 }, frameId: 0, url: "https://app.example.com/page" }
const cookie = (patch: Partial<Cookie> = {}): Cookie => ({
  name: "token",
  value: "initial",
  domain: "app.example.com",
  hostOnly: true,
  path: "/",
  storeId: "0",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
  session: true,
  ...patch
})
const key = (item: Cookie) =>
  JSON.stringify([item.name, item.domain, item.path, item.storeId, item.partitionKey ?? null])
const emit = (item: Cookie, removed = false, cause: chrome.cookies.OnChangedCause = "explicit") =>
  changed({ cookie: structuredClone(item), removed, cause })
const websiteWrite = (item: Cookie) => {
  const old = jar.find((entry) => key(entry) === key(item))
  if (old) emit(old, true, "overwrite")
  jar = jar.filter((entry) => key(entry) !== key(item))
  jar.push(item)
  emit(item)
}
const request = (command: object, from = sender) =>
  new Promise<CookieResponse>((resolve) => {
    receive({ target: "cookie-editor", ...command }, from as chrome.runtime.MessageSender, resolve)
  })
const list = async () => {
  const response = await request({ type: "list" })
  expect(response.ok, response.error).toBe(true)
  return response.entries!
}
const edit = (entry: CookieEntry, patch: Partial<Cookie>) =>
  request({ type: "save", original: { id: entry.id, revision: entry.revision }, cookie: { ...entry.cookie, ...patch } })
const toggle = (entry: CookieEntry, type: "disable" | "enable") =>
  request({ type, original: { id: entry.id, revision: entry.revision } })
async function boot() {
  vi.resetModules()
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension",
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      onMessage: {
        addListener: (fn: typeof receive) => {
          receive = fn
        }
      }
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, url: "https://app.example.com/page" })),
      sendMessage: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue([{ id: 1 }])
    },
    scripting: {
      executeScript: vi.fn(async () => {
        receive({ target: "cookie-editor-opened", ok: true }, sender as chrome.runtime.MessageSender, () => {})
        return []
      })
    },
    storage: {
      session: {
        get: vi.fn(async () => structuredClone(sessionStorage)),
        set: vi.fn(async (values: object) => {
          Object.assign(sessionStorage, structuredClone(values))
        })
      },
      local: {
        get: vi.fn(async () => {
          await readStorageGate
          return structuredClone(storage)
        }),
        set: vi.fn(async (values: object) => {
          if (failStorage) throw new Error("storage failed")
          Object.assign(storage, structuredClone(values))
        })
      }
    },
    cookies: {
      getAllCookieStores: async () => [{ id: "0", tabIds: [1, 2] }],
      getPartitionKey: async () => ({
        partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: false }
      }),
      getAll: vi.fn(async (details: chrome.cookies.GetAllDetails) =>
        structuredClone(
          jar.filter(
            (item) =>
              item.storeId === details.storeId &&
              JSON.stringify(item.partitionKey ?? null) === JSON.stringify(details.partitionKey ?? null)
          )
        )
      ),
      set: vi.fn(async (details: chrome.cookies.SetDetails) => {
        if (failSet) throw new Error("set failed")
        const next = cookie({
          ...details,
          domain: details.domain ?? new URL(details.url).hostname,
          hostOnly: !details.domain,
          session: details.expirationDate === undefined
        })
        const old = jar.find((item) => key(item) === key(next))
        if (old?.secure && new URL(details.url).protocol !== "https:") {
          throw new Error("Cannot overwrite a Secure cookie from an insecure source")
        }
        if (details.expirationDate !== undefined && details.expirationDate <= Date.now() / 1000) {
          jar = jar.filter((item) => key(item) !== key(next))
          if (old) {
            if (delayRemoval) delayedRemoval = () => emit(old, true, "expired_overwrite")
            else emit(old, true, "expired_overwrite")
          }
          return null
        }
        websiteWrite(next)
        return structuredClone(next)
      }),
      onChanged: {
        addListener: (fn: typeof changed) => {
          changed = fn
        }
      }
    }
  })
  const { registerCookieEditorBackground } = await import("../src/cookie-editor/background")
  registerCookieEditorBackground()
}
beforeEach(async () => {
  jar = [cookie()]
  storage = {}
  sessionStorage = {}
  failStorage = false
  failSet = false
  readStorageGate = undefined
  delayRemoval = false
  delayedRemoval = undefined
  await boot()
})

describe("Cookie editor messages", () => {
  it("lists all current-host paths and parent cookies only in the current store and full partition", async () => {
    jar.push(
      cookie({ path: "/deep" }),
      cookie({ domain: ".example.com", hostOnly: false }),
      cookie({ domain: "other.example.com" }),
      cookie({ storeId: "1" }),
      cookie({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: false } }),
      cookie({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: true } }),
      cookie({ partitionKey: { topLevelSite: "https://other.com", hasCrossSiteAncestor: false } })
    )
    expect((await list()).map((entry) => [entry.cookie.domain, entry.cookie.path, entry.cookie.partitionKey])).toEqual([
      ["app.example.com", "/", undefined],
      ["app.example.com", "/deep", undefined],
      [".example.com", "/", undefined],
      ["app.example.com", "/", { topLevelSite: "https://example.com", hasCrossSiteAncestor: false }]
    ])
  })
  it("keeps removing writes without a panel and restores the last observed version after a restart", async () => {
    expect((await toggle((await list())[0], "disable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
    websiteWrite(cookie({ value: "second" }))
    websiteWrite(cookie({ value: "latest" }))
    let entries = await list()
    expect(jar).toHaveLength(0)
    expect(entries[0]).toMatchObject({ disabled: true, cookie: { value: "latest", httpOnly: true } })
    await boot()
    entries = await list()
    expect((await toggle(entries[0], "enable")).ok).toBe(true)
    expect(jar).toEqual([expect.objectContaining({ value: "latest", httpOnly: true, hostOnly: true })])
    expect((await list())[0].disabled).toBe(false)
  })

  it("saves explicitly, allows an empty value, rejects duplicate and disabled identities, and moves an edited identity", async () => {
    const initial = (await list())[0]
    expect((await request({ type: "save", cookie: cookie({ value: "duplicate" }) })).ok).toBe(false)
    expect(jar[0].value).toBe("initial")
    expect((await edit(initial, { name: "renamed", path: "/deep", value: "" })).ok).toBe(true)
    expect(jar).toEqual([expect.objectContaining({ name: "renamed", path: "/deep", value: "", hostOnly: true })])
    const renamed = (await list())[0]
    await toggle(renamed, "disable")
    const duplicate = await request({ type: "save", cookie: renamed.cookie })
    expect(duplicate).toMatchObject({ ok: false, error: expect.stringContaining("已存在") })
  })
  it("keeps disabled edits disabled, transfers the rule, and gives later website writes precedence", async () => {
    await toggle((await list())[0], "disable")
    expect((await edit((await list())[0], { name: "moved", value: "manual" })).ok).toBe(true)
    expect(jar).toHaveLength(0)
    websiteWrite(cookie({ value: "old identity" }))
    websiteWrite(cookie({ name: "moved", value: "website wins" }))
    const entries = await list()
    expect(entries.find((item) => item.cookie.name === "token")?.disabled).toBe(false)
    const disabled = entries.find((item) => item.disabled)!
    expect(disabled.cookie.value).toBe("website wins")
    await toggle(disabled, "enable")
    expect(jar.find((item) => item.name === "moved")?.value).toBe("website wins")
  })
  it("rejects stale saves even when the website changes back to the original value", async () => {
    const entry = (await list())[0]
    websiteWrite(cookie({ value: "new" }))
    websiteWrite(cookie())
    expect(await edit(entry, { value: "draft" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("重新载入")
    })
    expect(jar[0].value).toBe("initial")
  })
  it("never revives an expired backup or an observed deletion, but retains unobservable deletion backups", async () => {
    const expires = Date.now() / 1000 + 10
    websiteWrite(cookie({ session: false, expirationDate: expires }))
    await toggle((await list())[0], "disable")
    vi.spyOn(Date, "now").mockReturnValue((expires + 1) * 1000)
    await toggle((await list())[0], "enable")
    expect(jar).toHaveLength(0)
    vi.restoreAllMocks()
    websiteWrite(cookie())
    await toggle((await list())[0], "disable")
    websiteWrite(cookie({ value: "deleted before enforcement" }))
    jar = []
    emit(cookie({ value: "deleted before enforcement" }), true, "explicit")
    await toggle((await list())[0], "enable")
    expect(jar).toHaveLength(0)
    websiteWrite(cookie({ value: "last observable" }))
    await toggle((await list())[0], "disable")
    await toggle((await list())[0], "enable")
    expect(jar[0].value).toBe("last observable")
  })
  it("only removes the full identity when names overlap across paths, domains, stores and partitions", async () => {
    jar.push(
      cookie({ path: "/deep" }),
      cookie({ domain: ".example.com", hostOnly: false }),
      cookie({ storeId: "1" }),
      cookie({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: false } }),
      cookie({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: true } })
    )
    const target = (await list()).find((entry) => entry.cookie.path === "/deep")!
    const others = jar.filter((item) => item.path !== "/deep")
    await toggle(target, "disable")
    expect(jar).toEqual(others)
    const partitioned = (await list()).find((entry) => entry.cookie.partitionKey)!
    await toggle(partitioned, "disable")
    expect(jar.filter((item) => item.partitionKey)).toEqual([
      expect.objectContaining({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: true } })
    ])
    await toggle((await list()).find((entry) => entry.cookie.partitionKey)!, "enable")
    expect(jar).toContainEqual(
      expect.objectContaining({ partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: false } })
    )
  })
  it("reports persistence and Cookie write failures without pretending success", async () => {
    failStorage = true
    expect((await toggle((await list())[0], "disable")).ok).toBe(false)
    expect(jar[0].value).toBe("initial")
    expect((await list())[0].disabled).toBe(false)
    failStorage = false
    failSet = true
    expect((await edit((await list())[0], { value: "lost" })).ok).toBe(false)
    expect(jar[0].value).toBe("initial")
    failSet = false
    await toggle((await list())[0], "disable")
    failSet = true
    expect((await toggle((await list())[0], "enable")).ok).toBe(false)
    expect((await list())[0].disabled).toBe(true)
  })
  it("derives scope from the sender and rejects iframe, forged scope and changed partitions", async () => {
    expect((await request({ type: "list" }, { ...sender, frameId: 2 })).ok).toBe(false)
    expect((await request({ type: "save", cookie: cookie({ domain: "other.example.com" }) })).ok).toBe(false)
    expect((await request({ type: "save", cookie: cookie({ storeId: "1" }) })).ok).toBe(false)
    expect(
      (
        await request({
          type: "save",
          cookie: cookie({
            name: "partition",
            partitionKey: { topLevelSite: "https://example.com", hasCrossSiteAncestor: false }
          })
        })
      ).ok
    ).toBe(false)
    expect((await request({ type: "list", tabId: 2 })).ok).toBe(true)
    expect(chrome.tabs.get).toHaveBeenLastCalledWith(1)
  })
  it("captures writes interleaved with loading persistent rules and reconciles while no panel exists", async () => {
    await toggle((await list())[0], "disable")
    let release!: () => void
    readStorageGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await boot()
    websiteWrite(cookie({ value: "while loading" }))
    websiteWrite(cookie({ value: "newest during loading" }))
    release()
    expect((await list())[0]).toMatchObject({ disabled: true, cookie: { value: "newest during loading" } })
    expect(jar).toHaveLength(0)
    jar.push(cookie({ value: "written while worker stopped" }))
    readStorageGate = undefined
    await boot()
    await vi.waitFor(() => expect(jar).toHaveLength(0))
    await toggle((await list())[0], "enable")
    expect(jar[0].value).toBe("written while worker stopped")
  })
  it("uses the same disable rule for another tab sharing the Cookie store", async () => {
    await toggle((await list())[0], "disable")
    websiteWrite(cookie({ value: "shared latest" }))
    const otherTab = { ...sender, tab: { id: 2 } }
    const response = await request({ type: "list" }, otherTab)
    expect(response.entries![0].disabled).toBe(true)
    await request({ type: "enable", original: response.entries![0] }, otherTab)
    expect(jar[0].value).toBe("shared latest")
  })
  it("imports existing disabled records without restoring an original snapshot", async () => {
    storage = {
      cookieEditorDisabledCookies: {
        "https://app.example.com": [{ cookie: cookie(), draft: "stored draft", enabled: false }]
      },
      cookieEditorOriginalSnapshots: { irrelevant: "never restore" }
    }
    jar = []
    await boot()
    const entry = (await list())[0]
    expect(entry).toMatchObject({ disabled: true, cookie: { value: "stored draft" } })
    await toggle(entry, "enable")
    expect(jar[0].value).toBe("stored draft")
  })
  it("waits for a mount acknowledgement and reports restricted-page injection errors", async () => {
    const popup = { id: "extension", url: "chrome-extension://extension/index.html" } as typeof sender
    expect((await request({ type: "open", tabId: 1 }, popup)).ok).toBe(true)
    vi.mocked(chrome.scripting.executeScript).mockRejectedValueOnce(new Error("Cannot access this page"))
    expect(await request({ type: "open", tabId: 1 }, popup)).toMatchObject({
      ok: false,
      error: "Cannot access this page"
    })
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 1, url: "chrome://settings" } as chrome.tabs.Tab)
    expect(await request({ type: "open", tabId: 1 }, popup)).toMatchObject({
      ok: false,
      error: expect.stringContaining("HTTP/HTTPS")
    })
  })

  it("recognizes its own delayed removal after rebuilding the background", async () => {
    delayRemoval = true
    await toggle((await list())[0], "disable")
    expect(jar).toHaveLength(0)
    await boot()
    delayedRemoval!()
    delayRemoval = false
    await toggle((await list())[0], "enable")
    expect(jar[0]?.value).toBe("initial")
  })

  it("reports a partial identity move when the website replaces the old Cookie during save", async () => {
    const entry = (await list())[0]
    const set = vi.mocked(chrome.cookies.set)
    const normalSet = set.getMockImplementation()!
    set.mockImplementationOnce(async (...args: Parameters<typeof chrome.cookies.set>) => {
      const result = await normalSet(...args)
      websiteWrite(cookie({ value: "newer old identity" }))
      return result
    })
    expect(await edit(entry, { name: "renamed" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("原 Cookie 已变化")
    })
    expect(jar).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "renamed" }),
        expect.objectContaining({ name: "token", value: "newer old identity" })
      ])
    )
  })

  it("recovers the latest version written while the disable removal marker is being persisted", async () => {
    const set = vi.mocked(chrome.storage.local.set)
    const normalSet = set.getMockImplementation()!
    let injected = false
    set.mockImplementation(async (values: Record<string, unknown>) => {
      const rules = values.cookieEditorRules as { removal?: string }[] | undefined
      if (rules?.some((rule) => rule.removal) && !injected) {
        injected = true
        websiteWrite(cookie({ value: "written during persistence" }))
      }
      return normalSet(values)
    })
    await toggle((await list())[0], "disable")
    const latest = (await list())[0]
    expect(latest.cookie.value).toBe("written during persistence")
    expect(jar).toHaveLength(0)
    await toggle(latest, "enable")
    expect(jar[0]?.value).toBe("written during persistence")
  })

  it("notifies an already open panel after rebuilding the background without another list request", async () => {
    await list()
    await boot()
    websiteWrite(cookie({ value: "changed after worker wake" }))
    await vi.waitFor(() =>
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { target: "cookie-editor-ui", type: "changed" },
        { frameId: 0 }
      )
    )
  })
  it("keeps latest recovery data for an indistinguishable concurrent website expiry", async () => {
    const set = vi.mocked(chrome.cookies.set)
    const normalSet = set.getMockImplementation()!
    set.mockImplementationOnce(async (...args: Parameters<typeof chrome.cookies.set>) => {
      const removed = jar[0]
      jar = []
      emit(removed, true, "expired_overwrite")
      return normalSet(...args)
    })
    expect((await toggle((await list())[0], "disable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
    const disabled = (await list())[0]
    expect(disabled).toMatchObject({ disabled: true, cookie: { value: "initial" } })
    expect((await toggle(disabled, "enable")).ok).toBe(true)
    expect(jar).toEqual([expect.objectContaining({ name: "token", value: "initial" })])
  })

  it("does not restore an identifiable website expiry outside its own removal window", async () => {
    await toggle((await list())[0], "disable")
    await list()
    const removed = cookie({ value: "website version" })
    websiteWrite(removed)
    jar = []
    emit(removed, true, "expired_overwrite")
    expect((await toggle((await list())[0], "enable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
    expect(await list()).toHaveLength(0)
  })
  it("does not restore a website expiry after a rejected removal and background restart", async () => {
    const entry = (await list())[0]
    failSet = true
    expect(await toggle(entry, "disable")).toMatchObject({ ok: false, error: "set failed" })
    expect(jar).toHaveLength(1)
    failSet = false
    let release!: () => void
    readStorageGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await boot()
    const removed = jar[0]
    jar = []
    emit(removed, true, "expired_overwrite")
    release()
    expect((await toggle((await list())[0], "enable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
    expect(await list()).toHaveLength(0)
  })

  it("does not attribute a website expiry to an in-flight removal that subsequently rejects", async () => {
    const entry = (await list())[0]
    vi.mocked(chrome.cookies.set).mockImplementationOnce(async () => {
      const removed = jar[0]
      jar = []
      emit(removed, true, "expired_overwrite")
      throw new Error("set failed")
    })
    expect(await toggle(entry, "disable")).toMatchObject({ ok: false, error: "set failed" })
    expect((await toggle((await list())[0], "enable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
  })

  it("reports persistent attribution cleanup failures and retains the disable rule for retry", async () => {
    const entry = (await list())[0]
    vi.mocked(chrome.cookies.set).mockImplementationOnce(async () => {
      failStorage = true
      throw new Error("set failed")
    })
    const response = await toggle(entry, "disable")
    expect(response).toMatchObject({ ok: false, error: expect.stringContaining("持久移除标记清理失败") })
    expect(jar).toHaveLength(1)
    failStorage = false
    const disabled = (await list())[0]
    expect(disabled).toMatchObject({ disabled: true, cookie: { value: "initial" } })
    expect(jar).toHaveLength(0)
    expect((await toggle(disabled, "enable")).ok).toBe(true)
    expect(jar[0].value).toBe("initial")
  })

  it("can turn Secure off and on without changing the Cookie identity or other attributes", async () => {
    expect((await edit((await list())[0], { secure: false })).ok).toBe(true)
    expect(jar).toEqual([
      expect.objectContaining({
        name: "token",
        value: "initial",
        domain: "app.example.com",
        path: "/",
        storeId: "0",
        hostOnly: true,
        httpOnly: true,
        sameSite: "lax",
        session: true,
        secure: false
      })
    ])
    expect((await edit((await list())[0], { secure: true })).ok).toBe(true)
    expect(jar).toHaveLength(1)
    expect(jar[0].secure).toBe(true)
  })

  it("revokes persistent attribution when a removal returns without removing the Cookie", async () => {
    const entry = (await list())[0]
    vi.mocked(chrome.cookies.set).mockResolvedValueOnce(null)
    expect(await toggle(entry, "disable")).toMatchObject({ ok: false, error: expect.stringContaining("移除失败") })
    expect(jar).toHaveLength(1)
    let release!: () => void
    readStorageGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await boot()
    const removed = jar[0]
    jar = []
    emit(removed, true, "expired_overwrite")
    release()
    expect((await toggle((await list())[0], "enable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
  })
  it("does not trust failed removal attribution after persistent cleanup fails and the worker restarts", async () => {
    const entry = (await list())[0]
    vi.mocked(chrome.cookies.set).mockImplementationOnce(async () => {
      failStorage = true
      throw new Error("set failed")
    })
    expect(await toggle(entry, "disable")).toMatchObject({
      ok: false,
      error: expect.stringContaining("持久移除标记清理失败")
    })
    failStorage = false
    let release!: () => void
    readStorageGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await boot()
    const removed = jar[0]
    jar = []
    emit(removed, true, "expired_overwrite")
    release()
    expect((await toggle((await list())[0], "enable")).ok).toBe(true)
    expect(jar).toHaveLength(0)
  })

  it("does not trust leftover session attribution when session cleanup fails but durable cleanup succeeds", async () => {
    const entry = (await list())[0]
    const set = vi.mocked(chrome.storage.session.set)
    const normalSet = set.getMockImplementation()!
    set.mockImplementation(async (values: Record<string, unknown>) => {
      const markers = values.cookieEditorPendingRemovals as string[] | undefined
      if (markers?.length === 0) throw new Error("session cleanup failed")
      return normalSet(values)
    })
    failSet = true
    expect(await toggle(entry, "disable")).toMatchObject({
      ok: false,
      error: expect.stringContaining("持久移除标记清理失败")
    })
    failSet = false
    let release!: () => void
    readStorageGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await boot()
    const removed = jar[0]
    jar = []
    emit(removed, true, "expired_overwrite")
    release()
    await toggle((await list())[0], "enable")
    expect(jar).toHaveLength(0)
  })
})
