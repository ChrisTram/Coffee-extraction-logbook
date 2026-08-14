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
  source + "\nreturn { DATA, SYNC, GRIND, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, REGLAGES };"
);
const { DATA, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, REGLAGES } =
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
check("les 4 recettes Brikka portent une cible a 4", BRIKKAS.length === 4 && BRIKKAS.every(r => r.puissance_feu === 4),
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

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
