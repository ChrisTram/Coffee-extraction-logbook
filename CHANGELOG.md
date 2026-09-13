# Changelog : Carnet d'extraction

Une ligne par version, la plus récente en premier. Le numéro affiché dans le pied
de page du site est celui du `<meta name="app-version">` d'`index.html`, posé
par `node tools/bump_version.mjs X`. Chaque entrée dit CE QUI a changé ; le
pourquoi est dans `DECISIONS.md`.

- v7.93 : la température du Switch se déduit du temps passé par la bouilloire
  sur le feu, saisi en minutes et secondes à la place du menu « petites bulles,
  frémissement » : montée linéaire de 28 à 100 °C au temps d'ébullition de la
  bouilloire, nouveau réglage synchronisé (Paramètres, carte Ma bouilloire, 4:00
  par défaut). Le degré estimé reste modifiable et reste la valeur stockée ; le
  temps est stocké aussi (colonne `chauffe_s`, visible dans le détail de
  l'historique), et l'aide dit combien de temps viser pour la cible de la
  recette. Rien ne change pour la Brikka, qui part à l'eau froide. Au passage
  le brouillon de saisie sort dans `ui-brouillon.js` : `ui-saisie.js` repassait
  le plafond de 1 200 lignes.
- v7.92 : deux recettes Switch de percolation pure, en deuxième et troisième
  positions : Better 1 Cup (James Hoffmann, 15 g / 250 g, cinq versements) et
  One and Done (Lance Hedrick, 15 g / 225 g, deux blooms puis un versement).
  Les étiquettes des recettes suivantes se décalent (pas de schéma v9), et
  l'ordre d'affichage des recettes d'origine suit désormais la graine à chaque
  chargement. La fiche des procédés du Guide gagne le détail du lavé, les trois
  teintes de honey, les risques du natural, l'anaerobic en tasse, le co-ferment,
  le décaféiné et une correspondance procédé vers recette, en français et en
  anglais.
- v7.91 : la bascule « inclure les ratées dans les analyses » quitte le bandeau
  du tableau de bord pour l'écran Paramètres, section Cet appareil, avec le
  compte des tasses écartées. Et la saisie rapide enregistre SANS note par défaut,
  comme le formulaire complet : case « pas encore notée » cochée à chaque
  ouverture, curseur à 5 et grisé, toucher le curseur décoche.
- v7.90 : un changement d'écran dans un document caché (onglet en arrière-plan,
  fenêtre réduite) s'applique tout de suite au lieu d'attendre une occasion de
  rendu qui ne vient pas, et les promesses d'une transition de vue interrompue
  sont attrapées : plus de « Uncaught (in promise) » à chaque bascule rapide.
  Trouvé en pilotant le site depuis une fenêtre masquée.
- v7.89 : la documentation est découpée en trois. `DOCUMENTATION.md` ne garde
  que ce qui existe et comment ça tient (900 lignes et 55 Ko au lieu de 2 500 et
  146 Ko),
  `DECISIONS.md` reçoit mot pour mot les sections de raisonnement, classées par
  thème, et `CHANGELOG.md` l'historique trié. `START-HERE.md` demande de lire la
  première en entier et la deuxième pour la zone touchée seulement : environ
  30 000 tokens de moins par session. `AUDIT.md` (27 août, soldé) est remplacé
  par l'audit du 6 septembre. Règle de limitation de débit sur `/login`
  documentée (section 13).
- v7.88 : hygiène CSS et fluidité au doigt. Trois classes mortes retirées, les
  cinq dernières couleurs en dur passent par deux variables (`--sur-accent`,
  `--encre-sur-clair`), les sept `z-index` deviennent une échelle nommée, et
  quatre `!important` disparaissent au profit de la spécificité (ne restent que
  `[hidden]` et le mouvement réduit, légitimes). Sur téléphone, les champs
  passent à 16 px pour qu'iOS ne zoome plus à chaque focus, et tirer vers le bas
  en haut de page ne recharge plus l'application installée.
- v7.87 : `data.js` découpé en six fichiers. La dernière IIFE géante du site
  (1 417 lignes, six métiers) devient `data-csv.js` (format CSV, pur),
  `data-schema.js` (colonnes, normalisation, semences, pur), `data-store.js`
  (IndexedDB, File System Access, téléchargement), `data-calculs.js` (champs
  dérivés et sachets, lecture seule, lié à l'état par `pour(state)`),
  `data-migrations.js` (version de schéma et rattrapages, même mécanisme) et un
  `data.js` de 590 lignes qui possède l'état, les mutations, la synchro et le
  démarrage. La façade `DATA` expose les mêmes noms qu'avant. Le plafond de
  1 200 lignes s'applique désormais à toutes les couches, plus seulement à
  l'interface. Les 374 tests de la couche de données passent sans changement
  autre que la liste des fichiers chargés.
- v7.86 : chaque écran câble ses propres contrôles. `cabler()` dans `app.js`
  faisait 401 lignes et posait 95 écouteurs ; il en reste une soixantaine pour
  la navigation, le thème, la langue, les modales d'accueil et de données et les
  réflexes globaux, et chaque `ui-*.js` expose son `cablerX()`. Le panneau de
  saisie rapide quitte `ui-saisie.js` pour `ui-rapide.js` : il n'en partageait
  ni l'état ni le formulaire. Le test de frontières refuse tout identifiant
  d'écran dans `app.js` et plafonne le fichier à 450 lignes.
- v7.85 : garde-fou de taille sur la synchro. Tout l'état vit dans une seule
  ligne D1, plafonnée à 2 000 000 octets : le serveur renvoie désormais la
  taille du document et ce plafond à chaque échange, et le panneau Données
  prévient passé 50 pour cent, assez tôt pour archiver l'historique avant que
  l'écriture échoue d'un coup. Test de `handleSync` sur une fausse base D1.
- v7.84 : accessibilité et confort au doigt. Les 47 titres du Guide passent de
  h4 à h3 (plus de saut de niveau après un h2), six seconds champs de paires
  (minutes et secondes, agitation, eau ajoutée, tasse) reçoivent une étiquette de
  lecteur d'écran traduite, les icônes d'entête gagnent une zone d'appui de 44 px
  sans changer de taille, le mode contraste forcé garde un trait sur les états
  actifs, et les boutons ne déclenchent plus ni zoom au double appui ni halo
  gris au tap. Manifeste PWA : un `id` stable et deux raccourcis d'appui long
  (Saisie, Historique). Trois tests : champs nommés, titres sans saut,
  manifeste valide et raccourcis qui visent des écrans existants.
- v7.83 : les quatre `confirm()` natifs restants (démo par dessus des données,
  repartir de zéro, rétablir une recette, supprimer une recette) passent par
  `UI.confirmer`, un `<dialog>` de la page : traduit, au thème, le choix sûr a le
  focus, Échap annule. Un test refuse tout `confirm()` natif dans l'interface.
- v7.82 : les fichiers de code portent leur version dans l'URL (`?v=7.82`), le
  Worker les sert avec un cache d'un an, et seule `index.html` se revalide encore
  à chaque ouverture : une ouverture à chaud ne fait plus qu'une requête au lieu
  de seize. La version vit dans `<meta name="app-version">`, `app.js` la lit, le
  service worker la porte et jette les anciennes URL à l'activation.
  `node tools/bump_version.mjs X` écrit tout, un test refuse toute divergence.
- v7.81 : les fonctions pures partagées (moyenne, clé de jour locale) quittent
  leurs trois copies pour `js/outils.js`, premier script de la page ; la moyenne
  d'une liste vide renvoie null partout au lieu de NaN dans un fichier sur deux.
  Le cache local de wrangler (identifiant de compte) sort du dépôt et des assets,
  un test le verrouille. README remis à jour sur la structure des fichiers.
- v7.80 : le lait est décrit de la même façon dans la recette, le panneau latéral
  et la saisie. Entrée reconstituée depuis le message de commit.
- v7.79 : les deux chiffres de lait (flat white et cappuccino) se calculent sur
  la même base. Entrée reconstituée depuis le message de commit, la ligne de
  changelog avait été oubliée.
- v7.78 : les deux recettes Brikka au lait fusionnent, et le lait s'affiche en
  chiffres pour le flat white ET le cappuccino.
- v7.77 : cliquer une ligne d'historique ouvre l'extraction, et cinq champs de
  la saisie gagnent un curseur.
- v7.76 : la case ratée rejoint la NOTE. Rangée parmi les options d'extraction,
  elle était introuvable.
- v7.75 : la bascule ratée passe dans la ligne d'historique, un clic. La case du
  formulaire ne servait qu'à la saisie du jour.
- v7.74 : une extraction peut être marquée RATÉE. Badge, filtre dans
  l'historique, et exclusion des analyses avec un bandeau pour les réintégrer.
- v7.73 : la Brikka se remplit à l'eau froide, et un conseil de mouture ne
  renvoie plus dans le sens du défaut. Deux fiches de guide sur la torréfaction à
  l'extraction et sur l'eau des deux machines.
- v7.72 : une nouvelle saisie arrive avec un café déjà choisi, le premier actif
  de la liste. Le panneau rapide aussi.
- v7.71 : l'historique gagne quatre colonnes, dose et eau, temps, température et
  feu, et s'élargit pour les recevoir. Les mêmes informations que la carte des
  cinq dernières extractions.
- v7.70 : le vert émeraude quitte les graphiques. « Les deux machines » passe au
  rose-violet d'Okabe-Ito, et le vert de « bon » devient une sauge.
- v7.69 : le commentaire d'une tasse s'affiche au survol de sa ligne dans les
  cinq dernières. Et l'appui long ne sélectionne plus ce qu'il devait seulement
  expliquer.
- v7.68 : les cinq dernières extractions montrent leurs MESURES, ratio en tête,
  sur une deuxième ligne.
- v7.67 : une nouvelle saisie porte l'heure qu'il est, et plus celle de la tasse
  précédente.
- v7.66 : cliquer sur Saisie n'ouvre plus jamais une ancienne extraction. La
  barre de recherche de l'historique est enfin habillée, ses boutons d'action
  prennent leur propre ligne, et la courbe des grammes quitte le graphique
  principal pour l'infobulle.
- v7.65 : le mode anglais devient complet. Les infobulles, les étiquettes de
  lecteur d'écran et six fonds de champ restaient en français ; ils passent
  maintenant par le dictionnaire, et un test refuse tout attribut sans traduction.
- v7.64 : trois corrections. Le champ de recherche de l'historique était écrit
  deux fois avec le même identifiant ; le bouton EN ne traduisait plus le texte
  statique de la page quand on démarrait en français ; les fonds de champ
  traduits ne s'affichaient pas.
- v7.63 : la tendance et les grammes du graphique principal ont enfin chacune
  leur couleur. Elles partageaient le vert des deux machines, criard sur une
  palette chaude et surtout identique pour deux séries sans rapport.
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
- v7.34 : le carnet ne refuse plus aucune saisie, le blocage rang bơ et café non
  pur en Switch est parti (section 8 quinquies). Liste déroulante de méthode de
  chauffe qui remplit la température (section 7 quater).
- v7.33 : un formulaire vierge suit enfin la recette. Deux bugs empilés
  empêchaient les valeurs par défaut d'arriver, voir la section 6 decies. Le champ
  température perd son fond "93".
- v7.32 : la navigation ne garde que TROIS onglets à texte, un septième la faisait
  passer à la ligne sous la page. Réglages, Guide et Paramètres deviennent des
  icônes dans les outils d'entête. L'écran reference fusionne dans guide. L'écran
  Paramètres reçoit une colonne de lecture bornée au lieu de s'étaler sur 1180 px.
- v7.31 : audit complet, fait sur les données réelles de
  production. Deux bugs corrigés au passage. `sw.js` ne précachait ni
  `js/sync.js` ni `js/reglages.js`, tous deux chargés par index.html : hors
  ligne, SYNC et REGLAGES n'existaient pas et l'application cassait au démarrage.
  Un test compare désormais la liste du service worker aux balises script.
  Et trois recettes Brikka stockées portaient une puissance de feu vide.
- v7.30 : Paramètres passe en icône d'engrenage à droite de l'entête, un
  septième onglet texte faisait passer la nav à la ligne. Feu par défaut à 2.
  Surtout : les recettes STOCKÉES rattrapent enfin les valeurs semées
  (150 g de chaudière, plus de température cible, feu à 2), sans quoi changer
  RECETTES_DEPART ne change rien pour une installation existante.
- v7.29 : le ratio a DEUX logiques, une par machine, et s'explique au survol
  (section 6 nonies). Nouvel écran Paramètres, qui édite les recettes plutôt que
  d'ouvrir un second magasin de défauts (section 6 decies). Les recettes Brikka
  n'imposent plus de température et préremplissent 150 g. Le champ puissance de
  feu manquait au formulaire de recette : l'éditer effaçait la valeur.
  DOCUMENTATION.md contenait trois copies de lui-même, retirées.
- v7.28 : retrait de l avertissement de débordement de tasse. Il supposait un
  service en une seule fois et se déclenchait à tort dès qu on verse en deux.
- v7.27 : "Acide ET amer (extraction inégale)" sort du groupe des réglages pour
  son propre groupe "Répartition dans le panier", et une alerte apparaît si les
  deux familles opposées sont cochées séparément, ce qui produisait deux
  corrections contradictoires. Sa correction couvre maintenant les deux machines
  (l'ancienne parlait de verser en spirale, sans sens sur une Brikka). Les lignes
  des 5 dernières extractions ouvrent l'édition, au clic comme au clavier.
- v7.26 : vocabulaire de dégustation complété, groupe "Acidité" (acidité vive,
  acidulé, aigre, citronné, vinaigré), astringence et texture (astringent, rugueux,
  aqueux) dans Corps et texture, défauts rance et phénolique. 69 descripteurs, tous
  avec nom et définition en FR et EN. Puissance de feu par défaut à 4 au lieu de 3,
  y compris une reprise unique des recettes Brikka déjà stockées, sans quoi la
  recette aurait continué à préremplir 3. L'historique garde 3
  (PUISSANCE_FEU_HISTORIQUE), on ne réécrit pas le passé.
- v7.25 : correction d'une TypeError qui vidait tout le tableau de bord
  (`$` au lieu de `$$` ligne 516, avalée par le try/catch de notifier), du
  manifeste PWA que la porte d'entrée redirigeait vers /login faute de cookie
  (`crossorigin="use-credentials"`, la PWA n'était donc pas installable), et de la
  balise `apple-mobile-web-app-capable` dépréciée. Ajout de
  `tools/boot.test.mjs`, qui exécute l'application dans un faux DOM et aurait
  attrapé le premier des trois.
- v7.24 : nouvel écran "Mes meilleurs réglages", un par café, avec le calcul
  isolé dans `js/reglages.js` sans DOM. Priorité 6 du backlog, révisée : par café
  et non en général, et sur sa propre page.
- v7.23 : détail dépliable dans l'historique (les 22 champs stockés, pas
  seulement les 8 colonnes), comparateur de deux extractions avec surbrillance des
  seules différences, et KPI de régularité en écart moyen. Priorités 4, 5 et 8 du
  backlog.
- v7.22 : formulaire de saisie remis d'aplomb (une seule grille, options à
  cocher regroupées à part, quatre colonnes, plus aucun champ à cheval sur deux
  colonnes) et case "eau préchauffée" masquée sur la famille brikka-classique où
  elle fait doublon avec le choix de recette. Détail en section 7 ter.
- v7.21 : tableau de l'historique à largeurs figées, il ne défile plus
  horizontalement sur grand écran et tronque proprement avec la valeur complète au
  survol. Retrait de l'avertissement "recette conseillée pour ce café", qui
  reposait sur une valeur jamais vérifiée. Retrait de la règle d'insight sur le
  préchauffage, devenue un doublon exact du duel de recettes depuis que le
  préchauffage est une recette.
- v7.20 : bulle d'aide des diagnostics enrichie. Elle donne maintenant QUAND
  cocher (description en bouche, `DIAGNOSTIC_QUAND`) puis QUOI faire, sur deux
  lignes. Les 16 descriptions existent en FR et EN.
- v7.19 : diagnostics regroupés par levier de correction au lieu d'une liste à
  plat de onze entrées, et cinq nuances "un peu" ajoutées là où elles manquaient
  (astringent, léger, concentré, éventé, brûlé). AUCUNE valeur retirée ni
  renommée, l'historique déjà enregistré reste lisible tel quel, ce que le test 10
  de `tools/data.test.mjs` verrouille.
- v7.18 : champ `puissance_feu` (entier 1 à 10, Brikka seulement) sur les
  extractions ET sur les recettes Brikka, migration à 3 de tout l'historique
  Brikka, insight "quelle puissance de feu te réussit". Température préremplie à
  93 au lieu de 95 (`DEFAULT_TEMP_C`), sans toucher aux extractions déjà
  enregistrées.
- v7.17 : "Brikka classique (eau préchauffée)" devient une recette à part
  entière, dans la famille `brikka-classique` avec la Standard, dont le NOM est
  inchangé. Même dose et même eau que la Standard pour que la comparaison soit
  propre, seuls la température de départ, la conduite de la flamme et la mouture
  (1.3.0 au lieu de 1.2.0) changent. Migration des extractions déjà cochées "eau
  préchauffée". Critère retenu pour trancher ce genre de question : la recette
  décrit l'EXTRACTION. Préchauffer en fait partie, allonger après coup non, ce
  dernier reste donc un champ.
- v7.16 : durées de chrono saisies en minutes ET secondes (stockage inchangé,
  toujours en secondes), et brouillon de la saisie conservé dans localStorage quand
  on quitte l'onglet. Détail et pièges en section 7 bis.
- v7.15 : "Note contre âge du café" remplacé par "Quels goûts font tes bonnes
  tasses", note moyenne par descripteur. L'ancien dépendait d'une date de
  torréfaction que les paquets vietnamiens ne portent presque jamais, il était donc
  structurellement vide; le nouveau utilise une donnée cochée à chaque tasse et
  parle enfin de goût plutôt que de réglage. Le rappel qui réclamait les dates de
  torréfaction est retiré des insights. Détail en section 6 sexies.
- v7.14 : correction d'une PERTE DE DONNÉES sur la synchro. Les CSV ne portant
  pas `maj_le`, relire le dossier lié remettait les horodatages à zéro : une
  modification faite hors ligne puis rechargée avant synchro était écrasée par le
  serveur. `reporterHorodatage()` conserve l'horodatage connu quand le contenu
  est identique et n'estampille que sur changement réel. Trouvé en inspectant D1
  après la première synchro réelle, pas par un test.
- v7.13 : suivi du stock par sachet (suggestion 4 du backlog). Cinquième table
  `achats`, migration idempotente qui fabrique un sachet implicite pour
  l'existant, badge de stock dans la liste des cafés (orange sous 3 tasses, rouge
  et nom barré quand c'est fini), bouton Nouveau sachet. L'effet le plus utile
  n'est pas le stock mais la fraîcheur : chaque sachet porte enfin sa propre date
  de torréfaction, alors qu'un café racheté gardait celle du premier paquet et
  affichait donc une fraîcheur fausse pour toujours. `achats` est ajouté aux deux
  listes de tables de synchronisation.
- v7.12 : numéro de version dans le pied de page (bouton de déconnexion écarté,
  un seul compte). Calendrier d'activité : cinq mini statistiques dont la série
  en cours et les tasses par semaine rapportées au temps réellement couvert.
  Les trois cartes qui peuvent rester vides avec des données valides expliquent
  désormais leur cause réelle et l'action qui les débloque (sections 6 quater).
  Nouvel insight moment de la journée, gratuit puisque l'heure est déjà stockée.
- v7.11 : tableau de bord réordonné (30 jours, insights, 5 dernières, puis le
  reste) et calendrier d'activité rendu lisible : échelle de couleur ABSOLUE au
  lieu de relative au maximum (le défaut de fond), légende chiffrée, jour courant
  cerclé, cases plus grandes et cerclées, étiquettes de mois fiabilisées, cases
  atteignables au doigt, et résumé chiffré avec la plus longue série de jours
  consécutifs. Détail et raisons en section 6 ter.
- v7.10 : synchronisation entre appareils (suggestion 1 du backlog), la plus
  grosse pièce. Stockage Cloudflare D1 derrière la session existante, fusion
  ligne par ligne avec pierres tombales, colonne interne `maj_le` hors CSV,
  synchro débouncée à l'écriture et au chargement, ligne d'état et bouton manuel
  dans le panneau Données. Inactive en `file://`, en démo, et tant que la base
  D1 n'est pas liée. Détail et pièges en section 8 bis, activation en section 10.
- v7.9 : insights automatiques du tableau de bord (suggestion 6 du backlog),
  carte "Ce que tes données disent" sous les KPI. Quatre règles avec seuils
  d'échantillon et d'écart, comparaison du meilleur groupe au reste mis en
  commun, et message explicatif quand il n'y a pas assez de matière. Détail en
  section 6 bis.
- v7.8 : PWA installable (manifest, icônes générées, service worker réseau
  d'abord) et API Wake Lock pendant le chrono, pour que l'écran du téléphone ne
  se verrouille plus au milieu d'une extraction. Suggestion 1 du backlog,
  débloquée par le passage en https. Aucun effet en `file://`. Détail et
  pièges en section 9 bis.
- v7.7 : entête cliquable (icône plus titre, `.marque-lien`) qui ramène au
  tableau de bord depuis n'importe quel écran. C'est un vrai lien `#tableau`,
  donc focusable au clavier et ouvrable dans un onglet, mais app.js intercepte
  le clic simple pour basculer d'écran sans repasser par le hash. Dose
  préremplie à 15 g quand aucune recette ne la fixe (constante
  `DEFAULT_DOSE_G`, appliquée au formulaire complet et à la saisie rapide) ;
  une recette qui porte une dose gagne toujours.
- v7.6 : correction du `step` des champs prix du café (était 1000, or le
  Sáng Tạo 4 est à 148 800 ₫, sa fiche ne pouvait pas être enregistrée du
  tout) et contenance des tasses (était 5). Aucun changement de données ni de
  calcul. Documentation du piège `step` et du comportement des cafés inactifs
  dans le tableau de bord (ils y restent, c'est voulu).
- v7.5 : porte d'entrée sur le site déployé. Un compte unique, identifiant et
  mot de passe, session de 30 jours par cookie signé HMAC, dans un Cloudflare
  Worker (`worker/index.js`) qui s'exécute devant les fichiers statiques.
  Ajout de `wrangler.jsonc` et `.assetsignore`. Les secrets vivent dans
  Cloudflare, le dépôt est public et n'en contient aucun. Le déploiement
  passe de Pages à Workers. AUCUN changement dans l'application elle même :
  l'ouverture en `file://` par double clic est intacte et sans login. Passage
  des messages de commit et du code nouveau à l'anglais.
- v7.4 : mise sous git, dépôt initialisé à la racine de `tracker/` et poussé
  sur GitHub (ChrisTram/Coffee-extraction-logbook, branche `main`). Ajout de
  `.gitignore` et `.gitattributes`. Aucun changement de code applicatif :
  l'arbitrage sur le build (pas de Vite, pas de bundler) est consigné en
  section 10.
- v7.3 : cafés désactivés retirés du select de saisie (réinjectés seulement
  à l'édition d'une ancienne extraction) et toujours triés en fin de la
  liste "Mes cafés"; badge de note moyenne (★) et date d'ajout sur chaque
  café de la liste; nouvelle colonne `date_ajout` (posée à la création,
  migration étape 5 pour l'existant, démo migrée au chargement); section
  déploiement git + Cloudflare Pages dans la doc.
- v7.2 : diagnostic à choix MULTIPLE (stocké séparé par `|`, rétrocompatible,
  corrections empilées sous les pilules, filtre historique en "contient",
  anneau du tableau de bord compte chaque valeur), définitions et corrections
  affichées dans une vraie bulle CSS au survol ou au focus juste au dessus de
  la pilule ou du tag (data-info, plus de ligne d'aide tout en bas du bloc
  descripteurs).
- v7.1 : deux diagnostics intermédiaires ("Un peu acide", "Un peu amer",
  corrections en demi-mesures), 17 descripteurs de plus (beurré, gras,
  velouté, chocolat au lait, cacahuète, praliné, fruit de la passion,
  cerise, raisin, pomme, rose, thé vert, clou de girofle, biscuit, rhum,
  caoutchouc, moisi), définition courte de CHAQUE descripteur (TAGS_INFO
  dans i18n.js), notamment pour distinguer fumé / tabac / brûlé / cendre.
- v7 : cartes à variantes (Chronicler Classique/Sweet, Costaud
  Bloom/Immersion, Brikka Flat white/Cappuccino ajouté), The Sweet Variation
  renommée "The Coffee Chronicler's Recipe (Sweet)", panneau latéral recette
  complet, détail crans/microns sous le champ molette, agitation défaut 1,
  tasses par défaut par méthode, case eau préchauffée (finalement décochée
  par défaut), eau vide et température 95 par défaut en saisie, pourcentage
  retiré du nom dans le select des cafés. Docs de reprise (START-HERE,
  DOCUMENTATION, AUDIT).
- v6 : recettes v2 (2 Brikka, 6 Switch) avec migration automatique des noms,
  chrono unique à paliers et bips, diagramme officiel SVG 13 méthodes en
  base 8,32, champs eau ajoutée / agitation / tasse / lait, Sáng Tạo 4 non
  pur (82 pour cent, blocage Switch, coût réel), Balanced étalon, glossaire
  "Lire une étiquette vietnamienne".
- v5 : gestion du navigateur sans File System Access (Brave, Firefox),
  cafés déjà moulus (défaut paquet), groupe corps et texture, étoile rouge
  sur la dose seul champ obligatoire, café optionnel.
- v4 : bascule FR/EN complète (js/i18n.js).
- v3 : panneau latéral de saisie, boutons Cafés/Recettes dans l'entête,
  thème clair réchauffé, KPI caféine (remplace le coût du mois), graphe 30
  jours enrichi (grammes, tooltip caféine), volume estimé cliquable,
  descripteurs organisés SCA, diagnostics étendus avec corrections.
- v2 : recettes éditables (recettes.csv), saisie rapide flottante, page
  Guide (boutiques, achats, messages vietnamiens), correction du bug
  d'avertissement au préremplissage.
- v1 : site initial, 4 écrans, 2 CSV, démo, Chart.js local, thèmes.
