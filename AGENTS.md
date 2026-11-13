# AGENTS.md

## Repo Shape

- pnpm workspace: apps live in `apps/*`, shared packages live in `packages/*`.
- Root `pnpm dev`, `pnpm build`, and `pnpm preview` target only `@chrome-ninja/extension`; run web commands with `pnpm --filter @chrome-ninja/web ...`.
- Extension popup and options pages use Preact + `preact/compat` + `@preact/preset-vite`; Base UI, `react-router-dom`, and `react-hook-form` work through compat.
- Content UI uses VanJS + native inline styles; follow `apps/extension/AGENTS.md` when adding or changing UI injected into webpages.
- Shared packages are consumed as TypeScript source through `exports`; they do not have build scripts.
- Do not read `.env*` files.

## Browser Compatibility

- Target only the latest stable Chrome release, following new stable releases rather than pinning a version.
- Use web platform and extension APIs supported by that release directly; compatibility fallbacks and polyfills for older Chrome versions or other browsers are out of scope.

## Commands

- Install with `pnpm install`; the repo pins pnpm in `packageManager`.
- `.npmrc` sets `auto-install-peers=false`; React peer warnings from Base UI/router/form are expected, do not add `react` or `react-dom` back.
- Whole repo checks: `pnpm lint` then `pnpm typecheck`.
- Extension focused checks: `pnpm --filter @chrome-ninja/extension lint`, `pnpm --filter @chrome-ninja/extension typecheck`, `pnpm --filter @chrome-ninja/extension build`.
- Web focused checks: `pnpm --filter @chrome-ninja/web lint`, `pnpm --filter @chrome-ninja/web typecheck`, `pnpm --filter @chrome-ninja/web build`.
- Vitest is configured at the root. Run `pnpm test`; limit extension checks with `--project extension --project extension-ui` when appropriate.

## Dev Debugging/Popup Debugging

- Open `chrome-extension://<id>/index.html` in a normal browser tab — that page is the extension popup, so it can be debugged like any web page (`<id>` is the extension ID from `chrome://extensions`).

## Generated And Ignored Output

- Build output is `dist` under the app being built; keep it out of commits.
- TypeScript build info is written under `node_modules/.tmp`; keep it out of commits.
- Do not commit `.codegraph/**`, `.playwright*`, `web-full.png`, or other local browser/debug artifacts.

## Style And Tooling

- ESLint is flat config in `eslint.config.js`; it ignores only `dist`.
- Root `pnpm style` formats only `apps/**/*.{ts,tsx}` and `packages/**/*.{ts,tsx}`.
- Prefer existing aliases inside apps: extension has `@`, `@assets`, `@components`, `@hooks`, `@store`; web has only `@`.

## Documentation Sync

- Whenever the codebase changes, immediately trace and update all affected documentation that describes or references the changed code, including `AGENTS.md`, README files, and linked documents. Complete these updates in the same change before reporting the work done.
- Describe the latest implemented codebase in the present tense. Replace or remove stale descriptions, paths, and references instead of appending correction notes.
- Documentation must not retain or introduce obsolete logic, migration narratives, or intermediate implementation states. Keep descriptions consistent across documents and verify referenced paths and symbols against the current code.

## Agent skills

### Issue tracker

需求、规格和任务使用 `.scratch/` 下的本地 Markdown；读写任务前先读 `docs/agents/issue-tracker.md`。

### Triage labels

分诊使用五个默认角色；设置或解释分诊状态前先读 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context；探索代码前先读 `docs/agents/domain.md`，按其规则加载词汇表和 ADR。
