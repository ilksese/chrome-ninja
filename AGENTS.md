# AGENTS.md

## Repo Shape

- pnpm workspace: apps live in `apps/*`, shared packages live in `packages/*`.
- Root `pnpm dev`, `pnpm build`, and `pnpm preview` target only `@chrome-ninja/extension`; run web commands with `pnpm --filter @chrome-ninja/web ...`.
- Extension UI uses Preact + `preact/compat` + `@preact/preset-vite`; Base UI, `react-router-dom`, and `react-hook-form` work through compat.
- Shared packages are consumed as TypeScript source through `exports`; they do not have build scripts.
- Do not read `.env*` files.

## Commands

- Install with `pnpm install`; the repo pins pnpm in `packageManager`.
- `.npmrc` sets `auto-install-peers=false`; React peer warnings from Base UI/router/form are expected, do not add `react` or `react-dom` back.
- Whole repo checks: `pnpm lint` then `pnpm typecheck`.
- Extension focused checks: `pnpm --filter @chrome-ninja/extension lint`, `pnpm --filter @chrome-ninja/extension typecheck`, `pnpm --filter @chrome-ninja/extension build`.
- Web focused checks: `pnpm --filter @chrome-ninja/web lint`, `pnpm --filter @chrome-ninja/web typecheck`, `pnpm --filter @chrome-ninja/web build`.
- There is no configured test runner in this repo; do not invent `pnpm test` as a verification step.

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
