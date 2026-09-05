# Audit du carnet d'extraction, septembre 2026

Fait le 6 septembre 2026 sur la **v7.80** (89 commits, dernier le 5 septembre).
Remplace l'audit du 27 août (v7.43), soldé : son raisonnement reste lisible dans
l'historique git (`git show 3cd66f8^:AUDIT.md`).

## Où en est cette liste

**Treize points sur seize sont faits**, le 6 septembre même, de la v7.81 à la
v7.89. Le détail est dans `CHANGELOG.md`, qui fait foi. Restent :

- **4** (en-têtes de sécurité, CSP) et **16** (test en navigateur) : non
  demandés, toujours ouverts.
- **5** (`<html lang>` à la bascule) : **l'audit se trompait**. `appliquerStatique()`
  pose déjà `lang` sur la racine à chaque bascule. Rien à faire.
- **6** : fait sans la mesure préalable que le point demandait, le site déployé
  n'étant pas accessible depuis la session. Le gain théorique (une requête au
  lieu de seize à chaud) reste à vérifier une fois dans DevTools.
- **15** : le chiffre de « 40 couleurs en dur » était faux, une erreur de mesure
  (des numéros de ligne comptés comme des occurrences). Il y en avait cinq, hors
  commentaires. Le reste du point tenait.

Le reste du document est laissé tel qu'il a été écrit le 6 septembre au matin :
les chiffres décrivent la v7.80, pas le site d'aujourd'hui.

---
Tout ce qui suit vient de mesures sur les fichiers du dépôt : tailles brutes et
gzip, longueur des fonctions, scans HTML, CSS et ARIA, lecture du Worker et du
service worker, exécution des cinq suites de tests. Rien n'a été mesuré en
navigateur ni sur le site déployé : je n'ai ni l'adresse ni la session.

Le précédent audit (`AUDIT.md`, 27 août, v7.43) est soldé : ses dix points sont
livrés entre la v7.44 et la v7.60. Celui-ci ne les reprend pas. Il regarde ce qui
reste, et surtout ce qui coûte à chaque session de travail.

Les coûts sont en **tokens de conversation**, doc et tests compris, sur la même
échelle que l'audit précédent : XS 5 à 15 k, S 25 à 70 k, M 90 à 180 k. Ce sont
des ordres de grandeur, pas des devis.

## L'état des lieux en douze chiffres

| Mesure | Valeur | Commentaire |
|---|---|---|
| Code applicatif (JS hors vendor, HTML, CSS) | 12 400 lignes, 640 Ko | plus 2 465 lignes de DOCUMENTATION.md |
| Chemin critique, gzip | **160 Ko en 16 requêtes** | Chart.js (70 Ko gzip) chargé à part, mais le tableau de bord est le premier écran |
| Plus gros fichier | `data.js`, **1 417 lignes**, une seule IIFE | six responsabilités dedans, hors du test de plafond à 1 200 lignes |
| Plus longue fonction | `cabler()`, **401 lignes** | 338 au dernier audit, +19 pour cent |
| Puis | `rendreTableau` 208, `loginPage` 180, `migrerDonnees` 122 | |
| Tests | **534 vérifications**, 5 suites, tout vert, moins de 2 s | zéro test en navigateur |
| `confirm()` natifs restants | **4** | démo, vider, rétablir une recette, supprimer une recette |
| Champs sans étiquette explicite | 7 sur 91 | plus un bouton vide, plus 9 sauts de niveau de titre |
| Classes CSS orphelines | 3 sur 298 | et 40 couleurs en dur hors variables |
| En-têtes de sécurité sur l'application | Cache-Control et X-Robots-Tag | pas de CSP, pas de frame-ancestors, pas de Permissions-Policy |
| Fichier `.wrangler/cache/wrangler-account.json` | **versionné et servi** | dépôt public, contient l'identifiant et le nom du compte Cloudflare |
| Doc à lire avant toute modification | **START-HERE + DOCUMENTATION = 43 000 tokens** | à chaque session, avant la première ligne de code |

Ce dernier chiffre est le plus important de ce tableau. Voir le point 1.

## Ce que je n'ai pas pu regarder

- **Tes données.** Le dossier `../Data/` à la racine du workspace contient 6
  extractions, la dernière du 15 août. L'audit précédent en comptait 29 dans D1
  le 27 août. Ce dossier est donc une copie périmée, pas ton dossier lié. Je n'ai
  pas accès à D1. Aucune analyse de données ici, et je te conseille de renommer
  ou supprimer ce dossier pour qu'un prochain agent ne le prenne pas pour la
  vérité (voir point 14).
- **Le site déployé.** Pas de mesure de temps de chargement réel, pas de
  Lighthouse, pas de vérification des en-têtes effectivement renvoyés par
  Cloudflare. Les points de performance sont donc des lectures de code, avec
  une mesure à faire avant de trancher (point 6).

---

# Les seize améliorations, par ordre de rentabilité

| # | Amélioration | Type | Coût | Gain |
|---|---|---|---|---|
| 1 | Alléger la doc que chaque session doit lire | dev loop | **M**, 60 à 100 k | environ 30 k tokens économisés par session, pour toujours |
| 2 | Sortir `wrangler-account.json` du dépôt et des assets | sécu | **XS**, 5 à 10 k | fuite d'identifiants de compte fermée |
| 3 | Règle de limitation de débit sur `/login` | sécu | **XS**, 5 à 10 k | force brute rendue impraticable, zéro code |
| 4 | En-têtes de sécurité sur l'application | sécu | **S**, 25 à 40 k | défense en profondeur sur 46 `innerHTML` |
| 5 | `<html lang>` qui suit la bascule EN | a11y | **XS**, 5 k | lecteurs d'écran dans la bonne langue |
| 6 | Mesurer le chargement, puis versionner les assets | perf | **S**, 30 à 50 k | 1 requête réseau au lieu de 16 à l'ouverture |
| 7 | Les quatre derniers `confirm()` | UX | **S**, 25 à 40 k | plus de boîte système sur le téléphone |
| 8 | Étiquettes, titres, cibles tactiles | a11y | **S**, 30 à 50 k | 7 champs, 1 bouton, 9 titres, cibles à 44 px |
| 9 | Raccourcis et identité de la PWA | UX | **XS**, 10 à 15 k | appui long sur l'icône, saisie directe |
| 10 | Un seul `cleLocale`, un seul `moyenne` | dette | **XS**, 10 à 15 k | plus de doublons qui divergent |
| 11 | Répartir `cabler()` dans les écrans | dette | **S**, 40 à 60 k | 401 lignes qui redeviennent lisibles |
| 12 | Découper `data.js` | dette | **M**, 90 à 140 k | la dernière IIFE géante, six responsabilités |
| 13 | Garde-fou de taille sur le document D1 | robustesse | **XS**, 10 à 15 k | prévenir avant le plafond au lieu de casser dessus |
| 14 | Ménage du workspace et du README | doc | **XS**, 10 à 15 k | plus de copie périmée qui ressemble à la vérité |
| 15 | Hygiène CSS | dette | **XS**, 10 à 15 k | 3 classes mortes, 40 couleurs en dur, 12 `!important` |
| 16 | Un test en navigateur | tests | **M**, 60 à 90 k | le seul trou de la couverture |

Total si tout est fait : de l'ordre de **420 à 650 k tokens**. L'ordre recommandé
est en bas du document, et il ne consiste pas à tout faire.

---

## 1. Alléger la doc que chaque session doit lire

**Coût M, 60 à 100 k. Pure documentation, aucune ligne de code.**

C'est l'optimisation la plus rentable du projet, et elle ne touche pas au site.

`START-HERE.md` dit : lis ce fichier en entier, puis `DOCUMENTATION.md`, avant de
toucher au moindre fichier. Ça fait 1 500 plus 41 700 tokens, soit **43 000
tokens par session** avant la première ligne utile. Pour une correction à 15 k,
la lecture coûte trois fois le travail.

Le document a grossi par accrétion, et ça se voit :

- 2 465 lignes, 146 Ko, 70 sections de niveau 2.
- La numérotation ne suit plus : `5 bis` avant `4 bis`, `7 duodecies` avant
  `7 bis`, et les sections `6 quaterdecies` et `6 quinquies` existent **chacune
  deux fois** avec des sujets différents.
- Le changelog (section 11) contient une section de fond au milieu de ses
  entrées (« Ce qui n'est PAS un avertissement de saisie »), et deux sections
  de fond arrivent après lui.
- Une bonne moitié du texte est du « pourquoi » historique : un bug trouvé, le
  raisonnement, la décision. C'est précieux, mais ce n'est pas ce qu'un agent
  doit lire pour ajouter une colonne à l'historique.

Découpage proposé, trois fichiers :

| Fichier | Contenu | Taille visée |
|---|---|---|
| `DOCUMENTATION.md` | Architecture, modèle de données, les cinq règles non négociables, i18n, migrations, tests, déploiement, les pièges toujours actifs | 500 à 600 lignes, environ 10 k tokens |
| `DECISIONS.md` | Tous les « pourquoi » actuels, regroupés par thème (saisie, tableau de bord, données, synchro, PWA), chacun avec la version qui l'a introduit | le reste, lu seulement pour la zone touchée |
| `CHANGELOG.md` | La section 11 telle quelle, une ligne par version | |

`START-HERE.md` change une phrase : lire DOCUMENTATION en entier, et DECISIONS
seulement pour la zone touchée. `AUDIT.md` (soldé) rejoint DECISIONS pour son
raisonnement et disparaît en tant que fichier, selon sa propre règle : un seul
document d'audit à la fois. Ce fichier-ci le remplace.

Rentabilité : le coût est rendu en deux ou trois sessions.

## 2. Sortir `wrangler-account.json` du dépôt et des assets

**Coût XS, 5 à 10 k. À faire en premier, c'est dix minutes.**

`git ls-files` liste `.wrangler/cache/wrangler-account.json`. Ce fichier est
généré par wrangler et contient l'identifiant du compte Cloudflare et son nom,
qui est une adresse e-mail. Le dépôt est public (ChrisTram/Coffee-extraction-logbook).

Il est aussi **servi comme asset statique** : `.assetsignore` exclut `worker`,
`tools`, `*.md` et les fichiers git, mais pas `.wrangler/`. Derrière la porte
d'entrée, donc pas public, mais il n'a rien à faire là.

Ce n'est pas un secret au sens strict (l'identifiant seul ne donne accès à
rien), mais c'est une donnée de compte qu'on ne publie pas.

À faire : ajouter `.wrangler/` à `.gitignore` et à `.assetsignore`, puis
`git rm --cached`. Le fichier reste dans l'historique git ; le retirer de
l'historique demande une réécriture et un push forcé, à décider à part. Un test
dans `worker/index.test.mjs` peut vérifier que `.assetsignore` couvre bien
`.wrangler`.

## 3. Règle de limitation de débit sur `/login`

**Coût XS, 5 à 10 k. Zéro code, une règle dans le dashboard, une section de doc.**

La seule défense contre la force brute est un délai de 700 ms par tentative
ratée, dans le Worker. Un attaquant qui parallélise avec plusieurs adresses n'est
pas ralenti du tout, et le mot de passe est unique et permanent.

Cloudflare fournit une règle de limitation de débit incluse dans le plan gratuit
(WAF, Rate limiting rules). Une règle sur `POST /login`, par exemple 5 requêtes
par minute par adresse, ferme le sujet sans toucher au Worker. À documenter dans
la section déploiement pour qu'elle survive à un changement de compte.

À noter aussi, sans action : la session ne se révoque qu'en changeant
`AUTH_SECRET`, et c'est documenté. C'est acceptable pour un compte unique.

## 4. En-têtes de sécurité sur l'application

**Coût S, 25 à 40 k.**

`servePrivately()` pose `Cache-Control` et `X-Robots-Tag`, rien d'autre. La page
de connexion a `X-Content-Type-Options` et `Referrer-Policy`, l'application non.
Il manque :

- `Content-Security-Policy` : aucune. Le site fait 46 `innerHTML`. J'ai vérifié
  qu'aucun champ utilisateur n'y est interpolé sans passer par l'échappement de
  `ui-noyau.js`, et le seul contenu externe possible vient de D1 derrière ta
  session. Le risque réel est donc faible, mais une CSP est la ceinture qui
  rend le prochain oubli inoffensif. Le seul script inline est celui du thème
  dans `<head>` : un hash SHA-256 dans la directive `script-src` le couvre. Pas
  de police externe, pas de CDN, donc une CSP stricte tient en trois directives.
- `X-Frame-Options: DENY` ou `frame-ancestors 'none'`.
- `Permissions-Policy` restreinte : le site n'utilise que le verrou d'écran.
- HSTS : se règle au niveau de la zone Cloudflare, pas dans le Worker.

Piège : la CSP casse silencieusement ce qu'elle bloque. Un test dans
`worker/index.test.mjs` doit vérifier que le hash de la CSP correspond au script
inline réellement présent dans `index.html`, sinon le premier changement du
script du thème fait clignoter le site sans que personne ne comprenne pourquoi.

## 5. `<html lang>` qui suit la bascule EN

**Coût XS, environ 5 k.**

La page démarre en `lang="fr"` et rien dans `i18n.js` ne modifie
`document.documentElement.lang` à la bascule. En anglais, un lecteur d'écran lit
donc de l'anglais avec une voix française. La page de connexion, elle, le fait
bien. Une ligne dans la fonction de bascule, une ligne de test.

## 6. Mesurer le chargement, puis versionner les assets

**Coût S, 30 à 50 k. La mesure d'abord, elle coûte 5 k et peut tout annuler.**

Ce que le code dit : chaque réponse de l'application part avec
`Cache-Control: private, no-cache, must-revalidate`, et le service worker est
en réseau d'abord. Donc à chaque ouverture en ligne, **les 16 fichiers du chemin
critique repartent sur le réseau**, au mieux en revalidation 304, plus les
fichiers différés. Sur un téléphone en cuisine avec un wifi moyen, c'est de la
latence pure : le site est déjà sur l'appareil et il demande la permission de
l'utiliser seize fois.

La lazy-load de Chart.js (v7.54) ne gagne rien à l'ouverture normale : le
tableau de bord est le premier écran, donc les 70 Ko gzip partent quand même
tout de suite. Elle sert aux liens profonds vers la saisie.

À faire, dans l'ordre :

1. **Mesurer** : DevTools sur le site déployé, onglet Réseau, une ouverture à
   froid et une à chaud. Si les 304 reviennent en moins de 300 ms cumulés, le
   reste de ce point ne vaut pas son coût.
2. Sinon, **versionner les URL** : `js/app.js?v=7.80` sur les 15 scripts et le
   CSS, et dans la liste de précache du service worker. Le Worker renvoie
   `Cache-Control: private, max-age=31536000, immutable` quand la requête porte
   un paramètre `v`, et garde `no-cache` sur `index.html`. Une ouverture à chaud
   ne fait plus qu'une requête.
3. **Verrouiller par un test** : `VERSION` dans `app.js`, les `?v=` de
   `index.html` et ceux de `sw.js` doivent être identiques, sinon un oubli au
   déploiement laisse un téléphone sur l'ancienne version avec le nouveau HTML.
   C'est le vrai risque de ce changement, et il se teste en dix lignes.

Ce qui ne vaut pas la peine, et pourquoi, est dans la section « écarté ».

## 7. Les quatre derniers `confirm()`

**Coût S, 25 à 40 k.**

Le point 7 de l'audit précédent a remplacé le `confirm()` de suppression
d'extraction par un retour arrière. Il en reste quatre : charger la démo par
dessus des données, vider les données, rétablir une recette d'origine, supprimer
une recette. Ils passent par `I18N.t`, donc ils sont traduits, mais sur le
téléphone ce sont des boîtes système qui cassent l'application installée.

À faire : une modale `<dialog>` de confirmation générique dans `ui-noyau.js`
(titre, texte, bouton dangereux, bouton annuler, promesse), et quatre appels.
Les deux actions destructrices (vider, supprimer une recette) méritent le même
retour arrière de cinq secondes que la suppression d'extraction, le mécanisme
existe déjà.

## 8. Étiquettes, titres, cibles tactiles

**Coût S, 30 à 50 k.**

Le site tourne en PWA sur ton téléphone, donc ça compte. Ce que le scan trouve :

- **7 champs sur 91 sans étiquette associée** ni `aria-label` : `f-eau-ajoutee`,
  `f-agitation`, `f-total-sec`, `f-ecoulement-sec`, `tasse-nom`, `tasse-ml`,
  `don-fichier`. Ce sont des seconds champs d'une paire (minutes puis secondes,
  case puis quantité) dont l'étiquette visible ne couvre que le premier.
- **1 bouton vide** : `#volume-estime`, rempli en JS, sans `aria-label`.
- **9 sauts de niveau** de titre dans le Guide, `h2` directement suivi de `h4`.
  Un lecteur d'écran navigue par titres ; un saut casse le plan.
- **Cibles tactiles** : les icônes de navigation font 32 sur 30 px, puis 30 sur
  28 px sous 480 px de large, et les boutons d'entête 34 sur 32. Le minimum WCAG
  est 24 px, la recommandation confortable est 44. Sur les icônes qu'on tape
  plusieurs fois par jour avec les doigts mouillés, 44 px de zone d'appui (même
  si le dessin reste petit) change vraiment quelque chose.
- Aucun support de `forced-colors` ni `prefers-contrast`. Mineur pour un site
  personnel, je le note pour être complet.

## 9. Raccourcis et identité de la PWA

**Coût XS, 10 à 15 k.**

Le manifeste n'a pas de champ `id` : sans lui, l'identité de l'application
installée dépend de `start_url`, et changer celui-ci un jour ferait apparaître
une deuxième application à côté de la première. Il n'a pas non plus de
`shortcuts` : un appui long sur l'icône pourrait ouvrir directement Saisie ou
Historique (`./#saisie`, `./#historique`), la navigation par hash existe déjà.
Deux champs JSON, une entrée dans le test qui lit le manifeste.

## 10. Un seul `cleLocale`, un seul `moyenne`

**Coût XS, 10 à 15 k.**

`cleLocale(d)` existe dans `charts.js` et `ui-noyau.js`. `moyenne(liste)` existe
dans `reglages.js` et `ui-noyau.js`. Ce sont des fonctions de date et de calcul,
donc exactement celles qui divergent en silence : un jour l'une arrondit et
l'autre non, et deux écrans affichent deux chiffres pour la même chose. Elles
ont leur place dans un module pur, testable sans navigateur, comme `grind.js`.

## 11. Répartir `cabler()` dans les écrans

**Coût S, 40 à 60 k.**

Le découpage de v7.60 a réparti le rendu en sept fichiers mais a laissé le
câblage des événements dans `app.js` : `cabler()` fait **401 lignes** et pose 95
écouteurs, soit 63 de plus qu'au dernier audit, où elle était déjà signalée
comme la plus longue fonction du projet. Chaque nouveau bouton l'allonge, et
chaque écran dépend d'une fonction qui vit ailleurs pour réagir à ses propres
clics.

À faire : une fonction `cabler()` par fichier `ui-*.js`, appelée par `app.js`
dans l'ordre, et le test de frontières de `modules.test.mjs` étendu pour
vérifier que chaque écran câble ses propres identifiants. Mécaniquement,
`app.js` tombe sous 300 lignes.

## 12. Découper `data.js`

**Coût M, 90 à 140 k. Moins que le découpage d'app.js : la couche pure a déjà 374 tests.**

`data.js` fait 1 417 lignes dans **une seule IIFE de 1 412 lignes**, et il porte
six métiers : analyse et sérialisation CSV, IndexedDB, File System Access,
migrations et version de schéma, orchestration de la synchro, calculs métier
(`calculs`, 91 lignes). Le test qui plafonne les fichiers à 1 200 lignes ne
couvre que les `ui-*.js`, donc il ne s'applique pas ici.

Découpage naturel, en scripts classiques, sans build :

```
js/data-csv.js         csvParse, csvSerialiser, colonnes, en-têtes verrouillées
js/data-store.js       IndexedDB, File System Access, sauverLocal, sauverFichiers
js/data-migrations.js  version de schéma, normaliser*, migrerDonnees
js/data-calculs.js     calculs, sachetCourant, stockSachet, cafeDe
js/data.js             l'état, abonner, init, synchroniser : la façade
```

Le plafond de 1 200 lignes s'étend à tous les `js/*.js`. C'est le même
mouvement que la v7.60, avec le même filet : la suite de frontières trouvera ce
qui se cassera.

## 13. Garde-fou de taille sur le document D1

**Coût XS, 10 à 15 k.**

La synchro stocke **tout l'état dans une seule ligne D1**, en JSON. C'est
défendu dans le code (pas de schéma SQL à migrer) et c'est le bon choix. Mais
D1 plafonne la taille d'une ligne (de l'ordre de 1 à 2 Mo selon la limite en
vigueur, à vérifier dans la doc Cloudflare du moment), et le jour où le plafond
est atteint, la synchro casse d'un coup, sans avertissement, avec les données en
sécurité côté client mais plus rien qui converge.

Ordre de grandeur : une extraction pèse environ 600 octets en JSON. À une tasse
et demie par jour actif, le plafond bas est à cinq ou six ans. Ce n'est pas
urgent, c'est le genre de chose qu'on oublie.

À faire : le serveur renvoie la taille du document dans sa réponse, le client
affiche un avertissement dans le panneau Données passé 50 pour cent du plafond.
Une douzaine de lignes et un test dans `worker/sync.test.mjs`.

Sans action, à connaître : la fusion serveur est une lecture puis une écriture
sans transaction. Deux appareils qui synchronisent à la même seconde peuvent
s'écraser l'un l'autre, et ça se répare tout seul à la synchro suivante puisque
chacun renvoie son état complet. Acceptable pour un utilisateur unique.

## 14. Ménage du workspace et du README

**Coût XS, 10 à 15 k.**

- `../Data/` à la racine : 6 extractions, dernière le 15 août. Une copie
  périmée qui a la forme exacte des vraies données. À renommer
  (`Data-archive-2026-08-15/`) ou à supprimer, pour qu'un agent ne la lise pas
  comme la vérité. Je l'ai presque fait.
- `README.md` : la section « Structure du dossier » liste `app.js` comme
  « l'application (écrans, saisie, historique, gestion) » et ne mentionne ni les
  sept `ui-*.js`, ni `sync.js`, ni `reglages.js`, ni le Worker, ni le service
  worker. Elle date d'avant la v7.60. Le reste du README est juste.
- `../petit-grimoire-du-cafe.html` charge Google Fonts : c'est un livrable à
  part et ça ne concerne pas le tracker, je le note pour mémoire.

## 15. Hygiène CSS

**Coût XS, 10 à 15 k.**

65 Ko, 531 règles, 60 variables. Trois classes définies et jamais utilisées
(`btn-icone-texte`, `badge-famille`, `chrono-affichage`), 12 `!important`,
et 40 couleurs hexadécimales distinctes écrites en dur hors des variables, alors
que le thème repose sur les variables. Sept valeurs de `z-index` différentes
(20, 50, 60, 149, 150, 200, 300) sans échelle nommée. Rien de cassé, mais
chaque couleur en dur est un endroit où le thème clair et le thème sombre
peuvent diverger.

## 16. Un test en navigateur

**Coût M, 60 à 90 k, et chaque exécution coûte des tokens.**

534 vérifications tournent sans navigateur en moins de deux secondes, et elles
attrapent beaucoup. Mais il n'existe **aucun test qui ouvre la page** :
`DOCUMENTATION.md` décrit un patron Playwright, `tools/` n'en contient pas. Le
bug de v7.60 (le bouton du panneau rapide qui ne faisait rien) est exactement le
genre que seul un navigateur voit.

À faire : un seul scénario de fumée, exécuté à la main avant un déploiement, pas
à chaque commit. Ouvrir en `file://`, charger la démo, saisir une tasse par le
panneau rapide, la retrouver dans l'historique, basculer en anglais, repasser en
français. Sans capture `fullPage` (le piège est documenté). Je le mets en dernier
parce que c'est le plus cher par rapport à ce qu'il attrape sur un site
personnel, mais c'est le seul vrai trou de la couverture.

---

## Envisagé, puis écarté

| Idée | Pourquoi non |
|---|---|
| Bundler et minification | Environ 30 pour cent de gzip en moins sur les scripts, mais la règle « aucun build » est un arbitrage consigné en section 10 de la doc, et l'ouverture en double clic sur `index.html` est la raison d'être du projet. Le gain réel se mesure en dizaines de Ko sur un site déjà dans le cache. |
| Charger les écrans à la demande | Guide, catalogue et historique pèsent 16 Ko gzip à eux trois, soit 10 pour cent du chemin critique. Le mécanisme existe (Chart.js), mais l'ordre de chargement des `ui-*.js` est une contrainte documentée et fragile. Trop de risque pour dix pour cent. |
| Remplacer Chart.js par du SVG maison | 70 Ko gzip, déjà chargés à part. La heatmap et la réglette sont déjà en SVG maison. Refaire six graphiques pour 70 Ko, c'est un coût L pour un gain que le cache annule dès la deuxième ouverture. |
| Sortir le contenu du Guide de `index.html` | 44 articles, 47 `h4`, environ un tiers du HTML. Mais `fetch` est bloqué en `file://`, donc le contenu doit vivre dans la page ou dans un script. Le gain est un parse HTML de 85 Ko, invisible. |
| Réécrire `sauverLocal` et `sauverFichiers` pour n'écrire que les tables modifiées | Huit clés IndexedDB et six CSV réécrits à chaque sauvegarde. À ton volume, c'est quelques millisecondes. La signature par table existe déjà pour le rendu (v7.57), donc le jour où ça pèse, c'est un après-midi. |
| Types (JSDoc ou TypeScript) | Le projet tient par ses tests et ses tests de frontières. Ajouter une couche de types sans build, c'est du JSDoc que personne ne vérifie. |

## Ce qui va bien, et qu'il ne faut pas casser

- **534 vérifications en moins de deux secondes**, dont des tests écrits comme
  des règles générales : en-têtes CSV verrouillées, liste de précache du service
  worker comparée aux scripts de la page, plafond de lignes par fichier, aucun
  attribut de texte sans traduction. Ceux-là attrapent des bugs pas encore écrits.
- **La porte d'entrée est propre** : HMAC pour la session et pour la comparaison
  du mot de passe, cookie `HttpOnly Secure SameSite=Lax`, anti redirection
  ouverte, fermeture par défaut si un secret manque, et 32 tests dessus.
- **La synchro est commutative et idempotente**, avec pierres tombales, et le
  bug de perte de données de v7.14 a été trouvé et documenté honnêtement.
- **Le service worker ne mettra jamais en cache une redirection vers /login**,
  et c'est expliqué dans le fichier. C'est le piège classique de ce montage, et
  il est traité.
- **Zéro dépendance réseau** : le site s'ouvre en double clic, huit mois après,
  et le thème s'applique avant le premier rendu.
- **Aucun tiret cadratin ni demi-cadratin** dans les 12 400 lignes de code, de
  HTML et de doc. Scan fait en Unicode strict, pas en octets.

## Ordre recommandé

1. **2**, **3**, **5** : trois XS de sécurité et d'accessibilité, une heure à
   elles trois, aucune raison d'attendre.
2. **1** : la doc. C'est la seule amélioration qui rend des tokens à chaque
   session suivante, donc plus tôt elle est faite, plus elle rapporte.
3. **6** : mesurer d'abord (5 k), et ne versionner les assets que si la mesure
   le justifie.
4. **4**, **7**, **8**, **9** : la sécurité et le confort au téléphone, dans
   cet ordre, quand tu veux.
5. **10**, **11**, **12** : la dette, du plus petit au plus gros, et 12 avant
   la prochaine grosse fonctionnalité qui touche aux données.
6. **13**, **14**, **15** : quand il y a un moment creux, ils ne bloquent rien.
7. **16** : avant le prochain changement qui touche à plus de deux écrans à
   la fois.
