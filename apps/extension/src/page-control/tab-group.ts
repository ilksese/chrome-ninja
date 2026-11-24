export function singlePageControlGroup(remembered: number | undefined, titledIds: readonly number[]) {
  const keep = remembered ?? titledIds[0]
  return { keep, merge: titledIds.filter((id) => id !== keep) }
}
