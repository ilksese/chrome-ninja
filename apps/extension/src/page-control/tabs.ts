export type PageControlTab = {
  title: string
  tabId: number
  url: string
  active: boolean
}

export function toPageControlTabs(
  tabs: ReadonlyArray<{ id?: number; title?: string; url?: string; active?: boolean; index: number }>
): PageControlTab[] {
  return tabs
    .flatMap((tab) =>
      typeof tab.id === "number"
        ? [{ title: tab.title ?? "", tabId: tab.id, url: tab.url ?? "", active: tab.active === true, index: tab.index }]
        : []
    )
    .sort((left, right) => left.index - right.index)
    .map(({ title, tabId, url, active }) => ({ title, tabId, url, active }))
}
