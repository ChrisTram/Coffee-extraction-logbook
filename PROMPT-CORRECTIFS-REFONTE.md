Audit de la refonte Comptoir (v8.1 à v8.14) fait le 14 septembre 2026 par une autre session, sur le code poussé sur main, tests verts, site chargé en local avec la démo à 1280 px et 375 px. Le gros est bon : polices embarquées et précachées, jetons propres, aucune couleur hors jetons, aucun vert, couleurs de données intactes, graphe 30 jours intact (charts.js n'a pas bougé), rail / barre du bas / feuille Plus / bouton flottant / feuille rapide fonctionnels, aucun débordement horizontal de page, historique à dix colonnes groupé par jour, TODO-REFONTE.md supprimé, version 8.14 cohérente partout. Voici ce qui reste à corriger, par priorité. Lis START-HERE.md et les règles du projet avant : jamais de tiret cadratin ni demi-cadratin, toute chaîne nouvelle a son entrée dans js/i18n.en.js, une version par commit avec `node tools/bump_version.mjs X`, ligne de changelog, cinq suites de tests plus le scan anti-tirets, `git push origin main` à la fin. Vérifie chaque point dans le navigateur à 1280 px ET à 390 px avant de le déclarer fait. Supprime ce fichier dans le dernier commit.

## 1. Le calendrier « Dix-huit semaines » défile horizontalement dans sa carte

`.heatmap-svg { min-width: 620px }` (css/styles.css, bloc Heatmap) dans une carte d'une colonne de 257 px : barre de défilement horizontale dans la carte, et ui-tableau.js pousse même `scrollLeft` à la fin pour montrer la semaine courante. Une carte ne doit jamais défiler horizontalement. Deux solutions, choisis : (a) le nombre de semaines se calcule depuis la largeur du conteneur, `Math.floor((clientWidth - 34) / 21)`, le titre devient « Les dernières semaines » (FR et EN) et le calendrier se re-rend au resize ; ou (b) la carte passe en `col-2` et « Les 5 dernières » en une colonne, ce qui casse la lecture des cinq dernières, donc plutôt (a). Retire le `min-width`, garde les libellés de jours lisibles (au moins 10 px rendus), supprime le `scrollLeft` et le commentaire qui le justifie.

## 2. « Les 5 dernières extractions » : 174 px par ligne

Chaque ligne fait six lignes de texte (recette, mesures qui replient, diagnostic, goûts, commentaire, note). La maquette est une ligne par tasse. Cible : une ligne principale par tasse (date et heure, pastille machine, café en gras, recette, dose → eau, temps ou feu, goûts en pastilles, note en serif à droite), et le commentaire en italique sur une seconde ligne tronquée à une ligne (`text-overflow: ellipsis`, `white-space: nowrap`), texte complet en `title`. Molette, degrés et feu sortent de la ligne (ils sont dans l'historique). Hauteur visée : 60 px par tasse au maximum. Le tableau doit tenir dans sa carte sans défiler.

## 3. Le chrono est hors écran quand on verse

Ordinateur : la colonne droite est dans l'ordre fiche recette, fiche café, chrono. Avec les pas de recette affichés en entier (v7.101), le chrono commence à 803 px du haut sur un écran de 720 px : il faut défiler pour le voir pendant la verse. Mets le chrono EN PREMIER dans `.saisie-aside`, replié (63 px) quand il ne tourne pas comme aujourd'hui, ouvert quand il tourne, fiche recette en second, fiche café en troisième. Téléphone : l'aside entier (chrono compris) passe APRÈS le formulaire de 3 500 px (`order: 2`), donc son `position: sticky; top: 0` ne sert à rien. Le brief demandait un bandeau replié fixé en haut : sous 1024 px, place `#chrono-widget` AVANT le formulaire (`order: -1` sur la grille, ou le déplacer dans le DOM et le remettre à sa place sur ordinateur par CSS `order`), collé en haut au défilement, forme bandeau : temps en serif 40 px, palier courant, barre de progression, bouton pause 44 px. Fiche recette et fiche café restent après le formulaire sur téléphone.

## 4. Le bloc « En bouche » fait 1 672 px (2 278 px sur téléphone)

Les dix familles de descripteurs sont toutes déployées dans `#f-descripteurs`. Le brief : quelques familles visibles, un lien « toutes les familles » qui déplie le reste. Règle : afficher les familles qui contiennent une pastille cochée plus les deux premières familles ; le reste sous un bouton texte `toutes les familles` / `moins de familles` (FR et EN), état mémorisé dans localStorage. Une pastille cochée doit TOUJOURS être visible, y compris en édition d'une extraction ancienne. Vérifie que le brouillon et l'édition restaurent bien les cases quelle que soit la famille repliée.

## 5. L'historique sur téléphone défile horizontalement

Table de 930 px dans un cadre de 350 px, dix colonnes. Le brief : sous 1024 px, une liste de cartes par jour, une carte par tasse (heure, pastille machine, café en gras, recette, dose → eau, ratio, note en serif, goûts et diagnostic, commentaire, les trois actions), les intertitres de jour conservés, plus de table. La table à dix colonnes reste sur ordinateur. Le détail déplié, le comparateur, dupliquer, modifier, la bascule ratée et la suppression avec retour arrière doivent marcher à l'identique dans les cartes : un test sur le nombre de boutons d'action par tasse dans les deux rendus est bienvenu.

## 6. CHANGELOG.md hors format

Les entrées 8.1 à 8.14 sont AJOUTÉES EN BAS du fichier, après la v1, sous des titres `## 8.x` en paragraphes, avec des apostrophes typographiques (’). La règle du fichier, écrite en tête : une entrée `- vX.Y : ...` par version, la plus récente en premier, apostrophes droites. Remonte les quatorze entrées en tête, dans ce format, en gardant leur contenu. Les entrées v7.99, v7.100 et v7.101 (livrées par une autre session pendant la refonte, entre la 8.7 et la 8.8, d'où la numérotation à rebours) restent, placées à leur position chronologique, avec la mention « numérotée à rebours, livrée après la 8.7 ». Remplace aussi les 38 apostrophes typographiques de DECISIONS.md par des droites, le reste des docs n'en a aucune.

## 7. DOCUMENTATION.md en retard sur le code

« Dernière mise à jour : v7.101 » alors que le site est en 8.14. Ligne 330 : « bouton EN/FR dans l'entête », l'entête n'existe plus (rail et feuille Plus). Les sections 7 et 8 ne décrivent ni la carte « Dernière tasse », ni la table des cinq dernières, ni le calendrier avec ses mini-statistiques, ni la phrase des KPI secondaires, ni le chrono devenu widget dans la colonne droite, ni la feuille de saisie rapide, ni l'historique groupé par jour avec son bandeau résumé et ses dix colonnes. Ajoute une courte section « Tableau de bord (js/ui-tableau.js) » et mets à jour les sections saisie et historique. Court : ce qui existe, pas le pourquoi.

## 8. CSS mort après la refonte

Vingt-cinq classes n'ont plus aucune trace dans index.html ni js/ : derniere-cafe, derniere-corps, derniere-droite, derniere-infos, derniere-note, derniere-tete et le bloc `.dernieres li` (l'ancienne liste, remplacée par la table), legende-heatmap et hm-i (la légende 1, 2, 3, 4 et plus du calendrier a disparu : soit tu la remets sous le calendrier, elle disait ce que veulent dire les couleurs, soit tu retires son CSS), badge-stock-bas, badge-stock-ok, badge-stock-vide, carte-large, detail-bloc, entete-actions, entete-inner, grille-graphes, marque-icone, marque-lien, marque-retiree, marque-sous, ancienne-marque-retiree, nav-icone. Vérifie chacune au grep avant de supprimer ; hm-n0 à hm-n4 sont construites dynamiquement et restent.

## 9. Titres de cartes en serif 11 px majuscules

Les `h3` de cartes sont en Instrument Serif 11 px, majuscules : illisible à cette taille, une serif n'est pas faite pour des petites capitales. Le brief : intertitres en Manrope 700, 11 px, majuscules, `letter-spacing: 0.08em`, couleur `--attenue`. La serif reste pour `.titre-page`, les chiffres et les notes.

## 10. Petits points

- `<meta name="theme-color">` clair vaut `#f8f2e9`, l'ancien fond ; le fond est `#f4ede3`.
- Libellés tronqués dans les cartes d'analyse à une colonne : « icler's Recipe (Sweet) », « ue (eau préchauffée) » sur la note par recette, « Brûlé (défaut du sa », « Acide ET amer (ext » dans la légende des diagnostics. Raccourcir les libellés au rendu (callback des ticks Chart.js, 18 caractères plus points de suspension, nom complet dans l'infobulle) ou laisser la légende passer à la ligne.
- `chrono-bip`, `f-total-min`, `f-total-sec`, `f-ecoulement-min`, `f-ecoulement-sec` sont hors du `<form>` sans attribut `form="form-saisie"` ; ça marche parce que le JS lit par identifiant, mais pose `form="form-saisie"` pour que la touche Entrée et la sémantique du formulaire suivent, comme `f-date` l'a déjà.
- README.md réécrit en anglais : décision prise seule par la session de refonte (dépôt public). Chris tranche ; sauf avis contraire de lui, garder.

## Ordre conseillé

Un commit par point ou par groupe de petits points : 1, 2, 3, 4, 5 (le plus gros), 9 et 10 ensemble, 8, puis 6 et 7 en dernier puisque la doc décrit l'état final. Tests à chaque commit, push à la fin, puis `git rm PROMPT-CORRECTIFS-REFONTE.md` dans le dernier commit.
