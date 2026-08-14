import { Collapsible } from "@base-ui/react/collapsible"
import { useSignal } from "@preact/signals"
import SvgBaidu from "@assets/svg/baidu.svg?react"
import { useFormContext } from "react-hook-form"
import SwitchField from "./SwitchField"

function BaiduSetting() {
  const { watch } = useFormContext<ChromeNinja.Options>()
  const open = useSignal(true)
  const baidu = watch("baidu")
  return (
    <Collapsible.Root open={open.value} onOpenChange={(nextOpen) => {
      open.value = nextOpen
    }}>
      <Collapsible.Trigger className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left">
        <span className="grid size-8 place-items-center rounded-lg bg-slate-50">
          <SvgBaidu width={24} height={24} />
        </span>
        <span className="flex-1 text-sm font-medium text-slate-900">百度</span>
        <span className="text-sm text-slate-500">{open ? "收起" : "展开"}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted={false}>
        <SwitchField checked={baidu.clearSearch} label="清爽搜索" path="baidu.clearSearch" />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default BaiduSetting
