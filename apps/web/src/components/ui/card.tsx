import type { ComponentChildren } from "preact"
import { cn } from "@/lib/utils"

export function Card({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return <div className={cn("flex flex-col gap-1 p-6", className)} {...props} />
}

export function CardTitle({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return (
    <h3 className={cn("text-lg font-semibold leading-tight", className)} {...props} />
  )
}

export function CardDescription({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export function CardContent({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}

export function CardFooter({ className, ...props }: { className?: string; children?: ComponentChildren }) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
}