export const SITE = {
  name: "chrome ninja",
  displayName: "chrome ninja",
  tagline: "浏览器忍者",
  version: "0.1.0",
  description: "一个基于 Chrome MV3 的浏览器扩展，让 B 站画质拉满、让百度搜索清爽如初。"
} as const

export type Feature = {
  title: string
  description: string
  target: "bilibili" | "baidu"
  accent: string
}

export const FEATURES: Feature[] = [
  {
    target: "bilibili",
    title: "自动切换最高画质",
    description: "视频页面加载后自动请求最高可用清晰度，告别手动点选、告别 480P。",
    accent: "from-pink-500 to-rose-500"
  },
  {
    target: "bilibili",
    title: "直播高画质",
    description: "检测到直播流后自动切换至首选画质（qn），看直播不再糊。",
    accent: "from-pink-500 to-fuchsia-500"
  },
  {
    target: "bilibili",
    title: "去广告 / 通知开关",
    description: "按需屏蔽站内广告，通知提示独立可控，把选择权交给你。",
    accent: "from-rose-500 to-orange-500"
  },
  {
    target: "baidu",
    title: "清爽搜索",
    description: "注入样式并移除搜索结果页的干扰，让百度回归清爽的搜索体验。",
    accent: "from-cyan-400 to-blue-500"
  }
]

export type InstallStep = {
  step: string
  title: string
  description: string
}

export const INSTALL_STEPS: InstallStep[] = [
  {
    step: "01",
    title: "构建扩展",
    description: "pnpm install && pnpm build，通过 Vite + @crxjs 打包为 MV3 扩展产物到 dist。"
  },
  {
    step: "02",
    title: "加载已解压的扩展",
    description: "打开 chrome://extensions，开启「开发者模式」，选择「加载已解压的扩展程序」。"
  },
  {
    step: "03",
    title: "访问目标站点",
    description: "打开 B 站或百度，忍者自动出击：画质拉满、搜索清爽。"
  }
]

export const MARQUEE_WORDS = [
  "B 站画质拉满",
  "百度搜索清爽",
  "去广告",
  "自动最高画质",
  "开箱即用",
  "Chrome MV3",
  "轻量 & 极速"
]
