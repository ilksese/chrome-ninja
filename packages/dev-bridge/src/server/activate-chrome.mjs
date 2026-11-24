import { App } from "@crowecawcaw/xa11y"

const CHROME_APP_NAMES = ["Google Chrome", "Chromium", "google-chrome"]

export async function activateHostChrome() {
  const app = await findChromeApp()
  const windows = await app.windows()
  const target = windows.find((window) => window.active) ?? windows[0]
  if (!target) throw new Error("Google Chrome has no window to activate")

  // AXRaise can fail after the app is already frontmost. Chrome only needs the app in front.
  try {
    await target.activate()
  } catch (error) {
    if (!isAlreadyFrontmost(error)) throw error
  }
}

async function findChromeApp() {
  let lastError
  for (const name of CHROME_APP_NAMES) {
    try {
      return await App.byName(name, { timeout: 0 })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error("Google Chrome is not running")
}

function isAlreadyFrontmost(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("AXRaise") || message.includes("kAXErrorAttributeUnsupported")
}
