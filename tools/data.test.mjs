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

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Le code de l'interface tient en sept fichiers depuis le découpage. Les
   contrôles qui cherchent une chaîne dans "l'interface" doivent les lire tous :
   sinon ils repassent au vert dès qu'un bout de code change de fichier, ce qui
   est exactement le moment où on aimerait qu'ils regardent. */
const SOURCE_UI = ["js/ui-noyau.js", "js/ui-tableau.js", "js/ui-saisie.js", "js/ui-chrono.js", "js/ui-brouillon.js", "js/ui-rapide.js",
  "js/ui-historique.js", "js/ui-guide.js", "js/ui-catalogue.js", "js/ui-fiche.js", "js/ui-brassage.js", "js/ui-dessins.js", "js/app.js"]
  .map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
/* demo-data.js n'est plus une balise script depuis la v7.56, mais le harnais le
   charge quand meme : chargerDemo() en a besoin et il n'y a pas de reseau ici. */
/* La couche de donnees tient en six fichiers depuis la v7.87 : les controles qui
   cherchent une chaine "dans data.js" lisent la concatenation, pour la meme
   raison que SOURCE_UI plus haut. */
const FICHIERS_DATA = ["js/data-csv.js", "js/data-schema.js", "js/data-store.js", "js/data-calculs.js",
  "js/data-migrations.js", "js/data.js"];
const SOURCE_DATA = FICHIERS_DATA.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const SCRIPTS = ["js/outils.js", "js/grind.js", "js/recettes.js", "js/demo-data.js", "js/sync.js",
  ...FICHIERS_DATA, "js/reglages.js"];

const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const charger = new Function(
  "window",
  "location",
  "indexedDB",
  "console",
  source + "\nreturn { DATA, SYNC, GRIND, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, DIAGNOSTIC_LEVIERS, REGLAGES, echelleVersements, SEUIL_VERSEMENT_G, temperatureDepuisChauffe, chauffePourTemperature };"
);
const { DATA, GRIND, RECETTES_DEPART, DIAGNOSTICS, DIAGNOSTICS_GROUPES, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_QUAND, DIAGNOSTIC_LEVIERS, REGLAGES,
  echelleVersements, SEUIL_VERSEMENT_G, temperatureDepuisChauffe, chauffePourTemperature } =
  charger(undefined, { protocol: "file:" }, undefined, console);

let failures = 0;

/* Une cle de gabarit vit desormais en deux morceaux : sa moitie francaise dans
   js/i18n.js, sa moitie anglaise dans js/i18n.en.js, charge a la demande. Oublier
   la seconde afficherait du francais en mode anglais, sans aucune erreur. */
const I18N_FR_SRC = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
const I18N_EN_SRC = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
const bilingue = cle =>
  new RegExp("^\\s*" + cle + ": \\{ fr:", "m").test(I18N_FR_SRC) &&
  new RegExp("^\\s*" + cle + ": ", "m").test(I18N_EN_SRC);
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
/* Le compte n'est plus fige : ce qui compte est que TOUTES les Brikka portent
   une cible, pas qu'il y en ait un nombre precis. Un test qui fige le nombre
   demande d'etre retouche a chaque fusion, ce qui est exactement le moment ou on
   ne veut pas d'un test a modifier. */
check("chaque recette Brikka porte une cible de feu a 3", BRIKKAS.length > 0 && BRIKKAS.every(r => r.puissance_feu === 3),
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
  const app = SOURCE_UI;
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

/* LA REGULARITE A CAFE EGAL (v8.54) : deux cafes tres differents, chacun refait
   a l'identique, sont parfaitement reguliers. */
{
  const t = (cafe, recette, n) => ({ cafe_id: cafe, recette, note_sur_10: n });
  const stables = [t("a", "R", 8), t("a", "R", 8), t("b", "R", 4), t("b", "R", 4)];
  check("deux cafes differents mais refaits pareil : regularite parfaite", REGLAGES.ecartACafeEgal(stables) === 0);
  check("l'ecart se mesure dans chaque couple cafe et recette",
    REGLAGES.ecartACafeEgal([t("a", "R", 7), t("a", "R", 9), t("b", "S", 5)]) === 1);
  check("sans jumelle, pas de regularite", REGLAGES.ecartACafeEgal([t("a", "R", 7), t("b", "R", 5)]) === null);
}

/* LA CORRECTION CHIFFREE (v8.48). Le sens des leviers est ecrit a cote des
   phrases de correction : ce controle verifie qu'ils disent la meme chose, pour
   qu'on ne puisse pas changer l'un en oubliant l'autre. */
{
  const groupe = nom => (DIAGNOSTICS_GROUPES.find(g => g.nom === nom) || { diags: [] }).diags;
  const chiffrables = [...groupe("Réglage d'extraction"), ...groupe("Ratio café et eau")];
  check("chaque diagnostic de reglage ou de ratio a ses leviers",
    chiffrables.every(d => DIAGNOSTIC_LEVIERS[d]), chiffrables.filter(d => !DIAGNOSTIC_LEVIERS[d]).join(", "));
  check("et aucun autre n'en a", Object.keys(DIAGNOSTIC_LEVIERS).every(d => chiffrables.includes(d)));
  const incoherents = Object.entries(DIAGNOSTIC_LEVIERS).filter(([d, l]) => {
    const t = DIAGNOSTIC_CORRECTIONS[d].toLowerCase();
    return (l.mouture < 0) !== /plus fin/.test(t) || (l.mouture > 0) !== /grossier/.test(t) ||
      (l.chaleur > 0) !== /plus chaud/.test(t) || (l.chaleur < 0) !== /moins chaud/.test(t) ||
      (l.ratio < 0) !== /resserrer|moins d'eau/.test(t) || (l.ratio > 0) !== /élargir|plus d'eau/.test(t);
  }).map(([d]) => d);
  check("les leviers disent ce que disent les phrases de correction", incoherents.length === 0, incoherents.join(", "));

  const pas = { pas_crans: 2, pas_degres: 2, pas_feu: 1, pas_eau_g: 15, pas_dose_g: 1 };
  const sw = (diag, champs) => ({ methode: "Switch", mouture_dial: "1.4.2", temperature_c: 92, eau_g: 240, dose_g: 15, diagnostic: diag, ...champs });
  const c = REGLAGES.correctionChiffree(sw("Un peu amer"), pas, false);
  check("un peu amer : la molette d'abord, deux crans plus grossier", c[0] && c[0].levier === "mouture" && c[0].vers === "1.4.4" && c[0].ecart === 2,
    JSON.stringify(c));
  check("puis l'eau deux degres moins chaude", c[1] && c[1].levier === "temperature" && c[1].vers === 90, JSON.stringify(c[1]));
  const f = REGLAGES.correctionChiffree(sw("Sur-extrait (amer)"), pas, false);
  check("un diagnostic franc double le pas", f[0].vers === "1.5.1" && f[1].vers === 88, JSON.stringify(f));
  check("les pas viennent des reglages", REGLAGES.correctionChiffree(sw("Un peu amer"), { ...pas, pas_crans: 3 }, false)[0].vers === "1.5.0");
  check("la molette reste dans la plage de la machine",
    REGLAGES.correctionChiffree(sw("Astringent", { mouture_dial: "1.9.4" }), pas, false).length === 0);
  check("acide et amer ensemble ne se chiffrent pas", REGLAGES.correctionChiffree(sw("Un peu acide|Un peu amer"), pas, false).length === 0);
  check("un cafe deja moulu passe a la chaleur", REGLAGES.correctionChiffree(sw("Un peu amer"), pas, true)[0].levier === "temperature");
  const br = REGLAGES.correctionChiffree({ methode: "Brikka", mouture_dial: "", dose_g: 14, puissance_feu: 3, diagnostic: "Un peu léger|Un peu acide" }, pas, true);
  check("a la Brikka, la chaleur est le feu et le ratio la dose",
    br.length === 2 && br[0].levier === "feu" && br[0].vers === 4 && br[1].levier === "dose" && br[1].vers === 15, JSON.stringify(br));
  check("sans diagnostic, rien", REGLAGES.correctionChiffree(sw(""), pas, false).length === 0);
  // Une ligne d'avant la v8.48 n'a pas les colonnes : elle prend les defauts, sans migration.
  const vieux = DATA.normaliserReglages({ id: "moi", dose_g: 15 });
  check("une ligne sans pas prend les defauts", vieux.pas_crans === 2 && vieux.pas_degres === 2 && vieux.pas_eau_g === 15);
  check("un pas hors bornes retombe au defaut", DATA.normaliserReglages({ pas_crans: 40 }).pas_crans === 2);
}

/* Les tasses jumelles (v8.44) : meme recette, molette a trois crans pres, le
   meme cafe devant. Pas la meme temperature : Chris ne veut pas d'une
   comparaison trop precise. */
{
  const t = [
    brew("31", "c1", "R", "1.4.2", 3, false, 7),
    brew("32", "c2", "R", "1.4.4", 3, false, 8),    // autre cafe, 2 crans
    brew("33", "c1", "R", "1.5.1", 3, false, 6),    // meme cafe, 4 crans : trop loin
    brew("34", "c1", "R", "1.4.0", 3, false, 6.5),  // meme cafe, 2 crans
    brew("35", "c1", "Autre", "1.4.2", 3, false, 9), // autre recette
    brew("36", "c1", "R", "1.4.2", 3, false, ""),   // pas notee
  ];
  const j = REGLAGES.jumelles(t, { cafe_id: "c1", recette: "R", mouture_dial: "1.4.2" });
  check("les jumelles gardent la meme recette et la molette a 3 crans",
    j.map(x => x.ext.id).join(",") === "31,34,32", j.map(x => x.ext.id).join(","));
  check("le meme cafe passe devant, et l'ecart est en crans", j[0].memeCafe && j[1].ecart === -2 && !j[2].memeCafe);
  const moulu = REGLAGES.jumelles(t, { cafe_id: "c2", recette: "R", moulu: true });
  check("un cafe deja moulu cherche la meme recette sur le meme cafe", moulu.length === 1 && moulu[0].ext.id === "32");
  check("sans recette, pas de jumelle", REGLAGES.jumelles(t, { cafe_id: "c1", mouture_dial: "1.4.2" }).length === 0);
}

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
  /* L'echelle du feu a bouge quatre fois : 3, 4, 2, puis 3 de nouveau (pas v14,
     demande de Chris). Une fiche semee a 4 comme une fiche semee a 3 finissent
     donc au meme endroit, et c'est le sens de ces deux controles : la chaine
     entiere est rejouee, pas seulement le dernier pas. */
  check("le feu seme a 4 finit a 3", par("b1").puissance_feu === 3, par("b1").puissance_feu);
  check("le feu seme a 3 revient a 3 apres tout le chemin", par("b2").puissance_feu === 3, par("b2").puissance_feu);
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

  /* Pas v11 : le 4:00 d'usine ecrit dans les reglages synchronises passe a 2:00.
     Une duree chronometree a la main (300) n'est pas touchee. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 10, ebullition_s: 240 })];
  DATA.migrerDonnees();
  check("le 4:00 invente passe a 2:00", Number(DATA.reglagesCourants().ebullition_s) === 120,
    String(DATA.reglagesCourants().ebullition_s));
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 10, ebullition_s: 300 })];
  DATA.migrerDonnees();
  check("une bouilloire chronometree a la main n'est pas ecrasee", Number(DATA.reglagesCourants().ebullition_s) === 300,
    String(DATA.reglagesCourants().ebullition_s));

  // Pas v12 : le bloom Hoffmann dit le tourbillon pendant le bloom. Une fiche
  // reecrite a la main garde son texte.
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 11 })];
  const hof = () => DATA.state.recettes.find(r => r.id === "hoffmann-1cup");
  const semerHof = texte => DATA.state.recettes.push({ id: "hoffmann-1cup", nom: "Better 1 Cup (Hoffmann)", methode: "Switch",
    famille: "", eau: 250, temp: 95, puissance_feu: "", dial: "1.5.0", maj_le: 0, etapes: [{ t: 0, texte }] });
  semerHof("Bloom : verser 50 g lentement, en quinze secondes environ, vanne OUVERTE. Tourbillon doux de la carafe.");
  DATA.migrerDonnees();
  check("le bloom Hoffmann dit le tourbillon pendant le bloom",
    hof().etapes[0].texte.includes("PENDANT le bloom"), hof().etapes[0].texte);
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 11 })];
  semerHof("Mon bloom a moi.");
  DATA.migrerDonnees();
  check("un bloom reecrit a la main n'est pas touche", hof().etapes[0].texte === "Mon bloom a moi.");

  // Pas v13 : la cuillere est permise sur le dernier pas Hoffmann.
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 12 })];
  semerHof("Tourbillon doux, AUCUNE cuillère. Laisser s'écouler, fin vers 2:45 à 3:15.");
  DATA.migrerDonnees();
  check("le dernier pas Hoffmann n'interdit plus la cuillere",
    !hof().etapes[0].texte.includes("AUCUNE") && hof().etapes[0].texte.includes("cuillère"), hof().etapes[0].texte);

  /* Pas v15 : la bouilloire en courbe. Une tasse dont le degre vaut l'ancienne
     droite prend la courbe ; un degre retouche a la main, ou une Brikka, non. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 14, ebullition_s: 120, bulles_s: 90 })];
  const tasse = (id, methode, temperature_c) => DATA.state.extractions.push(DATA.normaliserExtraction(
    { id, date: "2026-09-20", methode, cafe_id: "", chauffe_s: 90, temperature_c, maj_le: 0 }));
  tasse("x-droite", "Switch", 82);
  tasse("x-main", "Switch", 91);
  tasse("x-brikka", "Brikka", 82);
  DATA.migrerDonnees();
  const deg = id => DATA.state.extractions.find(e => e.id === id).temperature_c;
  check("une temperature estimee sous la droite passe sur la courbe", Number(deg("x-droite")) === 88, String(deg("x-droite")));
  check("un degre corrige a la main n'est pas touche", Number(deg("x-main")) === 91, String(deg("x-main")));
  check("une Brikka n'est pas touchee", Number(deg("x-brikka")) === 82, String(deg("x-brikka")));

  /* Pas v16 : une recette d'origine deja stockee recoit la video de sa graine ;
     un lien pose a la main n'est pas remplace. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 15 })];
  DATA.state.recettes = RECETTES_DEPART.map(d => DATA.normaliserRecette({ ...d, video: "" }));
  const hofV = DATA.state.recettes.find(r => r.id === "hoffmann-1cup");
  hofV.video = "https://exemple.org/ma-video";
  DATA.migrerDonnees();
  check("une recette d'origine sans video recoit celle de sa graine",
    DATA.state.recettes.find(r => r.id === "neo-brew").video === "https://www.youtube.com/watch?v=k0nsShguOsU");
  check("un lien pose a la main n'est pas remplace", hofV.video === "https://exemple.org/ma-video");
  check("la video fait l'aller-retour dans la ligne stockee",
    DATA.normaliserRecette(DATA.recetteVersLigne ? DATA.recetteVersLigne(hofV) : hofV).video === "https://exemple.org/ma-video");
  check("un lien qui n'est pas http ne s'ecrit jamais",
    DATA.normaliserRecette({ nom: "x", video: "javascript:alert(1)" }).video === "");
  check("huit recettes d'origine ont leur video",
    RECETTES_DEPART.filter(r => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(r.video || "")).length === 8);
  /* La Tetsu Devil (v8.70) : le melange pese de l'etape 2 doit donner 70 degres
     avec l'eau ambiante de la courbe de la bouilloire, et faire le compte. */
  const devil = RECETTES_DEPART.find(r => r.id === "devil-switch");
  const [chaud, froid] = (devil.etapes[1].texte.match(/(\d+) g d'eau à 90 °C et (\d+) g/) || []).slice(1).map(Number);
  const tMelange = (chaud * 90 + froid * 28) / (chaud + froid);
  check("le melange de la Devil donne 70 degres a un degre pres", Math.abs(tMelange - 70) <= 1, String(tMelange));
  check("et fait exactement l'eau de l'immersion", chaud + froid === devil.eau - 90, (chaud + froid) + " / " + (devil.eau - 90));

  /* Pas v17 : « The Tetsu Devil » devient « Tetsu 4:6 », la recette et ses
     tasses, estampillees pour que la synchro porte le nouveau nom. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 16 })];
  DATA.state.recettes = RECETTES_DEPART.map(d => DATA.normaliserRecette(d.id === "tetsu-devil" ? { ...d, nom: "The Tetsu Devil" } : d));
  DATA.state.extractions.push(DATA.normaliserExtraction(
    { id: "x-devil", date: "2026-08-05", methode: "Switch", recette: "The Tetsu Devil", maj_le: 5 }));
  DATA.migrerDonnees();
  const x46 = DATA.state.extractions.find(e => e.id === "x-devil");
  check("la recette Devil s'appelle maintenant Tetsu 4:6",
    DATA.state.recettes.find(r => r.id === "tetsu-devil").nom === "Tetsu 4:6");
  check("et ses tasses suivent, estampillees", x46.recette === "Tetsu 4:6" && Number(x46.maj_le) > 5, x46.recette + " " + x46.maj_le);

  /* Un carnet NEUF joue tous les pas, dont v5 (molette unique) : la Neo Brew,
     semee apres avec son extra gros, doit le garder. */
  avant();
  DATA.state.reglages = [DATA.normaliserReglages({ schema_version: 0 })];
  DATA.migrerDonnees();
  const neo = DATA.state.recettes.find(r => r.id === "neo-brew");
  check("sur un carnet neuf, la Neo Brew garde sa molette extra grosse", neo && neo.dial === "2.8.0", neo && neo.dial);
  check("et les autres recettes restent a 1.5.0",
    DATA.state.recettes.filter(r => r.id !== "neo-brew").every(r => r.dial === "1.5.0"));

  // Plus aucun drapeau par appareil dans la couche de donnees.
  const data = SOURCE_DATA;
  const bloc = data.slice(data.indexOf("const PAS_DE_SCHEMA"), data.indexOf("function migrerDonnees"));
  check("les pas ne dependent plus du stockage local", !bloc.includes("localStorage"));
  /* Les numeros doivent se suivre de 1 a SCHEMA_ACTUEL, sans trou ni doublon.
     La borne est LUE dans la source au lieu d'etre ecrite ici : le vrai
     invariant est que la liste et le compteur restent d'accord, et une liste
     figee dans le test obligeait a le retoucher a chaque pas ajoute, ce qui est
     exactement le moment ou on ne veut pas d'un test a modifier. */
  const pas = [...bloc.matchAll(/\{ v: (\d+)/g)].map(m => Number(m[1]));
  const actuel = Number((data.match(/const SCHEMA_ACTUEL = (\d+)/) || [])[1]);
  check("les numeros de pas se suivent sans trou",
    pas.join() === pas.map((_, i) => i + 1).join(), pas.join());
  check("et le dernier pas est la version courante du schema",
    pas.length === actuel && pas[pas.length - 1] === actuel,
    pas.length + " pas pour SCHEMA_ACTUEL = " + actuel);
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
  /* EXCEPTION ASSUMEE : le theme s'applique par un script EN LIGNE dans le
     <head>, et il ne doit surtout pas etre differe. L'attribut data-theme etait
     code en dur a "sombre" et la restauration du choix vivait dans un differe,
     qui ne tourne qu'apres le premier rendu : le theme clair clignotait donc en
     sombre a chaque ouverture. Un clignotement ne fait echouer aucun test, d'ou
     ce verrou. */
  {
    const tete = html.slice(0, html.indexOf("</head>"));
    const enLigne = [...tete.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    const theme = enLigne.find(m => m[1].includes('data-theme'));
    check("le theme s'applique par un script en ligne dans le head", !!theme);
    if (theme) {
      check("et ce script n'est ni differe ni asynchrone",
        !theme[0].includes(" defer") && !theme[0].includes(" async"), theme[0].slice(0, 60));
      check("il lit le choix enregistre", theme[1].includes('localStorage.getItem("theme")'));
      check("et retombe sur la preference du systeme sans choix",
        theme[1].includes("prefers-color-scheme"));
    }
    /* Plus de theme code en dur : l'absence d'attribut veut dire "pas encore
       decide", et c'est ce qui permet de suivre le systeme. */
    check("le HTML n'impose plus de theme de depart",
      /<html\b[^>]*>/.test(html) && !html.match(/<html\b[^>]*>/)[0].includes("data-theme"),
      (html.match(/<html\b[^>]*>/) || [""])[0]);
    // La barre d'etat de la PWA suivait le theme sombre en toutes circonstances.
    const teintes = [...html.matchAll(/<meta name="theme-color"[^>]*>/g)].map(m => m[0]);
    check("la barre d'etat a une teinte par preference systeme",
      teintes.length === 2 && teintes.every(t => t.includes("prefers-color-scheme")),
      teintes.join(" "));
    check("et le choix explicite les met a jour toutes les deux",
      /querySelectorAll\('meta\[name="theme-color"\]'\)[\s\S]{0,80}setAttribute/.test(SOURCE_UI));
  }

  // Le nom de fichier, sans son ?v= : le service worker ajoute la version lui meme.
  const sansVersion = s => s.split("?")[0];
  const manquants = scripts.filter(s => !sw.includes('"./' + sansVersion(s) + '"'));
  check("tous les scripts d'index.html sont precaches", manquants.length === 0, manquants.join(", "));

  /* VERSION UNIQUE. Elle est ecrite dans le <meta>, dans chaque ?v= de la page
     et dans sw.js. Une divergence laisse un appareil avec le nouveau HTML et un
     vieux script en cache pour un an : c'est le seul vrai risque du versionnage,
     et il se voit ici avant le deploiement. */
  const meta = (html.match(/<meta name="app-version" content="([^"]+)">/) || [])[1];
  check("la page declare sa version dans un meta", /^\d+\.\d+/.test(meta || ""), String(meta));
  const versions = [...html.matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\?v=([^"]*)"/g)].map(m => m[1]);
  check("chaque script et la feuille de style portent ?v=", versions.length === scripts.length + 1,
    versions.length + " sur " + (scripts.length + 1));
  check("et tous portent la version du meta", versions.every(v => v === meta),
    [...new Set(versions)].join(", "));
  const swVersion = (sw.match(/const VERSION = "([^"]+)"/) || [])[1];
  check("le service worker porte la meme version", swVersion === meta, swVersion + " contre " + meta);
  check("app.js lit la version au lieu de la recopier", SOURCE_UI.includes("OUTILS.versionSite()"));
  // Les trois fichiers charges a la demande doivent passer par la meme URL versionnee.
  ["js/i18n.js", "js/data.js", "js/charts.js"].forEach(f => {
    const src = readFileSync(join(ROOT, f), "utf8");
    check(f + " versionne ce qu'il charge a la demande", /s\.src = OUTILS\.urlVersionnee\(/.test(src));
  });
  /* Le compte baisse a mesure qu on sort des fichiers du chemin critique :
     Chart.js, le paquet anglais et la demo sont desormais charges a la demande.
     Ce qui doit rester vrai, c est que TOUT ce qui est encore une balise script
     soit precache, verifie juste au dessus. */
  check("le socle reste charge par des balises script", scripts.length >= 6, String(scripts.length));

  // La feuille de style et le manifeste comptent autant : sans eux la PWA
  // s'ouvre hors ligne en page blanche non stylee.
  ["./css/styles.css", "./manifest.json", "./index.html"].forEach(f =>
    check("precache : " + f, sw.includes('"' + f + '"')));
}

/* LE MANIFESTE. Un `id` stable : sans lui l'identite de l'application installee
   depend de start_url, et changer celui-ci un jour ferait apparaitre une seconde
   application a cote de la premiere. Et des raccourcis d'appui long sur l'icone,
   qui doivent viser des ecrans qui existent. */
{
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")); } catch (e) { /* invalide */ }
  check("le manifeste est un JSON valide", !!manifest);
  if (manifest) {
    check("le manifeste porte un id", manifest.id === "./", String(manifest.id));
    const app = SOURCE_UI;
    const liste = app.slice(app.indexOf("const ECRANS = ["), app.indexOf("]", app.indexOf("const ECRANS = [")));
    const raccourcis = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
    check("au moins un raccourci d'appui long", raccourcis.length >= 1);
    /* Un raccourci vise un ecran, ou une ACTION qu'app.js traite nommement
       (« refaire », v8.41) : au demarrage ET au changement de hash, sinon un
       appli deja ouverte l'ignorerait. */
    const appJs = readFileSync(join(ROOT, "js/app.js"), "utf8");
    const actionTraitee = cle => (appJs.match(new RegExp('h === "' + cle + '"', "g")) || []).length >= 2;
    const morts = raccourcis.filter(r => {
      const cle = String(r.url).replace("./#", "");
      return !liste.includes('"' + cle + '"') && !actionTraitee(cle);
    });
    check("chaque raccourci vise un ecran existant ou une action traitee", morts.length === 0, morts.map(r => r.url).join(", "));
    check("chaque raccourci a une icone", raccourcis.every(r => Array.isArray(r.icons) && r.icons.length));
  }
}

/* ACCESSIBILITE DES CHAMPS. Chaque champ visible doit avoir un nom : une
   etiquette <label for>, une etiquette qui l'enveloppe, ou un aria-label. Sept
   seconds champs de paires (minutes puis secondes, case puis quantite) n'en
   avaient aucun. Et le Guide sautait de h2 a h4, ce qui casse la navigation par
   titres d'un lecteur d'ecran. */
{
  /* Les COMMENTAIRES sont retires d'abord : un commentaire qui cite <select>
     ou <input> se faisait compter comme un champ sans nom, ce qui accusait le
     commentaire au lieu du HTML. */
  const html = readFileSync(join(ROOT, "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  const pourLabel = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map(m => m[1]));
  const sansNom = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="(hidden|file)"/.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (/aria-label(ledby)?=/.test(attrs) || (id && pourLabel.has(id))) continue;
    const avant = html.lastIndexOf("<label", m.index), fermeAvant = html.lastIndexOf("</label>", m.index);
    if (avant > fermeAvant) continue; // enveloppe par un <label>
    sansNom.push(id || attrs.trim().slice(0, 40));
  }
  check("chaque champ de la page porte un nom accessible", sansNom.length === 0, sansNom.join(", "));

  const niveaux = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  const sauts = niveaux.filter((n, i) => i > 0 && n - niveaux[i - 1] > 1).length;
  check("aucun titre ne saute un niveau", sauts === 0, String(sauts));

  // Les nouvelles etiquettes doivent exister en anglais, comme toute chaine visible.
  const en = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  const arias = [...html.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]);
  const nonTraduits = [...new Set(arias)].filter(a => !en.includes('"' + a + '"'));
  check("chaque aria-label statique a sa traduction", nonTraduits.length === 0, nonTraduits.join(", "));
}

/* L'AFFICHAGE DE LA NOTE PASSE PAR UNE SEULE FONCTION.

   La reprise de brouillon ecrivait #note-affichee a la main, avec la valeur
   brute du champ. Elle ignorait donc « pas encore notee » : apres reprise d'un
   brouillon non note, l'ecran annoncait « 5 » alors que l'enregistrement allait
   ranger la tasse comme NON NOTEE. Le curseur etant lui aussi pose sur 5, rien
   ne trahissait l'ecart, et ce sont les moyennes qui en dependaient.

   La regle : un seul endroit ecrit cet element. Tout autre code qui y touche
   est un second avis sur la meme question, et c'est comme ca qu'ils divergent. */
{
  const saisie = readFileSync(join(ROOT, "js/ui-saisie.js"), "utf8");
  const autres = ["js/ui-chrono.js", "js/ui-brouillon.js", "js/app.js", "js/ui-historique.js", "js/ui-tableau.js"]
    .filter(f => /\$\("#note-affichee"\)\s*\.\s*textContent\s*=/.test(readFileSync(join(ROOT, f), "utf8")));
  check("un seul fichier ecrit #note-affichee, et c'est celui de la saisie",
    autres.length === 0, autres.join(", "));
  const ecritures = (saisie.match(/\$\("#note-affichee"\)\s*\.\s*textContent\s*=/g) || []).length;
  check("et il ne l'ecrit qu'a un seul endroit", ecritures === 1, String(ecritures));

  /* Et cet endroit doit regarder la case, sinon la fonction officielle ment
     autant que la ligne qu'elle remplace. */
  check("l'affichage de la note tient compte de « pas encore notee »",
    /function majAffichageNote\(\)[\s\S]{0,400}noteVide\(/.test(saisie));
}
/* LE BASCULEMENT D'ECRAN NE TIENT QU'A LA SPECIFICITE.

   Deux lignes font toute la navigation :
     .ecran { display: none }   puis   .ecran.actif { display: block }
   Un selecteur d'IDENTIFIANT vaut plus qu'une classe. Une regle qui pose un
   display sur un #ecran-* sans exiger .actif bat donc le display:none, et cet
   ecran reste affiche pour toujours : les suivants s'empilent dessous au lieu
   de le remplacer. C'est exactement ce qu'a fait #ecran-saisie { display: grid }
   a la refonte Comptoir, et rien dans les cinq suites ne le voyait.

   Le controle porte sur la REGLE : n'importe quel ecran referait la panne. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const fautifs = [];
  /* Chaque bloc du fichier : son selecteur, puis ses declarations. */
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim(), corps = m[2];
    if (!/(^|[\s,])display\s*:/.test(corps)) continue;
    for (const part of selecteur.split(",")) {
      const sel = part.trim();
      if (!/#ecran-[\w-]+/.test(sel)) continue;
      /* Le display peut viser un DESCENDANT de l ecran sans souci : seul le
         selecteur qui se termine sur l ecran lui-meme fait la panne. */
      if (!/#ecran-[\w-]+[\w.:\[\]="-]*$/.test(sel)) continue;
      if (!/\.actif\b/.test(sel)) fautifs.push(sel + " { display }");
    }
  }
  check("aucune regle ne force l'affichage d'un ecran sans .actif",
    fautifs.length === 0, fautifs.join(" | "));

  /* MEME LECON, AUTRE VISAGE : un ecran ne se met pas en page lui-meme.

     #ecran-saisie n'a qu'UN enfant, .saisie-layout, qui portait deja la grille
     « formulaire plus colonne fixe ». Une seconde grille posee sur l'ecran a mis
     tout le formulaire dans la colonne 1 et laisse 360 px vides a droite : le
     contenu paraissait serre et decale, sans que rien ne soit en erreur.

     La mise en page appartient au conteneur qui a vraiment plusieurs enfants a
     repartir. Si un ecran en a besoin un jour, l'auteur verra ce test et posera
     la regle sur un enveloppeur : c'est le but. */
  const grilles = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim(), corps = m[2];
    if (!/grid-template-columns\s*:/.test(corps)) continue;
    for (const part of selecteur.split(",")) {
      const sel = part.trim();
      if (/#ecran-[\w-]+[\w.:\[\]="-]*$/.test(sel)) grilles.push(sel);
    }
  }
  check("aucun ecran ne porte lui-meme une grille de colonnes",
    grilles.length === 0, grilles.join(" | "));
}
/* LES CHAMPS DE SAISIE VIVENT DANS LE FORMULAIRE.

   En deplacant le chrono vers la colonne de droite, le decoupage a attrape la
   <section> du bloc 2 au lieu du <div> du chrono : « Les reglages » et « En
   bouche » sont partis avec lui. Le formulaire n'a plus contenu que le premier
   bloc, et tous les champs de saisie se sont retrouves dans l'aside, habilles
   en carte sombre.

   Les cinq suites sont restees vertes tout du long : aucune ne regarde OU vit
   un champ, et le faux DOM trouve un identifiant aussi bien dans un aside que
   dans un formulaire. Il a fallu que Chris ouvre la page.

   Le controle decoupe le HTML aux frontieres reelles et verifie de quel cote
   tombe chaque champ. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const debutForm = html.indexOf('<form id="form-saisie"');
  const finForm = html.indexOf("</form>", debutForm);
  const debutAside = html.indexOf('<aside class="saisie-aside"');
  const finAside = html.indexOf("</aside>", debutAside);
  check("le formulaire de saisie et sa colonne existent",
    debutForm > 0 && finForm > debutForm && debutAside > finForm && finAside > debutAside);

  const dansForm = html.slice(debutForm, finForm);
  const dansAside = html.slice(debutAside, finAside);

  /* Les champs que Chris remplit. Un seul hors du formulaire et la saisie part
     dans la mauvaise colonne. */
  const CHAMPS = ["f-cafe", "f-recette", "f-dose", "f-eau", "f-mouture", "f-volume",
    "f-tasse", "f-note", "f-diagnostic", "f-descripteurs", "f-commentaire", "f-date"];
  /* Un champ pose HORS des balises du formulaire compte quand meme s il porte
     form="form-saisie" : c est le rattachement officiel de HTML, et la date de
     la tete de page s en sert. */
  const rattaches = new Set([...html.matchAll(/id="([^"]+)"[^>]*form="form-saisie"/g)].map(m => m[1]));
  const egares = CHAMPS.filter(id => !dansForm.includes('id="' + id + '"') && !rattaches.has(id));
  check("chaque champ de saisie est dans le formulaire", egares.length === 0, egares.join(", "));

  /* Les trois blocs numerotes, dans le formulaire et dans l'ordre. */
  const blocs = [...dansForm.matchAll(/class="bloc-num"[^>]*>(\d)</g)].map(m => m[1]);
  check("les trois blocs numerotes sont dans le formulaire",
    blocs.join(",") === "1,2,3", blocs.join(",") || "aucun");

  /* LE CHRONO VIENT AVANT LE FORMULAIRE dans le DOM. C'est ce qui le met en
     premier sur telephone, ou il doit se coller en haut de l'ecran : il vivait
     dans l'aside, qui passe APRES un formulaire de 3 500 px, et son sticky ne
     collait donc rien du tout. Sur ordinateur le CSS le replace en haut de la
     colonne de droite, voir le controle de placement plus bas. */
  check("et pas dans le formulaire", !dansForm.includes('id="chrono-total"'));
  const posChronoDom = html.indexOf('id="chrono-widget"');
  check("le chrono precede le formulaire dans le DOM",
    posChronoDom > 0 && posChronoDom < debutForm, "chrono " + posChronoDom + ", form " + debutForm);

  /* La carte sombre est reservee au chrono : un bloc de formulaire qui la porte
     signale que le decoupage a derape. */
  check("aucun bloc de formulaire n'est habille en carte sombre",
    !dansForm.includes("carte-sombre"));

  /* SUR ORDINATEUR le CSS remet le chrono en haut de la colonne de droite.
     L'ordre du DOM sert le telephone, la grille sert l'ecran large, et aucun
     des deux ne depend d'un ordre de lecture accidentel. */
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  check("le chrono est place en haut de la colonne de droite sur ordinateur",
    /#chrono-widget\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*1/.test(css));
  check("et la colonne des fiches passe en seconde rangee",
    /\.saisie-aside\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*2/.test(css));

  /* Le chrono est repliable : une entete qui commande un corps. */
  const zoneChrono = html.slice(posChronoDom, debutForm);
  check("le chrono a une entete qui ouvre et ferme son corps",
    zoneChrono.includes('aria-controls="chrono-corps"') && zoneChrono.includes('id="chrono-corps"'));
  /* Le temps vit dans l'ENTETE, pas dans le corps : replie, il doit rester
     lisible, sinon le repli coute plus qu'il ne rapporte. */
  const entete = zoneChrono.slice(zoneChrono.indexOf('id="chrono-basculer"'), zoneChrono.indexOf('id="chrono-corps"'));
  check("le temps reste lisible quand le chrono est replie",
    entete.includes('id="chrono-total"'));
  check("et le palier en cours aussi", entete.includes('id="chrono-palier-court"'));
}
/* LE REPLI D'USINE DE LA BOUILLOIRE NE PEUT PAS ETRE ZERO.

   temperatureDepuisChauffe() refuse de calculer sans temps d'ebullition
   (`!(e > 0)`). Avec un repli a zero, l'estimation du degre depuis le temps de
   chauffe ne partait donc JAMAIS : la fonction existait, elle etait juste
   eteinte, et rien ne le disait au moment ou on tapait un temps.

   Chris a mesure sa bouilloire : 2 minutes du robinet au gros bouillon, et
   1 min 30 au stade des petites bulles qui remontent, soit 80 a 90 degres. Le
   controle verrouille les deux : un repli non nul, et un modele qui tombe dans
   la bande observee. */
{
  const noyau = readFileSync(join(ROOT, "js/ui-noyau.js"), "utf8");
  const repli = Number((noyau.match(/EBULLITION_USINE\s*=\s*(\d+)/) || [])[1]);
  check("le temps d'ebullition d'usine n'est pas nul, sinon le calcul est eteint",
    repli > 0, String(repli));
  check("et vaut les 2 minutes mesurees par Chris", repli === 120, String(repli));

  const t90 = temperatureDepuisChauffe(90, repli);
  check("a 1 min 30, le modele tombe dans la bande des petites bulles (85 a 90)",
    t90 >= 85 && t90 <= 90, String(t90));
  check("et a 2 minutes il annonce l'ebullition",
    temperatureDepuisChauffe(repli, repli) === 100,
    String(temperatureDepuisChauffe(repli, repli)));
}
/* LE FEU PAR DEFAUT SE DIT AU MEME CHIFFRE PARTOUT.

   Il vit a TROIS endroits : la semence des recettes Brikka (recettes.js), le
   repli d'usine de l'interface (ui-noyau.js) et le defaut du schema des
   reglages (data-schema.js). En changer un seul laisse un carnet neuf et un
   carnet existant annoncer deux feux differents, sans que rien ne le signale.

   Le quatrieme endroit, le pas de schema, ne peut pas se verifier ici : il
   agit sur des donnees deja enregistrees, et c'est le controle de rejeu des
   migrations, plus haut, qui s'en charge. */
{
  const noyau = readFileSync(join(ROOT, "js/ui-noyau.js"), "utf8");
  const repli = Number((noyau.match(/FEU_REPLI_USINE\s*=\s*(\d+)/) || [])[1]);
  const schema = DATA.normaliserReglages({}).puissance_feu;
  const semees = RECETTES_DEPART.filter(r => r.methode === "Brikka").map(r => r.puissance_feu);
  const memes = semees.every(v => v === repli) && repli === schema;
  check("le feu par defaut est le meme dans les trois sources",
    memes, "semence " + semees.join("/") + ", repli " + repli + ", schema " + schema);
}
/* AUCUN BOUTON MORT.

   "Charger la demonstration", sur le tableau de bord vide, ne faisait rien
   depuis la v7.3 : il portait un identifiant et aucun code ne l'ecoutait. Un
   bouton qui ne repond pas ne leve rien, n'ecrit rien dans la console et ne
   se voit que si quelqu'un clique dessus au bon moment.

   La regle : tout bouton porteur d'un identifiant doit etre mentionne quelque
   part dans le JS. Les boutons pilotes par ATTRIBUT (data-va, data-ferme,
   data-ecran) sont delegues et n'ont pas besoin de leur identifiant ; les
   boutons de soumission sont geres par le submit de leur formulaire. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  /* SOURCE_UI porte les huit fichiers d interface plus app.js : c est la que
     vivent tous les gestionnaires de boutons. SCRIPTS, lui, ne contient que la
     couche de donnees, et cherchait donc les identifiants la ou ils ne sont
     jamais. */
  const tousLesJs = SOURCE_UI;
  const morts = [];
  for (const m of html.matchAll(/<button[^>]*>/g)) {
    const b = m[0];
    const id = (b.match(/id="([^"]+)"/) || [])[1];
    if (!id) continue;
    // data-analyse : les onglets des analyses, pilotés par délégation (v8.39).
    if (/data-va=|data-ferme=|data-ecran=|data-analyse=|type="submit"/.test(b)) continue;
    if (!tousLesJs.includes('"' + id + '"') && !tousLesJs.includes("#" + id)) morts.push(id);
  }
  check("aucun bouton a identifiant n'est laisse sans code", morts.length === 0, morts.join(", "));
}
/* LA NAVIGATION : un rail sur ordinateur, une barre du bas sur telephone.

   L'ancienne version de ce bloc visait <nav class="nav">, disparu avec
   l'entete a la refonte Comptoir : indexOf rendait -1 et le controle passait a
   vide. Elle portait aussi /data-ecran="(w+)"/ sans antislash, qui ne trouve
   jamais rien : "toutes les cibles data-ecran existent" n'a donc jamais rien
   verifie depuis qu'il existe. Les deux sont corriges ici. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const app = SOURCE_UI;
  const liste = app.slice(app.indexOf("const ECRANS = ["), app.indexOf("]", app.indexOf("const ECRANS = [")));
  const ecrans = [...liste.matchAll(/"(\w+)"/g)].map(m => m[1]);
  check("la liste des ecrans est lisible depuis le test", ecrans.length === 6, ecrans.join(", "));

  /* Toute cible de navigation doit viser un ecran qui existe. Un data-ecran mal
     orthographie ne leve rien : le clic ne fait simplement rien. */
  const cibles = [...html.matchAll(/data-ecran="(\w+)"/g)].map(m => m[1]);
  check("des cibles de navigation existent", cibles.length > 0, String(cibles.length));
  const inconnues = [...new Set(cibles)].filter(c => !ecrans.includes(c));
  check("toutes les cibles data-ecran existent", inconnues.length === 0, inconnues.join(", "));

  /* Le rail porte les SIX ecrans : c'est lui le menu complet, la barre du bas
     n'en montre que trois et renvoie le reste dans la feuille. */
  const rail = html.slice(html.indexOf('<nav class="rail"'), html.indexOf("</nav>"));
  const dansLeRail = [...rail.matchAll(/data-ecran="(\w+)"/g)].map(m => m[1]);
  const oubliees = ecrans.filter(e => !dansLeRail.includes(e));
  check("le rail mene aux six ecrans, aucun n'est devenu inatteignable",
    oubliees.length === 0, oubliees.join(", "));

  /* La barre du bas ne depasse pas quatre entrees : au dela elle se tasse et
     les cibles passent sous le confort du pouce. C'est la raison d'etre de
     "Plus", et le remplacant de l'ancienne regle des trois onglets. */
  const barre = html.slice(html.indexOf('<nav class="barre-bas"'));
  const finBarre = barre.indexOf("</nav>");
  const entrees = (barre.slice(0, finBarre).match(/class="[^"]*barre-entree/g) || []).length;
  check("quatre entrees au maximum dans la barre du bas", entrees <= 4, String(entrees));

  /* LES TROIS OUTILS SONT UNIQUES. app.js les adresse par identifiant : si le
     rail et la feuille etaient deux elements separes, le second bouton serait
     muet. C'est precisement pour ca que le rail EST la feuille. */
  ["btn-lang", "btn-theme", "btn-donnees", "btn-plus"].forEach(id => {
    const n = (html.match(new RegExp('id="' + id + '"', "g")) || []).length;
    check("#" + id + " n'existe qu'une fois dans la page", n === 1, String(n));
  });

  /* Une entree sans libelle lisible est muette au lecteur d'ecran. Les entrees
     portent un <span> de texte ; celles qui n'en ont pas doivent porter un
     aria-label. */
  const muettes = [...html.matchAll(/<button[^>]*class="[^"]*(?:rail-entree|barre-entree)[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
    .filter(m => !/<span>[^<]+<\/span>/.test(m[1]) && !/aria-label=/.test(m[0]));
  check("chaque entree de navigation porte un libelle", muettes.length === 0, String(muettes.length));

  /* AUCUN EMOJI dans la navigation : la DA demande des icones en trait, un seul
     style. Les emoji rendaient la barre differente sur chaque systeme. */
  const navEntiere = rail + barre.slice(0, finBarre);
  const emoji = [...navEntiere.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map(m => m[0]);
  check("aucun emoji dans la navigation", emoji.length === 0, emoji.join(" "));
}
/* Le carnet ne doit JAMAIS refuser un enregistrement au motif que la combinaison
   cafe plus machine lui deplait. Il y avait un blocage sur les cafes rang bo et
   non purs en Switch : il empechait exactement l'essai qui aurait produit la
   donnee capable de trancher. Les avertissements restent, le refus est parti. */
{
  const app = SOURCE_UI;
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

/* TEMPERATURE PAR LE TEMPS DE CHAUFFE (v7.93). Le select de methodes de chauffe
   ("petites bulles", "frémissement") a disparu : Chris a toujours la meme
   bouilloire sur le meme feu, donc le TEMPS sur le feu est la mesure
   reproductible, et le degre s'en deduit par un modele lineaire de 28 a 100 °C
   au temps d'ebullition regle dans Parametres. Le degre reste stocke et
   modifiable ; le temps est stocke aussi. Rien pour la Brikka. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("le select de methodes de chauffe a disparu", !html.includes('id="f-temp-preset"'));
  check("le temps de chauffe se saisit en minutes et secondes",
    html.includes('id="f-chauffe-min"') && html.includes('id="f-chauffe-sec"'));
  check("chauffe_s est une colonne, en fin de ligne, apres ratee",
    DATA.EXT_COLS.indexOf("chauffe_s") === DATA.EXT_COLS.length - 1 && DATA.EXT_COLS.includes("temperature_c"));
  check("le temps d'ebullition de la bouilloire est un reglage synchronise",
    DATA.REGLAGE_COLS.includes("ebullition_s"));
  /* 120 s par defaut depuis que Chris a mesure sa bouilloire. Zero laissait la
     fonction eteinte : temperatureDepuisChauffe refuse de calculer sans temps
     d'ebullition, donc l'estimation ne partait jamais. */
  check("le defaut est la mesure de Chris, 2 minutes",
    DATA.normaliserReglages({}).ebullition_s === 120,
    String(DATA.normaliserReglages({}).ebullition_s));
  /* La fonction refuse toujours de calculer sans temps : c'est sa garde, et
     elle reste utile pour une donnee ancienne ou volontairement mise a zero. */
  check("sans temps d'ebullition, aucune estimation n'est inventee",
    temperatureDepuisChauffe(120, 0) === "" && chauffePourTemperature(92, 0) === "");
  check("un temps d'ebullition absurde retombe sur la mesure, pas sur zero",
    DATA.normaliserReglages({ ebullition_s: 5 }).ebullition_s === 120 &&
    DATA.normaliserReglages({ ebullition_s: 300 }).ebullition_s === 300);

  /* Le modele (v8.59) : une courbe de l'eau du robinet (28) a l'ebullition
     (100), qui passe a 88 par le repere des premieres bulles. Chris trouvait la
     droite trop basse : a 1:30 ses bulles remontent deja, elle disait 82. */
  check("zero seconde sur le feu, c'est l'eau du robinet", temperatureDepuisChauffe(0, 120, 90) === 28);
  check("le temps d'ebullition donne 100", temperatureDepuisChauffe(120, 120, 90) === 100);
  check("au dela, l'eau ne depasse pas 100", temperatureDepuisChauffe(600, 120, 90) === 100);
  check("le repere des premieres bulles donne 88", temperatureDepuisChauffe(90, 120, 90) === 88,
    String(temperatureDepuisChauffe(90, 120, 90)));
  check("et il est reglable : a 1:40 sur 2:00, c'est 1:40 qui donne 88",
    temperatureDepuisChauffe(100, 120, 100) === 88 && temperatureDepuisChauffe(90, 120, 100) < 88);
  check("la courbe monte vite puis ralentit : a mi chemin, au dessus de la droite",
    temperatureDepuisChauffe(60, 120, 90) > 64, String(temperatureDepuisChauffe(60, 120, 90)));
  const montee = [0, 15, 30, 45, 60, 75, 90, 105, 120].map(s => temperatureDepuisChauffe(s, 120, 90));
  check("la courbe ne redescend jamais", montee.every((v, i) => !i || v >= montee[i - 1]), montee.join(","));
  check("un repere pile sur la droite redonne l'ancien modele",
    temperatureDepuisChauffe(120, 240, 200) === 64);
  check("un repere absent ou apres l'ebullition tombe aux trois quarts",
    temperatureDepuisChauffe(90, 120, "") === 88 && temperatureDepuisChauffe(90, 120, 150) === 88);
  check("sans temps, pas d'estimation", temperatureDepuisChauffe("", 120, 90) === "");
  check("l'inverse retombe sur le temps, aux 5 secondes pres",
    Math.abs(chauffePourTemperature(92, 120, 90) - 100) <= 5 &&
    Math.abs(temperatureDepuisChauffe(chauffePourTemperature(92, 120, 90), 120, 90) - 92) <= 2,
    String(chauffePourTemperature(92, 120, 90)));
  check("88 degres, c'est le repere des bulles", chauffePourTemperature(88, 120, 90) === 90);
  check("100 degres, c'est tout le temps d'ebullition", chauffePourTemperature(100, 120, 90) === 120);
  check("le repere des bulles est un reglage synchronise, 1:30 par defaut",
    DATA.REGLAGE_COLS.includes("bulles_s") && DATA.normaliserReglages({}).bulles_s === 90);
  check("et Parametres le saisit en minutes et secondes",
    html.includes('id="param-bulles-min"') && html.includes('id="param-bulles-sec"'));
  const saisieJs = readFileSync(join(ROOT, "js/ui-saisie.js"), "utf8");
  check("chaque estimation de la saisie passe le repere des bulles",
    (saisieJs.match(/(temperatureDepuisChauffe|chauffePourTemperature)\(/g) || []).length ===
    (saisieJs.match(/(temperatureDepuisChauffe|chauffePourTemperature)\([^)]*replis\.bulles\)/g) || []).length);

  // Une extraction normalisee garde le temps, et une Brikka n'en a jamais.
  const n = DATA.normaliserExtraction({ chauffe_s: "215.4" });
  check("le temps de chauffe est arrondi a la seconde et garde", n.chauffe_s === 215);
  check("vide reste vide, jamais zero", DATA.normaliserExtraction({}).chauffe_s === "");
  const app = SOURCE_UI;
  check("la saisie n'enregistre un temps de chauffe qu'en Switch",
    /chauffe_s: saisie\.methode === "Switch" \? lireDuree\("f-chauffe"\) : ""/.test(app));
  check("la ligne de chauffe est masquee sur la Brikka", /ligne-chauffe"\)\.hidden = m !== "Switch"/.test(app));
  check("les textes de l'aide sont bilingues",
    bilingue("temp_estimee") && bilingue("temp_conseil") && bilingue("temp_sans_bouilloire") && bilingue("d_chauffe") && bilingue("t_param_ebullition"));
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
  const app = SOURCE_UI;
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

  const app = SOURCE_UI;
  /* Sauf la recette dont la mouture sort EXPRES de la plage de sa machine
     (la Neo Brew, v8.63) : son extra gros est la recette elle-meme. */
  check("le prefill lit le reglage du broyeur, pas le dial de la recette",
    app.includes('$("#f-mouture").value = cafeCourantMoulu() ? "" : moletteVoulue(r) ? r.dial : replis.molette;'));
  check("et seule une recette hors plage de sa machine impose sa molette",
    app.includes("!GRIND.verifierPlage(r.methode, r.dial).ok"));
  check("le reglage d'usine est le compromis des deux machines",
    app.includes('MOLETTE_REPLI_USINE = "1.5.0"'));
}

/* Le bouton Saisie de la navigation continuait une MODIFICATION en cours :
   Chris ouvrait une extraction depuis l'historique, allait ailleurs, revenait
   par l'onglet, et le formulaire ecrasait l'extraction passee en croyant creer
   une tasse. Perte de donnees silencieuse. */
{
  const app = SOURCE_UI;
  check("arriver sur Saisie par la navigation abandonne l'edition",
    app.includes('if (nom === "saisie" && UI.saisie.editId && !pourEdition)'));
  check("l'abandon est annonce, il n'est pas silencieux",
    app.includes('t_edition_abandonnee'));
  /* L'exception legitime passe par un PARAMETRE, plus par un drapeau partage.
     Le drapeau etait pose avant quarante lignes et retire apres, sans finally :
     une exception au milieu le laissait a true pour toujours, et l'abandon
     d'edition ne se declenchait plus jamais. Chris rouvrait alors une ancienne
     extraction en croyant en saisir une nouvelle. Un parametre ne peut pas
     rester coince, il meurt avec l'appel. */
  check("l'exception passe par un parametre, pas par un etat partage",
    !app.includes("ouvertureEdition"), "ouvertureEdition existe encore");
  check("et seule l'ouverture d'une edition la demande",
    app.includes('activerEcran("saisie", true)') &&
    (app.match(/activerEcran\([^)]*,\s*true\)/g) || []).length === 1,
    (app.match(/activerEcran\([^)]*,\s*true\)/g) || []).join(", "));

  /* Les appels a activerEcran qui SUIVAIENT chargerExtractionDansSaisie sont
     partis : la fonction ouvre deja l'ecran, et le rappel reinitialisait
     desormais l'edition qu'on venait d'ouvrir. */
  check("plus aucun activerEcran redondant apres un chargement d'extraction",
    !/chargerExtractionDansSaisie\([^)]*\);\s*\n\s*activerEcran\("saisie"\)/.test(app));

  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("le message d'abandon existe en FR et EN", bilingue("t_edition_abandonnee"));
}

/* Molette unique : Chris ne recompte pas les crans a chaque machine. */
{
  /* Une exception, voulue : la Tetsu Neo Brew (v8.63), extra grosse, hors de la
     plage du Switch. Toute autre recette porte 1.5.0, et l'exception doit
     vraiment sortir de la plage, sinon elle n'aurait aucune raison d'etre. */
  const exceptions = RECETTES_DEPART.filter(r => r.dial !== "1.5.0");
  check("toutes les recettes semees portent 1.5.0, sauf la Neo Brew",
    exceptions.map(r => r.id).join() === "neo-brew", exceptions.map(r => r.id + " " + r.dial).join(", "));
  check("et la Neo Brew sort vraiment de la plage du Switch",
    exceptions.every(r => GRIND.parseDial(r.dial).crans > GRIND.METHODES.find(m => m.id === "switch").maxC));

  // Changer la graine ne suffit jamais : les recettes STOCKEES doivent suivre.
  const data = SOURCE_DATA;
  check("un pas de schema rattrape la molette des recettes stockees",
    data.includes("molette unique a 1.5.0"));
  check("elle ne se limite pas a la Brikka, les Switch aussi sont concernees",
    /molette unique a 1\.5\.0[\s\S]{0,300}state\.recettes\.forEach/.test(data));
}

/* Le cadre est pose UNE fois, sur .ecran : largeur maximale et centrage. Aucun
   #ecran-* ne doit poser de largeur ni de marge : une regle d'identifiant bat la
   classe, et c'est ainsi que l'historique s'est retrouve cale a gauche par un
   margin-left: 0 herite d'un ancien elargissement, pendant que ses voisins
   etaient centres. Regle generale, pas correction ponctuelle. */
{
  // Sans les commentaires : un commentaire qui cite #ecran-saisie n'est pas une regle.
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const cadre =(css.match(/\.ecran \{([^}]*)\}/g) || []).join(" ");
  check("le cadre commun borne et centre tous les ecrans",
    /max-width:\s*var\(--cadre\)/.test(cadre) && /margin-inline:\s*auto/.test(cadre), cadre);
  const fautifs = [];
  const re = /([^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (!/#ecran-[\w-]+\s*(,|$)/.test(sel)) continue;
    if (/(^|[^-])(width|max-width|margin|margin-left|margin-right|margin-inline)\s*:/.test(m[2])) fautifs.push(sel);
  }
  check("aucun ecran ne pose sa propre largeur ni sa propre marge", fautifs.length === 0, fautifs.join(" | "));
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
  /* La phrase du guide doit suivre les donnees. On la relit et on compare, au
     lieu de figer les deux cotes : sinon fusionner deux recettes laisse un guide
     qui ment, et c'est le genre d'ecart que personne ne va verifier. */
  const MOTS = ["Zéro", "Une", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf", "Dix"];
  const annonce = MOTS[nbBrikka] + " recettes Brikka et " + MOTS[nbSwitch].toLowerCase() + " recettes Switch.";
  check("le guide annonce le bon nombre de recettes",
    html.includes(annonce), "attendu : " + annonce);
  check("le vieux recapitulatif de mouture par recette a disparu",
    !html.includes("Récapitulatif mouture des recettes Switch"));
  check("les reperes de reference ne parlent plus de numeros de recette",
    !html.includes("Switch recettes 1 et 2") && !html.includes("Switch recettes 5 et 6"));
}

/* Les recettes STOCKEES ne suivent jamais la graine toutes seules : sans
   migration, Chris aurait continue a lire 225 g sur son site. */
{
  const data = SOURCE_DATA;
  check("un pas de schema rattrape les Chronicler stockees",
    data.includes("Chronicler a 240 g"));
  check("elle ne vise que la famille concernee et la mauvaise valeur",
    /Chronicler a 240 g[\s\S]{0,300}famille !== "chronicler"[\s\S]{0,80}225/.test(data));
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
  /* Depuis la v8.40, « pas encore notée » est l'etat du curseur lui meme :
     pas de pouce tant qu'on n'y a pas touche. Il doit partir dans cet etat,
     dans la saisie comme dans la saisie rapide, et la case a disparu. */
  check("le curseur de note part sans pouce, dans les deux saisies",
    /<input[^>]*id="f-note"[^>]*class="[^"]*curseur-inactif/.test(html) &&
    /<input[^>]*id="q-note"[^>]*class="[^"]*curseur-inactif/.test(html));
  check("la case pas encore notee a disparu", !/note-vide/.test(html));
  /* Mais plus de second look (v8.68) : la classe est un etat, pas un style.
     Pointille et pouce cache faisaient deux curseurs differents. */
  const cssNote = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  check("la note non donnee n'a plus de style a part", !/\.curseur-inactif\s*[:{,]/.test(cssNote));
  check("le curseur ne suggere plus 7",
    /<input[^>]*id="f-note"[^>]*value="5"/.test(html));

  const app = SOURCE_UI;
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
  check("valeurs d'usine : 15 g, feu 3, molette 1.5.0",
    parDefaut.dose_g === 15 && parDefaut.puissance_feu === 3 && parDefaut.mouture_dial === "1.5.0",
    JSON.stringify(parDefaut));
  check("une seule ligne, d'id fixe", parDefaut.id === DATA.REGLAGE_ID);

  // Ce qui arrive du reseau n'est pas digne de confiance : on borne tout.
  const absurde = DATA.normaliserReglages({ dose_g: -5, puissance_feu: 99, mouture_dial: "nawak" });
  check("une dose negative retombe sur la valeur d'usine", absurde.dose_g === 15, String(absurde.dose_g));
  check("un feu hors echelle retombe sur la valeur d'usine", absurde.puissance_feu === 3);
  check("une molette invalide retombe sur la valeur d'usine", absurde.mouture_dial === "1.5.0");
  /* 5 et non 3 : 3 est devenu la valeur d'usine, et un controle qui verifie
     qu'une valeur passe telle quelle ne prouve rien si c'est aussi celle qu'on
     obtient en cas d'echec. */
  const bon = DATA.normaliserReglages({ dose_g: 16, puissance_feu: 5, mouture_dial: "1.2.0" });
  check("des valeurs valides passent telles quelles",
    bon.dose_g === 16 && bon.puissance_feu === 5 && bon.mouture_dial === "1.2.0", JSON.stringify(bon));

  // maj_le preserve, jamais restampe a la lecture : meme regle que partout.
  check("maj_le est preserve tel quel", DATA.normaliserReglages({ maj_le: 1234 }).maj_le === 1234);

  // Et surtout : maj_le ne doit pas fuir dans le CSV.
  const csv = DATA.csvSerialiser([{ id: "moi", maj_le: 1699999999999, dose_g: 16 }], DATA.REGLAGE_COLS);
  check("entete reglages.csv", csv.split("\n")[0] === "id,dose_g,puissance_feu,mouture_dial,schema_version,ebullition_s,pas_crans,pas_degres,pas_feu,pas_eau_g,pas_dose_g,dessins,bulles_s",
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
  const app = SOURCE_UI;
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
  const app = SOURCE_UI;
  check("la fiche cafe porte un cout par tasse", app.includes("function coutParTasse"));
  check("il utilise la dose moyenne du cafe, pas la dose de repli",
    app.includes("coutTasse = doseTypique"));

  /* Le second chiffre, pour les cafes NON PURS : le Sang Tao est a 82 % de cafe,
     donc bien plus cher au gramme de VRAI cafe qu'il n'en a l'air. Le champ
     pourcentage_cafe_reel ne servait qu'au calcul de cafeine. */
  check("le cafe non pur montre son cout reel", app.includes("cout_reel"));
  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("les deux libelles existent en FR et EN",
    bilingue("cout_tasse") && bilingue("cout_reel"));

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
  const app = SOURCE_UI;
  const bloc = app.slice(app.indexOf("async function supprimerExtractionAvecRetour"),
    app.indexOf("async function supprimerExtractionAvecRetour") + 700);

  /* LE point : la suppression precede le message, elle n'est pas retardee.
     Si un setTimeout entourait la suppression, fermer l'onglet l'annulerait. */
  check("la suppression est faite AVANT d'afficher le retour arriere",
    bloc.indexOf("supprimerExtraction(") < bloc.indexOf("toastAction("),
    String(bloc.indexOf("supprimerExtraction(")) + " contre " + String(bloc.indexOf("toastAction(")));
  check("aucun delai n'entoure la suppression elle meme", !bloc.includes("setTimeout"));

  check("le confirm natif de suppression a disparu", !app.includes('confirm(I18N.t("c_suppr"))'));
  /* Plus AUCUN confirm() natif dans l'interface : les quatre restants (demo,
     vider, retablir, supprimer une recette) passent par UI.confirmer, un
     <dialog> de la page. Seul le repli de confirmer() lui-meme, `window.confirm`,
     a le droit d'exister, et il est precede d'un point. */
  // Les commentaires expliquent justement ce qu'on a retire : on les ignore.
  const code = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const natifs = [...code.matchAll(/(^|[^.\w])confirm\(/g)];
  check("aucun confirm() natif ne reste dans l'interface", natifs.length === 0, String(natifs.length));
  check("les quatre questions passent par le dialogue de la page",
    (code.match(/await (?:UI\.)?confirmer\(/g) || []).length === 4);
  check("les libelles du dialogue sont bilingues", bilingue("c_titre") && bilingue("c_ok"));
  check("le retour arriere restaure sous l'id d'origine", app.includes("DATA.restaurerExtraction"));

  const data = SOURCE_DATA;
  const rest = data.slice(data.indexOf("async function restaurerExtraction"),
    data.indexOf("async function ajouterExtraction"));
  /* L'id d'origine compte : les liens d'edition, la selection du comparateur et
     les references de l'historique pointent dessus. */
  check("restaurerExtraction garde l'id", rest.includes("e.id = ext.id"));
  check("elle estampille, donc elle bat la pierre tombale", rest.includes("estampiller("));
  check("elle remplace la ligne si elle est deja la, sinon elle l'ajoute",
    rest.includes("findIndex") && rest.includes("push(e)"));

  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("le bouton Annuler existe en FR et EN", bilingue("t_annuler"));
  check("le message de retablissement aussi", bilingue("t_restauree"));
}

/* ACCESSIBILITE DES BASCULES. 70 boutons et zero aria-pressed : l'etat se voyait
   au fond colore mais rien ne l'ANNONCAIT. Un lecteur d'ecran lisait "bouton
   chocolat noir" sans jamais dire s'il etait coche. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const app = SOURCE_UI;

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

/* CHART.JS A LA DEMANDE. 68 Ko gzippes, 30 % du poids du site, pour un seul
   ecran. Ouvrir sur Saisie, Historique ou Guide ne doit plus rien telecharger de
   tout ca : la heatmap et la reglette du moulin sont du SVG maison. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("Chart.js n'est plus une balise script", !html.includes("chart.umd.js"));

  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  /* Toujours PRECACHEE : le chargement differe doit marcher hors ligne, il lit
     alors le cache au lieu du reseau. */
  check("mais elle reste precachee pour le hors ligne", sw.includes("chart.umd.js"));

  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  check("charts.js sait la charger lui meme", charts.includes("function chargerChart"));
  /* Un seul point d'entree : toutes les fonctions Chart.js passent par creer(),
     donc la file d'attente les couvre toutes sans exception. */
  check("le chargement passe par creer(), point d'entree unique",
    /function creer[\s\S]{0,300}chargerChart\(\)/.test(charts));
  /* La file garde le DERNIER appel par canvas : pendant le telechargement un
     rendu peut etre redemande, rejouer le premier afficherait un graphe perime. */
  check("la file garde le dernier appel par canvas", charts.includes("enAttente.set(idCanvas"));
  check("un echec de chargement ne casse pas le tableau de bord",
    /onerror[\s\S]{0,120}resolve\(false\)/.test(charts));
  /* appliquerDefauts touche Chart.defaults : muette sans la bibliotheque, et
     rejouee des son arrivee. */
  check("appliquerDefauts se tait sans la bibliotheque",
    /function appliquerDefauts[\s\S]{0,200}typeof Chart === "undefined"/.test(charts));

  // Le SVG maison ne doit surtout pas etre passe par la file.
  const svg = charts.slice(charts.indexOf("function heatmap"), charts.indexOf("function attacherTooltips"));
  check("la heatmap et la reglette restent independantes de Chart.js",
    !svg.includes("creer("), "du SVG maison passe par creer()");
}

/* DECOUPAGE DE L'I18N PAR LANGUE. Le francais chargeait 29 Ko gzippes d'anglais
   qu'il ne consulte jamais : tr(), diag(), tag() et compagnie renvoient leur
   entree telle quelle en francais, et les gabarits se rabattent sur leur moitie
   francaise. Le risque du decoupage est une cle oubliee : elle ne leve aucune
   erreur, elle affiche du francais en mode anglais. */
{
  const fr = I18N_FR_SRC, en = I18N_EN_SRC;

  // Toute cle de gabarit doit exister des DEUX cotes.
  const clesFr = [...fr.matchAll(/^ {4}([a-z_0-9]+): \{ fr:/gm)].map(m => m[1]);
  const clesEn = [...en.matchAll(/^ {4}([a-z_0-9]+): "/gm)].map(m => m[1]);
  check("il y a bien quelques centaines de gabarits", clesFr.length > 250, String(clesFr.length));
  const sansAnglais = clesFr.filter(k => !clesEn.includes(k));
  check("aucun gabarit ne perd sa moitie anglaise", sansAnglais.length === 0,
    sansAnglais.slice(0, 6).join(", "));
  const orphelins = clesEn.filter(k => !clesFr.includes(k));
  check("aucune traduction anglaise ne pointe dans le vide", orphelins.length === 0,
    orphelins.slice(0, 6).join(", "));

  /* Les dictionnaires cle FR vers valeur EN sont VIDES cote francais : c'est tout
     le gain. S'ils se remplissaient a nouveau, le decoupage ne servirait plus. */
  ["UI", "DIAG", "TAGS", "GROUPES"].forEach(nom => {
    check("le dictionnaire " + nom + " est vide en francais",
      new RegExp("const " + nom + " = \\{\\};").test(fr));
    check("et rempli dans le paquet anglais", new RegExp("^  " + nom + ": \\{", "m").test(en));
  });

  /* La langue enregistree ne doit PAS etre appliquee au chargement du fichier :
     sans le paquet, la page se declarerait anglaise et rendrait du francais par
     repli, sans que rien ne le corrige jamais. */
  check("la langue voulue est memorisee, pas appliquee", fr.includes("langueSouhaitee"));
  check("c'est preparer() qui tranche, une fois le paquet la", fr.includes("function preparer"));
  const app = SOURCE_UI;
  check("et le demarrage l'attend avant le premier rendu",
    /async function demarrer[\s\S]{0,300}await I18N\.preparer/.test(app));

  // Le paquet doit rester precache, sinon la bascule casse hors ligne.
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  check("le paquet anglais est precache", sw.includes("i18n.en.js"));
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("mais il n'est pas une balise script", !html.includes("i18n.en.js"));
}

/* REACTIVITE : ne pas refaire ce qui n'a pas change.

   Deux gaspillages mesures. Les filtres de l'historique regeneraient tout le
   tableau a CHAQUE caractere, et le convertisseur du moulin redessinait 151
   traits SVG a chaque frappe et a chaque cran du curseur. Et surtout, chaque
   sauvegarde d'extraction reconstruisait cinq listes deroulantes et les dix
   cartes de recettes, alors qu'enregistrer une tasse ne change ni les cafes ni
   les recettes. */
{
  const app = SOURCE_UI;

  check("un anti-rebond existe", app.includes("function antiRebond"));
  // Depuis que chaque ecran cable ses propres controles (v7.86), l'appel est
  // local au fichier de l'ecran : plus de prefixe UI.
  check("les filtres de l'historique passent par lui",
    /addEventListener\("input", (UI\.)?rendreHistoriqueDifferee\)/.test(app));
  check("le convertisseur du moulin aussi",
    /addEventListener\("input", (UI\.)?rendreConvertisseurDifferee\)/.test(app));
  /* Le curseur du moulin, LUI, est redevenu immediat en v7.61. Son anti-rebond
     couvrait un redessin complet du SVG a chaque cran ; le squelette de la
     reglette n'etant plus reconstruit, il ne restait que l'attente. Le controle
     est inverse a dessein : il empeche de le remettre par reflexe. */
  check("le curseur du moulin repond immediatement",
    /conv-slider[\s\S]{0,600}(UI\.)?rendreConvertisseur\(\)/.test(app) &&
    !/conv-slider[\s\S]{0,600}rendreConvertisseurDifferee/.test(app));

  /* Les autres appels a rendreHistorique restent IMMEDIATS : suppression, tri,
     retour d'edition suivent un geste unique, il n'y a rien a regrouper. */
  check("le rendu immediat reste disponible", app.includes("function rendreHistorique("));

  // La garde par signature.
  check("une signature de table existe", app.includes("function signatureTable"));
  check("elle couvre les modifications ET les suppressions",
    /function signatureTable[\s\S]{0,260}maj_le[\s\S]{0,120}length/.test(app));
  check("le rendu des recettes est garde", /siChange\("recettes"/.test(app));
  check("celui des cafes aussi", /siChange\("cafes"/.test(app));
  check("celui des tasses aussi", /siChange\("tasses"/.test(app));

  /* LE piege : la bascule de langue ne change aucune donnee, donc aucune
     signature, mais tout le texte doit etre refait. Sans invalidation, passer en
     anglais laisserait les recettes et les listes en francais. */
  check("la bascule de langue invalide les memoires",
    /function rafraichirLangue[\s\S]{0,200}oublierSignatures\(\)/.test(app));

  // Les badges et l'etat de synchro restent inconditionnels : ils sont minuscules
  // et refletent l'instant present.
  check("les badges se refont toujours", /DATA\.abonner[\s\S]{0,400}majBadges\(\);/.test(app));
}

/* MODERNITE ET CONFORT. Rien ici ne doit dependre d'une fonctionnalite recente
   pour marcher : chaque ajout a un repli, et le repli est le comportement
   d'avant, pas une version degradee. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const app = SOURCE_UI;
  const html = readFileSync(join(ROOT, "index.html"), "utf8");

  /* MOUVEMENT REDUIT. Cinq animations et vingt et une transitions, rien ne les
     coupait. Pour qui souffre de troubles vestibulaires, une interface qui bouge
     donne la nausee. */
  check("le mouvement reduit est respecte", css.includes("prefers-reduced-motion"));
  /* 0.01ms et pas 0 : certaines animations ont un gestionnaire de fin qu'une
     duree nulle peut empecher de se declencher. */
  check("les durees tombent a 0.01ms, pas a zero", css.includes("0.01ms"));
  check("les transitions de vue le respectent aussi",
    /prefers-reduced-motion[\s\S]{0,400}view-transition/.test(css));
  check("et le code ne lance pas la machinerie pour rien",
    /function avecTransition[\s\S]{0,300}prefers-reduced-motion/.test(app));

  /* Le repli des transitions de vue doit etre l'appel DIRECT, pas un cas mort. */
  check("sans l'API, le changement d'ecran se fait quand meme",
    /startViewTransition\) \{ fn\(\); return; \}/.test(app));

  check("le rendu hors ecran est differe", css.includes("content-visibility: auto"));
  /* Sans hauteur estimee, la barre de defilement saute pendant qu'on descend. */
  check("avec une hauteur estimee pour ne pas faire sauter le defilement",
    css.includes("contain-intrinsic-size"));
  check("les titres evitent la ligne orpheline", css.includes("text-wrap: balance"));

  // Recherche texte dans l'historique.
  check("un champ de recherche existe", html.includes('id="h-recherche"'));
  /* En francais, une recherche sans normalisation des accents est inutilisable :
     taper brule doit trouver brule accentue. */
  check("elle ignore les accents", app.includes("function sansAccents") && app.includes("NFD"));
  check("elle cherche dans ce que Chris a ecrit",
    /function texteCherchable[\s\S]{0,260}commentaire[\s\S]{0,120}descripteurs/.test(app));
  check("elle se reinitialise avec les autres filtres",
    /h-reinitialiser[\s\S]{0,200}FILTRES\.forEach/.test(app) &&
    /const FILTRES = \[[^\]]*"h-recherche"/.test(app));

  // Reprise reseau et Echap.
  check("la synchro repart quand le reseau revient", /addEventListener\("online"/.test(app));
  check("Echap ferme ce qui est ouvert", /ev\.key !== "Escape"/.test(app));

  /* Le voile de chargement doit etre dans le HTML : cree en JS, il n'apparaitrait
     qu'apres l'execution des scripts, donc trop tard pour servir a quelque chose. */
  check("le voile de chargement est dans le HTML", html.includes('id="chargement"'));
  check("et il est retire une fois le premier ecran rendu", app.includes('$("#chargement")'));
}

/* TRAVAIL A LA FRAPPE ET AU RENDU.

   majLive tourne a CHAQUE caractere tape dans la dose, l'eau, la mouture ou le
   volume : elle faisait 18 recherches DOM et 4 ecritures innerHTML a chaque fois,
   alors que la plupart des frappes ne changent aucune des quatre zones. */
{
  const app = SOURCE_UI;
  const l = app.split("\n");
  const i = l.findIndex(x => x.includes("function majLive() {"));
  let f = i;
  for (let n = i + 1; n < l.length; n++) if (l[n] === "  }") { f = n; break; }
  const corps = l.slice(i, f).join("\n");

  check("majLive ne fait plus de recherche DOM non cachee",
    (corps.match(/[$]\("/g) || []).length === 0,
    String((corps.match(/[$]\("/g) || []).length));
  check("et plus aucune ecriture innerHTML directe",
    !corps.includes("innerHTML ="), "une affectation directe subsiste");
  check("les ecritures passent par une garde qui compare avant d'ecrire",
    /function poser\(el, html\)[\s\S]{0,120}innerHTML !== html/.test(app));

  /* Le cache ne vaut QUE pour les noeuds statiques d'index.html : un noeud issu
     d'un innerHTML serait mis en cache detache et les ecritures partiraient dans
     le vide. Le commentaire doit le dire, c'est le seul garde-fou possible. */
  check("le cache previent contre son mauvais usage",
    /function [$]f[\s\S]{0,80}/.test(app) && app.includes("jamais remplac"));

  /* Les pilules : 69 descripteurs plus 16 diagnostics reattaches a chaque
     bascule de langue et a chaque remise a zero du formulaire. */
  check("les clics des pilules sont delegues au conteneur",
    app.includes("function brancherPilules"));
  check("et construirePilules ne reattache plus rien",
    !/construirePilules[\s\S]{0,900}f-descripteurs \.tag"\)\.forEach\(b => b\.addEventListener/.test(app));
  /* Pose UNE FOIS au cablage : les conteneurs survivent aux reconstructions,
     la poser depuis le rendu empilerait un jeu d'ecouteurs par bascule. */
  check("la delegation est posee au cablage",
    /function cabler[\s\S]*brancherPilules\(\)/.test(app));

  // enterkeyhint : la touche de validation du clavier mobile.
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const hints = (html.match(/enterkeyhint=/g) || []).length;
  check("les champs annoncent leur touche de validation", hints >= 30, String(hints));
  /* Pas de "send" : le formulaire ne se soumet pas a la touche entree,
     l'annoncer serait mentir au clavier. */
  check("aucun ne promet un envoi qui n'existe pas", !html.includes('enterkeyhint="send"'));
}

/* UNE COULEUR, UNE SERIE.

   Le graphique principal empilait quatre series et n'avait que trois couleurs :
   la ligne des grammes de cafe et la courbe de tendance des notes portaient
   toutes deux #1baf7a, le vert reserve aux "deux machines". Elles etaient donc
   indistinguables l'une de l'autre, et vertes sans aucune raison, sur une
   palette entierement chaude.

   Le vert garde son role ailleurs : le comparatif des machines, et "Equilibre"
   dans l'anneau des diagnostics. Ce qu'on verrouille ici, c'est qu'il ne
   reparte pas colorer une serie a laquelle il ne veut rien dire. */
{
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  const bloc30j = charts.slice(charts.indexOf("function barresEtLigne30j"),
    charts.indexOf("function barresHorizontales"));

  check("le graphique principal n'emprunte plus le vert des machines",
    !bloc30j.includes("C_DEUX"), "C_DEUX y est encore");

  // Chaque serie tire sa couleur d'un jeton different.
  const teintes = [...bloc30j.matchAll(/borderColor: cssVar\("(--[\w-]+)"\)/g)].map(m => m[1]);
  check("chaque courbe a sa propre couleur",
    teintes.length === 2 && new Set(teintes).size === 2, teintes.join(", "));
  /* Les paves prennent la couleur de leur cafe (v8.61) : cinq jetons, lus par le
     graphe ET par la legende, pour que les deux disent la meme chose. */
  const cssCafes = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  check("les cinq teintes de cafe sont des jetons",
    [1, 2, 3, 4, 5].every(n => cssCafes.includes("--cafe-" + n + ":")) && bloc30j.includes('cssVar("--cafe-" + n)'));
  check("et le tableau de bord passe les cafes au graphe, avec leur legende",
    SOURCE_UI.includes("UI.rendreCafes30j(exts)") && readFileSync(join(ROOT, "index.html"), "utf8").includes('id="legende-30j"'));
  /* La courbe des grammes est partie : quatrieme serie sur un graphique qui en
     portait deja trois, sur un axe cache de surcroit, elle chargeait la vue sans
     etre lisible. Le chiffre vit maintenant dans l'infobulle. */
  check("la courbe des grammes ne surcharge plus le graphique",
    !bloc30j.includes("l_cafe_g") && !bloc30j.includes("y3:"));
  check("mais le chiffre reste consultable dans l'infobulle",
    SOURCE_UI.includes("tip_cafe_g"));

  /* La tendance LISSE la ligne des notes : meme mesure, meme axe. Elle doit
     porter la teinte de l'accent, sinon elle se lit comme une donnee de plus.
     C'est ce que disait deja son commentaire, et que sa couleur contredisait. */
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  check("et la reglette du convertisseur garde sa couleur de defaut",
    css.includes("--tendance"));
  const tendances = [...css.matchAll(/--tendance: ([^;]+);/g)].map(m => m[1].trim());
  // Un par palette : clair, Graphite et Nuit (v8.34).
  check("la tendance existe dans les trois palettes", tendances.length === 3, tendances.join(" | "));
  check("et elle est translucide, pour se lire comme un fond",
    tendances.every(t => {
      const m = t.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
      return !!m && Number(m[1]) < 0.6;
    }),
    tendances.join(" | "));
  /* --grammes est mort avec la courbe des grammes en v7.68. Une variable morte
     dans une palette est un piege pour la prochaine lecture. */
  check("la teinte des grammes est partie avec la courbe",
    !css.includes("--grammes"), "elle traine encore dans la palette");

  /* Pas de rouge : dans ce site le rouge est --danger, il annonce une mauvaise
     nouvelle. Une tendance de notes qui monte est une bonne nouvelle. */
  check("aucune serie du graphique principal n'emprunte la couleur de danger",
    !bloc30j.includes("--danger"));
}

/* INTEGRITE DU DOCUMENT.

   Le champ de recherche de l'historique s'est retrouve ecrit DEUX FOIS, avec le
   meme id, range dans le groupe "Cafe" sous le label de la liste des cafes. Rien
   ne le signale : le navigateur affiche les deux champs sans broncher,
   querySelector prend le premier, aucun test ne leve quoi que ce soit, et le
   site a simplement l'air bizarre. C'est Chris qui l'a vu, pas les tests.

   Ces controles sont bon marche et attrapent toute la famille. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const doubles = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  check("aucun identifiant en double dans la page", doubles.length === 0, doubles.join(", "));

  // Deux lignes de balisage identiques et collees : la signature d'un doublon.
  const lignes = html.split("\n");
  const collees = lignes
    .map((x, i) => (x.trim().length > 20 && x === lignes[i - 1] ? i + 1 : 0))
    .filter(Boolean);
  check("aucune ligne de balisage dupliquee a l'identique",
    collees.length === 0, "lignes " + collees.join(", "));

  const connus = new Set(ids);
  const perdus = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)]
    .map(m => m[1]).filter(f => !connus.has(f));
  check("chaque label pointe sur un champ qui existe", perdus.length === 0, perdus.join(", "));

  /* Un .champ ne doit pas contenir plusieurs controles ETIQUETABLES sous une
     seule etiquette. Les paires legitimes (minutes et secondes, valeur et
     preselection) sont listees : elles forment un seul controle aux yeux de
     l'utilisateur, et partagent donc une etiquette a juste titre. */
  const PAIRES = ["f-chauffe-min", "f-chauffe-sec", "f-total-sec", "f-ecoulement-sec",
    "param-ebullition-sec", "param-bulles-sec"];
  /* Un curseur nomme "X-curseur" pilote le champ "X" : c'est la MEME valeur
     montree deux fois, donc une paire legitime par construction. La regle vaut
     mieux qu'une liste a rallonger a chaque curseur ajoute, puisque c'est le
     nommage qui garantit l'appartenance. */
  const estCurseurDeSonChamp = (id, voisins) =>
    id.endsWith("-curseur") && voisins.includes(id.slice(0, -"-curseur".length));
  const melanges = [];
  for (const m of html.matchAll(/<div class="champ[^"]*">([\s\S]*?)<\/div>/g)) {
    const tous = [...m[1].matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(x => x[1]);
    const controles = tous
      .filter(id => !PAIRES.includes(id) && !estCurseurDeSonChamp(id, tous));
    if (controles.length > 1) melanges.push(controles.join(" + "));
  }
  check("aucun groupe de champ ne melange deux controles sans rapport",
    melanges.length === 0, melanges.join(" ; "));
}

/* COUVERTURE DE L'ANGLAIS SUR LES ATTRIBUTS DE TEXTE.

   Le parcours de traduction ne voit que des noeuds de TEXTE. Les fonds de champ,
   les infobulles et les etiquettes de lecteur d'ecran sont des attributs :
   quatorze restaient en francais en mode anglais, dont celle que le lecteur
   d'ecran annonce en tout premier. Ils passent maintenant par le dictionnaire,
   mais rien n'empeche d'ajouter demain un title francais sans sa traduction, et
   personne ne s'en apercevrait avant de basculer la langue.

   Ce controle echoue tant qu'un attribut francais n'a pas son entree. C'est
   volontairement strict : l'anglais est soit complet, soit menteur. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const en = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  const paquet = new Function("return " + en.slice(en.indexOf("{"), en.lastIndexOf("}") + 1))();

  /* getAttribute rend le texte DECODE, le dictionnaire doit donc porter la
     version decodee. Le fond du champ etapes ecrit ses fins de ligne en &#10;. */
  const decode = s => s
    .replace(/&#10;/g, "\n").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

  const manquants = [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)]
    .map(m => decode(m[1]))
    // Un fond purement numerique ("0", "1.5.0", "00") n'a rien a traduire.
    .filter(v => /[a-zA-ZÀ-ÿ]{4}/.test(v))
    .filter(v => !paquet.UI[v]);

  check("chaque infobulle et fond de champ a sa traduction",
    manquants.length === 0, [...new Set(manquants)].join(" | "));

  /* Le moteur doit vraiment couvrir les trois attributs. Un test de couverture
     qui verifie le dictionnaire sans verifier qui le lit ne prouve rien. */
  const i18n = readFileSync(join(ROOT, "js/i18n.js"), "utf8");
  check("le moteur traduit les trois attributs de texte",
    /\["placeholder", "title", "aria-label"\]/.test(i18n));
  check("et il ignore les zones que le JS regenere",
    /\[" \+ attr \+ "\][\s\S]{0,220}closest\(ZONES_JS\)/.test(i18n));
}

/* TOUT CHAMP DE TEXTE EST HABILLE.

   La barre de recherche de l'historique n'avait aucun style : la longue liste de
   selecteurs qui habille les champs enumere input[type="text"], number, date,
   datetime-local... et personne n'y avait ajoute "search" en creant le champ. Le
   navigateur rendait donc son controle par defaut, sans fond, sans bordure et
   sans rayon, au milieu de champs habilles. Rien ne le signale : le CSS est
   valide, la page se charge, c'est juste laid.

   Les types qui ne sont PAS du texte ont leur propre habillage ailleurs et n'ont
   rien a faire dans cette liste. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const APART = ["button", "submit", "checkbox", "radio", "range", "file", "hidden"];

  const utilises = [...new Set([...html.matchAll(/<input\b[^>]*\btype="([a-z-]+)"/g)].map(m => m[1]))]
    .filter(t => !APART.includes(t));

  /* On regarde LA liste qui habille les champs, celle qui se termine par
     "select, textarea {", et pas le fichier entier : un type peut apparaitre
     ailleurs dans une regle de detail, ce qui suffirait a faire passer le test
     alors que le champ est nu. C'est arrive en ecrivant ce test meme. */
  const finListe = css.indexOf("select, textarea {");
  /* La liste tient sur plusieurs lignes : on remonte jusqu'a la fin de la regle
     ou du commentaire precedent, sinon on n'attrape que sa derniere ligne et
     tous les types des lignes du dessus passent pour absents. */
  const debutListe = Math.max(css.lastIndexOf("}", finListe), css.lastIndexOf("*/", finListe));
  const liste = css.slice(debutListe, finListe);
  const nus = utilises.filter(t => !liste.includes('input[type="' + t + '"]'));
  check("chaque type de champ texte de la page est habille par le CSS",
    nus.length === 0, nus.join(", "));

  /* Le bloc des actions de l'historique ne se comporte pas comme un filtre. Il
     etait une cellule de la grille des filtres, large de 150 px : les deux
     boutons passaient a la ligne et "Exporter le filtre en CSV" se coupait
     dedans, d'ou un bloc haut et etroit. Depuis que les filtres sont en flex
     (pastilles), il se pousse a droite par margin-left: auto. */
  check("les actions de l'historique ne sont plus une colonne de filtre",
    /\.historique-filtres-actions \{[^}]*margin-left: auto/.test(css));
  check("et leurs libelles ne se coupent plus",
    /\.historique-filtres-actions \.btn \{[^}]*white-space: nowrap/.test(css));
}

/* L'INFOBULLE MAISON, DEFINIE UNE SEULE FOIS.

   Elle etait ecrite DEUX fois dans la feuille de style, aux selecteurs pres :
   une pour les pilules et les tags, une pour le ratio de la ligne live. Ajouter
   le commentaire des dernieres extractions aurait fait une troisieme copie, donc
   trois endroits a corriger le jour ou la bulle change. La regle porte
   maintenant sur l'ATTRIBUT data-info, et tout element qui le porte l'obtient. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const copies = (css.match(/content: attr\(data-info\)/g) || []).length;
  check("l'infobulle n'est definie qu'une fois", copies === 1, copies + " copies");
  check("et elle porte sur l'attribut, pas sur des classes",
    /\[data-info\]:hover::after/.test(css));
  // Un data-info vide ne doit pas ouvrir une bulle vide.
  check("un data-info vide n'ouvre rien", /\[data-info=""\]:hover::after/.test(css));
  /* Le commentaire est ECRIT sous sa ligne, dans les dernieres extractions comme
     dans l'historique : une bulle qui le repete au survol ne dit rien de plus.
     Chris la trouvait absurde (v8.33). */
  const tableau = readFileSync(join(ROOT, "js/ui-tableau.js"), "utf8");
  const historique = readFileSync(join(ROOT, "js/ui-historique.js"), "utf8");
  check("aucune bulle ne repete le commentaire deja ecrit",
    !/data-info="' \+ attrTitre\(e\.commentaire\)/.test(tableau + historique));
}

/* L'APPUI LONG N'AGIT PLUS EN PLUS D'EXPLIQUER.

   Sur telephone, l'appui long est le SEUL moyen d'ouvrir la bulle de definition
   d'un descripteur. Il ouvrait la bulle puis laissait partir le clic, qui
   selectionnait le descripteur : lire une definition la cochait. Le commentaire
   du code affirmait deja que ca ne devait pas arriver, sans que rien ne
   l'empeche. */
{
  const noyau = readFileSync(join(ROOT, "js/ui-noyau.js"), "utf8");
  const f = noyau.slice(noyau.indexOf("function activerAppuiLong"),
    noyau.indexOf("function", noyau.indexOf("function activerAppuiLong") + 10));
  check("l'appui long avale le clic qui le suit",
    /addEventListener\("click"[\s\S]{0,320}stopPropagation\(\)/.test(f));
  /* En CAPTURE : la capture precede la cible et la remontee, c'est ce qui permet
     d'empecher le gestionnaire delegue pose sur le meme conteneur. */
  check("en phase de capture, sinon le gestionnaire delegue passe avant",
    /addEventListener\("click",[\s\S]{0,400}\}, true\)/.test(f));
}

/* LES COULEURS DE MACHINE.

   Elles decrivent une MACHINE et rien d'autre. Le trio vient de la palette
   Okabe-Ito, la reference des couleurs sures pour le daltonisme : bleu,
   vermillon, rose-violet. "Les deux machines" portait un vert emeraude #1baf7a,
   sur lui aussi mais criard sur une palette entierement chaude, au point que
   Chris a demande a ne plus le voir.

   Ce controle empeche surtout le retour discret de l'emeraude par une couleur
   ecrite en dur quelque part. */
{
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  const grind = readFileSync(join(ROOT, "js/grind.js"), "utf8");
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const html = readFileSync(join(ROOT, "index.html"), "utf8");

  /* On cherche la couleur ECRITE, pas citee : les deux commentaires qui
     expliquent pourquoi elle est partie ont le droit de la nommer. */
  const enDur = [["js/charts.js", charts], ["js/grind.js", grind],
    ["css/styles.css", css], ["index.html", html]]
    .flatMap(([nom, src]) => src.split("\n")
      .filter(l => /#1baf7a/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/piquait|criard/.test(l))
      .map(l => nom + " : " + l.trim().slice(0, 60)));
  check("l'emeraude n'est plus utilisee nulle part", enDur.length === 0, enDur.join(" | "));
  /* LA REGLE, et non le seul #1baf7a : la refonte Comptoir interdit TOUTE
     teinte verte, y compris pour dire "bon". Un test ecrit sur une couleur
     laisse passer la suivante ; celui-ci refuse la bande verte du cercle des
     teintes, quel que soit le code choisi.

     On RETIRE les commentaires avant de chercher, plutot que d'exempter les
     lignes contenant certains mots : la premiere version de ce test exemptait
     toute ligne ou figurait "vert", si bien qu'une regle .essai-vert passait
     sans bruit. Un commentaire a le droit de nommer une couleur, le code non. */
  const sansCommentaires = source => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const estVert = n => {
    const [r, g, b] = [0, 2, 4].map(k => parseInt(n.slice(k, k + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const L = (mx + mn) / 2;
    if (!d) return false;
    const S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    /* Bande verte franche. Le gris sort par la saturation, les extremes clairs
       ou sombres par la luminosite : la, la teinte ne se voit plus. */
    return h >= 75 && h <= 165 && S > 0.15 && L > 0.15 && L < 0.85;
  };
  const vert = [["js/charts.js", charts], ["css/styles.css", css], ["index.html", html]]
    .flatMap(([nom, source]) => sansCommentaires(source).split("\n")
      .flatMap((l, i) => [...l.matchAll(/#([0-9a-f]{6})\b/gi)]
        .filter(m => estVert(m[1]))
        .map(m => nom + " ligne " + (i + 1) + " : #" + m[1])));
  check("aucune teinte verte nulle part, la DA Comptoir l'interdit",
    vert.length === 0, vert.slice(0, 5).join(" | "));

  /* LES POLICES SONT EMBARQUEES, ET COMPLETES.

     Trois oublis possibles, chacun silencieux : declarer une @font-face vers un
     fichier absent (le navigateur retombe sur Georgia sans rien dire), ajouter
     un fichier sans le precacher (la premiere ouverture hors ligne clignote),
     ou reintroduire un CDN (le site casse en file:// et hors ligne). */
  {
    const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
    const declarees = [...css.matchAll(/url\("fonts\/([^"]+)"\)/g)].map(m => m[1]);
    check("la feuille declare des polices embarquees", declarees.length > 0, String(declarees.length));

    const manquantes = declarees.filter(f => !existsSync(join(ROOT, "css/fonts", f)));
    check("chaque police declaree existe sur le disque",
      manquantes.length === 0, manquantes.join(" | "));

    const nonPrecachees = declarees.filter(f => !sw.includes("css/fonts/" + f));
    check("chaque police declaree est precachee par sw.js",
      nonPrecachees.length === 0, nonPrecachees.join(" | "));

    const surLeDisque = readdirSync(join(ROOT, "css/fonts")).filter(f => /\.woff2?$/.test(f));
    const orphelines = surLeDisque.filter(f => !declarees.includes(f));
    check("aucune police ne traine sans etre declaree",
      orphelines.length === 0, orphelines.join(" | "));

    const cdn = [["css/styles.css", css], ["index.html", html]]
      .filter(([, source]) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(source))
      .map(([nom]) => nom);
    check("aucune police n'est chargee depuis un CDN", cdn.length === 0, cdn.join(" | "));

    /* Le vietnamien est la raison d'etre du troisieme fichier Manrope : les
       cafes de Chris s'appellent Trung Nguyen Sang Tao et La Viet. */
    check("Manrope embarque le vietnamien, les cafes en ont besoin",
      declarees.some(f => /vietnamese/.test(f)), declarees.join(", "));
  }

  const trio = [...charts.matchAll(/const C_(?:BRIKKA|SWITCH|DEUX) = "(#[0-9a-f]{6})"/gi)].map(m => m[1]);
  check("les trois machines gardent trois couleurs distinctes",
    trio.length === 3 && new Set(trio).size === 3, trio.join(", "));
  check("et le repere du moulin suit la couleur des deux machines",
    grind.includes(trio[2] || "?"), trio[2]);
}

/* LES CONSEILS DE MOUTURE VONT DANS LE BON SENS.

   La recette "Brikka classique (eau prechauffee)" disait : "si l'ecoulement dure
   moins de 10 secondes, la mouture est trop fine : passer a 1.4.0". Or 1.4.0
   vaut 582 um et 1.5.0 en vaut 624 : le remede envoyait vers PLUS FIN alors que
   le diagnostic disait deja trop fin. Rien ne pouvait le signaler, un dial reste
   un dial, et suivre le conseil aggravait exactement le probleme constate.

   Ce controle est GENERAL : partout ou un texte diagnostique une mouture trop
   fine et prescrit un dial, ce dial doit etre plus GROSSIER que la reference, et
   inversement. */
{
  const recettes = new Function(readFileSync(join(ROOT, "js/recettes.js"), "utf8") +
    "\nreturn RECETTES_DEPART;")();
  // rotation.numero.cran, 5 crans par numero, 10 numeros par rotation.
  const crans = dial => {
    const p = String(dial).split(".").map(Number);
    return p.length === 3 && p.every(n => !isNaN(n)) ? p[0] * 50 + p[1] * 5 + p[2] : null;
  };

  const fautes = [];
  for (const r of recettes) {
    for (const champ of ["note", "pourQui", "ratioTexte", "totalTexte"]) {
      const txt = String(r[champ] || "");
      // "trop fine ... passer a X.Y.Z" et sa symetrie.
      for (const m of txt.matchAll(/trop (fine|grossi[eè]re)[^.]{0,120}?(\d+\.\d+\.\d+)/g)) {
        const vise = crans(m[2]), ref = crans(r.dial);
        if (vise === null || ref === null) continue;
        const plusGrossier = vise > ref;
        if (m[1] === "fine" && !plusGrossier) fautes.push(r.nom + " : trop fine mais renvoie vers " + m[2]);
        if (m[1] !== "fine" && plusGrossier) fautes.push(r.nom + " : trop grossiere mais renvoie vers " + m[2]);
      }
    }
  }
  check("un conseil de mouture ne renvoie jamais dans le sens du defaut",
    fautes.length === 0, fautes.join(" | "));

  /* La Brikka se remplit a l'EAU FROIDE, consigne Bialetti pour ce modele : sa
     soupape lestee est calibree sur cette montee en pression. L'eau prechauffee
     est la methode de la Moka Express, et la recette dite "classique"
     prescrivait 80 a 90 degres. */
  const classique = recettes.find(r => r.famille === "brikka-classique" && r.variante === "Standard");
  const etapes = (classique.etapes || []).map(e => e.texte).join(" ");
  check("la Brikka classique part a l'eau froide",
    /eau FROIDE/.test(etapes), etapes.slice(0, 90));
  check("et elle dit pourquoi, sinon le conseil se perd au premier doute",
    /Bialetti/.test(etapes) && /Moka Express/.test(etapes));

  /* La variante eau prechauffee applique VOLONTAIREMENT l'autre methode : sans
     le dire, la comparaison entre les deux serait faussee par un malentendu. */
  const variante = recettes.find(r => r.variante === "Eau préchauffée");
  check("la variante annonce qu'elle applique l'autre methode",
    /Moka Express/.test(String(variante.pourQui || "")));

  /* Le pas v5 a aligne les dix recettes sur 1.5.0 : un texte ne peut plus
     promettre "plus fin" sans dire que c'est un geste a faire a la main. */
  const promesses = recettes.filter(r => {
    const t = String(r.pourQui || "");
    /* Promettre "plus fin" est legitime SI le texte dit que c est un geste a
       faire a la main : ce qui ne l est pas, c est de le promettre comme si la
       fiche le portait, alors qu elle affiche 1.5.0 comme les neuf autres. */
    return /plus fin/.test(t) && !/à la main/.test(t) && r.dial === "1.5.0";
  });
  check("aucune recette ne promet une mouture qu'elle ne porte pas",
    promesses.length === 0, promesses.map(r => r.nom).join(", "));
}

/* LE GUIDE DIT CE QUE LES RECETTES FONT.

   Il expliquait ce QU'EST la torrefaction sans une ligne sur ce qu'il faut
   changer pour extraire, et ne mentionnait nulle part la difference d'eau entre
   la Brikka et la Moka Express, qui est pourtant la plus consequente a l'usage. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("le guide traite le niveau de torrefaction a l'extraction",
    html.includes("Clair, medium, foncé, quoi changer"));
  check("et la difference d'eau entre les deux machines",
    html.includes("Eau froide ou eau chaude, ça dépend de la machine"));
  // Les deux fiches doivent porter la meme consigne que les recettes.
  check("le guide et les recettes disent la meme chose sur l'eau",
    /La Brikka se remplit à l'EAU FROIDE/.test(html) && /Moka Express/.test(html));
}

/* TOUTE COLONNE DECLAREE DOIT ETRE SERIALISEE.

   csvSerialiser lit ligne[colonne] : une colonne presente dans RECETTE_COLS mais
   absente de recetteVersLigne sort donc VIDE, sans erreur ni avertissement.
   C'etait le cas de puissance_feu depuis qu'elle existe : exporter les recettes
   puis les relire effacait la cible de feu des dix recettes.

   Le controle porte sur la REGLE, pas sur ce cas : on serialise une recette
   reelle et on verifie qu'aucune colonne ne sort vide alors que la recette porte
   la valeur. */
{
  /* On part des recettes de la SEMENCE, normalisees : l'etat courant porte des
     fixtures laissees par les controles precedents, dont des objets bruts que la
     normalisation n'a jamais vus. Le sujet ici est le serialiseur, pas l'etat. */
  const recettes = RECETTES_DEPART.map(DATA.normaliserRecette);
  check("des recettes existent pour le controle", recettes.length > 0, String(recettes.length));

  /* On exporte, on relit, et on compare champ par champ. Un aller-retour est le
     seul test honnete : il traverse exactement le chemin qui perdait la donnee. */
  const etatAvant = DATA.state.recettes;
  DATA.state.recettes = recettes;
  const texte = DATA.csvRecettes ? DATA.csvRecettes() : null;
  DATA.state.recettes = etatAvant;
  if (texte) {
    const relues = DATA.csvParse(texte).map(DATA.normaliserRecette);
    const pertes = [];
    recettes.forEach(avant => {
      const apres = relues.find(x => x.id === avant.id);
      if (!apres) { pertes.push(avant.id + " disparue"); return; }
      ["nom", "dose", "eau", "dial", "puissance_feu", "volumeTypique", "lait", "actif"]
        .forEach(champ => {
          if (String(avant[champ] === undefined ? "" : avant[champ]) !==
              String(apres[champ] === undefined ? "" : apres[champ])) {
            pertes.push(avant.id + "." + champ + " : " + avant[champ] + " devient " + apres[champ]);
          }
        });
    });
    check("un aller-retour CSV ne perd aucun champ de recette",
      pertes.length === 0, pertes.slice(0, 4).join(" | "));
  } else {
    check("csvRecettes est exposee pour pouvoir etre testee", false, "absente de l'API");
  }
}

/* LES DEUX THÈMES SOMBRES, Graphite et Nuit (v8.34), et plus d'Espresso.

   Les jetons sont relus DANS la feuille de style, et chaque couleur de texte est
   mesurée contre chaque surface où elle peut se poser : 4,5:1 au moins. Nuit ne
   redéfinit que ce qui change, le reste lui vient de Graphite, exactement comme
   dans le navigateur. */
{
  const css = readFileSync(join(ROOT, "css/styles.css"), "utf8");
  const bloc = sel => {
    const i = css.indexOf(sel + " {");
    if (i < 0) return {};
    const corps = css.slice(i, css.indexOf("\n}", i));
    return Object.fromEntries([...corps.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1], m[2]]));
  };
  const graphite = bloc('html[data-theme="sombre"]');
  const nuit = { ...graphite, ...bloc('html[data-theme="sombre"][data-sombre="nuit"]') };
  const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  check("le theme Espresso a disparu", !css.includes("#1a120d") && !css.includes("#261c15"));
  check("Nuit est une palette a part entiere", nuit["--fond"] && nuit["--fond"] !== graphite["--fond"]);
  for (const [nom, p] of [["Graphite", graphite], ["Nuit", nuit]]) {
    const surfaces = ["--fond", "--rail", "--panneau", "--panneau-2", "--panneau-3"];
    const faibles = [];
    for (const t of ["--encre", "--texte", "--attenue", "--accent", "--danger"]) {
      for (const s of surfaces) {
        if (!p[t] || !p[s]) { faibles.push(t + " ou " + s + " absent"); continue; }
        const r = ratio(p[t], p[s]);
        if (r < 4.5) faibles.push(t + " sur " + s + " " + r.toFixed(2));
      }
    }
    // La carte du chrono : son attenue sur ses propres sous-surfaces.
    for (const s of ["--carte-sombre-fond", "--cs-panneau", "--cs-panneau-2"]) {
      const r = ratio(p["--cs-attenue"], p[s]);
      if (r < 4.5) faibles.push("--cs-attenue sur " + s + " " + r.toFixed(2));
    }
    if (ratio(p["--sur-accent"], p["--accent"]) < 4.5) faibles.push("--sur-accent sur --accent");
    check(nom + " : tous les textes tiennent 4,5:1", faibles.length === 0, faibles.join(", "));
  }

  // Le bouton fait le tour des trois, et le choix survit au rechargement.
  const tete = readFileSync(join(ROOT, "index.html"), "utf8");
  check("le head restaure la palette sombre", tete.includes('localStorage.getItem("sombre")') &&
    tete.includes('"data-sombre"'));
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("le bouton de theme propose Graphite puis Nuit",
    app.includes('appliquerTheme("sombre", "graphite")') && app.includes('appliquerTheme("sombre", "nuit")'));
}

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
