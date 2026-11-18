/** 共享布局的面板身份，同一面板在所有站点与标签页共用布局。 */
export type PanelKey = "netmon" | "cookie-editor" | "recorder"

/** 面板相对视口的位置与尺寸，单位为 CSS 像素。 */
export type PanelLayout = {
  left: number
  top: number
  width: number
  height: number
}

export const PANEL_MARGIN = 8
export const PANEL_MIN_SIZE = {
  netmon: { width: 260, height: 200 },
  "cookie-editor": { width: 320, height: 260 },
  recorder: { width: 240, height: 160 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function localArea() {
  if (typeof chrome === "undefined") return undefined
  return chrome.storage?.local
}

function isPanelLayout(value: unknown): value is PanelLayout {
  const entry = value as Partial<PanelLayout> | null | undefined
  if (!entry) return false
  return (["left", "top", "width", "height"] as const).every(
    (field) => typeof entry[field] === "number" && Number.isFinite(entry[field])
  )
}

/** 按面板最小尺寸和当前视口夹取布局；小视口优先保证面板留在可见范围。 */
export function fitPanelLayout(layout: PanelLayout, key: PanelKey): PanelLayout {
  const maxWidth = Math.max(1, window.innerWidth - PANEL_MARGIN * 2)
  const maxHeight = Math.max(1, window.innerHeight - PANEL_MARGIN * 2)
  const minimum = PANEL_MIN_SIZE[key]
  const width = clamp(Math.round(layout.width), Math.min(minimum.width, maxWidth), maxWidth)
  const height = clamp(Math.round(layout.height), Math.min(minimum.height, maxHeight), maxHeight)
  return {
    width,
    height,
    left: clamp(
      Math.round(layout.left),
      PANEL_MARGIN,
      Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)
    ),
    top: clamp(Math.round(layout.top), PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN))
  }
}

/** 读取指定面板的独立布局；存储不可用或内容无效时使用面板默认布局。 */
export async function loadPanelLayout(key: PanelKey): Promise<PanelLayout | null> {
  const area = localArea()
  if (!area) return null
  try {
    const storageKey = `contentUiPanelLayouts.${key}`
    const stored = await area.get(storageKey)
    const entry: unknown = stored?.[storageKey]
    return isPanelLayout(entry) ? fitPanelLayout(entry, key) : null
  } catch {
    return null
  }
}

/** 独立写入指定面板，避免不同面板并发保存时互相覆盖。 */
export async function savePanelLayout(key: PanelKey, layout: PanelLayout): Promise<void> {
  const area = localArea()
  if (!area) return
  try {
    await area.set({ [`contentUiPanelLayouts.${key}`]: layout })
  } catch {
    // 布局保存失败不阻断面板操作，下次拖动或缩放仍可重试。
  }
}

function readPanelLayout(element: HTMLElement): PanelLayout {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

/** 仅在原生缩放改变尺寸后保存；标题栏拖动由 bindPanelDrag 保存。 */
export function trackPanelLayout(element: HTMLElement, key: PanelKey): () => void {
  let before: { layout: PanelLayout; width: string; height: string } | undefined
  const down = (event: MouseEvent) => {
    before = undefined
    if (event.button !== 0 || event.target !== element) return
    before = { layout: readPanelLayout(element), width: element.style.width, height: element.style.height }
  }
  const up = () => {
    const start = before
    before = undefined
    if (!start || !element.isConnected) return
    // Chrome 原生 resize 修改根节点的内联尺寸；内容自然增高不会修改它们。
    if (element.style.width === start.width && element.style.height === start.height) return
    const next = readPanelLayout(element)
    if (!next.width || !next.height) return
    if (next.width === start.layout.width && next.height === start.layout.height) return
    void savePanelLayout(key, fitPanelLayout(next, key))
  }
  element.addEventListener("mousedown", down)
  window.addEventListener("mouseup", up)
  return () => {
    before = undefined
    element.removeEventListener("mousedown", down)
    window.removeEventListener("mouseup", up)
  }
}

/** 为标题栏绑定拖动，在位置实际变化后保存，并在销毁时释放监听器。 */
export function bindPanelDrag(element: HTMLElement, header: HTMLElement, key: PanelKey): () => void {
  let drag: { x: number; y: number; layout: PanelLayout; moved: boolean } | undefined
  const move = (event: MouseEvent) => {
    if (!drag) return
    const layout = fitPanelLayout(
      {
        ...readPanelLayout(element),
        left: drag.layout.left + event.clientX - drag.x,
        top: drag.layout.top + event.clientY - drag.y
      },
      key
    )
    drag.moved ||= event.clientX !== drag.x || event.clientY !== drag.y
    element.style.left = `${layout.left}px`
    element.style.top = `${layout.top}px`
    element.style.right = "auto"
  }
  const cancel = () => {
    drag = undefined
    window.removeEventListener("mousemove", move)
    window.removeEventListener("mouseup", up)
  }
  const up = () => {
    if (drag?.moved && element.isConnected) {
      const next = readPanelLayout(element)
      if (next.width && next.height && (next.left !== drag.layout.left || next.top !== drag.layout.top)) {
        void savePanelLayout(key, fitPanelLayout(next, key))
      }
    }
    cancel()
  }
  const down = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return
    cancel()
    drag = { x: event.clientX, y: event.clientY, layout: readPanelLayout(element), moved: false }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    event.preventDefault()
  }
  header.addEventListener("mousedown", down)
  return () => {
    header.removeEventListener("mousedown", down)
    cancel()
  }
}
