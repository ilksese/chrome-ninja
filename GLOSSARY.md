# Chrome Ninja

Chrome Ninja 浏览器扩展中各类用户界面的边界与 Cookie 管理术语。

## Language

**网页内界面（Content UI）**：
扩展在用户正在访问的网页中展示的界面，包括功能面板、划词翻译卡片、视频操作按钮和操作结果提示。
_Avoid_: Content Page、content page ui

**扩展弹窗（Popup）**：
用户点击浏览器工具栏中的扩展图标后打开的界面。

**选项页（Options Page）**：
扩展用于集中管理功能配置的独立页面。

**Cookie 编辑器**：
用于查询与管理 Cookie 的功能面板。

**Cookie 禁用**：
持续使指定 Cookie 停止在浏览器中生效，同时保留其最新可观测内容与属性以供取消禁用时恢复的操作。
_Avoid_: 删除（指可恢复操作时）

**Cookie 禁用规则**：
针对一条确定身份的 Cookie 持续保留的禁用约定，即使该 Cookie 暂时不存在也仍然有效。

**取消禁用**：
解除 Cookie 禁用规则，并在最新可观测版本仍有效时恢复该版本的操作。
_Avoid_: 恢复原始快照
