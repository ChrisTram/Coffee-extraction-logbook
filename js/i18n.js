// Internationalisation : français par défaut, anglais en bascule.
// Trois mécanismes :
// 1. UI : correspondance de textes pour tout le contenu statique de la page.
//    Chaque fragment de texte français est la clé, l'anglais la valeur.
// 2. T : gabarits pour les chaînes construites en JavaScript, avec variables.
// 3. Cartes d'affichage pour les valeurs de données (diagnostics, descripteurs) :
//    la valeur stockée reste française, seul l'affichage change.
"use strict";

const I18N = (() => {

  let lang = "fr";
  try { const l = localStorage.getItem("langue"); if (l === "en") lang = "en"; } catch (e) { /* indisponible */ }

  // ---------- 1. Contenu statique : français vers anglais ----------

  const UI = {
    "Carnet d'extraction": "Brew journal",
    "Ce que tes données disent": "What your data says",
    "Synchroniser maintenant": "Sync now",
    "Brikka, Switch et Timemore C5 ESP": "Brikka, Switch and Timemore C5 ESP",
    "Tableau de bord": "Dashboard",
    "Saisie": "New brew",
    "Historique": "History",
    "Référence": "Reference",
    "Données": "Data",
    "Démo": "Demo",
    "Cafés": "Coffees",
    "Recettes": "Recipes",

    "Aucune extraction pour le moment": "No brews yet",
    "Enregistre ta première tasse depuis l'écran Saisie, ou charge le jeu de démonstration pour voir le tableau de bord en action.": "Log your first cup from the New brew screen, or load the demo dataset to see the dashboard in action.",
    "Saisir une extraction": "Log a brew",
    "Charger la démonstration": "Load the demo",
    "Extractions et note moyenne, 30 derniers jours": "Brews and average score, last 30 days",
    "Calendrier d'activité": "Activity calendar",
    "Moins": "Less",
    "Plus": "More",
    // Légende du calendrier : depuis que l'échelle de couleur est ABSOLUE, elle
    // annonce des nombres réels au lieu d'un vague "moins vers plus".
    "Aucune": "None",
    "4 et plus": "4 or more",
    "Note moyenne par café": "Average score by coffee",
    "Brikka contre Switch": "Brikka versus Switch",
    "Notes moyennes sur les cafés passés dans les deux machines.": "Average scores for coffees brewed on both machines.",
    "Note contre mouture": "Score versus grind",
    "Le nuage qui montre ton réglage optimal, en microns.": "The scatter that reveals your optimal setting, in microns.",
    "Note contre âge du café": "Score versus coffee age",
    "Jours depuis la torréfaction : ta fenêtre de fraîcheur.": "Days since roast: your freshness window.",
    "Diagnostics": "Diagnoses",
    "Note moyenne par recette": "Average score by recipe",
    "Les 5 dernières extractions": "Last 5 brews",

    "Nouvelle extraction": "New brew",
    "Date et heure": "Date and time",
    "Café": "Coffee",
    "Gérer les cafés": "Manage coffees",
    "Méthode": "Method",
    "Recette": "Recipe",
    "Dose (g)": "Dose (g)",
    "Eau (g)": "Water (g)",
    "Température (°C), optionnel": "Temperature (°C), optional",
    "Sans thermomètre : eau bouillie qui a fini de buller, environ 95.": "No thermometer: water just off the boil, once the bubbling stops, is around 95.",
    "Mouture (molette)": "Grind (dial)",
    "Volume en tasse (ml)": "Volume in cup (ml)",
    "Ratio :": "Ratio:",
    "Mouture :": "Grind:",
    "Coût :": "Cost:",
    "Temps total": "Total time",
    "Écoulement": "Drawdown",
    "Démarrer le chrono": "Start the timer",
    "Début de l'écoulement": "Mark drawdown start",
    "Remettre à zéro": "Reset",
    "Temps total (s)": "Total time (s)",
    "Écoulement (s)": "Drawdown (s)",
    "Note :": "Score:",
    "Diagnostic": "Diagnosis",
    "Descripteurs": "Tasting notes",
    "Commentaire": "Comment",
    "Enregistrer l'extraction": "Save the brew",
    "Annuler la modification": "Cancel editing",

    "Tous": "All",
    "Toutes": "All",
    "Note minimum": "Minimum score",
    "Du": "From",
    "Au": "To",
    "Réinitialiser": "Reset",
    "Exporter le filtre en CSV": "Export current filter to CSV",
    "Aucune extraction ne correspond à ces filtres.": "No brews match these filters.",

    "Moulin": "Grinder",
    "Diagnostic du goût": "Taste diagnosis",
    "Règles": "Rules",
    "Vocabulaire": "Vocabulary",
    "Gérer les recettes": "Manage recipes",
    "Deux recettes Brikka, cinq recettes Switch : trois pour le quotidien, deux avancées qui imposent de recompter la mouture. Le principe qui les gouverne toutes : le Switch ne doit pas refaire ce que la Brikka fait mieux. Chaque recette est éditable, et les recettes d'origine restent restaurables à tout moment.": "Two Brikka recipes, five Switch recipes: three for everyday use, two advanced ones that require re-counting the grind. The principle that governs them all: the Switch must not redo what the Brikka does better. Every recipe is editable, and the original recipes can be restored at any time.",

    "Le moulin : réglage et conversions": "The grinder: setting and conversions",
    "Le C5 ESP se lit en trois parties :": "The C5 ESP dial reads in three parts:",
    ". Exemple :": ". Example:",
    "rotation.numéro.cran": "rotation.number.click",
    "se lit \"1 rotation depuis le zéro, 3e numéro, 2e cran\".": "reads \"1 rotation from zero, 3rd number, 2nd click\".",
    "5 crans par numéro, 10 numéros par rotation, donc 50 crans par rotation": "5 clicks per number, 10 numbers per rotation, so 50 clicks per rotation",
    "8,32 microns par cran, environ 416 microns par rotation": "8.32 microns per click, about 416 microns per rotation",
    "butée à 3 rotations, soit 150 crans, soit 1248 microns": "hard stop at 3 rotations, that is 150 clicks, 1248 microns",
    "puis": "then",
    "Convertisseur : tape un réglage de molette": "Converter: type a dial setting",
    "Le diagramme officiel du C5 ESP : rotations en haut, microns en bas, une boîte par méthode, tes quatre réglages marqués en couleur, la zone hachurée est hors de portée du moulin. Survole ou touche une boîte pour le détail. Le réglage saisi dans le convertisseur met en évidence les méthodes compatibles.": "The official C5 ESP diagram: rotations on top, microns at the bottom, one box per method, your four settings marked in color, the hatched zone is beyond the grinder's reach. Hover or tap a box for details. The setting typed in the converter highlights compatible methods.",
    "Plages par méthode, en crans depuis le point de contact des meules": "Ranges by method, in clicks from burr contact point",
    "Crans": "Clicks",
    "Molette": "Dial",
    "Usage": "Use",
    "Réglages de référence": "Reference settings",
    "environ 500": "about 500",
    "environ 582": "about 582",
    "environ 624": "about 624",
    "environ 666": "about 666",
    "environ 832": "about 832",
    "Brikka": "Brikka",
    "Réglage commun aux deux machines": "Shared setting for both machines",
    "Switch recettes 1 et 2": "Switch recipes 1 and 2",
    "Switch recettes 5 et 6": "Switch recipes 5 and 6",
    "Bandes de granulométrie :": "Grind size bands:",
    "extra fine moins de 200, fine 200 à 400, medium fine 400 à 600, medium 600 à 800, medium coarse 800 à 1000, coarse 1000 à 1200, extra coarse plus de 1200.": "extra fine under 200, fine 200 to 400, medium fine 400 to 600, medium 600 to 800, medium coarse 800 to 1000, coarse 1000 to 1200, extra coarse above 1200.",
    "Pas de correction utile :": "The useful correction step:",
    "un numéro entier": "one full number",
    ", soit 5 crans, soit environ 41 microns. Un seul cran ne se sent pas en tasse.": ", that is 5 clicks, about 41 microns. A single click cannot be tasted in the cup.",

    "Acidité": "Sourness",
    "Arrive tout de suite, sur les côtés et l'avant de la langue, fait saliver, pincement sous les oreilles, disparaît vite.": "Hits right away, on the sides and front of the tongue, makes you salivate, pinches under the ears, fades quickly.",
    "Signifie sous-extraction. Moudre plus fin, plus chaud, plus longtemps.": "Means under-extraction. Grind finer, go hotter, brew longer.",
    "Amertume": "Bitterness",
    "Arrive après avoir avalé, au fond de la langue et dans la gorge, assèche, la langue devient râpeuse, elle reste.": "Arrives after you swallow, at the back of the tongue and in the throat, dries you out, the tongue turns raspy, and it lingers.",
    "Signifie sur-extraction. Moudre plus grossier, moins chaud, moins longtemps.": "Means over-extraction. Grind coarser, go cooler, brew shorter.",
    "Astringence": "Astringency",
    "Sensation tactile et non gustative, bouche qui se resserre, comme un kaki pas mûr.": "A tactile sensation, not a taste: the mouth tightens, like an unripe persimmon.",
    "Signal de sur-extraction le plus fiable de tous.": "The most reliable over-extraction signal of all.",
    "Acide ET amer dans la même gorgée": "Sour AND bitter in the same sip",
    "Extraction inégale. Ce n'est ni la mouture ni le temps, c'est la distribution.": "Uneven extraction. It is neither the grind nor the time, it is the distribution.",
    "Aplanir le lit, remuer, verser en spirale.": "Level the bed, stir, pour in a spiral.",
    "Goût de brûlé, cendre, fumée": "Burnt taste, ash, smoke",
    "Ce n'est pas la méthode, c'est le sachet. Torréfaction trop foncée.": "It is not the method, it is the bag. Roast too dark.",
    "Aucun réglage ne l'enlèvera.": "No setting will remove it.",
    "Calibration maison": "Home calibration",
    "Trois verres d'eau : un avec du jus de citron (acidité pure), un avec un sachet de thé noir infusé 10 minutes (amertume et astringence), un avec une pincée de sel (la sensation creuse de la sous-extraction).": "Three glasses of water: one with lemon juice (pure sourness), one with a black tea bag steeped 10 minutes (bitterness and astringency), one with a pinch of salt (the hollow feel of under-extraction).",

    "Règles d'exécution": "Execution rules",
    "Valables partout": "Valid everywhere",
    "Pour une ouverture partielle, regarder le": "For a partial opening, watch the",
    "niveau d'eau": "water level",
    "et non le chronomètre. Le débit dépend de la mouture, de la dose et du café. Un chrono n'est pas reproductible, un niveau l'est.": "and not the timer. Flow rate depends on grind, dose and coffee. A stopwatch is not reproducible, a water level is.",
    "Remuer pendant la première infusion seulement, jamais pendant la seconde. Sur un lit déjà tassé, remuer déplace les fines vers le bas et bouche l'écoulement.": "Stir during the first infusion only, never during the second. On an already settled bed, stirring pushes fines down and clogs the drawdown.",
    "Ce qui ne va jamais dans le Switch": "What never goes in the Switch",
    "Bana Cofe G4 (rang bơ, le papier retiendrait le beurre qui fait tout l'intérêt), Fine Robusta Honey (Every Half), Midnight Chocolate (Every Half), Proud of Việt Nam (Every Half), Robusta Honey (The Married Beans), Signature Blend (Ritachi), et tout café en wet hulled ou en torréfaction foncée. Le site t'avertit si tu tentes la combinaison.": "Bana Cofe G4 (rang bơ, the paper would hold back the butter that makes it worthwhile), Fine Robusta Honey (Every Half), Midnight Chocolate (Every Half), Proud of Việt Nam (Every Half), Robusta Honey (The Married Beans), Signature Blend (Ritachi), plus any wet hulled or dark roasted coffee. The site warns you if you try the combination.",
    "La question de la double infusion, tranchée": "The double infusion question, settled",
    "Fractionner l'infusion augmente l'extraction et l'intensité,": "Splitting the infusion increases extraction and intensity,",
    "pas le corps": "not body",
    ". Le corps vient des huiles et des fines, et le papier les retient quel que soit le nombre de cycles. Ce que les recettes 4 et 5 apportent, c'est de la clarté avec de la puissance. Dans le Switch, les trois vrais leviers de corps sont, dans l'ordre : resserrer le ratio vers 1:14, moudre plus fin, remuer davantage.": ". Body comes from oils and fines, and the paper holds them back no matter how many cycles you run. What recipes 4 and 5 bring is clarity with power. In the Switch, the three real body levers are, in order: tighten the ratio toward 1:14, grind finer, stir more.",

    "Vocabulaire et culture": "Vocabulary and culture",
    "Les trois espèces": "The three species",
    ": environ 1,2 pour cent de caféine, sucres et acides organiques élevés, plante fragile qui exige de l'altitude, 60 à 70 pour cent de la production mondiale.": ": about 1.2 percent caffeine, high sugars and organic acids, a fragile plant that demands altitude, 60 to 70 percent of world production.",
    ": environ 2,4 pour cent de caféine, deux fois plus, plus de corps, moins de sucre, résistant, pousse en plaine. Le Vietnam en est le premier producteur mondial.": ": about 2.4 percent caffeine, twice as much, more body, less sugar, hardy, grows in the lowlands. Vietnam is the world's top producer.",
    "Liberica et Excelsa": "Liberica and Excelsa",
    ": moins de 2 pour cent de la production mondiale, gros grain asymétrique, arôme porté par l'espèce elle même, jacquier, fruit mûr, bois.": ": under 2 percent of world production, large asymmetric bean, aroma carried by the species itself, jackfruit, ripe fruit, wood.",
    ": du robusta trié, récolté mûr, traité avec le soin d'un arabica de spécialité. Seuil de qualité à 80 points CQI.": ": sorted robusta, picked ripe, processed with specialty arabica care. Quality threshold at 80 CQI points.",
    "Les procédés, du plus propre au plus fermenté": "Processes, from cleanest to most fermented",
    "Lavé": "Washed",
    ": toute la pulpe retirée avant séchage. Grain nu, acidité nette, tasse propre, terroir visible. Territoire du filtre.": ": all pulp removed before drying. Bare bean, clean acidity, clean cup, visible terroir. Filter territory.",
    ": peau retirée mais mucilage laissé sur le grain pendant le séchage. Sucrosité et corps, acidité amortie. Excellent compromis.": ": skin removed but mucilage left on the bean while drying. Sweetness and body, softened acidity. An excellent compromise.",
    ": cerise entière séchée au soleil, 15 à 30 jours. Fruit mûr, corps, sucre.": ": whole cherry sun-dried, 15 to 30 days. Ripe fruit, body, sugar.",
    ": fermentation en cuve scellée sans oxygène, 24 à 120 heures, puis séchage natural. Produit des esters, donc banane et fruits exotiques.": ": fermentation in a sealed oxygen-free tank, 24 to 120 hours, then natural drying. Produces esters, hence banana and exotic fruits.",
    ": cuve saturée en CO2, technique empruntée au beaujolais.": ": CO2-saturated tank, a technique borrowed from Beaujolais wine.",
    ": fermentation dans le jus de sa propre pulpe. Sucré et délicat.": ": fermentation in the juice of its own pulp. Sweet and delicate.",
    ": parche retirée humide, séchage écourté, spécialité de Sumatra. Corps très épais, terreux, acidité écrasée.": ": parchment removed while wet, shortened drying, a Sumatra specialty. Very thick body, earthy, crushed acidity.",
    ": beurre, souvent avec sucre et sel, incorporés à la torréfaction. Tradition vietnamienne. Jamais en filtre papier, jamais au moulin.": ": butter, often with sugar and salt, added during roasting. A Vietnamese tradition. Never in paper filter, never through the grinder.",
    ": torréfaction nue, rien d'ajouté. C'est un gage de pureté, pas un niveau de torréfaction.": ": bare roast, nothing added. A purity guarantee, not a roast level.",
    "La torréfaction": "Roasting",
    "Séchage, puis réaction de Maillard entre 140 et 165 degrés (noisette, pain, cacao), puis caramélisation à partir de 170 degrés (sucre brun, caramel), premier crack vers 196 degrés, deuxième crack vers 224 degrés.": "Drying, then Maillard reaction between 140 and 165 degrees (hazelnut, bread, cocoa), then caramelization from 170 degrees (brown sugar, caramel), first crack around 196 degrees, second crack around 224 degrees.",
    "Le temps passé après le premier crack s'appelle le development time : plus il est long, plus le café est rond et sucré, moins il garde de fruit.": "The time spent after first crack is called development time: the longer it is, the rounder and sweeter the coffee, and the less fruit it keeps.",
    "Un café foncé n'est pas un café fort, il contient même un peu moins de caféine, il est juste plus amer.": "A dark coffee is not a strong coffee, it even contains slightly less caffeine, it is just more bitter.",
    "L'extraction": "Extraction",
    "Rendement d'extraction": "Extraction yield",
    ": pourcentage de la masse de café sec dissous dans la tasse. Cible SCA 18 à 22 pour cent. En dessous c'est sous-extrait, au dessus sur-extrait.": ": percentage of the dry coffee mass dissolved into the cup. SCA target 18 to 22 percent. Below is under-extracted, above is over-extracted.",
    "Concentration ou TDS": "Concentration, or TDS",
    ": pourcentage de matière dissoute dans le liquide. Cible filtre 1,15 à 1,35 pour cent. Se règle avec le ratio, pas avec la mouture.": ": percentage of dissolved matter in the liquid. Filter target 1.15 to 1.35 percent. Adjusted with the ratio, not the grind.",
    "Une Brikka sort volontairement au dessus de cette fenêtre, elle travaille à 1:7.": "A Brikka deliberately lands above this window, it works at 1:7.",
    "L'eau": "Water",
    "Standard SCA": "SCA standard",
    ": matières dissoutes totales 150 mg/L (fourchette 75 à 250), dureté calcique 68 mg/L (50 à 175), alcalinité totale 40 mg/L (40 à 70), pH 7 (6,5 à 7,5), sodium 10 mg/L, chlore zéro absolu.": ": total dissolved solids 150 mg/L (range 75 to 250), calcium hardness 68 mg/L (50 to 175), total alkalinity 40 mg/L (40 to 70), pH 7 (6.5 to 7.5), sodium 10 mg/L, chlorine absolute zero.",
    "Au Vietnam": "In Vietnam",
    ": jamais d'eau du robinet, elle est chlorée. Jamais d'eau osmosée pure en bonbonne, elle est trop pauvre en minéraux et donne une tasse creuse et acide. Eau minérale en bouteille autour de 100 à 200 mg/L de résidu sec.": ": never tap water, it is chlorinated. Never pure RO water from dispensers, it is too mineral-poor and gives a hollow, sour cup. Bottled mineral water around 100 to 200 mg/L dry residue.",
    "La fraîcheur": "Freshness",
    "Attendre 3 à 7 jours après torréfaction. Fenêtre utile de 1 à 6 semaines après la date de torréfaction, pas après l'achat. Chercher la mention \"ngày rang\" sur le sachet.": "Wait 3 to 7 days after roasting. Useful window of 1 to 6 weeks after the roast date, not the purchase date. Look for \"ngày rang\" on the bag.",
    "Conserver en grains, à l'abri de l'air, de la lumière et de la chaleur, jamais au réfrigérateur. Le café moulu perd l'essentiel de son arôme en 15 à 30 minutes.": "Store as whole beans, away from air, light and heat, never in the fridge. Ground coffee loses most of its aroma within 15 to 30 minutes.",
    "Mots vietnamiens utiles": "Useful Vietnamese words",
    "grains entiers, ce que je veux par défaut": "whole beans, what I want by default",
    "moulu": "ground",
    "méthodes manuelles, la mention qui signifie Switch": "manual brewing, the wording that means Switch",
    "pour le filtre vietnamien, mouture medium coarse": "for the Vietnamese phin filter, medium coarse grind",
    "pour machine, mouture fine": "for machine, fine grind",
    "fermentation anaerobic, légitime et recherchée": "anaerobic fermentation, legitimate and sought after",
    "aromatisé artificiellement, à fuir": "artificially flavored, avoid",
    "torréfaction nue, sans additif": "bare roast, no additives",
    "date de torréfaction": "roast date",
    "acidité vive et propre": "bright, clean acidity",
    "amer": "bitter",

    "Boutiques": "Shops",
    "Quoi acheter": "What to buy",
    "Règles d'achat": "Buying rules",
    "Matériel et entretien": "Gear and care",
    "Messages prêts à copier": "Ready-to-copy messages",
    "Les boutiques, et quoi y prendre": "The shops, and what to get there",
    "Tiré de mon guide Brikka et Switch. Sept de ces boutiques vendent principalement sur leur propre site plutôt que sur Shopee, et c'est presque toujours moins cher en direct.": "Taken from my Brikka and Switch guide. Seven of these shops sell mainly on their own site rather than on Shopee, and buying direct is almost always cheaper.",
    "Đà Lạt · gamme lisible : Balanced, Rich, Strong": "Đà Lạt · readable range: Balanced, Rich, Strong",
    "Le meilleur rapport qualité prix de toute la liste, deux à deux fois et demie moins cher que le reste, chez le torréfacteur dont j'aime déjà le Balanced. Premier choix : Serie 2 Datanla, honey light medium, nougat et chocolat noir, 165 000 ₫ les 250 g, recette imprimée sur la fiche.": "The best value on the whole list, two to two and a half times cheaper than the rest, from the roaster whose Balanced I already love. First pick: Serie 2 Datanla, honey light medium, nougat and dark chocolate, 165,000 VND per 250 g, recipe printed on the product page.",
    "Buôn Ma Thuột · deux soeurs Q-Grader CQI et SCA": "Buôn Ma Thuột · two sisters, CQI and SCA Q-Graders",
    "Spécialiste du fine robusta à double fermentation. La gamme Ngọt Brewing est explicitement calibrée pour le filtre. Leur Anaerobic Fine Robusta medium (cannelle, raisin sec, zeste d'orange) est une perle rare qui va vers le sucré, pas vers l'acide.": "Fine robusta double-fermentation specialist. The Ngọt Brewing range is explicitly calibrated for filter. Their medium Anaerobic Fine Robusta (cinnamon, raisin, orange zest) is a rare gem that leans sweet, not sour.",
    "Đà Lạt · travail direct avec les fermes de Cầu Đất": "Đà Lạt · direct work with Cầu Đất farms",
    "Prix affichés en clair, de 150 000 à 275 000 ₫ les 250 g, grains avec mouture à la demande. Leur Cầu Đất lavé à 200 000 ₫ est mon étalon : c'est lui qui dit ce que la fermentation ajoute aux autres. Le Robusta Honey à 150 000 ₫ est le meilleur corps sur prix du guide.": "Prices listed in the open, 150,000 to 275,000 VND per 250 g, whole beans with grind on demand. Their washed Cầu Đất at 200,000 VND is my benchmark: it is what tells me what fermentation adds to the others. The Robusta Honey at 150,000 VND is the guide's best body per money.",
    "Hô Chi Minh · sourcing à Xuân Thọ, 1350 m": "Ho Chi Minh City · sourcing in Xuân Thọ, 1350 m",
    "Le seul du relevé à publier ses recettes complètes : méthode, température, TDS de l'eau, temps. Leur Proud (50 % lavé, 50 % natural) a gagné le championnat national barista 2022 : acidité douce, corps soyeux, finale chocolat, la seule fiche du guide qui annonce les trois ensemble.": "The only one in the survey to publish full recipes: method, temperature, water TDS, time. Their Proud (50 percent washed, 50 percent natural) won the 2022 national barista championship: gentle acidity, silky body, chocolate finish, the only product page in the guide claiming all three at once.",
    "Hô Chi Minh · gamme entièrement en 200 g": "Ho Chi Minh City · whole range in 200 g",
    "Attention : leurs prix Shopee sont 36 à 70 pour cent au dessus de leur propre site everyhalf.vn, même en promo. Une promo Shopee n'est intéressante que si elle passe sous leur prix site. Le Fine Robusta Cư M'Gar (goyave rose, chocolat au lait) est leur meilleur café pour moi.": "Careful: their Shopee prices run 36 to 70 percent above their own site everyhalf.vn, even during sales. A Shopee deal is only worth it if it drops below their site price. The Fine Robusta Cư M'Gar (pink guava, milk chocolate) is their best coffee for me.",
    "Bảo Lộc · exportateur, vitrine secondaire": "Bảo Lộc · exporter, secondary storefront",
    "Port gratuit à partir de 500 000 ₫, aucune option de mouture affichée : écrire avant toute commande pour sécuriser le nguyên hạt. Anaerobic plus Cầu Đất fait 370 000 ₫ : ajouter le Signature Blend met à 520 000 ₫ et rend le port gratuit.": "Free shipping from 500,000 VND, no grind option shown: write before any order to secure whole beans (nguyên hạt). Anaerobic plus Cầu Đất comes to 370,000 VND: adding the Signature Blend brings it to 520,000 VND and makes shipping free.",
    "Gia Lai · créneau traditionnel, gamme G1 à G12": "Gia Lai · traditional segment, G1 to G12 range",
    "Un seul rang bơ dans la gamme, le G4 que je bois déjà. Tous les autres sont en rang mộc et disponibles en grains.": "Only one butter-roasted (rang bơ) coffee in the range, the G4 I already drink. All the others are bare roast (rang mộc) and available as whole beans.",
    "Huế · micro-lots importés en 100 g": "Huế · imported micro-lots in 100 g",
    "Cà phê Đồng Xanh. Petits formats parfaits pour tester sans risque, dont le Guji Uraga lavé d'Éthiopie, l'archétype de ce que la Brikka détruit et que le Switch révèle. Prix Shopee 25 à 45 pour cent au dessus de leur site.": "Cà phê Đồng Xanh. Small formats perfect for low-risk testing, including the washed Guji Uraga from Ethiopia, the archetype of what the Brikka destroys and the Switch reveals. Shopee prices 25 to 45 percent above their site.",
    "Hô Chi Minh · importateur torréfacteur, 508 produits": "Ho Chi Minh City · importer and roaster, 508 products",
    "Littéralement supermarché du café. Huit ans, 4,9 sur 6 100 avis. Seul vendeur du relevé à proposer une mouture nommée moka pot, et pièces génériques Brikka à port mutualisé avec le café.": "Literally a coffee supermarket. Eight years, 4.9 across 6,100 reviews. The only seller in the survey offering a grind named moka pot, plus generic Brikka parts shipping together with the coffee.",
    "Torréfaction à la commande, profil piloté sous Artisan": "Roast to order, profile driven with Artisan",
    "Le plus rigoureux techniquement du relevé : tri des défauts avant et après torréfaction, 100 pour cent de taux de réponse, 21 produits seulement. Leur Fine Robusta Whisky est mon entrée fermentation côté Brikka.": "The most technically rigorous in the survey: defect sorting before and after roasting, 100 percent response rate, only 21 products. Their Fine Robusta Whisky is my fermentation entry point on the Brikka side.",
    "Quảng Trị · le meilleur pedigree du relevé": "Quảng Trị · the best pedigree in the survey",
    "Seul torréfacteur du relevé à afficher un score CQI vérifié, 85,21, pour son Mít Liberica Khe Sanh : jacquier, fumé, acidité fraise vive. Jamais en Brikka, l'acidité fraise deviendrait pointue.": "The only roaster in the survey with a verified CQI score, 85.21, for its Mít Liberica Khe Sanh: jackfruit, smoke, bright strawberry acidity. Never in the Brikka, the strawberry acidity would turn sharp.",
    "Đà Nẵng · le sommet vietnamien, pour situer l'échelle": "Đà Nẵng · the Vietnamese summit, to place the scale",
    "Geisha et pink bourbon importés, 1 000 000 à 1 500 000 ₫ le sachet, environ 4 000 ₫ le gramme. Hors budget et registre floral qui n'est pas le mien. Cité pour savoir où s'arrête l'échelle.": "Imported geisha and pink bourbon, 1,000,000 to 1,500,000 VND per bag, about 4,000 VND per gram. Over budget, and a floral register that is not mine. Listed so you know where the scale ends.",

    "Si je ne devais retenir que trois lignes": "If I had to keep only three lines",
    ": honey, light medium, nougat et chocolat noir, chez le torréfacteur que j'aime déjà, recette imprimée sur la fiche. Le meilleur rapport plaisir sur risque sur prix.": ": honey, light medium, nougat and dark chocolate, from the roaster I already love, recipe printed on the product page. The best pleasure to risk to price ratio.",
    ": anaerobic en medium, cannelle et raisin sec. La combinaison la plus rare du Vietnam, et elle va vers le sucré.": ": a medium anaerobic, cinnamon and raisin. The rarest combination in Vietnam, and it leans sweet.",
    ": l'étalon lavé. Pas pour le plaisir, pour la mesure.": ": the washed benchmark. Not for pleasure, for measurement.",
    "Le matériel, stocks tendus, à faire en premier": "The gear, low stocks, do this first",
    "Pour quoi": "What for",
    "Article": "Item",
    "Prix": "Price",
    "Lien": "Link",
    "Le vrai manque": "The real gap",
    ", rien n'est reproductible sans": ", nothing is reproducible without it",
    "Balance 0,1 g, plateau assez large pour le Switch": "0.1 g scale, platform wide enough for the Switch",
    "150 à 400 k ₫": "150 to 400 k VND",
    "n'importe quel vendeur": "any seller",
    "Remplacer joint et plaque filtre": "Replace gasket and filter plate",
    "Joint Bialetti Brikka, Procaffe, variante Ron Brikka 2 cup, à changer tous les six mois": "Bialetti Brikka gasket, Procaffe, Ron Brikka 2 cup variant, replace every six months",
    "Produit ↗": "Product ↗",
    "Ne plus mettre du café partout": "Stop spilling coffee everywhere",
    "Bague de dosage Ventozi, Size nhỏ : Moka 3/4c. Égalise seulement, ne tasse jamais": "Ventozi dosing funnel, Size nhỏ: Moka 3/4c. Level only, never tamp",
    "Le consommable": "The consumable",
    "Papiers V60 format 02, blanc de préférence, rincer dans tous les cas. Sur Shopee, taper": "V60 size 02 papers, white preferably, rinse either way. On Shopee, search",
    "ou": "or",
    "quelques dizaines de k ₫": "a few tens of k VND",
    "Recherche ↗": "Search ↗",
    "Les cafés Brikka": "Brikka coffees",
    "La fermentation, et le meilleur test croisé": "Fermentation, and the best cross test",
    "Le honey le moins cher qui coche tout": "The cheapest honey that ticks every box",
    "Chocolat noir et caramel épais": "Dark chocolate and thick caramel",
    "Le corps dense pas cher": "Dense body on a budget",
    "Robusta Honey, The Married Beans, 250 g, grains et mouture à la demande": "Robusta Honey, The Married Beans, 250 g, beans with grind on demand",
    "Site ↗": "Site ↗",
    "Les cafés Switch": "Switch coffees",
    "Ma première tasse filtre, format découverte": "My first filter cup, discovery format",
    "L'anaerobic medium, la perle rare": "The medium anaerobic, the rare gem",
    "à demander": "ask for it",
    "Fiche ↗": "Page ↗",
    "Acidité douce, corps soyeux, finale chocolat": "Gentle acidity, silky body, chocolate finish",
    "Le liberica au bon prix": "Liberica at the right price",
    "Le floral pur, en petit format": "Pure floral, in a small format",
    "Guji Uraga lavé, Greenfields, 100 g": "Washed Guji Uraga, Greenfields, 100 g",
    "Chez Ritachi, en direct, si j'y vais": "At Ritachi, direct, if I go",
    "La banane par fermentation": "Banana through fermentation",
    "Fine Robusta Anaerobic, 250 g. Écrire avant, deux variantes sous le même SKU": "Fine Robusta Anaerobic, 250 g. Write first, two variants under the same SKU",
    "Leur meilleur choix filtre": "Their best filter pick",
    "Le Sáng Tạo 4 haut de gamme, et le port gratuit": "The upscale Sáng Tạo 4, and free shipping",

    "Un seul light roast à la fois": "One light roast at a time",
    "C'est un registre entièrement neuf, et il y a une vraie chance de ne pas accrocher du tout. Petit format quand il existe.": "It is an entirely new register, and there is a real chance you will not take to it at all. Small format when it exists.",
    "Le site officiel avant Shopee": "The official site before Shopee",
    "L'écart mesuré chez Every Half est de 36 pour cent, même pendant les promos. Là Việt, Soul, The Married Beans et Ritachi ne vendent quasiment que sur leur propre site.": "The gap measured at Every Half is 36 percent, even during sales. Là Việt, Soul, The Married Beans and Ritachi sell almost exclusively on their own sites.",
    "La hiérarchie réelle": "The real hierarchy",
    "Le procédé décide, la torréfaction arbitre, le pays d'origine arrive loin derrière. Un anaerobic medium du Đắk Lắk me plaira plus qu'un lavé light d'Éthiopie.": "The process decides, the roast arbitrates, the country of origin comes far behind. A medium anaerobic from Đắk Lắk will please me more than a light washed Ethiopian.",
    "Commander hors Shopee": "Ordering outside Shopee",
    "On perd l'escrow (préférer le paiement à la livraison, COD), les vouchers et la messagerie de l'app. On gagne des prix 25 à 36 pour cent plus bas, le choix de la mouture et la date de torréfaction. Le canal de contact réel au Vietnam est Zalo.": "You lose escrow (prefer cash on delivery, COD), vouchers, and the in-app messaging. You gain prices 25 to 36 percent lower, the choice of grind, and the roast date. The real contact channel in Vietnam is Zalo.",
    "Regrouper par boutique": "Bundle by shop",
    "Shopee facture le port par boutique. Regrouper quand deux cafés sont chez le même vendeur, et cliquer tous les vouchers de la boutique avant de valider.": "Shopee charges shipping per shop. Bundle whenever two coffees share a seller, and click every shop voucher before checking out.",
    "L'ordre à suivre": "The order to follow",
    "Maintenant : la balance, le seul achat qui améliore toutes les tasses. Ensuite le test croisé, un même café dans les deux machines le même jour. Ensuite seulement, un café Brikka et un café Switch selon ce que le test a appris.": "Now: the scale, the only purchase that improves every cup. Then the cross test, the same coffee in both machines on the same day. Only then, one Brikka coffee and one Switch coffee based on what the test taught you.",

    "Le joint Brikka, confirmé": "The Brikka gasket, confirmed",
    "La Brikka 2 tasses partage le joint du Moka Express 3 et 4 tasses :": "The 2-cup Brikka shares the gasket of the 3 and 4 cup Moka Express:",
    "50 mm intérieur, 65 mm extérieur": "50 mm inner, 65 mm outer",
    ". Chez Procaffe, prendre la variante « Ron Brikka 2 cup ». C'est du caoutchouc, pas du silicone, malgré la mention sur la boîte. À changer tous les six mois.": ". At Procaffe, pick the \"Ron Brikka 2 cup\" variant. It is rubber, not silicone, despite what the box says. Replace every six months.",
    "Entretien": "Care",
    ": rinçage à l'eau très chaude après chaque usage, brosse souple sur la plaque filtre. Jamais de lave-vaisselle, les détergents alcalins attaquent l'aluminium. Ne jamais laisser refroidir avec le marc dedans.": ": rinse with very hot water after every use, soft brush on the filter plate. Never the dishwasher, alkaline detergents attack aluminum. Never let it cool with the puck inside.",
    ": le papier et le marc à la poubelle, rinçage du cône. Démonter la valve en silicone une fois par semaine et rincer la bille, c'est là que ça s'encrasse.": ": paper and grounds in the bin, rinse the cone. Take the silicone valve apart once a week and rinse the ball, that is where it clogs up.",
    ": brossage à sec des meules toutes les deux ou trois semaines. Jamais d'eau.": ": dry-brush the burrs every two or three weeks. Never water.",
    "Les filtres du Switch": "Switch filters",
    "Le Switch SSD-200-B prend les papiers coniques": "The Switch SSD-200-B takes conical papers,",
    "V60 taille 02": "V60 size 02",
    ", Hario ou compatibles (CAFEC, Timemore). C'est le format le plus répandu du Vietnam. Sur Shopee, taper": ", Hario or compatible (CAFEC, Timemore). It is the most common format in Vietnam. On Shopee, search",
    ", ou": ", or",
    "pour la boîte officielle de 100 (VCF-02-100W en blanc). Le blanc est plus neutre au goût que le brun, mais rincer le papier dans les deux cas.": "for the official box of 100 (VCF-02-100W in white). White tastes more neutral than brown, but rinse the paper either way.",
    "Lancer la recherche sur Shopee ↗": "Run the Shopee search ↗",
    "Bouilloire": "Kettle",
    "Si le modèle a un thermostat variable, cibler 92 à 94 °C pour les medium. Sinon, faire bouillir puis attendre 45 secondes à 1 minute couvercle ouvert : l'eau retombe vers 94 à 95, ce qui est la valeur par défaut du champ température en saisie.": "If the model has a variable thermostat, aim for 92 to 94 °C for mediums. Otherwise, boil then wait 45 seconds to 1 minute with the lid open: the water falls back to around 94 to 95, which is the default of the temperature field in the brew form.",

    "À envoyer avant toute commande. La qualité de la réponse dit déjà tout sur le sérieux du vendeur.": "Send before any order. The quality of the reply already tells you everything about how serious the seller is.",
    "Question universelle avant tout achat": "Universal question before any purchase",
    "Copier": "Copy",
    "Les trois questions qui comptent : date de torréfaction, grains entiers, niveau de torréfaction.": "The three questions that matter: roast date, whole beans, roast level.",
    "Fine Coffee Agency, sécuriser les grains entiers": "Fine Coffee Agency, secure whole beans",
    "Bana Cafe, recevoir le G4 bien moulu": "Bana Cafe, get the G4 properly ground",
    "Le rang bơ ne passe jamais au moulin : il faut le recevoir déjà moulu.": "Butter-roasted coffee never goes through the grinder: it must arrive already ground.",
    "Ritachi, deux questions en une": "Ritachi, two questions in one",
    "Procaffe, confirmer la référence du joint": "Procaffe, confirm the gasket reference",
    "Demander le niveau de torréfaction": "Ask for the roast level",
    "Sources et lectures": "Sources and further reading",
    "Pull and Pour : test du Timemore C5 ESP, crans et microns ↗": "Pull and Pour: Timemore C5 ESP review, clicks and microns ↗",
    "Beean Coffee : plages de mouture par méthode ↗": "Beean Coffee: grind ranges by method ↗",
    "Hario : fiche technique du Switch SSD-200-B ↗": "Hario: Switch SSD-200-B specifications ↗",
    "Standard eau SCA et cibles Golden Cup ↗": "SCA water standard and Golden Cup targets ↗",
    "Vietnam Specialty Coffee : annuaire des torréfacteurs ↗": "Vietnam Specialty Coffee: roaster directory ↗",
    "Dripped Coffee : aluminium et corrosion des moka pots ↗": "Dripped Coffee: aluminum and moka pot corrosion ↗",
    "Cupper's : tailles de joints moka ↗": "Cupper's: moka gasket sizes ↗",

    "Bienvenue dans ton carnet d'extraction": "Welcome to your brew journal",
    "Où veux tu garder tes données ? Elles vivent dans deux fichiers CSV que tu peux ouvrir dans un tableur. Une copie de travail reste toujours dans le navigateur.": "Where do you want to keep your data? It lives in CSV files you can open in a spreadsheet. A working copy always stays in the browser.",
    "Créer un dossier de données": "Create a data folder",
    "Choisis un dossier sur ton disque, le site y crée cafes.csv et extractions.csv avec tes 5 cafés de départ.": "Pick a folder on your disk, the site creates cafes.csv and extractions.csv there with your 5 starter coffees.",
    "Ouvrir un dossier existant": "Open an existing folder",
    "Reprends un dossier qui contient déjà cafes.csv et extractions.csv.": "Reuse a folder that already contains cafes.csv and extractions.csv.",
    "65 extractions sur 6 semaines pour explorer le site. Remplaçable par tes vraies données à tout moment.": "65 brews over 6 weeks to explore the site. Replaceable with your real data at any time.",
    "Ton navigateur ne propose pas la liaison directe de fichiers (API File System Access). Elle existe dans Chrome et Edge. Dans Brave, elle s'active dans brave://flags (chercher File System Access API). En attendant, tes données restent dans le navigateur : pense à Exporter en CSV pour les sauvegarder.": "Your browser does not offer direct file linking (File System Access API). It exists in Chrome and Edge. In Brave, enable it in brave://flags (search for File System Access API). Meanwhile your data stays in the browser: use Export to CSV to back it up.",
    "Plus tard": "Later",
    "Importer un CSV": "Import a CSV",
    "Exporter en CSV": "Export to CSV",
    "Repartir de zéro": "Start over",
    "Importer un CSV : le site reconnaît tout seul s'il s'agit d'une table de cafés ou d'extractions, et remplace la table correspondante. Exporter : télécharge cafes.csv et extractions.csv.": "Import a CSV: the site detects on its own whether it is a coffees or brews table, and replaces the matching table. Export: downloads cafes.csv and extractions.csv.",
    "Fermer": "Close",

    "Mes cafés": "My coffees",
    "Ajouter un café": "Add a coffee",
    "Nouveau café": "New coffee",
    "Nom": "Name",
    "Torréfacteur": "Roaster",
    "Origine": "Origin",
    "Espèce": "Species",
    "Procédé": "Process",
    "Torréfaction": "Roast",
    "Choisir": "Choose",
    "Claire": "Light",
    "Foncée": "Dark",
    "Format (g)": "Bag size (g)",
    "Prix (VND)": "Price (VND)",
    "Date de torréfaction": "Roast date",
    "Machine recommandée": "Recommended machine",
    "Les deux": "Both",
    "Recette recommandée": "Recommended recipe",
    "Notes annoncées": "Stated notes",
    "Déjà moulu (mouture par défaut du paquet)": "Pre-ground (bag default grind)",
    "Pourcentage de café réel": "Real coffee percentage",
    "Vérifie la ligne thành phần au dos du paquet.": "Check the thành phần line on the back of the bag.",
    "Actif": "Active",

    // Nouveaux champs de saisie
    "Volume extrait (ml)": "Extracted volume (ml)",
    "Tasse utilisée": "Cup used",
    "Eau préchauffée": "Preheated water",
    "Versée chaude dans la chaudière, comme la recette le demande.": "Poured hot into the boiler, as the recipe asks.",
    "Ajout d'eau après extraction": "Water added after extraction",
    "Pour allonger la boisson. N'entre pas dans le ratio.": "To lengthen the drink. Does not count in the ratio.",
    "Agitation": "Stirring",
    "Nombre de remuages, 1 par défaut.": "Number of stirs, 1 by default.",
    "Lait ajouté (ml)": "Milk added (ml)",
    "Ajouter": "Add",
    "Bips aux paliers": "Beeps at checkpoints",
    "Arrêter et reporter": "Stop and fill in",
    "Déduit tout seul : du palier \"ouvrir\" à l'arrêt du chrono.": "Deduced automatically: from the \"open\" checkpoint to the timer stop.",

    // Choisir son Costaud et récapitulatif
    "Choisir son Costaud : le test": "Choosing your Costaud: the test",
    "Y a-t-il du sucré et du corps": "Is there sweetness and body",
    "derrière": "behind",
    "l'acidité ?": "the acidity?",
    "Non": "No",
    ", c'est acide et creux, ça s'arrête court : sous-extraction, prends": ", it is sour and hollow, it stops short: under-extraction, take",
    "Bloom": "Bloom",
    "Oui": "Yes",
    ", mais c'est trop vif pour moi : extraction correcte, prends": ", but it is too bright for me: correct extraction, take",
    "Immersion": "Immersion",
    "Récapitulatif mouture des recettes Switch": "Grind recap for the Switch recipes",
    "Les quatre premières restent dans la zone commune avec la Brikka à 1.2.0. Les deux dernières demandent d'ouvrir de deux numéros de plus.": "The first four stay in the shared zone with the Brikka at 1.2.0. The last two require opening two more numbers.",

    // Lire une étiquette vietnamienne
    "Lire une étiquette vietnamienne": "Reading a Vietnamese label",
    "liste des ingrédients, obligatoire, classée par poids décroissant. Le seul texte fiable de l'emballage, le reste est du marketing. Le premier endroit où regarder avant d'acheter.": "the ingredient list, mandatory, sorted by decreasing weight. The only reliable text on the packaging, the rest is marketing. The first place to look before buying.",
    "le pourcentage réel de café. Un café pur n'affiche pas de pourcentage, il écrit 100% cà phê ou liste ses variétés. Un pourcentage affiché est déjà un aveu.": "the real coffee percentage. A pure coffee shows no percentage, it writes 100% cà phê or lists its varieties. A displayed percentage is already a confession.",
    "soja torréfié. Très répandu dans le café vietnamien de grande distribution. Épaissit le corps, adoucit l'amertume, coûte une fraction du prix du café. Explique une rondeur qui ne vient pas de l'extraction.": "roasted soy. Widespread in mass-market Vietnamese coffee. Thickens the body, softens the bitterness, costs a fraction of coffee's price. Explains a roundness that does not come from your extraction.",
    "substitut de beurre à base d'huile végétale, souvent accompagné de bơ (có chứa sữa), du vrai beurre contenant du lait. Le filtre papier le retire entièrement, donc ces cafés ne vont jamais dans le Switch, et il encrasse les meules du moulin.": "butter substitute made from vegetable oil, often alongside bơ (có chứa sữa), real butter containing milk. The paper filter removes it entirely, so these coffees never go in the Switch, and it clogs the grinder burrs.",
    "sirop de sucre brun ajouté à la torréfaction. Donne la sucrosité. Colle aux meules et caramélise en chauffant.": "brown sugar syrup added during roasting. Provides the sweetness. Sticks to the burrs and caramelizes when heated.",
    "arômes de synthèse alimentaires. Ma ligne rouge. À ne pas confondre avec lên men, la fermentation, qui est légitime.": "synthetic food flavorings. My red line. Not to be confused with lên men, fermentation, which is legitimate.",
    "= obligatoire, tout le reste est optionnel.": "= required, everything else is optional.",
    "Sans café": "No coffee",
    "Café supprimé": "Deleted coffee",
    "Enregistrer le café": "Save the coffee",
    "Annuler": "Cancel",

    "Mes recettes": "My recipes",
    "Tout est éditable : les valeurs préremplies en saisie viennent d'ici. Les 7 recettes d'origine peuvent toujours être rétablies à leur version vérifiée.": "Everything is editable: the values prefilled in the brew form come from here. The 7 original recipes can always be restored to their verified version.",
    "Ajouter une recette": "Add a recipe",
    "Nouvelle recette": "New recipe",
    "Numéro ou étiquette": "Number or label",
    "Sous-titre": "Subtitle",
    "Température (°C)": "Temperature (°C)",
    "Température affichée": "Displayed temperature",
    "Ratio affiché": "Displayed ratio",
    "Durée affichée": "Displayed duration",
    "Étapes, une par ligne : \"0:45 texte\" pour une étape minutée, \"- texte\" sinon": "Steps, one per line: \"0:45 text\" for a timed step, \"- text\" otherwise",
    "Pour quels cafés": "For which coffees",
    "Cafés associés, un par ligne": "Matching coffees, one per line",
    "Note ou remarque": "Note or remark",
    "Recette par défaut": "Default recipe",
    "Avancée": "Advanced",
    "Visible": "Visible",
    "Enregistrer la recette": "Save the recipe",
    "Rétablir la version d'origine": "Restore the original version",
    "Supprimer": "Delete",

    "Saisie rapide": "Quick log",
    "Enregistrer": "Save",
    "Saisie complète": "Full form",
    "Date : maintenant. Dose, eau, température et mouture reprennent la recette.": "Date: now. Dose, water, temperature and grind are taken from the recipe.",
    "Démarrer": "Start",
    "Étape suivante": "Next step",

    // Corrections associées aux diagnostics
    "Rien à changer, note le réglage.": "Nothing to change, write the setting down.",
    "Presque bon : un ou deux crans plus fin, ou 2 à 3 degrés plus chaud.": "Almost there: one or two clicks finer, or 2 to 3 degrees hotter.",
    "Presque bon : un ou deux crans plus grossier, ou 2 à 3 degrés moins chaud.": "Almost there: one or two clicks coarser, or 2 to 3 degrees cooler.",
    "Moudre plus fin, plus chaud, plus longtemps.": "Grind finer, go hotter, brew longer.",
    "Moudre plus grossier, moins chaud, moins longtemps.": "Grind coarser, go cooler, brew shorter.",
    "Sur-extraction : plus grossier, et remuer moins.": "Over-extraction: coarser, and stir less.",
    "Distribution : aplanir le lit, remuer, verser en spirale.": "Distribution: level the bed, stir, pour in a spiral.",
    "Resserrer le ratio (moins d'eau ou plus de café).": "Tighten the ratio (less water or more coffee).",
    "Élargir le ratio (plus d'eau ou moins de café).": "Widen the ratio (more water or less coffee).",
    "Fraîcheur : vérifier la date de torréfaction, resserrer le sachet.": "Freshness: check the roast date, seal the bag tighter.",
    "Torréfaction trop foncée, aucun réglage ne l'enlèvera.": "Roast too dark, no setting will remove it.",

    // Variantes du 4:6
    "Classique": "Classic",
    "Plus de sucre": "More sweetness",
    "Équilibre": "Balance",
    "Plus de vivacité": "More brightness",
    "Corps léger": "Light body",
    "Corps moyen": "Medium body",
    "Corps plein": "Full body",
    "40 puis 80 g : plus de sucre et moins d'acidité. Mon découpage.": "40 then 80 g: more sweetness, less acidity. My split.",
    "60 puis 60 g : l'équilibre.": "60 then 60 g: the balanced split.",
    "80 puis 40 g : plus de vivacité.": "80 then 40 g: more brightness.",
    "Un seul versement.": "A single pour.",
    "Deux versements.": "Two pours.",
    "Trois versements. Mon choix.": "Three pours. My choice.",
  };

  // ---------- 2. Gabarits pour les chaînes dynamiques ----------

  const T = {
    doc_title: { fr: "Carnet d'extraction : Brikka et Switch", en: "Brew journal: Brikka and Switch" },

    kpi_auj: { fr: "aujourd'hui", en: "today" },
    kpi_semaine: { fr: "cette semaine", en: "this week" },
    kpi_total: { fr: "au total", en: "in total" },
    kpi_note: { fr: "note moyenne globale", en: "overall average score" },
    kpi_note7: { fr: "note moyenne 7 jours", en: "7-day average score" },
    kpi_cafeine: { fr: "caféine par jour, 7 jours (estimation)", en: "caffeine per day, 7 days (estimate)" },

    l_note_jour: { fr: "Note moyenne du jour", en: "Daily average score" },
    l_cafe_g: { fr: "Café consommé (g)", en: "Coffee used (g)" },
    l_extractions: { fr: "Extractions", en: "Brews" },
    axe_note: { fr: "Note sur 10", en: "Score out of 10" },
    axe_note_moy: { fr: "Note moyenne", en: "Average score" },
    axe_mouture: { fr: "Mouture (microns)", en: "Grind (microns)" },
    axe_age: { fr: "Âge du café (jours après torréfaction)", en: "Coffee age (days after roast)" },
    unite_jours: { fr: "jours", en: "days" },
    tip_cafeine: { fr: "Caféine : environ {mg} mg", en: "Caffeine: about {mg} mg" },
    b_extractions: { fr: "{n} extractions", en: "{n} brews" },

    // Insights automatiques du tableau de bord. Phrases construites en JS, donc
    // gabarits T et pas entrées UI. Éviter les pluriels variables dans les
    // formulations : les nombres arrivent déjà formatés.
    ins_frais_tot: {
      fr: "dans la première semaine après torréfaction",
      en: "within the first week after roasting",
    },
    ins_frais_median: {
      fr: "entre 8 et 21 jours après torréfaction",
      en: "between 8 and 21 days after roasting",
    },
    ins_frais_tard: {
      fr: "plus de trois semaines après torréfaction",
      en: "more than three weeks after roasting",
    },
    ins_fraicheur: {
      fr: "Tes meilleures tasses sortent {quand} : {haut} de moyenne contre {bas} le reste du temps.",
      en: "Your best cups land {quand}: {haut} average against {bas} the rest of the time.",
    },
    ins_mouture: {
      fr: "Sur la {machine}, {dial} est ton meilleur réglage : {haut} de moyenne contre {bas} pour tes autres réglages.",
      en: "On the {machine}, {dial} is your best setting: {haut} average against {bas} for your other settings.",
    },
    ins_recettes: {
      fr: "{gagnante} passe devant {perdante} : {haut} de moyenne contre {bas}.",
      en: "{gagnante} beats {perdante}: {haut} average against {bas}.",
    },
    ins_prechauffe_pour: {
      fr: "En Brikka, préchauffer l'eau paie : {haut} de moyenne contre {bas} sans.",
      en: "On the Brikka, preheating the water pays off: {haut} average against {bas} without.",
    },
    ins_prechauffe_contre: {
      fr: "En Brikka, tes tasses sans préchauffage sortent mieux : {haut} de moyenne contre {bas}.",
      en: "On the Brikka, your cups without preheating come out better: {haut} average against {bas}.",
    },
    ins_moment_matin: { fr: "le matin", en: "in the morning" },
    ins_moment_aprem: { fr: "l'après midi", en: "in the afternoon" },
    ins_moment_soir: { fr: "le soir", en: "in the evening" },
    ins_moment: {
      fr: "Tes tasses {quand} sortent mieux : {haut} de moyenne contre {bas} au reste de la journée.",
      en: "Your cups {quand} come out better: {haut} average against {bas} for the rest of the day.",
    },

    ins_vide: {
      fr: "Pas encore assez de matière. Une tendance ne veut dire quelque chose qu'à partir de {n} extractions notées dans chacun des groupes comparés.",
      en: "Not enough to go on yet. A trend only means something from {n} scored brews in each of the compared groups.",
    },
    // États de la synchronisation entre appareils.
    sync_local: {
      fr: "Synchronisation indisponible en local : tes données restent sur cet appareil.",
      en: "Sync unavailable locally: your data stays on this device.",
    },
    sync_demo: { fr: "Démonstration : rien n'est synchronisé.", en: "Demo data: nothing is synced." },
    sync_encours: { fr: "Synchronisation en cours...", en: "Syncing..." },
    sync_ok: { fr: "Synchronisé à {h}.", en: "Synced at {h}." },
    sync_horsligne: {
      fr: "Hors ligne. Tes saisies sont gardées ici et partiront à la prochaine synchro.",
      en: "Offline. Your entries are kept here and will go up on the next sync.",
    },
    sync_session: { fr: "Session expirée, reconnecte toi pour synchroniser.", en: "Session expired, sign in again to sync." },
    sync_nonconf: {
      fr: "Synchronisation pas encore configurée sur le serveur (base D1 à lier).",
      en: "Sync is not configured on the server yet (D1 database to bind).",
    },
    sync_erreur: { fr: "Synchronisation en échec. Tes données locales sont intactes.", en: "Sync failed. Your local data is intact." },
    sync_jamais: { fr: "Pas encore synchronisé.", en: "Not synced yet." },
    t_sync_ok: { fr: "Synchronisé", en: "Synced" },
    t_sync_ko: { fr: "Synchronisation impossible", en: "Sync failed" },

    ins_vide_age: {
      fr: "Renseigne la date de torréfaction de tes cafés pour débloquer la fenêtre de fraîcheur.",
      en: "Fill in the roast date of your coffees to unlock the freshness window.",
    },
    d_ext_brikka: { fr: "extractions Brikka", en: "Brikka brews" },
    d_ext_switch: { fr: "extractions Switch", en: "Switch brews" },
    d_note: { fr: "note moyenne", en: "average score" },
    molette: { fr: "molette", en: "dial" },

    hm_aria: { fr: "Extractions par jour", en: "Brews per day" },
    hm_aucune: { fr: "aucune extraction", en: "no brews" },
    hm_n: { fr: "{n} extraction", en: "{n} brew" },
    hm_ns: { fr: "{n} extractions", en: "{n} brews" },
    hm_note: { fr: "note moyenne {x}", en: "average score {x}" },
    // Cartes qui peuvent rester vides avec des données parfaitement valides.
    // Chaque message donne la cause RÉELLE et l'action qui la débloque.
    vide_rien: {
      fr: "Aucune extraction notée pour l'instant. Note tes tasses et ce graphique se remplira.",
      en: "No scored brews yet. Score your cups and this chart will fill up.",
    },
    vide_mouture_moulu: {
      fr: "Tous tes cafés extraits sont marqués déjà moulus, donc aucun réglage de molette n'est enregistré : ce n'est pas un bug. Une extraction avec un café en grains et le nuage démarre.",
      en: "Every coffee you have brewed is marked pre ground, so no dial setting is stored: this is not a bug. One brew with whole beans and the cloud starts.",
    },
    vide_mouture: {
      fr: "Aucun réglage de molette enregistré sur tes extractions notées.",
      en: "No dial setting recorded on your scored brews.",
    },
    vide_age_dates: {
      fr: "Aucun de tes cafés n'a de date de torréfaction. Renseigne la dans Gérer les cafés et ta fenêtre de fraîcheur apparaîtra.",
      en: "None of your coffees has a roast date. Fill it in under Manage coffees and your freshness window will appear.",
    },
    vide_age: {
      fr: "Pas encore d'extraction notée sur un café qui a une date de torréfaction.",
      en: "No scored brew yet on a coffee that has a roast date.",
    },
    vide_duel_une_machine: {
      fr: "Tu n'as encore utilisé qu'une seule machine. Passe un même café en Brikka et au Switch pour les comparer.",
      en: "You have only used one machine so far. Brew the same coffee on the Brikka and the Switch to compare them.",
    },
    vide_duel: {
      fr: "Aucun café n'est encore passé dans les deux machines avec une note.",
      en: "No coffee has been through both machines with a score yet.",
    },

    hm_st_tasses: { fr: "tasses", en: "cups" },
    hm_st_jours: { fr: "jours actifs", en: "active days" },
    hm_st_serie_now: { fr: "série en cours", en: "current run" },
    hm_st_serie_max: { fr: "meilleure série", en: "best run" },
    hm_st_semaine: { fr: "tasses par semaine", en: "cups per week" },
    hm_resume_vide: {
      fr: "Aucune extraction sur les {s} dernières semaines.",
      en: "No brews over the last {s} weeks.",
    },
    jours: { fr: "Lun|Mar|Mer|Jeu|Ven|Sam|Dim", en: "Mon|Tue|Wed|Thu|Fri|Sat|Sun" },
    mois: { fr: "janv.|févr.|mars|avr.|mai|juin|juil.|août|sept.|oct.|nov.|déc.", en: "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec" },

    rg_aria: { fr: "Plages de mouture par méthode", en: "Grind ranges by method" },
    rg_microns: { fr: "microns", en: "microns" },
    rg_tip: { fr: "{nom} : {min} à {max} µm, molette {mol}", en: "{nom}: {min} to {max} µm, dial {mol}" },
    rg_ref_tip: { fr: "{dial} : {usage}, {crans} crans, environ {u} µm", en: "{dial}: {usage}, {crans} clicks, about {u} µm" },

    cv_crans: { fr: "crans", en: "clicks" },
    cv_environ: { fr: "environ", en: "about" },
    cv_microns: { fr: "microns", en: "microns" },
    cv_bande: { fr: "bande", en: "band" },
    cv_compatible: { fr: "compatible :", en: "fits:" },
    cv_hors: { fr: "hors de toute plage recommandée", en: "outside every recommended range" },
    cv_erreur: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0 (rotation 0 à 3, numéro 0 à 9, cran 0 à 4, butée à 3.0.0).", en: "Expected format: rotation.number.click, for example 1.5.0 (rotation 0 to 3, number 0 to 9, click 0 to 4, hard stop at 3.0.0)." },
    plage_moins_u: { fr: "moins de {x}", en: "under {x}" },
    plage_a: { fr: "{a} à {b}", en: "{a} to {b}" },

    g_format: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0", en: "Expected format: rotation.number.click, for example 1.5.0" },
    g_fine: { fr: "Mouture plus fine que la plage {m} ({mol}). Risque de sur-extraction, amertume et écoulement bouché.", en: "Grind finer than the {m} range ({mol}). Risk of over-extraction, bitterness and a clogged drawdown." },
    g_grosse: { fr: "Mouture plus grossière que la plage {m} ({mol}). Risque de sous-extraction et de tasse acide et creuse.", en: "Grind coarser than the {m} range ({mol}). Risk of under-extraction and a sour, hollow cup." },

    w_rangbo: { fr: "Ce café ne va jamais dans le Switch : le papier retiendrait le beurre du rang bơ, qui fait tout son intérêt. Passe le à la Brikka.", en: "This coffee never goes in the Switch: the paper would hold back the rang bơ butter, which is its whole point. Brew it in the Brikka." },
    w_wethulled: { fr: "Wet hulled dans le Switch : déconseillé, le papier écrase ce profil. La Brikka lui va mieux.", en: "Wet hulled in the Switch: not advised, the paper crushes this profile. The Brikka suits it better." },
    w_foncee: { fr: "Torréfaction foncée dans le Switch : déconseillé, le papier accentue l'amertume sèche. La Brikka lui va mieux.", en: "Dark roast in the Switch: not advised, the paper sharpens the dry bitterness. The Brikka suits it better." },
    w_brikka_reco: { fr: "Ce café est noté pour la Brikka. Le Switch marchera mais ce n'est pas là qu'il donne le meilleur.", en: "This coffee is flagged for the Brikka. The Switch will work, but that is not where it shines." },
    w_switch_reco: { fr: "Ce café est noté pour le Switch. La pression de la Brikka peut amplifier son acidité.", en: "This coffee is flagged for the Switch. The Brikka's pressure can amplify its acidity." },
    w_reco: { fr: "Recette conseillée pour ce café : {r}. Libre à toi d'explorer, c'est juste un rappel.", en: "Suggested recipe for this coffee: {r}. Feel free to explore, this is just a reminder." },

    s_nouvelle: { fr: "Nouvelle extraction", en: "New brew" },
    s_dupliquee: { fr: "Nouvelle extraction (dupliquée)", en: "New brew (duplicated)" },
    s_modifier: { fr: "Modifier l'extraction", en: "Edit the brew" },
    s_enregistrer: { fr: "Enregistrer l'extraction", en: "Save the brew" },
    s_enregistrer_modif: { fr: "Enregistrer la modification", en: "Save the changes" },
    chrono_start: { fr: "Démarrer le chrono", en: "Start the timer" },
    chrono_stop: { fr: "Arrêter et reporter", en: "Stop and fill in" },
    lv_ratio: { fr: "Ratio :", en: "Ratio:" },
    lv_mouture: { fr: "Mouture :", en: "Grind:" },
    lv_cout: { fr: "Coût :", en: "Cost:" },
    lv_detail: { fr: "{c} crans, {u} µm", en: "{c} clicks, {u} µm" },
    lv_invalide: { fr: "format invalide", en: "invalid format" },
    vol_estime: { fr: "Estimation : {v} ml, reprendre", en: "Estimate: {v} ml, use it" },
    vol_titre: { fr: "Volume estimé pour la méthode {m}, cliquer pour remplir le champ", en: "Estimated volume for the {m} method, click to fill the field" },

    a_choisir_recette: { fr: "Choisis une recette pour voir ses étapes ici.", en: "Pick a recipe to see its steps here." },
    a_choisir_cafe: { fr: "Choisis un café pour voir sa fiche ici.", en: "Pick a coffee to see its card here." },
    a_pap: { fr: "Mode pas à pas", en: "Step by step" },
    a_reco: { fr: "Recommandé, ", en: "Recommended, " },
    a_machine: { fr: "machine : {m}", en: "machine: {m}" },
    a_recette: { fr: "recette : {r}", en: "recipe: {r}" },
    a_torref: { fr: "torréfaction {t}", en: "{t} roast" },
    a_prix: { fr: "{p} les {g} g, soit {pg} ₫ le gramme", en: "{p} per {g} g, that is {pg} ₫ per gram" },
    a_age: { fr: "Torréfié il y a {j} jour{s}, {f}", en: "Roasted {j} day{s} ago, {f}" },
    f_degaz: { fr: "encore en dégazage, idéal dans quelques jours", en: "still degassing, ideal in a few days" },
    f_ok: { fr: "dans la fenêtre utile de 1 à 6 semaines", en: "inside the useful 1 to 6 week window" },
    f_vieux: { fr: "au delà de la fenêtre de 6 semaines", en: "past the 6 week window" },

    choisir_cafe: { fr: "Choisir un café", en: "Pick a coffee" },
    inactif: { fr: "(inactif)", en: "(inactive)" },
    tous: { fr: "Tous", en: "All" },
    li_machine: { fr: "machine : {m}", en: "machine: {m}" },
    li_inactif: { fr: "inactif", en: "inactive" },
    li_ajoute: { fr: "ajouté le {d}", en: "added {d}" },
    li_masquee: { fr: "masquée", en: "hidden" },
    li_perso: { fr: "recette personnelle", en: "custom recipe" },
    btn_modifier: { fr: "Modifier", en: "Edit" },
    badge_defaut: { fr: "Par défaut", en: "Default" },
    badge_avancee: { fr: "Avancée", en: "Advanced" },
    r_pourqui: { fr: "Pour quels cafés :", en: "For which coffees:" },
    r_cafes: { fr: "Cafés associés :", en: "Matching coffees:" },
    fc_nouveau: { fr: "Nouveau café", en: "New coffee" },
    fr_nouvelle: { fr: "Nouvelle recette", en: "New recipe" },
    f_modif: { fr: "Modifier : {n}", en: "Edit: {n}" },
    aucune: { fr: "Aucune", en: "None" },

    te_40: { fr: "Les 40 premiers pourcents : sucre contre acidité", en: "The first 40 percent: sweetness versus acidity" },
    te_60: { fr: "Les 60 derniers pourcents : le corps", en: "The last 60 percent: body" },
    te_ligne: { fr: "verser <b>{p} g</b>, total {c} g", en: "pour <b>{p} g</b>, running total {c} g" },
    te_fin: { fr: "Verser à chaque fois que le lit vient de s'assécher en surface, environ toutes les 30 à 45 secondes.", en: "Pour each time the bed surface has just gone dry, roughly every 30 to 45 seconds." },

    pap_demarrer: { fr: "Démarrer", en: "Start" },
    pap_arreter: { fr: "Arrêter", en: "Stop" },
    pap_reprendre: { fr: "Reprendre à zéro", en: "Restart from zero" },
    pap_verser: { fr: "Verser {p} g{b}, total {c} g. Attendre que le lit s'assèche en surface.", en: "Pour {p} g{b}, running total {c} g. Wait until the bed surface goes dry." },
    pap_bloom: { fr: " (bloom)", en: " (bloom)" },
    pap_drain: { fr: "Laisser s'écouler entièrement.", en: "Let it drain completely." },

    h_compte: { fr: "{n} extraction{s} sur {t}", en: "{n} of {t} brews" },
    plus_gros: { fr: "moins de {x}", en: "under {x}" },

    statut_lie: { fr: "Dossier lié : \"{n}\". Chaque ajout ou modification est écrit dans les CSV, avec copie de travail dans le navigateur.", en: "Linked folder: \"{n}\". Every addition or change is written to the CSV files, with a working copy in the browser." },
    statut_demo: { fr: "Jeu de démonstration actif, stocké dans le navigateur. Lie un dossier ou importe tes CSV pour passer à tes vraies données.", en: "Demo dataset active, stored in the browser. Link a folder or import your CSVs to switch to your real data." },
    statut_nav: { fr: "Données stockées dans le navigateur uniquement. Lie un dossier pour qu'elles vivent dans de vrais fichiers CSV sur ton disque.", en: "Data stored in the browser only. Link a folder so it lives in real CSV files on your disk." },
    statut_compte: { fr: " ({c} cafés, {e} extractions)", en: " ({c} coffees, {e} brews)" },

    t_enregistree: { fr: "Extraction enregistrée", en: "Brew saved" },
    t_modifiee: { fr: "Extraction modifiée", en: "Brew updated" },
    t_supprimee: { fr: "Extraction supprimée", en: "Brew deleted" },
    t_dupliquee: { fr: "Extraction dupliquée, ajuste et enregistre", en: "Brew duplicated, adjust and save" },
    t_cafe: { fr: "Café enregistré", en: "Coffee saved" },
    t_recette: { fr: "Recette enregistrée", en: "Recipe saved" },
    t_retablie: { fr: "Recette rétablie à sa version d'origine", en: "Recipe restored to its original version" },
    t_recette_supprimee: { fr: "Recette supprimée", en: "Recipe deleted" },
    t_demo: { fr: "Démonstration chargée", en: "Demo loaded" },
    t_reinit: { fr: "Données réinitialisées", en: "Data reset" },
    t_dossier: { fr: "Dossier \"{n}\" lié", en: "Folder \"{n}\" linked" },
    t_export_tout: { fr: "cafes.csv, extractions.csv et recettes.csv téléchargés", en: "cafes.csv, extractions.csv and recettes.csv downloaded" },
    t_export_filtre: { fr: "CSV du filtre courant téléchargé", en: "CSV of the current filter downloaded" },
    t_import: { fr: "{n} lignes importées dans la table {t}", en: "{n} rows imported into the {t} table" },
    t_copie: { fr: "Message copié", en: "Message copied" },
    t_temps: { fr: "Temps reportés dans le formulaire", en: "Times filled into the form" },
    t_marque: { fr: "Début de l'écoulement marqué", en: "Drawdown start marked" },
    t_choisis_cafe: { fr: "Choisis un café d'abord", en: "Pick a coffee first" },
    t_dose: { fr: "Renseigne au moins la dose", en: "Fill in at least the dose" },
    t_fs: { fr: "Liaison de fichiers non disponible dans ce navigateur (Chrome ou Edge requis, Brave : activer l'API dans brave://flags)", en: "File linking unavailable in this browser (Chrome or Edge required; Brave: enable the API in brave://flags)" },
    paquet: { fr: "défaut paquet", en: "bag default" },
    paquet_aside: { fr: "Déjà moulu, ne pas moudre : le sucre et les graisses encrassent les meules. Mouture par défaut du paquet.", en: "Pre-ground, do not grind: sugar and fats clog the burrs. Bag default grind." },
    t_bloque: { fr: "Combinaison refusée : ce café ne va pas dans le Switch, le papier retiendrait ce qui fait son intérêt.", en: "Combination refused: this coffee does not go in the Switch, the paper would hold back what makes it worthwhile." },
    w_aromatise: { fr: "{pct} pour cent de café, le reste est du soja, du sucre et des graisses que le filtre papier retiendrait. Ce café va en Brikka ou en phin.", en: "{pct} percent coffee, the rest is soy, sugar and fats the paper filter would hold back. This coffee goes in the Brikka or a phin." },
    pct_cafe: { fr: "café", en: "coffee" },
    badge_etalon: { fr: "étalon", en: "benchmark" },
    lv_cout_reel: { fr: "café réel {v}", en: "real coffee {v}" },
    lv_boisson: { fr: "Boisson :", en: "Drink:" },
    lv_lait: { fr: "lait", en: "milk" },
    a_prix_reel: { fr: "Café réel : {pr} ₫ le gramme.", en: "Real coffee: {pr} ₫ per gram." },
    lait_calc: { fr: "Calcul : {t} ml de tasse moins {v} ml de café = {l} ml de lait.", en: "Math: {t} ml cup minus {v} ml coffee = {l} ml milk." },
    lait_trop_petit: { fr: "Tasse plus petite que l'extraction : pas de lait, et ne pas tout verser.", en: "Cup smaller than the extraction: no milk, and do not pour everything." },
    lait_choisir_tasse: { fr: "Choisis une tasse pour calculer le lait.", en: "Pick a cup to compute the milk." },
    tasse_deborde: { fr: "Environ {v} ml attendus pour une tasse de {c} ml : ça déborde, prends plus grand.", en: "About {v} ml expected for a {c} ml cup: it will overflow, pick a bigger one." },
    t_tasse_invalide: { fr: "Donne un nom et une contenance à la tasse", en: "Give the cup a name and a capacity" },
    btn_supprimer: { fr: "Supprimer", en: "Delete" },
    fam_chronicler: { fr: "Même famille : Chronicler", en: "Same family: Chronicler" },
    fam_costaud: { fr: "Les deux Costaud", en: "The two Costauds" },
    ch_demarrer: { fr: "Démarrer", en: "Start" },
    ch_pause: { fr: "Pause", en: "Pause" },
    ch_reprendre: { fr: "Reprendre", en: "Resume" },
    ch_pret: { fr: "Prêt : les paliers de la recette s'affichent ici.", en: "Ready: the recipe checkpoints show up here." },
    ch_suivante: { fr: "Puis à {t} (dans {d} s) : {texte}", en: "Then at {t} (in {d} s): {texte}" },
    ch_derniere: { fr: "Dernier palier passé : arrêt manuel quand la tasse est servie.", en: "Last checkpoint passed: stop manually once the cup is served." },
    dg_rotations: { fr: "Rotations depuis le zéro", en: "Rotations from zero" },
    rg_tip_court: { fr: "{min} à {max} µm, {minC} à {maxC} crans, molette {mol}", en: "{min} to {max} µm, {minC} to {maxC} clicks, dial {mol}" },
    t_choisis_recette: { fr: "Choisis une recette", en: "Pick a recipe" },
    t_nom_recette: { fr: "Donne un nom à la recette", en: "Give the recipe a name" },
    t_mouture_invalide: { fr: "Mouture invalide, format attendu : 1.5.0", en: "Invalid grind, expected format: 1.5.0" },
    t_rapide: { fr: "Extraction enregistrée : {r}, note {n}", en: "Brew saved: {r}, score {n}" },
    t_liaison: { fr: "Liaison impossible", en: "Linking failed" },
    tbl_cafes: { fr: "cafés", en: "coffees" },
    tbl_extractions: { fr: "extractions", en: "brews" },
    tbl_recettes: { fr: "recettes", en: "recipes" },

    c_suppr: { fr: "Supprimer cette extraction ?", en: "Delete this brew?" },
    c_demo: { fr: "Remplacer les données actuelles par la démonstration ? (Exporte les d'abord si tu veux les garder.)", en: "Replace the current data with the demo? (Export first if you want to keep it.)" },
    c_vider: { fr: "Repartir de zéro ? Les extractions sont effacées et les 5 cafés de départ restaurés. (Exporte d'abord si besoin.)", en: "Start over? Brews are erased and the 5 starter coffees restored. (Export first if needed.)" },
    c_retablir: { fr: "Rétablir la version d'origine de cette recette ? Tes modifications seront perdues.", en: "Restore this recipe's original version? Your changes will be lost." },
    c_suppr_recette: { fr: "Supprimer cette recette personnelle ?", en: "Delete this custom recipe?" },
  };

  // ---------- 3. Cartes d'affichage pour les valeurs de données ----------

  const DIAG = {
    "Équilibré": "Balanced",
    "Un peu acide": "Slightly sour",
    "Sous-extrait (acide)": "Under-extracted (sour)",
    "Un peu amer": "Slightly bitter",
    "Sur-extrait (amer)": "Over-extracted (bitter)",
    "Astringent": "Astringent",
    "Acide ET amer (extraction inégale)": "Sour AND bitter (uneven extraction)",
    "Trop léger (aqueux)": "Too weak (watery)",
    "Trop fort (concentré)": "Too strong (concentrated)",
    "Creux, plat (café éventé)": "Hollow, flat (stale coffee)",
    "Brûlé (défaut du sachet)": "Burnt (bag defect)",
  };

  const TAGS = {
    "rond": "round", "sirupeux": "syrupy", "crémeux": "creamy", "beurré": "buttery",
    "gras": "oily", "velouté": "velvety", "soyeux": "silky",
    "liquoreux": "liqueur-like", "sec": "dry", "léger": "thin",
    "chocolat noir": "dark chocolate", "chocolat au lait": "milk chocolate",
    "cacao": "cocoa", "noisette": "hazelnut", "amande": "almond", "cacahuète": "peanut",
    "caramel": "caramel", "sucre roux": "brown sugar", "miel": "honey", "vanille": "vanilla",
    "mélasse": "molasses", "praliné": "praline",
    "banane": "banana", "jacquier": "jackfruit", "fruits tropicaux": "tropical fruits",
    "fruit de la passion": "passion fruit", "fruits mûrs": "ripe fruits",
    "fruits rouges": "red berries", "cerise": "cherry", "fruits secs": "dried fruits",
    "raisin": "grape", "pomme": "apple", "agrume": "citrus", "pêche": "peach",
    "floral": "floral", "jasmin": "jasmine", "rose": "rose", "thé noir": "black tea", "thé vert": "green tea",
    "épices": "spices", "cannelle": "cinnamon", "clou de girofle": "clove", "réglisse": "licorice", "poivre": "pepper",
    "malt": "malt", "pain grillé": "toast", "biscuit": "biscuit",
    "vineux": "winey", "fermenté": "fermented", "rhum": "rum",
    "fumé": "smoky", "tabac": "tobacco", "brûlé": "burnt", "cendre": "ash", "caoutchouc": "rubber",
    "terreux": "earthy", "boisé": "woody", "moisi": "musty", "papier": "paper",
  };

  // Définition courte de chaque descripteur, affichée en infobulle et sous le
  // bloc quand on coche un tag. Format : { fr, en }. Pas de guillemets doubles
  // dans les textes (ils partent dans des attributs title).
  const TAGS_INFO = {
    "rond": { fr: "Sensation pleine et douce en bouche, sans angle ni agressivité.", en: "Full, gentle mouthfeel, no rough edges." },
    "sirupeux": { fr: "Épais et enveloppant, coule comme un sirop.", en: "Thick and coating, flows like syrup." },
    "crémeux": { fr: "Texture riche qui rappelle la crème, sans lait ajouté.", en: "Rich texture reminiscent of cream, with no milk added." },
    "beurré": { fr: "Fondant et gras comme du beurre, typique des cafés rang bơ vietnamiens.", en: "Melting and rich like butter, typical of Vietnamese rang bơ coffees." },
    "gras": { fr: "Texture huileuse qui nappe le palais, plus lourd que crémeux.", en: "Oily texture that coats the palate, heavier than creamy." },
    "velouté": { fr: "Doux et dense à la fois, comme un velouté de légumes.", en: "Soft yet dense, like a smooth veloute soup." },
    "soyeux": { fr: "Lisse et fluide, glisse comme de la soie.", en: "Smooth and fluid, glides like silk." },
    "liquoreux": { fr: "Riche et concentré comme un vin doux ou un porto.", en: "Rich and concentrated like a sweet wine or port." },
    "sec": { fr: "Finale qui assèche la bouche, comme un vin tannique.", en: "Finish that dries the mouth, like a tannic wine." },
    "léger": { fr: "Corps mince, proche du thé, peu de matière.", en: "Thin body, tea-like, little substance." },
    "chocolat noir": { fr: "Cacao intense, amertume noble du chocolat à 70 pour cent et plus.", en: "Intense cocoa, the noble bitterness of 70 percent chocolate and above." },
    "chocolat au lait": { fr: "Chocolat doux et sucré, plus rond que le chocolat noir.", en: "Soft, sweet chocolate, rounder than dark chocolate." },
    "cacao": { fr: "Poudre de cacao sec, moins sucré que le chocolat.", en: "Dry cocoa powder, less sweet than chocolate." },
    "noisette": { fr: "Noix douce et grillée, classique des arabicas lavés.", en: "Sweet roasted nut, classic in washed arabicas." },
    "amande": { fr: "Note de noix plus fine, légèrement sucrée.", en: "Finer nutty note, slightly sweet." },
    "cacahuète": { fr: "Arachide grillée, fréquent sur les robustas.", en: "Roasted peanut, common in robustas." },
    "caramel": { fr: "Sucre cuit, doux et légèrement grillé.", en: "Cooked sugar, sweet and lightly toasted." },
    "sucre roux": { fr: "Sucré rustique, cassonade ou sucre complet.", en: "Rustic sweetness, raw or whole cane sugar." },
    "miel": { fr: "Douceur florale et parfumée.", en: "Floral, fragrant sweetness." },
    "vanille": { fr: "Douceur ronde de gousse ou de crème vanillée.", en: "Round sweetness of vanilla pod or custard." },
    "mélasse": { fr: "Sucre foncé et dense, presque réglissé.", en: "Dark, dense sugar, almost licorice-like." },
    "praliné": { fr: "Noix caramélisée, entre noisette et caramel.", en: "Caramelized nut, between hazelnut and caramel." },
    "banane": { fr: "Fruit jaune bien mûr, souvent sur les naturals fermentés.", en: "Very ripe yellow fruit, often in fermented naturals." },
    "jacquier": { fr: "Fruit tropical sucré et musqué, signature du Liberica.", en: "Sweet, musky tropical fruit, the Liberica signature." },
    "fruits tropicaux": { fr: "Mangue, ananas, litchi : exotique et juteux.", en: "Mango, pineapple, lychee: exotic and juicy." },
    "fruit de la passion": { fr: "Tropical très aromatique, acidité tranchante.", en: "Very aromatic tropical fruit with sharp acidity." },
    "fruits mûrs": { fr: "Fruité confit, très mûr, presque compoté.", en: "Candied, very ripe fruit, almost stewed." },
    "fruits rouges": { fr: "Fraise, framboise : fruité vif et acidulé.", en: "Strawberry, raspberry: bright, tangy fruit." },
    "cerise": { fr: "Fruit rouge foncé, entre sucré et acidulé.", en: "Dark red fruit, between sweet and tart." },
    "fruits secs": { fr: "Raisin sec, datte, figue : fruité concentré et sucré.", en: "Raisin, date, fig: concentrated, sweet fruit." },
    "raisin": { fr: "Jus de raisin frais, tirant vers le vineux.", en: "Fresh grape juice, leaning winey." },
    "pomme": { fr: "Acidité croquante et propre, comme une pomme verte.", en: "Crisp, clean acidity, like a green apple." },
    "agrume": { fr: "Citron, orange, pamplemousse : acidité brillante.", en: "Lemon, orange, grapefruit: bright acidity." },
    "pêche": { fr: "Fruit à noyau doux, acidité délicate.", en: "Gentle stone fruit with delicate acidity." },
    "floral": { fr: "Parfum de fleurs, délicat et aérien.", en: "Flower fragrance, delicate and airy." },
    "jasmin": { fr: "Floral précis et parfumé, typique des arabicas clairs.", en: "Precise, perfumed floral note, typical of light arabicas." },
    "rose": { fr: "Floral intense, presque parfum de loukoum.", en: "Intense floral, almost Turkish delight." },
    "thé noir": { fr: "Tanins fins et finale sèche de thé infusé.", en: "Fine tannins and the dry finish of steeped tea." },
    "thé vert": { fr: "Végétal frais, léger et herbacé.", en: "Fresh vegetal note, light and grassy." },
    "épices": { fr: "Chaleur épicée générale, difficile à isoler.", en: "General spicy warmth, hard to pin down." },
    "cannelle": { fr: "Épice douce et boisée.", en: "Sweet, woody spice." },
    "clou de girofle": { fr: "Épice chaude, presque médicinale, très aromatique.", en: "Warm, almost medicinal, very aromatic spice." },
    "réglisse": { fr: "Anisé et sucré-amer, note sombre.", en: "Anise-like, bittersweet, dark note." },
    "poivre": { fr: "Piquant léger en fin de bouche, courant sur les robustas.", en: "Light pepperiness on the finish, common in robustas." },
    "malt": { fr: "Céréale sucrée, rappelle la bière blonde ou l'Ovomaltine.", en: "Sweet grain, reminiscent of lager or Ovaltine." },
    "pain grillé": { fr: "Croûte de pain, signe d'une torréfaction bien menée.", en: "Bread crust, the sign of a well run roast." },
    "biscuit": { fr: "Pâtisserie sèche et beurrée, douceur céréalière.", en: "Dry, buttery pastry, cereal sweetness." },
    "vineux": { fr: "Rappelle le vin rouge : acidité et rondeur fermentées.", en: "Reminiscent of red wine: fermented acidity and roundness." },
    "fermenté": { fr: "Fruité alcooleux ou lacté, typique des process anaérobies.", en: "Boozy or lactic fruitiness, typical of anaerobic processing." },
    "rhum": { fr: "Alcool sucré et boisé, canne à sucre fermentée.", en: "Sweet, woody spirit, fermented sugarcane." },
    "fumé": { fr: "Fumée de bois, feu de camp, thé lapsang : marqué mais pas âcre.", en: "Wood smoke, campfire, lapsang tea: bold but not acrid." },
    "tabac": { fr: "Feuille de tabac blond séchée, sucré-boisé, plutôt noble.", en: "Dried blond tobacco leaf, sweet and woody, rather noble." },
    "brûlé": { fr: "Torréfaction poussée trop loin : âcre, carbonisé, désagréable.", en: "Roast pushed too far: acrid, charred, unpleasant." },
    "cendre": { fr: "Cendre froide, sec et poussiéreux : défaut net.", en: "Cold ash, dry and dusty: a clear defect." },
    "caoutchouc": { fr: "Pneu ou gomme, défaut classique des robustas poussés.", en: "Tire or rubber, a classic defect of pushed robustas." },
    "terreux": { fr: "Terre humide, sous-bois, champignon : courant sur les robustas.", en: "Wet earth, forest floor, mushroom: common in robustas." },
    "boisé": { fr: "Bois sec, crayon, tonneau : souvent un café vieilli.", en: "Dry wood, pencil, barrel: often an aged coffee." },
    "moisi": { fr: "Humidité et moisissure, défaut de stockage du grain.", en: "Damp and mold, a green bean storage defect." },
    "papier": { fr: "Carton ou papier mouillé, café éventé ou filtre mal rincé.", en: "Cardboard or wet paper, stale coffee or an unrinsed filter." },
  };

  const GROUPES = {
    "Corps et texture": "Body and texture",
    "Cacao et noix": "Cocoa and nuts", "Sucré": "Sweet", "Fruité": "Fruity",
    "Floral et thé": "Floral and tea", "Épices": "Spices", "Céréales et malt": "Grains and malt",
    "Fermentation": "Fermented", "Torréfaction et défauts": "Roast and defects",
  };

  const METH = { "Turc": "Turkish" };

  const MACHINES = { "Les deux": "Both", "Brikka": "Brikka", "Switch": "Switch" };

  // ---------- Moteur ----------

  const registre = []; // { node, fr, en, prefixe, suffixe }
  let scanFait = false;

  const ZONES_JS = "#grille-recettes,#h-corps,#kpis,#dernieres-liste,#recettes-liste,#cafes-liste," +
    "#conv-resultat,#table-plages,#avertissements,#aside-recette,#aside-cafe,#duel-machines," +
    "#tetsu-bloc,#pap-etapes,#g-heatmap,#reglette,#f-diagnostic,#f-descripteurs,#f-recette,#f-cafe," +
    "#h-cafe,#h-diagnostic,#q-cafe,#q-recette,#c-recette,#donnees-statut,#toast,#pap-params," +
    "#insights,#sync-statut,#heatmap-stats,#version-site," +
    "#vide-mouture,#vide-age,#vide-duel";

  function scanner() {
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "PRE" || tag === "CODE" || tag === "TEXTAREA") {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest(ZONES_JS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = marche.nextNode())) {
      const brut = n.nodeValue;
      const cle = brut.trim();
      if (!cle || !UI[cle]) continue;
      const debut = (brut.match(/^\s*/) || [""])[0];
      const fin = /\s$/.test(brut) ? " " : "";
      registre.push({ node: n, fr: brut, en: debut + UI[cle] + fin });
    }
    scanFait = true;
  }

  function appliquerStatique() {
    if (!scanFait) scanner();
    registre.forEach(r => {
      try { r.node.nodeValue = lang === "en" ? r.en : r.fr; } catch (e) { /* noeud disparu */ }
    });
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.title = t("doc_title");
    // Placeholders
    const commentaire = document.getElementById("f-commentaire");
    if (commentaire) commentaire.placeholder = lang === "en"
      ? "Free text, for example: superb cup, round and sweet"
      : "Libre, par exemple : superbe tasse, ronde et sucrée";
  }

  function t(cle, vars) {
    const e = T[cle];
    let s = e ? (e[lang] || e.fr) : cle;
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function tr(texte) { return lang === "en" ? (UI[texte] || texte) : texte; }
  // Plage de molette "0.8.3 à 1.5.4" : le "à" devient "to" en anglais.
  function mol(s) { return lang === "en" ? String(s).replace(" à ", " to ") : s; }
  function diag(d) { return lang === "en" ? (DIAG[d] || d) : d; }
  function tag(d) { return lang === "en" ? (TAGS[d] || d) : d; }
  function tagInfo(d) { const e = TAGS_INFO[d]; return e ? (e[lang] || e.fr) : ""; }
  function groupe(g) { return lang === "en" ? (GROUPES[g] || g) : g; }
  function methode(m) { return lang === "en" ? (METH[m] || m) : m; }
  function machine(m) { return lang === "en" ? (MACHINES[m] || m) : m; }
  function locale() { return lang === "en" ? "en-GB" : "fr-FR"; }
  function jours() { return t("jours").split("|"); }
  function mois() { return t("mois").split("|"); }

  const abonnes = [];
  function abonner(fn) { abonnes.push(fn); }

  function basculer() {
    lang = lang === "fr" ? "en" : "fr";
    try { localStorage.setItem("langue", lang); } catch (e) { /* indisponible */ }
    appliquerStatique();
    abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  return {
    t, tr, mol, diag, tag, tagInfo, groupe, methode, machine, locale, jours, mois,
    abonner, basculer, appliquerStatique,
    lang: () => lang,
  };
})();
