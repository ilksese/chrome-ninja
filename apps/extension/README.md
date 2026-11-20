# @chrome-ninja/extension

Chrome MV3 扩展本体，提供视频嗅探、网络监视、操作录制和翻译等浏览工具。

## 入口

- `src/popup.tsx`：popup UI 入口，挂载 Preact、Jotai 和 `MemoryRouter`。
- `src/App.tsx`：消费 `vite-plugin-pages` 生成的 `~react-pages` 路由。
- `src/background/index.ts`：MV3 background service worker。
- `src/content-script/index.ts`：通用网页 dev-bridge 连接入口，不包含站点功能逻辑。
- 元素复制、翻译、视频嗅探、录制和网络监视器的 content script 在 `manifest.config.ts` 中分别注册。
- `src/cookie-editor/content.ts`：按需注入 Cookie 编辑器的网页内面板，Popup 只提供入口。
- `manifest.config.ts`：由 `@crxjs/vite-plugin` 使用的 manifest 配置。

## 扩展能力

- 视频嗅探：发现页面视频资源，复制链接或下载。
- 网络监视器：捕获页面请求，查看请求与响应详情。
- 操作录制和翻译。
- 切换浏览器身份：从扩展弹窗或网页右键菜单「chrome ninja → Switch User-Agent」选择全局 UA；「默认」移除覆盖。此功能只改写 HTTP(S) 请求的 `User-Agent` 头，不改 `navigator.userAgent`、Client Hints 或视口，也不启动 CDP。右键菜单沿用弹窗的「切换后立即刷新当前页面」设置，只刷新点击菜单所在的标签页。
- Cookie 编辑器：在网页中查询、新增、修改与持续禁用当前主机的 Cookie。
- 浏览器预设：保存 User-Agent 与 viewport 组合，并对单个标签页应用模拟。
- 网页内面板（Cookie 编辑器、网络监视器、步骤记录器）可拖动标题栏、拖动右下角调整大小；仅标题栏拖动改变位置或原生缩放改变尺寸后保存布局，普通点击期间的内容增高不保存。各面板使用独立的 `chrome.storage.local` 键 `contentUiPanelLayouts.<panel-key>`，所有站点与标签页共用。恢复与拖动统一保留 8 px 视口边距，拖动的每次移动按面板当前实际尺寸计算边界，各自最小尺寸在小视口下缩小。Cookie 编辑器首次打开的默认布局同样经过边界夹取。
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

## 浏览器预设

从扩展弹窗或选项页的首页卡片进入 `/browser-presets`，页面由 Popup 与 Options 共用；首页卡片同时显示当前标签页的模拟状态与预设名，并提供「退出模拟」。首次进入说明应用预设需要附加调试权限。

预设保存在 `chrome.storage.local.browserPresets`，与 `options` 分开，浏览器重启后保留；首次安装为空，不内置默认预设。记录包含稳定 `id`、唯一 `name`、沿用 `USER_AGENT_OPTIONS` 的 `userAgent`（`default` 表示不覆盖 UA）与 `viewport`（宽、高、设备像素比、mobile）。

- 名称去首尾空格后非空，长度上限 40，唯一性忽略大小写。
- 宽高为 200–4000 的整数，设备像素比为 1–4；越界时展示校验提示并拒绝保存。
- 设备档位按钮只填入视口数值，不作为可保存实体，不进入存储。填入后可继续手动微调。
- UA 身份的移动端声明与视口 mobile 开关不一致时，保存前弹出确认框，列出实际发出的 `sec-ch-ua-mobile`、布局处理方式与指纹割裂风险；取消回到表单，确认后按用户填写的值保存，不做静默修正。
- 支持编辑全部字段与重命名；删除前二次确认并展示预设名。

### 应用与退出

`apply` 对目标标签页附加调试器，下发 `Emulation.setDeviceMetricsOverride`，UA 不为 `default` 时再下发完整身份（`userAgent`、`platform` 与 `userAgentMetadata`），最后重新加载页面。覆盖跟随该标签页跨刷新、站内跳转与 SPA 路由切换，新开标签页不受影响。

- 模拟中的标签页归入名为 `[ninja] <预设名>` 的标签页分组。同一预设的标签页共用一个分组；扩展只认自己创建的 groupId，用户自建的同名分组不会被认领，分组变空由 Chrome 关闭后扩展同步移除记账。
- 把标签页移出模拟分组即退出模拟，与页面上的「退出模拟」走同一条收尾路径：归还全局 UA 改写、分离调试器、离开分组并重新加载。
- 标签页已在用户自建分组时，`apply` 先返回 `needsGroupMoveConfirmation` 且不做任何改动；页面弹确认框，确认后带 `confirmGroupMove` 重发，把标签页移出用户分组再归入模拟分组。
- 已模拟的标签页切换预设时复用同一个调试会话，只重新下发参数并刷新，不分离后再附加，因此不会重复出现调试提示条。从具体 UA 切到「不覆盖」时下发空的 `userAgent` 清除上一次的 UA 覆盖。

应用期间浏览器显示一条扩展无法抑制的调试提示条（「"扩展名" started debugging this browser」）；用户在该提示条点击取消或打开 DevTools 都会终止会话，扩展随之退出模拟并给出一次性提示。`chrome://`、扩展页与 Chrome 网上应用店等受限页面无法模拟，`status` 提前返回原因，页面据此在点击前禁用应用按钮。

### UA 与全局改写

预设选具体 UA 时，全局 `User-Agent` 改写规则被暂停，避免同一请求带上两套身份；退出最后一个模拟标签页后按用户最新的全局选择恢复。选「不覆盖」的预设只模拟视口，不暂停全局规则；若该标签页此前在模拟具体 UA，「不覆盖」会归还那次暂停。Safari 类身份不下发 `userAgentMetadata`，全部 `sec-ch-ua-*` 请求头因此不出现。

### 使用中的锁定

被至少一个标签页使用的预设不能编辑、重命名或删除，列表显示「正在 N 个标签页使用」并提供「停止」。停止逐个退出所有使用该预设的标签页，最后一个使用者退出后预设自动解锁。前端只读后台下发的使用数量，不自行推断锁定态。

后台在 `src/browser-preset/background.ts` 处理 `browser-preset` 命令（`list`、`create`、`update`、`delete`、`apply`、`simulate-exit`、`stop`、`status`），校验规则在 `src/browser-preset/validation.ts`，页面与后台共用同一份；UA 身份包在 `src/browser-preset/identity.ts`，设备档位在 `src/browser-preset/devices.ts`。协议、身份包、页面与首页入口分别由 `tests/browser-preset-background.test.ts`、`tests/browser-preset-identity.test.ts`、`tests/browser-presets-page.test.tsx` 与 `tests/home-browser-preset-entry.test.tsx` 验证。

## 命令

```bash
pnpm --filter @chrome-ninja/extension dev
pnpm --filter @chrome-ninja/extension lint
pnpm --filter @chrome-ninja/extension typecheck
pnpm --filter @chrome-ninja/extension build
```

扩展测试在根目录运行 `pnpm test --project extension --project extension-ui`。

根级 `pnpm dev` 和 `pnpm build` 等价于 extension 的 dev/build。

## 开发自动刷新

`pnpm dev` 同时启动 `@chrome-ninja/dev-bridge` 与 `vite build --watch`，并设置 `VITE_CHROME_NINJA_DEV_BRIDGE=true`。先在 Chrome 扩展管理页将 `apps/extension/dist` 加载为已解压扩展；之后构建完成会自动刷新相关界面或整个扩展。开发版的工具栏图标显示 `dev` 徽章，不依赖开发桥是否连接；普通 `pnpm build` 的产物不显示徽章。

构建使用 CRXJS 2.7.1。开发模式关闭 Rollup 构建缓存，让每轮构建重新生成 Manifest 和动态 Content Script 的文件引用，避免增量构建沿用失效引用而中断刷新；生产构建保留默认缓存设置。

- Popup、Options 的独立入口变化刷新对应界面，公共页面和组件变化刷新两者。
- Content Script 和录制器、网络监控、视频嗅探变化刷新匹配的网页；Boss 专用脚本仅刷新匹配的 Boss 页面。
- 后台、Store、Manifest、资源或未分类变化重载整个扩展。
- 后台首次连接开发桥时，将最近聚焦的普通 Chrome 窗口切到前台，再打开工具栏 Popup；界面或网页刷新后也自动打开，整扩展重载后由新后台连接时打开。同一后台断线重连不会单独触发打开。

自动刷新会重置运行时界面状态。Popup 失焦时仍按 Chrome 默认行为关闭，浏览器拒绝打开时在后台控制台记录错误。普通 `pnpm build` 不启用开发连接和自动打开。

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
