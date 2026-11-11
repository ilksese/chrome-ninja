# @chrome-ninja/extension

Chrome MV3 扩展本体，提供视频嗅探、网络监视、操作录制和翻译等浏览工具。

## 入口

- `src/popup.tsx`：popup UI 入口，挂载 Preact、Jotai 和 `MemoryRouter`。
- `src/App.tsx`：消费 `vite-plugin-pages` 生成的 `~react-pages` 路由。
- `src/background/index.ts`：MV3 background service worker。
- `src/content-script/index.ts`：通用网页 HMR/调试连接入口，不包含站点功能逻辑。
- 元素复制、翻译、视频嗅探、录制和网络监视器的 content script 在 `manifest.config.ts` 中分别注册。
- `src/cookie-editor/content.ts`：按需注入 Cookie 编辑器的网页内面板，Popup 只提供入口。
- `manifest.config.ts`：由 `@crxjs/vite-plugin` 使用的 manifest 配置。

## 扩展能力

- 视频嗅探：发现页面视频资源，复制链接或下载。
- 网络监视器：捕获页面请求，查看请求与响应详情。
- 操作录制、翻译和 UA 身份切换。
- Cookie 编辑器：在网页中查询、新增、修改与持续禁用当前主机的 Cookie。
- 默认配置在 `src/store/options.ts`，类型在 `src/types.ts`。

## Cookie 编辑器

在普通 HTTP/HTTPS 网页上，从扩展弹窗点击「Cookie 编辑器」后，弹窗关闭，网页中央打开面板，初始尺寸为 720 × 800 px，小视口下自动缩小并保留边距。重复打开唤起同一个面板；面板无页面遮罩，可拖动标题栏、拖动右下角调整大小，也可关闭。文档内路由切换保留面板，刷新、整页导航或离开文档关闭面板。浏览器内部页、扩展页与 Chrome 网上应用店入口不可用；其他注入限制显示实际错误。

面板显示当前主机全部路径上的 Cookie（含适用的父域共享 Cookie），使用当前标签页的 Cookie 存储区，仅包含普通 Cookie 与当前顶层网页完整分区的 Cookie。搜索按名称或值忽略大小写匹配，也包含禁用条目。

- 新增默认为仅当前主机、Path `/`、会话 Cookie、SameSite Lax；HTTPS 默认 Secure，HttpOnly 默认关闭。名称必填，值可为空。
- 点击「编辑」后输入草稿，再点击「保存」才写入；高级属性支持 Domain、host-only、Path、有效期、Secure、HttpOnly 和 SameSite。Secure 可双向修改，后台设置 URL 使用 HTTPS 上下文，Secure 本身作为独立 Cookie 属性处理，不产生网络请求。已有分区键只读，新增只创建普通 Cookie。
- 修改身份成功后移除旧条目；新增或修改撞到生效或禁用条目的完整身份时拒绝覆盖。外部变化会自动刷新列表；正在编辑的条目保留草稿并阻止冲突保存，需点击「重新载入最新版本」。关闭面板丢弃未保存草稿。
- 「禁用」立即保存持久规则并精确移除目标。面板关闭、网页刷新和浏览器重启后规则仍然有效。网站重新写入时后台保存最新内容与属性并再次移除，所有共享同一身份的标签页遵守同一规则。
- 「取消禁用」只恢复最新可观测且未过期的版本，不延长有效期。已过期或已识别的网站删除时只解除规则（并发移除的事件归属边界见下文）。编辑禁用条目只更新恢复数据，身份修改转移规则，之后的网站写入仍作为更新版本。

持续禁用允许写入与移除之间的短暂窗口，窗口内网页或请求仍可能使用 Cookie。网站对已不存在 Cookie 的删除意图可能没有事件，扩展不推断这些删除，也不拦截网络或网页 Cookie API。不提供批量恢复旧快照。面板操作参与共享录制排除。

并发移除还有一项明确限制：Chrome 的 Cookie 事件没有删除来源标识。若网站在扩展过期写入的执行窗口内也过期删除同一身份，事件可能与扩展自身移除相同。此窗口通过持久化的待处理移除标记优先保留最新恢复数据，不承诺识别来源不可区分的并发删除，取消禁用时可能恢复该 Cookie。已明确识别为网站删除的事件仍清除恢复资格。完整恢复约定见 [Cookie 持续禁用决策](../../docs/adr/0002-cookie-disable-latest-state.md)。

后台在 `src/cookie-editor/background.ts` 处理 `cookie-editor` 命令（`open`、`list`、`save`、`disable`、`enable`），按发送标签页确定权限范围，命令返回明确成功或错误。禁用规则与待处理移除标记保存在 `chrome.storage.local.cookieEditorRules`；持久化成功后才执行禁用移除。过期写入前同时记录本地归属标记与 `chrome.storage.session.cookieEditorPendingRemovals` 会话登记，后台重建只信任两者同时存在的归属，浏览器重启后不沿用上一会话的归属登记。过期写入明确失败或校验发现目标未移除时，撤销内存归属，并分别尝试清理本地与会话记录，已排队事件也不再信任该失败操作；单侧残留不能恢复归属。任一清理失败都会明确报错，禁用规则与最新恢复数据仍保留，存储恢复后可重新载入核实并重试。打开面板的标签页订阅保存在 `chrome.storage.session.cookieEditorSubscribers`，后台休眠唤醒后继续通知。打开入口等待面板挂载确认，面板订阅状态变化并在关闭时释放资源。

相关消息、事件顺序、后台重建、身份隔离与失败行为由 Vitest 验证，面板与入口也有行为测试。真实 Chrome 验收另需已加载扩展和仓库允许的浏览器工具授权，覆盖后台休眠唤醒、浏览器重启、分区 API 与 HttpOnly 往返、注入、原生调整大小及录制流程。

## 命令

```bash
pnpm --filter @chrome-ninja/extension dev
pnpm --filter @chrome-ninja/extension lint
pnpm --filter @chrome-ninja/extension typecheck
pnpm --filter @chrome-ninja/extension build
```

扩展测试在根目录运行 `pnpm test --project extension --project extension-ui`。

根级 `pnpm dev` 和 `pnpm build` 等价于 extension 的 dev/build。

## 本地加载扩展

```bash
pnpm --filter @chrome-ninja/extension build
```

然后在 Chrome 打开 `chrome://extensions`，启用开发者模式，加载 `apps/extension/dist`。

## 注意点

- Popup 与选项页使用 Preact + `preact/compat` + `@preact/preset-vite`；Base UI、`react-router-dom`、`react-hook-form` 通过 compat 工作。网页内界面使用 `vanjs-core`、原生内联样式和 `src/content-ui/` 共享组件，直接挂载网页 DOM。
- `pnpm install` 会提示这些库缺少 React peer；这是预期状态，不需要装回 `react` / `react-dom`。
- `manifest.config.ts` 扫描 `src/content-script` 并加入 `web_accessible_resources`；按需注入的模块使用 CRXJS `?script` loader，由构建处理依赖与资源声明。
- Tailwind v4 通过 `@tailwindcss/vite` 接入；`src/index.css` 只导入 theme/utilities，继续跳过 preflight。
- 修改选项结构时，同步更新 `src/types.ts`、默认配置、设置 UI 和相关功能。
