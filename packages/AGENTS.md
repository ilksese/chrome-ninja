# AGENTS.md

## Package Boundary

- `packages/types` exports only `src/index.d.ts` and provides the global `ChromeNinja` namespace.
- `packages/constants` exports default option values and depends on `@chrome-ninja/types`.
- `packages/utils` exports small shared utilities (`cn`, `ninjaLog`, `wait`) as TypeScript source.

## Checks

- Shared packages have no package-level scripts; use root `pnpm typecheck` after changing exported types or constants.
- If option shape changes, update `packages/types`, `packages/constants`, extension settings UI, and content-script handlers together.
