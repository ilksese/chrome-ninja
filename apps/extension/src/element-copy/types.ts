export const ELEMENT_COPY_FORMATS = [
  { format: "outerHTML", title: "外部 HTML（outerHTML）" },
  { format: "innerText", title: "可见文本（innerText）" },
  { format: "selfhost", title: "自身 HTML（不含子树）" },
  { format: "xpath", title: "XPath" }
] as const

export type ElementCopyFormat = (typeof ELEMENT_COPY_FORMATS)[number]["format"]

export function isElementCopyFormat(value: unknown): value is ElementCopyFormat {
  return ELEMENT_COPY_FORMATS.some(({ format }) => format === value)
}
