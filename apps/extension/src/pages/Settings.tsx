import { Suspense } from "preact/compat"
import { useEffect } from "preact/hooks"
import BaiduSetting from "@components/settings/BiaduSetting"
import BilibiliSetting from "@components/settings/BilibiliSetting"
import { useAtom } from "jotai"
import { FormProvider, useForm } from "react-hook-form"
import { valibotResolver } from "@hookform/resolvers/valibot"
import * as v from "valibot"
import { optionsAtom, DEFAULT_OPTIONS } from "@/store/options"
import type { Options } from "@/types"

const validationSchema = v.object({
  bilibili: v.object({
    enabled: v.boolean(),
    notify: v.boolean(),
    blockAD: v.boolean()
  }),
  baidu: v.object({
    clearSearch: v.boolean()
  })
})

function Settings() {
  const [options, setOptions] = useAtom(optionsAtom)
  const methods = useForm<Options>({
    resolver: valibotResolver(validationSchema),
    mode: "onChange",
    defaultValues: options
  })
  const { reset } = methods
  const doSubmit = methods.handleSubmit((options) => {
    setOptions(options)
  })
  useEffect(() => {
    reset(options, { keepDefaultValues: true })
  }, [options, reset])
  return (
    <FormProvider {...methods}>
      <form id="Setting" name="Setting" action="" onSubmit={doSubmit}>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h1 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Settings</h1>
          <BilibiliSetting />
          <BaiduSetting />
        </section>
        <button className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white" type="submit">
          保存
        </button>
        <button
          className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900"
          type="button"
          onClick={() => {
            reset(DEFAULT_OPTIONS)
          }}>
          重置
        </button>
      </form>
    </FormProvider>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading...</p>}>
      <Settings />
    </Suspense>
  )
}
