# chrome-ninja

chrome ninja 是一个 pnpm workspace monorepo，包含 Chrome MV3 扩展本体和用于介绍扩展的创意橱窗站点。

## 项目结构

```text
chrome-ninja/
├── apps/
│   ├── extension/   # Chrome MV3 扩展：Vite + Preact + preact/compat
│   └── web/         # 插件介绍站点：Vite + Preact + Tailwind v4
└── packages/
    ├── types/       # 全局 ChromeNinja 命名空间类型
    ├── constants/   # 默认配置常量
    └── utils/       # 共享小工具
```

## 快速开始

```bash
pnpm install
pnpm dev
```

根级 `pnpm dev`、`pnpm build`、`pnpm preview` 默认只作用于 `@chrome-ninja/extension`。

extension UI 使用 Preact、`preact/compat` 和 `@preact/preset-vite`；Base UI、`react-router-dom`、`react-hook-form` 通过 compat 继续工作。web 站点本身也是 Preact。

`.npmrc` 关闭了 pnpm 的 peer 自动安装；安装时这些 React 生态库会提示缺少 React peer，这是预期状态，项目不安装 `react` / `react-dom` 运行时。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm style
pnpm commit
```

按包运行：

```bash
pnpm --filter @chrome-ninja/extension dev
pnpm --filter @chrome-ninja/extension build
pnpm --filter @chrome-ninja/web dev
pnpm --filter @chrome-ninja/web build
```

仓库目前没有配置测试运行器；验证以 `lint`、`typecheck`、按包 `build` 为准。

## 分层文档

- `apps/extension/README.md`：扩展本体入口、构建和加载方式。
- `apps/web/README.md`：介绍站点结构、开发服务和构建方式。
- `packages/README.md`：共享包职责和改动联动范围。

## 构建产物

- app 构建产物输出到各自目录下的 `dist`。
- TypeScript build info 写入 `node_modules/.tmp`。
- `dist`、`node_modules`、本地浏览器调试产物不应提交。
