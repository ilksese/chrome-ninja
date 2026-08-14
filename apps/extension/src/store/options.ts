import { atom } from "jotai"
import type { Options } from "@/types"

export const DEFAULT_OPTIONS: Options = {
  bilibili: {
    enabled: true,
    blockAD: false,
    notify: false
  },
  baidu: {
    clearSearch: true
  }
}

const optionsCache = atom<Options>(DEFAULT_OPTIONS)
export const optionsAtom = atom(
  (get) => get(optionsCache),
  async (_, set, newValue: Options) => {
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
