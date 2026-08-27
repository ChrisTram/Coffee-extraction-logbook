/* Service worker : rend le site utilisable hors ligne, sans jamais servir une
 * version perimee quand le reseau est la.
 *
 * STRATEGIE : reseau d'abord, cache en secours. Le choix inverse (cache
 * d'abord) obligerait a incrementer CACHE_NAME a chaque deploiement, et un
 * oubli laisserait une vieille version installee sur le telephone pour
 * toujours. Le site est petit et servi depuis le reseau Cloudflare, donc le
 * cout d'un aller retour reseau est negligeable devant ce risque.
 *
 * DEUX PIEGES traites ici :
 *  - La porte d'entree (worker/index.js) redirige vers /login quand la session
 *    a expire. Une reponse issue d'une redirection ne doit JAMAIS entrer dans
 *    le cache, sinon la page de connexion se retrouverait servie a la place de
 *    l'application. On teste response.redirected.
 *  - /login et /logout ne passent jamais par le cache, sinon la connexion et
 *    la deconnexion cessent de fonctionner.
 */

const CACHE_NAME = "carnet-extraction";

// Le strict necessaire pour demarrer hors ligne. L'ordre n'importe pas, chaque
// entree est mise en cache independamment : une seule qui echoue ne fait pas
// echouer l'installation.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  // Plus chargée par une balise script depuis la v7.54, mais toujours précachée :
  // le chargement à la demande doit fonctionner hors ligne.
  "./js/vendor/chart.umd.js",
  "./js/i18n.js",
  // Chargé à la demande depuis la v7.55, mais précaché pour que la bascule de
  // langue fonctionne aussi hors ligne.
  "./js/i18n.en.js",
  "./js/grind.js",
  "./js/recettes.js",
  "./js/demo-data.js",
  "./js/sync.js",
  "./js/data.js",
  "./js/reglages.js",
  "./js/charts.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const NEVER_CACHED = ["/login", "/logout"];

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
            // Hors ligne a l'installation, ou porte fermee : on reessaiera au
            // premier chargement en ligne, le gestionnaire fetch remplit le
            // cache au fur et a mesure.
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
      const noms = await caches.keys();
      await Promise.all(noms.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
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

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        // Une redirection vers /login veut dire session expiree : on la laisse
        // passer telle quelle pour que l'utilisateur se reconnecte, et on ne
        // met surtout rien en cache.
        if (isCacheable(response)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const enCache = await caches.match(request, { ignoreSearch: true });
        if (enCache) return enCache;
        // Navigation hors ligne sans correspondance exacte : on retombe sur la
        // coquille de l'application, tout le reste vit en local de toute facon.
        if (request.mode === "navigate") {
          const coquille = await caches.match("./index.html");
          if (coquille) return coquille;
        }
        throw error;
      }
    })()
  );
});
