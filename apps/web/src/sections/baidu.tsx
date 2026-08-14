import { Reveal } from "@/components/reveal"
import { ASSETS } from "@/lib/assets"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Search, Layers, TextCursorInput } from "lucide-preact"

const ITEMS = [
  {
    icon: Search,
    title: "清爽搜索",
    text: "注入移除干扰内容的样式，让搜索结果一目了然，回归搜索的本质。",
    tag: "core"
  }
]

export function BaiduShowcase() {
  return (
    <section id="baidu" className="relative py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-0 top-1/2 size-[400px] -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
        <Reveal direction="left" className="order-2 hidden lg:block">
          <div className="rounded-2xl border border-border bg-card/90 p-5 shadow-2xl">
            {/* mock search bar */}
            <div className="flex items-center gap-2 rounded-lg border border-input bg-secondary/50 px-3 py-2.5">
              <Search className="size-4 text-muted-foreground" />
              <div className="flex-1 text-sm text-muted-foreground">
                <span className="text-foreground">浏览器忍者</span> 是什么？
              </div>
              <Badge variant="secondary">百度一下</Badge>
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-cyan-300">什么是浏览器忍者扩展？</span>
                  <span className="text-muted-foreground">~1 条</span>
                </div>
                <div className="mt-1 h-2 w-2/3 rounded bg-muted/60" />
                <div className="mt-1 h-2 w-1/2 rounded bg-muted/40" />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="size-4 text-cyan-400" />
                清爽搜索已接管，广告与干扰内容已隐藏
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <img src={ASSETS.baidu} alt="百度" className="size-5" />
            <span className="font-medium">百度</span>
            <Badge className="ml-1" variant="secondary">搜索</Badge>
          </div>
          <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            搜索，本该清爽如初
          </h2>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            页面加载后自动注入样式，移除与检索无关的干扰，让每一次搜索都直接聚焦内容本身。
          </p>

          <div className="mt-8 space-y-4">
            {ITEMS.map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan-500/15 text-cyan-300">
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

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent bg-accent/40 p-4">
            <TextCursorInput className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
            <p className="text-sm text-muted-foreground">
              由 content-script 匹配 baidu.com 域名，通过注入 CSS 与 polyfill 实现，全程无感、可随时开关。
            </p>
          </div>

          <a
            href="#install"
            className={buttonVariants({ size: "lg", variant: "outline", className: "mt-8" })}
          >
            开启清爽搜索
          </a>
        </Reveal>
      </div>
    </section>
  )
}