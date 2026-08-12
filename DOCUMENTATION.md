# DOCUMENTATION technique : Carnet d'extraction

Doc de référence du projet, maintenue à chaque modification. Commencer par
`START-HERE.md` si tu arrives sans contexte. Dernière mise à jour : v7.13,
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

6. Achats : un sachet implicite pour chaque café qui a un `format_grammes` mais
   aucun achat. IDEMPOTENTE grâce au test "aucun achat pour ce café", donc elle ne
   recrée rien à chaque chargement et n'écrase aucun achat saisi. Sans elle, le
   stock serait incalculable sur tout l'existant.

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

Trois suites sans navigateur, toutes sans dépendance, à lancer depuis `tracker/` :

```
node worker/index.test.mjs   porte d'entrée, 32 assertions
node worker/sync.test.mjs    fusion entre appareils, 23 assertions
node tools/data.test.mjs     couche de données, 17 assertions
```

`tools/data.test.mjs` charge les vrais scripts du site dans un seul scope, comme
le navigateur avec des scripts classiques, sans IndexedDB ni DOM. Il garde
l'invariant qui peut corrompre les données sans se voir : `maj_le` ne doit
JAMAIS entrer dans un CSV, et les en-têtes doivent rester au caractère près.

Porte d'entrée : `node worker/index.test.mjs` (32 assertions, aucune
dépendance, node 18 ou plus suffit, il fournit fetch, Request, Response et
crypto.subtle comme le runtime Workers). Couvre la redirection de l'anonyme,
la préservation de la destination, le refus des mauvais identifiants, les
attributs du cookie, le rejet d'une signature falsifiée ou signée avec une
autre clé, l'expiration à 30 jours, la redirection ouverte, le logout et la
fermeture par défaut quand les secrets manquent. À relancer à CHAQUE
modification de `worker/index.js`.

## 6 ter. Calendrier d'activité, échelle ABSOLUE

Ordre du tableau de bord, voulu : KPI, graphe 30 jours, "Ce que tes données
disent", "Les 5 dernières extractions", puis le calendrier et le reste.

L'échelle de couleur est ABSOLUE : 1, 2, 3, 4 et plus, via `niveauDe()` dans
charts.js. Elle était relative au maximum (`ceil(v / maxV * 4)`), ce qui était le
vrai défaut de lisibilité : avec une tasse par jour au plus, `maxV` valait 1 donc
CHAQUE jour actif était peint dans la teinte la plus foncée, le dégradé ne
transmettait rien, et la même journée changeait de couleur dès qu'un autre jour
faisait monter le maximum. Ne pas revenir à une échelle relative : la légende
annonce maintenant des nombres réels, elle deviendrait fausse.

Autres points, chacun pour une raison :

- 18 semaines et non 26 (`SEMAINES_HEATMAP` dans app.js). À une ou deux tasses
  par jour, six mois de grille sont surtout six mois de cases vides, ce qui donne
  l'impression que le calendrier est cassé.
- Filet `stroke` sur chaque case : sans lui les jours sans extraction se fondent
  dans le fond du panneau et la grille ne se lit plus comme un calendrier.
- Le jour courant est cerclé (`.hm-aujourdhui`). Sans repère, s'orienter dans
  126 cases demande de compter les colonnes.
- Étiquette de mois sur la colonne qui contient le 1er (`d.getDate() <= 7`), et
  non sur le lundi du changement de mois, qui pouvait sauter un mois.
- `tabindex="0"` sur les cases : les bulles étaient au survol seulement, donc
  inaccessibles au doigt, ce qui compte depuis que le site tourne en PWA sur le
  téléphone.
- Cinq mini statistiques sous la grille (`statsHeatmap` et
  `rendreStatsHeatmap` dans app.js, `#heatmap-stats`, dans ZONES_JS) : tasses,
  jours actifs, série en cours, meilleure série, tasses par semaine.
  Deux subtilités à ne pas simplifier :
  1. La SÉRIE EN COURS tolère qu'aujourd'hui soit encore vide et repart d'hier.
     Sinon elle retomberait à zéro chaque matin avant le premier café et ne
     voudrait plus rien dire.
  2. Les TASSES PAR SEMAINE sont rapportées au temps réellement couvert (depuis
     la première extraction de la fenêtre), pas aux 18 semaines. Diviser par 18
     alors que le carnet a deux semaines donnerait un chiffre faux et
     décourageant.

## 6 bis. Insights automatiques du tableau de bord

Carte "Ce que tes données disent", juste sous les KPI. Des phrases calculées,
pas des graphiques en plus. Tout vit dans app.js, section "Insights
automatiques", et sort par `rendreInsights()` appelé depuis `rendreTableau()`.

Deux garde fous, ce sont eux qui font la valeur de la fonction :

- `MIN_SAMPLE = 3` extractions notées dans CHACUN des groupes comparés.
- `MIN_GAP = 0.4` point d'écart minimum. En dessous, on se tait.

Sans ça, avec une poignée d'extractions, n'importe quelle corrélation est du
bruit et une phrase affirmative serait un mensonge.

`bestOfGroups()` oppose le meilleur groupe au RESTE MIS EN COMMUN, pas au
deuxième. C'est délibéré : la mouture se découpe en beaucoup de groupes fins
(13 réglages de molette sur le Switch dans la démo), donc l'écart entre premier
et deuxième est toujours minuscule même quand l'écart entre le meilleur et tout
le reste dépasse le point. Tester premier contre deuxième reviendrait à ne
jamais rien dire. Le regroupement donne en plus un effectif de comparaison bien
plus grand.

Les quatre règles : fenêtre de fraîcheur (trois tranches d'âge), meilleur
réglage de mouture par machine, duel de recettes d'une même famille, effet du
préchauffage de l'eau en Brikka. La règle recettes ne parle QUE des familles où
exactement deux recettes ont assez d'extractions : à trois ou plus, nommer une
"perdante" serait faux puisqu'elle n'est peut être que deuxième.

Quand rien ne se déclenche, on explique POURQUOI (seuil non atteint, et le cas
échéant "renseigne tes dates de torréfaction") au lieu de laisser un cadre
vide. C'est la différence entre "pas assez de données" et "le site est cassé".

`#insights` est dans ZONES_JS : son contenu est généré, le TreeWalker ne doit
pas y toucher. Les phrases sont des gabarits T, avec les nombres déjà formatés
via `fmtDecimal` pour éviter tout problème de pluriel ou de séparateur décimal.

## 8 bis. Synchronisation entre appareils

Suggestion 1 du backlog. Le site étant en ligne, il est utilisé depuis le
téléphone en cuisine ET depuis le bureau, or IndexedDB est par appareil : sans
synchro, les deux jeux de données divergent et le suivi perd son sens.

Actif UNIQUEMENT sur le site déployé, et seulement si une base D1 est liée.
En `file://`, ou sans base, `SYNC.disponible()` est faux et tout se comporte
comme avant. La démo n'est JAMAIS synchronisée (`syncPossible()` teste
`demoActive`) : sans ce garde fou, charger la démonstration enverrait 62 fausses
extractions dans les vraies données.

### Choix techniques et pourquoi

- **D1 et pas KV.** KV est à cohérence éventuelle : une lecture juste après une
  écriture peut renvoyer l'état précédent pendant une minute. Or le geste type
  est exactement celui là, saisir sur le téléphone puis regarder sur le bureau.
- **Un document JSON et pas des tables SQL.** Le schéma des données vit dans le
  client (`normaliserX`, `migrerDonnees`) et bouge souvent. Le dupliquer en SQL
  imposerait une migration D1 à chaque colonne. Le serveur ne connaît que deux
  choses : chaque ligne a un `id` et un `maj_le`.
- **Fusion ligne par ligne, le plus récent gagne**, plus des PIERRES TOMBALES
  (`state.tombes`, `{table: {id: horodatage}}`). Sans elles, une extraction
  supprimée sur un appareil ressusciterait au premier échange avec l'autre, qui
  l'a encore. Elles sont purgées après 90 jours.
- L'ordre des lignes dans un tableau n'est PAS significatif (l'interface trie ce
  qu'elle affiche). La fusion est commutative sur le CONTENU. En production le
  document serveur est toujours le premier opérande, donc l'ordre converge aussi.

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

Conséquence assumée : une ligne relue d'un CSV vaut `maj_le = 0`, donc la
version du serveur gagne. Un IMPORT explicite, lui, estampille à maintenant,
sinon l'import serait annulé par la synchro suivante. Pour qu'une édition faite
à la main dans un CSV gagne, passer par Données, Ouvrir un dossier existant, ce
que le README indique déjà.

### Mécanique

`persister()` planifie une synchro débouncée à 1,5 s : une rafale d'édition ne
produit qu'une requête. `synchroniser()` envoie l'état local, le serveur
fusionne et renvoie le résultat, adopté des deux côtés en UN aller retour.
Elle ne rappelle PAS `persister()`, ce qui bouclerait. En cas d'échec les
données locales sont laissées intactes : une synchro ratée ne doit jamais faire
perdre une saisie.

`init()` synchronise AVANT de conclure qu'il n'y a pas de données : sur un
téléphone neuf tout est vide en local et c'est le serveur qui détient tout.
Sans cet ordre, la modale d'accueil proposerait la démo.

`/api/sync` répond 401 en JSON, jamais une redirection, pour que le client ne
parse pas la page de connexion comme des données. Tests :
`node worker/sync.test.mjs`, 23 assertions sur la fusion (union, résolution de
conflit, non résurrection, purge, formes invalides).

## 9 bis. PWA, hors ligne et verrou d'écran

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

## 10. Git et déploiement Cloudflare

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
Le seul découpage utile est celui déjà listé en dette technique dans
`V2 suggestions.md` : scinder `app.js` par écran, en scripts classiques.

### La porte d'entrée (worker/index.js)

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
- Le https débloque la suggestion 1 de `V2 suggestions.md` : service worker,
  manifest PWA (installable sur le téléphone) et API Wake Lock pendant le
  chrono. C'est le prolongement naturel de ce déploiement.
- Le site déployé est PRIVÉ depuis la v7.5 (voir "La porte d'entrée"). Une
  alternative existe si un jour la gestion du mot de passe devient pénible :
  Cloudflare Access (Zero Trust), gratuit en usage perso, qui remplace le
  mot de passe par un code envoyé par email. C'est plus robuste mais ce
  n'est pas ce qui a été demandé (identifiant plus mot de passe).
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
- v7.5 : porte d'entrée sur le site déployé. Un compte unique, identifiant et
  mot de passe, session de 30 jours par cookie signé HMAC, dans un Cloudflare
  Worker (`worker/index.js`) qui s'exécute devant les fichiers statiques.
  Ajout de `wrangler.jsonc` et `.assetsignore`. Les secrets vivent dans
  Cloudflare, le dépôt est public et n'en contient aucun. Le déploiement
  passe de Pages à Workers. AUCUN changement dans l'application elle même :
  l'ouverture en `file://` par double clic est intacte et sans login. Passage
  des messages de commit et du code nouveau à l'anglais.
- v7.6 : correction du `step` des champs prix du café (était 1000, or le
  Sáng Tạo 4 est à 148 800 ₫, sa fiche ne pouvait pas être enregistrée du
  tout) et contenance des tasses (était 5). Aucun changement de données ni de
  calcul. Documentation du piège `step` et du comportement des cafés inactifs
  dans le tableau de bord (ils y restent, c'est voulu).
- v7.7 : entête cliquable (icône plus titre, `.marque-lien`) qui ramène au
  tableau de bord depuis n'importe quel écran. C'est un vrai lien `#tableau`,
  donc focusable au clavier et ouvrable dans un onglet, mais app.js intercepte
  le clic simple pour basculer d'écran sans repasser par le hash. Dose
  préremplie à 15 g quand aucune recette ne la fixe (constante
  `DEFAULT_DOSE_G`, appliquée au formulaire complet et à la saisie rapide) ;
  une recette qui porte une dose gagne toujours.
- v7.8 : PWA installable (manifest, icônes générées, service worker réseau
  d'abord) et API Wake Lock pendant le chrono, pour que l'écran du téléphone ne
  se verrouille plus au milieu d'une extraction. Suggestion 1 du backlog,
  débloquée par le passage en https. Aucun effet en `file://`. Détail et
  pièges en section 9 bis.
- v7.9 : insights automatiques du tableau de bord (suggestion 6 du backlog),
  carte "Ce que tes données disent" sous les KPI. Quatre règles avec seuils
  d'échantillon et d'écart, comparaison du meilleur groupe au reste mis en
  commun, et message explicatif quand il n'y a pas assez de matière. Détail en
  section 6 bis.
- v7.10 : synchronisation entre appareils (suggestion 1 du backlog), la plus
  grosse pièce. Stockage Cloudflare D1 derrière la session existante, fusion
  ligne par ligne avec pierres tombales, colonne interne `maj_le` hors CSV,
  synchro débouncée à l'écriture et au chargement, ligne d'état et bouton manuel
  dans le panneau Données. Inactive en `file://`, en démo, et tant que la base
  D1 n'est pas liée. Détail et pièges en section 8 bis, activation en section 10.
- v7.11 : tableau de bord réordonné (30 jours, insights, 5 dernières, puis le
  reste) et calendrier d'activité rendu lisible : échelle de couleur ABSOLUE au
  lieu de relative au maximum (le défaut de fond), légende chiffrée, jour courant
  cerclé, cases plus grandes et cerclées, étiquettes de mois fiabilisées, cases
  atteignables au doigt, et résumé chiffré avec la plus longue série de jours
  consécutifs. Détail et raisons en section 6 ter.

## 6 quater. Cartes légitimement vides

Trois cartes peuvent rester vides très longtemps avec des données parfaitement
valides : "Note contre mouture", "Note contre âge du café", "Brikka contre
Switch". Un cadre vide se lit comme un site cassé, et c'est exactement la
confusion qui a été rapportée.

Chacune annonce donc sa cause RÉELLE et l'action qui la débloque, via
`majCarteVide()` plus une fonction `causeXVide()` par carte (app.js). Le
canvas est masqué et remplacé par le message, classe `.carte-vide`.

Les causes distinguées, parce qu'un "pas de données" générique n'aide personne :

| Carte | Cause détectée | Ce qu'on dit |
|---|---|---|
| mouture | tous les cafés extraits sont `deja_moulu` | ce n'est pas un bug, la mouture n'est volontairement pas stockée |
| mouture | autre | aucun réglage enregistré |
| âge | aucun café n'a de `date_torrefaction` | où la renseigner |
| âge | autre | pas encore d'extraction notée sur un café daté |
| duel | une seule méthode utilisée | passer un même café dans les deux machines |
| duel | autre | aucun café dans les deux machines avec une note |

Toutes ces cartes retombent sur `vide_rien` s'il n'y a aucune extraction notée.

## 6 quinquies. Numéro de version

`VERSION` dans app.js, affiché dans le pied de page (`#version-site`).
À INCRÉMENTER en même temps que le changelog. Indispensable depuis qu'un service
worker met des fichiers en cache : sans lui, "mon téléphone affiche l'ancienne
version" n'est pas diagnosticable, ni par Chris ni par un agent.
- v7.12 : numéro de version dans le pied de page (bouton de déconnexion écarté,
  un seul compte). Calendrier d'activité : cinq mini statistiques dont la série
  en cours et les tasses par semaine rapportées au temps réellement couvert.
  Les trois cartes qui peuvent rester vides avec des données valides expliquent
  désormais leur cause réelle et l'action qui les débloque (sections 6 quater).
  Nouvel insight moment de la journée, gratuit puisque l'heure est déjà stockée.
- v7.13 : suivi du stock par sachet (suggestion 4 du backlog). Cinquième table
  `achats`, migration idempotente qui fabrique un sachet implicite pour
  l'existant, badge de stock dans la liste des cafés (orange sous 3 tasses, rouge
  et nom barré quand c'est fini), bouton Nouveau sachet. L'effet le plus utile
  n'est pas le stock mais la fraîcheur : chaque sachet porte enfin sa propre date
  de torréfaction, alors qu'un café racheté gardait celle du premier paquet et
  affichait donc une fraîcheur fausse pour toujours. `achats` est ajouté aux deux
  listes de tables de synchronisation.
