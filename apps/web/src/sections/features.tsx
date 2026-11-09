import { FEATURES, MARQUEE_WORDS } from "@/lib/site"
import { Reveal } from "@/components/reveal"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Marquee } from "@/components/reactbits/marquee"
import type { LucideIcon } from "lucide-preact"
import { MonitorPlay, Radar, Video, Languages } from "lucide-preact"

const icons: LucideIcon[] = [MonitorPlay, Radar, Video, Languages]

export function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">核心能力</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            一次安装，常用浏览工具随手可用
          </h2>
          <p className="mt-4 text-muted-foreground">
            视频嗅探、网络监视、操作录制与翻译，集中在一个扩展中。
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
