# À FAIRE : refonte visuelle du Carnet d'extraction (direction « Comptoir »)

Ce fichier est un brief de travail pour une session Claude. Il décrit une
refonte de l'interface VALIDÉE sur maquette par Chris le 13 septembre 2026.
**Quand tout est livré, poussé et vérifié, SUPPRIME ce fichier.** Il n'est pas
suivi par git (un simple `rm TODO-REFONTE.md` suffit ; s'il a été commité
entre temps, `git rm`). Il n'a de valeur que le temps du chantier et ne doit
pas rester comme une doc qui ment.

Avant de commencer : lis `START-HERE.md` en entier, puis `DOCUMENTATION.md` en
entier, puis dans `DECISIONS.md` les thèmes « Architecture et code », « Saisie,
chrono et recettes » et « Tableau de bord et analyses ». Les règles du projet
s'appliquent sans exception : jamais de tiret cadratin ni demi-cadratin,
interface bilingue complète (toute chaîne nouvelle, texte ou attribut, existe
aussi dans `js/i18n.en.js`), couleurs de données figées, données CSV
compatibles, tests verts avant chaque commit, une version par commit avec
`node tools/bump_version.mjs X` et une ligne en tête de `CHANGELOG.md`, et un
`git push origin main` en fin de série (Chris regarde le site déployé, pas git).

## La maquette

https://claude.ai/code/artifact/46d8ddd5-46b0-43d2-955d-38645d2c64e9

Sept planches : Tableau de bord, Saisie et Historique en 1440 px ; Saisie et
Saisie rapide en 390 px ; deux esquisses B et C à ignorer (directions non
retenues). Les chiffres et textes des planches sont des exemples, pas des
données. Ce qui fait foi est ce document, la maquette illustre.

## Ce qui ne change PAS

- Toutes les fonctionnalités actuelles restent, sans exception : saisie rapide,
  saisie complète et ses trois blocs, chrono à paliers et bips, brouillon,
  extractions ratées, historique complet (filtres, recherche, tri, détail
  dépliable, comparateur, dupliquer, modifier, supprimer avec retour arrière,
  export), tableau de bord complet (KPI, graphe 30 jours, insights, cinq
  dernières, calendrier, note par café, Brikka contre Switch, goûts,
  diagnostics, note par recette), panneau Données, modales cafés, sachets,
  recettes, écrans Mes meilleurs réglages, Guide, Paramètres, bascule FR/EN,
  thème clair et sombre, PWA, synchro.
- **Le graphe « Extractions, note et tendance, 30 derniers jours » reste
  EXACTEMENT tel qu'il est** : Chart.js, mêmes séries, mêmes couleurs, même
  légende, mêmes deux axes. Chris l'a dit explicitement. Ne pas le redessiner,
  ne pas le scinder, ne pas changer ses couleurs. Il prend simplement sa place
  dans la nouvelle carte.
- Les couleurs de DONNÉES : Brikka `#2a78d6`, Switch `#eb6834`, les deux
  machines `#cc79a7`. Interdiction de les toucher.
- Le modèle de données, les tests, l'architecture en fichiers, les
  identifiants des champs de saisie (`#f-*`, `#q-*`, `#h-*`) : la refonte est
  du HTML et du CSS, plus un peu de JS de navigation. Aucune colonne, aucune
  migration.
- Pas de vert. Aucune teinte verte nulle part, ni en accent, ni en « bon ».
  Le statut « bon » (barres de goûts au-dessus de la moyenne, pastille
  Équilibré) prend l'accent terre cuite ; le « mauvais » garde le rouge
  `--danger`.

## La direction artistique

Nom de travail : « Comptoir ». Papier chaud, encre espresso, un seul accent en
marron orangé (terre cuite). Sobre, éditorial, chaleureux.

### Palette, thème clair

| Jeton | Valeur | Usage |
|---|---|---|
| `--fond` | `#f4ede3` | fond de page |
| `--panneau` | `#fcf8f2` | cartes |
| `--panneau-2` | `#ebe1d4` | fonds secondaires, pastilles neutres, cases vides du calendrier |
| `--rail` | `#f0e7db` | fond du rail de navigation |
| `--encre` | `#26190f` | titres, chiffres, texte fort |
| `--texte` | `#5e4b3c` | texte courant |
| `--attenue` | `#8a7462` | libellés, aides, axes |
| `--lignes` | `#dccdbb` | bordures |
| `--lignes-douces` | `#ede4d8` | filets internes des listes |
| `--accent` | `#a85a1e` | bouton principal, liens, curseurs, pastille Équilibré, courbe de tendance des cartes, sélection |
| `--accent-fort` | `#8a4716` | survol de l'accent |
| `--accent-fond` | `#f2e2d2` | fond derrière un texte accent |
| `--sur-accent` | `#f4ede3` | texte posé sur l'accent |
| `--danger` | `#c4503b` | ratée, mauvais |
| calendrier | `#ebe1d4`, `#ecd3b5`, `#cf9a5f`, `#a85a1e` | du vide au plus actif |

Carte sombre du tableau de bord (insights) et du chrono : fond `--encre`,
texte `--fond`, texte atténué `#c2ad98`, liens `#e0bd97`.

### Palette, thème sombre

Même logique, à dériver de la palette sombre actuelle (v7.97) qui est déjà en
bruns chauds : garder `--fond #241a10`, `--panneau #31241a`, `--panneau-2
#3c2d20`, et remplacer l'accent par la version claire de la terre cuite,
`#d98741` (accent) et `#eb9a52` (fort), déjà présents. Les cartes sombres du
thème clair (insights, chrono) deviennent en thème sombre des cartes
`--panneau-2` bordées d'un filet accent, pour rester lisibles.

### Typographie

- Titres, chiffres clés, notes, heures du chrono : **Instrument Serif**,
  régulier, `letter-spacing: -0.01em`. Repli : Georgia, Times New Roman.
- Tout le reste : **Manrope** 400, 500, 600, 700. Repli : Segoe UI, system-ui.
- Les deux viennent de Google Fonts. ATTENTION à la règle du projet « aucune
  dépendance réseau, le site marche en `file://` et hors ligne » : il faut
  donc EMBARQUER les fichiers de police dans le dépôt (`css/fonts/`, woff2,
  sous licence OFL, les deux le sont), déclarés en `@font-face` avec
  `font-display: swap`, précachés par `sw.js`, et jamais chargés depuis un
  CDN. Sans ça, la première ouverture hors ligne affiche le repli et le site
  clignote au chargement des polices.
- Intertitres de bloc (« Le café et la recette ») : Manrope 700, 11 px,
  majuscules, `letter-spacing: 0.08em`, couleur `--attenue`.
- Chiffres : `font-variant-numeric: tabular-nums` partout où ils s'alignent.

### Rayons, espaces, ombres

- Cartes : `border-radius: 18px`, bordure `1px --lignes`, padding `22px 26px`.
- Contrôles : hauteur 46 px (48 sur téléphone), `border-radius: 12px`.
- Pastilles : `border-radius: 999px`, padding `4px 10px`, fond `--panneau-2`.
- Écart entre cartes : 18 px. Grille du contenu : trois colonnes égales sur
  ordinateur, la carte principale en `span 2`.
- Pas d'ombre sur les cartes du thème clair. Une seule ombre, sur le bouton
  flottant et la feuille de saisie rapide.

## Le layout

### Navigation

- **Ordinateur (à partir de 1024 px)** : un RAIL à gauche, 232 px, fond
  `--rail`, bordure droite. De haut en bas : logo (carré 38 px `--encre`
  avec une tasse en trait, titre « Carnet » en serif, sous-titre « Brikka et
  Switch »), un bouton plein « Nouvelle tasse » (accent, 46 px, icône plus),
  puis six entrées : Tableau de bord, Saisie, Historique, Mes réglages,
  Guide, Paramètres, chacune avec une icône en trait 18 px (SVG inline,
  jamais d'emoji, un seul style de trait 1.8 px) et un fond `--fond` sur
  l'entrée active. En bas du rail : la ligne d'état de synchro (point +
  « Synchronisé à 12:51 »), puis les bascules FR/EN et thème, puis le bouton
  Données. Le bouton flottant de saisie rapide DISPARAÎT sur ordinateur :
  « Nouvelle tasse » ouvre la saisie complète.
- **Téléphone (sous 1024 px)** : le rail devient une BARRE DU BAS à quatre
  entrées, Tableau, Saisie, Historique, Plus (qui ouvre une feuille avec Mes
  réglages, Guide, Paramètres, Données, FR/EN, thème). Le bouton flottant
  reste, en bas à droite au-dessus de la barre, et ouvre la saisie rapide en
  FEUILLE qui monte du bas (voir planche « Saisie rapide, téléphone »).
- L'entête actuelle (titre, nav horizontale, huit icônes) disparaît. Le nom
  de l'écran devient le titre de page en haut du contenu (voir ci-dessous).

### Tête de page (tous les écrans)

Sur une ligne : à gauche une surligne en majuscules atténuées (la date du
jour sur le tableau de bord, « Nouvelle extraction » sur la saisie, « 62 tasses
depuis le 15 août » sur l'historique) puis le titre en Instrument Serif 38 px
(« Tableau de bord », « Une tasse de plus », « Historique ») ; à droite les
contrôles de l'écran (pastilles de période sur le tableau de bord, date et
heure sur la saisie, recherche, Comparer, Exporter sur l'historique).

### Tableau de bord

Grille de trois colonnes, quatre rangées :

1. **Dernière tasse** (span 2) : surligne « Dernière tasse, il y a 2 h », nom
   du café en serif 30 px, ligne de contexte (pastille machine, recette, dose
   pour eau, temps, température) séparée par des barres verticales atténuées,
   les goûts en pastilles, le commentaire en italique en bas. À droite,
   séparée par un filet vertical, la note en serif 64 px, « sur 10 », et la
   pastille du diagnostic en `--accent-fond`. Cliquer la carte ouvre
   l'extraction. **Chiffres clés** (1 colonne) : grille 2 sur 2, chiffres en
   serif 34 px, libellés atténués : aujourd'hui, cette semaine, note sur 7
   jours, régularité (± écart moyen). Le KPI caféine actuel passe dans
   l'infobulle des chiffres, il n'a plus de tuile.
2. **Le graphe 30 jours** (span 2) : la carte porte le titre actuel
   « Extractions, note et tendance, 30 derniers jours » et le canvas Chart.js
   actuel, inchangé. **Ce que tes données disent** (1 colonne) : carte
   SOMBRE (`--encre`), titre serif, les insights numérotés dans des ronds
   accent, lien « Voir mes meilleurs réglages » en bas.
3. **Les cinq dernières** (span 2) : une vraie table, une ligne par tasse,
   colonnes date et heure, pastille machine, café en gras, recette et mesures
   (dose pour eau, temps ou feu), goûts, note en serif 20 px à droite ; ligne
   ratée en atténué avec « ratée » en rouge. Lien « Tout l'historique ».
   **Dix-huit semaines** (1 colonne) : le calendrier actuel (SVG maison) aux
   nouvelles couleurs (rampe caramel ci-dessus), jour courant cerclé, et sous
   la grille trois chiffres en serif : tasses, série en cours, par jour actif.
4. **Les analyses** (quatre cartes égales) : note moyenne par café (barres
   horizontales accent, valeur à droite), Brikka contre Switch (deux grands
   chiffres avec un trait de couleur machine au-dessus, puis la phrase sur le
   café passé dans les deux), quels goûts font tes bonnes tasses (liste,
   au-dessus de la moyenne en encre, en dessous en rouge), diagnostics
   (anneau : Équilibré accent, un peu acide `#cf9a5f`, un peu amer
   `--texte`, autres `--panneau-2`, légende à droite). La note par recette
   garde sa carte actuelle, à ajouter en cinquième si la rangée passe à cinq
   ou en rangée suivante.

Les cartes « légitimement vides » gardent leur message actuel (cause et
action), dans le nouveau style.

### Saisie

Deux colonnes : formulaire à gauche (`minmax(0, 1fr)`), colonne FIXE à droite
de 360 px, `position: sticky`.

Formulaire en trois blocs numérotés (rond `--encre` 30 px avec le chiffre,
titre serif 22 px) :

1. **Le café et la recette** : sur une rangée, Café (menu, 1.2 fr), Machine
   (contrôle segmenté à deux positions, fond `--panneau-2`, position active
   sur `--panneau` avec une légère ombre, pastille de couleur machine, 1 fr),
   Recette (menu, 1.2 fr). En dessous, sur toute la largeur, la ligne
   d'information du sachet (âge d'ouverture, restant, tasses) sur fond
   `--accent-fond` avec une icône, et les avertissements de combinaison.
   Le bouton « Gérer les cafés » devient une icône crayon à côté du menu.
2. **Les réglages** : grille de trois colonnes. Dose (curseur + champ), Eau
   (curseur + champ), Mouture (curseur + champ, aide crans et microns
   dessous) ; Bouilloire sur le feu (minutes, secondes, degré estimé à
   droite, aide dessous ; Switch seulement), Volume extrait (avec le lien
   d'estimation), Tasse (menu + bouton plus). En Brikka : pas de température,
   la Puissance de feu prend la place, et les options Eau préchauffée et
   Ajout d'eau apparaissent. Options à cocher sur une ligne en pointillés
   (case, libellé gras, aide grise). Pied de bloc sur toute la largeur, filet
   en haut, fond transparent : Ratio, Mouture en microns, Coût, Caféine,
   valeurs en serif 20 px.
3. **En bouche** : à gauche (200 px) la Note en STEPPER, un bloc de 64 px de
   haut avec moins à gauche, la valeur en serif 36 px au centre, plus à
   droite, par pas de 0,5 ; dessous les deux cases « Pas encore notée »
   (cochée par défaut) et « Ratée ». À droite, Diagnostic en pastilles (la
   cochée en accent plein) puis Goûts en pastilles (les cochées en `--encre`
   plein, un lien « toutes les familles » qui déplie les dix familles
   actuelles). Commentaire en champ texte de 56 px.

Bouton « Enregistrer la tasse » accent, 52 px, icône coche, et à sa droite
en atténué « Brouillon gardé si tu quittes l'onglet ». Le bouton « Annuler
la modification » reste, en discret, quand on édite.

Colonne fixe à droite : **Pendant l'extraction** (carte SOMBRE) : chrono en
serif 72 px, palier courant en gras, palier suivant en atténué avec son
heure, barre de progression aux couleurs de la machine, boutons Pause /
Reprendre et Arrêter et reporter, case bips. Puis **la fiche recette** :
pastille machine + nom serif, sous-titre italique, trois pastilles (dose pour
eau, température, durée), la liste des paliers avec l'heure à gauche (le
palier courant en gras pendant le chrono), lien « Ouvrir le pas à pas ». La
fiche café actuelle (profil, prix, fraîcheur) passe dessous, repliée par
défaut sur téléphone.

**Téléphone** : une seule colonne. Le chrono devient un BANDEAU REPLIÉ tout en
haut, fixe au défilement : heure en serif 40 px, palier courant, barre de
progression, bouton pause 44 px. Les blocs 1, 2, 3 se suivent ; le bloc 2
passe en grille de trois champs compacts (dose, eau, mouture) puis la ligne
bouilloire. La barre d'action est fixe en bas : Enregistrer (54 px) et un
bouton menu qui ouvre le reste (annuler, fiche café). Le lien Saisie
complète de la feuille rapide amène ici.

### Saisie rapide (téléphone et, sur ordinateur, depuis l'historique)

Une FEUILLE qui monte du bas, coins 22 px, poignée, sur un voile
`rgba(38, 25, 15, 0.35)`. Titre serif « Saisie rapide » et « maintenant,
12:51 ». Café, Recette (avec la pastille machine et une ligne « 15 g, 250 g,
molette 1.5.0 : repris de la recette »), Note en curseur grisé tant que « Pas
encore notée » est cochée (cochée par défaut, comme aujourd'hui). Boutons
Enregistrer (accent, flexible) et Saisie complète (bordé). Le bouton flottant
devient une croix quand la feuille est ouverte.

### Historique

Tête de page avec recherche (260 px), Comparer, Exporter. Puis une ligne de
FILTRES EN PASTILLES : Toutes (active, `--encre`), Brikka, Switch (avec
pastille de couleur), un séparateur vertical, Café, Diagnostic, Note,
Période, et l'état des ratées en atténué ; cliquer une pastille ouvre le menu
correspondant. Puis un BANDEAU RÉSUMÉ du filtre courant, fond `--panneau-2`,
quatre chiffres en serif 22 px : tasses, moyenne, la meilleure (avec café et
machine), ratées.

La table est GROUPÉE PAR JOUR : un intertitre serif 18 px (« Aujourd'hui »,
« Hier », puis « Vendredi 11 ») avec la date complète et le nombre de tasses en
atténué, puis les lignes du jour. Colonnes : heure, pastille machine, café
(gras), recette, dose et eau, molette, ratio, temps, °C, feu, goûts et
diagnostic (le diagnostic en couleur : Équilibré accent, un peu acide
`#b0651f`, ratée rouge), note en serif 20 px, trois actions (modifier,
dupliquer, déplier) en boutons carrés 28 px bordés ; la bascule ratée et la
suppression passent dans le détail déplié. Largeurs figées comme
aujourd'hui, mais la grille par position doit être refaite pour les
nouvelles colonnes (voir DECISIONS, « Tableau de l'historique, largeurs
figées » : quatre endroits à toucher, un test compare). Le DÉTAIL DÉPLIÉ est
un bloc `--panneau-2` arrondi, décalé sous la ligne, grille de quatre
colonnes de libellé + valeur (écoulement, bouilloire, volume et ratio en
tasse, coût) puis le commentaire en italique sur toute la largeur.

Sur téléphone la table devient une liste de cartes par jour, une carte par
tasse reprenant la carte « dernière tasse » en compact.

## Ordre de livraison conseillé

Une version par étape, un commit par version, tests verts à chaque fois :

1. **Fondations** : polices embarquées, nouveaux jetons de couleur dans les
   deux thèmes (remplacer les actuels, garder les noms de jetons existants et
   ajouter les nouveaux), rayons et espacements. Rien ne bouge encore dans le
   layout, mais le site change déjà de peau. Vérifier les contrastes : texte
   atténué sur panneau au moins 4,5:1.
2. **Navigation** : rail à gauche sur ordinateur, barre du bas sur téléphone,
   fin de l'entête, bouton flottant réservé au téléphone. C'est la seule
   étape qui touche `app.js` et `ui-noyau.js` (activerEcran, nav) ; le test
   qui limite la nav à trois onglets à texte (`tools/data.test.mjs`) devra
   être réécrit pour la barre du bas, pas contourné.
3. **Tableau de bord** : les quatre rangées. Le graphe 30 jours ne bouge pas.
4. **Saisie** : les trois blocs, la colonne fixe, le stepper de note, le
   téléphone. Aucun identifiant de champ ne change.
5. **Saisie rapide** en feuille.
6. **Historique** : pastilles, résumé, groupes par jour, nouvelles colonnes,
   détail déplié.
7. **Écrans secondaires** dans le même style : Mes meilleurs réglages, Guide,
   Paramètres, modales. Pas de planche pour eux : appliquer les mêmes cartes,
   titres et contrôles.
8. **Thème sombre** vérifié écran par écran.

À chaque étape : `node tools/boot.test.mjs`, `node tools/data.test.mjs`,
`node tools/modules.test.mjs`, `node worker/index.test.mjs`,
`node worker/sync.test.mjs`, le scan anti-tirets (commande dans
DOCUMENTATION.md, section Tests), la bascule EN si du texte a été ajouté, et
un regard dans le navigateur (un serveur statique local suffit, voir la
section « Tests » de DOCUMENTATION.md pour le patron). Mettre à jour
`DOCUMENTATION.md` pour ce qui existe (nouveaux jetons, nouveau fichier de
polices, nouvelle navigation) et `DECISIONS.md` pour le pourquoi (une section
« La refonte Comptoir » qui reprend l'essentiel de ce brief). Puis `git push
origin main`, et dire à Chris de recharger deux fois.

## Puis supprime ce fichier

Dernier geste de la série : supprimer TODO-REFONTE.md (rm, ou git rm s'il a été
commité). Ce qui mérite de survivre est déjà dans DECISIONS.md.
