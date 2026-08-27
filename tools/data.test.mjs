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
/* Pas de compte en dur : la liste des tables est ecrite DEUX fois, dans
   js/sync.js et worker/sync.js, et l'oublier a un endroit fait rater la synchro
   EN SILENCE. On compare donc les trois sources entre elles. */
const TABLES_ATTENDUES = ["achats", "cafes", "extractions", "recettes", "reglages", "tasses"];
check("tombes initialisees pour toutes les tables",
  Object.keys(DATA.state.tombes).sort().join() === TABLES_ATTENDUES.join(),
  Object.keys(DATA.state.tombes).sort().join());
{
  const lireTables = f => {
    const m = readFileSync(join(ROOT, f), "utf8").match(/TABLES = \[([^\]]*)\]/);
    return m ? m[1].split(",").map(x => x.trim().replace(/"/g, "")).sort() : [];
  };
  const cote = lireTables("js/sync.js");
  const serveur = lireTables("worker/sync.js");
  check("les deux listes TABLES sont identiques", cote.join() === serveur.join(),
    cote.join() + "  contre  " + serveur.join());
  check("et elles couvrent exactement les tables de l'etat",
    cote.join() === TABLES_ATTENDUES.join(), cote.join());
}

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
const ACHAT_ENTETE = "id,cafe_id,date_achat,format_grammes,prix_vnd,date_torrefaction,date_ouverture";
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
const DIAGS_PILULES = DIAGNOSTICS_GROUPES.flatMap(g => g.diags);
check("la liste a plat commence par les pilules, dans l'ordre des groupes",
  DIAGNOSTICS.slice(0, DIAGS_PILULES.length).join("|") === DIAGS_PILULES.join("|"));

/* "Acide ET amer" n'a plus de pilule : le site le DEDUIT quand les deux familles
   sont cochees, au lieu de demander a Chris de conclure a sa place. Le libelle
   reste dans DIAGNOSTICS parce qu'il est dans son historique du 11 aout et doit
   rester traduisible, filtrable et affichable. */
const DERIVE = "Acide ET amer (extraction inégale)";
check("le diagnostic deduit n'est plus propose en pilule", !DIAGS_PILULES.includes(DERIVE));
check("mais il reste connu du systeme", DIAGNOSTICS.includes(DERIVE));
check("aucun groupe ne se retrouve vide", DIAGNOSTICS_GROUPES.every(g => g.diags.length > 0),
  DIAGNOSTICS_GROUPES.filter(g => !g.diags.length).map(g => g.nom).join(", "));
check("il garde sa correction, c'est elle qui s'affiche a la deduction",
  !!DIAGNOSTIC_CORRECTIONS[DERIVE]);

// La deduction doit s'appuyer sur des listes qui existent vraiment dans app.js.
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("app.js deduit au lieu d'avertir", app.includes("const inegale = DIAGS_SOUS_EXTRAIT"));
  check("l'ancien message qui demandait de cocher a disparu",
    !app.includes("diag_contradiction"));
}
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

/* Le ratio principal est EAU sur DOSE sur les DEUX machines : c'est la
   convention universelle du cafe, la seule comparable a une recette ou a un autre
   buveur. Le ratio en tasse dependait du volume extrait, rempli sur 1 extraction
   sur 29 : il ne s'affichait presque jamais et donnait un nombre incomparable au
   reste. Il reste, en second, quand il est mesure. */
{
  const brikka = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90 });
  check("Brikka : le ratio principal est eau sur dose", brikka.ratioTexte === "1:9.4", brikka.ratioTexte);
  check("Brikka : sa base est nommee chaudiere", brikka.ratioBase === "chaudiere", brikka.ratioBase);
  check("le volume mesure donne un ratio en tasse SECONDAIRE",
    brikka.ratioTasseTexte === "1:5.6", brikka.ratioTasseTexte);

  const sansVolume = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: "" });
  check("sans volume, le ratio principal ne change pas", sansVolume.ratioTexte === "1:9.4", sansVolume.ratioTexte);
  check("sans volume, aucun ratio en tasse invente", sansVolume.ratioTasseTexte === "", sansVolume.ratioTasseTexte);

  const sw = DATA.calculs({ methode: "Switch", dose_g: 15, eau_g: 225, volume_extrait_ml: 190 });
  check("Switch : meme convention, eau sur dose", sw.ratioTexte === "1:15.0", sw.ratioTexte);
  check("Switch : sa base est nommee infusion", sw.ratioBase === "infusion", sw.ratioBase);

  const allonge = DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90, eau_ajoutee_ml: 40 });
  check("allonger a l'eau ne touche pas au ratio d'extraction", allonge.ratioTexte === "1:9.4", allonge.ratioTexte);
  check("allonger a l'eau donne un ratio boisson en plus", allonge.ratioBoisson === "1:8.1", allonge.ratioBoisson);
  check("sans allongement, pas de ratio boisson",
    DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: 150, volume_extrait_ml: 90 }).ratioBoisson === "");

  // Sans eau, plus rien : le ratio ne doit pas se rabattre sur le volume.
  check("sans eau saisie, pas de ratio principal",
    DATA.calculs({ methode: "Brikka", dose_g: 16, eau_g: "", volume_extrait_ml: 90 }).ratioTexte === "");
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

/* VERSION DE SCHEMA. Les rattrapages de valeurs semees dependaient de drapeaux
   dans localStorage, donc PAR APPAREIL, alors que les donnees sont PARTAGEES : un
   appareil au stockage vide posait ses drapeaux sur rien puis recevait un
   document non migre. Le numero vit maintenant DANS la ligne reglages, donc il
   voyage avec les donnees qu'il decrit. */
{
  // Une installation d'avant : valeurs semees d'autrefois, aucune version.
  const avant = () => {
    DATA.state.reglages = [];
    DATA.state.recettes = [
      { id: "b1", nom: "Brikka classique", methode: "Brikka", famille: "", eau: 100, temp: 93,
        puissance_feu: 4, dial: "1.2.0", etapes: [], maj_le: 0 },
      { id: "b2", nom: "Brikka flat white", methode: "Brikka", famille: "", eau: 100, temp: 93,
        puissance_feu: 3, dial: "1.2.0", etapes: [], maj_le: 0 },
      // Reglage choisi VOLONTAIREMENT apres coup : ne doit pas etre ecrase.
      { id: "b3", nom: "Brikka perso", methode: "Brikka", famille: "", eau: 170, temp: "",
        puissance_feu: 6, dial: "1.5.0", etapes: [], maj_le: 0 },
      { id: "s1", nom: "Chronicler", methode: "Switch", famille: "chronicler", eau: 225, temp: 92,
        puissance_feu: "", dial: "1.6.0", maj_le: 0,
        etapes: [{ t: 0, texte: "Verser jusqu'à 112 g." }, { t: 45, texte: "Compléter à 225 g." }],
        note: "compléter à 225 g veut dire que la balance affiche 225" },
    ];
  };
  const par = id => DATA.state.recettes.find(r => r.id === id);

  avant();
  check("un document sans version part de zero", Number(DATA.reglagesCourants().schema_version) === 0);
  DATA.migrerDonnees();

  check("la chaudiere Brikka passe de 100 a 150 g", par("b1").eau === 150 && par("b2").eau === 150,
    par("b1").eau + " / " + par("b2").eau);
  check("la temperature cible Brikka disparait", par("b1").temp === "" && par("b2").temp === "",
    JSON.stringify([par("b1").temp, par("b2").temp]));
  check("le feu seme a 4 finit a 2", par("b1").puissance_feu === 2, par("b1").puissance_feu);
  check("le feu seme a 3 passe par 4 puis finit a 2", par("b2").puissance_feu === 2, par("b2").puissance_feu);
  check("la molette unique s'applique aussi au Switch", par("s1").dial === "1.5.0", par("s1").dial);
  check("la Chronicler passe a 240 g", par("s1").eau === 240, par("s1").eau);
  check("ses paliers suivent",
    par("s1").etapes.map(e => e.texte).join(" ").includes("120 g") &&
    par("s1").etapes.map(e => e.texte).join(" ").includes("240 g"),
    par("s1").etapes.map(e => e.texte).join(" | "));
  check("une recette reglee a la main n'est pas touchee",
    par("b3").eau === 170 && par("b3").puissance_feu === 6,
    par("b3").eau + " / " + par("b3").puissance_feu);
  check("les recettes touchees sont estampillees pour la synchro", par("b1").maj_le > 0);

  // La version est ecrite, et elle voyage avec les donnees.
  const v = Number(DATA.reglagesCourants().schema_version);
  check("la version de schema est ecrite apres coup", v > 0, String(v));
  check("elle est estampillee comme le reste", DATA.state.reglages[0].maj_le > 0);

  /* Rejouer ne doit RIEN faire : sinon un reglage remis a la main retomberait a
     la valeur migree au prochain chargement. */
  par("b1").puissance_feu = 4;
  par("b1").eau = 100;
  DATA.migrerDonnees();
  check("les pas ne se rejouent pas une fois la version atteinte",
    par("b1").puissance_feu === 4 && par("b1").eau === 100,
    par("b1").puissance_feu + " / " + par("b1").eau);

  /* LE cas qui cassait avant : un appareil neuf, stockage vide, qui recoit un
     document DEJA migre. Il ne doit rien rejouer, meme sans aucun drapeau local. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: v })];
  DATA.migrerDonnees();
  check("un document deja migre n'est jamais retouche",
    par("b1").eau === 100 && par("b1").puissance_feu === 4,
    par("b1").eau + " / " + par("b1").puissance_feu);

  // Et l'inverse : un appareil neuf qui recoit un document EN RETARD le rattrape.
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 3 })];
  DATA.migrerDonnees();
  check("un document en retard est rattrape par n'importe quel appareil",
    par("b1").eau === 150 && par("s1").dial === "1.5.0",
    par("b1").eau + " / " + par("s1").dial);
  check("mais seulement les pas manquants : le feu de b1 avait deja ete traite",
    par("b1").puissance_feu === 4, par("b1").puissance_feu);

  // Plus aucun drapeau par appareil dans la couche de donnees.
  const data = readFileSync(join(ROOT, "js/data.js"), "utf8");
  const bloc = data.slice(data.indexOf("const PAS_DE_SCHEMA"), data.indexOf("function migrerDonnees"));
  check("les pas ne dependent plus du stockage local", !bloc.includes("localStorage"));
  check("les numeros de pas se suivent sans trou",
    [...bloc.matchAll(/\{ v: (\d+)/g)].map(m => Number(m[1])).join() === "1,2,3,4,5,6",
    [...bloc.matchAll(/\{ v: (\d+)/g)].map(m => Number(m[1])).join());
}

/* Le service worker doit precacher TOUS les scripts charges par index.html.
   sync.js et reglages.js manquaient : hors ligne, SYNC et REGLAGES n'existaient
   pas et app.js cassait au demarrage. Une liste ecrite a la main diverge
   forcement, donc on la compare a la source. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const balises = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)];
  const scripts = balises.map(m => m[1]);
  check("tous les scripts sont differes, le HTML ne les attend plus",
    balises.every(m => m[0].includes(" defer")),
    balises.filter(m => !m[0].includes(" defer")).map(m => m[1]).join(", "));
  check("aucun n'est en async : defer preserve l'ordre, async non",
    balises.every(m => !m[0].includes(" async")),
    balises.filter(m => m[0].includes(" async")).map(m => m[1]).join(", "));
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
  /* La Chronicler porte 240 g depuis le 24 août : le document source de Chris
     dit "15 g / 240 g, ratio 1:16", la transcription d'origine l'avait rétrécie
     à 225. Les paliers suivent, 120 g puis 240 g. */
  const cc = RECETTES_DEPART.find(r => r.nom === "The Coffee Chronicler's Recipe");
  check("la recette Chronicler existe et porte 240 g", cc && Number(cc.eau) === 240,
    cc && String(cc.eau));
  check("son ratio annonce bien 1:16", (cc.ratioTexte || "").includes("1:16"), cc.ratioTexte);
  check("sa variante Sweet porte la meme eau",
    RECETTES_DEPART.filter(r => r.famille === "chronicler").every(r => Number(r.eau) === 240));

  const paliers = cc.etapes.map(e => e.texte);
  check("ses paliers citent 120 g puis 240 g",
    paliers[0].includes("120 g") && paliers[1].includes("240 g"), paliers.join(" | "));

  // Mise a l'echelle : verser 300 au lieu de 240 est un facteur de 1,25.
  const a300 = paliers.map(x => echelleVersements(x, 300 / 240));
  check("a 300 g, 120 g devient 150 g", a300[0].includes("150 g"), a300[0]);
  check("a 300 g, 240 g devient 300 g", a300[1].includes("300 g"), a300[1]);
  check("le palier sans gramme est intact", a300[2] === paliers[2], a300[2]);

  const double = paliers.map(x => echelleVersements(x, 2));
  check("au double, 120 g devient 240 g", double[0].includes("240 g"), double[0]);
  check("au double, 240 g devient 480 g", double[1].includes("480 g"), double[1]);

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

/* Le champ mouture avait un fond "1.5.0" ecrit en dur, qui promettait une valeur
   par defaut alors que le champ est prerempli. Meme faute que le "93" de la
   temperature en v7.33. Le reglage du broyeur se regle dans Parametres. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const champ = (html.match(/<input[^>]*id="f-mouture"[^>]*>/) || [""])[0];
  check("le champ mouture n'a plus de fond trompeur", !champ.includes("placeholder"), champ);
  check("Parametres porte le reglage du broyeur", html.includes('id="param-molette"'));

  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("le prefill lit le reglage du broyeur, pas le dial de la recette",
    app.includes('$("#f-mouture").value = cafeCourantMoulu() ? "" : replis.molette;'));
  check("le reglage d'usine est le compromis des deux machines",
    app.includes('MOLETTE_REPLI_USINE = "1.5.0"'));
}

/* Le bouton Saisie de la navigation continuait une MODIFICATION en cours :
   Chris ouvrait une extraction depuis l'historique, allait ailleurs, revenait
   par l'onglet, et le formulaire ecrasait l'extraction passee en croyant creer
   une tasse. Perte de donnees silencieuse. */
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("arriver sur Saisie par la navigation abandonne l'edition",
    app.includes('if (nom === "saisie" && saisie.editId && !ouvertureEdition)'));
  check("l'abandon est annonce, il n'est pas silencieux",
    app.includes('t_edition_abandonnee'));
  check("le drapeau protege l'ouverture legitime d'une edition",
    app.includes("ouvertureEdition = true") && app.includes("ouvertureEdition = false"));

  /* Les appels a activerEcran qui SUIVAIENT chargerExtractionDansSaisie sont
     partis : la fonction ouvre deja l'ecran, et le rappel reinitialisait
     desormais l'edition qu'on venait d'ouvrir. */
  check("plus aucun activerEcran redondant apres un chargement d'extraction",
    !/chargerExtractionDansSaisie\([^)]*\);\s*\n\s*activerEcran\("saisie"\)/.test(app));

  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("le message d'abandon existe en FR et EN",
    /t_edition_abandonnee:.*fr:.*en:/.test(i18n));
}

/* Molette unique : Chris ne recompte pas les crans a chaque machine. */
{
  const dials = [...new Set(RECETTES_DEPART.map(r => r.dial))];
  check("toutes les recettes semees portent 1.5.0",
    dials.length === 1 && dials[0] === "1.5.0", dials.join(", "));

  // Changer la graine ne suffit jamais : les recettes STOCKEES doivent suivre.
  const data = readFileSync(join(ROOT, "js/data.js"), "utf8");
  check("un pas de schema rattrape la molette des recettes stockees",
    data.includes("molette unique a 1.5.0"));
  check("elle ne se limite pas a la Brikka, les Switch aussi sont concernees",
    /molette unique a 1\.5\.0[\s\S]{0,300}state\.recettes\.forEach/.test(data));
}

/* Tout ecran a largeur bornee doit etre CENTRE dans main, qui fait 1180 px.
   L'ecran Parametres avait max-width sans margin auto : il se collait a gauche
   et la page paraissait de travers. Regle generale, pas correction ponctuelle. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const bornes = [...css.matchAll(/#ecran-([a-z]+) \{([^}]*max-width[^}]*)\}/g)];
  check("au moins un ecran borne existe", bornes.length > 0, String(bornes.length));
  const decentres = bornes.filter(m => !/margin:\s*0\s+auto/.test(m[2])).map(m => m[1]);
  check("tout ecran a largeur bornee est centre", decentres.length === 0, decentres.join(", "));
}

/* Ecran Guide : le moulin se manipule au curseur et le reglage s'applique en un
   bouton. Le curseur est en CRANS, l'unite reelle du moulin. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sl = (html.match(/<input[^>]*id="conv-slider"[^>]*>/) || [""])[0];
  check("le curseur du moulin existe", sl.length > 0);
  check("il couvre toute la course du moulin, 0 a 150 crans",
    sl.includes('min="0"') && sl.includes('max="150"'), sl);
  check("son pas vaut UN cran, pas un arrondi", sl.includes('step="1"'), sl);
  const grind = readFileSync(join(ROOT, "js/grind.js"), "utf8");
  check("la butee du curseur est celle du moulin", grind.includes("CRANS_MAX = 150"));
  check("le bouton d'application existe", html.includes('id="conv-appliquer"'));
  check("la zone de conseil existe", html.includes('id="conv-conseil"'));

  /* Le zero decale du moulin de Chris doit etre ecrit sur la page : il fausse
     toute l'echelle en microns de 2 crans, et rien d'autre ne le dit. */
  check("le decalage du zero est documente", html.includes("encadre-zero"));
  check("il donne le chiffre, pas juste une mise en garde",
    html.includes("2 crans après le 0 du cadran"));

  // Recettes : descendues sous les Regles, un onglet leur est deja consacre.
  const ordre = [...html.matchAll(/id="(ref-[a-z]+)"/g)].map(m => m[1]);
  const rang = k => ordre.indexOf(k);
  check("le moulin passe avant les recettes", rang("ref-moulin") < rang("ref-recettes"),
    ordre.join(" > "));
  check("le sommaire suit le meme ordre que la page",
    ordre.filter(k => k !== "ref-recettes").join(",") ===
    ["ref-moulin", "ref-diagnostic", "ref-regles", "ref-vocabulaire"].join(","),
    ordre.join(","));
}

/* Coherence de la page Guide avec les donnees reelles : elle affirmait des
   comptages et des moutures qui ne correspondaient plus aux recettes. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const nbBrikka = RECETTES_DEPART.filter(r => r.methode === "Brikka").length;
  const nbSwitch = RECETTES_DEPART.filter(r => r.methode === "Switch").length;
  check("le guide annonce le bon nombre de recettes",
    html.includes("Quatre recettes Brikka et six recettes Switch") && nbBrikka === 4 && nbSwitch === 6,
    nbBrikka + " Brikka, " + nbSwitch + " Switch");
  check("le vieux recapitulatif de mouture par recette a disparu",
    !html.includes("Récapitulatif mouture des recettes Switch"));
  check("les reperes de reference ne parlent plus de numeros de recette",
    !html.includes("Switch recettes 1 et 2") && !html.includes("Switch recettes 5 et 6"));
}

/* Les recettes STOCKEES ne suivent jamais la graine toutes seules : sans
   migration, Chris aurait continue a lire 225 g sur son site. */
{
  const data = readFileSync(join(ROOT, "js/data.js"), "utf8");
  check("un pas de schema rattrape les Chronicler stockees",
    data.includes("Chronicler a 240 g"));
  check("elle ne vise que la famille concernee et la mauvaise valeur",
    /Chronicler a 240 g[\s\S]{0,300}famille !== "chronicler"[\s\S]{0,80}225/.test(data));
}

/* Le trou de temperature entre 85 et 97 : les recettes visent 92 a 95, il n'y
   avait aucun palier pour les atteindre. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const debut = html.indexOf('<select id="f-temp-preset"');
  const sel = html.slice(debut, html.indexOf("</select>", debut));
  const temps = [...sel.matchAll(/<option value="([0-9]+)"/g)].map(m => Number(m[1])).sort((a, b) => a - b);
  check("les paliers couvrent la zone des recettes Switch, 92 a 95",
    temps.some(t => t >= 90 && t <= 96), temps.join(", "));
  // Aucun ecart de plus de 6 degres entre deux paliers consecutifs au dessus de 80.
  const hauts = temps.filter(t => t >= 80);
  const trous = hauts.slice(1).map((t, i) => t - hauts[i]).filter(e => e > 6);
  check("aucun trou de plus de 6 degres dans la liste", trous.length === 0,
    hauts.join(", ") + " -> trous de " + trous.join(", "));
}

/* Un etat selectionne ne doit changer QUE des couleurs. Toute propriete qui
   touche a la largeur du texte reorganise la ligne au clic : cocher un
   descripteur envoyait le groupe suivant a la ligne, sous les doigts. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const metriques = /font-weight|font-size|letter-spacing|padding|border-width/;
  const fautives = [];
  const re = /([^{}]*\.actif[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (metriques.test(m[2])) fautives.push(m[1].trim());
  }
  check("aucun etat selectionne ne change la largeur du texte",
    fautives.length === 0, fautives.join(" | "));

  // Le fond et la couleur doivent bien rester, sinon la selection ne se voit plus.
  const tagActif = (css.match(/\.tag\.actif \{([^}]*)\}/) || ["", ""])[1];
  check("la selection reste visible par le fond et la couleur",
    tagActif.includes("background") && tagActif.includes("color"), tagActif.trim());
}

/* La note est facultative : Chris enregistre en sortant la tasse et revient
   noter apres l'avoir bue. Une note vide doit rester vide de bout en bout, et
   surtout ne jamais devenir 0, qui serait la pire des notes. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("la case pas encore notee existe et est cochee par defaut",
    /<input[^>]*id="f-note-vide"[^>]*checked/.test(html));
  check("le curseur ne suggere plus 7",
    /<input[^>]*id="f-note"[^>]*value="5"/.test(html));

  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("l'enregistrement lit noteSaisie et plus le curseur brut",
    app.includes("note_sur_10: noteSaisie()"));
  check("poser le doigt sur le curseur compte, meme sans mouvement",
    app.includes("pointerdown"));

  // Le point qui compte vraiment : "" ne doit pas se transformer en 0.
  const csv = DATA.csvSerialiser([{ id: "e1", note_sur_10: "" }], DATA.EXT_COLS);
  const ligne = csv.split("\n")[1];
  const iNote = DATA.EXT_COLS.indexOf("note_sur_10");
  check("une note vide reste vide dans le CSV", ligne.split(",")[iNote] === "",
    JSON.stringify(ligne.split(",")[iNote]));
}

/* Les reglages du MATERIEL (dose de repli, puissance de feu, molette du broyeur)
   se synchronisent, parce qu'ils decrivent le moulin et la cafetiere de Chris et
   pas l'appareil qu'il tient. Ils vivaient en localStorage, donc son telephone
   ignorait ce qu'il reglait sur l'ordinateur. */
{
  check("les reglages sont une table synchronisee", Array.isArray(DATA.state.reglages));

  const parDefaut = DATA.normaliserReglages({});
  check("valeurs d'usine : 15 g, feu 2, molette 1.5.0",
    parDefaut.dose_g === 15 && parDefaut.puissance_feu === 2 && parDefaut.mouture_dial === "1.5.0",
    JSON.stringify(parDefaut));
  check("une seule ligne, d'id fixe", parDefaut.id === DATA.REGLAGE_ID);

  // Ce qui arrive du reseau n'est pas digne de confiance : on borne tout.
  const absurde = DATA.normaliserReglages({ dose_g: -5, puissance_feu: 99, mouture_dial: "nawak" });
  check("une dose negative retombe sur la valeur d'usine", absurde.dose_g === 15, String(absurde.dose_g));
  check("un feu hors echelle retombe sur la valeur d'usine", absurde.puissance_feu === 2);
  check("une molette invalide retombe sur la valeur d'usine", absurde.mouture_dial === "1.5.0");
  const bon = DATA.normaliserReglages({ dose_g: 16, puissance_feu: 3, mouture_dial: "1.2.0" });
  check("des valeurs valides passent telles quelles",
    bon.dose_g === 16 && bon.puissance_feu === 3 && bon.mouture_dial === "1.2.0", JSON.stringify(bon));

  // maj_le preserve, jamais restampe a la lecture : meme regle que partout.
  check("maj_le est preserve tel quel", DATA.normaliserReglages({ maj_le: 1234 }).maj_le === 1234);

  // Et surtout : maj_le ne doit pas fuir dans le CSV.
  const csv = DATA.csvSerialiser([{ id: "moi", maj_le: 1699999999999, dose_g: 16 }], DATA.REGLAGE_COLS);
  check("entete reglages.csv", csv.split("\n")[0] === "id,dose_g,puissance_feu,mouture_dial,schema_version",
    csv.split("\n")[0]);
  check("maj_le absent du CSV reglages", !csv.includes("1699999999999"));
}

/* JOURS DEPUIS L'OUVERTURE DU PAQUET. La date de torrefaction ne servait a rien :
   aucun des cinq cafes de Chris ne la porte et il n'en aura pas. Le jour
   d'ouverture, lui, il le connait toujours, et c'est ce qui fait le plus bouger
   ses tasses entre J+1 et J+21. */
{
  DATA.state.cafes = [{ id: "c1", nom: "Test", actif: 1 }];
  DATA.state.achats = [
    { id: "a1", cafe_id: "c1", date_achat: "2026-08-01", date_ouverture: "2026-08-03", format_grammes: 250 },
    { id: "a2", cafe_id: "c1", date_achat: "2026-08-20", date_ouverture: "2026-08-25", format_grammes: 250 },
  ];

  const jours = (date) => DATA.calculs({ cafe_id: "c1", date_heure: date }).jours_ouvert;
  check("le jour de l'ouverture compte zero", jours("2026-08-03T09:00") === 0, String(jours("2026-08-03T09:00")));
  check("une semaine plus tard, sept jours", jours("2026-08-10T09:00") === 7, String(jours("2026-08-10T09:00")));

  /* Le sachet retenu est celui EN VIGUEUR ce jour la, pas le dernier achete.
     Sinon une tasse du 10 aout serait rattachee au sachet du 20 et afficherait un
     age negatif. */
  check("une tasse d avant le rachat suit l ancien sachet",
    jours("2026-08-15T09:00") === 12, String(jours("2026-08-15T09:00")));
  check("une tasse d'apres le rachat suit le nouveau",
    jours("2026-08-27T09:00") === 2, String(jours("2026-08-27T09:00")));

  // Sans date d'ouverture, on ne raconte rien plutot que d'afficher un zero faux.
  DATA.state.achats = [{ id: "a1", cafe_id: "c1", date_achat: "2026-08-01", date_ouverture: "", format_grammes: 250 }];
  check("sachet pas encore ouvert : aucun age", jours("2026-08-10T09:00") === "",
    JSON.stringify(jours("2026-08-10T09:00")));
  check("cafe sans sachet du tout : aucun age",
    DATA.calculs({ cafe_id: "inconnu", date_heure: "2026-08-10T09:00" }).jours_ouvert === "");

  // La colonne existe dans le CSV, et maj_le n'y entre toujours pas.
  check("date_ouverture est une colonne d'achats", DATA.ACHAT_COLS.includes("date_ouverture"));
  const csv = DATA.csvSerialiser([{ id: "a1", maj_le: 1699999999999, date_ouverture: "2026-08-03" }], DATA.ACHAT_COLS);
  check("la date d'ouverture sort dans le CSV", csv.includes("2026-08-03"));
  check("maj_le n'entre toujours pas dans le CSV", !csv.includes("1699999999999"));

  // L'ancienne regle de fraicheur a disparu, la nouvelle l'a remplacee.
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("la regle de fraicheur par torrefaction a disparu", !app.includes("insightFraicheur"));
  check("la regle d'age du paquet la remplace", app.includes("insightAgePaquet"));
  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("ses cles mortes sont parties avec elle", !i18n.includes("ins_frais_tot"));
}

/* COURBE DE TENDANCE. Les notes brutes sautent trop pour se lire : 8 puis 4 puis
   7,5 d'un jour a l'autre. La moyenne glissante raconte l'histoire reelle. */
{
  const tasse = (jour, note) => ({ id: "t" + jour, date_heure: "2026-08-" + jour + "T12:00", note_sur_10: note });
  const jeu = [tasse("01", 8), tasse("02", 8), tasse("03", 8), tasse("04", 8), tasse("05", 8),
              tasse("06", 3), tasse("07", 3), tasse("08", 3), tasse("09", 3), tasse("10", 3)];
  const g = REGLAGES.moyenneGlissante(jeu, 5);

  check("une valeur par tasse notee", g.length === 10, String(g.length));
  /* Les quatre premieres sont vides : afficher une moyenne de deux tasses comme
     si c'en etait une de cinq mentirait sur sa solidite. */
  check("la fenetre ne demarre qu'une fois pleine",
    g.slice(0, 4).every(x => x.valeur === null) && g[4].valeur === 8,
    JSON.stringify(g.slice(0, 5).map(x => x.valeur)));
  check("elle descend progressivement, sans sauter",
    g.slice(4).map(x => x.valeur).join() === "8,7,6,5,4,3",
    g.slice(4).map(x => x.valeur).join());

  // Les tasses NON NOTEES ne comptent pas, elles ne doivent pas creuser la courbe.
  const avecTrous = jeu.concat([{ id: "x", date_heure: "2026-08-11T12:00", note_sur_10: "" }]);
  check("une tasse sans note est ignoree", REGLAGES.moyenneGlissante(avecTrous, 5).length === 10);

  // L'ordre d'entree ne doit rien changer : on trie par date.
  const melange = [jeu[9], jeu[0], jeu[5], jeu[2], jeu[7], jeu[1], jeu[8], jeu[3], jeu[6], jeu[4]];
  check("le desordre d'entree ne change rien",
    REGLAGES.moyenneGlissante(melange, 5).map(x => x.valeur).join() === g.map(x => x.valeur).join());

  // Moins de tasses que la fenetre : que des vides, jamais une moyenne partielle.
  check("trois tasses pour une fenetre de cinq ne donnent aucune valeur",
    REGLAGES.moyenneGlissante(jeu.slice(0, 3), 5).every(x => x.valeur === null));
  check("aucune tasse, aucun point", REGLAGES.moyenneGlissante([], 5).length === 0);
}

/* LE LEVIER QUI COMPTE, PAR CAFE ET PAR MACHINE. Comparer des groupes sur tout
   l'historique melange un Sang Tao en Brikka et un Liberica en Switch : la
   moyenne obtenue ne decrit aucune tasse reelle. */
{
  const t = (cafe, methode, feu, note) => ({
    id: cafe + methode + feu + note + Math.round(note * 10),
    cafe_id: cafe, methode, puissance_feu: feu, note_sur_10: note,
    date_heure: "2026-08-01T12:00", recette: "R", dose_g: 15,
  });
  const cafes = [{ id: "c1", nom: "Cafe un" }, { id: "c2", nom: "Cafe deux" }];

  // Un lot franc : feu 3 nettement au dessus de feu 2, sur le meme cafe.
  const net = [
    t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8),
    t("c1", "Brikka", 2, 5), t("c1", "Brikka", 2, 5), t("c1", "Brikka", 2, 5),
  ];
  const r = REGLAGES.constatsParCafe(cafes, net, { minLot: 6, minParGroupe: 3, minEcart: 0.4 });
  check("un ecart franc est rapporte", r.length === 1, String(r.length));
  check("le bon levier est designe", r[0] && r[0].levier === "feu", r[0] && r[0].levier);
  check("la bonne valeur gagne", r[0] && r[0].valeur === "3", r[0] && r[0].valeur);
  check("les deux moyennes sont justes", r[0] && r[0].haut === 8 && r[0].bas === 5,
    r[0] && r[0].haut + " / " + r[0].bas);
  check("le cafe et la machine sont nommes",
    r[0] && r[0].cafe.nom === "Cafe un" && r[0].methode === "Brikka");

  /* LE POINT CENTRAL : les memes tasses reparties sur DEUX cafes ne doivent plus
     rien conclure. C'est exactement le piege des regles globales. */
  const melange = [
    t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8),
    t("c2", "Brikka", 2, 5), t("c2", "Brikka", 2, 5), t("c2", "Brikka", 2, 5),
  ];
  check("deux cafes differents ne se comparent pas entre eux",
    REGLAGES.constatsParCafe(cafes, melange, { minLot: 6, minParGroupe: 3, minEcart: 0.4 }).length === 0);

  // Meme cafe, machines differentes : on ne melange pas non plus.
  const deuxMachines = net.map((e, i) => i < 3 ? e : { ...e, methode: "Switch" });
  check("deux machines ne se comparent pas entre elles",
    REGLAGES.constatsParCafe(cafes, deuxMachines, { minLot: 6, minParGroupe: 3, minEcart: 0.4 }).length === 0);

  // Les garde-fous : sous le seuil d'ecart, on se tait.
  const faible = net.map(e => e.puissance_feu === 2 ? { ...e, note_sur_10: 7.8 } : e);
  check("un ecart de 0,2 point ne dit rien",
    REGLAGES.constatsParCafe(cafes, faible, { minLot: 6, minParGroupe: 3, minEcart: 0.4 }).length === 0);
  // Et sous le seuil d'effectif aussi.
  check("deux tasses par groupe ne suffisent pas",
    REGLAGES.meilleurLevier(net.slice(0, 2).concat(net.slice(3, 5)), 3, 0.4) === null);
  // Un levier qui n'a jamais varie ne peut rien expliquer.
  const constant = net.map(e => ({ ...e, puissance_feu: 3 }));
  check("un levier constant ne conclut rien", REGLAGES.meilleurLevier(constant, 3, 0.4) === null);

  // Les tasses non notees ne comptent pas.
  check("les tasses sans note sont ignorees",
    REGLAGES.constatsParCafe(cafes, net.concat([{ id: "z", cafe_id: "c1", methode: "Brikka", note_sur_10: "" }]),
      { minLot: 6, minParGroupe: 3, minEcart: 0.4 })[0].total === 6);
}

/* COUT PAR TASSE sur la fiche cafe. Tout etait calculable depuis la table des
   achats, rien n'etait affiche. Le prix au sachet depend du format et le prix au
   gramme ne dit rien tant qu'on ignore la dose : le cout d'UNE tasse est le seul
   chiffre qui se compare d'un sachet a l'autre. */
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("la fiche cafe porte un cout par tasse", app.includes("function coutParTasse"));
  check("il utilise la dose moyenne du cafe, pas la dose de repli",
    app.includes("coutTasse = doseTypique"));

  /* Le second chiffre, pour les cafes NON PURS : le Sang Tao est a 82 % de cafe,
     donc bien plus cher au gramme de VRAI cafe qu'il n'en a l'air. Le champ
     pourcentage_cafe_reel ne servait qu'au calcul de cafeine. */
  check("le cafe non pur montre son cout reel", app.includes("cout_reel"));
  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("les deux libelles existent en FR et EN",
    /cout_tasse:.*fr:.*en:/.test(i18n) && /cout_reel:.*fr:.*en:/.test(i18n));

  // L'arithmetique, sur les vrais chiffres du Sang Tao : 149 000 d les 340 g.
  const parGramme = 149000 / 340;
  check("une tasse de 14 g coute environ 6 135 d", Math.round(parGramme * 14) === 6135,
    String(Math.round(parGramme * 14)));
  check("la meme en cafe reel a 82 % en coute 7 482",
    Math.round(parGramme / 0.82 * 14) === 7482, String(Math.round(parGramme / 0.82 * 14)));
}

/* SUPPRESSION AVEC RETOUR ARRIERE. Contrainte posee par Chris : si la page se
   ferme pendant les cinq secondes, la suppression doit QUAND MEME avoir lieu.
   Ca exclut la solution naive qui serait de retarder la suppression. On supprime
   donc tout de suite, pour de vrai, et on garde une copie en memoire. */
{
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  const bloc = app.slice(app.indexOf("async function supprimerExtractionAvecRetour"),
    app.indexOf("async function supprimerExtractionAvecRetour") + 700);

  /* LE point : la suppression precede le message, elle n'est pas retardee.
     Si un setTimeout entourait la suppression, fermer l'onglet l'annulerait. */
  check("la suppression est faite AVANT d'afficher le retour arriere",
    bloc.indexOf("supprimerExtraction(") < bloc.indexOf("toastAction("),
    String(bloc.indexOf("supprimerExtraction(")) + " contre " + String(bloc.indexOf("toastAction(")));
  check("aucun delai n'entoure la suppression elle meme", !bloc.includes("setTimeout"));

  check("le confirm natif de suppression a disparu", !app.includes('confirm(I18N.t("c_suppr"))'));
  check("le retour arriere restaure sous l'id d'origine", app.includes("DATA.restaurerExtraction"));

  const data = readFileSync(join(ROOT, "js/data.js"), "utf8");
  const rest = data.slice(data.indexOf("async function restaurerExtraction"),
    data.indexOf("async function ajouterExtraction"));
  /* L'id d'origine compte : les liens d'edition, la selection du comparateur et
     les references de l'historique pointent dessus. */
  check("restaurerExtraction garde l'id", rest.includes("e.id = ext.id"));
  check("elle estampille, donc elle bat la pierre tombale", rest.includes("estampiller("));
  check("elle remplace la ligne si elle est deja la, sinon elle l'ajoute",
    rest.includes("findIndex") && rest.includes("push(e)"));

  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("le bouton Annuler existe en FR et EN", /t_annuler:.*fr:.*en:/.test(i18n));
  check("le message de retablissement aussi", /t_restauree:.*fr:.*en:/.test(i18n));
}

/* ACCESSIBILITE DES BASCULES. 70 boutons et zero aria-pressed : l'etat se voyait
   au fond colore mais rien ne l'ANNONCAIT. Un lecteur d'ecran lisait "bouton
   chocolat noir" sans jamais dire s'il etait coche. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");

  // Le choix de machine, dans le HTML statique.
  const methodes = [...html.matchAll(/<button[^>]*class="btn-methode[^"]*"[^>]*>/g)].map(m => m[0]);
  check("les deux boutons de machine existent", methodes.length === 2, String(methodes.length));
  check("et ils annoncent leur etat", methodes.every(m => m.includes("aria-pressed")),
    methodes.join(" | "));

  // Les pilules et tags, generes en JS.
  check("les pilules de diagnostic naissent avec un etat annonce",
    /class="pilule" aria-pressed=/.test(app));
  check("les descripteurs aussi", /class="tag" aria-pressed=/.test(app));

  /* Le point qui compte sur la duree : classe et attribut basculent d'un SEUL
     geste. Les separer serait la garantie qu'ils divergent un jour. */
  check("un helper unique bascule le visuel et l'annonce",
    app.includes("function basculerEtat") &&
    /function basculerEtat[\s\S]{0,220}classList\.toggle[\s\S]{0,120}aria-pressed/.test(app));
  const restes = [...app.matchAll(/classList\.toggle\("actif"/g)].length;
  /* Il en reste pour les elements qui ne sont PAS des bascules : lignes de
     comparaison, boutons de ligne, onglets de navigation. */
  check("les bascules passent toutes par le helper", restes <= 4, String(restes));

  // La navigation s'annonce comme page courante, pas comme bascule.
  check("l'ecran courant utilise aria-current", app.includes('aria-current", "page"'));

  /* Les bulles au survol etaient inatteignables au doigt : sur telephone le
     survol n'existe pas et un tap ne declenche pas :focus-visible. */
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  check("les bulles s'ouvrent aussi sans survol", css.includes(".info-ouverte::after"));
  check("un appui long les declenche", app.includes("APPUI_LONG_MS"));
  /* Attache UNE FOIS : les conteneurs survivent aux reconstructions de pilules,
     l'attacher depuis construirePilules empilerait un jeu d'ecouteurs par
     bascule de langue. */
  check("les ecouteurs d'appui long sont poses au cablage, pas a chaque rendu",
    app.indexOf("activerAppuiLong($(\"#f-diagnostic\"))") > app.indexOf("function cabler"),
    "attache avant le cablage");
}

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
