# Backlog : audit et pistes d'amélioration

Audit refait le 14 août 2026, après la mise en ligne, la synchronisation et une
première semaine d'usage réel. Rien ici n'est commencé.

## Comment lire les estimations

La colonne coût est une estimation en tokens du budget de conversation nécessaire
pour livrer la chose proprement, doc et tests compris. Ordre de grandeur, pas
devis.

| Repère | Tokens | À quoi ça ressemble |
|---|---|---|
| XS | 10k à 30k | Un fichier touché, une poignée de lignes |
| S | 30k à 80k | Deux ou trois fichiers, quelques clés i18n |
| M | 80k à 180k | Un écran ou un mécanisme entier |
| L | 180k à 350k | Nouveau modèle de données ou nouveau backend |
| XL | 350k et plus | Refonte structurelle, à découper avant de lancer |

Trois choses gonflent le coût ici, indépendamment de la difficulté technique : la
double langue (toute chaîne visible en FR et EN, au fragment près), la
compatibilité CSV (tout changement de schéma demande une migration idempotente),
et la doc à jour à chaque livraison.

## Déjà fait, ne pas reproposer

Déploiement privé (Workers, mot de passe, session 30 jours), synchronisation
entre appareils (D1), PWA installable et Wake Lock, insights automatiques,
stock par sachet, calendrier lisible avec statistiques, classement des goûts par
descripteur, numéro de version, brouillon de saisie, durées en minutes et
secondes, puissance de feu, diagnostics groupés avec aide au survol, recette
d'eau préchauffée séparée, détail dépliable dans l'historique, comparateur de deux
extractions, régularité en écart moyen, écran Mes meilleurs réglages par café,
ratio propre à chaque machine avec explication au survol, écran Paramètres.

## Le constat qui oriente ce backlog

**Tu enregistres 22 champs par extraction et le site t'en montre 8.** L'historique
a huit colonnes, le tableau de bord six graphiques. Tout ce qui a été ajouté
récemment, puissance de feu, temps d'écoulement, sachet, n'est visible nulle part
après la saisie.

Et surtout : **tu fais des tests croisés à la main.** Préchauffé contre standard,
1.2.0 contre 1.3.0, et je te répète à chaque fois de ne changer qu'une variable.
Le site ne t'aide pas du tout là-dessus, alors que c'est devenu ton usage
principal. Les priorités 1 et 2 partent de là.

## Priorité 1 : mode test croisé guidé

**Coût : M (100k à 150k)**

Tu déclares ce que tu testes (la mouture, la puissance de feu, le préchauffage),
le site FIGE tout le reste pour les prochaines tasses : même café, même dose,
même recette, préremplis et signalés si tu y touches. Il compte les tasses de
chaque côté et annonce le verdict quand il y en a assez, avec les mêmes garde-fous
que les insights (3 tasses minimum par côté, 0,4 point d'écart).

C'est la formalisation de ce que tu fais déjà en te fiant à ta mémoire. Trois
bénéfices concrets : plus d'expérience gâchée parce que deux variables ont bougé,
plus besoin de te souvenir de ce que tu testais il y a quatre jours, et un verdict
chiffré au lieu d'une impression.

Aucun nouveau champ de données : un test est un objet léger en localStorage
(variable testée, valeurs figées, date de début), il n'a même pas besoin d'être
synchronisé.

## Priorité 2 : le temps de cuisson

**Coût : S (40k à 60k)**

Le calcul le plus utile de ta Brikka n'existe pas : **temps total moins temps
d'écoulement**, c'est-à-dire la durée pendant laquelle la mouture chauffe sans
que rien ne la traverse. C'est ce chiffre qui explique un goût brûlé, pas le temps
total.

Ajouter `temps_cuisson_s` en champ CALCULÉ (jamais stocké, comme le ratio), le
montrer en saisie sous le chrono, dans l'historique, et en faire un nuage note
contre temps de cuisson. Plus une règle d'insight : "au dessus de 3 minutes de
cuisson, tes notes chutent de X points".

À faire en même temps : un avertissement si l'écoulement dépasse le temps total,
qui est impossible et signale une faute de frappe.

Petit prérequis honnête : tes 11 extractions ont un temps d'écoulement vide. Le
graphique sera vide jusqu'à ce que tu remplisses les deux champs, ce que le
message de carte vide dira.

## Priorité 3 : corbeille et annulation

**Coût : S (40k à 60k)**

Une suppression d'extraction est définitive. Un toast "Supprimée, annuler"
pendant cinq secondes coûte peu et le risque a augmenté depuis que le site tourne
en PWA sur téléphone, en cuisine.

À grouper avec le remplacement des cinq `confirm()` et `alert()` natifs de
`app.js` : sur mobile ce sont des boîtes système qui cassent l'impression
d'application, et elles ne passent pas par la couche i18n donc elles restent en
français en mode anglais.

## Priorité 4 : ce que ça te coûte

**Coût : S (50k à 80k)**

Le coût par tasse est calculé mais affiché nulle part depuis que la caféine a
pris sa place dans les KPI. Avec la table des achats, on peut maintenant faire
mieux : dépense du mois, coût moyen par tasse, et le coût réel par tasse des cafés
non purs, qui est nettement plus élevé qu'il n'y paraît.

Utile au Vietnam où tu compares des sachets à des prix très différents.

## Priorité 5 : radar des descripteurs par café

**Coût : S (50k à 80k)**

Le classement des goûts est global. Par café, il répondrait à "ce sachet me donne
quoi, selon mes propres notes" et confronterait les `notes_annoncees` du vendeur
à ton palais. À faire quand un café aura une quinzaine de tasses.

## Priorité 6 : rapport hebdomadaire partageable

**Coût : M (80k à 120k)**

Vue imprimable ou PNG résumant la semaine. Confort pur, aucune urgence.

## À discuter, valeur non démontrée

| Sujet | Coût | Pourquoi ça attend |
|---|---|---|
| Profils d'eau (marque, TDS) | S | Une variable de plus à saisir à chaque tasse. À ne faire que si tu changes réellement d'eau. |
| Photos d'étiquettes | M | Alourdit IndexedDB, ne tient pas dans un CSV, et il faudrait décider si ça passe par la synchro. |
| Import du récap Shopee | S | Le site ne peut pas fetch Shopee. Faisable en parseur de texte collé, beaucoup moins magique. |
| Rappel de rinçage après un café gras | XS | La recette le dit déjà. Un rappel à chaque enregistrement deviendrait vite un reproche. |
| Suggestion automatique du diagnostic | M | Deviner le diagnostic à partir des temps et du ratio serait souvent faux, et un diagnostic faux entraîne une correction fausse. Ton palais tranche mieux. |

## Dette technique

| Sujet | Coût | Note |
|---|---|---|
| Découper `app.js` (2849 lignes, une seule IIFE) | M | En modules par écran, toujours en scripts classiques concaténables. C'est devenu le vrai frein : chaque ajout se cherche une place dans un fichier qui a doublé. À faire AVANT la priorité 1. |
| Accessibilité | S | 63 boutons pour 14 attributs `aria` ou `role`. Il manque `aria-pressed` sur les bascules (pilules, tags, méthode) et un focus visible renforcé. Peu coûteux, bénéfice réel au clavier. |
| Tests d'interface | M | Contrainte découverte le 14 août : le panneau navigateur de l'agent sert les fichiers en `data:`, donc la feuille de style n'est jamais chargée ET IndexedDB n'existe pas. Aucun test d'interface fiable n'est possible par ce chemin, il faut un vrai serveur local ou un Playwright installé. `tools/data.test.mjs` couvre déjà la couche de données sans navigateur. |
| Généraliser le bloc variantes | S | Le bloc Tetsu est codé en dur dans `TETSU`. À généraliser si une autre recette veut des versements pilotables. |
| `styles.css` à 1460 lignes | S | Commence à mériter un découpage par écran, ou au moins des sections mieux marquées. |

## Recommandation d'ordre

**Découper `app.js` d'abord.** Il dépasse 2500 lignes et c'est devenu le vrai
frein. Le nouvel écran des réglages a été mis dans son propre fichier
(`js/reglages.js`) précisément pour ne pas aggraver, mais ce n'est qu'un
contournement.

Puis la priorité 2, courte, qui répond à la question du moment sur la Brikka.
Puis la priorité 1, la grosse pièce et la plus utile à terme.

La priorité 3 peut s'intercaler à tout moment, elle ne dépend de rien.

Le radar par café gagne à attendre : avec 11 extractions il se taira plus souvent
qu'il ne parlera. Même remarque pour l'écran des réglages qui vient d'être livré,
il dira surtout "refais le même réglage encore une fois" pendant quelques
semaines, et c'est le comportement voulu.
