import type {
  BrowserPreset,
  BrowserPresetDraft,
  BrowserPresetResponse,
  BrowserPresetUsage,
  MobileConflict
} from "@/browser-preset/types"
import type { PresetField, PresetFieldErrors } from "@/browser-preset/validation"
import type { UserAgentType } from "@/types"
import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { cn } from "@chrome-ninja/utils"
import Dialog from "@components/Dialog"
import { DEVICE_PRESETS } from "@/browser-preset/devices"
import {
  DEVICE_SCALE_MAX,
  DEVICE_SCALE_MIN,
  firstPresetError,
  PRESET_NAME_MAX_LENGTH,
  validatePreset,
  VIEWPORT_MAX,
  VIEWPORT_MIN
} from "@/browser-preset/validation"
import { USER_AGENT_OPTIONS } from "@/user-agent"

type BrowserPresetsProps = {
  layout: "popup" | "options"
}

type FormState = {
  id?: string
  name: string
  userAgent: UserAgentType
  width: string
  height: string
  deviceScaleFactor: string
  mobile: boolean
}

const EMPTY_FORM: FormState = {
  name: "",
  userAgent: "default",
  width: "1280",
  height: "720",
  deviceScaleFactor: "1",
  mobile: false
}

const toDraft = (form: FormState): BrowserPresetDraft => ({
  name: form.name,
  userAgent: form.userAgent,
  viewport: {
    width: Number(form.width),
    height: Number(form.height),
    deviceScaleFactor: Number(form.deviceScaleFactor),
    mobile: form.mobile
  }
})

const toForm = (preset: BrowserPreset): FormState => ({
  id: preset.id,
  name: preset.name,
  userAgent: preset.userAgent,
  width: String(preset.viewport.width),
  height: String(preset.viewport.height),
  deviceScaleFactor: String(preset.viewport.deviceScaleFactor),
  mobile: preset.viewport.mobile
})

const fieldClass =
  "mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-[#0077ff]"

/**
 * 浏览器预设页：预设列表与新建/编辑表单。
 * Popup 与 Options 共用同一路由页，CRUD 全部经由 `browser-preset` 后台协议。
 */
export default function BrowserPresets({ layout }: BrowserPresetsProps) {
  const isOptions = layout === "options"
  const [presets, setPresets] = useState<BrowserPreset[]>([])
  // 使用数量由后台按内存映射现算；页面只读，不自行推断哪个预设被占用。
  const [usage, setUsage] = useState<BrowserPresetUsage>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<PresetField[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [tabReason, setTabReason] = useState("")
  const [simulatingId, setSimulatingId] = useState<string | undefined>(undefined)
  const [applyingId, setApplyingId] = useState("")
  const [stoppingId, setStoppingId] = useState("")
  const [pendingDelete, setPendingDelete] = useState<BrowserPreset | null>(null)
  // 标签页在用户自建分组里：应用前必须由用户确认这场有损的移出。
  const [pendingGroupMove, setPendingGroupMove] = useState<BrowserPreset | null>(null)
  const [conflict, setConflict] = useState<MobileConflict | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)

  const send = useCallback(
    async (command: Record<string, unknown>) =>
      (await chrome.runtime.sendMessage({ target: "browser-preset", ...command })) as BrowserPresetResponse | undefined,
    []
  )

  /** 列表与使用数量总是成对下发，页面也必须成对更新；统一走这里避免两处漏写。 */
  const applyList = (response: BrowserPresetResponse) => {
    setPresets(response.presets ?? [])
    setUsage(response.usage ?? {})
  }

  const refresh = useCallback(async () => {
    try {
      const response = await send({ type: "list" })
      if (!response?.ok) throw new Error(response?.error ?? "无法读取预设列表")
      applyList(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取预设列表")
    } finally {
      setLoading(false)
    }
  }, [send])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 应用前先问后台目标标签页能不能模拟，受限页面据此在点击前就禁用。
  // 同一次应答里带回正在模拟的预设与一次性提示，页面据此显示当前状态与退出模拟入口。
  const refreshStatus = useCallback(async () => {
    try {
      const response = await send({ type: "status" })
      if (!response?.ok) throw new Error(response?.error ?? "无法读取当前标签页")
      setTabReason(response.unavailableReason ?? "")
      setSimulatingId(response.presetId)
      // 被动终止的一次性提示由后台在读取后清空，这里只负责展示。
      if (response.notice) setNotice(response.notice)
    } catch (err) {
      setTabReason(err instanceof Error ? err.message : "无法读取当前标签页")
    }
  }, [send])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (form) requestAnimationFrame(() => nameRef.current?.focus())
  }, [form])

  const updateForm = (patch: Partial<FormState>, field?: PresetField) => {
    if (field && !touched.includes(field)) setTouched((current) => [...current, field])
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  const openCreate = () => {
    setError("")
    setSubmitted(false)
    setTouched([])
    setConflict(null)
    setForm({ ...EMPTY_FORM })
  }

  const openEdit = (preset: BrowserPreset) => {
    setError("")
    setSubmitted(false)
    setTouched([])
    setConflict(null)
    setForm(toForm(preset))
  }

  const closeForm = () => {
    setForm(null)
    setSubmitted(false)
    setTouched([])
    setConflict(null)
  }

  const { errors } = form ? validatePreset(toDraft(form), presets, form.id) : { errors: {} }
  // 用户改过某个字段后立即提示该字段的错误；未触碰的字段不提前报错。
  const visibleErrors = Object.fromEntries(
    Object.entries(errors).filter(([field]) => submitted || touched.includes(field as PresetField))
  ) as PresetFieldErrors
  const canSave = !!form && !firstPresetError(errors) && !saving

  const save = async (confirmConflict = false) => {
    if (!form) return
    setSubmitted(true)
    if (firstPresetError(errors)) return
    setSaving(true)
    setError("")
    try {
      const response = await send({
        type: form.id ? "update" : "create",
        ...(form.id ? { id: form.id } : {}),
        ...(confirmConflict ? { confirmConflict: true } : {}),
        preset: toDraft(form)
      })
      // 冲突时后台未写入任何内容，先交由用户确认；确认后带着标记重发同一份草稿。
      if (response?.needsConfirmation) {
        setConflict(response.conflict ?? null)
        return
      }
      if (!response?.ok) throw new Error(response?.error ?? "保存失败")
      applyList(response)
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  // 取消只关闭确认框：表单与用户填写的值保持原样，存储未被改动。
  const cancelConflict = () => setConflict(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setError("")
    try {
      const response = await send({ type: "delete", id: pendingDelete.id })
      if (!response?.ok) throw new Error(response?.error ?? "删除失败")
      applyList(response)
      setPendingDelete(null)
      requestAnimationFrame(() => deleteTriggerRef.current?.focus())
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败")
    }
  }

  /**
   * 应用预设。标签页已在用户自建分组时，后台返回 `needsGroupMoveConfirmation` 且未做任何改动；
   * 此时先弹确认框，用户确认后带着 `confirmGroupMove` 重发同一条命令。
   */
  const applyPreset = async (preset: BrowserPreset, confirmGroupMove = false) => {
    if (tabReason) return
    setError("")
    setNotice("")
    setApplyingId(preset.id)
    try {
      const response = await send({
        type: "apply",
        id: preset.id,
        ...(confirmGroupMove ? { confirmGroupMove: true } : {})
      })
      if (response?.needsGroupMoveConfirmation) {
        setPendingGroupMove(preset)
        return
      }
      if (!response?.ok) throw new Error(response?.error ?? "应用预设失败")
      setPendingGroupMove(null)
      setSimulatingId(preset.id)
      // 应用改变了使用数量，锁定态与「正在 N 个标签页使用」必须立刻反映出来。
      void refresh()
      setNotice(`已应用「${preset.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "应用预设失败")
    } finally {
      setApplyingId("")
    }
  }

  // 取消只关闭确认框：后台没有做任何改动，标签页仍留在用户自己的分组里。
  const cancelGroupMove = () => setPendingGroupMove(null)

  // 退出模拟不依赖 tabReason：受限原因只拦应用，退出随时可用。
  const exitSimulation = async () => {
    setError("")
    setNotice("")
    setApplyingId("")
    try {
      const response = await send({ type: "simulate-exit" })
      if (!response?.ok) throw new Error(response?.error ?? "退出模拟失败")
      setSimulatingId(undefined)
      setNotice("已退出模拟")
      // 退出可能让该预设的使用者归零，解锁状态要在列表上同步刷新。
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出模拟失败")
    }
  }

  /**
   * 停止一个预设：退出所有正在使用它的标签页。
   * 与单个标签页的退出模拟不同，停止是全局操作，只需一次命令，页面随后按返回结果刷新列表。
   */
  const stopPreset = async (preset: BrowserPreset) => {
    setError("")
    setNotice("")
    setStoppingId(preset.id)
    try {
      const response = await send({ type: "stop", id: preset.id })
      if (!response?.ok) throw new Error(response?.error ?? "停止失败")
      applyList(response)
      // 停止会退出包括当前标签页在内的所有使用者，模拟状态与本地状态一并清空。
      setSimulatingId(undefined)
      setNotice(`已停止「${preset.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止失败")
    } finally {
      setStoppingId("")
    }
  }

  const simulatingPreset = simulatingId ? presets.find((preset) => preset.id === simulatingId) : undefined

  const cancelDelete = () => {
    setPendingDelete(null)
    requestAnimationFrame(() => deleteTriggerRef.current?.focus())
  }

  return (
    <div className={cn("space-y-3", isOptions && "mx-auto w-full max-w-3xl")}>
      <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(16,24,40,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#005bd1]">
              browser preset
            </span>
            <h1 className="mt-1 text-base font-semibold leading-5 text-slate-950">浏览器预设</h1>
          </span>
          {!form && (
            <button
              className="shrink-0 rounded-xl bg-[#101828] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054]"
              type="button"
              onClick={openCreate}>
              新建预设
            </button>
          )}
        </div>

        <p className="mt-3 rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] px-3 py-2.5 text-xs leading-5 text-[#005bd1]">
          浏览器预设通过 CDP 模拟单个标签页的 User-Agent 与
          viewport，应用时需要附加调试权限。应用后浏览器会显示一条调试提示条，这是浏览器的既有行为。
        </p>

        {simulatingPreset ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] px-3 py-2.5">
            <span className="min-w-0 flex-1 text-xs leading-5 text-[#005bd1]">
              正在模拟「{simulatingPreset.name}」
            </span>
            <button
              className="shrink-0 rounded-lg border border-[#0c5fb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0c5fb8] transition-colors hover:bg-[#d7e9ff]"
              type="button"
              onClick={() => void exitSimulation()}>
              退出模拟
            </button>
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
            当前没有模拟
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {notice}
          </p>
        )}

        {tabReason && !form && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            当前标签页无法模拟：{tabReason}
          </p>
        )}
      </section>

      {form ? (
        <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(16,24,40,0.12)]">
          <form
            aria-label="预设表单"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}>
            <h2 className="text-sm font-semibold text-slate-950">{form.id ? "编辑预设" : "新建预设"}</h2>

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">预设名称</span>
                <input
                  ref={nameRef}
                  className={cn(fieldClass, visibleErrors.name && "border-red-400 focus:border-red-500")}
                  type="text"
                  value={form.name}
                  maxLength={PRESET_NAME_MAX_LENGTH * 2}
                  placeholder="例如 iPhone 15 调试"
                  aria-invalid={!!visibleErrors.name}
                  aria-describedby={visibleErrors.name ? "preset-name-error" : undefined}
                  onInput={(event) => updateForm({ name: (event.target as HTMLInputElement).value }, "name")}
                />
                {visibleErrors.name && (
                  <span id="preset-name-error" className="mt-1 block text-xs text-red-600">
                    {visibleErrors.name}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">User-Agent</span>
                <select
                  className={fieldClass}
                  value={form.userAgent}
                  onChange={(event) =>
                    updateForm({ userAgent: (event.target as HTMLSelectElement).value as UserAgentType }, "userAgent")
                  }>
                  {USER_AGENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === "default" ? "不覆盖（保留真实身份）" : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="text-xs font-medium text-slate-600">设备档位</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DEVICE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-[#9bc8ff] hover:bg-[#e8f2ff] hover:text-[#005bd1]"
                      type="button"
                      onClick={() =>
                        updateForm({
                          width: String(preset.viewport.width),
                          height: String(preset.viewport.height),
                          deviceScaleFactor: String(preset.viewport.deviceScaleFactor),
                          mobile: preset.viewport.mobile
                        })
                      }>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">视口宽度</span>
                  <input
                    className={cn(fieldClass, visibleErrors.width && "border-red-400 focus:border-red-500")}
                    type="number"
                    inputMode="numeric"
                    min={VIEWPORT_MIN}
                    max={VIEWPORT_MAX}
                    value={form.width}
                    onInput={(event) => updateForm({ width: (event.target as HTMLInputElement).value }, "width")}
                  />
                  {visibleErrors.width && (
                    <span className="mt-1 block text-xs text-red-600">{visibleErrors.width}</span>
                  )}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">视口高度</span>
                  <input
                    className={cn(fieldClass, visibleErrors.height && "border-red-400 focus:border-red-500")}
                    type="number"
                    inputMode="numeric"
                    min={VIEWPORT_MIN}
                    max={VIEWPORT_MAX}
                    value={form.height}
                    onInput={(event) => updateForm({ height: (event.target as HTMLInputElement).value }, "height")}
                  />
                  {visibleErrors.height && (
                    <span className="mt-1 block text-xs text-red-600">{visibleErrors.height}</span>
                  )}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">设备像素比</span>
                  <input
                    className={cn(fieldClass, visibleErrors.deviceScaleFactor && "border-red-400 focus:border-red-500")}
                    type="number"
                    inputMode="decimal"
                    // 档位里的 2.625 这类像素比不是 0.5 的整数倍；固定 step 会让表单校验失败并拦下隐式提交。
                    step="any"
                    min={DEVICE_SCALE_MIN}
                    max={DEVICE_SCALE_MAX}
                    value={form.deviceScaleFactor}
                    onInput={(event) =>
                      updateForm({ deviceScaleFactor: (event.target as HTMLInputElement).value }, "deviceScaleFactor")
                    }
                  />
                  {visibleErrors.deviceScaleFactor && (
                    <span className="mt-1 block text-xs text-red-600">{visibleErrors.deviceScaleFactor}</span>
                  )}
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900">
                <input
                  className="size-4 accent-[#0c5fb8]"
                  type="checkbox"
                  checked={form.mobile}
                  onChange={(event) => updateForm({ mobile: (event.target as HTMLInputElement).checked })}
                />
                移动端布局
              </label>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
                type="button"
                onClick={closeForm}>
                取消
              </button>
              <button
                className="flex-1 rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:opacity-60"
                type="submit"
                disabled={!canSave}>
                {saving ? "保存中" : "保存预设"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(16,24,40,0.12)]">
          {loading ? (
            <p className="text-sm text-slate-500">正在读取预设…</p>
          ) : presets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900">尚未创建浏览器预设</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                创建后可对单个标签页应用，把 User-Agent 与 viewport 一起切换成目标设备。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {presets.map((preset) => {
                // 使用中即锁定：数量来自后台，页面不自行判断；锁定只放开「停止」，其余编辑入口一并禁用。
                const inUse = (usage[preset.id] ?? 0) > 0
                return (
                  <li
                    key={preset.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{preset.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {preset.userAgent === "default"
                          ? "不覆盖 UA"
                          : USER_AGENT_OPTIONS.find((option) => option.value === preset.userAgent)?.label}{" "}
                        · {preset.viewport.width}×{preset.viewport.height} @{preset.viewport.deviceScaleFactor}x ·{" "}
                        {preset.viewport.mobile ? "移动端" : "桌面端"}
                      </span>
                      {inUse && (
                        <span className="mt-0.5 block text-xs font-medium text-[#0c5fb8]">
                          正在 {usage[preset.id]} 个标签页使用
                        </span>
                      )}
                    </span>
                    <button
                      className="shrink-0 rounded-lg bg-[#0c5fb8] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#094c93] disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      aria-label={`应用 ${preset.name}`}
                      title={tabReason || undefined}
                      disabled={!!tabReason || applyingId === preset.id}
                      onClick={() => void applyPreset(preset)}>
                      {applyingId === preset.id ? "应用中" : "应用"}
                    </button>
                    {inUse && (
                      <button
                        className="shrink-0 rounded-lg border border-[#0c5fb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0c5fb8] transition-colors hover:bg-[#d7e9ff] disabled:opacity-60"
                        type="button"
                        aria-label={`停止 ${preset.name}`}
                        disabled={stoppingId === preset.id}
                        onClick={() => void stopPreset(preset)}>
                        {stoppingId === preset.id ? "停止中" : "停止"}
                      </button>
                    )}
                    <button
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      aria-label={`编辑 ${preset.name}`}
                      title={inUse ? "正在被使用的预设不能编辑，请先停止" : undefined}
                      disabled={inUse}
                      onClick={() => openEdit(preset)}>
                      编辑
                    </button>
                    <button
                      className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      aria-label={`删除 ${preset.name}`}
                      title={inUse ? "正在被使用的预设不能删除，请先停止" : undefined}
                      disabled={inUse}
                      onClick={(event) => {
                        deleteTriggerRef.current = event.currentTarget as HTMLElement
                        setPendingDelete(preset)
                      }}>
                      删除
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <Dialog
        open={!!conflict}
        titleId="preset-conflict-title"
        onClose={cancelConflict}
        panelClassName="max-w-[335px] rounded-[14px] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <h2 id="preset-conflict-title" className="text-base font-semibold leading-5 text-slate-950">
          确认保存冲突的移动端判定
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-600">
          UA 身份与视图开关对移动端的判定不一致，保存后站点可以据此判定为伪装。
        </p>
        <dl className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5">
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-slate-500">sec-ch-ua-mobile</dt>
            <dd className="min-w-0 text-slate-900">{conflict?.secChUaMobile}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-slate-500">布局</dt>
            <dd className="min-w-0 text-slate-900">
              按{conflict?.layout === "mobile" ? "移动端" : "桌面端"}处理
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium text-slate-500">风险</dt>
            <dd className="min-w-0 text-slate-900">
              UA 身份声明{conflict?.userAgentMobile ? "移动端" : "桌面端"}，视图开关却是
              {conflict?.viewportMobile ? "移动端" : "桌面端"}，两者不一致会让站点识别出指纹割裂，可能被判为伪装或返回不一致的资源。
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-3">
          <button
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
            type="button"
            onClick={cancelConflict}>
            取消
          </button>
          <button
            className="flex-1 rounded-xl bg-[#b42318] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#912018] active:bg-[#7a1a13] disabled:opacity-60"
            type="button"
            disabled={saving}
            onClick={() => void save(true)}>
            确认风险
          </button>
        </div>
      </Dialog>

      <Dialog
        open={!!pendingGroupMove}
        titleId="preset-group-move-title"
        onClose={cancelGroupMove}
        panelClassName="max-w-[335px] rounded-[14px] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <h2 id="preset-group-move-title" className="text-base font-semibold leading-5 text-slate-950">
          移出当前分组
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-600">
          当前标签页已属于你自己创建的分组。应用「{pendingGroupMove?.name}」会把它移出该分组，并归入模拟分组。
        </p>
        <div className="mt-4 flex gap-3">
          <button
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
            type="button"
            onClick={cancelGroupMove}>
            取消
          </button>
          <button
            className="flex-1 rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:opacity-60"
            type="button"
            disabled={applyingId === pendingGroupMove?.id}
            onClick={() => pendingGroupMove && void applyPreset(pendingGroupMove, true)}>
            移出并应用
          </button>
        </div>
      </Dialog>

      <Dialog
        open={!!pendingDelete}
        titleId="preset-delete-title"
        onClose={cancelDelete}
        panelClassName="max-w-[335px] rounded-[14px] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <h2 id="preset-delete-title" className="text-base font-semibold leading-5 text-slate-950">
          删除预设
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-600">确定删除「{pendingDelete?.name}」吗？此操作无法撤销。</p>
        <div className="mt-4 flex gap-3">
          <button
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100"
            type="button"
            onClick={cancelDelete}>
            取消
          </button>
          <button
            className="flex-1 rounded-xl bg-[#b42318] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#912018] active:bg-[#7a1a13]"
            type="button"
            onClick={() => void confirmDelete()}>
            确认删除
          </button>
        </div>
      </Dialog>
    </div>
  )
}
