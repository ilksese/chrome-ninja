import type { ComponentChildren } from "preact"
import { cn } from "@/lib/utils"

type AuroraProps = {
  className?: string
  children?: ComponentChildren
  colors?: string[]
}

/**
 * Aurora — reactbits-inspired animated gradient aurora background.
 * Renders layered radial gradients in a blurred, absolutely-positioned layer.
 */
export function Aurora({ className, children, colors }: AuroraProps) {
  const [c1, c2, c3] = colors ?? ["hsl(346 100% 60% / 0.35)", "hsl(217 91% 60% / 0.3)", "hsl(271 91% 65% / 0.3)"]
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 inset-0 overflow-hidden blur-[90px] animate-aurora"
        style={{
          backgroundImage: `radial-gradient(40% 45% at 15% 20%, ${c1}, transparent 70%),
            radial-gradient(45% 50% at 85% 30%, ${c2}, transparent 70%),
            radial-gradient(45% 45% at 50% 90%, ${c3}, transparent 70%)`,
          backgroundSize: "220% 220%, 200% 220%, 220% 200%"
        }}
      />
      {children}
    </div>
  )
}