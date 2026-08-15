import { useEffect, useState } from "preact/hooks"
import { cn } from "@/lib/utils"
import { SITE } from "@/lib/site"
import { ASSETS } from "@/lib/assets"
import { buttonVariants } from "@/components/ui/button"

const LINKS = [
  { href: "#features", label: "能力" },
  { href: "#bilibili", label: "Bilibili" },
  { href: "#baidu", label: "百度" },
  { href: "#install", label: "安装" }
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold">
          <img src={ASSETS.logo} alt="chrome ninja logo" className="size-8 animate-float" />
          <span>{SITE.displayName}</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a href="#install" className={buttonVariants({ size: "sm", variant: "outline", className: "hidden sm:inline-flex" })}>
            快速开始
          </a>
          <a
            href="https://github.com/ilksese/chrome-ninja"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            查看源码
          </a>
        </div>
      </nav>
    </header>
  )
}
