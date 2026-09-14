# START HERE : reprise du projet Carnet d'extraction

Tu reprends un projet existant et fonctionnel. Lis ce fichier en entier, puis
`DOCUMENTATION.md` en entier (900 lignes : ce qui existe et comment ça tient).
Ne lis PAS `DECISIONS.md` en entier : c'est le raisonnement derrière chaque
choix, classé par thème, et tu n'ouvres que le thème de la zone que tu touches.
`CHANGELOG.md` est l'historique des versions. Le backlog est dans `AUDIT.md`.

## Le projet en trois phrases

Un site web 100 pour cent local (HTML, CSS, JS purs, zéro build, zéro serveur)
que Chris ouvre dans Chrome en double-cliquant `index.html`, et qui tourne aussi
en PWA privée sur Cloudflare Workers avec synchronisation entre appareils. Il y
suit ses extractions de café sur deux machines, une Bialetti Brikka 2 tasses et un
Hario Switch 02, avec un moulin Timemore C5 ESP. Six écrans : Tableau de bord,
Saisie, Historique, Mes meilleurs réglages, Guide (recettes, moulin, diagnostic,
boutiques), Paramètres.

## Qui est l'utilisateur

Chris, français, vit au Vietnam. Café noir sans sucre. Aime : chocolat noir,
caramel, corps rond, faible acidité, profils tropicaux fermentés. Déteste :
l'amertume brûlée et l'acidité citron. Pas encore de balance de précision.
Il tutoie et veut qu'on le tutoie. Il édite ses données via l'interface,
jamais à la main dans les CSV.

## Les règles NON NÉGOCIABLES

1. JAMAIS de tiret cadratin ni de tiret demi-cadratin. Nulle part : ni dans le
   code, ni dans les commentaires, ni dans l'interface, ni dans les docs, ni
   dans les textes anglais. Utiliser virgules, parenthèses, deux points.
   Vérifier avant chaque livraison (commande dans DOCUMENTATION.md, section
   Tests).
2. Interface entièrement en FRANÇAIS par défaut, avec bascule anglaise
   complète. Toute nouvelle chaîne visible, texte OU attribut (`title`,
   `aria-label`, `placeholder`), doit exister dans les deux langues (voir
   DOCUMENTATION.md, section i18n, le mécanisme est particulier). Des tests le
   refusent sinon.
3. Couleurs de données figées, validées daltonisme : Brikka `#2a78d6`,
   Switch `#eb6834`, les deux machines `#cc79a7`.
4. Les données de l'utilisateur vivent dans des CSV locaux lisibles au
   tableur. Ne jamais casser la compatibilité : tout renommage de colonne ou
   de recette passe par une migration automatique et idempotente (voir
   DOCUMENTATION.md, section Migrations).
5. Base de conversion du moulin : 8,32 microns par cran (diagramme officiel
   Timemore), 50 crans par rotation, butée à 3.0.0 soit 150 crans soit
   1248 microns. Le contenu factuel des recettes et du diagramme a été
   vérifié par Chris : ne pas l'altérer sans instruction explicite.

## Comment travailler

- Ouvre `index.html` dans un Chrome ou Chromium pour voir le site. Tout
  marche en `file://`, y compris la liaison de dossier (API File System
  Access, Chrome et Edge seulement).
- Après CHAQUE modification : lance les cinq suites de tests (commandes dans
  DOCUMENTATION.md, section Tests, moins de deux secondes en tout), le scan
  anti-tirets, et vérifie la bascule EN si tu as ajouté du texte.
- Monter de version : `node tools/bump_version.mjs 7.90`, puis une ligne en
  tête de `CHANGELOG.md`. Jamais de version à la main : elle vit à trois
  endroits et un test refuse qu'ils divergent.
- Mets à jour `DOCUMENTATION.md` si ce qui EXISTE a changé (un fichier, une
  colonne, une règle). Ajoute une section à `DECISIONS.md`, dans le bon thème,
  si tu as pris une décision ou trouvé un bug qui mérite d'être compris plus
  tard. Ne mets pas de raisonnement dans DOCUMENTATION.md : elle doit rester
  courte, c'est ce qu'on lit à chaque session.
- Si tu changes le modèle de données de la démo, régénère la avec
  `python3 tools/gen_demo.py` (seed fixe, sortie déterministe). Python n'est
  pas installé sur la machine de Chris.
- `README.md` est en ANGLAIS, et doit le rester : le depot est public. C’est la
  seule exception, `DOCUMENTATION.md`, `DECISIONS.md`, `CHANGELOG.md`, les
  commentaires et l’interface restent en francais.
- Commits en ANGLAIS, clairs, un sujet par commit, une version par commit.
  Idem pour les noms de variables et de fonctions du code NOUVEAU (`worker/`
  par exemple). Le code applicatif existant est nommé en français, on ne le
  renomme pas en masse. La doc, les commentaires et l'interface restent en
  français.
- Le site se déploie sur Cloudflare Workers (fichiers statiques, AUCUN
  build), derrière une porte d'entrée à mot de passe unique. Procédure
  complète, secrets à définir et pièges dans DOCUMENTATION.md, section "Git et
  déploiement Cloudflare".

## Où est quoi

| Fichier | Rôle |
|---|---|
| `DOCUMENTATION.md` | Ce qui existe et comment ça tient. À lire en entier, à maintenir. |
| `DECISIONS.md` | Le pourquoi, par thème. À lire par zone, à enrichir. |
| `CHANGELOG.md` | Une ligne par version, la plus récente en premier. |
| `AUDIT.md` | L'audit courant du projet et son backlog chiffré. |
| `README.md` | La présentation pour Chris, côté usage. |
| `index.html` | La page unique, tout le HTML statique, et la version du site (`<meta name="app-version">`) |
| `css/styles.css` | Styles, thèmes sombre (défaut) et clair |
| `js/outils.js` | Fonctions pures partagées par toutes les couches |
| `js/i18n.js`, `js/i18n.en.js` | Traduction FR/EN, à toucher dès qu'un texte change |
| `js/grind.js` | Moteur du moulin : conversions, plages, validation |
| `js/recettes.js` | Recettes d'origine, cafés de départ, tasses, règles |
| `js/data*.js` | Couche de données en six fichiers, façade `DATA` dans `data.js` |
| `js/reglages.js` | Meilleurs réglages par café, calcul pur |
| `js/charts.js` | Graphiques Chart.js, heatmap SVG, diagramme officiel SVG |
| `js/ui-*.js` | L'interface, un fichier par écran plus le noyau |
| `js/app.js` | Démarrage, navigation, câblage global |
| `js/demo-data.js` | Démo embarquée (générée, ne pas éditer à la main) |
| `demo/` | La même démo en CSV |
| `tools/` | Tests, `bump_version.mjs`, générateurs |
| `worker/index.js`, `worker/sync.js` | Porte d'entrée et synchro Cloudflare, n'existent qu'en ligne |
| `wrangler.jsonc` | Config du déploiement Workers, aucun secret dedans |
| `sw.js`, `manifest.json`, `icons/` | PWA installable, hors ligne |

Le dossier parent contient aussi le prompt d'origine
(`../Prompt-Fable-Tracker-Cafe.md`), le guide d'achat source
(`../Guide-cafe-Brikka-Switch.html`), le diagramme officiel du moulin
(`../Microns.png`) et une copie PÉRIMÉE des données
(`../Data-archive-2026-08-15/`, six extractions d'août : les vraies données
vivent dans le dossier lié de Chris et dans D1). Ce sont des sources de
contexte, pas des livrables.
