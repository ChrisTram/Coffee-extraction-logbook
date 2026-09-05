// Recettes de départ, cafés de départ, tasses et règles de cohérence.
// Les recettes vivent ensuite dans les données (recettes.csv plus IndexedDB) et
// s'éditent dans l'interface. Ce fichier fournit les versions d'origine,
// vers lesquelles on peut toujours revenir.
"use strict";

const RECETTES_DEPART = [
  {
    id: "brikka-classique",
    nom: "Brikka classique",
    numero: "",
    methode: "Brikka",
    // Famille ajoutée en v7.17 pour partager une carte avec la variante à l'eau
    // bouillante. Le NOM ne change pas, seulement le regroupement d'affichage.
    famille: "brikka-classique",
    variante: "Standard",
    sousTitre: "La base quotidienne de la Brikka",
    dose: 14, eau: 150, temp: "", tempTexte: "dépend de la puissance du feu",
    puissance_feu: 2,
    dial: "1.5.0",
    ratioTexte: "environ 1:7, environ 90 ml en tasse",
    volumeTypique: 90,
    totalTexte: "retrait du feu aux premiers gargouillis",
    lait: false,
    etapes: [
      { t: null, texte: "Remplir la chaudière à l'eau FROIDE : c'est la consigne Bialetti pour la Brikka, dont la soupape lestée est calibrée sur cette montée en pression. L'eau préchauffée est la méthode de la Moka Express, pas celle-ci." },
      { t: null, texte: "Ne jamais dépasser la soupape." },
      { t: null, texte: "Égaliser la mouture, ne jamais tasser." },
      { t: null, texte: "Retirer du feu dès les premiers gargouillis." },
    ],
    pourQui: "L'usage quotidien de la Brikka, 14 g pour environ 90 ml en tasse.",
    cafesAssocies: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4", "Là Việt Balanced"],
    note: "Après un Bana G4 ou un Sáng Tạo 4 : rinçage immédiat à l'eau chaude après usage, le sel et les graisses attaquent l'aluminium.",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  {
    // Protocole distinct, pas une simple case à cocher : l'eau bouillante change
    // la montée en pression, la durée et le comportement de la soupape. Réglé
    // pour corriger le défaut observé, 4 minutes de cuisson puis un écoulement
    // de 5 secondes. Mouture plus grossière que la Standard pour que la soupape
    // lâche plus tôt et coule plus longtemps au lieu d'exploser.
    id: "brikka-classique-bouillante",
    nom: "Brikka classique (eau préchauffée)",
    numero: "",
    methode: "Brikka",
    famille: "brikka-classique",
    variante: "Eau préchauffée",
    sousTitre: "Eau bouillante, flamme forte au départ, mouture plus grossière",
    dose: 14, eau: 150, temp: "", tempTexte: "eau bouillante au départ, la suite dépend du feu",
    puissance_feu: 2,
    dial: "1.5.0",
    ratioTexte: "environ 1:7, environ 90 ml en tasse",
    volumeTypique: 90,
    totalTexte: "montée en pression sous 2 minutes, écoulement de 20 à 45 secondes",
    lait: false,
    etapes: [
      { t: null, texte: "Faire bouillir l'eau et la verser tout de suite : tiède, on cumule les inconvénients des deux méthodes." },
      { t: null, texte: "Ne jamais dépasser la soupape." },
      { t: null, texte: "Égaliser la mouture, ne jamais tasser : un panier tassé fait percer un canal." },
      { t: null, texte: "Flamme forte jusqu'aux premières gouttes : c'est avant l'écoulement que la mouture cuit." },
      { t: null, texte: "Baisser la flamme dès que ça coule, pour allonger l'écoulement." },
      { t: null, texte: "Retirer du feu dès les premiers gargouillis." },
    ],
    pourQui: "L'alternative à tester contre la Standard : même dose, même eau, seuls la température de départ, la flamme et la mouture changent. À savoir avant de comparer : Bialetti recommande l'eau FROIDE pour la Brikka, l'eau préchauffée étant la méthode de la Moka Express. Cette recette applique donc volontairement l'autre méthode.",
    cafesAssocies: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4", "Là Việt Balanced"],
    note: "Si l'écoulement dure moins de 10 secondes, la mouture est trop fine et la soupape lâche d'un coup : passer à 1.6.0, plus grossier. Noter le temps total ET le temps d'écoulement, c'est leur écart qui dit combien de temps la mouture a cuit.",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  /* UNE seule recette au lait. Le flat white et le cappuccino partageaient la
     même extraction au gramme près : seule la texture du lait change. Le
     cappuccino part de MOINS de lait froid que le flat white parce que le lait
     mousse gonfle : le tiers de mousse remplit la tasse avec moins de liquide. Deux recettes pour une extraction coupaient les stats en
     deux sans rien apprendre. */
  {
    id: "brikka-flatwhite",
    numero: 3,
    nom: "Brikka au lait",
    methode: "Brikka",
    sousTitre: "Flat white ou cappuccino, même extraction",
    dose: 14, eau: 150, temp: "", tempTexte: "dépend de la puissance du feu",
    puissance_feu: 2,
    dial: "1.5.0",
    ratioTexte: "environ 1:7, environ 90 ml en tasse",
    /* Rendement DÉCLARÉ de la recette, pas une estimation calculée. La Brikka
       n'a volontairement pas de formule d'estimation, elle donnait un chiffre
       faux ; celui-ci est mesuré et écrit dans la recette. Il sert de repli pour
       calculer le lait quand le volume n'a pas été mesuré. */
    volumeTypique: 90,
    totalTexte: "extraction identique à la classique",
    lait: true,
    etapes: [
      { t: null, texte: "Extraire exactement comme la Brikka classique : 14 g, environ 90 ml." },
      { t: null, texte: "FLAT WHITE : chauffer le lait pendant l'extraction, texture lisse, peu de mousse." },
      { t: null, texte: "CAPPUCCINO : faire mousser le lait autour de 60 à 65 degrés, viser un tiers de mousse." },
      { t: null, texte: "Verser le lait, puis coiffer avec la mousse s'il y en a." },
    ],
    pourQui: "Flat white ou cappuccino maison. Le site calcule le lait tout seul dès qu'une tasse est choisie : contenance de la tasse moins le volume de café donne le vide à remplir, et le lait FROID à mesurer est un peu moins que ce vide, puisqu'il gonfle en moussant. Un flat white gonfle à peine, un cappuccino d'environ la moitié : c'est pourquoi un cappuccino part de moins de lait pour une tasse plus garnie.",
    cafesAssocies: ["Trung Nguyên Sáng Tạo 4", "Bana Cofe G4"],
    note: "Une Brikka n'est pas un espresso : 90 ml à 1:7 sont bien plus dilués qu'un espresso de 30 ml. Le résultat sera très orienté café, ce qui est voulu.",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  {
    id: "chronicler",
    nom: "The Coffee Chronicler's Recipe",
    numero: "Recette 1",
    methode: "Switch",
    famille: "chronicler",
    variante: "Classique",
    sousTitre: "Percolation puis immersion, la recette par défaut",
    dose: 15, eau: 240, temp: 92, tempTexte: "92 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:16, environ 210 ml en tasse",
    totalTexte: "total 2:45 à 3:15",
    lait: false,
    etapes: [
      { t: 0,   texte: "Verser jusqu'à 120 g, vanne OUVERTE, en spirale de l'extérieur vers l'intérieur." },
      { t: 45,  texte: "Compléter à 240 g, vanne FERMÉE." },
      { t: 120, texte: "Ouvrir, laisser s'écouler." },
    ],
    pourQui: "Les fermentés, natural, honey et anaerobic en torréfaction medium. Grains poreux et solubles, la percolation d'attaque capte les esters volatils, l'immersion va chercher la sucrosité.",
    cafesAssocies: ["Ethiopia Banko Anaerobic (Amigo)", "Fine Robusta Whisky (Home Roast)", "Fine Robusta Anaerobic (Ritachi)", "Anaerobic Fine Robusta (Soul)", "Serie 4 D'ran (Là Việt)", "Cà Phê Mít Liberica (Fine Coffee Agency)", "Fine Robusta Cư M'Gar (Every Half)", "Là Việt Balanced"],
    note: "La source recommande 600 à 700 microns, soit 1.4.2 à 1.6.4 sur mon moulin. Les volumes sont cumulés : compléter à 240 g veut dire que la balance affiche 240.",
    parDefaut: true, avancee: false, variantes: false, actif: 1,
  },
  {
    id: "sweet",
    nom: "The Coffee Chronicler's Recipe (Sweet)",
    numero: "Recette 2",
    methode: "Switch",
    famille: "chronicler",
    variante: "Sweet",
    sousTitre: "La même, vanne fermée 20 secondes plus tôt, plus de sucrosité",
    dose: 15, eau: 240, temp: 92, tempTexte: "92 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:16, environ 210 ml en tasse",
    totalTexte: "total 2:45 à 3:15",
    lait: false,
    etapes: [
      { t: 0,   texte: "Verser jusqu'à 120 g, vanne OUVERTE, en spirale." },
      { t: 25,  texte: "FERMER la vanne." },
      { t: 45,  texte: "Compléter à 240 g, vanne déjà fermée." },
      { t: 120, texte: "Ouvrir, laisser s'écouler." },
    ],
    pourQui: "Les mêmes cafés que la recette 1. C'est la version à prendre quand la 1 sort trop vive. Particulièrement adaptée aux honey. Moins d'eau s'échappe en percolation, donc plus de volume reste en immersion.",
    cafesAssocies: ["Serie 2 Datanla (Là Việt)", "Honey Red (The Married Beans)", "plus toute la liste de la recette 1"],
    note: "",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  {
    id: "costaud-bloom",
    nom: "Le Costaud (Bloom)",
    numero: "Recette 3",
    methode: "Switch",
    famille: "costaud",
    variante: "Bloom",
    sousTitre: "Immersion avec bloom saturant, pour forcer l'extraction",
    dose: 15, eau: 225, temp: 95, tempTexte: "94 à 96 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:15, environ 195 ml en tasse",
    totalTexte: "total environ 3:30",
    lait: false,
    etapes: [
      { t: 0,   texte: "Bloom 45 g, vanne FERMÉE. Remuer 3 fois. Attendre 45 secondes." },
      { t: 45,  texte: "Compléter à 225 g, vanne FERMÉE." },
      { t: 150, texte: "Ouvrir, laisser s'écouler." },
    ],
    pourQui: "Les lavés d'altitude et les torréfactions claires, grains fermés qui résistent et sortent ACIDES ET CREUX avec les autres recettes. Plus chaud et plus long. Pour le plus fin, descendre d'un cran à la main : les dix recettes portent 1.5.0 depuis que je ne recompte plus les crans à chaque changement de machine. Le bloom sert à saturer un grain dense, pas à dégazer.",
    cafesAssocies: ["Mít Liberica Khe Sanh (Father Coffee)", "Guji Uraga lavé (Greenfields)", "Serie 1 The 1893 (Là Việt)", "Cầu Đất lavé (The Married Beans)", "Specialty Arabica Cầu Đất (Ritachi)", "Arabica Sơn La (Every Half)", "Hung's Farm (Bosgaurus)"],
    note: "",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  {
    id: "costaud-immersion",
    nom: "Le Costaud (Immersion)",
    numero: "Recette 4",
    methode: "Switch",
    famille: "costaud",
    variante: "Immersion",
    sousTitre: "Immersion pure, un seul versement, la plus simple",
    dose: 15, eau: 225, temp: 93, tempTexte: "92 à 94 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:15, environ 195 ml en tasse",
    totalTexte: "total environ 2:45",
    lait: false,
    etapes: [
      { t: 0,   texte: "Verser les 225 g d'un coup, vanne FERMÉE. Remuer 3 fois." },
      { t: 120, texte: "Petit tourbillon pour aplanir le lit, puis ouvrir." },
    ],
    pourQui: "Ceux qui sortent ACIDES MAIS COMPLETS, avec du sucré et du corps derrière, et dont c'est le style qui ne me va pas. Un versement, une vanne. Pas de percolation, donc pas de canalisation, donc pas de pointes acides. Sert aussi de recette de secours quand je n'ai pas envie de réfléchir.",
    cafesAssocies: ["Guji Uraga lavé (Greenfields)", "Serie 3 Prenn (Là Việt)", "Arabica Yellow Bourbon (Ritachi)", "Hung's Farm (Bosgaurus)", "et tout café qui m'a déçu par son acidité"],
    note: "",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
  {
    id: "tetsu-devil",
    nom: "The Tetsu Devil",
    numero: "Recette 5",
    methode: "Switch",
    famille: "",
    sousTitre: "Percolation pure, cinq versements pilotables",
    dose: 15, eau: 225, temp: 93, tempTexte: "93 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:15, environ 195 ml en tasse",
    totalTexte: "total environ 3:25",
    lait: false,
    etapes: [],
    pourQui: "Les cafés complexes et chers que je ne veux pas rater, et ceux dont je veux régler moi même l'équilibre. Vanne OUVERTE du début à la fin. Verser dès que le lit vient de s'assécher en surface, environ toutes les 30 à 45 secondes.",
    cafesAssocies: ["Ethiopia Banko Anaerobic (Amigo)", "Mít Liberica Khe Sanh (Father Coffee)", "Serie 2 Datanla (Là Việt)", "Serie 4 D'ran (Là Việt)", "Proud (Bosgaurus)"],
    note: "Mouture medium coarse, 2.0.0 : deux numéros plus ouverts que la zone commune avec la Brikka.",
    parDefaut: false, avancee: false, variantes: true, actif: 1,
  },
  {
    id: "sherrycipe",
    nom: "La Sherrycipe",
    numero: "Recette 6",
    methode: "Switch",
    famille: "",
    sousTitre: "La recette \"paresseuse\" d'une championne du monde, Shih Yuan Hsu (Instagram shihyuanhsu, marque sherryselection)",
    dose: 15, eau: 225, temp: 92, tempTexte: "92 °C",
    dial: "1.5.0",
    ratioTexte: "ratio 1:15, environ 195 ml en tasse",
    totalTexte: "total 1:45 à 2:00, la seule sous deux minutes",
    lait: false,
    etapes: [
      { t: 0,  texte: "Bloom jusqu'à 45 g, versement CIRCULAIRE, vanne OUVERTE." },
      { t: 30, texte: "Verser jusqu'à 140 g, versement CIRCULAIRE, vanne OUVERTE." },
      { t: 60, texte: "Compléter à 225 g, versement AU CENTRE, vanne FERMÉE." },
      { t: 90, texte: "Ouvrir, laisser s'écouler." },
    ],
    pourQui: "Les mediums et les fermentés solubles, et le matin en semaine quand je veux quelque chose de bon en deux minutes.",
    cafesAssocies: ["Là Việt Balanced", "Fine Robusta Whisky (Home Roast)", "Cà Phê Mít Liberica (Fine Coffee Agency)", "Fine Robusta Cư M'Gar (Every Half)", "Serie 2 Datanla (Là Việt)", "Serie 4 D'ran (Là Việt)"],
    note: "Les deux premiers versements sont CIRCULAIRES, le troisième est AU CENTRE. La source ne donne pas de température, 92 degrés est mon choix. La source indique 7.0 sur un moulin 1zpresso K-Ultra : ne pas convertir ce chiffre, les échelles entre moulins ne sont pas transposables. On retient uniquement son descriptif medium-coarse, 800 à 1000 microns, soit 2.0.0 sur mon Timemore C5 ESP.",
    parDefaut: false, avancee: false, variantes: false, actif: 1,
  },
];

// Anciens noms de recettes : migration automatique de l'historique.
const RENOMMAGES_RECETTES = {
  "Brikka flat white": "Brikka au lait",
  "Brikka cappuccino": "Brikka au lait",
  "Brikka référence": "Brikka classique",
  "Brikka rang bơ": "Brikka classique",
  "Le Fruité": "The Coffee Chronicler's Recipe",
  "Le Costaud": "Le Costaud (Bloom)",
  "L'Adoucisseur": "Le Costaud (Immersion)",
  "Le 4:6 de Tetsu": "The Tetsu Devil",
  "The Sweet Variation": "The Coffee Chronicler's Recipe (Sweet)",
};
const ANCIENS_SEED_IDS = ["brikka-ref", "brikka-rangbo", "fruite", "costaud", "adoucisseur", "complet", "tetsu"];

// Variantes du Tetsu Devil. Les versements se recalculent depuis l'eau totale.
// Pour 225 g : bloom 30, puis 60 (40 pour cent a 90 g), puis 3 x 45.
const TETSU = {
  premier40: [
    { id: "sucre",     nom: "Plus de sucre",  detail: "30 puis 60 g : plus de sucre, moins d'acidité. Mon profil, le réglage par défaut.", parts: [1, 2], defaut: true },
    { id: "equilibre", nom: "Équilibre",      detail: "45 puis 45 g : équilibré.", parts: [1, 1] },
    { id: "vivacite",  nom: "Plus de vivacité", detail: "60 puis 30 g : plus de vivacité.", parts: [2, 1] },
  ],
  dernier60: [
    { id: "leger",  nom: "Corps léger",  detail: "Un seul versement.", n: 1 },
    { id: "moyen",  nom: "Corps moyen",  detail: "Deux versements.", n: 2 },
    { id: "plein",  nom: "Corps plein",  detail: "Trois versements. Mon choix.", n: 3, defaut: true },
  ],
  versements(eauTotale, variante40, variante60) {
    const p40 = eauTotale * 0.4;
    const p60 = eauTotale * 0.6;
    const somme = variante40.parts[0] + variante40.parts[1];
    const pours = [
      Math.round(p40 * variante40.parts[0] / somme),
      Math.round(p40 * variante40.parts[1] / somme),
    ];
    for (let i = 0; i < variante60.n; i++) {
      pours.push(Math.round(p60 / variante60.n));
    }
    const cumul = pours.reduce((a, b) => a + b, 0);
    pours[pours.length - 1] += Math.round(eauTotale) - cumul;
    return pours;
  },
};

// Conversion des étapes vers et depuis le texte éditable :
// une étape par ligne, "m:ss texte" pour une étape minutée, "- texte" sinon.
function etapesVersTexte(etapes) {
  return (etapes || []).map(e => {
    if (e.t === null || e.t === undefined || e.t === "") return "- " + e.texte;
    const mn = Math.floor(e.t / 60), s = e.t % 60;
    return mn + ":" + String(s).padStart(2, "0") + " " + e.texte;
  }).join("\n");
}

function texteVersEtapes(texte) {
  return (texte || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const res = l.match(/^(\d+):([0-5]\d)\s+(.+)$/);
    if (res) return { t: parseInt(res[1], 10) * 60 + parseInt(res[2], 10), texte: res[3] };
    return { t: null, texte: l.replace(/^[-·]\s*/, "") };
  });
}

// Les tasses de départ.
const TASSES_DEPART = [
  { id: "t1", nom: "Loveramics Flat White Egg", contenance_ml: 150 },
  { id: "t2", nom: "Loveramics Espresso Egg", contenance_ml: 80 },
  { id: "t3", nom: "Loveramics Nutty Tasting Cup", contenance_ml: 150 },
  { id: "t4", nom: "Classic Mug", contenance_ml: 330 },
];

// Les 5 cafés de départ, utilisés quand on crée un jeu de données vierge.
const CAFES_DEPART = [
  { id: "c1", nom: "Trung Nguyên Sáng Tạo 4", torrefacteur: "Trung Nguyên", origine: "Buôn Ma Thuột, Vietnam", espece: "Blend Arabica, Robusta, Excelsa, Catimor", procede: "Torréfaction traditionnelle avec additifs", torrefaction: "Foncée", deja_moulu: 1, pourcentage_cafe_reel: 82, tag: "café aromatisé", notes_annoncees: "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.", format_grammes: 340, prix_vnd: 148800, date_torrefaction: "", machine_recommandee: "Brikka", recette_recommandee: "Brikka classique", actif: 1 },
  { id: "c2", nom: "Bana Cofe G4", torrefacteur: "Bana Cofe", origine: "Vietnam", espece: "Robusta", procede: "Rang bơ", torrefaction: "Foncée", deja_moulu: 1, pourcentage_cafe_reel: 100, tag: "", notes_annoncees: "Beurre, caramel, sucre roux, déjà moulu", format_grammes: 250, prix_vnd: 87000, date_torrefaction: "", machine_recommandee: "Brikka", recette_recommandee: "Brikka classique", actif: 1 },
  { id: "c3", nom: "Cà Phê Mít Liberica", torrefacteur: "Fine Coffee Agency", origine: "Vietnam", espece: "Liberica", procede: "Natural", torrefaction: "Medium", deja_moulu: 0, pourcentage_cafe_reel: 100, tag: "", notes_annoncees: "Jacquier mûr, cacao, amande", format_grammes: 200, prix_vnd: 280000, date_torrefaction: "", machine_recommandee: "Les deux", recette_recommandee: "The Coffee Chronicler's Recipe", actif: 1 },
  { id: "c4", nom: "Là Việt Balanced", torrefacteur: "Là Việt", origine: "Đà Lạt, Vietnam", espece: "Arabica", procede: "Lavé", torrefaction: "Medium", deja_moulu: 0, pourcentage_cafe_reel: 100, tag: "café de référence", notes_annoncees: "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté", format_grammes: 250, prix_vnd: 125000, date_torrefaction: "", machine_recommandee: "Les deux", recette_recommandee: "The Coffee Chronicler's Recipe", actif: 1 },
  { id: "c5", nom: "Là Việt Strong", torrefacteur: "Là Việt", origine: "Đà Lạt, Vietnam", espece: "Blend arabica et robusta", procede: "Classique", torrefaction: "Foncée", deja_moulu: 0, pourcentage_cafe_reel: 100, tag: "", notes_annoncees: "Corps fort, amertume marquée. Rejeté, trop amer.", format_grammes: 250, prix_vnd: 125000, date_torrefaction: "", machine_recommandee: "Brikka", recette_recommandee: "Brikka classique", actif: 0 },
];

// Descripteurs organisés selon les familles de la roue des saveurs SCA.
const DESCRIPTEURS_GROUPES = [
  { nom: "Corps et texture", tags: ["rond", "sirupeux", "crémeux", "beurré", "gras", "velouté", "soyeux", "liquoreux", "sec", "léger", "astringent", "rugueux", "aqueux"] },
  { nom: "Cacao et noix", tags: ["chocolat noir", "chocolat au lait", "cacao", "noisette", "amande", "cacahuète"] },
  { nom: "Sucré", tags: ["caramel", "sucre roux", "miel", "vanille", "mélasse", "praliné"] },
  { nom: "Fruité", tags: ["banane", "jacquier", "fruits tropicaux", "fruit de la passion", "fruits mûrs", "fruits rouges", "cerise", "fruits secs", "raisin", "pomme", "agrume", "pêche"] },
  // L'acidité manquait entièrement comme AXE : seul "agrume" existait, et c'est
  // un arôme, pas une structure. Or acide et aigre sont les mêmes acides pour
  // deux verdicts opposés, et c'est la confusion la plus coûteuse en dégustation.
  { nom: "Acidité", tags: ["acidité vive", "acidulé", "aigre", "citronné", "vinaigré"] },
  { nom: "Floral et thé", tags: ["floral", "jasmin", "rose", "thé noir", "thé vert"] },
  { nom: "Épices", tags: ["épices", "cannelle", "clou de girofle", "réglisse", "poivre"] },
  { nom: "Céréales et malt", tags: ["malt", "pain grillé", "biscuit"] },
  { nom: "Fermentation", tags: ["vineux", "fermenté", "rhum"] },
  { nom: "Torréfaction et défauts", tags: ["fumé", "tabac", "brûlé", "cendre", "caoutchouc", "terreux", "boisé", "moisi", "papier", "rance", "phénolique"] },
];
const DESCRIPTEURS = DESCRIPTEURS_GROUPES.flatMap(g => g.tags);

/* Diagnostics groupés par CE QU'IL FAUT CORRIGER, et non en une liste à plat.
   Trois leviers différents : le réglage d'extraction (mouture, temps,
   température), le ratio (dose contre eau), et le café lui même, sur lequel
   aucun réglage n'agit.

   Chaque axe va du léger au franc, avec un "un peu" partout : une tasse
   légèrement trop concentrée n'appelle pas la même correction qu'une tasse
   franchement trop forte, et sans nuance on finit par cocher le cran du dessus
   par défaut, ce qui fausse le diagnostic.

   AUCUNE valeur existante n'a été retirée ni renommée : l'historique déjà
   enregistré reste lisible tel quel. Ajouter ne casse rien, retirer casserait. */
const DIAGNOSTICS_GROUPES = [
  { nom: "Rien à changer", diags: ["Équilibré"] },
  {
    nom: "Réglage d'extraction",
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
    nom: "Ratio café et eau",
    diags: [
      "Un peu léger",
      "Trop léger (aqueux)",
      "Un peu concentré",
      "Trop fort (concentré)",
    ],
  },
  {
    nom: "Le café lui même",
    diags: [
      "Un peu éventé",
      "Creux, plat (café éventé)",
      "Un peu brûlé",
      "Brûlé (défaut du sachet)",
    ],
  },
];

// Liste à plat, dans l'ordre des groupes. Reste la référence pour l'ordre de
// stockage, le filtre de l'historique et l'anneau du tableau de bord.
/* DÉDUIT, jamais coché. Acide et amer dans la même gorgée n'est pas un symptôme
   de plus à cocher, c'est la CAUSE : l'eau a percé un canal et sur extrait une
   zone en contournant le reste. Chris l'a signalé deux fois comme un doublon des
   deux pilules du dessus, et il avait raison du point de vue de l'interface : le
   site lui demandait de conclure à sa place. Il conclut maintenant tout seul dès
   que les deux familles sont cochées, voir majCorrectionDiagnostic dans app.js.

   Le libellé reste dans DIAGNOSTICS, sans pilule : il existe dans l'historique
   de Chris (extraction du 11 août) et doit rester traduisible, filtrable et
   affichable. Le retirer casserait ses données passées. */
const DIAGNOSTIC_DERIVE = "Acide ET amer (extraction inégale)";

const DIAGNOSTICS = DIAGNOSTICS_GROUPES.flatMap(g => g.diags).concat([DIAGNOSTIC_DERIVE]);

/* Quand cocher chaque diagnostic. La correction seule ne suffisait pas : elle
   dit quoi faire, pas dans quel cas on est. Sans ce repere on coche au jugé, et
   une correction juste appliquee au mauvais diagnostic empire la tasse suivante.

   Descriptions en BOUCHE, pas en jargon : ce sont des sensations a reconnaitre.
   Aucun guillemet double, ces textes partent dans un attribut HTML. */
/* Familles dont une variante EST le préchauffage. Pour celles là, la case à
   cocher "eau préchauffée" ferait doublon avec le choix de recette : la case est
   masquée et la valeur stockée se déduit de la recette choisie, ce qui garde la
   colonne `eau_prechauffee` juste sur toute l'histoire. */
const FAMILLES_PRECHAUFFAGE = ["brikka-classique"];
const RECETTES_EAU_PRECHAUFFEE = ["brikka-classique-bouillante"];

const DIAGNOSTIC_QUAND = {
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
  "Un peu acide": "Presque bon : un ou deux crans plus fin, ou 2 à 3 degrés plus chaud.",
  "Sous-extrait (acide)": "Moudre plus fin, plus chaud, plus longtemps.",
  "Un peu amer": "Presque bon : un ou deux crans plus grossier, ou 2 à 3 degrés moins chaud.",
  "Sur-extrait (amer)": "Moudre plus grossier, moins chaud, moins longtemps.",
  "Un peu astringent": "Presque bon : un ou deux crans plus grossier, et remuer moins.",
  "Astringent": "Sur-extraction : plus grossier, et remuer moins.",
  "Acide ET amer (extraction inégale)": "Répartition : égaliser le lit sans jamais tasser. En Brikka, ne pas trop remplir le panier. Au Switch, remuer et verser en spirale.",
  "Un peu léger": "Presque bon : un peu moins d'eau, ou un gramme de café en plus.",
  "Trop léger (aqueux)": "Resserrer le ratio (moins d'eau ou plus de café).",
  "Un peu concentré": "Presque bon : un peu plus d'eau, ou un gramme de café en moins.",
  "Trop fort (concentré)": "Élargir le ratio (plus d'eau ou moins de café).",
  "Un peu éventé": "Le sachet commence à fatiguer : bien le refermer, et le finir plus vite.",
  "Creux, plat (café éventé)": "Fraîcheur : vérifier la date de torréfaction, resserrer le sachet.",
  "Un peu brûlé": "Note de torréfaction un peu poussée : baisser la flamme, et retirer du feu plus tôt.",
  "Brûlé (défaut du sachet)": "Torréfaction trop foncée, aucun réglage ne l'enlèvera.",
};

// Estimation de caféine : pourcentage massique selon l'espèce, et environ
// 90 pour cent de la caféine passe dans la tasse. Pour un café non pur,
// seule la part de vrai café compte.
function cafeinePct(espece) {
  const e = (espece || "").toLowerCase();
  const arabica = e.includes("arabica");
  const robusta = e.includes("robusta");
  if (arabica && robusta) return 1.8;
  if (robusta) return 2.4;
  if (arabica) return 1.2;
  if (e.includes("liberica") || e.includes("excelsa")) return 1.4;
  return 1.8;
}

function cafeineMg(dose, espece, pctCafeReel) {
  if (!dose) return 0;
  const pur = pctCafeReel === undefined || pctCafeReel === "" ? 100 : Number(pctCafeReel);
  return Math.round(dose * (pur / 100) * cafeinePct(espece) * 10 * 0.9);
}

// Cafés qui ne vont jamais dans le Switch, par nom exact ou partiel.
const JAMAIS_SWITCH_NOMS = [
  "Fine Robusta Honey",
  "Midnight Chocolate",
  "Proud of Việt Nam",
  "Robusta Honey",
  "Signature Blend",
];

/* MISE À L'ÉCHELLE DES VERSEMENTS.

   Une recette écrit ses paliers en grammes ABSOLUS ("Compléter à 225 g"). Changer
   l'eau dans la saisie rendait donc la recette fausse : elle réclamait toujours
   225 g alors que Chris en avait versé 240, et le chronomètre annonçait les mêmes
   chiffres périmés.

   On ne touche QU'AUX nombres suivis de " g" et strictement supérieurs à
   SEUIL_VERSEMENT_G. En dessous ce sont des doses de café ou des quantités de
   lait, jamais un versement d'eau : le plus petit versement des recettes
   d'origine est un bloom de 45 g, la plus grosse dose est de 18 g. Sans ce
   garde-fou, une recette qui mentionnerait "14 g de café" dans son texte verrait
   sa dose multipliée, ce qui serait pire que de ne rien adapter.

   Fonction PURE et sans DOM, comme reglages.js, pour être testée sans navigateur.
   Voir tools/data.test.mjs. */
const SEUIL_VERSEMENT_G = 30;

function echelleVersements(texte, facteur) {
  if (!(facteur > 0) || facteur === 1) return String(texte);
  return String(texte).replace(/(\d+(?:[.,]\d+)?)(\s*g\b)/g, (tout, nombre, suffixe) => {
    const v = Number(String(nombre).replace(",", "."));
    if (!(v > SEUIL_VERSEMENT_G)) return tout;
    return Math.round(v * facteur) + suffixe;
  });
}

/* Règles de cohérence café plus méthode plus recette.
   Retourne { msgs } : uniquement de l'INFORMATION, jamais un refus.

   Il y avait ici un blocage qui refusait d'ENREGISTRER un café rang bơ ou non
   pur en Switch. Retiré : le carnet sert à noter ce que Chris a bu, pas à
   arbitrer ce qu'il a le droit de tenter. Une combinaison jamais essayée n'est
   pas une combinaison mauvaise, et refuser la saisie empêchait précisément de
   produire la donnée qui trancherait. Ne pas le réintroduire. */
function avertissementsCombinaison(cafe, methode, recetteNom, recettes) {
  const msgs = [];
  if (!cafe) return { msgs };
  const liste = recettes || [];

  if (methode === "Switch") {
    const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined ? 100 : Number(cafe.pourcentage_cafe_reel);
    const procede = (cafe.procede || "").toLowerCase();
    if (pct < 100 || (cafe.tag || "").toLowerCase().includes("aromatisé")) {
      msgs.push(I18N.t("w_aromatise", { pct }));
    } else if (procede.includes("rang bơ") || procede.includes("rang bo") || procede.includes("tẩm bơ") ||
               JAMAIS_SWITCH_NOMS.some(n => (cafe.nom || "").toLowerCase().includes(n.toLowerCase()))) {
      msgs.push(I18N.t("w_rangbo"));
    } else if (procede.includes("wet hulled") || procede.includes("giling basah")) {
      msgs.push(I18N.t("w_wethulled"));
    } else if ((cafe.torrefaction || "").toLowerCase().includes("fonc")) {
      msgs.push(I18N.t("w_foncee"));
    } else if ((cafe.machine_recommandee || "") === "Brikka") {
      msgs.push(I18N.t("w_brikka_reco"));
    }
  }

  if (methode === "Brikka" && (cafe.machine_recommandee || "") === "Switch") {
    msgs.push(I18N.t("w_switch_reco"));
  }

  // PAS d'avertissement quand la recette choisie diffère de `recette_recommandee`.
  // Cette recommandation vient d'une valeur posée à la création du café, jamais
  // vérifiée par une extraction : prétendre conseiller une recette sur un café
  // qu'on n'a pas encore essayé n'est pas une aide, c'est du bruit. Les vraies
  // recommandations viennent des insights du tableau de bord, qui eux sont
  // calculés sur les notes réelles.

  return { msgs };
}
