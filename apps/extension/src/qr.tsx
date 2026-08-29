import { render } from "preact"
import QrPanel from "./qr/panel"
import "normalize.css"
import "./index.css"

document.documentElement.dataset.layout = "qr"

const initialUrl = new URLSearchParams(window.location.search).get("url") ?? ""

render(
  <div className="grid min-h-screen place-items-center p-6">
    <div className="w-full max-w-[400px] overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(16,24,40,0.12)]">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#005bd1]">qr code</span>
        <h1 className="text-base font-semibold leading-5 text-slate-950">生成二维码</h1>
      </div>
      <QrPanel initialText={initialUrl} />
    </div>
  </div>,
  document.getElementById("root")!
)
