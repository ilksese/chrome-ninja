import van from "vanjs-core"
import { css, theme } from "./theme"

export interface View {
  element: HTMLElement
  dispose: () => void
}

export function createScope() {
  let disposed = false
  const cleanups = new Set<() => void>()
  return {
    get disposed() {
      return disposed
    },
    add(cleanup: () => void) {
      if (disposed) cleanup()
      else cleanups.add(cleanup)
      return cleanup
    },
    timeout(callback: () => void, delay: number) {
      if (disposed) return
      const cancel = () => window.clearTimeout(timer)
      const timer = window.setTimeout(() => {
        cleanups.delete(cancel)
        if (!disposed) callback()
      }, delay)
      cleanups.add(cancel)
    },
    dispose() {
      if (disposed) return
      disposed = true
      cleanups.forEach((cleanup) => cleanup())
      cleanups.clear()
    }
  }
}

const mounted = new WeakMap<Element, () => void>()

export function mountContentUI(tag: string, attribute: string, view: View): View {
  const existing = document.querySelector(`${tag}[${attribute}]`)
  if (existing) {
    mounted.get(existing)?.()
    existing.remove()
  }
  const element = van.tags[tag](
    {
      [attribute]: "",
      "data-chrome-ninja-ui": "",
      style: css({
        all: "initial",
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        zIndex: theme.layer,
        colorScheme: "light"
      })
    },
    view.element
  )
  document.documentElement.append(element)
  const dispose = () => {
    view.dispose()
    element.remove()
    mounted.delete(element)
  }
  mounted.set(element, dispose)
  return { element: element as HTMLElement, dispose }
}

export function isContentUIEvent(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof Element && node.hasAttribute("data-chrome-ninja-ui"))
}
