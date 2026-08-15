# AGENTS.md

## Package Scope

- This package is the local HMR and debug service for the Chrome Ninja extension.
- The package name is `@chrome-ninja/hmr`; it currently lives under `packages/hmr` in the workspace.
- It is a Node ESM service with the entry point `src/server/index.mjs`.
- Extension-side HMR bridge code is exported from `@chrome-ninja/hmr/client`.
- Shared HMR message types and constants are exported from `@chrome-ninja/hmr/protocol`.
- It is for local development only. Do not design it as a production remote-control surface.

## Commands

- Start the service with `pnpm --filter @chrome-ninja/hmr dev`.
- There is no package-local lint, typecheck, or test script at the moment.
- Use `node --check packages/hmr/src/server/index.mjs` from the repo root for a basic syntax check after editing the service.
- Extension-side protocol changes should be checked with `pnpm --filter @chrome-ninja/extension lint`.
- `pnpm --filter @chrome-ninja/extension typecheck` and `build` may currently fail on the repo's existing Vite 5/6 `PluginOption` type conflict in `apps/extension/vite.config.ts`; report that separately from HMR changes.

## Debug API Rules

- Prefer the CSP-safe `POST /command` API over `POST /execute` for new workflows.
- Keep command names generic and low-level.
- Allowed first-class command families are storage, tabs, and DOM query primitives.
- Do not add module-specific commands like `baidu:*`, `bilibili:*`, `boss:*`, or `options:*`.
- Do not make this service understand feature-specific storage schemas. Use generic JSON payloads and let callers compose them.
- Do not add arbitrary JavaScript execution paths beyond the existing legacy `/execute` endpoint.
- Do not add broad forwarding APIs such as `runtime:send-message` or `tabs:send-message` without explicit review.
- Do not add DOM interaction commands such as click, fill, or upload; use Chrome DevTools MCP or Playwright for page interactions.

## Command API Shape

- `POST /command` sends `hmr:command` through the connected background service worker.
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
