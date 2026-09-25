# Changelog : Carnet d'extraction

Une ligne par version, la plus récente en premier. Le numéro affiché dans le pied
de page du site est celui du `<meta name="app-version">` d'`index.html`, posé
par `node tools/bump_version.mjs X`. Chaque entrée dit CE QUI a changé ; le
pourquoi est dans `DECISIONS.md`.

- v8.58 : le graphe des 30 jours montre enfin le nombre de tasses. Une barre pleine dans une bande étroite graduée jusqu'à 3 rendait une journée à une tasse et une à deux presque identiques. Chaque tasse est maintenant un pavé empilé, séparé du suivant par un filet : on compte les pavés au lieu de lire une hauteur. L'échelle s'arrête au plus gros jour du mois, avec un repère par tasse, et l'infobulle donne le total du jour.
- v8.57 : tes dessins, à ta façon. Un bouton « Arranger » dans l'entête de « Tes cafés en dessins » ouvre un petit panneau : une case par dessin pour l'afficher ou le masquer, deux flèches pour le monter ou le descendre, « Revenir à l'ordre d'origine » et « Terminé ». Le choix s'applique tout de suite et suit sur tous tes appareils. Un dessin masqué n'est plus calculé.
- v8.56 : deux cafés côte à côte. En pied de fiche café, « Comparer avec un autre café » : les deux empreintes de goûts superposées, avec la phrase qui dit de quoi l'un a plus que l'autre, et face à face leur moyenne, leur machine, leur meilleur réglage, leur fenêtre de fraîcheur, leur coût par tasse et le goût qui revient. Pour choisir quoi racheter.
- v8.55 : chaque point est une tasse. Dans l'horloge, le spectre, la carte du moulin, la trajectoire et la courbe de la fiche café, toucher un point ouvre la tasse qu'il représente, en bulle : sa date, son café, sa recette, ses réglages, ses goûts et sa note, avec « Modifier » et « Refaire ». La bulle se ferme en touchant ailleurs, par Échap ou en faisant défiler.
- v8.54 : la régularité se mesure à café et recette égaux. La tuile des chiffres clés comparait chaque tasse à la moyenne de tout l'historique : un Liberica à 8 et un Strong à 4, chacun refait à l'identique, passaient pour de l'irrégularité. Elle compare maintenant chaque tasse aux autres tasses du même café sur la même recette, et mesure donc ton geste, pas la variété de tes cafés.
- v8.53 : trois dessins de plus dans « Tes cafés en dessins ». La frise des sachets : un ruban par sachet des trois derniers mois, de son ouverture à sa dernière tasse (ou à aujourd'hui s'il est en cours), d'autant plus plein que ses tasses étaient bien notées ; un ruban ouvre la fiche de son café. Le podium des recettes : tes trois meilleures moyennes, dès trois tasses chacune, sur trois marches ; une marche ouvre sa recette dans le Guide, soulignée un instant. Ta progression : ta moyenne sur cinq tasses sur tout l'historique, avec ses jalons, chaque sachet ouvert et chaque recette essayée pour la première fois ; elle mène à l'historique.
- v8.52 : le Guide en bibliothèque de recettes. Le sommaire devient une barre d'onglets et le Guide ne montre plus qu'une partie à la fois, les recettes d'abord : Recettes, Moulin, Diagnostic du goût, Règles, Vocabulaire, Boutiques et achats, Matériel, Messages à copier ; l'onglet choisi est retenu, rien n'a été retiré. Les recettes se filtrent par machine et par profil de café, cafés lavés ou naturels et fermentés, lu dans le texte « Pour qui » de chaque recette ; une recette qui ne vise pas de profil, comme les Brikka, paraît sous les deux. Chaque carte dit ce qu'elle donne chez toi : « Chez toi : 7 de moyenne sur 4 tasses », ou « Pas encore essayée chez toi ». Le raccourci « Le moulin » du tableau de bord ouvre directement le bon onglet.
- v8.51 : le récap de la semaine. En tête du tableau de bord, la semaine passée, du lundi au dimanche : le nombre de tasses, la moyenne, la meilleure tasse, une barre par jour, et quelques faits, chacun seulement s'il est vrai : l'écart avec la semaine d'avant (dès 0,4 point et trois tasses notées de chaque côté), le café qui a fait au moins la moitié des tasses, les sachets ouverts. Il reste là toute la semaine suivante, jusqu'à « Refermer ». Sous deux tasses dans la semaine, pas de récap.
- v8.50 : trois dessins de plus dans la fiche café. Son empreinte : un radar des familles de goûts, ce café en cuivre contre tous tes autres en pointillé, et la phrase qui dit de quoi il a plus et de quoi il manque. Ta trajectoire : ses tasses dans le plan molette contre température (ou feu à la Brikka), reliées dans l'ordre où tu les as faites, sur sa recette la plus faite, la dernière cerclée et la meilleure nommée. Et la carte du moulin, réduite à ce café, avec sa zone dorée.
- v8.49 : tes cafés en dessins, sur le tableau de bord, juste avant les analyses. Quatre dessins, et chacun est un raccourci. L'étagère montre tes sachets en bocaux remplis de ce qui reste, le liseré en cuivre quand le café est dans sa fenêtre de fraîcheur, en rouge quand il l'a passée ; un bocal ouvre la fiche de son café, le reste mène à Mes cafés. L'horloge place chaque tasse des trois derniers mois à son heure, plus loin du centre quand elle est mieux notée, et compare le matin, l'après-midi et le soir ; elle mène à l'historique. Le spectre d'extraction range tes diagnostics de sous-extrait à sur-extrait, une rangée par recette, et dit laquelle penche ; il ouvre l'onglet Diagnostics. La carte du moulin pose chaque tasse à ses microns dans la plage de sa machine et entoure ta zone dorée ; elle mène au moulin du Guide.
- v8.48 : la correction chiffrée. Sous la phrase de correction d'un diagnostic, la saisie écrit maintenant le réglage de la tasse suivante : « Un peu amer » sur 1.4.2 donne « molette 1.4.2 → 1.4.4 (+2 crans, 599 → 616 µm). Si ça ne suffit pas : eau à 90 °C au lieu de 92. » La molette passe d'abord, puis la chaleur (degrés au Switch, feu à la Brikka), puis le ratio (eau au Switch, café à la Brikka) ; un diagnostic franc double le pas, la molette reste dans la plage de la machine, acide et amer ensemble ne se chiffrent pas. Les pas se règlent dans Paramètres, nouvelle carte « Mes pas de correction », et se synchronisent. Après l'enregistrement, le message propose « Préparer la prochaine », qui ouvre la saisie avec la correction appliquée ; sans ce clic, rien ne change.
- v8.47 : le mode Brassage. « Mode Brassage », dans le chrono de la saisie, met le même chrono en plein écran, lisible à un mètre : le temps dans un anneau qui fait le tour de la recette, la cible du versement en énorme (« 120 ml », puis « 240 ml » ; en grammes par la bascule g le jour où une balance arrive), l'état de la vanne du Switch, la consigne, le compte à rebours jusqu'à l'étape suivante et la frise de toutes les étapes. Les bips et l'écran allumé sont ceux du chrono, et le téléphone vibre à chaque palier là où il le permet. Arrêter reporte le temps total et l'écoulement dans la saisie, puis propose la note au curseur et « Enregistrer la tasse ». Fermer le mode laisse le chrono tourner.
- v8.46 : une fiche par café. « Fiche du café », dans Mes meilleurs réglages et dans Mes cafés, ouvre tout ce que le carnet sait d'un café au même endroit : son identité et sa note moyenne, le sachet en cours (grammes restants, tasses restantes, « Réachat conseillé » avec le lien de la boutique du Guide quand il en reste trois ou moins), le jour du sachet et TA fenêtre de fraîcheur, apprise de tes notes sur ce café (les jours du sachet où tes tasses dépassent ta moyenne, dès trois tasses par période), la courbe des notes selon le jour du sachet, la roue des arômes de ce café, son meilleur réglage avec « Refaire cette tasse », et ses cinq dernières tasses. Deux boutons en pied : brasser ce café, le modifier. La démo ouvre maintenant chaque sachet le jour de son achat, ce qui fait aussi parler la règle « âge du paquet ». « Refaire cette tasse » dans Mes meilleurs réglages reprend les réglages sans la note, comme Dupliquer depuis la v8.41.
- v8.45 : la roue des arômes, dans un nouvel onglet Arômes des analyses. Les familles du vocabulaire au centre, leurs goûts autour : un arc est d'autant plus large que le goût est souvent coché, et d'autant plus plein que les tasses où il apparaît sont bien notées. Toucher une famille la déplie et liste ses goûts avec leur note et le nombre de tasses ; le choix tient d'un rendu à l'autre. Une phrase dit la famille la plus cochée et celle des meilleures tasses. L'onglet Goûts garde son classement en barres.
- v8.44 : les tasses jumelles. Dans la colonne de la saisie, entre la recette et le café, les trois tasses notées les plus proches de ce que tu t'apprêtes à brasser, avec leur note et leur moyenne. Jumelle ne veut pas dire identique : même recette et molette à trois crans près, sans exiger la même température ni la même dose ; les tasses du même café passent devant. Chaque ligne dit seulement en quoi elle diffère (un autre café, la molette, la température au Switch, le feu à la Brikka). Pour un café déjà moulu, ce sont les tasses de la même recette sur ce café. Moins de deux jumelles, la carte se cache.
- v8.43 : le commentaire se dicte. Un bouton « Dicter » à côté du commentaire lance la reconnaissance vocale du navigateur, en français ou en anglais selon la langue du site ; le texte dicté s'ajoute à ce qui est déjà écrit et reste modifiable avant d'enregistrer. La reconnaissance passant par les serveurs de Chrome et de Safari, le bouton se cache hors ligne et sur les navigateurs qui ne la connaissent pas. Un micro refusé ou une connexion perdue le disent en une phrase.
- v8.42 : trois constats de plus dans « Ce que tes données disent », sur des données déjà saisies à chaque tasse. Au Switch, la température de l'eau par tranches (sous 91 °C, entre 91 et 93, à 94 et plus) ; à la Brikka, l'eau préchauffée contre l'eau froide au départ ; au Switch, les tasses remuées contre celles sans agitation. Mêmes seuils que les autres règles : trois tasses de chaque côté et 0,4 point d'écart, sinon rien.
- v8.41 : « Refaire ma dernière tasse » depuis l'icône de l'appli. L'appui long sur l'icône propose un troisième raccourci, entre Saisie et Historique, qui ouvre la saisie avec les réglages de la tasse la plus récente (café, machine, recette, dose, eau, molette, température, feu, options). Le résultat de cette tasse ne suit plus : la note, les goûts, les diagnostics, le commentaire, les temps mesurés et « ratée » restent à donner. Le bouton Dupliquer de l'historique suit la même règle ; il recopiait jusqu'ici la note de la tasse d'origine. Android montre ces raccourcis, l'iPhone non.
- v8.40 : la note se donne en un geste. La case « Pas encore notée, je reviendrai » disparaît, dans la saisie comme dans la saisie rapide : tant qu'on n'y a pas touché, le curseur n'a ni pouce ni piste remplie, seulement un pointillé et « Touche la piste pour noter, ou reviens plus tard. ». Le premier toucher, n'importe où sur la piste, pose la note ; « Effacer la note » revient à une tasse non notée. Tabuler à travers le curseur ne le note plus, et un brouillon repris garde la note donnée avant que la page soit déchargée.
- v8.39 : tableau de bord. « Dernière tasse » remplit son vide : sa place parmi les tasses notées du même café (un point par tasse sur l'échelle des notes, celle-ci en grand, ta moyenne en trait, « la meilleure, 2,7 au-dessus de ta moyenne »), et un pied à cinq cases avec leur repère dessous (le ratio visé par la recette au Switch, le temps de la recette ou ta moyenne, l'écoulement moyen, les microns, « la tasse »). Le temps total quitte la ligne de réglages pour le pied. Le graphe des 30 jours a sa hauteur propre (210 px de dessin) au lieu de s'étirer sur les constats voisins, et se lit en deux bandes sur le même axe des jours : la note en haut, les tasses du jour en barres dessous, chacune avec sa graduation. Les constats de « Ce que tes données disent » défilent un par un (flèches, « 1 / 2 »). Les six graphiques d'analyse passent dans une seule carte à onglets (Cafés, Recettes, Machines, Goûts, Diagnostics, Mouture), chacun avec sa lecture en une phrase ; l'onglet choisi est retenu. Au téléphone, la carte « Dernière tasse » repasse en colonne : une règle plus spécifique la gardait en ligne depuis la v8.28, et son corps tombait à 166 px à côté de la note.
- v8.38 : quatre défauts relevés à l'audit. La démo rajeunit à chaque chargement : ses dates glissent pour que la dernière tasse tombe hier, sinon le tableau de bord la montrait vide six semaines après son écriture. La tendance du graphe des 30 jours s'arrête sept jours après la dernière tasse notée, au lieu de tracer une ligne plate sur un mois sans tasse. Les chiffres clés affichent un trait au lieu de « 0,0 / 10 » quand il n'y a pas de tasse notée. « Mes meilleurs réglages » ne couronne plus un réglage qui reste sous la moyenne du café : il désigne la meilleure tasse et dit combien de fois la refaire pour savoir si elle tient.
- v8.37 : la saisie arrive toujours avec une recette et un café choisis. Un brouillon repris remettait la méthode de la veille sans recharger la liste de ses recettes : une recette Switch posée dans un menu Brikka laissait le menu vide. La reprise recharge désormais la bonne liste, et retombe sur le premier café et la première recette de la méthode quand le brouillon n'en a pas de valable. « Ce que tes données disent » repasse à sa hauteur d'avant la v8.36 (349 px contre 447), et le graphe des trente jours, qui s'aligne sur elle, retrouve la sienne : la preuve tient sur une ligne, une réglette de 0 à 10 avec les deux moyennes en points, « 6,8 contre 5,2 », puis « Solide · 5 et 9 tasses ». Elle ne répète plus le réglage que la phrase nomme déjà.
- v8.36 : « Ce que tes données disent » montre sa preuve. Sous chaque constat, les deux moyennes comparées avec leur libellé, leur effectif et deux barres à l'échelle des notes sur 10, puis un pied « écart solide » (au moins 0,8 point et cinq tasses de chaque côté) ou « écart probable », suivi du nombre de tasses notées. Les phrases perdent leurs chiffres, désormais écrits une seule fois, dans la preuve. Les seuils d'affichage ne bougent pas : sous 0,4 point ou trois tasses par groupe, une règle se tait toujours.
- v8.35 : la température a ses flèches haut et bas. Chrome masque les siennes sous une certaine largeur, et ce champ fait 66 px : il n'en avait aucune, contrairement au champ Volume juste à côté. Deux boutons dessinés, collés au champ, identiques sur les deux moteurs et dans les trois palettes ; maintenir répète, 400 ms puis un degré toutes les 90 ms, et les bornes 60 et 100 du champ sont respectées.
- v8.34 : deux thèmes sombres à la place d'Espresso, supprimé. Graphite (presque noir neutre, accent crème) par défaut, et Nuit (bleu encre profond, accent cuivre). Le bouton de thème fait le tour clair, Graphite, Nuit, et le choix est gardé. Couleurs de machines éclaircies d'un cran en sombre. La carte du chrono suit la palette active au lieu de recopier les valeurs Espresso. Barre d'état, manifeste et page de connexion en Graphite. Nouveau test : chaque texte des deux palettes tient 4,5:1 sur chaque surface.
- v8.33 : historique, plus de flèche pour déplier une ligne : sur ordinateur, le détail (temps, écoulement, température, feu, volumes, tasse, coût, tous les goûts) vient en fiche flottante au survol de la ligne, sans répéter le commentaire écrit dessous. Au téléphone, la carte garde son détail dépliable, par un bouton « Voir le détail » en mots. Tableau de bord : la bulle qui répétait le commentaire déjà écrit sous la ligne disparaît ; le texte complet ne vient au survol que s'il est coupé. Saisie : entre 1024 et 1399 px, une seule colonne (le formulaire tombait à 326 px à 1024, menu des cafés à 30 px, curseurs à zéro).
- v8.32 : téléphone et tablette étroite (≤ 860 px). Le bouton flottant de saisie rapide repasse au-dessus de la barre du bas : une règle plus bas dans la feuille le remettait à 16 px du bord, sur la barre. La feuille de saisie rapide fermée disparaît pour de bon : posée à 82 px du bas, elle ne descendait que de sa propre hauteur, laissait dépasser 78 px et masquait la barre de navigation. Elle s'ouvre désormais juste au-dessus de la barre.
- v8.31 : feuille de style consolidée. Quarante-trois sélecteurs de premier niveau étaient définis deux ou trois fois (les blocs « refonte, étape 4, 6, 7 » redéfinissaient ce qui précédait) : chacun n'est plus défini qu'une fois, à sa première position, avec la dernière valeur de chaque propriété. Vérifié par empreinte des styles calculés dans le navigateur, six écrans, deux thèmes, 1600 et 400 px : zéro écart, sauf le bouton Enregistrer sur téléphone qui gagne les 54 px que sa règle lui promettait. Documentation et décisions remises au niveau du code (v8.26 à v8.31).
- v8.30 : saisie. Les curseurs sont dessinés en CSS (piste remplie jusqu'à la valeur via --pc, posée par UI.peindreCurseur ; pouce bordé d'accent), identiques dans les deux thèmes et sur les deux moteurs, saisie rapide et moulin du guide compris. Les trois options (eau préchauffée, ajout d'eau, agitation) deviennent des interrupteurs autour de la même case à cocher. La note s'affiche en grand à côté de son libellé. L'avertissement dessine son icône au lieu du caractère ⚠. Le chrono en marche prend un halo. Les boutons ✎, ✚ et ✕ passent en icônes de trait.
- v8.29 : historique sans intertitre de jour, la date complète en tête de chaque ligne et de chaque carte, à la demande de Chris. Largeurs par colgroup (pixels pour les colonnes chiffrées et les actions, le reste partagé entre café, recette et goûts), café et recette passent à la ligne au lieu de se tronquer, microns et ratio en tasse sur une seconde ligne. Les cinq actions et le chevron de dépliage passent en icônes de trait (UI.icone, dans le noyau), plus de glyphes Unicode.
- v8.28 : tableau de bord sur douze colonnes (8 + 4, puis 4 + 4 + 4). La carte « Dernière tasse » repasse en ligne, corps à gauche et note à droite derrière son filet (la règle générale des cartes la mettait en colonne et la note tombait au milieu du vide), et gagne un pied avec ratio, mouture, écoulement et coût. Les chiffres secondaires (total, note globale, caféine) passent de la phrase à trois lignes alignées, la clé kpi_secondaires disparaît. Les statistiques du calendrier en deux colonnes, définies une fois au lieu de deux.
- v8.27 : un seul cadre centré pour tous les écrans, jeton --cadre à 1560 px. L'historique était calé à gauche sur les écrans larges par un margin-left: 0 hérité de l'ancien élargissement, et la saisie plafonnée à 1240 px sans marge automatique laissait une bande vide à droite : la grille de saisie passe à 1400 px centrés, colonne fixe à 380 px. Un test refuse désormais toute largeur ou marge posée sur un #ecran-*.
- v8.26 : thème sombre « Espresso » : fond un cran plus profond sans être noir, quatre surfaces à pas nets, filets en alpha, relief par ombre douce et filet clair, caramel plus franc. Tous les textes au dessus de 4,5:1 sur les cinq surfaces. Nouveaux jetons --panneau-3, --ombre-carte, --ombre-haut dans les deux thèmes. La couleur de fond change aux quatre endroits (feuille de style, theme-color, manifeste, page de connexion du Worker).
- v8.25 : le feu Brikka par défaut repasse à 3, dans les trois recettes, le
  repli d'usine et le schéma des réglages, avec un pas de schéma pour les
  recettes déjà enregistrées. Un test vérifie que les trois sources disent le
  même chiffre.
- v8.24 : le calcul de la température depuis le temps de chauffe fonctionne
  enfin, le défaut du temps d'ébullition valait zéro et éteignait la fonction ;
  2 minutes, mesurées par Chris. Le paragraphe qui réclamait de chronométrer sa
  bouilloire disparaît. Les familles de goûts sont ouvertes par défaut. Le
  tableau de bord montre huit extractions et le lien colle à la table. Entête de
  l'historique refait : machine en contrôle segmenté, menus à chevron, bandeau
  résumé serré.
- v8.23 : DOCUMENTATION remise au niveau du code : date de mise à jour, entête
  disparue, et deux sections neuves pour le tableau de bord et l'historique.
- v8.22 : CHANGELOG remis au format du fichier, les vingt-deux entrées de la
  refonte étaient arrivées en bas sous des titres ##. Apostrophes droites
  partout, ici et dans DECISIONS.md.
- v8.21 : Vingt classes CSS mortes depuis la refonte sont retirées. La légende
  du calendrier revient : son style était resté, son HTML avait disparu, et une
  échelle de couleurs sans légende est une suite de bruns. Les trois classes de
  badge de stock, assemblées par concaténation, sont gardées.
- v8.20 : Les intertitres de carte passent en Manrope 700 : une serif à 11 px en
  capitales est illisible. La couleur de thème du navigateur suit le nouveau
  fond clair. Les libellés des graphiques se tronquent au mot entier avec le nom
  complet dans l'infobulle, au lieu d'être coupés en plein mot. Les champs du
  chrono sont rattachés au formulaire par form=.
- v8.19 : L'historique passe en cartes par jour sous 1024 px : dix colonnes dans
  350 px se lisaient en faisant glisser la table. La table reste sur ordinateur.
  Les cinq actions, le dépliage et le détail sont construits par le même code
  des deux côtés, et un test compare les gestes offerts par les deux rendus.
- v8.18 : Les familles de goûts se replient : deux visibles plus celles qui
  contiennent un goût coché, le reste sous un bouton, choix retenu. Le bloc « En
  bouche » passe de 1 672 à 1 111 px. Le chronomètre sort dans js/ui-chrono.js,
  ui-saisie.js ayant dépassé le plafond de 1 200 lignes.
- v8.17 : Le chrono passe en haut de la colonne de droite, avant les fiches
  recette et café : il commençait à 803 px du haut, donc hors écran au moment où
  on verse. Sur téléphone il devient un bandeau collé en haut, avant le
  formulaire. Le palier en cours se lit maintenant sans déplier.
- v8.16 : Les cinq dernières extractions passent de 174 à 54 px par tasse : une
  ligne par tasse, le commentaire tronqué sur une seconde ligne avec son texte
  entier au survol. La molette, les degrés et le feu quittent la carte, ils sont
  dans l'historique. La table tient dans sa carte sans défiler.
- v8.15 : Le calendrier ne défile plus dans sa carte : le nombre de semaines se
  calcule depuis la largeur disponible, et les cinq chiffres du dessous
  décrivent la même fenêtre que la grille. Le titre dit combien de semaines il
  montre.
- v8.14 : L'historique passe de treize à dix colonnes : le temps, les degrés et
  le feu retournent dans le détail déplié. Le commentaire prend sa propre ligne
  en pleine largeur sous chaque tasse, au lieu d'une colonne où il n'aurait tenu
  que trois mots. La table ne défile plus horizontalement et les cinq boutons
  d'action tiennent enfin dans leur cellule.
- v8.13 : Les six écrans ont enfin la même largeur : Paramètres vivait hors de
  main et s'affichait pleine fenêtre, et la barre de défilement faisait sauter
  le contenu de 15 px entre écrans. Les cartes du tableau de bord s'étirent à la
  même hauteur, plus de trous. Les filtres de l'historique tiennent sur une
  ligne au lieu de deux étages. Les chiffres du calendrier passent en lignes et
  la grille s'ouvre sur la semaine en cours. Base typographique de 15 à 16 px.
- v8.12 : La note repasse au curseur, comme avant : le stepper est retiré.
  Corrige le champ des secondes de la bouilloire, dont le contenu était coupe.
- v8.11 : Le chrono devient un widget repliable et passe sous la fiche recette,
  qui reste donc visible en haut de la colonne de droite. Le temps reste lisible
  replié, le chrono s'ouvre tout seul au démarrage et refuse de se replier tant
  qu'il tourne.
- v8.10 : Répare le formulaire de saisie : les blocs « Les réglages » et « En
  bouche » étaient passés dans la colonne de droite depuis la v8.3, habillés en
  carte sombre, et le formulaire ne contenait plus que le premier bloc. Le
  déplacement du chrono avait attrapé la mauvaise balise. La date de la tête de
  page est rattachée au formulaire par `form=`. Un test vérifie désormais de
  quel côté tombe chaque champ.
- v8.9 : Corrige la mise en page de la saisie : le formulaire était comprimé à
  gauche avec une colonne vide de 360 px à sa droite. La grille de deux colonnes
  était posée sur l'écran, qui n'a qu'un enfant, au lieu de `.saisie-layout`,
  qui porte la répartition. La tête de page sort du formulaire pour couvrir les
  deux colonnes comme sur les autres écrans.
- v8.8 : Corrige la navigation : l'écran de saisie restait affiché en permanence
  et les autres s'empilaient dessous au lieu de le remplacer. Sa mise en page en
  grille visait `#ecran-saisie` sans `.actif`, et un sélecteur d'identifiant bat
  la classe qui masque les écrans inactifs. Un test refuse désormais ce genre de
  règle.
- v7.101 (numérotée à rebours, livrée après la 8.7) : dans le panneau latéral de
  la saisie, les pas de la recette s'affichent en entier au lieu d'une boîte de
  220 px à faire défiler.
- v7.100 (numérotée à rebours, livrée après la 8.7) : recette Better 1 Cup
  (Hoffmann), le dernier pas n'interdit plus la cuillère : tourbillon doux, ou
  un aller et retour de cuillère si le Switch est trop lourd à faire tourner sur
  la balance, comme Hoffmann l'accepte dans sa Part 2. Pas de schéma v13 pour
  les fiches déjà semées, ciblé sur l'ancien texte.
- v7.99 (numérotée à rebours, livrée après la 8.7) : recette Better 1 Cup
  (Hoffmann), le premier pas dit désormais que le tourbillon se fait PENDANT le
  bloom, pour mouiller tout le lit. Pas de schéma v12 pour les fiches déjà
  semées, ciblé sur l'ancien texte.
- v8.7 : Refonte « Comptoir », étape 8 sur 8 : les deux thèmes vérifiés écran
  par écran. La carte sombre redéfinit ses jetons au lieu d'habiller ses
  descendants, ce qui rendait son contenu invisible en thème clair. Les
  pastilles de machine passent au point de couleur plutôt qu'au texte posé sur
  la couleur. Les six écrans passent maintenant l'audit de contraste dans les
  deux thèmes.
- v8.6 : Refonte « Comptoir », étape 7 sur 8 : les écrans secondaires. Tête de
  page sur Mes meilleurs réglages, le Guide et les Paramètres, sommaire du guide
  en pastilles, titres de modale en serif sur le voile de la DA, et une hauteur
  de contrôle unique de 46 px posée sur la ligne de base des champs plutôt
  qu'écran par écran.
- v8.5 : Refonte « Comptoir », étape 6 sur 8 : l'historique. Tête de page avec
  le total et la recherche, filtres en pastilles, bandeau résumé du filtre
  courant en quatre chiffres, tableau groupé par jour quand le tri est par date,
  goûts visibles sur chaque ligne, détail déplié en quatre colonnes.
- v8.4 : Refonte « Comptoir », étape 5 sur 8 : la saisie rapide devient une
  feuille qui monte du bas, sur un voile qui la referme d'un appui n'importe où.
  Elle affiche l'heure d'enregistrement et les chiffres repris de la recette,
  qu'elle se contentait d'annoncer sans les dire. Le bouton flottant passe en
  icônes en trait et change de dessin au lieu de pivoter.
- v8.3 : Refonte « Comptoir », étape 4 sur 8 : la saisie. Deux colonnes, trois
  blocs numérotés, contrôle segmenté pour la machine, pied de bloc pour ratio,
  microns, coût et caféine. Le chrono passe dans la colonne fixe de droite, et
  devient un bandeau collant sur téléphone. La note passe du curseur au stepper
  par demi points. Un bug trouvé au passage : la reprise de brouillon affichait
  une note sur une tasse enregistrée comme non notée.
- v8.2 : Refonte « Comptoir », étape 3 sur 8 : le tableau de bord. Quatre
  rangées sur trois colonnes, une grande carte « Dernière tasse », quatre tuiles
  de chiffres au lieu de sept, les cinq dernières en vraie table, carte sombre
  pour les insights. Le graphe 30 jours est inchangé. Deux cartes que le brief
  avait oubliées sont gardées. Le bouton « Charger la démonstration » de l'état
  vide, mort depuis la v7.3, fonctionne enfin.
- v8.1 : Refonte « Comptoir », étape 2 sur 8 : la navigation. Rail fixe à gauche
  sur ordinateur, barre du bas plus feuille « Plus » sur téléphone, fin de
  l'entête. Le bouton flottant de saisie rapide est désormais réservé au
  téléphone. Le rail et la feuille sont le même élément, pour que les bascules
  restent uniques. Deux bugs trouvés au passage : le câblage des boutons
  d'entête supprimés plantait le démarrage, et le faux DOM des tests ne pouvait
  pas le voir.
- v8.0 : Refonte « Comptoir », étape 1 sur 8 : les fondations. Instrument Serif
  et Manrope embarquées en woff2 dans `css/fonts/` (jamais un CDN, le site doit
  marcher hors ligne), précachées, et servies avec un cache d'un an. Nouveaux
  jetons de couleur dans les deux thèmes, cinq valeurs assombries par rapport à
  la maquette pour tenir 4,5:1. Plus aucune teinte verte, y compris pour dire «
  bon ». Rayons et espaces de la DA. Le layout ne bouge pas encore.
- v7.98 : bouilloire recalée. Le 4:00 inventé des premières versions, qui
  s'était écrit dans les réglages synchronisés, passe à 2:00 par un pas de schéma
  (v11), calé sur l'observation de Chris : petites bulles qui montent vers 1:30,
  soit 85 à 90 degrés, gros bouillon une trentaine de secondes après. L'aide sous
  le champ température ne répète plus « elle bout en » ; l'aide de la carte Ma
  bouilloire décrit ce repère intermédiaire.
- v7.97 : thème sombre éclairci. Le fond passe d'un brun presque noir à un brun
  chaud, les panneaux se détachent de trois pas au lieu d'un, les filets et le
  texte atténué gagnent en lisibilité, le texte principal est un peu moins blanc
  pour ne pas éblouir. Barre d'état de la PWA, manifeste et page de connexion
  suivent la même couleur de fond.
- v7.96 : le pied du bloc des réglages est allégé. Les options à cocher
  (agitation, ajout d'eau, eau préchauffée) deviennent une ligne discrète, case,
  libellé et aide grise sous un simple filet, au lieu d'une carte pleine ; la
  ligne live (ratio, mouture, coût) devient un vrai pied de carte, fond
  transparent, filet en haut, valeurs en serif comme les chiffres clés.
- v7.95 : la case « eau préchauffée » est toujours visible sur la Brikka ; sur la
  famille Brikka classique, la cocher bascule sur la variante à l'eau préchauffée
  et la décocher revient à la Standard, et choisir la recette coche la case : une
  seule vérité, deux portes. Le temps d'ébullition de la bouilloire n'a plus de
  valeur d'usine : tant qu'il n'est pas chronométré, le site n'estime aucune
  température et l'aide explique comment le mesurer (jusqu'au gros bouillon, pas
  aux premières bulles). La Sweet, variante de la Chronicler, passe en fin de
  liste (Recette 8, pas de schéma v10). Le formulaire de saisie est découpé en
  trois blocs titrés, café et recette sur une rangée, réglages avec la ligne live
  en pied, en bouche ; le bouton des cafés devient une icône. Les cinq dernières
  extractions passent en grille : le corps remplit toute la largeur jusqu'à la
  note.
- v7.94 : sur la Brikka le champ Température disparaît entièrement, rien n'est
  enregistré, l'eau chauffe dans la chaudière et seule la case « eau
  préchauffée » reste. Les cinq dernières extractions montrent leurs goûts cochés
  et leur commentaire en clair, la carte restait à moitié vide. Le badge
  « ratée » passe en sans-serif minuscules, il se lisait mal en petites capitales.
  Première mise en ligne depuis la v7.80 : tout ce qui précède part avec.
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

