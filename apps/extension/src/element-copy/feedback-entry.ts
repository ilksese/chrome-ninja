import { showCopyToast } from "./feedback"

export function onExecute() {
  showCopyToast("无法访问右键目标，请刷新页面后重试；浏览器受限页面不支持复制")
}
