import { FEATURES, MARQUEE_WORDS, type Feature } from "@/lib/site"
import { ASSETS } from "@/lib/assets"
import { Reveal } from "@/components/reveal"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Marquee } from "@/components/reactbits/marquee"
import type { LucideIcon } from "lucide-preact"
import { MonitorPlay, Search, ShieldCheck, Radar } from "lucide-preact"

const icons: LucideIcon[] = [MonitorPlay, Radar, ShieldCheck, Search]

function TargetTag({ feature }: { feature: Feature }) {
  return feature.target === "bilibili" ? (
    <img src={ASSETS.bilibili} alt="Bilibili" className="size-4" />
  ) : (
    <img src={ASSETS.baidu} alt="百度" className="size-4" />
  )
}

export function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">核心能力</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            一次安装，两个网站的清爽之旅
          </h2>
          <p className="mt-4 text-muted-foreground">
            chrome ninja 专注打磨 Bilibili 与百度的浏览细节，让高频操作自动完成。
          </p>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature, i) => {
            const Icon = icons[i % icons.length]
            return (
              <Reveal key={feature.title} delay={i * 80}>
                <Card className="group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10">
                  <div className="mb-4 flex items-center justify-between">
                    <div className={`grid size-12 place-items-center rounded-xl bg-gradient-to-br ${feature.accent} text-white shadow-lg`}>
                      <Icon className="size-6" />
                    </div>
                    <div className="flex items-center gap-1 opacity-80">
                      <TargetTag feature={feature} />
                    </div>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function FeaturesMarquee() {
  const words = MARQUEE_WORDS
  return (
    <div className="relative border-y border-border bg-secondary/30 py-4">
      <Marquee>
        {words.map((word) => (
          <span key={word} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            {word}
            <span className="size-1 rounded-full bg-primary/60" />
          </span>
        ))}
      </Marquee>
    </div>
  )
}