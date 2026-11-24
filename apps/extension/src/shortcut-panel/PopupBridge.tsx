import { useEffect, useRef } from "preact/hooks"
import { useNavigate } from "react-router-dom"
import { connectShortcutPanelPopup, stageShortcutIntent } from "./popup-bridge"

/** 把一次性意图送进工具栏弹窗的现有页面或对话框。 */
export default function ShortcutPanelPopupBridge() {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  useEffect(
    () =>
      connectShortcutPanelPopup({
        route: (intent) => navigateRef.current(intent.action === "video-sniffer" ? "/video-sniffer" : "/browser-presets"),
        dialog: (intent) => {
          stageShortcutIntent(intent)
          navigateRef.current("/home")
        }
      }),
    []
  )
  return null
}
