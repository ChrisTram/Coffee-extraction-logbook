/* Data layer tests, no browser.
 *
 *   node tools/data.test.mjs
 *
 * Loads the real site scripts into ONE shared scope, as the browser does with
 * classic scripts, then queries DATA. Touches neither IndexedDB nor the DOM:
 * what is tested here is the pure part, the one that can corrupt the user's
 * data without anyone noticing.
 *
 * The central invariant: `updated_at`, the internal sync column, must NEVER end up
 * in a CSV. The CSVs are opened in a spreadsheet by the user, and one extra
 * technical column would break the promise of the format.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergePayloads, sanitisePayload } from "../worker/sync.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The interface code has lived in seven files since the split. Checks that look
   for a string in "the interface" must read all of them: otherwise they turn
   green again as soon as a piece of code moves to another file, which is exactly
   when we would want them to be watching. */
/* The styles live in four sheets since v8.78: checks read them end to end, in
   load order, like the browser does. */
const CSS_SHEETS = ["css/base.css", "css/screens.css", "css/dialogs.css", "css/finishing.css"];
const readCss = () => CSS_SHEETS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const SOURCE_UI = ["js/ui-core.js", "js/ui-sync-bean.js", "js/ui-nav.js", "js/ui-scrub.js", "js/ui-findings.js", "js/ui-last-cup.js", "js/ui-dashboard.js", "js/ui-wheel.js", "js/ui-cup.js", "js/ui-dial.js", "js/ui-rating-dial.js", "js/ui-entry.js", "js/ui-entry-aside.js", "js/ui-pills.js", "js/ui-chrono.js", "js/ui-draft.js", "js/ui-quick.js",
  "js/ui-history.js", "js/ui-journal.js", "js/ui-guide.js", "js/ui-catalog.js", "js/ui-coffee-sheet.js", "js/ui-brew.js", "js/ui-drawings.js", "js/ui-jar.js", "js/ui-moments.js", "js/ui-roll.js", "js/ui-brewer.js", "js/ui-arrivals.js", "js/ui-empty.js", "js/ui-panel.js", "js/ui-palette.js", "js/ui-shortcuts.js", "js/app.js"]
  .map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
/* demo-data.js has not been a script tag since v7.56, but the harness still
   loads it: loadDemo() needs it and there is no network here. */
/* The data layer has lived in six files since v7.87: checks that look for a
   string "in data.js" read the concatenation, for the same reason as
   SOURCE_UI above. */
const DATA_FILES = ["js/data-csv.js", "js/data-schema.js", "js/data-store.js", "js/data-calcs.js",
  "js/data-migrations.js", "js/data.js"];
const SOURCE_DATA = DATA_FILES.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const SCRIPTS = ["js/legacy-names.js", "js/tools.js", "js/grind.js", "js/recipes.js", "js/demo-data.js", "js/sync.js",
  ...DATA_FILES, "js/tuning.js"];

const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");
const loader = new Function(
  "window",
  "location",
  "indexedDB",
  "console",
  source + "\nreturn { DATA, SYNC, GRIND, STARTER_RECIPES, DIAGNOSTICS, DIAGNOSTIC_GROUPS, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_WHEN, DIAGNOSTIC_LEVERS, TUNING, scalePours, POUR_THRESHOLD_G, temperatureFromHeating, heatTimeForTemperature, COFFEE_RECIPE_MATRIX, coffeeProfile, DESCRIPTOR_GROUPS, temperatureForCoffee };"
);
const { DATA, SYNC, GRIND, STARTER_RECIPES, DIAGNOSTICS, DIAGNOSTIC_GROUPS, DIAGNOSTIC_CORRECTIONS, DIAGNOSTIC_WHEN, DIAGNOSTIC_LEVERS, TUNING,
  scalePours, POUR_THRESHOLD_G, temperatureFromHeating, heatTimeForTemperature, COFFEE_RECIPE_MATRIX, coffeeProfile, DESCRIPTOR_GROUPS, temperatureForCoffee } =
  loader(undefined, { protocol: "file:" }, undefined, console);

let failures = 0;

/* A template key now lives in two halves: its French half in js/i18n.js, its
   English half in js/i18n.en.js, loaded on demand. Forgetting the second one
   would show French in English mode, without any error. */
// Since v9.18 the French templates sit in js/i18n.fr.js; the rest of i18n stays in js/i18n.js.
const I18N_FR_SRC = readFileSync(join(ROOT, "js/i18n.fr.js"), "utf8") + readFileSync(join(ROOT, "js/i18n.js"), "utf8");
const I18N_EN_SRC = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
const bilingual = key =>
  new RegExp("^\\s*" + key + ": \\{ fr:", "m").test(I18N_FR_SRC) &&
  new RegExp("^\\s*" + key + ": ", "m").test(I18N_EN_SRC);
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const COFFEES_HEADER =
  "id,name,roaster,origin,species,process,roast,pre_ground,real_coffee_pct," +
  "tag,roaster_notes,bag_size_g,price_vnd,roast_date,recommended_method," +
  "recommended_recipe,added_date,active";

// 1. updated_at does not leak into the CSVs, and the headers are unchanged
const coffeeCsv = DATA.csvSerialize([{ id: "c1", name: "Test", updated_at: 1699999999999 }], DATA.COFFEE_COLS);
check("coffees.csv header unchanged", coffeeCsv.split("\n")[0] === COFFEES_HEADER, coffeeCsv.split("\n")[0]);
check("updated_at missing from the coffees CSV", !coffeeCsv.includes("updated_at") && !coffeeCsv.includes("1699999999999"));

const extCsv = DATA.csvSerialize([{ id: "e1", updated_at: 123 }], DATA.EXT_COLS);
check("updated_at missing from the extractions CSV", !extCsv.includes("updated_at") && !extCsv.includes(",123"));
check("extractions header unchanged", extCsv.split("\n")[0].startsWith("id,date_time,coffee_id,method"));

const recCsv = DATA.csvSerialize([{ id: "r1", updated_at: 456 }], DATA.RECIPE_COLS);
check("updated_at missing from the recipes CSV", !recCsv.includes("updated_at"));

// 2. A CSV round trip does not carry updated_at: the reread row is worth 0, so
// the server version wins. Intended behaviour, documented in section 8 bis.
const csvRoundTrip = DATA.csvParse(DATA.csvSerialize([{ id: "c1", name: "Test", updated_at: 999 }], DATA.COFFEE_COLS));
check("CSV does not carry updated_at", csvRoundTrip[0].updated_at === undefined);

// 3. The business calculations have not moved
const calc = DATA.calcs({
  dose_g: 15,
  water_g: 225,
  grind_dial: "1.5.0",
  date_time: "2026-08-12T08:00",
  yield_ml: 190,
  added_water_ml: "",
  milk_ml: "",
});
check("ratio computed", calc.ratioText === "1:15.0", calc.ratioText);
check("microns computed on base 8.32", calc.microns === 624, String(calc.microns));
check("retention computed", calc.retention_ml === 35, String(calc.retention_ml));

// 4. Under file:// the sync is inert
check("initial sync state", DATA.state.syncState === "unknown", DATA.state.syncState);
check("syncPossible false under file://", DATA.syncPossible() === false);
/* No hardcoded count: the list of tables is written TWICE, in js/sync.js and
   worker/sync.js, and forgetting it in one place makes the sync fail SILENTLY.
   So we compare the three sources with each other. */
const EXPECTED_TABLES = ["coffees", "cups", "extractions", "purchases", "recipes", "settings"];
check("tombstones initialised for every table",
  Object.keys(DATA.state.tombstones).sort().join() === EXPECTED_TABLES.join(),
  Object.keys(DATA.state.tombstones).sort().join());
{
  const readTables = f => {
    const m = readFileSync(join(ROOT, f), "utf8").match(/TABLES = \[([^\]]*)\]/);
    return m ? m[1].split(",").map(x => x.trim().replace(/"/g, "")).sort() : [];
  };
  const clientTables = readTables("js/sync.js");
  const serverTables = readTables("worker/sync.js");
  check("the two TABLES lists are identical", clientTables.join() === serverTables.join(),
    clientTables.join() + "  versus  " + serverTables.join());
  check("and they cover exactly the state tables",
    clientTables.join() === EXPECTED_TABLES.join(), clientTables.join());
}

// 5. An impossible sync degrades without throwing and without losing anything
DATA.state.coffees = [{ id: "c1", name: "garde moi" }];
const state = await DATA.synchronize(true);
check("synchroniser degrades cleanly", state === "local", state);
check(
  "local data intact after failure",
  DATA.state.coffees.length === 1 && DATA.state.coffees[0].name === "garde moi"
);

// 6. Stock per bag. The CENTRAL behaviour: a repurchase starts again from the full
// size. Without that the purchases table would add nothing for a re-bought coffee,
// which is precisely the use case that justifies it.
const PURCHASE_HEADER = "id,coffee_id,purchase_date,bag_size_g,price_vnd,roast_date,opened_date,remaining_g,remaining_at";
const purchaseCsv = DATA.csvSerialize([{ id: "a1", coffee_id: "c1", bag_size_g: 250, updated_at: 999 }], DATA.PURCHASE_COLS);
const purchasesFirstLine = purchaseCsv.split("\n")[0];
check("purchases.csv header", purchasesFirstLine === PURCHASE_HEADER, purchasesFirstLine);
check("updated_at missing from the purchases CSV", !purchaseCsv.includes("999"));

DATA.state.coffees = [{ id: "c1", name: "Test", bag_size_g: 250, roast_date: "2026-07-01", added_date: "2026-07-05", active: 1 }];
DATA.state.purchases = [{ id: "a1", coffee_id: "c1", purchase_date: "2026-07-05", bag_size_g: 250, roast_date: "2026-07-01", updated_at: 1 }];
DATA.state.extractions = [
  { id: "e1", coffee_id: "c1", date_time: "2026-07-06T08:00", dose_g: 15 },
  { id: "e2", coffee_id: "c1", date_time: "2026-07-07T08:00", dose_g: 15 },
  { id: "e3", coffee_id: "c1", date_time: "2026-07-08T08:00", dose_g: "" },
];
let stock = DATA.bagStock("c1", 15);
check("forgotten dose counted as the default dose", stock.consumed === 45, String(stock.consumed));
check("remaining in the first bag", stock.remaining === 205, String(stock.remaining));

DATA.state.purchases.push({ id: "a2", coffee_id: "c1", purchase_date: "2026-07-10", bag_size_g: 340, roast_date: "2026-08-05", updated_at: 2 });
stock = DATA.bagStock("c1", 15);
check("a repurchase starts again from the full size", stock.remaining === 340, String(stock.remaining));
check("freshness follows the new bag", stock.roastDate === "2026-08-05", stock.roastDate);
check("current bag = the last one bought", DATA.currentBag("c1").id === "a2");
check("two bags counted", stock.bags === 2, String(stock.bags));

DATA.state.coffees.push({ id: "c9", name: "Sans format", bag_size_g: "", active: 1 });
check("no size, no stock badge", DATA.bagStock("c9", 15) === null);

DATA.state.extractions.push({ id: "e9", coffee_id: "c1", date_time: "2026-07-11T08:00", dose_g: 400 });
check("overrun shown as negative, not hidden", DATA.bagStock("c1", 15).remaining < 0);

// 6 bis. THE MANUAL COUNT (v8.96). Chris saw an empty bag that was not empty:
// the stock must be able to restart from a weighed or estimated figure, and then
// only count the cups after it. And a bag counts from its OPENING: the cups drunk
// between purchase and opening were emptying the old bag.
DATA.state.coffees.push({ id: "c2", name: "Compte", bag_size_g: 250, price_vnd: 200000, active: 1 });
DATA.state.purchases.push({ id: "a3", coffee_id: "c2", purchase_date: "2026-07-01", opened_date: "2026-07-05", bag_size_g: 250, updated_at: 3 });
DATA.state.extractions.push(
  { id: "k0", coffee_id: "c2", date_time: "2026-07-03T08:00", dose_g: 15 },
  { id: "k1", coffee_id: "c2", date_time: "2026-07-06T08:00", dose_g: 15 },
  { id: "k2", coffee_id: "c2", date_time: "2026-07-07T08:00", dose_g: 15 });
check("a bag counts from its opening, not its purchase",
  DATA.bagStock("c2", 15).remaining === 220, String(DATA.bagStock("c2", 15).remaining));
check("without a manual count, nothing flags it", DATA.bagStock("c2", 15).corrected === "");
Object.assign(DATA.state.purchases.find(a => a.id === "a3"), { remaining_g: 180, remaining_at: "2026-07-06T12:00" });
check("the manual count restarts from its figure, minus the cups after it",
  DATA.bagStock("c2", 15).remaining === 165, String(DATA.bagStock("c2", 15).remaining));
check("and the stock says when it was counted", DATA.bagStock("c2", 15).corrected === "2026-07-06T12:00");
await DATA.correctStock("c2", 200);
check("correcting writes to the current bag", DATA.bagStock("c2", 15).remaining === 200, String(DATA.bagStock("c2", 15).remaining));
check("without creating an extra bag", DATA.state.purchases.filter(a => a.coffee_id === "c2").length === 1);
DATA.state.coffees.push({ id: "c3", name: "Jamais achete", bag_size_g: 250, active: 1 });
await DATA.correctStock("c3", 120);
check("without a bag, correcting creates one that carries the count",
  DATA.state.purchases.filter(a => a.coffee_id === "c3").length === 1 && DATA.bagStock("c3", 15).remaining === 120);
check("a negative count is rejected", await DATA.correctStock("c3", -5) === null);
const roundTrip = DATA.csvSerialize(DATA.state.purchases.filter(a => a.coffee_id === "c3"), DATA.PURCHASE_COLS);
check("the count goes into the CSV", roundTrip.includes(",120,"), roundTrip);

// 7. Carrying timestamps over when rereading a CSV. This was a real bug:
// editing an extraction offline then RELOADING the page before the sync ran lost
// the edit, overwritten by the server version, which was stamped. CSVs do not
// carry updated_at, hence the carry-over.
const T1 = 1700000000000;
const carry = DATA.carryTimestamps;
check("carryTimestamps is exposed", typeof carry === "function");

const known = [{ id: "e1", score_10: 9, dose_g: 15, updated_at: T1 }];
const identical = carry([{ id: "e1", score_10: 9, dose_g: 15, updated_at: 0 }], known, DATA.EXT_COLS);
check("identical content: timestamp kept", identical[0].updated_at === T1, String(identical[0].updated_at));

const change = carry([{ id: "e1", score_10: 6, dose_g: 15, updated_at: 0 }], known, DATA.EXT_COLS);
check("spreadsheet edit: stamped now, it must win", change[0].updated_at > T1);

const newRow = carry([{ id: "e2", score_10: 8, updated_at: 0 }], known, DATA.EXT_COLS);
check("row unknown to the CSV: stamped", newRow[0].updated_at > 0);

const withoutKnown = carry([{ id: "e3", updated_at: 0 }], undefined, DATA.EXT_COLS);
check("no known rows: does not throw", withoutKnown.length === 1 && withoutKnown[0].updated_at > 0);

// 8. Splitting off the preheated water recipe. Preheating changes the pressure
// build-up, the duration and the valve behaviour: it is a distinct protocol, not
// a checkbox, so it deserves its own row in the recipe comparisons.
const CLASSIC = STARTER_RECIPES.find(r => r.id === "brikka-classique");
const BOILING = STARTER_RECIPES.find(r => r.id === "brikka-classique-bouillante");
check("the name of Brikka classique stays unchanged", CLASSIC.name === "Brikka classique", CLASSIC.name);
check("the two share a family", CLASSIC.family === "brikka-classique" && BOILING.family === CLASSIC.family);
check("same dose and water, clean comparison", BOILING.dose === CLASSIC.dose && BOILING.water === CLASSIC.water);

// migrateData is not exposed: we go through importCsvText, which calls it
// before persisting. Persisting fails for lack of IndexedDB, which does not matter.
const PREHEATED = [6, 7, 11];
const SCORES = { 1: 8.5, 2: 8, 3: 8, 4: 8.5, 5: 7, 6: 7, 7: 6, 8: 7, 9: 7.5, 10: 7, 11: 4.5 };
const rows = [];
for (let n = 1; n <= 11; n += 1) {
  rows.push({
    id: "e" + n, date_time: "2026-08-" + String(n + 2).padStart(2, "0") + "T10:00",
    coffee_id: "c1", method: "Brikka", recipe: "Brikka classique", dose_g: 14,
    preheated_water: PREHEATED.includes(n) ? 1 : "", score_10: SCORES[n],
  });
}
DATA.importCsvText(DATA.csvSerialize(rows, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));

const NEW_NAME = "Brikka classique (eau préchauffée)";
const moved = DATA.state.extractions.filter(e => e.recipe === NEW_NAME);
const stayed = DATA.state.extractions.filter(e => e.recipe === "Brikka classique");
check("the 3 preheated extractions are moved", moved.length === 3, String(moved.length));
check("the 8 others stay in place", stayed.length === 8, String(stayed.length));
check("no non-preheated one is moved", stayed.every(e => Number(e.preheated_water) !== 1));
check("scores intact after migration", DATA.state.extractions.find(e => e.id === "e11").score_10 === 4.5);
check("moved rows stamped for the sync", moved.every(e => Number(e.updated_at) > 0));

DATA.importCsvText(DATA.csvSerialize(DATA.state.extractions, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));
check(
  "idempotent migration: replaying moves nothing again",
  DATA.state.extractions.filter(e => e.recipe === NEW_NAME).length === 3,
  String(DATA.state.extractions.filter(e => e.recipe === NEW_NAME).length)
);

// 9. Heat power, Brikka only. Personal scale from 1 to 10, carried by the
// recipes (target that prefills) AND by the extractions (what was really done).
// It is the variable Chris tries to tune after a 5 second flow.
check("heat_level in EXT_COLS", DATA.EXT_COLS.includes("heat_level"));
check("heat_level in RECIPE_COLS", DATA.RECIPE_COLS.includes("heat_level"));
const BRIKKA_RECIPES = STARTER_RECIPES.filter(r => r.method === "Brikka");
/* The count is no longer frozen: what matters is that ALL Brikka recipes carry
   a target, not that there is a precise number of them. A test that freezes the
   number needs touching up at every merge, which is exactly when we do not want
   a test to edit. */
check("every Brikka recipe carries a heat target of 3", BRIKKA_RECIPES.length > 0 && BRIKKA_RECIPES.every(r => r.heat_level === 3),
  BRIKKA_RECIPES.map(r => r.name + "=" + r.heat_level).join(" | "));
check("no Switch recipe carries one", STARTER_RECIPES.filter(r => r.method === "Switch").every(r => r.heat_level === undefined));

const heatRows = [];
for (let n = 1; n <= 11; n += 1) {
  heatRows.push({
    id: "f" + n, date_time: "2026-08-" + String(n + 2).padStart(2, "0") + "T10:00",
    coffee_id: "c1", method: "Brikka", recipe: "Brikka classique", dose_g: 14,
    temperature_c: 95, score_10: 7, heat_level: "",
  });
}
heatRows.push({ id: "f12", date_time: "2026-08-14T10:00", coffee_id: "c1", method: "Switch", dose_g: 15, score_10: 7, heat_level: "" });
heatRows.push({ id: "f13", date_time: "2026-08-15T10:00", coffee_id: "c1", method: "Brikka", dose_g: 14, score_10: 7, heat_level: 8 });
DATA.importCsvText(DATA.csvSerialize(heatRows, DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));

const afterHeat = DATA.state.extractions;
const migratedBrikkas = afterHeat.filter(e => e.method === "Brikka" && e.id !== "f13");
check("past Brikka brews move to 3", migratedBrikkas.every(e => e.heat_level === 3),
  [...new Set(migratedBrikkas.map(e => e.heat_level))].join());
check("a Switch extraction stays empty", afterHeat.find(e => e.id === "f12").heat_level === "");
check("an already entered value is never overwritten", afterHeat.find(e => e.id === "f13").heat_level === 8);
check("the temperature of old ones is NOT touched", afterHeat.find(e => e.id === "f1").temperature_c === 95,
  String(afterHeat.find(e => e.id === "f1").temperature_c));

DATA.importCsvText(DATA.csvSerialize([
  { id: "b1", method: "Brikka", heat_level: 0 },
  { id: "b2", method: "Brikka", heat_level: 12 },
  { id: "b3", method: "Brikka", heat_level: "7.6" },
], DATA.EXT_COLS)).catch(() => {});
await new Promise(r => setTimeout(r, 80));
const heatOf = id => DATA.state.extractions.find(e => e.id === id).heat_level;
check("0 is brought back to 1", heatOf("b1") === 1, String(heatOf("b1")));
check("12 is brought back to 10", heatOf("b2") === 10, String(heatOf("b2")));
check("7.6 is rounded to 8", heatOf("b3") === 8, String(heatOf("b3")));

// 10. Grouped diagnostics. The project's non negotiable rule: adding a value
// breaks nothing, REMOVING one would break the already recorded history.
// This test locks exactly that.
const DIAGS_BEFORE_GROUPING = [
  "Équilibré", "Un peu acide", "Sous-extrait (acide)", "Un peu amer", "Sur-extrait (amer)",
  "Astringent", "Acide ET amer (extraction inégale)", "Trop léger (aqueux)",
  "Trop fort (concentré)", "Creux, plat (café éventé)", "Brûlé (défaut du sachet)",
];
const lost = DIAGS_BEFORE_GROUPING.filter(d => !DIAGNOSTICS.includes(d));
check("no historical diagnostic removed", lost.length === 0, lost.join(", "));
const PILL_DIAGS = DIAGNOSTIC_GROUPS.flatMap(g => g.diags);
check("the flat list starts with the pills, in group order",
  DIAGNOSTICS.slice(0, PILL_DIAGS.length).join("|") === PILL_DIAGS.join("|"));

/* "Acide ET amer" no longer has a pill: the site DEDUCES it when both families
   are ticked, instead of asking Chris to draw the conclusion himself. The label
   stays in DIAGNOSTICS because it is in his history from August 11 and must
   remain translatable, filterable and displayable. */
const DERIVED = "Acide ET amer (extraction inégale)";
check("the deduced diagnostic is no longer offered as a pill", !PILL_DIAGS.includes(DERIVED));
check("but it stays known to the system", DIAGNOSTICS.includes(DERIVED));
check("no group ends up empty", DIAGNOSTIC_GROUPS.every(g => g.diags.length > 0),
  DIAGNOSTIC_GROUPS.filter(g => !g.diags.length).map(g => g.name).join(", "));
check("it keeps its correction, which is what shows on deduction",
  !!DIAGNOSTIC_CORRECTIONS[DERIVED]);

// The deduction must rely on lists that really exist in app.js.
{
  const app = SOURCE_UI;
  check("app.js deduces instead of warning", app.includes("const uneven = UNDER_EXTRACTED_DIAGS"));
  check("the old message asking to tick has gone",
    !app.includes("diag_contradiction"));
}
check("no duplicate across groups", new Set(DIAGNOSTICS).size === DIAGNOSTICS.length);
check("every diagnostic has its correction",
  DIAGNOSTICS.every(d => DIAGNOSTIC_CORRECTIONS[d]),
  DIAGNOSTICS.filter(d => !DIAGNOSTIC_CORRECTIONS[d]).join(", "));

// Each mild nuance precedes its strong version: the order carries meaning.
const PAIRS = [
  ["Un peu acide", "Sous-extrait (acide)"], ["Un peu amer", "Sur-extrait (amer)"],
  ["Un peu astringent", "Astringent"], ["Un peu léger", "Trop léger (aqueux)"],
  ["Un peu concentré", "Trop fort (concentré)"], ["Un peu éventé", "Creux, plat (café éventé)"],
  ["Un peu brûlé", "Brûlé (défaut du sachet)"],
];
check("each mild nuance precedes its strong version",
  PAIRS.every(([mild, strong]) => DIAGNOSTICS.indexOf(mild) >= 0 &&
    DIAGNOSTICS.indexOf(mild) < DIAGNOSTICS.indexOf(strong)));

// An already recorded multiple diagnostic stays readable as is
const multi = "Trop léger (aqueux)|Acide ET amer (extraction inégale)";
check("a historical multiple diagnostic stays recognised",
  multi.split("|").every(d => DIAGNOSTICS.includes(d)));

// 11. Diagnostic tooltip: WHEN to tick, then WHAT to do. The correction alone
// said what to do without saying which case you are in, and a good correction
// applied to the wrong diagnostic makes the next cup worse.
// Pattern built from char codes: writing these dashes literally would make the
// project's anti dash scan fail on this very file.
const FORBIDDEN_DASHES = new RegExp("[" + [0x2012, 0x2013, 0x2014, 0x2015].map(c => String.fromCharCode(c)).join("") + "]");
check("every diagnostic has a WHEN description",
  DIAGNOSTICS.every(d => DIAGNOSTIC_WHEN[d]),
  DIAGNOSTICS.filter(d => !DIAGNOSTIC_WHEN[d]).join(", "));
check("no double quote: these texts go into an HTML attribute",
  Object.values(DIAGNOSTIC_WHEN).every(v => !v.includes('"')));
check("no em dash in the descriptions",
  Object.values(DIAGNOSTIC_WHEN).every(v => !FORBIDDEN_DASHES.test(v)));
check("the tooltip holds two lines for each diagnostic",
  DIAGNOSTICS.every(d => [DIAGNOSTIC_WHEN[d], DIAGNOSTIC_CORRECTIONS[d]].filter(Boolean).length === 2));

// 12. Best setting PER COFFEE (js/tuning.js). Per coffee and not overall: the
// best setting for a coffee pre-ground at 82 percent has nothing to do with that
// of a whole bean coffee, a global average would mix the two.
const brew = (id, coffee, recipe, grindDial, fire, preheated, rating) => ({
  id, coffee_id: coffee, recipe: recipe, grind_dial: grindDial, heat_level: fire,
  preheated_water: preheated ? 1 : "", score_10: rating,
  date_time: "2026-08-" + id.padStart(2, "0") + "T10:00",
});

const sample = [
  brew("01", "c1", "Brikka classique", "1.2.0", 3, false, 8),
  brew("02", "c1", "Brikka classique", "1.2.0", 3, false, 8.5),
  brew("03", "c1", "Brikka classique", "1.2.0", 3, false, 7.5),
  brew("04", "c1", "Brikka classique", "1.3.0", 6, false, 6),
  brew("05", "c1", "Brikka classique", "1.3.0", 6, false, 5.5),
  brew("06", "c1", "Brikka classique", "1.3.0", 6, false, 6.5),
];
const summary = TUNING.forCoffee("c1", sample);
check("the winning combination is found", summary.best !== null);
check("it is the best rated one", Math.round(summary.best.average * 10) / 10 === 8, String(summary.best.average));
check("it carries its settings", summary.best.grind === "1.2.0" && summary.best.power === "3");
check("the reference cup is the best rated one", summary.best.referenceId === "02", summary.best.referenceId);

const sparse = TUNING.forCoffee("c2", [brew("10", "c2", "R", "1.2.0", 3, false, 8), brew("11", "c2", "R", "1.2.0", 3, false, 7)]);
check("below the threshold, nothing is asserted", sparse.best === null && sparse.reason === "not_enough");
check("and we say how many are missing", sparse.missing === 1, String(sparse.missing));

const scattered = TUNING.forCoffee("c3", ["1.2.0", "1.3.0", "1.4.0", "1.5.0"]
  .map((m, k) => brew("2" + k, "c3", "R", m, 3, false, 7)));
check("enough cups but all different: nothing", scattered.best === null);
check("the reason distinguishes this case", scattered.reason === "scattered", scattered.reason);

/* CONSISTENCY FOR THE SAME COFFEE (v8.54): two very different coffees, each
   redone identically, are perfectly consistent. */
{
  const t = (coffee, recipe, n) => ({ coffee_id: coffee, recipe: recipe, score_10: n });
  const steady = [t("a", "R", 8), t("a", "R", 8), t("b", "R", 4), t("b", "R", 4)];
  check("two different coffees redone the same: perfect consistency", TUNING.gapAtSameCoffee(steady) === 0);
  check("the spread is measured within each coffee and recipe pair",
    TUNING.gapAtSameCoffee([t("a", "R", 7), t("a", "R", 9), t("b", "S", 5)]) === 1);
  check("without a twin, no consistency", TUNING.gapAtSameCoffee([t("a", "R", 7), t("b", "R", 5)]) === null);
}

/* THE QUANTIFIED CORRECTION (v8.48). The direction of the levers is written next
   to the correction sentences: this check verifies they say the same thing, so
   that one cannot be changed while forgetting the other. */
{
  const group = itemName => (DIAGNOSTIC_GROUPS.find(g => g.name === itemName) || { diags: [] }).diags;
  const quantifiable = [...group("Réglage d'extraction"), ...group("Ratio café et eau")];
  check("every grind or ratio diagnostic has its levers",
    quantifiable.every(d => DIAGNOSTIC_LEVERS[d]), quantifiable.filter(d => !DIAGNOSTIC_LEVERS[d]).join(", "));
  check("and no other one has any", Object.keys(DIAGNOSTIC_LEVERS).every(d => quantifiable.includes(d)));
  const inconsistent = Object.entries(DIAGNOSTIC_LEVERS).filter(([d, l]) => {
    const t = DIAGNOSTIC_CORRECTIONS[d].toLowerCase();
    return (l.grind < 0) !== /plus fin/.test(t) || (l.grind > 0) !== /grossier/.test(t) ||
      (l.heat > 0) !== /plus chaud/.test(t) || (l.heat < 0) !== /moins chaud/.test(t) ||
      (l.ratio < 0) !== /resserrer|moins d'eau/.test(t) || (l.ratio > 0) !== /élargir|plus d'eau/.test(t);
  }).map(([d]) => d);
  check("the levers say what the correction sentences say", inconsistent.length === 0, inconsistent.join(", "));

  const stepSizes = { step_clicks: 2, step_degrees: 2, step_heat: 1, step_water_g: 15, step_dose_g: 1 };
  const sw = (diag, fields) => ({ method: "Switch", grind_dial: "1.4.2", temperature_c: 92, water_g: 240, dose_g: 15, diagnostic: diag, ...fields });
  const c = TUNING.quantifiedCorrection(sw("Un peu amer"), stepSizes, false);
  check("a bit bitter: the dial first, two clicks coarser", c[0] && c[0].lever === "grind" && c[0].to === "1.4.4" && c[0].gap === 2,
    JSON.stringify(c));
  check("then the water two degrees cooler", c[1] && c[1].lever === "temperature" && c[1].to === 90, JSON.stringify(c[1]));
  const f = TUNING.quantifiedCorrection(sw("Sur-extrait (amer)"), stepSizes, false);
  check("a strong diagnostic doubles the step", f[0].to === "1.5.1" && f[1].to === 88, JSON.stringify(f));
  check("the steps come from the settings", TUNING.quantifiedCorrection(sw("Un peu amer"), { ...stepSizes, step_clicks: 3 }, false)[0].to === "1.5.0");
  // At the end of the Switch range (100 clicks, 2.0.0, since v8.74), nothing left to suggest.
  check("the dial stays within the machine's range",
    TUNING.quantifiedCorrection(sw("Astringent", { grind_dial: "2.0.0" }), stepSizes, false).length === 0);
  check("sour and bitter together are not quantified", TUNING.quantifiedCorrection(sw("Un peu acide|Un peu amer"), stepSizes, false).length === 0);
  check("a pre-ground coffee switches to heat", TUNING.quantifiedCorrection(sw("Un peu amer"), stepSizes, true)[0].lever === "temperature");
  /* On the Brikka (v8.74): heat only downwards (raising the flame overheats the
     aluminium, the Guide says so), and never dose (the basket is full). */
  const br = TUNING.quantifiedCorrection({ method: "Brikka", grind_dial: "", dose_g: 14, heat_level: 3, diagnostic: "Un peu léger|Un peu acide" }, stepSizes, true);
  check("on the Brikka, neither more heat nor more coffee", br.length === 0, JSON.stringify(br));
  const brBitter = TUNING.quantifiedCorrection({ method: "Brikka", grind_dial: "", dose_g: 14, heat_level: 3, diagnostic: "Un peu amer" }, stepSizes, true);
  check("but one heat step less when it is bitter", brBitter.length === 1 && brBitter[0].lever === "heat" && brBitter[0].to === 2, JSON.stringify(brBitter));
  check("without a diagnostic, nothing", TUNING.quantifiedCorrection(sw(""), stepSizes, false).length === 0);
  // A row from before v8.48 lacks the columns: it takes the defaults, no migration.
  const old = DATA.normalizeSettings({ id: "moi", dose_g: 15 });
  check("a row without steps takes the defaults", old.step_clicks === 2 && old.step_degrees === 2 && old.step_water_g === 15);
  check("an out of bounds step falls back to the default", DATA.normalizeSettings({ step_clicks: 40 }).step_clicks === 2);
}

/* Twin cups (v8.44): same recipe, dial within three clicks, the same coffee
   first. Not the same temperature: Chris does not want an overly precise
   comparison. */
{
  const t = [
    brew("31", "c1", "R", "1.4.2", 3, false, 7),
    brew("32", "c2", "R", "1.4.4", 3, false, 8),    // other coffee, 2 clicks
    brew("33", "c1", "R", "1.5.1", 3, false, 6),    // same coffee, 4 clicks: too far
    brew("34", "c1", "R", "1.4.0", 3, false, 6.5),  // same coffee, 2 clicks
    brew("35", "c1", "Autre", "1.4.2", 3, false, 9), // other recipe
    brew("36", "c1", "R", "1.4.2", 3, false, ""),   // not rated
  ];
  const j = TUNING.twins(t, { coffee_id: "c1", recipe: "R", grind_dial: "1.4.2" });
  check("twins keep the same recipe and the dial within 3 clicks",
    j.map(x => x.ext.id).join(",") === "31,34,32", j.map(x => x.ext.id).join(","));
  check("the same coffee comes first, and the gap is in clicks", j[0].sameCoffee && j[1].gap === -2 && !j[2].sameCoffee);
  const ground = TUNING.twins(t, { coffee_id: "c2", recipe: "R", ground: true });
  check("a pre-ground coffee looks for the same recipe on the same coffee", ground.length === 1 && ground[0].ext.id === "32");
  check("without a recipe, no twin", TUNING.twins(t, { coffee_id: "c1", grind_dial: "1.4.2" }).length === 0);
}

const preheated = [false, false, false, true, true, true]
  .map((p, k) => brew("3" + k, "c4", "R", "1.2.0", 3, p, p ? 9 : 6));
const withPreheat = TUNING.forCoffee("c4", preheated);
check("preheating distinguishes two combinations", withPreheat.combinations === 2, String(withPreheat.combinations));
check("the better of the two wins", withPreheat.best.preheat === true);

const ground = ["40", "41", "42"].map(id => brew(id, "c5", "R", "", 3, false, 7));
check("a pre-ground coffee has a valid combination without grind",
  TUNING.forCoffee("c5", ground).best?.grind === "");

check("a never extracted coffee is flagged, not ignored",
  TUNING.forCoffee("c9", []).reason === "aucune");

const tuned = TUNING.forAllCoffees(
  [{ id: "c2", name: "Sans", active: 1 }, { id: "c1", name: "Avec", active: 1 }, { id: "cz", name: "Off", active: 0 }],
  sample.concat([brew("10", "c2", "R", "1.2.0", 3, false, 8)]));
check("coffees with a result come first", tuned[0].coffee.id === "c1", tuned.map(x => x.coffee.id).join());
check("inactive ones end up last", tuned[tuned.length - 1].coffee.active === 0);

/* The main ratio is WATER over DOSE on BOTH machines: it is the universal coffee
   convention, the only one comparable to a recipe or to another drinker. The
   in-cup ratio depended on the extracted volume, filled in for 1 extraction out
   of 29: it almost never showed and gave a number incomparable to the rest. It
   stays, as a secondary one, when it is measured. */
{
  const brikka = DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: 90 });
  check("Brikka: the main ratio is water over dose", brikka.ratioText === "1:9.4", brikka.ratioText);
  check("Brikka: its base is named boiler", brikka.ratioBase === "boiler", brikka.ratioBase);
  check("the measured volume gives a SECONDARY in-cup ratio",
    brikka.cupRatioText === "1:5.6", brikka.cupRatioText);

  const noVolume = DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: "" });
  check("without volume, the main ratio does not change", noVolume.ratioText === "1:9.4", noVolume.ratioText);
  check("without volume, no invented in-cup ratio", noVolume.cupRatioText === "", noVolume.cupRatioText);

  const sw = DATA.calcs({ method: "Switch", dose_g: 15, water_g: 225, yield_ml: 190 });
  check("Switch: same convention, water over dose", sw.ratioText === "1:15.0", sw.ratioText);
  check("Switch: its base is named infusion", sw.ratioBase === "infusion", sw.ratioBase);

  const diluted = DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: 90, added_water_ml: 40 });
  check("diluting with water does not touch the extraction ratio", diluted.ratioText === "1:9.4", diluted.ratioText);
  check("diluting with water gives an extra drink ratio", diluted.drinkRatio === "1:8.1", diluted.drinkRatio);
  check("without dilution, no drink ratio",
    DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: 90 }).drinkRatio === "");

  // Without water, nothing at all: the ratio must not fall back on the volume.
  check("without entered water, no main ratio",
    DATA.calcs({ method: "Brikka", dose_g: 16, water_g: "", yield_ml: 90 }).ratioText === "");
}

// Default values of a recipe: "" means NO target, which is not zero. Brikka
// recipes have no target temperature, the flame decides.
{
  const brikkaCups = STARTER_RECIPES.filter(r => r.method === "Brikka");
  check("Brikka recipes impose no temperature",
    brikkaCups.length > 0 && brikkaCups.every(r => DATA.normalizeRecipe(r).temp === ""),
    brikkaCups.map(r => r.name + "=" + DATA.normalizeRecipe(r).temp).join(", "));
  check("Brikka recipes prefill 150 g in the boiler",
    brikkaCups.every(r => DATA.normalizeRecipe(r).water === 150),
    brikkaCups.map(r => r.name + "=" + DATA.normalizeRecipe(r).water).join(", "));
  check("Switch recipes keep a target temperature",
    STARTER_RECIPES.filter(r => r.method === "Switch").every(r => DATA.normalizeRecipe(r).temp > 0));
  check("an empty temperature stays empty and does not become 0",
    DATA.normalizeRecipe({ temp: "" }).temp === "" && DATA.normalizeRecipe({ temp: 0 }).temp === "");
  check("the recipe heat power survives normalisation",
    DATA.normalizeRecipe({ heat_level: 4 }).heat_level === 4);
  check("heat power is clamped to the 1-10 scale",
    DATA.normalizeRecipe({ heat_level: 99 }).heat_level === 10 &&
    DATA.normalizeRecipe({ heat_level: 0 }).heat_level === 1);
}

/* SCHEMA VERSION. The catch-ups of seeded values depended on flags in
   localStorage, so PER DEVICE, while the data is SHARED: a device with empty
   storage set its flags on nothing, then received an unmigrated document. The
   number now lives INSIDE the settings row, so it travels with the data it
   describes. */
{
  // An older install: old seeded values, no version.
  const before = () => {
    DATA.state.settings = [];
    DATA.state.recipes = [
      { id: "b1", name: "Brikka classique", method: "Brikka", family: "", water: 100, temp: 93,
        heat_level: 4, dial: "1.2.0", steps: [], updated_at: 0 },
      { id: "b2", name: "Brikka flat white", method: "Brikka", family: "", water: 100, temp: 93,
        heat_level: 3, dial: "1.2.0", steps: [], updated_at: 0 },
      // Setting DELIBERATELY chosen afterwards: must not be overwritten.
      { id: "b3", name: "Brikka perso", method: "Brikka", family: "", water: 170, temp: "",
        heat_level: 6, dial: "1.5.0", steps: [], updated_at: 0 },
      { id: "s1", name: "Chronicler", method: "Switch", family: "chronicler", water: 225, temp: 92,
        heat_level: "", dial: "1.6.0", updated_at: 0,
        steps: [{ t: 0, text: "Verser jusqu'à 112 g." }, { t: 45, text: "Compléter à 225 g." }],
        note: "compléter à 225 g veut dire que la balance affiche 225" },
    ];
  };
  const recipeById = id => DATA.state.recipes.find(r => r.id === id);

  before();
  check("a document without a version starts from zero", Number(DATA.currentSettings().schema_version) === 0);
  DATA.migrateData();

  check("the Brikka boiler goes from 100 to 150 g", recipeById("b1").water === 150 && recipeById("b2").water === 150,
    recipeById("b1").water + " / " + recipeById("b2").water);
  check("the Brikka target temperature disappears", recipeById("b1").temp === "" && recipeById("b2").temp === "",
    JSON.stringify([recipeById("b1").temp, recipeById("b2").temp]));
  /* The heat scale moved four times: 3, 4, 2, then 3 again (step v14, Chris's
     request). A card seeded at 4 and a card seeded at 3 therefore end up in the
     same place, and that is the point of these two checks: the whole chain is
     replayed, not just the last step. */
  check("heat seeded at 4 ends at 3", recipeById("b1").heat_level === 3, recipeById("b1").heat_level);
  check("heat seeded at 3 comes back to 3 after the whole path", recipeById("b2").heat_level === 3, recipeById("b2").heat_level);
  check("the single dial also applies to the Switch", recipeById("s1").dial === "1.5.0", recipeById("s1").dial);
  check("the Chronicler goes to 240 g", recipeById("s1").water === 240, recipeById("s1").water);
  check("its pour steps follow",
    recipeById("s1").steps.map(e => e.text).join(" ").includes("120 g") &&
    recipeById("s1").steps.map(e => e.text).join(" ").includes("240 g"),
    recipeById("s1").steps.map(e => e.text).join(" | "));
  check("a hand-tuned recipe is not touched",
    recipeById("b3").water === 170 && recipeById("b3").heat_level === 6,
    recipeById("b3").water + " / " + recipeById("b3").heat_level);
  check("touched recipes are stamped for the sync", recipeById("b1").updated_at > 0);

  // The version is written, and it travels with the data.
  const v = Number(DATA.currentSettings().schema_version);
  check("the schema version is written afterwards", v > 0, String(v));
  check("it is stamped like the rest", DATA.state.settings[0].updated_at > 0);

  /* Replaying must do NOTHING: otherwise a setting put back by hand would fall back
     to the migrated value on the next load. */
  recipeById("b1").heat_level = 4;
  recipeById("b1").water = 100;
  DATA.migrateData();
  check("steps do not replay once the version is reached",
    recipeById("b1").heat_level === 4 && recipeById("b1").water === 100,
    recipeById("b1").heat_level + " / " + recipeById("b1").water);

  /* THE case that used to break: a new device, empty storage, receiving an ALREADY
     migrated document. It must replay nothing, even without any local flag. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: v })];
  DATA.migrateData();
  check("an already migrated document is never touched again",
    recipeById("b1").water === 100 && recipeById("b1").heat_level === 4,
    recipeById("b1").water + " / " + recipeById("b1").heat_level);

  // And the reverse: a new device receiving a LAGGING document catches it up.
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 3 })];
  DATA.migrateData();
  check("a lagging document is caught up by any device",
    recipeById("b1").water === 150 && recipeById("s1").dial === "1.5.0",
    recipeById("b1").water + " / " + recipeById("s1").dial);
  check("but only the missing steps: b1's heat had already been handled",
    recipeById("b1").heat_level === 4, recipeById("b1").heat_level);

  /* Step v11: the factory 4:00 written in the synced settings goes to 2:00.
     A duration timed by hand (300) is not touched. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 10, boil_s: 240 })];
  DATA.migrateData();
  check("the invented 4:00 goes to 2:00", Number(DATA.currentSettings().boil_s) === 120,
    String(DATA.currentSettings().boil_s));
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 10, boil_s: 300 })];
  DATA.migrateData();
  check("a hand-timed kettle is not overwritten", Number(DATA.currentSettings().boil_s) === 300,
    String(DATA.currentSettings().boil_s));

  // Step v12: the Hoffmann bloom mentions the swirl during the bloom. A card
  // rewritten by hand keeps its text.
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 11 })];
  const hof = () => DATA.state.recipes.find(r => r.id === "hoffmann-1cup");
  const seedHof = text => DATA.state.recipes.push({ id: "hoffmann-1cup", name: "Better 1 Cup (Hoffmann)", method: "Switch",
    family: "", water: 250, temp: 95, heat_level: "", dial: "1.5.0", updated_at: 0, steps: [{ t: 0, text: text }] });
  seedHof("Bloom : verser 50 g lentement, en quinze secondes environ, vanne OUVERTE. Tourbillon doux de la carafe.");
  DATA.migrateData();
  check("the Hoffmann bloom mentions the swirl during the bloom",
    hof().steps[0].text.includes("PENDANT le bloom"), hof().steps[0].text);
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 11 })];
  seedHof("Mon bloom a moi.");
  DATA.migrateData();
  check("a bloom rewritten by hand is not touched", hof().steps[0].text === "Mon bloom a moi.");

  // Step v13: the spoon is allowed on the last Hoffmann step.
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 12 })];
  seedHof("Tourbillon doux, AUCUNE cuillère. Laisser s'écouler, fin vers 2:45 à 3:15.");
  DATA.migrateData();
  check("the last Hoffmann step no longer forbids the spoon",
    !hof().steps[0].text.includes("AUCUNE") && hof().steps[0].text.includes("cuillère"), hof().steps[0].text);

  /* Step v15: the kettle as a curve. A cup whose degree equals the old straight
     line takes the curve; a degree touched up by hand, or a Brikka, does not. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 14, boil_s: 120, bubbles_s: 90 })];
  const cup = (id, method, temperature_c) => DATA.state.extractions.push(DATA.normalizeExtraction(
    { id, date: "2026-09-20", method: method, coffee_id: "", heating_s: 90, temperature_c, updated_at: 0 }));
  cup("x-droite", "Switch", 82);
  cup("x-main", "Switch", 91);
  cup("x-brikka", "Brikka", 82);
  DATA.migrateData();
  const deg = id => DATA.state.extractions.find(e => e.id === id).temperature_c;
  check("a temperature estimated under the line moves onto the curve", Number(deg("x-droite")) === 88, String(deg("x-droite")));
  check("a degree corrected by hand is not touched", Number(deg("x-main")) === 91, String(deg("x-main")));
  check("a Brikka is not touched", Number(deg("x-brikka")) === 82, String(deg("x-brikka")));

  /* Step v16: an already stored original recipe receives its seed's video;
     a link set by hand is not replaced. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 15 })];
  DATA.state.recipes = STARTER_RECIPES.map(d => DATA.normalizeRecipe({ ...d, video: "" }));
  const hofVideo = DATA.state.recipes.find(r => r.id === "hoffmann-1cup");
  hofVideo.video = "https://exemple.org/ma-video";
  DATA.migrateData();
  check("an original recipe without a video receives its seed's one",
    DATA.state.recipes.find(r => r.id === "neo-brew").video === "https://www.youtube.com/watch?v=k0nsShguOsU");
  check("a link set by hand is not replaced", hofVideo.video === "https://exemple.org/ma-video");
  check("the video makes the round trip through the stored row",
    DATA.normalizeRecipe(DATA.recipeToRow ? DATA.recipeToRow(hofVideo) : hofVideo).video === "https://exemple.org/ma-video");
  check("a link that is not http is never written",
    DATA.normalizeRecipe({ name: "x", video: "javascript:alert(1)" }).video === "");
  check("eight original recipes have their video",
    STARTER_RECIPES.filter(r => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(r.video || "")).length === 8);
  /* The Tetsu Devil (v8.70): the weighed mix of step 2 must give 70 degrees with
     the ambient water of the kettle curve, and add up. */
  const devil = STARTER_RECIPES.find(r => r.id === "devil-switch");
  const [hot, cold] = (devil.steps[1].text.match(/(\d+) g d'eau à 90 °C et (\d+) g/) || []).slice(1).map(Number);
  const tMix = (hot * 90 + cold * 28) / (hot + cold);
  check("the Devil mix gives 70 degrees within one degree", Math.abs(tMix - 70) <= 1, String(tMix));
  check("and makes exactly the immersion water", hot + cold === devil.water - 90, (hot + cold) + " / " + (devil.water - 90));

  /* Step v17: "The Tetsu Devil" becomes "Tetsu 4:6", the recipe and its cups,
     stamped so that the sync carries the new name. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 16 })];
  DATA.state.recipes = STARTER_RECIPES.map(d => DATA.normalizeRecipe(d.id === "tetsu-devil" ? { ...d, name: "The Tetsu Devil" } : d));
  DATA.state.extractions.push(DATA.normalizeExtraction(
    { id: "x-devil", date: "2026-08-05", method: "Switch", recipe: "The Tetsu Devil", updated_at: 5 }));
  DATA.migrateData();
  const x46 = DATA.state.extractions.find(e => e.id === "x-devil");
  check("the Devil recipe is now called Tetsu 4:6",
    DATA.state.recipes.find(r => r.id === "tetsu-devil").name === "Tetsu 4:6");
  check("and its cups follow, stamped", x46.recipe === "Tetsu 4:6" && Number(x46.updated_at) > 5, x46.recipe + " " + x46.updated_at);

  /* A NEW logbook plays every step, including v5 (single dial): the Neo Brew,
     seeded afterwards with its extra coarse grind, must keep it. */
  before();
  DATA.state.settings = [DATA.normalizeSettings({ schema_version: 0 })];
  DATA.migrateData();
  const neo = DATA.state.recipes.find(r => r.id === "neo-brew");
  check("on a new logbook, the Neo Brew keeps its extra coarse dial", neo && neo.dial === "2.8.0", neo && neo.dial);
  check("and the other recipes stay at 1.5.0",
    DATA.state.recipes.filter(r => r.id !== "neo-brew").every(r => r.dial === "1.5.0"));

  // No more per-device flags in the data layer.
  const data = SOURCE_DATA;
  const block = data.slice(data.indexOf("const SCHEMA_STEPS"), data.indexOf("function migrateData"));
  check("steps no longer depend on local storage", !block.includes("localStorage"));
  /* The numbers must follow each other from 1 to CURRENT_SCHEMA, with no gap or
     duplicate. The bound is READ from the source instead of written here: the
     real invariant is that the list and the counter stay in agreement, and a
     list frozen in the test forced a touch-up at every added step, which is
     exactly when we do not want a test to edit. */
  const stepSizes = [...block.matchAll(/\{ v: (\d+)/g)].map(m => Number(m[1]));
  const current = Number((data.match(/const CURRENT_SCHEMA = (\d+)/) || [])[1]);
  check("step numbers follow each other with no gap",
    stepSizes.join() === stepSizes.map((_, i) => i + 1).join(), stepSizes.join());
  check("and the last step is the current schema version",
    stepSizes.length === current && stepSizes[stepSizes.length - 1] === current,
    stepSizes.length + " steps for CURRENT_SCHEMA = " + current);
}

/* The service worker must precache ALL the scripts loaded by index.html.
   sync.js and tuning.js were missing: offline, SYNC and TUNING did not exist
   and app.js broke at startup. A hand-written list inevitably diverges, so we
   compare it to the source. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const scriptTags = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)];
  const scripts = scriptTags.map(m => m[1]);
  check("all scripts are deferred, the HTML no longer waits for them",
    scriptTags.every(m => m[0].includes(" defer")),
    scriptTags.filter(m => !m[0].includes(" defer")).map(m => m[1]).join(", "));
  check("none is async: defer preserves order, async does not",
    scriptTags.every(m => !m[0].includes(" async")),
    scriptTags.filter(m => m[0].includes(" async")).map(m => m[1]).join(", "));
  /* ACKNOWLEDGED EXCEPTION: the theme is applied by an INLINE script in the
     <head>, and it must absolutely not be deferred. The data-theme attribute was
     hardcoded to "sombre" and restoring the choice lived in a deferred script,
     which only runs after the first render: so the light theme flashed dark on
     every opening. A flash fails no test, hence this lock. */
  {
    const head = html.slice(0, html.indexOf("</head>"));
    const inlineScripts = [...head.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    const theme = inlineScripts.find(m => m[1].includes('data-theme'));
    check("the theme is applied by an inline script in the head", !!theme);
    if (theme) {
      check("and that script is neither deferred nor async",
        !theme[0].includes(" defer") && !theme[0].includes(" async"), theme[0].slice(0, 60));
      check("it reads the saved choice", theme[1].includes('localStorage.getItem("theme")'));
      check("and falls back on the system preference without a choice",
        theme[1].includes("prefers-color-scheme"));
    }
    /* No more hardcoded theme: the absence of the attribute means "not decided
       yet", and that is what allows following the system. */
    check("the HTML no longer imposes a starting theme",
      /<html\b[^>]*>/.test(html) && !html.match(/<html\b[^>]*>/)[0].includes("data-theme"),
      (html.match(/<html\b[^>]*>/) || [""])[0]);
    // The PWA status bar followed the dark theme in all circumstances.
    const tints = [...html.matchAll(/<meta name="theme-color"[^>]*>/g)].map(m => m[0]);
    check("the status bar has one tint per system preference",
      tints.length === 2 && tints.every(t => t.includes("prefers-color-scheme")),
      tints.join(" "));
    check("and the explicit choice updates both of them",
      /querySelectorAll\('meta\[name="theme-color"\]'\)[\s\S]{0,80}setAttribute/.test(SOURCE_UI));
  }

  // The file name, without its ?v=: the service worker adds the version itself.
  const withoutVersion = s => s.split("?")[0];
  const absent = scripts.filter(s => !sw.includes('"./' + withoutVersion(s) + '"'));
  check("all index.html scripts are precached", absent.length === 0, absent.join(", "));

  /* SINGLE VERSION. It is written in the <meta>, in every ?v= of the page and in
     sw.js. A divergence leaves a device with the new HTML and an old script
     cached for a year: it is the only real risk of versioning, and it shows here
     before deployment. */
  const meta = (html.match(/<meta name="app-version" content="([^"]+)">/) || [])[1];
  check("the page declares its version in a meta", /^\d+\.\d+/.test(meta || ""), String(meta));
  const versions = [...html.matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\?v=([^"]*)"/g)].map(m => m[1]);
  // + 1 for the stylesheet, + 1 for the chart preload (v8.75).
  check("every script and the stylesheet carry ?v=", versions.length === scripts.length + 1 + CSS_SHEETS.length,
    versions.length + " of " + (scripts.length + 2));
  check("preloaded fonts keep the stylesheet URL, without ?v=", !/fonts\/[^"]+\?v=/.test(html));
  check("and all carry the meta version", versions.every(v => v === meta),
    [...new Set(versions)].join(", "));
  const swVersion = (sw.match(/const VERSION = "([^"]+)"/) || [])[1];
  check("the service worker carries the same version", swVersion === meta, swVersion + " versus " + meta);
  check("app.js reads the version instead of copying it", SOURCE_UI.includes("TOOLS.versionSite()"));
  // The three files loaded on demand must go through the same versioned URL.
  ["js/i18n.js", "js/data.js", "js/charts.js"].forEach(f => {
    const src = readFileSync(join(ROOT, f), "utf8");
    check(f + " versions what it loads on demand", /s\.src = TOOLS\.versionedUrl\(/.test(src));
  });
  /* The count drops as files leave the critical path: Chart.js, the English
     bundle and the demo are now loaded on demand. What must stay true is that
     EVERYTHING that is still a script tag is precached, checked just above. */
  check("the core stays loaded by script tags", scripts.length >= 6, String(scripts.length));

  // The stylesheet and the manifest matter just as much: without them the PWA
  // opens offline as a blank unstyled page.
  [...CSS_SHEETS.map(f => "./" + f), "./manifest.json", "./index.html"].forEach(f =>
    check("precache: " + f, sw.includes('"' + f + '"')));
}

/* THE MANIFEST. A stable `id`: without it the identity of the installed app
   depends on start_url, and changing that one day would make a second app
   appear next to the first. And long press shortcuts on the icon, which must
   target screens that exist. */
{
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")); } catch (e) { /* invalid */ }
  check("the manifest is valid JSON", !!manifest);
  if (manifest) {
    check("the manifest carries an id", manifest.id === "./", String(manifest.id));
    const app = SOURCE_UI;
    const list = app.slice(app.indexOf("const SCREEN_NAMES = ["), app.indexOf("]", app.indexOf("const SCREEN_NAMES = [")));
    const shortcuts = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
    check("at least one long press shortcut", shortcuts.length >= 1);
    /* A shortcut targets a screen, or an ACTION that app.js handles by name
       ("redo", v8.41): at startup AND on hash change, otherwise an already
       open app would ignore it. */
    const appJs = readFileSync(join(ROOT, "js/app.js"), "utf8");
    const isHandledAction = key => (appJs.match(new RegExp('=== "' + key + '"', "g")) || []).length >= 2;
    const dead = shortcuts.filter(r => {
      const key = String(r.url).replace("./#", "");
      return !list.includes('"' + key + '"') && !isHandledAction(key);
    });
    check("every shortcut targets an existing screen or a handled action", dead.length === 0, dead.map(r => r.url).join(", "));
    check("every shortcut has an icon", shortcuts.every(r => Array.isArray(r.icons) && r.icons.length));
  }
}

/* FIELD ACCESSIBILITY. Every visible field must have a name: a <label for>, a
   wrapping label, or an aria-label. Seven second fields of pairs (minutes then
   seconds, checkbox then quantity) had none. And the Guide jumped from h2 to h4,
   which breaks heading navigation for a screen reader. */
{
  /* COMMENTS are removed first: a comment quoting <select> or <input> got
     counted as a nameless field, which blamed the comment instead of the
     HTML. */
  const html = readFileSync(join(ROOT, "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  const labelledFor = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map(m => m[1]));
  const unnamed = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="(hidden|file)"/.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (/aria-label(ledby)?=/.test(attrs) || (id && labelledFor.has(id))) continue;
    const before = html.lastIndexOf("<label", m.index), closeBefore = html.lastIndexOf("</label>", m.index);
    if (before > closeBefore) continue; // wrapped by a <label>
    unnamed.push(id || attrs.trim().slice(0, 40));
  }
  check("every field on the page carries an accessible name", unnamed.length === 0, unnamed.join(", "));

  const levels = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  const jumps = levels.filter((n, i) => i > 0 && n - levels[i - 1] > 1).length;
  check("no heading skips a level", jumps === 0, String(jumps));

  // The new labels must exist in English, like every visible string.
  const en = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  const arias = [...html.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]);
  const untranslated = [...new Set(arias)].filter(a => !en.includes('"' + a + '"'));
  check("every static aria-label has its translation", untranslated.length === 0, untranslated.join(", "));
}

/* THE SCORE DISPLAY GOES THROUGH A SINGLE FUNCTION.

   Draft resume wrote #rating-shown by hand, with the raw field value. So it
   ignored "not rated yet": after resuming an unrated draft, the screen showed
   "5" while saving was going to file the cup as UNRATED. With the slider also
   set on 5, nothing betrayed the gap, and the averages depended on it.

   The rule: a single place writes this element. Any other code touching it is
   a second opinion on the same question, and that is how they diverge. */
{
  const entry = readFileSync(join(ROOT, "js/ui-entry.js"), "utf8");
  const others = ["js/ui-chrono.js", "js/ui-draft.js", "js/app.js", "js/ui-history.js", "js/ui-dashboard.js"]
    .filter(f => /\$\("#rating-shown"\)\s*\.\s*textContent\s*=/.test(readFileSync(join(ROOT, f), "utf8")));
  check("a single file writes #rating-shown, and it is the entry one",
    others.length === 0, others.join(", "));
  const writes = (entry.match(/\$\("#rating-shown"\)\s*\.\s*textContent\s*=/g) || []).length;
  check("and it writes it in only one place", writes === 1, String(writes));

  /* And that place must look at the checkbox, otherwise the official function lies
     as much as the line it replaces. */
  check("the score display accounts for «pas encore notee»",
    /function updateRatingDisplay\(\)[\s\S]{0,400}isRatingEmpty\(/.test(entry));
}
/* SCREEN SWITCHING RELIES ON SPECIFICITY ALONE.

   Two lines do all the navigation:
     .screen { display: none }   then   .screen.actif { display: block }
   An ID selector outweighs a class. A rule that sets a display on an #ecran-*
   without requiring .on therefore beats the display:none, and that screen
   stays shown forever: the next ones stack below it instead of replacing it.
   That is exactly what #screen-entry { display: grid } did in the Comptoir
   redesign, and nothing in the five suites saw it.

   The check targets the RULE: any screen could cause the breakdown again. */
{
  const css = readCss()
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const offenders = [];
  /* Each block of the file: its selector, then its declarations. */
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim(), body = m[2];
    if (!/(^|[\s,])display\s*:/.test(body)) continue;
    for (const part of selector.split(",")) {
      const sel = part.trim();
      if (!/#ecran-[\w-]+/.test(sel)) continue;
      /* The display may target a DESCENDANT of the screen without trouble: only
         the selector that ends on the screen itself causes the breakdown. */
      if (!/#ecran-[\w-]+[\w.:\[\]="-]*$/.test(sel)) continue;
      if (!/\.on\b/.test(sel)) offenders.push(sel + " { display }");
    }
  }
  check("no rule forces a screen to show without .on",
    offenders.length === 0, offenders.join(" | "));

  /* SAME LESSON, ANOTHER FACE: a screen does not lay itself out.

     #screen-entry has only ONE child, .entry-layout, which already carried the
     "form plus fixed column" grid. A second grid set on the screen put the whole
     form in column 1 and left 360 px empty on the right: the content looked
     cramped and shifted, without anything being in error.

     Layout belongs to the container that really has several children to
     distribute. If a screen needs it one day, the author will see this test and
     put the rule on a wrapper: that is the point. */
  const grids = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim(), body = m[2];
    if (!/grid-template-columns\s*:/.test(body)) continue;
    for (const part of selector.split(",")) {
      const sel = part.trim();
      if (/#ecran-[\w-]+[\w.:\[\]="-]*$/.test(sel)) grids.push(sel);
    }
  }
  check("no screen carries a column grid itself",
    grids.length === 0, grids.join(" | "));
}
/* THE ENTRY FIELDS LIVE IN THE FORM.

   While moving the timer to the right column, the split grabbed the <section>
   of block 2 instead of the timer's <div>: "Les reglages" and "En bouche" went
   with it. The form only contained the first block anymore, and all the entry
   fields ended up in the aside, dressed as a dark card.

   The five suites stayed green all along: none looks at WHERE a field lives,
   and the fake DOM finds an id in an aside as well as in a form. It took Chris
   opening the page.

   The check splits the HTML at the real boundaries and verifies which side each
   field falls on. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const formStart = html.indexOf('<form id="form-entry"');
  const formEnd = html.indexOf("</form>", formStart);
  const asideStart = html.indexOf('<aside class="entry-aside"');
  const asideEnd = html.indexOf("</aside>", asideStart);
  check("the entry form and its column exist",
    formStart > 0 && formEnd > formStart && asideStart > formEnd && asideEnd > asideStart);

  const inForm = html.slice(formStart, formEnd);
  const inAside = html.slice(asideStart, asideEnd);

  /* The fields Chris fills in. A single one outside the form and the entry goes
     into the wrong column. */
  const FIELDS = ["f-coffee", "f-recipe", "f-dose", "f-water", "f-grind", "f-volume",
    "f-cup", "f-rating", "f-diagnostic", "f-descriptors", "f-comment", "f-date"];
  /* A field placed OUTSIDE the form tags still counts if it carries
     form="form-entry": that is HTML's official association, and the date in
     the page header uses it. */
  const attached = new Set([...html.matchAll(/id="([^"]+)"[^>]*form="form-entry"/g)].map(m => m[1]));
  const strays = FIELDS.filter(id => !inForm.includes('id="' + id + '"') && !attached.has(id));
  check("every entry field is in the form", strays.length === 0, strays.join(", "));

  /* The three numbered blocks, in the form and in order. */
  const blocks = [...inForm.matchAll(/class="block-num"[^>]*>(\d)</g)].map(m => m[1]);
  check("the three numbered blocks are in the form",
    blocks.join(",") === "1,2,3", blocks.join(",") || "none");

  /* THE TIMER COMES BEFORE THE FORM in the DOM. That is what puts it first on
     phone, where it must stick to the top of the screen: it used to live in the
     aside, which comes AFTER a 3,500 px form, so its sticky stuck nothing at
     all. On desktop the CSS moves it back to the top of the right column, see
     the placement check further down. */
  check("and not in the form", !inForm.includes('id="chrono-total"'));
  const stopwatchDomPos = html.indexOf('id="chrono-widget"');
  check("the timer precedes the form in the DOM",
    stopwatchDomPos > 0 && stopwatchDomPos < formStart, "timer " + stopwatchDomPos + ", form " + formStart);

  /* The dark card is reserved for the timer: a form block wearing it signals
     that the split went wrong. */
  check("no form block is dressed as a dark card",
    !inForm.includes("card-dark"));

  /* ON DESKTOP the CSS puts the timer back at the top of the right column. The
     DOM order serves the phone, the grid serves the wide screen, and neither
     depends on an accidental reading order. */
  const css = readCss();
  check("the timer is placed at the top of the right column on desktop",
    /#chrono-widget\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*1/.test(css));
  check("and the recipe card column moves to the second row",
    /\.entry-aside\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*2/.test(css));

  /* The timer is collapsible: a header that controls a body. */
  const stopwatchZone = html.slice(stopwatchDomPos, formStart);
  check("the timer has a header that opens and closes its body",
    stopwatchZone.includes('aria-controls="chrono-body"') && stopwatchZone.includes('id="chrono-body"'));
  /* The time lives in the HEADER, not in the body: collapsed, it must stay
     readable, otherwise collapsing costs more than it brings. */
  const header = stopwatchZone.slice(stopwatchZone.indexOf('id="chrono-toggle"'), stopwatchZone.indexOf('id="chrono-body"'));
  check("the time stays readable when the timer is collapsed",
    header.includes('id="chrono-total"'));
  check("and so does the current pour step", header.includes('id="chrono-phase-short"'));
}
/* THE KETTLE FACTORY FALLBACK CANNOT BE ZERO.

   temperatureFromHeating() refuses to compute without a boiling time
   (`!(e > 0)`). With a zero fallback, estimating the degree from the heating
   time therefore NEVER kicked in: the function existed, it was just switched
   off, and nothing said so when a time was typed.

   Chris measured his kettle: 2 minutes from tap to full boil, and 1 min 30 at
   the stage of small rising bubbles, i.e. 80 to 90 degrees. The check locks
   both: a non-zero fallback, and a model that falls within the observed band.
   */
{
  const coreSrc2 = readFileSync(join(ROOT, "js/ui-core.js"), "utf8");
  const fallback = Number((coreSrc2.match(/FACTORY_BOIL_S\s*=\s*(\d+)/) || [])[1]);
  check("the factory boiling time is not zero, otherwise the calculation is off",
    fallback > 0, String(fallback));
  check("and equals the 2 minutes measured by Chris", fallback === 120, String(fallback));

  const t90 = temperatureFromHeating(90, fallback);
  check("at 1 min 30, the model falls in the small bubbles band (85 to 90)",
    t90 >= 85 && t90 <= 90, String(t90));
  check("and at 2 minutes it announces boiling",
    temperatureFromHeating(fallback, fallback) === 100,
    String(temperatureFromHeating(fallback, fallback)));
}
/* The temperature follows the coffee's roast (v9.00): Tetsu's 4:6 gives 93,
   88, 83 according to Philocoffea. A figure touched up by hand wins, and a
   recipe without a table keeps its own. */
{
  const t46 = STARTER_RECIPES.find(r => r.id === "tetsu-devil");
  check("4:6 light at 93", temperatureForCoffee(t46, { roast: "Claire" }) === 93);
  check("4:6 medium at 88", temperatureForCoffee(t46, { roast: "Medium" }) === 88);
  check("4:6 dark at 83", temperatureForCoffee(t46, { roast: "Foncée" }) === 83);
  check("4:6 without roast keeps 93", temperatureForCoffee(t46, { roast: "" }) === 93);
  check("4:6 touched up to 90 keeps 90", temperatureForCoffee({ ...t46, temp: 90 }, { roast: "Medium" }) === 90);
  const chron = STARTER_RECIPES.find(r => r.id === "chronicler");
  check("Chronicler without a table keeps 92", temperatureForCoffee(chron, { roast: "Medium" }) === 92);
}
/* THE DEFAULT HEAT IS THE SAME FIGURE EVERYWHERE.

   It lives in THREE places: the Brikka recipe seed (recipes.js), the interface
   factory fallback (ui-core.js) and the settings schema default
   (data-schema.js). Changing only one leaves a new logbook and an existing one
   announcing two different heats, without anything flagging it.

   The fourth place, the schema step, cannot be checked here: it acts on data
   already recorded, and it is the migration replay check, further up, that
   covers it. */
{
  const coreSrc2 = readFileSync(join(ROOT, "js/ui-core.js"), "utf8");
  const fallback = Number((coreSrc2.match(/FACTORY_FIRE\s*=\s*(\d+)/) || [])[1]);
  const schema = DATA.normalizeSettings({}).heat_level;
  const seeded = STARTER_RECIPES.filter(r => r.method === "Brikka").map(r => r.heat_level);
  const same = seeded.every(v => v === fallback) && fallback === schema;
  check("the default heat is the same in the three sources",
    same, "seed " + seeded.join("/") + ", fallback " + fallback + ", schema " + schema);
}
/* NO DEAD BUTTON.

   "Charger la demonstration", on the empty dashboard, did nothing since v7.3:
   it carried an id and no code listened to it. A button that does not respond
   throws nothing, writes nothing to the console, and only shows if someone
   clicks it at the right moment.

   The rule: every button carrying an id must be mentioned somewhere in the JS.
   Buttons driven by ATTRIBUTE (data-go, data-closes, data-screen) are delegated
   and do not need their id; submit buttons are handled by their form's
   submit. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  /* SOURCE_UI holds the eight interface files plus app.js: that is where all
     the button handlers live. SCRIPTS, on the other hand, only contains the
     data layer, so it was looking for the ids where they never are.
     */
  const allJs = SOURCE_UI;
  const dead = [];
  for (const m of html.matchAll(/<button[^>]*>/g)) {
    const b = m[0];
    const id = (b.match(/id="([^"]+)"/) || [])[1];
    if (!id) continue;
    // data-analysis: the analysis tabs, driven by delegation (v8.39).
    if (/data-go=|data-closes=|data-screen=|data-analysis=|type="submit"/.test(b)) continue;
    if (!allJs.includes('"' + id + '"') && !allJs.includes("#" + id)) dead.push(id);
  }
  check("no button with an id is left without code", dead.length === 0, dead.join(", "));
}
/* NAVIGATION: a rail on desktop, a bottom bar on phone.

   The old version of this block targeted <nav class="nav">, gone with the
   header in the Comptoir redesign: indexOf returned -1 and the check passed
   empty. It also carried /data-screen="(w+)"/ without a backslash, which never
   finds anything: "toutes les cibles data-screen existent" has therefore never
   verified anything since it existed. Both are fixed here. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const app = SOURCE_UI;
  const list = app.slice(app.indexOf("const SCREEN_NAMES = ["), app.indexOf("]", app.indexOf("const SCREEN_NAMES = [")));
  const screens = [...list.matchAll(/"(\w+)"/g)].map(m => m[1]);
  check("the screen list is readable from the test", screens.length === 6, screens.join(", "));

  /* Every navigation target must aim at a screen that exists. A misspelled
     data-screen throws nothing: the click simply does nothing. */
  const targets = [...html.matchAll(/data-screen="(\w+)"/g)].map(m => m[1]);
  check("navigation targets exist", targets.length > 0, String(targets.length));
  const unknownTargets = [...new Set(targets)].filter(c => !screens.includes(c));
  check("all data-screen targets exist", unknownTargets.length === 0, unknownTargets.join(", "));

  /* The rail carries the SIX screens: it is the full menu, the bottom bar only
     shows three and sends the rest to the sheet. */
  const rail = html.slice(html.indexOf('<nav class="rail"'), html.indexOf("</nav>"));
  const inRail = [...rail.matchAll(/data-screen="(\w+)"/g)].map(m => m[1]);
  const forgotten = screens.filter(e => !inRail.includes(e));
  check("the rail leads to the six screens, none has become unreachable",
    forgotten.length === 0, forgotten.join(", "));

  /* The bottom bar does not exceed five entries: beyond that it gets cramped
     and the targets drop below thumb comfort. That is the reason for "Plus".
     Five since v9.13 (M3): the new cup sits in the middle, between two
     screens on each side, and replaced the floating button. */
  const bar = html.slice(html.indexOf('<nav class="bottom-bar"'));
  const barEnd = bar.indexOf("</nav>");
  const entryCount = (bar.slice(0, barEnd).match(/class="[^"]*bar-entry/g) || []).length;
  check("five entries at most in the bottom bar", entryCount <= 5, String(entryCount));
  const barScreens = [...bar.slice(0, barEnd).matchAll(/data-screen="(\w+)"/g)].map(m => m[1]);
  check("the bar holds the dashboard, the history, the new cup and the Guide",
    ["dashboard", "history", "entry", "guide"].every(x => barScreens.includes(x)), barScreens.join(", "));

  /* THE THREE TOOLS ARE UNIQUE. app.js addresses them by id: if the rail and the
     sheet were two separate elements, the second button would be mute. That is
     precisely why the rail IS the sheet. */
  ["btn-lang", "btn-theme", "btn-data", "btn-plus"].forEach(id => {
    const n = (html.match(new RegExp('id="' + id + '"', "g")) || []).length;
    check("#" + id + " exists only once in the page", n === 1, String(n));
  });

  /* An entry without a readable label is mute to a screen reader. Entries carry
     a text <span>; those that do not must carry an aria-label.
     */
  const mute = [...html.matchAll(/<button[^>]*class="[^"]*(?:rail-entry|bar-entry)[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
    .filter(m => !/<span>[^<]+<\/span>/.test(m[1]) && !/aria-label=/.test(m[0]));
  check("every navigation entry carries a label", mute.length === 0, String(mute.length));

  /* NO EMOJI in the navigation: the art direction asks for line icons, one
     style. Emoji made the bar look different on every system. */
  const wholeNav = rail + bar.slice(0, barEnd);
  const emoji = [...wholeNav.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)].map(m => m[0]);
  check("no emoji in the navigation", emoji.length === 0, emoji.join(" "));
}
/* The logbook must NEVER refuse a save on the grounds that the coffee plus
   machine combination displeases it. There was a block on rang bo and non pure
   coffees in the Switch: it prevented exactly the attempt that would have
   produced the data able to settle it. The warnings stay, the refusal is gone. */
{
  const app = SOURCE_UI;
  check("no more save refusal in app.js",
    !app.includes("entry.bloque") && !app.includes("t_bloque"));

  const rec = readFileSync(join(ROOT, "js/recipes.js"), "utf8");
  check("combinationWarnings no longer returns a block", !rec.includes("bloque = true"));
  check("the cafeInterditSwitch function has gone", !rec.includes("cafeInterditSwitch"));

  const i18n = I18N_FR_SRC;
  check("the refusal key has gone from the dictionary", !i18n.includes("t_bloque"));
  const rangboLine = (i18n.match(/^ *warn_rang_bo:.*$/m) || [""])[0];
  check("the rang bo message no longer forbids, it informs",
    !rangboLine.includes("jamais") && rangboLine.includes("À tenter quand même"), rangboLine.slice(0, 90));

  // The warnings themselves stay: they inform without forbidding.
  check("the rang bo warning still exists", i18n.includes("warn_rang_bo"));
  check("the non pure coffee warning still exists", i18n.includes("warn_flavoured"));
}

/* TEMPERATURE FROM HEATING TIME (v7.93). The heating method select ("petites
   bulles", "frémissement") has gone: Chris always has the same kettle on the
   same burner, so the TIME on the heat is the reproducible measure, and the
   degree is deduced from it by a linear model from 28 to 100 °C at the boiling
   time set in Parametres. The degree stays stored and editable; the time is
   stored too. Nothing for the Brikka. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("the heating method select has gone", !html.includes('id="f-temp-preset"'));
  check("the heating time is entered in minutes and seconds",
    html.includes('id="f-heat-min"') && html.includes('id="f-heat-sec"'));
  check("heating_s is a column, at the end of the row, after failed",
    DATA.EXT_COLS.indexOf("heating_s") === DATA.EXT_COLS.length - 1 && DATA.EXT_COLS.includes("temperature_c"));
  check("the kettle boiling time is a synced setting",
    DATA.SETTINGS_COLS.includes("boil_s"));
  /* 120 s by default since Chris measured his kettle. Zero left the function
     switched off: temperatureFromHeating refuses to compute without a boiling
     time, so the estimate never kicked in. */
  check("the default is Chris's measurement, 2 minutes",
    DATA.normalizeSettings({}).boil_s === 120,
    String(DATA.normalizeSettings({}).boil_s));
  /* The function still refuses to compute without a time: it is its guard, and
     it stays useful for old data or data deliberately set to zero. */
  check("without a boiling time, no estimate is invented",
    temperatureFromHeating(120, 0) === "" && heatTimeForTemperature(92, 0) === "");
  check("an absurd boiling time falls back on the measurement, not on zero",
    DATA.normalizeSettings({ boil_s: 5 }).boil_s === 120 &&
    DATA.normalizeSettings({ boil_s: 300 }).boil_s === 300);

  /* The model (v8.59): a curve from tap water (28) to boiling (100), which
     passes 88 at the first bubbles marker. Chris found the straight line too
     low: at 1:30 his bubbles are already rising, it said 82. */
  check("zero seconds on the heat is tap water", temperatureFromHeating(0, 120, 90) === 28);
  check("the boiling time gives 100", temperatureFromHeating(120, 120, 90) === 100);
  check("beyond it, the water does not exceed 100", temperatureFromHeating(600, 120, 90) === 100);
  check("the first bubbles marker gives 88", temperatureFromHeating(90, 120, 90) === 88,
    String(temperatureFromHeating(90, 120, 90)));
  check("and it is adjustable: at 1:40 out of 2:00, 1:40 is what gives 88",
    temperatureFromHeating(100, 120, 100) === 88 && temperatureFromHeating(90, 120, 100) < 88);
  check("the curve rises fast then slows: halfway, above the straight line",
    temperatureFromHeating(60, 120, 90) > 64, String(temperatureFromHeating(60, 120, 90)));
  const rise = [0, 15, 30, 45, 60, 75, 90, 105, 120].map(s => temperatureFromHeating(s, 120, 90));
  check("the curve never goes back down", rise.every((v, i) => !i || v >= rise[i - 1]), rise.join(","));
  check("a marker right on the straight line gives back the old model",
    temperatureFromHeating(120, 240, 200) === 64);
  check("a missing marker or one after boiling falls at three quarters",
    temperatureFromHeating(90, 120, "") === 88 && temperatureFromHeating(90, 120, 150) === 88);
  check("without a time, no estimate", temperatureFromHeating("", 120, 90) === "");
  check("the inverse falls back on the time, within 5 seconds",
    Math.abs(heatTimeForTemperature(92, 120, 90) - 100) <= 5 &&
    Math.abs(temperatureFromHeating(heatTimeForTemperature(92, 120, 90), 120, 90) - 92) <= 2,
    String(heatTimeForTemperature(92, 120, 90)));
  check("88 degrees is the bubbles marker", heatTimeForTemperature(88, 120, 90) === 90);
  check("100 degrees is the full boiling time", heatTimeForTemperature(100, 120, 90) === 120);
  check("the bubbles marker is a synced setting, 1:30 by default",
    DATA.SETTINGS_COLS.includes("bubbles_s") && DATA.normalizeSettings({}).bubbles_s === 90);
  check("and Parametres enters it in minutes and seconds",
    html.includes('id="param-bubbles-min"') && html.includes('id="param-bubbles-sec"'));
  const entryJs = readFileSync(join(ROOT, "js/ui-entry.js"), "utf8");
  check("every estimate in the entry passes the bubbles marker",
    (entryJs.match(/(temperatureFromHeating|heatTimeForTemperature)\(/g) || []).length ===
    (entryJs.match(/(temperatureFromHeating|heatTimeForTemperature)\([^)]*fallbacks\.bubbles\)/g) || []).length);

  // A normalised extraction keeps the time, and a Brikka never has one.
  const n = DATA.normalizeExtraction({ heating_s: "215.4" });
  check("the heating time is rounded to the second and kept", n.heating_s === 215);
  check("empty stays empty, never zero", DATA.normalizeExtraction({}).heating_s === "");
  const app = SOURCE_UI;
  check("the entry only saves a heating time on the Switch",
    /heating_s: entry\.method === "Switch" \? readDuration\("f-heat"\) : ""/.test(app));
  check("the heating row is hidden on the Brikka", /row-heat"\)\.hidden = m !== "Switch"/.test(app));
  check("the help texts are bilingual",
    bilingual("temp_estimate") && bilingual("temp_advice") && bilingual("temp_no_kettle") && bilingual("detail_kettle") && bilingual("toast_param_boil"));
}

/* Scaling the pours. A recipe writes its pour steps in ABSOLUTE grams, so
   changing the water in the entry made it wrong: it still asked for 225 g while
   Chris had poured 240, and so did the timer. */
{
  /* The Chronicler carries 240 g since August 24: Chris's source document says
     "15 g / 240 g, ratio 1:16", the original transcription had shrunk it to
     225. The pour steps follow, 120 g then 240 g. */
  const cc = STARTER_RECIPES.find(r => r.name === "The Coffee Chronicler's Recipe");
  check("the Chronicler recipe exists and carries 240 g", cc && Number(cc.water) === 240,
    cc && String(cc.water));
  check("its ratio does announce 1:16", (cc.ratioText || "").includes("1:16"), cc.ratioText);
  check("its Sweet variant carries the same water",
    STARTER_RECIPES.filter(r => r.family === "chronicler").every(r => Number(r.water) === 240));

  const milestones = cc.steps.map(e => e.text);
  check("its pour steps quote 120 g then 240 g",
    milestones[0].includes("120 g") && milestones[1].includes("240 g"), milestones.join(" | "));

  // Scaling: pouring 300 instead of 240 is a factor of 1.25.
  const a300 = milestones.map(x => scalePours(x, 300 / 240));
  check("at 300 g, 120 g becomes 150 g", a300[0].includes("150 g"), a300[0]);
  check("at 300 g, 240 g becomes 300 g", a300[1].includes("300 g"), a300[1]);
  check("the step without grams is intact", a300[2] === milestones[2], a300[2]);

  const double = milestones.map(x => scalePours(x, 2));
  check("doubled, 120 g becomes 240 g", double[0].includes("240 g"), double[0]);
  check("doubled, 240 g becomes 480 g", double[1].includes("480 g"), double[1]);

  check("a factor of 1 touches NOTHING, to the character",
    milestones.every(x => scalePours(x, 1) === x));
  check("an absurd factor leaves the text intact",
    scalePours("Compléter à 225 g", 0) === "Compléter à 225 g" &&
    scalePours("Compléter à 225 g", NaN) === "Compléter à 225 g");

  // THE safeguard: a coffee dose quoted in a text must never move.
  check("a coffee dose in the text is not multiplied",
    scalePours("Doser 14 g de café puis verser 225 g", 2) === "Doser 14 g de café puis verser 225 g".replace("225 g", "450 g"),
    scalePours("Doser 14 g de café puis verser 225 g", 2));
  check("the threshold lets a 45 g bloom through",
    scalePours("Bloom 45 g", 2) === "Bloom 90 g", scalePours("Bloom 45 g", 2));
  check("the threshold is below the smallest pour and above the largest dose",
    POUR_THRESHOLD_G < 45 && POUR_THRESHOLD_G >= 18, String(POUR_THRESHOLD_G));

  // MILK grams stay below the threshold, so they are protected.
  check("a 20 g milk addition is not multiplied",
    scalePours("Ajouter 20 g de lait", 2) === "Ajouter 20 g de lait");

  /* Real case found by this test: two Brikka recipes quote a DOSE in their text,
     "Extraire exactement comme la Brikka classique : 14 g". That is precisely
     what the threshold protects. We check that these doses do not move even
     when doubled, and that the water pours, for their part, do follow. */
  const allSteps = STARTER_RECIPES.flatMap(r => (r.steps || []).map(e => e.text));
  const withDose = allSteps.filter(x => x.includes("14 g"));
  check("pour steps do quote a coffee dose, the case the threshold protects",
    withDose.length > 0, String(withDose.length));
  check("these doses stay intact even when doubled",
    withDose.every(x => scalePours(x, 2) === x), withDose[0]);

  const grams = /([0-9]+(?:[.,][0-9]+)?)[ ]*g(?![a-z])/g;
  const withWater = allSteps.filter(x =>
    [...x.matchAll(grams)].some(m => Number(String(m[1]).replace(",", ".")) > POUR_THRESHOLD_G));
  check("the water pour steps, for their part, all change when doubled",
    withWater.length >= 8 && withWater.every(x => scalePours(x, 2) !== x), String(withWater.length));
}

/* No volume estimate on the Brikka: the formula water - 0.7 x dose announced
   139 ml for 150 g of boiler water and 16 g of coffee, while the real
   measurement is 90 to 115 ml. A wrong figure was worse than no figure: it fed
   the ratio, the drink volume and the milk preset. */
{
  const app = SOURCE_UI;
  check("the Brikka formula has gone from app.js", !app.includes("0.7 * dose"));
  check("estimatedVolume returns right away on the Brikka",
    /function estimatedVolume[\s\S]{0,220}method === "Brikka"[\s\S]{0,20}return 0/.test(app));
  check("a single yield formula remains, the Switch one",
    (app.match(/2\.1 \* dose/g) || []).length === 1,
    String((app.match(/2\.1 \* dose/g) || []).length));
  check("the milk preset reads the measured volume, not an estimate",
    app.includes("milk_no_volume"));

  // Retention, for its part, stays computed: it is a MEASUREMENT, not an estimate.
  const c = DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: 95 });
  check("retention is deduced from the two measurements", c.retention_ml === 55, String(c.retention_ml));
  check("without a measured volume, no invented retention",
    DATA.calcs({ method: "Brikka", dose_g: 16, water_g: 150, yield_ml: "" }).retention_ml === "");
}

/* The grind field had a hardcoded "1.5.0" placeholder, which promised a default
   value while the field is prefilled. Same mistake as the "93" of the
   temperature in v7.33. The grinder setting is set in Parametres. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const field = (html.match(/<input[^>]*id="f-grind"[^>]*>/) || [""])[0];
  check("the grind field no longer has a misleading placeholder", !field.includes("placeholder"), field);
  check("Parametres carries the grinder setting", html.includes('id="param-dial"'));

  const app = SOURCE_UI;
  /* Except the recipe whose grind goes OUT of its machine's range ON PURPOSE
     (the Neo Brew, v8.63): its extra coarse grind is the recipe itself. */
  check("the prefill reads the grinder setting, not the recipe dial",
    app.includes('$("#f-grind").value = currentCoffeeGround() ? "" : wantedDial(r) ? r.dial : fallbacks.dial;'));
  check("and only a recipe outside its machine's range imposes its dial",
    app.includes("!GRIND.checkRange(r.method, r.dial).ok"));
  check("the factory setting is the compromise of both machines",
    app.includes('FACTORY_DIAL = "1.5.0"'));
}

/* The Saisie button in the navigation continued an EDIT in progress: Chris
   opened an extraction from the history, went elsewhere, came back through the
   tab, and the form overwrote the past extraction thinking it was creating a
   cup. Silent data loss. */
{
  const app = SOURCE_UI;
  check("arriving on Saisie via navigation abandons the edit",
    app.includes('if (nameKey === "entry" && UI.entry.editId && !forEditing)'));
  check("the abandonment is announced, it is not silent",
    app.includes('toast_edit_dropped'));
  /* The legitimate exception goes through a PARAMETER, no longer a shared flag.
     The flag was set forty lines before and cleared after, without finally: an
     exception in between left it at true forever, and edit abandonment never
     triggered again. Chris then reopened an old extraction thinking he was
     entering a new one. A parameter cannot get stuck, it dies with the call.
     */
  check("the exception goes through a parameter, not a shared state",
    !app.includes("ouvertureEdition"), "ouvertureEdition still exists");
  check("and only opening an edit asks for it",
    app.includes('activateScreen("entry", true)') &&
    (app.match(/activateScreen\([^)]*,\s*true\)/g) || []).length === 1,
    (app.match(/activateScreen\([^)]*,\s*true\)/g) || []).join(", "));

  /* The activateScreen calls that FOLLOWED loadExtractionIntoEntry are gone:
     the function already opens the screen, and the extra call now reset the
     edit that had just been opened. */
  check("no more redundant activateScreen after loading an extraction",
    !/loadExtractionIntoEntry\([^)]*\);\s*\n\s*activateScreen\("entry"\)/.test(app));

  const i18n = I18N_FR_SRC;
  check("the abandonment message exists in FR and EN", bilingual("toast_edit_dropped"));
}

/* Single dial: Chris does not recount the clicks for each machine. */
{
  /* One exception, intended: the Tetsu Neo Brew (v8.63), extra coarse, outside
     the Switch range. Every other recipe carries 1.5.0, and the exception must
     really go out of range, otherwise it would have no reason to exist. */
  const exceptions = STARTER_RECIPES.filter(r => r.dial !== "1.5.0");
  check("all seeded recipes carry 1.5.0, except the Neo Brew",
    exceptions.map(r => r.id).join() === "neo-brew", exceptions.map(r => r.id + " " + r.dial).join(", "));
  check("and the Neo Brew really goes out of the Switch range",
    exceptions.every(r => GRIND.parseDial(r.dial).clicks > GRIND.METHODS.find(m => m.id === "switch").maxC));

  // Changing the seed is never enough: STORED recipes must follow.
  const data = SOURCE_DATA;
  check("a schema step catches up the dial of stored recipes",
    data.includes("single dial at 1.5.0"));
  check("it is not limited to the Brikka, the Switch ones are concerned too",
    /single dial at 1\.5\.0[\s\S]{0,300}state\.recipes\.forEach/.test(data));
}

/* The frame is set ONCE, on .screen: max width and centering. No #ecran-* must
   set a width or a margin: an id rule beats the class, and that is how the
   history ended up stuck to the left by a margin-left: 0 inherited from an old
   widening, while its neighbours were centred. General rule, not a one-off
   fix. */
{
  // Without comments: a comment quoting #screen-entry is not a rule.
  const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const frame =(css.match(/\.screen \{([^}]*)\}/g) || []).join(" ");
  check("the common frame bounds and centres every screen",
    /max-width:\s*var\(--frame\)/.test(frame) && /margin-inline:\s*auto/.test(frame), frame);
  const offenders = [];
  const re = /([^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (!/#ecran-[\w-]+\s*(,|$)/.test(sel)) continue;
    if (/(^|[^-])(width|max-width|margin|margin-left|margin-right|margin-inline)\s*:/.test(m[2])) offenders.push(sel);
  }
  check("no screen sets its own width or its own margin", offenders.length === 0, offenders.join(" | "));
}

/* Guide screen: the grinder is handled with the slider and the setting is
   applied in one button. The slider is in CLICKS, the grinder's real unit. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sl = (html.match(/<input[^>]*id="conv-slider"[^>]*>/) || [""])[0];
  check("the grinder slider exists", sl.length > 0);
  check("it covers the grinder's full travel, 0 to 150 clicks",
    sl.includes('min="0"') && sl.includes('max="150"'), sl);
  check("its step is ONE click, not a rounding", sl.includes('step="1"'), sl);
  const grind = readFileSync(join(ROOT, "js/grind.js"), "utf8");
  check("the slider stop is the grinder's", grind.includes("MAX_CLICKS = 150"));
  check("the apply button exists", html.includes('id="conv-apply"'));
  check("the advice area exists", html.includes('id="conv-advice"'));

  /* The offset zero of Chris's grinder must be written on the page: it skews the
     whole micron scale by 2 clicks, and nothing else says so. */
  check("the zero offset is documented", html.includes("callout-zero"));
  check("it gives the figure, not just a warning",
    html.includes("2 crans après le 0 du cadran"));

  // Recipes: moved below the Rules, a tab is already dedicated to them.
  const order = [...html.matchAll(/id="(ref-[a-z]+)"/g)].map(m => m[1]);
  const rank = k => order.indexOf(k);
  check("the grinder comes before the recipes", rank("ref-grinder") < rank("ref-recipes"),
    order.join(" > "));
  check("the table of contents follows the same order as the page",
    // L5 (v8.94): the Guide home comes before everything, on purpose.
    order.filter(k => k !== "ref-recipes" && k !== "ref-welcome").join(",") ===
    ["ref-grinder", "ref-diagnostic", "ref-rules", "ref-vocabulary"].join(","),
    order.join(","));
}

/* Consistency of the Guide page with the real data: it stated counts and grind
   settings that no longer matched the recipes. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const brikkaCount = STARTER_RECIPES.filter(r => r.method === "Brikka").length;
  const switchCount = STARTER_RECIPES.filter(r => r.method === "Switch").length;
  /* The guide sentence must follow the data. We reread it and compare, instead of
     freezing both sides: otherwise merging two recipes leaves a guide that lies,
     and that is the kind of gap nobody is going to check. */
  const WORDS = ["Zéro", "Une", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf", "Dix"];
  const announced = WORDS[brikkaCount] + " recettes Brikka et " + WORDS[switchCount].toLowerCase() + " recettes Switch.";
  check("the guide announces the right number of recipes",
    html.includes(announced), "expected: " + announced);
  check("the old grind summary per recipe has gone",
    !html.includes("Récapitulatif mouture des recettes Switch"));
  check("the reference markers no longer talk about recipe numbers",
    !html.includes("Switch recettes 1 et 2") && !html.includes("Switch recettes 5 et 6"));
}

/* STORED recipes never follow the seed on their own: without a migration, Chris
   would have kept reading 225 g on his site. */
{
  const data = SOURCE_DATA;
  check("a schema step catches up the stored Chronicler recipes",
    data.includes("Chronicler at 240 g"));
  check("it only targets the family concerned and the wrong value",
    /Chronicler at 240 g[\s\S]{0,300}family !== "chronicler"[\s\S]{0,80}225/.test(data));
}

/* A selected state must change ONLY colours. Any property that touches the text
   width reflows the line on click: ticking a descriptor sent the next group to
   a new line, right under the fingers. */
{
  const css = readCss();
  const metrics = /font-weight|font-size|letter-spacing|padding|border-width/;
  const offending = [];
  const re = /([^{}]*\.on[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (metrics.test(m[2])) offending.push(m[1].trim());
  }
  check("no selected state changes the text width",
    offending.length === 0, offending.join(" | "));

  // Background and colour must stay, otherwise the selection no longer shows.
  const activeTag = (css.match(/\.tag\.on \{([^}]*)\}/) || ["", ""])[1];
  check("the selection stays visible through background and colour",
    activeTag.includes("background") && activeTag.includes("color"), activeTag.trim());
}

/* The score is optional: Chris saves when taking the cup out and comes back to
   rate it after drinking it. An empty score must stay empty end to end, and
   above all never become 0, which would be the worst of scores. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  /* Since v8.40, "pas encore notée" is the state of the slider itself: no thumb
     until it has been touched. It must start in that state, in the entry as in
     the quick entry, and the checkbox has gone. */
  check("the score slider starts without a thumb, in both entries",
    /<input[^>]*id="f-rating"[^>]*class="[^"]*slider-inactive/.test(html) &&
    /<input[^>]*id="q-rating"[^>]*class="[^"]*slider-inactive/.test(html));
  check("the not yet rated checkbox has gone", !/note-vide/.test(html));
  /* But no more second look (v8.68): the class is a state, not a style. Dotted
     and hidden thumb made two different sliders. */
  const cssScore = readCss();
  check("the score not given no longer has a style of its own", !/\.slider-inactive\s*[:{,]/.test(cssScore));
  check("the slider no longer suggests 7",
    /<input[^>]*id="f-rating"[^>]*value="5"/.test(html));

  const app = SOURCE_UI;
  check("saving reads entryRating and no longer the raw slider",
    app.includes("score_10: entryRating()"));
  check("putting a finger on the slider counts, even without movement",
    app.includes("pointerdown"));

  // The point that really matters: "" must not turn into 0.
  const csv = DATA.csvSerialize([{ id: "e1", score_10: "" }], DATA.EXT_COLS);
  const row = csv.split("\n")[1];
  const iScore = DATA.EXT_COLS.indexOf("score_10");
  check("an empty score stays empty in the CSV", row.split(",")[iScore] === "",
    JSON.stringify(row.split(",")[iScore]));
}

/* EQUIPMENT settings (fallback dose, heat power, grinder dial) are synced,
   because they describe Chris's grinder and coffee maker and not the device he
   is holding. They lived in localStorage, so his phone ignored what he set on
   the computer. */
{
  check("settings are a synced table", Array.isArray(DATA.state.settings));

  const defaults = DATA.normalizeSettings({});
  check("factory values: 15 g, heat 3, dial 1.5.0",
    defaults.dose_g === 15 && defaults.heat_level === 3 && defaults.grind_dial === "1.5.0",
    JSON.stringify(defaults));
  check("a single row, with a fixed id", defaults.id === DATA.SETTINGS_ID);

  // What comes from the network is not trustworthy: we clamp everything.
  const absurd = DATA.normalizeSettings({ dose_g: -5, heat_level: 99, grind_dial: "nawak" });
  check("a negative dose falls back to the factory value", absurd.dose_g === 15, String(absurd.dose_g));
  check("an out of scale heat falls back to the factory value", absurd.heat_level === 3);
  check("an invalid dial falls back to the factory value", absurd.grind_dial === "1.5.0");
  /* 5 and not 3: 3 became the factory value, and a check verifying that a value
     passes through as is proves nothing if it is also the one obtained on
     failure. */
  const good = DATA.normalizeSettings({ dose_g: 16, heat_level: 5, grind_dial: "1.2.0" });
  check("valid values pass through as is",
    good.dose_g === 16 && good.heat_level === 5 && good.grind_dial === "1.2.0", JSON.stringify(good));

  // updated_at preserved, never restamped on read: same rule as everywhere.
  check("updated_at is preserved as is", DATA.normalizeSettings({ updated_at: 1234 }).updated_at === 1234);

  // And above all: updated_at must not leak into the CSV.
  const csv = DATA.csvSerialize([{ id: "moi", updated_at: 1699999999999, dose_g: 16 }], DATA.SETTINGS_COLS);
  check("settings.csv header", csv.split("\n")[0] === "id,dose_g,heat_level,grind_dial,schema_version,boil_s,step_clicks,step_degrees,step_heat,step_water_g,step_dose_g,drawings,bubbles_s,jar_tare_g",
    csv.split("\n")[0]);
  check("updated_at missing from the settings CSV", !csv.includes("1699999999999"));
}

/* DAYS SINCE THE BAG WAS OPENED. The roast date was of no use: none of Chris's
   five coffees carries it and he will not have it. The opening day, on the other
   hand, he always knows, and it is what moves his cups the most between D+1
   and D+21. */
{
  DATA.state.coffees = [{ id: "c1", name: "Test", active: 1 }];
  DATA.state.purchases = [
    { id: "a1", coffee_id: "c1", purchase_date: "2026-08-01", opened_date: "2026-08-03", bag_size_g: 250 },
    { id: "a2", coffee_id: "c1", purchase_date: "2026-08-20", opened_date: "2026-08-25", bag_size_g: 250 },
  ];

  const days = (date) => DATA.calcs({ coffee_id: "c1", date_time: date }).days_open;
  check("the opening day counts as zero", days("2026-08-03T09:00") === 0, String(days("2026-08-03T09:00")));
  check("one week later, seven days", days("2026-08-10T09:00") === 7, String(days("2026-08-10T09:00")));

  /* The bag retained is the one IN USE that day, not the last one bought.
     Otherwise a cup from August 10 would be tied to the bag from the 20th and
     show a negative age. */
  check("a cup from before the repurchase follows the old bag",
    days("2026-08-15T09:00") === 12, String(days("2026-08-15T09:00")));
  check("a cup from after the repurchase follows the new one",
    days("2026-08-27T09:00") === 2, String(days("2026-08-27T09:00")));

  // Without an opening date, we say nothing rather than show a false zero.
  DATA.state.purchases = [{ id: "a1", coffee_id: "c1", purchase_date: "2026-08-01", opened_date: "", bag_size_g: 250 }];
  check("bag not opened yet: no age", days("2026-08-10T09:00") === "",
    JSON.stringify(days("2026-08-10T09:00")));
  check("coffee without any bag: no age",
    DATA.calcs({ coffee_id: "inconnu", date_time: "2026-08-10T09:00" }).days_open === "");

  // The column exists in the CSV, and updated_at still does not get in.
  check("opened_date is a purchases column", DATA.PURCHASE_COLS.includes("opened_date"));
  const csv = DATA.csvSerialize([{ id: "a1", updated_at: 1699999999999, opened_date: "2026-08-03" }], DATA.PURCHASE_COLS);
  check("the opening date goes out in the CSV", csv.includes("2026-08-03"));
  check("updated_at still does not get into the CSV", !csv.includes("1699999999999"));

  // The old freshness rule has gone, the new one replaced it.
  const app = SOURCE_UI;
  check("the roast based freshness rule has gone", !app.includes("insightFraicheur"));
  check("the bag age rule replaces it", app.includes("insightBagAge"));
  const i18n = I18N_FR_SRC;
  check("its dead keys left with it", !i18n.includes("ins_frais_tot"));
}

/* TREND CURVE. Raw scores jump too much to be read: 8 then 4 then 7.5 from one
   day to the next. The moving average tells the real story. */
{
  const cup = (day, rating) => ({ id: "t" + day, date_time: "2026-08-" + day + "T12:00", score_10: rating });
  const sample = [cup("01", 8), cup("02", 8), cup("03", 8), cup("04", 8), cup("05", 8),
              cup("06", 3), cup("07", 3), cup("08", 3), cup("09", 3), cup("10", 3)];
  const g = TUNING.rollingAverage(sample, 5);

  check("one value per rated cup", g.length === 10, String(g.length));
  /* The first four are empty: showing an average of two cups as if it were one
     of five would lie about its solidity. */
  check("the window only starts once full",
    g.slice(0, 4).every(x => x.value === null) && g[4].value === 8,
    JSON.stringify(g.slice(0, 5).map(x => x.value)));
  check("it goes down gradually, without jumping",
    g.slice(4).map(x => x.value).join() === "8,7,6,5,4,3",
    g.slice(4).map(x => x.value).join());

  // UNRATED cups do not count, they must not dig into the curve.
  const withGaps = sample.concat([{ id: "x", date_time: "2026-08-11T12:00", score_10: "" }]);
  check("a cup without a score is ignored", TUNING.rollingAverage(withGaps, 5).length === 10);

  // Input order must change nothing: we sort by date.
  const shuffled = [sample[9], sample[0], sample[5], sample[2], sample[7], sample[1], sample[8], sample[3], sample[6], sample[4]];
  check("input disorder changes nothing",
    TUNING.rollingAverage(shuffled, 5).map(x => x.value).join() === g.map(x => x.value).join());

  // Fewer cups than the window: only empties, never a partial average.
  check("three cups for a window of five give no value",
    TUNING.rollingAverage(sample.slice(0, 3), 5).every(x => x.value === null));
  check("no cup, no point", TUNING.rollingAverage([], 5).length === 0);
}

/* THE LEVER THAT MATTERS, PER COFFEE AND PER MACHINE. Comparing groups over the
   whole history mixes a Sang Tao on the Brikka and a Liberica on the Switch: the
   resulting average describes no real cup. */
{
  const t = (coffee, method, fire, rating) => ({
    id: coffee + method + fire + rating + Math.round(rating * 10),
    coffee_id: coffee, method: method, heat_level: fire, score_10: rating,
    date_time: "2026-08-01T12:00", recipe: "R", dose_g: 15,
  });
  const coffees = [{ id: "c1", name: "Cafe un" }, { id: "c2", name: "Cafe deux" }];

  // A clear-cut batch: heat 3 clearly above heat 2, on the same coffee.
  const net = [
    t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8),
    t("c1", "Brikka", 2, 5), t("c1", "Brikka", 2, 5), t("c1", "Brikka", 2, 5),
  ];
  const r = TUNING.findingsByCoffee(coffees, net, { minBatch: 6, minPerGroup: 3, minGap: 0.4 });
  check("a clear gap is reported", r.length === 1, String(r.length));
  check("the right lever is designated", r[0] && r[0].lever === "heat", r[0] && r[0].lever);
  check("the right value wins", r[0] && r[0].value === "3", r[0] && r[0].value);
  check("both averages are correct", r[0] && r[0].high === 8 && r[0].low === 5,
    r[0] && r[0].high + " / " + r[0].low);
  check("the coffee and the machine are named",
    r[0] && r[0].coffee.name === "Cafe un" && r[0].method === "Brikka");

  /* THE CENTRAL POINT: the same cups spread over TWO coffees must no longer
     conclude anything. That is exactly the trap of global rules. */
  const shuffled = [
    t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8), t("c1", "Brikka", 3, 8),
    t("c2", "Brikka", 2, 5), t("c2", "Brikka", 2, 5), t("c2", "Brikka", 2, 5),
  ];
  check("two different coffees are not compared with each other",
    TUNING.findingsByCoffee(coffees, shuffled, { minBatch: 6, minPerGroup: 3, minGap: 0.4 }).length === 0);

  // Same coffee, different machines: we do not mix either.
  const twoMachines = net.map((e, i) => i < 3 ? e : { ...e, method: "Switch" });
  check("two machines are not compared with each other",
    TUNING.findingsByCoffee(coffees, twoMachines, { minBatch: 6, minPerGroup: 3, minGap: 0.4 }).length === 0);

  // The safeguards: below the gap threshold, we stay quiet.
  const weakPower = net.map(e => e.heat_level === 2 ? { ...e, score_10: 7.8 } : e);
  check("a 0.2 point gap says nothing",
    TUNING.findingsByCoffee(coffees, weakPower, { minBatch: 6, minPerGroup: 3, minGap: 0.4 }).length === 0);
  // And below the count threshold too.
  check("two cups per group are not enough",
    TUNING.bestLever(net.slice(0, 2).concat(net.slice(3, 5)), 3, 0.4) === null);
  // A lever that never varied cannot explain anything.
  const constant = net.map(e => ({ ...e, heat_level: 3 }));
  check("a constant lever concludes nothing", TUNING.bestLever(constant, 3, 0.4) === null);

  // Unrated cups do not count.
  check("cups without a score are ignored",
    TUNING.findingsByCoffee(coffees, net.concat([{ id: "z", coffee_id: "c1", method: "Brikka", score_10: "" }]),
      { minBatch: 6, minPerGroup: 3, minGap: 0.4 })[0].total === 6);
}

/* COST PER CUP on the coffee card. Everything was computable from the purchases
   table, nothing was shown. The price per bag depends on the size and the price
   per gram says nothing as long as the dose is unknown: the cost of ONE cup is
   the only figure that compares from one bag to another. */
{
  const app = SOURCE_UI;
  check("the coffee card carries a cost per cup", app.includes("function costPerCup"));
  check("it uses the coffee's average dose, not the fallback dose",
    app.includes("cupCost = typicalDose"));

  /* The second figure, for NON PURE coffees: the Sang Tao is 82 % coffee, so much
     more expensive per gram of REAL coffee than it looks. The
     real_coffee_pct field was only used for the caffeine calculation. */
  check("the non pure coffee shows its real cost", app.includes("cost_real"));
  const i18n = I18N_FR_SRC;
  check("both labels exist in FR and EN",
    bilingual("cost_per_cup") && bilingual("cost_real"));

  // The arithmetic, on the real Sang Tao figures: 149,000 d for 340 g.
  const perGram = 149000 / 340;
  check("a 14 g cup costs about 6,135 d", Math.round(perGram * 14) === 6135,
    String(Math.round(perGram * 14)));
  check("the same in real coffee at 82 % costs 7,482",
    Math.round(perGram / 0.82 * 14) === 7482, String(Math.round(perGram / 0.82 * 14)));
}

/* DELETION WITH UNDO. Constraint set by Chris: if the page closes during the five
   seconds, the deletion must STILL happen. That rules out the naive solution of
   delaying the deletion. So we delete right away, for real, and keep a copy in
   memory. */
{
  const app = SOURCE_UI;
  const block = app.slice(app.indexOf("async function deleteExtractionWithUndo"),
    app.indexOf("async function deleteExtractionWithUndo") + 700);

  /* THE point: the deletion precedes the message, it is not delayed. If a
     setTimeout wrapped the deletion, closing the tab would cancel it. */
  check("the deletion is done BEFORE showing the undo",
    block.indexOf("deleteExtraction(") < block.indexOf("toastAction("),
    String(block.indexOf("deleteExtraction(")) + " versus " + String(block.indexOf("toastAction(")));
  check("no delay wraps the deletion itself", !block.includes("setTimeout"));

  check("the native delete confirm has gone", !app.includes('confirm(I18N.t("confirm_delete"))'));
  /* NO native confirm() left in the interface: the four remaining ones (demo,
     clear, restore, delete a recipe) go through UI.askConfirm, a <dialog> of the
     page. Only askConfirm()'s own fallback, `window.confirm`, is allowed to exist,
     and it is preceded by a dot. */
  // The comments explain precisely what was removed: we ignore them.
  const code = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const nativeCalls = [...code.matchAll(/(^|[^.\w])confirm\(/g)];
  check("no native confirm() remains in the interface", nativeCalls.length === 0, String(nativeCalls.length));
  // Six: an import preview (v8.71) and deleting a bag (v8.77) also ask for confirmation.
  check("the six questions go through the page dialog",
    (code.match(/await (?:UI\.)?askConfirm\(/g) || []).length === 6);
  check("the dialog labels are bilingual", bilingual("confirm_title") && bilingual("confirm_ok"));
  check("undo restores under the original id", app.includes("DATA.restoreExtraction"));

  const data = SOURCE_DATA;
  const rest = data.slice(data.indexOf("async function restoreExtraction"),
    data.indexOf("async function addExtraction"));
  /* The original id matters: edit links, the comparator selection and the
     history references point to it. */
  check("restoreExtraction keeps the id", rest.includes("e.id = ext.id"));
  check("it stamps, so it beats the tombstone", rest.includes("stampRow("));
  check("it replaces the row if it is already there, otherwise it adds it",
    rest.includes("findIndex") && rest.includes("push(e)"));

  const i18n = I18N_FR_SRC;
  check("the Annuler button exists in FR and EN", bilingual("toast_undo"));
  check("so does the restore message", bilingual("toast_restored"));
}

/* TOGGLE ACCESSIBILITY. 70 buttons and zero aria-pressed: the state showed
   through the coloured background but nothing ANNOUNCED it. A screen reader read
   "bouton chocolat noir" without ever saying whether it was ticked. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const app = SOURCE_UI;

  // The machine choice, in the static HTML.
  const methodButtons = [...html.matchAll(/<button[^>]*class="btn-method[^"]*"[^>]*>/g)].map(m => m[0]);
  check("both machine buttons exist", methodButtons.length === 2, String(methodButtons.length));
  check("and they announce their state", methodButtons.every(m => m.includes("aria-pressed")),
    methodButtons.join(" | "));

  // Pills and tags, generated in JS.
  check("diagnostic pills are born with an announced state",
    /class="pill" aria-pressed=/.test(app));
  check("so are the descriptors", /class="tag" aria-pressed=/.test(app));

  /* The point that matters over time: class and attribute toggle in ONE single
     gesture. Separating them would guarantee they diverge one day. */
  check("a single helper toggles the visual and the announcement",
    app.includes("function setPressed") &&
    /function setPressed[\s\S]{0,220}classList\.toggle[\s\S]{0,120}aria-pressed/.test(app));
  const leftovers = [...app.matchAll(/classList\.toggle\("actif"/g)].length;
  /* Some remain for elements that are NOT toggles: comparison rows, row
     buttons, navigation tabs. */
  check("toggles all go through the helper", leftovers <= 4, String(leftovers));

  // Navigation announces itself as the current page, not as a toggle.
  check("the current screen uses aria-current", app.includes('aria-current", "page"'));

  /* Hover tooltips were unreachable by finger: on phone hover does not exist and
     a tap does not trigger :focus-visible. */
  const css = readCss();
  check("tooltips also open without hover", css.includes(".info-expanded::after"));
  check("a long press triggers them", app.includes("LONG_PRESS_MS"));
  /* Attached ONCE: the containers survive pill rebuilds, attaching it from
     buildPills would stack one set of listeners per language toggle.
     */
  check("long press listeners are set at wiring time, not at each render",
    app.indexOf("enableLongPress($(\"#f-diagnostic\"))") > app.indexOf("function wireEntry"),
    "attached before wiring");
}

/* CHART.JS ON DEMAND. 68 KB gzipped, 30 % of the site weight, for a single
   screen. Opening on Saisie, Historique or Guide must no longer download any of
   it: the heatmap and the grinder ruler are home-made SVG. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  // A preload (v8.75) executes nothing: only a script tag would.
  check("Chart.js is no longer a script tag", !/<script[^>]*chart.umd.js/.test(html));
  check("but it is preloaded for the dashboard", html.includes('<link rel="preload" href="js/vendor/chart.umd.js?v='));

  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  /* Still PRECACHED: deferred loading must work offline, it then reads the cache
     instead of the network. */
  check("but it stays precached for offline", sw.includes("chart.umd.js"));

  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  check("charts.js knows how to load it itself", charts.includes("function loadChart"));
  /* A single entry point: all Chart.js functions go through create(), so the
     queue covers them all without exception. */
  check("loading goes through create(), the single entry point",
    /function create[\s\S]{0,300}loadChart\(\)/.test(charts));
  /* The queue keeps the LAST call per canvas: during the download a render may be
     requested again, replaying the first would show a stale chart. */
  check("the queue keeps the last call per canvas", charts.includes("pending.set(idCanvas"));
  check("a loading failure does not break the dashboard",
    /onerror[\s\S]{0,120}resolve\(false\)/.test(charts));
  /* applyDefaults touches Chart.defaults: silent without the library, and
     replayed as soon as it arrives. */
  check("applyDefaults stays quiet without the library",
    /function applyDefaults[\s\S]{0,200}typeof Chart === "undefined"/.test(charts));

  // The home-made SVG must certainly not go through the queue.
  const svg = charts.slice(charts.indexOf("function heatmap"), charts.indexOf("function attachTooltips"));
  check("the heatmap and the ruler stay independent from Chart.js",
    !svg.includes("create("), "home-made SVG goes through create()");
}

/* SPLITTING THE I18N BY LANGUAGE. French loaded 29 KB gzipped of English it
   never consults: tr(), diag(), tag() and friends return their input as is in
   French, and templates fall back on their French half. The risk of the split
   is a forgotten key: it throws no error, it shows French in English mode.
   */
{
  const fr = I18N_FR_SRC, en = I18N_EN_SRC;

  // Every template key must exist on BOTH sides.
  const frKeys = [...fr.matchAll(/^ {4}([a-z_0-9]+): \{ fr:/gm)].map(m => m[1]);
  const enKeys = [...en.matchAll(/^ {4}([a-z_0-9]+): "/gm)].map(m => m[1]);
  check("there are indeed a few hundred templates", frKeys.length > 250, String(frKeys.length));
  const withoutEnglish = frKeys.filter(k => !enKeys.includes(k));
  check("no template loses its English half", withoutEnglish.length === 0,
    withoutEnglish.slice(0, 6).join(", "));
  const orphans = enKeys.filter(k => !frKeys.includes(k));
  check("no English translation points into the void", orphans.length === 0,
    orphans.slice(0, 6).join(", "));

  /* The FR key to EN value dictionaries are EMPTY on the French side: that is the
     whole gain. If they filled up again, the split would be pointless. */
  ["UI", "DIAG", "TAGS", "GROUPS"].forEach(itemName => {
    check("the " + itemName + " dictionary is empty in French",
      new RegExp("const " + itemName + " = \\{\\};").test(fr));
    check("and filled in the English bundle", new RegExp("^  " + itemName + ": \\{", "m").test(en));
  });

  /* The saved language must NOT be applied when the file loads: without the
     bundle, the page would declare itself English and render French as a
     fallback, with nothing ever correcting it. */
  check("the wanted language is remembered, not applied", fr.includes("wantedLanguage"));
  check("it is prepare() that decides, once the bundle is there", fr.includes("function prepare"));
  const app = SOURCE_UI;
  check("and startup waits for it before the first render",
    /async function startApp[\s\S]{0,300}await I18N\.prepare/.test(app));

  // The bundle must stay precached, otherwise switching breaks offline.
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  check("the English bundle is precached", sw.includes("i18n.en.js"));
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("but it is not a script tag", !html.includes("i18n.en.js"));
}

/* RESPONSIVENESS: do not redo what has not changed.

   Two measured wastes. The history filters regenerated the whole table on EVERY
   character, and the grinder converter redrew 151 SVG lines on every keystroke
   and every slider click. And above all, every extraction save rebuilt five
   dropdowns and the ten recipe cards, while saving a cup changes neither the
   coffees nor the recipes.
   */
{
  const app = SOURCE_UI;

  check("a debounce exists", app.includes("function debounce"));
  // Since each screen wires its own controls (v7.86), the call is local to the
  // screen's file: no more UI prefix.
  check("the history filters go through it",
    /addEventListener\("input", (UI\.)?renderHistoryDeferred\)/.test(app));
  check("so does the grinder converter",
    /addEventListener\("input", (UI\.)?renderConverterDeferred\)/.test(app));
  /* The grinder slider, FOR ITS PART, became immediate again in v7.61. Its
     debounce covered a full SVG redraw on every click; since the ruler skeleton
     is no longer rebuilt, only the wait remained. The check is inverted on
     purpose: it prevents putting it back by reflex. */
  check("the grinder slider responds immediately",
    /conv-slider[\s\S]{0,600}(UI\.)?renderConverter\(\)/.test(app) &&
    !/conv-slider[\s\S]{0,600}renderConverterDeferred/.test(app));

  /* The other renderHistory calls stay IMMEDIATE: deletion, sorting, edit
     return follow a single gesture, there is nothing to batch. */
  check("the immediate render stays available", app.includes("function renderHistory("));

  // The signature guard.
  check("a table signature exists", app.includes("function signatureTable"));
  check("it covers edits AND deletions",
    /function signatureTable[\s\S]{0,260}updated_at[\s\S]{0,120}length/.test(app));
  check("the recipe render is guarded", /ifChanged\("recipes"/.test(app));
  check("so is the coffees one", /ifChanged\("coffees"/.test(app));
  check("so is the cups one", /ifChanged\("cups"/.test(app));

  /* THE trap: switching language changes no data, so no signature, but all the
     text must be redone. Without invalidation, switching to English would leave
     the recipes and the lists in French. */
  check("switching language invalidates the memos",
    /function refreshLanguage[\s\S]{0,200}forgetSignatures\(\)/.test(app));

  // The badges and the sync state stay unconditional: they are tiny and reflect
  // the present moment.
  check("badges are always redone", /DATA\.subscribe[\s\S]{0,400}updateBadges\(\);/.test(app));
}

/* MODERNITY AND COMFORT. Nothing here must depend on a recent feature to work:
   every addition has a fallback, and the fallback is the previous behaviour, not
   a degraded version. */
{
  const css = readCss();
  const app = SOURCE_UI;
  const html = readFileSync(join(ROOT, "index.html"), "utf8");

  /* REDUCED MOTION. Five animations and twenty-one transitions, nothing turned
     them off. For people with vestibular disorders, an interface that moves
     causes nausea. */
  check("reduced motion is respected", css.includes("prefers-reduced-motion"));
  /* 0.01ms and not 0: some animations have an end handler that a zero duration
     can prevent from firing. */
  check("durations drop to 0.01ms, not to zero", css.includes("0.01ms"));
  check("view transitions respect it too",
    /prefers-reduced-motion[\s\S]{0,400}view-transition/.test(css));
  check("and the code does not start the machinery for nothing",
    /function withTransition[\s\S]{0,300}prefers-reduced-motion/.test(app));

  /* The view transitions fallback must be the DIRECT call, not a dead case. */
  check("without the API, the screen change still happens",
    /startViewTransition\) \{ fn\(\); return; \}/.test(app));

  check("offscreen rendering is deferred", css.includes("content-visibility: auto"));
  /* Without an estimated height, the scrollbar jumps while scrolling down. */
  check("with an estimated height so the scrolling does not jump",
    css.includes("contain-intrinsic-size"));
  check("headings avoid the orphan line", css.includes("text-wrap: balance"));

  // Text search in the history.
  check("a search field exists", html.includes('id="h-search"'));
  /* In French, a search without accent normalisation is unusable: typing brule
     must find the accented brule. */
  check("it ignores accents", app.includes("function withoutAccents") && app.includes("NFD"));
  check("it searches what Chris wrote",
    /function searchableText[\s\S]{0,260}comment[\s\S]{0,120}descriptors/.test(app));
  check("it resets with the other filters",
    /h-reset[\s\S]{0,200}FILTERS\.forEach/.test(app) &&
    /const FILTERS = \[[^\]]*"h-search"/.test(app));

  // Network recovery and Escape.
  check("the sync restarts when the network comes back", /addEventListener\("online"/.test(app));
  check("Escape closes what is open", /ev\.key !== "Escape"/.test(app));

  /* The loading veil must be in the HTML: created in JS, it would only appear
     after the scripts run, so too late to be of any use. */
  check("the loading veil is in the HTML", html.includes('id="loading"'));
  check("and it is removed once the first screen is rendered", app.includes('$("#loading")'));
}

/* WORK ON KEYSTROKE AND ON RENDER.

   updateLive runs on EVERY character typed in the dose, the water, the grind or the
   volume: it did 18 DOM lookups and 4 innerHTML writes each time, while most
   keystrokes change none of the four areas. */
{
  const app = SOURCE_UI;
  const l = app.split("\n");
  const i = l.findIndex(x => x.includes("function updateLive() {"));
  let f = i;
  for (let n = i + 1; n < l.length; n++) if (l[n] === "  }") { f = n; break; }
  const body = l.slice(i, f).join("\n");

  check("updateLive no longer does uncached DOM lookups",
    (body.match(/[$]\("/g) || []).length === 0,
    String((body.match(/[$]\("/g) || []).length));
  check("and no more direct innerHTML writes",
    !body.includes("innerHTML ="), "a direct assignment remains");
  check("writes go through a guard that compares before writing",
    /function setHtml\(el, html\)[\s\S]{0,120}innerHTML !== html/.test(app));

  /* The cache is ONLY valid for the static nodes of index.html: a node coming from
     an innerHTML would be cached detached and the writes would go into the
     void. The comment must say so, it is the only possible safeguard. */
  check("the cache warns against its misuse",
    /function [$]f[\s\S]{0,80}/.test(app) && app.includes("jamais remplac"));

  /* The pills: 69 descriptors plus 16 diagnostics reattached at every language
     toggle and at every form reset. */
  check("pill clicks are delegated to the container",
    app.includes("function wirePills"));
  check("and buildPills no longer reattaches anything",
    !/buildPills[\s\S]{0,900}f-descriptors \.tag"\)\.forEach\(b => b\.addEventListener/.test(app));
  /* Set ONCE at wiring time: the containers survive rebuilds, setting it from the
     render would stack one set of listeners per toggle. */
  check("the delegation is set at wiring time",
    /function wireEntry[\s\S]*wirePills\(\)/.test(app));

  // enterkeyhint: the confirm key of the mobile keyboard.
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const hints = (html.match(/enterkeyhint=/g) || []).length;
  check("fields announce their confirm key", hints >= 30, String(hints));
  /* No "send": the form does not submit on the enter key, announcing it would be
     lying to the keyboard. */
  check("none promises a send that does not exist", !html.includes('enterkeyhint="send"'));
}

/* ONE COLOUR, ONE SERIES.

   The main chart stacked four series and had only three colours: the coffee
   grams line and the score trend curve both carried #1baf7a, the green reserved
   for "deux machines". So they were indistinguishable from each other, and
   green for no reason at all, on an entirely warm palette.

   The green keeps its role elsewhere: the machine comparison, and "Equilibre"
   in the diagnostics ring. What we lock here is that it does not go back to
   colouring a series for which it means nothing. */
{
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  const block30d = charts.slice(charts.indexOf("function barsAndLine30d"),
    charts.indexOf("function horizontalBars"));

  check("the main chart no longer borrows the machines green",
    !block30d.includes("C_BOTH"), "C_BOTH is still there");

  // Each series takes its colour from a different token.
  const tints = [...block30d.matchAll(/borderColor: cssVar\("(--[\w-]+)"\)/g)].map(m => m[1]);
  check("each curve has its own colour",
    tints.length === 2 && new Set(tints).size === 2, tints.join(", "));
  /* Blocks take the colour of their coffee (v8.61): five tokens, read by the chart
     AND by the legend, so that both say the same thing. */
  const cssCoffees = readCss();
  check("the five coffee tints are tokens",
    [1, 2, 3, 4, 5].every(n => cssCoffees.includes("--coffee-" + n + ":")) && block30d.includes('cssVar("--coffee-" + n)'));
  check("and the dashboard passes the coffees to the chart, with their legend",
    SOURCE_UI.includes("UI.renderCoffees30d(exts)") && readFileSync(join(ROOT, "index.html"), "utf8").includes('id="legend-30d"'));
  /* The grams curve is gone: a fourth series on a chart that already carried
     three, on a hidden axis to boot, it cluttered the view without being
     readable. The figure now lives in the tooltip. */
  check("the grams curve no longer overloads the chart",
    !block30d.includes("chart_coffee_grams") && !block30d.includes("y3:"));
  check("but the figure stays available in the tooltip",
    SOURCE_UI.includes("tip_coffee_grams"));

  /* The trend SMOOTHS the score line: same measure, same axis. It must carry the
     accent tint, otherwise it reads as one more data series. That is what its
     comment already said, and what its colour contradicted. */
  const css = readCss();
  check("and the converter ruler keeps its default colour",
    css.includes("--trend"));
  const trends = [...css.matchAll(/--trend: ([^;]+);/g)].map(m => m[1].trim());
  // One per palette: light, Graphite and Nuit (v8.34).
  check("the trend exists in all three palettes", trends.length === 3, trends.join(" | "));
  check("and it is translucent, to read as a background",
    trends.every(t => {
      const m = t.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
      return !!m && Number(m[1]) < 0.6;
    }),
    trends.join(" | "));
  /* --grammes died with the grams curve in v7.68. A dead variable in a palette
     is a trap for the next reading. */
  check("the grams tint left with the curve",
    !css.includes("--grammes"), "it still lingers in the palette");

  /* No red: on this site red is --danger, it announces bad news. A rising score
     trend is good news. */
  check("no series of the main chart borrows the danger colour",
    !block30d.includes("--danger"));
}

/* DOCUMENT INTEGRITY.

   The history search field ended up written TWICE, with the same id, placed in
   the "Cafe" group under the label of the coffee list. Nothing flags it: the
   browser shows both fields without flinching, querySelector takes the first,
   no test raises anything, and the site simply looks odd. Chris saw it, not
   the tests.

   These checks are cheap and catch the whole family. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const doubles = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  check("no duplicate id in the page", doubles.length === 0, doubles.join(", "));

  // Two identical adjacent markup lines: the signature of a duplicate.
  const rows = html.split("\n");
  const adjacent = rows
    .map((x, i) => (x.trim().length > 20 && x === rows[i - 1] ? i + 1 : 0))
    .filter(Boolean);
  check("no markup line duplicated identically",
    adjacent.length === 0, "lines " + adjacent.join(", "));

  const knownIds = new Set(ids);
  const lost = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)]
    .map(m => m[1]).filter(f => !knownIds.has(f));
  check("every label points to a field that exists", lost.length === 0, lost.join(", "));

  /* A .field must not contain several LABELLABLE controls under a single label.
     Legitimate pairs (minutes and seconds, value and preset) are listed: they
     form a single control in the user's eyes, and so rightly share a label.
     */
  const PAIRS = ["f-heat-min", "f-heat-sec", "f-total-sec", "f-flow-sec",
    "param-boil-sec", "param-bubbles-sec"];
  /* A slider named "X-curseur" drives the field "X": it is the SAME value shown
     twice, so a legitimate pair by construction. The rule is better than a list
     to extend with every added slider, since it is the naming that guarantees
     the belonging. */
  const isSliderOfItsField = (id, neighbors) =>
    id.endsWith("-slider") && neighbors.includes(id.slice(0, -"-slider".length));
  const mixed = [];
  for (const m of html.matchAll(/<div class="field[^"]*">([\s\S]*?)<\/div>/g)) {
    const allIds = [...m[1].matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(x => x[1]);
    const controls = allIds
      .filter(id => !PAIRS.includes(id) && !isSliderOfItsField(id, allIds));
    if (controls.length > 1) mixed.push(controls.join(" + "));
  }
  check("no field group mixes two unrelated controls",
    mixed.length === 0, mixed.join(" ; "));
}

/* ENGLISH COVERAGE OF TEXT ATTRIBUTES.

   The translation walk only sees TEXT nodes. Field placeholders, tooltips and
   screen reader labels are attributes: fourteen stayed in French in English
   mode, including the one the screen reader announces very first. They now go
   through the dictionary, but nothing prevents adding a French title tomorrow
   without its translation, and nobody would notice before switching the
   language.

   This check fails as long as a French attribute has no entry. It is
   deliberately strict: the English is either complete, or lying. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const en = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  const enBundleObj = new Function("return " + en.slice(en.indexOf("{"), en.lastIndexOf("}") + 1))();

  /* getAttribute returns the DECODED text, so the dictionary must carry the
     decoded version. The steps field placeholder writes its line ends as &#10;. */
  const decode = s => s
    .replace(/&#10;/g, "\n").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

  const absent = [...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)]
    .map(m => decode(m[1]))
    // A purely numeric placeholder ("0", "1.5.0", "00") has nothing to translate.
    .filter(v => /[a-zA-ZÀ-ÿ]{4}/.test(v))
    .filter(v => !enBundleObj.UI[v]);

  check("every tooltip and placeholder has its translation",
    absent.length === 0, [...new Set(absent)].join(" | "));

  /* The engine must really cover the three attributes. A coverage test that checks
     the dictionary without checking who reads it proves nothing. */
  const i18n = I18N_FR_SRC;
  check("the engine translates the three text attributes",
    /\["placeholder", "title", "aria-label"\]/.test(i18n));
  check("and it ignores the areas the JS regenerates",
    /\[" \+ attr \+ "\][\s\S]{0,220}closest\(ZONES_JS\)/.test(i18n));
}

/* EVERY TEXT FIELD IS STYLED.

   The history search bar had no style: the long selector list that styles the
   fields lists input[type="text"], number, date, datetime-local... and nobody had
   added "search" when creating the field. The browser therefore rendered its
   default control, no background, no border and no radius, amid styled fields.
   Nothing flags it: the CSS is valid, the page loads, it is just ugly.

   Types that are NOT text have their own styling elsewhere and have no business
   in this list. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const css = readCss();
  const STYLED_ELSEWHERE = ["button", "submit", "checkbox", "radio", "range", "file", "hidden"];

  const used = [...new Set([...html.matchAll(/<input\b[^>]*\btype="([a-z-]+)"/g)].map(m => m[1]))]
    .filter(t => !STYLED_ELSEWHERE.includes(t));

  /* We look at THE list that styles the fields, the one ending with
     "select, textarea {", and not the whole file: a type may appear elsewhere in
     a detail rule, which would be enough to pass the test while the field is
     bare. It happened while writing this very test. */
  const listEnd = css.indexOf("select, textarea {");
  /* The list spans several lines: we go back to the end of the previous rule or
     comment, otherwise we only catch its last line and all the types on the lines
     above pass for missing. */
  const listStart = Math.max(css.lastIndexOf("}", listEnd), css.lastIndexOf("*/", listEnd));
  const list = css.slice(listStart, listEnd);
  const unstyled = used.filter(t => !list.includes('input[type="' + t + '"]'));
  check("every text field type on the page is styled by the CSS",
    unstyled.length === 0, unstyled.join(", "));

  /* The history actions block does not behave like a filter. It was a cell of
     the filter grid, 150 px wide: the two buttons wrapped and "Exporter le
     filtre en CSV" broke inside it, hence a tall and narrow block. Since the
     filters are in flex (chips), it pushes itself to the right with
     margin-left: auto. */
  check("the history actions are no longer a filter column",
    /\.history-filters-actions \{[^}]*margin-left: auto/.test(css));
  check("and their labels no longer wrap",
    /\.history-filters-actions \.btn \{[^}]*white-space: nowrap/.test(css));
}

/* THE HOME-MADE TOOLTIP, DEFINED ONLY ONCE.

   It was written TWICE in the stylesheet, selectors aside: one for pills and
   tags, one for the ratio of the live line. Adding the comment of the latest
   extractions would have made a third copy, so three places to fix the day the
   tooltip changes. The rule now targets the data-info ATTRIBUTE, and every
   element carrying it gets it. */
{
  const css = readCss();
  const copies = (css.match(/content: attr\(data-info\)/g) || []).length;
  check("the tooltip is defined only once", copies === 1, copies + " copies");
  check("and it targets the attribute, not classes",
    /\[data-info\]:hover::after/.test(css));
  // An empty data-info must not open an empty tooltip.
  check("an empty data-info opens nothing", /\[data-info=""\]:hover::after/.test(css));
  /* The comment is WRITTEN under its row, in the latest extractions as in the
     history: a tooltip repeating it on hover says nothing more. Chris found it
     absurd (v8.33). */
  const table = readFileSync(join(ROOT, "js/ui-dashboard.js"), "utf8");
  const historySrc = readFileSync(join(ROOT, "js/ui-history.js"), "utf8");
  check("no tooltip repeats the already written comment",
    !/data-info="' \+ titleAttr\(e\.comment\)/.test(table + historySrc));
}

/* LONG PRESS NO LONGER ACTS ON TOP OF EXPLAINING.

   On phone, long press is the ONLY way to open a descriptor's definition
   tooltip. It opened the tooltip then let the click through, which selected
   the descriptor: reading a definition ticked it. The code comment already
   claimed that must not happen, without anything preventing it.
   */
{
  const coreSrc2 = readFileSync(join(ROOT, "js/ui-core.js"), "utf8");
  const f = coreSrc2.slice(coreSrc2.indexOf("function enableLongPress"),
    coreSrc2.indexOf("function", coreSrc2.indexOf("function enableLongPress") + 10));
  check("long press swallows the click that follows it",
    /addEventListener\("click"[\s\S]{0,320}stopPropagation\(\)/.test(f));
  /* In CAPTURE: capture precedes the target and the bubbling, that is what
     allows stopping the delegated handler set on the same container. */
  check("in capture phase, otherwise the delegated handler goes first",
    /addEventListener\("click",[\s\S]{0,400}\}, true\)/.test(f));
}

/* MACHINE COLOURS.

   They describe a MACHINE and nothing else. The trio comes from the Okabe-Ito
   palette, the reference for colour-blind safe colours: blue, vermilion,
   reddish purple. "Les deux machines" carried an emerald green #1baf7a, safe
   too but garish on an entirely warm palette, to the point that Chris asked to
   stop seeing it.

   This check above all prevents the quiet return of the emerald through a colour
   hardcoded somewhere. */
{
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  const grind = readFileSync(join(ROOT, "js/grind.js"), "utf8");
  const css = readCss();
  const html = readFileSync(join(ROOT, "index.html"), "utf8");

  /* We look for the colour WRITTEN, not quoted: the two comments explaining why
     it left are allowed to name it. */
  const hardcoded = [["js/charts.js", charts], ["js/grind.js", grind],
    ["css", css], ["index.html", html]]
    .flatMap(([itemName, src]) => src.split("\n")
      .filter(l => /#1baf7a/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/piquait|criard/.test(l))
      .map(l => itemName + ": " + l.trim().slice(0, 60)));
  check("the emerald is no longer used anywhere", hardcoded.length === 0, hardcoded.join(" | "));
  /* THE RULE, and not just #1baf7a: the Comptoir redesign forbids ANY green
     tint, including to say "good". A test written on one colour lets the next
     one through; this one rejects the green band of the hue wheel, whatever the
     code chosen.

     We REMOVE the comments before searching, rather than exempting lines
     containing certain words: the first version of this test exempted any line
     where "vert" appeared, so an .essai-vert rule passed silently. A comment is
     allowed to name a colour, the code is not. */
  const stripComments = source => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const isGreen = n => {
    const [r, g, b] = [0, 2, 4].map(k => parseInt(n.slice(k, k + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const L = (mx + mn) / 2;
    if (!d) return false;
    const S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    /* Clear-cut green band. Grey drops out through saturation, the very light
       or dark extremes through lightness: there, the hue no longer shows. */
    return h >= 75 && h <= 165 && S > 0.15 && L > 0.15 && L < 0.85;
  };
  const green = [["js/charts.js", charts], ["css", css], ["index.html", html]]
    .flatMap(([itemName, source]) => stripComments(source).split("\n")
      .flatMap((l, i) => [...l.matchAll(/#([0-9a-f]{6})\b/gi)]
        .filter(m => isGreen(m[1]))
        .map(m => itemName + " line " + (i + 1) + ": #" + m[1])));
  check("no green tint anywhere, the Comptoir art direction forbids it",
    green.length === 0, green.slice(0, 5).join(" | "));

  /* FONTS ARE EMBEDDED, AND COMPLETE.

     Three possible oversights, each silent: declaring an @font-face to a missing
     file (the browser falls back on Georgia without a word), adding a file
     without precaching it (the first offline opening flashes), or reintroducing
     a CDN (the site breaks under file:// and offline). */
  {
    const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
    const declared = [...css.matchAll(/url\("fonts\/([^"]+)"\)/g)].map(m => m[1]);
    check("the stylesheet declares embedded fonts", declared.length > 0, String(declared.length));

    const missing = declared.filter(f => !existsSync(join(ROOT, "css/fonts", f)));
    check("every declared font exists on disk",
      missing.length === 0, missing.join(" | "));

    const notPrecached = declared.filter(f => !sw.includes("css/fonts/" + f));
    check("every declared font is precached by sw.js",
      notPrecached.length === 0, notPrecached.join(" | "));

    const onDisk = readdirSync(join(ROOT, "css/fonts")).filter(f => /\.woff2?$/.test(f));
    const orphanRows = onDisk.filter(f => !declared.includes(f));
    check("no font lingers without being declared",
      orphanRows.length === 0, orphanRows.join(" | "));

    const cdn = [["css", css], ["index.html", html]]
      .filter(([, source]) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(source))
      .map(([itemName]) => itemName);
    check("no font is loaded from a CDN", cdn.length === 0, cdn.join(" | "));

    /* Vietnamese is the reason for the third Manrope file: Chris's coffees are
       called Trung Nguyen Sang Tao and La Viet. */
    check("Manrope embeds Vietnamese, the coffees need it",
      declared.some(f => /vietnamese/.test(f)), declared.join(", "));
  }

  const trio = [...charts.matchAll(/const C_(?:BRIKKA|SWITCH|BOTH) = "(#[0-9a-f]{6})"/gi)].map(m => m[1]);
  check("the three machines keep three distinct colours",
    trio.length === 3 && new Set(trio).size === 3, trio.join(", "));
  check("and the grinder marker follows the colour of both machines",
    grind.includes(trio[2] || "?"), trio[2]);
}

/* GRIND ADVICE GOES IN THE RIGHT DIRECTION.

   The "Brikka classique (eau prechauffee)" recipe said: "si l'ecoulement dure
   moins de 10 secondes, la mouture est trop fine : passer a 1.4.0". But 1.4.0
   is 582 um and 1.5.0 is 624: the remedy sent towards FINER while the diagnosis
   already said too fine. Nothing could flag it, a dial stays a dial, and
   following the advice made exactly the observed problem worse.

   This check is GENERAL: wherever a text diagnoses a grind that is too fine and
   prescribes a dial, that dial must be COARSER than the reference, and vice
   versa. */
{
  const recipes = new Function(readFileSync(join(ROOT, "js/recipes.js"), "utf8") +
    "\nreturn STARTER_RECIPES;")();
  // rotation.number.click, 5 clicks per number, 10 numbers per rotation.
  const clicks = dial => {
    const p = String(dial).split(".").map(Number);
    return p.length === 3 && p.every(n => !isNaN(n)) ? p[0] * 50 + p[1] * 5 + p[2] : null;
  };

  const mistakes = [];
  for (const r of recipes) {
    for (const field of ["note", "bestFor", "ratioText", "totalText"]) {
      const txt = String(r[field] || "");
      // "trop fine ... passer a X.Y.Z" and its mirror case.
      for (const m of txt.matchAll(/trop (fine|grossi[eè]re)[^.]{0,120}?(\d+\.\d+\.\d+)/g)) {
        const aimed = clicks(m[2]), ref = clicks(r.dial);
        if (aimed === null || ref === null) continue;
        const coarser = aimed > ref;
        if (m[1] === "fine" && !coarser) mistakes.push(r.name + ": too fine but points to " + m[2]);
        if (m[1] !== "fine" && coarser) mistakes.push(r.name + ": too coarse but points to " + m[2]);
      }
    }
  }
  check("grind advice never points in the direction of the fault",
    mistakes.length === 0, mistakes.join(" | "));

  /* The Brikka is filled with COLD WATER, Bialetti's instruction for this model:
     its weighted valve is calibrated on that pressure build-up. Preheated water
     is the Moka Express method, and the so-called "classique" recipe prescribed
     80 to 90 degrees. */
  const classic = recipes.find(r => r.family === "brikka-classique" && r.variant === "Standard");
  const steps = (classic.steps || []).map(e => e.text).join(" ");
  check("the Brikka classique starts with cold water",
    /eau FROIDE/.test(steps), steps.slice(0, 90));
  check("and it says why, otherwise the advice gets lost at the first doubt",
    /Bialetti/.test(steps) && /Moka Express/.test(steps));

  /* The preheated water variant applies the other method ON PURPOSE: without
     saying so, the comparison between the two would be skewed by a misunderstanding. */
  const variant = recipes.find(r => r.variant === "Eau préchauffée");
  check("the variant announces that it applies the other method",
    /Moka Express/.test(String(variant.bestFor || "")));

  /* Step v5 aligned the ten recipes on 1.5.0: a text can no longer promise
     "plus fin" without saying it is a gesture to make by hand. */
  const promises = recipes.filter(r => {
    const t = String(r.bestFor || "");
    /* Promising "plus fin" is legitimate IF the text says it is a gesture to make
       by hand: what is not, is promising it as if the card carried it, while it
       shows 1.5.0 like the nine others. */
    return /plus fin/.test(t) && !/à la main/.test(t) && r.dial === "1.5.0";
  });
  check("no recipe promises a grind it does not carry",
    promises.length === 0, promises.map(r => r.name).join(", "));
}

/* THE GUIDE SAYS WHAT THE RECIPES DO.

   It explained WHAT roasting is without a line on what to change to extract, and
   nowhere mentioned the water difference between the Brikka and the Moka
   Express, which is yet the most consequential one in use. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("the guide covers the roast level for extraction",
    html.includes("Clair, medium, foncé, quoi changer"));
  /* v8.74: Bialetti prescribes cold water for ALL its coffee makers, preheated
     water is a barista trick. The old text said the opposite for the Moka
     Express, and that the valve released too early with hot water. */
  check("and cold or hot water on the Brikka", html.includes("Eau froide ou eau chaude à la Brikka"));
  check("the guide and the recipes say the same thing about water",
    /Bialetti indique l'EAU FROIDE pour toutes ses cafetières/.test(html) &&
    /Bialetti indique l'eau FROIDE pour toutes ses cafetières/.test(readFileSync(join(ROOT, "js/recipes.js"), "utf8")));
  check("and no more valve that would release too early with hot water", !html.includes("fait lâcher la soupape trop tôt"));
}

/* EVERY DECLARED COLUMN MUST BE SERIALISED.

   csvSerialize reads row[column]: a column present in RECIPE_COLS but missing
   from recipeToRow therefore comes out EMPTY, without error or warning.
   That was the case of heat_level since it existed: exporting the recipes
   then rereading them erased the heat target of the ten recipes.

   The check targets the RULE, not this case: we serialise a real recipe and
   verify that no column comes out empty while the recipe carries the value.
   */
{
  /* We start from the SEED recipes, normalised: the current state carries
     fixtures left by previous checks, including raw objects that normalisation
     has never seen. The subject here is the serialiser, not the state. */
  const recipes = STARTER_RECIPES.map(DATA.normalizeRecipe);
  check("recipes exist for the check", recipes.length > 0, String(recipes.length));

  /* We export, reread, and compare field by field. A round trip is the only
     honest test: it goes through exactly the path that lost the data. */
  const stateBefore = DATA.state.recipes;
  DATA.state.recipes = recipes;
  const text = DATA.csvRecipes ? DATA.csvRecipes() : null;
  DATA.state.recipes = stateBefore;
  if (text) {
    const reread = DATA.csvParse(text).map(DATA.normalizeRecipe);
    const losses = [];
    recipes.forEach(before => {
      const after = reread.find(x => x.id === before.id);
      if (!after) { losses.push(before.id + " gone"); return; }
      ["name", "dose", "water", "dial", "heat_level", "typicalVolume", "milk", "active"]
        .forEach(field => {
          if (String(before[field] === undefined ? "" : before[field]) !==
              String(after[field] === undefined ? "" : after[field])) {
            losses.push(before.id + "." + field + ": " + before[field] + " becomes " + after[field]);
          }
        });
    });
    check("a CSV round trip loses no recipe field",
      losses.length === 0, losses.slice(0, 4).join(" | "));
  } else {
    check("csvRecipes is exposed so it can be tested", false, "missing from the API");
  }
}

/* THE TWO DARK THEMES, Graphite and Nuit (v8.34), and no more Espresso.

   The tokens are reread IN the stylesheet, and each text colour is measured
   against each surface it can sit on: 4.5:1 at least. Nuit only redefines
   what changes, the rest comes from Graphite, exactly as in the browser.
   */
{
  const css = readCss();
  const block = sel => {
    const i = css.indexOf(sel + " {");
    if (i < 0) return {};
    const body = css.slice(i, css.indexOf("\n}", i));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1], m[2]]));
  };
  const graphite = block('html[data-theme="dark"]');
  const night = { ...graphite, ...block('html[data-theme="dark"][data-palette="night"]') };
  const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  check("the Espresso theme has gone", !css.includes("#1a120d") && !css.includes("#261c15"));
  check("Nuit is a palette in its own right", night["--bg"] && night["--bg"] !== graphite["--bg"]);
  for (const [itemName, p] of [["Graphite", graphite], ["Nuit", night]]) {
    const surfaces = ["--bg", "--rail", "--panel", "--panel-2", "--panel-3"];
    const weak = [];
    for (const t of ["--ink", "--text", "--muted", "--accent", "--danger"]) {
      for (const s of surfaces) {
        if (!p[t] || !p[s]) { weak.push(t + " or " + s + " missing"); continue; }
        const r = ratio(p[t], p[s]);
        if (r < 4.5) weak.push(t + " on " + s + " " + r.toFixed(2));
      }
    }
    // The timer card: its muted colour on its own sub-surfaces.
    for (const s of ["--card-dark-bg", "--cs-panel", "--cs-panel-2"]) {
      const r = ratio(p["--cs-muted"], p[s]);
      if (r < 4.5) weak.push("--cs-muted on " + s + " " + r.toFixed(2));
    }
    if (ratio(p["--on-accent"], p["--accent"]) < 4.5) weak.push("--on-accent on --accent");
    check(itemName + ": all texts hold 4.5:1", weak.length === 0, weak.join(", "));
  }

  // The button cycles through all three, and the choice survives a reload.
  const head = readFileSync(join(ROOT, "index.html"), "utf8");
  check("the head restores the dark palette", head.includes('localStorage.getItem("palette")') &&
    head.includes('"data-palette"'));
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("the theme button offers Graphite then Nuit",
    app.includes('applyTheme("dark", "graphite")') && app.includes('applyTheme("dark", "night")'));
}

/* AUDIT BATCH 1 (v8.71): NEVER LOSE ANYTHING AGAIN. */
{
  const SCHEMA = DATA.CURRENT_SCHEMA;
  // Ids that no longer depend on the list length.
  const schemaSrc = readFileSync(join(ROOT, "js/data-schema.js"), "utf8");
  check("ids are no longer «longueur + 1»", !schemaSrc.includes("list.length + 1"));
  const before = DATA.state.extractions.length;
  const seenIds = new Set();
  for (let i = 0; i < 50; i++) {
    const e = await DATA.addExtraction({ date_time: "2026-09-27T08:00", method: "Switch", dose_g: 15 });
    seenIds.add(e.id);
  }
  check("fifty cups in a row, fifty different ids", seenIds.size === 50);
  check("and none looks like e + a rank number", [...seenIds].every(id => !/^e\d+$/.test(id)));
  for (const id of seenIds) await DATA.deleteExtraction(id);
  check("the test cups go away", DATA.state.extractions.length === before);

  // The app's merge is the server's.
  const g = { tables: { extractions: [{ id: "e1", updated_at: 10, n: 1 }, { id: "e2", updated_at: 20, n: 2, x: 1 }] }, tombstones: { extractions: { e3: 30 } } };
  const d = { tables: { extractions: [{ id: "e1", updated_at: 15, n: 9 }, { id: "e2", updated_at: 20, n: 2, y: 2 }, { id: "e3", updated_at: 25 }] }, tombstones: { extractions: {} } };
  const client = SYNC.mergeStates(g, d);
  const serverTables = mergePayloads(sanitisePayload(g), sanitisePayload(d), 40);
  const sortRows = l => JSON.stringify([...l].sort((a, b) => a.id.localeCompare(b.id)));
  check("the app's merge gives exactly the server's",
    sortRows(client.tables.extractions) === sortRows(serverTables.tables.extractions), sortRows(client.tables.extractions) + " / " + sortRows(serverTables.tables.extractions));
  check("and a cup added during the exchange survives the merge",
    SYNC.mergeStates({ tables: { extractions: [] }, tombstones: {} }, { tables: { extractions: [{ id: "neuve", updated_at: 5 }] }, tombstones: {} })
      .tables.extractions.some(l => l.id === "neuve"));

  // Importing purchases no longer touches the extractions.
  const extCount = DATA.state.extractions.length;
  const purchasesCsv = DATA.csvSerialize([{ id: "a-import", coffee_id: "c1", purchase_date: "2026-09-01", bag_size_g: 250 }], DATA.PURCHASE_COLS);
  const preview = DATA.analyzeImport(purchasesCsv);
  check("a purchases file is recognised as such", preview.table === "purchases" && preview.added === 1, JSON.stringify(preview));
  await DATA.importCsvText(purchasesCsv);
  check("and its import leaves the extractions intact", DATA.state.extractions.length === extCount, DATA.state.extractions.length + " / " + extCount);
  check("the bag did arrive in the purchases", DATA.state.purchases.some(a => a.id === "a-import"));
  // An import merges: rows missing from the file stay.
  const singleRow = DATA.csvSerialize([DATA.state.extractions[0]], DATA.EXT_COLS);
  await DATA.importCsvText(singleRow);
  check("importing a one row file does not delete the others", DATA.state.extractions.length === extCount);
  // An unknown table is rejected.
  let refused = false;
  try { DATA.analyzeImport("foo,bar\n1,2"); } catch (e) { refused = true; }
  check("a file with unknown columns is rejected", refused);

  // A missing field stays empty, never 0.
  const noScore = DATA.state.extractions.length ? null : null;
  const n = (await DATA.addExtraction({ date_time: "2026-09-27T09:00", method: "Switch" }));
  check("a missing score stays empty, not 0/10", n.score_10 === "" && n.dose_g === "" && n.temperature_c === "");
  await DATA.deleteExtraction(n.id);

  // The schema version travels with the data.
  check("the app sends its schema version to the server", SOURCE_DATA.includes("schema: CURRENT_SCHEMA"));
  check("the server rejects an older device", readFileSync(join(ROOT, "worker/sync.js"), "utf8").includes("outdated-version"));
  check("and the app then offers to reload", bilingual("sync_outdated") && bilingual("update_reload"));
  // The full export covers the six tables and a JSON file.
  check("export all covers the six tables and the full file",
    /const CSV_TEXT = \{\s*coffees:[^}]*extractions:[^}]*recipes:[^}]*cups:[^}]*purchases:[^}]*settings:/.test(SOURCE_DATA) &&
      SOURCE_DATA.includes("TABLE_NAMES.forEach(table => download(csvFileName(table), CSV_TEXT[table]()))") &&
      SOURCE_DATA.includes('"logbook-full.json"'));
}

/* AUDIT BATCH 2 (v8.72): THE BUGS YOU CAN SEE. */
{
  // The bag in the cupboard does not become the current bag.
  const saved = DATA.state.purchases;
  DATA.state.purchases = [
    { id: "a-ouvert", coffee_id: "cx", purchase_date: "2026-09-01", opened_date: "2026-09-02", bag_size_g: 250 },
    { id: "a-placard", coffee_id: "cx", purchase_date: "2026-09-20", opened_date: "", bag_size_g: 250 },
  ];
  check("a bag bought in advance, not opened yet, does not replace the one being drunk",
    DATA.currentBag("cx").id === "a-ouvert", DATA.currentBag("cx").id);
  DATA.state.purchases[1].opened_date = "2026-09-25";
  check("once opened, it becomes the current bag", DATA.currentBag("cx").id === "a-placard");
  const calc = DATA.calcs({ coffee_id: "cx", date_time: "2026-09-22T08:00", method: "Switch", dose_g: 15 });
  check("a cup from before its opening stays tied to the old bag", calc.days_open === 20, String(calc.days_open));
  DATA.state.purchases = [{ id: "a-seul", coffee_id: "cx", purchase_date: "2026-09-01", opened_date: "", bag_size_g: 250 }];
  check("with no opened bag at all, the last one bought stays the current bag", DATA.currentBag("cx").id === "a-seul");
  DATA.state.purchases = saved;

  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  check("the service worker serves versioned files cache first", sw.includes('url.searchParams.has("v")'));
  check("and does not wait for the network more than three seconds for the page", /NAVIGATION_TIMEOUT_MS = 3000/.test(sw) && sw.includes("Promise.race"));
  check("the offline shell goes through «./»", sw.includes('caches.match("./")') && sw.includes('"./",'));

  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const appSrc = readFileSync(join(ROOT, "js/app.js"), "utf8");
  const coreSrc = readFileSync(join(ROOT, "js/ui-core.js"), "utf8");
  check("every Fermer button closes its window, even without data-closes", appSrc.includes('b.closest("dialog")'));
  check("updates announce themselves instead of asking for two reloads",
    coreSrc.includes("controllerchange") && coreSrc.includes("reg.update()") && bilingual("update_ready"));
  check("the status bar follows the palette from load time", /querySelectorAll\('meta\[name="theme-color"\]'\)/.test(html.slice(0, 4000)));
  check("the first display no longer waits for the sync", !/if \(syncPossible\(\)\) await synchroniser/.test(SOURCE_DATA));
  check("linked files no longer ask for permission outside a gesture",
    SOURCE_DATA.includes('queryPermission({ mode: "readwrite" }) === "granted"') && SOURCE_DATA.includes("reauthorizeFolder"));
  const css = readCss();
  check("«Nouvelle tasse» no longer appears twice in the Plus menu", css.includes(".rail .rail-new"));
  check("the old header rules are gone", !/\.nav \{/.test(css) && !/\.nav-btn \{ padding: 8px/.test(css));
  const draftSrc = readFileSync(join(ROOT, "js/ui-draft.js"), "utf8");
  check("the draft keeps «ratée» and the agitation", draftSrc.includes('"f-failed"') && draftSrc.includes('"f-agitation-yes"'));
}

/* AUDIT BATCH 3 (v8.73): LOCK IT DOWN. */
{
  const trap = DATA.normalizeCoffee ? null : null;
  const SCHEMA_SRC = readFileSync(join(ROOT, "js/data-schema.js"), "utf8");
  // The normalisers are not all exposed: we go through a coffee import.
  const csvTrap = DATA.csvSerialize([{ id: "c-piege\"><x", name: "<img src=x onerror=alert(1)>", roaster: "A & B" }], DATA.COFFEE_COLS);
  await DATA.importCsvText(csvTrap);
  const c = DATA.state.coffees.find(x => x.name.includes("img"));
  check("a trap name keeps no angle bracket", c && !/[<>]/.test(c.name), c && c.name);
  check("and its id only keeps safe characters", c && /^[\w\-.@]+$/.test(c.id), c && c.id);
  check("the text stays readable", c && c.name === "‹img src=x onerror=alert(1)›");
  DATA.state.coffees = DATA.state.coffees.filter(x => x !== c);

  // A single escaping function for the whole site.
  const copies = ["js/charts.js", "js/ui-brew.js", "js/ui-drawings.js", "js/ui-coffee-sheet.js", "js/ui-guide.js", "js/ui-core.js"]
    .filter(f => /replace\(\/&\/g, "&amp;"\)/.test(readFileSync(join(ROOT, f), "utf8")));
  check("no more local copy of the escaping", copies.length === 0, copies.join(", "));
  check("the shared escaping handles the five characters",
    /replace\(\/'\/g, "&#39;"\)/.test(readFileSync(join(ROOT, "js/tools.js"), "utf8")));

  // No spreadsheet formula, and the round trip keeps the text.
  const csv = DATA.csvSerialize([{ id: "e-f", comment: "=HYPERLINK(\"x\")", dose_g: -1 }], ["id", "comment", "dose_g"]);
  check("a comment starting with = is neutralised in the CSV", csv.includes("'=HYPERLINK"));
  check("a negative number is not touched", csv.trim().endsWith(",-1"));
  check("and rereading gives back the original text", DATA.csvParse(csv)[0].comment === "=HYPERLINK(\"x\")");
}

/* AUDIT BATCHES 4 AND 5 (v8.74): A GUIDE THAT TELLS THE TRUTH, AND ACCURATELY. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const rec = readFileSync(join(ROOT, "js/recipes.js"), "utf8");
  // The matrix only points to recipes that exist, and covers every cell.
  const ids = new Set(STARTER_RECIPES.map(r => r.id));
  const cells = Object.values(COFFEE_RECIPE_MATRIX.cells);
  check("the matrix covers its fifteen cells",
    Object.keys(COFFEE_RECIPE_MATRIX.cells).length === COFFEE_RECIPE_MATRIX.rows.length * COFFEE_RECIPE_MATRIX.columns.length);
  const unknownTargets = cells.flatMap(c => [c.recipe, c.alternative]).filter(id => id && !ids.has(id));
  check("every matrix recipe exists", unknownTargets.length === 0, unknownTargets.join(", "));
  // A coffee's profile is read from its card.
  const p = (processName, roastLevel, species) => { const r = coffeeProfile({ process: processName, roast: roastLevel, species: species }); return r.row + "|" + r.column; };
  check("a washed medium falls in its cell", p("Lavé", "Medium", "Arabica") === "lave|medium");
  check("so does a light natural", p("Natural", "Light", "Arabica") === "natural|clair");
  check("an anaerobic is not taken for a natural", p("Anaerobic natural", "Light medium", "Arabica") === "anaerobic|medium");
  check("a dark rang bơ robusta goes to the robustas", p("Rang bơ", "Foncée", "Robusta") === "robusta|fonce");
  check("a coffee without a process counts in no cell", coffeeProfile({}).row === null);
  check("the matrix is drawn in the Guide", html.includes('id="matrix-recipes"') && SOURCE_UI.includes("function renderMatrix"));

  // The missing tastes, translated and described.
  const allIds = DESCRIPTOR_GROUPS.flatMap(g => g.tags);
  const newTags = ["salé", "métallique", "cassis", "prune", "orange", "sucre de canne", "cuir"];
  check("the missing tastes exist", newTags.every(t => allIds.includes(t)), newTags.filter(t => !allIds.includes(t)).join(", "));
  check("earthy and woody are no longer defects",
    !DESCRIPTOR_GROUPS.find(g => g.name === "Torréfaction et défauts").tags.some(t => ["terreux", "boisé", "tabac"].includes(t)));
  check("no duplicate taste", new Set(allIds).size === allIds.length);
  const enSrc = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  check("every new taste has its English translation", newTags.every(t => enSrc.includes(JSON.stringify(t) + ": ")));
  check("and so does the new family", enSrc.includes('"Terre et bois": "Earth and wood"'));

  // Consistency points raised by the audit.
  check("no more «la plus chaude des dix»", !html.includes("la plus chaude des dix"));
  check("no more «les dix recettes portent 1.5.0»", !rec.includes("les dix recettes portent 1.5.0"));
  check("no more recipes quoted by number in the rules", !html.includes("les recettes 4 et 5"));
  check("the Guide no longer says the scale is missing", !html.includes("Le vrai manque") && !html.includes("Maintenant : la balance"));
  check("Brassage mode shows grams by default",
    readFileSync(join(ROOT, "js/ui-brew.js"), "utf8").includes('=== "ml" ? "ml" : "g"'));
  check("corrections talk about two clicks, like the default steps", !rec.includes("un ou deux crans"));
  check("non rang bơ coffees have their own message", rec.includes('I18N.t("warn_brikka_profile")') && bilingual("warn_brikka_profile"));
  check("the preheated Brikka no longer announces a grind it does not have", !rec.includes("mouture plus grossière\","));
  check("sourness, not acidity, signals under-extraction", html.includes("<h3>Aigreur</h3>"));
  check("freshness accounts for the 30 degrees", html.includes("Par 30 °C et l'humidité"));
  check("the SCA water standard is the right one", html.includes("68 mg/L (17 à 85)"));
  check("the milk Brikka no longer shows a recipe number", STARTER_RECIPES.find(r => r.id === "brikka-flatwhite").number === "");
}

/* AUDIT BATCH 6 (v8.75): FASTER. */
{
  const coreSrc2 = readFileSync(join(ROOT, "js/ui-core.js"), "utf8");
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  check("per cup calculations are kept in memory", coreSrc2.includes("memoPerCup") && coreSrc2.includes("dataRevision"));
  check("a sync-only notification only redraws the badge", app.includes('if (kind === "sync")'));
  check("charts are updated instead of recreated", charts.includes('existing.update("none")'));
  check("drawings are no longer drawn twice", !readFileSync(join(ROOT, "js/ui-drawings.js"), "utf8").includes('DATA.subscribe(() => { if (nav.screenName === "dashboard") renderDrawings(); });'));
  check("the history renders in slices of one hundred", SOURCE_UI.includes("HISTORY_CHUNK = 100") && bilingual("history_more"));
  const worker = readFileSync(join(ROOT, "worker/index.js"), "utf8");
  check("the server strips comments from the stylesheet and the page", worker.includes("function minifyCss") && worker.includes("function minifyHtml"));
  // The revision changes with the data, not with the sync state alone.
  const r0 = DATA.dataRevision();
  DATA.notify("sync");
  check("a sync state does not change the revision", DATA.dataRevision() === r0);
  DATA.notify();
  check("a real change does", DATA.dataRevision() === r0 + 1);
}

/* AUDIT BATCH 7 (v8.76): FOR ALL FINGERS. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const css = readCss();
  const app = readFileSync(join(ROOT, "js/app.js"), "utf8");
  const dialogs = [...html.matchAll(/<dialog id="([^"]+)"([^>]*)>/g)];
  const unnamed = dialogs.filter(m => !/aria-label(ledby)?=/.test(m[2])).map(m => m[1]);
  check("every window carries an accessible name", unnamed.length === 0, unnamed.join(", "));
  const targets = dialogs.map(m => (m[2].match(/aria-labelledby="([^"]+)"/) || [])[1]).filter(Boolean);
  // The quoted title exists in the page, or is born with the content (the coffee card writes its own).
  const notFound = targets.filter(id => !html.includes('id="' + id + '"') && !SOURCE_UI.includes('id="' + id + '"'));
  check("and the title it quotes exists", notFound.length === 0, notFound.join(", "));
  check("the closed Plus menu is inert to the keyboard", app.includes("rail.inert = isSheetLayout()"));
  check("decorative icons are hidden from screen readers", !/class="choice-icon">/.test(html));
  check("the recipe table fields are named", readFileSync(join(ROOT, "js/ui-catalog.js"), "utf8").includes('aria-label="\' + fieldName(r, "param_col_dose")'));

  // Light theme contrasts, computed the way WCAG does.
  const block = css.slice(css.indexOf('html[data-theme="light"] {'), css.indexOf("}", css.indexOf('html[data-theme="light"] {')));
  const token = itemName => (block.match(new RegExp("--" + itemName + ":\\s*(#[0-9a-fA-F]{6})")) || [])[1];
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const p3 = token("panel-3");
  for (const n of ["muted", "accent", "danger"]) {
    check("in light theme, --" + n + " passes 4.5:1 on the hover surface", ratio(token(n), p3) >= 4.5, token(n) + " on " + p3 + ": " + ratio(token(n), p3).toFixed(2));
  }
  check("a field border passes 3:1 on the panel", ratio(token("lines-field"), token("panel")) >= 3, String(token("lines-field")));
  check("and the fields use it", css.includes("border: 1px solid var(--lines-field, var(--lines));"));
}

/* AUDIT BATCH 8 (v8.77): THE DEEP CLEAN. */
{
  const enSrc = readFileSync(join(ROOT, "js/i18n.en.js"), "utf8");
  const missing = [];
  STARTER_RECIPES.forEach(r => {
    ["subtitle", "tempText", "ratioText", "totalText", "bestFor", "note"].forEach(k => { if (r[k] && !enSrc.includes(JSON.stringify(r[k]) + ":")) missing.push(r.id + "." + k); });
    (r.steps || []).forEach((e, i) => { if (!enSrc.includes(JSON.stringify(e.text) + ":")) missing.push(r.id + ".etape" + i); });
  });
  check("every original recipe text has its English translation", missing.length === 0, missing.slice(0, 6).join(", "));
  check("steps are translated before being scaled", SOURCE_UI.includes("rescale(translate(recipe.steps))"));
  check("tr no longer mistakes a coffee name for an object property", readFileSync(join(ROOT, "js/i18n.js"), "utf8").includes("hasOwnProperty.call(UI, text)"));
  check("the dead code is gone", !SOURCE_UI.includes("function ecartMoyen") && !SOURCE_UI.includes("function mesuresDerniere"));
  check("deleting a bag and unlinking the folder have their button",
    SOURCE_UI.includes("data-delete-bag") && readFileSync(join(ROOT, "index.html"), "utf8").includes('id="db-unlink"'));
  check("the full export can be reimported: the picker accepts JSON", readFileSync(join(ROOT, "index.html"), "utf8").includes('accept=".csv,.json'));
}

/* v8.80: A SCORE IS WRITTEN THE FRENCH WAY EVERYWHERE, and the shelf says what is left. */
{
  check("no raw score displayed as is", !/score_10 !== "" \? e\.score_10 [:+]/.test(SOURCE_UI));
  check("an empty jar says «sachet vide», not «0 tasses»", SOURCE_UI.includes('b.cups === 0 ? I18N.t("drawing_bag_empty")'));
}

/* A1 (v8.82): THE LATEST EXTRACTIONS ARE READABLE, grouped by day. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const cols = (html.match(/<table class="table-latest">[\s\S]*?<\/colgroup>/) || [""])[0].match(/<col /g) || [];
  check("the latest table has five columns, the machine no longer has one", cols.length === 5 && !html.includes('class="c-machine"'));
  check("and each day has its subheading", SOURCE_UI.includes('<tr class="d-day"><th colspan="5"'));
  check("the comment spans the five columns", SOURCE_UI.includes('"last-comment" data-ext="\' + e.id + \'"><td colspan="5">'));
  check("in a narrow card each cup becomes a grid card", readCss().includes("@container dernieres (max-width: 760px)") && readCss().includes('grid-template-areas: "cafe cafe note" "quand mesures note" "gouts gouts note"'));
}

/* A3 (v8.82): THE HISTORY BY THUMB. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("the filters fold behind a Filtrer button", html.includes('id="h-filter" aria-expanded="false" aria-controls="h-panel"') && html.includes('id="h-panel"'));
  check("and active filters stay visible, each with its cross", SOURCE_UI.includes("function updateActiveFilters") && SOURCE_UI.includes('data-clear="'));
  check("a card's actions go behind «⋯»", SOURCE_UI.includes('data-action="menu"') && SOURCE_UI.includes("(!menu ? \"\" : '<div class=\"h-card-footer\">'"));
  check("no day subheading in the history (Chris's choice, v8.29)", !/h-jour(?!nal)/.test(readFileSync(join(ROOT, "js/ui-history.js"), "utf8")));
}

/* A4 (v8.84): THE RECIPE IN SIGHT, below 1,400 px. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const stopwatch = html.slice(html.indexOf('id="chrono-widget"'), html.indexOf('id="chrono-body"'));
  check("the recipe strip lives in the timer, which sticks to the top", stopwatch.includes('id="band-recipe"'));
  check("it opens the card, which has its own close button", html.includes('aria-controls="entry-aside"') && html.includes('id="aside-close"'));
  check("below 1,400 px the card no longer drops below the form", readCss().includes(".entry-layout:not(.aside-open) .entry-aside { display: none; }"));
}

/* A6 (v8.85): THE GUIDE CAN BE LEAFED THROUGH. */
{
  const guide = readFileSync(join(ROOT, "js/ui-guide.js"), "utf8");
  check("a collapsed recipe fits on one line that unfolds", guide.includes('class="recipe-toggle" data-toggle="') && readCss().includes(".recipe-card.collapsed .recipe-body { display: none; }"));
  check("a link to a recipe opens it before scrolling to it", /toggleRecipe\(id, true\);\s+filter\.value = "all";/.test(guide));
  check("on phone each cell of the coffee and recipe table states its column", guide.includes("'<td data-col=\"'") && readCss().includes("content: attr(data-col)"));
}

/* A7 (v8.86): NOTHING BELOW 12 PX, AND 40 PX FOR FINGERS. */
{
  const css = readCss();
  const belowFloor = (css.match(/[^\n]*font-size:\s*0\.(6[0-9]*|7[0-4]?)rem[^\n]*/g) || []).filter(l => !/::?(before|after)/.test(l));
  check("no text below 0.75 rem (12 px), drawn signs aside", belowFloor.length === 0, belowFloor.slice(0, 3).join(" | "));
  check("on touch, small buttons go to 40 px", css.includes("@media (pointer: coarse)") && css.includes(".btn-square-small { min-width: 40px; min-height: 40px; }"));
}

/* A8 (v8.87): THE WEEK BARS TELL THE SCORE AND OPEN UP. */
{
  const drawingsSrc = readFileSync(join(ROOT, "js/ui-drawings.js"), "utf8");
  check("a bar's tint follows the day's average score", drawingsSrc.includes(";--o:") && readCss().includes(".rc-day i { opacity: var(--o, 1); }"));
  check("a day with cups opens that day's history", drawingsSrc.includes('UI.openHistoryOn({ "h-from": b.dataset.day, "h-to": b.dataset.day })'));
}

/* A9 (v8.88): NOTHING HIDES THE END OF THE PAGE. The floating button that
   stepped aside on scroll is gone since v9.13 (M3): its job went to the bottom
   bar, so nothing floats over the content any more. */
{
  const css = readCss();
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("no floating button over the content any more", !html.includes("fab-quick") && !/\.fab\b/.test(css));
  check("the page keeps room at the bottom for the bar and its raised button", css.includes("main { padding-bottom: calc(var(--bottom-bar) + var(--bar-rise) + 28px + env(safe-area-inset-bottom, 0px)); }"));
  check("the bottom tabs have the same size", css.includes(".bottom-bar .bar-entry { font-size: 0.8rem; }"));
}

/* v8.89: THE STOCK IN THE DASHBOARD CORNER. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const titles = html.slice(html.indexOf('id="dashboard-highlight"'), html.indexOf("</div>", html.indexOf('id="dashboard-highlight"')) + 200);
  check("the stock lives under the dashboard title", titles.includes('id="stock-corner"'));
  check("it states the grams and opens the coffee card", SOURCE_UI.includes('Math.round(s.leftover) + " g"') && SOURCE_UI.includes('class="sc-bag'));
}

/* L7 (v8.90): BRASSAGE MODE, READABLE FROM ONE METRE. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const center = html.slice(html.indexOf('class="br-center"'), html.indexOf('class="br-step"'));
  check("the gram target lives in the centre of the ring", center.includes('id="br-target"') && center.includes('id="br-label"'));
  const br = readFileSync(join(ROOT, "js/ui-brew.js"), "utf8");
  check("the ring counts down to the next pour", br.includes("const arcEnd = nextStep ? nextStep.t : duration;"));
  check("and turns copper for the last ten seconds", br.includes("IMMINENT_S = 10") && readCss().includes(".br-ring.imminent .br-trace"));
}

/* L6 (v8.91): SETTINGS ORGANISED LIKE A PHONE. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const sections = [...html.matchAll(/class="card param-section" id="(ps-[a-z]+)"/g)].map(m => m[1]);
  const rows = [...html.matchAll(/class="pi-row" data-section="(ps-[a-z]+)"/g)].map(m => m[1]);
  check("every section of the list opens a page that exists", rows.length === 7 && rows.every(id => sections.includes(id)), rows.join(","));
  check("the Enregistrer button lives under the pages, only once", (html.match(/id="param-save"/g) || []).length === 1 && html.indexOf('id="param-actions"') > html.indexOf('id="ps-device"'));
  check("on phone the default values table becomes one card per recipe", (readFileSync(join(ROOT, "js/ui-catalog.js"), "utf8").match(/data-l="/g) || []).length === 5);
}

/* L4 (v8.92): THE COFFEE CARD, A PASSPORT IN FOUR TABS. */
{
  const sheet = readFileSync(join(ROOT, "js/ui-coffee-sheet.js"), "utf8");
  check("the card arranges its blocks in four tabs", ["setting", "tastes", "bags", "cups"].every(k => sheet.includes('panel("' + k + '"')));
  check("and all the card's drawings are still there", ["sheet-footprint", "sheet-trajectory", "sheet-grinder", "sheet-wheel"].every(id => sheet.includes('id="' + id + '"')));
  check("the phone back button closes the card", sheet.includes("history.pushState({ sheet: coffeeId }") && sheet.includes('addEventListener("popstate"'));
}

/* L3 (v8.93): THE JOURNAL, BY BAG. */
{
  const j = readFileSync(join(ROOT, "js/ui-journal.js"), "utf8");
  check("cups are grouped by bag, the bag at the cup's date", j.includes("DATA.bagAtDate(e.coffee_id, e.date_time)"));
  check("each chapter has its summary and its cards", j.includes("function resume(c)") && j.includes("UI.extractionCard(e)"));
  check("the by-date view stays one tap away", readFileSync(join(ROOT, "index.html"), "utf8").includes('data-view="date"'));
}

/* L5 (v8.94): THE GUIDE, A LIBRARY. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const g = readFileSync(join(ROOT, "js/ui-guide.js"), "utf8");
  check("the Guide opens on its home, with its search", html.includes('id="gp-home" data-panel="home"') && html.includes('id="guide-search"') && g.includes('localStorage.getItem("guide-tab") || "home"'));
  check("search covers recipes, vocabulary and tips", g.includes('type: "guide_type_recipe"') && g.includes('type: "guide_type_word"') && g.includes('type: "guide_type_tip"'));
  check("every recipe can be brewed in one tap", g.includes('data-brew="') && g.includes("function brewRecipe"));
}

/* PASS 3 (v9.06): EVERY PERSISTED NAME IN ENGLISH. Tables, columns,
   tombstones, CSV files and headers, local keys, the draft and the hashes went
   English; what v9.05 wrote is still read, everywhere, forever. Each check
   below starts from the exact v9.05 shapes. */
{
  const quiet = { log() {}, warn() {}, error() {} };
  const boot = (windowObject, idb) => new Function("window", "location", "indexedDB", "console", "localStorage",
    source + "\nreturn { DATA, LEGACY, SYNC, STARTER_RECIPES, DATA_SCHEMA };")(windowObject, { protocol: "file:" }, idb, quiet, undefined);
  const { LEGACY, DATA_SCHEMA: S } = boot(undefined, undefined);

  /* A fake IndexedDB that really keeps, reads and deletes: the v9.05 local copy
     is put in it under the French keys, and init() reads it like the browser. */
  const fakeIndexedDB = initial => {
    const store = new Map(Object.entries(initial || {}).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
    const copy = v => { try { return v && typeof v === "object" && !v.getFileHandle ? JSON.parse(JSON.stringify(v)) : v; } catch (e) { return v; } };
    const db = {
      createObjectStore() {},
      transaction() {
        const tx = { objectStore: () => ({
          put(v, k) { store.set(k, copy(v)); },
          delete(k) { store.delete(k); },
          get(k) { const r = {}; setTimeout(() => { r.result = store.has(k) ? copy(store.get(k)) : undefined; if (r.onsuccess) r.onsuccess(); }, 0); return r; },
        }) };
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
        return tx;
      },
    };
    return { store, open() { const req = { result: db }; setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0); return req; } };
  };
  /* A fake linked folder: files by name, readable and writable. */
  const fakeFolder = initial => {
    const files = new Map(Object.entries(initial || {}));
    return {
      files, name: "Carnet",
      queryPermission: async () => "granted", requestPermission: async () => "granted",
      async getFileHandle(fileName, opts) {
        if (!files.has(fileName) && !(opts && opts.create)) throw new Error("NotFoundError");
        return {
          getFile: async () => ({ text: async () => files.get(fileName) }),
          createWritable: async () => { let buf = ""; return { write: async c => { buf += c; }, close: async () => { files.set(fileName, buf); } }; },
        };
      },
    };
  };

  // The logbook in the NEW shape, normalised, with every table and many fields.
  const recipeOf = r => DATA.normalizeRecipe({ ...r, steps: r.steps.map(e => ({ ...e })), pairedCoffees: [...r.pairedCoffees] });
  const NEW = {
    coffees: [
      S.normalizeCoffee({ id: "cA", updated_at: 1001, name: "Là Việt Balanced", roaster: "Là Việt", origin: "Đà Lạt, Vietnam",
        species: "Arabica", process: "Lavé", roast: "Medium", pre_ground: 0, real_coffee_pct: 100, tag: "café de référence",
        roaster_notes: "noisette", bag_size_g: 250, price_vnd: 125000, roast_date: "2026-08-01",
        recommended_method: "Les deux", recommended_recipe: "Tetsu 4:6", added_date: "2026-08-02", active: 1 }),
      S.normalizeCoffee({ id: "cB", updated_at: 1002, name: "Bana Cofe G4", roaster: "Bana Cofe", roast: "Foncée", pre_ground: 1,
        real_coffee_pct: 82, bag_size_g: 340, price_vnd: 87000, added_date: "2026-08-03", active: 0 }),
    ],
    extractions: [
      DATA.normalizeExtraction({ id: "e1", updated_at: 2001, date_time: "2026-09-01T07:30", coffee_id: "cA", method: "Switch",
        recipe: "Tetsu 4:6", dose_g: 15, water_g: 240, grind_dial: "2.0.0", temperature_c: 93, total_time_s: 200,
        flow_time_s: 40, yield_ml: 210, added_water_ml: 20, milk_ml: "", stir_count: 2, cup: "Classic Mug",
        preheated_water: "", score_10: 8.5, diagnostic: "Équilibré", descriptors: "noisette|caramel", comment: "rond",
        heat_level: "", failed: "", heating_s: 110 }),
      DATA.normalizeExtraction({ id: "e2", updated_at: 2002, date_time: "2026-09-02T07:30", coffee_id: "cB", method: "Brikka",
        recipe: "Brikka classique", dose_g: 14, water_g: 150, grind_dial: "1.5.0", total_time_s: 240, flow_time_s: 30,
        yield_ml: 95, milk_ml: 60, cup: "Loveramics Flat White Egg", score_10: 4, diagnostic: "Sur-extrait (amer)",
        descriptors: "brûlé", heat_level: 3, failed: 1 }),
    ],
    recipes: [...STARTER_RECIPES.map(recipeOf), recipeOf({ id: "perso", updated_at: 3001, name: "Ma recette", number: "",
      method: "Switch", family: "", variant: "", subtitle: "Pour tester", dose: 16, water: 250, temp: 92, tempText: "92 °C",
      heat_level: "", dial: "1.8.0", ratioText: "1:15,6", typicalVolume: 220, totalText: "3:00", milk: false,
      steps: [{ t: 0, text: "Bloom 50 g" }, { t: 45, text: "Jusqu'à 250 g" }], bestFor: "Les lavés", pairedCoffees: ["Là Việt Balanced"],
      note: "note", video: "https://www.youtube.com/watch?v=abc", isDefault: false, advanced: true, has_variants: false, active: 1 })],
    cups: [S.normalizeCup({ id: "t1", updated_at: 4001, name: "Classic Mug", capacity_ml: 330 }),
      S.normalizeCup({ id: "t2", updated_at: 4002, name: "Loveramics Flat White Egg", capacity_ml: 150 })],
    purchases: [
      S.normalizePurchase({ id: "a1", updated_at: 5001, coffee_id: "cA", purchase_date: "2026-08-02", bag_size_g: 250,
        price_vnd: 125000, roast_date: "2026-08-01", opened_date: "2026-08-05", remaining_g: 120, remaining_at: "2026-09-01T08:00" }),
      S.normalizePurchase({ id: "a2", updated_at: 5002, coffee_id: "cB", purchase_date: "2026-08-03", bag_size_g: 340 }),
    ],
    settings: [DATA.normalizeSettings({ id: "moi", updated_at: 6001, dose_g: 14, heat_level: 4, grind_dial: "1.4.0",
      schema_version: 20, boil_s: 130, bubbles_s: 95, step_clicks: 3, step_degrees: 2, step_heat: 1, step_water_g: 10,
      step_dose_g: 1, drawings: "shelf,!clock,podium" })],
  };
  const NEW_TOMBS = { coffees: { gone: 7001 }, extractions: { e0: 7002 }, recipes: { oldperso: 7003 }, cups: {}, purchases: { a0: 7004 }, settings: {} };

  // The same logbook as v9.05 wrote it: French keys, French tables, French drawing names.
  const invert = map => Object.fromEntries(Object.entries(map).map(([o, n]) => [n, o]));
  const RECIPE_JS_OLD = invert(Object.fromEntries(Object.entries(LEGACY.FIELDS.recipes)
    .filter(([o]) => !["sous_titre", "eau_g", "temp_texte", "mouture_dial", "ratio_texte", "total_texte", "pour_qui",
      "cafes_associes", "par_defaut", "volume_typique"].includes(o))));
  const oldRow = (table, row) => {
    const inv = table === "recipes" ? RECIPE_JS_OLD
      : invert(Object.fromEntries(Object.entries(LEGACY.FIELDS[table]).filter(([o]) => o !== "volume_tasse_ml")));
    const out = Object.fromEntries(Object.entries(row).map(([k, v]) => [inv[k] || k, v]));
    if (table === "recipes") out.etapes = out.etapes.map(e => ({ t: e.t, texte: e.text }));
    if (table === "settings") out.dessins = "etagere,!horloge,podium";
    return out;
  };
  const OLD_TABLE = invert(LEGACY.TABLES);
  const oldName = t => OLD_TABLE[t] || t;
  const OLD = Object.fromEntries(Object.entries(NEW).map(([t, rows]) => [oldName(t), rows.map(r => oldRow(t, r))]));
  const OLD_TOMBS = Object.fromEntries(Object.entries(NEW_TOMBS).map(([t, m]) => [oldName(t), m]));
  const OLD_KEYS = [...new Set([...Object.keys(LEGACY.TABLES), ...Object.keys(LEGACY.DOCUMENT),
    ...Object.values(LEGACY.FIELDS).flatMap(Object.keys), ...Object.keys(LEGACY.STEP_FIELDS)])];
  const jsonKeys = v => { const s = new Set(); JSON.stringify(v, (k, x) => { s.add(k); return x; }); return s; };
  const oldKeysIn = v => { const s = jsonKeys(v); return OLD_KEYS.filter(k => s.has(k)); };
  check("the v9.05 fixture really is in the old shape",
    oldKeysIn(OLD).length > 40 && OLD.cafes[0].nom === "Là Việt Balanced" && OLD.recettes[0].etapes[0].texte !== undefined,
    oldKeysIn(OLD).length + "");

  const TABLE_NAMES = ["coffees", "extractions", "recipes", "cups", "purchases", "settings"];
  const byId = rows => new Map(rows.map(r => [r.id, r]));
  const sameRows = (table, got, want, { skipStamp } = {}) => {
    const g = byId(got), bad = [];
    for (const w of want) {
      const r = g.get(w.id);
      if (!r) { bad.push(w.id + " missing"); continue; }
      for (const [k, v] of Object.entries(w)) {
        if (skipStamp && k === "updated_at") continue;
        if (table === "settings" && (k === "updated_at" || k === "schema_version")) continue;
        if (JSON.stringify(r[k]) !== JSON.stringify(v)) bad.push(w.id + "." + k + " " + JSON.stringify(r[k]) + " != " + JSON.stringify(v));
      }
    }
    return bad;
  };

  // 1. The local copy of v9.05 (IndexedDB, French keys) opens losslessly.
  {
    const idb = fakeIndexedDB({ ...OLD, tombes: OLD_TOMBS, demoActive: false });
    const app = boot(undefined, idb);
    await app.DATA.init();
    const st = app.DATA.state;
    for (const t of TABLE_NAMES) {
      check("IndexedDB v9.05: same row count for " + t, st[t].length === NEW[t].length, st[t].length + " vs " + NEW[t].length);
      const bad = sameRows(t, st[t], NEW[t]);
      check("IndexedDB v9.05: every value of " + t + " under its new key, stamps kept", bad.length === 0, bad.slice(0, 3).join(" | "));
    }
    const tables = Object.fromEntries(TABLE_NAMES.map(t => [t, st[t]]));
    check("no old key left in the state", oldKeysIn({ tables, tombstones: st.tombstones }).length === 0,
      oldKeysIn({ tables, tombstones: st.tombstones }).join());
    check("tombstones preserved under the new table names", JSON.stringify(st.tombstones) === JSON.stringify(NEW_TOMBS),
      JSON.stringify(st.tombstones));
    check("the drawing names follow", st.settings[0].drawings === "shelf,!clock,podium", st.settings[0].drawings);
    check("the logbook moves to the current schema (23)", st.settings[0].schema_version === 23, String(st.settings[0].schema_version));
    const keys = [...idb.store.keys()].sort();
    check("the French keys are removed from IndexedDB", Object.keys(LEGACY.TABLES).concat("tombes").every(k => !idb.store.has(k)), keys.join());
    check("and the English ones written", TABLE_NAMES.concat("tombstones").every(k => idb.store.has(k)), keys.join());
    check("nothing old in the written copy", oldKeysIn([...idb.store.entries()].filter(([k]) => k !== "dirHandle")).length === 0,
      oldKeysIn([...idb.store.entries()]).join());
  }

  // 2. Both key sets present (an old tab kept writing): merged by id, the most recent wins.
  {
    const idb = fakeIndexedDB({
      coffees: [{ ...NEW.coffees[0], updated_at: 100, name: "stale" }, NEW.coffees[1]],
      cafes: [{ ...OLD.cafes[0], maj_le: 200, nom: "written by the old tab" }, { id: "cOld", maj_le: 50, nom: "only old" }],
      tombstones: { coffees: { x: 5 } }, tombes: { cafes: { x: 9, y: 3 } },
    });
    const app = boot(undefined, idb);
    await app.DATA.init();
    const c = byId(app.DATA.state.coffees);
    check("old and new keys together: the newer row wins", c.get("cA").name === "written by the old tab", c.get("cA").name);
    check("and no row is lost on either side", c.has("cB") && c.has("cOld") && app.DATA.state.coffees.length === 3);
    check("the tombstones of both are merged, latest mark kept",
      app.DATA.state.tombstones.coffees.x === 9 && app.DATA.state.tombstones.coffees.y === 3);
    check("and the old keys go", !idb.store.has("cafes") && !idb.store.has("tombes"));
  }

  // 3. The linked folder: French files (cafes.csv...) and French headers read like the English ones.
  const makeCsv = app => {
    const st = app.DATA.state;
    TABLE_NAMES.forEach(t => { st[t] = JSON.parse(JSON.stringify(NEW[t])); });
    return {
      coffees: app.DATA.csvSerialize(st.coffees, app.DATA.COFFEE_COLS),
      extractions: app.DATA.csvSerialize(st.extractions, app.DATA.EXT_COLS),
      recipes: app.DATA.csvRecipes(),
      cups: app.DATA.csvSerialize(st.cups, S.CUP_COLS),
      purchases: app.DATA.csvSerialize(st.purchases, app.DATA.PURCHASE_COLS),
      settings: app.DATA.csvSerialize(st.settings, app.DATA.SETTINGS_COLS),
    };
  };
  const NEW_CSV = makeCsv(boot(undefined, undefined));
  const CSV_OLD_HEADER = {
    recipes: invert(Object.fromEntries(Object.entries(LEGACY.FIELDS.recipes).filter(([o]) => !/[A-Z]/.test(o) && o !== "eau"))),
  };
  const toOldCsv = (t, text) => {
    const inv = CSV_OLD_HEADER[t] || invert(Object.fromEntries(Object.entries(LEGACY.FIELDS[t]).filter(([o]) => o !== "volume_tasse_ml")));
    const [head, ...rest] = text.split("\n");
    const body = rest.join("\n");
    return head.split(",").map(c => inv[c] || c).join(",") + "\n" + (t === "settings" ? body.replace("shelf,!clock,podium", "etagere,!horloge,podium") : body);
  };
  const OLD_CSV = Object.fromEntries(TABLE_NAMES.map(t => [t, toOldCsv(t, NEW_CSV[t])]));
  check("the old CSV fixture carries the v9.05 headers",
    OLD_CSV.coffees.startsWith("id,nom,torrefacteur,") && OLD_CSV.extractions.startsWith("id,date_heure,cafe_id,methode,recette,") &&
    OLD_CSV.recipes.startsWith("id,nom,numero,methode,famille,variante,sous_titre,") && OLD_CSV.purchases.startsWith("id,cafe_id,date_achat,") &&
    OLD_CSV.cups.startsWith("id,nom,contenance_ml") && OLD_CSV.settings.startsWith("id,dose_g,puissance_feu,mouture_dial,"),
    OLD_CSV.recipes.split("\n")[0]);
  const oldFiles = Object.fromEntries(TABLE_NAMES.map(t => [(oldName(t)) + ".csv", OLD_CSV[t]]));
  const newFiles = Object.fromEntries(TABLE_NAMES.map(t => [t + ".csv", NEW_CSV[t]]));
  check("the old folder has the French file names", Object.keys(oldFiles).sort().join() ===
    "achats.csv,cafes.csv,extractions.csv,recettes.csv,reglages.csv,tasses.csv", Object.keys(oldFiles).sort().join());
  const linkWith = async files => {
    const dir = fakeFolder(files);
    const app = boot({ showDirectoryPicker: async () => dir }, fakeIndexedDB());
    await app.DATA.init();
    await app.DATA.linkFolder(false);
    return { app, dir };
  };
  const strip = rows => JSON.stringify([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(r => { const { updated_at: _, ...rest } = r; return rest; }));
  {
    const fromOld = await linkWith(oldFiles);
    const fromNew = await linkWith(newFiles);
    for (const t of TABLE_NAMES) {
      check("old folder reads like the new one: " + t, strip(fromOld.app.DATA.state[t]) === strip(fromNew.app.DATA.state[t]),
        strip(fromOld.app.DATA.state[t]).slice(0, 120) + " / " + strip(fromNew.app.DATA.state[t]).slice(0, 120));
    }
    const bad = TABLE_NAMES.flatMap(t => sameRows(t, fromOld.app.DATA.state[t], NEW[t], { skipStamp: true }));
    check("and every value of the old files is kept", bad.length === 0, bad.slice(0, 3).join(" | "));
    check("the English files are written into the old folder",
      TABLE_NAMES.every(t => fromOld.dir.files.has(t + ".csv")), [...fromOld.dir.files.keys()].join());
    check("with the English headers", TABLE_NAMES.every(t => fromOld.dir.files.get(t + ".csv").split("\n")[0] === NEW_CSV[t].split("\n")[0]));
    // extractions.csv has the same name in both languages: it is the one file rewritten in place.
    check("and the French files are left untouched", Object.entries(oldFiles).filter(([f]) => f !== "extractions.csv")
      .every(([f, text]) => fromOld.dir.files.get(f) === text));
    // A folder with BOTH: the English file is the one read.
    const mixed = await linkWith({ ...oldFiles, "coffees.csv": NEW_CSV.coffees.replace("Là Việt Balanced", "English file") });
    check("a folder holding both reads the English file", mixed.app.DATA.state.coffees.some(c => c.name === "English file"));
    const none = fakeFolder({ "notes.txt": "x" });
    const lost = boot({ showDirectoryPicker: async () => none }, fakeIndexedDB());
    await lost.DATA.init();
    let refused = null;
    try { await lost.DATA.linkFolder(false); } catch (e) { refused = e.message; }
    check("a folder with neither is refused, naming both file names", !!refused && refused.includes("coffees.csv") && refused.includes("cafes.csv"), refused);
  }

  // 4. Importing one CSV file: old header, same rows as the new header, detected the same.
  {
    for (const t of ["coffees", "extractions", "recipes", "cups", "purchases"]) {
      const a = boot(undefined, undefined), b = boot(undefined, undefined);
      const pa = a.DATA.analyzeImport(OLD_CSV[t]), pb = b.DATA.analyzeImport(NEW_CSV[t]);
      check("old " + t + " CSV detected as " + t, pa.table === t && pb.table === t, pa.table + " / " + pb.table);
      await a.DATA.importCsvText(OLD_CSV[t]).catch(() => {});
      await b.DATA.importCsvText(NEW_CSV[t]).catch(() => {});
      const ids = new Set(NEW[t].map(r => r.id));
      const pick = app => strip(app.DATA.state[t].filter(r => ids.has(r.id)));
      check("old " + t + " CSV imports identically to the new one", pick(a) === pick(b), pick(a).slice(0, 100) + " / " + pick(b).slice(0, 100));
    }
  }

  // 5. The full JSON export of v9.05 (tables, tombes, exporte_le) reimports.
  {
    const app = boot(undefined, undefined);
    const exported = JSON.stringify({ tables: OLD, tombes: OLD_TOMBS, schema: 20, exporte_le: "2026-09-20T10:00:00.000Z" });
    check("an old full export is recognised", app.DATA.analyzeImport(exported).table === "all");
    await app.DATA.importCsvText(exported).catch(() => {});
    const st = app.DATA.state;
    const bad = ["coffees", "extractions", "cups", "purchases"].flatMap(t => sameRows(t, st[t], NEW[t]));
    check("its rows land under the new names, stamps kept", bad.length === 0, bad.slice(0, 3).join(" | "));
    check("its personal recipe too", byId(st.recipes).get("perso") && byId(st.recipes).get("perso").steps[1].text === "Jusqu'à 250 g");
    check("and its tombstones", st.tombstones.coffees.gone === 7001 && st.tombstones.purchases.a0 === 7004);
    check("nothing old in the state after the import",
      oldKeysIn({ t: TABLE_NAMES.map(t => st[t]), m: st.tombstones }).length === 0);
  }

  // 6. A row put in the state without the entry points is converted by migrateData (step 21).
  {
    const app = boot(undefined, undefined);
    app.DATA.state.extractions = [OLD.extractions[0]];
    app.DATA.state.tombstones = { cafes: { z: 1 } };
    app.DATA.migrateData();
    check("migrateData converts a raw old row", app.DATA.state.extractions[0].score_10 === 8.5 &&
      !("note_sur_10" in app.DATA.state.extractions[0]), JSON.stringify(app.DATA.state.extractions[0]).slice(0, 80));
    check("and raw old tombstones", app.DATA.state.tombstones.coffees && app.DATA.state.tombstones.coffees.z === 1);
    check("without restamping the row", app.DATA.state.extractions[0].updated_at === 2001);
    check("the schema is at 23, step 21 still there", SOURCE_DATA.includes("const CURRENT_SCHEMA = 23;") &&
      SOURCE_DATA.includes('{ v: 21, name: "English names", apply: convertLegacyNames }'));
    /* Tetsu 4:6 at 250 g by default (v9.08): the seed says so, and step 22
       moves a stored recipe still at the seeded 225 g, never a retouched one. */
    const t46 = STARTER_RECIPES.find(x => x.id === "tetsu-devil");
    check("the 4:6 starts at 250 g of water", t46.water === 250 && t46.ratioText === "ratio 1:16,7, environ 220 ml en tasse");
    check("step 22 targets the seeded 225 g only", SOURCE_DATA.includes('{ v: 22, name: "Tetsu 4:6 at 250 g"') &&
      SOURCE_DATA.includes('rec.id !== "tetsu-devil" || Number(rec.water) !== 225'));
  }

  // 7. The row rule: the new key wins over the old one.
  {
    const r = LEGACY.renameRow("coffees", { id: "x", nom: "old", name: "new", maj_le: 3 });
    check("both names on a row: the new key wins", r.name === "new" && !("nom" in r) && r.updated_at === 3, JSON.stringify(r));
    check("an old table name is accepted by renameRow", LEGACY.renameRow("cafes", { id: "x", nom: "A" }).name === "A");
    check("an unknown key passes through", LEGACY.renameRow("cups", { id: "t", nom: "A", extra: 1 }).extra === 1);
    check("drawing names: unknown ones are kept as is", LEGACY.renameDrawings("moulin,!neuf") === "grinder,!neuf");
  }

  // 8. localStorage: every old key moves to its new name, its value translated, then goes.
  {
    const mem = new Map(Object.entries({
      langue: "en", theme: "sombre", sombre: "nuit", bips: "0", "historique-vue": "sachet", "guide-onglet": "vocabulaire",
      "guide-filtre": "tout", "guide-recettes-ouvertes": '["tetsu-devil"]', "analyse-onglet": "gouts",
      "brouillon-saisie": '{"le":1}', "recap-ferme": "2026-09-14", "replis-saisie": '{"dose":15}', "replis-repris": "1",
      "inclure-ratees": "1", "brassage-unite": "ml", "gouts-toutes-familles": "0", "beeps": "1",
    }));
    const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
    LEGACY.migratePrefs(storage);
    const want = { lang: "en", theme: "dark", palette: "night", "history-view": "bag", "guide-tab": "vocabulary",
      "guide-filter": "all", "guide-open-recipes": '["tetsu-devil"]', "analysis-tab": "tastes", "entry-draft": '{"le":1}',
      "recap-closed": "2026-09-14", "entry-fallbacks": '{"dose":15}', "fallbacks-migrated": "1", "include-failed": "1",
      "brew-unit": "ml", "tastes-all-families": "0" };
    const wrong = Object.entries(want).filter(([k, v]) => storage.getItem(k) !== v).map(([k]) => k + "=" + storage.getItem(k));
    check("every old preference is under its new key, value translated", wrong.length === 0, wrong.join(", "));
    check("the old keys are gone", Object.keys(LEGACY.PREF_KEYS).every(k => !mem.has(k)), [...mem.keys()].join());
    check("a new key already there wins over the old one", storage.getItem("beeps") === "1");
    const before = JSON.stringify([...mem.entries()]);
    LEGACY.migratePrefs(storage);
    check("the migration is idempotent", JSON.stringify([...mem.entries()]) === before);
    check("the code reads the new keys only",
      ["\"lang\"", "\"beeps\"", "\"history-view\"", "\"guide-tab\"", "\"guide-filter\"", "\"guide-open-recipes\"", "\"analysis-tab\"",
        "\"entry-draft\"", "\"recap-closed\"", "\"entry-fallbacks\"", "\"include-failed\"", "\"brew-unit\"", "\"tastes-all-families\""]
        .every(k => (SOURCE_UI + I18N_FR_SRC).includes(k)) &&
      !/localStorage\.(get|set)Item\("(langue|bips|sombre|historique-vue|guide-onglet|guide-filtre|brouillon-saisie)"/.test(SOURCE_UI + I18N_FR_SRC));
    const head = readFileSync(join(ROOT, "index.html"), "utf8");
    check("the head theme script still understands the old values before the move",
      head.includes('localStorage.getItem("palette") || localStorage.getItem("sombre")') && head.includes('choice === "sombre"') &&
      head.includes('palette === "nuit"'));
    check("legacy-names.js is the first script of the page, before i18n.js reads the language",
      head.indexOf('src="js/legacy-names.js') > 0 && head.indexOf('src="js/legacy-names.js') < head.indexOf('src="js/tools.js') &&
      readFileSync(join(ROOT, "sw.js"), "utf8").includes('"./js/legacy-names.js"'));
  }

  // 9. The entry draft of v9.05: French keys and French field ids, both accepted.
  {
    const old = { le: 123, methode: "Switch", diagnostics: ["Équilibré"], descripteurs: ["caramel"], noteVide: false,
      valeurs: { "f-cafe": "cA", "f-commentaire": "rond", "f-water": "240" } };
    const d = LEGACY.renameDraft(old);
    check("an old draft reads under the new keys", d.savedAt === 123 && d.method === "Switch" && d.descriptors[0] === "caramel" &&
      d.ratingEmpty === false && d.values["f-coffee"] === "cA" && d.values["f-comment"] === "rond" && d.values["f-water"] === "240",
      JSON.stringify(d));
    check("no old key left in it", !("le" in d) && !("valeurs" in d) && !("f-cafe" in d.values));
    const current = { savedAt: 1, method: "Brikka", values: { "f-coffee": "c1" } };
    check("a new draft is untouched", JSON.stringify(LEGACY.renameDraft(current)) === JSON.stringify(current));
    const draftSrc = readFileSync(join(ROOT, "js/ui-draft.js"), "utf8");
    check("the draft is saved with the English keys and read through renameDraft",
      draftSrc.includes("savedAt: Date.now()") && draftSrc.includes("ratingEmpty: isRatingEmpty") && draftSrc.includes("b = LEGACY.renameDraft(b)"));
  }

  // 10. Hash routes: the French hashes still open their screen, the manifest uses the new ones.
  {
    const screens = (SOURCE_UI.match(/const SCREEN_NAMES = \[([^\]]*)\]/) || [])[1] || "";
    const want = { tableau: "dashboard", saisie: "entry", historique: "history", reglages: "tuning", parametres: "settings",
      refaire: "redo", reference: "guide" };
    check("every old hash has its new screen", Object.entries(want).every(([o, n]) => LEGACY.route(o) === n));
    check("and every new screen exists", Object.values(want).every(n => n === "redo" || screens.includes('"' + n + '"')), screens);
    check("a new hash is its own route", LEGACY.route("history") === "history" && LEGACY.route("dashboard") === "dashboard");
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
    check("the manifest shortcuts use the new hashes",
      manifest.shortcuts.map(s => s.url).join() === "./#entry,./#redo,./#history", manifest.shortcuts.map(s => s.url).join());
    check("the screens are routed through LEGACY.route", SOURCE_UI.includes("return LEGACY.route(nameKey);"));
  }
}

/* v9.13: NAVIGATION, SYNC BEAN, CHARTS AND LOADING (Q6, M3, M4, M8). */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const css = readCss();
  const bar = html.slice(html.indexOf('<nav class="bottom-bar"'), html.indexOf("</nav>", html.indexOf('<nav class="bottom-bar"')));
  const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));

  // M3: the bar, its centre button and the quick entry that replaced the floating button.
  const centre = (bar.match(/<button[^>]*id="bar-new"[^>]*>/) || [""])[0];
  check("the bar's centre button is the new cup: it opens the entry form", /class="[^"]*nav-btn[^"]*"/.test(centre) && centre.includes('data-screen="entry"'));
  check("and it says so to a screen reader", /aria-label="Nouvelle tasse"/.test(centre));
  check("every tab of the bar draws a line icon", (bar.match(/<button/g) || []).length === (bar.match(/<svg class="ico"/g) || []).length);
  check("the quick entry is in the Plus sheet", between('<nav class="rail"', "</nav>").includes('id="rail-quick"'));
  check("and opens on a long press of the centre button", readFileSync(join(ROOT, "js/ui-nav.js"), "utf8").includes("LONG_PRESS_MS") &&
    readFileSync(join(ROOT, "js/ui-nav.js"), "utf8").includes("UI.toggleQuick(true)"));
  check("the active tab has a mark that slides, still without reduced motion",
    bar.includes('class="bar-mark"') && /\.bar-mark\.ready \{[^}]*transition: transform/.test(css) &&
    /prefers-reduced-motion: reduce\) \{\s*\.bar-mark\.ready, \.bar-disc \{ transition: none; \}/.test(css));
  check("what sits right above the bar clears its raised button", css.includes("bottom: calc(var(--bottom-bar) + var(--bar-rise) + 8px);"));
  check("the core moves the mark when the screen changes", SOURCE_UI.includes("if (UI.placeBarMark) UI.placeBarMark(nameKey);"));

  // Q6: a bean wherever the sync state shows.
  check("the rail's sync line carries the bean", between('class="rail-sync"', "</p>").includes('class="sync-bean"'));
  check("so does the Data panel's", between('class="sync-row"', "</p>").includes('class="sync-bean"'));
  check("and the Settings row of the data", between("Données et synchro", "</button>").includes('class="sync-bean"'));
  check("and the Plus tab, for the phone", bar.includes("sync-bean bar-bean"));
  check("the old dot is gone", !html.includes("rail-point") && !css.includes(".rail-point"));
  check("each look of the bean has its colours, in the dark palettes too",
    ["raw", "roasted", "off", "alert"].every(l => css.includes('.sync-bean[data-look="' + l + '"] {') &&
      css.includes('html[data-theme="dark"] .sync-bean[data-look="' + l + '"] {')));
  check("the raw bean turns and the roasted one pops, never with reduced motion",
    css.includes("@keyframes bean-turn") && css.includes("@keyframes bean-pop") &&
    css.includes(".sync-bean[data-look] svg, .sync-bean.pop[data-look] svg { animation: none; }"));

  // M4: the thirty days chart and the SVG curves under the finger.
  const charts = readFileSync(join(ROOT, "js/charts.js"), "utf8");
  check("the thirty days chart lets a sideways finger read it", charts.includes('canvas.style.touchAction = "pan-y"'));
  check("with a guide on the day, and its tooltip as a bubble by touch only",
    charts.includes("plugins: [dayGuide]") && charts.includes("enabled: ctx => !touchedRecently(ctx.chart)") && charts.includes("external: fingerTooltip"));
  check("still the whole day, whatever the pointer's height", /interaction: \{ mode: "index", intersect: false \}/.test(charts));
  check("the bubble carries every line of the tooltip",
    ["tooltip.title", "tooltip.body", "tooltip.afterBody", "tooltip.footer", "labelColors"].every(k => charts.includes(k)));
  check("the coffee sheet's curve and the progress follow the finger",
    readFileSync(join(ROOT, "js/ui-coffee-sheet.js"), "utf8").includes('class="sh-svg" viewBox="0 0 \' + L + \' 152" data-scrub') &&
    /id="drawing-progress"[^>]*data-scrub/.test(html) && readFileSync(join(ROOT, "js/ui-drawings.js"), "utf8").includes('data-scrub-tip="'));
  check("a curve read by the finger keeps the vertical scroll", css.includes("svg[data-scrub] { touch-action: pan-y; }"));

  // M8: the loading silhouette.
  const main = html.slice(html.indexOf("<main>"), html.indexOf('<section id="screen-dashboard"'));
  check("the loading silhouette stands in main, before the screens", main.includes('id="loading"') && main.includes('class="grid-dashboard"'));
  check("it keeps its sentence for screen readers", /id="loading"[^>]*role="status"/.test(main) && main.includes("Chargement de ton carnet…"));
  check("the screens wait behind it", css.includes("#loading ~ .screen { display: none; }"));
  check("it leaves inside the first screen transition, and never stays", SOURCE_UI.includes('const skeleton = $("#loading");') &&
    SOURCE_UI.includes('setTimeout(() => { const overlay = $("#loading"); if (overlay) overlay.remove(); }, 800);'));
  check("no shimmer with reduced motion", /prefers-reduced-motion: reduce\) \{\s*\.sk-bone \{ animation: none; \}/.test(css));
}

/* v9.13: THE ENTRY'S DRAWN CONTROLS (Q2, J2, Q4 and M2, J1, M7). The
   components run here on the real grinder engine, with a stub interface:
   their logic, not their pixels (the pixels are boot.test's and the
   browser's). */
{
  const load = (file, stub, edit) => {
    let src = readFileSync(join(ROOT, file), "utf8");
    if (edit) src = edit(src);
    const ui = { $: () => null, fallbacks: { dial: "1.5.0", dose: 15 }, fmtDecimal: n => String(n),
      isRatingEmpty: el => !!el.empty, markRating: (el, e) => { el.empty = e; }, ...stub };
    const i18n = { t: (k, v) => k + (v ? JSON.stringify(v) : ""), locale: () => "fr-FR" };
    new Function("UI", "GRIND", "I18N", "DATA", "TOOLS", "window", "document", "navigator", src)(
      ui, GRIND, i18n, DATA, { escapeHtml: s => String(s) }, {}, {}, {});
    return ui;
  };

  // Q4: one press is one click, all the way along the dial.
  const dial = load("js/ui-dial.js");
  let d = "0.0.0", steadyClicks = true;
  for (let k = 0; k < GRIND.MAX_CLICKS; k++) {
    const next = dial.stepDial(d, 1);
    if (GRIND.parseDial(next).clicks !== GRIND.parseDial(d).clicks + 1) steadyClicks = false;
    d = next;
  }
  check("Q4: + walks the whole dial one click at a time, to the 3.0.0 stop", steadyClicks && d === "3.0.0", d);
  check("Q4: a comma typed on the phone is read too", dial.stepDial("1,4,4", 1) === "1.5.0");
  const dialSrc = readFileSync(join(ROOT, "js/ui-dial.js"), "utf8");
  check("Q4: microns and clicks come from GRIND, never recomputed",
    !/8[.,]32/.test(dialSrc) && dialSrc.includes("GRIND.dialFromClicks") && dialSrc.includes("GRIND.parseDial"));
  check("M2: the golden zone is the grinder map's own (UI.grinderData)", dialSrc.includes("UI.grinderData(coffeeId)"));

  // J1: one switch puts the old slider back, untouched.
  const slider = { hidden: false, value: "5", empty: true, id: "f-rating", getAttribute: () => null };
  const host = { hidden: true, innerHTML: "", querySelector: () => null, classList: { toggle() {} } };
  const off = load("js/ui-rating-dial.js", {}, src => src.replace("const RATING_DIAL_ON = true;", "const RATING_DIAL_ON = false;"));
  check("J1: RATING_DIAL_ON = false mounts nothing, the slider stays",
    off.mountRatingDial(slider, host) === null && slider.hidden === false && host.hidden === true);
  const on = load("js/ui-rating-dial.js");
  on.mountRatingDial(slider, host);
  check("J1: switched on, the dial takes the slider's place", slider.hidden === true && host.hidden === false);
  slider.dispatchEvent = () => true;
  on.setRating(slider, 6.8);
  check("J1: the dial writes the slider and marks the cup rated", slider.value === "7" && slider.empty === false, JSON.stringify(slider));
  const ratingSrc = readFileSync(join(ROOT, "js/ui-rating-dial.js"), "utf8");
  check("J1: a single switch, read before mounting", (ratingSrc.match(/const RATING_DIAL_ON = /g) || []).length === 1 &&
    ratingSrc.includes("if (!RATING_DIAL_ON"));
  check("J1: role slider with its values, and a tick per notch where the phone vibrates",
    ratingSrc.includes('role="slider"') && ratingSrc.includes("aria-valuenow") && ratingSrc.includes("aria-valuetext") &&
    ratingSrc.includes("navigator.vibrate(6)"));

  // Q2: no fill percentage anywhere on the card, Chris does not care how full the cup is.
  const cupSrc = readFileSync(join(ROOT, "js/ui-cup.js"), "utf8");
  check("Q2: the card states ratio, average, gap and grams, never a percentage",
    ["cup_ratio", "cup_avg", "cup_diff_up", "cup_left"].every(k => cupSrc.includes('"' + k + '"') && bilingual(k)) &&
    !cupSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").includes("%"));
  check("Q2: the average reads the analysable cups and the grams DATA.bagStock",
    cupSrc.includes("analyzableExts()") && cupSrc.includes("DATA.bagStock(ext.coffee_id, fallbacks.dose)"));

  // The CSS: one block, every motion off under reduced motion, fingers get 44 px.
  const css = readFileSync(join(ROOT, "css/finishing.css"), "utf8");
  const header = "/* ---------- Entry, rating, dial and brew cup (v9.13) ---------- */";
  // The block ends where the next block of finishing.css begins (other v9.13 blocks follow it).
  const blockRest = css.slice(css.indexOf(header));
  const blockEnd = blockRest.indexOf("/* ---------- ", header.length);
  const block = blockEnd > 0 ? blockRest.slice(0, blockEnd) : blockRest;
  check("the v9.13 styles live in one block of finishing.css", css.split(header).length === 2 && block.includes(".gd-needle"));
  const reduced = block.slice(block.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  check("reduced motion stills the needle, the liquid, the stamp, the wave and the steam",
    [".gd-needle", ".cup-liquid", ".cc-stamp", ".cup-wave", ".cup-steam"].every(s => reduced.includes(s)));
  const coarse = block.slice(block.lastIndexOf("@media (pointer: coarse)"));
  check("on touch, the dial's buttons and the quick time buttons reach 44 px",
    /\.gd-step[^{]*\{ width: 46px; height: 46px; \}/.test(coarse) && coarse.includes(".tw-q { min-height: 44px;"));

  // M7: the fields stay the truth; the wheels follow them and write only when turned.
  const wheelSrc = readFileSync(join(ROOT, "js/ui-wheel.js"), "utf8");
  check("M7: writeDuration and the draft bring the wheels back on their fields",
    SOURCE_UI.includes("UI.syncTimeWheel(prefix);") && readFileSync(join(ROOT, "js/ui-draft.js"), "utf8").includes("UI.syncTimeWheels();"));
  check("M7: a wheel writes its field only when Chris turned it", wheelSrc.includes("if (col.user) {"));
  check("M7: quick buttons, and « Reprendre le chrono » for the total and the drawdown",
    wheelSrc.includes("const QUICK = [-5, 5, 15];") && SOURCE_UI.includes('UI.mountTimeWheel("f-total", $("#f-total-wheel"), $("#f-total-quick"), "total");') &&
    SOURCE_UI.includes('UI.mountTimeWheel("f-flow", $("#f-flow-wheel"), $("#f-flow-quick"), "flow");') && bilingual("wheel_chrono"));
}

/* ---------- Stock and jars (v9.13) ---------- */
/* Q8: THE JAR TO THE GRAM. The empty jar is a synced setting, empty until
   Chris weighs his; the weighing takes it off the scale reading, and refuses
   the two real mistakes. */
{
  const n = DATA.normalizeSettings;
  check("the empty jar is empty by default", n({}).jar_tare_g === "", JSON.stringify(n({}).jar_tare_g));
  check("it keeps one decimal", n({ jar_tare_g: 301.26 }).jar_tare_g === 301.3, String(n({ jar_tare_g: 301.26 }).jar_tare_g));
  check("a French comma is read", n({ jar_tare_g: "298,4" }).jar_tare_g === 298.4);
  check("zero, a negative or a word go back to empty",
    n({ jar_tare_g: 0 }).jar_tare_g === "" && n({ jar_tare_g: -3 }).jar_tare_g === "" && n({ jar_tare_g: "bocal" }).jar_tare_g === "");
  check("an absurd weight too", n({ jar_tare_g: 9000 }).jar_tare_g === "");
  check("the empty jar is a settings column", DATA.SETTINGS_COLS.includes("jar_tare_g"));
  const csv = DATA.csvSerialize([n({ jar_tare_g: 280.5 })], DATA.SETTINGS_COLS);
  const back = n(DATA.csvParse(csv)[0]);
  check("and it survives the CSV round trip", back.jar_tare_g === 280.5, csv);
  check("nobody's real jar is written in the code", !/jar_tare_g:\s*\d/.test(SOURCE_DATA) && !SOURCE_DATA.includes("322"));

  const w = DATA.weighJar;
  check("weighing takes the jar off", w("531,7", 280.5, 250).net === 251.2 && w("531,7", 280.5, 250).error === "", JSON.stringify(w("531,7", 280.5, 250)));
  check("without an empty jar, no weighing", w(500, "", 250).error === "no_tare");
  check("without a reading, it asks for one", w("", 280.5, 250).error === "no_reading" && w("abc", 280.5, 250).error === "no_reading");
  check("less than the empty jar: the jar is not all on the scale", w(250, 280.5, 250).error === "below_jar");
  check("more than a bag and a fifth: something else is on the scale",
    w(600, 280.5, 250).error === "above_bag" && w(580, 280.5, 250).error === "");
  check("without a bag size, only the jar check applies", w(1800, 280.5, 0).error === "" && w(1800, 280.5, 0).net === 1519.5);
  check("an empty jar on the scale is zero grams, not an error", w("280,5", 280.5, 250).net === 0 && w("280,5", 280.5, 250).error === "");

  check("schema 23 is the jar tare, a step that changes no value",
    SOURCE_DATA.includes('{ v: 23, name: "jar tare", apply: () => false }') && SOURCE_DATA.includes("const CURRENT_SCHEMA = 23;"));
}

/* Q8: WHAT A JAR DRAWS, and J6: THE RECORD OF THE BAG IN STOCK. */
{
  const saved = { coffees: DATA.state.coffees, extractions: DATA.state.extractions, purchases: DATA.state.purchases };
  const day = k => { const d = new Date(); d.setDate(d.getDate() - k); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  DATA.state.coffees = [{ id: "j1", name: "Jar", bag_size_g: 250, active: 1 }, { id: "j2", name: "No bag", bag_size_g: "", active: 1 }];
  DATA.state.purchases = [
    { id: "p-old", coffee_id: "j1", purchase_date: day(40), opened_date: day(40), bag_size_g: 250, remaining_g: "", remaining_at: "" },
    { id: "p-new", coffee_id: "j1", purchase_date: day(10), opened_date: day(10), bag_size_g: 250, remaining_g: "", remaining_at: "" },
  ];
  const cup = (id, k, score, dose) => ({ id, coffee_id: "j1", date_time: day(k) + "T08:00", dose_g: dose === undefined ? 16 : dose, score_10: score });
  DATA.state.extractions = [
    cup("old-best", 30, 9.5),
    cup("a", 8, 7), cup("b", 6, 8), cup("c", 4, 7.5),
  ];
  const g = DATA.bagGauge("j1", 15);
  check("the jar draws the grams left of the current bag", g && g.grams === 202 && g.bag === 250, JSON.stringify(g));
  check("with the coffee's usual dose", g && Math.abs(g.dose - 16) < 1e-9 && g.cups === 12, JSON.stringify(g));
  check("not low above three cups", g && g.low === false);
  DATA.state.extractions.push(cup("eat", 3, "", 160));
  const low = DATA.bagGauge("j1", 15);
  check("low below three cups of the usual dose", low && low.low === true && low.grams === 42, JSON.stringify(low));
  DATA.state.extractions.push(cup("over", 2, "", 100));
  const empty = DATA.bagGauge("j1", 15);
  check("an overdrawn bag draws an empty jar, the raw count kept aside",
    empty && empty.grams === 0 && empty.empty === true && empty.remaining < 0, JSON.stringify(empty));
  check("no bag size, no jar", DATA.bagGauge("j2", 15) === null);
  DATA.state.extractions = DATA.state.extractions.filter(e => e.id !== "eat" && e.id !== "over");

  const latest = cup("d", 0, 8.5);
  DATA.state.extractions.push(latest);
  const r = DATA.bagRecord(latest);
  check("a record on the bag in stock, against its own cups only", r && r.previous === 8 && r.gap === 0.5, JSON.stringify(r));
  check("it names the day of the previous best", r && r.previousDate === day(6) && r.previousId === "b", JSON.stringify(r));
  check("the old bag's 9.5 does not count", r && r.earlier === 3);
  latest.score_10 = 8;
  check("a tie is not a record", DATA.bagRecord(latest) === null);
  latest.score_10 = "";
  check("an unrated cup is not a record", DATA.bagRecord(latest) === null);
  latest.score_10 = 9;
  DATA.state.extractions = DATA.state.extractions.filter(e => e.id !== "c" && e.id !== "a");
  check("it needs two earlier rated cups on the bag", DATA.bagRecord(latest) === null);
  DATA.state.extractions.push(cup("a2", 7, 6), cup("u", 5, ""));
  check("unrated cups do not count among them", DATA.bagRecord(latest) !== null && DATA.bagRecord(latest).earlier === 2);
  const elsewhere = { ...latest, id: "x", coffee_id: "j2" };
  check("a coffee without a bag has no record", DATA.bagRecord(elsewhere) === null);
  const onOld = cup("on-old", 35, 10);
  check("a cup from an earlier bag is not a record of the bag in stock", DATA.bagRecord(onOld) === null);

  Object.assign(DATA.state, saved);
}

/* EVERY STYLESHEET CLOSES WHAT IT OPENS (v9.15). Two branches appended their
   blocks after the same closing brace, and the merge kept that brace once: the
   next block ended up inside an @media (prefers-reduced-motion) rule, so the
   v9.14 entry styles only applied with reduced motion. Braces are counted
   outside comments, per file, never below zero. */
for (const sheet of CSS_SHEETS) {
  const text = readFileSync(join(ROOT, sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, negative = false;
  for (const ch of text) { if (ch === "{") depth++; if (ch === "}") { depth--; if (depth < 0) negative = true; } }
  check(sheet + " has balanced braces", depth === 0 && !negative, "depth " + depth);
}

/* v9.13: THE DESKTOP LAYER. O7 the side panel, P1 + M5 search and act (Ctrl K),
   P3 hover and keyboard, M6 the empty history. The ranking of the palette is
   pure (js/search.js): it is checked here word by word. */
{
  const SEARCH = new Function(readFileSync(join(ROOT, "js/search.js"), "utf8") + "\nreturn SEARCH;")();
  check("search folds accents, case, spaces and the Vietnamese đ",
    SEARCH.fold("Đà Lạt  BRÛLÉ œuf") === "da lat brule oeuf", SEARCH.fold("Đà Lạt  BRÛLÉ œuf"));
  const bana = { name: "Bana Cofe G4", detail: "Gia Lai robusta", keywords: "beurre caramel" };
  check("every typed word must be found (AND)", SEARCH.score("bana robusta", bana) > 0 && SEARCH.score("bana arabica", bana) === 0);
  check("an empty query matches nothing", SEARCH.score("   ", bana) === 0 && SEARCH.rank([{ group: "coffees", ...bana }], "").length === 0);
  check("accents and case in the query do not count either", SEARCH.score("BÁNA", bana) === SEARCH.score("bana", bana));
  check("a word start beats a word inside", SEARCH.score("cof", bana) > SEARCH.score("ofe", bana));
  check("the name beats the detail, which beats the keywords",
    SEARCH.score("lai", bana) < SEARCH.score("cofe", bana) && SEARCH.score("caramel", bana) < SEARCH.score("lai", bana));
  check("the whole name scores above its beginning", SEARCH.score("bana cofe g4", bana) > SEARCH.score("bana cofe", bana));
  const items = [
    { group: "cups", name: "notes de jacquier bien mûres" },
    { group: "guide", name: "Jacquier", detail: "fruits mûrs" },
    { group: "actions", name: "Bana Cofe G4", detail: "brasser" },
    { group: "coffees", name: "Bana Cofe G4", detail: "Gia Lai" },
    { group: "screens", name: "Historique" },
  ];
  const groupsOf = list => list.map(x => x.group).join(",");
  check("the groups follow their best item: the exact word of the Guide first",
    groupsOf(SEARCH.rank(items, "jacquier")) === "guide,cups", groupsOf(SEARCH.rank(items, "jacquier")));
  check("on a tie, the actions first: « bana » then Enter brews the Bana",
    groupsOf(SEARCH.rank(items, "bana")) === "actions,coffees", groupsOf(SEARCH.rank(items, "bana")));
  check("each result comes back with its score", SEARCH.rank(items, "bana").every(x => x.score > 0 && x._index === undefined));
  const cups = [{ group: "cups", name: "un peu amer", order: 2 }, { group: "cups", name: "trop amer", order: 0 }, { group: "cups", name: "amer et sec", order: 1 }];
  check("within a group: the score, then the order the caller gave",
    SEARCH.rank(cups, "amer").map(x => x.order).join() === "1,0,2", SEARCH.rank(cups, "amer").map(x => x.order).join());
  const many = Array.from({ length: 12 }, (_, i) => ({ group: "cups", name: "amer " + i }));
  check("a group is capped, a palette is read at a glance", SEARCH.rank(many, "amer").length === SEARCH.LIMITS.cups);
  check("the cap can be lifted (the side panel walks every matching cup)", SEARCH.rank(many, "amer", { cups: 100 }).length === 12);
  check("an unknown group comes last, capped at five",
    groupsOf(SEARCH.rank([...Array.from({ length: 7 }, () => ({ group: "other", name: "amer" })), { group: "screens", name: "amer" }], "amer")) ===
      "screens,other,other,other,other,other");

  // The pieces are where the code expects them.
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  check("the page holds the side panel, the palette, the shortcuts help and the rail search button",
    ['id="side-panel"', 'id="modal-cmd"', 'id="cmd-input"', 'id="modal-shortcuts"', 'id="btn-search"'].every(s => html.includes(s)));
  const sheetSrc = readFileSync(join(ROOT, "js/ui-coffee-sheet.js"), "utf8");
  check("the coffee sheet opens beside on a wide screen, as a window otherwise",
    sheetSrc.includes("if (!UI.showInSidePanel(m, coffeeId)) m.showModal();"));
  check("and its phone back button guard is untouched",
    sheetSrc.includes('history.pushState({ sheet: coffeeId }, "")') && sheetSrc.includes("if (m.open && historyEntry) { historyEntry = false; m.close(); }"));
  check("a history row opens the cup through the panel, which falls back to editing", SOURCE_UI.includes("if (rowExt) UI.openCup(rowExt, row);") &&
    SOURCE_UI.includes("UI.loadExtractionIntoEntry(DATA.state.extractions.find(x => x.id === e.id), false);"));
  check("the palette reuses the Guide search index", SOURCE_UI.includes("UI.guideSearchIndex()") && SOURCE_UI.includes("function guideSearchIndex()"));
  const css = readCss();
  check("the panel only exists from 1,100 px", css.includes(".side-panel { display: none; }") && css.includes("@media (min-width: 1100px) {\n  .side-open { --side-w:"));
  check("every new animation stops under reduced motion",
    /prefers-reduced-motion: reduce\) \{\n  \.side-panel\.sp-enter, \.modal-sheet\.as-panel\[open\], \.cmd\[open\] \.cmd-box, \.kbd-chord, \.es-steam \{ animation: none; \}/.test(css));
  const keys = ["panel_kind_cup", "panel_position", "panel_hint_cup", "panel_compare_added", "hover_redo", "keys_no_cup", "keys_go_journal",
    "empty_history_title", "empty_history_button", "empty_filtered_title", "empty_filtered_button", "palette_new", "palette_brew_best",
    "palette_in_history", "palette_nothing", "palette_group_actions", "palette_group_tastes", "palette_hint_taste"];
  check("the new texts exist in French and in English", keys.every(bilingual), keys.filter(k => !bilingual(k)).join(", "));
  /* $ returns ONE element, $$ an array: « $("dialog[open]").some » threw on
     every Ctrl K (a $$ lost in a replacement string, the August 14 bug again). */
  const singleAsList = SOURCE_UI.match(/(^|[^$])\$\("[^"]*"\)\.(some|forEach|map|filter|find|every)\(/m);
  check("no single-element lookup is used as a list", !singleAsList, singleAsList && singleAsList[0]);
}

/* v9.17: THE CUP THAT ARRIVES (Q13), THE BREWER THAT MELTS (Q12), THE RINGS. */
{
  // Which cups came in through a sync: only the ids this device did not have.
  const rows = [{ id: "e1" }, { id: "e2" }, { id: "e-phone" }, { id: "e-phone-2" }];
  check("a sync names the cups it brought, and only those",
    JSON.stringify(DATA.arrivedIds(new Set(["e1", "e2"]), rows)) === JSON.stringify(["e-phone", "e-phone-2"]),
    JSON.stringify(DATA.arrivedIds(new Set(["e1", "e2"]), rows)));
  check("a cup this device already had never counts, even edited elsewhere", DATA.arrivedIds(["e1", "e2", "e-phone", "e-phone-2"], rows).length === 0);
  check("the first sync of an empty device brings the whole logbook, not « a cup arriving »", DATA.arrivedIds([], rows).length === 0);
  check("rows without an id, or no rows, are not arrivals",
    DATA.arrivedIds(["e1"], [null, {}, { id: "" }]).length === 0 && DATA.arrivedIds(["e1"], undefined).length === 0);
  check("the arrivals are read as a copy", (() => { const a = DATA.lastArrivals(); a.push({ id: "x" }); return !DATA.lastArrivals().some(x => x.id === "x"); })());
  // The ids are taken on return, BEFORE the merge, so a cup saved during the exchange is this device's.
  const sync = SOURCE_DATA.slice(SOURCE_DATA.indexOf("async function synchronize("), SOURCE_DATA.indexOf("function scheduleSync("));
  const before = sync.indexOf("const cupsBefore = new Set(state.extractions.map(e => e.id));");
  const merge = sync.indexOf("adoptTables(SYNC.mergeStates(received, localPayload()));");
  const noted = sync.indexOf("noteArrivals(arrivedIds(cupsBefore, state.extractions), Date.now());");
  check("the arrivals are measured around the merge of the answer, the local cups taken on return",
    before > sync.indexOf("await SYNC.exchange(") && before < merge && merge < noted, [before, merge, noted].join(" "));
  // Memory only: never stored, never sent.
  const saveLocalSrc = SOURCE_DATA.slice(SOURCE_DATA.indexOf("async function saveLocal()"), SOURCE_DATA.indexOf("// ---------- File System Access"));
  const payloadSrc = SOURCE_DATA.slice(SOURCE_DATA.indexOf("function localPayload()"), SOURCE_DATA.indexOf("function adoptTables("));
  check("the arrivals are neither stored nor synced, and the data schema is untouched",
    !/arriv/i.test(saveLocalSrc) && !/arriv/i.test(payloadSrc) && !("arrivals" in DATA.state) && SOURCE_DATA.includes("const CURRENT_SCHEMA = 23;"));

  // The three new modules are loaded by the page, the offline cache and the three harnesses.
  const html = readFileSync(join(ROOT, "index.html"), "utf8"), sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const version = (html.match(/js\/app\.js\?v=([\d.]+)/) || [])[1];
  for (const f of ["ui-roll", "ui-brewer", "ui-arrivals"]) {
    check(f + ".js is in the page, the offline cache and the harnesses",
      html.includes('<script defer src="js/' + f + ".js?v=" + version + '"></script>') && sw.includes('"./js/' + f + '.js"') &&
      ["tools/boot.test.mjs", "tools/modules.test.mjs"].every(t => readFileSync(join(ROOT, t), "utf8").includes('"js/' + f + '.js"')) &&
      SOURCE_UI.includes("Object.assign(UI, {"), version);
  }
  check("the entry has its brewer next to the machine's buttons", /<div class="method-row">\s*<span class="brewer" id="f-brewer" aria-hidden="true"><\/span>\s*<div class="choice-method"/.test(html));
  check("the pill and the brewer speak French and English", bilingual("arrival_from_other"));
  const pillFr = (I18N_FR_SRC.match(/arrival_from_other: \{ fr: "([^"]*)" \}/) || [])[1];
  check("the pill does not guess the device: « de l'autre appareil »", pillFr === "de l'autre appareil", pillFr);

  // The brewer: two silhouettes with as many points each, so one melts into the other.
  const brewerSrc = readFileSync(join(ROOT, "js/ui-brewer.js"), "utf8");
  const shapes = new Function(brewerSrc.slice(brewerSrc.indexOf("const SHAPES = {"), brewerSrc.indexOf("const lerp")).replace("const SHAPES =", "return"))();
  check("the Brikka and the Switch have the same number of points, body and handle",
    shapes.Brikka.body.length === shapes.Switch.body.length && shapes.Brikka.handle.length === shapes.Switch.handle.length &&
    shapes.Brikka.body.length >= 12, shapes.Brikka.body.length + " / " + shapes.Switch.body.length);
  check("only a change Chris makes moves the brewer, never the startup or the draft",
    brewerSrc.includes("const quiet = calm() || hidden() || !userActed() || from === target;") && brewerSrc.includes("navigator.userActivation"));
  check("the inputs stay the truth: the roll only draws above them, and a touch ends it",
    readFileSync(join(ROOT, "js/ui-roll.js"), "utf8").includes('["pointerdown", "focus", "input", "keydown"]') &&
    SOURCE_UI.includes("const before = UI.methodSnapshot();\n      chooseMethod(b.dataset.method);\n      prefillFromRecipe($(\"#f-recipe\").value);\n      UI.playMethodChange(before);"));

  // CSS: one block, reduced motion everywhere, and the rings measured.
  const finishing = readFileSync(join(ROOT, "css/finishing.css"), "utf8");
  const block = finishing.slice(finishing.indexOf("/* ---------- Brewer morph and sync arrival (v9.17) ---------- */"));
  check("the v9.17 styles are one block at the end of finishing.css", block.length > 200 && block.includes(".arrival-from") && block.includes(".brewer {"));
  check("every v9.17 movement stops under reduced motion",
    block.includes("@media (prefers-reduced-motion: reduce) {\n  .roll-out { display: none; }\n" +
      "  .roll-in, .method-arrive, .table-latest tr.arrival-play { animation: none; }\n  .bw-body, .bw-brikka, .bw-switch { transition: none; }\n}"));
  check("the brew ring keeps its figure inside: no label in the compact ring, a figure sized on the ring",
    block.includes(".br-ring { container-type: inline-size; }") && block.includes(".br-center .br-label { display: none; }") &&
    /\.br-center #br-target \{ font-size: min\(clamp\([^)]*\), 33cqi\); \}/.test(block));
  const tooSmall = [...block.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no v9.17 text under 0.75rem", tooSmall.length === 0, tooSmall.map(m => m[0]).join(", "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
