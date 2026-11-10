import { Surface, Text } from "./components"
import { createScope, mountContentUI } from "./lifecycle"
import { theme } from "./theme"

let current: ReturnType<typeof mountContentUI> | undefined

export function showToast(text: string) {
  current?.dispose()
  const scope = createScope()
  const element = Surface(
    {
      role: "status",
      style: {
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        maxWidth: "calc(100vw - 32px)",
        padding: "10px 16px",
        boxShadow: theme.shadow,
        overflowWrap: "anywhere"
      }
    },
    Text({}, text)
  )
  const view = mountContentUI("chrome-ninja-copy-toast", "data-copy-toast", { element, dispose: scope.dispose })
  current = view
  const onPageHide = () => {
    view.dispose()
    if (current === view) current = undefined
  }
  window.addEventListener("pagehide", onPageHide)
  scope.add(() => window.removeEventListener("pagehide", onPageHide))
  scope.timeout(onPageHide, 3000)
}
