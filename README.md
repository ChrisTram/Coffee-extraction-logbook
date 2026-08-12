# Carnet d'extraction : Brikka et Switch

Site local, sans installation, sans serveur. Ouvre `index.html` dans Chrome et c'est tout.

Cinq écrans : Tableau de bord, Saisie, Historique, Référence (recettes, moulin, diagnostic, vocabulaire) et Guide (boutiques, quoi acheter, entretien, messages vietnamiens prêts à copier).

## Français ou anglais

Le bouton EN / FR dans l'entête bascule toute l'interface, y compris les pages Référence et Guide, les graphiques, les avertissements et les messages. Français par défaut, choix mémorisé. Les descripteurs et diagnostics sont traduits à l'affichage seulement : les valeurs stockées dans les CSV restent en français, donc tes données ne bougent pas d'un octet en changeant de langue. Le contenu de tes recettes et de tes cafés (noms, étapes, notes) est à toi, il s'affiche tel que tu l'as écrit. Toute la couche de traduction vit dans `js/i18n.js`.

## Démarrage rapide

1. Double clique sur `index.html` (ou glisse le dans Chrome).
2. Au premier lancement, trois choix :
   - **Créer un dossier de données** : choisis un dossier sur ton disque (par exemple un sous dossier `donnees` à côté du site). Le site y crée `cafes.csv` et `extractions.csv` avec tes 5 cafés de départ, puis y écrit à chaque ajout ou modification.
   - **Ouvrir un dossier existant** : reprends un dossier qui contient déjà ces deux fichiers.
   - **Charger la démonstration** : 65 extractions sur 6 semaines pour explorer le site.

## Lier le fichier CSV

Le bouton **Données** (en haut à droite) permet à tout moment de créer ou d'ouvrir un dossier de données. Une fois lié, un badge 📁 affiche son nom dans l'entête, et chaque enregistrement est écrit immédiatement dans les CSV. Chrome redemande la permission d'écriture au premier geste après chaque réouverture, c'est normal, c'est sa sécurité.

**Importer un CSV** et **Exporter en CSV** vivent dans ce même panneau Données, donc toujours à deux gestes maximum depuis n'importe quel écran. Je les ai regroupés là plutôt qu'en boutons permanents dans l'entête pour garder la place aux quatre onglets sur téléphone. L'historique a en plus son propre bouton d'export, qui respecte les filtres en cours.

Les CSV restent lisibles et éditables dans un tableur (Excel, LibreOffice, Google Sheets). Si tu les modifies à la main, rouvre le dossier via Données, Ouvrir un dossier existant, pour recharger.

## Basculer de la démonstration à tes vraies données

Deux façons :

- **Données, Créer un dossier de données** : abandonne la démo et repart sur tes 5 cafés de départ, zéro extraction, dans de vrais fichiers.
- **Données, Importer un CSV** : si tu as déjà tes propres fichiers, importe les un par un. Le site reconnaît tout seul s'il s'agit d'une table cafés ou extractions et remplace la table correspondante.

Le badge **Démo** dans l'entête disparaît dès que tu quittes le jeu de démonstration. Les fichiers du dossier `demo/` sont une copie de la démo embarquée, éditables au tableur si tu veux voir le format attendu.

## Tout s'édite dans l'interface, rien à bricoler à la main

- **Les cafés** : bouton Gérer les cafés depuis l'écran Saisie. Ajout, édition, activation.
- **Les recettes** : bouton Gérer les recettes depuis la page Référence, ou bouton Modifier sur chaque fiche. Tout est éditable, y compris les étapes du pas à pas (une par ligne, `0:45 texte` pour une étape minutée, `- texte` sinon). Les 7 recettes d'origine restent restaurables à leur version vérifiée en un clic, et les recettes personnelles s'ajoutent librement. Renommer une recette met à jour l'historique et les cafés qui la recommandent.
- Les recettes vivent dans un troisième fichier, `recettes.csv`, avec les deux autres.

Note : la mouture de la recette Brikka référence est réglée sur `1.5.0`, le compromis qui évite de retoucher la molette entre les deux machines. Le réglage optimal Brikka reste `1.2.0` (voir le bloc moulin), éditable en dix secondes dans Gérer les recettes.

## La saisie rapide

Le bouton flottant ☕ (en bas à droite) ouvre une saisie en trois gestes : café, recette, note. La date est mise à maintenant, la dose, l'eau, la température et la mouture reprennent la recette. Pour le détail (chrono, diagnostic, descripteurs), le lien Saisie complète est juste à côté.

## Champs obligatoires et cafés déjà moulus

Un seul champ est obligatoire en saisie, la dose, marquée d'une étoile rouge. Tout le reste est optionnel, y compris le café et la date (remplie à maintenant si absente).

Un café peut être marqué "déjà moulu" dans sa fiche (c'est le cas du Sáng Tạo 4 et du Bana G4). Dans ce cas le champ mouture se désactive et affiche "défaut paquet" : la molette ne s'applique pas, aucune valeur n'est stockée, et l'historique affiche "défaut paquet" à la place du réglage. Ces extractions n'apparaissent pas dans le nuage note contre mouture, ce qui est voulu : elles ne disent rien de ton réglage de moulin.

## Si la liaison de fichiers ne marche pas

L'API File System Access (liaison directe d'un dossier) existe dans Chrome et Edge. Firefox ne la propose pas, et Brave la désactive par défaut (activable dans brave://flags, chercher File System Access API). Le site le détecte, l'explique dans le panneau Données, et continue de fonctionner en mode navigateur : tout est conservé dans IndexedDB, avec Importer et Exporter CSV pour les sauvegardes.

## Les recettes v2 et la migration automatique

Les recettes ont été remplacées : deux Brikka (classique et flat white avec calcul du lait selon la tasse) et six Switch (Chronicler's, Sweet Variation, Costaud Bloom, Costaud Immersion, Tetsu Devil, Sherrycipe). L'historique existant est migré tout seul au premier chargement : Le Fruité devient The Coffee Chronicler's Recipe, Le Costaud devient Le Costaud (Bloom), L'Adoucisseur devient Le Costaud (Immersion), Le 4:6 de Tetsu devient The Tetsu Devil, et les deux anciennes Brikka fusionnent en Brikka classique. Les extractions de l'ancienne recette Le Complet, supprimée sans remplaçante, gardent leur nom dans l'historique. Les recettes personnelles ne sont pas touchées.

Le champ volume s'appelle désormais volume_extrait_ml (l'ancien volume_tasse_ml est lu automatiquement), et trois champs s'ajoutent : eau_ajoutee_ml (Brikka, eau d'allongement, hors ratio), lait_ml (flat white), agitation_nb et tasse. Les tasses vivent dans tasses.csv, éditables depuis la saisie.

## Les variantes de recettes

Sur la page Référence, les recettes d'une même famille partagent une carte avec une bascule de variante : The Coffee Chronicler's Recipe (Classique ou Sweet), Le Costaud (Bloom ou Immersion), et la Brikka au lait (Flat white ou Cappuccino). Ce sont bien des recettes distinctes en base et dans l'historique, avec la variante entre parenthèses dans le nom, donc les statistiques par recette restent séparées.

## Le chronomètre

Un seul chrono : Démarrer, Pause, Reprendre (à volonté), Arrêter et reporter, Remettre à zéro. Les paliers de la recette sélectionnée s'affichent dessous (étape en cours en gros, suivante en petit avec décompte) avec un bip doux à chaque palier, coupable d'une case. L'écoulement se déduit tout seul : du palier "ouvrir" à l'arrêt du chrono.

## Cafés non purs

Chaque café porte un pourcentage de café réel (ligne thành phần de l'étiquette). En dessous de 100, le café reçoit une pastille rouge, il est interdit de Switch (enregistrement refusé, le papier retiendrait le soja, le sucre et les graisses), et le coût par tasse affiche une seconde valeur rapportée au café réel. Le Sáng Tạo 4 est à 82 pour cent, le Balanced est l'étalon de référence (barre verte dans le graphique par café).

## Base de conversion

Tout le site calcule en 8,32 microns par cran (diagramme officiel Timemore), soit 416 microns par rotation et une butée à 1248 microns. Le diagramme officiel est reconstruit en SVG sur la page Référence, avec les 13 méthodes, les bandes de granulométrie, la zone hachurée hors de portée et tes quatre marqueurs.

## Pendant la saisie complète

Un panneau latéral affiche en permanence la recette sélectionnée (paramètres, étapes, accès au pas à pas) et la fiche du café (profil, notes annoncées, recommandations, prix au gramme, âge depuis la torréfaction avec la fenêtre de fraîcheur). La température est optionnelle : sans thermomètre, une eau tout juste bouillie qui a fini de buller est autour de 95 degrés. Le volume en tasse propose une estimation cliquable calculée depuis l'eau, la dose et la méthode (le papier du Switch retient environ 2 g d'eau par gramme de café, la Brikka nettement moins).

## Diagnostic et descripteurs : pourquoi deux champs séparés

Le diagnostic répond à "qu'est ce que je corrige" (un seul choix, avec la correction associée affichée), les descripteurs répondent à "qu'est ce que je goûte" (multi-sélection, organisée selon les familles de la roue des saveurs SCA). Les fusionner rendrait l'anneau des diagnostics illisible : il mesure la santé de tes extractions, pas tes goûts. Le coût du mois a laissé sa place à une estimation de caféine par jour (calculée depuis la dose et l'espèce : arabica environ 1,2 pour cent, robusta 2,4, blend 1,8, liberica 1,4, dont environ 90 pour cent passent dans la tasse).

## Choix d'architecture, et pourquoi

- **Trois CSV plutôt qu'un seul avec champ type** : les tables n'ont aucune colonne en commun. Un fichier unique aurait mélangé les schémas, avec des colonnes vides partout, pénible à éditer au tableur. Des fichiers propres, c'est aussi plus simple à ouvrir dans Excel sans se tromper.
- **Liaison d'un dossier plutôt que de deux fichiers séparés** : un seul geste au lieu de deux, et le site retrouve les deux fichiers par leur nom. C'est l'API File System Access (Chrome, Edge). La copie de travail dans IndexedDB reste toujours à jour, donc rien n'est perdu si le dossier n'est pas lié ou si la permission expire.
- **Chart.js embarqué dans `js/vendor/`** au lieu d'un CDN : le site marche sans connexion, en cuisine, sur téléphone en partage de fichiers. La heatmap calendaire et la réglette des moutures sont en SVG maison, car aucune librairie légère ne les fait bien.
- **Démo embarquée en JS** (`js/demo-data.js`) en plus des CSV du dossier `demo/` : Chrome bloque la lecture de fichiers locaux par `fetch` en `file://`, la démo doit donc vivre dans le code pour se charger en un clic.
- **La méthode colore tout** : Brikka en bleu `#2a78d6`, Switch en orange `#eb6834`, les deux machines en vert `#1baf7a`, dans tous les graphiques, chips et pastilles. Ces couleurs sont validées daltonisme et ne changent pas entre les thèmes.
- **Écrans fusionnés** : recettes, réglage du moulin, diagnostic du goût et vocabulaire vivent dans une seule page Référence avec un sommaire ancré, plus agréable à faire défiler sur téléphone pendant la préparation qu'une navigation à tiroirs.
- **Le convertisseur et la saisie partagent le même moteur** (`js/grind.js`) : une seule table de plages, une seule formule, aucune divergence possible entre l'avertissement de saisie et la page de référence.

## Petits plus non demandés

- Duplication d'une extraction en un clic depuis l'historique, pour refaire la même.
- Le mode pas à pas du 4:6 de Tetsu se recalcule selon les variantes choisies (découpage du premier 40 pour cent, nombre de versements du dernier 60 pour cent).
- Le coût de la tasse s'affiche en direct pendant la saisie, dès que le café a un prix et un format.
- Bascule sombre et clair mémorisée, tons café dans les deux thèmes.
- La page Guide reprend du guide d'origine les boutiques, le récapitulatif d'achat avec liens, les règles d'achat, l'entretien du matériel et les messages vietnamiens, chacun avec un bouton Copier.

## Structure du dossier

```
tracker/
  index.html          la page unique
  css/styles.css      styles, thèmes sombre et clair
  js/grind.js         conversions du moulin (dial, crans, microns, plages)
  js/recettes.js      recettes et cafés de départ, règles d'avertissement
  js/data.js          CSV, IndexedDB, File System Access
  js/charts.js        graphiques Chart.js, heatmap et réglette SVG
  js/app.js           l'application (écrans, saisie, historique, gestion)
  js/demo-data.js     la démo embarquée
  js/vendor/chart.umd.js   Chart.js 4.4.4, local, aucune dépendance réseau
  demo/               les mêmes données de démo en CSV éditables
  tools/gen_demo.py   le générateur de la démo, pour la refaire un jour
```

Sauvegarde : le dossier de données lié contient tout ce qui t'appartient. Le copier, c'est sauvegarder.
