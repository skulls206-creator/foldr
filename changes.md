# FOLDR — Changelog

> Also see `AGENTS.md` for how both AI agents collaborate on this project.

## Unreleased / In Development

### Security Audit — API Auth & Short-Lived Downloads
- Verified all `/api/files`, `/api/folders`, `/api/activity` routes are gated by `requireAuth` middleware — confirmed via `curl` that unauthenticated requests return 401
- Verified share routes (`/api/share/:token`, `/api/shared-folder/:token`) validate tokens server-side with expiry + max-view checks via `resolveShareLink`
- **R2 download URLs are now presigned with a 15-minute expiry** (`PRESIGNED_URL_TTL_SECONDS = 900` in `storage.ts`) — previously returned a permanent public-bucket URL. Caps the leak window if a URL appears in logs, browser history, or referrer headers
- `downloadUrl()` signature changed to `async` — call sites in `files.ts` (3) and `share.ts` (2) updated to `await`
- `/share/:token` response no longer exposes the file owner's `userId` — prevents share recipients from enumerating ownership
- New dep: `@aws-sdk/s3-request-presigner` for generating time-limited GET URLs

### Live Site ↔ Backend Connected
- `VITE_API_URL` GitHub Actions secret set to `https://foldr.khurk.services` (the deployed Replit autoscale production URL)
- Rebuilt via `workflow_dispatch` — Pages build now bakes the API URL into the static frontend so `khurk.xyz` can log in, list files, and upload against the live backend
- Verified `GET /api/healthz` returns 200 and CORS allowlist correctly echoes `https://khurk.xyz` on cross-origin requests

### GitHub Pages Deployment
- Added `.github/workflows/deploy-pages.yml` — automated build and deploy to GitHub Pages on every push to `main`
- Build injects `VITE_API_URL` from a GitHub Actions secret so the static frontend calls the live Replit API
- Added `artifacts/foldr-storage/public/CNAME` with custom domain `khurk.xyz`

### Cross-Origin API Routing
- `App.tsx` calls `setBaseUrl(import.meta.env.VITE_API_URL ?? null)` at startup — all API calls automatically route to the deployed backend when built for GitHub Pages, and stay relative (same-origin) in Replit dev
- All raw `fetch()` and `XMLHttpRequest` calls in `use-folder-sync.ts` and `activity.tsx` replaced with `customFetch` so the base URL and Bearer-token fallback apply consistently across origins

### CORS Hardening
- `api-server/src/app.ts`: replaced `origin: true` with an explicit allowlist function
- Permitted origins: `skulls206-creator.github.io`, `khurk.xyz`, `www.khurk.xyz`, `*.replit.dev`, `*.replit.app`, `*.repl.co`
- No-origin requests (server-to-server, curl) still pass through

### Build Config
- `vite.config.ts`: `PORT` and `BASE_PATH` now have safe defaults (`3000` and `/`) so CI builds don't throw when those env vars aren't set
- `runtimeErrorOverlay` plugin guarded behind `REPL_ID` check — Replit-only, excluded from GitHub Actions builds

---

## v0.4 — Multi-File Upload

### Multi-File Upload (iOS + all platforms)
- Root cause fixed: `multiple: false` was hardcoded in the dropzone — changed to `multiple: true` (fixes iOS photo picker, Android, and desktop Ctrl+click)
- `upload-modal.tsx` fully rewritten with a queue-based flow (`QueuedFile[]` state)
- Per-file status rows: pending / uploading / done / error with `CheckCircle2`, `XCircle`, `Loader2` icons
- Cumulative storage-limit pre-flagging via `wouldExceedSet` (`useMemo`) — simulates the upload loop in queue order to warn before uploading, not just after failure
- Sequential upload loop with active-file progress bar and run-scoped counter ("Uploading 2 of 5…")
- "Add more files" button — always-mounted hidden `<input>` keeps `openPicker` working regardless of UI branch
- Retry: "Retry N failed" button resets error items to pending and re-runs; enabled only when there are errors
- Dedup by `name + size + lastModified` — correctly allows same-name/different-content files
- Auto-close after 900 ms on full success; stays open with error summary on any failure
- `use-upload.ts`: added `silent` option to suppress per-file toasts during batch uploads

### Copy / Branding
- Encrypt badge now reads "AES-256-GCM encryption — only you can access your files"
- Security info box updated: "AES-256-GCM before uploading to Cloudflare R2" (removes all Kavach/IPFS references)

---

## v0.3 — Pearl & Crimson Themes

- Two new colour themes added: Pearl (light) and Crimson (dark red accent)
- Theme switcher updated to include both options

---

## v0.2 — Cloudflare R2 Storage Backend

- Migrated file storage from IPFS to Cloudflare R2 with AES-256-GCM / HKDF per-file encryption
- Encryption key derivation: `HKDF(masterKey, fileId, "r2-file-encryption-v1")` → 32-byte AES key; IV = bytes[0:12], authTag = bytes[12:28], ciphertext = bytes[28:]
- Legacy IPFS files preserved for backward compatibility
- `/api/status` returns `{"backend":"r2"}`
- R2 object key layout: plain → `files/<uuid>`, encrypted → `encrypted/<fileId>`, thumbnails → plain UUID

---

## v0.1 — FOLDR Rebrand + PWA Maximisation

### Rebrand
- All UI text updated to "FOLDR" (all-caps brand)
- `localStorage` auth key intentionally kept as `foldr-auth-token` to preserve existing sessions

### PWA
- Lighthouse PWA score maximised: added `screenshots` (wide 1280×720 + narrow 390×844), `id`, `share_target`, `protocol_handlers`, `launch_handler`, `edge_side_panel`, `prefer_related_applications` to `manifest.json`
- Push notification handler added to service worker (`sw.ts`)
- Auth form `autocomplete` attributes fixed

### Icons
- New crystal folder (amethyst) logo family: 1024px master, 512px, 192px, 180px (apple-touch-icon), 64px, 32px (favicon)
- All PWA icon slots filled with the new crystal folder design
