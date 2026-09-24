# DÉCISIONS : le pourquoi du Carnet d'extraction

Ce fichier garde le RAISONNEMENT : les bugs trouvés, les options écartées, et
pourquoi le code est comme il est. Il n'est pas à lire en entier avant de
travailler ; on y lit le thème qui concerne la zone qu'on touche. Ce qui existe
et comment ça tient est dans `DOCUMENTATION.md`, l'historique dans
`CHANGELOG.md`.

Les sections viennent de l'ancienne `DOCUMENTATION.md` (jusqu'à la v7.88),
déplacées telles quelles ; certaines mentionnent donc un état du code antérieur
(`app.js` avant son découpage, par exemple). Le numéro de version qui les
introduit est dans le changelog.

## Architecture et code

### Le tableau de bord resserré (v8.39)

**La place de la dernière tasse.** La carte prend la hauteur des chiffres
clés et laissait une bande vide d'environ 85 px. Plutôt qu'un chiffre de
plus, une réponse : cette note est-elle un coup de chance ou ton niveau ?
Chaque tasse notée du même café est un point sur l'échelle des notes. Sous
trois tasses la bande se tait. Les repères du pied viennent de la recette
quand elle en donne un comparable (ratio au Switch seulement : sur la Brikka
l'eau de la recette est celle de la chaudière, pour environ 1:7 en tasse), et
sinon de ta moyenne sur ce café et cette recette.

**Le graphe des 30 jours en deux bandes.** Il superposait barres et ligne
sur deux axes, l'un à gauche, l'autre à droite : il fallait deviner quelle
graduation lisait quoi, et Chris ne lisait pas le nombre de tasses du jour.
Deux bandes empilées sur le même axe des jours (`stack` et `stackWeight`
de Chart.js), la note sur deux tiers, les tasses sur un tiers. Sa hauteur
est fixe : c'est la carte des constats, trop haute, qui l'étirait. Les
constats défilent donc dans la même case de grille, un seul visible.

**Les analyses en onglets.** Six cartes empilées se faisaient défiler sans
être lues. Une carte, un onglet par question, une phrase de lecture par
graphique, qui se tait sous les seuils habituels. Les panneaux ne sont
jamais en `display: none` : un graphe Chart.js créé dans un conteneur caché
naît à 0 x 0 et ne se remesurait pas de façon fiable. Ils sont empilés dans
la même case de grille, invisibles et `inert` sauf le courant.

### La preuve sous chaque constat (v8.36)

Les sept règles d’insight se taisent tant qu’un écart n’atteint pas 0,4 point
avec trois tasses notées de chaque côté. Sur les données de Chris elles
parlaient donc rarement, et toujours de la même chose : la carte avait l’air
d’un texte figé, ce qu’il a fini par demander (« c’est un truc statique
non ? »).

Elle ne l’était pas. Ce qui manquait n’était pas du calcul mais de quoi JUGER :
une phrase seule demande de croire sur parole. Chaque règle rend maintenant un
objet et non une chaîne : la phrase, le côté gagnant et le côté comparé, chacun
avec son libellé, sa moyenne et son effectif. Dessous s’affichaient (v8.36) deux barres à
la même échelle, celle des notes sur 10 (et non normalisées sur l’écart, qui
ferait passer 0,4 point pour un gouffre), puis le total en pied.

Le niveau de confiance est volontairement grossier et nommé comme tel : « écart
solide » à partir de 0,8 point avec cinq tasses de chaque côté, « écart
probable » sinon. Ce n’est pas un test statistique et la carte ne prétend pas
le contraire ; les seuils d’affichage, eux, n’ont pas bougé.

Les phrases ont perdu leurs chiffres au passage : ils sont dans la preuve, et
les lire deux fois ne disait rien de plus. C’est la même règle que pour la
bulle du commentaire supprimée en v8.33.

**v8.37 : sur une ligne.** Deux rangées de barres et un pied à part faisaient
164 px par constat, et le graphe des trente jours, qui s’étire à la hauteur de
sa voisine pour ne pas laisser de trou, montait à 370 px de dessin. La preuve
tient maintenant sur une ligne : une réglette de 0 à 10 avec deux points, les
deux moyennes, puis « Solide · 5 et 9 tasses ». Hauteur revenue à celle
d’avant la v8.36, mesurée à 1600 px contre la v8.25. Les libellés des deux camps
ne s’affichent plus, ils répétaient la phrase ; ils restent le nom accessible de
la réglette.

### La refonte « Comptoir » : la peau, et ce qu'elle a coûté

Direction artistique validée sur maquette le 13 septembre 2026 : papier chaud,
encre espresso, un seul accent terre cuite. Livrée par étapes, une version par
étape. Ce qui suit est ce qu'on ne redevine pas en lisant le CSS.

**Aucune teinte verte, nulle part, y compris pour dire « bon ».** C'est une
demande explicite de Chris, deux fois. Le jeton `--ok` existe toujours, pour ne
pas réécrire les trente règles qui l'utilisent, mais il vaut désormais l'accent.
Le « mauvais » garde `--danger`. Un test refuse maintenant la BANDE verte du
cercle des teintes (75 à 165 degrés, saturation et luminosité franches) et non
plus le seul `#1baf7a` : un test écrit sur une couleur laisse passer la
suivante, et c'est exactement ce qui était arrivé avec le vert sauge qui avait
remplacé l'émeraude. Première version de ce test, d'ailleurs, ratée : elle
exemptait toute ligne contenant le mot « vert », si bien qu'une règle nommée
`.essai-vert` passait sans bruit. Il retire maintenant les commentaires avant
de chercher, plutôt que de filtrer sur des mots.

**Cinq couleurs de la maquette ont été assombries.** Le brief demandait lui-même
un contraste d'au moins 4,5:1 pour le texte atténué, et sa propre palette ne le
tenait pas : onze paires sous le seuil. La correction porte sur la luminosité
seule, la teinte de la DA est conservée, et le calcul se fait sur la plus sombre
des quatre surfaces où la couleur peut se poser (`--panneau`, `--fond`,
`--panneau-2`, `--rail`) et non sur la seule qui arrangeait.

| Jeton | Maquette | Retenu | Pire ratio |
|---|---|---|---|
| `--attenue` clair | `#8a7462` | `#746152` | 3,42 devient 4,55 |
| `--accent` clair | `#a85a1e` | `#9a521c` | 4,00 devient 4,52 |
| `--danger` clair | `#c4503b` | `#aa4533` | 3,57 devient 4,50 |
| diagnostic « un peu acide » | `#b0651f` | `#95551a` | 3,44 devient 4,52 |
| `--danger` sombre | `#e06c5a` | `#e37867` | 4,07 devient 4,50 |

Les couleurs de DONNÉES (`#2a78d6`, `#eb6834`, `#cc79a7`) échappent à la règle
et n'ont pas bougé : ce sont des aplats et des traits, leur seuil est celui des
objets graphiques, 3:1, et elles le tiennent.

**`--sur-accent` a dû devenir une couleur de THÈME.** Elle était commune aux
deux, un blanc crème. Posée sur l'accent du thème sombre, qui est un orange
clair, elle ne donnait que 2,66:1 : le texte des boutons pleins était illisible
en thème sombre, et l'était déjà avant la refonte. Le thème sombre prend
maintenant l'encre (6,10:1), le thème clair garde le crème (5,02:1).

**Les polices sont dans le dépôt, pas sur un CDN.** La règle « aucune dépendance
réseau » n'est pas négociable : le site s'ouvre en `file://` et doit marcher
hors ligne. Un lien vers `fonts.googleapis.com` afficherait le repli à la
première ouverture sans réseau et ferait clignoter la page ensuite. Cinq
fichiers woff2, 92 Ko en tout, sous licence OFL qui autorise explicitement la
redistribution.

**Instrument Serif ne couvre pas le vietnamien**, et ça se voit. Google Fonts
n'en publie pas de sous-ensemble vietnamien : les caractères comme ạ, ế, ữ
retombent glyphe par glyphe sur Georgia. Un nom de café vietnamien affiché en
serif, et la maquette en affiche un en 30 px sur la carte « Dernière tasse »,
est donc typographiquement mixte sur deux ou trois lettres. La DA ayant été
validée sur maquette, la police n'a pas été changée unilatéralement ; Manrope,
lui, embarque bien le vietnamien, donc tout le texte courant est propre. À
revoir avec Chris s'il trouve ça laid.

**Treize colonnes deviennent dix, et le commentaire prend sa propre ligne.**
Chris voulait de la place pour le diagnostic et son commentaire, et se passe du
temps, des degrés et du feu dans la ligne. Ces trois là retournent dans le détail
déplié : le détail montre ce que la ligne ne montre pas, et la ligne vient de
changer.

La mesure a tranché la suite. Le contenu des dix colonnes demande **1741 px** de
large pour **992** disponibles dans la carte : quelque chose doit se tronquer,
c'est arithmétique. Donner une colonne au commentaire lui offrait 50 à 150 px,
soit trois mots. Il passe donc SOUS sa ligne, en pleine largeur, comme un
intertitre de jour : il gagne les 992 px entiers, n'est plus tronqué du tout, et
les colonnes chiffrées restent lisibles. La table ne défile plus horizontalement.

**Une cellule ne se tronque jamais : celle des actions.** Elle demandait 137 px
pour 129 offerts, dont 24 px de marge interne inutile sur une rangée de boutons.
Un bouton tronqué est INATTEIGNABLE, c'est une panne et pas un défaut de mise en
page. La marge saute, les cinq boutons tiennent, vérifié en mesurant chacun
contre les bords de sa cellule.

**L'écran Paramètres vivait hors de `<main>`.** Il était posé après `</main>`,
entre deux modales, et héritait donc de la largeur de la FENÊTRE : il commençait
à 0, passait sous le rail et faisait 1293 px quand les autres en font 993. Ce
n'est pas une régression de la refonte, il n'y a jamais été ; ça ne se voyait pas
tant que `main` n'était qu'une colonne centrée, et le rail l'a rendu criant.

**La place de la barre de défilement est réservée en permanence.** Un écran court
(Mes réglages) était 15 px plus large qu'un écran long (le tableau de bord), et le
contenu sautait latéralement à chaque changement d'onglet. `scrollbar-gutter:
stable` règle ça en une ligne.

**Les cartes d'une rangée s'étirent à la même hauteur.** Alignées sur le haut,
elles laissaient un trou sous les plus courtes. Chris demandait des widgets
déplaçables et redimensionnables ; l'étirement règle le symptôme pour une ligne de
CSS, là où un tableau de bord manipulable demande un état persistant, une
synchronisation, une version téléphone et un accès clavier. À reprendre comme
chantier à part s'il le veut vraiment.

**Les chiffres du calendrier passent en lignes.** La carte ne fait qu'un tiers de
largeur : en colonnes, « tasses par semaine » se coupait en deux et chaque case
prenait 70 px de haut pour un chiffre et un mot. Et quand la grille défile, elle
part de la DROITE, sur la semaine en cours : commencer sur les semaines les plus
anciennes montre exactement ce qu'on ne vient pas voir.

**La base passe de 15 à 16 px.** Chris lit sur un 4K et se sentait mieux à 110
pour cent de zoom.

**Retour au curseur pour la note.** Le stepper visait juste sur le papier, Chris
prefere le curseur, et c'est son carnet. Le stepper est retire en ENTIER, HTML,
JS et CSS : laisser les deux dans le code, c'est laisser la question ouverte pour
la prochaine session, qui ne saura pas lequel fait foi.

**Le champ des secondes etait coupe.** 53 px pour 59 px de contenu : le « 45 »
perdait son 5. Les deux pixels de marge interne ajoutes a l'etape 7 et les
fleches du champ numerique ne tenaient plus dans une colonne de 175 px. Les
fleches partent, elles ne servent a rien sur un champ de deux chiffres qu'on
tape et `inputmode="numeric"` donne deja le bon clavier au telephone. Un balayage
de tous les champs visibles, sur les six ecrans et les deux machines, confirme
que c'etait le seul du site.

**Le feu par défaut vit à TROIS endroits, et le quatrième est une migration.**
Chris a redemandé 3 ; l'échelle avait déjà fait 3, puis 4, puis 2. Changer la
valeur demande de toucher la semence des recettes (`recettes.js`), le repli
d'usine de l'interface (`ui-noyau.js`) et le défaut du schéma des réglages
(`data-schema.js`), puis d'ajouter un pas de schéma pour les recettes déjà
enregistrées. En oublier un laisse un carnet neuf et un carnet existant annoncer
deux feux différents, sans que rien ne le signale. Un test compare désormais les
trois sources entre elles.

Au passage, le contrôle « des valeurs valides passent telles quelles » utilisait
3 comme valeur d'essai : 3 étant devenu le défaut, il ne prouvait plus rien,
puisqu'une valeur rejetée serait retombée sur le même chiffre. Il utilise 5.

**Le repli de la bouilloire passe de zéro à deux minutes.** Une session
précédente avait choisi zéro, avec une raison valable : sans mesure, une valeur
d'usine INVENTÉE produirait des degrés faux d'apparence sérieuse. Son prix était
que `temperatureDepuisChauffe()` refuse de calculer sans temps d'ébullition, donc
l'estimation ne partait JAMAIS tant qu'on n'allait pas la régler dans Paramètres,
ce que rien ne disait au moment où on tapait un temps de chauffe. Chris a mesuré
sa bouilloire, 2 minutes du robinet au gros bouillon et 1 min 30 au stade des
petites bulles qui remontent : la valeur n'est plus inventée, le raisonnement
d'origine ne s'applique plus. Le modèle linéaire donne 82 degrés à 1 min 30, ce
qui tombe dans la bande observée, et un test le verrouille.

Le défaut qui compte est celui du SCHÉMA (`data-schema.js`), pas la constante
d'interface : c'est lui qui alimente `replis.ebullition`. Changer la constante
seule ne faisait rien, ce qui a coûté un aller-retour.

**Le chrono est repliable, et passe sous la fiche recette.** Demande de Chris :
la recette se relit à chaque étape, le chrono ne sert que pendant l'extraction,
et c'est pourtant lui qui occupait le haut de la colonne. Deux règles tiennent ce
repli. Le temps vit dans l'ENTÊTE et non dans le corps, donc il reste lisible
replié : un chrono qu'il faut déplier pour lire ne sert à rien. Et il s'ouvre
tout seul au démarrage et refuse de se replier tant qu'il tourne : se refermer
sur un chrono en marche, c'est perdre les paliers et le bouton d'arrêt au moment
précis où on en a besoin.

**Le déplacement du chrono a emporté les deux tiers du formulaire.** C'est la
panne la plus grave de la série, et elle a vécu de la v8.3 à la v8.10. Pour
sortir le chrono du formulaire, le script d'édition cherchait la `<section>`
précédant `id="chrono-total"`. Or le chrono n'est pas une `<section>` mais un
`<div class="chrono carte">` : la recherche est remontée jusqu'à la section du
BLOC 2, et le déplacement a emporté « Les réglages », le chrono ET « En bouche »
dans la colonne de droite, en collant au passage la classe de la carte sombre
sur l'ouverture du bloc 2. Le formulaire ne contenait plus que le bloc 1, et
tous les champs de saisie vivaient à droite, habillés en carte sombre.

Les cinq suites sont restées vertes pendant tout ce temps. Aucune ne regarde OÙ
vit un champ : le faux DOM cherche par identifiant, et un identifiant se trouve
aussi bien dans un `<aside>` que dans un `<form>`. Le contrôle « autant de
cellules que d'en-têtes » et l'audit de contraste ne regardent pas non plus la
structure. Il a fallu que Chris ouvre la page.

Un test découpe maintenant le HTML aux frontières réelles du formulaire et de sa
colonne, et vérifie de quel côté tombe chacun des douze champs de saisie, que les
trois blocs numérotés sont dans le formulaire et dans l'ordre, que le chrono est
dans la colonne, et qu'aucun bloc de formulaire ne porte la carte sombre.

Il a trouvé au passage que `#f-date`, remonté dans la tête de page, était un
contrôle orphelin hors des balises du formulaire. Il porte désormais
`form="form-saisie"`, le rattachement officiel de HTML.

**Leçon d'outillage : on ne découpe pas du HTML en cherchant une balise.** Les
deux dérapages de cette série viennent de là, un `lastIndexOf("<section")` et un
`indexOf("    </div>")` qui ont attrapé la mauvaise occurrence. La reconstruction
s'est faite par numéros de ligne, avec une assertion sur le premier et le dernier
caractère de chaque tranche et sur les identifiants qu'elle doit contenir. C'est
plus long à écrire et ça échoue bruyamment quand on se trompe, ce qui est
exactement ce qu'on veut.

**Un écran ne se met pas en page lui-même.** Deuxième moitié de la même leçon.
`#ecran-saisie` n'a qu'UN enfant, `.saisie-layout`, qui portait déjà la grille
« formulaire plus colonne fixe » depuis longtemps. En posant une seconde grille
de deux colonnes sur l'écran, tout le formulaire tombait dans la colonne 1 et les
360 px de la colonne 2 restaient vides : le contenu paraissait serré et décalé
vers la droite, sans que rien ne soit en erreur nulle part. La mise en page
appartient au conteneur qui a réellement plusieurs enfants à répartir.

La tête de page de la saisie est sortie du formulaire à cette occasion : dans le
formulaire elle ne surplombait que la colonne de gauche, alors que sur tous les
autres écrans elle couvre la largeur.

Un test refuse maintenant qu'un sélecteur `#ecran-*` déclare
`grid-template-columns`. Volontairement strict : si un écran en a besoin un
jour, l'auteur verra le test, lira pourquoi, et posera la règle sur un
enveloppeur.

**Ce que ces deux pannes disent des tests.** Aucune des cinq suites ne charge de
CSS, et l'audit de contraste regardait les couleurs sans jamais regarder la
géométrie. Les deux bugs de mise en page de cette série sont donc passés entiers
à travers tout ce qui existe, et n'ont été vus que parce que Chris utilisait le
site. Les deux tests ajoutés couvrent les deux pièges précis rencontrés, pas la
famille : une vérification réelle demanderait un navigateur, ce que le projet
n'a pas (voir « Tests »). D'ici là, une modification de mise en page se regarde
dans un navigateur avant d'être poussée, et on mesure les rectangles plutôt que
de juger sur une capture.

**Le basculement d'écran ne tient qu'à la spécificité, et ça a cassé.** Toute la
navigation repose sur deux lignes : `.ecran { display: none }` puis
`.ecran.actif { display: block }`. La mise en page de la saisie a été écrite
`#ecran-saisie { display: grid }`, et un sélecteur d'identifiant bat une classe :
le `display: none` ne s'appliquait plus, la saisie restait affichée en permanence
et les autres écrans s'empilaient dessous au lieu de la remplacer.

Les cinq suites étaient vertes et l'audit de contraste aussi, parce qu'aucun des
deux ne regarde QUEL écran est visible. Le harnais de `boot.test.mjs` n'a pas de
CSS du tout, et l'audit mesurait chaque écran après l'avoir activé, sans jamais
vérifier que le précédent avait disparu.

Un test refuse maintenant toute règle qui pose un `display` sur un `#ecran-*`
sans exiger `.actif`. La règle, pas le cas : n'importe quel écran referait la
même panne demain.

**La carte sombre redéfinit ses JETONS, elle n'habille pas ses descendants.**
Première version fausse, et pas qu'un peu : en thème clair, `.carte-sombre` pose
un fond `--encre` mais tout son contenu continuait d'écrire en `--encre`. Encre
sur encre, 1,00 de contraste, du texte littéralement invisible dans la carte des
insights et dans le chrono. Seuls le titre et les liens avaient été traités, ce
qui est exactement le piège : habiller les descendants un par un marche jusqu'au
premier descendant qu'on ajoute ensuite. Le sous-arbre redéfinit maintenant
`--encre`, `--texte`, `--attenue`, `--accent`, `--lignes` et `--panneau`, donc
tout ce qui hérite est couvert d'avance. Le fond de la carte passe par un jeton
dédié, `--carte-sombre-fond`, puisque `--encre` change de sens à l'intérieur.

**Les pastilles de machine ne portent plus de texte sur la couleur.** Le crème
sur le vermillon du Switch donnait 2,75:1, le bleu de la Brikka 3,80:1. Les
couleurs de données sont intouchables, mais rien n'obligeait à écrire DESSUS :
la pastille est devenue un point de couleur suivi du nom en texte normal, ce que
la DA décrivait d'ailleurs.

**Mesurer le contraste sur un volet masqué donne de faux positifs.** L'audit
signalait cinq échecs de plus, tous avec des couleurs du thème sombre sur des
fonds clairs. Explication : quand la page n'est pas visible, le navigateur gèle
les transitions CSS, et `getComputedStyle` rend la couleur d'AVANT la bascule
pour toute propriété qui transitionne. Il faut couper `transition` et
`animation` avant de mesurer. Sans ça on court après des pannes qui n'existent
pas, et on finit par ne plus croire l'outil.

L'audit final passe les six écrans dans les deux thèmes : zéro élément de texte
sous 4,5:1, ou 3:1 pour les grandes tailles.

**Les filtres de l'historique restent des `<select>`, habillés en pastilles.** Le
brief demande « cliquer une pastille ouvre le menu correspondant » : c'est
exactement ce que fait un select natif, et il le fait mieux qu'un menu écrit à la
main, qui devrait réapprendre le clavier, la frappe au début d'un mot et la roue
du téléphone. Le dessin s'obtient en CSS, la logique de filtrage n'a pas bougé.

**Le groupement par jour ne s'applique QUE si le tri est par date.** Grouper par
jour un tableau trié par note ferait réapparaître « Aujourd'hui » à trois
endroits différents : deux ordres se disputeraient la même liste. Les autres tris
rendent donc une liste plate, comme avant.

**Les goûts partagent la cellule Diagnostic au lieu de prendre une colonne.**
Une colonne de plus demande quatre retouches coordonnées (voir « Le piège des
largeurs figées ») et se décale en silence si on en oublie une. Le brief les
décrit d'ailleurs comme une seule colonne.

**Deux contrôles ont dû être corrigés, pas contournés.** Celui qui compare les
cellules aux en-têtes tombait sur un intertitre de jour, qui est un `colspan` et
non une extraction : il cherche maintenant la première ligne de DONNÉES, ce
qu'il a toujours voulu dire. Celui qui vérifie les noms accessibles lisait les
COMMENTAIRES : un commentaire citant `<select>` devenait un champ sans nom. Il
retire les commentaires d'abord, comme la chasse au vert le fait déjà.

**La saisie rapide dit enfin ce qu'elle enregistre.** Sa note de bas de panneau
annonçait « Dose, eau, température et mouture reprennent la recette » sans jamais
dire LESQUELLES : il fallait connaître la recette par coeur pour savoir ce qu'on
venait d'écrire en trois clics. Elle affiche maintenant les chiffres, avec la
pastille de machine, qui était la seule information de méthode absente de cette
feuille.

**Le bouton flottant change de dessin, il ne tourne plus.** Une tasse pivotée de
90 degrés ne dit pas « fermer », elle dit « tasse de travers ». Les deux icônes
cohabitent dans le bouton et le CSS en cache une ; elles sont en trait, comme
toute la navigation, l'emoji est parti.

**Le chrono a quitté le formulaire.** Il vit maintenant dans la colonne fixe de
droite, avec la fiche recette et la fiche café : ce sont des choses qu'on LIT
pendant qu'on remplit, pas des champs. Le déménagement est sans risque parce que
`$f()` est un `querySelector` mis en cache et non une recherche dans le
formulaire, et parce que l'enregistrement lit les champs par identifiant. Sur
téléphone il redevient un bandeau collant en haut de l'écran : pendant une
extraction c'est la seule chose qui compte, et elle était en bas de page.

**La note est un stepper, mais `#f-note` existe toujours.** Le curseur demandait
de viser un demi point sur une piste de dix, au doigt. Deux boutons et un chiffre
font la même chose sans viser. Le `range` est devenu un `input` caché qui porte
la valeur : le brouillon, le chargement d'une extraction et l'enregistrement
continuent de le lire, et n'ont rien appris du stepper. Depuis « pas encore
notée », le premier appui pose la valeur affichée telle quelle au lieu de la
décaler, sinon un plus donnerait 5,5 sur un écran qui montrait 5.

**La reprise de brouillon mentait sur la note.** `restaurerBrouillon` écrivait
`#note-affichee` à la main avec la valeur brute du champ, en ignorant « pas
encore notée ». Après la reprise d'un brouillon non noté, l'écran annonçait « 5 »
alors que l'enregistrement allait ranger la tasse comme NON NOTÉE, donc hors des
moyennes, des insights et des meilleurs réglages. Le curseur étant lui aussi posé
sur 5, rien ne trahissait l'écart. Un test impose maintenant qu'un seul fichier
écrive cet élément, et à un seul endroit : tout autre code qui y touche est un
second avis sur la même question, et c'est ainsi qu'ils divergent.

**`#saisie-titre` est passé sur la surligne.** Le JS y écrit « Nouvelle
extraction », « Modifier l'extraction » ou « Extraction dupliquée », c'est donc
lui qui dit ce qu'on est en train de faire. Le titre de page, « Une tasse de
plus », ne bouge pas. Garder l'identifiant sur la surligne évitait de toucher aux
trois endroits qui l'écrivent.

**Le contrôle de machine n'était décrit qu'une fois de trop.** Les nouvelles
règles, posées en fin de feuille, ne gagnaient pas : `.btn-methode.brikka.actif`
compte trois classes contre deux, la spécificité l'emportait sur l'ordre.
L'ancien bloc a été retiré plutôt que le nouveau gonflé, sinon deux descriptions
du même bouton cohabitent pour toujours.

**Le tableau de bord garde deux cartes que le brief avait oubliées.** « Note
contre mouture » et « Note moyenne par recette » ne figurent dans aucune des
quatre rangées décrites. Ce sont des oublis de rédaction, pas des suppressions
demandées : la consigne « toutes les fonctionnalités actuelles restent, sans
exception » l'emporte sur le silence d'une liste. La rangée des analyses en
compte donc six et non quatre.

**Quatre tuiles de chiffres au lieu de sept.** Sept chiffres alignés se comptent
au lieu de se lire : on cherche celui qu'on voulait. Les quatre qui restent sont
ceux qui bougent d'un jour à l'autre. Le total, la note globale et la caféine
passent en une ligne de texte sous la grille, où ils se lisent quand on les
cherche sans occuper le coup d'oeil.

**Un bouton était mort depuis la v7.3.** « Charger la démonstration », sur le
tableau de bord vide, portait un identifiant que personne n'écoutait. Son voisin
marche par `data-va` ; lui attendait un gestionnaire qui n'a jamais existé.
C'est le premier bouton que voit quelqu'un qui ouvre le carnet sans données. Un
bouton mort ne lève rien et ne s'écrit nulle part : il fallait cliquer dessus au
bon moment pour le voir. Un test refuse maintenant tout bouton porteur d'un
identifiant que le JS ne mentionne nulle part, les boutons délégués par attribut
(`data-va`, `data-ferme`, `data-ecran`) étant écartés. Première version de ce
test fausse, d'ailleurs : elle cherchait les identifiants dans `SCRIPTS`, qui ne
porte que la couche de données, donc les quarante-six boutons du site
ressortaient morts d'un coup. Un test qui accuse tout le monde n'accuse
personne.

**Le test du badge « ratée » vérifiait un nom de classe.** Il a cassé dès que les
cinq dernières sont passées en table, où la marque s'appelle autrement. Il
vérifie maintenant la règle : le mot que Chris lit est présent, et la ligne porte
un état distinct, quel que soit le nom donné à l'un ou à l'autre.

**Le rail et la feuille « Plus » sont le même élément.** C'est le point qui
surprend en lisant le HTML. La raison est prosaïque : `app.js` câble
`#btn-lang`, `#btn-theme` et `#btn-donnees` par identifiant. Un rail et une
feuille séparés auraient dupliqué ces trois boutons, et le second exemplaire
n'aurait jamais répondu, en silence. Un test refuse maintenant qu'un de ces
identifiants apparaisse deux fois dans la page.

**Le faux DOM des tests inventait n'importe quel élément, et ça a mordu.**
`parSelecteur`, dans `tools/boot.test.mjs`, fabriquait un élément pour tout
sélecteur qu'on lui donnait. Le harnais ne pouvait donc PAS voir un élément
supprimé : en retirant l'entête, `#btn-cafes-entete` et `#btn-recettes-entete`
ont perdu leur bouton, leur `addEventListener` est resté, les cinq suites sont
restées vertes, et le site plantait au premier chargement dans le navigateur,
avant même d'afficher le tableau de bord. Un sélecteur d'identifiant SIMPLE rend
maintenant `null` quand l'identifiant n'est pas dans `index.html`, comme un vrai
navigateur ; les sélecteurs de classe restent permissifs, le harnais ne modélise
pas le CSS. Une liste `IDS_DYNAMIQUES`, vide aujourd'hui, sert aux éléments que
le JS crée lui-même : toute entrée qu'on y met est une dette.

Les deux modales n'ont rien perdu au passage : `#btn-gerer-cafes` sur l'écran
Saisie et `#btn-gerer-recettes` dans le Guide les ouvraient déjà, les boutons
d'entête n'étaient que des raccourcis en double.

**Les polices n'ont pas de `?v=`.** La version vit à trois endroits déjà
(`index.html`, `sw.js`, et le `?v=` de chaque script) ; en ajouter un
quatrième dans la feuille de style serait un oubli de plus à chaque montée.
`worker/index.js` leur accorde donc le cache d'un an sur la seule foi de
l'extension `.woff2`, ce qui suppose un contrat : on ne réécrit jamais un
fichier de police sous le même nom. Sans cette ligne, les cinq polices
repartaient revalider à chaque ouverture.

### Un seul cadre, et le bug qui l'a imposé

L'historique était calé à gauche sur les écrans larges pendant que ses voisins
étaient centrés, et ce n'était pas voulu. La cause : deux règles d'identifiant
héritées de l'ancien élargissement par marge négative, dont
`#ecran-historique { width: auto; margin-left: 0 }`, écrite pour ANNULER la
première quand le rail est arrivé. Une règle d'identifiant bat la classe, donc
ce `margin-left: 0` battait le `margin-inline: auto` de `.ecran`. Mesuré à
2400 px : l'historique commençait à 272 px.

La saisie avait le même défaut sous une autre forme : `.saisie-layout`
plafonnée à 1240 px sans marge automatique, dans un écran de 1560 centré, donc
une bande vide à droite.

Le cadre est maintenant UN jeton (`--cadre`) et UNE règle (`.ecran`). Le test
qui existait vérifiait qu'un écran borné était centré ; il a été remplacé par
son contraire : aucun `#ecran-*` ne pose de largeur ni de marge, jamais. Le
premier test disait « si tu le fais, fais-le bien », le second dit « ne le fais
pas », et c'est le second qui empêche la récidive. Il retire les commentaires
avant de chercher, sinon un commentaire qui cite `#ecran-saisie` compte comme
une règle.

### La consolidation de la feuille de style, vérifiée par empreinte

Quarante-trois sélecteurs de premier niveau étaient définis deux ou trois fois
dans `styles.css`, la dernière copie gagnant par ordre : `.btn`, `.modale`,
`.saisie-bloc`, `.bandeau-live`, `.historique-filtres-actions` (trois fois)...
Ce sont les blocs « refonte Comptoir, étape 4, 6, 7 », écrits en fin de fichier
pour redéfinir ce qui précédait. Lisible pendant la refonte, intenable après :
pour changer un bouton il fallait trouver ses trois définitions et savoir
laquelle gagne.

La fusion est mécanique (`tools/` n'en garde pas le script, il a servi une
fois) : chaque propriété prend sa DERNIÈRE valeur, comme la cascade le faisait,
et le résultat s'écrit à la PREMIÈRE position du sélecteur. La première position
et non la dernière : `.btn-primaire` est défini juste après le premier `.btn`,
et un `.btn` fusionné en fin de fichier serait passé devant lui à spécificité
égale. Les commentaires attachés aux copies supprimées sont partis avec elles ;
ceux qui expliquaient une valeur non évidente ont été remis sur la règle
fusionnée.

La vérification ne pouvait pas venir des tests, qui ne chargent pas de CSS. Elle
s'est faite dans le navigateur : une EMPREINTE des styles calculés (trente-cinq
propriétés plus le rectangle) de chaque élément des six écrans, dans les deux
thèmes, à 1600 px puis à 400 px, prise avant la fusion et comparée après.
Transitions et animations coupées pendant la mesure, curseurs de compteurs et
calendrier exclus, sans quoi la même feuille chargée deux fois donnait mille
écarts de bruit. Résultat : zéro écart sur ordinateur, et UN sur téléphone, sur
`#btn-enregistrer` : 52 px avant, 54 après. C'est un bug corrigé et pas une
régression : la règle téléphone `.btn-grand { min-height: 54px }` vivait entre
la deuxième et la troisième définition de `.btn-grand`, et la troisième la
battait. Elle était écrite pour ne jamais s'appliquer.

### Le découpage de l'interface : le piège silencieux, et ce qu'il a trouvé

#### Le piège, et il est silencieux

**Ne jamais partager un `let` par emprunt.** La déstructuration lie une VALEUR :
un fichier qui emprunte une variable réassignée plus tard par le noyau reste figé
sur la valeur du chargement, pour toujours, sans que rien ne le signale. C'est
arrivé pendant le découpage lui-même, sur l'écran courant : `ecranCourant` et
`ouvertureEdition` étaient deux `let`, et seule une relecture l'a attrapé.

L'état partagé doit être un OBJET muté en place. C'est déjà la forme de `saisie`,
`chrono`, `tri`, `replis`, et c'est maintenant celle de `nav`
(`{ ecran, ouvertureEdition }`). `tools/modules.test.mjs` refuse tout emprunt
d'une variable réassignable du noyau.

#### Ce que le découpage a trouvé

`enregistrerRapide()` lisait `cafeQ`, un nom qui n'existait nulle part. Le code
est en mode strict, donc cette lecture levait une ReferenceError AVANT l'appel à
`ajouterExtraction` : le bouton d'enregistrement du panneau rapide ne faisait
rien du tout, et la tasse était perdue en silence.

Tant que 3 400 lignes partageaient une portée, aucun outil ne pouvait poser la
question : le nom aurait pu venir de n'importe où dans le fichier. C'est en
séparant les portées qu'elle devient posable. `tools/modules.test.mjs` la pose
maintenant à chaque exécution.

### Migrations : une VERSION DE SCHÉMA, pas des drapeaux

`migrerDonnees()` fait deux choses de nature différente, et il faut les
distinguer.

**Les rattrapages IDEMPOTENTS**, en tête de fonction : renommages de recettes,
fiches café complétées, tasses par défaut, date d'ajout déduite, puissance de feu
des extractions historiques. Ils se reconnaissent à leur condition, du genre « si
le champ est vide » ou « si le tag est absent », donc les rejouer ne fait rien. Ils
peuvent tourner à chaque démarrage sans risque.

**Les rattrapages À USAGE UNIQUE**, dans `PAS_DE_SCHEMA`. Ceux-là changent une
valeur SEMÉE vers une autre valeur, donc les rejouer écraserait un réglage que
Chris aurait choisi volontairement entre temps. Il leur faut une mémoire.

Cette mémoire était un drapeau par migration dans `localStorage`. C'était faux :
les drapeaux sont PAR APPAREIL alors que les données sont PARTAGÉES. Un appareil
qui démarrait avec un stockage vide posait ses drapeaux sur rien, recevait ensuite
le document du serveur non migré, et ne le migrait plus jamais. Ce n'est pas
théorique, c'est arrivé avec les 150 g de chaudière de la Brikka.

La mémoire est maintenant un NUMÉRO DE VERSION rangé dans la ligne `reglages`,
donc synchronisé avec le reste. `appliquerSchema()` exécute les pas dont le numéro
dépasse la version du document, puis écrit `SCHEMA_ACTUEL`. Conséquences :

- un appareil neuf qui reçoit un document déjà migré ne rejoue rien ;
- un document en retard est rattrapé par le premier appareil qui l'ouvre, quel
  qu'il soit ;
- un export CSV porte sa version, donc il se réimporte correctement.

POUR AJOUTER UNE MIGRATION : un pas de plus à la FIN de `PAS_DE_SCHEMA`, avec le
numéro suivant, et `SCHEMA_ACTUEL` incrémenté. **Ne jamais renuméroter, ne jamais
insérer au milieu** : le numéro déjà écrit chez Chris est une promesse. Et chaque
pas ne doit toucher QUE la valeur semée d'avant.

Les tests font tourner le moteur pour de vrai, sur quatre scénarios : document
sans version, document déjà migré, document en retard, et rejeu après un réglage
manuel.

### Les attributs de texte passent par le dictionnaire

Les `placeholder` étaient traduits par un cas codé en dur qui ne couvrait qu'un
seul champ, celui du commentaire. La traduction anglaise du champ de recherche
avait bien été ajoutée au dictionnaire et n'a jamais pu s'afficher.

Ils suivent maintenant la même règle que le texte : `scanner()` les enregistre,
mais SEULEMENT s'ils ont une entrée au dictionnaire. Ce filtre est ce qui rend le
passage sûr. Le fond du champ molette vaut « 1.5.0 » ou « du paquet » selon que
le café est déjà moulu, et c'est le code de saisie qui en décide : sans entrée au
dictionnaire, il n'est jamais capturé, donc jamais réécrit par l'i18n.

Le même registre couvre les TROIS attributs porteurs de texte : `placeholder`,
`title` et `aria-label`. Le parcours ne voit que des nœuds de texte, donc les
infobulles et les étiquettes de lecteur d'écran lui échappaient complètement :
quatorze restaient en français en mode anglais, dont « Navigation principale »,
c'est-à-dire la toute première chose qu'un lecteur d'écran annonce.

Les zones régénérées par le JS (`ZONES_JS`) sont exclues du registre, comme pour
le texte. Y garder une référence serait pire qu'inutile : le nœud est remplacé à
chaque rendu, et le code qui le régénère traduit déjà ce qu'il écrit.

Ajouter une traduction ne demande donc plus de toucher au moteur, juste une
entrée dans `js/i18n.en.js`. Et un test de `tools/data.test.mjs` échoue tant
qu'un attribut français de `index.html` n'a pas la sienne : l'anglais est soit
complet, soit menteur.

### Un état sélectionné ne change QUE des couleurs

`.tag.actif`, `.pilule.actif` et `.nav-btn.actif` passaient le libellé en
`font-weight: 600`. Le gras est plus large que le normal, donc la pastille
grandissait au clic, donc la ligne se réorganisait : cocher "citronné" envoyait
tout le groupe "floral et thé" à la ligne suivante, sous les doigts de Chris.

Le gras était de toute façon redondant. L'état actif porte déjà un fond et une
couleur d'accent, et sur les pilules un fond plein avec du texte presque blanc :
ça se voit de l'autre bout de la pièce.

RÈGLE À TENIR : un état sélectionné ne change que des couleurs. Jamais
`font-weight`, `font-size`, `letter-spacing`, `padding` ni `border-width`. Un
test parcourt les règles `.actif` de `styles.css` et refuse ces cinq propriétés,
donc la règle vaut pour tout ce qui sera ajouté plus tard, pas seulement pour les
trois sélecteurs corrigés. Vérifié en réintroduisant le `font-weight` : le test
échoue.

Le corollaire, pour un état qui DOIT changer une bordure : la déclarer dès l'état
normal et ne changer que sa couleur, ce que font déjà `.tag` et `.pilule` avec
leur `border: 1px solid var(--lignes)`.

### L'infobulle maison, définie une seule fois

Les `title` natifs attendent une seconde, ignorent le thème et écrasent les
sauts de ligne. Le site a donc sa propre bulle : un `::after` alimenté par
l'attribut `data-info`, visible au survol, au focus clavier, et sur
`.info-ouverte` que l'appui long pose au téléphone.

Elle était écrite DEUX fois dans la feuille de style, aux sélecteurs près : une
pour les pilules et les tags, une pour le ratio de la ligne live. Ajouter le
commentaire des dernières extractions en aurait fait une troisième, donc trois
endroits à corriger le jour où la bulle change. La règle porte maintenant sur
l'ATTRIBUT : tout élément qui pose `data-info` obtient la bulle, aujourd'hui et
demain. Un test vérifie qu'il n'en existe qu'une seule définition.

Deux détails qui comptent. Un `data-info` VIDE n'ouvre rien, sinon une bulle
vide apparaîtrait sur les descripteurs sans définition. Et la variante
`.info-dessous` ouvre la bulle SOUS l'élément, indispensable dans une liste où
une bulle au-dessus recouvrirait la ligne précédente, et où celle de la
première ligne recouvrirait le titre de la carte.

### Une couleur, une série

#### Le vert émeraude, et pourquoi il portait deux casquettes

`#1baf7a` se croisait partout, et pour cause : il servait à DEUX choses sans
rapport.

- Une CATÉGORIE : « les deux machines » dans le comparatif, le repère « réglage
  commun » de la réglette, le badge d'une recette par défaut, celui d'un café de
  référence.
- Un SENS : « bon, compatible », pour les barres de goûts au-dessus de la
  moyenne, le trait du réglage par défaut, les boîtes de méthodes compatibles.

Les deux sont séparés depuis la v7.70.

**La catégorie prend `#cc79a7`**, le rose-violet de la palette Okabe-Ito. Ce
n'est pas un choix de goût : cette palette est la référence des couleurs sûres
pour le daltonisme, et son trio bleu / vermillon / rose-violet est exactement la
situation ici, où le bleu Brikka et l'orange Switch étaient déjà posés.
L'émeraude était sûre elle aussi, mais elle criait sur une palette entièrement
chaude. On garde la propriété, on perd le cri.

**Le sens garde un vert**, en sauge (`#6fa98a` en thème sombre). Vert égale bon
est une convention trop utile pour y renoncer ; c'était la saturation qui posait
problème, pas la teinte. Le thème clair était déjà sur un vert profond et n'a
pas bougé.

Le badge d'une recette par défaut est passé au texte SOMBRE au passage : du
blanc n'atteignait que 2,6:1 sur ce rose, et n'atteignait pas mieux sur
l'ancien vert. Sur un rose poudré, le sombre monte à 7:1.

**Reste un point ouvert.** Les barres de goûts opposent `--ok` et `--danger`,
donc vert et rouge, qui est la paire que le daltonisme confond le plus. Les
barres portent leur libellé et leur valeur, donc l'information n'est pas
perdue, mais le codage couleur n'y apporte rien pour un daltonien. À reprendre
le jour où ça compte.

Le graphique principal empilait QUATRE séries et n'avait que trois couleurs. La
ligne des grammes de café et la courbe de tendance des notes portaient toutes
deux `#1baf7a`, le vert réservé aux « deux machines » : indistinguables l'une de
l'autre, et vertes sans rien vouloir dire, sur une palette entièrement chaude.

Les trois couleurs protégées décrivent une MACHINE (Brikka bleu, Switch orange,
les deux vert). Une série qui ne parle pas d'une machine ne doit pas les
emprunter, même quand la teinte est libre à cet endroit du graphique.

- **La tendance** prend la teinte de ce qu'elle lisse, l'accent, en translucide
  (`--tendance`). C'est la même mesure que la ligne des notes, sur le même axe :
  une teinte étrangère la faisait passer pour une troisième donnée. Son
  commentaire disait déjà qu'on doit « la lire comme un fond » ; un vert émeraude
  de 3 px disait le contraire. Même teinte que la note, donc la distinction ne
  repose pas sur la couleur et le daltonisme n'entre pas en jeu.
- **Les grammes** prennent un gris ardoise désaturé (`--grammes`). Sur une
  palette entièrement chaude, une quatrième série a besoin d'une teinte froide
  pour se détacher, désaturée pour ne pas crier. Le bleu vif, l'orange et le vert
  appartiennent aux machines ; le violet, les deux bleus, le jaune et le rose
  sont pris par l'anneau des diagnostics. L'ardoise ne collisionne avec rien.

**Trois séries visibles, pas quatre.** La courbe des grammes de café a quitté le
graphique en v7.66 : quatrième ligne sur un graphique qui en portait déjà trois,
tracée sur un axe caché, elle chargeait la vue sans être lisible. Le chiffre est
passé dans l'infobulle, où il se consulte quand on le cherche. Une donnée qu'on
ne lit qu'occasionnellement n'a pas besoin d'une courbe permanente.

**Pas de rouge sur ce graphique**, malgré la tentation : ici le rouge est
`--danger`, il annonce une mauvaise nouvelle. Une tendance de notes qui monte est
une bonne nouvelle, la peindre en rouge dirait le contraire de ce qu'elle montre.

Les deux teintes vivent dans `css/styles.css`, une ligne par thème : c'est là
qu'il faut aller pour les ajuster, pas dans `charts.js`. Un test vérifie que les
trois courbes tirent leur couleur de trois jetons différents.

## Saisie, chrono et recettes

### Des curseurs, et le champ qui reste maître

Chris règle la dose, l'eau, la mouture, le feu et l'agitation par petits pas
autour d'une valeur connue. Taper un nombre pour passer de 14 à 15 g est le
mauvais geste, surtout au téléphone en cuisine. Ces cinq champs portent donc un
curseur.

**Le champ nombre RESTE, et reste la source de vérité.** Tout le code lit
`$("#f-dose").value`, le brouillon l'enregistre, l'édition le remplit. Le
curseur le PILOTE, il ne le remplace pas. C'est ce qui rend le changement sûr,
et ce qui garde la frappe possible quand on veut une valeur précise. Inverser
les rôles aurait demandé de toucher partout.

Le curseur écrit dans le champ puis **rejoue l'événement `input` du champ**,
parce que c'est lui que le reste du formulaire écoute : ligne live, brouillon,
avertissements. Appeler ces trois-là à la main depuis le curseur aurait marché
un temps, puis on en aurait oublié un.

`majCurseurs()` est appelée depuis `majLive()`, donc après chaque remise à
zéro, chaque préremplissage de recette et chaque ouverture d'extraction : ce
sont les moments où le champ change SANS que le curseur soit touché. Un champ
vide laisse le curseur où il est, parce que le ramener au minimum afficherait
une dose de 5 g que personne n'a choisie.

**La mouture est le cas particulier.** Son champ porte un cadran
`rotation.numéro.cran`, pas un nombre : le curseur court donc sur les CRANS et
la conversion passe par `js/grind.js`, comme le convertisseur du guide.

**Ce qui n'a PAS de curseur, et pourquoi.** La température a déjà son menu
d'estimation sur la même ligne, un troisième contrôle n'y tiendrait pas. Le
volume extrait, le lait et l'eau ajoutée sont des valeurs MESURÉES après coup,
pas des réglages qu'on balaie.

Curseur et nombre tiennent sur UNE ligne. Empilés, chaque cellule de la grille
chiffrée doublerait de hauteur, exactement le défaut que la cellule Température
documente déjà.

Les curseurs portent `aria-labelledby` pointant sur le libellé de leur champ,
plutôt qu'un `aria-label` à eux : zéro chaîne nouvelle à traduire, et les deux
contrôles annoncent la même chose au lecteur d'écran. Un test vérifie que
chaque curseur pilote un champ existant et emprunte une étiquette qui existe.

### Le café est prérempli, la machine non

Chris n'a en général qu'un seul café actif à la fois. Laisser le champ vide sur
une nouvelle saisie était donc un clic pour rien, et un champ vide en tête de
formulaire donne l'impression qu'il manque quelque chose. Il prend le premier
café sélectionnable, celui que le menu propose déjà en tête.

**Le point délicat est ce qu'on ne fait PAS.** Choisir un café À LA MAIN déclenche
`surChoixCafe()`, qui applique aussi la machine et la recette recommandées du
café. Le Là Việt Balanced recommande la Chronicler, donc le Switch : déclencher
cette cascade au préremplissage ferait basculer la machine à chaque nouvelle
saisie, ce qui déborde largement de « remplis ce champ ». Le préremplissage pose
donc la valeur et rien d'autre.

Rien à rebrancher pour autant : `prefillDepuisRecette()`, appelée juste après,
lit déjà le café pour le cas du déjà moulu, et se termine par
`majAvertissements()` qui rafraîchit l'âge du paquet et le panneau latéral.

Le panneau rapide suit la même règle, et pour une raison plus dure : il REFUSE
d'enregistrer sans café. L'ouvrir sur un champ vide garantissait un aller-retour.
Il ne préremplit que si rien n'est déjà choisi, pour ne pas écraser une sélection
en cours.

### La note est FACULTATIVE

Chris enregistre souvent l'extraction en sortant la tasse, puis revient noter
après l'avoir bue. Le formulaire imposait 7 sur 10 par défaut, donc une tasse
oubliée gardait un 7 inventé qui polluait toutes les moyennes.

Un curseur HTML ne peut pas être vide, donc l'absence de note vit dans une case à
cocher `#f-note-vide`, cochée par défaut. Cochée, `noteSaisie()` renvoie `""` et
l'extraction compte comme non notée partout : moyennes, insights, meilleurs
réglages et classements filtrent déjà tous sur `note_sur_10 !== ""`, il n'y avait
donc rien à changer en aval.

Deux détails qui comptent :

- Le curseur démarre à 5, au milieu, et pas à 7. Une position n'est pas une
  proposition, mais autant qu'elle ne ressemble à aucune note en particulier.
- La case se décoche sur `input` ET sur `pointerdown`. Poser le doigt sur le
  curseur là où il est déjà ne déclenche aucun `input` : sans le `pointerdown`,
  Chris aurait cru noter 5 et enregistré une tasse non notée.

Un test vérifie qu'une note vide reste vide jusque dans le CSV. Elle ne doit
JAMAIS devenir 0, qui serait la pire des notes.

**La saisie rapide suit la même règle depuis la v7.91.** Elle imposait encore
un 7 : c'était l'endroit où il était le plus faux, puisque le panneau sert à
enregistrer la tasse en la sortant, avant de l'avoir bue. Case « pas encore
notée » cochée à chaque ouverture, curseur à 5 et grisé, toucher le curseur
décoche, et le toast dit « pas encore notée » au lieu d'un chiffre.

**La case disparaît en v8.40 : c'est le curseur qui n'a pas de pouce.** Noter
demandait deux gestes, régler ET décocher, et le curseur grisé posé sur 5 avait
quand même l'air d'une valeur. Dix cases à toucher ont été maquettées puis
écartées : c'est un stepper de plus, et Chris a déjà choisi le curseur contre le
stepper (v8.12). Le curseur reste donc, mais tant qu'on n'y a pas touché il n'a
ni pouce ni piste remplie, seulement un pointillé et « Touche la piste pour
noter ». L'état vit dans la classe `curseur-inactif`, lue par `UI.noteVide()`,
posée par `UI.marquerNote()` : UNE source de vérité, pas une classe plus une case
qui peuvent diverger. « Effacer la note » ramène à cet état. Deux corrections au
passage : tabuler à travers le curseur le notait (le `keydown` n'était pas
filtré, il ne réagit plus qu'aux touches qui changent la valeur), et le brouillon
perdait une note donnée avant le déchargement de la page (il garde maintenant
`noteVide`). Les règles CSS de l'état inactif ne s'appliquaient pas non plus :
`.curseur-inactif::-webkit-slider-runnable-track` perdait contre
`input[type="range"]::…`, plus spécifique ; elles portent maintenant le même
préfixe.

### Le brouillon a son fichier

`ui-saisie.js` a repassé le plafond de 1 200 lignes en v7.93 avec le temps de
chauffe. Plutôt que de relever le plafond, le brouillon (écriture, planification,
restauration) est sorti dans `ui-brouillon.js`, chargé juste après : il ne
partage avec l'écran que l'objet `saisie`, un objet muté en place donc sûr à
emprunter, et les identifiants des champs. Il appelle l'écran par `UI.` et
l'écran l'appelle par `UI.`, comme entre deux écrans. Un plafond qu'on relève à
la première gêne n'est plus un plafond.

### Durées en minutes et secondes, et brouillon de saisie

**Durées.** `temps_total_s` et `temps_ecoulement_s` restent stockés EN SECONDES,
donc les CSV et l'historique ne bougent pas et il n'y a rien à migrer. Seule la
saisie change : deux champs `-min` et `-sec`, lus par `lireDuree()` et remplis
par `ecrireDuree()`. Piège traité : les deux champs vides rendent `""` et non
`0`, sinon toute extraction sans chrono se retrouverait à zéro seconde au lieu
de "non renseigné".

**Brouillon.** Sur téléphone, quitter l'onglet pendant une extraction suffit à ce
que le navigateur décharge la page, et c'est précisément à ce moment qu'on sort de
l'application. `ecrireBrouillon()` sauvegarde le formulaire dans localStorage.

- Volontairement HORS des données synchronisées. Un brouillon est propre à un
  appareil; le pousser sur le serveur ferait apparaître une saisie fantôme sur
  l'autre.
- Jamais sauvegardé pendant l'ÉDITION d'une extraction existante
  (`saisie.editId`), sinon le brouillon écraserait le formulaire au démarrage
  suivant avec des valeurs appartenant à une ligne déjà enregistrée.
- Restauré seulement si `brouillonUtile()` : sans ce test, le formulaire vierge
  sauvegardé au premier chargement déclencherait un message "brouillon repris" à
  chaque ouverture.
- Périmé après 24 h.
- Écrit sur `visibilitychange` vers `hidden` sans attendre le debounce : c'est
  le dernier événement fiable avant qu'un navigateur mobile décharge la page.
- Effacé à l'enregistrement, jamais avant.

### Mise en page du formulaire de saisie

Trois défauts cumulés, corrigés en v7.22 :

1. DEUX grilles `.grille-nombres` se suivaient, chacune laissant des cellules
   vides en fin. Il n'y en a plus qu'UNE, les champs s'y enchaînent.
2. Les cases à cocher vivaient dans cette grille alors qu'elles n'ont pas de
   libellé au dessus de leur contrôle : elles se calaient donc plus haut que
   leurs voisines. Elles sont sorties dans `.options-saisie`, un groupe à part.
3. `.champ` porte un `margin-bottom` qui s'ajoutait au `gap` de la grille, d'où
   des espacements irréguliers. Neutralisé dans la grille.

Deux réglages qui ne sont PAS arbitraires :

- `minmax(220px, 1fr)` donne quatre colonnes sur écran large. En Brikka les
  champs visibles remplissent alors exactement deux lignes.
- AUCUN champ de cette grille ne s'étend sur deux colonnes. Un élément large ne
  tient pas dans une fin de ligne et bascule seul sur la suivante, ce qui créait
  un trou au MILIEU du formulaire (cas d'une recette au lait). Toutes les cellules
  font une colonne, les espaces restants sont donc toujours en fin.
- `align-items: start` : un champ portant une aide sous son input étirait sa
  cellule et décalait ses voisins.

La case "eau préchauffée" est MASQUÉE sur la famille `brikka-classique`
(`majChampPrechauffe`, `FAMILLES_PRECHAUFFAGE` dans recettes.js) : le
préchauffage y est la différence entre les deux variantes, donc la case ferait
doublon avec le choix de recette et permettrait d'enregistrer une contradiction.
La valeur stockée se déduit alors de la recette, ce qui garde `eau_prechauffee`
juste sur toute l'histoire. Elle reste visible sur les autres recettes Brikka.

### La case « eau préchauffée » est toujours là sur la Brikka

Depuis la v7.22 elle était MASQUÉE quand la recette appartenait à la famille
Brikka classique, au motif que la variante de recette tranchait déjà la question.
Logique, et faux à l'usage : Chris ouvre la saisie sur la Brikka et ne voit pas
la seule option qu'il attend. La case est visible sur toute la Brikka depuis la
v7.95, et le risque de contradiction est traité dans l'autre sens : sur cette
famille, cocher bascule la recette sur la variante « eau préchauffée », décocher
revient à la Standard, et choisir la recette coche la case (`surPrechauffe`,
`majChampPrechauffe`). Une seule vérité, la recette, mais deux portes pour la
changer. Sur les autres Brikka (au lait), la case reste une donnée de la tasse.

### Le temps d'ébullition n'a pas de valeur d'usine

La première version posait 4:00 par défaut, « l'ordre de grandeur d'une
bouilloire d'un demi litre ». Chris a vu « elle bout en 4:00 » et a demandé d'où
ça sortait : de nulle part, et sa bouilloire frétille déjà à 1:45. Un défaut
inventé produit des degrés faux d'apparence sérieuse, ce qui est pire que pas de
degrés. Depuis la v7.95, zéro veut dire « pas encore chronométrée » : aucune
estimation n'est faite, et l'aide sous le champ explique la mesure à faire une
fois, de l'eau du robinet au GROS BOUILLON, quand toute la surface roule. Les
premières petites bulles vers 1:45 ne sont pas l'ébullition : c'est l'air
dissous qui sort de l'eau vers 60 ou 70 degrés. Le frémissement vient plus tard,
et le bouillon franc après. C'est ce dernier repère qui cale le modèle linéaire.

Suite, v7.98 : le 4:00 restait affiché, parce que la première version l'avait
ÉCRIT dans la ligne `reglages` synchronisée ; changer le défaut ne change pas
une valeur stockée. Chris a précisé son observation : vers 1:30, beaucoup de
petites bulles au fond et quelques-unes qui remontent nettement. Ce n'est plus
l'air dissous, c'est le début de l'ébullition sur le fond, avec une eau à 85 ou
90 degrés en masse ; sur une petite bouilloire le gros bouillon suit d'une
trentaine de secondes. Le linéaire depuis 28 degrés donne 100 vers 1:50, et la
montée ralentit près de l'ébullition, donc 2:00. Un pas de schéma (v11) remplace
240 par 120, et seulement 240 : une durée chronométrée à la main n'est jamais
écrasée. La parenthèse « elle bout en 4:00 » disparaît de l'aide sous le champ :
le temps d'ébullition se lit dans Paramètres, le répéter à chaque tasse ne
servait qu'à afficher un chiffre douteux. L'aide de la carte Ma bouilloire
donne désormais le repère intermédiaire (petites bulles, 85 à 90 degrés) plutôt
que la phrase sur l'air dissous, qui décrivait un autre stade.

### La température du Switch par le temps de chauffe

Chris n'a pas de thermomètre, et il a toujours la même bouilloire sur le même
feu. Le menu de méthodes de chauffe (« petites bulles », « frémissement, 30 s de
repos ») lui demandait un jugement à l'oeil à chaque tasse ; le TEMPS passé sur
le feu, lui, se lit sur le chrono et se reproduit. C'est sa demande du
13 septembre, et elle est juste : entre deux estimations, on prend celle qui ne
dépend pas de l'observateur. Remplacé en v7.93.

Le modèle est le plus simple possible et il est écrit tel quel dans
`recettes.js` : montée linéaire de l'eau du robinet, 28 °C au Vietnam, à 100 °C
au temps d'ébullition de la bouilloire, réglé dans Paramètres (zéro tant qu'il
n'est pas chronométré, 2:00 chez Chris). Une vraie bouilloire monte un peu moins vite près de
l'ébullition à cause des pertes, donc le linéaire surestime de deux ou trois
degrés vers 90 : c'est en dessous de ce que Chris peut goûter, et surtout c'est
la même erreur à chaque tasse, ce qui est tout ce qu'on demande à une mesure de
carnet. Le degré estimé s'écrit dans le champ température, qui reste modifiable
et reste la valeur stockée ; le temps est stocké aussi (`chauffe_s`), c'est la
mesure d'origine, et l'aide sous le champ fait l'inverse : « pour 92 °C, laisse
la bouilloire 3:35 ».

**Rien pour la Brikka**, et c'est Chris qui l'a précisé : elle part à l'eau
froide, la seule option est la case « eau préchauffée », décochée par défaut.
La ligne de chauffe est masquée dès qu'on choisit la Brikka, et la saisie
n'enregistre un `chauffe_s` qu'en Switch. Le temps d'ébullition décrit le
MATÉRIEL, donc il rejoint la table `reglages`, synchronisée, comme la molette.

La section suivante décrit le menu remplacé ; elle reste parce que ses trois
choix de conception (rien de stocké au-delà du degré, aide qui se remet à zéro,
valeurs explicites) ont guidé celui-ci.

### Le select de température, aide de saisie et rien d'autre (remplacé en v7.93)

`#f-temp-preset` propose six méthodes de chauffe et écrit le degré correspondant
dans `#f-temp`. La liste en comptait neuf en v7.34 : trop pour un champ qu'on
remplit tous les jours. Elle colle maintenant à ce que Chris fait réellement,
c'est-à-dire couper le feu quand les petites bulles remontent, avant le
frémissement, plus les cas bouillante et le mélange à l'eau froide.

L'écran Paramètres est borné à 780 px ET centré par `margin: 0 auto`. Sans la
marge, il se collait à gauche de `main`, qui fait 1180 px, et toute la page
paraissait de travers. Un test vérifie la règle en général : tout `#ecran-*` qui
porte un `max-width` doit porter la marge auto.

Le select et le champ nombre tiennent sur UNE ligne (`.ligne-temp`). Empilés, la
cellule Température devenait deux fois plus haute que ses voisines et creusait un
trou au milieu de `.grille-nombres`, dont la hauteur de rangée suit la cellule la
plus haute. L'aide sous le champ tient elle aussi sur une seule ligne, pour la
même raison.

Trois choix de conception :

- AUCUNE colonne ajoutée. Le choix n'est pas stocké, seule la mesure en degrés
  l'est. Un champ `temp_methode` aurait demandé une migration et une colonne CSV
  pour une information qui n'explique rien de plus que le degré lui-même.
- Le select se REMET À VIDE après chaque usage, et aussi dès que Chris saisit à la
  main ou que la recette préremplit (`razPresetTemp`). Un select resté sur un
  choix qui ne correspond plus au nombre affiché mentirait.
- Les `value` sont des nombres explicites dans le HTML, pour que la traduction du
  libellé ne corrompe pas la valeur. Règle générale du projet, voir section 8.

La liste couvre de 80 à 100 degrés sans trou de plus de 6 degrés, verrouillé par
un test : les paliers "1 min" et "2 min" ont été ajoutés le 24 août parce que la
liste sautait de 85 à 97 alors que les recettes Switch visent 92 à 95.

Les durées de repos sont des ESTIMATIONS pour une bouilloire ouverte d'un demi
litre. Les deux options de mélange à l'eau froide sont de l'arithmétique, et
c'est le seul repère fiable sans thermomètre. L'aide sous le champ le dit.

### Les versements suivent l'eau réellement saisie

Une recette écrit ses paliers en grammes ABSOLUS : "Verser jusqu'à 112 g",
"Compléter à 225 g". Changer l'eau dans la saisie rendait donc la recette fausse.
Chris a versé 240 g et le panneau latéral comme le chronomètre lui réclamaient
toujours 225 g, sans rien signaler.

`echelleVersements(texte, facteur)` vit dans `js/recettes.js`, pas dans app.js :
c'est du calcul pur sur des chaînes, donc testable sans navigateur, comme
`reglages.js`. `app.js` ne garde que `facteurEau()`, qui lit le champ. Un
facteur de 1 laisse les textes intacts au caractère près.

LE GARDE-FOU, à ne pas retirer : seuls les nombres suivis de " g" et
STRICTEMENT supérieurs à `SEUIL_VERSEMENT_G` (30) sont mis à l'échelle. En
dessous ce sont des doses de café ou des quantités de lait, jamais un versement
d'eau. Le plus petit versement des recettes d'origine est un bloom de 45 g, la
plus grosse dose est de 18 g, donc 30 sépare proprement les deux. Ce n'est pas
théorique : deux recettes Brikka écrivent "Extraire exactement comme la Brikka
classique : 14 g" dans leurs étapes, et sans le seuil cette dose serait
multipliée. Un test le vérifie.

Le point d'entrée unique est `etapesPour()`, ce qui met à l'échelle d'un seul
coup les trois endroits qui affichent des paliers : le panneau latéral, le
chronomètre et le mode pas à pas. Les fiches de l'écran Guide, elles, lisent
`r.etapes` directement et restent donc à leurs valeurs canoniques : c'est la
documentation de la recette, pas la tasse en cours.

Quand le facteur n'est pas 1, le panneau latéral affiche une pastille
`param-chip-adapte`. Sans elle, l'écart entre la fiche et les paliers affichés
serait incompréhensible.

### Pas d'estimation de volume sur la Brikka

Il y avait `eau - 0,7 x dose`, soit **139 ml annoncés** pour 150 g de chaudière et
16 g de café. Chris en mesure **90 à 115 ml**. Le modèle était faux, pas le
coefficient : sur une moka la chaudière ne se vide pas. Une partie de l'eau reste
sous l'embouchure du tube montant, une autre part en vapeur, et ces deux pertes
dépendent de la flamme et du moment où on retire du feu. Elles ne dépendent
sûrement pas de la dose de café, qui est la seule variable qu'utilisait la
formule.

Ce chiffre faux ne restait pas dans son coin, il alimentait quatre choses :

1. le ratio en tasse, quand le volume n'était pas saisi ;
2. la ligne "boisson" du direct, donc le ratio de ce qui est bu ;
3. le bouton "Estimation : 140 ml, reprendre", qui l'écrivait dans le champ ;
4. le préremplissage du LAIT, calculé comme contenance de la tasse moins volume de
   café. Pour une tasse de 150 ml il donnait 11 ml de lait, ce qui n'est pas un
   flat white. Et comme les trois recettes lactées sont des Brikka, c'était
   toujours faux.

`volumeEstime(dose, eau)` est désormais le SEUL endroit qui estime un rendement,
et il rend la main immédiatement en Brikka. Le Switch garde `eau - 2,1 x dose` :
le papier et le marc retiennent environ 2,1 g d'eau par gramme de café, le reste
passe, et ce modèle-là tient.

Sans mesure, le champ lait ne se préremplit plus et affiche `lait_sans_volume`.
Un champ vide et honnête vaut mieux qu'un nombre inventé.

À NE PAS FAIRE : remettre une formule Brikka sans données mesurées. Quatre tests
verrouillent l'absence de la formule, l'unicité de celle du Switch, et le fait que
la rétention (`retention_ml` dans data.js) reste une SOUSTRACTION entre deux
mesures et pas une estimation.

### La molette du broyeur n'est pas le dial de la recette

Deux choses différentes qui portaient le même nom, et le formulaire confondait les
deux :

- Le **dial d'une recette** était une CIBLE propre à chaque recette : 1.2.0 en
  Brikka, 1.6.0 pour la Chronicler, 2.0.0 pour le Tetsu. Chris a demandé le
  24 août que TOUTES portent 1.5.0, et il a raison sur le fond : il ne recompte
  pas les crans à chaque changement de machine, donc une cible par recette
  décrivait un geste qu'il ne fait jamais. Les recommandations d'origine en
  microns restent dans la `note` des recettes concernées.
- Le **réglage du broyeur** est un ÉTAT physique. Chris laisse son Timemore C5 sur
  1.5.0, le "compromis qui marche dans les deux" de son guide, 75 crans et 622
  microns, pour ne pas recompter les crans à chaque changement de machine.

Le formulaire préremplissait la cible, donc il lui faisait enregistrer une mouture
qu'il n'avait pas utilisée. Toutes ses extractions Brikka auraient dit 1.2.0 alors
que le broyeur était à 1.5.0.

`MOLETTE_REPLI_USINE` vaut donc "1.5.0", `replis.molette` est modifiable dans
Paramètres avec ses crans et microns affichés sous le champ, et le préremplissage
lit ce réglage. La cible de la recette reste visible dans le panneau latéral, et
`GRIND.verifierPlage` continue de signaler un écart qui sort de la plage de la
machine. C'est ça la bonne division du travail : le carnet enregistre ce qui a
été fait, la fiche dit ce qui était visé.

Le champ mouture perd son `placeholder="1.5.0"`. Il promettait une valeur par
défaut alors que le champ est prérempli, exactement la faute du "93" de la
température corrigée en v7.33.

### Le bouton Saisie ne continue jamais une modification

BUG DE PERTE DE DONNÉES, signalé le 24 août. Chris ouvrait une extraction depuis
l'historique, partait sur un autre écran, revenait par l'onglet Saisie, et le
formulaire était TOUJOURS en mode modification. Le bouton du bas disait
"Enregistrer la modification", mais il croyait noter une tasse neuve : il écrasait
donc une extraction passée, sans rien voir.

`activerEcran("saisie")` abandonne maintenant l'édition en cours. Arriver sur cet
écran par la navigation veut dire "je veux noter une tasse", jamais "reprends la
modification d'il y a dix minutes".

Deux points à ne pas défaire :

1. L'abandon est ANNONCÉ par un toast. Un abandon silencieux serait aussi vicieux
   que le bug qu'il corrige. Rien n'est perdu en base : l'extraction n'avait pas
   été réenregistrée et reste ouvrable depuis l'historique.
2. Le drapeau `ouvertureEdition` encadre `chargerExtractionDansSaisie`, sinon
   l'ouverture légitime d'une édition se réinitialiserait elle-même en appelant
   `activerEcran`.

Au passage, les `activerEcran("saisie")` qui SUIVAIENT un
`chargerExtractionDansSaisie` ont été retirés. Ils étaient déjà redondants, la
fonction ouvre l'écran elle-même, mais ils devenaient surtout nuisibles : le
rappel réinitialisait l'édition qu'on venait d'ouvrir. Un test vérifie qu'aucun ne
revient.

### La Chronicler porte 240 g, pas 225

Erreur de TRANSCRIPTION, présente depuis la première version et repérée le
24 août en comparant le site au document source de Chris,
`Prompt-Fable-Tracker-Cafe.md`. Celui-ci écrit pour la recette 1 :

    15 g / 240 g, ratio 1:16, 92 degrés, mouture 1.6.0
    0:00 verser 120 g, vanne OUVERTE
    0:45 verser 120 g, vanne FERMÉE

Le site portait 225 g, 1:15 et un premier versement de 112 g. La recette avait
donc été rétrécie de 6 % sans raison. Corrigé sur la Chronicler et sur sa variante
Sweet, paliers compris, plus le volume en tasse annoncé qui passe de 195 à 210 ml
(240 moins 2,1 x 15).

Migration `chronicler240` pour les recettes déjà stockées, ciblée : uniquement la
famille `chronicler`, et uniquement si elle porte encore 225.

À NE PAS CONFONDRE avec la mise à l'échelle de la section 7 quinquies. Celle-ci
adapte les PALIERS quand Chris tape une autre quantité dans la saisie ; elle ne
corrige pas la valeur par défaut de la recette, qui est une donnée. Chris a
justement buté sur la différence : il voyait 225 g et croyait que l'échelle aurait
dû s'en occuper.

Restent deux écarts connus avec le document source, non corrigés faute de
décision : "Le Costaud (Immersion)" est en réalité la recette 3 "L'Adoucisseur",
dont le rôle explicite est de rattraper les cafés trop acides, et le Tetsu y est
donné pour 20 g / 300 g au lieu de 15 / 225.

### Le carnet ne refuse jamais une saisie

Il y avait un BLOCAGE : `avertissementsCombinaison` renvoyait un drapeau
`bloque`, et `enregistrerSaisie` refusait alors d'enregistrer. Ça visait les
cafés rang bơ et les cafés non purs passés au Switch, au motif que le filtre
papier retiendrait le beurre ou les additifs.

Retiré, et à ne pas réintroduire. Trois raisons :

1. Le carnet sert à noter ce que Chris a bu, pas à arbitrer ce qu'il a le droit
   de tenter. Il tenait sa tasse à la main et le site refusait de l'écrire.
2. L'affirmation n'avait JAMAIS été testée. Zéro extraction Switch dans les
   données, donc zéro preuve. Même erreur que l'avertissement de débordement de
   tasse retiré en v7.28.
3. Le blocage empêchait exactement l'essai qui produirait la donnée capable de
   trancher. Un carnet qui refuse la mesure contredisant sa règle ne peut plus
   apprendre.

Les avertissements restent, ils informent. `w_rangbo` a été réécrit : il disait
"ne va jamais dans le Switch, passe le à la Brikka", il dit maintenant que le
papier retient une partie du beurre et que ça vaut le coup d'essayer en baissant
la température. Même traitement pour le titre du guide.

Verrouillé par `tools/data.test.mjs` : absence de `saisie.bloque`, de
`t_bloque`, de `cafeInterditSwitch` et de `bloque = true`.

### "Acide ET amer" se DÉDUIT, il ne se coche plus

Chris a signalé deux fois cette pilule comme un doublon des deux du dessus. La
v7.28 lui avait donné son propre groupe avec une explication en commentaire, ce
qui n'a rien réglé : dans l'interface elle ressemblait toujours à un raccourci
redondant, et le site lui demandait de conclure à sa place.

Il conclut maintenant tout seul. Dès qu'un diagnostic de la famille
sous extraction ET un de la famille sur extraction sont cochés,
`majCorrectionDiagnostic` REMPLACE les deux corrections par le diagnostic déduit
et sa correction. Remplacer et pas empiler : les deux corrections d'origine
s'annulent, moudre plus fin ET moudre plus grossier.

Le libellé reste dans `DIAGNOSTICS` sans pilule, via `DIAGNOSTIC_DERIVE`. Il est
dans l'historique de Chris (extraction du 11 août) et doit rester traduisible,
filtrable et affichable. Le retirer casserait ses données passées. Un test vérifie
les deux moitiés : absent des pilules, présent dans la liste.

La clé `diag_contradiction` a disparu, elle servait à demander de cocher la
pilule.

### Écran Paramètres

Chris voulait pouvoir modifier les valeurs préremplies. L'écran ne stocke
PRESQUE rien de son côté, et c'est le point important : chaque ligne du tableau
édite la RECETTE, la même fiche que "Gérer les recettes". Une seule source de
vérité, déjà synchronisée entre appareils. Un second magasin de défauts aurait
créé deux vérités qui divergent en silence.

Conséquence dans `prefillDepuisRecette()` : le formulaire suit la recette pour la
dose, l'eau, la température, la puissance de feu et la molette. Plus aucune
constante codée en dur ne les écrase.

DEUX PIÈGES qui ont fait croire que rien ne marchait, corrigés en v7.33 :

1. `reinitialiserSaisie()` remettait tout à zéro et n'appliquait PAS la recette.
   Les valeurs par défaut n'arrivaient donc que si on rechangeait de recette à la
   main, c'est-à-dire jamais sur le cas courant. L'appel à
   `prefillDepuisRecette` est maintenant la DERNIÈRE ligne de la fonction, et
   doit le rester : plus haut, la remise à zéro du préchauffage l'écraserait.
2. `remplirSelectRecettes()` ne posait `sel.value` que pour une recette marquée
   `parDefaut`, ce qu'aucune Brikka n'est. Le navigateur sélectionne la première
   option tout seul, mais le CODE l'ignorait, donc `prefillDepuisRecette("")`
   repartait sans rien faire. Repli explicite sur `liste[0]` désormais.

Le champ température n'a plus de `placeholder`. Un fond "93" annonçait une valeur
par défaut qui n'existe plus, et un champ doit être soit prérempli soit vide.

`tools/boot.test.mjs` vérifie ces trois points sur le vrai chemin de démarrage,
sans crochet de test dans app.js.

ATTENTION, le piège qui a fait croire que rien n'avait bougé : modifier
`RECETTES_DEPART` ne touche QUE les nouvelles installations. Les recettes déjà
stockées gardent la valeur du jour où elles ont été semées, et ce sont elles qui
préremplissent la saisie. Tout changement de valeur par défaut doit donc
s'accompagner d'un passage dans `migrerDonnees()` (section 3, bloc 6 quater),
marqué une seule fois dans localStorage pour ne pas écraser un réglage choisi
volontairement ensuite.

Une température VIDE veut dire "aucune cible", ce qui n'est pas zéro degré.
`normaliserRecette` préserve la chaîne vide exprès. Les quatre recettes Brikka
sont dans ce cas : la température y dépend de la puissance du feu, l'annoncer
d'avance n'aurait aucun sens. Elles préremplissent en revanche 150 g d'eau, la
contenance de la chaudière.

Ne restent locaux à l'appareil (localStorage, clé `replis-saisie`) que les deux
REPLIS, utilisés seulement quand la recette laisse la valeur vide : dose et
puissance de feu. Ce sont des préférences de confort, pas des mesures ; les faire
voyager créerait des conflits de fusion pour rien.

Deux bugs corrigés au passage, tous deux silencieux :

- `lireFormRecette()` ne lisait pas `puissance_feu`. Modifier une recette Brikka
  depuis "Gérer les recettes" effaçait donc la valeur. Le champ `#r-feu` existe
  maintenant dans le formulaire.
- Le texte de température se repliait sur `valeur + " °C"`. Sans cible, cela
  produisait un " °C" orphelin.

### Eau froide, eau chaude, et le sens d'un conseil de mouture

Trois corrections de données passées en v7.73, avec un pas de schéma pour que
les recettes déjà enregistrées les reçoivent aussi.

**La Brikka se remplit à l'EAU FROIDE.** C'est la consigne Bialetti pour ce
modèle : sa soupape lestée est calibrée sur la montée en pression que produit
l'eau froide, et la remplir chaud fait lâcher la soupape trop tôt. L'eau
préchauffée est la méthode de la Moka Express, et c'est de là que vient le
conseil qu'on lit partout. La recette dite « classique » prescrivait 80 à 90
degrés, donc ni ce que Chris fait, ni ce que le fabricant recommande. La
variante « eau préchauffée » garde sa méthode mais annonce désormais qu'elle
applique volontairement celle de l'autre machine, sans quoi la comparaison
entre les deux serait faussée par un malentendu.

Conséquence à retenir : sur une Brikka, **un temps total de 6 à 8 minutes est
normal**. La mouture ne cuit pas pendant tout ce temps, elle reste tiède tant
que l'eau du dessous n'est pas près de bouillir. Le temps qui compte est celui
qui sépare les premières gouttes des premiers gargouillis.

**Un conseil de mouture doit aller dans le sens du défaut constaté.** La
variante disait « si l'écoulement dure moins de 10 secondes, la mouture est
trop fine : passer à 1.4.0 ». Or 1.4.0 vaut 582 µm et 1.5.0 en vaut 624 : le
remède envoyait vers PLUS FIN alors que le diagnostic disait déjà trop fin.
Rien ne pouvait le signaler, un dial reste un dial, et suivre le conseil
aggravait exactement le problème constaté. `tools/data.test.mjs` vérifie
maintenant la RÈGLE et pas ce cas : partout où un texte diagnostique une
mouture trop fine et prescrit un dial, ce dial doit être plus grossier que
celui de la recette, et symétriquement.

**Une recette ne promet pas une mouture qu'elle ne porte pas.** Le Costaud
(Bloom) annonçait « plus chaud, plus fin, plus long » alors que le pas v5 a
aligné les dix recettes sur 1.5.0. Le texte dit maintenant que le plus fin est
un geste à faire à la main.

#### Le fixture qui ne pouvait pas échouer

La première version du pas de schéma ciblait `!rec.variante` pour distinguer la
classique de sa variante. Or la classique porte `variante: "Standard"`, pas une
chaîne vide : la condition n'aurait JAMAIS été vraie. Le test de migration
passait quand même, parce que la recette simulée portait une variante vide,
c'est-à-dire un cas que la vraie donnée ne produit jamais. Un fixture qui
s'écarte du réel transforme un test en décoration. Il porte maintenant les
vrais identifiants.

### Deux percolations pures de plus : Better 1 Cup et One and Done

Ajoutées en v7.92 sur les notes de Chris, en deuxième et troisième positions
des Switch, juste derrière la Chronicler. Jusque là le Tetsu Devil était la
seule percolation pure, et c'est une recette avancée ; il manquait une V60
simple pour les lavés propres, à commencer par le Là Việt Balanced.

- **Better 1 Cup (James Hoffmann, novembre 2022)** : 15 g / 250 g, cinq
  versements de 50 g, dix secondes de verse puis dix de pause, tourbillon doux
  et aucune cuillère. Plus de clarté et d'acidité que la Chronicler, qui garde le
  sucre et le corps. Elle remplace l'Ultimate 500 ml pour une tasse ; pour deux
  tasses l'ancienne reste meilleure.
- **One and Done (Lance Hedrick)** : 15 g / 225 g, deux blooms de 45 g sans
  tourbillon puis les 135 g restants d'un coup. Le second bloom chasse le CO2,
  donc la grosse verse ne creuse pas de canaux : c'est ce qui la rend tolérante.
  La mouture se règle sur le temps total, 2:00 à 2:30.

Trois choix d'intégration :

1. **La molette reste 1.5.0** comme partout, et les conseils de mouture des
   sources vivent dans la `note`, sous la forme « un numéro plus gros » ou « plus
   fin », toujours dans le sens du défaut constaté. Les textes évitent de
   promettre « plus fin » dans `pourQui` : le test qui protège cette règle a
   attrapé la première version.
2. **Les étiquettes « Recette N » se décalent** (Costaud 4 et 5, Tetsu 6,
   Sherrycipe 7) par le pas de schéma v9, ciblé sur l'ancienne étiquette pour
   respecter une étiquette réécrite à la main. La Sweet reprend « Recette 1 »,
   celle de sa famille : elle partage la carte de la Chronicler.
3. **L'ordre d'affichage est rétabli à chaque chargement** : recettes d'origine
   dans l'ordre de la graine, personnelles ensuite. Sans ça, une recette ajoutée
   à la graine arrivait en dernier chez qui avait déjà des données, quelle que
   soit sa position dans `RECETTES_DEPART`. Idempotent, donc dans la partie
   idempotente de `migrerDonnees` plutôt qu'en pas de schéma.

La fiche des procédés du Guide reçoit dans le même mouvement ce que les notes
de Chris ajoutaient : le détail du lavé, les trois teintes de honey, les risques
du natural, l'anaerobic en tasse, le co-ferment, le décaféiné, et une
correspondance procédé vers recette.

### Le thème sombre n'est pas noir

Le fond sombre était #171009, presque noir, et les panneaux #221709, à peine plus
clairs : tout tirait vers le noir et Chris avait mal aux yeux. Depuis la v7.97 la
palette monte d'un cran, fond #241a10, panneau #31241a, panneau secondaire
#3c2d20, avec trois pas nets entre les trois pour que les cartes se lisent comme
des cartes. Le texte principal descend d'un poil (#dfd1bf) parce qu'un blanc
franc sur un fond plus clair éblouit par contraste, et le texte atténué monte
(#b49a83) pour rester lisible sur les nouveaux panneaux, autour de 5,5:1. Les
couleurs de données ne bougent pas. La même couleur de fond est recopiée dans le
meta theme-color, le manifeste et la page de connexion du Worker : quatre
endroits pour une couleur, à changer ensemble.

### Graphite et Nuit remplacent Espresso (v8.34)

Chris n'aimait « pas du tout » l'Espresso, même après la v8.26 : le brun en
fond faisait sale, quoi qu'on règle. Maquette de trois directions (Graphite,
Nuit et cuivre, Ristretto) ; il a retenu les deux premières, et les deux sont
livrées. Le brun ne vit plus que dans l'accent. Graphite est le défaut parce
qu'il est le plus neutre ; Nuit est un choix, au deuxième clic du bouton de
thème. Plutôt qu'un second `data-theme`, un attribut `data-sombre` : les
dizaines de règles écrites pour `[data-theme="sombre"]` valent pour les deux
sans être dupliquées. Les couleurs de machines sont éclaircies d'un cran dans
la famille sombre (sur un fond presque noir, le bleu Brikka d'origine tombait
sous 4:1). La section suivante raconte l'Espresso, gardée pour son
raisonnement (séparation par pas de surface et filets en alpha), qui vaut
toujours.

### Le thème sombre « Espresso » : de la séparation, pas de la clarté

Chris trouvait le sombre « pas clean, pas moderne ». Le diagnostic n'est pas
celui de la v7.97, où il avait mal aux yeux sur du presque noir : ici tout
était brun sur brun. Un demi pas de luminosité entre le fond (#241a10) et le
panneau (#31241a), des filets opaques (#4f3b28) qui se fondaient dans le panneau
secondaire, et une carte sombre qui, n'ayant plus rien à inverser, se dessinait
avec un cadre orange sur les quatre côtés.

La palette Espresso descend le fond d'un cran (#1a120d) sans revenir au noir
de la v7.96, et surtout écarte les surfaces : fond, rail, panneau, panneau
secondaire, et une quatrième surface de survol (`--panneau-3`), séparées d'au
moins six points de luminosité chacune. Les filets passent en alpha
(`rgba(245, 235, 223, 0.10)`) : une seule valeur reste visible sur toutes les
surfaces. Le relief que le clair obtient par sa bordure, le sombre l'obtient par
une ombre douce et un filet clair d'un pixel en haut de carte (`--ombre-carte`,
`--ombre-haut`, vides en clair). La carte sombre devient un panneau secondaire
avec un trait d'accent à gauche.

Contrastes mesurés avant de choisir, sur les cinq surfaces (fond, rail,
panneau, panneau-2, panneau-3) : encre 15,7 à 11,0 ; texte 11,7 à 8,2 ; atténué
7,1 à 4,9 ; accent 7,6 à 5,3 ; danger 7,0 à 4,9 ; encre sur accent 7,4. Tout
au dessus de 4,5:1. L'atténué a été remonté de #ad9680 à #b39c86 précisément
pour tenir sur la surface de survol, où il faisait 4,44.

Le thème clair n'a pas bougé : il avait été validé à 4,5:1 et Chris ne s'en
plaignait pas. La couleur de fond du sombre vit toujours à quatre endroits.

### Le formulaire de saisie en trois blocs

Dix-huit champs se suivaient dans une seule colonne, café, deux gros boutons,
recette, puis une grille de chiffres, des options, une ligne live, le chrono, la
note, les diagnostics, les descripteurs, le commentaire. Chris l'a dit sans
détour : « c'est le fouillis ». Depuis la v7.95 le formulaire est découpé en
trois blocs titrés, en petites capitales discrètes : « Le café et la recette »
(les trois choix qui décident du reste, sur UNE rangée), « Les réglages » (la
grille chiffrée, les options, et la ligne live en pied de bloc, puisque c'est le
résumé de ce qu'on vient de régler), et « En bouche » (note, ratée, diagnostic,
descripteurs, commentaire). Le chrono garde sa carte entre les deux derniers.
Aucun identifiant de champ n'a changé, donc ni le brouillon, ni les tests, ni le
câblage n'ont bougé : ce sont des `<section>` posées autour de l'existant.

La Sweet, variante de la Chronicler, passe en même temps en fin de liste
(Recette 8) : dans le menu des recettes elle passait devant celles que Chris
utilise, alors qu'elle n'est qu'une variante d'affichage de la première carte.

### Le moulin dans l'écran Guide : un réglage, pas un convertisseur

Le bloc était un champ texte et un diagramme figé. C'est devenu l'endroit où Chris
choisit sa mouture.

- **Curseur en CRANS**, de 0 à 150, pas de 1. L'unité est celle du moulin lui
  même : un pas du curseur égale un cran de la molette, donc ce qu'il lit se
  reproduit à la main. Un curseur en microns aurait été plus joli et intraduisible
  en geste.
- **Repères cliquables** sous le curseur, alimentés par `GRIND.REFERENCES`.
- **`conseilMouture()`** répond à trois questions dans cet ordre : est-ce que ça
  marche sur ses deux machines, quel goût donne un déplacement, et à combien de
  crans il est de son réglage enregistré. Rien d'inventé, les plages viennent de
  `GRIND.verifierPlage` et l'écart se compte en crans.
- **Un bouton applique le réglage** dans `replis.molette`, le MÊME repli que
  l'écran Paramètres. Une seule source, deux portes d'entrée. Le bouton se
  désactive et change de texte quand la valeur est déjà celle enregistrée.
- `CHARTS.diagramme` prend un troisième argument, le réglage enregistré, tracé en
  trait vert épais distinct du curseur noir : en glissant, l'écart doit se voir.

ORDRE DE DÉMARRAGE : `chargerReplis()` doit tourner AVANT
`rendreConvertisseur()` et `reinitialiserSaisie()`. Il était appelé après, donc le
convertisseur s'affichait sur la valeur d'usine et pas sur celle de Chris.

Le décalage du zéro de SON moulin est documenté dans un encadré : les meules se
touchent vers 0.0.2, donc l'échelle en microns le surestime d'environ 17 µm, soit
2,7 %. Non corrigé dans le calcul, volontairement : c'est en dessous de la
dispersion d'un jeu de meules et de l'imprécision du 8,32 µm par cran, et ce qui
compte est d'enregistrer toujours ce que le cadran affiche.

L'écran Guide a aussi été remis d'aplomb : Recettes descend sous Règles puisqu'un
onglet entier leur est consacré, le comptage annoncé passe de "deux Brikka, cinq
Switch" à quatre et six, et le récapitulatif de mouture par recette a disparu
puisque les dix portent 1.5.0. Des tests comparent maintenant ces affirmations aux
données réelles plutôt que de les laisser vieillir toutes seules.

### Une seule recette au lait, et le lait en chiffres

Le flat white et le cappuccino avaient la MÊME extraction : même dose, même
eau, même molette, même feu, et leurs étapes disaient toutes les deux
« extraire exactement comme la Brikka classique ». Seule la texture du lait
changeait. Le découpage n'avait d'ailleurs jamais été propre : le `pourQui` du
flat white commençait par « Flat white OU cappuccino maison ».

Deux noms pour une seule extraction coupent les statistiques en deux, note par
recette et meilleurs réglages, sans rien apprendre : le champ recette décrit
l'extraction. Elles sont fusionnées en **Brikka au lait** depuis la v7.78.

**L'identifiant `brikka-flatwhite` est conservé.** Le changer aurait orphelinées
les données déjà enregistrées pour un gain nul, puisque c'est le NOM qui
s'affiche. Les deux anciens noms passent par `RENOMMAGES_RECETTES`, qui tourne
à chaque chargement, donc l'historique se recolle tout seul. Le pas de schéma
v8 retire la recette en trop et renomme la survivante, mais **uniquement si
elle porte encore son nom d'origine** : renommée, elle est devenue une recette
personnelle et ne nous appartient plus.

#### Le lait se calcule, et pour les deux boissons

Le calcul existait déjà, contenance de la tasse moins volume de café, mais il
ne donnait jamais de nombre sur une Brikka : `volumeEstime()` y rend 0
VOLONTAIREMENT, l'ancienne formule annonçait 139 ml là où Chris en mesure 90 à
115. Sans volume relevé il refusait donc de répondre, et les recettes au lait
sont précisément des recettes Brikka.

Il se rabat maintenant sur `volumeTypique`, le rendement DÉCLARÉ de la recette.
Ce n'est pas une estimation calculée mais un chiffre mesuré et écrit, et
l'interface dit d'où il vient. Un volume relevé prime toujours.

Les deux boissons s'affichent côte à côte : le cappuccino prend environ 20 %
de lait LIQUIDE en moins, la mousse occupant le volume. C'était écrit en prose
dans la recette, donc à calculer de tête au moment de verser.

#### Une colonne déclarée doit être sérialisée

`volumeTypique` a d'abord été écrit dans la semence seule, et il disparaissait :
`normaliserRecette` reconstruit un objet champ par champ, ce qui n'y figure pas
n'existe pas. Il est devenu une vraie colonne, `volume_typique`, ajoutée en fin
de `RECETTE_COLS` comme `puissance_feu` avant elle.

**Et cela a révélé un bug plus ancien.** `puissance_feu` figurait dans
`RECETTE_COLS` mais pas dans `recetteVersLigne`. Or `csvSerialiser` lit
`ligne[colonne]` : la colonne sortait VIDE, donc exporter les recettes puis les
relire effaçait la cible de feu des dix recettes, sans erreur ni
avertissement. `tools/data.test.mjs` fait maintenant un ALLER-RETOUR CSV
complet et compare champ par champ, ce qui couvre toute la classe plutôt que ce
cas. Vérifié en remettant le bug.

### Les bascules annoncent leur état, et s'ouvrent au doigt

70 boutons, zéro `aria-pressed`. Les pilules de diagnostic, les descripteurs et
le choix de machine sont des BASCULES : l'état se voyait au fond coloré, mais rien
ne l'annonçait. Un lecteur d'écran lisait "bouton chocolat noir" sans jamais dire
s'il était coché.

`aria-pressed` et pas `aria-checked` : ce sont des boutons à deux états, pas des
cases à cocher dans un formulaire. Les onglets de navigation, eux, prennent
`aria-current="page"` : ce sont des liens déguisés en boutons, pas des bascules.

Point à tenir : `basculerEtat()` change la classe ET l'attribut d'un SEUL geste.
Les séparer serait la garantie qu'ils divergent un jour, la classe suivant et
l'attribut restant figé. Un test compte les `classList.toggle("actif")` restants
et refuse qu'ils se multiplient.

### L'appui long, pour les définitions

Les bulles d'aide s'ouvraient au survol et au clavier. Sur téléphone le survol
n'existe pas, et un tap ne déclenche pas `:focus-visible` : la moitié du
vocabulaire des descripteurs était donc inatteignable dans le seul contexte où
Chris utilise vraiment le site, la PWA en cuisine.

Un appui de 450 ms ouvre la bulle, l'appui court garde son rôle de bascule, et un
mouvement du doigt annule pour ne pas la déclencher pendant un défilement.

À NE PAS DÉPLACER : `activerAppuiLong()` s'attache au CONTENEUR, une seule fois,
depuis `cabler()`. `construirePilules()` réécrit le contenu mais pas le
conteneur : appeler depuis là empilerait un jeu d'écouteurs à chaque bascule de
langue. Un test vérifie l'ordre.

### Les confirmations passent par un dialogue de la page

Les quatre derniers `confirm()` natifs (démo par dessus des données, repartir de
zéro, rétablir une recette, supprimer une recette) sont passés par `UI.confirmer`
en v7.83, un `<dialog>` de la page. Sur téléphone, `confirm()` est une boîte
système : hors du thème, boutons non traduits, et elle casse l'impression
d'application installée. Le choix SÛR reçoit le focus, Échap annule. Un test
refuse tout `confirm()` natif dans l'interface. La suppression d'extraction, elle,
n'a pas de confirmation du tout : elle a un retour arrière (voir « Historique »).

### Le mode Brassage : une vue du chrono, pas un chrono de plus (v8.47)

Le Guide a déjà un « pas à pas » avec son propre chrono, et la saisie le sien. Un
troisième aurait fait deux temps différents pour la même tasse. Le mode Brassage est donc
une VUE plein écran de `UI.chrono` : ses boutons appellent les fonctions du chrono de la
saisie, et arrêter y écrit exactement ce que le bouton « Arrêter et reporter » écrit.

Les cibles s'affichent en millilitres par défaut : START-HERE dit « pas encore de
balance de précision », et la maquette qui affichait « 120 g » en énorme demandait un
instrument absent de la cuisine. Un gramme d'eau est un millilitre, la conversion est
exacte ; la bascule g la rend inutile le jour où la balance arrive. Le texte des étapes,
vérifié par Chris, reste en grammes : on ne réécrit pas une recette pour l'afficher.

La cible se lit dans le texte, par « jusqu'à N g » ou « à N g » (le cumul), sinon le
premier « N g ». Piège rencontré : `\bà` ne trouve rien après une apostrophe, parce
que JavaScript ne voit pas de frontière de mot autour d'une lettre accentuée ; « jusqu'à
90 g » rendait 45, le premier nombre de la phrase.

### Les tasses jumelles : proches, pas identiques (v8.44)

La maquette proposait une proximité sur tout (café, machine, molette, température,
dose, recette). Chris l'a corrigée avant le code : « jumelle veut pas dire exactement
même température ». Une tasse à 94 °C au lieu de 92 reste la même tasse pour lui, et
un critère trop fin vide la carte : sur la démo, la Chronicler au Switch n'aurait
presque jamais deux voisines. Le critère est donc la RECETTE, qui fixe déjà dose,
eau et gestes, et la MOLETTE à trois crans près (25 µm, moins que l'écart entre deux
chiffres du C5). Le café n'est pas exigé mais passe devant : une recette tient
d'un café à l'autre, et la ligne le dit quand ce n'est pas le même. Ce qui diffère
sans compter (température, feu) s'écrit sur la ligne au lieu de trier.

### La fiche café, et une fenêtre de fraîcheur apprise (v8.46)

La fiche est un DIALOGUE, pas un septième écran : elle s'ouvre depuis deux listes qui
existent déjà (Mes meilleurs réglages, Mes cafés) et se referme sur elles, là où un
écran de plus aurait demandé une place dans le rail et une navigation retour.

La fraîcheur ne vient pas d'une règle générique (dégazage, six semaines) : elle est
APPRISE des notes de ce café. Les jours depuis l'ouverture sont découpés en tranches
serrées au début (0 à 3, 4 à 7, 8 à 11, 12 à 15) puis plus larges ; une tranche ne compte
qu'à partir de trois tasses notées, comme partout. La fenêtre va de la première tranche
au-dessus de la moyenne du café à la dernière : un creux isolé au milieu est du bruit.
Deux garde-fous : il faut au moins deux tranches documentées et au moins une sous la
moyenne (sinon il n'y a pas de fenêtre, seulement un café régulier), et la fin s'arrête
au dernier jour qu'une tasse documente. La première version annonçait « encore 19 jours »
sur un sachet goûté jusqu'au jour 42, parce que la dernière tranche court jusqu'au jour 60.

La démonstration n'avait pas de date d'ouverture : ses sachets naissent de la migration.
Aucune de ses tasses n'avait donc de jour du sachet, et la fiche comme la règle « âge du
paquet » y restaient muettes. Elle ouvre maintenant chaque sachet le jour de l'achat.

## Tableau de bord et analyses

### Insights automatiques du tableau de bord

Carte "Ce que tes données disent", juste sous les KPI. Des phrases calculées,
pas des graphiques en plus. Tout vit dans app.js, section "Insights
automatiques", et sort par `rendreInsights()` appelé depuis `rendreTableau()`.

Deux garde fous, ce sont eux qui font la valeur de la fonction :

- `MIN_SAMPLE = 3` extractions notées dans CHACUN des groupes comparés.
- `MIN_GAP = 0.4` point d'écart minimum. En dessous, on se tait.

Sans ça, avec une poignée d'extractions, n'importe quelle corrélation est du
bruit et une phrase affirmative serait un mensonge.

`bestOfGroups()` oppose le meilleur groupe au RESTE MIS EN COMMUN, pas au
deuxième. C'est délibéré : la mouture se découpe en beaucoup de groupes fins
(13 réglages de molette sur le Switch dans la démo), donc l'écart entre premier
et deuxième est toujours minuscule même quand l'écart entre le meilleur et tout
le reste dépasse le point. Tester premier contre deuxième reviendrait à ne
jamais rien dire. Le regroupement donne en plus un effectif de comparaison bien
plus grand.

Les règles : fenêtre de fraîcheur (trois tranches d'âge), meilleur réglage de
mouture par machine (une par machine), duel de recettes d'une même famille,
moment de la journée, puissance de feu en Brikka.

Une règle sur le préchauffage a existé et a été RETIRÉE en v7.21 : depuis que le
préchauffage est une recette à part entière (v7.17), elle comparait exactement les
mêmes tasses que le duel de recettes et produisait donc deux fois la même phrase.
Quand une variable devient une recette, sa règle dédiée devient un doublon, à
retirer. La règle recettes ne parle QUE des familles où
exactement deux recettes ont assez d'extractions : à trois ou plus, nommer une
"perdante" serait faux puisqu'elle n'est peut être que deuxième.

Quand rien ne se déclenche, on explique POURQUOI (seuil non atteint, et le cas
échéant "renseigne tes dates de torréfaction") au lieu de laisser un cadre
vide. C'est la différence entre "pas assez de données" et "le site est cassé".

`#insights` est dans ZONES_JS : son contenu est généré, le TreeWalker ne doit
pas y toucher. Les phrases sont des gabarits T, avec les nombres déjà formatés
via `fmtDecimal` pour éviter tout problème de pluriel ou de séparateur décimal.

### Le levier qui compte, par café ET par machine

Les règles d'insight comparaient des groupes sur TOUT l'historique. C'est
trompeur : mélanger un Sáng Tạo en Brikka et un Liberica en Switch pour conclure
sur la puissance de feu produit une moyenne qui ne décrit aucune tasse réelle.

`REGLAGES.constatsParCafe()` isole chaque couple (café, machine), puis cherche
parmi six leviers (feu, préchauffage, recette, dose, mouture, âge du paquet) celui
qui sépare le mieux SES tasses. Un seul constat par lot, le plus franc : trois
phrases sur le même café se contrediraient à moitié.

Les garde-fous sont les mêmes que partout et ne sont pas négociables : trois
tasses de chaque côté, 0,4 point d'écart, et au moins DEUX valeurs pour le levier.
Un levier qui n'a jamais varié ne peut rien expliquer, même si ses tasses sont
excellentes.

Sur les 29 tasses actuelles de Chris, AUCUN constat ne passe : le meilleur écart
par couple tombe à 0,17 point. C'est le bon comportement, pas un défaut de la
fonctionnalité. Les règles globales prennent le relais, et elles annoncent
désormais leur propre limite en commençant par "Toutes tasses confondues".

La règle mouture est retirée dans le même mouvement : le champ n'a qu'une valeur
chez Chris (1.5.0, son réglage unique) et 21 % de remplissage, donc deux groupes
de trois ne pouvaient jamais exister. La mouture reste examinée, mais PARMI les
autres leviers, ce qui la fait se taire proprement quand elle ne varie pas.

### Les extractions ratées

Une tasse ratée décrit un GESTE MANQUÉ, pas un réglage. La garder dans les
analyses fait condamner un réglage correct : c'est du bruit qui se fait passer
pour du signal. Le drapeau `ratee` la met de côté.

#### La ligne de partage, et elle tient en une phrase

**Ce qui décrit CE QUI S'EST PASSÉ compte tout. Ce qui conseille CE QU'IL FAUT
FAIRE écarte les ratées.**

| Compte tout | Écarte les ratées |
| --- | --- |
| nombre de tasses, aujourd'hui, semaine, total | note moyenne et note 7 jours |
| grammes consommés, coût, stock des sachets | insights et constats par café |
| caféine | tendance et note quotidienne du graphe 30 jours |
| calendrier d'activité et heatmap | duel des machines, nuage de mouture |
| les cinq dernières extractions | goûts, anneau des diagnostics, note par recette |
| l'historique et son export | l'écran Mes meilleurs réglages |

Le café a bien été utilisé : une erreur de geste n'efface ni la dépense ni la
journée. Mais elle n'apprend rien sur un réglage.

Un seul endroit décide, `extAnalysables()` dans le noyau, à côté de
`extAvecCalculs()`. Si chaque écran filtrait à sa façon, les chiffres
finiraient par ne plus se recouper d'une carte à l'autre.

#### Trois états, une seule case

La colonne vaut 1 ou vide. **Vide veut dire « pas dit », pas « réussie »**, et
c'est la valeur de toutes les tasses antérieures au drapeau. Marquer ce qui est
raté est un geste rare ; certifier chaque réussite serait une corvée
quotidienne. Aucune migration n'a donc été nécessaire : une colonne absente
d'un vieux CSV relit vide, ce qui est exactement le bon défaut.

La case est TOUJOURS visible dans le formulaire, à la différence des trois
autres options qui apparaissent selon la machine ou la recette : rater une
extraction n'est propre à aucune machine, et une case cachée ne se coche pas.
Elle est en dernier, parce que c'est un jugement porté après coup.

Le panneau rapide ne la porte pas : il sert à noter une tasse en trois gestes,
et on ne sait pas encore si elle est ratée au moment où on la note.

#### Deux endroits pour marquer, et pourquoi

La case du formulaire est rangée AVEC LA NOTE, juste sous « Pas encore notée ».
Elle a d'abord été placée dans le bloc des options d'extraction, entre « Eau
préchauffée » et « Ajout d'eau ». Elle y était bien, et Chris ne l'a pas trouvée,
deux fois. Le rangement était le bug : ces options décrivent COMMENT on extrait,
alors que « ratée » juge le RÉSULTAT, exactement comme la note au-dessus. Un
liseré rouge la distingue des autres cases du formulaire, parce que c'est la
seule qui retire la tasse des analyses.

La case du formulaire de saisie sert à la tasse qu'on est en train de noter. Elle
ne suffit pas : on sait qu'on a raté APRÈS avoir bu, donc le cas courant est de
marquer une tasse DÉJÀ enregistrée. Il fallait alors l'ouvrir en modification,
cocher, enregistrer, soit quatre gestes pour un jugement binaire.

D'où la bascule dans la ligne d'historique, à côté des autres actions. Un clic
écrit et rafraîchit, sans confirmation : le geste est réversible depuis le même
bouton, et demander confirmation pour une bascule serait plus lourd que la
bascule. Son état est visible sans survol, sinon repérer les lignes écartées
demanderait de passer sur chacune.

#### Réintégrer d'un clic

Un bandeau sur le tableau de bord annonce combien de tasses sont écartées et
permet de les remettre. Il est placé AVANT les chiffres : il dit ce qu'ils
valent, et le lire après serait apprendre trop tard que la moyenne ne portait
pas sur tout. Il reste masqué tant qu'aucune tasse n'est marquée.

La bascule existe parce que « j'ai merdé » et « ce réglage ne marche pas » ne
se distinguent pas toujours de l'extérieur. C'est une préférence de LECTURE,
donc locale comme le thème : elle change ce que les chiffres racontent, pas les
données, et il n'y a rien à synchroniser.

**Déplacée dans Paramètres en v7.91**, à la demande de Chris. Le raisonnement
« le lire avant les chiffres » était juste, mais il payait un bandeau en tête de
l'écran ouvert dix fois par jour pour un réglage changé une fois par mois. La
bascule vit avec les bips, dans « Cet appareil », avec le compte des tasses
écartées à côté ; le tableau de bord ne dit plus rien, et ses chiffres sont ceux
du réglage en vigueur.

#### Le faux localStorage qui ne stockait rien

Le harnais de démarrage acceptait les écritures et renvoyait toujours `null`.
Toute préférence passant par `localStorage` était donc intestable, et un test
qui la manipulait passait au vert sans rien vérifier. C'est ce qui a fait
échouer le premier essai de ce test, et c'est la troisième fois de la session
qu'un faux trop pauvre cache le comportement qu'il devrait montrer. Le harnais
a maintenant un vrai stockage en mémoire.

### Calendrier d'activité, échelle ABSOLUE

Ordre du tableau de bord, voulu : KPI, graphe 30 jours, "Ce que tes données
disent", "Les 5 dernières extractions", puis le calendrier et le reste.

L'échelle de couleur est ABSOLUE : 1, 2, 3, 4 et plus, via `niveauDe()` dans
charts.js. Elle était relative au maximum (`ceil(v / maxV * 4)`), ce qui était le
vrai défaut de lisibilité : avec une tasse par jour au plus, `maxV` valait 1 donc
CHAQUE jour actif était peint dans la teinte la plus foncée, le dégradé ne
transmettait rien, et la même journée changeait de couleur dès qu'un autre jour
faisait monter le maximum. Ne pas revenir à une échelle relative : la légende
annonce maintenant des nombres réels, elle deviendrait fausse.

Autres points, chacun pour une raison :

- 18 semaines et non 26 (`SEMAINES_HEATMAP` dans app.js). À une ou deux tasses
  par jour, six mois de grille sont surtout six mois de cases vides, ce qui donne
  l'impression que le calendrier est cassé.
- Filet `stroke` sur chaque case : sans lui les jours sans extraction se fondent
  dans le fond du panneau et la grille ne se lit plus comme un calendrier.
- Le jour courant est cerclé (`.hm-aujourdhui`). Sans repère, s'orienter dans
  126 cases demande de compter les colonnes.
- Étiquette de mois sur la colonne qui contient le 1er (`d.getDate() <= 7`), et
  non sur le lundi du changement de mois, qui pouvait sauter un mois.
- `tabindex="0"` sur les cases : les bulles étaient au survol seulement, donc
  inaccessibles au doigt, ce qui compte depuis que le site tourne en PWA sur le
  téléphone.
- Cinq mini statistiques sous la grille (`statsHeatmap` et
  `rendreStatsHeatmap` dans app.js, `#heatmap-stats`, dans ZONES_JS) : tasses,
  jours actifs, série en cours, meilleure série, tasses par semaine.
  Deux subtilités à ne pas simplifier :
  1. La SÉRIE EN COURS tolère qu'aujourd'hui soit encore vide et repart d'hier.
     Sinon elle retomberait à zéro chaque matin avant le premier café et ne
     voudrait plus rien dire.
  2. Les TASSES PAR SEMAINE sont rapportées au temps réellement couvert (depuis
     la première extraction de la fenêtre), pas aux 18 semaines. Diviser par 18
     alors que le carnet a deux semaines donnerait un chiffre faux et
     décourageant.

### Cartes légitimement vides

Trois cartes peuvent rester vides très longtemps avec des données parfaitement
valides : "Note contre mouture", "Note contre âge du café", "Brikka contre
Switch". Un cadre vide se lit comme un site cassé, et c'est exactement la
confusion qui a été rapportée.

Chacune annonce donc sa cause RÉELLE et l'action qui la débloque, via
`majCarteVide()` plus une fonction `causeXVide()` par carte (app.js). Le
canvas est masqué et remplacé par le message, classe `.carte-vide`.

Les causes distinguées, parce qu'un "pas de données" générique n'aide personne :

| Carte | Cause détectée | Ce qu'on dit |
|---|---|---|
| mouture | tous les cafés extraits sont `deja_moulu` | ce n'est pas un bug, la mouture n'est volontairement pas stockée |
| mouture | autre | aucun réglage enregistré |
| goûts | aucun descripteur jamais coché | cocher ce qu'on sent en saisie |
| goûts | aucun descripteur n'atteint 3 tasses | continuer à cocher les mêmes mots |
| duel | une seule méthode utilisée | passer un même café dans les deux machines |
| duel | autre | aucun café dans les deux machines avec une note |

Toutes ces cartes retombent sur `vide_rien` s'il n'y a aucune extraction notée.

### Quels goûts font tes bonnes tasses

Barres horizontales, un descripteur par ligne, note moyenne des tasses où il a été
coché. `rendreGouts()` dans app.js, canvas `g-gouts`.

REMPLACE le nuage "Note contre âge du café", supprimé. Celui là dépendait de
`date_torrefaction`, que les paquets vietnamiens ne portent presque jamais : il
était structurellement vide et le restera. Les descripteurs, eux, se cochent à
chaque tasse, donc la donnée est toujours là.

C'est aussi le SEUL graphique du tableau de bord qui parle de GOÛT plutôt que de
réglage, alors que c'est le sujet du carnet. L'anneau des diagnostics compte des
problèmes, pas des saveurs.

- `MIN_TASSES_GOUT = 3` : sous ce seuil un descripteur est du bruit.
- 10 meilleurs plus 5 pires. Sur 59 tags, tout afficher serait illisible, et
  l'information est dans les extrêmes. En dessous de 15 éligibles, on montre tout.
- Vert au dessus de la moyenne globale, rouge en dessous, et la moyenne est
  rappelée sous le graphique : sans repère, "7,9" ne dit pas si c'est bon pour lui.
- Les libellés passent par `I18N.tag()`, donc les valeurs stockées restent
  françaises.

Note liée : l'insight de fraîcheur (`insightFraicheur`) EXISTE TOUJOURS et se
déclenchera si des dates de torréfaction apparaissent un jour. Mais le message qui
réclamait ces dates a été retiré : Chris a dit qu'il ne les aurait quasi jamais, le
rappel serait un reproche permanent.

### Régularité, et pourquoi pas l'écart type

Le KPI de régularité utilise l'ÉCART MOYEN à la moyenne, pas l'écart type.
L'écart type est la mesure canonique mais elle ne se lit pas : personne ne sait
ce que vaut un sigma de 1,2. L'écart moyen se dit en français exact, "tes tasses
s'écartent en moyenne de 0,8 point de ta moyenne". Sur une poignée de notes les
deux donnent des chiffres très proches (0,8 contre 1,0 sur les 11 premières
extractions), donc la clarté ne coûte rien à la justesse. `ecartMoyen()` renvoie
null sous deux notes : une seule note n'a pas de régularité.

### Écran Mes meilleurs réglages

`js/reglages.js`, chargé entre data.js et app.js. Le CALCUL y vit, sans aucune
dépendance au DOM, ce qui le rend testable sans navigateur. app.js ne fait que
l'affichage. Ce découpage est délibéré : app.js dépasse 2500 lignes et le backlog
demande de le scinder, autant ne pas aggraver en attendant.

PAR CAFÉ et pas en général. Le meilleur réglage d'un Sáng Tạo 4 déjà moulu à
82 pour cent de café n'a rien à voir avec celui d'un Balanced en grains : une
moyenne globale mélangerait les deux et ne serait actionnable pour aucun.

Une COMBINAISON regroupe les leviers que Chris contrôle au moment de faire la
tasse : recette, mouture, puissance de feu, préchauffage. Le café est la clé de
regroupement, pas un levier. La note et le diagnostic sont des résultats, donc
exclus. Les valeurs vides comptent : "pas de mouture" est une information sur un
café déjà moulu, pas une donnée manquante.

Seuil de `MIN_TASSES` (3), le même que les insights. Quand rien ne sort, la carte
dit POURQUOI et distingue les deux cas, qui n'appellent pas la même action :

- `pas_assez` : moins de trois tasses notées en tout.
- `eparpille` : assez de tasses, mais chacune à un réglage différent. Le conseil
  est alors de REFAIRE le réglage le plus joué, pas d'en essayer un nouveau, et le
  nombre de tasses manquantes est annoncé.

"Refaire cette tasse" duplique la tasse de RÉFÉRENCE de la combinaison, la mieux
notée (la plus récente à égalité), plutôt que de reconstruire les champs un par
un : on récupère ainsi tout le reste du contexte, tasse comprise.

### Le ratio : eau sur dose, sur les deux machines

Le ratio principal est `eau_g / dose_g`, quelle que soit la machine. C est la
convention universelle du café, la seule qui se compare à une recette, à une
source ou à un autre buveur.

Il y a eu une parenthèse en v7.29 où la Brikka basculait sur le volume EXTRAIT
divisé par la dose, au motif que la chaudière ne décrit pas la concentration en
tasse. Le raisonnement tenait, la pratique non : le volume extrait est rempli sur
UNE extraction sur 29. Le ratio en tasse ne s affichait donc presque jamais, et
quand il s affichait il donnait un nombre incomparable à tout le reste.

`DATA.calculs()` renvoie donc :

- `ratioTexte` et `ratioBase`, toujours eau sur dose. La base vaut `chaudiere`
  en Brikka et `infusion` en Switch : le mot sert à l explication au survol, pas
  à changer le calcul.
- `ratioTasseTexte`, SECONDAIRE et seulement s il est mesuré. Affiché entre
  parenthèses derrière le principal.
- `ratioBoisson`, également secondaire, quand on allonge à l eau ou au lait.

À ne pas refaire : promouvoir une statistique qui dépend d un champ que personne
ne remplit. Vérifier le taux de remplissage AVANT de construire dessus.

### Tasses restantes, à la dose du café

Le badge de stock disait "{g} g, {n} tasses", ce qui se lisait aussi bien comme du
consommé que du restant. Il dit maintenant "reste {g} g, environ {n} tasses".

Surtout, l'estimation utilise désormais la dose MOYENNE de ce café et plus la dose
de repli. Chris dose 15,9 g en moyenne sur son G4 : avec la dose de repli à 15 g,
un sachet où il reste 139 g annonçait 9 tasses au lieu de 8. Repli sur la dose par
défaut tant que le café n'a aucune extraction, et l'infobulle dit laquelle des
deux a servi.

### Jours depuis l ouverture du paquet

La règle de fraîcheur partait de `date_torrefaction`. Aucun des cinq cafés de
Chris ne la porte, et il n en aura pas : les torréfacteurs vietnamiens ne
l impriment pas. La règle n a donc jamais pu se déclencher une seule fois.

Ce qui fait vraiment bouger ses tasses, il le dit lui même, c est le temps depuis
qu il a OUVERT le sachet. Le café dégaze, puis s évente, et une tasse à J+1 n a
rien à voir avec la même à J+21.

`date_ouverture` vit sur le SACHET (table `achats`) et pas sur le café : un café
racheté a plusieurs sachets, ouverts des jours différents. Vide tant qu il dort
dans le placard, ce qui est une information en soi.

`sachetALaDate(cafeId, date)` retient le sachet EN VIGUEUR ce jour là et pas
simplement le dernier acheté. Sans ça, une tasse du 10 août serait rattachée au
sachet acheté le 20 et afficherait un âge négatif.

`jours_ouvert` est un champ CALCULÉ, jamais saisi : la saisie l affiche en
lecture seule sous le choix du café, et se tait quand la date d ouverture manque
plutôt que d afficher un zéro faux. Le saisir à la main aurait créé une deuxième
vérité.

Les tranches de la règle d insight suivent le dégazage puis l éventement :
première semaine, une à trois semaines, au delà.

### La courbe de tendance

Les notes brutes sautent trop pour se lire : chez Chris elles font 8, puis 4, puis
7,5 d un jour à l autre. La moyenne glissante sur cinq tasses raconte l histoire
réelle, et elle en a une : 8,0 début août, 5,1 le 16, retour à 7,0 le 27.

`REGLAGES.moyenneGlissante(extractions, fenetre)` est PUR, sans DOM, testé sans
navigateur comme le reste de ce fichier. Trois choix :

- La fenêtre compte des TASSES notées, pas des jours. À une ou deux tasses par
  jour actif, une fenêtre en jours serait pleine de trous et sauterait autant que
  les points bruts.
- Elle renvoie `null` tant qu elle n est pas pleine. Afficher une moyenne de deux
  tasses comme si c en était une de cinq mentirait sur sa solidité.
- Elle trie par date, donc l ordre d entrée ne change rien.

Côté tableau de bord, la courbe se calcule sur TOUT l historique noté et pas sur
la fenêtre de 30 jours : sinon elle serait vide les quatre premiers jours
affichés. Elle est ensuite projetée jour par jour en gardant la dernière valeur
connue, pour ne pas se couper les jours sans tasse.

Elle partage l axe de note avec les points bruts : deux échelles différentes sur
le même graphe se compareraient sans qu on le voie. Trait épais et sans point,
pour se lire comme un fond et pas comme une mesure de plus.

### Ce qui n'est PAS un avertissement de saisie

L'écart entre la recette choisie et `recette_recommandee` du café ne déclenche
plus rien (retiré en v7.21). Cette recommandation vient d'une valeur posée à la
création du café, jamais vérifiée par une extraction : conseiller une recette sur
un café qu'on n'a pas encore essayé n'est pas une aide, c'est du bruit à chaque
saisie. Les vraies recommandations viennent des insights, calculés sur les notes
réelles. Les avertissements de MACHINE (`w_brikka_reco`, `w_switch_reco`) et les
blocages (café non pur en Switch) restent, eux : ce sont des faits, pas des goûts.

## Historique

### Tableau de l'historique, largeurs figées

#### Treize colonnes, et les mêmes infos que la carte d'accueil

Le tableau montrait la date, le café, la machine, la recette, la mouture, le
ratio, la note et le diagnostic. Donc tout SAUF quatre des paramètres que Chris
change le plus d'une tasse à l'autre : la dose et l'eau, le temps, la
température et le feu. Ils vivaient dans le détail dépliable, invisibles tant
qu'on ne dépliait pas ligne par ligne, ce qui interdit précisément de comparer,
seule raison d'ouvrir un historique.

Les colonnes ajoutées en v7.71 sont exactement celles de la carte « les 5
dernières extractions ». Deux vues du même objet doivent dire la même chose.

Le détail dépliable ne les répète plus : son rôle est de montrer ce que la
ligne ne montre PAS, sinon on lit deux fois la même valeur.

L'écran déborde de la colonne de lecture. `main` est calibré à 1180 px pour du
TEXTE ; un tableau de treize colonnes n'y tient pas. Il s'élargit jusqu'à
1560 px par une marge négative valant la moitié du débordement, ce qui le
recentre sur la fenêtre. Sans `transform`, qui perturberait la transition de
vue entre écrans. Sur écran étroit la marge redevient positive et tout se
comporte comme avant.

#### Le piège des largeurs figées

Les largeurs sont posées en pourcentages PAR POSITION (`nth-child`). Ajouter
une colonne demande donc de toucher QUATRE endroits : le `<th>` dans
`index.html`, le `<td>` dans le rendu, la largeur en CSS, et le `colspan` de la
ligne de détail. En oublier un ne lève rien du tout : le tableau se décale, les
largeurs glissent d'une colonne, et le détail déborde ou rétrécit.

`tools/boot.test.mjs` compare donc ce qui est RÉELLEMENT rendu à ce que la page
déclare : autant de cellules que d'en-têtes, un `colspan` égal, une largeur par
colonne, et une somme de 100 %. Vérifié en ajoutant un `<th>` seul.

`table-layout: fixed` avec neuf largeurs en pourcentage qui totalisent exactement
100. Sans ça les colonnes s'élargissaient avec leur contenu (un nom de café long,
un diagnostic multiple) et poussaient la table au delà du conteneur : d'où un
défilement horizontal permanent.

Le texte trop long est TRONQUÉ (`text-overflow: ellipsis`), et les trois colonnes
de texte libre (café, recette, diagnostic) portent un attribut `title` qui donne
la valeur complète au survol. Les guillemets doubles y sont neutralisés,
`attrTitre()` dans app.js.

`min-width: 900px` sur la table : en dessous, sur téléphone, on défile plutôt que
d'écraser neuf colonnes en bouillie. Le défilement horizontal n'a donc pas
disparu, il est devenu le comportement de repli sur petit écran au lieu d'être la
norme sur grand écran.

### Plus d'intertitre de jour : la date sur chaque ligne

Le groupement par jour, avec « Aujourd'hui », « Hier » puis le jour de la
semaine en intertitre, tenait sur une bonne intention : nommer le jour vaut
mieux qu'une date quand la date est récente. Chris l'a refusé en une phrase :
une ligne entière pour afficher le jour, c'est ce que ne fait aucun site, et
c'est une ligne de moins pour une tasse. La date complète se lit maintenant au
début de chaque ligne, jour en encre et heure en atténué, et chaque carte du
téléphone porte la sienne. `titreDeJour` et ses trois clés de traduction sont
partis avec les intertitres : garder une fonction sans appelant, c'est laisser
la question ouverte pour la session suivante.

Au passage, les largeurs par position en pourcentages (dix règles `nth-child`
dont la somme devait faire 100, avec le test qui allait avec) ont cédé la place
à un `<colgroup>` : pixels pour les colonnes chiffrées, rien pour café,
recette et goûts qui se partagent le reste. La mesure a tranché : à 1600 px de
fenêtre, les pourcentages donnaient 52 px à la colonne des goûts. Et les deux
colonnes de texte passent à la ligne au lieu de se tronquer, parce que
« Trung Nguyên Sáng… » ne dit plus lequel des deux cafés c'est.

### Détail dépliable et comparateur

**Détail dépliable.** Le carnet stocke 22 champs par extraction, le tableau en
montre 8. Un clic sur le chevron de la colonne date déplie une ligne
supplémentaire en `colspan="9"`, donc SANS toucher aux largeurs de colonnes qui
sont figées. Elle montre le reste : doses, températures, temps, puissance de feu,
tasse, volumes, coût, descripteurs et commentaire. C'est ce qui rend le
commentaire utile, il n'était jamais relu.

L'état d'ouverture vit dans un `Set` en mémoire (`detailsOuverts`), pas dans les
données : quelles lignes sont dépliées n'a aucune raison d'être synchronisé.

**v8.33 : la fiche au survol remplace le chevron, sur ordinateur.** Chris
n'aimait pas la flèche, et déplier poussait toute la table vers le bas. Le même
`detailContenu()` se pose maintenant dans une fiche flottante sous la ligne
survolée (au-dessus si la place manque), après 280 ms pour ne pas clignoter
quand la souris traverse la table. Elle se cache sur les boutons d'action, au
défilement et à tout clic, et ne montre PAS le commentaire, déjà écrit en entier
sous la ligne. Seulement avec `(hover: hover) and (pointer: fine)` : les cartes
du téléphone gardent leur dépliage, par un bouton en mots. Même raisonnement pour
le tableau de bord : la bulle qui répétait le commentaire écrit juste dessous a
disparu, le texte complet ne vient au survol que si la ligne l'a coupé.

**Comparateur.** Sélection par un bouton de la colonne Actions, PAS par une
colonne de cases à cocher : le tableau vient d'être figé à neuf colonnes, en
ajouter une casserait les largeurs. Au delà de deux sélections, la plus ancienne
cède sa place, ce qui permet d'enchaîner les comparaisons sans vider à la main.

La modale n'affiche en surbrillance QUE les lignes qui diffèrent. C'est là que se
trouve l'explication de l'écart de note; surligner le reste serait du bruit. Une
ligne vide des deux côtés n'est pas affichée du tout.

### Supprimer, puis pouvoir revenir en arrière

Contrainte posée par Chris et qui décide de toute la conception : **si la page se
ferme pendant les cinq secondes, la suppression doit quand même avoir lieu.**

Ça exclut la solution naïve, qui aurait été de retarder la suppression de cinq
secondes. Elle est plus simple à écrire, mais fermer l'onglet pendant le délai
aurait alors ANNULÉ une suppression que Chris croyait faite. C'est exactement le
genre de piège silencieux qu'on essaie d'éviter partout ailleurs.

Donc : on supprime TOUT DE SUITE, pour de vrai, synchro comprise, et on garde une
copie de la ligne en mémoire. Le message propose "Annuler" pendant cinq secondes.
Fermer la page, changer d'écran ou laisser filer le délai ne font rien de plus,
la suppression est déjà acquise.

`DATA.restaurerExtraction()` réinsère SOUS L'ID D'ORIGINE, contrairement à
`ajouterExtraction()` qui en attribue un nouveau. Les liens d'édition, la
sélection du comparateur et les références de l'historique pointent sur l'id : une
restauration sous un autre id aurait marché tout en cassant l'identité. La fusion
sait gérer le retour d'une ligne supprimée, elle compare la pierre tombale à
`maj_le` et l'écriture la plus récente gagne, donc l'annulation voyage aussi vers
les autres appareils.

Le `confirm()` natif de suppression disparaît avec ça : le retour arrière remplace
la question. Sur téléphone une boîte système casse l'impression d'application, et
elle ne passe pas par la couche i18n donc elle reste en français en mode anglais.
Il en reste quatre, sur des gestes rares et vraiment destructeurs (vider les
données, charger la démo, rétablir ou supprimer une recette).

## Données et synchronisation

### Pourquoi D1, pourquoi un document, pourquoi des pierres tombales

Suggestion 1 du backlog. Le site étant en ligne, il est utilisé depuis le
téléphone en cuisine ET depuis le bureau, or IndexedDB est par appareil : sans
synchro, les deux jeux de données divergent et le suivi perd son sens.

Actif UNIQUEMENT sur le site déployé, et seulement si une base D1 est liée.
En `file://`, ou sans base, `SYNC.disponible()` est faux et tout se comporte
comme avant. La démo n'est JAMAIS synchronisée (`syncPossible()` teste
`demoActive`) : sans ce garde fou, charger la démonstration enverrait 62 fausses
extractions dans les vraies données.

#### Choix techniques et pourquoi

- **D1 et pas KV.** KV est à cohérence éventuelle : une lecture juste après une
  écriture peut renvoyer l'état précédent pendant une minute. Or le geste type
  est exactement celui là, saisir sur le téléphone puis regarder sur le bureau.
- **Un document JSON et pas des tables SQL.** Le schéma des données vit dans le
  client (`normaliserX`, `migrerDonnees`) et bouge souvent. Le dupliquer en SQL
  imposerait une migration D1 à chaque colonne. Le serveur ne connaît que deux
  choses : chaque ligne a un `id` et un `maj_le`.
- **Fusion ligne par ligne, le plus récent gagne**, plus des PIERRES TOMBALES
  (`state.tombes`, `{table: {id: horodatage}}`). Sans elles, une extraction
  supprimée sur un appareil ressusciterait au premier échange avec l'autre, qui
  l'a encore. Elles sont purgées après 90 jours.
- L'ordre des lignes dans un tableau n'est PAS significatif (l'interface trie ce
  qu'elle affiche). La fusion est commutative sur le CONTENU. En production le
  document serveur est toujours le premier opérande, donc l'ordre converge aussi.

### Les réglages du matériel se synchronisent

`replis` (dose de repli, puissance de feu, molette du broyeur) vivait en
`localStorage`. Ces trois valeurs décrivent le MATÉRIEL de Chris, pas l'appareil
qu'il tient : sa molette de broyeur est la même vue du téléphone et de
l'ordinateur. Il réglait donc sur le portable et son téléphone continuait de
préremplir les valeurs d'usine, sans qu'il puisse le voir puisque ce sont des
champs préremplis d'apparence normale.

C'est devenu une TABLE `reglages` d'une seule ligne, d'id fixe `moi`. Le choix
surprend, alors il faut le justifier : la fusion par `maj_le`, les tombstones et
l'assainissement réseau existent déjà et sont testés. Un mécanisme dédié aux
préférences aurait été un DEUXIÈME chemin de synchronisation à écrire, tester et
maintenir, pour une ligne de données. Une table coûte six lignes réparties et
hérite de tout le reste.

`normaliserReglages` borne les trois valeurs et retombe sur l'usine hors bornes :
ce qui arrive du réseau n'est jamais digne de confiance.

Reprise : `reprendreReplisLocaux()` remonte une fois les valeurs posées en
`localStorage` avant la bascule, marquée par `replis-repris`, et SEULEMENT si la
table est encore vide. Une reprise qui écraserait un réglage déjà synchronisé
serait pire que pas de reprise du tout.

Restent locaux à juste titre : le THÈME et les BIPS. Un téléphone en cuisine et un
ordinateur n'ont pas les mêmes besoins, ce sont de vraies préférences d'appareil.

Les deux tests de comptage de tables ne comptent plus : ils comparent
`js/sync.js`, `worker/sync.js` et l'état entre eux. Un oubli dans l'une des deux
listes ne se voyait pas autrement.

### Le document D1 a un plafond, et on prévient à la moitié

Tout l'état vit dans une seule ligne D1, en JSON, et D1 plafonne une ligne à
2 000 000 octets. Le jour où le document dépasse, l'écriture échoue d'un coup,
sans avertissement, avec les données en sécurité côté client mais plus rien qui
converge. À 600 octets par extraction et une tasse et demie par jour, c'est
loin (plusieurs années), mais c'est le genre de chose qu'on oublie. Depuis la
v7.85 le serveur renvoie la taille du document et le plafond à chaque échange, et
le panneau Données prévient passé 50 pour cent : assez tôt pour archiver
tranquillement, assez tard pour ne pas alerter pour rien.

À connaître, sans action : la fusion serveur est une lecture puis une écriture
sans transaction. Deux appareils qui synchronisent à la même seconde peuvent
s'écraser l'un l'autre, et ça se répare tout seul à la synchro suivante puisque
chacun renvoie son état complet. Acceptable pour un utilisateur unique.

### Le découpage de data.js

`data.js` faisait 1 417 lignes dans une seule IIFE et portait six métiers. Il a
été découpé en v7.87 par extraction MÉCANIQUE de chaque déclaration nommée avec
son commentaire, sans retaper un corps de fonction : `data-csv.js` et
`data-schema.js` sont purs, `data-store.js` ne connaît que des primitives,
`data-calculs.js` et `data-migrations.js` se lient à l'état par `pour(state)`
parce que leurs fonctions le lisent (ou, pour les migrations, l'écrivent) et
que leur passer l'état en paramètre à chaque appel aurait touché des dizaines
de sites. `data.js` reste le seul propriétaire de l'état et le seul à appeler
`persister()` : toute fonction qui écrit ET persiste vit chez lui. La façade
`DATA` expose les mêmes noms qu'avant, donc aucun écran n'a bougé, et les 374
tests de la couche de données n'ont eu à changer que leur liste de fichiers.

## Performance et hors ligne

### Le versionnage des assets, et pourquoi un an de cache

Chaque ouverture en ligne refaisait seize requêtes réseau, au mieux en 304 :
tout était servi en `no-cache` et le service worker est réseau d'abord. Depuis
la v7.82 les fichiers de code portent `?v=VERSION` et le Worker les sert
`immutable` un an ; `index.html`, dont l'URL ne change pas, reste en `no-cache`
et porte les nouvelles URL à chaque version. Le seul vrai risque est une
DIVERGENCE entre le meta, les `?v=` et `sw.js`, qui laisserait un appareil avec
le nouveau HTML et un vieux script pendant un an : d'où un script unique pour
monter de version et un test qui refuse toute divergence. Le service worker
jette les URL d'une autre version à l'activation, sinon le cache grossirait d'un
jeu complet à chaque déploiement.

Ce qui a été écarté, et pourquoi : un bundler (la règle « aucun build » est un
arbitrage consigné, et le double clic sur `index.html` est la raison d'être du
projet) ; charger les écrans à la demande (10 pour cent du chemin critique pour
une contrainte d'ordre fragile) ; remplacer Chart.js par du SVG (70 Ko gzip déjà
chargés à part et mis en cache).

## Tests

### Ce que chaque suite couvre, et le bug qui l'a motivée

Patron : lancer Chromium headless via Playwright
(`executablePath: '/opt/pw-browsers/chromium'` dans l'environnement Claude,
sinon le Chromium de Playwright), `page.goto('file://.../index.html')`,
cliquer `#acc-demo` à la modale d'accueil, puis piloter l'interface.
Vérifier systématiquement : zéro erreur console et pageerror, bascule EN
aller-retour, persistance après reload.

Scan anti-tirets (à lancer depuis le dossier tracker, doit imprimer PROPRE) :

```
python3 -c "
import glob
interdits = [chr(0x2013), chr(0x2014), chr(0x2012), chr(0x2015)]
pb = [f for f in glob.glob('**/*.*', recursive=True) if not f.endswith('.png')
      and any(c in open(f, encoding='utf-8', errors='ignore').read()
              for c in interdits)]
print('PROPRE' if not pb else pb)"
```

Régénérer la démo après tout changement de schéma :
`python3 tools/gen_demo.py` (écrit demo/*.csv et js/demo-data.js).

Cinq suites sans navigateur, sans dépendance, à lancer depuis `tracker/` :

```
node tools/boot.test.mjs     demarrage et rendu des 7 ecrans
node tools/data.test.mjs     couche de donnees, dont les deux logiques de ratio
node tools/modules.test.mjs  frontieres entre les sept fichiers d'interface
node worker/sync.test.mjs    fusion entre appareils, 23 assertions
node worker/index.test.mjs   porte d'entree, 32 assertions
```

Un anti-rebond est un PANSEMENT, pas une solution : il masque un coût, il ne
l'enlève pas. Celui du curseur du moulin couvrait un redessin complet d'un SVG de
151 traits à chaque cran ; depuis que le squelette de la réglette est construit
une seule fois, il ne restait que ses 90 ms d'attente sur le seul contrôle du
site qu'on manipule en continu. Il a donc été retiré, et un test empêche de le
remettre par réflexe. Le champ texte du convertisseur, lui, garde le sien :
personne ne regarde la réglette en tapant.

`tools/modules.test.mjs` lit les fichiers d'interface sans les exécuter et
vérifie les frontières que le découpage a créées : aucun nom libre inconnu,
tout ce qui est lu sur `UI` y est bien posé, aucun emprunt d'une variable
réassignable, et les trois listes de scripts restent d'accord. Il est vérifié en
réintroduisant le bug de `cafeQ` : il échoue.

`tools/boot.test.mjs` est le plus important après une modification de l'interface.
Il monte un faux DOM et EXÉCUTE réellement l'application : démarrage, rendu des
sept écrans, bascule de langue. C'est le seul filet contre une erreur d'exécution,
puisque le panneau navigateur de l'agent ne peut pas charger ce site. Il capte les
exceptions par les trois chemins possibles (try/catch de notifier, promesse
rejetée, throw direct), sans quoi il afficherait l'erreur sans échouer. Vérifié en
réintroduisant volontairement le bug du 14 août : il échoue.

`tools/data.test.mjs` charge les vrais scripts du site dans un seul scope, comme
le navigateur avec des scripts classiques, sans IndexedDB ni DOM. Il garde
l'invariant qui peut corrompre les données sans se voir : `maj_le` ne doit
JAMAIS entrer dans un CSV, et les en-têtes doivent rester au caractère près.

Porte d'entrée : `node worker/index.test.mjs` (32 assertions, aucune
dépendance, node 18 ou plus suffit, il fournit fetch, Request, Response et
crypto.subtle comme le runtime Workers). Couvre la redirection de l'anonyme,
la préservation de la destination, le refus des mauvais identifiants, les
attributs du cookie, le rejet d'une signature falsifiée ou signée avec une
autre clé, l'expiration à 30 jours, la redirection ouverte, le logout et la
fermeture par défaut quand les secrets manquent. À relancer à CHAQUE
modification de `worker/index.js`.

