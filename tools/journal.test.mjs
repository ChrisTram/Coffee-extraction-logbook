/* Journal tests (v9.20), no browser: O5, Q3, Q5.
 *
 *   node tools/journal.test.mjs
 *
 * What the journal group added is mostly RULES: the sentence that says what
 * separates two cups (js/compare.js), which figures of a corrected cup roll
 * and where they sit in a row (js/ui-scenes.js), the columns the table keeps
 * (js/ui-table.js). Each is pure on its input, so it is checked here word by
 * word, with the real French templates, instead of being trusted. The
 * scenes themselves (rolls, flights, the bin) are movement: boot.test.mjs
 * checks that the screens still start and render, the eye checks the rest. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, f), "utf8");

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

// The pure layers, in one scope as the page loads them.
const { TOOLS, GRIND, COMPARE, I18N_FR, I18N_EN, DESCRIPTOR_GROUPS } = new Function(
  ["js/tools.js", "js/grind.js", "js/i18n.fr.js", "js/i18n.fr2.js", "js/i18n.en.js", "js/recipes.js", "js/compare.js"].map(read).join("\n") +
  "\nreturn { TOOLS, GRIND, COMPARE, I18N_FR, I18N_EN, DESCRIPTOR_GROUPS };")();

// I18N.t in miniature: the French templates, or the English halves.
const tFor = lang => (key, vars) => {
  let s = lang === "en" ? I18N_EN.T[key] : (I18N_FR[key] || {}).fr;
  if (s === undefined) return "<<" + key + ">>";
  if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
  return s;
};
const t = tFor("fr");
const fmt = { decimal: n => String(Math.round(n * 10) / 10).replace(".", ","), tag: x => x,
  duration: s => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0") };

// The recipes the rules read their windows from, as STARTER_RECIPES writes them.
const RECIPES = {
  "One and Done (Lance Hedrick)": { method: "Switch", totalText: "total 2:00 à 2:30", temp: 92 },
  "The Coffee Chronicler's Recipe": { method: "Switch", totalText: "total 2:45 à 3:15", temp: 92 },
  "Brikka classique (eau préchauffée)": { method: "Brikka", totalText: "montée en pression sous 2 minutes, écoulement de 20 à 45 secondes" },
};
const recipeOf = name => RECIPES[name] || null;
const cup = (o, c) => ({
  id: "x", coffee_id: "c1", method: "Switch", recipe: "One and Done (Lance Hedrick)", dose_g: 15, water_g: 225, grind_dial: "1.5.0",
  temperature_c: 92, heat_level: "", total_time_s: 140, flow_time_s: "", stir_count: "", preheated_water: "",
  score_10: 8, diagnostic: "", descriptors: "", ...o,
  _c: { ratio: (o.water_g || 225) / (o.dose_g || 15), ratioText: "1:" + ((o.water_g || 225) / (o.dose_g || 15)).toFixed(1), days_open: "", ...(c || {}) },
});

/* ---------- O5: the windows of a recipe ---------- */
{
  const w = COMPARE.timeWindow;
  check("a window « total 2:45 à 3:15 » reads 165 to 195 s", JSON.stringify(w("total 2:45 à 3:15")) === '{"from":165,"to":195}');
  check("« environ 3:30 » becomes a quarter minute on each side", JSON.stringify(w("total environ 3:30")) === '{"from":195,"to":225}');
  check("« 2:30 à 3:00, au plus tard 3:30 » keeps the first two",
    JSON.stringify(w("total environ 2:30 à 3:00, au plus tard 3:30")) === '{"from":150,"to":180}');
  check("« 1:45 à 2:00, la seule sous deux minutes » reads 105 to 120", JSON.stringify(w("total 1:45 à 2:00, la seule sous deux minutes")) === '{"from":105,"to":120}');
  check("a Brikka text without times has no total window", w(RECIPES["Brikka classique (eau préchauffée)"].totalText) === null && w("") === null && w(undefined) === null);
  check("the Brikka's drawdown window is read in its text",
    JSON.stringify(COMPARE.flowWindow(RECIPES["Brikka classique (eau préchauffée)"].totalText)) === '{"from":20,"to":45}');
  check("a time lands short, inside or long", COMPARE.windowState(100, { from: 120, to: 150 }) === "short" &&
    COMPARE.windowState(130, { from: 120, to: 150 }) === "inside" && COMPARE.windowState(170, { from: 120, to: 150 }) === "long" &&
    COMPARE.windowState("", { from: 1, to: 2 }) === null && COMPARE.windowState(10, null) === null);
  // Every original recipe with a « total » has a window the rules can read.
  const STARTER = new Function(read("js/recipes.js") + "\nreturn STARTER_RECIPES;")();
  const unread = STARTER.filter(r => /^total/.test(r.totalText || "") && !COMPARE.timeWindow(r.totalText)).map(r => r.name);
  check("every original Switch recipe gives its time window", unread.length === 0, unread.join(", "));
}

/* ---------- O5: the facts ---------- */
{
  const d = COMPARE.defects("Un peu amer|Astringent|Équilibré");
  check("the defects of a diagnosis, by family and weight", d.bitter === 1 && d.astringent === 2 && Object.keys(d).length === 2);
  check("uneven extraction is a defect of its own", COMPARE.defects("Acide ET amer (extraction inégale)").uneven === 2);

  const a = cup({ grind_dial: "1.4.4", temperature_c: 90, total_time_s: 168, diagnostic: "Un peu amer", score_10: 7 });
  const b = cup({ grind_dial: "1.5.0", temperature_c: 92, total_time_s: 144, descriptors: "caramel|rond", score_10: 8.5 });
  const f = COMPARE.facts(a, b, recipeOf);
  check("1.4.4 to 1.5.0 is ONE click coarser, 8 µm (C5, 8.32 µm a click)", f.grind.clicks === 1 && f.grind.microns === 8);
  check("the water is 2 °C hotter", f.temp.delta === 2);
  check("the bitterness of A is gone, nothing came", f.gone.join() === "bitter" && f.came.length === 0);
  check("the tastes B gained are listed", f.gained.join() === "caramel,rond");
  check("B is the better one, by 1.5", f.better === "b" && f.score.delta === 1.5);
  check("the time came back into the recipe's window", f.time.stateA === "long" && f.time.stateB === "inside");
  check("the settings in words: a little coarser, a little hotter",
    COMPARE.settingsWords(f).map(w => w.key).join() === "cmp_coarser_little,cmp_hotter_little");

  /* THE SENTENCE of the mockup, with the real templates. */
  const v = COMPARE.verdict(f, t, fmt);
  check("the verdict says what separates them, recipe included",
    v === "Un peu plus gros et un peu plus chaud : l'amertume de A a disparu, 1,5 de mieux pour B. " +
      "Le temps est revenu dans la fenêtre de la recette, 2:00 à 2:30.", v);
  const en = COMPARE.verdict(f, tFor("en"), fmt);
  check("and in English, with an English colon",
    en === "A little coarser and a little hotter: A's bitterness is gone, 1,5 better for B. The time came back into the recipe's window, 2:00 to 2:30.", en);

  // Five clicks finer and 4 °C cooler: no more « un peu ».
  const g = COMPARE.facts(cup({ grind_dial: "1.5.0", temperature_c: 94 }), cup({ grind_dial: "1.4.0", temperature_c: 90 }), recipeOf);
  check("five clicks finer, four degrees cooler, said plainly",
    COMPARE.settingsWords(g).map(w => w.key).join() === "cmp_finer,cmp_cooler" && g.grind.clicks === -5);

  // The same settings: the gap comes from elsewhere.
  const same = COMPARE.verdict(COMPARE.facts(cup({ score_10: 6 }), cup({ score_10: 8 }), recipeOf), t, fmt);
  check("same settings, a better score: said as it is", same === "Mêmes réglages : 2 de mieux pour B.", same);

  // Nothing to tell them apart.
  const blank = COMPARE.verdict(COMPARE.facts(cup({ score_10: "" }), cup({ grind_dial: "1.5.2", score_10: "" }), recipeOf), t, fmt);
  check("no score, no diagnosis: the verdict says so", blank === "Un peu plus gros : rien dans la note ni le diagnostic ne les départage.", blank);

  // Two brewers: the context comes first, the settings are not compared one to one.
  const two = COMPARE.verdict(COMPARE.facts(cup({ score_10: 7 }),
    cup({ method: "Brikka", recipe: "Brikka classique (eau préchauffée)", temperature_c: "", heat_level: 3, score_10: 8 }), recipeOf), t, fmt);
  check("two brewers: the context first, then the outcome", two.startsWith("Deux machines différentes") && two.includes("1 de mieux pour B"), two);

  // Two coffees.
  const coffees = COMPARE.verdict(COMPARE.facts(cup({}), cup({ coffee_id: "c2" }), recipeOf), t, fmt);
  check("two coffees: said before anything else", coffees.startsWith("Deux cafés différents"), coffees);

  // The Brikka reads its drawdown against the recipe.
  const brikka = o => cup({ method: "Brikka", recipe: "Brikka classique (eau préchauffée)", temperature_c: "", heat_level: 3, total_time_s: 240, ...o });
  const flow = COMPARE.facts(brikka({ flow_time_s: 6, diagnostic: "Sur-extrait (amer)", score_10: 6 }), brikka({ flow_time_s: 30, heat_level: 2, score_10: 8 }), recipeOf);
  const fv = COMPARE.verdict(flow, t, fmt);
  check("Brikka: a gentler flame, the drawdown back in its window",
    fv === "Un feu plus doux : l'amertume de A a disparu, 2 de mieux pour B. L'écoulement est revenu dans la fenêtre de la recette, 0:20 à 0:45.", fv);
  check("the Brikka compares no water temperature", flow.temp === null && flow.heat.delta === -1);

  // A defect that came, a worse score, an older bag.
  const worse = COMPARE.facts(cup({ score_10: 8 }, { days_open: 3 }), cup({ diagnostic: "Un peu acide", score_10: 6, grind_dial: "1.5.2" }, { days_open: 15 }), recipeOf);
  const wv = COMPARE.verdict(worse, t, fmt);
  check("B turned sour, 2 lower, and its bag was 12 days older",
    wv === "Un peu plus gros : B est devenue acide, 2 de moins pour B. Le sachet avait 12 jours de plus pour B : la fraîcheur compte aussi.", wv);

  // A wider ratio, more coffee, stirring.
  const ratio = COMPARE.facts(cup({ water_g: 225 }), cup({ water_g: 250, stir_count: 2 }), recipeOf);
  check("a ratio that moved is named before the dose, and the stirring",
    COMPARE.settingsWords(ratio).map(w => w.key).join() === "cmp_wider,cmp_more_stir");
  const dose = COMPARE.facts(cup({ dose_g: 15, water_g: 225 }), cup({ dose_g: 16, water_g: 240 }), recipeOf);
  check("more coffee at the same ratio is « plus de café »", COMPARE.settingsWords(dose).map(w => w.key).join() === "cmp_more_coffee");

  /* EVERY KEY THE RULES CAN SAY exists in both languages: a missing one
     would print its own name in the middle of the sentence. */
  const keys = new Set([...read("js/compare.js").matchAll(/"(cmp_[a-z_]+)"/g)].map(m => m[1]).filter(k => !k.endsWith("_")));
  COMPARE.DEFECT_ORDER.forEach(k => ["cmp_gone_", "cmp_eased_", "cmp_came_"].forEach(p => keys.add(p + k)));
  ["short", "long"].forEach(s => ["", "_flow"].forEach(fl => { keys.add("cmp_time_out_" + s + fl); keys.add("cmp_time_still_" + s + fl); }));
  keys.add("cmp_time_back_flow");
  ["cmp_coarser", "cmp_finer", "cmp_hotter", "cmp_cooler"].forEach(k => keys.add(k + "_little"));
  const missing = [...keys].filter(k => !(I18N_FR[k] && I18N_FR[k].fr) || I18N_EN.T[k] === undefined);
  check("every sentence key of the rules exists in French and in English", missing.length === 0, missing.join(", "));
  const uiKeys = new Set([...["js/ui-compare.js", "js/ui-table.js", "js/ui-scenes.js"].map(read).join("\n")
    .matchAll(/"((?:cmp|tbl|scene)_[a-z_]+)"/g)].map(m => m[1]));
  COMPARE.DEFECT_ORDER.forEach(k => uiKeys.add("cmp_axis_" + k));
  ["date", "coffee", "method", "recipe", "grind", "dose", "ratio", "water", "time", "flow", "volume", "tastes", "comment", "days", "cost", "score", "actions"]
    .forEach(k => uiKeys.add("tbl_col_" + k));
  const missingUi = [...uiKeys].filter(k => !k.endsWith("_") && (!(I18N_FR[k] && I18N_FR[k].fr) || I18N_EN.T[k] === undefined));
  check("every key of the page, the table and the scenes exists in both languages", missingUi.length === 0, missingUi.join(", "));
}

/* ---------- The UI modules, in a scope of their own ---------- */
// A UI holding only what the three modules borrow at load time.
const UI = {
  $: () => null, $$: () => [], titleAttr: s => TOOLS.escapeHtml(s || ""), displayedDiags: s => String(s || "").split("|").join(", "),
  isFailed: e => Number(e.failed) === 1, extsWithCalcs: () => [], fmtDateTime: s => String(s), fmtDuration: s => (s === "" ? "" : fmt.duration(s)),
  fmtDecimal: (n, d) => String(Number(n.toFixed(d))).replace(".", ","), fmtVND: n => n + " ₫", findRecipe: recipeOf, toast() {},
  sortState: { column: "date_time", dir: -1 },
};
const I18N = { t, tr: x => x, tag: x => x, diag: x => x, group: x => x, locale: () => "fr" };
new Function("UI", "TOOLS", "GRIND", "COMPARE", "I18N", "DESCRIPTOR_GROUPS", "localStorage", "document", "window",
  ["js/ui-table.js", "js/ui-compare.js", "js/ui-scenes.js"].map(read).join("\n"))(
  UI, TOOLS, GRIND, COMPARE, I18N, DESCRIPTOR_GROUPS, { getItem: () => null, setItem() {} }, {}, {});

/* ---------- O5 + P2: the columns the table keeps ---------- */
{
  const defaults = UI.columnsFrom(null);
  check("the table opens on the mockup's nine columns, the date first",
    defaults.join() === "date,coffee,recipe,grind,dose,ratio,time,tastes,score", defaults.join());
  check("a saved choice is kept, in the table's order", UI.columnsFrom('["score","water","coffee"]').join() === "date,coffee,water,score");
  check("the date cannot be hidden, unknown keys are dropped", UI.columnsFrom('["nope"]').join() === "date");
  check("an unreadable choice falls back on the defaults", UI.columnsFrom("{").join() === defaults.join());
  check("every column has its cell and its label", UI.TABLE_COLUMNS.every(c => I18N_FR["tbl_col_" + c.key]));
  check("the columns of figures carry a width, the words share the rest",
    UI.TABLE_COLUMNS.filter(c => c.num).every(c => c.w > 0) && UI.TABLE_COLUMNS.filter(c => c.text).every(c => !c.w));
  check("« un clic », « deux clics », « 12 clics »", UI.clicksText(1) === "un clic" && UI.clicksText(-2) === "deux clics" && UI.clicksText(12) === "12 clics");
}

/* ---------- O5: the rows of the page ---------- */
{
  const a = cup({ grind_dial: "1.4.4", temperature_c: 90, total_time_s: 168, diagnostic: "Un peu amer", score_10: 7 }, { coffee_name: "Là Việt" });
  const b = cup({ grind_dial: "1.5.0", temperature_c: 92, total_time_s: 144, descriptors: "caramel|rond", score_10: 8.5 }, { coffee_name: "Là Việt" });
  const f = COMPARE.facts(a, b, recipeOf);
  const rows = UI.compareRows(a, b, f);
  const row = k => rows.find(r => r.key === k) || {};
  check("the grind row: from, to, and what it means", row("grind").a === "1.4.4" && row("grind").b === "1.5.0" && row("grind").note === "un clic plus gros, +8 µm", row("grind").note);
  check("the time row says it came back into the window", row("time").note === "revenu dans la fenêtre");
  check("the score row carries the gap", row("score").note === "+1,5" && row("score").changed);
  check("an unchanged row is not highlighted", row("coffee").changed === false && row("dose").changed === false);
  const axes = UI.tasteAxes(a, b);
  check("the tastes drawing: six families, plus the defect of A", axes.length === 7 && axes[6].label === "amer" && axes[6].a === 0.5 && axes[6].b === 0);
  const sweet = axes.find(x => x.label === "Sucré"), body = axes.find(x => x.label === "Corps");
  check("one taste of a family reaches half way", sweet.b === 0.5 && body.b === 0.5 && sweet.a === 0);
}

/* ---------- Q3: which figures roll, and where they sit ---------- */
{
  const before = new Map(), waiting = new Map();
  const e = { id: "e1", method: "Switch", dose_g: 15, water_g: 225, grind_dial: "1.4.4", temperature_c: 90, score_10: 7, total_time_s: 168, comment: "x" };
  UI.noteEdits([e], before, waiting, 1);
  check("a cup seen for the first time is not an edit", before.has("e1") && waiting.size === 0);
  UI.noteEdits([{ ...e, comment: "y", failed: 1 }], before, waiting, 2);
  check("a change of words only (comment, failed) rolls nothing", waiting.size === 0);
  UI.noteEdits([{ ...e, grind_dial: "1.5.0", score_10: 8.5 }], before, waiting, 3);
  check("a corrected figure waits to be seen, with its old values", waiting.get("e1").before.grind_dial === "1.4.4" && waiting.get("e1").after.score_10 === "8.5");
  UI.noteEdits([{ ...e, grind_dial: "1.5.0", score_10: 9 }], before, waiting, 4);
  check("corrected twice before being seen, it rolls from what was shown first", waiting.get("e1").before.score_10 === "7" && waiting.get("e1").after.score_10 === "9");
  UI.noteEdits([{ ...e }], before, waiting, 5);
  check("corrected back to where it was: nothing left to roll", !waiting.has("e1"));
  UI.noteEdits([{ ...e, id: "e2" }], before, waiting, 6);
  check("a cup that leaves is forgotten, a new one is not an edit", !before.has("e1") && before.has("e2") && waiting.size === 0);

  const fp = { decimal: n => String(n).replace(".", ","), duration: fmt.duration, heat: n => "feu " + n + " / 10" };
  const pairs = UI.figurePairs(
    { method: "Switch", dose_g: "15", water_g: "225", grind_dial: "1.4.4", temperature_c: "90", heat_level: "", total_time_s: "168", flow_time_s: "", yield_ml: "", score_10: "7" },
    { method: "Switch", dose_g: "16", water_g: "225", grind_dial: "1.5.0", temperature_c: "92", heat_level: "", total_time_s: "144", flow_time_s: "", yield_ml: "", score_10: "8.5" }, fp);
  const to = pairs.map(p => p.kind + ":" + p.to).join(" ");
  check("the pairs: dial, microns, degrees, time, ratio, dose, score (comma and point)",
    to === "token:1.5.0 token:624 µm token:92 °C token:2:24 token:1:14.1 dose:16 score:8,5 score:8.5", to);
  const find = (text, list) => UI.findFigures(text, list).map(h => text.slice(h.start, h.end) + "<" + h.from).join(" ");
  check("a dial is found on its own, not inside a longer one", find("1.5.0 · 1.5.00 · 11.5.0", [{ kind: "token", from: "1.4.4", to: "1.5.0" }]) === "1.5.0<1.4.4");
  check("a time is not found inside an hour", find("09:44 · 2:24", [{ kind: "token", from: "2:48", to: "2:24" }]) === "2:24<2:48" &&
    find("12:24", [{ kind: "token", from: "2:48", to: "2:24" }]) === "");
  check("a ratio is not found inside a longer ratio", find("1:15.0 · 1:15", [{ kind: "token", from: "1:14", to: "1:15" }]) === "1:15<1:14");
  check("dose and water in their arrow pair, each on its own",
    find("16 → 225 g", [{ kind: "dose", from: "15", to: "16" }]) === "16<15" && find("16 → 240 g", [{ kind: "water", from: "225", to: "240" }]) === "240<225");
  check("a score only when it is the whole text (or « / 10 »)",
    find(" 8,5 ", [{ kind: "score", from: "7", to: "8,5" }]) === "8,5<7" && find("8,5 / 10", [{ kind: "score", from: "7", to: "8,5" }]) === "8,5<7" &&
    find("8,5 de mieux", [{ kind: "score", from: "7", to: "8,5" }]) === "");
  check("two figures in one text, no overlap",
    find("1.5.0 (624 µm)", [{ kind: "token", from: "1.4.4", to: "1.5.0" }, { kind: "token", from: "616 µm", to: "624 µm" }]) === "1.5.0<1.4.4 624 µm<616 µm");
}

/* ---------- The wiring stays where it belongs ---------- */
{
  const core = read("js/ui-core.js"), history = read("js/ui-history.js"), html = read("index.html");
  check("Q5: every deletion goes through the scene when it is loaded", /async function deleteExtractionWithUndo\(ext, row\) \{\s*if \(UI\.discardCup\) return UI\.discardCup\(ext, row\);/.test(core));
  check("the history hands the clicked row to the deletion", history.includes("await deleteExtractionWithUndo(ext, row);"));
  check("the cup actions are ONE list, open to one more entry", /const CUP_ACTIONS = \[/.test(history) && history.includes("CUP_ACTIONS.map(") && /CUP_ACTIONS,/.test(history));
  /* The hooks of the other groups (merged with v9.18 and v9.19). */
  check("« Partager » is one entry of the cup actions, run by the list and named so that ui-share.js's own listener stays silent",
    /action: "partager"[\s\S]{0,200}run: ext => UI\.shareCup\(ext\)/.test(history) && !/action: "share"/.test(history) &&
    read("js/ui-share.js").includes("[data-action='share']"));
  check("J and K walk the table's rows", read("js/ui-shortcuts.js").includes('["history", "#h-grid", "tr.row-hist"]'));
  const sheet = read("js/ui-coffee-sheet.js");
  check("the coffee sheet's latest cups carry their id, for the edit roll", sheet.includes("'<li data-id=\"' + escapeHtml(e.id) + '\">"));
  check("a deleted bag goes to the grounds bin", /UI\.discardScene\(b\.closest\("\.sh-bag"\) \|\| b\);\s*await DATA\.deletePurchase\(a\.id\);/.test(sheet));
  check("the old comparison window is gone, the page replaces it", !html.includes('id="modal-comparison"') && html.includes('id="h-compare"'));
  check("the table is a third view, next to by bag and by date", /data-view="bag"[\s\S]{0,200}data-view="date"[\s\S]{0,200}data-view="table"/.test(html));
  check("the journal sheet comes right after finishing.css", html.indexOf('href="css/journal.css') > html.indexOf('href="css/finishing.css'));
  const css = read("css/journal.css");
  const tiny = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem in the journal sheet", tiny.length === 0, tiny.map(m => m[0]).join(", "));
  check("every movement of the sheet has its calm path", css.includes("@media (prefers-reduced-motion: reduce)") &&
    ["cmp-in", "cmp-diff-in", "cmp-trace", "edit-copper", "undo-ring", "bin-rise", "gt-slide"].every(k => css.includes("@keyframes " + k)) &&
    /prefers-reduced-motion: reduce\)[\s\S]*\.undo-ring circle \{ animation: none; \}/.test(css) &&
    /prefers-reduced-motion: reduce\)[\s\S]*\.cmp-page\.entering/.test(css));
  check("no green in the journal sheet", !/green/i.test(css));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
