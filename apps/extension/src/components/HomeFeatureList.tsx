import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import Sortable from "sortablejs"
import { HOME_FEATURE_ORDER_KEY } from "@/home-feature-order"

const ORDER_KEY = HOME_FEATURE_ORDER_KEY

type HomeFeature = {
  id: string
  label: string
  content: ComponentChildren
  hidden?: boolean
}

/** 首页功能列表；弹窗和选项页共用一份排序。 */
export default function HomeFeatureList({ items }: { items: HomeFeature[] }) {
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null)
  const [error, setError] = useState("")
  const listRef = useRef<HTMLUListElement>(null)
  const saving = useRef(false)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const orderedIds = [...new Set([...(savedOrder ?? []), ...itemsById.keys()])].filter((id) => itemsById.has(id))
  const visibleIds = orderedIds.filter((id) => !itemsById.get(id)?.hidden)
  const ready = savedOrder !== null

  useEffect(() => {
    void chrome.storage.local.get(ORDER_KEY).then(
      (result) => setSavedOrder(Array.isArray(result[ORDER_KEY]) ? result[ORDER_KEY] : []),
      () => {
        setSavedOrder([])
        setError("无法读取首页顺序")
      }
    )
  }, [])

  const saveOrder = async (ids: string[]) => {
    if (!ready || saving.current) return
    saving.current = true
    setError("")
    const reordered = ids.values()
    // 选项页隐藏部分入口，重排只替换可见槽位，保留弹窗独有入口的位置。
    const nextOrder = orderedIds.map((id) => (itemsById.get(id)?.hidden ? id : (reordered.next().value ?? id)))
    try {
      await chrome.storage.local.set({ [ORDER_KEY]: nextOrder })
      setSavedOrder(nextOrder)
    } catch {
      setError("无法保存首页顺序")
    } finally {
      saving.current = false
    }
  }
  const saveOrderRef = useRef(saveOrder)
  saveOrderRef.current = saveOrder

  useEffect(() => {
    const list = listRef.current
    if (!ready || !list) return
    let originalOrder: string[] = []
    const sortable = Sortable.create(list, {
      handle: "[data-home-handle]",
      animation: 120,
      direction: "vertical",
      ghostClass: "opacity-40",
      onStart: () => {
        originalOrder = sortable.toArray()
      },
      onMove: () => !saving.current,
      onEnd: ({ oldIndex, newIndex }) => {
        if (oldIndex === newIndex) return
        const ids = sortable.toArray()
        // SortableJS 直接挪动 DOM；先还原，再由 Preact 按保存后的顺序渲染。
        sortable.sort(originalOrder)
        void saveOrderRef.current(ids)
      }
    })
    return () => sortable.destroy()
  }, [ready])

  const moveItem = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const nextIndex = index + (event.key === "ArrowUp" ? -1 : 1)
    if (nextIndex < 0 || nextIndex >= visibleIds.length) return
    const ids = [...visibleIds]
    const [id] = ids.splice(index, 1)
    ids.splice(nextIndex, 0, id)
    const handle = event.currentTarget as HTMLButtonElement
    void saveOrder(ids).then(() => {
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) handle.focus()
      })
    })
  }

  return (
    <>
      <ul ref={listRef} aria-label="首页功能" className="divide-y divide-slate-200 bg-white">
        {visibleIds.map((id, index) => {
          const item = itemsById.get(id)
          if (!item) return null
          return (
            <li key={id} data-id={id} className="relative grid grid-cols-[36px_minmax(0,1fr)] bg-white">
              <button
                type="button"
                data-home-handle
                disabled={!ready}
                className="grid min-h-10 cursor-grab touch-none place-items-center text-slate-500 outline-offset-[-2px] hover:bg-slate-100 hover:text-slate-800 active:cursor-grabbing disabled:opacity-40"
                aria-label={`排序 ${item.label}`}
                aria-keyshortcuts="ArrowUp ArrowDown"
                title="拖动排序，或按上、下方向键"
                onKeyDown={(event) => moveItem(event, index)}>
                <span
                  aria-hidden="true"
                  className="h-4 w-3 bg-[radial-gradient(circle,currentColor_1px,transparent_1.5px)] bg-[length:6px_5px]"
                />
              </button>
              <div className="min-w-0">{item.content}</div>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </>
  )
}
