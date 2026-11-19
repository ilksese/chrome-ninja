# 测试

使用 Vitest 4.1.12、Preact Testing Library 和 jsdom。Vite 在 workspace 中统一为 6.4.3（包括传递依赖），不要单独升级某个应用的 Vite。当前测试依赖支持 Node 20、22 和 24+；建议使用仓库验证过的 Node 22.23.2。

## 命令

从仓库根目录执行：

```sh
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test --project extension
pnpm test --project extension-ui
pnpm test --project web
pnpm test --project packages
```

覆盖率输出到 `coverage/`，包含终端摘要、HTML 和 LCOV。初期不设置全仓覆盖率门槛；优先覆盖高风险逻辑和错误分支。

## 用例位置与环境

| 路径                                 | Project        | 环境           |
| ------------------------------------ | -------------- | -------------- |
| `packages/**/*.test.ts`              | `packages`     | Node           |
| `apps/extension/tests/**/*.test.ts`  | `extension`    | Node           |
| `apps/extension/tests/**/*.test.tsx` | `extension-ui` | jsdom + Preact |
| `apps/web/tests/**/*.test.{ts,tsx}`  | `web`          | jsdom + Preact |

根目录 `vitest.config.ts` 独立于应用构建配置，不加载 CRX、manifest 扫描、Tailwind 或开发 HMR 插件。各应用测试保留自己的源码别名；UI 测试使用 Preact compat，不安装 React/React DOM。

DOM 测试通过 `tests/setup-dom.ts` 注册 jest-dom 断言并在每个用例后清理 DOM。使用 Testing Library 按角色、名称查询元素，测试可观察的交互行为，不依赖组件内部状态或大面积快照。

Chrome API 在用例中通过 `vi.stubGlobal` 按需模拟；不要创建覆盖全部 API 的通用模拟层。模拟会在用例之间自动恢复，订阅和其他外部资源仍需由用例主动清理。

现有 `apps/extension/scripts/check-element-copy.mjs` 保持独立，不由 `pnpm test` 自动执行；其中的回归断言迁移完成前仍应保留。

## 测试边界

jsdom 不验证真实排版、扩展权限、manifest、脚本注入、剪贴板权限或 MV3 service worker 生命周期。当前未接入浏览器 E2E，单元和组件测试通过不代表扩展集成验证通过。
