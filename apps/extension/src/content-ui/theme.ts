export const theme = {
  colors: {
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#101828",
    muted: "#64748b",
    subtle: "#94a3b8",
    border: "#e2e8f0",
    primary: "#0077ff",
    primaryHover: "#005bd1",
    primarySoft: "#eff6ff",
    danger: "#b91c1c",
    dangerSoft: "#fef2f2",
    success: "#047857",
    successSoft: "#ecfdf5",
    warning: "#92400e",
    warningSoft: "#fffbeb"
  },
  font: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
  fontSize: { small: 12, normal: 14, title: 16 },
  space: { xs: 4, small: 8, normal: 12, large: 16 },
  radius: { small: 6, normal: 8, panel: 14 },
  shadow: "0 14px 34px rgba(16,24,40,0.18)",
  layer: 2147483647
} as const

export type Style = Partial<Record<keyof CSSStyleDeclaration, string | number>>

const unitless = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "flexShrink", "order"])

export function css(styles: Style): string {
  return Object.entries(styles)
    .map(([key, value]) => {
      const property = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      const unit = typeof value === "number" && value !== 0 && !unitless.has(key) ? "px" : ""
      return `${property}:${value}${unit}`
    })
    .join(";")
}
