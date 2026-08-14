import { Switch } from "@base-ui/react/switch"
import { cn } from "@chrome-ninja/utils"
import { useFormContext } from "react-hook-form"
import type { BilibiliOptionsType, Options } from "@/types"

type SwitchFieldProps = {
  checked: boolean
  label: string
  path: "baidu.clearSearch" | `bilibili.${keyof BilibiliOptionsType}`
  tone?: "default" | "muted"
}

function SwitchField({ checked, label, path, tone = "default" }: SwitchFieldProps) {
  const { setValue } = useFormContext<Options>()

  return (
    <label className="flex min-h-12 items-center gap-3 px-4 py-2 pl-12">
      <span className={cn("grid size-7 place-items-center rounded-md text-xs font-semibold", tone === "muted" ? "bg-slate-100 text-slate-600" : "bg-sky-50 text-sky-700")}>ON</span>
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      <Switch.Root
        checked={checked}
        className="relative h-6 w-11 rounded-full bg-slate-300 outline-none transition-colors data-[checked]:bg-slate-900 data-[focus-visible]:ring-2 data-[focus-visible]:ring-slate-400"
        onCheckedChange={(value: boolean) => {
          setValue(path, value, { shouldDirty: true, shouldTouch: true, shouldValidate: true })
        }}>
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-5" />
      </Switch.Root>
    </label>
  )
}

export default SwitchField
