import { atom } from "jotai"

const _options = atom<ChromeNinja.Options>()
export const optionsAtom = atom(
  async (get): Promise<ChromeNinja.Options> => {
    return new Promise((resolve) => {
      const value = get(_options)
      if (!value) {
        return chrome.storage?.local.get(["options"]).then(({ options }) => {
          resolve(options)
        })
      }
      resolve(value)
    })
  },
  async (_, set, newValue: ChromeNinja.Options) => {
    chrome.storage?.local.set({ options: newValue }, () => {
      set(_options, newValue)
    })
  }
)
