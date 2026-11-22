export function pageControlTargetError(url: string | undefined): string | undefined {
  if (!url) return "没有可控制的活动标签页"
  try {
    if (new URL(url).protocol.startsWith("chrome")) return "受限页面不能滚动"
  } catch {
    return "没有可控制的活动标签页"
  }
  return undefined
}
