import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { cn } from "@/lib/utils"

interface RevealProps {
  children: ComponentChildren
  className?: string
  delay?: number
  direction?: "up" | "left" | "right"
}

export function Reveal({ children, className, delay = 0, direction = "up" }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        },
        { threshold: 0.12 }
      )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const transform = {
    up: "translate-y-8",
    left: "translate-x-8",
    right: "-translate-x-8"
  }[direction]

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${transform}`,
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}
