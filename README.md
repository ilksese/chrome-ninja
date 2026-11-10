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
    ├── hmr/         # 本地 HMR/debug 服务
    └── utils/       # 共享小工具
```

## 快速开始

```bash
pnpm install
pnpm dev
```

根级 `pnpm dev`、`pnpm build`、`pnpm preview` 默认只作用于 `@chrome-ninja/extension`。

extension 的扩展弹窗与选项页使用 Preact、`preact/compat` 和 `@preact/preset-vite`；Base UI、`react-router-dom`、`react-hook-form` 通过 compat 工作。网页内界面使用 VanJS 和共享浅色主题组件，直接挂载到网页 DOM。web 站点使用 Preact。

`.npmrc` 关闭了 pnpm 的 peer 自动安装；安装时这些 React 生态库会提示缺少 React peer，这是预期状态，项目不安装 `react` / `react-dom` 运行时。

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
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

Vitest 覆盖共享包、扩展后台、网页内界面和介绍站点；扩展相关测试可运行 `pnpm test --project extension --project extension-ui`。提交前运行相关测试、`lint`、`typecheck` 和按包 `build`。

Cookie 编辑器由扩展弹窗入口打开当前网页中的可拖动、可调整大小面板，支持查询、新增、显式保存修改和持续禁用。禁用规则持久保存在后台；取消禁用恢复最后可观测且仍有效的版本。能力与平台边界见 [扩展说明](apps/extension/README.md#cookie-编辑器)。

## 分层文档

- `apps/extension/README.md`：扩展本体入口、构建和加载方式。
- `apps/web/README.md`：介绍站点结构、开发服务和构建方式。
- `packages/README.md`：共享包职责和改动联动范围。

## 构建产物

- app 构建产物输出到各自目录下的 `dist`。
- TypeScript build info 写入 `node_modules/.tmp`。
- `dist`、`node_modules`、本地浏览器调试产物不应提交。
