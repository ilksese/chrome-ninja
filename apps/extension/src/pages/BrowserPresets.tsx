import type {
  BrowserPreset,
  BrowserPresetDraft,
  BrowserPresetResponse,
  BrowserPresetUsage,
  TouchMode
} from "@/browser-preset/types"
import type { Resolver } from "react-hook-form"
import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { Controller, useForm } from "react-hook-form"
import { cn } from "@chrome-ninja/utils"
import Dialog from "@components/Dialog"
import { getDevicePreset } from "@/browser-preset/devices"
import {
  DEVICE_SCALE_MAX,
  DEVICE_SCALE_MIN,
  PRESET_NAME_MAX_LENGTH,
  validatePreset,
  VIEWPORT_MAX,
  VIEWPORT_MIN
} from "@/browser-preset/validation"

type BrowserPresetsProps = {
  layout: "popup" | "options"
}

type FormState = {
  id?: string
  name: string
  deviceId: string
  width: string
  height: string
  deviceScaleFactor: string
  touchMode?: TouchMode
}

const EMPTY_FORM: FormState = {
  name: "",
  deviceId: "",
  width: "1280",
  height: "720",
  deviceScaleFactor: "1"
}

const toDraft = (form: FormState): BrowserPresetDraft => ({
  name: form.name,
  deviceId: form.deviceId,
  touchMode: form.touchMode,
  viewport: {
    width: Number(form.width),
    height: Number(form.height),
    deviceScaleFactor: Number(form.deviceScaleFactor)
  }
})

const toForm = (preset: BrowserPreset): FormState => ({
  id: preset.id,
  name: preset.name,
  deviceId: preset.deviceId,
  width: String(preset.viewport.width),
  height: String(preset.viewport.height),
  deviceScaleFactor: String(preset.viewport.deviceScaleFactor),
  touchMode: preset.touchMode
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
  const [usage, setUsage] = useState<BrowserPresetUsage>({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [tabReason, setTabReason] = useState("")
  const [simulatingId, setSimulatingId] = useState<string | undefined>(undefined)
  const [applyingId, setApplyingId] = useState("")
  const [stoppingId, setStoppingId] = useState("")
  const [pendingDelete, setPendingDelete] = useState<BrowserPreset | null>(null)
  // 标签页在用户自建分组里：移出是有损操作，应用前必须由用户确认。
  const [pendingGroupMove, setPendingGroupMove] = useState<BrowserPreset | null>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)
  const presetsRef = useRef(presets)
  presetsRef.current = presets
  const resolver = useCallback<Resolver<FormState>>(async (values) => {
    const { errors } = validatePreset(toDraft(values), presetsRef.current, values.id)
    return {
      values: Object.keys(errors).length === 0 ? values : {},
      errors: Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [field, { type: "validate", message }])
      )
    }
  }, [])
  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setFocus,
    trigger,
    formState: { isSubmitted, isValid }
  } = useForm<FormState>({
    defaultValues: EMPTY_FORM,
    resolver,
    mode: "onChange"
  })

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

  // 应用前先问后台目标标签页能不能模拟，受限页面据此在点击前就禁用；应答同时带回模拟状态与一次性提示。
  const refreshStatus = useCallback(async () => {
    try {
      const response = await send({ type: "status" })
      if (!response?.ok) throw new Error(response?.error ?? "无法读取当前标签页")
      setTabReason(response.unavailableReason ?? "")
      setSimulatingId(response.presetId)
      if (response.notice) setNotice(response.notice)
    } catch (err) {
      setTabReason(err instanceof Error ? err.message : "无法读取当前标签页")
    }
  }, [send])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (formOpen) requestAnimationFrame(() => setFocus("name"))
  }, [formOpen, setFocus])

  useEffect(() => {
    if (formOpen) void trigger()
  }, [editingId, formOpen, trigger])

  const openCreate = (preset: BrowserPreset) => {
    setError("")
    setEditingId(undefined)
    reset({ ...toForm(preset), id: undefined, name: "" })
    setFormOpen(true)
  }

  const openEdit = (preset: BrowserPreset) => {
    setError("")
    setEditingId(preset.id)
    reset(toForm(preset))
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(undefined)
  }

  const canSave = formOpen && isValid && !saving

  const save = async () => {
    if (!formOpen) return
    if (!(await trigger())) return
    const values = getValues()
    setSaving(true)
    setError("")
    try {
      const response = await send({
        type: editingId ? "update" : "create",
        ...(editingId ? { id: editingId } : {}),
        preset: toDraft(values)
      })
      if (!response?.ok) throw new Error(response?.error ?? "保存失败")
      applyList(response)
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

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
      void refresh()
      setNotice(`已应用「${preset.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "应用预设失败")
      void refreshStatus()
      void refresh()
    } finally {
      setApplyingId("")
    }
  }

  // 取消只关闭确认框：后台没有做任何改动。
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
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出模拟失败")
    }
  }

  /** 停止一个预设：退出所有正在使用它的标签页，一次命令完成全局操作。 */
  const stopPreset = async (preset: BrowserPreset) => {
    setError("")
    setNotice("")
    setStoppingId(preset.id)
    try {
      const response = await send({ type: "stop", id: preset.id })
      if (!response?.ok) throw new Error(response?.error ?? "停止失败")
      applyList(response)
      setSimulatingId((id) => (id === preset.id ? undefined : id))
      setNotice(`已停止「${preset.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止失败")
    } finally {
      setStoppingId("")
    }
  }

  const simulatingPreset = simulatingId ? presets.find((preset) => preset.id === simulatingId) : undefined

  const formDevice = formOpen ? getDevicePreset(getValues("deviceId")) : undefined

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
        </div>

        <p className="mt-3 rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] px-3 py-2.5 text-xs leading-5 text-[#005bd1]">
          应用预设时，Chrome 会显示调试提示条。
        </p>

        {simulatingPreset ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] px-3 py-2.5">
            <span className="min-w-0 flex-1 text-xs leading-5 text-[#005bd1]">正在模拟「{simulatingPreset.name}」</span>
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

        {tabReason && !formOpen && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            当前标签页无法模拟：{tabReason}
          </p>
        )}
      </section>

      {formOpen ? (
        <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(16,24,40,0.12)]">
          <form aria-label="预设表单" onSubmit={handleSubmit(() => void save())}>
            <h2 className="text-sm font-semibold text-slate-950">{editingId ? "编辑预设" : "自定义预设"}</h2>
            <p className="mt-1 text-xs text-slate-500">来源设备：{formDevice?.name}</p>

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">预设名称</span>
                <Controller
                  name="name"
                  control={control}
                  render={({ field, fieldState }) => {
                    const message = (isSubmitted || fieldState.isTouched) && fieldState.error?.message
                    return (
                      <>
                        <input
                          ref={field.ref}
                          className={cn(fieldClass, message && "border-red-400 focus:border-red-500")}
                          type="text"
                          value={field.value}
                          maxLength={PRESET_NAME_MAX_LENGTH * 2}
                          placeholder="例如 iPhone 15 调试"
                          aria-invalid={!!message}
                          aria-describedby={message ? "preset-name-error" : undefined}
                          onInput={(event) => field.onChange((event.target as HTMLInputElement).value)}
                          onBlur={field.onBlur}
                        />
                        {message && (
                          <span id="preset-name-error" className="mt-1 block text-xs text-red-600">
                            {message}
                          </span>
                        )}
                      </>
                    )
                  }}
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">视口宽度</span>
                  <Controller
                    name="width"
                    control={control}
                    render={({ field, fieldState }) => {
                      const message = (isSubmitted || fieldState.isTouched) && fieldState.error?.message
                      return (
                        <>
                          <input
                            ref={field.ref}
                            className={cn(fieldClass, message && "border-red-400 focus:border-red-500")}
                            type="number"
                            inputMode="numeric"
                            min={VIEWPORT_MIN}
                            max={VIEWPORT_MAX}
                            value={field.value}
                            onInput={(event) => field.onChange((event.target as HTMLInputElement).value)}
                            onBlur={field.onBlur}
                          />
                          {message && <span className="mt-1 block text-xs text-red-600">{message}</span>}
                        </>
                      )
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">视口高度</span>
                  <Controller
                    name="height"
                    control={control}
                    render={({ field, fieldState }) => {
                      const message = (isSubmitted || fieldState.isTouched) && fieldState.error?.message
                      return (
                        <>
                          <input
                            ref={field.ref}
                            className={cn(fieldClass, message && "border-red-400 focus:border-red-500")}
                            type="number"
                            inputMode="numeric"
                            min={VIEWPORT_MIN}
                            max={VIEWPORT_MAX}
                            value={field.value}
                            onInput={(event) => field.onChange((event.target as HTMLInputElement).value)}
                            onBlur={field.onBlur}
                          />
                          {message && <span className="mt-1 block text-xs text-red-600">{message}</span>}
                        </>
                      )
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">设备像素比</span>
                  <Controller
                    name="deviceScaleFactor"
                    control={control}
                    render={({ field, fieldState }) => {
                      const message = (isSubmitted || fieldState.isTouched) && fieldState.error?.message
                      return (
                        <>
                          <input
                            ref={field.ref}
                            className={cn(fieldClass, message && "border-red-400 focus:border-red-500")}
                            type="number"
                            inputMode="decimal"
                            // 档位里的 2.625 这类像素比不是 0.5 的整数倍；固定 step 会让表单校验失败并拦下隐式提交。
                            step="any"
                            min={DEVICE_SCALE_MIN}
                            max={DEVICE_SCALE_MAX}
                            value={field.value}
                            onInput={(event) => field.onChange((event.target as HTMLInputElement).value)}
                            onBlur={field.onBlur}
                          />
                          {message && <span className="mt-1 block text-xs text-red-600">{message}</span>}
                        </>
                      )
                    }}
                  />
                </label>
              </div>

              {formDevice?.mobile && (
                <fieldset>
                  <legend className="text-xs font-medium text-slate-600">触摸方式</legend>
                  <Controller
                    name="touchMode"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 p-1">
                        {(["mouse", "touch"] as const).map((mode) => (
                          <label key={mode} className="cursor-pointer text-center text-sm">
                            <input
                              className="peer sr-only"
                              type="radio"
                              name={field.name}
                              value={mode}
                              checked={field.value === mode}
                              onChange={() => field.onChange(mode)}
                              onBlur={field.onBlur}
                            />
                            <span className="block rounded-md px-3 py-1.5 peer-checked:bg-[#e8f2ff] peer-checked:text-[#005bd1] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0077ff]">
                              {mode}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  />
                </fieldset>
              )}
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
          ) : (
            <ul className="space-y-2">
              {presets.map((preset) => {
                const builtin = preset.id === preset.deviceId
                const device = getDevicePreset(preset.deviceId)
                // 使用中即锁定：数量来自后台，页面不自行判断。
                const inUse = (usage[preset.id] ?? 0) > 0
                // 窄屏（Popup）下按钮会挤扁信息列，因此信息与操作分行；宽屏（Options）保持单行。
                return (
                  <li
                    key={preset.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{preset.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {builtin ? "内置" : device?.name} · {preset.viewport.width}×{preset.viewport.height} @
                        {preset.viewport.deviceScaleFactor}x ·{" "}
                        {device?.mobile ? `移动端 · ${preset.touchMode}` : "桌面端"}
                      </span>
                      {inUse && (
                        <span className="mt-0.5 block text-xs font-medium text-[#0c5fb8]">
                          正在 {usage[preset.id]} 个标签页使用
                        </span>
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <button
                        className="shrink-0 rounded-lg bg-[#0c5fb8] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#094c93] disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        aria-label={`应用 ${preset.name}`}
                        title={tabReason || undefined}
                        disabled={!!tabReason || !!applyingId}
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
                        aria-label={`${builtin ? "自定义" : "编辑"} ${preset.name}`}
                        title={!builtin && inUse ? "正在被使用的预设不能编辑，请先停止" : undefined}
                        disabled={!builtin && inUse}
                        onClick={() => (builtin ? openCreate(preset) : openEdit(preset))}>
                        {builtin ? "自定义" : "编辑"}
                      </button>
                      {!builtin && (
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
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

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
