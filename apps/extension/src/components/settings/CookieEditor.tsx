import { Collapsible } from "@base-ui/react/collapsible"
import Dialog from "@components/Dialog"
import { cn } from "@chrome-ninja/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks"

function CookieIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 9 9c-2.8 0-4.2-1.4-4.2-3.7A5.3 5.3 0 0 0 12 3Z" />
      <path d="M8.5 9.5h.01" />
      <path d="M10.5 14.5h.01" />
      <path d="M15 13h.01" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className ?? "size-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-15.5-6.4L3 7" />
      <path d="M3 3v4h4" />
      <path d="M3 12a9 9 0 0 0 15.5 6.4L21 17" />
      <path d="M21 21v-4h-4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 4.5 2.4 18a1.6 1.6 0 0 0 1.4 2.4h16.4a1.6 1.6 0 0 0 1.4-2.4L13.7 4.5a1.6 1.6 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

type CookieItem = chrome.cookies.Cookie & {
  id: string
}

type StoredCookie = Omit<CookieItem, "id">

type CookieSnapshot = {
  pageTitle: string
  pageUrl: string
  entries: CookieEntry[]
  savedAt: number
}

type CookieEntry = {
  id: string
  cookie: StoredCookie
  draft: string
  enabled: boolean
}

const COOKIE_ORIGINAL_STORAGE_KEY = "cookieEditorOriginalSnapshots"
const COOKIE_DISABLED_STORAGE_KEY = "cookieEditorDisabledCookies"

type SyncState = "idle" | "saving" | "saved" | "error"

function getCookieId(cookie: chrome.cookies.Cookie) {
  const partitionKey = getPartitionKey(cookie)
  return [cookie.name, cookie.domain, cookie.path, cookie.storeId, partitionKey?.topLevelSite ?? ""].join("|")
}

function getPartitionKey(cookie: chrome.cookies.Cookie) {
  const value = (cookie as chrome.cookies.Cookie & { partitionKey?: unknown }).partitionKey
  if (!value || typeof value !== "object") {
    return undefined
  }

  const topLevelSite = (value as { topLevelSite?: unknown }).topLevelSite
  return typeof topLevelSite === "string" && topLevelSite ? { topLevelSite } : undefined
}

function buildCookieDetails(cookie: chrome.cookies.Cookie, url: string, value: string) {
  const details: chrome.cookies.SetDetails & { partitionKey?: { topLevelSite: string } } = {
    url,
    name: cookie.name,
    value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate,
    storeId: cookie.storeId
  }

  const partitionKey = getPartitionKey(cookie)
  if (partitionKey) {
    details.partitionKey = partitionKey
  }

  return details
}

function buildCookieRemoveDetails(cookie: chrome.cookies.Cookie, fallbackUrl: string) {
  const details: Parameters<typeof chrome.cookies.remove>[0] & { partitionKey?: { topLevelSite: string } } = {
    url: getCookieUrl(cookie, fallbackUrl),
    name: cookie.name,
    storeId: cookie.storeId
  }

  const partitionKey = getPartitionKey(cookie)
  if (partitionKey) {
    details.partitionKey = partitionKey
  }

  return details
}

function getCookieUrl(cookie: chrome.cookies.Cookie, fallbackUrl: string) {
  const fallback = new URL(fallbackUrl)
  const host = cookie.domain.replace(/^\./, "") || fallback.hostname
  const path = cookie.path.startsWith("/") ? cookie.path : "/"
  return `${cookie.secure ? "https" : fallback.protocol.replace(":", "")}://${host}${path}`
}

function stripCookieId(cookie: CookieItem): StoredCookie {
  const rest = { ...cookie } as StoredCookie & { id?: string }
  delete rest.id
  return rest
}

function toCookieEntry(cookie: chrome.cookies.Cookie): CookieEntry {
  return {
    id: getCookieId(cookie),
    cookie: stripCookieId({ ...cookie, id: getCookieId(cookie) }),
    draft: cookie.value,
    enabled: true
  }
}

function getEntryId(entry: CookieEntry) {
  return entry.id
}

function normalizeEntries(entries: CookieEntry[]) {
  return entries
    .slice()
    .sort((a, b) => getEntryId(a).localeCompare(getEntryId(b)))
    .map((entry) => ({ id: entry.id, draft: entry.draft, enabled: entry.enabled }))
}

function areEntriesEqual(currentEntries: CookieEntry[], snapshotEntries: CookieEntry[]) {
  const current = normalizeEntries(currentEntries)
  const snapshot = normalizeEntries(snapshotEntries)

  if (current.length !== snapshot.length) {
    return false
  }

  return current.every((item, index) => item.id === snapshot[index].id && item.draft === snapshot[index].draft && item.enabled === snapshot[index].enabled)
}

function getSnapshotKey(pageUrl: string) {
  return new URL(pageUrl).origin
}

function readStorageMap<T>(key: string) {
  return new Promise<Record<string, T>>((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve((result[key] as Record<string, T> | undefined) ?? {})
    })
  })
}

function writeStorageMap<T>(key: string, nextMap: Record<string, T>) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set({ [key]: nextMap }, () => resolve())
  })
}

function CookieRow({
  entry,
  pageUrl,
  onSaved,
  onDirty,
  onToggle
}: {
  entry: CookieEntry
  pageUrl: string
  onSaved: (id: string, value: string) => void
  onDirty: () => void
  onToggle: (entry: CookieEntry, enabled: boolean, draft: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(entry.draft)
  const [syncState, setSyncState] = useState<SyncState>("idle")
  const [error, setError] = useState("")
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setDraft(entry.draft)
    setSyncState("idle")
    setError("")
  }, [entry.draft, entry.id])

  useEffect(() => {
    if (!entry.enabled || draft === entry.draft) {
      setSyncState("idle")
      setError("")
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return undefined
    }

    onDirty()
    setSyncState("saving")
    setError("")

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      void chrome.cookies
        .set(buildCookieDetails(entry.cookie, pageUrl, draft))
        .then((result) => {
          if (!result) {
            throw new Error("写入 cookie 失败")
          }

          onSaved(entry.id, draft)
          setSyncState("saved")
        })
        .catch((reason) => {
          setSyncState("error")
          setError(reason instanceof Error ? reason.message : "写入 cookie 失败")
        })
    }, 1000)

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [draft, entry, entry.draft, entry.id, onDirty, onSaved, pageUrl])

  const statusLabel = useMemo(() => {
    switch (syncState) {
      case "saving":
        return "同步中"
      case "saved":
        return "已同步"
      case "error":
        return "同步失败"
      default:
        return "就绪"
    }
  }, [syncState])

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="group flex w-full items-start gap-3 rounded-[14px] border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm transition-all hover:border-[#9bc8ff] hover:bg-slate-50 active:bg-[#f4f8ff]">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] text-[#005bd1]">
          <CookieIcon />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-slate-950">{entry.cookie.name}</span>
            <span className="rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[11px] font-medium text-[#005bd1]">{statusLabel}</span>
          </span>
          <span className="mt-1 block truncate text-xs leading-4 text-slate-500">
            {entry.cookie.domain} · {entry.cookie.path}
          </span>
        </span>

        <span
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", entry.enabled ? "bg-[#101828]" : "bg-slate-300")}
          role="switch"
          aria-checked={entry.enabled}
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(entry, !entry.enabled, draft)
          }}
          onKeyDown={(event) => {
            if (event.key !== " " && event.key !== "Enter") return
            event.preventDefault()
            event.stopPropagation()
            onToggle(entry, !entry.enabled, draft)
          }}>
          <span className={cn("absolute top-0.5 block size-5 rounded-full bg-white shadow transition-transform", entry.enabled ? "translate-x-5" : "translate-x-0.5")} />
        </span>

        <span className="mt-0.5 flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
          {open ? "收起" : "展开"}
          <span className={cn("transition-transform", open && "rotate-180")}>
            <ChevronDownIcon />
          </span>
        </span>
      </Collapsible.Trigger>

      <Collapsible.Panel className="px-1 pb-1 pt-3" keepMounted={false}>
        <div className="rounded-[14px] border border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs font-medium text-slate-600">
            value
            <textarea
              className="mt-1 min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0077ff]"
              spellcheck={false}
              value={draft}
              disabled={!entry.enabled}
              placeholder="输入 cookie value"
              onInput={(event) => setDraft((event.target as HTMLTextAreaElement).value)}
            />
          </label>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-4 text-slate-500">
            <span className="flex items-center gap-1.5">
              {syncState === "saving" ? <RefreshIcon className="size-3.5 animate-spin" /> : syncState === "saved" ? <CheckIcon /> : syncState === "error" ? <AlertIcon /> : null}
              <span>{syncState === "error" && error ? error : statusLabel}</span>
            </span>
            <span>
              {entry.cookie.secure ? "Secure" : "Insecure"} · {entry.cookie.httpOnly ? "HttpOnly" : "Readable"}
            </span>
          </div>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default function CookieEditor() {
  const [entries, setEntries] = useState<CookieEntry[]>([])
  const [pageUrl, setPageUrl] = useState("")
  const [pageTitle, setPageTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<CookieSnapshot | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const aliveRef = useRef(true)
  const snapshotWriteLockRef = useRef(false)

  useEffect(() => {
    void loadCookies()
    return () => {
      aliveRef.current = false
    }
  }, [])

  const loadCookies = async () => {
    setLoading(true)
    setError("")

    try {
      const [tabs, snapshots] = await Promise.all([
        chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true }),
        readStorageMap<CookieSnapshot>(COOKIE_ORIGINAL_STORAGE_KEY)
      ])
      const tab = tabs[0]
      if (!tab?.url) {
        throw new Error("找不到当前活动页面")
      }

      const url = new URL(tab.url)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("当前页面不是可编辑的 http/https 页面")
      }

      const [nextCookies, disabledMap] = await Promise.all([
        chrome.cookies.getAll({ url: url.href }),
        readStorageMap<CookieEntry[]>(COOKIE_DISABLED_STORAGE_KEY)
      ])
      if (!aliveRef.current) {
        return
      }

      setPageUrl(url.href)
      setPageTitle(tab.title || url.hostname)

      const nextSnapshotKey = getSnapshotKey(url.href)
      const storedSnapshot = snapshots[nextSnapshotKey] ?? null
      const disabledEntries = disabledMap[nextSnapshotKey] ?? []
      const enabledEntries = nextCookies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
        .map(toCookieEntry)
      const enabledIds = new Set(enabledEntries.map((entry) => entry.id))
      const nextEntries = [...enabledEntries, ...disabledEntries.filter((entry) => !enabledIds.has(entry.id))]
        .sort((a, b) => a.cookie.name.localeCompare(b.cookie.name) || a.cookie.path.localeCompare(b.cookie.path))

      setEntries(nextEntries)

      setSnapshot(storedSnapshot)
    } catch (reason) {
      if (!aliveRef.current) {
        return
      }

      setError(reason instanceof Error ? reason.message : "读取 cookie 失败")
      setEntries([])
      setPageUrl("")
      setPageTitle("")
    } finally {
      if (aliveRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadCookies()
  }

  const ensureOriginalSnapshot = useCallback(async () => {
    if (snapshot || snapshotWriteLockRef.current || !pageUrl || entries.length === 0) {
      return
    }

    snapshotWriteLockRef.current = true
    const nextSnapshot: CookieSnapshot = {
      pageTitle,
      pageUrl,
      entries,
      savedAt: Date.now()
    }
    setSnapshot(nextSnapshot)

    try {
      const snapshots = await readStorageMap<CookieSnapshot>(COOKIE_ORIGINAL_STORAGE_KEY)
      snapshots[getSnapshotKey(pageUrl)] = nextSnapshot
      await writeStorageMap(COOKIE_ORIGINAL_STORAGE_KEY, snapshots)
    } catch (reason) {
      setSnapshot(null)
      setError(reason instanceof Error ? reason.message : "保存 cookie 备份失败")
    } finally {
      snapshotWriteLockRef.current = false
    }
  }, [entries, pageUrl, pageTitle, snapshot])

  const handleRestore = async () => {
    if (!snapshot) {
      return
    }

    setIsRestoring(true)
    setError("")

    try {
      const targetUrl = pageUrl || snapshot.pageUrl
      await Promise.all(
        snapshot.entries.map((entry) => {
          return entry.enabled
            ? chrome.cookies.set(buildCookieDetails(entry.cookie, targetUrl, entry.draft))
            : chrome.cookies.remove(buildCookieRemoveDetails(entry.cookie, targetUrl))
        })
      )
      const [snapshots, disabledMap] = await Promise.all([
        readStorageMap<CookieSnapshot>(COOKIE_ORIGINAL_STORAGE_KEY),
        readStorageMap<CookieEntry[]>(COOKIE_DISABLED_STORAGE_KEY)
      ])
      const restoredDisabledEntries = snapshot.entries.filter((entry) => !entry.enabled)
      const snapshotKey = getSnapshotKey(snapshot.pageUrl)
      delete snapshots[snapshotKey]
      if (restoredDisabledEntries.length > 0) {
        disabledMap[snapshotKey] = restoredDisabledEntries
      } else {
        delete disabledMap[snapshotKey]
      }
      await Promise.all([
        writeStorageMap(COOKIE_ORIGINAL_STORAGE_KEY, snapshots),
        writeStorageMap(COOKIE_DISABLED_STORAGE_KEY, disabledMap)
      ])
      setSnapshot(null)
      await loadCookies()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复 cookie 失败")
    } finally {
      if (aliveRef.current) {
        setIsRestoring(false)
      }
    }
  }

  const handleSaved = useCallback((id: string, value: string) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, draft: value, cookie: { ...entry.cookie, value } } : entry)))
  }, [])

  const persistDisabledEntries = useCallback(async (nextEntries: CookieEntry[]) => {
    if (!pageUrl) return
    const disabledMap = await readStorageMap<CookieEntry[]>(COOKIE_DISABLED_STORAGE_KEY)
    const disabledEntries = nextEntries.filter((entry) => !entry.enabled)
    const key = getSnapshotKey(pageUrl)
    if (disabledEntries.length > 0) {
      disabledMap[key] = disabledEntries
    } else {
      delete disabledMap[key]
    }
    await writeStorageMap(COOKIE_DISABLED_STORAGE_KEY, disabledMap)
  }, [pageUrl])

  const handleToggle = useCallback((entry: CookieEntry, enabled: boolean, draft: string) => {
    void (async () => {
      await ensureOriginalSnapshot()
      const nextEntry = { ...entry, draft, enabled, cookie: { ...entry.cookie, value: draft } }
      const nextEntries = entries.map((item) => (item.id === entry.id ? nextEntry : item))
      setEntries(nextEntries)
      await persistDisabledEntries(nextEntries)

      if (enabled) {
        await chrome.cookies.set(buildCookieDetails(nextEntry.cookie, pageUrl, nextEntry.draft))
      } else {
        await chrome.cookies.remove(buildCookieRemoveDetails(nextEntry.cookie, pageUrl))
      }
    })().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "切换 cookie 状态失败")
    })
  }, [ensureOriginalSnapshot, entries, pageUrl, persistDisabledEntries])

  const isDirty = Boolean(snapshot) && !areEntriesEqual(entries, snapshot?.entries ?? [])
  const canRestore = Boolean(snapshot) && isDirty && !loading && !refreshing && !isRestoring
  const isBusy = loading || refreshing || isRestoring

  return (
    <>
      <button
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff]"
        type="button"
        onClick={() => setOpen(true)}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f2ff] text-[#005bd1] shadow-sm">
          <CookieIcon />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">Cookie 编辑器</span>
            <span className="rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[11px] font-medium text-[#005bd1]">{entries.length} 项</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">编辑当前页面 cookie</span>
        </span>

        <span className="text-2xl leading-none text-[#005bd1]">
          <ChevronRightIcon />
        </span>
      </button>

      <Dialog
        open={open}
        titleId="cookie-editor-title"
        onClose={() => setOpen(false)}
        initialFocusRef={closeButtonRef}
        panelClassName="max-h-[92vh] max-w-[720px] overflow-y-auto rounded-[14px] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">cookie editor</span>
            <h2 id="cookie-editor-title" className="mt-1 text-base font-semibold leading-5 text-slate-950">
              {pageTitle || "当前页面 cookie"}
            </h2>
            {pageUrl && <span className="mt-0.5 block truncate text-xs text-slate-500">{pageUrl}</span>}
          </span>

          <button
            ref={closeButtonRef}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            type="button"
            aria-label="关闭 cookie editor"
            onClick={() => setOpen(false)}>
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">current page</span>
              <span className="mt-1 block text-sm font-medium text-slate-950">{pageTitle || "当前页面 cookie"}</span>
            </span>

            <div className="flex shrink-0 items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={!canRestore}
                onClick={() => void handleRestore()}>
                <RestoreIcon />
                恢复
              </button>
              <button
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={isBusy}
                onClick={() => void handleRefresh()}>
                <RefreshIcon className={cn("size-4", refreshing && "animate-spin")} />
                刷新
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-4 text-red-700">{error}</p>}

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">正在读取当前页面 cookie。</div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">当前页面没有可编辑的 cookie。</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <CookieRow key={entry.id} entry={entry} pageUrl={pageUrl} onDirty={ensureOriginalSnapshot} onSaved={handleSaved} onToggle={handleToggle} />
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}
