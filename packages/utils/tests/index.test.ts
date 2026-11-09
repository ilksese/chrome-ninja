import { describe, expect, it, vi } from "vitest"
import { cn, ninjaLog } from "../src"

describe("cn", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("p-2 text-sm", false, undefined, { hidden: false, flex: true }, ["p-4"])).toBe("text-sm flex p-4")
  })

  it("accepts empty input", () => {
    expect(cn()).toBe("")
  })
})

describe("ninjaLog", () => {
  it("preserves log payloads", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
    const payload = { enabled: true }

    ninjaLog("options", payload)

    expect(debug).toHaveBeenCalledWith("%c[NINJA_LOG]", "color: red;background:yellow", "options", payload)
  })
})
