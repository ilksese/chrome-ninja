# Shared Packages

`packages/*` 是源码形式导出的共享包，供 apps 直接通过 workspace 依赖消费；这些包没有独立构建脚本。

## 包职责

- `@chrome-ninja/types`：导出 `src/index.d.ts`，提供全局 `ChromeNinja` 命名空间类型。
- `@chrome-ninja/constants`：导出默认扩展配置 `DEFAULT_OPTIONS`。
- `@chrome-ninja/utils`：导出 `cn`、`ninjaLog`、`wait` 等小工具。

## 改动规则

- 修改配置 shape 时，同时检查 `types`、`constants`、extension 设置 UI 和 content-script handler。
- 修改共享导出后，在根目录运行 `pnpm typecheck`。
- 共享包没有 `build` 或 `test` 脚本，不要按包发明命令。
