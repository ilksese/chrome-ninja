import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "@chrome-ninja/utils"

function NavigationBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const items = [
    { label: "首页", value: "/home", icon: "H" },
    { label: "设置", value: "/settings", icon: "S" }
  ]

  return (
    <nav className="grid grid-cols-2 border-t border-slate-200 bg-slate-50">
      {items.map((item) => {
        const active = pathname === item.value
        return (
          <button
            key={item.value}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-slate-500",
              active && "text-slate-950"
            )}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(item.value)}>
            <span className="grid size-5 place-items-center rounded bg-current text-[11px] font-semibold text-white">{item.icon}</span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export default NavigationBar
