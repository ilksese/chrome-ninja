import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, it, vi } from "vitest"
import Dialog from "@/components/Dialog"

describe("Dialog", () => {
  it("does not render when closed", () => {
    render(
      <Dialog open={false} titleId="title" onClose={vi.fn()}>
        内容
      </Dialog>
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders an accessible portal and only closes on backdrop or Escape", () => {
    const onClose = vi.fn()
    render(
      <Dialog open titleId="title" onClose={onClose}>
        <h2 id="title">编辑设置</h2>
        <button>保存</button>
      </Dialog>
    )
    const dialog = screen.getByRole("dialog", { name: "编辑设置" })
    expect(dialog).toHaveAttribute("aria-modal", "true")

    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("presentation"))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("removes its keyboard listener on unmount", () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <Dialog open titleId="title" onClose={onClose}>
        内容
      </Dialog>
    )

    unmount()
    fireEvent.keyDown(document, { key: "Escape" })

    expect(onClose).not.toHaveBeenCalled()
  })
})
