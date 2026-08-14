import { Collapsible } from "@base-ui/react/collapsible"
import { useSignal } from "@preact/signals"
import baiduIcon from "@assets/svg/baidu.svg"
import { useFormContext } from "react-hook-form"
import SwitchField from "./SwitchField"
import type { Options } from "@/types"

function BaiduSetting() {
  const { watch } = useFormContext<Options>()
  const open = useSignal(true)
  const baidu = watch("baidu")
  const enabledCount = baidu.clearSearch ? 1 : 0
  return (
    <Collapsible.Root
      open={open.value}
      onOpenChange={(nextOpen) => {
        open.value = nextOpen
      }}>
      <Collapsible.Trigger className="relative flex w-full items-start gap-3 overflow-hidden rounded-[14px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#ffb894] hover:bg-slate-50 active:bg-[#fff7f2]">
        <span className="absolute inset-y-0 left-0 w-1 bg-[#ff7a3d]" />
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#ffd0b8] bg-[#fff3ec]">
          <img className="size-6" src={baiduIcon} alt="" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">百度搜索</span>
            <span className="rounded-full bg-[#fff3ec] px-2 py-0.5 text-[11px] font-medium text-[#b24a13]">{enabledCount}/1 已启用</span>
          </span>
          <span className="mt-1 block text-xs leading-4 text-slate-500">减少结果页干扰，让自然结果和摘要更容易扫描。</span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#ffd0b8] bg-[#fff7f2] px-2 py-0.5 text-[11px] font-medium text-[#b24a13]">搜索净化 {baidu.clearSearch ? "ON" : "OFF"}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">摘要优先</span>
          </span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500">{open.value ? "收起" : "展开"}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="grid gap-2 px-1 pb-1 pt-3" keepMounted={false}>
        <SwitchField checked={baidu.clearSearch} label="清爽搜索结果" description="弱化广告和重复模块，保留核心搜索内容。" path="baidu.clearSearch" tone="orange" />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default BaiduSetting
