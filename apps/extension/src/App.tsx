import NavigationBar from "@components/NavigationBar"
import { cn } from "@chrome-ninja/utils"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import Home from "./pages/Home"
import Settings from "./pages/Settings"

type AppProps = {
  layout: "popup" | "options"
}

function App({ layout }: AppProps) {
  const location = useLocation()
  const isOptions = layout === "options"

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden", isOptions ? "grid grid-cols-[176px_minmax(0,1fr)] max-[760px]:flex max-[760px]:flex-col" : "flex flex-col")}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[linear-gradient(135deg,rgba(15,23,42,0.10),rgba(0,119,255,0.16)_46%,rgba(255,128,68,0.10))]" />
      {isOptions && (
        <aside className="relative z-10 border-r border-slate-200/80 bg-white/72 p-4 max-[760px]:border-b max-[760px]:border-r-0">
          <NavigationBar layout={layout} />
        </aside>
      )}
      <div className={cn("relative min-h-0 flex-1 overflow-y-auto", isOptions ? "px-8 py-7 max-[760px]:px-4 max-[760px]:py-4" : "p-4")}>
        <main className={cn(isOptions && "mx-auto w-full max-w-5xl")}>
          <div key={location.pathname} className="ninja-page-enter">
            <Routes>
              <Route path="/" element={<Navigate replace to={isOptions ? "/settings" : "/home"} />} />
              <Route path="/home" element={<Home layout={layout} />} />
              <Route path="/settings" element={<Settings layout={layout} />} />
            </Routes>
          </div>
        </main>
      </div>
      {!isOptions && (
        <div className="relative shrink-0">
          <NavigationBar layout={layout} />
        </div>
      )}
    </div>
  )
}

export default App
