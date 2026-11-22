# AGENTS.md

## Package Scope

- This package is the local reload and debug bridge for the Chrome Ninja extension.
- The package name is `@chrome-ninja/dev-bridge`; it lives under `packages/dev-bridge` in the workspace.
- It is a Node ESM service with the entry point `src/server/index.mjs`.
- Extension-side bridge code is exported from `@chrome-ninja/dev-bridge/client`, including `DEV_BRIDGE_ENABLED`, which the extension uses to set its toolbar badge.
- Shared message types and constants are exported from `@chrome-ninja/dev-bridge/protocol`.
- Development backgrounds focus the last focused normal Chrome window and open its action popup on their first service connection and after client or tab reloads. Chrome requires an active target window; focus it before passing its ID to `openPopup`. Reconnecting the same background does not open it again.
- It is for local development only. Do not design it as a production remote-control surface.

## Commands

- Start the service with `pnpm --filter @chrome-ninja/dev-bridge dev`. Pass `-- --port <port>` or `PORT` when the default port is occupied.
- There is no package-local lint, typecheck, or test script at the moment.
- Use `node --check packages/dev-bridge/src/server/index.mjs` from the repo root for a basic syntax check after editing the service.
- Extension-side protocol changes should be checked with `pnpm --filter @chrome-ninja/extension lint`.
- Check extension-side changes with `pnpm --filter @chrome-ninja/extension typecheck` and `pnpm --filter @chrome-ninja/extension build`.

## Debug API Rules

- Prefer the CSP-safe `POST /command` API over `POST /execute` for new workflows.
- Keep command names generic and low-level.
- Allowed first-class command families are storage, tabs, and DOM query primitives.
- Do not add module-specific commands like `boss:*` or `options:*`.
- Do not make this service understand feature-specific storage schemas. Use generic JSON payloads and let callers compose them.
- Do not add arbitrary JavaScript execution paths beyond the existing legacy `/execute` endpoint.
- Do not add broad forwarding APIs such as `runtime:send-message` or `tabs:send-message` without explicit review.
- Do not add DOM interaction commands such as click, fill, or upload; use Chrome DevTools MCP or Playwright for page interactions.

## Command API Shape

- `POST /command` sends `dev-bridge:command` through the connected background service worker.
- Supported targets are `background`, `content`, `popup`, and `options`.
- Current supported commands are `storage:get`, `storage:set`, `tabs:query`, `tabs:reload`, and `dom:query`.
- `storage:get`, `storage:set`, `tabs:query`, and `tabs:reload` execute in the background service worker.
- `dom:query` executes in connected client contexts and must not use `eval`.
- Return only JSON-serializable data.

## Safety Boundaries

- Keep the default bind host as `127.0.0.1`.
- Validate request bodies before sending messages to the extension.
- Keep response payloads compact and avoid returning full Chrome tab objects or large DOM content.
- `dom:query` should remain selector-based, with bounded selector count and text length.
- `storage:set` may support generic deep merge, but it must not encode application-specific option logic.

## Generated Output

- Do not commit logs, temporary curl output, browser artifacts, or local debug captures.
- Do not commit `.codegraph/**` or other local indexing/debug artifacts.
