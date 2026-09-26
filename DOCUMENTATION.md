# DOCUMENTATION technique : Carnet d'extraction

Doc de référence, à lire EN ENTIER avant de toucher au code : elle décrit ce qui
existe et comment ça tient. Elle est courte à dessein. Le POURQUOI de chaque
choix, les bugs trouvés et le raisonnement qui a mené là vivent dans
`DECISIONS.md`, classés par thème : on n'y lit que la partie qui concerne la zone
qu'on touche. L'historique des versions est dans `CHANGELOG.md`. Commencer par
`START-HERE.md` si tu arrives sans contexte.

Dernière mise à jour : v8.31, 2026-09-19.

## 1. Vue d'ensemble

Site mono-dossier, ouvert en `file://` dans Chrome, aussi déployé sur Cloudflare
Workers derrière une porte d'entrée à mot de passe (section 13). Aucune
dépendance réseau : Chart.js 4.4.4 est embarqué dans `js/vendor/chart.umd.js`
et chargé à la demande, les deux polices de la direction artistique sont dans
`css/fonts/` (jamais un CDN, voir section 10). Les scripts sont des scripts classiques (pas de modules
ES, ils ne marchent pas en `file://`), tous en `defer`, dans l'ordre de
`index.html`. Chaque fichier expose un objet global (`OUTILS`, `I18N`, `GRIND`,
`DATA_*`, `DATA`, `SYNC`, `REGLAGES`, `CHARTS`, `UI`) ou des constantes globales
(`RECETTES_DEPART`, etc.).

SIX écrans dans une page unique, bascule par nav et hash. La liste fait foi dans
`ECRANS` (`js/ui-noyau.js`) : tableau, saisie, historique, reglages, guide,
parametres. Les anciens liens `#reference` restent valides grâce à
`ECRANS_RENOMMES`.

NAVIGATION (refonte Comptoir, v8.1). **Un seul élément `.rail` dans le DOM, deux
mises en page.** À partir de 1024 px c'est un rail fixe à gauche de 232 px qui
porte les six écrans, la marque, le bouton « Nouvelle tasse », l'état de synchro,
les bascules langue et thème et le bouton Données. En dessous, le même élément
devient la feuille « Plus » qui monte du bas, et `.barre-bas` prend les trois
écrans quotidiens plus l'entrée « Plus ». Le CSS masque alors les entrées en
double, la marque et « Nouvelle tasse ».

Le rail et la feuille sont le MÊME élément parce que `app.js` adresse
`#btn-lang`, `#btn-theme` et `#btn-donnees` par identifiant : deux exemplaires
et le second serait muet. Un test refuse que ces identifiants apparaissent deux
fois.

Toutes les entrées portent `.nav-btn` et `data-ecran` : `activerEcran()` et le
câblage d'`app.js` les traitent déjà toutes, la navigation n'a rien appris de
nouveau. Les icônes sont des SVG en trait de 1,8 px, jamais des emoji, et un
test le vérifie. Le bouton flottant de saisie rapide n'existe QUE sur téléphone :
sur ordinateur « Nouvelle tasse » ouvre la saisie complète.

LE CADRE (v8.27). Tout écran est borné et centré par UNE règle, `.ecran
{ max-width: var(--cadre); margin-inline: auto }`, 1560 px. Aucun sélecteur
`#ecran-*` ne pose de largeur ni de marge, un test le refuse : une règle
d'identifiant bat la classe, et c'est ainsi que l'historique s'est retrouvé calé
à gauche. La grille de saisie a son propre plafond de 1400 px, centré.

LES INSIGHTS (« Ce que tes données disent »). Dix règles dans `ui-constats.js`
(dont, depuis la v8.42, la température de l'eau du Switch par tranches, l'eau
préchauffée de la Brikka et l'agitation du Switch, chacune limitée à sa machine),
chacune rendant `{ texte, haut, bas, confiance }` ou `null` via `constat()`,
où `haut` et `bas` sont `{ libelle, note, n }`. `rendreInsights()` en fait une
phrase et une ligne de preuve : réglette de 0 à 10, les deux moyennes, la confiance et les effectifs. Les seuils
d’affichage (0,4 point, 3 tasses par groupe) sont dans `MIN_GAP` et
`MIN_SAMPLE`, ceux du « solide » dans `GAP_SOLIDE` et `N_SOLIDE`.

LES CHAMPS NOMBRE ÉTROITS. Chrome n’affiche ses flèches natives qu’à partir
d’une certaine largeur : le champ Température (66 px) n’en avait aucune. Le
sélecteur maison est `.champ-pas` + `.pas` dans la feuille de style, et
`brancherPas()` dans `ui-saisie.js` : tout champ nombre peut l’avoir en posant
deux boutons `data-pas="1|-1" data-pas-champ="<id>"` à côté de lui.

LES THÈMES. Trois palettes dans `css/socle.css` (v8.34) : `html[data-theme="clair"]`,
`html[data-theme="sombre"]` (Graphite, le sombre par défaut) et
`html[data-theme="sombre"][data-sombre="nuit"]` (Nuit, qui ne redéfinit que ce qui
change). `data-theme` dit la famille, `data-sombre` la palette ; les deux sont
posés par le script en ligne du `<head>` (clés `theme` et `sombre` du
localStorage), et le bouton de thème fait le tour clair, Graphite, Nuit. La carte
du chrono prend ses sous-surfaces dans `--cs-*`. Quatre surfaces par thème
(`--fond`, `--panneau`, `--panneau-2`, `--panneau-3` pour le survol), des filets
en alpha en sombre, et le relief par `--ombre-carte` et `--ombre-haut`, vides en
clair. La couleur de fond du sombre vit à CINQ endroits à changer
ensemble : la feuille de style, la balise `theme-color` d'`index.html`, la table
`TEINTES` d'`ui-noyau.js` (une par palette), `manifest.json` et la page de
connexion de `worker/index.js` (ces deux derniers en Graphite). Les icônes en
trait des boutons d'action viennent de `UI.icone(nom)`, la piste des curseurs
de `UI.peindreCurseur(curseur)` (à appeler après toute écriture de `.value`).

LA FEUILLE DE STYLE ne définit chaque sélecteur de premier niveau qu'UNE fois
(v8.31). Les blocs « refonte, étape n » qui redéfinissaient ce qui précédait ont
été fusionnés dans la première définition. La vérification s'est faite par
empreinte des styles calculés dans le navigateur, voir `DECISIONS.md`.

Les cinq règles non négociables sont dans `START-HERE.md`. En résumé : jamais de
tiret cadratin ni demi-cadratin, interface bilingue complète, couleurs de données
figées, compatibilité des CSV par migration, base de conversion du moulin à
8,32 µm par cran.

## 2. Les fichiers, et qui dépend de qui

| Fichier | Rôle |
| --- | --- |
| `js/outils.js` | fonctions pures partagées par toutes les couches : `moyenne`, `cleLocale`, version du site. Se charge en premier. |
| `js/i18n.js`, `js/i18n.en.js` | traduction, moitié française et mécanisme ; paquet anglais chargé à la demande |
| `js/grind.js` | moulin : conversions, plages, validation |
| `js/recettes.js` | semences : recettes, cafés, tasses, descripteurs, diagnostics, règles d'avertissement |
| `js/sync.js` | synchronisation entre appareils, côté client : parle au réseau, rien d'autre |
| `js/data-csv.js` | format CSV, pur |
| `js/data-schema.js` | colonnes, normalisation, semences des tables, pur |
| `js/data-store.js` | IndexedDB, File System Access, téléchargement : primitives |
| `js/data-calculs.js` | champs dérivés et lecture des sachets, lecture seule, lié à l'état par `pour(state)` |
| `js/data-migrations.js` | version de schéma et rattrapages de l'existant, même mécanisme |
| `js/data.js` | POSSÈDE l'état ; mutations, import et export, démo, synchro, démarrage. La façade `DATA` expose le même nom pour chaque fonction, où qu'elle vive. |
| `js/reglages.js` | meilleurs réglages par café, moyenne glissante, constats : calcul pur |
| `js/charts.js` | graphiques Chart.js (chargée à la demande), heatmap et réglette en SVG maison |
| `js/ui-noyau.js` | outils d'interface partagés, thème, navigation. Définit `UI`. |
| `js/ui-constats.js` | les phrases calculées et leur carrousel |
| `js/ui-derniere.js` | la carte de la dernière tasse, et ses briques partagées avec la table |
| `js/ui-tableau.js` | tableau de bord : calendrier, analyses, dernières extractions |
| `js/ui-saisie.js` | formulaire, chronomètre |
| `js/ui-saisie-aside.js` | panneau latéral de la saisie, tasses jumelles |
| `js/ui-pilules.js` | pilules des diagnostics et des goûts, repli des familles |
| `js/ui-chrono.js` | chronomètre de la saisie : paliers, bips, verrou d’écran, widget repliable |
| `js/ui-brouillon.js` | brouillon de saisie en localStorage, chargé après ui-saisie.js |
| `js/ui-rapide.js` | panneau de saisie rapide |
| `js/ui-historique.js` | tableau, filtres, tri, comparateur, écran Mes meilleurs réglages |
| `js/ui-guide.js` | recettes de référence, pas à pas, moulin interactif |
| `js/ui-catalogue.js` | modales cafés, sachets, recettes, écran Paramètres |
| `js/ui-fiche.js` | la fiche d'un café (v8.46), dialogue `#modale-fiche` |
| `js/ui-brassage.js` | le mode Brassage (v8.47), dialogue plein écran `#modale-brassage` |
| `js/ui-dessins.js` | les dessins en SVG maison (v8.49) : étagère, horloge, spectre, carte du moulin |
| `js/app.js` | démarrage, navigation, thème, langue, modales d'accueil et de données, abonnement aux données |
| `css/fonts/` | les deux polices de la DA, embarquées en woff2, sous OFL (section 10) |
| `sw.js`, `manifest.json`, `icons/` | PWA et hors ligne (section 10) |
| `worker/index.js`, `worker/sync.js` | porte d'entrée et fusion D1, Cloudflare seulement (section 13) |
| `tools/` | tests, générateurs, montée de version |

### Les deux règles de l'interface

**Le noyau se charge en premier, donc on l'emprunte.** Chaque fichier d'interface
commence par `const { $, $$, toast, ... } = UI;`. C'est une liaison de valeur,
mais les noms empruntés sont des fonctions et des objets : ils ne changent jamais
d'identité. **Ne jamais emprunter un `let`** : la déstructuration fige la valeur
du chargement. L'état partagé est un OBJET muté en place (`saisie`, `chrono`,
`tri`, `replis`, `nav`).

**Les écrans s'appellent par `UI.`, jamais directement.** `UI.rendreHistorique()`
est résolu au moment de l'appel, pas au chargement, ce qui autorise deux écrans à
s'appeler mutuellement. Le noyau n'emprunte rien et ne connaît aucun écran.

**Chaque écran câble ses propres contrôles** dans une fonction `cablerX()`
exposée sur `UI` et appelée par `app.js`. Un identifiant d'écran (`#f-`, `#h-`,
`#q-`, `#conv-`, `#param-`...) dans `app.js` est une régression, le test de
frontières le refuse.

### Ajouter du code

- Une fonction utilisée par UN seul écran : dans son fichier, sans l'exposer.
- Une fonction appelée depuis un autre écran : dans l'`Object.assign(UI, …)` de
  son fichier, appelée en `UI.laFonction()`.
- Un outil d'interface utile à DEUX écrans au moins : dans `ui-noyau.js`. Une
  fonction PURE utile à deux couches (données, graphiques, interface) : dans
  `outils.js`. Pas avant : un nom placé là est un engagement.
- Un nouveau fichier JS : le déclarer dans `index.html` (avec `?v=`), `sw.js`,
  `tools/boot.test.mjs` (SCRIPTS), `tools/data.test.mjs` (SCRIPTS ou
  FICHIERS_DATA ou SOURCE_UI) et `tools/modules.test.mjs` (FICHIERS ou
  AUTRES_COUCHES). Les tests comparent ces listes entre elles et hurlent au
  premier oubli.
- Aucun fichier JS ne dépasse 1 200 lignes, `app.js` ne dépasse pas 450. Ce sont
  des tests, pas des conseils.

## 3. Modèle de données

Cinq tables, cinq CSV, éditables au tableur. La vérité vit dans un dossier
lié via l'API File System Access (Chrome, Edge), avec copie miroir permanente
dans IndexedDB (base `cafe-tracker`, store `kv`). Sans dossier lié, IndexedDB
seul + import/export manuels.

### cafes.csv
`id, nom, torrefacteur, origine, espece, procede, torrefaction, deja_moulu,
pourcentage_cafe_reel, tag, notes_annoncees, format_grammes, prix_vnd,
date_torrefaction, machine_recommandee, recette_recommandee, date_ajout,
actif`

- `deja_moulu` 0/1 : si 1, le champ mouture est désactivé en saisie, affiché
  "défaut paquet", rien n'est stocké, exclu du nuage note contre mouture.
- `pourcentage_cafe_reel` (défaut 100) : sous 100, pastille rouge "X % café",
  avertissement non bloquant en Switch (le blocage a été retiré en v7.34),
  coût par gramme de café réel affiché en plus, caféine pondérée.
- `tag` : "café aromatisé" (auto si pct < 100), "café de référence" (étalon,
  barre verte dans le graphe par café). Champ libre.
- `machine_recommandee` : Brikka | Switch | Les deux (valeurs françaises
  fixes, les option des selects portent des attributs value explicites).
- `date_ajout` (AAAA-MM-JJ, local, jamais toISOString) : posée à la création
  d'un café (DATA.ajouterCafe), conservée à la modification (non éditable
  dans le formulaire). Pour l'existant, la migration (étape 5) la déduit de
  la première extraction du café; un café jamais extrait reste sans date.
- `actif` 0/1 : un café désactivé n'apparaît PLUS DU TOUT dans le select de
  saisie ni dans la saisie rapide. Exception : à l'édition d'une ancienne
  extraction, remplirSelectCafes(garderId) réinjecte l'option "(inactif)"
  pour que la valeur reste affichable. Dans la liste "Mes cafés", les
  désactivés sont toujours triés en fin de liste (tri stable, ordre
  d'origine conservé au sein de chaque groupe).
- Liste "Mes cafés" : chaque ligne porte un badge de note moyenne
  (.badge-note, "★ 7,4", moyenne des extractions notées du café, nombre
  d'extractions en title) et la date d'ajout dans la ligne méta
  ("ajouté le 12 août 2026", clé T li_ajoute, format via fmtDateCourte).

### extractions.csv
`id, date_heure, cafe_id, methode, recette, dose_g, eau_g, mouture_dial,
temperature_c, temps_total_s, temps_ecoulement_s, volume_extrait_ml,
eau_ajoutee_ml, lait_ml, agitation_nb, tasse, eau_prechauffee, note_sur_10,
diagnostic, descripteurs, commentaire, puissance_feu, ratee, chauffe_s`

- Seule la dose est obligatoire en saisie (étoile rouge). Date auto si vide.
- `volume_extrait_ml` : ancien nom `volume_tasse_ml`, accepté en lecture
  (normaliserExtraction fait le fallback).
- `eau_ajoutee_ml` : Brikka seulement, eau d'allongement APRÈS extraction,
  n'entre jamais dans le ratio. `lait_ml` : recettes au lait. Le calculé
  `volume_boisson_ml` = extrait + eau ajoutée + lait.
- `agitation_nb` : Switch, vide si pas d'agitation, défaut 1 quand coché.
- `eau_prechauffee` : Brikka, 1 ou vide. Décoché par défaut.
- `chauffe_s` : Switch seulement, secondes passées par la bouilloire sur le feu.
  La température stockée en est l'estimation (section 8), corrigeable. Vide pour
  la Brikka et pour tout l'historique antérieur à la v7.93, sans migration.
- `ratee` : 1 ou vide, vide veut dire « pas dit ». Voir section 8.
- VOCABULAIRE DE DÉGUSTATION : le groupe "Acidité" (v7.26) existe parce que
  l'acidité manquait comme AXE, seul "agrume" était présent et c'est un arôme.
  Distinction à ne pas perdre, c'est la confusion la plus coûteuse en dégustation :
  ACIDITÉ est une qualité positive (vivacité), AIGRE est un défaut de
  sous extraction. Mêmes acides, verdicts opposés. Et ASTRINGENT n'est pas un
  goût mais une sensation TACTILE, d'où sa place dans "Corps et texture" et non
  dans un groupe de saveurs. Le diagnostic historique "Sous-extrait (acide)" dirait
  mieux "aigre", mais le renommer casserait l'historique déjà enregistré : le
  vocabulaire a été ajouté côté descripteurs à la place.
- `puissance_feu` : Brikka SEULEMENT, entier de 1 à 10, échelle personnelle de
  Chris sur sa plaque. Vide pour le Switch, qui n'a pas de flamme. Borné et
  arrondi à la normalisation : une valeur hors plage éditée au tableur est ramenée
  dedans plutôt que jetée. Les recettes Brikka portent la même colonne, comme
  cible qui préremplit la saisie (au même titre que dose, eau et molette).
  Pourquoi ce champ : après une extraction à 4 minutes de cuisson suivie d'un
  écoulement de 5 secondes, la conduite de la flamme est devenue LA variable à
  régler, et elle n'était mesurée nulle part.
- `descripteurs` : tags séparés par `|`, valeurs françaises (la traduction EN
  est purement d'affichage). La liste vit dans DESCRIPTEURS_GROUPES
  (recettes.js), 69 tags en 10 familles. Chaque tag a une définition
  courte dans TAGS_INFO (i18n.js, fr et en), affichée dans une bulle CSS au
  survol ou au focus (attribut data-info, styles « [data-info] » dans
  ecrans.css). Ne pas mettre de guillemets doubles dans ces définitions
  (elles partent dans un attribut HTML).
- `diagnostic` : zéro, une ou PLUSIEURS valeurs de DIAGNOSTICS (recettes.js)
  séparées par `|` (choix multiple depuis la v7.2, une tasse peut être un
  peu amère ET astringente). Les anciennes lignes à valeur unique se lisent
  telles quelles (split sur `|`). 11 niveaux dont deux intermédiaires
  ("Un peu acide", "Un peu amer") entre Équilibré et les extractions ratées.
  Depuis la v7.19 ils sont GROUPÉS par levier de correction
  (DIAGNOSTICS_GROUPES dans recettes.js) : "Rien à changer", "Réglage
  d'extraction", "Répartition dans le panier", "Ratio café et eau", "Le café lui
  même". "Acide ET amer (extraction inégale)" est SEUL dans son groupe, et c'est
  le point : rangé avec les réglages il passait pour un raccourci redondant des
  deux valeurs acide et amer, alors qu'il nomme la CAUSE et pas les symptômes.
  Cocher acide et amer séparément empile deux corrections qui s'annulent, moudre
  plus fin ET moudre plus grossier; `majCorrectionDiagnostic()` détecte cette
  combinaison et affiche une alerte qui renvoie vers la valeur combinée. `DIAGNOSTICS` reste
  la liste à plat, dérivée des groupes, et garde son rôle pour l'ordre de
  stockage, le filtre de l'historique et l'anneau. Chaque axe va du léger au
  franc, avec un "un peu" partout : sans nuance on coche le cran du dessus par
  défaut et le diagnostic devient faux. Les noms de groupe passent par
  `I18N.groupe()`, donc par la carte GROUPES.
  Chaque diagnostic porte DEUX textes, assemblés par `infoDiagnostic()` en une
  bulle de deux lignes (`white-space: pre-line` sur la bulle) : QUAND le cocher
  (`DIAGNOSTIC_QUAND`, une sensation en bouche à reconnaître) puis QUOI faire
  (`DIAGNOSTIC_CORRECTIONS`). La correction seule disait quoi faire sans dire
  dans quel cas on se trouve, et une bonne correction appliquée au mauvais
  diagnostic empire la tasse suivante. Comme pour TAGS_INFO, aucun guillemet
  double dans ces textes, ils partent dans un attribut HTML.
  Chaque diagnostic a sa correction dans DIAGNOSTIC_CORRECTIONS (fr,
  traduite via I18N.tr donc la phrase exacte doit exister comme clé dans
  UI); les corrections des diagnostics cochés s'empilent sous les pilules
  (majCorrectionDiagnostic) et chaque pilule porte la sienne en bulle au
  survol. À l'enregistrement l'ordre stocké suit celui de DIAGNOSTICS. Le
  filtre de l'historique matche si la valeur fait partie de la liste.
  Ajouter une valeur ne casse rien; en retirer une casserait l'historique
  (les anciennes valeurs stockées resteraient affichées telles quelles,
  prévoir une migration).
- Champs calculés (DATA.calculs, jamais stockés) : ratio (1:X.X), crans,
  microns, age_jours, retention_ml (eau moins volume extrait),
  volume_boisson_ml, cout_tasse_vnd, cout_reel_vnd, cafe_nom, moulu.

### recettes.csv
`id, nom, numero, methode, famille, variante, sous_titre, dose_g, eau_g,
temperature_c, temp_texte, mouture_dial, ratio_texte, total_texte, lait,
etapes, pour_qui, cafes_associes, note, par_defaut, avancee, variantes, actif`

- `etapes` : segments "m:ss texte" ou "- texte" séparés par " || ".
- `famille` + `variante` : les recettes d'une même famille partagent UNE
  carte sur la page Référence avec des pilules de bascule (familles :
  chronicler, costaud, brikka-lait, brikka-classique). Elles restent des recettes DISTINCTES
  en base et dans l'historique.
- `lait` 0/1 : affiche le champ lait en saisie, prérempli contenance de la
  tasse moins volume de café estimé.
- `variantes` 0/1 : active le bloc Tetsu (versements pilotables) : réservé au
  Tetsu 4:6, préservé à l'édition.
- Les 11 recettes d'origine (RECETTES_DEPART dans recettes.js) sont
  restaurables une par une via "Rétablir la version d'origine".

Recettes d'origine (v7.92) : trois Brikka, Brikka classique et sa variante
(eau préchauffée), famille brikka-classique, et Brikka au lait ; huit Switch,
dans l'ordre d'affichage : The Coffee Chronicler's Recipe et (Sweet), famille
chronicler, 15 g / 240 g ; Better 1 Cup (Hoffmann), 15 g / 250 g, percolation
pure en cinq versements ; One and Done (Lance Hedrick), 15 g / 225 g, deux
blooms puis un versement ; Le Costaud (Bloom) et (Immersion), famille costaud ;
Tetsu 4:6 (variantes ; « The Tetsu Devil » jusqu'à la v8.65, pas de schéma v17) ; La Sherrycipe. Toutes portent la molette 1.5.0,
la mouture que leur source recommandait est dans leur `note`. L'ordre
d'affichage suit `RECETTES_DEPART` pour les recettes d'origine, les personnelles
viennent après : `migrerDonnees` le rétablit à chaque chargement.

### tasses.csv
`id, nom, contenance_ml`. Quatre par défaut (TASSES_DEPART) : Flat White Egg
150, Espresso Egg 80, Nutty Tasting Cup 150, Classic Mug 330. Éditeur inline
dans la saisie (bouton ✚). Défauts par méthode : Flat White Egg en Brikka,
Classic Mug en Switch (non écrasés si l'utilisateur a choisi autre chose).
La contenance sert au calcul du lait. Elle ne déclenche PLUS aucun avertissement
de débordement (retiré en v7.28) : celui-ci supposait un service en une seule
fois, alors qu on peut verser en deux, ce qui le rendait faux dans un usage
normal. Un avertissement qui se trompe apprend à ignorer les avertissements.

### achats.csv

`id, cafe_id, date_achat, format_grammes, prix_vnd, date_torrefaction`

Un achat = UN SACHET. Cette table existe pour deux raisons, la seconde étant la
plus importante :

1. Le stock restant devient calculable (format du sachet moins les doses
   consommées DEPUIS sa date d'achat).
2. Un café racheté gardait auparavant UNE seule date de torréfaction, celle du
   tout premier paquet. La fraîcheur affichée était donc fausse pour toujours dès
   le deuxième sachet. Chaque sachet porte maintenant la sienne.

- `DATA.sachetCourant(cafeId)` : le dernier acheté, par `date_achat`.
- `DATA.stockSachet(cafeId, doseDefaut)` : `{format, consomme, restant, depuis,
  dateTorrefaction, sachets}`, ou `null` si aucun format n'est connu (on
  préfère ne rien afficher qu'un badge faux). Ne comptent QUE les extractions
  postérieures à `date_achat` : c'est tout l'intérêt de la table. Une extraction
  sans dose compte pour la dose par défaut, sinon un oubli de saisie ferait croire
  à un sachet intact. Un dépassement s'affiche en NÉGATIF, on ne le masque pas.
- `DATA.ajouterAchat()` recopie format, prix et date de torréfaction sur la fiche
  café, pour que tout ce qui lit encore la fiche reste cohérent avec le sachet en
  cours.
- Badge dans la liste "Mes cafés" : vert, orange sous 3 tasses restantes, rouge
  et nom barré quand le sachet est fini.
- Détection à l'import : `date_achat` est testé AVANT `cafe_id`, que les deux
  tables possèdent.

## 4. Migrations : une version de schéma

`migrerDonnees()` (dans `js/data-migrations.js`, lié à l'état par `pour(state)`)
fait deux choses de nature différente :

- **Les rattrapages IDEMPOTENTS**, en tête de fonction : renommages de recettes,
  fiches café complétées, tasses par défaut, date d'ajout déduite, puissance de
  feu des extractions historiques, sachet implicite. Ils se reconnaissent à leur
  condition (« si le champ est vide », « si le tag est absent »), donc les rejouer
  ne fait rien. Ils tournent à chaque démarrage.
- **Les rattrapages À USAGE UNIQUE**, dans `PAS_DE_SCHEMA`. Ils changent une
  valeur SEMÉE vers une autre, donc les rejouer écraserait un réglage choisi
  entre temps. Leur mémoire est `schema_version`, rangée dans la ligne `reglages`,
  donc synchronisée avec les données. `appliquerSchema()` exécute les pas dont le
  numéro dépasse la version du document, puis écrit `SCHEMA_ACTUEL`.

POUR AJOUTER UNE MIGRATION : un pas de plus à la FIN de `PAS_DE_SCHEMA`, avec le
numéro suivant, et `SCHEMA_ACTUEL` incrémenté. **Ne jamais renuméroter, ne
jamais insérer au milieu** : le numéro déjà écrit chez Chris est une promesse.
Chaque pas ne touche QUE la valeur semée d'avant. Modifier `RECETTES_DEPART` ne
change rien pour une installation existante : tout changement de valeur par
défaut passe par un pas de schéma. Les tests font tourner le moteur sur quatre
scénarios (sans version, déjà migré, en retard, rejeu après réglage manuel).

Pourquoi une version et pas des drapeaux : `DECISIONS.md`, « Migrations ».

## 5. i18n

Français par défaut, bouton EN/FR au pied du rail (dans la feuille « Plus » sur
téléphone), choix dans localStorage.
Trois mécanismes :

1. `UI` : dictionnaire "fragment français exact vers anglais". Au premier
   passage en anglais, un TreeWalker parcourt les NOEUDS DE TEXTE du document
   (hors PRE, CODE, TEXTAREA et hors zones rendues en JS, liste ZONES_JS) et
   remplace ceux dont le texte trimé est une clé du dictionnaire. Le français
   d'origine est mémorisé pour la bascule retour. CONSÉQUENCE : toute
   nouvelle chaîne statique du HTML doit être ajoutée TELLE QUELLE (même
   ponctuation) comme clé dans UI. Les fragments coupés par des balises
   (`<b>` au milieu d'une phrase) sont des noeuds séparés : une clé par
   fragment.
2. `T` : gabarits fr/en avec variables `{x}` pour les chaînes construites en
   JS (`I18N.t("cle", {x: 1})`). Tout texte généré par app.js, charts.js ou
   grind.js passe par là.
3. Cartes d'affichage pour les VALEURS DE DONNÉES : `I18N.diag()`,
   `I18N.tag()`, `I18N.tagInfo()` (définition courte d'un descripteur,
   carte TAGS_INFO {fr, en}), `I18N.groupe()`, `I18N.tr()` (phrases
   mémorisées comme les corrections de diagnostic ou les variantes du
   Tetsu). Les valeurs stockées restent françaises, seul l'affichage change.

À la bascule, app.js `rafraichirLangue()` re-rend tout ce qui est généré.
`I18N.mol()` traduit le "à" des plages de molette ("0.8.3 à 1.5.4").

**Les attributs suivent la même règle que le texte.** `scanner()` enregistre
`placeholder`, `title` et `aria-label`, mais SEULEMENT s'ils ont une entrée au
dictionnaire `UI` de `js/i18n.en.js`. Toute nouvelle chaîne visible, texte ou
attribut, doit donc exister en anglais ; deux tests le refusent sinon. Les zones
régénérées par le JS (`ZONES_JS`) sont exclues du registre : le code qui les
régénère traduit déjà ce qu'il écrit. Détail et pièges : `DECISIONS.md`.

## 6. Le moulin (js/grind.js)

Base officielle Timemore : 8,32 µm par cran, 50 crans par rotation, butée
150 crans = 1248 µm. `parseDial("1.5.0")` retourne {rotation, numero, cran,
crans, microns} ou null. 13 méthodes officielles (GRIND.METHODES) avec bornes
en microns ET en crans (Espresso 178 à 380, Moka Pot 358 à 659, Steep 447 à
825...). La notation molette est calculée, bornée à 3.0.0.
`verifierPlage(methode, dial)` valide contre Moka Pot (Brikka) ou
Steep-and-release (Switch), messages non bloquants.
GRIND.REFERENCES : 1.2.0 Brikka bleu, 1.5.0 commun vert, 1.6.0 et 2.0.0
Switch orange. Note : les microns affichés statiquement sont des "environ"
recalculés en base 8,32 (500, 624, 666, 832).

Dans l'écran Guide, le moulin est un RÉGLAGE, pas un convertisseur : curseur en
crans, repères cliquables, conseil vivant, bouton qui pose `replis.molette` (la
même source que l'écran Paramètres). Raisons et pièges : `DECISIONS.md`.

## 6 bis. Tableau de bord (js/ui-tableau.js)

Quatre rangées sur une grille de DOUZE colonnes : la carte principale sur huit,
les autres sur quatre (`.col-2` vaut `span 8`, le défaut `span 4`).

- **Dernière tasse** : le café en serif, la ligne de contexte (machine, recette,
  dose, temps, température, feu), les goûts, le commentaire, puis un pied avec
  ratio, mouture, écoulement et coût (`piedDerniere`), et la note en gros à
  droite derrière un filet. Cliquer la carte ouvre l'extraction.
- **Chiffres clés** : quatre tuiles (aujourd'hui, cette semaine, note sur
  7 jours, régularité) plus trois lignes alignées en bas de carte pour le total,
  la note globale et la caféine (`#kpis-secondaires`, un `<ul>`).
- **Graphe 30 jours** : Chart.js, deux bandes sur le même axe des jours (v8.39), la
  note en haut, les tasses dessous. Depuis la v8.58 les tasses sont UN PAVÉ PAR TASSE :
  un jeu de barres empilées par rang de tasse (`pave: 1, 2, …`), séparées par un
  filet de la couleur de la carte ; l'échelle s'arrête au plus gros jour (au moins 2)
  avec un repère par tasse. L'infobulle ne montre que le premier pavé, qui porte le
  total du jour. Depuis la v8.61 chaque pavé a la couleur de SON café (jetons
  `--cafe-1` à `--cafe-5`, les cinq cafés les plus bus du mois, gris pour le reste) :
  `UI.rendreCafes30j(exts)` (ui-dessins.js) calcule le rang de couleur de chaque
  tasse et écrit la légende `#legende-30j`, une pastille par café qui ouvre sa fiche
  (`data-fiche`). Les pavés sortent de la légende Chart.js.
- **Ce que tes données disent** : les insights, sur carte sombre.
- **Les 5 dernières** : une table, une ligne par tasse plus le commentaire
  tronqué sur une seconde ligne. Largeurs imposées par `<colgroup>`.
- **Calendrier** : le nombre de semaines se calcule depuis la largeur du
  conteneur (`semainesVisibles()`), la même valeur sert à la grille, au titre et
  aux cinq chiffres du dessous. Légende de l'échelle, puis les mini statistiques
  en deux colonnes. Un rattrapage unique recompte après la mise en page, et `app.js`
  redemande un rendu au redimensionnement.
- **Arranger** (v8.57, `#dessins-arranger`, `#dessins-panneau`) : quels dessins voir et
  dans quel ordre. Chaque dessin porte `data-dessin` ; le choix vit dans la colonne
  `dessins` de la ligne de réglages (« etagere,!horloge,… », « ! » = masqué), donc se
  synchronise. `UI.ordreDessins()` y ajoute en fin de liste, visible, tout dessin
  inconnu du choix enregistré ; un dessin masqué n'est pas calculé.
- **Chaque point est une tasse** (v8.55) : tout point de dessin qui représente une
  tasse porte `data-tasse="<id>"` (horloge, spectre, carte du moulin, trajectoire,
  courbe de la fiche). Un clic, capté en phase de capture sur `#carte-dessins` et
  `#fiche-contenu`, ouvre `#bulle-tasse` : date, café, recette, réglages, goûts,
  note, et « Modifier » (`chargerExtractionDansSaisie`) ou « Refaire »
  (`refaireTasse`). La bulle est déplacée dans le `<dialog>` ouvert s'il y en a un,
  sinon elle passerait sous la couche du dessus. Elle se ferme au clic ailleurs, à
  Échap et au défilement.
- **Récap de la semaine** (v8.51, `#carte-recap`, `UI.donneesRecap()` dans
  js/ui-dessins.js) : la semaine passée, lundi à dimanche, en tête du tableau de bord
  pendant la semaine suivante, jusqu'à « Refermer » (localStorage `recap-ferme`, clé
  = le lundi de la semaine résumée). Tasses, moyenne, meilleure tasse, barres par
  jour, et des FAITS seulement s'ils sont vrais : écart avec la semaine d'avant (0,4
  point, trois notées de chaque côté), café qui fait la moitié des tasses, sachets
  ouverts. Rien sous deux tasses.
- **Tes cafés en dessins** (v8.49, `#carte-dessins`, js/ui-dessins.js) : quatre
  dessins, chacun raccourci vers la page qu'il résume (`data-raccourci` : cafes,
  historique, diagnostics, moulin). L'étagère (un bocal par café actif avec sachet,
  le moins rempli d'abord, liseré selon la fenêtre de fraîcheur de la fiche ; un bocal
  porte `data-fiche` et ouvre la fiche), l'horloge (tasses notées des 90 derniers
  jours à leur heure, rayon selon la note, couleur de la machine), le spectre (position
  d'un diagnostic = le sens de mouture de `DIAGNOSTIC_LEVIERS`, « Équilibré » au
  centre, une rangée par recette dès trois tasses), la carte du moulin (microns sur la
  plage `GRIND.METHODES`, zone dorée = les trois crans à la meilleure moyenne dès
  trois tasses). Rendus par `UI.rendreDessins()`, appelé par `rendreEcranCourant` et
  à chaque notification de données sur le tableau de bord.
  Depuis la v8.53, trois de plus : la frise des sachets (`UI.donneesFrise()` : un ruban
  par sachet des 90 derniers jours, de l'ouverture ou l'achat à la dernière tasse de
  ce café avant le sachet suivant, ou à aujourd'hui s'il est en cours et pas vide ;
  teinte = note moyenne ; un ruban ouvre la fiche), le podium des recettes
  (`UI.donneesPodium()` : les trois meilleures moyennes dès trois tasses notées ; une
  marche porte `data-guide-recette` et ouvre la recette par `UI.montrerRecette()`), et
  ta progression (`REGLAGES.moyenneGlissante` sur cinq tasses, jalons = sachets
  ouverts et premières tasses de chaque recette, les trois derniers nommés).
- **Analyses** : note par café, Brikka contre Switch, goûts, arômes, diagnostics,
  note contre mouture, note par recette. L'onglet Arômes (v8.45) est la roue
  `CHARTS.roueAromes()`, SVG maison : familles de `DESCRIPTEURS_GROUPES` au centre,
  goûts autour, arc proportionnel au nombre de coches, opacité de l'accent selon la
  note moyenne (5 pâle, 8,5 plein). La famille choisie est gardée par roue, entre
  deux rendus. Rend le nombre de goûts dessinés, zéro montre la carte vide.

## 6 ter. Le Guide en bibliothèque (js/ui-guide.js, v8.52)

Le sommaire (`.guide-onglets`) est la barre d'onglets du Guide : chaque section
est enveloppée dans un `.guide-panneau` (`#gp-recettes`, `#gp-moulin`,
`#gp-diagnostic`, `#gp-regles`, `#gp-vocabulaire`, `#gp-boutiques` qui porte aussi
Quoi acheter et Règles d'achat, `#gp-materiel`, `#gp-messages`), un seul visible.
`UI.montrerGuide(idCible)` montre le panneau qui contient la cible et y défile si
elle n'est pas son titre ; l'onglet est retenu (localStorage `guide-onglet`),
Recettes par défaut. L'ordre du HTML ne change pas, un test le garde.

Les recettes ont des filtres (`#biblio-filtres` : machine, cafés lavés, naturels et
fermentés, localStorage `guide-filtre`). Le profil d'une recette
(`UI.profilsRecette`) se lit dans son « Pour qui », la première phrase d'abord ;
sans profil lisible elle paraît sous les deux. Chaque carte porte « Chez toi » :
la moyenne des tasses notées de cette recette (`UI.chezToi`).

## 7. Graphiques (js/charts.js)

Chart.js pour : barres + note + grammes 30 jours (3 datasets, tooltip avec
caféine et cafés du jour), barres horizontales (par café, par recette),
comparatif Brikka/Switch, nuages (note contre mouture, note contre âge),
anneau des diagnostics. SVG maison pour : heatmap calendaire (clés de date
LOCALES, jamais toISOString) et `diagramme()`, la reproduction du diagramme
officiel du C5 ESP (rangées identiques à Microns.png, axe rotations en haut,
microns en bas, bandes, zone hachurée après 1248, marqueurs personnels,
surlignage des méthodes compatibles avec le convertisseur). Tooltips SVG
maison via data-tip. Les couleurs de thème sont lues des variables CSS à la
création : à chaque changement de thème ou de langue, les graphes sont
re-créés.

Chart.js est chargée à la demande par `chargerChart()` : toutes les fonctions
Chart.js passent par `creer()`, point d'entrée unique avec file d'attente (le
dernier appel par canvas gagne). Le SVG maison ne passe jamais par cette file.
Les couleurs des séries : trois jetons protégés pour les machines (`--brikka`,
`--switch`, `--deux`), et une série qui ne parle pas d'une machine ne les
emprunte jamais (`--tendance`, `--grammes`). Pourquoi : `DECISIONS.md`, « Une
couleur, une série ».

## 8. Saisie (js/ui-saisie.js, js/ui-chrono.js, js/ui-rapide.js)

- Préremplissage au choix du café : méthode et recette recommandées, dose et
  molette de la recette. L'EAU RESTE VIDE (elle se lit sur la balance, Chris en a une) et la température
  part sur 95 (eau bouillie qui a fini de buller). Les cibles de la recette
  restent visibles dans le panneau latéral (fiche recette complète : chips,
  étapes, pour quels cafés, cafés associés, note, pas à pas) et la fiche du
  café (profil, pastilles, prix au gramme, fraîcheur).
- Avertissements non bloquants (recommandations, plage de mouture) et
  BLOQUANTS (café non pur ou rang bơ en Switch : `cafeInterditSwitch`,
  `avertissementsCombinaison` retourne {msgs, bloque}).
- Mise en page : le formulaire à gauche, une colonne fixe de 360 px à droite.
  Le CHRONO est un enfant direct de `.saisie-layout`, placé AVANT le formulaire
  dans le DOM et remis en haut de la colonne de droite par la grille
  (`grid-row: 1`). Sous 1024 px la mise en page passe en bloc et il devient un
  bandeau collé en haut. Il vit replié, s'ouvre au démarrage et refuse de se
  replier tant qu'il tourne ; le temps et le palier courant se lisent dans son
  entête.
- Le formulaire est en trois blocs numérotés : le café et la recette, les
  réglages (avec le pied ratio, microns, coût, caféine), en bouche. Les familles
  de goûts se replient : deux visibles plus celles qui contiennent un goût
  coché, le reste derrière un bouton, choix en localStorage.
- Champs hors du `<form>` (date, chrono) : ils portent `form="form-saisie"`.
- Chrono unique (`js/ui-chrono.js`) : Démarrer / Pause / Reprendre (cycles
  illimités) / Arrêter et reporter / RAZ. Paliers minutés extraits de la recette sélectionnée,
  étape courante en gros, suivante avec décompte, bip WebAudio doux (880 Hz)
  à chaque palier, coupable (préférence localStorage "bips"). L'écoulement
  est déduit : temps de l'étape contenant "ouvrir" jusqu'à l'arrêt.
- Champs conditionnels : eau préchauffée (Brikka, décoché par défaut), ajout
  d'eau (Brikka), agitation (Switch, auto-cochée si la recette mentionne
  remuer, valeur 1), lait (recettes lait, recalculé au changement de tasse),
  tasse avec défaut par méthode.
- Volume extrait : estimation cliquable (Brikka : eau moins 0,7 fois la
  dose; Switch : eau moins 2,1 fois la dose, le papier retient environ
  2 g/g).
- Caféine estimée : dose x pourcentage café réel x pourcentage caféine de
  l'espèce (arabica 1,2, robusta 2,4, blend 1,8, liberica 1,4) x 0,9.

Points fixés depuis, chacun expliqué dans `DECISIONS.md` :

- Le blocage des cafés non purs en Switch a été RETIRÉ (v7.34) : le carnet ne
  refuse jamais une saisie, il informe.
- La note est FACULTATIVE : le curseur part SANS POUCE (classe `curseur-inactif`,
  lue par `UI.noteVide()`, posée par `UI.marquerNote()`, v8.40), et un curseur
  sans pouce enregistre une note vide, qui ne devient jamais 0. Le premier
  toucher sur la piste note ; « Effacer la note » y ramène.
- Le champ mouture préremplit le RÉGLAGE RÉEL du broyeur (`replis.molette`), pas
  la cible de la recette.
- Pas d'estimation de volume extrait sur la Brikka ; le Switch garde
  `eau - 2,1 x dose`.
- Les paliers d'une recette suivent l'eau réellement saisie
  (`echelleVersements`, seuil 30 g).
- Cinq champs portent un curseur qui PILOTE le champ nombre, lequel reste la
  source de vérité.
- Le brouillon vit en `localStorage`, 24 h (2 h pour la date), écrit sur
  `visibilitychange`.
- Arriver sur Saisie par la navigation abandonne toute édition en cours, avec un
  toast.
- Une extraction peut être marquée RATÉE : elle compte dans ce qui décrit ce qui
  s'est passé, pas dans ce qui conseille (`extAnalysables()`). La bascule qui
  les réintègre vit dans Paramètres, section Cet appareil (préférence locale).
- Chaque recette porte un lien `video` (v8.64, colonne de `RECETTE_COLS`, http ou https seulement). Dans le Guide, un lien YouTube donne « Voir la vidéo », qui remplace le bouton par un lecteur youtube-nocookie au clic, et « Ouvrir sur YouTube » ; tout autre lien donne « Voir la source ». Le pas de schéma v16 donne leur vidéo aux recettes d'origine déjà stockées, sans écraser un lien posé à la main.
- La température du SWITCH se déduit du temps passé par la bouilloire sur le
  feu (`f-chauffe-min` et `-sec`, stocké dans `chauffe_s`) : une courbe de
  28 à 100 °C (v8.59, montée qui ralentit près de l'ébullition) calée sur deux
  repères de la carte Ma bouilloire, les premières bulles qui remontent à 88 °C
  (`reglages.bulles_s`, 1:30 par défaut) et le gros bouillon à 100 °C
  (`reglages.ebullition_s`, 2:00 par défaut ; le pas de schéma v11 recale le
  4:00 inventé des premières versions sur 2:00, le pas v15 fait passer sur la
  courbe les degrés estimés sous l'ancienne droite et jamais retouchés). Fonctions pures
  `temperatureDepuisChauffe` et `chauffePourTemperature` dans `recettes.js`. Le
  degré estimé s'écrit dans `f-temp`, reste modifiable et reste la valeur
  stockée ; l'aide sous le champ dit combien de temps viser pour la cible de la
  recette. Le temps d'ébullition vaut ZÉRO tant qu'il n'est pas chronométré, et
  alors rien n'est estimé. Rien de tout ça pour la Brikka : le champ Température
  ENTIER est masqué (`#champ-temp`, v7.94) et rien n'est enregistré, l'eau
  chauffe dans la chaudière. Sa seule option est la case « eau préchauffée »,
  toujours visible sur la Brikka, décochée par défaut ; sur la famille
  brikka-classique elle et la variante de recette se pilotent l'une l'autre
  (`surPrechauffe`). L'ancien menu de méthodes de chauffe a disparu en v7.93.
- Le formulaire est découpé en trois `<section class="saisie-bloc">` titrées
  (v7.95) : café et recette sur une rangée (`.saisie-tete`), réglages avec la
  ligne live en pied, en bouche. Les identifiants de champs n'ont pas changé.
- Les cinq dernières extractions du tableau de bord montrent, sous les mesures,
  les goûts cochés (quatre au plus, puis « +n ») et le commentaire tronqué à
  110 caractères ; le texte complet reste au survol (v7.94).
- CORRECTION CHIFFRÉE (v8.48) : `REGLAGES.correctionChiffree(ext, replis.pas, moulu)`
  transforme les diagnostics cochés en réglages. Trois sources, aucune en dur dans le
  calcul : le SENS de chaque levier dans `DIAGNOSTIC_LEVIERS` (recettes.js, à côté
  des phrases qu'il traduit ; un test vérifie qu'ils disent la même chose), les PAS
  dans la ligne de réglages (`pas_crans`, `pas_degres`, `pas_feu`, `pas_eau_g`,
  `pas_dose_g`, carte Paramètres « Mes pas de correction », doublés pour un
  diagnostic franc), et la valeur de départ de la tasse, la molette bornée à la
  plage de sa machine (`GRIND.METHODES`). Leviers dans l'ordre mouture, chaleur
  (degrés au Switch, feu à la Brikka), ratio (eau au Switch, dose à la Brikka).
  Affichée en direct sous les corrections (`.corr-chiffree`), et proposée après
  l'enregistrement par un message à action « Préparer la prochaine », qui charge les
  réglages corrigés dans la saisie (brouillon). Rien ne change sans ce clic.
- TASSES JUMELLES (v8.44) : `#aside-jumelles`, entre la fiche recette et la fiche
  café, montre les trois tasses notées les plus proches du formulaire, calculées par
  `REGLAGES.jumelles()` : même recette et molette à `JUMELLE_CRANS` (3) crans près,
  même café devant ; pour un café déjà moulu, même recette sur le même café. PAS de
  critère de température ni de dose, à la demande de Chris. Chaque ligne dit en quoi
  elle diffère (autre café, molette, température du Switch, feu de la Brikka). Sous
  deux jumelles la carte se cache. Ratées exclues, tasse en cours d'édition aussi.
- Le commentaire se DICTE (v8.43) : `UI.brancherDictee()` pose la reconnaissance
  vocale du navigateur (`SpeechRecognition`, préfixée `webkit` sur Chrome et Safari)
  sur `#f-dicter`. Le bouton n'existe que si l'API est là ET que `navigator.onLine`
  est vrai, la reconnaissance passant par les serveurs du navigateur ; il se cache
  hors ligne. Le texte dicté s'ajoute au commentaire et reste modifiable.
- La saisie rapide enregistre SANS note par défaut, comme le formulaire complet :
  curseur sans pouce à chaque ouverture, même mécanisme (`UI.brancherNote`).

## 8 quater. Le mode Brassage (js/ui-brassage.js)

Le chrono de la saisie en plein écran, ouvert par `#btn-brassage` dans le widget du
chrono. PAS un second chrono : il lit `UI.chrono` et appelle `chronoPrincipal`,
`chronoArreter`, `chronoRaz` ; bips, vibration (Android) et verrou d'écran sont ceux
du chrono. Fermer le mode laisse le chrono tourner. Un minuteur de 250 ms repeint tant
qu'il est ouvert.

- La cible du palier courant est le volume CUMULÉ lu dans le texte de l'étape
  (`UI.cibleVersement` : « jusqu'à N g », « à N g », sinon le premier « N g »),
  affiché en g par défaut depuis la v8.74 (Chris a une balance), en ml par la bascule `.br-unite`, retenue
  en localStorage (`brassage-unite`). Le texte des recettes n'est jamais réécrit. Une
  étape sans volume met sa consigne en grand.
- Badge de vanne au Switch, déduit des étapes passées (« OUVERTE », « FERMÉE »,
  « Ouvrir »).
- Anneau : le total de la recette (`totalTexte`), sinon dernier palier plus une minute,
  sinon la moyenne des temps de cette recette, sinon 5:00.
- Arrêter depuis le mode reporte temps et écoulement comme le chrono, puis montre la
  note (`#br-note`, même curseur sans pouce) qui écrit dans `#f-note`, et deux boutons :
  Enregistrer la tasse (soumet le formulaire) ou Compléter la saisie.

## 8 ter. La fiche d'un café (js/ui-fiche.js)

Dialogue `#modale-fiche`, ouvert par tout bouton `data-fiche="<id café>"` (clic
délégué sur le document) : les cartes de « Mes meilleurs réglages » et les lignes de
« Mes cafés » en portent un. `UI.ouvrirFiche(id)` rend `#fiche-contenu`, re-rendu à
chaque notification de données et à la bascule de langue tant qu'il est ouvert.

- **Sachet en cours** : `DATA.stockSachet`, tasses restantes à la dose moyenne du
  café, « Réachat conseillé » sous `REACHAT_TASSES` (3) avec le lien de la boutique du
  Guide retrouvé par le torréfacteur (`.boutique h3`).
- **Fenêtre de fraîcheur APPRISE** (`UI.fenetreFraicheur`) : les tasses notées par
  tranche de jours depuis l'ouverture (`TRANCHES_SACHET`, jours_ouvert de
  `DATA.calculs`), les tranches d'au moins `MIN_TRANCHE` (3) tasses au-dessus de la
  moyenne du café, de la première à la dernière, bornées au dernier jour goûté. Il faut
  deux tranches documentées et au moins une en dessous, sinon pas de fenêtre. Les jours
  s'affichent à partir de 1 (jours_ouvert + 1).
- **Courbe** SVG maison : chaque tasse en point, la moyenne par tranche en ligne, la
  fenêtre en fond, aujourd'hui en pointillé.
- **Goûts** : la roue `CHARTS.roueAromes` en petit, sur les tasses de ce café.
- **Dessins** (v8.50, js/ui-dessins.js) : l'empreinte (radar des familles de goûts,
  part de chaque famille sur ce café contre tous les cafés, chaque profil ramené à
  sa famille la plus cochée), la trajectoire (molette contre degrés au Switch ou feu
  à la Brikka, dans l'ordre des tasses, sur la recette la plus faite de ce café) et
  la carte du moulin restreinte à ce café.
- **Meilleur réglage** : `UI.carteReglage` sur `REGLAGES.pourCafe`, son entête masqué.
- **Dernières tasses** : les cinq plus récentes, ratées comprises.
- **Comparer avec un autre café** (v8.56) : un menu en pied de fiche (`#fiche-comparer`,
  les cafés qui ont au moins une tasse). Le choix, gardé tant que la fiche reste sur
  ce café, rend `#fiche-comparaison` : les deux empreintes superposées
  (`UI.dessinerEmpreinte(id, a, b)`) et un tableau face à face, moyenne, machine,
  meilleur réglage, fenêtre de fraîcheur, coût par tasse, goût qui revient.
- Pied : Brasser ce café (saisie neuve sur ce café, `surChoixCafe`), Modifier le café,
  Fermer.

La démo ouvre chaque sachet le jour de son achat (`chargerDemo`) : sans date
d'ouverture aucune tasse n'avait de jour du sachet.

## 8 bis. Historique (js/ui-historique.js)

DEUX rendus de la meme liste, choisis a 1024 px par `enCartes()` :

- **Ordinateur** : une table de DIX colonnes (date, cafe, machine, recette, dose
  et eau, mouture, ratio, note, gouts et diagnostic, actions). Largeurs par
  `<colgroup>` dans `index.html` : pixels pour les colonnes chiffrees et les
  actions, rien pour cafe, recette et gouts qui se partagent le reste et passent
  a la ligne au lieu de se tronquer (un test verifie cette repartition). Microns
  et ratio en tasse sur une seconde ligne (`small.sous`). Le commentaire prend sa
  propre ligne en pleine largeur sous sa tasse. Le temps, les degres, le feu et
  le reste vivent dans la FICHE AU SURVOL (`brancherFiche()`, souris seulement),
  qui ne repete pas le commentaire. Plus de fleche de depliage (v8.33). PAS
  d'intertitre de jour : la date complete est
  au debut de chaque ligne (v8.29, demande de Chris).
- **Telephone** : une liste de cartes, chacune avec sa date complete. Pas de
  survol au doigt : le detail s'y deplie par le bouton texte « Voir le detail ».

Les cinq actions viennent de `actionsExtraction()` et le detail de
`detailContenu()`, appeles par les DEUX rendus : c'est ce qui garantit qu'un
geste disponible sur ordinateur l'est aussi sur telephone, et un test le
verifie. Le clic est delegue sur `data-action` et `data-id`, attache aux deux
conteneurs (`#h-corps` et `#h-cartes`).

Au dessus : une tete de page (total et depuis quand, recherche, export), les
filtres en pastilles (des `<select>` natifs habilles), et un bandeau resume du
filtre courant en quatre chiffres. Les cinq actions sont des icones en trait (`UI.icone`), avec les memes `data-action` qu'avant.

## 9. Synchronisation entre appareils

Active UNIQUEMENT sur le site déployé, et seulement si une base D1 est liée. En
`file://`, ou sans base, `SYNC.disponible()` est faux et tout se comporte comme
avant. La démo n'est JAMAIS synchronisée (`syncPossible()` teste `demoActive`).

Modèle : tout l'état dans UN document JSON, une ligne D1. Fusion ligne par ligne,
le plus récent `maj_le` gagne, plus des PIERRES TOMBALES (`state.tombes`,
`{table: {id: horodatage}}`) purgées après 90 jours. Commutative et idempotente.
Pourquoi D1 et pas KV, pourquoi un document et pas des tables : `DECISIONS.md`.

### Ajouter une table : le piège qui ne fait aucun bruit

La liste des tables synchronisées est écrite DEUX FOIS, dans `worker/sync.js`
(`TABLES`) et dans `js/sync.js` (`TABLES`). Oublier l'une des deux fait que la
table ne se synchronise pas, EN SILENCE, sans erreur ni message. Il faut aussi
l'ajouter à `chargeUtileLocale()`, à l'adoption dans `synchroniser()`, à
`sauverLocal()` et à `init()` dans data.js. Les suites de tests comptent les
tables présentes, donc elles échouent si un oubli traîne : ne pas se contenter de
mettre le compte à jour sans vérifier la cause.

### maj_le, le piège à ne pas défaire

`maj_le` est ajouté par les `normaliserX` mais **préservé tel quel**, pas
restampé. `normaliserX` est appelé au CHARGEMENT comme à l'écriture : restamper
au chargement ferait croire à chaque appareil qu'il est le plus récent et la
fusion ne voudrait plus rien dire. Ce sont les MUTATIONS qui estampillent, via
`estampiller()`, explicitement.

`maj_le` n'est JAMAIS dans les CSV : les colonnes exportées sont listées à la
main (`CAFE_COLS` et compagnie), donc les fichiers restent identiques à avant et
lisibles au tableur.

Comme les CSV ne transportent pas `maj_le`, relire le dossier lié remettrait
tous les horodatages à zéro. `reporterHorodatage()` l'empêche : il reporte
l'horodatage déjà connu en mémoire sur la ligne relue, et n'estampille à
maintenant que si le CONTENU a changé (édition au tableur : geste délibéré, elle
doit gagner) ou si la ligne est nouvelle.

CE N'EST PAS UNE OPTIMISATION, c'était un vrai bug de perte de données, trouvé en
inspectant D1 après la première synchro réelle (32 lignes sur 32 à `maj_le = 0`).
Séquence : modifier une extraction hors ligne, RECHARGER la page avant que la
synchro passe, et la version du serveur, elle estampillée, écrasait la
modification. Le test 7 de `tools/data.test.mjs` verrouille les trois cas.

Un IMPORT explicite (v8.71) FUSIONNE par identifiant au lieu de remplacer la
table : une ligne absente du fichier reste en place, une ligne identique garde
sa date, seules les lignes nouvelles ou changées sont estampillées. Chaque
table a sa branche (les achats écrasaient les extractions avant), une table
inconnue est refusée, et un aperçu demande confirmation. Le fichier
`carnet-complet.json` d'« Exporter tout » se réimporte par la même fusion que
la synchro.

### Mécanique

`persister()` planifie une synchro débouncée à 1,5 s : une rafale d'édition ne
produit qu'une requête. `synchroniser()` envoie l'état local, le serveur
fusionne et renvoie le résultat. Depuis la v8.71 le client FUSIONNE cette
réponse avec son état tel qu'il est au retour (`SYNC.fusionner`, la même règle
que le serveur, un test compare les deux) : une tasse saisie pendant l'échange
n'est plus perdue. Un compteur de génération relance une synchro si quelque
chose a bougé pendant le vol, et une synchro demandée pendant une autre repart
à la fin. Elle ne rappelle PAS `persister()`, ce qui bouclerait. En cas
d'échec les données locales sont laissées intactes et une relance part après
5 s, 15 s, 1 min, puis toutes les 5 min ; au retour sur l'appli
(`visibilitychange`) aussi.

**Garde-fous de la v8.71.**
- Identifiants : `nouvelId` produit l'heure en base 36 et quatre caractères au
  hasard. « Longueur + 1 » faisait créer « e124 » aux deux appareils, et la
  fusion écrasait l'une des deux tasses.
- À égalité de `maj_le`, union des champs (le JSON le plus grand l'emporte sur
  un conflit, pour rester commutatif) : un onglet sur une ancienne version ne
  peut plus effacer une colonne récente.
- Version du schéma : la charge utile porte `schema`, le document garde la
  plus haute ; un onglet plus ancien reçoit un 409 `version-perimee` et
  l'appli propose de recharger.
- Horloges : le serveur ramène tout horodatage de plus de 5 min dans le futur à
  son heure, et le client corrige son écart (`reglerDecalage`, `maintenant()`).
- Erreurs : `handleSync` rend un code JSON (500 `document-illisible` ou
  `serveur`, 413 `trop-gros`), et un document illisible n'est jamais écrasé.

**Sauvegarde quotidienne et restauration.** Le cron de `wrangler.jsonc`
(20:00 UTC) appelle `sauvegarderDocument` : copie du document sous
`state@AAAA-MM-JJ`, trente jours gardés. Pour revenir à une copie :

    npx wrangler d1 execute coffee-extraction-logbook --remote --command "SELECT name, updated_at FROM documents ORDER BY name"
    npx wrangler d1 execute coffee-extraction-logbook --remote --command "UPDATE documents SET payload = (SELECT payload FROM documents WHERE name = 'state@2026-09-26'), updated_at = strftime('%s','now')*1000 WHERE name = 'state'"

Les appareils fusionnent ensuite avec cette copie à leur prochaine synchro :
pour qu'elle gagne vraiment, vider les données locales des appareils (ou les
recharger après avoir supprimé le site dans les réglages du navigateur).
En dernier recours, Time Travel de D1 restaure toute la base :
`npx wrangler d1 time-travel restore coffee-extraction-logbook --timestamp=...`.

`init()` ne synchronise plus (v8.72) : il chargeait les données locales puis
attendait la synchro avant le premier affichage, jusqu'à 15 s d'écran vide en
réseau faible. `demarrer()` (app.js) affiche d'abord les données locales, lance
la synchro, et n'ouvre la modale d'accueil que si, APRÈS la synchro, il n'y a
toujours rien : un téléphone neuf reçoit ses données avant qu'on lui propose la
démo.

`/api/sync` répond 401 en JSON, jamais une redirection, pour que le client ne
parse pas la page de connexion comme des données. Tests :
`node worker/sync.test.mjs`, 23 assertions sur la fusion (union, résolution de
conflit, non résurrection, purge, formes invalides).

**Taille du document.** D1 plafonne une ligne à 2 000 000 octets
(`MAX_DOCUMENT_BYTES` dans `worker/sync.js`). Le serveur renvoie `taille` et
`plafond` à chaque échange, `data.js` les garde dans `state.syncTaille` et
`state.syncPlafond`, et le panneau Données prévient passé 50 pour cent. À ce
moment il faudra archiver l'historique ; rien n'est prévu pour ça, c'est le
signal qui déclenchera la décision.

Les réglages du matériel (dose de repli, puissance de feu, molette, temps
d'ébullition de la bouilloire) sont une TABLE `reglages` d'une ligne, d'id
`moi`, synchronisée comme les autres. Le thème
et les bips restent locaux.

## 10. PWA, hors ligne, versionnage des assets

Actif uniquement sur le site déployé (https). En `file://` le service worker ne
s'enregistre pas et l'API Wake Lock n'existe pas : tout échoue en silence, le
double clic sur `index.html` marche exactement comme avant.

- `manifest.json` : nom, thème sombre, `display: standalone`, icônes. Chemins
  RELATIFS (`./`, `icons/...`) pour rester valides quelle que soit l'origine.
- `icons/` : quatre PNG générés par `node tools/gen_icons.mjs`, déterministe et
  sans dépendance (encodage PNG à la main via zlib, échantillonnage 4x4 pour
  l'antialiasing). Le dessin est en coordonnées relatives dans `sample()`. La
  version `maskable` réduit le dessin à 72 pour cent et va au bord, l'OS
  découpe la forme qu'il veut. Régénérer si le dessin change, pas autrement.
- `css/fonts/` : Instrument Serif (titres, chiffres) et Manrope (tout le
  reste), en woff2, sous licence OFL, déclarées en `@font-face` dans
  `css/socle.css` et précachées. Sous-ensembles latin et latin étendu pour les
  deux, plus le VIETNAMIEN pour Manrope (les cafés s'appellent « Trung Nguyên
  Sáng Tạo », « Là Việt »). Elles n'ont pas de `?v=` et n'en auront pas : elles
  sont immuables PAR CONTRAT, on ne réécrit jamais un `.woff2` sous le même
  nom, on en publie un autre. `worker/index.js` les sert donc avec le cache
  d'un an sur la seule foi de l'extension. Quatre tests tiennent la chaîne :
  police déclarée présente sur le disque, présente au précache, aucune police
  orpheline, aucun CDN. Détails dans `css/fonts/LICENCE.md`.
- `sw.js`, stratégie RÉSEAU D'ABORD, cache en secours. Le choix inverse (cache
  d'abord) obligerait à incrémenter `CACHE_NAME` à chaque déploiement, et un
  oubli figerait une vieille version sur le téléphone pour toujours. Le site
  est petit et servi par Cloudflare : l'aller retour réseau ne coûte rien
  devant ce risque.
- DEUX PIÈGES traités dans `sw.js`, ne pas les défaire :
  1. Une réponse issue d'une REDIRECTION n'entre jamais dans le cache
     (`response.redirected`). Sans ce test, la porte d'entrée redirigeant vers
     `/login` à l'expiration de session ferait mettre en cache la PAGE DE
     CONNEXION à la place de l'application.
  2. `/login` et `/logout` ne passent jamais par le service worker, sinon la
     connexion et la déconnexion cessent de fonctionner.
- Verrou d'écran : `syncWakeLock()` dans app.js est appelé depuis
  `majBoutonsChrono()`, qui tourne à CHAQUE transition du chrono. Un seul point
  de vérité, donc pas de branche oubliée. Le système relâche le verrou dès que
  l'onglet passe en arrière plan, d'où la reprise sur `visibilitychange`.

### La version, et le cache d'un an

La version du site vit à UN endroit : `<meta name="app-version">` dans
`index.html`. `app.js` la lit pour le pied de page, `OUTILS.urlVersionnee()`
l'ajoute en `?v=` aux fichiers chargés à la demande, et chaque balise script et la
feuille de style la portent en `?v=`. Le Worker sert tout `/js/*` et `/css/*` qui
porte un `?v=` avec `Cache-Control: private, max-age=31536000, immutable` ; tout
le reste, `index.html` en tête, reste en `no-cache`. Une nouvelle version change
les URL, donc le cache tombe tout seul. `sw.js` porte la même `VERSION`, précache
les mêmes URL et jette les anciennes à l'activation.

**Monter de version** : `node tools/bump_version.mjs 7.90`, puis une ligne dans
`CHANGELOG.md`. Le script écrit le meta, les seize `?v=` et `sw.js` ; un test de
`tools/data.test.mjs` refuse toute divergence entre les trois. Ne jamais poser une
version à la main.

Le manifeste porte un `id` stable (`./`) et trois raccourcis d'appui long (Saisie,
Refaire ma dernière tasse, Historique). Le deuxième ouvre `./#refaire`, une ACTION
et non un écran : `app.js` la traite au démarrage et au changement de hash, par
`UI.refaireDerniere()`, qui charge dans la saisie les RÉGLAGES de la tasse la plus
récente (`reglagesSeuls()` vide note, goûts, diagnostics, commentaire et temps
mesurés ; le bouton Dupliquer de l'historique passe par le même chemin). Un test
vérifie que chaque raccourci vise un écran de `ECRANS` ou une action traitée. Les
raccourcis s'affichent sur Android, pas sur iPhone.

## 11. Pièges connus

- ATTRIBUT HIDDEN : la règle globale `[hidden] { display: none !important; }`
  existe parce que `display: flex` sur .champ battait l'attribut. Ne pas la
  retirer.
- CAPTURES PLAYWRIGHT : jamais fullPage (rejoue les animations Chart.js),
  toujours un viewport haut.
- GRILLE CSS ET CANVAS : min-width: 0 sur les items de .grille-graphes,
  sinon Chart.js fait gonfler les colonnes en boucle.
- HEATMAP : clés de date en heure locale (cleLocale), l'UTC décale d'un jour
  à Bangkok.
- FILE SYSTEM ACCESS : absent de Firefox, désactivé par défaut dans Brave.
  Le site le détecte et bascule en mode navigateur avec messages.
- LE DOLLAR DANS UNE CHAÎNE DE REMPLACEMENT. Le sélecteur double renvoie un
  TABLEAU, le simple un seul élément. Piège vicieux quand on modifie app.js par
  script : dans une chaîne de remplacement JavaScript, deux dollars à la suite
  veulent dire "un dollar littéral", et un dollar suivi d'une esperluette
  réinjecte TOUT le texte trouvé. `String.replace` réécrit donc le contenu sans
  rien signaler. Le fichier se parse, tous les tests passent, et le tableau de
  bord lève une TypeError à l'exécution : arrivé le 14 août sur `rendreTableau`.
  Le même piège a dupliqué CE fichier trois fois le 15 août, ce qui l'avait fait
  passer de 1 100 à 2 129 lignes sans que rien ne le signale. Utiliser
  `split().join()` plutôt que `replace()` sur tout code ou texte porteur de
  dollars, et
  lancer `node tools/boot.test.mjs` après toute modification de l'interface.
- UNE VALEUR POSÉE À L'INITIALISATION VIEILLIT AVEC LA PAGE. La date d'une
  nouvelle saisie n'était écrite que par `reinitialiserSaisie()`, qui ne tourne
  qu'au démarrage et après un enregistrement. C'est correct sur un site qu'on
  recharge ; sur une PWA installée dont la page reste ouverte toute la journée,
  arriver sur Saisie à 16 h affichait l'heure de la tasse précédente. La date est
  maintenant rafraîchie à chaque ARRIVÉE sur l'écran, et un drapeau
  `saisie.dateTouchee` protège une date réglée à la main : Chris note parfois une
  tasse d'hier soir, et la lui reprendre serait pire que le bug corrigé. Le
  rafraîchissement est dans `activerEcran` et pas dans `rendreEcranCourant`, qui
  se rejoue à chaque notification de données : la date sauterait pendant qu'on
  remplit le formulaire.
- UN BROUILLON DE 24 HEURES NE DOIT PAS RESSUSCITER UN HORODATAGE. `f-date` fait
  partie des champs sauvegardés, et le brouillon vit 24 h. C'est la bonne durée
  pour un commentaire et une absurdité pour une date : celle de la veille
  revenait par-dessus l'heure fraîche. La date a donc sa propre fenêtre,
  `DATE_BROUILLON_MAX_MS`, de deux heures. Le brouillon existe pour survivre au
  déchargement de la page pendant une extraction, ce qui se compte en minutes.
- UN DRAPEAU PARTAGÉ POSÉ AVANT UN LONG CORPS FINIT PAR RESTER COINCÉ. Ouvrir
  une extraction pour la modifier basculait sur l'écran Saisie, et cette bascule
  ne devait pas déclencher l'abandon d'édition qui protège justement contre la
  perte de données. La distinction se faisait par un drapeau global posé avant
  quarante lignes de remplissage de formulaire et remis à zéro après, SANS
  `finally` : une seule exception au milieu le laissait à true pour toujours, et
  l'abandon ne se déclenchait plus jamais. Chris rouvrait alors une ancienne
  tasse en croyant en saisir une nouvelle, et la modifiait. « Parfois », puis
  tout le temps. L'information passe maintenant en PARAMÈTRE de `activerEcran` :
  elle appartient à l'appel, elle meurt avec lui, il n'y a plus rien à laisser
  coincé. Règle générale : un drapeau qui doit être remis à zéro plus loin est
  une dette, un paramètre n'en est pas une.
- UN TEST QUI LIT LE SOURCE NE PROUVE PAS QUE LE MÉCANISME MARCHE. Deux contrôles
  vérifiaient que la garde d'abandon était bien ÉCRITE dans `activerEcran`, et
  ils sont restés au vert pendant tout le temps où elle ne se déclenchait plus.
  Le geste est maintenant rejoué pour de vrai dans `tools/boot.test.mjs` :
  ouvrir une extraction, partir ailleurs, revenir par l'onglet, et vérifier que
  le formulaire est redevenu vierge.
- UN NOUVEAU TYPE DE CHAMP N'HÉRITE DE RIEN. La longue liste de sélecteurs qui
  habille les champs énumère `input[type="text"]`, `number`, `date`,
  `datetime-local`... et rien n'oblige à y ajouter un type nouveau. Le champ de
  recherche de l'historique est resté au rendu par défaut du navigateur, sans
  fond ni bordure, au milieu de champs habillés. Le CSS est valide, la page se
  charge, c'est juste laid, donc rien ne le signale. Un test compare maintenant
  les types utilisés dans `index.html` à cette liste.
- UN SCAN QUI TOURNE AVANT SON DICTIONNAIRE NE SERT À RIEN. `scanner()`
  n'enregistre un nœud de texte que s'il a DÉJÀ une traduction, et
  `appliquerStatique()` est appelée au démarrage. Depuis que le paquet anglais se
  charge à la demande (v7.55), démarrer en français laisse les dictionnaires
  vides : le scan tournait donc à vide, son drapeau passait à true, et il ne
  recommençait jamais. Cliquer sur EN ne traduisait plus que les zones que le JS
  régénère, et la page devenait moitié française, moitié anglaise. Aucune erreur,
  aucun test en échec. Le paquet remet donc le drapeau à zéro en arrivant, mais
  SEULEMENT si le scan précédent s'était fait sans dictionnaire : rescanner
  pendant que l'anglais est affiché enregistrerait l'anglais comme étant le
  français, et le bouton FR rendrait de l'anglais.
- LE FAUX DOM PEUT CACHER LE BUG QU'IL DEVRAIT MONTRER. Le harnais rendait un
  TreeWalker vide et un `querySelectorAll` vide : le registre de traduction y
  était donc toujours vide, et aucun test ne pouvait distinguer « vide à cause
  d'un bug » de « vide parce que c'est un faux DOM ». C'est ce trou qui a laissé
  passer le bug ci-dessus. Le harnais fournit maintenant de vrais nœuds de texte
  et de vrais champs à placeholder. Quand un test ne peut pas échouer, il ne
  teste rien.
- UN SCRIPT D'ÉDITION LANCÉ DEUX FOIS DOUBLE SA LIGNE. Le champ de recherche de
  l'historique est arrivé en v7.58 écrit DEUX FOIS, même identifiant, rangé sous
  le label d'un autre champ. Le navigateur affiche les deux sans broncher,
  `querySelector` prend le premier, et le site a juste l'air bizarre. Quatre
  contrôles couvrent maintenant la famille dans `tools/data.test.mjs` :
  identifiants en double, lignes de balisage dupliquées à l'identique, `label
  for` orphelin, et groupe de champ mélangeant deux contrôles sans rapport.
- UN SCRIPT DIFFÉRÉ NE PEUT PAS DÉCIDER DE L'APPARENCE. `defer` veut dire "après
  l'analyse du document", donc après le premier rendu. Le thème était restauré
  depuis `ui-noyau.js`, différé comme tout le reste : le thème clair clignotait
  en sombre à chaque ouverture. Rien ne le signalait, aucun test ne peut voir un
  clignotement, et il était visible à chaque fois. Le thème s'applique maintenant
  par un script EN LIGNE dans le `<head>`, le seul de la page, et c'est une
  exception assumée : elle ne contredit pas le passage de tous les scripts en
  `defer`, puisque celui-ci ne demande rien au réseau. Un test le verrouille,
  sinon quelqu'un le différera un jour par souci de cohérence.
- NOTIFIER AVALE LES ERREURS : `DATA.notifier()` enveloppe chaque abonné dans un
  try/catch qui se contente d'un `console.error`. Une exception de rendu ne
  remonte donc PAS : l'écran reste vide et rien ne s'affiche. C'est ce qui rend ce
  genre de bug invisible sans regarder la console.
- MANIFESTE PWA ET PORTE D'ENTRÉE : `<link rel="manifest">` est récupéré SANS
  cookie par défaut. Derrière la porte d'entrée, le navigateur reçoit donc la
  redirection vers /login, tente de parser du HTML en JSON, et la PWA n'est pas
  installable. D'où `crossorigin="use-credentials"` sur le lien. Invisible en
  `file://`, où il n'y a pas de porte : ce bug ne se voit QUE sur le site déployé.
- ATTRIBUT STEP SUR LES CHAMPS NUMBER : un `step` sert de contrainte de
  VALIDATION, pas seulement de pas pour les flèches. Une valeur qui n'est pas
  un multiple exact du step rend le formulaire invalide, et `requestSubmit` ou
  le clic sur Enregistrer ne fait alors RIEN de visible (bulle native du
  navigateur, facile à manquer dans une modale qui défile). Le prix des cafés
  était en `step="1000"` alors que le Sáng Tạo 4 coûte 148 800 ₫ : sa fiche
  était impossible à enregistrer, donc impossible à désactiver depuis
  l'interface. Corrigé en `step="1"`, idem pour la contenance des tasses qui
  était en `step="5"`. Ne JAMAIS mettre un step arbitraire sur un champ qui
  reçoit une valeur du monde réel (prix, volume, poids). Restent en step non
  unitaire, volontairement et sans risque connu : `f-dose` (0,1 g),
  `r-dose` (0,5 g), `h-note-min` (0,5 point).
- Les cafés INACTIFS restent comptés dans TOUT le tableau de bord (KPI,
  graphes, nuages, heatmap, dernières extractions). C'est voulu : l'historique
  ne se réécrit pas parce qu'un sachet est fini. `actif` ne filtre QUE le
  select de saisie et la saisie rapide, et trie les désactivés en fin de la
  liste "Mes cafés". Vérifié de bout en bout : désactiver un café ne modifie
  aucune section du tableau de bord.
- Les selects dont les valeurs sont des DONNÉES (machine, torréfaction,
  diagnostics du filtre historique) portent des value explicites pour que la
  traduction du libellé ne corrompe pas la valeur.
- L'ordre des scripts compte (voir section 1). Pas de Date.now piégé, pas de
  modules ES.

- LE CACHE WRANGLER. `.wrangler/cache/wrangler-account.json` contient
  l'identifiant et le nom du compte Cloudflare. Il est ignoré par git ET par
  `.assetsignore`, un test le vérifie. Ne pas retirer ces deux lignes.

## 12. Tests

Cinq suites sans navigateur, sans dépendance, à lancer depuis `tracker/`, toutes
en moins de deux secondes :

```
node tools/boot.test.mjs     demarrage reel dans un faux DOM, rendu des ecrans, bascule EN
node tools/data.test.mjs     couche de donnees, CSV, migrations, et les controles statiques du site
node tools/modules.test.mjs  frontieres entre fichiers : noms libres, UI, cablage, plafonds de lignes
node worker/index.test.mjs   porte d'entree, cache des assets, fichiers ignores
node worker/sync.test.mjs    fusion entre appareils, taille du document
```

Ce que chacune couvre, et le bug qui l'a motivée : `DECISIONS.md`, « Tests ».
Deux règles : `tools/boot.test.mjs` considère tout `console.error` comme un échec
(`DATA.notifier()` avale les exceptions de rendu, il n'y a pas d'autre moyen de les
voir) ; et un test écrit comme une RÈGLE (« aucun état actif ne change la
largeur ») vaut mieux qu'un test écrit sur un cas.

Scan anti-tirets, doit imprimer `dashes: 0` :

```
node -e "const fs=require('fs'),p=require('path');let n=0;(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory()){if(!/node_modules|\.git$|vendor|\.wrangler/.test(f))w(f);}else if(/\.(js|mjs|html|css|md|json|jsonc|py)$/.test(e.name)){fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{if(/[\u2013\u2014]/.test(l)){n++;console.log(f+':'+(i+1));}});}}})('.');console.log('dashes:',n)"
```

Régénérer la démo après tout changement de schéma : `python3 tools/gen_demo.py`
(écrit `demo/*.csv` et `js/demo-data.js`). Python n'est pas installé sur la
machine de Chris ; le faire depuis un environnement qui l'a.

Il n'existe aucun test en navigateur. Le patron Playwright (Chromium headless,
`page.goto('file://.../index.html')`, clic sur `#acc-demo`, zéro erreur console,
bascule EN aller-retour) reste valable ; ne JAMAIS faire de capture `fullPage`,
le redimensionnement virtuel rejoue les animations Chart.js.

## 13. Git et déploiement Cloudflare

Le site est 100 pour cent statique, aucun build, aucune dépendance réseau.
Il est déployé sur Cloudflare WORKERS avec fichiers statiques, pas sur Pages :
Cloudflare a fusionné les deux produits et ne crée plus de nouveaux projets
Pages. Workers a de toute façon la propriété qu'il nous faut ici, le code
tourne AVANT le service des fichiers, ce qui permet une porte d'entrée.

### Repo git

- La RACINE du repo doit être le dossier `tracker/` (ce dossier). Les
  fichiers du dossier parent (Prompt-Fable-Tracker-Cafe.md, le guide HTML,
  Microns.png) sont des sources de contexte, pas des livrables : ne pas les
  committer, ou alors dans un dossier `docs-sources/` clairement séparé.
- Ne JAMAIS committer les données personnelles de Chris : ses CSV vivent
  dans un dossier de données lié via l'API File System Access, hors du
  repo. Si un jour ce dossier se retrouve dans l'arborescence, l'ajouter au
  `.gitignore`. Les CSV de `demo/` sont eux des livrables (démo générée).
- Commits en ANGLAIS, un sujet par commit. Branche de production : `main`.
  Les noms de variables et de fonctions du code nouveau sont en anglais eux
  aussi. Le code applicatif existant reste nommé en français, on ne renomme
  pas en masse. Doc, commentaires et interface restent en français.
- Le dépôt est PUBLIC. Aucun identifiant, aucun mot de passe, aucun token
  dedans, jamais. Les secrets vivent dans Cloudflare (voir plus bas).
- Remote : `https://github.com/ChrisTram/Coffee-extraction-logbook.git`.
- `.gitignore` : ignore `donnees/`, `data/`, `Data/` et tous les `*.csv`,
  avec l'exception `!demo/*.csv` (la démo est un livrable). Si tu ajoutes un
  jour un CSV livrable ailleurs que dans `demo/`, il faudra une exception de
  plus, sinon il sera silencieusement ignoré.
- `.gitattributes` : `* text=auto eol=lf`. Les fins de ligne sont normalisées
  en LF dans le dépôt même si Windows travaille en CRLF localement. Sans ça
  les CSV de démo partiraient en CRLF.

### Pas de build, et pourquoi ça reste comme ça

La question d'un passage à Vite (ou tout autre bundler) a été tranchée : NON.
Vite émet du `<script type="module">`, or les modules ES sont bloqués par
CORS en `file://` (origine `null`) : le double clic sur `index.html`, qui est
l'usage principal, cesserait de marcher. Et il n'y a rien à gagner en face,
aucune dépendance npm (Chart.js est vendorisé), pas de JSX ni de TypeScript.
Le seul découpage utile, par fichier et en scripts classiques, est fait : sept
fichiers d'interface (v7.60) et six de données (v7.87).

### La porte d'entrée (worker/index.js)

**Sécurité de l'appli (v8.73).** Toute page HTML servie porte une politique de sécurité (`POLITIQUE_SECURITE`, worker/index.js) : scripts du site seulement, plus le script du thème d'index.html autorisé par son empreinte (`EMPREINTE_SCRIPT_THEME`). Modifier ce script oblige à mettre l'empreinte à jour : `worker/index.test.mjs` la recalcule et échoue sinon. Le lecteur YouTube des recettes est autorisé en `frame-src`, et `frame-ancestors 'none'` interdit d'encadrer le carnet. Côté données, les normaliseurs remplacent `<` et `>` par ‹ › dans tous les champs texte et ne gardent que des caractères sûrs dans les identifiants ; l'échappement commun est `OUTILS.echap`. La connexion est limitée par le binding `LOGIN_LIMITER` (10 essais par minute et par adresse, wrangler.jsonc).

Le site déployé est privé : un seul compte, pas d'inscription, pas de
réinitialisation de mot de passe, pas de base d'utilisateurs.

- `worker/index.js` s'exécute devant tout, grâce à `run_worker_first: true`
  dans `wrangler.jsonc`. SANS ce réglage, les fichiers statiques seraient
  servis avant le Worker et la porte serait contournable en demandant
  directement `/index.html`. Ne pas le retirer.
- Trois secrets Cloudflare, définis dans le dashboard, JAMAIS dans le repo :
  `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET` (clé de signature des
  cookies). Si l'un des trois manque, ou est vide, ou n'est que des espaces,
  le Worker répond 503 et ne sert rien : fermeture par défaut, volontaire. Le
  503 NOMME les secrets absents (les noms sont déjà publics dans le dépôt, les
  valeurs ne sont jamais rendues), sinon le diagnostic se fait à l'aveugle.
- Session : cookie `cel_session`, HttpOnly, Secure, SameSite=Lax, 30 jours.
  Son contenu est `identifiant\nhorodatage d'expiration` signé en HMAC
  SHA-256 avec `AUTH_SECRET`. Rien n'est stocké côté serveur, il n'y a pas de
  base de sessions. Conséquences : changer `AUTH_SECRET` invalide toutes les
  sessions en cours (c'est le bouton de secours si un appareil est perdu), et
  changer `AUTH_USERNAME` aussi.
- La comparaison du mot de passe passe par un HMAC des deux valeurs plutôt
  qu'une comparaison de chaînes, pour ne pas fuiter d'information par le
  temps de réponse. Un échec attend 700 ms avant de répondre.
- `/logout` efface le cookie. Il n'y a pas de bouton dans l'interface, c'est
  une URL à taper. En ajouter un demanderait des clés i18n, voir plus bas.
- La page de connexion est générée par le Worker, elle n'est pas un fichier
  statique. Elle est bilingue (attributs `data-fr` et `data-en`) et lit la
  même clé `localStorage` `langue` que l'application.
- Les réponses servies portent `Cache-Control: private, no-cache` et
  `X-Robots-Tag: noindex` : jamais de cache partagé, jamais d'indexation.
- Le contournement d'une redirection ouverte est traité (`safeTarget`) : le
  paramètre `?next=` n'accepte qu'un chemin interne.
- EN LOCAL, RIEN DE TOUT ÇA NE S'APPLIQUE. Le Worker n'existe que sur
  Cloudflare, le double clic sur `index.html` en `file://` ouvre le site
  directement, sans login. C'est voulu.

### Créer le projet Cloudflare

Dashboard Cloudflare, Compute (Workers), "Create", "Import a repository",
choisir `ChrisTram/Coffee-extraction-logbook`. Réglages :

| Champ | Valeur |
|---|---|
| Project name | `coffee-extraction-logbook` |
| Build command | VIDE |
| Deploy command | `npx wrangler deploy` |

Tout le reste (nom du Worker, dossier des assets, `run_worker_first`) est lu
dans `wrangler.jsonc`, il n'y a rien à régler dans l'interface.

APRÈS le premier déploiement, aller dans Settings, Variables and Secrets, et
ajouter les trois secrets (type Secret, pas Text) : `AUTH_USERNAME`,
`AUTH_PASSWORD`, `AUTH_SECRET`. Tant qu'ils ne sont pas là, le site répond
503. Un redéploiement est nécessaire après l'ajout.

Alternative en ligne de commande, sans intégration git : `npx wrangler deploy`
depuis la racine, puis `npx wrangler secret put AUTH_PASSWORD` (et les deux
autres). Chaque exécution publie un déploiement.

Les fichiers sont en UTF-8 (accents et vietnamien) : rien à configurer.

### Synchronisation entre appareils : FAITE le 12 août 2026

Base D1 `coffee-extraction-logbook`, région APAC (servie depuis Singapour, la
bonne latence depuis le Vietnam), id `af7ee1b7-0e23-47bb-987a-310741425b57`,
bindée dans `wrangler.jsonc` sous le nom `DB`.

ATTENTION si tu recrées la base un jour : `wrangler d1 create` suggère un nom de
binding dérivé du nom de la base (`coffee_extraction_logbook`). NE PAS le
suivre. Le Worker lit `env.DB`; avec un autre nom de binding, `env.DB` serait
`undefined` et `/api/sync` répondrait 503 en ayant l'air configuré, ce qui est le
pire des deux mondes.

La table `documents` est créée à la demande par le Worker, donc il n'y a aucune
migration SQL à lancer. Elle a en plus été créée d'avance à la main, ce qui
retire un point de défaillance au premier chargement :

```
npx wrangler d1 execute coffee-extraction-logbook --remote --command \
  "CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"
```

Vérifier l'état réel du déploiement (secrets ET bindings) :
`npx wrangler versions view <id de version>`.

Si la base est un jour supprimée ou le binding retiré, `/api/sync` répond 503 et
le site retombe proprement en mode local, chaque appareil avec ses données.

Le premier appareil qui synchronise pousse ses données (fusion avec un serveur
vide = le local). C'est donc lui la source de vérité initiale : synchroniser
d'abord depuis l'appareil qui a les bonnes données.

Limite à connaître : tout l'état tient dans une seule ligne D1, en JSON. À
l'échelle d'un carnet personnel c'est confortable pour des années, mais ce n'est
pas un design qui monterait à des centaines de milliers d'extractions.

### Points d'attention APRÈS le passage en https

- CHANGEMENT D'ORIGINE : IndexedDB est par origine. Les données saisies sur
  la version `file://` ne suivront PAS automatiquement sur l'URL déployée.
  Chemin de migration pour Chris, à faire UNE fois, sur Chrome desktop :
  ouvrir l'URL déployée, se connecter, puis Données, "Ouvrir un dossier
  existant" et pointer son vrai dossier de données. Les CSV ne transitent
  jamais par le repo ni par Cloudflare, ils restent sur son disque et le
  navigateur en garde le miroir IndexedDB. Sur téléphone (pas de File System
  Access), passer par Données, Importer un CSV, les quatre fichiers un par
  un.
- L'API File System Access marche en https (contexte sécurisé), Chrome et
  Edge desktop seulement. Sur téléphone (Chrome Android), showDirectoryPicker
  n'existe pas : le site retombe proprement sur IndexedDB + export manuel,
  comportement déjà géré (v5).
- Le https débloque le service worker :
  manifest PWA (installable sur le téléphone) et API Wake Lock pendant le
  chrono. C'est le prolongement naturel de ce déploiement.
- Le site déployé est PRIVÉ depuis la v7.5 (voir "La porte d'entrée"). Une
  alternative existe si un jour la gestion du mot de passe devient pénible :
  Cloudflare Access (Zero Trust), gratuit en usage perso, qui remplace le
  mot de passe par un code envoyé par email. C'est plus robuste mais ce
  n'est pas ce qui a été demandé (identifiant plus mot de passe).
- `#acc-demo` et toute l'app marchent à l'identique en https : les tests
  Playwright peuvent pointer l'URL déployée aussi bien que le file:// local.

### Limitation de débit sur /login

La seule défense du Worker contre la force brute est un délai de 700 ms par
tentative ratée. Un attaquant qui parallélise depuis plusieurs adresses n'est
pas ralenti, et le mot de passe est unique et permanent. La bonne réponse est
une règle Cloudflare, pas du code : dashboard, Security, WAF, Rate limiting
rules, une règle sur `URI Path equals /login` ET `Request Method equals POST`,
par exemple 5 requêtes par minute par adresse IP, action Block pendant 10
minutes. Incluse dans le plan gratuit. À refaire si le compte Cloudflare change :
elle ne vit pas dans le dépôt, d'où cette section.

### En-têtes de cache

`servePrivately()` pose `Cache-Control: private, no-cache, must-revalidate` sur
tout ce qui n'est pas un fichier de code versionné, et `private, max-age=31536000,
immutable` sur `/js/*` et `/css/*` quand l'URL porte `?v=`. Voir section 10.
