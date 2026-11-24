export type PageControlTabNode = {
  parentId?: number
  childIds: number[]
}

export type PageControlTabTree = Map<number, PageControlTabNode>

export function linkOpenedTab(tree: PageControlTabTree, parentId: number, childId: number) {
  const parent = tree.get(parentId) ?? { childIds: [] }
  if (!parent.childIds.includes(childId)) parent.childIds.push(childId)
  tree.set(parentId, parent)
  const child = tree.get(childId) ?? { childIds: [] }
  child.parentId = parentId
  tree.set(childId, child)
}

export function clearRootedTab(tree: PageControlTabTree, rootId: number) {
  const node = tree.get(rootId)
  if (!node) return
  if (node.parentId !== undefined) {
    const parent = tree.get(node.parentId)
    if (parent) parent.childIds = parent.childIds.filter((id) => id !== rootId)
  }
  const pending = [rootId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) continue
    const current = tree.get(id)
    tree.delete(id)
    if (current) pending.push(...current.childIds)
  }
}
