---
status: accepted
---

# 浏览器预设通过 CDP 模拟单标签页

浏览器预设需要同时改写 User-Agent 与 viewport。viewport 模拟没有纯扩展 API 可用：`chrome.windows.update` 只改真实窗口尺寸，不改 `screen`、`devicePixelRatio` 与 `device-width` 媒体查询；DNR 的 `modifyHeaders` 只作用于网络请求头，改不到 `navigator.userAgent` 与 client hints。唯一能同时覆盖布局引擎与请求身份的路径是 `chrome.debugger` 附加标签页后下发 `Emulation.setDeviceMetricsOverride` 与 `Emulation.setUserAgentOverride`。

代价是 attach 期间浏览器显示一条无法抑制的全局提示条（「"扩展名" started debugging this browser」），且用户打开 DevTools 会强制终止扩展会话。这两点不可规避，属于该方案的既有边界；因此只在用户显式应用预设时 attach，退出即 detach。

# 用标签页分组承载模拟状态

模拟作用域是单个标签页。扩展创建的标签页分组（名称 `[ninja] <预设名>`）就是"该标签页正在模拟"的可见状态，用户移出分组即视为退出模拟。仅追踪扩展自己创建的 groupId，并按名称前缀区分用户自建分组，避免认领同名分组。

标签页至预设的映射只存在于后台内存，不持久化：扩展重启或浏览器重启后不恢复模拟，与 CDP 会话随标签页存续的行为一致。已应用的预设禁止编辑与删除，只能停止，避免分组名与预设名失去同步。

# UA 覆盖必须连同 userAgentMetadata 与 platform 一起下发

只传 `userAgent` 时，`navigator.userAgent` 与 HTTP `User-Agent` 头会改变，但 `navigator.userAgentData`、`sec-ch-ua-*` 请求头与 `navigator.platform` 仍是浏览器真实值，站点可据此判定身份不一致。预设因此必须下发完整身份：`setUserAgentOverride` 同时传 `userAgent`、`platform` 与 `userAgentMetadata`。

`userAgentMetadata` 的字段处理不能依赖默认值。`platform`、`platformVersion`、`architecture`、`model`、`mobile` 是必填项；而 `brands`、`fullVersionList`、`bitness`、`wow64`、`formFactors` 缺省时会回退成宿主 Chrome 的真实值——模拟 Android 时漏传 `bitness` 会发出桌面的 `sec-ch-ua-bitness: "64"`。因此每个内置 UA 都配一份包含全部字段的完整 metadata，不依赖任何回退。`navigator.platform` 来自 `setUserAgentOverride` 的 `platform` 参数，不受 `metadata.platform` 影响，两者都要给。

模拟 Safari 类身份时不下发 `userAgentMetadata`。这是 Chromium 明确支持的能力（源码注释即为「模拟不发 UA client hints 的设备」），效果是全部 `sec-ch-ua-*` 头不出现，与真实 Safari 的请求头行为一致。硬边界是无法让 `navigator.userAgentData` 变为 `undefined`——该属性在 secure context 下始终存在，此时退化为 `brands: []`、`platform: ""`、`mobile: false`。

UA 与 viewport 的 `mobile` 相互独立，允许组合出不一致的值。保存时检测冲突并二次确认，列出实际会发出的 `sec-ch-ua-mobile` 与布局行为，说明指纹割裂风险，由用户确认后保存；不静默修正用户填写的值。
