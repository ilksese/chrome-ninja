# @chrome-ninja/extension

Chrome MV3 扩展本体，提供视频嗅探、网络监视、操作录制和翻译等浏览工具。

## 入口

- `src/popup.tsx`：popup UI 入口，挂载 Preact、Jotai 和 `MemoryRouter`。
- `src/App.tsx`：消费 `vite-plugin-pages` 生成的 `~react-pages` 路由。
- `src/background/index.ts`：MV3 background service worker。
- `src/content-script/index.ts`：通用网页 HMR/调试连接入口，不包含站点功能逻辑。
- 翻译、视频嗅探、录制和网络监视器的 content script 在 `manifest.config.ts` 中分别注册。
- `manifest.config.ts`：由 `@crxjs/vite-plugin` 使用的 manifest 配置。

## 扩展能力

- 视频嗅探：发现页面视频资源，复制链接或下载。
- 网络监视器：捕获页面请求，查看请求与响应详情。
- 操作录制、翻译和 UA 身份切换。
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
- 修改选项结构时，同步更新 `src/types.ts`、默认配置、设置 UI 和相关功能。
