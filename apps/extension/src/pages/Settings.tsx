import { useEffect, useRef } from "preact/hooks"
import BaiduSetting from "@components/settings/BiaduSetting"
import BilibiliSetting from "@components/settings/BilibiliSetting"
import { cn } from "@chrome-ninja/utils"
import { useAtom } from "jotai"
import { FormProvider, useForm } from "react-hook-form"
import { valibotResolver } from "@hookform/resolvers/valibot"
import * as v from "valibot"
import LoginStateExport from "@components/settings/LoginStateExport"
import VideoSnifferSetting from "@components/settings/VideoSnifferSetting"
import { optionsAtom, DEFAULT_OPTIONS } from "@/store/options"
import type { Options } from "@/types"

const validationSchema = v.object({
  userAgent: v.picklist(["default", "chrome-desktop", "chrome-android", "safira-desktop", "safira-ios"]),
  bilibili: v.object({
    enabled: v.boolean(),
    notify: v.boolean(),
    blockAD: v.boolean()
  }),
  baidu: v.object({
    clearSearch: v.boolean()
  }),
  boss: v.object({
    enabled: v.boolean()
  }),
  recorder: v.object({
    enabled: v.boolean()
  }),
  videoSniffer: v.object({
    enabled: v.boolean()
  }),
  translate: v.object({
    enabled: v.boolean(),
    baseUrl: v.string(),
    apiKey: v.string(),
    model: v.string(),
    targetLang: v.string()
  })
})

type SettingsProps = {
  layout: "popup" | "options"
}

export default function Settings({ layout }: SettingsProps) {
  const [options, setOptions] = useAtom(optionsAtom)
  const isOptions = layout === "options"
  const methods = useForm<Options>({
    resolver: valibotResolver(validationSchema),
    mode: "onChange",
    defaultValues: options
  })
  const { reset, watch } = methods
  const lastSavedOptionsRef = useRef(JSON.stringify(options))
  useEffect(() => {
    reset(options, { keepDefaultValues: true })
  }, [options, reset])
  useEffect(() => {
    const subscription = watch(() => {
      void methods.handleSubmit((nextOptions) => {
        const serializedOptions = JSON.stringify(nextOptions)
        if (serializedOptions === lastSavedOptionsRef.current) {
          return
        }

        lastSavedOptionsRef.current = serializedOptions
        setOptions(nextOptions)
      })()
    })

    return () => subscription.unsubscribe()
  }, [methods, setOptions, watch])
  return (
    <FormProvider {...methods}>
      <form id="Setting" name="Setting" action="" className={cn(isOptions && "grid grid-cols-[minmax(0,1fr)_240px] gap-6 max-[900px]:block")}>
        <section className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(16,24,40,0.10)]">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-slate-200 pb-4">
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">settings</span>
              <h1 className="mt-1 text-lg font-semibold leading-6 text-slate-950">按网站管理能力</h1>
              <span className="mt-1 block text-xs leading-4 text-slate-500">每张卡片代表一个站点能力组，展开后微调具体开关。</span>
            </span>
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">自动保存到 Chrome storage</span>
          </div>
          <div className={cn("grid gap-3", isOptions && "md:grid-cols-2")}>
            <BilibiliSetting />
            <BaiduSetting />
            <VideoSnifferSetting />
          </div>
        </section>
        <aside className={cn(isOptions ? "rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm max-[900px]:mt-4" : "mt-4")}>
          {isOptions && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-950">配置操作</h2>
              <p className="mt-1 text-xs leading-4 text-slate-500">修改会自动同步到扩展存储，重置会恢复默认配置。</p>
            </div>
          )}
          <button
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-white hover:text-slate-900 active:bg-slate-100 disabled:opacity-60"
            type="button"
            onClick={() => {
              reset(DEFAULT_OPTIONS)
            }}>
            重置默认
          </button>
          {isOptions && <LoginStateExport />}
        </aside>
      </form>
    </FormProvider>
  )
}
