import { cn } from "@chrome-ninja/utils"
import { useAtom } from "jotai"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import logoIcon from "@assets/mdlogo.png"
import Dialog from "@components/Dialog"
import CookieEditor from "@components/settings/CookieEditor"
import LoginStateExport from "@components/settings/LoginStateExport"
import QrPanel from "@/qr/panel"
import { optionsAtom } from "@/store/options"
import type { UserAgentType } from "@/types"
import { applyUserAgentRule, getUserAgentOption, USER_AGENT_OPTIONS } from "@/user-agent"

type HomeProps = {
  layout: "popup" | "options"
}

const HOME_INTRO_STORAGE_KEY = "homeIntroSeen"

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
        <div className={cn("rounded-xl border border-slate-200 bg-slate-50", compact ? "p-2.5" : "p-3")}>
          <div className={cn("flex items-center gap-2", compact ? "mb-2" : "mb-3")}>
            <span className="grid size-5 place-items-center rounded-md bg-[#101828] text-[10px] font-semibold text-white">CN</span>
            <span className="text-xs font-medium text-slate-700">首页概览</span>
            <span className="ml-auto rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[10px] font-medium text-[#005bd1]">Ready</span>
          </div>
          <div className="space-y-1.5">
            <span className="block h-2 rounded-full bg-slate-300" />
            <span className="block h-2 w-4/5 rounded-full bg-slate-200" />
            <span className="block h-2 w-2/3 rounded-full bg-[#ffdfcc]" />
          </div>
        </div>
        <div className={cn("grid grid-cols-[1fr_76px]", compact ? "gap-2" : "gap-3")}>
          <div className={cn("rounded-xl border border-slate-200 bg-slate-50", compact ? "p-2.5" : "p-3")}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-md bg-[#e8f2ff] text-[10px] font-semibold text-[#005bd1]">UA</span>
              <span className="text-xs font-medium text-slate-600">身份切换</span>
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

function IntroDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={open} titleId="home-intro-title" onClose={onClose} initialFocusRef={closeButtonRef} panelClassName="border border-white/12">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#101828,#123b66_62%,#0c5fb8)] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-white/12 bg-white/10 shadow-sm">
            <img className="size-8" src={logoIcon} alt="chrome ninja" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/62">chrome ninja</span>
            <h2 id="home-intro-title" className="mt-1 text-lg font-semibold leading-6">
              清爽浏览，默认高效
            </h2>
          </span>
        </div>
        <p className="mt-3 text-sm leading-5 text-white/78">B 站高画质、搜索减干扰、UA 身份切换。</p>
      </div>

      <div className="min-h-0 space-y-3 overflow-y-auto p-5">
        <BrowserMockup />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-md bg-[#101828] text-[10px] font-semibold text-white">UA</span>
                <span className="text-xs font-medium text-slate-700">身份切换</span>
              </div>
              <p className="text-sm font-semibold leading-5 text-slate-950">一键切换浏览器身份</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded-md bg-[#e8f2ff] text-[10px] font-semibold text-[#005bd1]">OK</span>
                <span className="text-xs font-medium text-slate-700">默认状态</span>
              </div>
              <p className="text-sm font-semibold leading-5 text-slate-950">常用能力已就绪</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-950">首次进入提示</span>
              <span className="block text-xs leading-4 text-slate-500">关闭后将不再显示。</span>
            </span>
            <button
              ref={closeButtonRef}
              className="shrink-0 rounded-lg bg-[#101828] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054]"
              type="button"
              onClick={onClose}>
              开始使用
            </button>
          </div>
        </div>
    </Dialog>
  )
}

function DialogActions({ children }: { children: ComponentChildren }) {
  return <div className="mt-6">{children}</div>
}

const Home = ({ layout }: HomeProps) => {
  const [options, setOptions] = useAtom(optionsAtom)
  const [isUserAgentOpen, setIsUserAgentOpen] = useState(false)
  const [isLoginStateOpen, setIsLoginStateOpen] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [qrInitialText, setQrInitialText] = useState("")
  const [hasSeenIntro, setHasSeenIntro] = useState<boolean | null>(null)
  const [selectedUserAgent, setSelectedUserAgent] = useState<UserAgentType>(options.userAgent)
  const [isApplying, setIsApplying] = useState(false)
  const [isBossApplying, setIsBossApplying] = useState(false)
  const [isRecorderApplying, setIsRecorderApplying] = useState(false)
  const [error, setError] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const loginStateTriggerRef = useRef<HTMLButtonElement>(null)
  const qrTriggerRef = useRef<HTMLButtonElement>(null)
  const firstRadioRef = useRef<HTMLInputElement>(null)
  const activeUserAgent = getUserAgentOption(options.userAgent)
  const selectedUserAgentOption = getUserAgentOption(selectedUserAgent)
  const isOptions = layout === "options"
  const shouldShowIntro = hasSeenIntro === false

  useEffect(() => {
    chrome.storage?.local.get([HOME_INTRO_STORAGE_KEY], (result) => {
      setHasSeenIntro(result[HOME_INTRO_STORAGE_KEY] === true)
    })
  }, [])

  const dismissIntro = () => {
    setHasSeenIntro(true)
    chrome.storage?.local.set({ [HOME_INTRO_STORAGE_KEY]: true }, () => {})
  }

  const closeUserAgentDialog = () => {
    setIsUserAgentOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openUserAgentDialog = () => {
    setSelectedUserAgent(options.userAgent)
    setError("")
    setIsUserAgentOpen(true)
  }

  const closeLoginStateDialog = () => {
    setIsLoginStateOpen(false)
    requestAnimationFrame(() => loginStateTriggerRef.current?.focus())
  }

  const openQrDialog = async () => {
    let url = ""
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      url = tab?.url ?? ""
    } catch {
      url = ""
    }
    setQrInitialText(url)
    setIsQrOpen(true)
  }

  const closeQrDialog = () => {
    setIsQrOpen(false)
    requestAnimationFrame(() => qrTriggerRef.current?.focus())
  }

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

  const toggleRecorder = async () => {
    setIsRecorderApplying(true)
    setError("")
    try {
      await setOptions({ ...options, recorder: { ...options.recorder, enabled: !options.recorder.enabled } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "步骤录制开关保存失败")
    } finally {
      setIsRecorderApplying(false)
    }
  }

  return (
    <div className={cn("Home relative", isOptions ? "grid grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] gap-6 max-[900px]:block" : "space-y-3")}>
      <section className={cn("overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(16,24,40,0.12)]", isOptions && "grid grid-cols-[0.92fr_1.08fr] max-[900px]:block") }>
        <div className={cn(isOptions ? "px-4 pb-4 pt-4" : "px-3.5 pb-3 pt-3.5") }>
          <div className={cn("flex items-center justify-between gap-3", isOptions ? "mb-4" : "mb-3") }>
            <span className="min-w-0 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                <img className="size-7" src={logoIcon} alt="chrome ninja" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">chrome ninja</span>
                <span className="block text-[15px] font-semibold leading-5 text-slate-950">控制面板</span>
              </span>
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">运行中</span>
          </div>

          <div className={cn("grid gap-3", isOptions ? "grid-cols-[minmax(0,1fr)_160px]" : "") }>
            <button
              ref={triggerRef}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-white active:bg-[#e8f2ff] disabled:opacity-60"
              type="button"
              disabled={isApplying}
              onClick={openUserAgentDialog}>
              <span className="grid size-10 place-items-center rounded-xl bg-[#101828] text-sm font-semibold text-white shadow-[0_10px_22px_rgba(16,24,40,0.18)]">UA</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">切换浏览器身份</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">当前为 {activeUserAgent.label}</span>
              </span>
              <span className="text-2xl leading-none text-[#005bd1]">›</span>
            </button>

            <button
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff] disabled:opacity-60"
              type="button"
              role="switch"
              aria-checked={options.boss.enabled}
              disabled={isBossApplying}
              onClick={toggleBossAntiDetection}>
              <span className={cn("grid size-10 place-items-center rounded-xl text-[11px] font-semibold shadow-sm", options.boss.enabled ? "bg-[#101828] text-white" : "bg-slate-100 text-slate-500")}>{options.boss.enabled ? "ON" : "OFF"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">BOSS 反检测</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{options.boss.enabled ? "已启用" : "默认关闭"}</span>
              </span>
              <span className={cn("relative h-6 w-11 rounded-full transition-colors", options.boss.enabled ? "bg-[#101828]" : "bg-slate-300")} aria-hidden="true">
                <span className={cn("absolute top-0.5 block size-5 rounded-full bg-white shadow transition-transform", options.boss.enabled ? "translate-x-5" : "translate-x-0.5")} />
              </span>
            </button>

            <button
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff] disabled:opacity-60"
              type="button"
              role="switch"
              aria-label="步骤录制总开关"
              aria-checked={options.recorder.enabled}
              disabled={isRecorderApplying}
              onClick={toggleRecorder}>
              <span className={cn("grid size-10 place-items-center rounded-xl text-[11px] font-semibold shadow-sm", options.recorder.enabled ? "bg-[#b42318] text-white" : "bg-slate-100 text-slate-500")}>{options.recorder.enabled ? "ON" : "OFF"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">步骤录制</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{options.recorder.enabled ? "页面面板已开启" : "默认关闭"}</span>
              </span>
              <span className={cn("relative h-6 w-11 rounded-full transition-colors", options.recorder.enabled ? "bg-[#b42318]" : "bg-slate-300")} aria-hidden="true">
                <span className={cn("absolute top-0.5 block size-5 rounded-full bg-white shadow transition-transform", options.recorder.enabled ? "translate-x-5" : "translate-x-0.5")} />
              </span>
            </button>

            <button
              ref={qrTriggerRef}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff]"
              type="button"
              onClick={() => void openQrDialog()}>
              <span className="grid size-10 place-items-center rounded-xl bg-[#e8f2ff] text-[11px] font-semibold text-[#005bd1] shadow-sm">QR</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">生成二维码</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">输入文本或当前页面地址</span>
              </span>
              <span className="text-2xl leading-none text-[#005bd1]">›</span>
            </button>

            {!isOptions && (
              <button
                ref={loginStateTriggerRef}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50 active:bg-[#f4f8ff]"
                type="button"
                onClick={() => setIsLoginStateOpen(true)}>
                <span className="grid size-10 place-items-center rounded-xl bg-[#e8f2ff] text-[11px] font-semibold text-[#005bd1] shadow-sm">JSON</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950">登录态导出</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">导出 cookies 和本地存储</span>
                </span>
                <span className="text-2xl leading-none text-[#005bd1]">›</span>
              </button>
            )}

            {!isOptions && <CookieEditor />}
          </div>
        </div>

        <div className={cn(isOptions ? "px-4 pb-4 pt-0" : "px-3.5 pb-3 pt-0") }>
          <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">当前状态</p>
            <p className="mt-2 text-sm leading-5 text-slate-600">已加载浏览器设置，选择一个身份后会自动同步到扩展存储。</p>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>

      </section>

      <Dialog
        open={isUserAgentOpen}
        titleId="user-agent-title"
        onClose={closeUserAgentDialog}
        initialFocusRef={firstRadioRef}
        className="absolute z-10 bg-slate-950/48"
        panelClassName="max-w-[335px] rounded-[14px] shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
        actions={(
          <div className="flex gap-3 border-t border-slate-200 p-4 pt-0">
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
        )}>
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
      </Dialog>

      <Dialog
        open={isLoginStateOpen}
        titleId="login-state-title"
        onClose={closeLoginStateDialog}
        className="absolute z-10 bg-slate-950/48"
        panelClassName="max-h-[92vh] max-w-[335px] overflow-y-auto rounded-[14px] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#005bd1]">storage state</span>
            <h2 id="login-state-title" className="mt-1 text-base font-semibold leading-5 text-slate-950">登录态导出</h2>
          </span>
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            type="button"
            aria-label="关闭登录态导出"
            onClick={closeLoginStateDialog}>
            ×
          </button>
        </div>
        <LoginStateExport onClose={closeLoginStateDialog} renderActions={(actions) => <DialogActions>{actions}</DialogActions>} />
      </Dialog>

      <Dialog
        open={isQrOpen}
        titleId="qr-title"
        onClose={closeQrDialog}
        className="absolute z-10 bg-slate-950/48"
        panelClassName="max-w-[335px] rounded-[14px] shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-3 p-4 pb-0">
          <span className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#005bd1]">qr code</span>
            <h2 id="qr-title" className="mt-1 text-base font-semibold leading-5 text-slate-950">生成二维码</h2>
          </span>
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            type="button"
            aria-label="关闭生成二维码"
            onClick={closeQrDialog}>
            ×
          </button>
        </div>
        <QrPanel initialText={qrInitialText} />
      </Dialog>

      <IntroDialog open={shouldShowIntro} onClose={dismissIntro} />
    </div>
  )
}
export default Home
