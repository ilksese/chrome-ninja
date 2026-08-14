import { Fragment } from "preact"
import type { ComponentChild } from "preact"
import { cn } from "@/lib/utils"

interface MarqueeProps {
  className?: string
  children: ComponentChild[]
  speed?: string
  reverse?: boolean
}

export function Marquee({ className, children, speed = "30s", reverse }: MarqueeProps) {
  return (
    <div className={cn("group relative flex w-full overflow-hidden", className)}>
      <div
        className="flex w-max shrink-0 animate-marquee gap-8 pr-8"
        style={{
          animationDuration: speed,
          animationDirection: reverse ? "reverse" : "normal"
        }}
      >
        <Fragment>{children}</Fragment>
        <Fragment>{children}</Fragment>
      </div>
    </div>
  )
}