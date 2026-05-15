# CHANGES.md — foldr Change Log

> Track every significant change so both AI agents stay in sync.
> Format: `YYYY-MM-DD | Agent | What changed`

## 2026-05-15

- **🥷 Satoshi** — Code review & GH Pages deployment setup
  - Reviewed full codebase quality assessment (see AGENTS.md for notes)
  - **`vite.config.ts`** — Made `PORT` optional for static builds via `STATIC_BUILD=true` flag, allowed `BASE_PATH` default for GH Pages
  - **`App.tsx`** — Added `setBaseUrl(import.meta.env.VITE_API_URL)` so production builds can point to `https://foldrstorage.replit.app`
  - **`package.json`** — Added `build:gh-pages` script (`STATIC_BUILD=true VITE_API_URL=https://foldrstorage.replit.app BASE_PATH=/foldr/ vite build`)
  - **`.github/workflows/deploy.yml`** — GH Pages deploy workflow: builds frontend, uploads artifact, deploys via `actions/deploy-pages`
  - **`CHANGES.md`** — Created this changelog

- **🥷 Satoshi** — Cloned repo from GitHub, read all .md files, created AGENTS.md for agent collaboration
- **Repo state:** Initial commit only (`fbcfcdd` — "Initial commit — foldr P2P encrypted storage app", March 26 2026)
- **Current stack:** pnpm monorepo, TypeScript, Express 5, React 19 + Vite, Drizzle ORM + PostgreSQL, Lighthouse.storage IPFS, Kavach encryption, Pinata fallback
- **Artifacts:** `api-server` (Express), `foldr-storage` (React PWA frontend), `mockup-sandbox`
