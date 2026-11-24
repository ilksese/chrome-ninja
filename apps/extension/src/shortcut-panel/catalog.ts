/** 快捷面板可搜索的扩展动作。页面控制不在其中。 */

export { HOME_FEATURE_ORDER_KEY } from "@/home-feature-order"

export const SHORTCUT_ACTIONS = [
  { id: "user-agent", title: "切换浏览器身份", detail: "", kind: "popup" },
  { id: "boss", title: "BOSS 反检测", detail: "", kind: "toggle" },
  { id: "recorder", title: "步骤录制", detail: "", kind: "toggle" },
  { id: "video-sniffer", title: "视频嗅探", detail: "捕获当前页面的视频地址并复制或下载", kind: "popup" },
  { id: "qr", title: "生成二维码", detail: "输入文本或当前页面地址", kind: "popup" },
  { id: "network-monitor", title: "网络监视器", detail: "", kind: "toggle" },
  { id: "browser-presets", title: "浏览器预设", detail: "模拟设备的 UA、视口和输入方式", kind: "popup" },
  { id: "translate", title: "AI 划词翻译", detail: "", kind: "popup" },
  { id: "login-state", title: "登录态导出", detail: "导出 cookies 和本地存储", kind: "popup" },
  { id: "cookie-editor", title: "Cookie 编辑器", detail: "在网页中查询、编辑与持续禁用 Cookie", kind: "open" }
] as const

export type ShortcutActionId = (typeof SHORTCUT_ACTIONS)[number]["id"]
export type ShortcutActionKind = (typeof SHORTCUT_ACTIONS)[number]["kind"]

export type ShortcutAction = {
  id: ShortcutActionId
  title: string
  detail: string
  kind: ShortcutActionKind
}

const actionsById = new Map<string, ShortcutAction>(SHORTCUT_ACTIONS.map((action) => [action.id, action]))

export function isShortcutActionId(value: string): value is ShortcutActionId {
  return actionsById.has(value)
}

/** 按首页保存的顺序排列；读不到顺序时用首页默认顺序。页面控制和其他未知 id 被丢掉。 */
export function orderShortcutActions(savedOrder: unknown): ShortcutAction[] {
  const saved = Array.isArray(savedOrder) ? savedOrder.filter((id): id is string => typeof id === "string") : []
  const ids = [...new Set([...saved, ...SHORTCUT_ACTIONS.map((action) => action.id)])]
  return ids.flatMap((id) => {
    const action = actionsById.get(id)
    return action ? [action] : []
  })
}

/** 状态补上或过滤后，原选中项还在就保持；否则选当前第一项。 */
export function nextSelectedId(visibleIds: readonly string[], selectedId: string | undefined): string | undefined {
  if (visibleIds.length === 0) return undefined
  if (selectedId && visibleIds.includes(selectedId)) return selectedId
  return visibleIds[0]
}

export function bossStatus(enabled: boolean) {
  return enabled ? "已启用" : "默认关闭"
}

export function recorderStatus(enabled: boolean) {
  return enabled ? "页面面板已开启" : "默认关闭"
}

export function netmonStatus(enabled: boolean, ruleCount: number) {
  if (!enabled) return "当前标签页关闭"
  return ruleCount > 0 ? `已开启 · ${ruleCount} 条规则` : "已开启 · 待添加规则"
}

export function userAgentStatus(label: string, simulating: boolean) {
  return simulating ? "当前标签页由浏览器预设接管" : `当前为 ${label}`
}

export function translateStatus(translate: { enabled: boolean; apiKey: string }) {
  if (translate.enabled) return "已启用"
  return translate.apiKey ? "已配置接口，未开启" : "未配置接口"
}

export function browserPresetStatus(name?: string) {
  return name ? `正在模拟「${name}」` : "当前没有模拟"
}

export const POPUP_INTENT_ACTIONS = ["user-agent", "video-sniffer", "qr", "browser-presets", "translate", "login-state"] as const

export type PopupIntentAction = (typeof POPUP_INTENT_ACTIONS)[number]

export function isPopupIntentAction(id: ShortcutActionId): id is PopupIntentAction {
  return (POPUP_INTENT_ACTIONS as readonly string[]).includes(id)
}
