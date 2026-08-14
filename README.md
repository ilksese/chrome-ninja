# chrome-ninja

chrome ninja — 一个基于 **Chrome MV3** 的浏览器扩展，用于增强 bilibili / 百度等网站的浏览体验（自动切换最高画质、去广告、清爽搜索等）。

## 项目结构（Monorepo）

采用 **pnpm workspaces** 管理的 monorepo 结构：

```
chrome-ninja/
├── pnpm-workspace.yaml
├── apps/
│   └── extension/           # Chrome 扩展本体（popup / options / background / content-script）
│       ├── manifest.config.ts
│       ├── vite.config.ts
│       └── src/
└── packages/
    ├── types/               # @chrome-ninja/types     全局 ChromeNinja 命名空间类型
    ├── constants/           # @chrome-ninja/constants 默认配置常量
    └── utils/               # @chrome-ninja/utils     cn / ninjaLog / wait 等工具
```

- **apps/extension** — 可独立构建的扩展应用，通过 Vite + @crxjs/vite-plugin 打包。
- **packages/\*** — 可复用的共享包，均以源码形式被扩展消费，不单独构建。

## 常用命令

```bash
pnpm install          # 安装所有 workspace 依赖
pnpm dev              # 启动 extension 开发服务（Vite）
pnpm build            # 构建扩展（tsc + vite build）
pnpm typecheck        # 自下而上执行各包的 typecheck
pnpm lint             # ESLint 检查
pnpm style            # Prettier 格式化
pnpm commit           # 使用 commitizen 规范提交
```

## 技术栈

- React 18 + TypeScript + Vite
- @crxjs/vite-plugin（Chrome MV3 打包）
- Tailwind CSS + MUI（Material UI）
- jotai（状态管理）+ react-hook-form / yup（表单校验）