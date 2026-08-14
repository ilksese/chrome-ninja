# Shared Packages

`packages/*` 是源码形式导出的共享包，供 apps 直接通过 workspace 依赖消费；这些包没有独立构建脚本。

## 包职责

- `@chrome-ninja/utils`：导出 `cn`、`ninjaLog` 等小工具。

## 改动规则

- 修改共享导出后，在根目录运行 `pnpm typecheck`。
- 共享包没有 `build` 或 `test` 脚本，不要按包发明命令。
