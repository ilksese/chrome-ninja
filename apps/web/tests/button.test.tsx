import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, it, vi } from "vitest"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders its accessible name and handles clicks", () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>查看扩展</Button>)

    fireEvent.click(screen.getByRole("button", { name: "查看扩展" }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("does not activate a disabled button", () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        保存
      </Button>
    )
    const button = screen.getByRole("button", { name: "保存" })

    expect(button).toBeDisabled()
    button.click()

    expect(onClick).not.toHaveBeenCalled()
  })
})
