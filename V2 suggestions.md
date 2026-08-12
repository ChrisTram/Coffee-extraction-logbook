# V2 suggestions : audit et pistes d'amélioration

Backlog proposé après audit du site en l'état (v7). Rien ici n'est commencé.
Classé par rapport valeur sur effort, du point de vue d'un usage quotidien en
cuisine, au Vietnam, sur téléphone et desktop.

## Priorité haute : gros gain, effort raisonnable

### 1. PWA installable et hors ligne garanti
Un manifest et un service worker transformeraient le site en application
installable sur le téléphone (icône sur l'écran d'accueil, plein écran, plus
d'onglet Chrome à retrouver en cuisine). Le site est déjà 100 pour cent local
donc le service worker est trivial. Bonus important : l'API Wake Lock pour
que l'écran ne s'éteigne pas pendant le chrono. Limite à connaître : en PWA
servie par service worker, l'API File System Access continue de marcher, mais
il faudra vérifier le comportement en file:// pur (les service workers ne s'y
enregistrent pas, il faudrait un mini serveur local ou un hébergement statique
type GitHub Pages, ce qui collerait bien avec le nouveau repo git).

### 2. Suivi du stock par sachet
Le site connaît le format du sachet et la dose de chaque extraction : il peut
donc afficher les grammes restants par café, une alerte "plus que 3 tasses",
et griser les cafés épuisés. Nécessite une notion d'achat (date d'achat ou de
réouverture de sachet) pour remettre le compteur à zéro, ce qui réglerait
aussi une limite actuelle : un café racheté garde une seule date de
torréfaction. Table `achats` (cafe_id, date, format, prix, date_torrefaction)
et la fraîcheur deviendrait celle du sachet en cours.

### 3. Mode préparation guidé (balance en main)
Quand la balance arrivera : un mode plein écran pendant l'extraction qui
fusionne le chrono à paliers et les poids cibles, avec le poids à atteindre
affiché en très gros au moment de chaque versement ("verse jusqu'à 112 g"),
le prochain palier, et les bips existants. C'est le prolongement naturel du
chrono actuel, et ça remplacerait avantageusement le mode pas à pas de la
page Référence pour l'exécution réelle.

### 4. Comparateur d'extractions (test croisé)
Sélectionner deux extractions dans l'historique et les afficher côte à côte,
champ par champ, différences surlignées. C'est exactement l'outil du test
croisé recommandé par le guide (même café dans les deux machines le même
jour) et il n'existe pas encore.

## Priorité moyenne : de la valeur, un peu plus de travail

### 5. Insights automatiques sur le tableau de bord
Des phrases calculées, pas des graphes en plus : "ta fenêtre de fraîcheur
optimale est 8 à 21 jours (note moyenne 8,1 contre 6,4 après)", "1.2.0 bat
1.1.0 de 1,3 point sur la Brikka", "le Chronicler's Sweet sort 0,8 point au
dessus du Classique sur les honey". Trois ou quatre règles simples avec seuil
minimal d'échantillons suffisent, l'affichage en petites cartes.

### 6. Radar des descripteurs par café
Sur la fiche café (ou au survol dans le tableau de bord), un petit radar ou
des barres des descripteurs les plus cochés pour ce café. Répond à "ce café
me donne quoi, en vrai, selon mes propres notes" et confronte les
notes_annoncees du vendeur à ton palais.

### 7. Recherche et filtres enrichis dans l'historique
Recherche plein texte (commentaires compris), filtre par descripteur, par
tasse, par plage de notes. Le commentaire est aujourd'hui invisible dans le
tableau : une ligne dépliable par extraction le montrerait.

### 8. Corbeille et annulation
Une suppression d'extraction est définitive. Un toast "Supprimée, annuler"
pendant cinq secondes coûte peu et évite le drame du doigt qui glisse sur
téléphone.

### 9. Rapport hebdomadaire partageable
Une vue imprimable (ou un PNG généré via canvas) résumant la semaine :
nombre de tasses, meilleure tasse, réglage gagnant, caféine moyenne. Utile
aussi pour poster sur un groupe café.

## Priorité basse ou à discuter

### 10. Profils d'eau
Table des eaux en bouteille utilisées (marque, TDS) et champ eau sur
l'extraction. Le guide insiste beaucoup sur l'eau au Vietnam, mais c'est une
variable de plus à saisir : à ne faire que si tu changes réellement d'eau.

### 11. Moments de la journée
Tag matin/après-midi déductible de l'heure, croisé avec les notes : est-ce
que la première tasse du matin est systématiquement mieux notée ? Presque
gratuit à calculer, intérêt à valider.

### 12. Photos d'étiquettes
Joindre une photo (étiquette thành phần, sachet) à un café. En stockage
local pur ça alourdit vite IndexedDB et ça ne tient pas dans un CSV : à
réserver à une éventuelle version avec dossier de données (fichiers images à
côté des CSV, c'est faisable avec l'API actuelle).

### 13. Import direct du récap Shopee
Coller une URL ou un texte de commande Shopee pour préremplir un café. Séduisant
mais fragile (le site ne peut pas fetch en file://), à faire plutôt comme un
petit parseur de texte collé.

## Dette technique et qualité

- Découper app.js (environ 1500 lignes) en modules par écran (saisie.js,
  tableau.js, historique.js, reference.js), toujours en scripts classiques
  concaténables. Améliore la maintenabilité sans changer l'architecture.
- Suite de tests Playwright versionnée dans le repo (les tests actuels
  vivaient hors du dossier livré) avec un `npm test` documenté.
- Un `manifest.json` d'icônes même sans PWA complète, pour un favicon propre
  et un nom d'application correct.
- Accessibilité : les pilules et tags sont des boutons, c'est bien, mais un
  passage ARIA (aria-pressed sur les toggles, focus visible renforcé) serait
  peu coûteux.
- Le champ `variantes` (bloc Tetsu) est un cas spécial codé en dur : si un
  jour une autre recette veut des versements pilotables, généraliser le
  mécanisme (définir les variantes dans la donnée recette plutôt que dans
  TETSU).
- Envisager un numéro de version affiché dans le pied de page, alimenté par
  le changelog de DOCUMENTATION.md, pour savoir en un coup d'oeil quelle
  version tourne sur le téléphone.
