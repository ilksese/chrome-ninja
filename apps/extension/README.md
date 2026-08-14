# @chrome-ninja/extension

Chrome MV3 扩展本体，用于增强 Bilibili 和百度的浏览体验。

## 入口

- `src/popup.tsx`：popup UI 入口，挂载 Preact、Jotai 和 `MemoryRouter`。
- `src/App.tsx`：消费 `vite-plugin-pages` 生成的 `~react-pages` 路由。
- `src/background/index.ts`：MV3 background service worker。
- `src/content-script/index.ts`：content script 调度入口，根据 `chrome.storage.local.options` 分发到站点 handler。
- `manifest.config.ts`：由 `@crxjs/vite-plugin` 使用的 manifest 配置。

## 站点能力

- Bilibili：自动切换视频/直播画质，可选广告屏蔽。
- 百度：注入搜索页清爽样式。
- 默认配置在 `src/store/options.ts`，类型在 `src/types.ts`。

## 命令

```bash
pnpm --filter @chrome-ninja/extension dev
pnpm --filter @chrome-ninja/extension lint
pnpm --filter @chrome-ninja/extension typecheck
pnpm --filter @chrome-ninja/extension build
```

根级 `pnpm dev` 和 `pnpm build` 等价于 extension 的 dev/build。

## 本地加载扩展

```bash
pnpm --filter @chrome-ninja/extension build
```

然后在 Chrome 打开 `chrome://extensions`，启用开发者模式，加载 `apps/extension/dist`。

## 注意点

- UI 栈是 Preact + `preact/compat` + `@preact/preset-vite`；Base UI、`react-router-dom`、`react-hook-form` 通过 compat 工作。
- `pnpm install` 会提示这些库缺少 React peer；这是预期状态，不需要装回 `react` / `react-dom`。
- 注入到页面的 JS/CSS 放在 `src/content-script` 下；`manifest.config.ts` 会扫描该目录并加入 `web_accessible_resources`。
- Tailwind v4 通过 `@tailwindcss/vite` 接入；`src/index.css` 只导入 theme/utilities，继续跳过 preflight。
- 修改选项结构时，同步更新 `src/types.ts`、设置 UI 和 content-script handler。
