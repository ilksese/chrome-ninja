import type { View } from "../content-ui/lifecycle"
import type { PanelLayout } from "../content-ui/panel-geometry"
import type { Cookie, CookieCommand, CookieEntry, CookieNotice, CookieOriginal, CookieResponse } from "./types"
import van from "vanjs-core"
import { Button, Collapsible, Column, Input, PanelHeader, Row, Status, Surface, Text } from "../content-ui/components"
import { createScope } from "../content-ui/lifecycle"
import {
  bindPanelDrag,
  fitPanelLayout,
  PANEL_MARGIN,
  PANEL_MIN_SIZE,
  trackPanelLayout
} from "../content-ui/panel-geometry"
import { css, theme } from "../content-ui/theme"

const message = async (command: CookieCommand): Promise<CookieResponse> => {
  const response: CookieResponse | undefined = await chrome.runtime.sendMessage({ target: "cookie-editor", ...command })
  if (!response?.ok) throw new Error(response?.error ?? "扩展连接已失效，请刷新网页后重试")
  return response
}
const label = (title: string, control: HTMLElement) =>
  van.tags.label({ style: css({ display: "flex", flexDirection: "column", gap: 4 }) }, Text({}, title), control)

function cookieForm(cookie: Cookie, save: (cookie: Cookie) => Promise<void>, cancel: () => void) {
  const name = Input({ "aria-label": "名称", value: cookie.name, required: true })
  const value = Input({ "aria-label": "值", value: cookie.value })
  const domain = Input({ "aria-label": "Domain", value: cookie.domain })
  const path = Input({ "aria-label": "Path", value: cookie.path })
  const checkbox = (title: string, checked: boolean) =>
    Input({ type: "checkbox", "aria-label": title, checked, style: { appearance: "auto", width: 16, height: 16 } })
  const hostOnly = checkbox("仅当前主机", cookie.hostOnly)
  const secure = checkbox("Secure", cookie.secure)
  const httpOnly = checkbox("HttpOnly", cookie.httpOnly)
  const session = checkbox("会话 Cookie", cookie.session)
  const expires = Input({ type: "datetime-local", step: "any", "aria-label": "过期时间", disabled: cookie.session })
  if (cookie.expirationDate) {
    const date = new Date(cookie.expirationDate * 1000)
    expires.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
  }
  session.addEventListener("change", () => {
    expires.disabled = session.checked
  })
  const sameSite = van.tags.select(
    {
      "aria-label": "SameSite",
      style: css({
        padding: 6,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8,
        color: theme.colors.text,
        background: theme.colors.background
      })
    },
    ...[
      ["lax", "Lax"],
      ["strict", "Strict"],
      ["no_restriction", "None"],
      ["unspecified", "未指定"]
    ].map(([id, title]) => van.tags.option({ value: id }, title))
  )
  sameSite.value = cookie.sameSite
  const error = Status({ tone: "danger" })
  const saveButton = Button({ type: "submit", variant: "primary" }, "保存")
  const fieldset = van.tags.fieldset(
    { style: css({ margin: 0, padding: 0, border: 0, minWidth: 0 }) },
    Column(
      {},
      label("名称", name),
      label("值（可为空）", value),
      Collapsible(
        "高级属性",
        label("Domain", domain),
        Row({}, hostOnly, Text({}, "仅当前主机（关闭后使用域 Cookie）")),
        label("Path", path),
        Row({}, session, Text({}, "会话 Cookie")),
        label("过期时间", expires),
        Row({}, secure, Text({}, "Secure"), httpOnly, Text({}, "HttpOnly")),
        label("SameSite", sameSite),
        cookie.partitionKey
          ? Text(
              { style: { wordBreak: "break-all", fontSize: 12 } },
              `分区（只读）：${JSON.stringify(cookie.partitionKey)}`
            )
          : Text({}, "普通 Cookie")
      ),
      error,
      Row({}, saveButton, Button({ onclick: cancel }, "取消"))
    )
  )
  const form = van.tags.form(
    {
      onsubmit: (event: SubmitEvent) => {
        event.preventDefault()
        const expirationDate = session.checked ? undefined : new Date(expires.value).getTime() / 1000
        if (!session.checked && !Number.isFinite(expirationDate)) {
          error.textContent = "请选择有效的过期时间"
          return
        }
        const draft: Cookie = {
          ...cookie,
          name: name.value,
          value: value.value,
          domain: domain.value,
          path: path.value,
          hostOnly: hostOnly.checked,
          secure: secure.checked,
          httpOnly: httpOnly.checked,
          session: session.checked,
          sameSite: sameSite.value as Cookie["sameSite"],
          expirationDate
        }
        fieldset.disabled = true
        error.textContent = ""
        void save(draft)
          .catch((reason: unknown) => {
            error.textContent = reason instanceof Error ? reason.message : "保存失败"
          })
          .finally(() => {
            fieldset.disabled = false
          })
      }
    },
    fieldset
  )
  return { element: form, saveButton }
}

export function CookiePanel(onclose: () => void, layout?: PanelLayout | null): View & { focus: () => void } {
  const scope = createScope()
  let hostname = ""
  let storeId = ""
  let isSecure = false
  let newForm: HTMLElement | undefined
  let newCard: HTMLElement | undefined
  const loaded = van.state(false)
  const closeNew = () => {
    newCard?.remove()
    newCard = undefined
    newForm = undefined
  }
  let refreshing = false
  let refreshAgain = false
  const rows = new Map<string, ReturnType<typeof cookieRow>>()
  const notice = Status({ tone: "danger" })
  const contextText = Text({ style: { fontSize: 12, color: theme.colors.muted } }, "正在读取 Cookie…")
  const list = Column({ style: { gap: 10 } })
  const editor = Column()
  const search = Input({
    "aria-label": "搜索 Cookie",
    placeholder: "搜索名称或值",
    style: { flex: 1 },
    oninput: () => filter()
  })
  const add = Button(
    {
      disabled: () => !loaded.val,
      onclick: () => {
        if (newForm) {
          newForm.querySelector("input")?.focus()
          return
        }
        const form = cookieForm(
          {
            name: "",
            value: "",
            domain: hostname,
            path: "/",
            hostOnly: true,
            storeId,
            secure: isSecure,
            httpOnly: false,
            sameSite: "lax",
            session: true
          },
          async (cookie) => {
            const response = await message({ type: "save", cookie })
            closeNew()
            apply(response)
          },
          () => {
            closeNew()
          }
        )
        newForm = form.element
        newCard = Surface({ style: { padding: 12 } }, newForm)
        editor.append(newCard)
        newForm.querySelector("input")?.focus()
      }
    },
    "新增 Cookie"
  )

  function filter() {
    const query = search.value.toLowerCase()
    for (const row of rows.values()) row.element.style.display = row.matches(query) ? "flex" : "none"
  }
  function apply(response: CookieResponse) {
    if (scope.disposed) return
    if (response.warning) notice.textContent = response.warning
    hostname = response.hostname ?? hostname
    storeId = response.storeId ?? storeId
    isSecure = response.secure ?? isSecure
    loaded.val = !!hostname && !!storeId
    contextText.textContent = `${hostname} · 全部路径 · ${response.entries?.length ?? 0} 项`
    const incoming = new Map((response.entries ?? []).map((entry) => [entry.id, entry]))
    for (const [id, row] of rows) {
      if (!incoming.has(id) && !row.editing()) {
        row.element.remove()
        rows.delete(id)
      } else row.update(incoming.get(id))
    }
    for (const [id, entry] of incoming)
      if (!rows.has(id)) {
        const row = cookieRow(entry)
        rows.set(id, row)
        list.append(row.element)
      }
    filter()
  }
  async function refresh() {
    if (scope.disposed) return
    if (refreshing) {
      refreshAgain = true
      return
    }
    refreshing = true
    try {
      do {
        refreshAgain = false
        apply(await message({ type: "list" }))
      } while (refreshAgain && !scope.disposed)
    } catch (error) {
      if (!scope.disposed) notice.textContent = error instanceof Error ? error.message : "读取失败"
    } finally {
      refreshing = false
    }
  }
  function cookieRow(initial: CookieEntry) {
    let latest: CookieEntry | undefined = initial
    let original: CookieOriginal | undefined
    let form: ReturnType<typeof cookieForm> | undefined
    let busy = false
    const title = Text({ style: { fontWeight: 600, wordBreak: "break-all" } })
    const value = Text({ style: { wordBreak: "break-all", whiteSpace: "pre-wrap", maxHeight: 90, overflow: "auto" } })
    const attributes = Text({ style: { wordBreak: "break-all", fontSize: 12, color: theme.colors.muted } })
    const conflict = Status({ tone: "warning" })
    const body = Column()
    const reset = () => {
      form?.element.remove()
      form = undefined
      original = undefined
      update(latest)
      void refresh()
    }
    const edit = Button({ onclick: () => begin() }, "编辑")
    const reload = Button(
      {
        style: { display: "none" },
        onclick: () => {
          if (latest) begin()
          else reset()
        }
      },
      "重新载入最新版本"
    )
    const toggle = Button({
      onclick: () => {
        if (!latest || busy) return
        const command = {
          type: latest.disabled ? "enable" : "disable",
          original: { id: latest.id, revision: latest.revision }
        } as const
        busy = true
        toggle.disabled = true
        edit.disabled = true
        notice.textContent = ""
        void message(command)
          .then(apply)
          .catch((error: unknown) => {
            if (!scope.disposed) notice.textContent = error instanceof Error ? error.message : "切换失败"
          })
          .finally(() => {
            busy = false
            update(latest)
            void refresh()
          })
      }
    })
    const element = Column(
      {
        "data-cookie-id": initial.id,
        style: { padding: 12, border: `1px solid ${theme.colors.border}`, borderRadius: 8 }
      },
      title,
      value,
      attributes,
      Row({}, edit, toggle),
      conflict,
      reload,
      body
    )
    function begin() {
      if (!latest || busy) return
      original = { id: latest.id, revision: latest.revision }
      form?.element.remove()
      form = cookieForm(
        latest.cookie,
        async (cookie) => {
          if (!latest || original?.revision !== latest.revision)
            throw new Error("Cookie 已变化，请重新载入最新版本后再保存")
          const response = await message({ type: "save", original, cookie })
          form?.element.remove()
          form = undefined
          original = undefined
          apply(response)
        },
        reset
      )
      body.append(form.element)
      update(latest)
      form.element.querySelector("input")?.focus()
    }
    function update(entry?: CookieEntry) {
      latest = entry
      if (entry) {
        title.textContent = `${entry.cookie.name} · ${entry.disabled ? "已禁用" : "生效中"}`
        value.textContent = entry.cookie.value || "（空值）"
        attributes.textContent = `${entry.cookie.domain}${entry.cookie.path} · ${entry.cookie.session ? "会话" : new Date(entry.cookie.expirationDate! * 1000).toLocaleString()}${entry.cookie.httpOnly ? " · HttpOnly" : ""}${entry.cookie.secure ? " · Secure" : ""}${entry.cookie.partitionKey ? ` · 分区 ${JSON.stringify(entry.cookie.partitionKey)}` : " · 普通"}`
        toggle.textContent = entry.disabled ? "取消禁用" : "禁用"
      }
      const stale = !!original && (!entry || original.revision !== entry.revision)
      conflict.textContent = stale ? "Cookie 已被外部修改或移除，草稿已保留；请重新载入最新版本后再保存。" : ""
      reload.style.display = stale ? "inline-flex" : "none"
      if (form) form.saveButton.disabled = stale
      edit.disabled = busy || !!form || !entry
      toggle.disabled = busy || !!form || !entry
    }
    update(initial)
    return {
      element,
      update,
      editing: () => !!form,
      matches: (query: string) =>
        !!form ||
        [latest?.cookie.name ?? initial.cookie.name, latest?.cookie.value ?? initial.cookie.value].some((value) =>
          value.toLowerCase().includes(query)
        )
    }
  }
  const initialLayout =
    layout ??
    fitPanelLayout(
      {
        left: Math.max(16, (window.innerWidth - 720) / 2),
        top: Math.max(24, (window.innerHeight - 800) / 2),
        width: Math.min(720, window.innerWidth - 32),
        height: Math.min(800, window.innerHeight - 48)
      },
      "cookie-editor"
    )
  const header = PanelHeader({
    title: "Cookie 编辑器",
    onclose,
    style: { cursor: "move", userSelect: "none", flexShrink: 0 }
  })
  const element = Surface(
    {
      role: "region",
      "aria-label": "Cookie 编辑器",
      tabindex: -1,
      style: {
        position: "fixed",
        top: initialLayout.top,
        left: initialLayout.left,
        width: initialLayout.width,
        height: initialLayout.height,
        minWidth: `min(${PANEL_MIN_SIZE["cookie-editor"].width}px, calc(100vw - ${PANEL_MARGIN * 2}px))`,
        minHeight: `min(${PANEL_MIN_SIZE["cookie-editor"].height}px, calc(100vh - ${PANEL_MARGIN * 2}px))`,
        maxWidth: `calc(100vw - ${PANEL_MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${PANEL_MARGIN * 2}px)`,
        display: "flex",
        flexDirection: "column",
        resize: "both",
        overflow: "hidden",
        boxShadow: theme.shadow,
        borderRadius: theme.radius.panel
      }
    },
    header,
    Column({ style: { padding: 12, flexShrink: 0 } }, contextText, Row({}, search, add), notice),
    Column(
      { style: { overflow: "auto", padding: 12, flex: 1, minHeight: 0 } },
      editor,
      list,
      Status(
        {},
        "禁用在写入后移除，存在短暂可用窗口。取消禁用恢复最后可观测且未过期的版本；对已不存在 Cookie 的删除意图无法观测。"
      )
    )
  )
  scope.add(bindPanelDrag(element, header, "cookie-editor"))
  scope.add(trackPanelLayout(element, "cookie-editor"))
  const receive = (noticeMessage: CookieNotice) => {
    if (noticeMessage.target !== "cookie-editor-ui" || noticeMessage.type !== "changed") return
    if (noticeMessage.error) notice.textContent = noticeMessage.error
    void refresh()
  }
  chrome.runtime.onMessage.addListener(receive)
  scope.add(() => chrome.runtime.onMessage.removeListener(receive))
  void refresh()
  return {
    element,
    dispose: scope.dispose,
    focus: () => {
      element.focus()
      search.focus()
    }
  }
}
