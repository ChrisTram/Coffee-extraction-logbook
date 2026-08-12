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
const SCRIPTS = ["js/grind.js", "js/recettes.js", "js/demo-data.js", "js/sync.js", "js/data.js"];

const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const charger = new Function(
  "window",
  "location",
  "indexedDB",
  "console",
  source + "\nreturn { DATA, SYNC, GRIND };"
);
const { DATA } = charger(undefined, { protocol: "file:" }, undefined, console);

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

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
