# Shared Packages

`packages/*` 是源码形式导出的共享包和本地开发服务包，供 apps 直接通过 workspace 依赖消费；这些包没有独立构建脚本。

## 包职责

- `@chrome-ninja/utils`：导出 `cn`、`ninjaLog` 等小工具。
- `@chrome-ninja/dev-bridge`：本地开发重载与调试桥，供扩展在开发期连接并自动打开 Popup。
- `@chrome-ninja/page-control`：本地页面控制服务。扩展开启后主动连接，服务按顺序转发操作数组。

## 改动规则

- 修改共享导出后，在根目录运行 `pnpm typecheck`。
- 共享包没有 `build` 或 `test` 脚本，不要按包发明命令。
- `dev-bridge` 与 `page-control` 是本地服务，各自有 `dev` 和 `start` 脚本。
