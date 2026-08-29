import { atom } from "jotai"
import type { Options } from "@/types"

export const DEFAULT_OPTIONS: Options = {
  userAgent: "default",
  bilibili: {
    enabled: false,
    blockAD: false,
    notify: false
  },
  baidu: {
    clearSearch: false
  },
  boss: {
    enabled: false
  },
  recorder: {
    enabled: false
  },
  translate: {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    targetLang: "中文"
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
    },
    recorder: {
      ...DEFAULT_OPTIONS.recorder,
      ...options?.recorder
    },
    translate: {
      ...DEFAULT_OPTIONS.translate,
      ...options?.translate
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
