// Starter recipes, starter coffees, cups and consistency rules.
// Recipes then live in the data (recipes.csv plus IndexedDB) and are
// edited in the interface. This file provides the original versions,
// which you can always go back to.
"use strict";

const STARTER_RECIPES = [
  {
    id: "brikka-classique",
    name: "Brikka classique",
    number: "",
    method: "Brikka",
    // Family added in v7.17 to share a card with the boiling-water variant.
    // The NAME does not change, only the display grouping.
    family: "brikka-classique",
    variant: "Standard",
    subtitle: "La base quotidienne de la Brikka",
    dose: 14, water: 150, temp: "", tempText: "dépend de la puissance du feu",
    heat_level: 3,
    dial: "1.5.0",
    ratioText: "environ 1:7, environ 90 ml en tasse",
    typicalVolume: 90,
    totalText: "retrait du feu aux premiers gargouillis",
    milk: false,
    steps: [
      { t: null, text: "Remplir la chaudière à l'eau FROIDE : c'est la consigne Bialetti pour la Brikka, dont la soupape lestée est calibrée sur cette montée en pression. L'eau préchauffée est la méthode de la Moka Express, pas celle-ci." },
      { t: null, text: "Ne jamais dépasser la soupape." },
      { t: null, text: "Égaliser la mouture, ne jamais tasser." },
      { t: null, text: "Retirer du feu dès les premiers gargouillis." },
    ],
    bestFor: "L'usage quotidien de la Brikka, 14 g pour environ 90 ml en tasse.",
    pairedCoffees: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4", "Là Việt Balanced"],
    note: "Après un Bana G4 ou un Sáng Tạo 4 : rinçage immédiat à l'eau chaude après usage, le sel et les graisses attaquent l'aluminium.",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    // A distinct protocol, not a simple checkbox: boiling water changes the
    // pressure build-up, the duration and how the valve behaves. Tuned to
    // fix the observed flaw, 4 minutes of cooking then a 5 second flow.
    // Grind coarser than the Standard so that the valve gives way
    // earlier and flows longer instead of bursting.
    id: "brikka-classique-bouillante",
    name: "Brikka classique (eau préchauffée)",
    number: "",
    method: "Brikka",
    family: "brikka-classique",
    variant: "Eau préchauffée",
    subtitle: "Eau bouillante, flamme forte au départ",
    dose: 14, water: 150, temp: "", tempText: "eau bouillante au départ, la suite dépend du feu",
    heat_level: 3,
    dial: "1.5.0",
    ratioText: "environ 1:7, environ 90 ml en tasse",
    typicalVolume: 90,
    totalText: "montée en pression sous 2 minutes, écoulement de 20 à 45 secondes",
    milk: false,
    steps: [
      { t: null, text: "Faire bouillir l'eau et la verser tout de suite : tiède, on cumule les inconvénients des deux méthodes." },
      { t: null, text: "Ne jamais dépasser la soupape." },
      { t: null, text: "Égaliser la mouture, ne jamais tasser : un panier tassé fait percer un canal." },
      { t: null, text: "Flamme forte jusqu'aux premières gouttes : c'est avant l'écoulement que la mouture cuit." },
      { t: null, text: "Baisser la flamme dès que ça coule, pour allonger l'écoulement." },
      { t: null, text: "Retirer du feu dès les premiers gargouillis." },
    ],
    bestFor: "L'alternative à tester contre la Standard : même dose, même eau, même mouture, seules la température de départ et la flamme changent. À savoir avant de comparer : Bialetti indique l'eau FROIDE pour toutes ses cafetières, Brikka comme Moka Express ; l'eau préchauffée est une astuce de barista, qui raccourcit le temps où la mouture chauffe sur le feu. Cette recette applique donc volontairement l'autre méthode.",
    pairedCoffees: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4", "Là Việt Balanced"],
    note: "Si l'écoulement dure moins de 10 secondes, la mouture est trop fine et la soupape lâche d'un coup : passer à 1.5.4, le plus gros de la plage Brikka. Noter le temps total ET le temps d'écoulement, c'est leur écart qui dit combien de temps la mouture a cuit.",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  /* ONE single milk recipe. The flat white and the cappuccino shared the same
     extraction to the gram: only the milk texture changes. The cappuccino
     starts from LESS cold milk than the flat white because frothed milk
     swells: the third of foam fills the cup with less liquid.
     Two recipes for one extraction split the stats in two without teaching
     anything. */
  {
    id: "brikka-flatwhite",
    number: "",
    name: "Brikka au lait",
    method: "Brikka",
    subtitle: "Flat white ou cappuccino, même extraction",
    dose: 14, water: 150, temp: "", tempText: "dépend de la puissance du feu",
    heat_level: 3,
    dial: "1.5.0",
    ratioText: "environ 1:7, environ 90 ml en tasse",
    /* The recipe's DECLARED yield, not a computed estimate. The Brikka
       deliberately has no estimation formula, it gave a wrong figure;
       this one is measured and written in the recipe. It serves as a fallback
       to compute the milk when the volume has not been measured. */
    typicalVolume: 90,
    totalText: "extraction identique à la classique",
    milk: true,
    steps: [
      { t: null, text: "Extraire exactement comme la Brikka classique : 14 g, environ 90 ml." },
      { t: null, text: "FLAT WHITE : chauffer le lait pendant l'extraction, texture lisse, à peine mousseuse. Mesurer le PLUS GRAND des deux chiffres donnés par la saisie." },
      { t: null, text: "CAPPUCCINO : faire mousser le lait autour de 60 à 65 degrés, viser un tiers de mousse. Mesurer le PLUS PETIT des deux : le lait moussé gonfle et remplit la tasse tout seul." },
      { t: null, text: "Verser le lait, puis coiffer avec la mousse s'il y en a." },
    ],
    bestFor: "Flat white ou cappuccino maison. Le site calcule le lait tout seul dès qu'une tasse est choisie : contenance de la tasse moins le volume de café donne le vide à remplir, et le lait FROID à mesurer est un peu moins que ce vide, puisqu'il gonfle en moussant. Un flat white gonfle à peine, un cappuccino d'environ la moitié : c'est pourquoi un cappuccino part de moins de lait pour une tasse plus garnie.",
    pairedCoffees: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4"],
    note: "Une Brikka n'est pas un espresso : 90 ml à 1:7 sont bien plus dilués qu'un espresso de 30 ml. Le résultat sera très orienté café, ce qui est voulu.",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "chronicler",
    name: "The Coffee Chronicler's Recipe",
    number: "Recette 1",
    method: "Switch",
    family: "chronicler",
    variant: "Classique",
    subtitle: "Percolation puis immersion, la recette par défaut",
    dose: 15, water: 240, temp: 92, tempText: "92 °C",
    dial: "1.5.0",
    ratioText: "ratio 1:16, environ 210 ml en tasse",
    totalText: "total 2:45 à 3:15",
    milk: false,
    steps: [
      { t: 0,   text: "Verser jusqu'à 120 g, vanne OUVERTE, en spirale de l'extérieur vers l'intérieur." },
      { t: 45,  text: "Compléter à 240 g, vanne FERMÉE." },
      { t: 120, text: "Ouvrir, laisser s'écouler." },
    ],
    bestFor: "Les fermentés, natural, honey et anaerobic en torréfaction medium. Grains poreux et solubles, la percolation d'attaque capte les esters volatils, l'immersion va chercher la sucrosité.",
    pairedCoffees: ["Ethiopia Banko Anaerobic (Amigo)", "Fine Robusta Whisky (Home Roast)", "Fine Robusta Anaerobic (Ritachi)", "Anaerobic Fine Robusta (Soul)", "Serie 4 D'ran (Là Việt)", "Cà Phê Mít Liberica (Fine Coffee Agency)", "Fine Robusta Cư M'Gar (Every Half)", "Là Việt Balanced"],
    note: "La source recommande 600 à 700 microns, soit 1.4.2 à 1.6.4 sur mon moulin. Les volumes sont cumulés : compléter à 240 g veut dire que la balance affiche 240.",
    video: "https://www.youtube.com/watch?v=68ZOXrXbVHc",
    isDefault: true, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "hoffmann-1cup",
    name: "Better 1 Cup (Hoffmann)",
    number: "Recette 2",
    method: "Switch",
    family: "",
    variant: "",
    subtitle: "Percolation pure, cinq versements de 50 g au rythme dix secondes de verse, dix de pause",
    dose: 15, water: 250, temp: 95, tempText: "95 à 100 °C selon la torréfaction, 90 à 92 pour un foncé",
    dial: "1.5.0",
    ratioText: "ratio 1:16,7, environ 220 ml en tasse",
    totalText: "total 2:45 à 3:15",
    milk: false,
    steps: [
      { t: 0,   text: "Bloom : verser 50 g lentement, en quinze secondes environ, vanne OUVERTE. PENDANT le bloom, tourbillon doux du porte-filtre pour mouiller tout le lit, aucune poche sèche." },
      { t: 45,  text: "Verser jusqu'à 100 g, en dix secondes." },
      { t: 70,  text: "Verser jusqu'à 150 g." },
      { t: 90,  text: "Verser jusqu'à 200 g." },
      { t: 110, text: "Verser jusqu'à 250 g." },
      { t: 120, text: "Tourbillon doux du porte-filtre, ou un petit coup de cuillère, un aller et un retour, si le Switch est trop lourd à faire tourner sur la balance : même effet, décoller la mouture des parois et aplanir le lit. Laisser s'écouler, fin vers 2:45 à 3:15." },
    ],
    bestFor: "Les lavés propres, quand je cherche la clarté. Plus de clarté et d'acidité que la Chronicler, qui garde plus de sucre et de corps avec moins de risque : sur un lavé et un C5 bien réglé, celle-ci ; sur un natural ou un grain que je découvre, la Chronicler. Les cinq verses courtes gardent le lit sous une lame d'eau fine et constante, donc ni gros volume qui creuse le lit ni canalisation, et les pauses rallongent le contact sans avoir à resserrer la molette. Percolation pure, donc plus sensible à la mouture. C'est presque le Five Pour de Matt Winton, Hoffmann le reconnaît : rien de magique, juste bien calibré.",
    pairedCoffees: ["Là Việt Balanced", "Cầu Đất lavé (The Married Beans)", "Guji Uraga lavé (Greenfields)", "Serie 1 The 1893 (Là Việt)", "Specialty Arabica Cầu Đất (Ritachi)"],
    note: "Better 1 Cup V60 Technique de James Hoffmann, novembre 2022, qui remplace son Ultimate 500 ml de 2020 pour une tasse (youtube.com/watch?v=1oB1oDrDkHM ; la partie 2 corrige des points, il dit coarse à 10:13 en voulant dire finer). Il conseille medium-fine, un cran plus fin qu'en 500 ml. Dans la Part 2 il accepte la cuillère à la place du tourbillon final, en douceur. Écoulement fini après 3:30 ou tasse amère : un numéro plus gros, 1.6.0, sans toucher au rythme. Fini avant 2:30 ou tasse aigre : un numéro plus fin, 1.4.0. Pour deux tasses, 30 g et 500 g, garder plutôt l'ancienne Ultimate, faite pour ça.",
    video: "https://www.youtube.com/watch?v=1oB1oDrDkHM",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "one-and-done",
    name: "One and Done (Lance Hedrick)",
    number: "Recette 3",
    method: "Switch",
    family: "",
    variant: "",
    subtitle: "Deux blooms puis un seul versement, la percolation la plus tolérante",
    dose: 15, water: 225, temp: 92, tempText: "90 à 93 °C pour un clair ou un medium, 93 à 96 pour un ultra clair, sous 90 pour le reste",
    dial: "1.5.0",
    ratioText: "ratio 1:15, environ 195 ml en tasse",
    totalText: "total 2:00 à 2:30",
    milk: false,
    steps: [
      { t: 0,  text: "Premier bloom : verser 45 g, trois fois la dose, vanne OUVERTE. PAS de tourbillon." },
      { t: 30, text: "Second bloom : verser 45 g de plus, jusqu'à 90 g. PAS de tourbillon." },
      { t: 60, text: "Verser les 135 g restants d'un coup, jusqu'à 225 g, débit assez rapide. Laisser s'écouler, fin visée entre 2:00 et 2:30." },
    ],
    bestFor: "Les lavés clairs, où elle est excellente. La plus simple à mémoriser et la plus tolérante des percolations pures : le second bloom chasse le CO2 que le premier n'a pas sorti, donc la grosse verse traverse un lit déjà dégazé, sans bulles qui creusent des canaux. Extraction plus basse que la Hoffmann, TDS autour de 1,3 : plus de clarté et de fruit, moins de corps. Sur un café qui a besoin de sucre et de rondeur elle paraît fine, là je passe à la Chronicler.",
    pairedCoffees: ["Là Việt Balanced", "Cầu Đất lavé (The Married Beans)", "Guji Uraga lavé (Greenfields)", "Serie 1 The 1893 (Là Việt)"],
    note: "Chercher « Lance Hedrick One and Done V60 » sur YouTube. Zéro tourbillon sur les blooms : les fines restent en place et le filtre ne se bouche pas. La mouture se règle sur le temps TOTAL, 2:00 à 2:30, pas sur des crans : trop lent, un numéro plus gros ; trop rapide, un numéro plus fin. Un peu trop rapide mais bon en bouche : un mini tourbillon après la grosse verse ajoute dix à quinze secondes au lieu de toucher la mouture. Tasse trop légère : monter à 1:14, soit 16 g, avant de rallonger le temps.",
    video: "https://www.youtube.com/watch?v=PNFVCmxBjQQ",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "costaud-bloom",
    name: "Le Costaud (Bloom)",
    number: "Recette 4",
    method: "Switch",
    family: "costaud",
    variant: "Bloom",
    subtitle: "Immersion avec bloom saturant, pour forcer l'extraction",
    dose: 15, water: 225, temp: 95, tempText: "94 à 96 °C",
    dial: "1.5.0",
    ratioText: "ratio 1:15, environ 195 ml en tasse",
    totalText: "total environ 3:30",
    milk: false,
    steps: [
      { t: 0,   text: "Bloom 45 g, vanne FERMÉE. Remuer 3 fois. Attendre 45 secondes." },
      { t: 45,  text: "Compléter à 225 g, vanne FERMÉE." },
      { t: 150, text: "Ouvrir, laisser s'écouler." },
    ],
    bestFor: "Les lavés d'altitude et les torréfactions claires, grains fermés qui résistent et sortent ACIDES ET CREUX avec les autres recettes. Plus chaud et plus long. Pour le plus fin, descendre d'un cran à la main : les recettes portent 1.5.0, sauf la Neo Brew, depuis que je ne recompte plus les crans à chaque changement de machine. Le bloom sert à saturer un grain dense, pas à dégazer.",
    pairedCoffees: ["Mít Liberica Khe Sanh (Father Coffee)", "Guji Uraga lavé (Greenfields)", "Serie 1 The 1893 (Là Việt)", "Cầu Đất lavé (The Married Beans)", "Specialty Arabica Cầu Đất (Ritachi)", "Arabica Sơn La (Every Half)", "Hung's Farm (Bosgaurus)"],
    note: "",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "costaud-immersion",
    name: "Le Costaud (Immersion)",
    number: "Recette 5",
    method: "Switch",
    family: "costaud",
    variant: "Immersion",
    subtitle: "Immersion pure, un seul versement, la plus simple",
    dose: 15, water: 225, temp: 93, tempText: "92 à 94 °C",
    dial: "1.5.0",
    ratioText: "ratio 1:15, environ 195 ml en tasse",
    totalText: "total environ 2:45",
    milk: false,
    steps: [
      { t: 0,   text: "Verser les 225 g d'un coup, vanne FERMÉE. Remuer 3 fois." },
      { t: 120, text: "Petit tourbillon pour aplanir le lit, puis ouvrir." },
    ],
    bestFor: "Ceux qui sortent ACIDES MAIS COMPLETS, avec du sucré et du corps derrière, et dont c'est le style qui ne me va pas. Un versement, une vanne. Pas de percolation, donc pas de canalisation, donc pas de pointes acides. Sert aussi de recette de secours quand je n'ai pas envie de réfléchir.",
    pairedCoffees: ["Guji Uraga lavé (Greenfields)", "Serie 3 Prenn (Là Việt)", "Arabica Yellow Bourbon (Ritachi)", "Hung's Farm (Bosgaurus)", "et tout café qui m'a déçu par son acidité"],
    note: "",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  {
    id: "tetsu-devil",
    name: "Tetsu 4:6",
    number: "Recette 6",
    method: "Switch",
    family: "",
    subtitle: "Percolation pure, cinq versements pilotables",
    dose: 15, water: 225, temp: 93, tempText: "93 °C pour un clair, 88 pour un medium, 83 pour un foncé",
    dial: "1.5.0",
    ratioText: "ratio 1:15, environ 195 ml en tasse",
    totalText: "total environ 2:30 à 3:00, au plus tard 3:30",
    milk: false,
    steps: [],
    bestFor: "Les cafés complexes et chers que je ne veux pas rater, et ceux dont je veux régler moi même l'équilibre. Vanne OUVERTE du début à la fin. Verser dès que le lit réapparaît en surface, sans chrono : l'eau presque toute passée, jamais sur une flaque.",
    pairedCoffees: ["Ethiopia Banko Anaerobic (Amigo)", "Mít Liberica Khe Sanh (Father Coffee)", "Serie 2 Datanla (Là Việt)", "Serie 4 D'ran (Là Việt)", "Proud (Bosgaurus)"],
    note: "La méthode 4:6 de Tetsu Kasuya, champion du monde 2016 : 40 pour cent de l'eau règle l'acidité et le sucre, 60 pour cent le corps. Ne pas confondre avec sa recette « Devil », à deux températures (90 puis 70 °C), dont elle portait le nom jusqu'à la v8.65. Température selon Philocoffea, le café de Tetsu : 93 °C pour un clair, 88 pour un medium, 83 pour un foncé ; la saisie la prend dans la torréfaction de la fiche café. Mouture medium coarse, 2.0.0 : cinq numéros plus ouverts que la zone commune avec la Brikka (25 crans). Sa version : 20 g, 300 g, cinq versements de 60 g, retrait vers 3:30 ; ses 45 secondes entre versements tombent juste à 20 g, à 15 g le lit se vide plus vite. La vidéo est une démonstration de TALES COFFEE, pas de Tetsu lui même ; l'originale est sur la chaîne HARIO (youtube.com/watch?v=wmCW8xSWGZY). Le tourbillon du bloom vient de la démonstration : Tetsu ne remue pas.",
    video: "https://www.youtube.com/watch?v=Xm4bDaioAjg",
    isDefault: false, advanced: false, has_variants: true, active: 1,
  },
  {
    id: "sherrycipe",
    name: "La Sherrycipe",
    number: "Recette 7",
    method: "Switch",
    family: "",
    subtitle: "La recette \"paresseuse\" d'une championne du monde, Shih Yuan Hsu (Instagram shihyuanhsu, marque sherryselection)",
    dose: 15, water: 225, temp: 92, tempText: "92 °C",
    dial: "1.5.0",
    ratioText: "ratio 1:15, environ 195 ml en tasse",
    totalText: "total 1:45 à 2:00, la seule sous deux minutes",
    milk: false,
    steps: [
      { t: 0,  text: "Bloom jusqu'à 45 g, versement CIRCULAIRE, vanne OUVERTE." },
      { t: 30, text: "Verser jusqu'à 140 g, versement CIRCULAIRE, vanne OUVERTE." },
      { t: 60, text: "Compléter à 225 g, versement AU CENTRE, vanne FERMÉE." },
      { t: 90, text: "Ouvrir, laisser s'écouler." },
    ],
    bestFor: "Les mediums et les fermentés solubles, et le matin en semaine quand je veux quelque chose de bon en deux minutes.",
    pairedCoffees: ["Là Việt Balanced", "Fine Robusta Whisky (Home Roast)", "Cà Phê Mít Liberica (Fine Coffee Agency)", "Fine Robusta Cư M'Gar (Every Half)", "Serie 2 Datanla (Là Việt)", "Serie 4 D'ran (Là Việt)"],
    note: "Les deux premiers versements sont CIRCULAIRES, le troisième est AU CENTRE. La source ne donne pas de température, 92 degrés est mon choix. La source indique 7.0 sur un moulin 1zpresso K-Ultra : ne pas convertir ce chiffre, les échelles entre moulins ne sont pas transposables. On retient uniquement son descriptif medium-coarse, 800 à 1000 microns, soit 2.0.0 sur mon Timemore C5 ESP.",
    video: "https://www.youtube.com/watch?v=wCNxPYyGWoo",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  /* Variant of the Chronicler: it shares its CARD in the Guide (family
     chronicler), but it is placed LAST in the list, at Chris's request:
     in the entry menu, it came before the recipes he actually
     uses. */
  {
    id: "sweet",
    name: "The Coffee Chronicler's Recipe (Sweet)",
    number: "Recette 8",
    method: "Switch",
    family: "chronicler",
    variant: "Sweet",
    subtitle: "La même, vanne fermée 20 secondes plus tôt, plus de sucrosité",
    dose: 15, water: 240, temp: 92, tempText: "92 °C",
    dial: "1.5.0",
    ratioText: "ratio 1:16, environ 210 ml en tasse",
    totalText: "total 2:45 à 3:15",
    milk: false,
    steps: [
      { t: 0,   text: "Verser jusqu'à 120 g, vanne OUVERTE, en spirale." },
      { t: 25,  text: "FERMER la vanne." },
      { t: 45,  text: "Compléter à 240 g, vanne déjà fermée." },
      { t: 120, text: "Ouvrir, laisser s'écouler." },
    ],
    bestFor: "Les mêmes cafés que la recette 1. C'est la version à prendre quand la 1 sort trop vive. Particulièrement adaptée aux honey. Moins d'eau s'échappe en percolation, donc plus de volume reste en immersion.",
    pairedCoffees: ["Serie 2 Datanla (Là Việt)", "Honey Red (The Married Beans)", "plus toute la liste de la recette 1"],
    note: "",
    video: "https://www.youtube.com/watch?v=68ZOXrXbVHc",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  /* THE TETSU NEO BREW (v8.63). Tetsu Kasuya's "The Neo Brew" recipe, May
     2026 (youtube.com/watch?v=k0nsShguOsU): 20 g for 300 g at 95 or 96 °C,
     extra coarse grind, ten pours of 30 g every 15 seconds, on a Hario NEO
     or a V60. Scaled down to one cup while keeping what defines it, the
     30 g pour and the 15 second rhythm: 16 g for 240 g, eight pours.
     It is the only recipe whose dial is not 1.5.0: its extra coarse grind
     IS the recipe, the entry form keeps it (see ui-saisie). */
  {
    id: "neo-brew",
    name: "Tetsu Neo Brew",
    number: "Recette 9",
    method: "Switch",
    family: "",
    variant: "",
    subtitle: "Huit fois le même versement, toutes les 15 secondes : la plus simple à suivre",
    dose: 16, water: 240, temp: 96, tempText: "95 à 96 °C, bouilloire prise au gros bouillon",
    dial: "2.8.0",
    ratioText: "ratio 1:15, environ 205 ml en tasse",
    totalText: "total environ 2:30",
    milk: false,
    steps: [
      { t: 0  , text: "Verser 30 g, vanne OUVERTE, en spirale rapide." },
      { t: 15 , text: "Verser jusqu'à 60 g." },
      { t: 30 , text: "Verser jusqu'à 90 g." },
      { t: 45 , text: "Verser jusqu'à 120 g." },
      { t: 60 , text: "Verser jusqu'à 150 g." },
      { t: 75 , text: "Verser jusqu'à 180 g." },
      { t: 90 , text: "Verser jusqu'à 210 g." },
      { t: 105, text: "Dernier versement, jusqu'à 240 g." },
      { t: 120, text: "Laisser s'écouler entièrement, fin vers 2:30." },
    ],
    bestFor: "Les torréfactions claires, les lavés comme les naturels et les anaérobies : Tetsu la conçoit pour aller chercher tout le sucré et une texture épaisse, pas seulement pour éviter les défauts. Rien à décider, rien à surveiller : le même versement de 30 g toutes les 15 secondes, vanne ouverte du début à la fin, l'eau ne doit jamais stagner dans le lit. Le mode Brassage bipe à chaque versement. Sur un medium, 96 degrés peuvent tirer vers l'amer, la mouture très grosse compense en partie.",
    pairedCoffees: ["Ethiopia Banko Anaerobic (Amigo)", "Serie 2 Datanla (Là Việt)", "Serie 4 D'ran (Là Việt)", "Guji Uraga lavé (Greenfields)"],
    note: "Source : Tetsu Kasuya, « The Neo Brew », mai 2026 (youtube.com/watch?v=k0nsShguOsU). Sa version : 20 g, 300 g, dix versements de 30 g toutes les 15 secondes, 40 à 45 clics sur un Comandante, extra gros. Ne pas convertir ces clics : on retient l'extra gros, 1200 microns et plus, soit la butée de mon Timemore C5 (3.0.0, 1248 microns). Départ à 2.8.0 (1165 microns) parce que 16 g font un lit moins épais que ses 20 g, où l'eau passe plus vite. Amer ou râpeux : monter vers 3.0.0. Il conseille un Hario NEO, accepte le V60 ; le Switch vanne ouverte est un V60. Il ne donne pas de temps final, 2:30 est mon estimation. À 96 °C la bouilloire se prend au gros bouillon : deux minutes de versement la refroidissent en route.",
    video: "https://www.youtube.com/watch?v=k0nsShguOsU",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
  /* THE TETSU DEVIL (v8.70). Tetsu Kasuya's Switch recipe, February 2023
     (youtube.com/watch?v=gC8K40kZ_6E, "is this recipe divine or
     devilish?"): percolation at 90 °C, then immersion at 70 °C. The figures
     are those quoted by the summaries (20 g, 60 g, 120 g, 280 g), not checked
     in the video. Scaled down to 15 g for 210 g.

     70 °C WITHOUT A THERMOMETER: a WEIGHED mix of water at 90 °C and water at
     room temperature, in a glass on the scale. Room temperature = 28 °C,
     ROOM_WATER_C, the same assumption as the kettle curve. 120 g at
     70 °C = 81 g at 90 + 39 g at room temperature, since (90 − 70) / (70 − 28) = 20 / 42.
     The grams of the mix follow the total water like the other pours. */
  {
    id: "devil-switch",
    name: "Tetsu Devil",
    number: "Recette 10",
    method: "Switch",
    family: "",
    variant: "",
    subtitle: "Percolation à 90 °C, puis immersion à 70 °C : le 70 se fait par un mélange pesé",
    dose: 15, water: 210, temp: 90, tempText: "90 °C, puis 70 °C par mélange",
    dial: "1.5.0",
    ratioText: "ratio 1:14, environ 180 ml en tasse",
    totalText: "total environ 3:00",
    milk: false,
    steps: [
      { t: 0,   text: "Verser 45 g d'eau à 90 °C, vanne OUVERTE." },
      { t: 30,  text: "Verser jusqu'à 90 g, toujours à 90 °C. Puis préparer l'eau à 70 °C : dans un verre sur la balance, 81 g d'eau à 90 °C et 39 g d'eau à température ambiante." },
      { t: 75,  text: "FERMER la vanne, compléter jusqu'à 210 g avec l'eau à 70 °C." },
      { t: 105, text: "Ouvrir, laisser s'écouler, fin vers 3:00." },
    ],
    bestFor: "Tous les cafés : Tetsu la présente comme la recette qui rend n'importe quel grain bon, facilement. La percolation chaude du début va chercher le sucré et les arômes, l'immersion plus froide de la fin arrondit sans tirer l'amertume. Le café sort moins chaud que d'habitude : bien préchauffer la tasse, c'est son conseil.",
    pairedCoffees: ["Là Việt Balanced", "Cà Phê Mít Liberica (Fine Coffee Agency)", "Serie 2 Datanla (Là Việt)", "et tout café qui me déçoit ailleurs"],
    note: "Source : Tetsu Kasuya, février 2023 (youtube.com/watch?v=gC8K40kZ_6E). Sa version : 20 g, 60 g puis 120 g à 90 °C vanne ouverte, fermer à 1:15 et compléter à 280 g à 70 °C, ouvrir à 1:45. Chiffres des résumés, pas relus dans la vidéo. Il moud gros : molette laissée à 1.5.0, passer vers 1.8.0 si l'écoulement traîne. Le 70 °C : le mélange pesé de l'étape 2, avec l'eau que je bois (bouteille ou filtrée), pas celle du robinet. Sans eau ambiante sous la main, un glaçon d'eau potable marche aussi : 106 g d'eau à 90 °C et 14 g de glace font 120 g vers 70 °C, la glace qui fond absorbe beaucoup plus qu'elle ne pèse.",
    video: "https://www.youtube.com/watch?v=gC8K40kZ_6E",
    isDefault: false, advanced: false, has_variants: false, active: 1,
  },
];

// Old recipe names: automatic migration of the history.
const RECIPE_RENAMES = {
  "Brikka flat white": "Brikka au lait",
  "Brikka cappuccino": "Brikka au lait",
  "Brikka référence": "Brikka classique",
  "Brikka rang bơ": "Brikka classique",
  "Le Fruité": "The Coffee Chronicler's Recipe",
  "Le Costaud": "Le Costaud (Bloom)",
  "L'Adoucisseur": "Le Costaud (Immersion)",
  "Le 4:6 de Tetsu": "Tetsu 4:6",
  "The Tetsu Devil": "Tetsu 4:6",
  "The Sweet Variation": "The Coffee Chronicler's Recipe (Sweet)",
};
const OLD_SEED_IDS = ["brikka-ref", "brikka-rangbo", "fruite", "costaud", "adoucisseur", "complet", "tetsu"];

// Tetsu 4:6 variants. Pours are recomputed from the total water.
// For 225 g: bloom 30, then 60 (40 percent at 90 g), then 3 x 45.
const TETSU = {
  /* No more fixed schedule (v8.99): pour when the bed reappears, Tetsu's
     rule. The 45 seconds of v8.69 were right for 20 g, not for 15 g. */
  first40: [
    { id: "sucre",     name: "Plus de sucre",  detail: "30 puis 60 g : plus de sucre, moins d'acidité. Mon profil, le réglage par défaut.", parts: [1, 2], isDefault: true },
    { id: "equilibre", name: "Équilibre",      detail: "45 puis 45 g : équilibré.", parts: [1, 1] },
    { id: "vivacite",  name: "Plus de vivacité", detail: "60 puis 30 g : plus de vivacité.", parts: [2, 1] },
  ],
  last60: [
    { id: "leger",  name: "Corps léger",  detail: "Un seul versement.", n: 1 },
    { id: "moyen",  name: "Corps moyen",  detail: "Deux versements.", n: 2 },
    { id: "plein",  name: "Corps plein",  detail: "Trois versements. Mon choix.", n: 3, isDefault: true },
  ],
  pours(totalWater, variant40, variant60) {
    const p40 = totalWater * 0.4;
    const p60 = totalWater * 0.6;
    const sum = variant40.parts[0] + variant40.parts[1];
    const pours = [
      Math.round(p40 * variant40.parts[0] / sum),
      Math.round(p40 * variant40.parts[1] / sum),
    ];
    for (let i = 0; i < variant60.n; i++) {
      pours.push(Math.round(p60 / variant60.n));
    }
    const allocated = pours.reduce((a, b) => a + b, 0);
    pours[pours.length - 1] += Math.round(totalWater) - allocated;
    return pours;
  },
};

/* TEMPERATURE BY THE COFFEE'S ROAST LEVEL (v9.00). Only for recipes whose
   source gives a value per roast level; the others keep their single
   figure. Key: the roast level on the coffee sheet (Claire, Medium,
   Foncée).
   - Tetsu 4:6: Philocoffea, Tetsu's cafe, gives 93, 88 and 83 °C.
   - Better 1 Cup: Hoffmann, 95 to 100 depending on the roast, 90 to 92 for a dark one.
   - One and Done: Hedrick, 90 to 93 for a light or a medium, under 90 beyond.
   The table only applies if the recipe's temperature is still the original
   one: a figure edited by hand in "Gérer les recettes" wins. */
const TEMP_BY_ROAST = {
  "tetsu-devil":   { "Claire": 93, "Medium": 88, "Foncée": 83 },
  "hoffmann-1cup": { "Claire": 98, "Medium": 95, "Foncée": 91 },
  "one-and-done":  { "Claire": 92, "Medium": 91, "Foncée": 88 },
};

function temperatureForCoffee(recipe, coffee) {
  if (!recipe) return "";
  const table = TEMP_BY_ROAST[recipe.id];
  const original = STARTER_RECIPES.find(d => d.id === recipe.id);
  if (!table || !original || Number(recipe.temp) !== Number(original.temp)) return recipe.temp;
  return (coffee && table[coffee.roast]) || recipe.temp;
}

// Conversion of steps to and from the editable text:
// one step per line, "m:ss text" for a timed step, "- text" otherwise.
function stepsToText(steps) {
  return (steps || []).map(e => {
    if (e.t === null || e.t === undefined || e.t === "") return "- " + e.text;
    const mn = Math.floor(e.t / 60), s = e.t % 60;
    return mn + ":" + String(s).padStart(2, "0") + " " + e.text;
  }).join("\n");
}

function textToSteps(text) {
  return (text || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const parsed = l.match(/^(\d+):([0-5]\d)\s+(.+)$/);
    if (parsed) return { t: parseInt(parsed[1], 10) * 60 + parseInt(parsed[2], 10), text: parsed[3] };
    return { t: null, text: l.replace(/^[-·]\s*/, "") };
  });
}

// The starter cups.
const STARTER_CUPS = [
  { id: "t1", name: "Loveramics Flat White Egg", capacity_ml: 150 },
  { id: "t2", name: "Loveramics Espresso Egg", capacity_ml: 80 },
  { id: "t3", name: "Loveramics Nutty Tasting Cup", capacity_ml: 150 },
  { id: "t4", name: "Classic Mug", capacity_ml: 330 },
];

// The 5 starter coffees, used when creating a blank dataset.
const STARTER_COFFEES = [
  { id: "c1", name: "Trung Nguyên Sáng Tạo 4", roaster: "Trung Nguyên", origin: "Buôn Ma Thuột, Vietnam", species: "Blend Arabica, Robusta, Excelsa, Catimor", process: "Torréfaction traditionnelle avec additifs", roast: "Foncée", pre_ground: 1, real_coffee_pct: 82, tag: "café aromatisé", roaster_notes: "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.", bag_size_g: 340, price_vnd: 148800, roast_date: "", recommended_method: "Brikka", recommended_recipe: "Brikka classique", active: 1 },
  { id: "c2", name: "Bana Cofe G4", roaster: "Bana Cofe", origin: "Vietnam", species: "Robusta", process: "Rang bơ", roast: "Foncée", pre_ground: 1, real_coffee_pct: 100, tag: "", roaster_notes: "Beurre, caramel, sucre roux, déjà moulu", bag_size_g: 250, price_vnd: 87000, roast_date: "", recommended_method: "Brikka", recommended_recipe: "Brikka classique", active: 1 },
  { id: "c3", name: "Cà Phê Mít Liberica", roaster: "Fine Coffee Agency", origin: "Vietnam", species: "Liberica", process: "Natural", roast: "Medium", pre_ground: 0, real_coffee_pct: 100, tag: "", roaster_notes: "Jacquier mûr, cacao, amande", bag_size_g: 200, price_vnd: 280000, roast_date: "", recommended_method: "Les deux", recommended_recipe: "The Coffee Chronicler's Recipe", active: 1 },
  { id: "c4", name: "Là Việt Balanced", roaster: "Là Việt", origin: "Đà Lạt, Vietnam", species: "Arabica", process: "Lavé", roast: "Medium", pre_ground: 0, real_coffee_pct: 100, tag: "café de référence", roaster_notes: "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté", bag_size_g: 250, price_vnd: 125000, roast_date: "", recommended_method: "Les deux", recommended_recipe: "The Coffee Chronicler's Recipe", active: 1 },
  { id: "c5", name: "Là Việt Strong", roaster: "Là Việt", origin: "Đà Lạt, Vietnam", species: "Blend arabica et robusta", process: "Classique", roast: "Foncée", pre_ground: 0, real_coffee_pct: 100, tag: "", roaster_notes: "Corps fort, amertume marquée. Rejeté, trop amer.", bag_size_g: 250, price_vnd: 125000, roast_date: "", recommended_method: "Brikka", recommended_recipe: "Brikka classique", active: 0 },
];

// Descriptors organised by the families of the SCA flavor wheel.
const DESCRIPTOR_GROUPS = [
  { name: "Corps et texture", tags: ["rond", "sirupeux", "crémeux", "beurré", "gras", "velouté", "soyeux", "liquoreux", "sec", "léger", "astringent", "rugueux", "aqueux"] },
  { name: "Cacao et noix", tags: ["chocolat noir", "chocolat au lait", "cacao", "noisette", "amande", "cacahuète"] },
  { name: "Sucré", tags: ["caramel", "sucre roux", "sucre de canne", "miel", "vanille", "mélasse", "praliné"] },
  { name: "Fruité", tags: ["banane", "jacquier", "fruits tropicaux", "fruit de la passion", "fruits mûrs", "fruits rouges", "cassis", "cerise", "prune", "fruits secs", "raisin", "pomme", "agrume", "orange", "pêche"] },
  // Acidity was entirely missing as an AXIS: only "agrume" existed, and that
  // is an aroma, not a structure. Yet acidic and sour are the same acids for
  // two opposite verdicts, and it is the costliest confusion in tasting.
  { name: "Acidité", tags: ["acidité vive", "acidulé", "aigre", "citronné", "vinaigré"] },
  { name: "Floral et thé", tags: ["floral", "jasmin", "rose", "thé noir", "thé vert"] },
  { name: "Épices", tags: ["épices", "cannelle", "clou de girofle", "réglisse", "poivre"] },
  { name: "Céréales et malt", tags: ["malt", "pain grillé", "biscuit"] },
  { name: "Fermentation", tags: ["vineux", "fermenté", "rhum"] },
  /* Earth and wood (v8.74): terreux, boisé and tabac were filed under
     defects, whereas they are traits of robusta and liberica. */
  { name: "Terre et bois", tags: ["terreux", "boisé", "tabac", "cuir"] },
  /* "salé" (the signature of under-extraction, which the Guide has you taste
     with a pinch of salt) and "métallique" (the typical moka pot defect)
     were missing (v8.74). */
  { name: "Torréfaction et défauts", tags: ["fumé", "brûlé", "cendre", "caoutchouc", "métallique", "salé", "moisi", "papier", "rance", "phénolique"] },
];
const DESCRIPTORS = DESCRIPTOR_GROUPS.flatMap(g => g.tags);

/* Diagnostics grouped by WHAT NEEDS FIXING, rather than as a flat list.
   Three different levers: the extraction setting (grind, time,
   temperature), the ratio (dose against water), and the coffee itself, on
   which no setting has any effect.

   Each axis goes from slight to clear-cut, with an "un peu" everywhere: a cup
   slightly too concentrated does not call for the same correction as a cup
   clearly too strong, and without nuance you end up ticking the step above
   by default, which skews the diagnosis.

   NO existing value has been removed or renamed: the history already
   recorded stays readable as is. Adding breaks nothing, removing would. */
const DIAGNOSTIC_GROUPS = [
  { name: "Rien à changer", diags: ["Équilibré"] },
  {
    name: "Réglage d'extraction",
    diags: [
      "Un peu acide",
      "Sous-extrait (acide)",
      "Un peu amer",
      "Sur-extrait (amer)",
      "Un peu astringent",
      "Astringent",
    ],
  },
  {
    name: "Ratio café et eau",
    diags: [
      "Un peu léger",
      "Trop léger (aqueux)",
      "Un peu concentré",
      "Trop fort (concentré)",
    ],
  },
  {
    name: "Le café lui même",
    diags: [
      "Un peu éventé",
      "Creux, plat (café éventé)",
      "Un peu brûlé",
      "Brûlé (défaut du sachet)",
    ],
  },
];

// Flat list, in group order. Remains the reference for the storage
// order, the history filter and the dashboard ring.
/* DERIVED, never checked. Sour and bitter in the same sip is not one more
   symptom to check, it is the CAUSE: the water drilled a channel and over
   extracted one area while bypassing the rest. Chris flagged it twice as a
   duplicate of the two pills above, and he was right from the interface's
   point of view: the site asked him to conclude in its place. It now
   concludes on its own as soon as both families are checked, see
   updateDiagnosticCorrection in app.js.

   The label stays in DIAGNOSTICS, without a pill: it exists in Chris's
   history (extraction of 11 August) and must stay translatable, filterable
   and displayable. Removing it would break his past data. */
const DERIVED_DIAGNOSTIC = "Acide ET amer (extraction inégale)";

const DIAGNOSTICS = DIAGNOSTIC_GROUPS.flatMap(g => g.diags).concat([DERIVED_DIAGNOSTIC]);

/* When to check each diagnostic. The correction alone was not enough: it
   says what to do, not which case you are in. Without this guide you check
   by guesswork, and a correct fix applied to the wrong diagnostic makes the
   next cup worse.

   Descriptions IN THE MOUTH, not in jargon: these are sensations to recognise.
   No double quotes, these texts go into an HTML attribute. */
/* Families where one variant IS the preheating. For those, the "eau
   préchauffée" checkbox would duplicate the recipe choice: the box is
   hidden and the stored value is derived from the chosen recipe, which keeps
   the `preheated_water` column correct across the whole history. */
const PREHEAT_FAMILIES = ["brikka-classique"];
const PREHEATED_WATER_RECIPES = ["brikka-classique-bouillante"];

const DIAGNOSTIC_WHEN = {
  "Équilibré": "Rien ne dépasse, tu la referais à l'identique.",
  "Un peu acide": "Ça pique légèrement en attaque, sans être franchement citronné.",
  "Sous-extrait (acide)": "Acidité vive, et du creux derrière : la tasse semble inachevée.",
  "Un peu amer": "Une amertume discrète s'installe en fin de bouche.",
  "Sur-extrait (amer)": "Amertume franche et sécheresse, la tasse gratte.",
  "Un peu astringent": "La langue râpe un peu, comme après un thé trop infusé.",
  "Astringent": "Bouche sèche et rugueuse, qui persiste après la gorgée.",
  "Acide ET amer (extraction inégale)": "Les deux défauts dans la même gorgée : l'eau n'a pas traversé partout.",
  "Un peu léger": "Bonne tasse, mais un peu diluée : le goût manque de tenue.",
  "Trop léger (aqueux)": "De l'eau colorée, aucun corps.",
  "Un peu concentré": "Un peu dense, tu allongerais volontiers d'un fond d'eau.",
  "Trop fort (concentré)": "Épais et écrasant, difficile à boire tel quel.",
  "Un peu éventé": "Les arômes sont là mais en retrait, moins nets qu'au début du sachet.",
  "Creux, plat (café éventé)": "Presque aucun arôme, une tasse sans relief.",
  "Un peu brûlé": "Une note de grillé un peu poussée, sans être cendrée.",
  "Brûlé (défaut du sachet)": "Goût de cendre ou de caoutchouc, dès la première gorgée.",
};

const DIAGNOSTIC_CORRECTIONS = {
  "Équilibré": "Rien à changer, note le réglage.",
  "Un peu acide": "Presque bon : deux crans plus fin, ou 2 à 3 degrés plus chaud au Switch.",
  "Sous-extrait (acide)": "Moudre plus fin, plus chaud, plus longtemps.",
  "Un peu amer": "Presque bon : deux crans plus grossier, ou 2 à 3 degrés moins chaud (à la Brikka, un cran de feu en moins).",
  "Sur-extrait (amer)": "Moudre plus grossier, moins chaud, moins longtemps.",
  "Un peu astringent": "Presque bon : deux crans plus grossier, et remuer moins.",
  "Astringent": "Sur-extraction : plus grossier, et remuer moins.",
  "Acide ET amer (extraction inégale)": "Répartition : égaliser le lit sans jamais tasser. En Brikka, ne pas trop remplir le panier. Au Switch, remuer et verser en spirale.",
  "Un peu léger": "Presque bon : un peu moins d'eau au Switch. À la Brikka le panier est déjà plein : retirer du feu un peu plus tôt.",
  "Trop léger (aqueux)": "Resserrer le ratio : moins d'eau au Switch ; à la Brikka, retirer du feu plus tôt.",
  "Un peu concentré": "Presque bon : un peu plus d'eau au Switch ; à la Brikka, allonger la tasse d'un peu d'eau chaude.",
  "Trop fort (concentré)": "Élargir le ratio : plus d'eau au Switch ; à la Brikka, allonger la tasse d'eau chaude.",
  "Un peu éventé": "Le sachet commence à fatiguer : bien le refermer, et le finir plus vite.",
  "Creux, plat (café éventé)": "Fraîcheur : vérifier la date de torréfaction, resserrer le sachet.",
  "Un peu brûlé": "Note de torréfaction un peu poussée : baisser la flamme, et retirer du feu plus tôt.",
  "Brûlé (défaut du sachet)": "Torréfaction trop foncée, aucun réglage ne l'enlèvera.",
};

/* THE QUANTIFIED CORRECTION (v8.48): the DIRECTION of each lever, and nothing
   else. Written here, next to the DIAGNOSTIC_CORRECTIONS sentences it
   translates, so that one cannot be changed without seeing the other (a test
   checks they say the same thing). No QUANTITY here: the steps (clicks,
   degrees, heat, grams) live in Settings, card "Mes pas de correction", and
   the starting values come from the cup itself.

   mouture: negative finer, positive coarser.
   chaleur: positive hotter (degrees on the Switch, heat on the Brikka). On the
             Brikka, only downwards (v8.74): raising the flame overheats
             the aluminium, the Guide says so, the correction no longer offers it.
   ratio  : negative tighten, positive widen. On the Switch only (v8.74):
             the Brikka basket is full and levelled, no coffee is added to it.
   1 for an "un peu" diagnostic, 2 for a clear-cut one: the step is doubled.
   Diagnostics about the coffee itself and uneven extraction have no
   quantifiable lever: a setting changes nothing there, or not in one direction. */
const DIAGNOSTIC_LEVERS = {
  "Un peu acide": { grind: -1, heat: 1 },
  "Sous-extrait (acide)": { grind: -2, heat: 2 },
  "Un peu amer": { grind: 1, heat: -1 },
  "Sur-extrait (amer)": { grind: 2, heat: -2 },
  "Un peu astringent": { grind: 1 },
  "Astringent": { grind: 2 },
  "Un peu léger": { ratio: -1 },
  "Trop léger (aqueux)": { ratio: -2 },
  "Un peu concentré": { ratio: 1 },
  "Trop fort (concentré)": { ratio: 2 },
};

// Caffeine estimate: mass percentage by species, and about
// 90 percent of the caffeine passes into the cup. For a non-pure coffee,
// only the share of real coffee counts.
function caffeinePct(species) {
  const e = (species || "").toLowerCase();
  const arabica = e.includes("arabica");
  const robusta = e.includes("robusta");
  if (arabica && robusta) return 1.8;
  if (robusta) return 2.4;
  if (arabica) return 1.2;
  if (e.includes("liberica") || e.includes("excelsa")) return 1.4;
  return 1.8;
}

function caffeineMg(dose, species, realCoffeePct) {
  if (!dose) return 0;
  const pureShare = realCoffeePct === undefined || realCoffeePct === "" ? 100 : Number(realCoffeePct);
  return Math.round(dose * (pureShare / 100) * caffeinePct(species) * 10 * 0.9);
}

// Coffees that never go in the Switch, by exact or partial name.
/* SWITCH WATER TEMPERATURE FROM HEATING TIME.

   Chris has no thermometer and always uses the same kettle on the same
   stove. The time spent on the heat is therefore a REPRODUCIBLE measure,
   where "small bubbles" or "simmering" are judgements by eye. It is an
   estimate, not a measurement; the degree stays editable by hand and it is
   what gets stored as the temperature. The Brikka is not concerned: it
   starts with cold water.

   A CURVE, NOT A STRAIGHT LINE (v8.59). Until now the rise was linear, from
   tap water (28 °C, room-temperature water in Vietnam) to 100 °C at the
   boiling time. Chris found it too low: at 1:30 his first bubbles are
   already rising, i.e. 85 to 90 degrees, and the line only gave 82. A
   kettle does not heat in a straight line: it loses more and more heat
   as the water nears boiling, the rise slows down at the end.
   The model is Newton's law of cooling,
     T(t) = 28 + 72 · (1 − e^(−k·t)) / (1 − e^(−k·E)),
   fitted on TWO markers that Chris times in Settings: the first bubbles
   rising (88 °C) and the full boil (100 °C, at time E). k is found by
   bisection so that the curve goes through the first marker; if that
   marker falls exactly on the line, k is zero and we get the old model back.
   A missing marker, or one not before boiling, falls back to three quarters
   of the boiling time: 1:30 for 2:00, which is what Chris measured. */
const ROOM_WATER_C = 28;
const BUBBLES_C = 88;
const DEFAULT_BUBBLES_SHARE = 0.75;

/* The curve constant, "per second", for these two markers. We look for
   the dimensionless a = k·E: the share of the rise done at the marker,
   (1 − e^(−a·r)) / (1 − e^(−a)), grows with a, from r (the line, a = 0) towards 1. */
function heatingConstant(boilS, bubblesS) {
  const e = Number(boilS), f = Number(bubblesS);
  const r = f > 0 && f < e ? f / e : DEFAULT_BUBBLES_SHARE;
  const target = (BUBBLES_C - ROOM_WATER_C) / (100 - ROOM_WATER_C);
  const part = x => (Math.abs(x) < 1e-9 ? r : (1 - Math.exp(-x * r)) / (1 - Math.exp(-x)));
  let low = -40, high = 40;
  for (let i = 0; i < 60; i++) {
    const m = (low + high) / 2;
    if (part(m) < target) low = m; else high = m;
  }
  return (low + high) / 2 / e;
}

// The share of the rise done at s seconds, from 0 (tap) to 1 (boiling).
function heatingShare(s, e, k) {
  return Math.abs(k * e) < 1e-6 ? s / e : (1 - Math.exp(-k * s)) / (1 - Math.exp(-k * e));
}

function temperatureFromHeating(seconds, boilS, bubblesS) {
  const s = Number(seconds), e = Number(boilS);
  if (seconds === "" || !Number.isFinite(s) || s < 0 || !(e > 0)) return "";
  if (s >= e) return 100;
  const k = heatingConstant(e, bubblesS);
  return Math.round(ROOM_WATER_C + (100 - ROOM_WATER_C) * heatingShare(s, e, k));
}

/* The inverse, rounded to 5 seconds: "for 92 °C, leave the kettle 1:40". */
function heatTimeForTemperature(tempC, boilS, bubblesS) {
  const t = Number(tempC), e = Number(boilS);
  if (tempC === "" || !Number.isFinite(t) || !(e > 0)) return "";
  if (t >= 100) return Math.round(e);
  if (t <= ROOM_WATER_C) return 0;
  const k = heatingConstant(e, bubblesS);
  const part = (t - ROOM_WATER_C) / (100 - ROOM_WATER_C);
  const s = Math.abs(k * e) < 1e-6 ? part * e : -Math.log(1 - part * (1 - Math.exp(-k * e))) / k;
  return Math.round(s / 5) * 5;
}

/* WHICH COFFEE, WHICH RECIPE (v8.74). The advice was scattered across five
   places in the Guide and the "Pour qui" of each recipe. Here a single table:
   the process as the row, the roast level as the column, and in each cell the
   starting recipe (by id: its name and settings come from the recipe itself),
   the advised temperature, and another recipe to try. The Guide draws it
   with, in each cell, your own average over the coffees of that profile. */
const COFFEE_RECIPE_MATRIX = {
  rows: [
    { id: "lave", name: "Lavé" },
    { id: "honey", name: "Honey" },
    { id: "natural", name: "Natural" },
    { id: "anaerobic", name: "Anaerobic, fermenté" },
    { id: "robusta", name: "Robusta, rang bơ" },
  ],
  columns: [
    { id: "clair", name: "Clair" },
    { id: "medium", name: "Medium" },
    { id: "fonce", name: "Foncé" },
  ],
  cells: {
    "lave|clair": { recipe: "one-and-done", temp: "93 à 96 °C", alternative: "costaud-bloom" },
    "lave|medium": { recipe: "chronicler", temp: "92 °C", alternative: "hoffmann-1cup" },
    "lave|fonce": { recipe: "costaud-immersion", temp: "88 à 90 °C", alternative: "brikka-classique" },
    "honey|clair": { recipe: "sweet", temp: "92 °C", alternative: "chronicler" },
    "honey|medium": { recipe: "sweet", temp: "92 °C", alternative: "sherrycipe" },
    "honey|fonce": { recipe: "brikka-classique", temp: "", alternative: "costaud-immersion" },
    "natural|clair": { recipe: "neo-brew", temp: "95 à 96 °C", alternative: "chronicler" },
    "natural|medium": { recipe: "chronicler", temp: "90 à 92 °C", alternative: "devil-switch" },
    "natural|fonce": { recipe: "brikka-classique", temp: "", alternative: "devil-switch" },
    "anaerobic|clair": { recipe: "neo-brew", temp: "93 °C", alternative: "chronicler" },
    "anaerobic|medium": { recipe: "chronicler", temp: "88 à 90 °C", alternative: "devil-switch" },
    "anaerobic|fonce": { recipe: "brikka-classique", temp: "", alternative: "" },
    "robusta|clair": { recipe: "sherrycipe", temp: "92 °C", alternative: "devil-switch" },
    "robusta|medium": { recipe: "brikka-classique", temp: "", alternative: "brikka-flatwhite" },
    "robusta|fonce": { recipe: "brikka-classique", temp: "", alternative: "brikka-flatwhite" },
  },
};

/* A coffee's profile for this table, read from its sheet: the species and
   the process give the row, the roast level the column. An empty or unknown
   field gives null: the coffee counts in no cell. */
function coffeeProfile(coffee) {
  const p = String((coffee && coffee.process) || "").toLowerCase();
  const e = String((coffee && coffee.species) || "").toLowerCase();
  const t = String((coffee && coffee.roast) || "").toLowerCase();
  const row = /robusta|rang b|tẩm b/.test(e + " " + p) ? "robusta"
    : /anaer|ferment|yếm khí|lên men/.test(p) ? "anaerobic"
    : /natur|tự nhiên/.test(p) ? "natural"
    : /honey|mật ong/.test(p) ? "honey"
    : /lav|wash|ướt/.test(p) ? "lave" : null;
  const column = /fonc|dark|đậm/.test(t) ? "fonce"
    : /medium|vừa/.test(t) ? "medium"
    : /clair|light|sáng/.test(t) ? "clair" : null;
  return { row: row, column: column };
}

/* Coffees rated for the Brikka (body, chocolate), which the Switch's paper
   does not do justice to. These are NOT rang bơ (v8.74): they have their own
   message, warn_brikka_profile, instead of the butter one. */
const NEVER_SWITCH_NAMES = [
  "Fine Robusta Honey",
  "Midnight Chocolate",
  "Proud of Việt Nam",
  "Robusta Honey",
  "Signature Blend",
];

/* SCALING THE POURS.

   A recipe writes its steps in ABSOLUTE grams ("Compléter à 225 g"). Changing
   the water in the entry form therefore made the recipe wrong: it still asked
   for 225 g while Chris had poured 240, and the timer announced the same
   stale figures.

   We ONLY touch numbers followed by " g" and strictly greater than
   POUR_THRESHOLD_G. Below that they are coffee doses or milk quantities,
   never a water pour: the smallest pour in the original recipes is a 45 g
   bloom, the largest dose is 18 g. Without this safeguard, a recipe that
   mentioned "14 g de café" in its text would get its dose multiplied,
   which would be worse than not adapting anything.

   PURE function with no DOM, like tuning.js, so it can be tested without a
   browser. See tools/data.test.mjs. */
const POUR_THRESHOLD_G = 30;

function scalePours(text, factor) {
  if (!(factor > 0) || factor === 1) return String(text);
  return String(text).replace(/(\d+(?:[.,]\d+)?)(\s*g\b)/g, (whole, num, suffix) => {
    const v = Number(String(num).replace(",", "."));
    if (!(v > POUR_THRESHOLD_G)) return whole;
    return Math.round(v * factor) + suffix;
  });
}

/* Consistency rules for coffee plus method plus recipe.
   Returns { msgs }: INFORMATION only, never a refusal.

   There used to be a block here that refused to SAVE a rang bơ or non-pure
   coffee on the Switch. Removed: the logbook is for noting what Chris drank,
   not for ruling on what he is allowed to try. A combination never tried is
   not a bad combination, and refusing the entry prevented precisely the
   production of the data that would settle it. Do not reintroduce it. */
function combinationWarnings(coffee, method, recipeName, recipes) {
  const msgs = [];
  if (!coffee) return { msgs };
  const list = recipes || [];

  if (method === "Switch") {
    const pct = coffee.real_coffee_pct === "" || coffee.real_coffee_pct === undefined ? 100 : Number(coffee.real_coffee_pct);
    const coffeeProcess = (coffee.process || "").toLowerCase();
    if (pct < 100 || (coffee.tag || "").toLowerCase().includes("aromatisé")) {
      msgs.push(I18N.t("warn_flavoured", { pct }));
    } else if (coffeeProcess.includes("rang bơ") || coffeeProcess.includes("rang bo") || coffeeProcess.includes("tẩm bơ")) {
      msgs.push(I18N.t("warn_rang_bo"));
    } else if (NEVER_SWITCH_NAMES.some(n => (coffee.name || "").toLowerCase().includes(n.toLowerCase()))) {
      msgs.push(I18N.t("warn_brikka_profile"));
    } else if (coffeeProcess.includes("wet hulled") || coffeeProcess.includes("giling basah")) {
      msgs.push(I18N.t("warn_wet_hulled"));
    } else if ((coffee.roast || "").toLowerCase().includes("fonc")) {
      msgs.push(I18N.t("warn_dark_roast"));
    } else if ((coffee.recommended_method || "") === "Brikka") {
      msgs.push(I18N.t("warn_brikka_recommended"));
    }
  }

  if (method === "Brikka" && (coffee.recommended_method || "") === "Switch") {
    msgs.push(I18N.t("warn_switch_recommended"));
  }

  // NO warning when the chosen recipe differs from `recommended_recipe`.
  // That recommendation comes from a value set when the coffee was created, never
  // checked by an extraction: claiming to recommend a recipe for a coffee
  // not yet tried is not help, it is noise. The real recommendations
  // come from the dashboard insights, which are computed on the
  // actual ratings.

  return { msgs };
}
