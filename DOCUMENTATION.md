# DOCUMENTATION technique : Carnet d'extraction

Doc de référence du projet, maintenue à chaque modification. Commencer par
`START-HERE.md` si tu arrives sans contexte. Dernière mise à jour : v7.62,
2026-08-16.

## 1. Vue d'ensemble

Site mono-dossier, ouvert en `file://` dans Chrome. Aucune dépendance réseau :
Chart.js 4.4.4 est embarqué dans `js/vendor/chart.umd.js`. Les scripts sont
des scripts classiques (pas de modules ES, ils ne marchent pas en file://),
chargés dans cet ordre : chart.umd, i18n, grind, recettes, demo-data, sync, data,
reglages, charts, puis les six fichiers d'interface et app. Chaque fichier expose
un objet global (I18N, GRIND, DATA, CHARTS) ou des constantes globales
(RECETTES_DEPART, etc.).

L'interface tenait dans un seul `app.js` de 3 400 lignes et une seule IIFE. Elle
est découpée depuis la v7.60 (voir section 1 bis).

SIX écrans dans une page unique, bascule par nav et hash. La liste fait foi dans
`ECRANS` (js/ui-noyau.js) : tableau, saisie, historique, reglages, guide, parametres.

La barre de navigation ne porte que TROIS onglets à texte, ceux où l'on va
plusieurs fois par jour : tableau, saisie, historique. Les trois écrans
consultatifs (reglages, guide, parametres) sont des icônes dans les outils
d'entête, avec la classe `nav-btn nav-icone` pour que le clic et l'état actif
restent gérés au même endroit que les onglets. Un septième onglet à texte faisait
passer la barre à la ligne, sous le reste de la page. Un test le verrouille.

L'écran `reference` a fusionné dans `guide` : la référence matériel et le guide
d'achat parlaient du même sujet et se consultaient l'un après l'autre. Les anciens
liens `#reference` restent valides grâce à `ECRANS_RENOMMES` dans js/ui-noyau.js,
qui est
le bon endroit pour tout renommage futur d'écran.
Elle était codée en dur en deux endroits, ce qui obligeait à penser aux deux à
chaque ajout. Bouton flottant de saisie rapide en bas à
droite (café + recette + note, le reste prérempli).

## 1 bis. L'interface en sept fichiers

Jusqu'à la v7.60, toute l'interface tenait dans `js/app.js` : 3 400 lignes, une
IIFE, une seule portée. C'était confortable, tout se voyait de partout, et
personne ne pouvait mal se câbler. C'était aussi devenu illisible, et la portée
unique cachait au moins un bug (voir plus bas).

### Le découpage

| fichier | rôle |
| --- | --- |
| `js/ui-noyau.js` | outils partagés, thème, navigation. Définit `UI`. |
| `js/ui-tableau.js` | écran d'accueil : insights et calendrier d'activité |
| `js/ui-saisie.js` | formulaire, chronomètre, brouillon, panneau rapide |
| `js/ui-historique.js` | tableau, filtres, tri, comparateur |
| `js/ui-guide.js` | recettes de référence, pas à pas, convertisseur de mouture |
| `js/ui-catalogue.js` | modales cafés, sachets, recettes, écran Paramètres |
| `js/app.js` | liaison des données, câblage des écouteurs, démarrage |

### Les deux règles

**Le noyau se charge en premier, donc on l'emprunte.** Chaque fichier commence
par `const { $, $$, toast, ... } = UI;`. C'est une liaison de valeur, mais les
noms empruntés sont des fonctions et des objets : elles ne changent jamais
d'identité.

**Les écrans s'appellent par `UI.`, jamais directement.** `UI.rendreHistorique()`
est résolu au moment de l'appel, pas au chargement. C'est ce qui autorise deux
écrans à s'appeler mutuellement, ce qu'ils font : la saisie ouvre le pas à pas du
guide, le guide relit l'état de la saisie. Avec des emprunts, il aurait fallu un
ordre de chargement sans cycle, et il n'y en a pas.

Le noyau lui-même n'emprunte rien et ne connaît aucun écran : quand il doit en
redessiner un, il passe par `UI`. Un noyau qui appellerait `rendreHistorique()`
directement ne serait plus un noyau, ce serait l'application entière avec des
étapes.

### Le piège, et il est silencieux

**Ne jamais partager un `let` par emprunt.** La déstructuration lie une VALEUR :
un fichier qui emprunte une variable réassignée plus tard par le noyau reste figé
sur la valeur du chargement, pour toujours, sans que rien ne le signale. C'est
arrivé pendant le découpage lui-même, sur l'écran courant : `ecranCourant` et
`ouvertureEdition` étaient deux `let`, et seule une relecture l'a attrapé.

L'état partagé doit être un OBJET muté en place. C'est déjà la forme de `saisie`,
`chrono`, `tri`, `replis`, et c'est maintenant celle de `nav`
(`{ ecran, ouvertureEdition }`). `tools/modules.test.mjs` refuse tout emprunt
d'une variable réassignable du noyau.

### Ce que le découpage a trouvé

`enregistrerRapide()` lisait `cafeQ`, un nom qui n'existait nulle part. Le code
est en mode strict, donc cette lecture levait une ReferenceError AVANT l'appel à
`ajouterExtraction` : le bouton d'enregistrement du panneau rapide ne faisait
rien du tout, et la tasse était perdue en silence.

Tant que 3 400 lignes partageaient une portée, aucun outil ne pouvait poser la
question : le nom aurait pu venir de n'importe où dans le fichier. C'est en
séparant les portées qu'elle devient posable. `tools/modules.test.mjs` la pose
maintenant à chaque exécution.

### Ajouter du code

- Une fonction utilisée par UN seul écran : dans son fichier, sans l'exposer.
- Une fonction appelée depuis un autre écran : l'ajouter à l'`Object.assign(UI, …)`
  de son fichier, et l'appeler en `UI.laFonction()`.
- Un outil utile à DEUX écrans au moins : dans le noyau. Pas avant : un nom placé
  dans le noyau est un nom que tous les écrans peuvent utiliser, et c'est un
  engagement.
- Un nouveau fichier d'interface : le déclarer dans `index.html`, `sw.js` ET
  `tools/boot.test.mjs`. En oublier un donne trois pannes différentes (écran
  blanc, application hors ligne cassée, test qui passe alors que le site est
  mort). Deux tests comparent ces listes entre elles.

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
  survol ou au focus (attribut data-info, styles ".pilule[data-info]" dans
  styles.css). Ne pas mettre de guillemets doubles dans ces définitions
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

## 3. Migrations : une VERSION DE SCHÉMA, pas des drapeaux

`migrerDonnees()` fait deux choses de nature différente, et il faut les
distinguer.

**Les rattrapages IDEMPOTENTS**, en tête de fonction : renommages de recettes,
fiches café complétées, tasses par défaut, date d'ajout déduite, puissance de feu
des extractions historiques. Ils se reconnaissent à leur condition, du genre « si
le champ est vide » ou « si le tag est absent », donc les rejouer ne fait rien. Ils
peuvent tourner à chaque démarrage sans risque.

**Les rattrapages À USAGE UNIQUE**, dans `PAS_DE_SCHEMA`. Ceux-là changent une
valeur SEMÉE vers une autre valeur, donc les rejouer écraserait un réglage que
Chris aurait choisi volontairement entre temps. Il leur faut une mémoire.

Cette mémoire était un drapeau par migration dans `localStorage`. C'était faux :
les drapeaux sont PAR APPAREIL alors que les données sont PARTAGÉES. Un appareil
qui démarrait avec un stockage vide posait ses drapeaux sur rien, recevait ensuite
le document du serveur non migré, et ne le migrait plus jamais. Ce n'est pas
théorique, c'est arrivé avec les 150 g de chaudière de la Brikka.

La mémoire est maintenant un NUMÉRO DE VERSION rangé dans la ligne `reglages`,
donc synchronisé avec le reste. `appliquerSchema()` exécute les pas dont le numéro
dépasse la version du document, puis écrit `SCHEMA_ACTUEL`. Conséquences :

- un appareil neuf qui reçoit un document déjà migré ne rejoue rien ;
- un document en retard est rattrapé par le premier appareil qui l'ouvre, quel
  qu'il soit ;
- un export CSV porte sa version, donc il se réimporte correctement.

POUR AJOUTER UNE MIGRATION : un pas de plus à la FIN de `PAS_DE_SCHEMA`, avec le
numéro suivant, et `SCHEMA_ACTUEL` incrémenté. **Ne jamais renuméroter, ne jamais
insérer au milieu** : le numéro déjà écrit chez Chris est une promesse. Et chaque
pas ne doit toucher QUE la valeur semée d'avant.

Les tests font tourner le moteur pour de vrai, sur quatre scénarios : document
sans version, document déjà migré, document en retard, et rejeu après un réglage
manuel.

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

## 5 bis. Le moulin dans l'écran Guide : un réglage, pas un convertisseur

Le bloc était un champ texte et un diagramme figé. C'est devenu l'endroit où Chris
choisit sa mouture.

- **Curseur en CRANS**, de 0 à 150, pas de 1. L'unité est celle du moulin lui
  même : un pas du curseur égale un cran de la molette, donc ce qu'il lit se
  reproduit à la main. Un curseur en microns aurait été plus joli et intraduisible
  en geste.
- **Repères cliquables** sous le curseur, alimentés par `GRIND.REFERENCES`.
- **`conseilMouture()`** répond à trois questions dans cet ordre : est-ce que ça
  marche sur ses deux machines, quel goût donne un déplacement, et à combien de
  crans il est de son réglage enregistré. Rien d'inventé, les plages viennent de
  `GRIND.verifierPlage` et l'écart se compte en crans.
- **Un bouton applique le réglage** dans `replis.molette`, le MÊME repli que
  l'écran Paramètres. Une seule source, deux portes d'entrée. Le bouton se
  désactive et change de texte quand la valeur est déjà celle enregistrée.
- `CHARTS.diagramme` prend un troisième argument, le réglage enregistré, tracé en
  trait vert épais distinct du curseur noir : en glissant, l'écart doit se voir.

ORDRE DE DÉMARRAGE : `chargerReplis()` doit tourner AVANT
`rendreConvertisseur()` et `reinitialiserSaisie()`. Il était appelé après, donc le
convertisseur s'affichait sur la valeur d'usine et pas sur celle de Chris.

Le décalage du zéro de SON moulin est documenté dans un encadré : les meules se
touchent vers 0.0.2, donc l'échelle en microns le surestime d'environ 17 µm, soit
2,7 %. Non corrigé dans le calcul, volontairement : c'est en dessous de la
dispersion d'un jeu de meules et de l'imprécision du 8,32 µm par cran, et ce qui
compte est d'enregistrer toujours ce que le cadran affiche.

L'écran Guide a aussi été remis d'aplomb : Recettes descend sous Règles puisqu'un
onglet entier leur est consacré, le comptage annoncé passe de "deux Brikka, cinq
Switch" à quatre et six, et le récapitulatif de mouture par recette a disparu
puisque les dix portent 1.5.0. Des tests comparent maintenant ces affirmations aux
données réelles plutôt que de les laisser vieillir toutes seules.

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

## 7 decies. La note est FACULTATIVE

Chris enregistre souvent l'extraction en sortant la tasse, puis revient noter
après l'avoir bue. Le formulaire imposait 7 sur 10 par défaut, donc une tasse
oubliée gardait un 7 inventé qui polluait toutes les moyennes.

Un curseur HTML ne peut pas être vide, donc l'absence de note vit dans une case à
cocher `#f-note-vide`, cochée par défaut. Cochée, `noteSaisie()` renvoie `""` et
l'extraction compte comme non notée partout : moyennes, insights, meilleurs
réglages et classements filtrent déjà tous sur `note_sur_10 !== ""`, il n'y avait
donc rien à changer en aval.

Deux détails qui comptent :

- Le curseur démarre à 5, au milieu, et pas à 7. Une position n'est pas une
  proposition, mais autant qu'elle ne ressemble à aucune note en particulier.
- La case se décoche sur `input` ET sur `pointerdown`. Poser le doigt sur le
  curseur là où il est déjà ne déclenche aucun `input` : sans le `pointerdown`,
  Chris aurait cru noter 5 et enregistré une tasse non notée.

Un test vérifie qu'une note vide reste vide jusque dans le CSV. Elle ne doit
JAMAIS devenir 0, qui serait la pire des notes.

## 6 quaterdecies. Le levier qui compte, par café ET par machine

Les règles d'insight comparaient des groupes sur TOUT l'historique. C'est
trompeur : mélanger un Sáng Tạo en Brikka et un Liberica en Switch pour conclure
sur la puissance de feu produit une moyenne qui ne décrit aucune tasse réelle.

`REGLAGES.constatsParCafe()` isole chaque couple (café, machine), puis cherche
parmi six leviers (feu, préchauffage, recette, dose, mouture, âge du paquet) celui
qui sépare le mieux SES tasses. Un seul constat par lot, le plus franc : trois
phrases sur le même café se contrediraient à moitié.

Les garde-fous sont les mêmes que partout et ne sont pas négociables : trois
tasses de chaque côté, 0,4 point d'écart, et au moins DEUX valeurs pour le levier.
Un levier qui n'a jamais varié ne peut rien expliquer, même si ses tasses sont
excellentes.

Sur les 29 tasses actuelles de Chris, AUCUN constat ne passe : le meilleur écart
par couple tombe à 0,17 point. C'est le bon comportement, pas un défaut de la
fonctionnalité. Les règles globales prennent le relais, et elles annoncent
désormais leur propre limite en commençant par "Toutes tasses confondues".

La règle mouture est retirée dans le même mouvement : le champ n'a qu'une valeur
chez Chris (1.5.0, son réglage unique) et 21 % de remplissage, donc deux groupes
de trois ne pouvaient jamais exister. La mouture reste examinée, mais PARMI les
autres leviers, ce qui la fait se taire proprement quand elle ne varie pas.

## 6 terdecies. La courbe de tendance

Les notes brutes sautent trop pour se lire : chez Chris elles font 8, puis 4, puis
7,5 d un jour à l autre. La moyenne glissante sur cinq tasses raconte l histoire
réelle, et elle en a une : 8,0 début août, 5,1 le 16, retour à 7,0 le 27.

`REGLAGES.moyenneGlissante(extractions, fenetre)` est PUR, sans DOM, testé sans
navigateur comme le reste de ce fichier. Trois choix :

- La fenêtre compte des TASSES notées, pas des jours. À une ou deux tasses par
  jour actif, une fenêtre en jours serait pleine de trous et sauterait autant que
  les points bruts.
- Elle renvoie `null` tant qu elle n est pas pleine. Afficher une moyenne de deux
  tasses comme si c en était une de cinq mentirait sur sa solidité.
- Elle trie par date, donc l ordre d entrée ne change rien.

Côté tableau de bord, la courbe se calcule sur TOUT l historique noté et pas sur
la fenêtre de 30 jours : sinon elle serait vide les quatre premiers jours
affichés. Elle est ensuite projetée jour par jour en gardant la dernière valeur
connue, pour ne pas se couper les jours sans tasse.

Elle partage l axe de note avec les points bruts : deux échelles différentes sur
le même graphe se compareraient sans qu on le voie. Trait épais et sans point,
pour se lire comme un fond et pas comme une mesure de plus.

## 6 duodecies. Jours depuis l ouverture du paquet

La règle de fraîcheur partait de `date_torrefaction`. Aucun des cinq cafés de
Chris ne la porte, et il n en aura pas : les torréfacteurs vietnamiens ne
l impriment pas. La règle n a donc jamais pu se déclencher une seule fois.

Ce qui fait vraiment bouger ses tasses, il le dit lui même, c est le temps depuis
qu il a OUVERT le sachet. Le café dégaze, puis s évente, et une tasse à J+1 n a
rien à voir avec la même à J+21.

`date_ouverture` vit sur le SACHET (table `achats`) et pas sur le café : un café
racheté a plusieurs sachets, ouverts des jours différents. Vide tant qu il dort
dans le placard, ce qui est une information en soi.

`sachetALaDate(cafeId, date)` retient le sachet EN VIGUEUR ce jour là et pas
simplement le dernier acheté. Sans ça, une tasse du 10 août serait rattachée au
sachet acheté le 20 et afficherait un âge négatif.

`jours_ouvert` est un champ CALCULÉ, jamais saisi : la saisie l affiche en
lecture seule sous le choix du café, et se tait quand la date d ouverture manque
plutôt que d afficher un zéro faux. Le saisir à la main aurait créé une deuxième
vérité.

Les tranches de la règle d insight suivent le dégazage puis l éventement :
première semaine, une à trois semaines, au delà.

## 6 undecies. Tasses restantes, à la dose du café

Le badge de stock disait "{g} g, {n} tasses", ce qui se lisait aussi bien comme du
consommé que du restant. Il dit maintenant "reste {g} g, environ {n} tasses".

Surtout, l'estimation utilise désormais la dose MOYENNE de ce café et plus la dose
de repli. Chris dose 15,9 g en moyenne sur son G4 : avec la dose de repli à 15 g,
un sachet où il reste 139 g annonçait 9 tasses au lieu de 8. Repli sur la dose par
défaut tant que le café n'a aucune extraction, et l'infobulle dit laquelle des
deux a servi.

## 8 septies. Un état sélectionné ne change QUE des couleurs

`.tag.actif`, `.pilule.actif` et `.nav-btn.actif` passaient le libellé en
`font-weight: 600`. Le gras est plus large que le normal, donc la pastille
grandissait au clic, donc la ligne se réorganisait : cocher "citronné" envoyait
tout le groupe "floral et thé" à la ligne suivante, sous les doigts de Chris.

Le gras était de toute façon redondant. L'état actif porte déjà un fond et une
couleur d'accent, et sur les pilules un fond plein avec du texte presque blanc :
ça se voit de l'autre bout de la pièce.

RÈGLE À TENIR : un état sélectionné ne change que des couleurs. Jamais
`font-weight`, `font-size`, `letter-spacing`, `padding` ni `border-width`. Un
test parcourt les règles `.actif` de `styles.css` et refuse ces cinq propriétés,
donc la règle vaut pour tout ce qui sera ajouté plus tard, pas seulement pour les
trois sélecteurs corrigés. Vérifié en réintroduisant le `font-weight` : le test
échoue.

Le corollaire, pour un état qui DOIT changer une bordure : la déclarer dès l'état
normal et ne changer que sa couleur, ce que font déjà `.tag` et `.pilule` avec
leur `border: 1px solid var(--lignes)`.

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

Cinq suites sans navigateur, sans dépendance, à lancer depuis `tracker/` :

```
node tools/boot.test.mjs     demarrage et rendu des 7 ecrans
node tools/data.test.mjs     couche de donnees, dont les deux logiques de ratio
node tools/modules.test.mjs  frontieres entre les sept fichiers d'interface
node worker/sync.test.mjs    fusion entre appareils, 23 assertions
node worker/index.test.mjs   porte d'entree, 32 assertions
```

Un anti-rebond est un PANSEMENT, pas une solution : il masque un coût, il ne
l'enlève pas. Celui du curseur du moulin couvrait un redessin complet d'un SVG de
151 traits à chaque cran ; depuis que le squelette de la réglette est construit
une seule fois, il ne restait que ses 90 ms d'attente sur le seul contrôle du
site qu'on manipule en continu. Il a donc été retiré, et un test empêche de le
remettre par réflexe. Le champ texte du convertisseur, lui, garde le sien :
personne ne regarde la réglette en tapant.

`tools/modules.test.mjs` lit les fichiers d'interface sans les exécuter et
vérifie les frontières que le découpage a créées : aucun nom libre inconnu,
tout ce qui est lu sur `UI` y est bien posé, aucun emprunt d'une variable
réassignable, et les trois listes de scripts restent d'accord. Il est vérifié en
réintroduisant le bug de `cafeQ` : il échoue.

`tools/boot.test.mjs` est le plus important après une modification de l'interface.
Il monte un faux DOM et EXÉCUTE réellement l'application : démarrage, rendu des
sept écrans, bascule de langue. C'est le seul filet contre une erreur d'exécution,
puisque le panneau navigateur de l'agent ne peut pas charger ce site. Il capte les
exceptions par les trois chemins possibles (try/catch de notifier, promesse
rejetée, throw direct), sans quoi il afficherait l'erreur sans échouer. Vérifié en
réintroduisant volontairement le bug du 14 août : il échoue.

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

## 6 octies. Écran Mes meilleurs réglages

`js/reglages.js`, chargé entre data.js et app.js. Le CALCUL y vit, sans aucune
dépendance au DOM, ce qui le rend testable sans navigateur. app.js ne fait que
l'affichage. Ce découpage est délibéré : app.js dépasse 2500 lignes et le backlog
demande de le scinder, autant ne pas aggraver en attendant.

PAR CAFÉ et pas en général. Le meilleur réglage d'un Sáng Tạo 4 déjà moulu à
82 pour cent de café n'a rien à voir avec celui d'un Balanced en grains : une
moyenne globale mélangerait les deux et ne serait actionnable pour aucun.

Une COMBINAISON regroupe les leviers que Chris contrôle au moment de faire la
tasse : recette, mouture, puissance de feu, préchauffage. Le café est la clé de
regroupement, pas un levier. La note et le diagnostic sont des résultats, donc
exclus. Les valeurs vides comptent : "pas de mouture" est une information sur un
café déjà moulu, pas une donnée manquante.

Seuil de `MIN_TASSES` (3), le même que les insights. Quand rien ne sort, la carte
dit POURQUOI et distingue les deux cas, qui n'appellent pas la même action :

- `pas_assez` : moins de trois tasses notées en tout.
- `eparpille` : assez de tasses, mais chacune à un réglage différent. Le conseil
  est alors de REFAIRE le réglage le plus joué, pas d'en essayer un nouveau, et le
  nombre de tasses manquantes est annoncé.

"Refaire cette tasse" duplique la tasse de RÉFÉRENCE de la combinaison, la mieux
notée (la plus récente à égalité), plutôt que de reconstruire les champs un par
un : on récupère ainsi tout le reste du contexte, tasse comprise.

## 6 septies. Régularité, et pourquoi pas l'écart type

Le KPI de régularité utilise l'ÉCART MOYEN à la moyenne, pas l'écart type.
L'écart type est la mesure canonique mais elle ne se lit pas : personne ne sait
ce que vaut un sigma de 1,2. L'écart moyen se dit en français exact, "tes tasses
s'écartent en moyenne de 0,8 point de ta moyenne". Sur une poignée de notes les
deux donnent des chiffres très proches (0,8 contre 1,0 sur les 11 premières
extractions), donc la clarté ne coûte rien à la justesse. `ecartMoyen()` renvoie
null sous deux notes : une seule note n'a pas de régularité.

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

Les règles : fenêtre de fraîcheur (trois tranches d'âge), meilleur réglage de
mouture par machine (une par machine), duel de recettes d'une même famille,
moment de la journée, puissance de feu en Brikka.

Une règle sur le préchauffage a existé et a été RETIRÉE en v7.21 : depuis que le
préchauffage est une recette à part entière (v7.17), elle comparait exactement les
mêmes tasses que le duel de recettes et produisait donc deux fois la même phrase.
Quand une variable devient une recette, sa règle dédiée devient un doublon, à
retirer. La règle recettes ne parle QUE des familles où
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

## 8 decies. Les bascules annoncent leur état, et s'ouvrent au doigt

70 boutons, zéro `aria-pressed`. Les pilules de diagnostic, les descripteurs et
le choix de machine sont des BASCULES : l'état se voyait au fond coloré, mais rien
ne l'annonçait. Un lecteur d'écran lisait "bouton chocolat noir" sans jamais dire
s'il était coché.

`aria-pressed` et pas `aria-checked` : ce sont des boutons à deux états, pas des
cases à cocher dans un formulaire. Les onglets de navigation, eux, prennent
`aria-current="page"` : ce sont des liens déguisés en boutons, pas des bascules.

Point à tenir : `basculerEtat()` change la classe ET l'attribut d'un SEUL geste.
Les séparer serait la garantie qu'ils divergent un jour, la classe suivant et
l'attribut restant figé. Un test compte les `classList.toggle("actif")` restants
et refuse qu'ils se multiplient.

## L'appui long, pour les définitions

Les bulles d'aide s'ouvraient au survol et au clavier. Sur téléphone le survol
n'existe pas, et un tap ne déclenche pas `:focus-visible` : la moitié du
vocabulaire des descripteurs était donc inatteignable dans le seul contexte où
Chris utilise vraiment le site, la PWA en cuisine.

Un appui de 450 ms ouvre la bulle, l'appui court garde son rôle de bascule, et un
mouvement du doigt annule pour ne pas la déclencher pendant un défilement.

À NE PAS DÉPLACER : `activerAppuiLong()` s'attache au CONTENEUR, une seule fois,
depuis `cabler()`. `construirePilules()` réécrit le contenu mais pas le
conteneur : appeler depuis là empilerait un jeu d'écouteurs à chaque bascule de
langue. Un test vérifie l'ordre.

## 8 nonies. Supprimer, puis pouvoir revenir en arrière

Contrainte posée par Chris et qui décide de toute la conception : **si la page se
ferme pendant les cinq secondes, la suppression doit quand même avoir lieu.**

Ça exclut la solution naïve, qui aurait été de retarder la suppression de cinq
secondes. Elle est plus simple à écrire, mais fermer l'onglet pendant le délai
aurait alors ANNULÉ une suppression que Chris croyait faite. C'est exactement le
genre de piège silencieux qu'on essaie d'éviter partout ailleurs.

Donc : on supprime TOUT DE SUITE, pour de vrai, synchro comprise, et on garde une
copie de la ligne en mémoire. Le message propose "Annuler" pendant cinq secondes.
Fermer la page, changer d'écran ou laisser filer le délai ne font rien de plus,
la suppression est déjà acquise.

`DATA.restaurerExtraction()` réinsère SOUS L'ID D'ORIGINE, contrairement à
`ajouterExtraction()` qui en attribue un nouveau. Les liens d'édition, la
sélection du comparateur et les références de l'historique pointent sur l'id : une
restauration sous un autre id aurait marché tout en cassant l'identité. La fusion
sait gérer le retour d'une ligne supprimée, elle compare la pierre tombale à
`maj_le` et l'écriture la plus récente gagne, donc l'annulation voyage aussi vers
les autres appareils.

Le `confirm()` natif de suppression disparaît avec ça : le retour arrière remplace
la question. Sur téléphone une boîte système casse l'impression d'application, et
elle ne passe pas par la couche i18n donc elle reste en français en mode anglais.
Il en reste quatre, sur des gestes rares et vraiment destructeurs (vider les
données, charger la démo, rétablir ou supprimer une recette).

## 8 octies. Les réglages du matériel se synchronisent

`replis` (dose de repli, puissance de feu, molette du broyeur) vivait en
`localStorage`. Ces trois valeurs décrivent le MATÉRIEL de Chris, pas l'appareil
qu'il tient : sa molette de broyeur est la même vue du téléphone et de
l'ordinateur. Il réglait donc sur le portable et son téléphone continuait de
préremplir les valeurs d'usine, sans qu'il puisse le voir puisque ce sont des
champs préremplis d'apparence normale.

C'est devenu une TABLE `reglages` d'une seule ligne, d'id fixe `moi`. Le choix
surprend, alors il faut le justifier : la fusion par `maj_le`, les tombstones et
l'assainissement réseau existent déjà et sont testés. Un mécanisme dédié aux
préférences aurait été un DEUXIÈME chemin de synchronisation à écrire, tester et
maintenir, pour une ligne de données. Une table coûte six lignes réparties et
hérite de tout le reste.

`normaliserReglages` borne les trois valeurs et retombe sur l'usine hors bornes :
ce qui arrive du réseau n'est jamais digne de confiance.

Reprise : `reprendreReplisLocaux()` remonte une fois les valeurs posées en
`localStorage` avant la bascule, marquée par `replis-repris`, et SEULEMENT si la
table est encore vide. Une reprise qui écraserait un réglage déjà synchronisé
serait pire que pas de reprise du tout.

Restent locaux à juste titre : le THÈME et les BIPS. Un téléphone en cuisine et un
ordinateur n'ont pas les mêmes besoins, ce sont de vraies préférences d'appareil.

Les deux tests de comptage de tables ne comptent plus : ils comparent
`js/sync.js`, `worker/sync.js` et l'état entre eux. Un oubli dans l'une des deux
listes ne se voyait pas autrement.

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

Un IMPORT explicite, lui, estampille tout à maintenant, sinon l'import serait
annulé par la synchro suivante.

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

## 6 sexies. Quels goûts font tes bonnes tasses

Barres horizontales, un descripteur par ligne, note moyenne des tasses où il a été
coché. `rendreGouts()` dans app.js, canvas `g-gouts`.

REMPLACE le nuage "Note contre âge du café", supprimé. Celui là dépendait de
`date_torrefaction`, que les paquets vietnamiens ne portent presque jamais : il
était structurellement vide et le restera. Les descripteurs, eux, se cochent à
chaque tasse, donc la donnée est toujours là.

C'est aussi le SEUL graphique du tableau de bord qui parle de GOÛT plutôt que de
réglage, alors que c'est le sujet du carnet. L'anneau des diagnostics compte des
problèmes, pas des saveurs.

- `MIN_TASSES_GOUT = 3` : sous ce seuil un descripteur est du bruit.
- 10 meilleurs plus 5 pires. Sur 59 tags, tout afficher serait illisible, et
  l'information est dans les extrêmes. En dessous de 15 éligibles, on montre tout.
- Vert au dessus de la moyenne globale, rouge en dessous, et la moyenne est
  rappelée sous le graphique : sans repère, "7,9" ne dit pas si c'est bon pour lui.
- Les libellés passent par `I18N.tag()`, donc les valeurs stockées restent
  françaises.

Note liée : l'insight de fraîcheur (`insightFraicheur`) EXISTE TOUJOURS et se
déclenchera si des dates de torréfaction apparaissent un jour. Mais le message qui
réclamait ces dates a été retiré : Chris a dit qu'il ne les aurait quasi jamais, le
rappel serait un reproche permanent.

## 7 bis. Durées en minutes et secondes, et brouillon de saisie

**Durées.** `temps_total_s` et `temps_ecoulement_s` restent stockés EN SECONDES,
donc les CSV et l'historique ne bougent pas et il n'y a rien à migrer. Seule la
saisie change : deux champs `-min` et `-sec`, lus par `lireDuree()` et remplis
par `ecrireDuree()`. Piège traité : les deux champs vides rendent `""` et non
`0`, sinon toute extraction sans chrono se retrouverait à zéro seconde au lieu
de "non renseigné".

**Brouillon.** Sur téléphone, quitter l'onglet pendant une extraction suffit à ce
que le navigateur décharge la page, et c'est précisément à ce moment qu'on sort de
l'application. `ecrireBrouillon()` sauvegarde le formulaire dans localStorage.

- Volontairement HORS des données synchronisées. Un brouillon est propre à un
  appareil; le pousser sur le serveur ferait apparaître une saisie fantôme sur
  l'autre.
- Jamais sauvegardé pendant l'ÉDITION d'une extraction existante
  (`saisie.editId`), sinon le brouillon écraserait le formulaire au démarrage
  suivant avec des valeurs appartenant à une ligne déjà enregistrée.
- Restauré seulement si `brouillonUtile()` : sans ce test, le formulaire vierge
  sauvegardé au premier chargement déclencherait un message "brouillon repris" à
  chaque ouverture.
- Périmé après 24 h.
- Écrit sur `visibilitychange` vers `hidden` sans attendre le debounce : c'est
  le dernier événement fiable avant qu'un navigateur mobile décharge la page.
- Effacé à l'enregistrement, jamais avant.

## 8 quater. Détail dépliable et comparateur

**Détail dépliable.** Le carnet stocke 22 champs par extraction, le tableau en
montre 8. Un clic sur le chevron de la colonne date déplie une ligne
supplémentaire en `colspan="9"`, donc SANS toucher aux largeurs de colonnes qui
sont figées. Elle montre le reste : doses, températures, temps, puissance de feu,
tasse, volumes, coût, descripteurs et commentaire. C'est ce qui rend le
commentaire utile, il n'était jamais relu.

L'état d'ouverture vit dans un `Set` en mémoire (`detailsOuverts`), pas dans les
données : quelles lignes sont dépliées n'a aucune raison d'être synchronisé.

**Comparateur.** Sélection par un bouton de la colonne Actions, PAS par une
colonne de cases à cocher : le tableau vient d'être figé à neuf colonnes, en
ajouter une casserait les largeurs. Au delà de deux sélections, la plus ancienne
cède sa place, ce qui permet d'enchaîner les comparaisons sans vider à la main.

La modale n'affiche en surbrillance QUE les lignes qui diffèrent. C'est là que se
trouve l'explication de l'écart de note; surligner le reste serait du bruit. Une
ligne vide des deux côtés n'est pas affichée du tout.

## 8 ter. Tableau de l'historique, largeurs figées

`table-layout: fixed` avec neuf largeurs en pourcentage qui totalisent exactement
100. Sans ça les colonnes s'élargissaient avec leur contenu (un nom de café long,
un diagnostic multiple) et poussaient la table au delà du conteneur : d'où un
défilement horizontal permanent.

Le texte trop long est TRONQUÉ (`text-overflow: ellipsis`), et les trois colonnes
de texte libre (café, recette, diagnostic) portent un attribut `title` qui donne
la valeur complète au survol. Les guillemets doubles y sont neutralisés,
`attrTitre()` dans app.js.

`min-width: 900px` sur la table : en dessous, sur téléphone, on défile plutôt que
d'écraser neuf colonnes en bouillie. Le défilement horizontal n'a donc pas
disparu, il est devenu le comportement de repli sur petit écran au lieu d'être la
norme sur grand écran.

## 7 ter. Mise en page du formulaire de saisie

Trois défauts cumulés, corrigés en v7.22 :

1. DEUX grilles `.grille-nombres` se suivaient, chacune laissant des cellules
   vides en fin. Il n'y en a plus qu'UNE, les champs s'y enchaînent.
2. Les cases à cocher vivaient dans cette grille alors qu'elles n'ont pas de
   libellé au dessus de leur contrôle : elles se calaient donc plus haut que
   leurs voisines. Elles sont sorties dans `.options-saisie`, un groupe à part.
3. `.champ` porte un `margin-bottom` qui s'ajoutait au `gap` de la grille, d'où
   des espacements irréguliers. Neutralisé dans la grille.

Deux réglages qui ne sont PAS arbitraires :

- `minmax(220px, 1fr)` donne quatre colonnes sur écran large. En Brikka les
  champs visibles remplissent alors exactement deux lignes.
- AUCUN champ de cette grille ne s'étend sur deux colonnes. Un élément large ne
  tient pas dans une fin de ligne et bascule seul sur la suivante, ce qui créait
  un trou au MILIEU du formulaire (cas d'une recette au lait). Toutes les cellules
  font une colonne, les espaces restants sont donc toujours en fin.
- `align-items: start` : un champ portant une aide sous son input étirait sa
  cellule et décalait ses voisins.

La case "eau préchauffée" est MASQUÉE sur la famille `brikka-classique`
(`majChampPrechauffe`, `FAMILLES_PRECHAUFFAGE` dans recettes.js) : le
préchauffage y est la différence entre les deux variantes, donc la case ferait
doublon avec le choix de recette et permettrait d'enregistrer une contradiction.
La valeur stockée se déduit alors de la recette, ce qui garde `eau_prechauffee`
juste sur toute l'histoire. Elle reste visible sur les autres recettes Brikka.

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
`AUDIT.md` : scinder `app.js` par écran, en scripts classiques.

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

## 6 nonies. Le ratio : eau sur dose, sur les deux machines

Le ratio principal est `eau_g / dose_g`, quelle que soit la machine. C est la
convention universelle du café, la seule qui se compare à une recette, à une
source ou à un autre buveur.

Il y a eu une parenthèse en v7.29 où la Brikka basculait sur le volume EXTRAIT
divisé par la dose, au motif que la chaudière ne décrit pas la concentration en
tasse. Le raisonnement tenait, la pratique non : le volume extrait est rempli sur
UNE extraction sur 29. Le ratio en tasse ne s affichait donc presque jamais, et
quand il s affichait il donnait un nombre incomparable à tout le reste.

`DATA.calculs()` renvoie donc :

- `ratioTexte` et `ratioBase`, toujours eau sur dose. La base vaut `chaudiere`
  en Brikka et `infusion` en Switch : le mot sert à l explication au survol, pas
  à changer le calcul.
- `ratioTasseTexte`, SECONDAIRE et seulement s il est mesuré. Affiché entre
  parenthèses derrière le principal.
- `ratioBoisson`, également secondaire, quand on allonge à l eau ou au lait.

À ne pas refaire : promouvoir une statistique qui dépend d un champ que personne
ne remplit. Vérifier le taux de remplissage AVANT de construire dessus.

## 6 decies. Écran Paramètres

Chris voulait pouvoir modifier les valeurs préremplies. L'écran ne stocke
PRESQUE rien de son côté, et c'est le point important : chaque ligne du tableau
édite la RECETTE, la même fiche que "Gérer les recettes". Une seule source de
vérité, déjà synchronisée entre appareils. Un second magasin de défauts aurait
créé deux vérités qui divergent en silence.

Conséquence dans `prefillDepuisRecette()` : le formulaire suit la recette pour la
dose, l'eau, la température, la puissance de feu et la molette. Plus aucune
constante codée en dur ne les écrase.

DEUX PIÈGES qui ont fait croire que rien ne marchait, corrigés en v7.33 :

1. `reinitialiserSaisie()` remettait tout à zéro et n'appliquait PAS la recette.
   Les valeurs par défaut n'arrivaient donc que si on rechangeait de recette à la
   main, c'est-à-dire jamais sur le cas courant. L'appel à
   `prefillDepuisRecette` est maintenant la DERNIÈRE ligne de la fonction, et
   doit le rester : plus haut, la remise à zéro du préchauffage l'écraserait.
2. `remplirSelectRecettes()` ne posait `sel.value` que pour une recette marquée
   `parDefaut`, ce qu'aucune Brikka n'est. Le navigateur sélectionne la première
   option tout seul, mais le CODE l'ignorait, donc `prefillDepuisRecette("")`
   repartait sans rien faire. Repli explicite sur `liste[0]` désormais.

Le champ température n'a plus de `placeholder`. Un fond "93" annonçait une valeur
par défaut qui n'existe plus, et un champ doit être soit prérempli soit vide.

`tools/boot.test.mjs` vérifie ces trois points sur le vrai chemin de démarrage,
sans crochet de test dans app.js.

ATTENTION, le piège qui a fait croire que rien n'avait bougé : modifier
`RECETTES_DEPART` ne touche QUE les nouvelles installations. Les recettes déjà
stockées gardent la valeur du jour où elles ont été semées, et ce sont elles qui
préremplissent la saisie. Tout changement de valeur par défaut doit donc
s'accompagner d'un passage dans `migrerDonnees()` (section 3, bloc 6 quater),
marqué une seule fois dans localStorage pour ne pas écraser un réglage choisi
volontairement ensuite.

Une température VIDE veut dire "aucune cible", ce qui n'est pas zéro degré.
`normaliserRecette` préserve la chaîne vide exprès. Les quatre recettes Brikka
sont dans ce cas : la température y dépend de la puissance du feu, l'annoncer
d'avance n'aurait aucun sens. Elles préremplissent en revanche 150 g d'eau, la
contenance de la chaudière.

Ne restent locaux à l'appareil (localStorage, clé `replis-saisie`) que les deux
REPLIS, utilisés seulement quand la recette laisse la valeur vide : dose et
puissance de feu. Ce sont des préférences de confort, pas des mesures ; les faire
voyager créerait des conflits de fusion pour rien.

Deux bugs corrigés au passage, tous deux silencieux :

- `lireFormRecette()` ne lisait pas `puissance_feu`. Modifier une recette Brikka
  depuis "Gérer les recettes" effaçait donc la valeur. Le champ `#r-feu` existe
  maintenant dans le formulaire.
- Le texte de température se repliait sur `valeur + " °C"`. Sans cible, cela
  produisait un " °C" orphelin.

## 8 sexies. "Acide ET amer" se DÉDUIT, il ne se coche plus

Chris a signalé deux fois cette pilule comme un doublon des deux du dessus. La
v7.28 lui avait donné son propre groupe avec une explication en commentaire, ce
qui n'a rien réglé : dans l'interface elle ressemblait toujours à un raccourci
redondant, et le site lui demandait de conclure à sa place.

Il conclut maintenant tout seul. Dès qu'un diagnostic de la famille
sous extraction ET un de la famille sur extraction sont cochés,
`majCorrectionDiagnostic` REMPLACE les deux corrections par le diagnostic déduit
et sa correction. Remplacer et pas empiler : les deux corrections d'origine
s'annulent, moudre plus fin ET moudre plus grossier.

Le libellé reste dans `DIAGNOSTICS` sans pilule, via `DIAGNOSTIC_DERIVE`. Il est
dans l'historique de Chris (extraction du 11 août) et doit rester traduisible,
filtrable et affichable. Le retirer casserait ses données passées. Un test vérifie
les deux moitiés : absent des pilules, présent dans la liste.

La clé `diag_contradiction` a disparu, elle servait à demander de cocher la
pilule.

## 8 quinquies. Le carnet ne refuse jamais une saisie

Il y avait un BLOCAGE : `avertissementsCombinaison` renvoyait un drapeau
`bloque`, et `enregistrerSaisie` refusait alors d'enregistrer. Ça visait les
cafés rang bơ et les cafés non purs passés au Switch, au motif que le filtre
papier retiendrait le beurre ou les additifs.

Retiré, et à ne pas réintroduire. Trois raisons :

1. Le carnet sert à noter ce que Chris a bu, pas à arbitrer ce qu'il a le droit
   de tenter. Il tenait sa tasse à la main et le site refusait de l'écrire.
2. L'affirmation n'avait JAMAIS été testée. Zéro extraction Switch dans les
   données, donc zéro preuve. Même erreur que l'avertissement de débordement de
   tasse retiré en v7.28.
3. Le blocage empêchait exactement l'essai qui produirait la donnée capable de
   trancher. Un carnet qui refuse la mesure contredisant sa règle ne peut plus
   apprendre.

Les avertissements restent, ils informent. `w_rangbo` a été réécrit : il disait
"ne va jamais dans le Switch, passe le à la Brikka", il dit maintenant que le
papier retient une partie du beurre et que ça vaut le coup d'essayer en baissant
la température. Même traitement pour le titre du guide.

Verrouillé par `tools/data.test.mjs` : absence de `saisie.bloque`, de
`t_bloque`, de `cafeInterditSwitch` et de `bloque = true`.

## 7 octies. Le bouton Saisie ne continue jamais une modification

BUG DE PERTE DE DONNÉES, signalé le 24 août. Chris ouvrait une extraction depuis
l'historique, partait sur un autre écran, revenait par l'onglet Saisie, et le
formulaire était TOUJOURS en mode modification. Le bouton du bas disait
"Enregistrer la modification", mais il croyait noter une tasse neuve : il écrasait
donc une extraction passée, sans rien voir.

`activerEcran("saisie")` abandonne maintenant l'édition en cours. Arriver sur cet
écran par la navigation veut dire "je veux noter une tasse", jamais "reprends la
modification d'il y a dix minutes".

Deux points à ne pas défaire :

1. L'abandon est ANNONCÉ par un toast. Un abandon silencieux serait aussi vicieux
   que le bug qu'il corrige. Rien n'est perdu en base : l'extraction n'avait pas
   été réenregistrée et reste ouvrable depuis l'historique.
2. Le drapeau `ouvertureEdition` encadre `chargerExtractionDansSaisie`, sinon
   l'ouverture légitime d'une édition se réinitialiserait elle-même en appelant
   `activerEcran`.

Au passage, les `activerEcran("saisie")` qui SUIVAIENT un
`chargerExtractionDansSaisie` ont été retirés. Ils étaient déjà redondants, la
fonction ouvre l'écran elle-même, mais ils devenaient surtout nuisibles : le
rappel réinitialisait l'édition qu'on venait d'ouvrir. Un test vérifie qu'aucun ne
revient.

## 7 septies. La molette du broyeur n'est pas le dial de la recette

Deux choses différentes qui portaient le même nom, et le formulaire confondait les
deux :

- Le **dial d'une recette** était une CIBLE propre à chaque recette : 1.2.0 en
  Brikka, 1.6.0 pour la Chronicler, 2.0.0 pour le Tetsu. Chris a demandé le
  24 août que TOUTES portent 1.5.0, et il a raison sur le fond : il ne recompte
  pas les crans à chaque changement de machine, donc une cible par recette
  décrivait un geste qu'il ne fait jamais. Les recommandations d'origine en
  microns restent dans la `note` des recettes concernées.
- Le **réglage du broyeur** est un ÉTAT physique. Chris laisse son Timemore C5 sur
  1.5.0, le "compromis qui marche dans les deux" de son guide, 75 crans et 622
  microns, pour ne pas recompter les crans à chaque changement de machine.

Le formulaire préremplissait la cible, donc il lui faisait enregistrer une mouture
qu'il n'avait pas utilisée. Toutes ses extractions Brikka auraient dit 1.2.0 alors
que le broyeur était à 1.5.0.

`MOLETTE_REPLI_USINE` vaut donc "1.5.0", `replis.molette` est modifiable dans
Paramètres avec ses crans et microns affichés sous le champ, et le préremplissage
lit ce réglage. La cible de la recette reste visible dans le panneau latéral, et
`GRIND.verifierPlage` continue de signaler un écart qui sort de la plage de la
machine. C'est ça la bonne division du travail : le carnet enregistre ce qui a
été fait, la fiche dit ce qui était visé.

Le champ mouture perd son `placeholder="1.5.0"`. Il promettait une valeur par
défaut alors que le champ est prérempli, exactement la faute du "93" de la
température corrigée en v7.33.

## 7 sexies. Pas d'estimation de volume sur la Brikka

Il y avait `eau - 0,7 x dose`, soit **139 ml annoncés** pour 150 g de chaudière et
16 g de café. Chris en mesure **90 à 115 ml**. Le modèle était faux, pas le
coefficient : sur une moka la chaudière ne se vide pas. Une partie de l'eau reste
sous l'embouchure du tube montant, une autre part en vapeur, et ces deux pertes
dépendent de la flamme et du moment où on retire du feu. Elles ne dépendent
sûrement pas de la dose de café, qui est la seule variable qu'utilisait la
formule.

Ce chiffre faux ne restait pas dans son coin, il alimentait quatre choses :

1. le ratio en tasse, quand le volume n'était pas saisi ;
2. la ligne "boisson" du direct, donc le ratio de ce qui est bu ;
3. le bouton "Estimation : 140 ml, reprendre", qui l'écrivait dans le champ ;
4. le préremplissage du LAIT, calculé comme contenance de la tasse moins volume de
   café. Pour une tasse de 150 ml il donnait 11 ml de lait, ce qui n'est pas un
   flat white. Et comme les trois recettes lactées sont des Brikka, c'était
   toujours faux.

`volumeEstime(dose, eau)` est désormais le SEUL endroit qui estime un rendement,
et il rend la main immédiatement en Brikka. Le Switch garde `eau - 2,1 x dose` :
le papier et le marc retiennent environ 2,1 g d'eau par gramme de café, le reste
passe, et ce modèle-là tient.

Sans mesure, le champ lait ne se préremplit plus et affiche `lait_sans_volume`.
Un champ vide et honnête vaut mieux qu'un nombre inventé.

À NE PAS FAIRE : remettre une formule Brikka sans données mesurées. Quatre tests
verrouillent l'absence de la formule, l'unicité de celle du Switch, et le fait que
la rétention (`retention_ml` dans data.js) reste une SOUSTRACTION entre deux
mesures et pas une estimation.

## 7 nonies. La Chronicler porte 240 g, pas 225

Erreur de TRANSCRIPTION, présente depuis la première version et repérée le
24 août en comparant le site au document source de Chris,
`Prompt-Fable-Tracker-Cafe.md`. Celui-ci écrit pour la recette 1 :

    15 g / 240 g, ratio 1:16, 92 degrés, mouture 1.6.0
    0:00 verser 120 g, vanne OUVERTE
    0:45 verser 120 g, vanne FERMÉE

Le site portait 225 g, 1:15 et un premier versement de 112 g. La recette avait
donc été rétrécie de 6 % sans raison. Corrigé sur la Chronicler et sur sa variante
Sweet, paliers compris, plus le volume en tasse annoncé qui passe de 195 à 210 ml
(240 moins 2,1 x 15).

Migration `chronicler240` pour les recettes déjà stockées, ciblée : uniquement la
famille `chronicler`, et uniquement si elle porte encore 225.

À NE PAS CONFONDRE avec la mise à l'échelle de la section 7 quinquies. Celle-ci
adapte les PALIERS quand Chris tape une autre quantité dans la saisie ; elle ne
corrige pas la valeur par défaut de la recette, qui est une donnée. Chris a
justement buté sur la différence : il voyait 225 g et croyait que l'échelle aurait
dû s'en occuper.

Restent deux écarts connus avec le document source, non corrigés faute de
décision : "Le Costaud (Immersion)" est en réalité la recette 3 "L'Adoucisseur",
dont le rôle explicite est de rattraper les cafés trop acides, et le Tetsu y est
donné pour 20 g / 300 g au lieu de 15 / 225.

## 7 quinquies. Les versements suivent l'eau réellement saisie

Une recette écrit ses paliers en grammes ABSOLUS : "Verser jusqu'à 112 g",
"Compléter à 225 g". Changer l'eau dans la saisie rendait donc la recette fausse.
Chris a versé 240 g et le panneau latéral comme le chronomètre lui réclamaient
toujours 225 g, sans rien signaler.

`echelleVersements(texte, facteur)` vit dans `js/recettes.js`, pas dans app.js :
c'est du calcul pur sur des chaînes, donc testable sans navigateur, comme
`reglages.js`. `app.js` ne garde que `facteurEau()`, qui lit le champ. Un
facteur de 1 laisse les textes intacts au caractère près.

LE GARDE-FOU, à ne pas retirer : seuls les nombres suivis de " g" et
STRICTEMENT supérieurs à `SEUIL_VERSEMENT_G` (30) sont mis à l'échelle. En
dessous ce sont des doses de café ou des quantités de lait, jamais un versement
d'eau. Le plus petit versement des recettes d'origine est un bloom de 45 g, la
plus grosse dose est de 18 g, donc 30 sépare proprement les deux. Ce n'est pas
théorique : deux recettes Brikka écrivent "Extraire exactement comme la Brikka
classique : 14 g" dans leurs étapes, et sans le seuil cette dose serait
multipliée. Un test le vérifie.

Le point d'entrée unique est `etapesPour()`, ce qui met à l'échelle d'un seul
coup les trois endroits qui affichent des paliers : le panneau latéral, le
chronomètre et le mode pas à pas. Les fiches de l'écran Guide, elles, lisent
`r.etapes` directement et restent donc à leurs valeurs canoniques : c'est la
documentation de la recette, pas la tasse en cours.

Quand le facteur n'est pas 1, le panneau latéral affiche une pastille
`param-chip-adapte`. Sans elle, l'écart entre la fiche et les paliers affichés
serait incompréhensible.

## 7 quater. Le select de température, aide de saisie et rien d'autre

`#f-temp-preset` propose six méthodes de chauffe et écrit le degré correspondant
dans `#f-temp`. La liste en comptait neuf en v7.34 : trop pour un champ qu'on
remplit tous les jours. Elle colle maintenant à ce que Chris fait réellement,
c'est-à-dire couper le feu quand les petites bulles remontent, avant le
frémissement, plus les cas bouillante et le mélange à l'eau froide.

L'écran Paramètres est borné à 780 px ET centré par `margin: 0 auto`. Sans la
marge, il se collait à gauche de `main`, qui fait 1180 px, et toute la page
paraissait de travers. Un test vérifie la règle en général : tout `#ecran-*` qui
porte un `max-width` doit porter la marge auto.

Le select et le champ nombre tiennent sur UNE ligne (`.ligne-temp`). Empilés, la
cellule Température devenait deux fois plus haute que ses voisines et creusait un
trou au milieu de `.grille-nombres`, dont la hauteur de rangée suit la cellule la
plus haute. L'aide sous le champ tient elle aussi sur une seule ligne, pour la
même raison.

Trois choix de conception :

- AUCUNE colonne ajoutée. Le choix n'est pas stocké, seule la mesure en degrés
  l'est. Un champ `temp_methode` aurait demandé une migration et une colonne CSV
  pour une information qui n'explique rien de plus que le degré lui-même.
- Le select se REMET À VIDE après chaque usage, et aussi dès que Chris saisit à la
  main ou que la recette préremplit (`razPresetTemp`). Un select resté sur un
  choix qui ne correspond plus au nombre affiché mentirait.
- Les `value` sont des nombres explicites dans le HTML, pour que la traduction du
  libellé ne corrompe pas la valeur. Règle générale du projet, voir section 8.

La liste couvre de 80 à 100 degrés sans trou de plus de 6 degrés, verrouillé par
un test : les paliers "1 min" et "2 min" ont été ajoutés le 24 août parce que la
liste sautait de 85 à 97 alors que les recettes Switch visent 92 à 95.

Les durées de repos sont des ESTIMATIONS pour une bouilloire ouverte d'un demi
litre. Les deux options de mélange à l'eau froide sont de l'arithmétique, et
c'est le seul repère fiable sans thermomètre. L'aide sous le champ le dit.

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
  DOCUMENTATION, AUDIT).
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

### Ce qui n'est PAS un avertissement de saisie

L'écart entre la recette choisie et `recette_recommandee` du café ne déclenche
plus rien (retiré en v7.21). Cette recommandation vient d'une valeur posée à la
création du café, jamais vérifiée par une extraction : conseiller une recette sur
un café qu'on n'a pas encore essayé n'est pas une aide, c'est du bruit à chaque
saisie. Les vraies recommandations viennent des insights, calculés sur les notes
réelles. Les avertissements de MACHINE (`w_brikka_reco`, `w_switch_reco`) et les
blocages (café non pur en Switch) restent, eux : ce sont des faits, pas des goûts.

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
| goûts | aucun descripteur jamais coché | cocher ce qu'on sent en saisie |
| goûts | aucun descripteur n'atteint 3 tasses | continuer à cocher les mêmes mots |
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
- v7.14 : correction d'une PERTE DE DONNÉES sur la synchro. Les CSV ne portant
  pas `maj_le`, relire le dossier lié remettait les horodatages à zéro : une
  modification faite hors ligne puis rechargée avant synchro était écrasée par le
  serveur. `reporterHorodatage()` conserve l'horodatage connu quand le contenu
  est identique et n'estampille que sur changement réel. Trouvé en inspectant D1
  après la première synchro réelle, pas par un test.
- v7.15 : "Note contre âge du café" remplacé par "Quels goûts font tes bonnes
  tasses", note moyenne par descripteur. L'ancien dépendait d'une date de
  torréfaction que les paquets vietnamiens ne portent presque jamais, il était donc
  structurellement vide; le nouveau utilise une donnée cochée à chaque tasse et
  parle enfin de goût plutôt que de réglage. Le rappel qui réclamait les dates de
  torréfaction est retiré des insights. Détail en section 6 sexies.
- v7.16 : durées de chrono saisies en minutes ET secondes (stockage inchangé,
  toujours en secondes), et brouillon de la saisie conservé dans localStorage quand
  on quitte l'onglet. Détail et pièges en section 7 bis.
- v7.17 : "Brikka classique (eau préchauffée)" devient une recette à part
  entière, dans la famille `brikka-classique` avec la Standard, dont le NOM est
  inchangé. Même dose et même eau que la Standard pour que la comparaison soit
  propre, seuls la température de départ, la conduite de la flamme et la mouture
  (1.3.0 au lieu de 1.2.0) changent. Migration des extractions déjà cochées "eau
  préchauffée". Critère retenu pour trancher ce genre de question : la recette
  décrit l'EXTRACTION. Préchauffer en fait partie, allonger après coup non, ce
  dernier reste donc un champ.
- v7.18 : champ `puissance_feu` (entier 1 à 10, Brikka seulement) sur les
  extractions ET sur les recettes Brikka, migration à 3 de tout l'historique
  Brikka, insight "quelle puissance de feu te réussit". Température préremplie à
  93 au lieu de 95 (`DEFAULT_TEMP_C`), sans toucher aux extractions déjà
  enregistrées.
- v7.19 : diagnostics regroupés par levier de correction au lieu d'une liste à
  plat de onze entrées, et cinq nuances "un peu" ajoutées là où elles manquaient
  (astringent, léger, concentré, éventé, brûlé). AUCUNE valeur retirée ni
  renommée, l'historique déjà enregistré reste lisible tel quel, ce que le test 10
  de `tools/data.test.mjs` verrouille.
- v7.20 : bulle d'aide des diagnostics enrichie. Elle donne maintenant QUAND
  cocher (description en bouche, `DIAGNOSTIC_QUAND`) puis QUOI faire, sur deux
  lignes. Les 16 descriptions existent en FR et EN.
- v7.21 : tableau de l'historique à largeurs figées, il ne défile plus
  horizontalement sur grand écran et tronque proprement avec la valeur complète au
  survol. Retrait de l'avertissement "recette conseillée pour ce café", qui
  reposait sur une valeur jamais vérifiée. Retrait de la règle d'insight sur le
  préchauffage, devenue un doublon exact du duel de recettes depuis que le
  préchauffage est une recette.
- v7.22 : formulaire de saisie remis d'aplomb (une seule grille, options à
  cocher regroupées à part, quatre colonnes, plus aucun champ à cheval sur deux
  colonnes) et case "eau préchauffée" masquée sur la famille brikka-classique où
  elle fait doublon avec le choix de recette. Détail en section 7 ter.
- v7.23 : détail dépliable dans l'historique (les 22 champs stockés, pas
  seulement les 8 colonnes), comparateur de deux extractions avec surbrillance des
  seules différences, et KPI de régularité en écart moyen. Priorités 4, 5 et 8 du
  backlog.
- v7.24 : nouvel écran "Mes meilleurs réglages", un par café, avec le calcul
  isolé dans `js/reglages.js` sans DOM. Priorité 6 du backlog, révisée : par café
  et non en général, et sur sa propre page.
- v7.25 : correction d'une TypeError qui vidait tout le tableau de bord
  (`$` au lieu de `$$` ligne 516, avalée par le try/catch de notifier), du
  manifeste PWA que la porte d'entrée redirigeait vers /login faute de cookie
  (`crossorigin="use-credentials"`, la PWA n'était donc pas installable), et de la
  balise `apple-mobile-web-app-capable` dépréciée. Ajout de
  `tools/boot.test.mjs`, qui exécute l'application dans un faux DOM et aurait
  attrapé le premier des trois.
- v7.26 : vocabulaire de dégustation complété, groupe "Acidité" (acidité vive,
  acidulé, aigre, citronné, vinaigré), astringence et texture (astringent, rugueux,
  aqueux) dans Corps et texture, défauts rance et phénolique. 69 descripteurs, tous
  avec nom et définition en FR et EN. Puissance de feu par défaut à 4 au lieu de 3,
  y compris une reprise unique des recettes Brikka déjà stockées, sans quoi la
  recette aurait continué à préremplir 3. L'historique garde 3
  (PUISSANCE_FEU_HISTORIQUE), on ne réécrit pas le passé.
- v7.27 : "Acide ET amer (extraction inégale)" sort du groupe des réglages pour
  son propre groupe "Répartition dans le panier", et une alerte apparaît si les
  deux familles opposées sont cochées séparément, ce qui produisait deux
  corrections contradictoires. Sa correction couvre maintenant les deux machines
  (l'ancienne parlait de verser en spirale, sans sens sur une Brikka). Les lignes
  des 5 dernières extractions ouvrent l'édition, au clic comme au clavier.
- v7.28 : retrait de l avertissement de débordement de tasse. Il supposait un
  service en une seule fois et se déclenchait à tort dès qu on verse en deux.
- v7.29 : le ratio a DEUX logiques, une par machine, et s'explique au survol
  (section 6 nonies). Nouvel écran Paramètres, qui édite les recettes plutôt que
  d'ouvrir un second magasin de défauts (section 6 decies). Les recettes Brikka
  n'imposent plus de température et préremplissent 150 g. Le champ puissance de
  feu manquait au formulaire de recette : l'éditer effaçait la valeur.
  DOCUMENTATION.md contenait trois copies de lui-même, retirées.
- v7.30 : Paramètres passe en icône d'engrenage à droite de l'entête, un
  septième onglet texte faisait passer la nav à la ligne. Feu par défaut à 2.
  Surtout : les recettes STOCKÉES rattrapent enfin les valeurs semées
  (150 g de chaudière, plus de température cible, feu à 2), sans quoi changer
  RECETTES_DEPART ne change rien pour une installation existante.
- v7.31 : audit complet, fait sur les données réelles de
  production. Deux bugs corrigés au passage. `sw.js` ne précachait ni
  `js/sync.js` ni `js/reglages.js`, tous deux chargés par index.html : hors
  ligne, SYNC et REGLAGES n'existaient pas et l'application cassait au démarrage.
  Un test compare désormais la liste du service worker aux balises script.
  Et trois recettes Brikka stockées portaient une puissance de feu vide.
- v7.62 : la réglette du moulin construit son squelette une seule fois. Déplacer
  le curseur ne bouge plus que deux attributs, et le curseur redevient donc
  immédiat : son anti-rebond de 90 ms n'avait plus rien à couvrir.
- v7.61 : le thème s'applique avant le premier rendu, suit le système tant qu'on
  n'a rien choisi, et la barre d'état de la PWA ne reste plus sombre en clair.
- v7.60 : l'interface est découpée en sept fichiers (section 1 bis), avec une
  suite de tests dédiée aux frontières. Elle a trouvé du premier coup un bug réel :
  le bouton d'enregistrement du panneau rapide ne marchait pas.
- v7.59 : majLive ne fait plus de recherche DOM ni d écriture inutile à chaque
  frappe, les clics des 85 pilules sont délégués, et 34 champs annoncent leur
  touche de validation au clavier mobile.
- v7.58 : mouvement réduit respecté, transitions de vue entre écrans, rendu
  différé hors écran, recherche texte dans l historique, reprise réseau, Échap,
  et un voile de chargement au lieu du blanc.
- v7.57 : anti-rebond sur les rendus déclenchés à la frappe, et rendu ciblé par
  signature de table au lieu de tout refaire à chaque sauvegarde.
- v7.56 : le jeu de démonstration quitte le chemin critique, il ne sert qu à un
  bouton de la modale d accueil.
- v7.55 : i18n scindée par langue, le paquet anglais est chargé à la demande.
  9 600 comparaisons clé par clé pour vérifier que rien n a bougé.
- v7.54 : Chart.js chargée à la demande, elle pesait 30 % du site pour un seul
  écran. Toujours précachée, donc le hors ligne marche.
- v7.53 : les dix scripts passent en defer, ils bloquaient le parsing du HTML.
- v7.52 : les bascules annoncent enfin leur état, et les définitions s'ouvrent
  au doigt par appui long (section 8 decies).
- v7.51 : supprimer une extraction propose un retour arrière de cinq secondes,
  et le confirm() natif disparaît (section 8 nonies).
- v7.50 : coût par tasse sur la fiche de chaque café, avec le coût en café RÉEL
  pour les cafés non purs.
- v7.49 : constat PAR CAFÉ et PAR MACHINE dans les insights, à la place de la
  règle mouture qui ne pouvait pas se déclencher (section 6 quaterdecies).
- v7.48 : courbe de tendance sur le graphe des 30 jours, moyenne glissante sur
  les 5 dernières tasses notées.
- v7.47 : jours depuis l ouverture du paquet, sur le SACHET et pas sur le café.
  Remplace la règle de fraîcheur par date de torréfaction, qui ne pouvait pas se
  déclencher (section 6 duodecies).
- v7.46 : les six rattrapages à usage unique deviennent une VERSION DE SCHÉMA
  stockée avec les données, donc synchronisée. Les drapeaux localStorage étaient
  par appareil alors que les données sont partagées (section 3).
- v7.45 : les réglages du matériel (dose de repli, puissance de feu, molette du
  broyeur) se synchronisent entre appareils. Ils vivaient en localStorage, donc le
  téléphone ignorait ce que l'ordinateur réglait. Nouvelle table `reglages`.
- v7.44 : le ratio principal redevient eau sur dose sur les deux machines
  (section 6 nonies). Le ratio en tasse passe en mention secondaire.
- v7.43 : la note devient facultative, plus de 7 imposé par défaut (section
  7 decies). Le badge de stock annonce les tasses RESTANTES, estimées à la dose
  moyenne du café (section 6 undecies).
- v7.42 : sélectionner un descripteur ne réorganise plus la ligne. Le gras de
  l'état actif élargissait la pastille (section 8 septies).
- v7.41 : la Chronicler et sa variante Sweet portent enfin les 240 g de leur
  source, avec migration (section 7 nonies). La liste de température comble le
  trou entre 85 et 97, où vivent justement les recettes Switch.
- v7.40 : le moulin de l'écran Guide devient interactif, curseur en crans,
  conseils vivants et bouton qui pose le réglage par défaut (section 5 bis). Le
  décalage du zéro est documenté. Page remise d'aplomb : Recettes descend, et
  trois affirmations périmées corrigées puis verrouillées par des tests.
- v7.39 : l'écran Paramètres est centré. Il était borné en largeur sans marge
  auto, donc collé à gauche.
- v7.38 : toutes les recettes portent la molette 1.5.0, avec migration pour les
  recettes déjà stockées. Et correction d'un bug de PERTE DE DONNÉES : le bouton
  Saisie continuait une modification en cours et écrasait une extraction passée
  (section 7 octies).
- v7.37 : la saisie préremplit le réglage RÉEL du broyeur et plus la cible de la
  recette (section 7 septies), réglable dans Paramètres. Et "Acide ET amer" n'est
  plus une pilule à cocher, le site le déduit (section 8 sexies).
- v7.36 : plus d'estimation de volume extrait sur la Brikka, elle annonçait
  139 ml là où Chris en mesure 90 à 115 (section 7 sexies). Le préremplissage du
  lait reposait sur la même formule et donnait 11 ml de lait pour un flat white.
- v7.35 : les versements d'une recette suivent l'eau réellement saisie
  (section 7 quinquies). Liste de température ramenée de neuf à six choix et
  remise sur une seule ligne, elle creusait un trou dans la grille de saisie.
- v7.32 : la navigation ne garde que TROIS onglets à texte, un septième la faisait
  passer à la ligne sous la page. Réglages, Guide et Paramètres deviennent des
  icônes dans les outils d'entête. L'écran reference fusionne dans guide. L'écran
  Paramètres reçoit une colonne de lecture bornée au lieu de s'étaler sur 1180 px.
- v7.33 : un formulaire vierge suit enfin la recette. Deux bugs empilés
  empêchaient les valeurs par défaut d'arriver, voir la section 6 decies. Le champ
  température perd son fond "93".
- v7.34 : le carnet ne refuse plus aucune saisie, le blocage rang bơ et café non
  pur en Switch est parti (section 8 quinquies). Liste déroulante de méthode de
  chauffe qui remplit la température (section 7 quater).
