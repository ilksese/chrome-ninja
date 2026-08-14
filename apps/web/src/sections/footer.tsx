import { SITE } from "@/lib/site"
import { ASSETS } from "@/lib/assets"

export function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <img src={ASSETS.logo} alt="chrome ninja logo" className="size-6" />
          <span className="font-semibold">{SITE.displayName}</span>
          <span className="text-muted-foreground">v{SITE.version}</span>
        </div>

        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {SITE.displayName} · 让浏览更清爽
        </p>

        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href="#top" className="transition-colors hover:text-foreground">顶部</a>
          <a href="#features" className="transition-colors hover:text-foreground">能力</a>
          <a href="#install" className="transition-colors hover:text-foreground">安装</a>
        </nav>
      </div>
    </footer>
  )
}