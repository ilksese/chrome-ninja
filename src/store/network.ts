import { ninjaLog } from "@lib/utils"

export const network = {
  subscribe: function (notify: () => void) {
    const callback = () => {
      ninjaLog(`网络状态：${navigator.onLine}`)
      notify()
    }
    window.addEventListener("online", callback)
    window.addEventListener("offline", callback)
    return function () {
      window.removeEventListener("online", callback)
      window.removeEventListener("offline", callback)
    }
  },
  getSnapshot: function () {
    return navigator.onLine
  }
}
