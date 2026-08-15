import { cn } from "@chrome-ninja/utils"
import { useAtom } from "jotai"
import { useEffect, useRef, useState } from "preact/hooks"
import logoIcon from "@assets/mdlogo.png"
import baiduIcon from "@assets/svg/baidu.svg"
import bilibiliIcon from "@assets/svg/bilibili.svg"
import { optionsAtom } from "@/store/options"
import type { UserAgentType } from "@/types"
import { applyUserAgentRule, getUserAgentOption, USER_AGENT_OPTIONS } from "@/user-agent"

type HomeProps = {
  layout: "popup" | "options"
}

const USER_AGENT_HINTS: Record<UserAgentType, string> = {
  default: "跟随当前浏览器，不额外改写请求身份。",
  "chrome-desktop": "桌面站点优先，适合查看完整页面。",
  "chrome-android": "移动站点优先，适合验证手机端内容。",
  "safira-desktop": "Safari 桌面身份，适合兼容性排查。",
  "safira-ios": "iPhone Safari 身份，适合移动页面适配。"
}

function BrowserMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white shadow-[0_16px_32px_rgba(16,24,40,0.14)]">
      <div className={cn("flex items-center gap-2 border-b border-slate-200 px-3", compact ? "h-7" : "h-9")}>
        <span className="size-2.5 rounded-full bg-[#ff7a3d]" />
        <span className="size-2.5 rounded-full bg-[#ffcf57]" />
        <span className="size-2.5 rounded-full bg-[#28c76f]" />
        <span className="ml-2 h-5 flex-1 rounded-md bg-slate-100 px-2 text-[10px] leading-5 text-slate-500">chrome-ninja.local</span>
      </div>
      <div className={cn("grid", compact ? "gap-2 p-2" : "gap-3 p-3")}>
        <div className={cn("rounded-xl bg-[#101828] text-white", compact ? "p-2.5" : "p-3")}>
          <div className={cn("flex items-center gap-2", compact ? "mb-2" : "mb-3")}>
            <img className="size-5" src={bilibiliIcon} alt="" />
            <span className="text-xs font-medium text-white/82">Bilibili</span>
            <span className="ml-auto rounded-full bg-[#0077ff] px-2 py-0.5 text-[10px] font-medium">1080P+</span>
          </div>
          <div className="aspect-video rounded-lg bg-[linear-gradient(135deg,#18243a,#0077ff)] p-2">
            <div className="h-full rounded-md border border-white/18 bg-white/10" />
          </div>
        </div>
        <div className={cn("grid grid-cols-[1fr_76px]", compact ? "gap-2" : "gap-3")}>
          <div className={cn("rounded-xl border border-slate-200 bg-slate-50", compact ? "p-2.5" : "p-3")}>
            <div className="mb-2 flex items-center gap-2">
              <img className="size-5" src={baiduIcon} alt="" />
              <span className="text-xs font-medium text-slate-600">Baidu</span>
            </div>
            <div className="space-y-1.5">
              <span className="block h-2 rounded-full bg-slate-300" />
              <span className="block h-2 w-4/5 rounded-full bg-slate-200" />
              <span className="block h-2 w-2/3 rounded-full bg-[#ffdfcc]" />
            </div>
          </div>
          <div className={cn("rounded-xl border border-[#b7d6ff] bg-[#e8f2ff] text-center", compact ? "p-2.5" : "p-3")}>
            <span className="block text-[10px] font-medium text-slate-500">UA</span>
            <span className="mt-2 block rounded-lg bg-white py-1.5 text-xs font-semibold text-[#005bd1]">一键切换</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const Home = ({ layout }: HomeProps) => {
  const [options, setOptions] = useAtom(optionsAtom)
  const [isUserAgentOpen, setIsUserAgentOpen] = useState(false)
  const [selectedUserAgent, setSelectedUserAgent] = useState<UserAgentType>(options.userAgent)
  const [isApplying, setIsApplying] = useState(false)
  const [isBossApplying, setIsBossApplying] = useState(false)
  const [error, setError] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstRadioRef = useRef<HTMLInputElement>(null)
  const activeUserAgent = getUserAgentOption(options.userAgent)
  const selectedUserAgentOption = getUserAgentOption(selectedUserAgent)
  const isOptions = layout === "options"

  const closeUserAgentDialog = () => {
    setIsUserAgentOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openUserAgentDialog = () => {
    setSelectedUserAgent(options.userAgent)
    setError("")
    setIsUserAgentOpen(true)
  }

  useEffect(() => {
    if (!isUserAgentOpen) {
      return
    }

    requestAnimationFrame(() => firstRadioRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeUserAgentDialog()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isUserAgentOpen])

  const confirmUserAgent = async () => {
    setIsApplying(true)
    setError("")
    try {
      await applyUserAgentRule(selectedUserAgent)
      await setOptions({ ...options, userAgent: selectedUserAgent })
      closeUserAgentDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "User-Agent 应用失败")
    } finally {
      setIsApplying(false)
    }
  }

  const toggleBossAntiDetection = async () => {
    setIsBossApplying(true)
    setError("")
    try {
      await setOptions({ ...options, boss: { ...options.boss, enabled: !options.boss.enabled } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "BOSS 反检测开关保存失败")
    } finally {
      setIsBossApplying(false)
    }
  }

  return (
    <div className={cn("Home", isOptions ? "grid grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] gap-6 max-[900px]:block" : "space-y-3")}>
      <section className={cn("overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(16,24,40,0.12)]", isOptions && "grid grid-cols-[0.92fr_1.08fr] max-[900px]:block")}>
        <div className={cn(isOptions ? "px-4 pb-4 pt-4" : "px-3.5 pb-3 pt-3.5")}>
          <div className={cn("flex items-center gap-3", isOptions ? "mb-4" : "mb-2.5")}>
            <span className={cn("grid place-items-center rounded-xl border border-slate-200 bg-white shadow-sm", isOptions ? "size-11" : "size-10")}>
              <img className={cn(isOptions ? "size-8" : "size-7")} src={logoIcon} alt="chrome ninja" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">chrome ninja</span>
              <span className="block text-lg font-semibold leading-6 text-slate-950">清爽浏览，默认高效</span>
            </span>
          </div>
          <p className={cn("font-semibold text-slate-950", isOptions ? "text-[22px] leading-7" : "text-[19px] leading-6")}>B 站高画质、搜索减干扰、UA 身份切换。</p>
          <p className={cn("text-slate-600", isOptions ? "mt-2 text-sm leading-5" : "mt-1 text-xs leading-4")}>打开即用，少调设置，多看内容。</p>

          <div className={cn("grid grid-cols-2", isOptions ? "mt-4 gap-3" : "mt-3 gap-2")}> 
            <div className={cn("rounded-xl border border-[#b7d6ff] bg-[#e8f2ff]", isOptions ? "p-3" : "p-2.5")}>
              <div className={cn("flex items-center gap-2", isOptions ? "mb-2" : "mb-1")}>
                <img className="size-5" src={bilibiliIcon} alt="" />
                <span className="text-xs font-medium text-slate-700">Bilibili</span>
              </div>
              <p className="text-sm font-semibold leading-5 text-slate-950">默认高画质</p>
            </div>
            <div className={cn("rounded-xl border border-[#ffd0b8] bg-[#fff3ec]", isOptions ? "p-3" : "p-2.5")}>
              <div className={cn("flex items-center gap-2", isOptions ? "mb-2" : "mb-1")}>
                <img className="size-5" src={baiduIcon} alt="" />
                <span className="text-xs font-medium text-slate-700">Baidu</span>
              </div>
              <p className="text-sm font-semibold leading-5 text-slate-950">结果更清爽</p>
            </div>
          </div>
        </div>

        <div className={cn(isOptions ? "px-4 pb-4" : "px-3.5 pb-3")}>
          <BrowserMockup compact={!isOptions} />
        </div>

          <button
            ref={triggerRef}
            className={cn("flex w-full items-center gap-3 border-t border-slate-200 bg-slate-50 text-left transition-all hover:bg-white active:bg-[#e8f2ff] disabled:opacity-60", isOptions ? "col-span-2 px-4 py-4" : "px-3.5 py-3")}
          type="button"
          disabled={isApplying}
          onClick={openUserAgentDialog}>
          <span className={cn("grid place-items-center rounded-xl bg-[#101828] text-sm font-semibold text-white shadow-[0_10px_22px_rgba(16,24,40,0.18)]", isOptions ? "size-10" : "size-9")}>UA</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-950">切换浏览器身份</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">当前为 {activeUserAgent.label} · {USER_AGENT_HINTS[options.userAgent]}</span>
          </span>
          <span className="text-2xl leading-none text-[#005bd1]">›</span>
        </button>

        <button
          className={cn("flex w-full items-center gap-3 border-t border-slate-200 bg-white text-left transition-all hover:bg-slate-50 active:bg-[#f4f8ff] disabled:opacity-60", isOptions ? "col-span-2 px-4 py-4" : "px-3.5 py-3")}
          type="button"
          role="switch"
          aria-checked={options.boss.enabled}
          disabled={isBossApplying}
          onClick={toggleBossAntiDetection}>
          <span className={cn("grid place-items-center rounded-xl text-[11px] font-semibold shadow-sm", isOptions ? "size-10" : "size-9", options.boss.enabled ? "bg-[#101828] text-white" : "bg-slate-100 text-slate-500")}>{options.boss.enabled ? "ON" : "OFF"}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-950">BOSS 反检测</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">{options.boss.enabled ? "已启用 zhipin/bosszhipin 页面环境保护" : "默认关闭，需要时手动启用"}</span>
          </span>
          <span className={cn("relative h-6 w-11 rounded-full transition-colors", options.boss.enabled ? "bg-[#101828]" : "bg-slate-300")} aria-hidden="true">
            <span className={cn("absolute top-0.5 block size-5 rounded-full bg-white shadow transition-transform", options.boss.enabled ? "translate-x-5" : "translate-x-0.5")} />
          </span>
        </button>
      </section>

      {isUserAgentOpen && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/48 p-4" role="presentation" onClick={closeUserAgentDialog}>
          <section
            className="w-full max-w-[335px] overflow-hidden rounded-[14px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-agent-title"
            onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#101828,#123b66_62%,#0c5fb8)] px-4 py-3 text-white">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/62">identity switch</span>
              <h2 id="user-agent-title" className="mt-1 text-base font-semibold leading-5">
                {selectedUserAgentOption.label}
              </h2>
              <p className="mt-1 text-xs leading-4 text-white/72">{USER_AGENT_HINTS[selectedUserAgent]}</p>
            </div>

            <div className="space-y-2 p-4" role="radiogroup" aria-label="User-Agent">
              {USER_AGENT_OPTIONS.map((option, index) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-[#9bc8ff] hover:bg-slate-50 has-[:checked]:border-[#0077ff] has-[:checked]:bg-[#e8f2ff] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  <input
                    ref={index === 0 ? firstRadioRef : undefined}
                    className="mt-0.5 size-4 accent-[#0c5fb8]"
                    type="radio"
                    name="userAgent"
                    value={option.value}
                    checked={selectedUserAgent === option.value}
                    disabled={isApplying}
                    onChange={() => setSelectedUserAgent(option.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-5 text-slate-950">{option.label}</span>
                    <span className="block text-xs leading-4 text-slate-500">{USER_AGENT_HINTS[option.value]}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

            <div className="flex gap-3 border-t border-slate-200 p-4">
              <button
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
                type="button"
                disabled={isApplying}
                onClick={closeUserAgentDialog}>
                取消
              </button>
              <button
                className="flex-1 rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054] disabled:opacity-60"
                type="button"
                disabled={isApplying}
                onClick={confirmUserAgent}>
                {isApplying ? "应用中" : "确认"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
export default Home
