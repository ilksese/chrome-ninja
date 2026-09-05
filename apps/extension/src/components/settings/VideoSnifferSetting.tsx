import { Collapsible } from "@base-ui/react/collapsible"
import { useState } from "preact/hooks"
import { useFormContext } from "react-hook-form"
import SwitchField from "./SwitchField"
import type { Options } from "@/types"

function VideoSnifferSetting() {
  const { watch } = useFormContext<Options>()
  const [open, setOpen] = useState(false)
  const enabled = watch("videoSniffer.enabled")

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="relative flex w-full items-start gap-3 overflow-hidden rounded-[14px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#ffb894] hover:bg-slate-50 active:bg-[#fff7f2]">
        <span className="absolute inset-y-0 left-0 w-1 bg-[#ff7a3d]" />
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#ffd0b8] bg-[#fff3ec] text-sm font-black text-[#b24a13]">VID</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">视频嗅探</span>
            <span className="rounded-full bg-[#fff3ec] px-2 py-0.5 text-[11px] font-medium text-[#b24a13]">{enabled ? "已启用" : "已关闭"}</span>
          </span>
          <span className="mt-1 block text-xs leading-4 text-slate-500">捕获页面中的视频直链、HLS 和 DASH 清单。</span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#ffd0b8] bg-[#fff7f2] px-2 py-0.5 text-[11px] font-medium text-[#b24a13]">网络监听 {enabled ? "ON" : "OFF"}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">点击下载</span>
          </span>
        </span>
        <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500">{open ? "收起" : "展开"}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="grid gap-2 px-1 pb-1 pt-3" keepMounted={false}>
        <SwitchField checked={enabled} label="启用视频嗅探" description="关闭后停止页面扫描和网络媒体监听。" path="videoSniffer.enabled" tone="orange" />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

export default VideoSnifferSetting
