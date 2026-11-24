import fuzzysort from "fuzzysort"
import type { ShortcutAction } from "./catalog"

export type RankedShortcutAction<T extends ShortcutAction = ShortcutAction> = T & {
  titleIndexes: readonly number[]
}

/** 空白查询保持原顺序且不高亮。有查询时只匹配标题，按匹配度排序。 */
export function filterShortcutActions<T extends ShortcutAction>(actions: readonly T[], query: string): RankedShortcutAction<T>[] {
  const needle = query.trim()
  if (!needle) return actions.map((action) => ({ ...action, titleIndexes: [] }))
  const targets = actions.map((action, index) => ({ action, index, title: action.title }))
  // 默认 0.5 会丢掉 ck→Cookie 这类跳字匹配（约 0.35）。
  const matches = fuzzysort.go(needle, targets, { key: "title", limit: 0, threshold: 0 })
  return [...matches]
    .sort((left, right) => right.score - left.score || left.obj.index - right.obj.index)
    .map((match) => ({ ...match.obj.action, titleIndexes: [...match.indexes] }))
}
