# CODING-NOTES — foldr

## What This Project Is
P2P encrypted file storage — IPFS-powered, privacy-first.

## Tech Stack
- pnpm monorepo
- React 19 + Vite + Tailwind v4 + PWA (vite-plugin-pwa)
- TypeScript (strict: false — need to enable)
- Shared libs: db, api-client-react, api-zod, api-spec

## Structure
```
/
├── artifacts/
│   └── foldr-storage/   # Main app (React + Vite + PWA)
├── lib/
│   ├── db/
│   ├── api-client-react/
│   ├── api-zod/
│   └── api-spec/
└── package.json
```

## Build & Dev
- **Install:** `pnpm install`
- **Build:** `pnpm run build`
- **Typecheck:** `pnpm run typecheck`
- **Dev:** `cd artifacts/foldr-storage && pnpm run dev`

## Deploy
- GitHub Pages via `.github/workflows/deploy-pages.yml`

## TypeScript
- Root: strict: false. Enable strict: true in root + all lib tsconfigs.
- Project references (tsc --build)

## Tests & Lint
- None configured

## Known Gotchas
- pnpm required. Preinstall enforces it.
- PWA service worker can cache stale assets — clear SW in dev tools during development.
- Lib changes require rebuilding libs first (tsc --build from root).

## Previous Bugs / Regressions
*(Fill in as they happen)*
