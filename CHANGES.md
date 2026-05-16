# CHANGES.md — foldr Change Log

> Track every significant change so both AI agents stay in sync.
> Format: `YYYY-MM-DD | Agent | What changed`

## 2026-05-16

- **🥷 Satoshi** — Conflict prep: removed `deploy.yml`, tightened CORS, synced with Replit AI Builder's changes
  - **Removed `.github/workflows/deploy.yml`** — Replit AI Builder created `deploy-pages.yml` with a better name; let that be the canonical workflow
  - **`artifacts/api-server/src/app.ts`** — CORS now explicitly allows: `localhost`, Replit domains (`*.replit.dev`, `*.replit.app`), `khurk.xyz`, `*.github.io`, and any custom origins in `CORS_ORIGINS` env var. Falls back to wide open for safety.
  - **Ready for merge** — when Replit AI Builder pulls/rebase on top of `bdc9911`, the only overlap areas are `vite.config.ts` and `App.tsx` (both AI added similar VITE_API_URL handling — will merge cleanly)

## 2026-05-15

- **🥷 Satoshi** — Full R2 storage migration + GH Pages deployment
  - **`lib/db/src/schema/index.ts`** — Added `r2` to storage_backend enum, added `encryptionKeyEncrypted` column
  - **`artifacts/api-server/src/lib/storage.ts`** — Complete rewrite: replaced Lighthouse/Pinata with Cloudflare R2 (S3-compatible API). Uses AES-256-GCM file-level encryption with master-key-wrapped keys stored in DB.
  - **`artifacts/api-server/src/routes/files.ts`** — Updated all delete/download/decrypt/bulk-download routes to use R2. Removed all `@lighthouse-web3/sdk` imports.
  - **`artifacts/api-server/src/routes/share.ts`** — Updated share download to use R2
  - **`artifacts/api-server/package.json`** — Removed Lighthouse/Pinata/ethers deps, added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
  - **`.env.example`** — Replaced Lighthouse/Pinata vars with R2 vars
  - **`artifacts/foldr-storage/public/404.html`** — Added SPA fallback for GH Pages
  - **`artifacts/foldr-storage/vite.config.ts`** — Made PORT optional via `STATIC_BUILD=true` flag

- **🥷 Satoshi** — GH Pages deployment setup
  - **`App.tsx`** — Added `setBaseUrl(VITE_API_URL)` and SPA redirect handler for GH Pages deep links
  - **`artifacts/foldr-storage/package.json`** — Added `build:gh-pages` script
  - Created AGENTS.md and CHANGES.md for AI collaboration
  - CNAME — other AI created this

- **🤖 Replit AI Builder** — Created CNAME for custom domain, set up initial deploy-pages.yml, CORS config

- **Repo state:** Initial commit (`fbcfcdd` — Mar 26 2026)
