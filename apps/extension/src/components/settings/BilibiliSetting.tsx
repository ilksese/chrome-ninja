import { Collapsible } from "@base-ui/react/collapsible"
import { useState } from "preact/hooks"
import bilibiliIcon from "@assets/svg/bilibili.svg"
import { useFormContext } from "react-hook-form"
import SwitchField from "./SwitchField"
import type { Options } from "@/types"

function BilibiliSetting() {
  const { watch } = useFormContext<Options>()
  const [open, setOpen] = useState(false)
  const { enabled, notify, blockAD } = watch("bilibili")
  const enabledCount = [enabled, notify, blockAD].filter(Boolean).length
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}>
      <Collapsible.Trigger className="relative flex w-full items-start gap-3 overflow-hidden rounded-[14px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#9bc8ff] hover:bg-slate-50 active:bg-[#f4f8ff]">
        <span className="absolute inset-y-0 left-0 w-1 bg-[#0077ff]" />
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#b7d6ff] bg-[#e8f2ff]">
          <img className="size-6" src={bilibiliIcon} alt="" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">哔哩哔哩</span>
            <span className="rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[11px] font-medium text-[#005bd1]">{enabledCount}/3 已启用</span>
          </span>
          <span className="mt-1 block text-xs leading-4 text-slate-500">默认高画质、减少广告干扰，并保留开播提醒能力。</span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#b7d6ff] bg-[#f4f8ff] px-2 py-0.5 text-[11px] font-medium text-[#005bd1]">高画质 {enabled ? "ON" : "OFF"}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">通知 {notify ? "ON" : "OFF"}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">广告 {blockAD ? "ON" : "OFF"}</span>
          </span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500">{open ? "收起" : "展开"}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="grid gap-2 px-1 pb-1 pt-3" keepMounted={false}>
        <SwitchField checked={enabled} label="默认高画质" description="进入播放页后优先使用更清晰的可用画质。" path="bilibili.enabled" />
        <SwitchField checked={notify} label="开播通知" description="保留你关注直播的即时提醒。" path="bilibili.notify" tone="slate" />
        <SwitchField checked={blockAD} label="过滤广告内容" description="减少播放和信息流里的干扰元素。" path="bilibili.blockAD" tone="slate" />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default BilibiliSetting
