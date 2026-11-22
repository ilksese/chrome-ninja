# AGENTS.md

## Package Boundary

- `packages/utils` exports small shared utilities (`cn`, `ninjaLog`) as TypeScript source.

## Checks

- Shared source packages have no build scripts; use root `pnpm typecheck` after changing exported types. The local `dev-bridge` service has its own `dev` and `start` scripts.
- The local `page-control` service also has its own `dev` and `start` scripts. It is not a shared source package and must not gain page-operation commands that belong on dev-bridge, or dev-bridge commands that belong on page control.
