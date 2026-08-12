# START HERE : reprise du projet Carnet d'extraction

Tu reprends un projet existant et fonctionnel. Lis ce fichier en entier, puis
`DOCUMENTATION.md` avant de toucher au moindre fichier. Le backlog d'idées est
dans `V2 suggestions.md`.

## Le projet en trois phrases

Un site web 100 pour cent local (HTML, CSS, JS purs, zéro build, zéro serveur)
que Chris ouvre dans Chrome en double-cliquant `index.html`. Il y suit ses
extractions de café sur deux machines, une Bialetti Brikka 2 tasses et un
Hario Switch 02, avec un moulin Timemore C5 ESP. Cinq écrans : Tableau de bord
(graphiques), Saisie (avec chronomètre à paliers), Historique, Référence
(recettes, moulin, diagnostic du goût, vocabulaire), Guide (boutiques
vietnamiennes, achats, entretien).

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
   complète. Toute nouvelle chaîne visible doit exister dans les deux langues
   (voir DOCUMENTATION.md, section i18n, le mécanisme est particulier).
3. Couleurs de données figées, validées daltonisme : Brikka `#2a78d6`,
   Switch `#eb6834`, les deux machines `#1baf7a`.
4. Les données de l'utilisateur vivent dans des CSV locaux lisibles au
   tableur. Ne jamais casser la compatibilité : tout renommage de colonne ou
   de recette passe par une migration automatique et idempotente (des
   exemples existent, voir DOCUMENTATION.md, section Migrations).
5. Base de conversion du moulin : 8,32 microns par cran (diagramme officiel
   Timemore), 50 crans par rotation, butée à 3.0.0 soit 150 crans soit
   1248 microns. Le contenu factuel des recettes et du diagramme a été
   vérifié par Chris : ne pas l'altérer sans instruction explicite.

## Comment travailler

- Ouvre `index.html` dans un Chrome ou Chromium pour voir le site. Tout
  marche en `file://`, y compris la liaison de dossier (API File System
  Access, Chrome et Edge seulement).
- Teste avec Playwright et un Chromium headless (patron de test complet dans
  DOCUMENTATION.md). Attention : ne JAMAIS faire de capture `fullPage`, le
  redimensionnement virtuel rejoue les animations Chart.js et fausse la
  capture. Utiliser un grand viewport à la place.
- Après CHAQUE modification : mets à jour `DOCUMENTATION.md` (section
  concernée + une ligne dans le changelog), lance le scan anti-tirets, et
  vérifie la bascule EN si tu as ajouté du texte.
- Si tu changes le modèle de données de la démo, régénère la avec
  `python3 tools/gen_demo.py` (seed fixe, sortie déterministe).
- Commits en ANGLAIS, clairs, un sujet par commit. Idem pour les noms de
  variables et de fonctions du code NOUVEAU (`worker/index.js` par exemple).
  Le code applicatif existant est nommé en français, on ne le renomme pas en
  masse. La doc, les commentaires et l'interface restent en français.
- Le site se déploie sur Cloudflare Workers (fichiers statiques, AUCUN
  build), derrière une porte d'entrée à mot de passe unique. Procédure
  complète, secrets à définir et pièges (changement d'origine IndexedDB,
  https) dans DOCUMENTATION.md, section "Git et déploiement Cloudflare".

## Où est quoi

| Fichier | Rôle |
|---|---|
| `DOCUMENTATION.md` | La doc technique complète, à maintenir à chaque modif |
| `V2 suggestions.md` | Le backlog d'améliorations proposées, priorisé |
| `index.html` | La page unique, tout le HTML statique |
| `css/styles.css` | Styles, thèmes sombre (défaut) et clair |
| `js/i18n.js` | Traduction FR/EN, à toucher dès qu'un texte change |
| `js/grind.js` | Moteur du moulin : conversions, plages, validation |
| `js/recettes.js` | Recettes d'origine, cafés de départ, tasses, règles |
| `js/data.js` | CSV, IndexedDB, File System Access, migrations |
| `js/charts.js` | Graphiques Chart.js, heatmap SVG, diagramme officiel SVG |
| `js/app.js` | L'application : écrans, saisie, chrono, historique |
| `js/demo-data.js` | Démo embarquée (générée, ne pas éditer à la main) |
| `demo/` | La même démo en CSV |
| `tools/gen_demo.py` | Générateur de la démo |
| `worker/index.js` | Porte d'entrée Cloudflare (login), n'existe qu'en ligne |
| `wrangler.jsonc` | Config du déploiement Workers, aucun secret dedans |

Le dossier parent contient aussi le prompt d'origine
(`../Prompt-Fable-Tracker-Cafe.md`), le guide d'achat source
(`../Guide-cafe-Brikka-Switch.html`) et le diagramme officiel du moulin
(`../Microns.png`). Ce sont des sources de contexte, pas des livrables.
