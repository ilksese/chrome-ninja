import { Collapsible } from "@base-ui/react/collapsible"
import { useSignal } from "@preact/signals"
import SvgBiliBili from "@assets/svg/bilibili.svg?react"
import { useFormContext } from "react-hook-form"
import SwitchField from "./SwitchField"

function BilibiliSetting() {
  const { watch } = useFormContext<ChromeNinja.Options>()
  const open = useSignal(true)
  const { enabled, notify, blockAD } = watch("bilibili")
  return (
    <Collapsible.Root open={open.value} onOpenChange={(nextOpen) => {
      open.value = nextOpen
    }}>
      <Collapsible.Trigger className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <span className="grid size-8 place-items-center rounded-lg bg-slate-50">
          <SvgBiliBili width={24} height={24} />
        </span>
        <span className="flex-1 text-sm font-medium text-slate-900">哔哩哔哩</span>
        <span className="text-sm text-slate-500">{open ? "收起" : "展开"}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted={false}>
        <SwitchField checked={enabled} label="高画质" path="bilibili.enabled" />
        <SwitchField checked={notify} label="开播通知" path="bilibili.notify" tone="muted" />
        <SwitchField checked={blockAD} label="过滤广告内容" path="bilibili.blockAD" tone="muted" />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default BilibiliSetting
