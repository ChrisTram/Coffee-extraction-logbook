# Audit du carnet d'extraction, novembre 2026

Fait le 12 novembre 2026 sur la **v9.40** (256 commits), à la demande de Chris :
« audit complet, code, perfs, supprimer les trucs inutiles, améliorer le layout,
les animations, surtout le dashboard, plein de trucs useless affichés », et « sur
le dashboard, direct, pour les cafés ouverts, une moyenne des notes pour chacun,
leurs évolutions ». Remplace l'audit du 6 septembre (v7.80), soldé : son texte
reste dans l'historique git (`git show 251a555:AUDIT.md`).

Tout ce qui pouvait se corriger sans changer un chemin d'utilisation est parti
directement dans le code : **v9.41** (l'accueil), **v9.42** (ménage, perfs,
retouches) et, sur ton « oui », **v9.43** (Analyses au téléphone). Deux jours plus
tard, ton retour (« toujours autant moisi », « fait vide ») a donné la **v9.44** :
quatre graphiques sur l'accueil à la place de la phrase « À retenir » et de la
roue des goûts, qui remplacent la section 1 ci-dessous pour ces deux cartes. Ce fichier dit ce qui a été mesuré, ce qui a été fait, et ce qui
reste, chiffré.

## Comment c'est mesuré

En local, dans un vrai navigateur, sur le jeu de démonstration (62 tasses, 4
cafés), à 1440 par 900 et à 390 par 844, par script (hauteurs, textes coupés,
débordements, cibles tactiles) puis à l'œil. Tes vrais cafés et tes 50 dernières
tasses ont été lus par le serveur MCP du catalogue, pour dimensionner l'accueil
sur ton cas réel (un à deux cafés ouverts à la fois). **Pas mesuré** : le site
déployé (temps de chargement réel sur ton téléphone, en-têtes renvoyés par
Cloudflare).

## L'état des lieux en chiffres

| Mesure | Valeur | Commentaire |
|---|---|---|
| Code de l'application | 79 fichiers JS, 31 300 lignes ; 14 feuilles CSS, 8 000 lignes ; 2 270 lignes de HTML | zéro build, zéro dépendance sauf Chart.js |
| JS lu à l'ouverture | **1,42 Mo** non minifié, dont 26 % de commentaires | hors dictionnaire anglais (194 Ko, à la demande) et Chart.js |
| Requêtes à la première ouverture | 1 page, 14 feuilles, 78 scripts, 4 polices | ensuite tout vient du cache du service worker |
| Rendu de l'accueil | **12 ms** (62 tasses) | dont 4 ms pour les cafés ouverts, 1,7 ms pour la dernière tasse |
| Tests | **18 suites, environ 2 170 vérifications**, tout vert | toujours zéro test en navigateur |
| Code mort trouvé | 49 règles CSS (27 classes sur 1 485), 44 textes sur 1 323, 1 animation | retiré en v9.42 |
| Fonctions jamais appelées | **aucune** | 23 noms exportés pour rien, tous des alias de fonctions vivantes |
| Débordement horizontal | **aucun**, sur 8 écrans et 2 largeurs | |
| Doc à lire avant de coder | 164 Ko (`DOCUMENTATION.md`), soit environ 43 000 tokens | le premier coût de chaque session, voir « Ce qui reste », 4 |

Le code est sain : pas de fonction orpheline, des frontières entre fichiers
tenues par des tests, un rendu rapide. Le défaut n'était pas dans le code, il
était sur l'écran d'accueil.

## 1. L'accueil (v9.41)

**Avant.** 1 927 px de haut à 1440 par 900. Le stock était dit DEUX fois sur le
même écran (les pastilles sous le titre, la colonne « Tes sachets, en
grammes »). Trois cartes de la colonne (« Ton mois », le podium des recettes, la
carte du moulin) redessinaient des tuiles d'Analyses, pour remplir une colonne
que huit dernières tasses rendaient longue. « À brasser, si tu veux » vivait
tout en bas. Et la question que tu poses, « où en sont mes cafés ouverts »,
n'avait qu'un chiffre : la moyenne, en petit, à côté des grammes.

**Après.** Sous le titre, à toutes les largeurs, **une carte par café ouvert** :

- le bocal, les grammes, les tasses qui restent, depuis quand il est ouvert ;
- sa moyenne en grand ;
- sa tendance : « +0,6 sur tes 3 dernières », « stable », rien sous quatre notes ;
- ses notes tasse par tasse, un point par tasse (bleu Brikka, orange Switch), la
  moyenne en pointillés, une ligne qui dit où ça va ; un point ouvre sa tasse ;
- la dernière et la meilleure note, la moyenne par cafetière quand les deux ont
  servi ;
- « Brasser », qui prépare la saisie avec ton réglage gagnant sur ce café.

Retirés de l'accueil : les pastilles de stock, la colonne des sachets, « À
brasser », « Ton mois », le podium, le moulin. Rien n'est perdu : tout se lit
dans la carte du café, ou à un toucher dans Analyses et Mes cafés. Restent : la
dernière tasse et son graphique (demandé en v9.39), la semaine, le constat qui
tourne, la roue des goûts, les dernières tasses (cinq au lieu de huit).

| | Avant | Après |
|---|---|---|
| Hauteur de l'accueil, ordinateur | 1 927 px | 1 761 px |
| Blocs sur l'accueil, ordinateur | 11 | 7 |
| Fois où le stock est affiché | 2 | 1 |
| Moyenne et tendance par café ouvert | une moyenne, en petit | moyenne, tendance, courbe |
| Téléphone, premier écran | pastilles, dernière tasse, semaine | deux cafés ouverts complets et la dernière tasse |

## 2. Le code (v9.42)

- **CSS** : 49 règles retirées, celles de 27 classes que plus rien ne produit
  (anciens badges de stock, ancienne table de comparaison, ancien écran de
  bienvenue, anciens chiffres clés du panneau, silhouettes de chargement
  inutilisées, la ligne du graphique d'avant la v9.40) ; une animation orpheline.
- **Textes** : 44 clés de traduction que plus rien ne demande, retirées en
  français et en anglais. Six autres semblaient mortes et ne l'étaient pas (la
  comparaison de deux tasses construit leur nom) : les tests l'ont attrapé,
  elles sont restées.
- **JS** : rien à retirer. Le bocal miniature des pastilles est parti avec elles
  (v9.41).
- **Doc** : `START-HERE.md` disait encore « pas de balance », « cinq suites de
  tests » et « le code est nommé en français » : corrigé. Le README décrivait
  les six écrans d'août : corrigé.

## 3. Les perfs (v9.42)

- **Chart.js (205 Ko) était préchargé en priorité haute** à chaque ouverture,
  alors que l'accueil ne dessine plus aucun graphique Chart.js depuis la
  v9.21 : il faisait la course avec les scripts du premier écran. Il passe en
  `prefetch` (priorité basse, après le reste) ; Analyses s'ouvre toujours sans
  attendre.
- Le rendu de l'accueil tient en 12 ms : rien à gagner là.
- Le stock n'est plus calculé trois fois par rendu (pastilles, colonne,
  suggestion) mais une.

## 4. Mise en page et animations (v9.42)

Balayage des 8 écrans, 2 largeurs : aucun débordement, et quatre défauts
corrigés.

- Analyses, « Tes cafés » : un nom long était coupé (« Trung Nguyên Sáng Tạo
  4 » à 143 px) ; il prend une deuxième ligne.
- Mes cafés : le meilleur réglage d'un sachet était coupé avant sa note ; il
  passe sur deux lignes. La moyenne d'un café fini ne se coupe plus au téléphone.
- Réglages gagnants, téléphone : le nom d'un café était une cible de 24 px ; 44.
- Dernières tasses, écran moyen : chaque tasse tient en deux lignes au lieu de
  trois (les goûts à droite du nom).
- L'arrivée de l'accueil dure une demi-seconde au lieu de 0,85 s : c'est l'écran
  où tu reviens dix fois par jour. Les points des courbes arrivent un par un,
  après leur carte ; rien ne bouge en mouvement réduit.

## Ce qui reste, par ordre de rentabilité

Coûts en tokens de conversation, doc et tests compris : XS 5 à 15 k, S 25 à
70 k, M 90 à 180 k.

| # | Quoi | Mesure | Coût | Pourquoi ce n'est pas fait |
|---|---|---|---|---|
| 1 | ~~Analyses au téléphone~~ | 7 843 px avant, **4 684 px** après | fait | **v9.43** : trois tuiles repliées, trois constats puis « voir plus », les dessins en rangée qui glisse, les onglets sur une ligne |
| 2 | **La saisie au téléphone** | 4 631 px ; 83 cibles sous 36 px (pilules de goûts à 31 px, curseurs) | M | c'est ton écran de tous les jours, on ne le retouche pas à l'aveugle |
| 3 | **Mesurer le site déployé sur ton téléphone** | jamais fait | XS | il me faut l'adresse et une session ; c'est ce qui dira si le point 5 vaut le coup |
| 4 | **La doc à lire par session** | 164 Ko, environ 43 000 tokens | M | un index court par zone à la place de la lecture entière ; gain d'environ 30 k tokens par session |
| 5 | **Le poids du JS** | 1,42 Mo, 26 % de commentaires, 78 requêtes | M | demande une étape de build, décision « pas de build » à revoir seulement si le point 3 montre un vrai délai (le cache du service worker le masque dès la deuxième visite) |
| 6 | **Un test en navigateur** | zéro | S | reste le seul trou des tests : les défauts de rendu ne se voient qu'à l'œil |
| 7 | 203 noms exportés sur `UI` et utilisés seulement dans leur fichier | sans effet pour toi | S | à ne pas faire : beaucoup de lignes touchées pour rien de visible |

## Ce qui va bien, et qu'il ne faut pas casser

- Les frontières entre fichiers, tenues par `tools/modules.test.mjs`.
- `tools/boot.test.mjs`, qui démarre le site pour de vrai et refuse toute erreur
  console, bascule anglaise comprise.
- Le rendu « seulement si le HTML change », qui garde les animations en cours
  quand une synchro répond.
- Les couleurs de données (Brikka bleu, Switch orange), reprises telles quelles
  dans les courbes des cafés ouverts.
- Le stock en grammes lisible dès l'ouverture, sans défiler.
