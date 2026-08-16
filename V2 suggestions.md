# Backlog : nouvelles fonctionnalités et statistiques

Refait le 16 août 2026 sur la v7.31, en faisant tourner le code du site sur tes
**vraies données de production** lues dans D1 : 15 extractions, 5 cafés, 10
recettes, 5 achats, 10 jours d'usage.

Chaque proposition ci-dessous est chiffrée avec tes chiffres à toi. Une idée qui
n'avait pas de matière dans tes données n'est pas dans la liste, elle est en bas
dans « écarté et pourquoi ».

L'audit technique (bugs, dette, sécurité, accessibilité) est séparé, dans
`AUDIT-2026-08.md`.

## Comment lire les estimations

Budget de conversation nécessaire pour livrer proprement, doc et tests compris.

| Repère | Tokens | À quoi ça ressemble |
|---|---|---|
| XS | 10k à 30k | Un fichier touché, une poignée de lignes |
| S | 30k à 80k | Deux ou trois fichiers, quelques clés i18n |
| M | 80k à 180k | Un écran ou un mécanisme entier |
| L | 180k à 350k | Nouveau modèle de données |

Trois choses gonflent le coût indépendamment de la difficulté : la double langue,
la compatibilité CSV (toute évolution de schéma demande une migration idempotente)
et la doc à jour à chaque livraison.

## Déjà fait, ne pas reproposer

Déploiement privé, synchro D1, PWA et Wake Lock, insights automatiques, stock par
sachet, calendrier avec statistiques, classement des goûts, numéro de version,
brouillon de saisie, durées min et sec, puissance de feu, diagnostics groupés,
recette d'eau préchauffée, détail dépliable, comparateur, régularité, écran
Mes meilleurs réglages, ratio propre à chaque machine, écran Paramètres.

---

# Priorité 1 : la tendance, le fait le plus important de ton carnet

**Coût XS.** À faire en premier, c'est trois fois rien et ça change ce que tu vois
en ouvrant le site.

Ta moyenne glissante sur 5 tasses :

```
08-10  8,0
08-11  7,3
08-12  6,9
08-13  6,9
08-14  6,3
08-15  5,7
08-16  5,1
```

**Onze points de suite, une baisse monotone, jamais un rebond.** Tu es passé de 8
à 5,1 en six jours. Le site ne te le dit nulle part. Le graphe 30 jours affiche
des points bruts où la tendance se perd, et les KPI donnent une moyenne globale
qui, elle, ne bouge presque pas.

À faire : une courbe de moyenne glissante par dessus le nuage du graphe 30 jours,
et une phrase d'insight qui compare les 5 dernières tasses aux 5 précédentes avec
les garde-fous habituels. Chez toi elle dirait aujourd'hui : « tes 5 dernières
tasses sont à 5,3 contre 7,4 les 5 d'avant ».

Aucun champ nouveau à saisir.

---

# Priorité 2 : le détecteur de variables confondues

**Coût S.** La proposition la plus originale de cette liste, et celle qui répare
une vraie faiblesse de tes données.

Le 12 août tu as changé **deux choses en même temps** : de café (Sáng Tạo 4 vers
Bana G4) et de dose (14 vers 16 g). Résultat, cette comparaison est définitivement
ininterprétable :

| Groupe | n | Moyenne |
|---|---|---|
| moins de 15 g | 8 | 7,50 |
| 16 g et plus | 6 | 5,75 |

L'écart de 1,75 point est peut-être la dose, peut-être le café, et personne ne
saura jamais. Huit tasses perdues pour cette question précise.

Deux mécanismes :

1. **À l'enregistrement**, comparer avec la dernière tasse du même café et lister
   les leviers qui ont bougé. Au delà d'un seul : « tu changes la dose ET le
   préchauffage. Quel que soit le résultat, tu ne sauras pas lequel a compté. »
   Un avertissement, pas un blocage : parfois on veut juste boire un café.
2. **Dans les insights**, refuser d'affirmer quand la comparaison est polluée. Une
   règle qui détecte qu'un autre levier a changé en même temps doit le dire au
   lieu de conclure. Une règle qui reconnaît sa limite vaut mieux qu'une règle
   fausse.

C'est exactement ce que je te répète à la main depuis une semaine. Autant que le
site le fasse.

---

# Priorité 3 : ce que ça te coûte vraiment

**Coût S.** Toutes les données existent déjà, rien n'est affiché.

Ce que le site pourrait te dire aujourd'hui :

| Statistique | Ta valeur |
|---|---|
| Coût réel par tasse | **5 854 ₫** |
| Total acheté | 766 000 ₫ |
| Café réellement bu | 87 815 ₫ |
| **Sachets jamais ouverts** | **530 000 ₫**, soit 69 % de tes achats |
| Coût du mois | à afficher, la table des achats est là |

Et le calcul que personne d'autre ne fait, avec le champ `pourcentage_cafe_reel`
qui ne sert aujourd'hui qu'à la caféine :

| Café | ₫ par gramme | ₫ par gramme de café **réel** |
|---|---|---|
| Sáng Tạo 4 (82 %) | 438 | **534** |
| Bana G4 (100 %) | 348 | **348** |
| Mít Liberica | 1 400 | 1 400 |
| Là Việt | 500 | 500 |

Le Sáng Tạo paraît 26 % plus cher que le G4. Une fois retirés le soja, le sirop de
sucre et le substitut de beurre, il est **53 % plus cher**. C'est un argument
d'achat concret, et c'est ton meilleur café en note, donc l'arbitrage est réel.

À mettre : un KPI coût par tasse, un bloc coût sur la fiche de chaque café, et le
prix par gramme de café réel dans la liste « Mes cafés » pour comparer deux
sachets d'un coup d'œil.

---

# Priorité 4 : les sachets dormants

**Coût XS.** Presque gratuit, effet immédiat.

- **3 cafés sur 5 n'ont jamais été extraits une seule fois**, dont le Mít Liberica
  à 280 000 ₫, ton achat le plus cher.
- **8 recettes sur 10 n'ont jamais été jouées.**
- 2 tasses sur 4 n'ont jamais servi.
- **Zéro extraction Switch** en 15 tasses, alors que 6 recettes Switch sont là.

Le stock par sachet compte déjà ce qui reste, il ne dit rien de ce qui n'a jamais
commencé. Une carte « tu as 3 sachets ouverts jamais goûtés, dont un à 280 000 ₫ »
sur le tableau de bord, plus un tri « jamais extrait » dans Mes cafés.

Note honnête : ça pousse aussi à ressortir le Switch, et un Liberica en Switch est
probablement une meilleure tasse qu'un Robusta de plus en Brikka.

---

# Priorité 5 : ton palais en deux colonnes

**Coût S.** Le graphe des goûts existe, mais il classe sans conclure.

Tes descripteurs, sur les tasses notées :

| Ce qui monte tes notes | n | moy | | Ce qui les descend | n | moy |
|---|---|---|---|---|---|---|
| gras | 4 | **7,75** | | astringent | 2 | **5,0** |
| rond | 6 | **7,67** | | rugueux | 2 | **5,0** |
| liquoreux | 7 | 6,79 | | cendre | 2 | **5,0** |
| sec | 4 | 6,25 | | sirupeux | 2 | 5,5 |

C'est cohérent et lisible : tu aimes le **corps gras et rond**, tu détestes la
**texture sèche et râpeuse**. Ce sont deux axes de texture, pas d'arôme, ce que le
site ne dit pas alors que ses descripteurs sont groupés par famille et qu'il
pourrait donc l'agréger.

À faire : deux colonnes explicites au lieu d'un histogramme, l'agrégation par
FAMILLE de descripteurs (corps, texture, arômes) en plus du détail, et la même vue
par café quand un sachet dépasse une dizaine de tasses.

Curiosité à surveiller : « brûlé » sort à 7,17 sur 3 tasses, ce qui contredit ton
ressenti. Trop peu de matière pour conclure, mais c'est le genre de chose que
seule une statistique attrape.

---

# Priorité 6 : ton problème récurrent et son levier

**Coût S.**

Tes diagnostics, par fréquence :

| Diagnostic | n | Note moyenne |
|---|---|---|
| **Trop fort (concentré)** | 3 | 5,5 |
| Un peu amer | 3 | 6,67 |
| Un peu éventé | 2 | 6,5 |
| Un peu brûlé | 2 | 5,0 |

Le site a déjà `DIAGNOSTIC_CORRECTIONS`, mais il ne l'utilise qu'au moment de la
saisie, tasse par tasse. Il ne dit jamais « voilà ton problème RÉCURRENT ».

À faire : une carte qui nomme le diagnostic le plus fréquent des 10 dernières
tasses, sa note moyenne, et le levier correspondant tiré des corrections déjà
écrites. Chez toi : « Trop fort revient 3 fois et te coûte 1,2 point. Levier :
allonger à l'eau en sortie, ou baisser la dose. »

Bonus quasi gratuit : croiser diagnostic et réglage. « Un peu brûlé » n'apparaît
que sur du feu 4. Le site a tout pour le voir.

---

# Priorité 7 : mode test croisé guidé

**Coût M.** Reporté de l'ancien backlog, mais mieux justifié maintenant.

Sur le Bana G4, ton café actuel, tu as **7 tasses réparties sur 5 combinaisons
différentes**. Aucune n'atteint les 3 tasses nécessaires, donc l'écran Mes
meilleurs réglages te répond « éparpillé, il manque 1 tasse ». Sept tasses bues
pour zéro conclusion.

Tu déclares ce que tu testes, le site FIGE le reste : même café, même dose, même
recette, préremplis et signalés si tu y touches. Il compte les tasses de chaque
côté et annonce le verdict quand il y en a assez.

Un test est un objet léger en localStorage, pas besoin de le synchroniser ni de
toucher au schéma CSV.

À faire après la priorité 2 : le détecteur de variables confondues en est la
brique de base, et il est huit fois moins cher.

---

# Priorité 8 : nettoyer le tableau de bord de ce qui ne s'affichera jamais

**Coût XS.**

Sur tes données, deux graphiques sont **structurellement vides et le resteront** :

- **Note contre mouture** : tes deux cafés utilisés sont déjà moulus, le champ est
  à 0 % de remplissage.
- **Brikka contre Switch** : zéro extraction Switch en 15 tasses.

Et deux règles d'insight ne peuvent jamais se déclencher : la fraîcheur (aucun de
tes 5 cafés n'a de date de torréfaction, et tu m'as dit que tu ne l'aurais jamais)
et la mouture.

Les cartes vides ont déjà un message explicatif, ce n'est donc pas cassé, mais
elles occupent la moitié du tableau de bord. Les masquer tant qu'elles n'ont pas
de matière, et rendre le mécanisme générique : une carte qui n'a rien à dire
disparaît au lieu de s'excuser.

---

# Priorité 9 : le temps de cuisson

**Coût S.** Reporté tel quel, la question Brikka reste ouverte.

Temps total moins temps d'écoulement, c'est-à-dire la durée pendant laquelle la
mouture chauffe sans que rien ne la traverse. C'est ce chiffre qui explique un
goût brûlé, pas le temps total.

Prérequis honnête, et il a empiré : **le temps d'écoulement est à 0 % de
remplissage sur tes 15 extractions**, et le temps total à 40 %. Le graphique
restera vide tant que tu ne rempliras pas les deux. À ne lancer que si tu comptes
vraiment chronométrer l'écoulement.

Ce qu'on voit malgré tout sur les 6 tasses chronométrées :

```
3:00  feu 4  note 5
4:18  feu 3  note 4
5:00  feu 3  note 7
5:00  feu 4  note 5
7:00  feu 2  note 6
7:30  feu 2  note 5,5
```

Cinq minutes semble être ton point, mais avec six points c'est une impression, pas
un résultat.

---

# Priorité 10 : corbeille et annulation

**Coût S.** Reporté, rien à ajouter.

Une suppression d'extraction est définitive. Un toast « Supprimée, annuler »
pendant cinq secondes coûte peu, et le risque a augmenté depuis que le site tourne
en PWA sur téléphone, en cuisine.

À grouper avec le remplacement des `confirm()` et `alert()` natifs : sur mobile ce
sont des boîtes système qui cassent l'impression d'application, et elles ne
passent pas par la couche i18n donc elles restent en français en mode anglais.

---

## Écarté, et pourquoi

| Idée | Pourquoi non |
|---|---|
| Radar des descripteurs par café | Ton café le plus documenté a 8 tasses et 13 descripteurs distincts. Un radar serait un dessin, pas une mesure. À reprendre à une vingtaine de tasses sur un même sachet, en priorité 5 il y a déjà l'agrégation par famille qui, elle, tient debout. |
| Note prédite avant de boire | 15 tasses, 5 variables. Un modèle sortirait un chiffre qui aurait l'air sérieux et serait du bruit. Dangereux justement parce que ça inspire confiance. |
| Corrélation tasse et note | Vérifié : Flat White Egg 6,72 contre Espresso Egg 6,58 sur 9 et 6 tasses. Il n'y a rien à dire, et le dire quand même serait faux. |
| Meilleur moment de la journée | Le soir sort à 8,25 contre 6,3 l'après-midi, mais toutes tes tasses du soir sont du Sáng Tạo 4 des premiers jours. Variable confondue, exactement le problème de la priorité 2. À reproposer une fois le détecteur en place. |
| Profils d'eau (marque, TDS) | Une variable de plus à saisir à chaque tasse, alors que six champs sur vingt-deux sont déjà à zéro. |
| Photos d'étiquettes | Alourdit IndexedDB, ne tient pas dans un CSV, et il faudrait décider si ça passe par la synchro. |
| Import du récap Shopee | Le site ne peut pas interroger Shopee. Faisable en parseur de texte collé, beaucoup moins magique. |
| Suggestion automatique du diagnostic | Deviner le diagnostic depuis les temps et le ratio serait souvent faux, et un diagnostic faux entraîne une correction fausse. Ton palais tranche mieux. |
| Rapport hebdomadaire partageable | Confort pur, aucune urgence, et avec 1,5 tasse par jour actif un rapport hebdo dirait la même chose que le tableau de bord. |

---

## Le vrai sujet, qui n'est pas une fonctionnalité

Le site te demande **22 champs et tu en remplis 9**. Six n'ont jamais été remplis
une seule fois. Tant que c'est vrai, chaque nouvelle statistique risque de naître
vide, comme le ratio en tasse livré hier qui dépend du volume extrait et ne
s'affichera donc jamais.

Le détail est dans `AUDIT-2026-08.md`, priorité 1 : sur la Brikka, arrêter de
demander l'eau (une constante, 150 g) et réclamer à la place le volume extrait
(la variable qui explique ta concentration). C'est un champ retiré et un champ
gagné, à saisie constante.

À faire avant ou en même temps que les priorités 1 à 3 de ce document.

## Ordre recommandé

1. **Priorité 1**, la tendance. XS, et c'est la chose la plus importante que tes
   données disent aujourd'hui.
2. **Priorité 4**, les sachets dormants. XS aussi, et 530 000 ₫ qui dorment.
3. **Priorité 3**, le coût. Tout est déjà calculable.
4. **Priorité 2**, le détecteur de variables confondues. C'est lui qui rend
   fiables toutes les statistiques d'après.
5. **Priorité 8**, le nettoyage du tableau de bord, à faire pendant qu'on y est.
6. Priorités 5 et 6, palais et diagnostic récurrent.
7. **Priorité 7**, le mode test guidé, une fois la 2 en place.
8. Priorités 9 et 10 quand tu veux.

Le découpage de `app.js` (2 849 lignes) reste à caser avant la priorité 7, qui est
la seule grosse pièce de la liste.
