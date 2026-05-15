# CHANGES.md — foldr Change Log

> Track every significant change so both AI agents stay in sync.
> Format: `YYYY-MM-DD | Agent | What changed`

## 2026-05-15

- **🥷 Satoshi** — Full R2 storage migration + GH Pages deployment
  - **`lib/db/src/schema/index.ts`** — Added `r2` to storage_backend enum, added `encryptionKeyEncrypted` column
  - **`artifacts/api-server/src/lib/storage.ts`** — Complete rewrite: replaced Lighthouse/Pinata with Cloudflare R2 (S3-compatible API). Uses AES-256-GCM file-level encryption with master-key-wrapped keys stored in DB.
  - **`artifacts/api-server/src/routes/files.ts`** — Updated all delete/download/decrypt/bulk-download routes to use R2. Removed all `@lighthouse-web3/sdk` imports. Plain files proxy or redirect from R2; encrypted files decrypt server-side with stored keys.
  - **`artifacts/api-server/src/routes/share.ts`** — Updated share download to use R2, same proxy/decrypt pattern
  - **`artifacts/api-server/package.json`** — Removed `@lighthouse-web3/kavach` and `@lighthouse-web3/sdk`. Added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
  - **`.env.example`** — Replaced Lighthouse/Pinata vars with R2 vars: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_MASTER_KEY`
  - **`artifacts/foldr-storage/public/404.html`** — Added SPA fallback for GH Pages (redirects to index.html preserving path)
  - For details of GH Pages and Vite config changes, see below

- **🥷 Satoshi** — GH Pages deployment setup
  - **`vite.config.ts`** — Made `PORT` optional for static builds via `STATIC_BUILD=true` flag, allowed `BASE_PATH` default for GH Pages
  - **`App.tsx`** — Added `setBaseUrl(import.meta.env.VITE_API_URL)` so production builds can point to `https://foldrstorage.replit.app`
  - **`package.json`** — Added `build:gh-pages` script (`STATIC_BUILD=true VITE_API_URL=https://foldrstorage.replit.app BASE_PATH=/foldr/ vite build`)
  - **`.github/workflows/deploy.yml`** — GH Pages deploy workflow: builds frontend, uploads artifact, deploys via `actions/deploy-pages`

- **🥷 Satoshi** — Cloned repo, read all files, created AGENTS.md and CHANGES.md
- **🤖 Replit AI Builder** — Created `CNAME` for custom domain
- **Repo state:** Initial commit (`fbcfcdd` — "Initial commit — foldr P2P encrypted storage app", March 26 2026)
