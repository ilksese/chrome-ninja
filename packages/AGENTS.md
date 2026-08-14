# AGENTS.md

## Package Boundary

- `packages/utils` exports small shared utilities (`cn`, `ninjaLog`) as TypeScript source.

## Checks

- Shared packages have no package-level scripts; use root `pnpm typecheck` after changing exported types.
