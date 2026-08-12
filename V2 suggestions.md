# Backlog : audit et pistes d'amélioration

Backlog classé par priorité, revu le 12 août 2026 après la mise en ligne.
Rien ici n'est commencé.

## Comment lire les estimations

La colonne coût est une estimation en tokens du budget de conversation
nécessaire pour livrer la chose proprement, doc et tests compris. C'est un
ordre de grandeur, pas un devis : compter large si la première approche se
révèle fausse.

| Repère | Tokens | À quoi ça ressemble |
|---|---|---|
| XS | 10k à 30k | Un fichier touché, une poignée de lignes |
| S | 30k à 80k | Deux ou trois fichiers, quelques clés i18n |
| M | 80k à 180k | Un écran ou un mécanisme entier |
| L | 180k à 350k | Nouveau modèle de données ou nouveau backend |
| XL | 350k et plus | Refonte structurelle, à découper avant de lancer |

Trois choses gonflent le coût sur ce projet précis, indépendamment de la
difficulté technique : la double langue (toute chaîne visible existe en FR et
en EN, et le mécanisme du TreeWalker impose des clés au fragment près), la
compatibilité CSV (tout changement de schéma demande une migration idempotente
et une régénération de la démo), et la doc qui se met à jour à chaque livraison.
Une feature qui coûterait S ailleurs coûte souvent M ici.

## Ce qui est déjà fait

- Déploiement Cloudflare Workers, site privé derrière identifiant et mot de
  passe, session de 30 jours. Le repo est public, les secrets sont chez
  Cloudflare.
- Le site est en https, ce qui débloque les points 2 et 3 ci-dessous.

## Priorité 1 : la synchronisation entre appareils

**Coût : L (200k à 300k)**

C'est le problème que la mise en ligne vient de créer et il n'est pas dans
l'ancien backlog. Le site est maintenant accessible depuis le téléphone en
cuisine ET depuis le desktop. Mais les données vivent dans IndexedDB, qui est
par appareil : une extraction saisie sur le téléphone n'existera jamais sur le
desktop, et inversement. Tant que le site était en `file://` sur une seule
machine, la question ne se posait pas.

En pratique ça veut dire saisir sur le téléphone pendant l'extraction, puis
tout ressaisir sur le desktop pour avoir des graphiques complets. Personne ne
le fera, donc les données vont diverger et le suivi perdra son intérêt.

La bonne réponse est maintenant accessible : il y a déjà un Worker et une
authentification, donc un stockage côté serveur devient possible sans exposer
quoi que ce soit. Cloudflare D1 (SQLite, gratuit à cette échelle) ou KV pour
un simple document JSON par table. Le Worker ne sert les données qu'à une
session authentifiée, donc à toi.

Le vrai travail n'est pas le stockage, c'est la réconciliation : que se
passe-t-il si le téléphone était hors ligne et que le desktop a bougé entre
temps. Le moins coûteux et le plus honnête est un horodatage par ligne avec
"le plus récent gagne", plus un export CSV qui reste la sauvegarde de secours.
Le dossier lié par File System Access reste utilisable sur desktop, il devient
un miroir local plutôt que la source de vérité.

À noter : c'est la seule feature de ce backlog qui change l'architecture. À
faire avant les autres, sinon chaque feature suivante devra être migrée.

## Priorité 2 : PWA installable et Wake Lock

**Coût : S (40k à 70k)**

Débloqué par le passage en https, ça ne marchait pas en `file://` (les service
workers ne s'y enregistrent pas). Un manifest et un service worker suffisent
pour une icône sur l'écran d'accueil, un lancement plein écran et un
fonctionnement hors ligne garanti. Le site n'a aucune dépendance réseau, donc
le service worker est trivial : mettre en cache les huit fichiers et l'affaire
est réglée.

Le vrai gain est ailleurs : l'API Wake Lock, pour que l'écran du téléphone ne
s'éteigne pas pendant le chrono. Aujourd'hui l'écran se verrouille au milieu
d'une extraction et il faut le rallumer avec les mains mouillées. C'est le
défaut d'usage le plus concret du site.

Attention à une chose : un service worker qui met en cache la page de
connexion la servirait à la place de la redirection. Exclure `/login` et
`/logout` du cache.

## Priorité 3 : bouton de déconnexion et version affichée

**Coût : XS (15k à 25k)**

Deux détails que la mise en ligne rend nécessaires. La déconnexion n'existe
que comme URL `/logout` à taper à la main, ce qui est ridicule sur téléphone.
Et il n'y a aucun moyen de savoir quelle version tourne sur un appareil, ce
qui va devenir pénible dès le deuxième déploiement ("est-ce que le téléphone a
la correction ou pas"). Un numéro dans le pied de page, aligné sur le
changelog, règle la question.

Les deux tiennent dans la même passe : trois clés i18n et deux lignes de HTML.

## Priorité 4 : suivi du stock par sachet

**Coût : M (120k à 180k)**

Le site connaît le format du sachet et la dose de chaque extraction, il peut
donc afficher les grammes restants par café, alerter à "plus que 3 tasses" et
griser les cafés épuisés.

Ça règle aussi une vraie limite actuelle : un café racheté garde une seule
date de torréfaction, donc l'indicateur de fraîcheur ment dès le deuxième
sachet. Une table `achats` (cafe_id, date, format, prix, date_torrefaction)
remet le compteur à zéro et la fraîcheur devient celle du sachet en cours.

Coût gonflé par la migration : cinquième CSV, cinquième table, régénération de
la démo, et il faut décider quoi faire de l'historique existant (probablement
créer un achat implicite par café à sa date d'ajout).

## Priorité 5 : comparateur d'extractions

**Coût : S (60k à 90k)**

Sélectionner deux extractions dans l'historique et les afficher côte à côte,
champ par champ, différences surlignées. C'est exactement l'outil du test
croisé recommandé par le guide (même café dans les deux machines le même jour)
et il n'existe pas.

Bon rapport valeur sur effort : aucune donnée nouvelle, aucune migration, tout
est déjà en mémoire. C'est de l'affichage pur.

## Priorité 6 : insights automatiques sur le tableau de bord

**Coût : M (90k à 140k)**

Des phrases calculées, pas des graphiques en plus : "ta fenêtre de fraîcheur
optimale est 8 à 21 jours (note moyenne 8,1 contre 6,4 après)", "1.2.0 bat
1.1.0 de 1,3 point sur la Brikka", "le Chronicler's Sweet sort 0,8 point au
dessus du Classique sur les honey".

Trois ou quatre règles avec un seuil minimal d'échantillons suffisent.
Attention au piège : avec 7 extractions en base, toute corrélation est du
bruit. Ne rien afficher sous un seuil, et dire pourquoi plutôt que de laisser
une carte vide.

Coût surtout en rédaction bilingue : chaque insight est un gabarit à écrire en
FR et EN avec ses variables.

## Priorité 7 : recherche et filtres enrichis dans l'historique

**Coût : S (50k à 80k)**

Recherche plein texte commentaires compris, filtre par descripteur, par tasse,
par plage de notes. Le commentaire est aujourd'hui invisible dans le tableau,
une ligne dépliable le montrerait.

Devient nettement plus utile quand l'historique dépasse la centaine de lignes,
ce qui n'est pas encore le cas.

## Priorité 8 : corbeille et annulation

**Coût : S (40k à 60k)**

Une suppression d'extraction est définitive. Un toast "Supprimée, annuler"
pendant cinq secondes coûte peu et évite le drame du doigt qui glisse sur
téléphone, risque qui augmente maintenant que le site est sur mobile.

À grouper avec le remplacement des cinq `confirm()` et `alert()` natifs de
`app.js` : sur mobile ce sont des boîtes système moches qui cassent
l'impression d'application, et elles ne sont pas traduites par le mécanisme
i18n puisqu'elles sortent du DOM.

## Priorité 9 : radar des descripteurs par café

**Coût : S (50k à 80k)**

Sur la fiche café, un petit radar ou des barres des descripteurs les plus
cochés pour ce café. Répond à "ce café me donne quoi, en vrai, selon mes
propres notes" et confronte les `notes_annoncees` du vendeur à ton palais.

Chart.js fait le radar nativement, l'essentiel du travail est l'agrégation.
Comme les insights, ça demande un volume de données qui n'existe pas encore.

## Priorité 10 : mode préparation guidé, balance en main

**Coût : L (200k à 300k)**

Quand la balance arrivera : un mode plein écran pendant l'extraction qui
fusionne le chrono à paliers et les poids cibles, le poids à atteindre affiché
en très gros au moment de chaque versement ("verse jusqu'à 112 g"), le
prochain palier, les bips existants.

C'est le prolongement naturel du chrono et ça remplacerait avantageusement le
pas à pas de la page Référence pour l'exécution réelle. Placé bas parce que
sans balance, ça ne sert à rien : à remonter en priorité 2 le jour où elle
arrive.

## Priorité 11 : rapport hebdomadaire partageable

**Coût : M (80k à 120k)**

Une vue imprimable ou un PNG généré au canvas résumant la semaine : nombre de
tasses, meilleure tasse, réglage gagnant, caféine moyenne. Utile aussi pour
poster sur un groupe café. Confort pur, aucune urgence.

## À discuter, valeur non démontrée

| Sujet | Coût | Pourquoi ça attend |
|---|---|---|
| Profils d'eau (marque, TDS) | S | Le guide insiste sur l'eau au Vietnam, mais c'est une variable de plus à saisir à chaque extraction. À ne faire que si tu changes réellement d'eau. |
| Moments de la journée (matin, après-midi) | XS | Presque gratuit à calculer depuis l'heure. Intérêt à valider : est-ce que la première tasse du matin est vraiment mieux notée, ou juste bue avec plus d'enthousiasme. |
| Photos d'étiquettes | M | Alourdit vite IndexedDB et ne tient pas dans un CSV. Faisable en écrivant les images à côté des CSV dans le dossier lié, mais ça casse la portabilité mobile. |
| Import du récap Shopee | S | Séduisant mais fragile. Le site ne peut pas fetch une URL Shopee. À faire plutôt comme un parseur de texte collé, ce qui est beaucoup moins magique. |

## Dette technique

| Sujet | Coût | Note |
|---|---|---|
| Découper `app.js` (1813 lignes, environ 90 fonctions dans une seule IIFE) en modules par écran | M | Toujours en scripts classiques, sans bundler. Améliore la maintenabilité sans toucher à l'architecture. À faire AVANT la synchronisation serveur, pas après : ce sera plus facile sur du code déjà rangé. |
| Accessibilité | S | 60 boutons dans `index.html` pour seulement 12 attributs `aria-` ou `role`. Les pilules et tags sont bien de vrais boutons, mais il manque `aria-pressed` sur les bascules et un focus visible renforcé. Peu coûteux, bénéfice réel au clavier. |
| Tests versionnés | S | `worker/index.test.mjs` existe et couvre la porte d'entrée. Rien n'existe pour l'application elle même, alors que le patron Playwright est documenté. Un `npm test` documenté et trois scénarios (saisie, bascule EN, persistance après reload) suffiraient à sécuriser les livraisons. |
| Généraliser le bloc variantes | S | Le bloc Tetsu (versements pilotables) est codé en dur dans `TETSU`. Si une autre recette en veut un jour, définir les variantes dans la donnée recette plutôt que dans le code. Aucune urgence tant que le Tetsu est seul. |
| Icônes et manifest | XS | Un vrai jeu d'icônes plutôt que le favicon emoji en data URI. À faire en même temps que la PWA, priorité 2, sinon c'est du travail en double. |

## Recommandation d'ordre

Si l'objectif est que le site soit réellement utilisé au quotidien sur les
deux appareils, l'ordre qui rapporte le plus vite est : priorité 3 (XS, une
demi passe), puis priorité 2 (la PWA, qui rend l'usage en cuisine viable),
puis le découpage d'`app.js` (dette), et seulement ensuite la priorité 1 (la
synchronisation, qui est le gros morceau mais qui sera plus propre sur du code
rangé).

Tout le reste est du confort et peut attendre d'avoir assez de données pour
être intéressant. Avec 7 extractions en base, les insights et les radars
n'auront rien à dire.
