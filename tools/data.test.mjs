/* Tests de la couche de donnees, sans navigateur.
 *
 *   node tools/data.test.mjs
 *
 * Charge les vrais scripts du site dans UN seul scope, comme le fait le
 * navigateur avec des scripts classiques, puis interroge DATA. Ne touche ni a
 * IndexedDB ni au DOM : ce qui est teste ici est la partie pure, celle qui peut
 * corrompre les donnees de l'utilisateur sans se voir.
 *
 * L'invariant central : `maj_le`, la colonne interne de synchronisation, ne doit
 * JAMAIS entrer dans un CSV. Les CSV sont ouverts au tableur par l'utilisateur
 * et une colonne technique en plus casserait la promesse du format.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = ["js/grind.js", "js/recettes.js", "js/demo-data.js", "js/sync.js", "js/data.js", "js/reglages.js"];

const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const charger = new Function(
  "window",
  "location",
  "indexedDB",
  "console",
  source + "\nreturn { DATA, SYNC, GRIND, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, REGLAGES, echelleVersements, SEUIL_VERSEMENT_G };"
);
const { DATA, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, REGLAGES,
  echelleVersements, SEUIL_VERSEMENT_G } =
  charger(undefined, { protocol: "file:" }, undefined, console);

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const ENTETE_CAFES =
  "id,nom,torrefacteur,origine,espece,procede,torrefaction,deja_moulu,pourcentage_cafe_reel," +
  "tag,notes_annoncees,format_grammes,prix_vnd,date_torrefaction,machine_recommandee," +
  "recette_recommandee,date_ajout,actif";

// 1. maj_le ne fuit pas dans les CSV, et les entetes sont inchangees
const cafeCsv = DATA.csvSerialiser([{ id: "c1", nom: "Test", maj_le: 1699999999999 }], DATA.CAFE_COLS);
check("entete cafes.csv inchangee", cafeCsv.split("\n")[0] === ENTETE_CAFES, cafeCsv.split("\n")[0]);
check("maj_le absent du CSV cafes", !cafeCsv.includes("maj_le") && !cafeCsv.includes("1699999999999"));

const extCsv = DATA.csvSerialiser([{ id: "e1", maj_le: 123 }], DATA.EXT_COLS);
check("maj_le absent du CSV extractions", !extCsv.includes("maj_le") && !extCsv.includes(",123"));
check("entete extractions inchangee", extCsv.split("\n")[0].startsWith("id,date_heure,cafe_id,methode"));

const recCsv = DATA.csvSerialiser([{ id: "r1", maj_le: 456 }], DATA.RECETTE_COLS);
check("maj_le absent du CSV recettes", !recCsv.includes("maj_le"));

// 2. Un aller retour CSV ne transporte pas maj_le : la ligne relue vaut 0, donc
// la version du serveur gagne. Comportement voulu, documente en section 8 bis.
const relu = DATA.csvParse(DATA.csvSerialiser([{ id: "c1", nom: "Test", maj_le: 999 }], DATA.CAFE_COLS));
check("CSV ne transporte pas maj_le", relu[0].maj_le === undefined);

// 3. Les calculs metier n'ont pas bouge
const calc = DATA.calculs({
  dose_g: 15,
  eau_g: 225,
  mouture_dial: "1.5.0",
  date_heure: "2026-08-12T08:00",
  volume_extrait_ml: 190,
  eau_ajoutee_ml: "",
  lait_ml: "",
});
check("ratio calcule", calc.ratioTexte === "1:15.0", calc.ratioTexte);
check("microns calcules en base 8,32", calc.microns === 624, String(calc.microns));
check("retention calculee", calc.retention_ml === 35, String(calc.retention_ml));

// 4. En file:// la synchronisation est inerte
check("etat initial de synchro", DATA.state.syncEtat === "inconnu", DATA.state.syncEtat);
check("syncPossible faux en file://", DATA.syncPossible() === false);
check(
  "tombes initialisees pour les 5 tables",
  Object.keys(DATA.state.tombes).sort().join() === "achats,cafes,extractions,recettes,tasses",
  Object.keys(DATA.state.tombes).join()
);

// 5. Une synchro impossible degrade sans jeter et sans rien perdre
DATA.state.cafes = [{ id: "c1", nom: "garde moi" }];
const etat = await DATA.synchroniser(true);
check("synchroniser degrade proprement", etat === "local", etat);
check(
  "donnees locales intactes apres echec",
  DATA.state.cafes.length === 1 && DATA.state.cafes[0].nom === "garde moi"
);

// 6. Stock par sachet. Le comportement CENTRAL : un rachat repart du format
// plein. Sans ca la table achats n'apporterait rien sur un cafe rachete, ce qui
// est precisement le cas d'usage qui la justifie.
const ACHAT_ENTETE = "id,cafe_id,date_achat,format_grammes,prix_vnd,date_torrefaction";
const achatCsv = DATA.csvSerialiser([{ id: "a1", cafe_id: "c1", format_grammes: 250, maj_le: 999 }], DATA.ACHAT_COLS);
const premiereLigneAchats = achatCsv.split("\n")[0];
check("entete achats.csv", premiereLigneAchats === ACHAT_ENTETE, premiereLigneAchats);
check("maj_le absent du CSV achats", !achatCsv.includes("999"));

DATA.state.cafes = [{ id: "c1", nom: "Test", format_grammes: 250, date_torrefaction: "2026-07-01", date_ajout: "2026-07-05", actif: 1 }];
DATA.state.achats = [{ id: "a1", cafe_id: "c1", date_achat: "2026-07-05", format_grammes: 250, date_torrefaction: "2026-07-01", maj_le: 1 }];
DATA.state.extractions = [
  { id: "e1", cafe_id: "c1", date_heure: "2026-07-06T08:00", dose_g: 15 },
  { id: "e2", cafe_id: "c1", date_heure: "2026-07-07T08:00", dose_g: 15 },
  { id: "e3", cafe_id: "c1", date_heure: "2026-07-08T08:00", dose_g: "" },
];
let stock = DATA.stockSachet("c1", 15);
check("dose oubliee comptee comme la dose par defaut", stock.consomme === 45, String(stock.consomme));
check("restant du premier sachet", stock.restant === 205, String(stock.restant));

DATA.state.achats.push({ id: "a2", cafe_id: "c1", date_achat: "2026-07-10", format_grammes: 340, date_torrefaction: "2026-08-05", maj_le: 2 });
stock = DATA.stockSachet("c1", 15);
check("un rachat repart du format plein", stock.restant === 340, String(stock.restant));
check("la fraicheur suit le nouveau sachet", stock.dateTorrefaction === "2026-08-05", stock.dateTorrefaction);
check("sachet courant = le dernier achete", DATA.sachetCourant("c1").id === "a2");
check("deux sachets comptes", stock.sachets === 2, String(stock.sachets));

DATA.state.cafes.push({ id: "c9", nom: "Sans format", format_grammes: "", actif: 1 });
check("pas de format, aucun badge de stock", DATA.stockSachet("c9", 15) === null);

DATA.state.extractions.push({ id: "e9", cafe_id: "c1", date_heure: "2026-07-11T08:00", dose_g: 400 });
check("depassement montre en negatif, pas masque", DATA.stockSachet("c1", 15).restant < 0);

// 7. Report des horodatages a la relecture d'un CSV. C'etait un vrai bug :
// modifier une extraction hors ligne puis RECHARGER la page avant que la synchro
// passe faisait perdre la modification, ecrasee par la version du serveur qui
// elle etait estampillee. Les CSV ne transportent pas maj_le, d'ou le report.
const T1 = 1700000000000;
const reporte = DATA.reporterHorodatage;
check("reporterHorodatage est expose", typeof reporte === "function");

const connues = [{ id: "e1", note_sur_10: 9, dose_g: 15, maj_le: T1 }];
const identique = reporte([{ id: "e1", note_sur_10: 9, dose_g: 15, maj_le: 0 }], connues, DATA.EXT_COLS);
check("contenu identique : horodatage conserve", identique[0].maj_le === T1, String(identique[0].maj_le));

const change = reporte([{ id: "e1", note_sur_10: 6, dose_g: 15, maj_le: 0 }], connues, DATA.EXT_COLS);
check("edition au tableur : estampillee maintenant, elle doit gagner", change[0].maj_le > T1);

const nouvelle = reporte([{ id: "e2", note_sur_10: 8, maj_le: 0 }], connues, DATA.EXT_COLS);
check("ligne inconnue du CSV : estampillee", nouvelle[0].maj_le > 0);

const sansConnues = reporte([{ id: "e3", maj_le: 0 }], undefined, DATA.EXT_COLS);
check("aucune ligne connue : ne jette pas", sansConnues.length === 1 && sansConnues[0].maj_le > 0);

// 8. Separation de la recette a l'eau prechauffee. Le prechauffage change la
// montee en pression, la duree et le comportement de la soupape : c'est un
// protocole distinct, pas une case a cocher, donc il merite sa propre ligne dans
// les comparaisons de recettes.
const CLASSIQUE = RECETTES_DEPART.find(r => r.id === "brikka-classique");
const BOUILLANTE = RECETTES_DEPART.find(r => r.id === "brikka-classique-bouillante");
check("le nom de Brikka classique reste inchange", CLASSIQUE.nom === "Brikka classique", CLASSIQUE.nom);
check("les deux partagent une famille", CLASSIQUE.famille === "brikka-classique" && BOUILLANTE.famille === CLASSIQUE.famille);
check("dose et eau identiques, comparaison propre", BOUILLANTE.dose === CLASSIQUE.dose && BOUILLANTE.eau === CLASSIQUE.eau);

// migrerDonnees n'est pas exposee : on passe par importerTexteCSV, qui l'appelle
// avant de persister. La persistance echoue faute d'IndexedDB, sans importance.
const PRECHAUFFEES = [6, 7, 11];
const NOTES = { 1: 8.5, 2: 8, 3: 8, 4: 8.5, 5: 7, 6: 7, 7: 6, 8: 7, 9: 7.5, 10: 7, 11: 4.5 };
const lignes = [];
for (let n = 1; n <= 11; n += 1) {
  lignes.push({
    id: "e" + n, date_heure: "2026-08-" + String(n + 2).padStart(2, "0") + "T10:00",
    cafe_id: "c1", methode: "Brikka", recette: "Brikka classique", dose_g: 14,
    eau_prechauffee: PRECHAUFFEES.includes(n) ? 1 : "", note_sur_10: NOTES[n],
  });
}
DATA.importerTexteCSV(DATA.csvSerialiser(lignes, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));

const NOUVELLE = "Brikka classique (eau préchauffée)";
const deplacees = DATA.state.extractions.filter(e => e.recette === NOUVELLE);
const restees = DATA.state.extractions.filter(e => e.recette === "Brikka classique");
check("les 3 extractions prechauffees sont deplacees", deplacees.length === 3, String(deplacees.length));
check("les 8 autres restent en place", restees.length === 8, String(restees.length));
check("aucune non prechauffee deplacee", restees.every(e => Number(e.eau_prechauffee) !== 1));
check("notes intactes apres migration", DATA.state.extractions.find(e => e.id === "e11").note_sur_10 === 4.5);
check("lignes deplacees estampillees pour la synchro", deplacees.every(e => Number(e.maj_le) > 0));

DATA.importerTexteCSV(DATA.csvSerialiser(DATA.state.extractions, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));
check(
  "migration idempotente : le rejeu ne redeplace rien",
  DATA.state.extractions.filter(e => e.recette === NOUVELLE).length === 3,
  String(DATA.state.extractions.filter(e => e.recette === NOUVELLE).length)
);

// 9. Puissance de feu, Brikka seulement. Echelle personnelle de 1 a 10, portee
// par les recettes (cible qui preremplit) ET par les extractions (ce qui a
// vraiment ete fait). C'est la variable que Chris cherche a regler apres un
// ecoulement de 5 secondes.
check("puissance_feu dans EXT_COLS", DATA.EXT_COLS.includes("puissance_feu"));
check("puissance_feu dans RECETTE_COLS", DATA.RECETTE_COLS.includes("puissance_feu"));
const BRIKKAS = RECETTES_DEPART.filter(r => r.methode === "Brikka");
check("les 4 recettes Brikka portent une cible a 2", BRIKKAS.length === 4 && BRIKKAS.every(r => r.puissance_feu === 2),
  BRIKKAS.map(r => r.nom + "=" + r.puissance_feu).join(" | "));
check("aucune recette Switch n'en porte", RECETTES_DEPART.filter(r => r.methode === "Switch").every(r => r.puissance_feu === undefined));

const feuLignes = [];
for (let n = 1; n <= 11; n += 1) {
  feuLignes.push({
    id: "f" + n, date_heure: "2026-08-" + String(n + 2).padStart(2, "0") + "T10:00",
    cafe_id: "c1", methode: "Brikka", recette: "Brikka classique", dose_g: 14,
    temperature_c: 95, note_sur_10: 7, puissance_feu: "",
  });
}
feuLignes.push({ id: "f12", date_heure: "2026-08-14T10:00", cafe_id: "c1", methode: "Switch", dose_g: 15, note_sur_10: 7, puissance_feu: "" });
feuLignes.push({ id: "f13", date_heure: "2026-08-15T10:00", cafe_id: "c1", methode: "Brikka", dose_g: 14, note_sur_10: 7, puissance_feu: 8 });
DATA.importerTexteCSV(DATA.csvSerialiser(feuLignes, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));

const apresFeu = DATA.state.extractions;
const brikkasMigrees = apresFeu.filter(e => e.methode === "Brikka" && e.id !== "f13");
check("les Brikka passees passent a 3", brikkasMigrees.every(e => e.puissance_feu === 3),
  [...new Set(brikkasMigrees.map(e => e.puissance_feu))].join());
check("une extraction Switch reste vide", apresFeu.find(e => e.id === "f12").puissance_feu === "");
check("une valeur deja saisie n'est jamais ecrasee", apresFeu.find(e => e.id === "f13").puissance_feu === 8);
check("la temperature des anciennes n'est PAS touchee", apresFeu.find(e => e.id === "f1").temperature_c === 95,
  String(apresFeu.find(e => e.id === "f1").temperature_c));

DATA.importerTexteCSV(DATA.csvSerialiser([
  { id: "b1", methode: "Brikka", puissance_feu: 0 },
  { id: "b2", methode: "Brikka", puissance_feu: 12 },
  { id: "b3", methode: "Brikka", puissance_feu: "7.6" },
], DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));
const feuDe = id => DATA.state.extractions.find(e => e.id === id).puissance_feu;
check("0 est ramene a 1", feuDe("b1") === 1, String(feuDe("b1")));
check("12 est ramene a 10", feuDe("b2") === 10, String(feuDe("b2")));
check("7,6 est arrondi a 8", feuDe("b3") === 8, String(feuDe("b3")));

// 10. Diagnostics groupes. La regle non negociable du projet : ajouter une
// valeur ne casse rien, en RETIRER une casserait l'historique deja enregistre.
// Ce test verrouille exactement ca.
const DIAGS_AVANT_REGROUPEMENT = [
  "Équilibré", "Un peu acide", "Sous-extrait (acide)", "Un peu amer", "Sur-extrait (amer)",
  "Astringent", "Acide ET amer (extraction inégale)", "Trop léger (aqueux)",
  "Trop fort (concentré)", "Creux, plat (café éventé)", "Brûlé (défaut du sachet)",
];
const perdus = DIAGS_AVANT_REGROUPEMENT.filter(d => !DIAGNOSTICS.includes(d));
check("aucun diagnostic historique retire", perdus.length === 0, perdus.join(", "));
check("la liste a plat suit l'ordre des groupes",
  DIAGNOSTICS.join("|") === DIAGNOSTICS_GROUPES.flatMap(g => g.diags).join("|"));
check("aucun doublon entre groupes", new Set(DIAGNOSTICS).size === DIAGNOSTICS.length);
check("chaque diagnostic a sa correction",
  DIAGNOSTICS.every(d => DIAGNOSTIC_CORRECTIONS[d]),
  DIAGNOSTICS.filter(d => !DIAGNOSTIC_CORRECTIONS[d]).join(", "));

// Chaque nuance douce precede sa version franche : l'ordre porte le sens.
const PAIRES = [
  ["Un peu acide", "Sous-extrait (acide)"], ["Un peu amer", "Sur-extrait (amer)"],
  ["Un peu astringent", "Astringent"], ["Un peu léger", "Trop léger (aqueux)"],
  ["Un peu concentré", "Trop fort (concentré)"], ["Un peu éventé", "Creux, plat (café éventé)"],
  ["Un peu brûlé", "Brûlé (défaut du sachet)"],
];
check("chaque nuance douce precede sa version franche",
  PAIRES.every(([doux, franc]) => DIAGNOSTICS.indexOf(doux) >= 0 &&
    DIAGNOSTICS.indexOf(doux) < DIAGNOSTICS.indexOf(franc)));

// Un diagnostic multiple deja enregistre reste lisible tel quel
const multi = "Trop léger (aqueux)|Acide ET amer (extraction inégale)";
check("un diagnostic multiple historique reste reconnu",
  multi.split("|").every(d => DIAGNOSTICS.includes(d)));

// 11. Bulle d'aide des diagnostics : QUAND cocher, puis QUOI faire. La
// correction seule disait quoi faire sans dire dans quel cas on est, et une
// bonne correction appliquee au mauvais diagnostic empire la tasse suivante.
// Motif construit par code de caractere : ecrire ces tirets en clair ferait
// echouer le scan anti tirets du projet sur ce fichier meme.
const TIRETS_INTERDITS = new RegExp("[" + [0x2012, 0x2013, 0x2014, 0x2015].map(c => String.fromCharCode(c)).join("") + "]");
check("chaque diagnostic a une description du QUAND",
  DIAGNOSTICS.every(d => DIAGNOSTIC_QUAND[d]),
  DIAGNOSTICS.filter(d => !DIAGNOSTIC_QUAND[d]).join(", "));
check("aucun guillemet double : ces textes partent dans un attribut HTML",
  Object.values(DIAGNOSTIC_QUAND).every(v => !v.includes('"')));
check("aucun tiret cadratin dans les descriptions",
  Object.values(DIAGNOSTIC_QUAND).every(v => !TIRETS_INTERDITS.test(v)));
check("la bulle tient sur deux lignes pour chaque diagnostic",
  DIAGNOSTICS.every(d => [DIAGNOSTIC_QUAND[d], DIAGNOSTIC_CORRECTIONS[d]].filter(Boolean).length === 2));

// 12. Meilleur reglage PAR CAFE (js/reglages.js). Par cafe et pas en general :
// le meilleur reglage d'un cafe deja moulu a 82 pour cent n'a rien a voir avec
// celui d'un cafe en grains, une moyenne globale melangerait les deux.
const brew = (id, cafe, recette, mouture, feu, prech, note) => ({
  id, cafe_id: cafe, recette, mouture_dial: mouture, puissance_feu: feu,
  eau_prechauffee: prech ? 1 : "", note_sur_10: note,
  date_heure: "2026-08-" + id.padStart(2, "0") + "T10:00",
});

const jeu = [
  brew("01", "c1", "Brikka classique", "1.2.0", 3, false, 8),
  brew("02", "c1", "Brikka classique", "1.2.0", 3, false, 8.5),
  brew("03", "c1", "Brikka classique", "1.2.0", 3, false, 7.5),
  brew("04", "c1", "Brikka classique", "1.3.0", 6, false, 6),
  brew("05", "c1", "Brikka classique", "1.3.0", 6, false, 5.5),
  brew("06", "c1", "Brikka classique", "1.3.0", 6, false, 6.5),
];
const bilan = REGLAGES.pourCafe("c1", jeu);
check("la combinaison gagnante est trouvee", bilan.meilleure !== null);
check("c'est la mieux notee", Math.round(bilan.meilleure.moyenne * 10) / 10 === 8, String(bilan.meilleure.moyenne));
check("elle porte ses reglages", bilan.meilleure.mouture === "1.2.0" && bilan.meilleure.puissance === "3");
check("la tasse de reference est la mieux notee", bilan.meilleure.referenceId === "02", bilan.meilleure.referenceId);

const maigre = REGLAGES.pourCafe("c2", [brew("10", "c2", "R", "1.2.0", 3, false, 8), brew("11", "c2", "R", "1.2.0", 3, false, 7)]);
check("sous le seuil, rien n'est affirme", maigre.meilleure === null && maigre.raison === "pas_assez");
check("et on dit combien il manque", maigre.manque === 1, String(maigre.manque));

const eparpille = REGLAGES.pourCafe("c3", ["1.2.0", "1.3.0", "1.4.0", "1.5.0"]
  .map((m, k) => brew("2" + k, "c3", "R", m, 3, false, 7)));
check("assez de tasses mais toutes differentes : rien", eparpille.meilleure === null);
check("la raison distingue ce cas", eparpille.raison === "eparpille", eparpille.raison);

const prech = [false, false, false, true, true, true]
  .map((p, k) => brew("3" + k, "c4", "R", "1.2.0", 3, p, p ? 9 : 6));
const avecPrech = REGLAGES.pourCafe("c4", prech);
check("le prechauffage distingue deux combinaisons", avecPrech.combinaisons === 2, String(avecPrech.combinaisons));
check("la meilleure des deux gagne", avecPrech.meilleure.prechauffe === true);

const moulu = ["40", "41", "42"].map(id => brew(id, "c5", "R", "", 3, false, 7));
check("un cafe deja moulu a une combinaison valide sans mouture",
  REGLAGES.pourCafe("c5", moulu).meilleure?.mouture === "");

check("un cafe jamais extrait est signale, pas ignore",
  REGLAGES.pourCafe("c9", []).raison === "aucune");

const classe = REGLAGES.tous(
  [{ id: "c2", nom: "Sans", actif: 1 }, { id: "c1", nom: "Avec", actif: 1 }, { id: "cz", nom: "Off", actif: 0 }],
  jeu.concat([brew("10", "c2", "R", "1.2.0", 3, false, 8)]));
check("les cafes avec resultat passent devant", classe[0].cafe.id === "c1", classe.map(x => x.cafe.id).join());
check("les inactifs finissent en dernier", classe[classe.length - 1].cafe.actif === 0);

// Ratio : deux logiques distinctes, une par machine. Sur la Brikka l'eau saisie
// est celle de la CHAUDIERE, dont une partie part en vapeur : la rapporter a la
// dose donne un nombre qui ne bouge jamais (la chaudiere est toujours remplie
// pareil) et qui ne dit rien de la concentration en tasse.
{
  const brikka = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90 });
  check("Brikka : le ratio se base sur le volume en tasse", brikka.ratioTexte === "1:5.6", brikka.ratioTexte);
  check("Brikka : la base est nommee", brikka.ratioBase === "tasse", brikka.ratioBase);

  const sansVolume = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: "" });
  check("Brikka sans volume : repli chaudiere, et il est nomme",
    sansVolume.ratioTexte === "1:9.4" && sansVolume.ratioBase === "chaudiere",
    sansVolume.ratioTexte + " / " + sansVolume.ratioBase);

  const sw = DATA.calculs({ methode: "Switch", dose_g: 15, eau_g: 225, volume_extrait_ml: 190 });
  check("Switch : ratio d'infusion, inchange", sw.ratioTexte === "1:15.0", sw.ratioTexte);
  check("Switch : le volume extrait ne detourne pas le calcul", sw.ratioBase === "infusion", sw.ratioBase);

  const allonge = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90, eau_ajoutee_ml: 40 });
  check("allonger a l'eau ne touche pas au ratio d'extraction", allonge.ratioTexte === "1:5.6", allonge.ratioTexte);
  check("allonger a l'eau donne un ratio boisson en plus", allonge.ratioBoisson === "1:8.1", allonge.ratioBoisson);
  check("sans allongement, pas de ratio boisson",
    DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90 }).ratioBoisson === "");
}

// Valeurs par defaut d'une recette : "" veut dire AUCUNE cible, ce qui n'est pas
// zero. Les recettes Brikka n'ont pas de temperature cible, la flamme decide.
{
  const brikkas = RECETTES_DEPART.filter(r => r.methode === "Brikka");
  check("les recettes Brikka n'imposent aucune temperature",
    brikkas.length > 0 && brikkas.every(r => DATA.normaliserRecette(r).temp === ""),
    brikkas.map(r => r.nom + "=" + DATA.normaliserRecette(r).temp).join(", "));
  check("les recettes Brikka preremplissent 150 g de chaudiere",
    brikkas.every(r => DATA.normaliserRecette(r).eau === 150),
    brikkas.map(r => r.nom + "=" + DATA.normaliserRecette(r).eau).join(", "));
  check("les recettes Switch gardent une temperature cible",
    RECETTES_DEPART.filter(r => r.methode === "Switch").every(r => DATA.normaliserRecette(r).temp > 0));
  check("une temperature vide reste vide et ne devient pas 0",
    DATA.normaliserRecette({ temp: "" }).temp === "" && DATA.normaliserRecette({ temp: 0 }).temp === "");
  check("la puissance de feu de la recette survit a la normalisation",
    DATA.normaliserRecette({ puissance_feu: 4 }).puissance_feu === 4);
  check("la puissance de feu est bornee a l'echelle 1-10",
    DATA.normaliserRecette({ puissance_feu: 99 }).puissance_feu === 10 &&
    DATA.normaliserRecette({ puissance_feu: 0 }).puissance_feu === 1);
}

/* Recettes stockees : changer RECETTES_DEPART ne suffit pas. Une installation
   existante garde la valeur semee le jour de sa creation, et c'est la recette
   qui preremplit la saisie. Sans ces passages, demander 150 g et un feu a 2
   n'aurait aucun effet visible pour Chris. */
{
  const marques = new Set();
  globalThis.localStorage = {
    getItem: k => (marques.has(k) ? "1" : null),
    setItem: k => marques.add(k),
    removeItem: k => marques.delete(k),
  };
  // Une installation d'avant : chaudiere estimee a 100 g, feu a 4, temperature figee.
  DATA.state.recettes = [
    { id: "b1", nom: "Brikka classique", methode: "Brikka", eau: 100, temp: 93, puissance_feu: 4, maj_le: 0 },
    { id: "b2", nom: "Brikka flat white", methode: "Brikka", eau: 100, temp: 93, puissance_feu: 3, maj_le: 0 },
    // Choix volontaire posterieur : ne doit PAS etre ecrase.
    { id: "b3", nom: "Brikka perso", methode: "Brikka", eau: 170, temp: "", puissance_feu: 6, maj_le: 0 },
    { id: "s1", nom: "Switch 4:6", methode: "Switch", eau: 225, temp: 92, puissance_feu: "", maj_le: 0 },
  ];
  DATA.migrerDonnees();
  const par = id => DATA.state.recettes.find(r => r.id === id);
  check("la chaudiere Brikka passe de 100 a 150 g", par("b1").eau === 150 && par("b2").eau === 150,
    par("b1").eau + " / " + par("b2").eau);
  check("la temperature cible Brikka disparait", par("b1").temp === "" && par("b2").temp === "",
    JSON.stringify([par("b1").temp, par("b2").temp]));
  check("le feu semé a 4 devient 2", par("b1").puissance_feu === 2, par("b1").puissance_feu);
  check("le feu semé a 3 passe par 4 puis finit a 2", par("b2").puissance_feu === 2, par("b2").puissance_feu);
  check("une recette Brikka reglee a la main n'est pas touchee",
    par("b3").eau === 170 && par("b3").puissance_feu === 6,
    par("b3").eau + " / " + par("b3").puissance_feu);
  check("le Switch n'est jamais concerne", par("s1").eau === 225 && par("s1").temp === 92);
  check("les recettes touchees sont estampillees pour la synchro", par("b1").maj_le > 0);

  // Rejouer ne doit RIEN faire : sinon un feu remis a 4 volontairement
  // retomberait a 2 au prochain chargement.
  par("b1").puissance_feu = 4;
  par("b1").eau = 100;
  DATA.migrerDonnees();
  check("les passages ne se rejouent pas", par("b1").puissance_feu === 4 && par("b1").eau === 100,
    par("b1").puissance_feu + " / " + par("b1").eau);
  delete globalThis.localStorage;
}

/* Le service worker doit precacher TOUS les scripts charges par index.html.
   sync.js et reglages.js manquaient : hors ligne, SYNC et REGLAGES n'existaient
   pas et app.js cassait au demarrage. Une liste ecrite a la main diverge
   forcement, donc on la compare a la source. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const manquants = scripts.filter(s => !sw.includes('"./' + s + '"'));
  check("tous les scripts d'index.html sont precaches", manquants.length === 0, manquants.join(", "));
  check("index.html charge bien une dizaine de scripts", scripts.length >= 9, String(scripts.length));

  // La feuille de style et le manifeste comptent autant : sans eux la PWA
  // s'ouvre hors ligne en page blanche non stylee.
  ["./css/styles.css", "./manifest.json", "./index.html"].forEach(f =>
    check("precache : " + f, sw.includes('"' + f + '"')));
}

/* La barre de navigation ne doit plus jamais passer a la ligne : trois onglets a
   texte, tout le reste en icone a droite. C'est le 7e onglet Parametres qui avait
   casse la mise en page. */
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const nav = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>'));
  const onglets = (nav.match(/nav-btn/g) || []).length;
  check('trois onglets a texte au maximum dans la nav', onglets <= 3, String(onglets));

  // Chaque icone d'ecran doit viser un ecran qui existe vraiment.
  const cibles = [...html.matchAll(/data-ecran="(w+)"/g)].map(m => m[1]);
  const app = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  const liste = app.slice(app.indexOf('const ECRANS = ['), app.indexOf(']', app.indexOf('const ECRANS = [')));
  const inconnues = cibles.filter(c => !liste.includes('"' + c + '"'));
  check('toutes les cibles data-ecran existent', inconnues.length === 0, inconnues.join(', '));

  // Une icone sans libelle accessible est muette au lecteur d'ecran.
  const sansLabel = [...html.matchAll(/<button[^>]*nav-icone[^>]*>/g)].filter(m => !m[0].includes('aria-label'));
  check('chaque icone d ecran porte un aria-label', sansLabel.length === 0, String(sansLabel.length));
}

/* Le carnet ne doit JAMAIS refuser un enregistrement au motif que la combinaison
   cafe plus machine lui deplait. Il y avait un blocage sur les cafes rang bo et
   non purs en Switch : il empechait exactement l'essai qui aurait produit la
   donnee capable de trancher. Les avertissements restent, le refus est parti. */
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("plus aucun refus d'enregistrement dans app.js",
    !app.includes("saisie.bloque") && !app.includes("t_bloque"));

  const rec = readFileSync(join(ROOT, "js/recettes.js"), "utf8");
  check("avertissementsCombinaison ne renvoie plus de blocage", !rec.includes("bloque = true"));
  check("la fonction cafeInterditSwitch a disparu", !rec.includes("cafeInterditSwitch"));

  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("la cle du refus a disparu du dictionnaire", !i18n.includes("t_bloque"));
  const ligneRangbo = (i18n.match(/^ *w_rangbo:.*$/m) || [""])[0];
  check("le message rang bo n'interdit plus, il informe",
    !ligneRangbo.includes("jamais") && ligneRangbo.includes("À tenter quand même"), ligneRangbo.slice(0, 90));

  // Les avertissements eux-memes restent : ils informent sans interdire.
  check("l'avertissement rang bo existe toujours", i18n.includes("w_rangbo"));
  check("l'avertissement cafe non pur existe toujours", i18n.includes("w_aromatise"));
}

/* Le select de temperature est une aide de saisie et rien d'autre : il ecrit dans
   le champ nombre, aucune colonne nouvelle, donc aucune migration. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const debut = html.indexOf('<select id="f-temp-preset"');
  const sel = html.slice(debut, html.indexOf("</select>", debut));
  const options = [...sel.matchAll(/<option value="([0-9]*)"/g)].map(m => m[1]);
  check("le select de temperature propose au moins 6 methodes", options.length >= 6, String(options.length));
  check("la premiere option est neutre", options[0] === "", JSON.stringify(options[0]));
  const nombres = options.filter(Boolean).map(Number);
  check("les temperatures proposees tiennent dans les bornes du champ",
    nombres.every(n => n >= 60 && n <= 100), nombres.join(", "));
  check("aucune colonne n'a ete ajoutee pour la methode de chauffe",
    !DATA.EXT_COLS.includes("temp_methode") && DATA.EXT_COLS.includes("temperature_c"));
}

/* Mise a l'echelle des versements. Une recette ecrit ses paliers en grammes
   ABSOLUS, donc changer l'eau dans la saisie la rendait fausse : elle reclamait
   toujours 225 g alors que Chris en avait verse 240, et le chrono aussi. */
{
  const cc = RECETTES_DEPART.find(r => r.nom === "The Coffee Chronicler's Recipe");
  check("la recette Chronicler existe et porte 225 g", cc && Number(cc.eau) === 225);

  const paliers = cc.etapes.map(e => e.texte);
  const a240 = paliers.map(x => echelleVersements(x, 240 / 225));
  check("112 g devient 119 g quand on verse 240 au lieu de 225",
    a240[0].includes("119 g") && !a240[0].includes("112 g"), a240[0]);
  check("225 g devient 240 g", a240[1].includes("240 g"), a240[1]);
  check("le palier sans gramme est intact", a240[2] === paliers[2], a240[2]);

  const double = paliers.map(x => echelleVersements(x, 2));
  check("au double, 112 g devient 224 g", double[0].includes("224 g"), double[0]);
  check("au double, 225 g devient 450 g", double[1].includes("450 g"), double[1]);

  check("un facteur de 1 ne touche a RIEN, au caractere pres",
    paliers.every(x => echelleVersements(x, 1) === x));
  check("un facteur absurde laisse le texte intact",
    echelleVersements("Compléter à 225 g", 0) === "Compléter à 225 g" &&
    echelleVersements("Compléter à 225 g", NaN) === "Compléter à 225 g");

  // LE garde-fou : une dose de cafe citee dans un texte ne doit jamais bouger.
  check("une dose de café dans le texte n'est pas multipliée",
    echelleVersements("Doser 14 g de café puis verser 225 g", 2) === "Doser 14 g de café puis verser 225 g".replace("225 g", "450 g"),
    echelleVersements("Doser 14 g de café puis verser 225 g", 2));
  check("le seuil laisse passer un bloom de 45 g",
    echelleVersements("Bloom 45 g", 2) === "Bloom 90 g", echelleVersements("Bloom 45 g", 2));
  check("le seuil est sous le plus petit versement et au dessus de la plus grosse dose",
    SEUIL_VERSEMENT_G < 45 && SEUIL_VERSEMENT_G >= 18, String(SEUIL_VERSEMENT_G));

  // Les grammes de LAIT restent sous le seuil, donc protégés.
  check("un ajout de lait de 20 g n'est pas multiplié",
    echelleVersements("Ajouter 20 g de lait", 2) === "Ajouter 20 g de lait");

  /* Cas reel trouve par ce test : deux recettes Brikka citent une DOSE dans leur
     texte, "Extraire exactement comme la Brikka classique : 14 g". C'est
     precisement ce que le seuil protege. On verifie que ces doses ne bougent pas
     meme au double, et que les versements d'eau, eux, suivent bien. */
  const tousPaliers = RECETTES_DEPART.flatMap(r => (r.etapes || []).map(e => e.texte));
  const avecDose = tousPaliers.filter(x => x.includes("14 g"));
  check("des paliers citent bien une dose de café, le cas que le seuil protège",
    avecDose.length > 0, String(avecDose.length));
  check("ces doses restent intactes même au double",
    avecDose.every(x => echelleVersements(x, 2) === x), avecDose[0]);

  const grammes = /([0-9]+(?:[.,][0-9]+)?)[ ]*g(?![a-z])/g;
  const avecEau = tousPaliers.filter(x =>
    [...x.matchAll(grammes)].some(m => Number(String(m[1]).replace(",", ".")) > SEUIL_VERSEMENT_G));
  check("les paliers d'eau, eux, changent tous au double",
    avecEau.length >= 8 && avecEau.every(x => echelleVersements(x, 2) !== x), String(avecEau.length));
}

/* Aucune estimation de volume sur la Brikka : la formule eau - 0,7 x dose
   annonçait 139 ml pour 150 g de chaudiere et 16 g de cafe, alors que la mesure
   reelle est de 90 a 115 ml. Un chiffre faux etait pire que pas de chiffre : il
   alimentait le ratio, le volume de boisson et le prereglage du lait. */
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("la formule Brikka a disparu de app.js", !app.includes("0.7 * dose"));
  check("volumeEstime rend la main tout de suite en Brikka",
    /function volumeEstime[\s\S]{0,220}methode === "Brikka"[\s\S]{0,20}return 0/.test(app));
  check("une seule formule de rendement subsiste, celle du Switch",
    (app.match(/2\.1 \* dose/g) || []).length === 1,
    String((app.match(/2\.1 \* dose/g) || []).length));
  check("le prereglage du lait lit le volume mesure, pas une estimation",
    app.includes("lait_sans_volume"));

  // La retention, elle, reste calculee : c'est une MESURE, pas une estimation.
  const c = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 95 });
  check("la retention se deduit des deux mesures", c.retention_ml === 55, String(c.retention_ml));
  check("sans volume mesure, pas de retention inventee",
    DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: "" }).retention_ml === "");
}

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
