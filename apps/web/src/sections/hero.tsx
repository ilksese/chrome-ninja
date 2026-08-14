import { SITE } from "@/lib/site"
import { ASSETS } from "@/lib/assets"
import { Aurora } from "@/components/reactbits/aurora"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-preact"

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-24 pb-16">
      <Aurora className="absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2">
            <Badge variant="accent" className="rounded-full px-3 py-1">
              <Sparkles className="size-3" />
              Chrome MV3 扩展
            </Badge>
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 bg-clip-text text-transparent">
              {SITE.tagline}
            </span>
            <br />
            让浏览体验更清爽
          </h1>

          <p className="max-w-lg text-lg text-muted-foreground text-balance">{SITE.description}</p>

          <div className="flex flex-wrap gap-3">
            <a href="#install" className={buttonVariants({ size: "lg" })}>
              开始使用 <ArrowRight className="size-4" />
            </a>
            <a href="#features" className={buttonVariants({ size: "lg", variant: "outline" })}>
              了解能力
            </a>
          </div>
        </div>

        {/* Floating demo cards */}
        <div className="relative hidden h-[420px] items-center justify-center md:flex">
          <div className="animate-float absolute rotate-[-6deg] rounded-2xl border border-border bg-card/90 p-5 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <img src={ASSETS.bilibili} alt="" className="size-6" />
              <span className="text-sm font-semibold">Bilibili</span>
            </div>
            <div className="space-y-2">
              {["全站最高画质已就绪", "直播画质已提升", "广告已屏蔽"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-xs">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="animate-float absolute right-0 rotate-[8deg] rounded-2xl border border-border bg-card/90 p-5 shadow-2xl backdrop-blur [animation-delay:1.5s]">
            <div className="mb-3 flex items-center gap-2">
              <img src={ASSETS.baidu} alt="" className="size-6" />
              <span className="text-sm font-semibold">百度</span>
            </div>
            <div className="space-y-2">
              {["清爽搜索已生效", "干扰内容已移除"].map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-xs">
                  <span className="size-1.5 rounded-full bg-cyan-400" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}