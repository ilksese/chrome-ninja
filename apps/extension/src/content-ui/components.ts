import van, { type ChildDom, type Props, type TagFunc } from "vanjs-core"
import { css, theme, type Style } from "./theme"

export type UIProps = { style?: Style | (() => Style); [name: string]: unknown }

const base: Style = {
  boxSizing: "border-box",
  margin: 0,
  fontFamily: theme.font,
  fontSize: theme.fontSize.normal,
  lineHeight: 1.5,
  color: theme.colors.text,
  textAlign: "left"
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, defaults: Style, props: UIProps, children: ChildDom[]) {
  const { style, ...attributes } = props
  const create = van.tags[tag] as TagFunc<HTMLElement>
  return create(
    {
      ...attributes,
      style:
        typeof style === "function"
          ? () => css({ ...base, ...defaults, ...style() })
          : css({ ...base, ...defaults, ...style })
    } as Props,
    ...children
  ) as HTMLElementTagNameMap[K]
}

export const Surface = (props: UIProps = {}, ...children: ChildDom[]) =>
  element(
    "div",
    {
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radius.normal,
      background: theme.colors.background
    },
    props,
    children
  )

export const Row = (props: UIProps = {}, ...children: ChildDom[]) =>
  element(
    "div",
    {
      display: "flex",
      alignItems: "center",
      gap: theme.space.small
    },
    props,
    children
  )

export const Column = (props: UIProps = {}, ...children: ChildDom[]) =>
  element(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      gap: theme.space.small
    },
    props,
    children
  )

export const Text = (props: UIProps = {}, ...children: ChildDom[]) => element("span", {}, props, children)
export const Code = (props: UIProps = {}, ...children: ChildDom[]) =>
  element(
    "pre",
    {
      fontSize: theme.fontSize.small,
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      overflow: "auto"
    },
    props,
    children
  )

export function Button(
  props: UIProps & { variant?: "primary" | "secondary" | "ghost" | "danger" } = {},
  ...children: ChildDom[]
) {
  const { variant = "secondary", style, ...attributes } = props
  const hover = van.state(false)
  const focus = van.state(false)
  const colors = theme.colors
  return element(
    "button",
    {},
    {
      ...attributes,
      type: attributes.type ?? "button",
      onmouseenter: (event: MouseEvent) => {
        hover.val = true
        ;(attributes.onmouseenter as ((event: MouseEvent) => void) | undefined)?.(event)
      },
      onmouseleave: (event: MouseEvent) => {
        hover.val = false
        ;(attributes.onmouseleave as ((event: MouseEvent) => void) | undefined)?.(event)
      },
      onfocus: () => {
        focus.val = true
      },
      onblur: () => {
        focus.val = false
      },
      style: () => {
        const disabled = typeof attributes.disabled === "function" ? attributes.disabled() : attributes.disabled
        return {
          appearance: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.space.xs,
          border: `1px solid ${variant === "ghost" ? "transparent" : colors.border}`,
          borderRadius: theme.radius.normal,
          padding: "6px 12px",
          fontWeight: 600,
          background:
            variant === "primary"
              ? hover.val
                ? colors.primaryHover
                : colors.primary
              : hover.val
                ? colors.surface
                : colors.background,
          color: variant === "primary" ? colors.background : variant === "danger" ? colors.danger : colors.text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          outline: focus.val ? `2px solid ${colors.primary}` : "none",
          outlineOffset: 2,
          ...(typeof style === "function" ? style() : style)
        }
      }
    },
    children
  )
}

export const IconButton = (
  props: UIProps & { variant?: "primary" | "secondary" | "ghost" | "danger" },
  ...children: ChildDom[]
) =>
  Button(
    {
      ...props,
      variant: props.variant ?? "ghost",
      style: () => ({
        width: 26,
        height: 26,
        padding: 0,
        flexShrink: 0,
        ...(typeof props.style === "function" ? props.style() : props.style)
      })
    },
    ...children
  )

export function Input(props: UIProps = {}) {
  const focus = van.state(false)
  const { style, ...attributes } = props
  return element(
    "input",
    {},
    {
      ...attributes,
      type: attributes.type ?? "text",
      onfocus: () => {
        focus.val = true
      },
      onblur: () => {
        focus.val = false
      },
      style: () => ({
        appearance: "none",
        minWidth: 0,
        border: `1px solid ${focus.val ? theme.colors.primary : theme.colors.border}`,
        borderRadius: theme.radius.normal,
        background: theme.colors.background,
        padding: "6px 10px",
        outline: "none",
        ...(typeof style === "function" ? style() : style)
      })
    },
    []
  )
}

export function PanelHeader({
  title,
  label,
  onclose,
  style,
  ...props
}: UIProps & { title: string; label?: string; onclose?: () => void }) {
  return Row(
    {
      ...props,
      style: () => ({
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        ...(typeof style === "function" ? style() : style)
      })
    },
    label
      ? Text(
          { style: { color: theme.colors.primary, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" } },
          label
        )
      : null,
    Row(
      { style: { flex: label ? "0 1 auto" : 1, justifyContent: "space-between" } },
      Text({ role: "heading", "aria-level": 2, style: { fontSize: theme.fontSize.title, fontWeight: 600 } }, title),
      onclose ? IconButton({ "aria-label": `关闭${title}`, title: `关闭${title}`, onclick: onclose }, "×") : null
    )
  )
}

export function Status(
  props: { tone?: "muted" | "danger" | "success" | "warning"; style?: Style } = {},
  ...children: ChildDom[]
) {
  return Text(
    {
      role: "status",
      style: {
        display: "block",
        color: theme.colors[props.tone ?? "muted"],
        fontSize: theme.fontSize.small,
        ...props.style
      }
    },
    ...children
  )
}

export function Collapsible(title: ChildDom, ...children: ChildDom[]) {
  const open = van.state(false)
  return Surface(
    {},
    Button(
      {
        variant: "ghost",
        "aria-expanded": () => open.val,
        onclick: () => {
          open.val = !open.val
        },
        style: { width: "100%", justifyContent: "space-between", fontSize: 12 }
      },
      title,
      () => (open.val ? "▾" : "▸")
    ),
    Column(
      {
        style: () => ({
          display: open.val ? "flex" : "none",
          borderTop: `1px solid ${theme.colors.border}`,
          padding: theme.space.small
        })
      },
      ...children
    )
  )
}
