export const SITE = {
  name: "chrome ninja",
  displayName: "chrome ninja",
  tagline: "浏览器忍者",
  version: "0.1.0",
  description: "一个基于 Chrome MV3 的浏览器扩展，集成视频嗅探、网络监视、操作录制与翻译工具。"
} as const

export type Feature = {
  title: string
  description: string
  accent: string
}

export const FEATURES: Feature[] = [
  {
    title: "视频嗅探",
    description: "发现页面中的视频资源，支持复制资源链接与下载。",
    accent: "from-pink-500 to-rose-500"
  },
  {
    title: "网络监视器",
    description: "捕获页面请求，按 URL 规则筛选，查看请求与响应详情。",
    accent: "from-pink-500 to-fuchsia-500"
  },
  {
    title: "操作录制",
    description: "通过悬浮面板录制页面操作，保留操作过程。",
    accent: "from-rose-500 to-orange-500"
  },
  {
    title: "页面翻译",
    description: "配置翻译服务与目标语言，在浏览时使用翻译能力。",
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
    title: "开始使用",
    description: "打开网页，点击扩展图标，按需使用视频嗅探、网络监视等工具。"
  }
]

export const MARQUEE_WORDS = [
  "视频嗅探",
  "网络监视器",
  "操作录制",
  "页面翻译",
  "开箱即用",
  "Chrome MV3",
  "轻量 & 极速"
]
