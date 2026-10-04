/* Tests of the home group (v9.21): N1 the map of the app, L1 the home in
 * three questions, O1 the Analyses page and O6 the month in coffee.
 *
 *   node tools/home.test.mjs
 *
 * The pure parts of js/ui-home.js, js/ui-analytics.js and js/ui-story.js run
 * here on the real tools, i18n and tuning code, with a stub of the interface
 * core: the week, the « À brasser » suggestion, the period and its bars, the
 * ranking, the tastes, the figures, the story of the month. Then the page,
 * the styles and the dictionaries are read for what the work promised: the
 * navigation, the draft dot, the lazy Analyses page, the calm path of every
 * movement, the two languages. boot.test.mjs runs the screens for real. */

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

const layers = ["js/legacy-names.js", "js/tools.js", "js/grind.js", "js/recipes.js", "js/tuning.js", "js/i18n.fr.js", "js/i18n.fr2.js", "js/i18n.js"]
  .map(read).join("\n");
const fakeStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { TOOLS, TUNING, I18N } = new Function("localStorage", "document",
  layers + "\nreturn { TOOLS, TUNING, I18N };")(fakeStorage, { createElement: () => ({}) });

const DATA = { state: { coffees: [], extractions: [], purchases: [] } };
const UI = {
  $: () => null, $$: () => [], titleAttr: s => TOOLS.escapeHtml(s || ""), localDateKey: TOOLS.localDateKey,
  fmtDecimal: (n, dec) => Number(n.toFixed(dec)).toLocaleString("fr-FR", { maximumFractionDigits: dec }),
  average: TOOLS.average, nav: { screenName: "dashboard" }, extsWithCalcs: () => [], analyzableExts: () => [],
  animateCounter() {}, fallbacks: { dose: 15 }, caffeineOf: e => (Number(e.dose_g) || 0) * 10,
};
const fakeDocument = { visibilityState: "visible", querySelector: () => null, addEventListener() {} };
for (const f of ["js/ui-home.js", "js/ui-analytics.js", "js/ui-story.js"]) {
  new Function("UI", "DATA", "TOOLS", "I18N", "TUNING", "CHARTS", "document", "window", "localStorage", read(f))(
    UI, DATA, TOOLS, I18N, TUNING, {}, fakeDocument, { addEventListener() {} }, fakeStorage);
}

// A cup, with what the pure parts read.
let seq = 0;
const cup = (day, o) => ({ id: "x" + (++seq), date_time: day + "T" + ((o && o.time) || "08:30"), coffee_id: "c1", method: "Switch",
  recipe: "", dose_g: 15, water_g: 250, grind_dial: "", temperature_c: "", heat_level: "", preheated_water: "",
  score_10: "", descriptors: "", diagnostic: "", ...o });
// A local date key, k days before `from`.
const before = (from, k) => { const d = new Date(from); d.setDate(d.getDate() - k); return TOOLS.localDateKey(d); };

/* ---------- L1: the week ---------- */
{
  const now = new Date(2026, 9, 4, 10, 0); // Sunday 4 October 2026
  const cups = [
    cup("2026-09-28", { score_10: 7 }), cup("2026-09-28", { score_10: 8, time: "15:00" }),
    cup("2026-10-01", { score_10: 9 }), cup("2026-10-03", { score_10: 9, time: "16:00" }), cup("2026-10-03", {}),
    cup("2026-09-27", { score_10: 10 }), // the Sunday before: not this week
  ];
  const w = UI.weekSummary(cups, cups, now);
  check("the week runs Monday to Sunday", TOOLS.localDateKey(w.start) === "2026-09-28" && TOOLS.localDateKey(w.end) === "2026-10-04");
  check("it counts every cup of the week, the unrated one too", w.cups === 5, String(w.cups));
  check("and averages the rated ones only", w.rated === 4 && Math.abs(w.mean - 8.25) < 1e-9, w.rated + " " + w.mean);
  check("a bar per day, with its cups", w.days.map(d => d.n).join() === "2,0,0,1,0,2,0", w.days.map(d => d.n).join());
  check("the best cup is the latest of the best score", w.best && w.best.score === 9 && w.best.date_time === "2026-10-03T16:00");
  const midweek = UI.weekSummary(cups, cups, new Date(2026, 9, 1, 9));
  check("the days still to come are marked (a Thursday: three)", midweek.days.filter(d => d.future).length === 3);
  check("« hier » and « aujourd'hui » for the best cup", UI.weekDayWord("2026-10-03T16:00", now) === "hier" &&
    UI.weekDayWord("2026-10-04T08:00", now) === "aujourd'hui" && UI.weekDayWord("2026-10-01T08:00", now) === "jeudi");
  const empty = UI.weekSummary([], [], now);
  check("an empty week has no average and no best", empty.cups === 0 && empty.mean === null && empty.best === null);
}

/* ---------- L1: « À brasser, si tu veux » ---------- */
{
  const now = new Date(2026, 9, 4, 10, 0);
  const coffee = (id, name) => ({ id, name });
  const bag = (id, leftover, cups) => ({ coffee: coffee(id, "Café " + id), leftover, cups, bag: 250 });
  const cupsOf = (id, n, from, o) => Array.from({ length: n }, (_, i) => cup(before(now, from + i), { coffee_id: id, score_10: 8, recipe: "Chronicler", grind_dial: "1.5.0", ...o }));
  const recent = [...cupsOf("a", 3, 0), ...cupsOf("b", 3, 0, { score_10: 7 }), ...cupsOf("c", 2, 5)];
  let s = UI.brewSuggestion({ bags: [bag("a", 120, 8), bag("b", 38, 2), bag("c", 0, 0)], exts: recent, analyzable: recent, now });
  check("a bag down to three cups comes first, to finish it while it is good", s && s.coffeeId === "b" && s.reason.key === "brew_reason_low" && s.reason.vars.g === 38,
    JSON.stringify(s && s.reason));
  check("an empty bag is never suggested", UI.brewSuggestion({ bags: [bag("c", 0, 0)], exts: recent, analyzable: recent, now }) === null);
  check("without a bag, nothing", UI.brewSuggestion({ bags: [], exts: [], analyzable: [], now }) === null);
  s = UI.brewSuggestion({ bags: [bag("a", 120, 8), bag("c", 150, 10)], exts: recent, analyzable: recent, now });
  check("then the bag left alone for three days or more", s.coffeeId === "c" && s.reason.key === "brew_reason_idle" && s.reason.vars.n === 5, JSON.stringify(s.reason));
  s = UI.brewSuggestion({ bags: [bag("a", 120, 8), bag("n", 250, 16)], exts: recent, analyzable: recent, now });
  check("a bag never brewed counts as left alone", s.coffeeId === "n" && s.reason.key === "brew_reason_new" && s.refId === null);
  s = UI.brewSuggestion({ bags: [bag("a", 120, 8), bag("b", 160, 10)], exts: recent, analyzable: recent, now });
  check("otherwise the best average", s.coffeeId === "a" && s.reason.key === "brew_reason_best", JSON.stringify(s.reason));
  check("with its winning setting: three cups of the same signature", s.kind === "best" && s.recipe === "Chronicler" && s.grind === "1.5.0" &&
    recent.some(e => e.id === s.refId && e.coffee_id === "a"));
  const scattered = [cup(before(now, 0), { coffee_id: "d", score_10: 8, recipe: "Tetsu 4:6", grind_dial: "1.6.0", method: "Switch", temperature_c: 92 })];
  s = UI.brewSuggestion({ bags: [bag("d", 30, 1)], exts: scattered, analyzable: scattered, now });
  check("without a winning setting, the setting of its latest cup", s.kind === "last" && s.refId === scattered[0].id && s.temperature === 92);
}

/* ---------- L1: which finding first ---------- */
{
  const a = UI.findingStart(5, "2026-10-04"), b = UI.findingStart(5, "2026-10-04");
  const week = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map(k => UI.findingStart(5, k));
  check("the first finding is the same all day", a === b && a >= 0 && a < 5);
  check("and changes from one day to the next", new Set(week).size > 1, week.join());
  check("no finding, no index", UI.findingStart(0, "2026-10-04") === 0);
}

/* ---------- O1: the period ---------- */
{
  const now = new Date(2026, 9, 4, 22, 30);
  check("7 days start six days back, at midnight", TOOLS.localDateKey(UI.periodStart("7", now)) === "2026-09-28" && UI.periodStart("7", now).getHours() === 0);
  check("30 days start 29 days back", TOOLS.localDateKey(UI.periodStart("30", now)) === "2026-09-05");
  check("« Tout » has no start, an unknown period neither", UI.periodStart("all", now) === null && UI.periodStart("12", now) === null);
  const list = [cup("2026-09-27"), cup("2026-09-28"), cup("2026-10-04", { time: "23:50" })];
  check("the period keeps the cups from its first day on", UI.inPeriod(list, UI.periodStart("7", now)).length === 2 && UI.inPeriod(list, null).length === 3);

  const exts = [cup("2026-10-04", { score_10: 8 }), cup("2026-10-04", { score_10: 6 }), cup("2026-10-01"), cup("2026-08-02", { score_10: 9 })];
  const w7 = UI.timeBars(exts, exts, "7", now);
  check("7 days: a bar per day, today last", w7.unit === "day" && w7.bars.length === 7 && w7.bars[6].from === "2026-10-04" && w7.bars[0].from === "2026-09-28");
  check("each bar counts its cups and averages its rated ones", w7.bars[6].n === 2 && w7.bars[6].mean === 7 && w7.bars[3].n === 1 && w7.bars[3].mean === null);
  check("30 days: thirty bars", UI.timeBars(exts, exts, "30", now).bars.length === 30);
  const w90 = UI.timeBars(exts, exts, "90", now);
  check("3 months: thirteen weeks, Monday to Sunday, this one last", w90.unit === "week" && w90.bars.length === 13 &&
    w90.bars[12].from === "2026-09-28" && w90.bars[12].to === "2026-10-04" && w90.bars[12].n === 3);
  const all = UI.timeBars(exts, exts, "all", now);
  check("« Tout »: a bar per month from the first cup", all.unit === "month" && all.bars.length === 3 && all.bars[0].from === "2026-08-01" &&
    all.bars[0].to === "2026-08-31" && all.bars[0].n === 1 && all.bars[2].n === 3, all.bars.map(b => b.from + ":" + b.n).join());
  const old = [cup("2020-01-15")];
  check("never more than three years of months", UI.timeBars(old, old, "all", now).bars.length === 36);
}

/* ---------- O1: coffees, tastes, figures ---------- */
{
  DATA.state.coffees = [{ id: "c1", name: "Bana" }, { id: "c2", name: "Mít" }, { id: "c3", name: "Brazil" }];
  const exts = [
    cup("2026-10-01", { coffee_id: "c1", score_10: 8, method: "Brikka" }), cup("2026-10-02", { coffee_id: "c1", score_10: 9 }),
    cup("2026-10-02", { coffee_id: "c2", score_10: 8.5 }), cup("2026-10-03", { coffee_id: "c2", score_10: 8.5 }), cup("2026-10-03", { coffee_id: "c2" }),
    cup("2026-10-03", { coffee_id: "c3" }),
  ];
  const r = UI.rankCoffees(exts, exts);
  check("coffees by average, the most brewed first on a tie", r.map(c => c.id).join() === "c2,c1" && r[0].n === 3 && r[0].rated === 2, JSON.stringify(r));
  check("a coffee without a rated cup is not ranked", !r.some(c => c.id === "c3"));
  check("each says on which brewer", r.find(c => c.id === "c1").brikka === 1 && r.find(c => c.id === "c1").switch === 1);

  const all = [cup("2026-08-10", { descriptors: "caramel|rond" }), cup("2026-10-01", { descriptors: "caramel|jacquier" }), cup("2026-10-02", { descriptors: "caramel" })];
  const start = new Date(2026, 8, 5);
  const t = UI.tasteCounts(UI.inPeriod(all, start), all, start);
  check("tastes by how often they are ticked", t[0].tag === "caramel" && t[0].n === 2 && t.length === 2);
  check("new: ticked for the very first time inside the period", t.find(x => x.tag === "jacquier").isNew && !t.find(x => x.tag === "caramel").isNew);
  check("over everything, nothing is new", UI.tasteCounts(all, all, null).every(x => !x.isNew));
  const young = all.slice(1), early = new Date(2026, 8, 1);
  check("nor when the logbook itself starts inside the period", UI.tasteCounts(young, young, early).every(x => !x.isNew));

  const now = new Date(2026, 9, 4, 12);
  const f = UI.keyFigures(exts, exts, UI.periodStart("7", now), now);
  check("the figures of the period: cups, days, span", f.cups === 6 && f.days === 3 && f.span === 7, JSON.stringify(f));
  check("the average and the best cup", Math.abs(f.mean - 8.5) < 1e-9 && f.best && f.best.score === 9);
  check("the caffeine is per day of the period, the grams add up", Math.round(f.caffeine) === Math.round(6 * 150 / 7) && f.grams === 90 && f.coffees === 3);
  const g = UI.keyFigures(exts, exts, null, now);
  check("« Tout » counts its days from the first cup", g.span === 4, String(g.span));
  check("no cup, no average", UI.keyFigures([], [], null, now).mean === null && UI.keyFigures([], [], null, now).cups === 0);
}

/* ---------- O6: the month in coffee ---------- */
{
  check("the story tells the month before", UI.storyMonth(new Date(2026, 9, 2)) === "2026-09" && UI.storyMonth(new Date(2027, 0, 1)) === "2026-12");
  check("the first three days of a month, once", UI.storyDue(new Date(2026, 9, 1), null) && UI.storyDue(new Date(2026, 9, 3), "2026-08") &&
    !UI.storyDue(new Date(2026, 9, 3), "2026-09") && !UI.storyDue(new Date(2026, 9, 4), null));
  DATA.state.coffees = [{ id: "c1", name: "Bana" }, { id: "c2", name: "Mít" }];
  const exts = [
    cup("2026-08-20", { coffee_id: "c1", descriptors: "caramel", score_10: 7 }),
    cup("2026-09-02", { coffee_id: "c1", descriptors: "caramel|jacquier", score_10: 8, method: "Brikka" }),
    cup("2026-09-03", { coffee_id: "c2", descriptors: "jacquier", score_10: 9 }),
    cup("2026-09-03", { coffee_id: "c1", descriptors: "caramel", time: "15:00" }),
    cup("2026-09-21", { coffee_id: "c1", score_10: 9, time: "07:00" }),
  ];
  const s = UI.monthStory(exts, exts, "2026-09");
  check("the month in figures", s.cups === 4 && s.days === 3 && s.brikka === 1 && s.switch === 3 && s.rated === 3, JSON.stringify(s));
  check("the coffee of the month is the most brewed", s.coffee.id === "c1" && s.coffee.n === 3);
  check("the discovery: a taste first ticked that month", s.discovery.tag === "jacquier" && s.discovery.isNew && s.discovery.first === "2026-09-02");
  check("the best cup, the latest on a tie", s.best.score === 9 && s.best.date_time === "2026-09-21T07:00");
  const old = UI.monthStory(exts.filter(e => e.descriptors !== "caramel|jacquier" && e.descriptors !== "jacquier"), exts, "2026-09");
  check("without a new taste, the taste of the month", old.discovery && old.discovery.tag === "caramel" && !old.discovery.isNew);
  check("a month without a cup has no story", UI.monthStory(exts, exts, "2026-07") === null);
}

/* ---------- N1: the map of the app ---------- */
{
  const html = read("index.html");
  const rail = html.slice(html.indexOf('<nav class="rail"'), html.indexOf("</nav>"));
  const bar = html.slice(html.indexOf('<nav class="bottom-bar"'), html.indexOf("</nav>", html.indexOf('<nav class="bottom-bar"')));
  const order = [...rail.matchAll(/data-screen="(\w+)"><svg[\s\S]*?<span>([^<]+)<\/span>/g)].map(m => m[1] + ":" + m[2]);
  check("the rail: Accueil, Journal, Analyses, Mes cafés, Réglages gagnants, Guide, Paramètres",
    order.join() === "dashboard:Accueil,history:Journal,analytics:Analyses,coffees:Mes cafés,tuning:Réglages gagnants,guide:Guide,settings:Paramètres", order.join());
  check("« Saisie » left the rail, « Nouvelle tasse » leads to the entry", !/rail-entry" data-screen="entry"/.test(rail) && /rail-new" data-go="entry"/.test(rail));
  check("Mes cafés (the stock group's page) stands right after Analyses, where N1 put it",
    /data-screen="analytics">[\s\S]*?<\/button>\s*(?:<!--[^>]*-->\s*)?<button class="nav-btn rail-entry" data-screen="coffees"/.test(rail));
  const barOrder = [...bar.matchAll(/data-screen="(\w+)"/g)].map(m => m[1]);
  check("the bar: Accueil, Journal, the « + », Analyses, then Plus", barOrder.join() === "dashboard,history,entry,analytics" && bar.includes('id="btn-plus"'));
  check("the rail footer tools are untouched", rail.includes('<div class="rail-footer">') && rail.includes('<div class="rail-tools">') && rail.includes('id="btn-data"'));
  check("both new-cup buttons carry the draft dot, and its words exist once",
    /rail-new[^>]*>[\s\S]*?<span class="draft-dot"/.test(rail) && /id="bar-new"[\s\S]*?<span class="draft-dot">/.test(bar) &&
    (html.match(/id="draft-note"/g) || []).length === 1);
  const core = read("js/ui-core.js"), nav = read("js/ui-nav.js");
  check("the screen exists for the core, under its hash", core.includes('"analytics"') && core.includes('UI.renderAnalytics(force)'));
  check("the Guide lights up Plus, Analyses has its tab", /guide: "plus"/.test(nav) && /analytics: "analytics"/.test(nav));
  check("the dot reads the form through a helper of ui-draft.js, never a rewrite", read("js/ui-draft.js").includes("function draftInForm()") && nav.includes("UI.draftInForm()"));
  check("the old names are gone from the navigation", !rail.includes("Tableau de bord") && !rail.includes("Historique") && !rail.includes("Mes réglages") && !bar.includes("Tableau"));
  check("and the screen titles follow", html.includes('<h2 class="title-page">Accueil</h2>') && html.includes('<h2 class="title-page">Journal</h2>') &&
    html.includes('<h2 class="title-page">Réglages gagnants</h2>') && html.includes('<h2 class="title-page">Analyses</h2>'));
  const palette = read("js/ui-palette.js");
  check("Ctrl K can go to Analyses", palette.includes('["analytics", "G N"'));
}

/* ---------- L1 and O1: the page, the laziness, the hooks ---------- */
{
  const html = read("index.html");
  const home = html.slice(html.indexOf('<section id="screen-dashboard"'), html.indexOf('<section id="screen-analytics"'));
  const analytics = html.slice(html.indexOf('<section id="screen-analytics"'), html.indexOf("<!-- ================= SCREEN 2: ENTRY"));
  check("the home keeps the last cup, the corner and the latest cups", ['id="card-last"', 'id="stock-corner"', 'id="latest-list"', 'id="home-band"', 'id="home-finding"', 'id="home-brew"'].every(s => home.includes(s)));
  check("the analyses, the calendar, the chart and the drawings moved to Analyses",
    ['id="kpis"', 'id="g-heatmap"', 'id="g-30days"', 'id="insights"', 'id="card-drawings"', 'class="tabs-analyses"', 'id="card-recap"'].every(s => analytics.includes(s) && !home.includes(s)));
  check("the band lives outside the container box (fixed to the window)", home.indexOf('id="home-band"') < home.indexOf('id="dashboard-content"'));
  const sources = ["js/ui-core.js", "js/app.js", "js/ui-dashboard.js", "js/ui-home.js", "js/ui-nav.js"].map(read).join("\n");
  check("nothing draws Analyses at boot: only the shown screen does", !/renderAnalytics\(/.test(sources.replace('UI.renderAnalytics(force)', "")));
  const dash = read("js/ui-dashboard.js");
  check("every latest cup row keeps its cup id (the journal group's hook)", dash.includes('\'" data-ext="\' + e.id + \'"') && dash.includes("last-clickable"));
  const tiles = [...analytics.matchAll(/<section class="card an-tile[^"]*" data-tile="(\w+)"( data-period-aware)?/g)];
  const fixed = tiles.filter(t => !t[2]).map(t => t[1]);
  // The calendar, the 30 days chart, and since v9.23 the streaks and milestones.
  check("the tiles that keep their own window say so", fixed.length === 3 &&
    fixed.every(name => new RegExp('data-tile="' + name + '"[\\s\\S]*?an-fixed').test(analytics)), fixed.join());
  check("the period is a radio group of four", (analytics.match(/role="radio"/g) || []).length === 4 && analytics.includes('role="radiogroup"'));
  check("the story is a dialog: the focus stays inside, Escape is native", /<dialog id="modal-story"/.test(html) && read("js/ui-story.js").includes('addEventListener("cancel"'));
}

/* ---------- The styles: the calm path, the type floor, no green ---------- */
{
  const css = read("css/home.css");
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, negative = false;
  for (const ch of noComments) { if (ch === "{") depth++; if (ch === "}") { depth--; if (depth < 0) negative = true; } }
  check("home.css closes what it opens", depth === 0 && !negative, String(depth));
  const tiny = [...noComments.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem", tiny.length === 0, tiny.map(m => m[0]).join());
  const animated = [...noComments.matchAll(/([.#][\w-]+)[^{};]*\{[^}]*animation:\s*[a-z]/g)].length;
  const calm = (noComments.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length;
  check("every block of movement has its calm path", animated > 5 && calm >= 3, animated + " animations, " + calm + " calm blocks");
  const hue = hex => {
    const v = hex.length === 4 ? hex.slice(1).split("").map(c => parseInt(c + c, 16)) : [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = v.map(x => x / 255), max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 0.08) return null;
    const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    return (h * 60 + 360) % 360;
  };
  const green = [...noComments.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map(m => m[0]).filter(c => { const h = hue(c); return h !== null && h > 70 && h < 170; });
  check("no green anywhere", green.length === 0 && !/\bgreen\b/i.test(noComments), green.join());
  check("the sheet is loaded last, right after journal.css, and precached", /journal\.css\?v=[\d.]+">\n<link rel="stylesheet" href="css\/home\.css\?v=/.test(read("index.html")) &&
    read("sw.js").includes('"./css/home.css"'));
}

/* ---------- Both languages ---------- */
{
  const fr = read("js/i18n.fr.js") + read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const used = new Set();
  for (const f of ["js/ui-home.js", "js/ui-analytics.js", "js/ui-story.js", "js/ui-nav.js"]) {
    for (const m of read(f).matchAll(/I18N\.t\("([a-z0-9_]+)"/g)) if (!m[1].endsWith("_")) used.add(m[1]);
  }
  ["an_month_title_7", "an_month_title_30", "an_month_title_90", "an_month_title_all", "an_bar", "an_bar_rated", "an_month_meta_unrated",
    "an_month_best_day", "an_month_best_week", "an_month_best_month", "an_period_7", "an_period_30", "an_period_90",
    "brew_reason_low", "brew_reason_idle", "brew_reason_new", "brew_reason_best", "story_all_switch", "story_all_brikka", "story_discovery_over"].forEach(k => used.add(k));
  const missing = [...used].filter(k => !new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(fr) || !new RegExp("^\\s*" + k + ": ", "m").test(en));
  check("every text of the new screens exists in French and in English", missing.length === 0, missing.join(", "));
  const enObj = new Function(en + "\nreturn I18N_EN;")();
  const html = read("index.html");
  const fresh = ["Accueil", "Journal", "Analyses", "Réglages gagnants", "brouillon en cours", "Tes dernières tasses", "Tout le journal", "7 jours", "30 jours",
    "3 mois", "Tout", "Tes cafés", "Tes recettes", "Tes goûts", "Le moulin", "sa propre fenêtre, sans la période", "toujours 30 jours", "sur tout ton carnet",
    "En détail", "suit la période", "Ton mois en café", "Pas encore d'analyses"];
  const untranslated = fresh.filter(t => !enObj.UI[t] || !html.includes(t));
  check("the static words of the page have their English", untranslated.length === 0, untranslated.join(" | "));
  check("the screens keep their names in English: Home, Journal, Analytics, Winning settings",
    enObj.UI["Accueil"] === "Home" && enObj.UI["Analyses"] === "Analytics" && enObj.UI["Réglages gagnants"] === "Winning settings");
  check("and the zones drawn in JS are left to the code that draws them", read("js/i18n.js").includes("#home-week,#home-week-line,#home-bags"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
