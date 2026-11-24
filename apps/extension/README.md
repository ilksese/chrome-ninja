# @chrome-ninja/extension

Chrome MV3 扩展本体，提供视频嗅探、网络监视、操作录制和翻译等浏览工具。

## 入口

- `src/popup.tsx`：popup UI 入口，挂载 Preact、Jotai 和 `MemoryRouter`。
- `src/App.tsx`：消费 `vite-plugin-pages` 生成的 `~react-pages` 路由。
- `src/background/index.ts`：MV3 background service worker。
- `src/content-script/index.ts`：通用网页 dev-bridge 连接入口，不包含站点功能逻辑。
- 元素复制、翻译、视频嗅探、录制和网络监视器的 content script 在 `manifest.config.ts` 中分别注册。
- `src/cookie-editor/content.ts`：按需注入 Cookie 编辑器的网页内面板，扩展弹窗与网页右键菜单共用后台打开流程。
- `manifest.config.ts`：由 `@crxjs/vite-plugin` 使用的 manifest 配置。

## 扩展能力

首页功能入口通栏排列。拖动入口左侧的手柄可调整顺序，聚焦手柄后也可用上、下方向键移动。顺序保存在扩展本地存储中，扩展弹窗和选项页共用。

- 视频嗅探：发现页面视频资源，复制链接或下载。
- 网络监视器：查看当前标签页命中 URL 片段的 `fetch` / `XMLHttpRequest` 请求及响应详情。顶层页面和 iframe 都在 `document_start` 安装 Hook，收到开启状态后才采集，不补录此前的请求。捕获到 iframe 请求时，列表按请求所在页面的 URL 分组；展开的分组随请求列表一起滚动。
- 操作录制和翻译。
- 切换浏览器身份：从扩展弹窗或网页右键菜单「chrome ninja → Switch User-Agent」选择全局 UA；「默认」移除覆盖。此功能只改写 HTTP(S) 请求的 `User-Agent` 头，不改 `navigator.userAgent`、Client Hints 或视口，也不启动 CDP。右键菜单沿用弹窗的「切换后立即刷新当前页面」设置，只刷新点击菜单所在的标签页。
- Cookie 编辑器：在网页中查询、新增、修改与持续禁用当前主机的 Cookie。
- 浏览器预设：对单个标签页应用内置或自定义设备，模拟 UA、视口和输入方式。
- 页面控制：首页功能列表中的开关。开启后扩展连接本地页面控制服务，调用方用 HTTP 按 `tabId` 操作标签页，或列出最后聚焦窗口的标签页。
- 网页内面板（Cookie 编辑器、网络监视器、步骤记录器）可拖动标题栏、拖动右下角调整大小；仅标题栏拖动改变位置或原生缩放改变尺寸后保存布局，普通点击期间的内容增高不保存。各面板使用独立的 `chrome.storage.local` 键 `contentUiPanelLayouts.<panel-key>`，所有站点与标签页共用。恢复与拖动统一保留 8 px 视口边距，拖动的每次移动按面板当前实际尺寸计算边界，各自最小尺寸在小视口下缩小。Cookie 编辑器首次打开的默认布局同样经过边界夹取。
- 快捷面板：用快捷键在当前网页搜索并执行已有动作。见下方「快捷面板」。
- 默认配置在 `src/store/options.ts`，类型在 `src/types.ts`。

## 快捷面板

普通网页按 `Ctrl+Shift+K`（Mac 为 `Command+Shift+K`）打开，再按一次关闭。命令名是「打开快捷面板」，可在 `chrome://extensions/shortcuts` 修改。首页、右键菜单和选项页没有入口。Chrome 不在前台时唤不起。脚本不常驻，快捷键触发时才注入当前标签的顶层页面。受限页面、网上应用店、扩展页、PDF 以及任何注入失败都没有界面，也不发系统通知。注入完成前再按一次保持关闭。

面板在视口上方居中，固定尺寸，不拖动，没有页面遮罩。点面板外会关闭，页面上的那次点击仍然生效。它使用关闭的 Shadow DOM，其他网页内界面仍然直接挂到页面 DOM。空查询按 `homeFeatureOrder` 列出快捷动作，不含页面控制，也不高亮；选项页隐藏的网络监视器、Cookie 编辑器和登录态导出仍然出现。有查询时只按标题做不区分大小写的跳字匹配，匹配度高的在前，命中的字在标题里高亮。说明和状态不参与搜索。

网络监视器、步骤录制和 BOSS 反检测翻转成功后用现有 Toast 提示新状态，然后关闭面板。Cookie 编辑器只打开或唤起已有面板。切换浏览器身份、视频嗅探、生成二维码、浏览器预设、AI 划词翻译和登录态导出打开工具栏弹窗并直接进入现有流程；意图只使用一次，没接住就作废。失败时面板留着，错误显示在该动作上。

## 页面控制

首页功能列表中的「页面控制」默认关闭，扩展弹窗和选项页都显示这一行，状态写入 Options。关闭时扩展断开服务并拒绝操作。列表不显示连接状态。

这项能力独立于调试桥，不使用 CDP。被操作的标签页，以及 `navigation` 新开的标签页，进入同一个名为 `page-control` 的标签页分组。同名的第二个分组会并入它。先启动服务：

```bash
pnpm --filter @chrome-ninja/page-control dev
```

服务监听 `127.0.0.1:8788`。打开开关后，扩展主动连接。`POST /page-control` 接收操作数组，按顺序执行，失败即停止。除 `tab-list` 外，每个操作都必须提供正整数 `tabId`。

`snapshot` 返回顶层文档的无障碍结构，包含角色、名称、状态，以及接近 Playwright aria snapshot 的 `text`。可点击、可填写或可选择的节点带稳定 `ref`（`e1`、`e2`…），写入 `data-chrome-ninja-ref`，并出现在 `text` 的 `[ref=e1]` 里。同一批可操作节点的文档顺序不变时，ref 不变；每次快照都会重写。`click`、`hover`、`fill`、`select` 必须只提供 `selector`、`xpath` 或 `ref` 其中一个。`click` 先把目标滚进视口，再派发 pointer 和 mouse 事件，包含 `click`。`hover` 同样先滚进视口，再派发悬停事件；脚本事件不能置上 CSS `:hover`。`fill` 把字符串 `value` 写入 input、textarea 或 contenteditable，并派发 `input` 和 `change`。`select` 只作用于原生单选 `select`，`value` 和 `label` 只能提供一个。

`scroll` 的 `x`、`y` 必须是有限数字，正数向右、向下，立刻滚动。不提供目标时滚动顶层文档；提供其中一个目标时滚动该元素，若它本身不能滚动则滚动最近的可滚动祖先。`press` 的 `key` 只能是 `Enter`、`Escape` 或 `Tab`，可带 `altKey`、`ctrlKey`、`metaKey`、`shiftKey`；目标可选。非可信按键不会触发浏览器默认动作，Tab 会移动焦点，不带修饰键的 Enter 会在单行输入或按钮上调用 `requestSubmit`。

`wait` 的 `until` 是 `load`、`selector` 或 `text`。`load` 等待指定标签加载完成；若当前已完成，最多再等 200 毫秒看导航是否开始，没有就开始视为已完成。`selector` 和 `text` 等待该标签的顶层文档。`timeout` 可选，默认 5000，最大 7000 毫秒，给服务端 8 秒时限留出返回时间。`navigation` 打开 `http` 或 `https` 地址；`newPage` 为 `false` 时替换 `tabId` 对应的标签页，为 `true` 时在该标签页所在窗口新开标签页，把新标签记为它的子标签，并在结果里返回新 `tabId`，不等待加载。同一请求打开多个标签时，结果改为 `tabIds`。关闭页面控制会清空全部父子记录；关闭一个标签会清空以它为根的记录。`activate` 聚焦 `tabId` 所在窗口并激活该标签。`history` 的 `direction` 是 `back`、`forward` 或 `reload`，只操作指定标签，不等待加载。`reload` 使用标签页 API。`back` 和 `forward` 在页面里调用 `history.back()` 和 `history.forward()`；`history.length` 为 1 时 `back` 失败，`forward` 不判断是否真有下一条。`screenshot` 必须提供 `tabId`。`captureVisibleTab` 只能截窗口里当前可见的标签，所以后台标签会先被激活再截图，随后恢复原来的活动标签，不抢窗口焦点，也不使用 debugger。返回 quality 60 的 jpeg data URL。一次截图在 `screenshot`，同一请求多次截图时为 `screenshots`。

`tab-list` 不接收参数，也不能带 `tabId`。它按从左到右返回最后聚焦窗口全部标签页的 `title`、`tabId`、`url` 和 `active`。它只列出标签页，不操作页面，因此也包含受限页面。返回的 `tabId` 用于后续操作。

```powershell
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"navigation","tabId":1,"url":"https://example.com","newPage":true}]'
```

URL scheme 以 `chrome` 开头的受限页面不能注入、滚动、点击、悬停、填写、选择、按键、等待选择器或文本、生成快照、截图或执行 `history` 的 `back` / `forward`。`tab-list`、`activate`、`navigation`、`history` 的 `reload` 和 `wait` 的 `load` 不注入页面。网上应用店和无痕窗口中的普通网页可以操作。一次 `tab-list` 的结果在 `tabs`，同一请求里多次列出时改为 `tabLists`。服务没连上时，请求立刻失败。列出最后聚焦窗口：

```powershell
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"tab-list"}]'
```

## Cookie 编辑器

在普通 HTTP/HTTPS 网页上，从网页右键菜单选择「chrome ninja → Cookie Editor」，或从扩展弹窗点击「Cookie 编辑器」，即可在当前网页中央打开同一个面板。通过弹窗打开成功后，弹窗自动关闭。面板初始尺寸为 720 × 800 px，小视口下自动缩小并保留边距。重复打开唤起同一个面板；面板无页面遮罩，可拖动标题栏、拖动右下角调整大小，也可关闭。文档内路由切换保留面板，刷新、整页导航或离开文档关闭面板。浏览器内部页、扩展页与 Chrome 网上应用店不支持打开面板；其他注入错误在弹窗中显示，从右键菜单打开失败时记录到扩展后台。

面板显示当前主机全部路径上的 Cookie（含适用的父域共享 Cookie），使用当前标签页的 Cookie 存储区，仅包含普通 Cookie 与当前顶层网页完整分区的 Cookie。搜索按名称或值忽略大小写匹配，也包含禁用条目。

- 新增默认为仅当前主机、Path `/`、会话 Cookie、SameSite Lax；HTTPS 默认 Secure，HttpOnly 默认关闭。名称必填，值可为空。
- 点击「编辑」后输入草稿，再点击「保存」才写入；高级属性支持 Domain、host-only、Path、有效期、Secure、HttpOnly 和 SameSite。Secure 可双向修改，后台设置 URL 使用 HTTPS 上下文，Secure 本身作为独立 Cookie 属性处理，不产生网络请求。已有分区键只读，新增只创建普通 Cookie。
- 修改身份成功后移除旧条目；新增或修改撞到生效或禁用条目的完整身份时拒绝覆盖。外部变化会自动刷新列表；正在编辑的条目保留草稿并阻止冲突保存，需点击「重新载入最新版本」。关闭面板丢弃未保存草稿。
- 「禁用」立即保存持久规则并精确移除目标。面板关闭、网页刷新和浏览器重启后规则仍然有效。网站重新写入时后台保存最新内容与属性并再次移除，所有共享同一身份的标签页遵守同一规则。
- 「取消禁用」只恢复最新可观测且未过期的版本，不延长有效期。已过期或已识别的网站删除时只解除规则（并发移除的事件归属边界见下文）。编辑禁用条目只更新恢复数据，身份修改转移规则，之后的网站写入仍作为更新版本。

持续禁用允许写入与移除之间的短暂窗口，窗口内网页或请求仍可能使用 Cookie。网站对已不存在 Cookie 的删除意图可能没有事件，扩展不推断这些删除，也不拦截网络或网页 Cookie API。不提供批量恢复旧快照。面板操作参与共享录制排除。

并发移除还有一项明确限制：Chrome 的 Cookie 事件没有删除来源标识。若网站在扩展过期写入的执行窗口内也过期删除同一身份，事件可能与扩展自身移除相同。此窗口通过持久化的待处理移除标记优先保留最新恢复数据，不承诺识别来源不可区分的并发删除，取消禁用时可能恢复该 Cookie。已明确识别为网站删除的事件仍清除恢复资格。完整恢复约定见 [Cookie 持续禁用决策](../../docs/adr/0002-cookie-disable-latest-state.md)。

后台在 `src/cookie-editor/background.ts` 处理 `cookie-editor` 命令（`open`、`list`、`save`、`disable`、`enable`），按发送标签页确定权限范围，命令返回明确成功或错误。禁用规则与待处理移除标记保存在 `chrome.storage.local.cookieEditorRules`；持久化成功后才执行禁用移除。过期写入前同时记录本地归属标记与 `chrome.storage.session.cookieEditorPendingRemovals` 会话登记，后台重建只信任两者同时存在的归属，浏览器重启后不沿用上一会话的归属登记。过期写入明确失败或校验发现目标未移除时，撤销内存归属，并分别尝试清理本地与会话记录，已排队事件也不再信任该失败操作；单侧残留不能恢复归属。任一清理失败都会明确报错，禁用规则与最新恢复数据仍保留，存储恢复后可重新载入核实并重试。打开面板的标签页订阅保存在 `chrome.storage.session.cookieEditorSubscribers`，后台休眠唤醒后继续通知。打开入口等待面板挂载确认，面板订阅状态变化并在关闭时释放资源。

在真实 Chrome 中加载扩展后，可验收后台休眠唤醒、浏览器重启、分区 API 与 HttpOnly 往返、注入、原生调整大小及录制流程。使用浏览器工具须先获得授权。

## 浏览器预设

从扩展弹窗或选项页的首页功能列表进入 `/browser-presets`，页面由 Popup 与 Options 共用；首页的浏览器预设入口同时显示当前标签页的模拟状态与预设名，并提供「退出模拟」。首次进入说明应用预设需要附加调试权限。

内置预设可直接应用，不可编辑或删除。从内置预设点「自定义」可打开预填表单，保存后才创建具名预设。自定义预设保存在 `chrome.storage.local.customBrowserPresets`，浏览器重启后保留。

拖动任意预设左侧的手柄可调整列表顺序，聚焦手柄后也可用上、下方向键移动。内置和自定义预设可混排，顺序在扩展弹窗与选项页共用，新建预设追加到列表末尾。

- 名称去首尾空格后非空，长度上限 40，唯一性忽略大小写。
- 宽高为 200–4000 的整数，设备像素比为 1–4；越界时展示校验提示并拒绝保存。
- UA 和移动端布局由来源设备决定，编辑时不能更换设备；自定义预设可调整名称、视口宽高和 DPR。
- 移动端额外提供触摸方式：默认 `touch` 把鼠标操作转为单指触摸，`mouse` 保留普通鼠标输入，不改变 UA 或视口。桌面端不显示触摸方式。
- 删除自定义预设前二次确认并展示预设名。

### 应用与退出

`apply` 对目标标签页附加调试器，下发视口、触摸方式和设备 UA，最后重新加载页面。覆盖跟随该标签页跨刷新、站内跳转与 SPA 路由切换，新开标签页不受影响。

- 模拟中的标签页归入名为 `[ninja] <预设名>` 的标签页分组。同一预设的标签页共用一个分组；扩展只认自己创建的 groupId，用户自建的同名分组不会被认领，分组变空由 Chrome 关闭后扩展同步移除记账。
- 把标签页移出模拟分组即退出模拟，与页面上的「退出模拟」走同一条收尾路径：分离调试器、恢复该标签页的独立 UA 规则、离开分组并重新加载。
- 标签页已在用户自建分组时，`apply` 先返回 `needsGroupMoveConfirmation` 且不做任何改动；页面弹确认框，确认后带 `confirmGroupMove` 重发，把标签页移出用户分组再归入模拟分组。
- 已模拟的标签页切换预设时复用同一个调试会话，重新下发全部参数再刷新。切换到 `mouse` 或桌面预设会关闭触摸模拟；切换失败时退出模拟，避免保留部分覆盖。

应用期间浏览器显示一条扩展无法抑制的调试提示条（「"扩展名" started debugging this browser」）；用户在该提示条点击取消或打开 DevTools 都会终止会话，扩展随之退出模拟并给出一次性提示。`chrome://`、扩展页与 Chrome 网上应用店等受限页面无法模拟，`status` 提前返回原因，页面据此在点击前禁用应用按钮。

### UA 与全局改写

模拟期间，CDP 预设只接管当前标签页：独立 UA 规则在该标签页不生效，首页的独立 UA 入口禁用，右键选择不会修改设置。其他标签页仍可使用独立 UA；任一标签页退出模拟后即恢复当前的独立 UA 规则。Safari 类设备身份不下发 `userAgentMetadata`，因此不发送 `sec-ch-ua-*` 请求头。

### 使用中的锁定

被至少一个标签页使用的预设不能编辑、重命名或删除，列表显示「正在 N 个标签页使用」并提供「停止」。停止逐个退出所有使用该预设的标签页，最后一个使用者退出后预设自动解锁。前端只读后台下发的使用数量，不自行推断锁定态。

后台在 `src/browser-preset/background.ts` 处理 `browser-preset` 命令，页面与后台共用 `src/browser-preset/validation.ts`；UA 身份包在 `src/browser-preset/identity.ts`，内置设备目录在 `src/browser-preset/devices.ts`。

## 命令

```bash
pnpm --filter @chrome-ninja/extension dev
pnpm --filter @chrome-ninja/extension lint
pnpm --filter @chrome-ninja/extension typecheck
pnpm --filter @chrome-ninja/extension build
```


根级 `pnpm dev` 和 `pnpm build` 等价于 extension 的 dev/build。

## 开发自动刷新

`pnpm dev` 同时启动 `@chrome-ninja/dev-bridge` 与 `vite build --watch`，并设置 `VITE_CHROME_NINJA_DEV_BRIDGE=true`。默认端口 `8787` 被占用时，用 `pnpm dev -- --port 8797` 换端口；构建会带上同一个 `VITE_CHROME_NINJA_DEV_BRIDGE_PORT`。先在 Chrome 扩展管理页将 `apps/extension/dist` 加载为已解压扩展；换端口后重新加载扩展。之后构建完成会自动刷新相关界面或整个扩展。开发版的工具栏图标显示 `dev` 徽章，不依赖开发桥是否连接；普通 `pnpm build` 的产物不显示徽章。

构建使用 CRXJS 2.7.1。开发模式关闭 Rollup 构建缓存，让每轮构建重新生成 Manifest 和动态 Content Script 的文件引用，避免增量构建沿用失效引用而中断刷新；生产构建保留默认缓存设置。

- Popup、Options 的独立入口变化刷新对应界面，公共页面和组件变化刷新两者。
- Content Script 和录制器、网络监控、视频嗅探变化刷新匹配的网页；Boss 专用脚本仅刷新匹配的 Boss 页面。
- 后台、Store、Manifest、资源或未分类变化重载整个扩展。
- 构建完成只刷新相关界面、网页或整个扩展，不自动打开工具栏 Popup。
- 需要 Popup 时，dev-bridge 的 `POST /open-popup`，或目标为 `popup` 的 `/command`、`/execute`，会让后台打开它。已有 Popup 连接时不再抢焦点。

自动刷新会重置运行时界面状态。Popup 失焦时仍按 Chrome 默认行为关闭。普通 `pnpm build` 不启用开发连接，也不会打开 Popup。

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
