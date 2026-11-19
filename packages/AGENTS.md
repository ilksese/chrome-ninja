# AGENTS.md

## Package Boundary

- `packages/utils` exports small shared utilities (`cn`, `ninjaLog`) as TypeScript source.

## Checks

- Shared source packages have no build scripts; use root `pnpm typecheck` after changing exported types. The local `dev-bridge` service has its own `dev` and `start` scripts.
