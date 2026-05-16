# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT (cookie-based) with tokenVersion for session invalidation, TOTP 2FA
- **Storage**: Cloudflare R2 (`videostorage1` bucket) with server-side AES-256-GCM encryption (HKDF per-file key derivation from master key + fileId)
- **Frontend**: React 19 + Vite + Tailwind CSS + Radix UI + TanStack Query + Wouter

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

Custom hooks live in `src/custom-hooks.ts` (not regenerated by Orval). These cover endpoints added after the OpenAPI spec was last updated:
- `useToggleStarFile` — PATCH /api/files/:id/star
- `useListFolders` — GET /api/folders
- `useCreateFolder` — POST /api/folders
- `useDeleteFolder` — DELETE /api/folders/:id
- `useStorageUsage` — GET /api/files/usage → `{ usedBytes, limitBytes, fileCount }`
- `useAllShareLinks` — GET /api/files/share-links
- `useFileShareLinks` — GET /api/files/:id/share-links
- `useRevokeShareLink` — DELETE /api/files/share-links/:linkId
- `useRestoreFileVersion` — POST /api/files/:id/versions/:versionId/restore
- `useBulkDownloadFiles` — POST /api/files/bulk-download (triggers ZIP download via browser)
- `useLoginSessions` — GET /api/auth/sessions

The `File` schema includes `isStarred: boolean`, `folderId?: string | null`, and `thumbnailCid?: string | null`. `ListFilesParams` supports `starred?: boolean` and `folderId?: string`.

`ShareLink` interface: `{ id, fileId, fileName, token, url, expiresAt, maxViews, viewCount, downloadCount, label, createdAt }`.
`LoginSession` interface: `{ id, ipAddress, userAgent, createdAt }`.

### `artifacts/foldr-storage` (`@workspace/foldr-storage`)

React 19 + Vite frontend for the foldr.storage cloud drive UI.

**PWA (Progressive Web App)** — fully installable via `vite-plugin-pwa`:
- Service worker auto-generated by Workbox (`generateSW` strategy, `autoUpdate` registration)
- App shell (JS/CSS/HTML/SVG/fonts) precached for full offline load
- API routes use `NetworkOnly` (mutations) or `NetworkFirst` with 5-second timeout (auth/me, status)
- Google Fonts cached with `StaleWhileRevalidate` / `CacheFirst` long-expiry strategies
- `manifest.json` — standalone display with `window-controls-overlay`, 192 + 512 PNG icons, Upload shortcut
- `usePwaInstall` hook captures `beforeinstallprompt`; iOS tip shown on Safari/iPhone
- `?action=upload` URL shortcut opens upload modal immediately on launch

**Local Folder Sync (FSAA)** — Chrome/Edge only (File System Access API):
- `src/hooks/use-folder-sync.ts` — IndexedDB persistence of directory handle + metadata; bidirectional sync (upload local-newer, download cloud-newer, 5-second threshold); per-file progress state
- `src/components/sync/sync-widget.tsx` — sidebar widget with three states: unsupported browser notice, connect-folder button, active sync with progress bar

**Pages** — `src/pages/`:
- `dashboard.tsx` — main file browser with grid/list toggle, multi-select, right-click menus, row density, drag-and-drop upload
- `sharing.tsx` — sharing dashboard showing all share links with analytics (views, downloads), revoke + copy actions
- `activity.tsx` — activity log with CSV export button (`GET /api/activity/export`)
- `settings.tsx` — profile, 2FA (TOTP), login history (`GET /api/auth/sessions`), sign-out all sessions, delete account
- `trash.tsx`, `auth.tsx`, `share.tsx`, `shared-folder.tsx`

**New API endpoints (added manually)**:
- `GET /api/files/share-links` — all share links for user's files (with analytics)
- `GET /api/files/:id/share-links` — share links for a single file
- `DELETE /api/files/share-links/:linkId` — revoke a share link
- `GET /api/files/:id/thumbnail` — serves thumbnail (302 redirect to IPFS gateway)
- `POST /api/files/bulk-download` — ZIP archive of selected files
- `POST /api/files/:id/versions/:versionId/restore` — restore file to a past version
- `GET /api/auth/sessions` — recent login sessions (IP, user-agent, timestamp)
- `GET /api/activity/export` — CSV download of activity log

**Thumbnail generation** — on image upload, `sharp` generates a 300×300 JPEG thumbnail, uploaded to IPFS, and `thumbnailCid` stored in `filesTable`. `FileCard` and preview panel show thumbnails.

**Theme system** — `ThemeContext` persists to localStorage; 8 themes: `default` (Cyan/Glass), `windows` (Blue/Explorer), `cyberpunk` (Pink/Neon), `forest` (Green/Nature), `sunset` (Orange/Warm), `ocean` (Teal/Deep), `pearl` (Blue/Light — warm off-white light mode), `crimson` (Red/Bold — deep burgundy dark). Each applies a `theme-*` class to `<html>` with full CSS variable overrides. Settings shows a 2-col (mobile) / 4-col (desktop) grid of mini-preview cards.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
