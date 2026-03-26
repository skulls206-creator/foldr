/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import {
  NetworkFirst,
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

// ── Precaching ─────────────────────────────────────────────────────────────
// Workbox injects the build manifest here at compile time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Runtime caching ────────────────────────────────────────────────────────

// Auth + status: NetworkFirst with short timeout so offline shows cached state
registerRoute(
  ({ url }) => /\/api\/(auth\/me|status)$/.test(url.pathname),
  new NetworkFirst({
    cacheName: "api-auth",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// All other API routes: never serve from cache (mutations, file lists, etc.)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkOnly()
);

// Google Fonts CSS
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// Google Fonts files
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Periodic Background Sync ───────────────────────────────────────────────
// Fires on a browser-controlled schedule (Chrome Android; silent on desktop).
// The SW can't access the file system — it messages open window clients instead.
// If no window is open the event is a no-op; tab-open polling covers that gap.
self.addEventListener("periodicsync", (event: any) => {
  if (event.tag === "folder-sync") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: false,
  });
  clients.forEach((client) =>
    client.postMessage({ type: "BACKGROUND_SYNC_REQUESTED" })
  );
}

// ── Message handler ────────────────────────────────────────────────────────
// Lets the app communicate with the SW (e.g. skip waiting on new version)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Claim clients immediately on activation
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
