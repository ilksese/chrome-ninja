import { atom } from "jotai"
import { DEFAULT_OPTIONS } from "@/constant"

const optionsCache = atom<ChromeNinja.Options>(DEFAULT_OPTIONS)
export const optionsAtom = atom(
  (get) => get(optionsCache),
  async (_, set, newValue: ChromeNinja.Options) => {
    chrome.storage?.local.set({ options: newValue }, () => {
      set(optionsCache, newValue)
    })
  }
)
optionsCache.onMount = (setAtom) => {
  chrome.storage?.local.get(["options"], ({ options }) => {
    setAtom(options)
  })
}
