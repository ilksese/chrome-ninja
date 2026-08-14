import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "@chrome-ninja/utils"
import logoIcon from "@assets/xslogo.png"

function HomeIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.05-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.55-1.05 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.1.34.29.65.55.9.3.28.68.43 1.08.43H21a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  )
}

type NavigationBarProps = {
  layout: "popup" | "options"
}

function NavigationBar({ layout }: NavigationBarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isOptions = layout === "options"
  const items = [
    { label: "首页", value: "/home", icon: <HomeIcon /> },
    { label: "设置", value: "/settings", icon: <SettingsIcon /> }
  ]
  const activeIndex = Math.max(
    items.findIndex((item) => item.value === pathname),
    0
  )

  return (
    <nav className={cn("relative", isOptions ? "flex h-full flex-col gap-2 max-[760px]:grid max-[760px]:grid-cols-2" : "bg-white/72 px-2 pb-2 pt-1 backdrop-blur")}>
      <div className={cn(isOptions ? "contents" : "relative grid grid-cols-2 gap-1.5 overflow-hidden rounded-[14px] bg-slate-100/80 p-1 shadow-[0_-8px_24px_rgba(16,24,40,0.06)]")}>
        {!isOptions && (
          <span
            className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.4375rem)] rounded-[10px] bg-white shadow-[0_10px_22px_rgba(0,91,209,0.20)] transition-transform duration-300 ease-out"
            style={{ transform: activeIndex === 1 ? "translateX(calc(100% + 0.375rem))" : "translateX(0)" }}
          />
        )}
        {isOptions && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm max-[760px]:col-span-2 max-[760px]:mb-1">
            <img className="size-9" src={logoIcon} alt="chrome ninja" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-5 text-slate-950">Chrome Ninja</span>
              <span className="block text-xs text-slate-500">能力中心</span>
            </span>
          </div>
        )}
        {items.map((item) => {
          const active = pathname === item.value
          return (
            <button
              key={item.value}
              className={cn(
                "appearance-none border-0 bg-transparent text-slate-500 transition-all duration-150 hover:text-slate-950 active:scale-[0.98] disabled:opacity-50",
                isOptions ? "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-slate-100" : "relative z-10 flex h-10 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-semibold hover:text-slate-700",
                active && (isOptions ? "bg-[#e8f2ff] text-[#005bd1]" : "text-[#003f9e]")
              )}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(item.value)}>
              <span
                className={cn(
                  "grid place-items-center rounded-lg transition-all",
                  isOptions ? "size-8" : "size-7",
                  active ? "bg-[#005bd1] text-white shadow-[0_6px_14px_rgba(0,91,209,0.24)]" : "bg-transparent text-slate-500"
                )}>
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default NavigationBar
