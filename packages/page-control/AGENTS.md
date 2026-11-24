# AGENTS.md

## Package Scope

- This package is the local page control service for the Chrome Ninja extension.
- The package name is `@chrome-ninja/page-control`; it lives under `packages/page-control`.
- It is a Node ESM service. `src/server/index.mjs` binds the default port, and `src/server.mjs` exports the server used by tests.
- It is separate from `@chrome-ninja/dev-bridge`. Do not add page scrolling, clicks, or other page operations to dev-bridge.
- Do not attach `chrome.debugger` or create tab groups from this service. The extension performs each action.
- Keep a single extension socket. A new connection replaces the previous one so a restarted service worker can reconnect. Do not add a multi-instance policy.

## Commands

- Start the service with `pnpm --filter @chrome-ninja/page-control dev`. Pass `-- --port <port>` or `PORT` when the default port is occupied, and build the extension with the same `VITE_CHROME_NINJA_PAGE_CONTROL_PORT`.
- Use `node --check packages/page-control/src/server.mjs` after editing the service.
- Run `pnpm exec vitest run packages/page-control/src/server.test.ts` for the HTTP contract.

## API Rules

- Bind to `127.0.0.1` and port `8788` unless `HOST`, `PORT`, or `--port` sets another address.
- Expose `POST /page-control` with a JSON array of actions. Supported actions are `scroll` (`x`, `y`, optional one of `selector`, `xpath`, or `ref`), `click` and `hover` (exactly one of `selector`, `xpath`, or `ref`), `fill` (that target plus string `value`), `select` (that target plus exactly one of string `value` or `label`), `press` (`key` of `Enter`, `Escape`, or `Tab`, optional target, optional boolean modifiers), `wait` (`until` of `load`, `selector`, or `text`; optional integer `timeout` from 1 to 7000, default 5000), `snapshot`, `screenshot`, `activate`, `navigation` (`url`, `newPage`), and `history` (`direction` of `back`, `forward`, or `reload`). Each of those requires a positive integer `tabId`. `tab-list` takes no `tabId` and rejects one. Run actions in order and stop at the first failure. Return a snapshot on `snapshot`. Return `screenshot` for one screenshot, or `screenshots` when a batch captures more than once. Return `tabId` for one tab opened by `navigation`, or `tabIds` when a batch opens more than one. Return `tabs` for one `tab-list`, or `tabLists` when a batch lists more than once. Each listed tab has `title`, `tabId`, `url`, and `active`.
- Fail immediately when no extension socket is open. Do not queue commands.
- Forward each action to the extension and return its result. Do not inspect or choose the target page here.
