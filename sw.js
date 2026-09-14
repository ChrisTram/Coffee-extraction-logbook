/* Service worker : rend le site utilisable hors ligne, sans jamais servir une
 * version perimee quand le reseau est la.
 *
 * STRATEGIE : reseau d'abord, cache en secours. Le choix inverse (cache
 * d'abord) obligerait a incrementer CACHE_NAME a chaque deploiement, et un
 * oubli laisserait une vieille version installee sur le telephone pour
 * toujours. Le site est petit et servi depuis le reseau Cloudflare, donc le
 * cout d'un aller retour reseau est negligeable devant ce risque.
 *
 * VERSIONNAGE DES ASSETS (v7.82). Les scripts et la feuille de style portent
 * ?v=VERSION dans leur URL, ici comme dans index.html. Le Worker renvoie ces
 * URL avec un Cache-Control d'un an : le navigateur ne redemande donc plus les
 * seize fichiers a chaque ouverture, il ne redemande que index.html, dont
 * l'URL ne change pas et qui reste en no-cache. Une nouvelle version change
 * les URL, donc le cache HTTP tombe tout seul. La VERSION ci-dessous doit
 * etre celle du <meta name="app-version"> d'index.html : tools/bump_version.mjs
 * ecrit les deux, et un test refuse qu'elles divergent.
 *
 * DEUX PIEGES traites ici :
 *  - La porte d'entree (worker/index.js) redirige vers /login quand la session
 *    a expire. Une reponse issue d'une redirection ne doit JAMAIS entrer dans
 *    le cache, sinon la page de connexion se retrouverait servie a la place de
 *    l'application. On teste response.redirected.
 *  - /login et /logout ne passent jamais par le cache, sinon la connexion et
 *    la deconnexion cessent de fonctionner.
 */

const VERSION = "8.12";
const CACHE_NAME = "carnet-extraction";

const versionnee = url => url + "?v=" + VERSION;

// Le strict necessaire pour demarrer hors ligne. L'ordre n'importe pas, chaque
// entree est mise en cache independamment : une seule qui echoue ne fait pas
// echouer l'installation. Les fichiers de code portent la version dans leur
// URL, les autres (page, manifeste, icones) non : leur URL ne bouge jamais.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
].concat([
  "./css/styles.css",
  /* Les polices. Sans elles dans le precache, la premiere ouverture hors ligne
     affiche le repli puis saute a la vraie police des que le reseau revient.
     Leur URL ne porte pas de version : un fichier de police ne change jamais
     sous le meme nom, on en publie un nouveau (voir worker/index.js). */
  "./css/fonts/instrument-serif-latin.woff2",
  "./css/fonts/instrument-serif-latin-ext.woff2",
  "./css/fonts/manrope-latin.woff2",
  "./css/fonts/manrope-latin-ext.woff2",
  "./css/fonts/manrope-vietnamese.woff2",
  // Plus chargée par une balise script depuis la v7.54, mais toujours précachée :
  // le chargement à la demande doit fonctionner hors ligne.
  "./js/vendor/chart.umd.js",
  "./js/outils.js",
  "./js/i18n.js",
  // Chargé à la demande depuis la v7.55, mais précaché pour que la bascule de
  // langue fonctionne aussi hors ligne.
  "./js/i18n.en.js",
  "./js/grind.js",
  "./js/recettes.js",
  // Chargé à la demande depuis la v7.56, précaché pour que la démo marche
  // hors ligne comme le reste du site.
  "./js/demo-data.js",
  "./js/sync.js",
  "./js/data-csv.js",
  "./js/data-schema.js",
  "./js/data-store.js",
  "./js/data-calculs.js",
  "./js/data-migrations.js",
  "./js/data.js",
  "./js/reglages.js",
  "./js/charts.js",
  "./js/ui-noyau.js",
  "./js/ui-tableau.js",
  "./js/ui-saisie.js",
  "./js/ui-brouillon.js",
  "./js/ui-rapide.js",
  "./js/ui-historique.js",
  "./js/ui-guide.js",
  "./js/ui-catalogue.js",
  "./js/app.js",
].map(versionnee));

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
      /* Les fichiers d'une version precedente ont une autre URL : ils ne
         seront plus jamais demandes, on les jette pour que le cache ne grossisse
         pas d'un jeu complet a chaque deploiement. */
      const cache = await caches.open(CACHE_NAME);
      const cles = await cache.keys();
      await Promise.all(cles.map(async req => {
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
        // D'abord l'URL exacte (version comprise), puis sans parametres : hors
        // ligne, un fichier d'une version voisine vaut mieux qu'un ecran blanc.
        const exact = await caches.match(request);
        if (exact) return exact;
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
