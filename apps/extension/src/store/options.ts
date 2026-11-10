import { atom } from "jotai"
import type { Options } from "@/types"

export const DEFAULT_OPTIONS: Options = {
  userAgent: "default",
  reloadOnUserAgentChange: false,
  boss: {
    enabled: false
  },
  recorder: {
    enabled: false
  },
  videoSniffer: {
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
    userAgent: options?.userAgent ?? DEFAULT_OPTIONS.userAgent,
    reloadOnUserAgentChange: options?.reloadOnUserAgentChange ?? DEFAULT_OPTIONS.reloadOnUserAgentChange,
    boss: {
      ...DEFAULT_OPTIONS.boss,
      ...options?.boss
    },
    recorder: {
      ...DEFAULT_OPTIONS.recorder,
      ...options?.recorder
    },
    videoSniffer: {
      ...DEFAULT_OPTIONS.videoSniffer,
      ...options?.videoSniffer
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
