import { atom } from "jotai"
import type { Options } from "@/types"

export const DEFAULT_OPTIONS: Options = {
  userAgent: "default",
  bilibili: {
    enabled: true,
    blockAD: false,
    notify: false
  },
  baidu: {
    clearSearch: true
  },
  boss: {
    enabled: false
  }
}

export function mergeOptions(options?: Partial<Options>): Options {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    bilibili: {
      ...DEFAULT_OPTIONS.bilibili,
      ...options?.bilibili
    },
    baidu: {
      ...DEFAULT_OPTIONS.baidu,
      ...options?.baidu
    },
    boss: {
      ...DEFAULT_OPTIONS.boss,
      ...options?.boss
    }
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
    setAtom(mergeOptions(options))
  })
}
