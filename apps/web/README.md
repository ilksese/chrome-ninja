# @chrome-ninja/web

chrome ninja 的创意橱窗站点，用于介绍扩展能力和安装方式。

## 技术栈

- Vite 6
- Preact
- Tailwind v4 via `@tailwindcss/vite`
- 本地 shadcn/ui 风格组件
- 本地 react-bits 风格动效组件

## 入口和目录

- `src/main.tsx`：Preact 挂载入口。
- `src/App.tsx`：页面组合入口。
- `src/sections`：Hero、功能、Bilibili、百度、安装、导航、页脚。
- `src/components/ui`：本地 UI primitives。
- `src/components/reactbits`：本地动效组件。
- `src/index.css`：Tailwind v4 token、动画和全局样式。

## 命令

```bash
pnpm --filter @chrome-ninja/web dev
pnpm --filter @chrome-ninja/web lint
pnpm --filter @chrome-ninja/web typecheck
pnpm --filter @chrome-ninja/web build
```

按项目约定，本地开发服务使用 pm2，例如：

```bash
pm2 start 'pnpm exec vite --host 127.0.0.1 --port 5173' --name 'dev:web'
```

## 注意点

- 只配置了 `@` -> `src` 别名。
- 使用 `lucide-preact`，不要直接引入 React 版 icon 包。
- shadcn/ui 和 react-bits 效果当前是 Preact 本地实现；新增 React-only 依赖前先确认 Preact 兼容。
