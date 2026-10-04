/* Tests of the v9.19 extras, no browser.
 *
 *   node tools/extras.test.mjs
 *
 * H1, the two hand-copied averages now on TOOLS.average: the same results as
 * the old code, empty lists and non-numeric scores included. O3, the winning
 * settings table, « À retenter », « Ce qui gagne partout » and the Guide's
 * « Chez toi »: pure functions of js/tuning.js. O4, the recipe to start with.
 * The keyboard shortcuts: the decision and the help, generated from ONE table.
 * F2, the text a shared cup or recipe sends. And the static rules: the
 * welcome's conditions untouched, every new text in both languages, every
 * new movement still under reduced motion.
 *
 * The site scripts are loaded into ONE shared scope, as the browser does with
 * classic scripts; the interface files get a small stand-in for UI. */

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

/* ---------- Loading ---------- */

const store = new Map();
const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const PURE = ["js/tools.js", "js/i18n.fr.js", "js/i18n.js", "js/grind.js", "js/recipes.js", "js/tuning.js"];
/* The interface files need UI: a stand-in with what they borrow. fmtDecimal
   and fmtDuration are the core's own definitions, copied: they decide the
   text that is shared. */
const UI_STUB = `
const UI = {
  $: () => null, $$: () => [], toast: () => {}, titleAttr: s => TOOLS.escapeHtml(s || ""),
  fmtDecimal: (n, dec) => Number(n.toFixed(dec)).toLocaleString(I18N.locale(), { maximumFractionDigits: dec }),
  fmtDuration: s => { if (s === "" || s === null || s === undefined || isNaN(s)) return ""; const m = Math.floor(s / 60), sec = Math.round(s % 60); return m + ":" + String(sec).padStart(2, "0"); },
  findRecipe: name => STARTER_RECIPES.find(r => r.name === name), fmtShortDate: s => s,
  analyzableExts: () => [], fallbacks: { dial: "1.5.0" }, saveFallbacks: () => {}, setPressed: () => {}, activateScreen: () => {},
  nav: { screenName: "dashboard" },
};
const DATA = { state: { coffees: [], extractions: [], recipes: [] } };
`;
const UI_FILES = ["js/ui-shortcuts.js", "js/ui-share.js", "js/ui-tuning.js"];
const source = PURE.map(read).join("\n") + UI_STUB + UI_FILES.map(read).join("\n");
const document = { querySelector: () => null, addEventListener() {}, body: {}, fonts: null };
const api = new Function("localStorage", "document", "navigator", "location", "window", "matchMedia",
  source + "\nreturn { TOOLS, TUNING, I18N, UI, GRIND, STARTER_RECIPES, COFFEE_RECIPE_MATRIX };")(
  localStorage, document, { userAgent: "node" }, { hash: "" }, {}, undefined);
const { TOOLS, TUNING, I18N, UI, STARTER_RECIPES } = api;

/* ---------- H1: the shared mean, same results ---------- */
{
  check("TOOLS.average gives null on an empty list, never NaN", TOOLS.average([]) === null && TOOLS.average(null) === null);
  check("and the plain mean otherwise", TOOLS.average([7, 8, 9]) === 8);

  // The old hand-written means, kept here as the reference.
  const oldMean = n => n.reduce((s, x) => s + x, 0) / n.length;
  // Random cups, with a few non-numeric scores: NaN must travel the same way.
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cups = Array.from({ length: 160 }, (_, i) => ({
    id: "e" + i, coffee_id: "c" + Math.floor(rand() * 4), method: rand() < 0.5 ? "Brikka" : "Switch",
    recipe: ["Brikka classique", "The Coffee Chronicler's Recipe", "One and Done"][Math.floor(rand() * 3)],
    dose_g: 14 + Math.floor(rand() * 3), grind_dial: ["1.4.0", "1.5.0", "1.6.0"][Math.floor(rand() * 3)],
    heat_level: String(2 + Math.floor(rand() * 3)), preheated_water: rand() < 0.3 ? 1 : "",
    score_10: i % 37 === 0 ? "bof" : Math.round(rand() * 20) / 2, date_time: "2026-09-" + String(1 + (i % 28)).padStart(2, "0") + "T08:" + String(i % 60).padStart(2, "0"),
  }));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // bestLever: the old version, verbatim but for the mean.
  function oldBestLever(list, minPerGroup, minGap) {
    const minN = minPerGroup || 3, minE = minGap || 0.4;
    let best = null;
    for (const lever of TUNING.LEVERS) {
      const groups = new Map();
      list.forEach(e => { const v = lever.value(e); if (v === null) return; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(Number(e.score_10)); });
      const eligible = [...groups.entries()].filter(([, n]) => n.length >= minN);
      if (eligible.length < 2) continue;
      const classes = eligible.map(([v, n]) => ({ value: v, mean: oldMean(n), n: n.length })).sort((a, b) => b.mean - a.mean);
      const rest = eligible.filter(([v]) => v !== classes[0].value).flatMap(([, n]) => n);
      if (!rest.length) continue;
      const gap = classes[0].mean - oldMean(rest);
      if (gap < minE) continue;
      if (!best || gap > best.gap) best = { lever: lever.key, value: classes[0].value, gap, high: classes[0].mean, low: oldMean(rest), n: classes[0].n, nRest: rest.length };
    }
    return best;
  }
  const numeric = cups.filter(e => typeof e.score_10 === "number");
  check("bestLever, on TOOLS.average: the same lever, gap and means as before",
    [[numeric], [numeric, 2, 0.1], [cups, 2, 0.1], [numeric.slice(0, 9)]].every(([l, a, b]) => same(TUNING.bestLever(l, a, b), oldBestLever(l, a, b))));
  check("and the same answer on a batch where nothing stands out", TUNING.bestLever(numeric.slice(0, 2)) === null && oldBestLever(numeric.slice(0, 2)) === null);

  function oldGap(list) {
    const groups = {};
    list.forEach(e => { if (e.score_10 === "" || e.score_10 === undefined) return; const k = e.coffee_id + "|" + e.recipe; (groups[k] = groups[k] || []).push(Number(e.score_10)); });
    let sum = 0, n = 0;
    Object.values(groups).filter(g => g.length >= 2).forEach(g => { const m = oldMean(g); g.forEach(x => { sum += Math.abs(x - m); n += 1; }); });
    return n ? sum / n : null;
  }
  check("gapAtSameCoffee: the same consistency as before", Object.is(TUNING.gapAtSameCoffee(numeric), oldGap(numeric)));
  check("NaN still travels where a score is not a number, as before", Object.is(TUNING.gapAtSameCoffee(cups), oldGap(cups)) && Number.isNaN(oldGap(cups)));
  check("and null with no pair of cups, as before", TUNING.gapAtSameCoffee([]) === null && TUNING.gapAtSameCoffee(numeric.slice(0, 1)) === null);

  function oldRolling(list, w) {
    const n = w || 5;
    const sorted = list.filter(e => e.score_10 !== "" && e.score_10 !== undefined && e.date_time).slice().sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));
    return sorted.map((e, i) => {
      if (i < n - 1) return { date: e.date_time, value: null };
      const f = sorted.slice(i - n + 1, i + 1).map(x => Number(x.score_10));
      return { date: e.date_time, value: Math.round(f.reduce((s, x) => s + x, 0) / n * 100) / 100 };
    });
  }
  check("rollingAverage: the same points as before, NaN included", same(TUNING.rollingAverage(cups, 5), oldRolling(cups, 5)) && same(TUNING.rollingAverage(numeric, 3), oldRolling(numeric, 3)));

  // The four places of H1 no longer write their own mean.
  const handMean = /reduce\(\(\w, \w\) => \w \+ (?:\w|Number\(\w\.ext\.score_10\)), 0\) \/ \w+(?:\.length)?/;
  const tuning = read("js/tuning.js");
  check("tuning.js: bestLever, gapAtSameCoffee and rollingAverage use TOOLS.average",
    !handMean.test(tuning) && /const avg = TOOLS\.average;/.test(tuning) && tuning.includes("const m = TOOLS.average(g);") && tuning.includes("Math.round(TOOLS.average(f) * 100) / 100"));
  const charts = read("js/charts.js");
  const wheel = charts.slice(charts.indexOf("function aromaWheel"), charts.indexOf("function aromaWheel") + 1200);
  check("charts.js: the aroma wheel uses TOOLS.average", wheel.includes("const mean = TOOLS.average;") && !handMean.test(wheel));
  const aside = read("js/ui-entry-aside.js");
  check("ui-entry-aside.js: the twins' average uses TOOLS.average",
    aside.includes("const avg = TOOLS.average(list.map(j => Number(j.ext.score_10)));") && !handMean.test(aside));
}

/* ---------- O3: the winning settings ---------- */
{
  const coffees = [
    { id: "a", name: "Alpha", active: 1 }, { id: "b", name: "Bravo", active: 1 },
    { id: "c", name: "Charlie", active: 0 }, { id: "d", name: "Delta", active: 1 },
  ];
  let n = 0;
  const cup = (coffee, score, o) => ({
    id: "x" + (++n), coffee_id: coffee, score_10: score, recipe: "R1", grind_dial: "1.5.0", heat_level: "", preheated_water: "",
    method: "Switch", temperature_c: 92, dose_g: 15, water_g: 240, date_time: "2026-09-" + String(n).padStart(2, "0") + "T08:00", ...(o || {}),
  });
  const exts = [
    cup("a", 8.5), cup("a", 9), cup("a", 9),                        // Alpha: proven at 8.83
    cup("b", 8.5), cup("b", 8.5), cup("b", 8.5), cup("b", 9, { recipe: "R2" }), // Bravo: proven at 8.5, one 9 on R2 never redone
    cup("c", 6), cup("c", 6), cup("c", 6),                          // Charlie: inactive, proven 6
    cup("d", 8.5, { recipe: "R3" }), cup("d", 6, { recipe: "R1" }),   // Delta: two cups, nothing proven
  ];
  const { rows, pending } = TUNING.winningRows(coffees, exts);
  check("one row per coffee whose best setting is proven", rows.map(r => r.coffee.id).join() === "a,b,c", rows.map(r => r.coffee.id).join());
  check("sorted by score, the coffees in use before the finished ones", rows[0].best.average > rows[1].best.average && rows[2].coffee.active === 0);
  check("each row carries its reference cup, the one « Refaire » copies", rows[0].ref && rows[0].ref.score_10 === 9 && rows[0].ref.id === rows[0].best.referenceId);
  check("the coffees on their way apart, with their reason", pending.length === 1 && pending[0].coffee.id === "d" && pending[0].reason === "not_enough");

  const retry = TUNING.toRetry(coffees, exts);
  check("À retenter: a high cup never made again", retry.some(x => x.ext.recipe === "R2" && x.coffee.id === "b"));
  check("and a high cup alone on its coffee", retry.some(x => x.coffee.id === "d" && x.score === 8.5));
  check("not a cup whose setting was remade", !retry.some(x => x.coffee.id === "a"));
  check("the best first", retry[0].score === 9);
  check("not under the proven best of its coffee",
    TUNING.toRetry(coffees, exts.concat([cup("a", 8.6, { recipe: "R9" })])).every(x => x.ext.recipe !== "R9"));
  check("not on a finished coffee", TUNING.toRetry(coffees, exts.concat([cup("c", 9.5, { recipe: "R9" })])).every(x => x.coffee.id !== "c"));
  check("three at most", TUNING.toRetry(coffees, Array.from({ length: 6 }, (_, i) => cup("d", 9, { recipe: "Z" + i }))).length === 3);

  // Ce qui gagne partout: 92 °C lifts both coffees above their own average.
  const safeCups = [];
  ["a", "b"].forEach(c => {
    [92, 92, 92].forEach(t => safeCups.push(cup(c, c === "a" ? 9 : 7, { temperature_c: t })));
    [96, 96, 96].forEach(t => safeCups.push(cup(c, c === "a" ? 8 : 6, { temperature_c: t })));
  });
  const safe = TUNING.safestSettings(safeCups);
  check("what wins everywhere: 92 °C at the Switch", safe.length === 1 && safe[0].method === "Switch" && safe[0].lever === "temperature" && safe[0].value === "92",
    JSON.stringify(safe));
  check("measured against each coffee's own average, not the raw score", Math.abs(safe[0].gap - 0.5) < 1e-9 && safe[0].coffees === 2 && safe[0].n === 6);
  check("nothing when the lever never moved", TUNING.safestSettings(safeCups.map(e => ({ ...e, temperature_c: 92 }))).length === 0);
  check("nothing from a single coffee", TUNING.safestSettings(safeCups.filter(e => e.coffee_id === "a")).length === 0);

  // The Guide's « Chez toi ».
  const home = TUNING.recipeHome("R1", exts.concat([cup("a", 9.5, { date_time: "2026-08-01T08:00" })]));
  check("« Chez toi »: the rated cups of the recipe, in date order", home.n === 11 && home.points[0].date === "2026-08-01T08:00" && home.points.every((p, i, a) => !i || a[i - 1].date <= p.date));
  check("their average", Math.abs(home.average - TOOLS.average(home.points.map(p => p.score))) < 1e-12);
  check("the best setting on it, proven by two cups at least", home.best && home.best.coffeeId === "a" && home.best.n === 4 && home.best.temperature === 92);
  check("and nothing on a recipe never made", TUNING.recipeHome("Inconnue", exts).n === 0 && TUNING.recipeHome("Inconnue", exts).best === null);
  check("a recipe made once has no best setting yet", TUNING.recipeHome("R3", exts).best === null && TUNING.recipeHome("R3", exts).n === 1);
}

/* ---------- O4: the recipe to start with ---------- */
{
  const recipes = STARTER_RECIPES.map(r => ({ ...r, active: 1 }));
  const both = { Brikka: true, Switch: true };
  const washed = { name: "X", process: "Lavé", roast: "Medium" };
  const s1 = TUNING.starterRecipe(washed, both, recipes);
  check("a washed medium starts on the table's recipe, the Chronicler at 92 °C",
    s1 && s1.recipe.id === "chronicler" && s1.temp === "92 °C" && s1.fromTable);
  const s2 = TUNING.starterRecipe(washed, { Brikka: true, Switch: false }, recipes);
  check("without a Switch, the Brikka's everyday recipe", s2 && s2.recipe.method === "Brikka" && s2.recipe.id === "brikka-classique");
  const s3 = TUNING.starterRecipe({ name: "Y", process: "Rang bơ", species: "Robusta", roast: "Foncée" }, both, recipes);
  check("a rang bơ goes to the Brikka, as the table says", s3 && s3.recipe.id === "brikka-classique" && s3.fromTable);
  const s4 = TUNING.starterRecipe({ name: "Y", process: "Rang bơ", species: "Robusta", roast: "Foncée" }, { Brikka: false, Switch: true }, recipes);
  check("the same with only a Switch: the Switch's everyday recipe", s4 && s4.recipe.method === "Switch" && !s4.fromTable);
  const s5 = TUNING.starterRecipe({ name: "Z" }, both, recipes);
  check("an unknown profile still gets a recipe", s5 && s5.recipe.id === "chronicler" && !s5.fromTable);
  const s6 = TUNING.starterRecipe({ name: "N", process: "Natural", roast: "Medium" }, both, recipes);
  check("a natural medium: the cell's recipe and its degrees", s6 && s6.recipe.id === "chronicler" && /90 à 92/.test(s6.temp));
}

/* ---------- The keyboard shortcuts ---------- */
{
  const key = (k, o) => ({ key: k, ...(o || {}) });
  const ctx = o => ({ typing: false, modal: false, panelOpen: false, chord: false, screen: "dashboard", onRow: false, ...(o || {}) });
  const has = sel => sel === "#screen-analytics" || sel === "#screen-coffees";
  check("G N and G C do not exist while their screens do not",
    UI.shortcutFor(key("n"), ctx({ chord: true })) === "chord-cancel" && UI.shortcutFor(key("c"), ctx({ chord: true })) === "chord-cancel");
  check("G N goes to Analyses and G C to Mes cafés once they exist",
    UI.shortcutFor(key("n"), ctx({ chord: true, has })) === "go:analytics" && UI.shortcutFor(key("c"), ctx({ chord: true, has })) === "go:coffees");
  check("the chords of before have not moved",
    ["a", "h", "j", "t", "g", "p"].map(k => UI.shortcutFor(key(k), ctx({ chord: true, has }))).join() ===
      "go:dashboard,go:history,go:journal,go:tuning,go:guide,go:settings");
  check("the letters come from the table", ["n", "r", "e", "c"].map(k => UI.shortcutFor(key(k), ctx())).join() === "new,redo,edit,compare");
  check("the brew mode: Space starts or pauses, → moves to the next step",
    UI.shortcutFor(key(" "), ctx({ brew: true, modal: true })) === "brew-go" && UI.shortcutFor(key("ArrowRight"), ctx({ brew: true, modal: true })) === "brew-next");
  check("and nothing else there, nor while typing", UI.shortcutFor(key("n"), ctx({ brew: true, modal: true })) === null &&
    UI.shortcutFor(key(" "), ctx({ brew: true, typing: true })) === null && UI.shortcutFor(key(" "), ctx({ modal: true })) === null);

  // The help is generated from the table: every key, grouped, each label in French.
  const html = UI.shortcutsHelpHtml();
  const groups = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  check("the help has its five groups", groups.join("|") === "Aller à|Actions|Les tasses|Saisie|Mode Brassage", groups.join("|"));
  const rows = (html.match(/<dt>/g) || []).length;
  check("one line per available key of the table", rows === UI.SHORTCUTS.filter(s => !s.needs).length, rows + " lines");
  check("a chord reads « G puis A »", html.includes("<kbd>G</kbd> <span class=\"kp-then\">puis</span> <kbd>A</kbd>"));
  check("a named key in words", html.includes("<kbd>Échap</kbd>") && html.includes("<kbd>Espace</kbd>"));
  const fr = read("js/i18n.fr.js"), en = read("js/i18n.en.js");
  const bilingual = k => new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(fr) && new RegExp("^\\s*" + k + ": ", "m").test(en.slice(0, en.indexOf("\n  UI: {")));
  const labels = UI.SHORTCUTS.filter(s => s.label).map(s => s.label)
    .concat(UI.SHORTCUTS.filter(s => s.screen).map(s => "keys_go_" + s.screen))
    .concat(["keys_group_go", "keys_group_actions", "keys_group_cups", "keys_group_entry", "keys_group_brew", "keys_hint", "keys_hint_close", "keys_then",
      "key_escape", "key_enter", "key_space", "key_page_up", "key_page_down", "key_home", "key_end", "keys_label_history"]);
  const missing = [...new Set(labels)].filter(k => !bilingual(k));
  check("every key of the help is written in French and in English", missing.length === 0, missing.join(", "));
  const html2 = read("index.html");
  check("the rail has its keyboard button, which toggles the help natively",
    /<button[^>]*id="btn-keys"[^>]*popovertarget="modal-shortcuts"/.test(html2) && html2.includes('id="modal-shortcuts" class="keys-help keys-pop" popover'));
  check("the help in the page is a box filled by the code, not a hand-written list",
    html2.includes('<div class="keys-grid" id="keys-grid"></div>') && !html2.includes("<dt>Chercher et agir</dt>"));
  const sc = read("js/ui-shortcuts.js");
  check("the hint is stored once on this device, and gone after the first shortcut", sc.includes('const HINT_KEY = "keys-hint-done"') &&
    /function run\(action\) \{\n    markShortcutsKnown\(\);/.test(sc));
}

/* ---------- F2: what a shared cup or recipe says ---------- */
{
  const chronicler = STARTER_RECIPES.find(r => r.id === "chronicler");
  const ext = { method: "Switch", recipe: chronicler.name, dose_g: 15, water_g: 225, temperature_c: 92, grind_dial: "1.5.0",
    total_time_s: 144, descriptors: "caramel|rond", score_10: 8.5, date_time: "2026-09-26T08:00" };
  const text = UI.cupShareText(ext, "Là Việt Balanced", chronicler);
  const lines = text.split("\n");
  check("the first line: the coffee and the recipe", lines[0] === "Là Việt Balanced · The Coffee Chronicler's Recipe", lines[0]);
  check("then dose, water, degrees, grind and time", lines[1] === "15 g / 225 g · 92 °C · molette 1.5.0 · 2:24", lines[1]);
  check("then the steps, scaled to the water really poured", lines[2] === "Étapes :" && lines.some(l => /^0:45 Compléter à 225 g/.test(l)), lines.slice(2, 6).join(" | "));
  check("the tastes and the score", lines.includes("Goûts : caramel, rond · 8,5/10"));
  check("and the logbook's name to close", lines[lines.length - 1] === "Carnet d'extraction");
  const brikka = UI.cupShareText({ method: "Brikka", recipe: "Brikka classique", dose_g: 14, water_g: 150, heat_level: 3, preheated_water: 1,
    grind_dial: "", score_10: "", descriptors: "" }, "Bana Cofe G4", STARTER_RECIPES.find(r => r.id === "brikka-classique"));
  check("a Brikka cup says its heat and its preheated water, no degrees", brikka.split("\n")[1] === "14 g / 150 g · feu 3 · eau préchauffée", brikka.split("\n")[1]);
  check("an unrated cup says no score", !/\/10/.test(brikka));
  const recipe = UI.recipeShareText(chronicler);
  check("a recipe: its name and its machine, its settings, its steps, who it is for",
    recipe.startsWith("The Coffee Chronicler's Recipe · Switch\n15 g / 240 g · 92 °C · molette 1.5.0 · total 2:45 à 3:15\nÉtapes :\n0:00 ") &&
    recipe.includes("Pour qui : ") && recipe.endsWith("Carnet d'extraction"), recipe.split("\n").slice(0, 3).join(" | "));
  const share = read("js/ui-share.js");
  check("the image goes with the text when the browser can send a file, the text alone otherwise, the clipboard last",
    /canSendFiles\(share\.file\)\) await navigator\.share\(\{ \.\.\.data, files: \[share\.file\] \}\)/.test(share) &&
    share.includes("else if (navigator.share) await navigator.share(data);") && share.includes("await navigator.clipboard.writeText(share.text);"));
  check("closing the share sheet is not an error", share.includes('if (e && e.name === "AbortError") return;'));
  check("Ctrl K offers to share the last cup", read("js/ui-palette.js").includes('name: I18N.t("palette_share")') && read("js/ui-palette.js").includes("run: () => UI.shareCup(latest[0])"));
}

/* ---------- O4: the conditions of the first opening did not move ---------- */
{
  const app = read("js/app.js");
  check("after the sync when there is one, the welcome only if nothing came",
    app.includes("if (DATA.syncPossible()) DATA.synchronize(false).then(() => UI.welcomeAfterStart(true));") &&
    app.includes("else UI.welcomeAfterStart(!hasData);"));
  const w = read("js/ui-welcome.js");
  check("and it still checks there is no coffee and no cup", w.includes("if (!mayShow || DATA.state.coffees.length || DATA.state.extractions.length) return;"));
  check("seen again on purpose over real cups, the demo button goes", w.includes('$("#welcome-demo").hidden = DATA.state.extractions.length > 0;'));
  check("the first coffee opens the entry by the same path as « Brasser ce café »",
    /sel\.value = coffee\.id;\n    if \(sel\.value === coffee\.id\) UI\.onCoffeeChoice\(\);\n    activateScreen\("entry"\);/.test(w));
  check("the dial chosen goes to the settings (« Mon moulin »)", w.includes("fallbacks.dial = v;") && w.includes("saveFallbacks();"));
}

/* ---------- The texts, the styles ---------- */
{
  const fr = read("js/i18n.fr.js"), en = read("js/i18n.en.js");
  const block = fr.slice(fr.indexOf("// extras (v9.19)"));
  const keys = [...block.matchAll(/^ {4}([a-z_0-9]+): \{ fr:/gm)].map(m => m[1]);
  const enT = en.slice(0, en.indexOf("\n  UI: {"));
  const lost = keys.filter(k => !new RegExp("^ {4}" + k + ": \"", "m").test(enT));
  check("every new text has its English half", keys.length > 100 && lost.length === 0, lost.join(", "));
  const enBundle = new Function("return " + en.slice(en.indexOf("{"), en.lastIndexOf("}") + 1))();
  const html = read("index.html").replace(/<!--[\s\S]*?-->/g, "");
  const welcome = html.slice(html.indexOf('<dialog id="modal-welcome"'), html.indexOf("</dialog>", html.indexOf('<dialog id="modal-welcome"')));
  const share = html.slice(html.indexOf('<dialog id="modal-share"'), html.indexOf("</dialog>", html.indexOf('<dialog id="modal-share"')));
  const texts = [...(welcome + share).matchAll(/>([^<>]*[A-Za-zÀ-ÿ][^<>]*)</g)].map(m => m[1].trim())
    .filter(t => t && !/^(Brikka|Bialetti|Hario|0\.0\.2)$/.test(t));
  const untranslated = [...new Set(texts)].filter(t => !enBundle.UI[t]);
  check("every static text of the welcome and the share window is in the dictionary", untranslated.length === 0, untranslated.join(" | "));

  const css = read("css/extras.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const small = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem", small.length === 0, small.map(m => m[0]).join(", "));
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const animated = [...css.matchAll(/^([^{}@\n][^{}]*)\{[^}]*\banimation:\s*(?!none)[a-z]/gm)].map(m => m[1].trim());
  const loose = animated.filter(sel => !sel.split(",").every(s => reduced.includes(s.trim())));
  check("every new movement stops under reduced motion", reduced.length > 100 && loose.length === 0, loose.join(" | "));
  const isGreen = hex => {
    const [r, g, b] = [0, 2, 4].map(k => parseInt(hex.slice(k, k + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, L = (mx + mn) / 2;
    if (!d) return false;
    const S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h >= 75 && h <= 165 && S > 0.15 && L > 0.15 && L < 0.85;
  };
  const colours = [css, read("js/ui-share.js")].flatMap(s => [...s.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => m[1]));
  check("no green, not even in the shared image", colours.length > 0 && !colours.some(isGreen), colours.filter(isGreen).join(", "));
  check("the extras sheet only uses the site's tokens for colours", ![...css.matchAll(/#[0-9a-f]{3,6}\b/gi)].length);
  // After finishing.css (the other groups' sheets may sit between), with the page's version, and precached.
  const page = read("index.html");
  const version = (page.match(/<meta name="app-version" content="([^"]+)">/) || [])[1];
  const sheetAt = page.indexOf('<link rel="stylesheet" href="css/extras.css?v=' + version + '">');
  check("the sheet is linked after finishing.css, at the page's version, and precached",
    sheetAt > page.indexOf('href="css/finishing.css?v=' + version + '"') && page.indexOf('href="css/finishing.css') > 0 &&
    sheetAt < page.indexOf("</head>") && read("sw.js").includes('"./css/extras.css"'));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
