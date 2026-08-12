# DOCUMENTATION technique : Carnet d'extraction

Doc de référence du projet, maintenue à chaque modification. Commencer par
`START-HERE.md` si tu arrives sans contexte. Dernière mise à jour : v7.4,
2026-08-12.

## 1. Vue d'ensemble

Site mono-dossier, ouvert en `file://` dans Chrome. Aucune dépendance réseau :
Chart.js 4.4.4 est embarqué dans `js/vendor/chart.umd.js`. Les scripts sont
des scripts classiques (pas de modules ES, ils ne marchent pas en file://),
chargés dans cet ordre : chart.umd, i18n, grind, recettes, demo-data, data,
charts, app. Chaque fichier expose un objet global (I18N, GRIND, DATA, CHARTS)
ou des constantes globales (RECETTES_DEPART, etc.). app.js est une IIFE.

Cinq écrans dans une page unique, bascule par nav et hash (#tableau, #saisie,
#historique, #reference, #guide). Bouton flottant de saisie rapide en bas à
droite (café + recette + note, le reste prérempli).

## 2. Modèle de données

Quatre tables, quatre CSV, éditables au tableur. La vérité vit dans un dossier
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
  INTERDICTION du Switch (enregistrement refusé, saisie rapide comprise),
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
diagnostic, descripteurs, commentaire`

- Seule la dose est obligatoire en saisie (étoile rouge). Date auto si vide.
- `volume_extrait_ml` : ancien nom `volume_tasse_ml`, accepté en lecture
  (normaliserExtraction fait le fallback).
- `eau_ajoutee_ml` : Brikka seulement, eau d'allongement APRÈS extraction,
  n'entre jamais dans le ratio. `lait_ml` : recettes au lait. Le calculé
  `volume_boisson_ml` = extrait + eau ajoutée + lait.
- `agitation_nb` : Switch, vide si pas d'agitation, défaut 1 quand coché.
- `eau_prechauffee` : Brikka, 1 ou vide. Décoché par défaut.
- `descripteurs` : tags séparés par `|`, valeurs françaises (la traduction EN
  est purement d'affichage). La liste vit dans DESCRIPTEURS_GROUPES
  (recettes.js), 59 tags en 9 familles SCA. Chaque tag a une définition
  courte dans TAGS_INFO (i18n.js, fr et en), affichée dans une bulle CSS au
  survol ou au focus (attribut data-info, styles ".pilule[data-info]" dans
  styles.css). Ne pas mettre de guillemets doubles dans ces définitions
  (elles partent dans un attribut HTML).
- `diagnostic` : zéro, une ou PLUSIEURS valeurs de DIAGNOSTICS (recettes.js)
  séparées par `|` (choix multiple depuis la v7.2, une tasse peut être un
  peu amère ET astringente). Les anciennes lignes à valeur unique se lisent
  telles quelles (split sur `|`). 11 niveaux dont deux intermédiaires
  ("Un peu acide", "Un peu amer") entre Équilibré et les extractions ratées.
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
  chronicler, costaud, brikka-lait). Elles restent des recettes DISTINCTES
  en base et dans l'historique.
- `lait` 0/1 : affiche le champ lait en saisie, prérempli contenance de la
  tasse moins volume de café estimé.
- `variantes` 0/1 : active le bloc Tetsu (versements pilotables) : réservé au
  Tetsu Devil, préservé à l'édition.
- Les 9 recettes d'origine (RECETTES_DEPART dans recettes.js) sont
  restaurables une par une via "Rétablir la version d'origine".

Recettes d'origine v7 : Brikka classique (1.2.0), Brikka flat white et
Brikka cappuccino (famille brikka-lait, lait), The Coffee Chronicler's Recipe
et (Sweet) (famille chronicler, 1.6.0), Le Costaud (Bloom) 1.4.0 et
(Immersion) 1.5.0 (famille costaud), The Tetsu Devil (2.0.0, variantes),
La Sherrycipe (2.0.0, paliers 0:00/0:30/1:00/1:30). Toutes les Switch à
15 g / 225 g, ratio 1:15, environ 195 ml.

### tasses.csv
`id, nom, contenance_ml`. Quatre par défaut (TASSES_DEPART) : Flat White Egg
150, Espresso Egg 80, Nutty Tasting Cup 150, Classic Mug 330. Éditeur inline
dans la saisie (bouton ✚). Défauts par méthode : Flat White Egg en Brikka,
Classic Mug en Switch (non écrasés si l'utilisateur a choisi autre chose).
Avertissement non bloquant si volume attendu (café + eau ajoutée + lait)
dépasse la contenance.

## 3. Migrations

`DATA.migrerDonnees()` (data.js) est IDEMPOTENTE et tourne à chaque
chargement (init, ouverture de dossier, import, chargement de la démo) :

1. Renomme les anciennes recettes dans extractions et cafés via
   `RENOMMAGES_RECETTES` (recettes.js). Historique des renommages :
   Brikka référence et Brikka rang bơ vers Brikka classique, Le Fruité vers
   The Coffee Chronicler's Recipe, Le Costaud vers Le Costaud (Bloom),
   L'Adoucisseur vers Le Costaud (Immersion), Le 4:6 de Tetsu vers
   The Tetsu Devil, The Sweet Variation vers The Coffee Chronicler's
   Recipe (Sweet). Le Complet a été supprimé sans remplaçant : son nom reste
   tel quel dans l'historique.
2. Remplace les recettes seed d'ancienne génération (`ANCIENS_SEED_IDS`),
   garantit la présence des nouvelles, applique les mises à niveau
   structurelles (famille, variante, renommage) sans toucher aux paramètres
   édités par l'utilisateur.
3. Met à jour les fiches c1 (Sáng Tạo 4) et c4 (Balanced) une seule fois,
   marquées par leur `tag`.
4. Seed les tasses si absentes.
5. Remplit `date_ajout` des cafés qui n'en ont pas avec la date de leur
   première extraction (les cafés jamais extraits restent sans date, rien
   n'est affiché).

Pour tout futur renommage ou changement de schéma : ajouter l'entrée dans
RENOMMAGES_RECETTES ou un fallback dans normaliserX, jamais de rupture.

## 4. i18n (js/i18n.js), mécanisme particulier

Français par défaut, bouton EN/FR dans l'entête, choix dans localStorage.
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

## 5. Le moulin (js/grind.js)

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

## 6. Graphiques (js/charts.js)

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

## 7. Saisie et chrono (js/app.js)

- Préremplissage au choix du café : méthode et recette recommandées, dose et
  molette de la recette. L'EAU RESTE VIDE (pas de balance) et la température
  part sur 95 (eau bouillie qui a fini de buller). Les cibles de la recette
  restent visibles dans le panneau latéral (fiche recette complète : chips,
  étapes, pour quels cafés, cafés associés, note, pas à pas) et la fiche du
  café (profil, pastilles, prix au gramme, fraîcheur).
- Avertissements non bloquants (recommandations, plage de mouture) et
  BLOQUANTS (café non pur ou rang bơ en Switch : `cafeInterditSwitch`,
  `avertissementsCombinaison` retourne {msgs, bloque}).
- Chrono unique : Démarrer / Pause / Reprendre (cycles illimités) / Arrêter
  et reporter / RAZ. Paliers minutés extraits de la recette sélectionnée,
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

## 8. Pièges connus

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
- Les selects dont les valeurs sont des DONNÉES (machine, torréfaction,
  diagnostics du filtre historique) portent des value explicites pour que la
  traduction du libellé ne corrompe pas la valeur.
- L'ordre des scripts compte (voir section 1). Pas de Date.now piégé, pas de
  modules ES.

## 9. Tests

Patron : lancer Chromium headless via Playwright
(`executablePath: '/opt/pw-browsers/chromium'` dans l'environnement Claude,
sinon le Chromium de Playwright), `page.goto('file://.../index.html')`,
cliquer `#acc-demo` à la modale d'accueil, puis piloter l'interface.
Vérifier systématiquement : zéro erreur console et pageerror, bascule EN
aller-retour, persistance après reload.

Scan anti-tirets (à lancer depuis le dossier tracker, doit imprimer PROPRE) :

```
python3 -c "
import glob
interdits = [chr(0x2013), chr(0x2014), chr(0x2012), chr(0x2015)]
pb = [f for f in glob.glob('**/*.*', recursive=True) if not f.endswith('.png')
      and any(c in open(f, encoding='utf-8', errors='ignore').read()
              for c in interdits)]
print('PROPRE' if not pb else pb)"
```

Régénérer la démo après tout changement de schéma :
`python3 tools/gen_demo.py` (écrit demo/*.csv et js/demo-data.js).

## 10. Git et déploiement Cloudflare Pages

Le site est 100 pour cent statique, aucun build, aucune dépendance réseau :
c'est le cas idéal pour Cloudflare Pages.

### Repo git

- La RACINE du repo doit être le dossier `tracker/` (ce dossier). Les
  fichiers du dossier parent (Prompt-Fable-Tracker-Cafe.md, le guide HTML,
  Microns.png) sont des sources de contexte, pas des livrables : ne pas les
  committer, ou alors dans un dossier `docs-sources/` clairement séparé.
- Ne JAMAIS committer les données personnelles de Chris : ses CSV vivent
  dans un dossier de données lié via l'API File System Access, hors du
  repo. Si un jour ce dossier se retrouve dans l'arborescence, l'ajouter au
  `.gitignore`. Les CSV de `demo/` sont eux des livrables (démo générée).
- Commits en français, un sujet par commit. Branche de production : `main`.
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
Le seul découpage utile est celui déjà listé en dette technique dans
`V2 suggestions.md` : scinder `app.js` par écran, en scripts classiques.

### Créer le projet Pages

Deux options équivalentes :

1. Intégration git (recommandé, déploiement automatique à chaque push) :
   dashboard Cloudflare, Workers et Pages, "Create", onglet Pages,
   connecter le repo. Réglages : framework preset "None", build command
   VIDE (aucun build), build output directory `/` (la racine du repo est le
   site). Production branch `main`.
2. CLI sans intégration git : `npx wrangler pages deploy . --project-name
   carnet-extraction` depuis la racine (demande un login Cloudflare la
   première fois). Chaque exécution publie un déploiement.

Aucune variable d'environnement, aucun secret, aucune fonction serveur.
Les fichiers sont en UTF-8 (accents et vietnamien) : rien à configurer,
Pages les sert correctement.

### Points d'attention APRÈS le passage en https

- CHANGEMENT D'ORIGINE : IndexedDB est par origine. Les données saisies sur
  la version `file://` ne suivront PAS automatiquement sur l'URL Pages.
  Chemin de migration pour Chris : sur la version file://, Exporter les CSV
  (ou simplement retrouver son dossier de données lié), puis sur l'URL
  déployée, relier le même dossier de données (ou réimporter les CSV). À
  faire UNE fois.
- L'API File System Access marche en https (contexte sécurisé), Chrome et
  Edge desktop seulement. Sur téléphone (Chrome Android), showDirectoryPicker
  n'existe pas : le site retombe proprement sur IndexedDB + export manuel,
  comportement déjà géré (v5).
- Le https débloque la suggestion 1 de `V2 suggestions.md` : service worker,
  manifest PWA (installable sur le téléphone) et API Wake Lock pendant le
  chrono. C'est le prolongement naturel de ce déploiement.
- Le site déployé est PUBLIC par défaut (les données restent locales au
  navigateur de chaque visiteur, rien n'est partagé). Si Chris veut le
  garder privé : Cloudflare Access (Zero Trust) devant le domaine Pages,
  gratuit pour un usage perso.
- `#acc-demo` et toute l'app marchent à l'identique en https : les tests
  Playwright peuvent pointer l'URL déployée aussi bien que le file:// local.

## 11. Changelog

- v1 : site initial, 4 écrans, 2 CSV, démo, Chart.js local, thèmes.
- v2 : recettes éditables (recettes.csv), saisie rapide flottante, page
  Guide (boutiques, achats, messages vietnamiens), correction du bug
  d'avertissement au préremplissage.
- v3 : panneau latéral de saisie, boutons Cafés/Recettes dans l'entête,
  thème clair réchauffé, KPI caféine (remplace le coût du mois), graphe 30
  jours enrichi (grammes, tooltip caféine), volume estimé cliquable,
  descripteurs organisés SCA, diagnostics étendus avec corrections.
- v4 : bascule FR/EN complète (js/i18n.js).
- v5 : gestion du navigateur sans File System Access (Brave, Firefox),
  cafés déjà moulus (défaut paquet), groupe corps et texture, étoile rouge
  sur la dose seul champ obligatoire, café optionnel.
- v6 : recettes v2 (2 Brikka, 6 Switch) avec migration automatique des noms,
  chrono unique à paliers et bips, diagramme officiel SVG 13 méthodes en
  base 8,32, champs eau ajoutée / agitation / tasse / lait, Sáng Tạo 4 non
  pur (82 pour cent, blocage Switch, coût réel), Balanced étalon, glossaire
  "Lire une étiquette vietnamienne".
- v7 : cartes à variantes (Chronicler Classique/Sweet, Costaud
  Bloom/Immersion, Brikka Flat white/Cappuccino ajouté), The Sweet Variation
  renommée "The Coffee Chronicler's Recipe (Sweet)", panneau latéral recette
  complet, détail crans/microns sous le champ molette, agitation défaut 1,
  tasses par défaut par méthode, case eau préchauffée (finalement décochée
  par défaut), eau vide et température 95 par défaut en saisie, pourcentage
  retiré du nom dans le select des cafés. Docs de reprise (START-HERE,
  DOCUMENTATION, V2 suggestions).
- v7.1 : deux diagnostics intermédiaires ("Un peu acide", "Un peu amer",
  corrections en demi-mesures), 17 descripteurs de plus (beurré, gras,
  velouté, chocolat au lait, cacahuète, praliné, fruit de la passion,
  cerise, raisin, pomme, rose, thé vert, clou de girofle, biscuit, rhum,
  caoutchouc, moisi), définition courte de CHAQUE descripteur (TAGS_INFO
  dans i18n.js), notamment pour distinguer fumé / tabac / brûlé / cendre.
- v7.2 : diagnostic à choix MULTIPLE (stocké séparé par `|`, rétrocompatible,
  corrections empilées sous les pilules, filtre historique en "contient",
  anneau du tableau de bord compte chaque valeur), définitions et corrections
  affichées dans une vraie bulle CSS au survol ou au focus juste au dessus de
  la pilule ou du tag (data-info, plus de ligne d'aide tout en bas du bloc
  descripteurs).
- v7.3 : cafés désactivés retirés du select de saisie (réinjectés seulement
  à l'édition d'une ancienne extraction) et toujours triés en fin de la
  liste "Mes cafés"; badge de note moyenne (★) et date d'ajout sur chaque
  café de la liste; nouvelle colonne `date_ajout` (posée à la création,
  migration étape 5 pour l'existant, démo migrée au chargement); section
  déploiement git + Cloudflare Pages dans la doc.
- v7.4 : mise sous git, dépôt initialisé à la racine de `tracker/` et poussé
  sur GitHub (ChrisTram/Coffee-extraction-logbook, branche `main`). Ajout de
  `.gitignore` et `.gitattributes`. Aucun changement de code applicatif :
  l'arbitrage sur le build (pas de Vite, pas de bundler) est consigné en
  section 10.
