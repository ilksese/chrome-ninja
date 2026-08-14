import { Reveal } from "@/components/reveal"
import { ASSETS } from "@/lib/assets"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Gauge, Video, ShieldCheck, Bell } from "lucide-preact"

const ITEMS = [
  {
    icon: Gauge,
    title: "自动最高画质",
    text: "注入逻辑并轮询 player，自动调用 requestQuality 切换到最高可接受画质，无需手动点选。",
    tag: "video"
  },
  {
    icon: Video,
    title: "直播画质提升",
    text: "识别直播流后通过 livePlayer.switchQuality 自动切至首选画质（qn），看直播不再等待。",
    tag: "live"
  },
  {
    icon: ShieldCheck,
    title: "去广告",
    text: "可选的广告屏蔽 CSS 注入，让页面更干净，按需开启，主动权在你。",
    tag: "tidy"
  },
  {
    icon: Bell,
    title: "通知开关",
    text: "通知提示独立可控，配合整体开关，精细管理每一项功能。",
    tag: "switch"
  }
]

export function BilibiliShowcase() {
  return (
    <section id="bilibili" className="relative py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute right-0 top-1/3 size-[420px] -translate-y-1/3 rounded-full bg-pink-500/10 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <img src={ASSETS.bilibili} alt="Bilibili" className="size-5" />
            <span className="font-medium">Bilibili</span>
            <Badge className="ml-1">视频 & 直播</Badge>
          </div>
          <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            打开视频的瞬间，画质已拉满
          </h2>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            不愿在设置里翻找清晰度？chrome ninja 在页面加载后自动接管，让最高画质第一时间出现在你眼前。
          </p>

          <div className="mt-8 space-y-4">
            {ITEMS.map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-pink-500/15 text-pink-400">
                  <item.icon className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{item.title}</h3>
                    <span className="text-xs text-muted-foreground">{item.tag}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </div>
              </div>
            ))}
          </div>

          <a
            href="#install"
            className={buttonVariants({ size: "lg", variant: "outline", className: "mt-8" })}
          >
            为 B 站启动忍者
          </a>
        </Reveal>

        {/* terminal-like mock */}
        <Reveal direction="right" className="hidden lg:block">
          <div className="perspective-1200">
            <div className="preserve-3d rounded-2xl border border-border bg-card/90 p-5 shadow-2xl">
              <div className="mb-4 flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-rose-500/80" />
                <span className="size-3 rounded-full bg-amber-400/80" />
                <span className="size-3 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs text-muted-foreground">content-script / bilibili</span>
              </div>
              <pre className="overflow-hidden text-sm leading-relaxed">
                <code className="text-muted-foreground">
                  <span className="text-pink-400">const</span> timer = setInterval(async () =&gt; {"{"}
                </code>
                <div className="pl-4 text-muted-foreground">
                  <span className="text-cyan-400">const</span> maxQuality = <br />
                  &nbsp;&nbsp;window.__playinfo__?.data.accept_quality?.[0]
                </div>
                <div className="pl-4 text-muted-foreground">
                  videoPlayer.requestQuality?(<span className="text-emerald-400">maxQuality</span>)
                </div>
                <code className="text-muted-foreground">{"}"}</code>
              </pre>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}