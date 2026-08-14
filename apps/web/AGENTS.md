# AGENTS.md

## App Boundary

- This is the creative showcase site for the extension, not the extension runtime.
- Stack is Vite 6 + Preact + Tailwind v4 via `@tailwindcss/vite`.
- Entry is `src/main.tsx`; page composition starts in `src/App.tsx` and sections live in `src/sections`.
- The app alias is only `@` -> `src`.

## UI Conventions

- shadcn-style primitives are local Preact components under `src/components/ui`; do not import React shadcn components directly.
- react-bits-style effects are local Preact components under `src/components/reactbits`; avoid adding a React-only dependency unless Preact compatibility is verified.
- Icons use `lucide-preact`.
- Tailwind v4 tokens and keyframes are defined in `src/index.css`, not a Tailwind config file.

## Dev Server And Checks

- Use pm2 for local dev servers, for example `pm2 start 'pnpm exec vite --host 127.0.0.1 --port 5173' --name 'dev:web'`.
- Run `pnpm --filter @chrome-ninja/web lint` and `pnpm --filter @chrome-ninja/web typecheck` for source edits.
- Run `pnpm --filter @chrome-ninja/web build` when touching Vite config, CSS tokens, assets, or production-facing layout.
