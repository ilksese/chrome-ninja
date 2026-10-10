import { useEffect, useRef, useState } from "preact/hooks"
import type { JSX } from "preact"
import type {
  NetmonBody,
  NetmonCommand,
  NetmonFormEntry,
  NetmonHeader,
  NetmonRecord,
  NetmonRequestBody,
  NetmonTabState
} from "./types"
import { RECORD_LIMIT } from "./types"
import { curlCopyReason, queryParameters, requestCopyReason, toCurl, toFetch } from "./requests"

const PANEL_MARGIN = 16

type SortDir = "asc" | "desc"

const EMPTY_STATE: NetmonTabState = { enabled: true, rules: [], records: [] }

function isTopFrame(record: NetmonRecord) {
  return record.frameId === 0
}

function sendCommand(command: NetmonCommand) {
  void chrome.runtime.sendMessage({ target: "netmon", type: "COMMAND", command })
}

function formatStatus(record: NetmonRecord) {
  if (record.status === 0) return "ERR"
  return String(record.status)
}

function statusStyle(status: number): JSX.CSSProperties {
  if (status === 0) return { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
  if (status < 300) return { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }
  if (status < 400) return { background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" }
  if (status < 500) return { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }
  return { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
}

function formatDuration(duration: number) {
  if (duration < 1000) return `${Math.max(0, Math.round(duration))}ms`
  return `${(duration / 1000).toFixed(2)}s`
}

const plainButton: JSX.CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  textAlign: "inherit"
}

function toggleButtonStyle(): JSX.CSSProperties {
  return {
    ...plainButton,
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    fontSize: "12px",
    fontWeight: 600,
    color: "#1e293b"
  }
}

function Icon({ path, size = 12, strokeWidth = 2.5 }: { path: JSX.Element; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {path}
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease"
      }}>
      <Icon path={<polyline points="9 6 15 12 9 18" />} />
    </span>
  )
}

function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <Icon
      size={size}
      path={
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      }
    />
  )
}

function HeaderSection({ title, headers }: { title: string; headers: NetmonHeader[] }) {
  const [open, setOpen] = useState(false)
  if (headers.length === 0) return null
  return (
    <div style={{ borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
      <button style={toggleButtonStyle()} type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          {title} · {headers.length}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{ maxHeight: 160, overflowY: "auto", borderTop: "1px solid #e2e8f0", padding: "0.5rem 0.75rem" }}>
          {headers.map((header, index) => (
            <div key={index} style={{ marginBottom: 4, display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ maxWidth: "45%", minWidth: 0, wordBreak: "break-all", fontWeight: 500, color: "#64748b" }}>
                {header.name || "（空名称）"}
              </span>
              <span style={{ minWidth: 0, flex: 1, wordBreak: "break-all", whiteSpace: "pre-wrap", color: "#334155" }}>
                {header.value || "（空值）"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function useCopy(): [boolean, (text: string) => Promise<boolean>, string] {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")
  const timerRef = useRef<number>()
  useEffect(() => () => window.clearTimeout(timerRef.current), [])
  const copy = async (text: string) => {
    setError("")
    try {
      if (!navigator.clipboard) throw new Error("剪贴板不可用")
      await navigator.clipboard.writeText(text)
      window.clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      setCopied(false)
      setError("复制失败，请检查页面安全上下文或剪贴板权限后重试")
      return false
    }
  }
  return [copied, copy, error]
}

function BodySection({ title, body, note }: { title: string; body: NetmonBody | null; note?: string | null }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"json" | "raw">(body?.mode ?? "raw")
  const [copied, copy, error] = useCopy()
  if (!body && !note) return null
  const json = mode === "json"
  return (
    <div style={{ borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
      <button style={toggleButtonStyle()} type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          {title}
          {body?.truncated ? " · 已截断" : !body ? " · 不可用" : ""}
        </span>
        <ChevronIcon open={open} />
      </button>
      {note && (
        <p style={{ margin: 0, padding: "0 0.75rem 0.5rem", fontSize: 11, wordBreak: "break-word", color: "#92400e" }}>
          {note}
        </p>
      )}
      {body?.truncated && (
        <p style={{ margin: 0, padding: "0 0.75rem 0.5rem", fontSize: 11, color: "#92400e" }}>
          仅展示已采集片段，不是完整正文
        </p>
      )}
      {open && body && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.5rem 0.75rem" }}>
          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <button
              style={{
                ...plainButton,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 600,
                background: json ? "#101828" : "transparent",
                color: json ? "#fff" : "#64748b",
                opacity: body.mode === "json" ? 1 : 0.5
              }}
              type="button"
              disabled={body.mode !== "json"}
              onClick={() => setMode("json")}>
              JSON
            </button>
            <button
              style={{
                ...plainButton,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: 600,
                background: !json ? "#101828" : "transparent",
                color: !json ? "#fff" : "#64748b"
              }}
              type="button"
              onClick={() => setMode("raw")}>
              RAW
            </button>
            <button
              style={{
                ...plainButton,
                marginLeft: "auto",
                display: "grid",
                width: 24,
                height: 24,
                placeItems: "center",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: copied ? "#047857" : "#64748b"
              }}
              type="button"
              title={copied ? "已复制" : body.truncated ? `复制${title}片段` : `复制${title}`}
              aria-label={body.truncated ? `复制${title}片段` : `复制${title}`}
              onClick={() => void copy(body.text)}>
              <CopyIcon copied={copied} />
            </button>
          </div>
          {error && <p style={{ margin: "0 0 8px", fontSize: 11, color: "#b91c1c" }}>{error}</p>}
          <pre
            style={{
              maxHeight: 256,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontSize: 12,
              color: "#334155",
              margin: 0
            }}>
            {body.text === "" ? "（空正文）" : body.mode === "json" && json ? formatJson(body.text) : body.text}
          </pre>
        </div>
      )}
    </div>
  )
}

function RequestBodySection({ body }: { body: NetmonRequestBody | null }) {
  if (!body) return <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>请求体：无</p>
  if (body.kind === "unavailable") return <BodySection title="请求体" body={null} note={body.description} />
  if (body.kind === "text") return <BodySection title="请求体" body={body} note={body.note} />
  const fileCount = body.entries.filter((entry) => "file" in entry).length
  const fields: NetmonHeader[] = body.entries.map((entry: NetmonFormEntry) => ({
    name: entry.name,
    value:
      "file" in entry
        ? `文件：${entry.file.name || "未命名"} · ${entry.file.type || "未知类型"} · ${entry.file.size} 字节`
        : entry.value
  }))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <HeaderSection
        title={body.kind === "urlencoded" ? "请求体 · URL-encoded" : "请求体 · FormData"}
        headers={fields}
      />
      {fields.length === 0 && <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>请求体：空表单</p>}
      {body.truncated && <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>表单已截断，仅展示已采集字段</p>}
      {fileCount > 0 && <p style={{ margin: 0, fontSize: 11, color: "#92400e" }}>文件仅展示元数据，不含上传内容</p>}
      {body.kind === "urlencoded" && (
        <BodySection
          title="请求体原文"
          body={{ mode: "raw", text: body.text, truncated: body.truncated }}
          note={body.note}
        />
      )}
    </div>
  )
}

function ErrorSection({ record }: { record: NetmonRecord }) {
  const outcome = record.outcome ?? (record.status >= 400 ? "http-error" : record.status === 0 ? "unknown" : "success")
  if (outcome === "success") return null
  const labels = {
    "http-error": "HTTP 错误",
    "network-error": "网络失败",
    aborted: "已取消",
    timeout: "超时",
    unknown: "未知／请求失败"
  }
  return (
    <div
      style={{
        border: "1px solid #fecaca",
        borderRadius: 8,
        background: "#fef2f2",
        padding: "0.5rem 0.75rem",
        fontSize: 12,
        color: "#991b1b",
        wordBreak: "break-word"
      }}>
      <strong>
        {labels[outcome]}
        {outcome === "http-error" ? ` · ${record.status}` : ""}
      </strong>
      <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
        {record.error ? `${record.error.name}: ${record.error.message}` : "未提供错误详情"}
      </p>
      {outcome === "unknown" && (
        <p style={{ margin: "4px 0 0", fontSize: 11 }}>浏览器未提供足够信息，无法确定具体原因。</p>
      )}
    </div>
  )
}

function formatJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function ActionBar({ record }: { record: NetmonRecord }) {
  const [copied, copy, error] = useCopy()
  const [last, setLast] = useState("")
  const [copying, setCopying] = useState(false)
  const run = async (label: string, text: string) => {
    setCopying(true)
    if (await copy(text)) setLast(label)
    setCopying(false)
  }
  const reason = requestCopyReason(record)
  const curlReason = curlCopyReason(record)
  const actions: { label: string; text: string | null; reason?: string }[] = [
    { label: "Copy Link", text: record.url },
    { label: "Copy Curl", text: toCurl(record), reason: curlReason ?? undefined },
    { label: "Copy Fetch", text: toFetch(record), reason: reason ?? undefined }
  ]
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {actions.map((action) => (
          <button
            key={action.label}
            style={{
              ...plainButton,
              display: "flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              color: copied && last === action.label ? "#047857" : "#475569",
              opacity: action.text === null ? 0.5 : 1,
              cursor: action.text === null || copying ? "not-allowed" : "pointer"
            }}
            type="button"
            title={action.reason || action.label}
            disabled={action.text === null || copying}
            onClick={() => action.text !== null && void run(action.label, action.text)}>
            {copied && last === action.label ? `${action.label} · 已复制` : action.label}
          </button>
        ))}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 10, color: reason ? "#92400e" : "#94a3b8", wordBreak: "break-word" }}>
        {reason || "复制仅包含可获取的请求信息，不含浏览器自动添加的全部请求头／Cookie。"}
      </p>
      {!reason && curlReason && <p style={{ margin: "4px 0 0", fontSize: 10, color: "#92400e" }}>{curlReason}</p>}
      {error && (
        <p role="status" style={{ margin: "4px 0 0", fontSize: 11, color: "#b91c1c" }}>
          {error}
        </p>
      )}
    </div>
  )
}

function FramePath({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [hover, setHover] = useState(false)
  const timerRef = useRef<number>()
  useEffect(() => () => window.clearTimeout(timerRef.current), [])
  const text = pathOf(url)
  const copy = () => {
    if (copied) return
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      style={{
        ...plainButton,
        display: "block",
        width: "100%",
        padding: "0 0.75rem 0.25rem",
        background: "transparent",
        textAlign: "left",
        color: copied ? "#047857" : "#94a3b8",
        cursor: copied ? "default" : "pointer",
        opacity: hover || copied ? 1 : 0.85
      }}
      type="button"
      title={copied ? "已复制" : text}
      disabled={copied}
      onClick={copy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 10,
          textDecoration: hover && !copied ? "underline" : "none"
        }}>
        {copied ? "已复制" : text}
      </span>
    </button>
  )
}

type FrameGroupData = { frameUrl: string; records: NetmonRecord[] }

function groupByFrame(records: NetmonRecord[]): FrameGroupData[] {
  const groups = new Map<string, NetmonRecord[]>()
  for (const record of records) {
    const key = record.frameUrl || hostOf(record.url)
    const list = groups.get(key)
    if (list) list.push(record)
    else groups.set(key, [record])
  }
  return [...groups].map(([frameUrl, list]) => ({ frameUrl, records: list }))
}

function sortRecords(records: NetmonRecord[], dir: SortDir): NetmonRecord[] {
  return [...records].sort((a, b) => (dir === "asc" ? a.ts - b.ts : b.ts - a.ts))
}

function groupCreatedAt(group: FrameGroupData): number {
  return Math.min(...group.records.map((r) => r.ts))
}

function sortGroups(groups: FrameGroupData[], dir: SortDir): FrameGroupData[] {
  return [...groups].sort((a, b) => {
    const diff = groupCreatedAt(a) - groupCreatedAt(b)
    return dir === "asc" ? diff : -diff
  })
}

function ArrowIcon({ down }: { down: boolean }) {
  return (
    <span style={{ display: "inline-flex", transform: down ? "rotate(0deg)" : "rotate(180deg)" }}>
      <Icon
        path={
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </>
        }
      />
    </span>
  )
}

function SortButton({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  return (
    <button
      style={{
        ...plainButton,
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        color: "#475569"
      }}
      type="button"
      title={dir === "desc" ? "当前：最新在前" : "当前：最旧在前"}
      onClick={onToggle}>
      时间 <ArrowIcon down={dir === "desc"} />
    </button>
  )
}

function FrameGroup({ frameUrl, records }: FrameGroupData) {
  const [open, setOpen] = useState(true)
  const [dir, setDir] = useState<SortDir>("asc")
  const isTop = records[0] ? isTopFrame(records[0]) : false
  return (
    <div style={{ borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0.5rem 0.75rem",
          background: "#f8fafc"
        }}>
        <button
          style={{
            ...plainButton,
            display: "flex",
            minWidth: 0,
            flex: 1,
            alignItems: "center",
            gap: 6,
            textAlign: "left",
            color: "#0f172a"
          }}
          type="button"
          onClick={() => setOpen((v) => !v)}>
          <span
            style={{
              flexShrink: 0,
              borderRadius: 4,
              background: isTop ? "#eef2ff" : "#fef3c7",
              padding: "1px 5px",
              fontSize: 9,
              fontWeight: 600,
              color: isTop ? "#4338ca" : "#92400e"
            }}>
            {isTop ? "TOP" : "IFRAME"}
          </span>
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              fontWeight: 600
            }}>
            {hostOf(frameUrl)}
          </span>
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>{records.length}</span>
          <ChevronIcon open={open} />
        </button>
        <SortButton dir={dir} onToggle={() => setDir((v) => (v === "desc" ? "asc" : "desc"))} />
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 10,
              color: "#94a3b8"
            }}
            title={frameUrl}>
            {pathOf(frameUrl)}
          </div>
          {sortRecords(records, dir).map((record) => (
            <RecordItem key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecordItem({ record }: { record: NetmonRecord }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
      <button
        style={{
          ...plainButton,
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          gap: 8,
          padding: "0.5rem 0.75rem",
          textAlign: "left",
          color: "inherit"
        }}
        type="button"
        onClick={() => setOpen((v) => !v)}>
        <span
          style={{
            marginTop: 2,
            flexShrink: 0,
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: 10,
            fontWeight: 600,
            ...statusStyle(record.status)
          }}>
          {formatStatus(record)}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              fontWeight: 600,
              color: "#0f172a"
            }}>
            {record.url}
          </span>
          <span
            style={{
              marginTop: 2,
              display: "inline-block",
              borderRadius: 4,
              background: "#f1f5f9",
              padding: "1px 6px",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "#64748b"
            }}>
            {record.method}
          </span>
        </span>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>
          {formatDuration(record.duration)}
        </span>
      </button>
      {record.frameUrl && !isTopFrame(record) && <FramePath url={record.frameUrl} />}
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderTop: "1px solid #e2e8f0",
            padding: "0.5rem 0.75rem"
          }}>
          <ActionBar record={record} />
          <ErrorSection record={record} />
          <HeaderSection title="Query 参数" headers={queryParameters(record.url)} />
          <HeaderSection title="请求头" headers={record.requestHeaders} />
          <RequestBodySection body={record.requestBody} />
          <HeaderSection title="响应头" headers={record.responseHeaders} />
          <BodySection title="响应体" body={record.body} note={record.bodyNote} />
        </div>
      )}
    </div>
  )
}

function Panel({ initial }: { initial: NetmonTabState }) {
  const [state, setState] = useState<NetmonTabState>({ ...EMPTY_STATE, ...initial })
  const [ruleInput, setRuleInput] = useState("")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: window.innerWidth - 300 - PANEL_MARGIN,
    y: PANEL_MARGIN
  })
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onMessage = (message: unknown) => {
      const msg = message as { target?: string; type?: string; state?: NetmonTabState }
      if (msg?.target === "netmon-frame" && msg.type === "STATE" && msg.state) {
        setState(msg.state)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = sortDir === "desc" ? 0 : el.scrollHeight
  }, [state.records.length, sortDir])

  const onDragStart = (e: JSX.TargetedMouseEvent<HTMLElement>) => {
    if (e.button !== 0) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const maxX = Math.max(PANEL_MARGIN, window.innerWidth - 300 - PANEL_MARGIN)
      const maxY = Math.max(PANEL_MARGIN, window.innerHeight - 40 - PANEL_MARGIN)
      setPos({
        x: Math.min(Math.max(PANEL_MARGIN, ev.clientX - drag.dx), maxX),
        y: Math.min(Math.max(PANEL_MARGIN, ev.clientY - drag.dy), maxY)
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const addRule = () => {
    const pattern = ruleInput.trim()
    if (!pattern) return
    sendCommand({ name: "addRule", pattern })
    setRuleInput("")
  }

  const hasIframeRequest = state.records.some((record) => !isTopFrame(record))
  const frameGroups = hasIframeRequest ? sortGroups(groupByFrame(state.records), sortDir) : []
  const flatRecords = hasIframeRequest ? [] : sortRecords(state.records, sortDir)

  return (
    <div
      data-netmon-panel-root
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        width: 300,
        maxHeight: "calc(100vh - 2rem)",
        minWidth: 260,
        minHeight: 200,
        maxWidth: "calc(100vw - 2rem)",
        resize: "both",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        background: "#fff",
        fontSize: 14,
        lineHeight: 1.5,
        color: "#101828",
        boxShadow: "0 14px 34px rgba(16,24,40,0.18)",
        zIndex: 2147483647,
        boxSizing: "border-box",
        fontFamily: '"Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",Roboto,ui-sans-serif,system-ui,sans-serif',
        textAlign: "left",
        WebkitFontSmoothing: "antialiased"
      }}>
      <div
        className="netmon-drag-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e2e8f0",
          background: "linear-gradient(135deg,#101828,#123b66 62%,#0c5fb8)",
          padding: "0.75rem 1rem",
          color: "#fff",
          cursor: "move",
          touchAction: "none",
          userSelect: "none"
        }}
        onMouseDown={onDragStart}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.62)"
          }}>
          network
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, margin: 0, color: "#fff" }}>网络监视器</h2>
          <button
            style={{
              ...plainButton,
              display: "grid",
              width: 24,
              height: 24,
              flexShrink: 0,
              placeItems: "center",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff"
            }}
            type="button"
            aria-label="关闭网络监视"
            title="关闭并停止监视"
            onClick={() => sendCommand({ name: "stop" })}>
            <CloseIcon size={14} />
          </button>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid #e2e8f0", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            style={{
              minWidth: 0,
              flex: 1,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#fff",
              padding: "6px 10px",
              fontSize: 12,
              color: "#0f172a",
              outline: "none"
            }}
            type="text"
            value={ruleInput}
            placeholder="输入 URL 片段"
            onKeyDown={(e) => {
              if (e.key === "Enter") addRule()
            }}
            onInput={(e) => setRuleInput((e.target as HTMLInputElement).value)}
          />
          <button
            style={{
              ...plainButton,
              flexShrink: 0,
              borderRadius: 8,
              background: "#101828",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff"
            }}
            type="button"
            onClick={addRule}>
            添加
          </button>
        </div>
        {state.rules.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {state.rules.map((rule) => (
              <button
                key={rule.id}
                style={{
                  ...plainButton,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "#475569"
                }}
                type="button"
                title="点击移除"
                onClick={() => sendCommand({ name: "removeRule", id: rule.id })}>
                <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rule.pattern}
                </span>
                <CloseIcon size={10} />
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
            {state.rules.length === 0
              ? "添加一个 URL 片段才开始监视"
              : `命中 ${state.rules.length} 条规则，最新 ${RECORD_LIMIT} 条`}
          </p>
          {state.records.length > 0 && (
            <SortButton dir={sortDir} onToggle={() => setSortDir((v) => (v === "desc" ? "asc" : "desc"))} />
          )}
        </div>
      </div>

      <div ref={listRef} style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: 12 }}>
        {state.records.length === 0 ? (
          <p style={{ padding: "1.5rem 0", margin: 0, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
            暂无匹配请求
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {frameGroups.length > 0
              ? frameGroups.map((group) => (
                  <FrameGroup key={group.frameUrl} frameUrl={group.frameUrl} records={group.records} />
                ))
              : flatRecords.map((record) => <RecordItem key={record.id} record={record} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default Panel
