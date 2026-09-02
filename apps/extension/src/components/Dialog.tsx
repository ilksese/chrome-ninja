import type { ComponentChildren, RefObject } from "preact"
import { createPortal } from "preact/compat"
import { useEffect, useRef } from "preact/hooks"
import { cn } from "@chrome-ninja/utils"

type DialogProps = {
  open: boolean
  titleId: string
  onClose: () => void
  children: ComponentChildren
  actions?: ComponentChildren
  className?: string
  panelClassName?: string
  initialFocusRef?: RefObject<HTMLElement>
}

function Dialog({ open, titleId, onClose, children, actions, className, panelClassName, initialFocusRef }: DialogProps) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    requestAnimationFrame(() => initialFocusRef?.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [initialFocusRef, open])

  if (!open) return null

  return createPortal(
    <div className={cn("fixed inset-0 z-[9999] grid place-items-center bg-slate-950/50 p-4", className)} role="presentation" onClick={onClose}>
      <section
        className={cn("flex max-h-[95vh] w-full max-w-[420px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.35)]", panelClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}>
        {children}
        {actions && <div className="mt-6">{actions}</div>}
      </section>
    </div>,
    document.body
  )
}

export default Dialog
