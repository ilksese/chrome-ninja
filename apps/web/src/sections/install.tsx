import { INSTALL_STEPS } from "@/lib/site"
import { Reveal } from "@/components/reveal"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ArrowRight } from "lucide-preact"

export function Install() {
  return (
    <section id="install" className="relative py-24">
      <div className="mx-auto max-w-4xl px-6">
        <Reveal className="text-center">
          <Badge className="mb-4" variant="accent">快速开始</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            三步，解锁忍者能力
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            从仓库到浏览器只需几分钟，chrome ninja 采用 headless 构建，本地加载即用。
          </p>
        </Reveal>

        <div className="mt-14 space-y-6">
          {INSTALL_STEPS.map((step, i) => (
            <Reveal key={step.step} delay={i * 100}>
              <div className="relative flex gap-5 rounded-2xl border border-border bg-card/80 p-6 backdrop-blur transition-colors hover:border-primary/40">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 font-mono text-lg font-bold text-white">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h3 className="mb-1 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
                <div className="hidden shrink-0 self-center pr-4 font-mono text-sm text-muted-foreground md:block">
                  {["pnpm build", "chrome://extensions", "bilibili.cn / baidu.com"][i]}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 text-center">
          <a
            href="https://github.com/ilksese/chrome-ninja"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            前往仓库安装 <ArrowRight className="size-4" />
          </a>
        </Reveal>
      </div>
    </section>
  )
}
