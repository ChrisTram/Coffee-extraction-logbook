# Audit du carnet d'extraction

Fait le 27 août 2026 sur la **v7.43**, code et données réelles. Remplace
`AUDIT-2026-08.md` et `V2 suggestions.md`, qui sont supprimés : trois documents
d'audit qui se recouvrent, c'est deux de trop.

Rien ici n'est une supposition. Les chiffres du code viennent de mesures sur les
fichiers, ceux des données viennent du document D1 de production, lu et passé dans
la couche pure du site.

## Où en est cette liste

**Les dix points sont faits**, entre la v7.44 et la v7.60. Le détail de chacun est
dans le changelog de DOCUMENTATION.md, qui fait foi ; plusieurs ont été livrés
avec des modifications demandées en cours de route, et les sections ci-dessous ne
les reflètent pas.

Le reste de ce document est laissé tel qu'il a été écrit le 27 août. C'est le
RAISONNEMENT qui sert encore, pas la liste de tâches : les chiffres décrivent la
v7.43, pas le site d'aujourd'hui.

## L'état des lieux en dix chiffres

| Mesure | Valeur | Commentaire |
|---|---|---|
| Lignes de code et de doc | 14 416 | dont 3 081 pour `app.js` seul |
| `app.js` | **3 081 lignes**, 141 fonctions, une IIFE | 2 482 il y a douze jours, **+24 %** |
| Plus longue fonction | `cabler`, **338 lignes** | puis `rendreTableau` à 198 |
| Assertions de test | **262** sur 4 suites | elles tournent en moins d'une seconde |
| Poids du chemin critique | 697 Ko non compressés | dont 201 pour Chart.js et 106 pour l'i18n |
| Extractions enregistrées | **29** | 15 il y a onze jours |
| Champs remplis à 100 % | 6 sur 21 | date, café, méthode, recette, dose, tasse, note |
| Champs sous 15 % | **5** | volume extrait 3 %, écoulement 10 %, lait 0 %, agitation 0 %, préchauffage 14 % |
| Migrations à usage unique | **6**, marquées par appareil | dans une fonction de 202 lignes |
| Boutons sans état accessible | 70 boutons, **0 `aria-pressed`** | et le site tourne en PWA sur ton téléphone |

## Ce que tes données disent maintenant

**Tu es remonté.** La moyenne glissante sur 5 tasses est passée de 8,0 à 5,1 entre
le 10 et le 16 août, puis elle est revenue à **7,0**. Tes cinq dernières tasses
font 7,0 contre 5,8 pour les cinq d'avant. Le site ne le dit nulle part.

```
8,0  7,7  7,3  7,1  6,9  6,9  6,3  6,1  5,7  5,4  5,1
5,6  5,7  5,7  5,6  5,6  5,6  5,6  5,8  5,8  6,0  6,0  6,4  6,8  7,0
```

Ce qui a de la matière maintenant, et qui n'en avait pas au dernier audit :

| Comparaison | Groupes | Verdict |
|---|---|---|
| Puissance de feu | feu 3 : n=13, **6,96** contre feu 2 : n=8, 6,06 | tient enfin debout |
| Préchauffage | non : n=25, **6,58** contre oui : n=4, 5,50 | confirmé, il te coûte |
| Brikka contre Switch | n=23, 6,48 contre n=6, 6,25 | trop serré pour conclure |
| Par café | Sáng Tạo 7,50 · Liberica **6,75** · G4 5,73 | le Liberica démarre bien |

« Mes meilleurs réglages » parle désormais pour **deux cafés sur cinq** : Sáng Tạo
à 7,83 sur 6 tasses, G4 à 6,67 sur 3, les deux en feu 3 sur Brikka classique. Le
Liberica reste « éparpillé », 4 combinaisons pour 6 tasses.

Deux sections restent structurellement muettes : **note contre mouture** (une
seule valeur, 1.5.0, sur les 6 tasses moulues) et **fraîcheur** (aucun de tes 5
cafés n'a de date de torréfaction).

---

# Les dix améliorations, par ordre de rentabilité

Coût en tokens de conversation, doc et tests compris. Ordre de grandeur, pas devis.

| # | Amélioration | Type | Coût |
|---|---|---|---|
| 1 | La tendance, enfin affichée | feature | **XS**, 15 à 30 k |
| 2 | Les réglages suivent l'appareil, pas le compte | dette | **S**, 40 à 70 k |
| 3 | Décider du sort du volume extrait | feature | **S**, 40 à 60 k |
| 4 | Insights branchés sur ce que tu remplis | feature | **S**, 50 à 80 k |
| 5 | Le coût, calculé partout et affiché nulle part | feature | **S**, 50 à 80 k |
| 6 | Un compteur de schéma au lieu de six drapeaux | dette | **S**, 50 à 80 k |
| 7 | Corbeille, annulation, et adieu aux `confirm()` | feature | **S**, 50 à 80 k |
| 8 | Accessibilité et confort au doigt | dette | **S**, 40 à 70 k |
| 9 | Ne plus charger deux langues sur trois | perf | **S**, 40 à 70 k |
| 10 | Découper `app.js` | dette | **M**, 120 à 180 k |

---

## 1. La tendance, enfin affichée

**Coût XS.** Le meilleur rapport effet sur effort de toute la liste.

Tes notes racontent une chute puis une remontée, et le site n'en montre rien : le
graphe 30 jours affiche des points bruts où la courbe se perd, et le KPI donne une
moyenne globale qui bouge à peine.

À faire : une courbe de moyenne glissante par dessus le nuage des 30 jours, et une
phrase d'insight comparant les 5 dernières tasses aux 5 précédentes, avec les
garde-fous habituels. Elle dirait aujourd'hui : « tes 5 dernières tasses sont à
7,0 contre 5,8 les 5 d'avant ».

Aucun champ nouveau à saisir. Toutes les données existent.

## 2. Les réglages suivent l'appareil, pas le compte

**Coût S.** La friction que tu vas rencontrer très bientôt.

`replis` contient maintenant trois réglages : dose de repli, puissance de feu de
repli et **molette du broyeur**. Plus le thème, la langue et les bips. Tout ça vit
en `localStorage`, donc **par appareil**.

Concrètement : tu poses ta molette sur 1.5.0 depuis l'ordinateur, tu ouvres la PWA
sur ton téléphone, elle prérempli encore la valeur d'usine. Et tu ne le verras pas,
puisque c'est un champ prérempli qui a l'air normal.

C'était défendable quand il n'y avait qu'un repli de dose. Avec un écran
Paramètres, un curseur de moulin et un bouton « utiliser comme réglage par
défaut », ce ne l'est plus : ces trois valeurs décrivent **ton matériel**, pas ton
appareil. Elles doivent rejoindre le document synchronisé, comme les recettes.

Le thème et les bips, eux, restent locaux à juste titre : un téléphone en cuisine
et un ordinateur n'ont pas les mêmes besoins.

## 3. Décider du sort du volume extrait

**Coût S.** Une décision à prendre, pas seulement du code.

Le champ est rempli sur **1 extraction sur 29**, soit 3 %. Conséquence directe :
le ratio en tasse, livré en v7.29, s'affiche sur **une seule ligne** de tout ton
historique. La colonne Ratio est vide sur 11 lignes et affiche un ratio de
chaudière, qui ne dit rien de ta concentration, sur 11 autres.

Deux issues, et il faut en choisir une :

- **Le réclamer pour de bon.** Sur la Brikka, l'eau de chaudière est une constante
  (150 g) : la retirer du formulaire et mettre le volume extrait à sa place, au
  même endroit, avec un rappel de ce qu'il débloque. Zéro champ en plus à remplir,
  et la colonne Ratio devient utile sur toutes les lignes futures.
- **Ou l'assumer comme optionnel** et arrêter de promettre un ratio en tasse qui
  ne s'affiche jamais.

La première est meilleure, mais elle ne vaut que si tu penses vraiment mesurer ce
qui sort. Sinon la seconde est plus honnête.

Même question, en plus petit, pour l'écoulement (10 %), le lait (0 %) et
l'agitation (0 %) : à replier sous un bloc « Détails » plutôt qu'à laisser en
première ligne.

## 4. Insights branchés sur ce que tu remplis

**Coût S.**

Deux des cinq règles ne peuvent pas se déclencher : la **fraîcheur** dépend d'une
date de torréfaction qu'aucun de tes cafés ne porte, la **mouture** d'un champ qui
n'a qu'une seule valeur.

À remplacer par trois règles qui, elles, ont la matière **aujourd'hui** :

- **Tendance sur 7 jours**, voir l'amélioration 1.
- **Préchauffage** : 6,58 contre 5,50 sur 25 et 4 tasses.
- **Puissance de feu** : 6,96 à feu 3 contre 6,06 à feu 2, sur 13 et 8 tasses.

Et une quatrième qui manque cruellement vu ton historique : **prévenir quand une
comparaison est polluée**. Le 12 août tu as changé de café ET de dose le même jour,
ce qui rend huit tasses ininterprétables pour la question de la dose. Une règle qui
reconnaît sa propre limite vaut mieux qu'une règle fausse.

## 5. Le coût, calculé partout et affiché nulle part

**Coût S.** Tout est déjà calculable, rien n'est montré.

| Statistique | Ta valeur |
|---|---|
| Coût réel par tasse | **8 885 ₫** |
| Total acheté | 766 000 ₫ |
| Café réellement bu | 257 663 ₫ |
| Sachets jamais ouverts | **250 000 ₫**, les deux Là Việt |

Plus le calcul que personne d'autre ne fait, avec le champ `pourcentage_cafe_reel`
qui ne sert aujourd'hui qu'à la caféine : ton Sáng Tạo est à 82 % de café, donc à
**534 ₫ le gramme de vrai café** contre 348 pour le G4. Il paraît 26 % plus cher,
il l'est de 53 %.

À mettre : un KPI coût par tasse, le coût sur la fiche de chaque café, et le prix
au gramme de café réel dans « Mes cafés » pour comparer deux sachets d'un coup.

## 6. Un compteur de schéma au lieu de six drapeaux

**Coût S.** De la dette qui grossit à chaque correction.

`migrerDonnees()` fait **202 lignes**, 10 passages numérotés, et **six migrations
à usage unique** marquées chacune par un drapeau dans `localStorage` : `feu4`,
`feu2`, `feuVide`, `brikka150`, `molette150`, `chronicler240`. J'en ai ajouté trois
cette semaine.

Trois défauts, par ordre de gravité :

1. **Les drapeaux sont par APPAREIL, les données sont partagées.** Un appareil qui
   démarre avec un stockage vide pose ses drapeaux sur rien, puis reçoit les
   données du serveur non migrées. Ça s'est déjà produit avec les 150 g de la
   Brikka.
2. Tous les passages s'exécutent à chaque démarrage, même quand il n'y a rien à
   faire.
3. Personne ne peut dire, en lisant, quelles migrations un jeu de données donné a
   déjà subies.

La correction : un numéro de version de schéma **stocké avec les données** et donc
synchronisé, et une liste ordonnée de migrations qui s'appliquent de la version
courante à la dernière. C'est le patron classique, il rend le tout lisible,
idempotent et testable sans dépendre du stockage local.

## 7. Corbeille, annulation, et adieu aux `confirm()`

**Coût S.**

Supprimer une extraction est définitif. Un toast « Supprimée, annuler » pendant
cinq secondes coûte peu, et le risque a augmenté depuis que le site tourne en PWA
sur ton téléphone, en cuisine, avec les doigts mouillés.

À grouper avec le remplacement des **5 `confirm()` et `alert()` natifs** qui
restent dans `app.js`. Sur mobile ce sont des boîtes système qui cassent
l'impression d'application, et surtout elles ne passent pas par la couche i18n :
elles restent en français même en mode anglais.

## 8. Accessibilité et confort au doigt

**Coût S.** Le site tourne en PWA sur ton téléphone, donc ça compte vraiment.

- **70 boutons, 0 `aria-pressed`.** Toutes les bascules (diagnostics, descripteurs,
  choix de machine) n'annoncent aucun état.
- 14 `aria-label` et 2 `role` sur tout le site.
- Les bulles d'aide au survol (diagnostics, ratio, moulin) sont accessibles au
  clavier via `:focus-visible`, mais **pas au doigt** : sur téléphone, un survol
  n'existe pas. Il faut un appui qui les ouvre.

## 9. Ne plus charger deux langues sur trois

**Coût S.** La seule vraie optimisation de poids qui reste.

`js/i18n.js` fait **106 Ko** et contient 263 clés de gabarit plus 646 entrées de
dictionnaire, **dans les deux langues, toujours chargées**. Tu lis le site en
français à peu près tout le temps.

Sur les 697 Ko du chemin critique, c'est le deuxième poste après Chart.js (201 Ko).
Deux fichiers `i18n.fr.js` et `i18n.en.js`, avec seulement celui de la langue
courante chargé et l'autre récupéré à la bascule, retirent environ 50 Ko du
démarrage sans rien changer au mécanisme.

À noter au passage : `js/demo-data.js` fait 11 Ko et est chargé par tout le monde
alors qu'il ne sert qu'à la démonstration. Petit, mais gratuit à corriger en même
temps.

## 10. Découper `app.js`

**Coût M.** La dette qui rend tout le reste plus cher.
**Fait en v7.60.** Voir la section 1 bis de DOCUMENTATION.md pour le résultat.

**3 081 lignes en une seule IIFE**, 141 fonctions, contre 2 482 il y a douze jours,
soit **+24 % en une semaine et demie**. Deux fonctions pèsent 536 lignes à elles
seules : `cabler` (338 lignes de câblage d'événements) et `rendreTableau` (198).

Découpage proposé, toujours en scripts classiques, sans build :

```
js/ui-tableau.js      tableau de bord et insights
js/ui-saisie.js       formulaire, chrono, brouillon
js/ui-historique.js   tableau, filtres, détail, comparateur
js/ui-guide.js        recettes, moulin, diagnostic
js/ui-reglages.js     cafés, recettes, paramètres
js/app.js             démarrage, navigation, câblage
```

Je le mets en dernier volontairement : c'est la plus chère et elle n'apporte rien
de visible. Mais chaque amélioration au dessus coûte un peu plus cher tant qu'elle
n'est pas faite, et le risque d'un bug silencieux augmente mécaniquement avec la
taille du fichier.

**Ce qui a changé par rapport à ce plan.** Sept fichiers au lieu de six : un
`js/ui-noyau.js` s'est imposé pour les outils partagés, sans quoi chaque écran
aurait dû emprunter à `app.js`, donc dépendre du dernier fichier chargé.
`ui-reglages.js` s'appelle `ui-catalogue.js` : il gère les cafés, les sachets et
les recettes, pas les réglages du broyeur, et le nom se confondait avec l'écran
Paramètres.

L'argument du « bug silencieux qui augmente avec la taille » s'est vérifié le jour
même. Le contrôle de frontières écrit avec le découpage a trouvé du premier coup
un appel à un nom qui n'existait nulle part : le bouton d'enregistrement du
panneau rapide ne marchait pas, et la tasse était perdue en silence.

---

## Envisagé, puis écarté

| Idée | Pourquoi non |
|---|---|
| Mode test croisé guidé | C'était la priorité 1 du précédent audit. Moins urgent maintenant : « Mes meilleurs réglages » parle pour deux cafés sur cinq, et la remontée de tes notes suggère que tu as déjà trouvé ton protocole. À reprendre si tu repars en exploration. |
| Radar des descripteurs par café | Ton café le plus documenté a 15 tasses pour une vingtaine de descripteurs distincts. Ce serait un dessin, pas une mesure. |
| Note prédite avant de boire | 29 tasses et 5 variables. Un modèle sortirait un chiffre qui aurait l'air sérieux et serait du bruit. Dangereux précisément parce que ça inspire confiance. |
| Corrélation tasse et note | Vérifié à nouveau : rien de significatif. Le dire quand même serait faux. |
| Rapport hebdomadaire | Avec 1,5 tasse par jour actif, il dirait la même chose que le tableau de bord. |
| Photos d'étiquettes | Alourdit IndexedDB, ne tient pas dans un CSV, et il faudrait décider si ça passe par la synchro. |

## Ce qui va bien, et qu'il ne faut pas casser

- **262 assertions** sur 4 suites sans navigateur, en moins d'une seconde (une
  cinquième suite s'est ajoutée depuis, pour les frontières entre fichiers). Elles
  ont attrapé cinq régressions rien que cette semaine, dont deux que je n'aurais
  pas vues autrement.
- **Zéro dépendance réseau.** Le site s'ouvre toujours en double-clic sur un
  fichier, huit mois après.
- **La synchro D1 tient** : `maj_le` par ligne, tombstones, en-têtes CSV
  verrouillées par test.
- **518 clés de traduction** pour 5 oublis, dont deux messages vietnamiens qui n'ont
  pas à être traduits.
- Les tests écrits comme des **règles générales** et pas des cas particuliers :
  aucun écran borné non centré, aucun état sélectionné qui change la largeur,
  aucun trou de plus de 6 degrés dans la liste des températures. Ceux-là attrapent
  des bugs que je n'ai pas encore écrits.

## Ordre recommandé

1. **1** la tendance, XS, et c'est la chose la plus importante que tes données
   disent aujourd'hui.
2. **2** les réglages synchronisés, avant que tu perdes du temps à comprendre
   pourquoi ton téléphone ne te suit pas.
3. **3** la décision sur le volume extrait, parce qu'elle conditionne 4 et 5.
4. **4** et **5**, insights et coût, qui deviennent faciles une fois 3 tranchée.
5. **10** le découpage, avant toute grosse pièce suivante.
6. **6**, **7**, **8**, **9** quand tu veux, elles ne bloquent rien.
