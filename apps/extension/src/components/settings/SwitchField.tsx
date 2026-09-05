import { Switch } from "@base-ui/react/switch"
import { cn } from "@chrome-ninja/utils"
import { useFormContext } from "react-hook-form"
import type { BilibiliOptionsType, BossSettingType, Options } from "@/types"

type SwitchFieldProps = {
  checked: boolean
  label: string
  description?: string
  path: "baidu.clearSearch" | `bilibili.${keyof BilibiliOptionsType}` | `boss.${keyof BossSettingType}` | "videoSniffer.enabled"
  tone?: "blue" | "slate" | "orange"
}

function SwitchField({ checked, description, label, path, tone = "blue" }: SwitchFieldProps) {
  const { setValue } = useFormContext<Options>()

  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-all hover:border-[#9bc8ff] hover:bg-slate-50 active:bg-[#f4f8ff]">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg text-[11px] font-semibold",
          tone === "blue" && "bg-[#e8f2ff] text-[#005bd1]",
          tone === "orange" && "bg-[#fff3ec] text-[#b24a13]",
          tone === "slate" && "bg-slate-100 text-slate-600"
        )}>
        {checked ? "ON" : "OFF"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span>}
      </span>
      <Switch.Root
        checked={checked}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300 p-0 outline-none transition-colors hover:bg-slate-400 data-[checked]:bg-[#101828] data-[checked]:hover:bg-[#1d2939] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[#0077ff] data-[disabled]:opacity-50"
        onCheckedChange={(value: boolean) => {
          setValue(path, value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
        }}>
        <Switch.Thumb className="block size-5 shrink-0 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-5" />
      </Switch.Root>
    </label>
  )
}

export default SwitchField
