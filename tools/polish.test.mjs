/* Tests of the POLISH group (v9.25): five retouches asked from two
 * screenshots of the live site.
 *
 *   node tools/polish.test.mjs
 *
 *   1. the home's two columns run on their own (the week at the top of the
 *      side column, the column sticky; its « Ton mois » card left in v9.41);
 *   2. the entry no longer offers a coffee whose bag is spent first;
 *   3. « Mes cafés » in columns on a wide screen, the finished ones folded;
 *   4. the Analyses tiles each at their own height (a masonry of the grid);
 *   5. the journal's filters, tidy.
 *
 * The pure parts run here on the real code (js/bags.js, js/milestones.js,
 * js/ui-home.js, js/ui-analytics.js) with a stub of the interface core; the
 * rest reads the page, the sheets and the dictionaries for what the work
 * promised. boot.test.mjs runs the screens for real. */

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

/* ---------- The real layers, and a stub of the core ---------- */

const layers = ["js/legacy-names.js", "js/tools.js", "js/grind.js", "js/recipes.js", "js/tuning.js", "js/bags.js", "js/milestones.js",
  "js/i18n.fr.js", "js/i18n.fr2.js", "js/i18n.js"].map(read).join("\n");
const fakeStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { TOOLS, TUNING, I18N, BAGS, MILESTONES } = new Function("localStorage", "document",
  layers + "\nreturn { TOOLS, TUNING, I18N, BAGS, MILESTONES };")(fakeStorage, { createElement: () => ({}) });

const DATA = { state: { coffees: [], extractions: [], purchases: [] } };
const UI = {
  $: () => null, $$: () => [], titleAttr: s => TOOLS.escapeHtml(s || ""), localDateKey: TOOLS.localDateKey,
  fmtDecimal: (n, dec) => Number(n.toFixed(dec)).toLocaleString("fr-FR", { maximumFractionDigits: dec }),
  average: TOOLS.average, nav: { screenName: "dashboard" }, extsWithCalcs: () => [], analyzableExts: () => [],
  animateCounter() {}, fallbacks: { dose: 15 },
};
const fakeDocument = { visibilityState: "visible", querySelector: () => null, addEventListener() {} };
for (const f of ["js/ui-home.js", "js/ui-analytics.js"]) {
  new Function("UI", "DATA", "TOOLS", "I18N", "TUNING", "MILESTONES", "CHARTS", "document", "window", "localStorage", read(f))(
    UI, DATA, TOOLS, I18N, TUNING, MILESTONES, {}, fakeDocument, { addEventListener() {} }, fakeStorage);
}

let seq = 0;
const cup = (day, o) => ({ id: "x" + (++seq), date_time: day + "T" + ((o && o.time) || "08:30"), coffee_id: "c1", method: "Switch",
  recipe: "", dose_g: 15, water_g: 250, score_10: "", ...o });
const before = (from, k) => { const d = new Date(from); d.setDate(d.getDate() - k); return TOOLS.localDateKey(d); };

const html = read("index.html");
const homeCss = read("css/home.css"), stockCss = read("css/stock.css"), journalCss = read("css/journal.css");

/* ---------- 1. The home: two columns that run on their own ---------- */
{
  const side = html.slice(html.indexOf('<aside class="home-side"'), html.indexOf("</aside>"));
  check("the side column holds the matrix, then the bags; the week left the home (v9.45)", side.includes('id="home-matrix"') &&
    side.indexOf('id="home-matrix"') < side.indexOf('id="home-stock"') && !html.includes('id="home-week"'));
  check("v9.41: the month card left the home, Analyses keeps the month", !html.includes('id="home-month"') && !/home-month|hm-bars|hm-ring/.test(homeCss) && html.includes('id="tile-month"'));
  const layout = html.slice(html.indexOf('<div class="home-layout">'), html.indexOf("</aside>", html.indexOf('<div class="home-layout">')));
  check("the head, the open coffees and the two columns share one grid", ['class="head-page home-head"', 'id="home-open"', 'class="grid-dashboard home-main"',
    'class="home-side" id="home-side"'].every(s => layout.includes(s)));
  check("the open coffees span the page, the side column sits beside the last cup",
    /\.home-layout > \.home-open \{ grid-column: 1 \/ -1; grid-row: 2; \}/.test(homeCss) &&
    /\.home-layout > \.home-side \{ grid-column: 2; grid-row: 3; \}/.test(homeCss));
  check("the open coffees' movements have their calm path", /prefers-reduced-motion[\s\S]*\.home-enter \.ho-pt, \.home-enter \.ho-roll, \.home-enter \.ho-avg \{ animation: none; \}/.test(homeCss));
  check("their cards tilt under the mouse", read("js/ui-feel.js").includes(".ho-card"));
}

/* ---------- 2. The entry: no spent bag first ---------- */
{
  const c = (id, active) => ({ id, name: id, active });
  const g = (grams, dose) => ({ grams, bag: 250, dose: dose || 15, remaining: grams });
  const items = [
    { coffee: c("spent", 1), gauge: g(9) }, { coffee: c("open", 1), gauge: g(120) }, { coffee: c("empty", 1), gauge: g(0) },
    { coffee: c("unknown", 1), gauge: null }, { coffee: c("archived", 0), gauge: g(200) }, { coffee: c("full", 1), gauge: g(240) },
  ];
  const ch = BAGS.entryChoices(items);
  const ids = l => l.map(x => x.id).join(",");
  check("the menu: the coffees with beans first, in their own order", ids(ch.live) === "open,unknown,full", ids(ch.live));
  check("the spent ones set apart, at the end", ids(ch.spent) === "spent,empty", ids(ch.spent));
  check("an archived coffee is in neither", !ids(ch.live).includes("archived") && !ids(ch.spent).includes("archived"));
  const jars = BAGS.entryJars(items.map(it => ({ ...it, day: 1 })), 6);
  check("the jars no longer offer a spent bag", !jars.some(it => it.coffee.id === "spent" || it.coffee.id === "empty"),
    jars.map(it => it.coffee.id).join(","));
  const entry = read("js/ui-entry.js");
  check("the form's menu groups the spent ones under « Sachets finis », each marked",
    entry.includes("entry_spent_group") && entry.includes("entry_spent_suffix") && entry.includes("<optgroup"));
  check("a fresh form takes the first coffee with beans (the spent ones come last)", /return c\.live\.concat\(c\.spent\)/.test(entry));
  check("a bag that ends moves its coffee in the menu without a coffee change", /DATA\.subscribe\(kind => \{ if \(kind !== "sync"\) refreshCoffeeSelect\(\); \}\)/.test(entry));
  check("the quick panel shows the same menu", read("js/ui-quick.js").includes("UI.coffeeOptions()"));
}

/* ---------- 3. Mes cafés ---------- */
/* The two columns of v9.25 were taken back in v9.31 (the rows one under the
   other again): tools/shelf.test.mjs checks the page now. The fold of the
   finished ones stays. */
{
  check("a hidden finished jar is really hidden", /\.cf-done-more\[hidden\], \.cf-jar\[hidden\] \{ display: none; \}/.test(stockCss));
  const cf = read("js/ui-coffees.js");
  check("the finished ones fold to one row, « Voir les N autres »", cf.includes("function fitDone") && cf.includes("cf_done_more") && cf.includes("data-cf-done-more"));
}

/* ---------- 4. The Analyses tiles, each at its own height ---------- */
{
  check("a tile spans its height plus the gap, in rows of 4 px", UI.tileSpan(227, 18) === Math.ceil(245 / 4) && UI.tileSpan(0, 18) === 5);
  check("never less than one row", UI.tileSpan(0, 0) === 1 && UI.tileSpan(-5, 0) === 1);
  check("once packed, the rows stop stretching the tiles", /\.an-tiles\.an-packed \{ grid-auto-rows: 4px; row-gap: 0; align-items: start; \}/.test(homeCss));
  const an = read("js/ui-analytics.js");
  check("packed again whenever a tile changes size", /new ResizeObserver\(\(\) => packTiles\(\)\)/.test(an));
  check("and before the Last positions of an opening are read", /change\(\);\s*\/\/[^\n]*\n\s*packTiles\(\);/.test(an));
}

/* ---------- 5. The journal's filters ---------- */
{
  check("each filter sizes to what it shows", /\.history-filters \.field select, \.history-filters \.field input \{ field-sizing: content; \}/.test(journalCss));
  check("the two dates are one pill", html.includes('<div class="h-dates">') && /\.h-dates \{ display: flex;/.test(journalCss));
  check("folded on a phone, the dates fold with the rest", /#screen-history:not\(\.filters-open\) \.history-filters > \.h-dates \{ display: none; \}/.test(journalCss));
}

/* ---------- The two languages ---------- */
{
  const fr = read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const keys = ["entry_spent_group", "entry_spent_suffix", "cf_done_more", "cf_done_less"];
  const missing = keys.filter(k => !new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(fr) || !new RegExp("^\\s*" + k + ": \"", "m").test(en));
  check("every new text exists in French and in English", missing.length === 0, missing.join(", "));
  check("« Sachets finis », « (sachet fini) »",
    I18N.t("entry_spent_group") === "Sachets finis" && I18N.t("entry_spent_suffix") === "(sachet fini)");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
