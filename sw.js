/* Service worker: makes the site usable offline, without ever serving a
 * stale version when the network is there.
 *
 * STRATEGY: network first, cache as fallback. The opposite choice (cache
 * first) would require bumping CACHE_NAME on every deployment, and a
 * slip would leave an old version installed on the phone
 * forever. The site is small and served from the Cloudflare network, so the
 * cost of a network round trip is negligible compared with that risk.
 *
 * ASSET VERSIONING (v7.82). Scripts and the stylesheet carry
 * ?v=VERSION in their URL, here as in index.html. The Worker returns these
 * URLs with a one-year Cache-Control: the browser therefore no longer refetches
 * the sixteen files on every open, it only refetches index.html, whose
 * URL does not change and which stays no-cache. A new version changes
 * the URLs, so the HTTP cache drops by itself. The VERSION below must
 * match the <meta name="app-version"> of index.html: tools/bump_version.mjs
 * writes both, and a test refuses to let them diverge.
 *
 * TWO TRAPS handled here:
 *  - The front door (worker/index.js) redirects to /login when the session
 *    has expired. A response coming from a redirect must NEVER enter the
 *    cache, otherwise the login page would be served instead of the
 *    application. We test response.redirected.
 *  - /login and /logout never go through the cache, otherwise login and
 *    logout stop working.
 */

const VERSION = "9.05";
const CACHE_NAME = "carnet-extraction";

const versioned = url => url + "?v=" + VERSION;

// The bare minimum to start offline. Order does not matter, each
// entry is cached independently: a single failing one does not make
// the install fail. Code files carry the version in their
// URL, the others (page, manifest, icons) do not: their URL never changes.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
].concat([
  "./css/base.css",
  "./css/screens.css",
  "./css/dialogs.css",
  "./css/finishing.css",
  /* The fonts. Without them in the precache, the first offline open
     shows the fallback then jumps to the real font once the network returns.
     Their URL carries no version: a font file never changes
     under the same name, a new one is published (see worker/index.js). */
  "./css/fonts/instrument-serif-latin.woff2",
  "./css/fonts/instrument-serif-latin-ext.woff2",
  "./css/fonts/manrope-latin.woff2",
  "./css/fonts/manrope-latin-ext.woff2",
  "./css/fonts/manrope-vietnamese.woff2",
  // No longer loaded by a script tag since v7.54, but still precached:
  // on-demand loading must work offline.
  "./js/vendor/chart.umd.js",
  "./js/tools.js",
  "./js/i18n.js",
  // Loaded on demand since v7.55, but precached so the language
  // switch also works offline.
  "./js/i18n.en.js",
  "./js/grind.js",
  "./js/recipes.js",
  // Loaded on demand since v7.56, precached so the demo works
  // offline like the rest of the site.
  "./js/demo-data.js",
  "./js/sync.js",
  "./js/data-csv.js",
  "./js/data-schema.js",
  "./js/data-store.js",
  "./js/data-calcs.js",
  "./js/data-migrations.js",
  "./js/data.js",
  "./js/tuning.js",
  "./js/charts.js",
  "./js/ui-core.js",
  "./js/ui-findings.js",
  "./js/ui-last-cup.js",
  "./js/ui-dashboard.js",
  "./js/ui-entry.js",
  "./js/ui-entry-aside.js",
  "./js/ui-pills.js",
  "./js/ui-chrono.js",
  "./js/ui-draft.js",
  "./js/ui-quick.js",
  "./js/ui-history.js",
  "./js/ui-journal.js",
  "./js/ui-guide.js",
  "./js/ui-catalog.js",
  "./js/ui-coffee-sheet.js",
  "./js/ui-brew.js",
  "./js/ui-drawings.js",
  "./js/app.js",
].map(versioned));

const NEVER_CACHED = ["/login", "/logout"];
const NAVIGATION_TIMEOUT_MS = 3000;

const isCacheable = response => response && response.ok && !response.redirected && response.type !== "opaque";

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_URLS.map(async url => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (isCacheable(response)) await cache.put(url, response);
          } catch (error) {
            // Offline at install time, or door closed: we retry on the
            // first online load, the fetch handler fills the
            // cache as it goes.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
      /* Files from a previous version have another URL: they will
         never be requested again, so we drop them to keep the cache from growing
         by a full set on every deployment. */
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      await Promise.all(keys.map(async req => {
        const v = new URL(req.url).searchParams.get("v");
        if (v !== null && v !== VERSION) await cache.delete(req);
      }));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHED.includes(url.pathname)) return;

  /* VERSIONED FILES (?v=): CACHE FIRST (v8.72). They are immutable by
     contract (same URL, same content), no need to wait for the network, nor
     to rewrite them into the cache on every open. */
  if (url.searchParams.has("v")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheable(response)) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        /* NAVIGATION: THREE SECONDS AT MOST (v8.72). On a weak network, the page
           waited for the network without limit before falling back to the cache, and
           the loading veil stayed up for tens of seconds. */
        const response = request.mode === "navigate"
          ? await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NAVIGATION_TIMEOUT_MS)),
          ])
          : await fetch(request);
        // A redirect to /login means the session expired: we let it
        // through as is so the user logs in again, and above all we
        // cache nothing.
        if (isCacheable(response)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // First the exact URL (version included), then without parameters:
        // offline, a file from a neighbouring version beats a blank screen.
        const exact = await caches.match(request);
        if (exact) return exact;
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Offline navigation with no exact match: fall back on the
        // app shell, everything else lives locally anyway.
        if (request.mode === "navigate") {
          // "./" first: Cloudflare redirects /index.html to /, and a
          // redirected response is never cached.
          const shell = (await caches.match("./")) || (await caches.match("./index.html"));
          if (shell) return shell;
        }
        throw error;
      }
    })()
  );
});
