import contentScript from "./content.ts?script"
import {
  cookieId,
  pageUnavailableReason,
  type Cookie,
  type CookieEntry,
  type CookieOriginal,
  type CookieRequest,
  type CookieResponse
} from "./types"

type Context = { tabId: number; url: URL; storeId: string; partitionKey: chrome.cookies.CookiePartitionKey }
// The repo's Chrome declarations predate this API (Chrome 132).
const partitionAPI = () =>
  chrome.cookies as typeof chrome.cookies & {
    getPartitionKey(details: {
      tabId: number
      frameId: number
    }): Promise<{ partitionKey: chrome.cookies.CookiePartitionKey }>
  }

function inScope(cookie: Cookie, context: Context) {
  const domain = cookie.domain.replace(/^\./, "").toLowerCase()
  const host = context.url.hostname
  return (
    cookie.storeId === context.storeId &&
    (cookie.hostOnly ? domain === host : host === domain || host.endsWith(`.${domain}`)) &&
    (!cookie.partitionKey ||
      (cookie.partitionKey.topLevelSite === context.partitionKey.topLevelSite &&
        (cookie.partitionKey.hasCrossSiteAncestor ?? false) === (context.partitionKey.hasCrossSiteAncestor ?? false)))
  )
}

async function contextFor(message: CookieRequest, sender: chrome.runtime.MessageSender): Promise<Context> {
  if (sender.id !== chrome.runtime.id) throw new Error("不受信任的扩展消息")
  if (sender.tab && sender.frameId !== 0) throw new Error("仅支持顶层网页")
  const tabId = sender.tab?.id ?? message.tabId
  if (tabId === undefined) throw new Error("无法读取当前标签页")
  if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("请求必须来自扩展页面")
  const tab = await chrome.tabs.get(tabId)
  const reason = pageUnavailableReason(tab.url)
  if (reason) throw new Error(reason)
  if (sender.tab && sender.url && new URL(sender.url).origin !== new URL(tab.url!).origin)
    throw new Error("网页已跳转，请重新打开编辑器")
  const stores = await chrome.cookies.getAllCookieStores()
  const store = stores.find((item) => item.tabIds.includes(tabId))
  if (!store) throw new Error("无法确定 Cookie 存储区")
  const { partitionKey } = await partitionAPI().getPartitionKey({ tabId, frameId: 0 })
  return { tabId, url: new URL(tab.url!), storeId: store.id, partitionKey }
}

async function scopeCookies(context: Context) {
  const [ordinary, partitioned] = await Promise.all([
    chrome.cookies.getAll({ storeId: context.storeId }),
    chrome.cookies.getAll({ storeId: context.storeId, partitionKey: context.partitionKey })
  ])
  return [...ordinary.filter((item) => !item.partitionKey), ...partitioned.filter((item) => item.partitionKey)].filter(
    (item) => inScope(item, context)
  )
}

type Rule = { cookie: Cookie; recoverable: boolean; version: number; removal?: string }
type Removal = { marker: string; failed: boolean }
type OpenNotice = { target: "cookie-editor-opened"; ok: boolean; error?: string }
const RULES_KEY = "cookieEditorRules"
const LEGACY_KEY = "cookieEditorDisabledCookies"
const SUBSCRIBERS_KEY = "cookieEditorSubscribers"
const REMOVALS_KEY = "cookieEditorPendingRemovals"

function detailsFor(cookie: Cookie): chrome.cookies.SetDetails {
  return {
    // Clearing Secure still requires a trustworthy setting source to overwrite a Secure cookie.
    url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    storeId: cookie.storeId,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    ...(!cookie.hostOnly ? { domain: cookie.domain } : {}),
    ...(!cookie.session ? { expirationDate: cookie.expirationDate } : {}),
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
  }
}

function isCookie(value: unknown): value is Cookie {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  return (
    ["name", "value", "domain", "path", "storeId"].every((key) => typeof item[key] === "string") &&
    ["hostOnly", "secure", "httpOnly", "session"].every((key) => typeof item[key] === "boolean") &&
    ["lax", "strict", "no_restriction", "unspecified"].includes(String(item.sameSite)) &&
    (item.session === true || (typeof item.expirationDate === "number" && Number.isFinite(item.expirationDate))) &&
    (!item.partitionKey ||
      (typeof item.partitionKey === "object" &&
        typeof (item.partitionKey as chrome.cookies.CookiePartitionKey).topLevelSite === "string"))
  )
}

export function registerCookieEditorBackground() {
  let rules = new Map<string, Rule>()
  const versions = new Map<string, number>()
  const observed = new Map<string, number>()
  const removals = new Map<string, Removal>()
  let pendingRemovals = new Set<string>()
  const subscribers = new Set<number>()
  const openings = new Map<number, (notice: OpenNotice) => void>()
  const epoch = crypto.randomUUID()
  let sequence = 0
  let initialized = false
  let warning: string | undefined
  const revision = (cookie: Cookie, rule?: Rule) =>
    JSON.stringify([epoch, rule?.version ?? versions.get(cookieId(cookie)) ?? 0, cookie, rule?.recoverable])
  const notify = (error?: string) => {
    for (const tabId of subscribers)
      void chrome.tabs
        .sendMessage(
          tabId,
          { target: "cookie-editor-ui", type: "changed", ...(error ? { error } : {}) },
          { frameId: 0 }
        )
        .catch(() => {
          void enqueue(async () => {
            if (subscribers.delete(tabId)) await chrome.storage.session.set({ [SUBSCRIBERS_KEY]: [...subscribers] })
          }).catch(() => {})
        })
  }
  const persist = async (next: Map<string, Rule>) => {
    await chrome.storage.local.set({ [RULES_KEY]: [...next.values()] })
    rules = next
  }
  const update = async (id: string, rule?: Rule) => {
    const next = new Map(rules)
    if (rule) next.set(id, rule)
    else next.delete(id)
    await persist(next)
  }
  const persistPendingRemovals = async (next: Set<string>) => {
    await chrome.storage.session.set({ [REMOVALS_KEY]: [...next] })
    pendingRemovals = next
  }
  const clearRemoval = async (id: string, marker: string, nextRule?: Rule) => {
    const failures: string[] = []
    if (pendingRemovals.has(marker)) {
      const next = new Set(pendingRemovals)
      next.delete(marker)
      try {
        await persistPendingRemovals(next)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "会话存储错误")
      }
    }
    const rule = nextRule ?? rules.get(id)
    if (rule && (nextRule || rule.removal === marker)) {
      const clean = { ...rule }
      if (clean.removal === marker) delete clean.removal
      try {
        await update(id, clean)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "规则存储错误")
      }
    }
    if (failures.length) throw new Error(`持久移除标记清理失败：${failures.join("；")}；请在存储恢复后重新载入核实`)
  }
  const exact = async (cookie: Cookie) =>
    (
      await chrome.cookies.getAll({
        storeId: cookie.storeId,
        ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
      })
    ).find((item) => cookieId(item) === cookieId(cookie))
  const erase = async (cookie: Cookie, movingIdentity = false) => {
    const current = await exact(cookie)
    // A later website write has its own queued observation; never remove it using an older version.
    if (!current) return
    if (JSON.stringify(current) !== JSON.stringify(cookie)) {
      if (movingIdentity) throw new Error("原 Cookie 已变化，新 Cookie 已保存；请重新载入核实两条记录")
      return
    }
    const id = cookieId(cookie)
    const removal: Removal = { marker: crypto.randomUUID(), failed: false }
    const rule = rules.get(id)
    // Persist self-removal attribution before the write; its event can wake a new worker.
    if (rule) await update(id, { ...rule, removal: removal.marker })
    const revoke = async () => {
      // A deletion event can arrive before the rejected write settles.
      removal.failed = true
      removals.delete(id)
      try {
        await clearRemoval(id, removal.marker)
      } catch (error) {
        throw new Error(`Cookie 移除失败，${error instanceof Error ? error.message : "移除归属清理失败"}`)
      }
    }
    try {
      await persistPendingRemovals(new Set(pendingRemovals).add(removal.marker))
      removals.set(id, removal)
      await chrome.cookies.set({ ...detailsFor(cookie), value: "", expirationDate: 1 })
    } catch (error) {
      await revoke()
      throw error
    }
    const remaining = await exact(cookie)
    if (remaining && (movingIdentity || JSON.stringify(remaining) === JSON.stringify(current))) {
      await revoke()
      throw new Error(
        movingIdentity ? "新 Cookie 已保存，原 Cookie 移除未完成，请重新载入核实" : "Cookie 移除失败，禁用规则仍保留"
      )
    }
  }
  const write = async (cookie: Cookie) => {
    const result = await chrome.cookies.set(detailsFor(cookie))
    if (!result) throw new Error("Cookie 写入失败，请检查属性和有效期")
    if (cookieId(result) !== cookieId(cookie)) throw new Error("浏览器调整了 Cookie 身份，请重新载入列表核实")
    return result
  }
  const observe = async (cookie: Cookie, removed: boolean, order: number) => {
    const id = cookieId(cookie)
    if ((observed.get(id) ?? 0) > order) return
    observed.set(id, order)
    versions.set(id, (versions.get(id) ?? 0) + 1)
    const rule = rules.get(id)
    if (rule) {
      const next = {
        cookie,
        recoverable: !removed,
        version: rule.version + 1,
        ...(!removed && rule.removal ? { removal: rule.removal } : {})
      }
      if (removed) {
        removals.delete(id)
        if (rule.removal) await clearRemoval(id, rule.removal, next)
        else await update(id, next)
      } else {
        await update(id, next)
        await erase(cookie)
      }
    }
  }
  const reconcile = async () => {
    for (const [id, rule] of rules) {
      const order = ++sequence
      const current = await exact(rule.cookie)
      if (!current) continue
      if (JSON.stringify(current) !== JSON.stringify(rule.cookie) || !rule.recoverable)
        await observe(current, false, order)
      else {
        observed.set(id, order)
        await erase(current)
      }
    }
  }
  const initialize = async () => {
    const [data, session] = await Promise.all([
      chrome.storage.local.get([RULES_KEY, LEGACY_KEY]),
      chrome.storage.session.get([SUBSCRIBERS_KEY, REMOVALS_KEY])
    ])
    if (Array.isArray(session[REMOVALS_KEY]))
      pendingRemovals = new Set(session[REMOVALS_KEY].filter((marker: unknown) => typeof marker === "string"))
    if (Array.isArray(session[SUBSCRIBERS_KEY]))
      for (const id of session[SUBSCRIBERS_KEY]) {
        if (Number.isInteger(id) && id >= 0) subscribers.add(id)
      }
    if (data[RULES_KEY] !== undefined) {
      if (!Array.isArray(data[RULES_KEY])) throw new Error("Cookie 禁用规则损坏，未执行 Cookie 操作")
      for (const rule of data[RULES_KEY]) {
        if (!isCookie(rule?.cookie) || typeof rule.recoverable !== "boolean" || !Number.isFinite(rule.version))
          throw new Error("Cookie 禁用规则损坏，未执行 Cookie 操作")
        rules.set(cookieId(rule.cookie), rule)
        if (rule.removal && pendingRemovals.has(rule.removal))
          removals.set(cookieId(rule.cookie), { marker: rule.removal, failed: false })
      }
    } else if (data[LEGACY_KEY] && typeof data[LEGACY_KEY] === "object") {
      for (const entries of Object.values(data[LEGACY_KEY])) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries)
          if (isCookie(entry?.cookie) && entry.enabled === false) {
            const cookie = {
              ...entry.cookie,
              value: typeof entry.draft === "string" ? entry.draft : entry.cookie.value
            }
            rules.set(cookieId(cookie), { cookie, recoverable: true, version: 1 })
          }
      }
      await persist(rules)
    }
    initialized = true
  }
  const ready = initialize()
  // All events and commands share an ordered queue; failures do not stop later operations.
  let queue: Promise<unknown> = ready.catch(() => {})
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      await ready
      return task()
    })
    queue = result.catch((error: unknown) => {
      warning = error instanceof Error ? error.message : "Cookie 操作失败"
      notify(warning)
    })
    return result
  }
  chrome.cookies.onChanged.addListener(({ cookie, removed, cause }) => {
    if (removed && cause === "overwrite") return
    const id = cookieId(cookie)
    const loading = !initialized
    let ownRemoval = removed && cause === "expired_overwrite" ? removals.get(id) : undefined
    if (ownRemoval) removals.delete(id)
    const order = ++sequence
    void enqueue(async () => {
      if (loading && removed && cause === "expired_overwrite") {
        ownRemoval ??= removals.get(id)
        if (ownRemoval) removals.delete(id)
      }
      const rule = rules.get(id)
      if (ownRemoval && !ownRemoval.failed) {
        // shortcut: Chrome omits removal sources; a website expiry during our set IPC is indistinguishable until the API exposes attribution.
        if (rule) {
          const clean = { ...rule }
          // The expired write can remove a newer Cookie than the one read before storage awaited.
          if ((observed.get(id) ?? 0) <= order && JSON.stringify(rule.cookie) !== JSON.stringify(cookie)) {
            clean.cookie = cookie
            clean.recoverable = true
            clean.version++
            observed.set(id, order)
          }
          await clearRemoval(id, ownRemoval.marker, clean)
        } else await clearRemoval(id, ownRemoval.marker)
        return
      }
      await observe(cookie, removed, order)
      notify()
    }).catch(() => {})
  })
  // Queue startup reconciliation after observations captured while storage was loading.
  void ready
    .then(() => enqueue(reconcile))
    .catch((error: unknown) => {
      warning = error instanceof Error ? error.message : "Cookie 初始化失败"
      notify(warning)
    })

  const entriesFor = async (context: Context): Promise<CookieEntry[]> => {
    const entries = (await scopeCookies(context))
      .filter((cookie) => !rules.has(cookieId(cookie)))
      .map((cookie) => ({ id: cookieId(cookie), revision: revision(cookie), cookie, disabled: false }))
    for (const [id, rule] of rules)
      if (inScope(rule.cookie, context))
        entries.push({ id, revision: revision(rule.cookie, rule), cookie: rule.cookie, disabled: true })
    return entries
  }
  const originalEntry = (entries: CookieEntry[], original?: CookieOriginal) => {
    if (!original) return undefined
    const entry = entries.find((item) => item.id === original.id)
    if (!entry || entry.revision !== original.revision) throw new Error("Cookie 已变化，请重新载入最新版本后再保存")
    return entry
  }
  chrome.runtime.onMessage.addListener(
    (incoming: CookieRequest | OpenNotice, sender, respond: (response: CookieResponse) => void) => {
      if (incoming?.target === "cookie-editor-opened") {
        if (sender.id === chrome.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0)
          openings.get(sender.tab.id)?.(incoming)
        respond({ ok: true })
        return false
      }
      if (incoming?.target !== "cookie-editor") return false
      const message = incoming
      void enqueue(async (): Promise<CookieResponse> => {
        const context = await contextFor(message, sender)
        if (message.type === "open") {
          if (sender.tab) throw new Error("请从扩展弹窗打开编辑器")
          let timer: ReturnType<typeof setTimeout> | undefined
          const opened = new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("面板未能打开，请刷新网页后重试")), 5000)
            openings.set(context.tabId, (notice) =>
              notice.ok ? resolve() : reject(new Error(notice.error ?? "面板打开失败"))
            )
          })
          // The CRX loader imports asynchronously, so injection alone does not confirm the panel mounted.
          try {
            await Promise.all([
              opened,
              chrome.scripting.executeScript({
                target: { tabId: context.tabId, frameIds: [0] },
                files: [contentScript]
              })
            ])
          } finally {
            clearTimeout(timer)
            openings.delete(context.tabId)
          }
          return { ok: true }
        }
        if (!subscribers.has(context.tabId)) {
          await chrome.storage.session.set({ [SUBSCRIBERS_KEY]: [...subscribers, context.tabId] })
          subscribers.add(context.tabId)
        }
        await reconcile()
        const entries = await entriesFor(context)
        const original = "original" in message ? originalEntry(entries, message.original) : undefined
        if (message.type === "disable") {
          if (!original || original.disabled) throw new Error("Cookie 状态已变化，请重新载入")
          await update(original.id, { cookie: original.cookie, recoverable: true, version: 1 })
          await erase(original.cookie)
        } else if (message.type === "enable") {
          if (!original || !original.disabled) throw new Error("Cookie 状态已变化，请重新载入")
          const rule = rules.get(original.id)!
          if (rule.recoverable && (rule.cookie.session || (rule.cookie.expirationDate ?? 0) > Date.now() / 1000)) {
            const restored = await write(rule.cookie)
            try {
              await update(original.id)
            } catch (error) {
              await erase(restored)
              throw error
            }
          } else await update(original.id)
        } else if (message.type === "save") {
          const cookie = validateDraft(message.cookie, context, original)
          const id = cookieId(cookie)
          if (entries.some((item) => item.id === id && item.id !== original?.id))
            throw new Error("该 Cookie 身份已存在，请编辑已有条目")
          if (original?.disabled) {
            const next = new Map(rules)
            next.delete(original.id)
            next.set(id, { cookie, recoverable: true, version: rules.get(original.id)!.version + 1 })
            await persist(next)
          } else {
            await write(cookie)
            if (original && original.id !== id) await erase(original.cookie, true)
          }
        } else if (message.type !== "list") throw new Error("未知 Cookie 命令")
        if (message.type !== "list") {
          warning = undefined
          notify()
        }
        return {
          ok: true,
          entries: await entriesFor(context),
          hostname: context.url.hostname,
          storeId: context.storeId,
          secure: context.url.protocol === "https:",
          ...(warning ? { warning } : {})
        }
      }).then(respond, (error: unknown) =>
        respond({ ok: false, error: error instanceof Error ? error.message : "Cookie 操作失败" })
      )
      return true
    }
  )
}

const hasControl = (value: string) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)

function validateDraft(value: unknown, context: Context, original?: CookieEntry): Cookie {
  if (!isCookie(value)) throw new Error("Cookie 属性无效")
  const cookie = structuredClone(value)
  if (!cookie.name || hasControl(cookie.name) || [...cookie.name].some((char) => ' ()<>@,;:\\"/[]?={}'.includes(char)))
    throw new Error("名称不能为空或包含非法字符")
  if (hasControl(cookie.value) || cookie.value.includes(";")) throw new Error("Cookie 值包含非法字符")
  cookie.domain = cookie.domain.toLowerCase()
  if (!cookie.hostOnly) cookie.domain = `.${cookie.domain.replace(/^\./, "")}`
  if (!inScope(cookie, context) || (cookie.hostOnly && cookie.domain !== context.url.hostname))
    throw new Error("Cookie 必须属于当前主机、存储区与分区")
  if (!cookie.path.startsWith("/") || hasControl(cookie.path) || /[;?#]/.test(cookie.path))
    throw new Error("Path 必须是以 / 开头的有效路径")
  if (JSON.stringify(cookie.partitionKey ?? null) !== JSON.stringify(original?.cookie.partitionKey ?? null))
    throw new Error("不支持新增或修改分区标识")
  if (!cookie.session && (cookie.expirationDate ?? 0) <= Date.now() / 1000) throw new Error("过期时间必须在未来")
  if (cookie.sameSite === "no_restriction" && !cookie.secure) throw new Error("SameSite=None 需要开启 Secure")
  if (cookie.partitionKey && !cookie.secure) throw new Error("分区 Cookie 需要开启 Secure")
  if (cookie.session) delete cookie.expirationDate
  return cookie
}
