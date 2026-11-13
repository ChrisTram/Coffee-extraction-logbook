/* Tests of the home group (v9.21): N1 the map of the app, L1 the home in
 * three questions, O1 the Analyses page and O6 the month in coffee.
 *
 *   node tools/home.test.mjs
 *
 * The pure parts of js/ui-home.js, js/ui-analytics.js and js/ui-story.js run
 * here on the real tools, i18n and tuning code, with a stub of the interface
 * core: the week, the open coffees (trend, scale, which cup to brew again), the period and its bars, the
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
for (const f of ["js/ui-home.js", "js/ui-home-open.js", "js/ui-home-charts.js", "js/ui-analytics.js", "js/ui-story.js"]) {
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

/* ---------- v9.41: the open coffees ---------- */
{
  const now = new Date(2026, 9, 4, 10, 0);
  let t = UI.coffeeTrend([]);
  check("a coffee never rated has no average and no trend", t.n === 0 && t.avg === null && t.dir === null && t.last === null);
  t = UI.coffeeTrend([7, 8, 8]);
  check("under four scores, the average, the last and the best, but no trend", t.n === 3 && Math.abs(t.avg - 23 / 3) < 1e-9 && t.last === 8 && t.best === 8 && t.dir === null && t.delta === null);
  t = UI.coffeeTrend([6, 6, 8, 8]);
  check("four scores: the last two against the two before", t.window === 2 && t.delta === 2 && t.dir === "up");
  t = UI.coffeeTrend([8, 8, 8, 7, 6.5, 6.5]);
  check("from six scores on, the last three against all the ones before", t.window === 3 && Math.abs(t.delta - (20 / 3 - 8)) < 1e-9 && t.dir === "down", JSON.stringify(t));
  t = UI.coffeeTrend([7, 7.5, 7, 7.5, 7, 7.5]);
  check("within a quarter of a point, it is stable", t.dir === "flat" && Math.abs(t.delta) < 0.25);
  check("what is not a number is not a score", UI.coffeeTrend([7, "", undefined, "x", 8]).n === 3 && UI.coffeeTrend([7, "x", 8]).n === 2);

  const roll = UI.rollingMean([6, 8, 7, 9]);
  check("the rolling line is each score with the two before it", roll.length === 4 && roll[0] === 6 && roll[1] === 7 && roll[2] === 7 && roll[3] === 8);
  let s = UI.sparkScale([8, 8, 8]);
  check("a coffee that never moves sits in the middle of its chart", s.high - s.low >= 3 && Math.abs((s.high + s.low) / 2 - 8) < 1e-9, JSON.stringify(s));
  s = UI.sparkScale([5.5, 9]);
  check("half a point of air around the scores", s.low === 4.5 && s.high === 9.5);
  s = UI.sparkScale([10, 10, 9.5]);
  check("never past 10,5, and still three points tall", s.high === 10.5 && s.high - s.low >= 3);
  check("and never under zero", UI.sparkScale([0, 1]).low === 0);

  const rated = [cup("2026-10-01", { score_10: 8, method: "Brikka" }), cup("2026-10-02", { score_10: 6, method: "Switch" }),
    cup("2026-10-03", { score_10: 7, method: "Switch" })];
  const per = UI.methodAverages(rated);
  check("the average per brewer, the most used first", per.length === 2 && per[0].method === "Switch" && per[0].avg === 6.5 && per[0].n === 2 && per[1].method === "Brikka" && per[1].avg === 8);

  const cupsOf = (id, n, from, o) => Array.from({ length: n }, (_, i) => cup(before(now, from + i), { coffee_id: id, score_10: 8, recipe: "Chronicler", grind_dial: "1.5.0", ...o }));
  const recent = [...cupsOf("a", 3, 0), ...cupsOf("b", 3, 0, { score_10: 7 })];
  let b = UI.brewTarget("a", recent, recent);
  check("« Brasser » takes the winning setting: three cups of the same signature", b && b.kind === "best" && recent.some(e => e.id === b.refId && e.coffee_id === "a"), JSON.stringify(b));
  const scattered = [cup(before(now, 3), { coffee_id: "d", score_10: 8, recipe: "Tetsu 4:6", grind_dial: "1.6.0" }),
    cup(before(now, 0), { coffee_id: "d", recipe: "One and Done", grind_dial: "1.4.0" })];
  b = UI.brewTarget("d", scattered, scattered.filter(e => e.score_10 !== ""));
  check("without a winning setting, the setting of its latest cup, rated or not", b && b.kind === "last" && b.refId === scattered[1].id, JSON.stringify(b));
  check("a coffee never brewed has no cup to take a setting from", UI.brewTarget("n", recent, recent) === null);

  const row = { coffee: { id: "a", name: "Café a" }, leftover: 120, cups: 8, bag: 250, pc: 48 };
  const botched = cup(before(now, 1), { coffee_id: "a", score_10: 2 });
  const o = UI.openCoffee(row, [...recent, botched], recent);
  check("a card reads the coffee's analysable rated cups, oldest first", o.id === "a" && o.cups.length === 3 && o.total === 4 && o.trend.avg === 8 &&
    String(o.cups[0].date_time) < String(o.cups[2].date_time));
  check("and knows when the coffee was drunk last", o.latest.slice(0, 10) === before(now, 0));
  const many = cupsOf("m", 30, 0);
  check("the chart keeps the last 24 scores, the average all of them", UI.openCoffee({ ...row, coffee: { id: "m", name: "m" } }, many, many).cups.length === 24 &&
    UI.openCoffee({ ...row, coffee: { id: "m", name: "m" } }, many, many).trend.n === 30);
}

/* ---------- v9.44: the home's charts ---------- */
{
  const now = new Date(2026, 10, 14, 10, 0); // Saturday 14 November 2026
  const mk = (k, o) => cup(before(now, k), { score_10: 8, recipe: "Brikka classique", method: "Brikka", ...o });
  const exts = [
    mk(0, { coffee_id: "a" }), mk(1, { coffee_id: "a", recipe: "Tetsu 4:6", method: "Switch", temperature_c: 88, score_10: 7.5 }),
    mk(1, { coffee_id: "b", time: "15:00", score_10: "" }), mk(3, { coffee_id: "b", recipe: "Tetsu 4:6", method: "Switch", temperature_c: 88, score_10: 8.5 }),
    mk(20, { coffee_id: "c", recipe: "Tetsu 4:6", method: "Switch", temperature_c: 93, score_10: 6 }),
    mk(70, { coffee_id: "old", recipe: "Ancienne", score_10: 5 }),
  ];
  const codes = UI.homeCodes(exts, ["a", "new"], now);
  check("a colour per coffee: the one drunk last first, then the open ones not brewed yet", codes.coffees.join() === "a,b,c,new", codes.coffees.join());
  check("a coffee not seen for 60 days has no colour of its own", codes.colour("old") === 0 && codes.colour("a") === 1 && codes.colour("new") === 4);
  check("a shape per recipe, the most brewed first", codes.recipes.join() === "Tetsu 4:6,Brikka classique" && codes.shape("Tetsu 4:6") === 0 && codes.shape("Brikka classique") === 1);
  check("a recipe not brewed for 60 days has no shape of its own", codes.shape("Ancienne") === -1);
  const six = UI.homeCodes(["a", "b", "c", "d", "e", "f"].map((id, i) => mk(i, { coffee_id: id })), [], now);
  check("five colours, a sixth coffee is grey", six.colour("e") === 5 && six.colour("f") === 0);

  const days = UI.lastDays(exts, exts, now);
  check("15 days, today last", days.length === 15 && days[14].key === TOOLS.localDateKey(now) && days[0].key === before(now, 14));
  check("each day holds its cups in the order they were drunk", days[13].cups.length === 2 && days[13].cups[0].coffee_id === "a" && days[13].cups[1].coffee_id === "b");
  check("the day's average is over its rated cups only", days[13].mean === 7.5 && days[13].rated === 1 && days[14].mean === 8 && days[12].mean === null);
  check("a cup outside the 15 days is not in them", days.every(d => d.cups.every(e => e.coffee_id !== "c")));
  const failedOut = UI.lastDays(exts, exts.filter(e => e.coffee_id !== "a"), now);
  check("a cup that is not analysable shows, but leaves the average", failedOut[14].cups.length === 1 && failedOut[14].mean === null);

  check("a cup alone stands in the middle of its day", Math.abs(UI.cupX(0, 0, 1, 15) - 0.5 / 15) < 1e-9);
  const xs = [0, 1, 2].map(j => UI.cupX(4, j, 3, 15));
  check("several cups of a day stand side by side, inside the day's column", xs[0] < xs[1] && xs[1] < xs[2] && xs[0] > 4 / 15 && xs[2] < 5 / 15 &&
    Math.abs(xs[1] - 4.5 / 15) < 1e-9);
  check("the score scale runs to 10, from a point under the lowest score, four points tall at least", UI.scoreScale([8, 9]).low === 6 && UI.scoreScale([8, 9]).high === 10 &&
    UI.scoreScale([4.5, 9]).low === 3 && UI.scoreScale([]).low === 5);

  const m = UI.recipeMatrix(exts.filter(e => e.score_10 !== ""), ["a", "b"], ["Tetsu 4:6", "Brikka classique", "Jamais"]);
  check("the matrix: a row per recipe that has a cup, a column per coffee", m.length === 2 && m[0].recipe === "Tetsu 4:6" && m[0].cells.length === 2);
  check("a cell is the average and the count, or nothing", m[0].cells[0].avg === 7.5 && m[0].cells[0].n === 1 && m[1].cells[1] === null);
  check("the best recipe of a coffee is flagged, when it has two to compare", m[1].cells[0].best === true && m[0].cells[0].best === false && m[0].cells[1].best === false);

  const best = UI.bestDegree([{ t: 88, score: 8 }, { t: 88.4, score: 8.5 }, { t: 93, score: 9.5 }, { t: 92, score: 6 }, { t: 92, score: 7 }]);
  check("the best degree needs two cups: one great cup at 93 does not win", best && best.t === 88 && best.avg === 8.25 && best.n === 2, JSON.stringify(best));
  check("no degree brewed twice, no best degree", UI.bestDegree([{ t: 88, score: 8 }, { t: 93, score: 9 }]) === null);

  const spread = UI.scoreSpread([mk(0, { score_10: 8 }), mk(1, { score_10: 8 }), mk(2, { score_10: 9.5 }), mk(3, { score_10: "" })]);
  check("the spread: a column per half point from the lowest score to 10, empty ones too", spread.length === 5 && spread[0].score === 8 && spread[0].cups.length === 2 &&
    spread[1].cups.length === 0 && spread[3].score === 9.5 && spread[3].cups.length === 1 && spread[4].score === 10);
  check("a cup not rated is not in the spread", UI.scoreSpread([mk(0, { score_10: "" })]).length === 0);
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

/* ---------- v9.43: Analyses on a narrow page ---------- */
{
  const boxes = [{ left: 0, width: 275 }, { left: 285, width: 275 }, { left: 570, width: 275 }];
  check("the pager names the drawing nearest the middle of the row", UI.nearestCard(boxes, 0, 312) === 0 && UI.nearestCard(boxes, 270, 312) === 1 &&
    UI.nearestCard(boxes, 560, 312) === 2);
  check("half way between two, the first one keeps the name", UI.nearestCard([{ left: 0, width: 100 }, { left: 100, width: 100 }], 50, 100) === 0);
  const html = read("index.html"), css = read("css/home.css"), an = read("js/ui-analytics.js");
  const narrow = css.slice(css.indexOf("@container analytics (max-width: 600px) {\n  /* 1."));
  check("the page has the findings' « more » button and the drawings' pager, hidden until needed",
    /id="insights-more"[^>]* hidden>/.test(html) && /id="drawings-pager" hidden>/.test(html) && /\.an-findings-more, \.drawings-pager \{ display: none; \}/.test(css));
  check("a narrow page folds the three tiles that keep their own window, without display: none (the chart is born at its size)",
    /\.an-tile:is\(\[data-tile="chart30"\], \[data-tile="milestones"\], \[data-tile="calendar"\]\):not\(\.open\) \.an-tile-body \{\s*max-height: 0; overflow: hidden; visibility: hidden;/.test(narrow) &&
    !/an-tile-body \{[^}]*display: none/.test(narrow));
  check("it shows three findings until asked for all", narrow.includes(".an-findings:not(.all) .insights > li:nth-child(n+4) { display: none; }") && /const FINDINGS_SHOWN = 3;/.test(an));
  check("the drawings slide one at a time, the hidden ones stay hidden", /#card-drawings \.drawings-grid \{[^}]*overflow-x: auto; scroll-snap-type: x mandatory;/.test(narrow) &&
    narrow.includes("#card-drawings .drawings-grid > .drawing[hidden] { display: none; }"));
  check("the tabs of « En détail » stay on one line and the card takes the height of the tab shown",
    /\.card-analyses \.card-head > \.tabs-analyses \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/.test(narrow) &&
    narrow.includes(".analyses-stack > .analysis:not(.current) { position: absolute; top: 0; left: 0; right: 0; }"));
  check("a wide page is left alone: every rule of the fold lives in the container query",
    !/^\.analyses-stack > \.analysis:not\(\.current\)|^#card-drawings \.drawings-grid \{/m.test(css));
  check("the pager's buttons are rewritten only when their count or the language changes", an.includes("if (key !== pagerKey)"));
}

/* ---------- L1 and O1: the page, the laziness, the hooks ---------- */
{
  const html = read("index.html");
  const home = html.slice(html.indexOf('<section id="screen-dashboard"'), html.indexOf('<section id="screen-analytics"'));
  const analytics = html.slice(html.indexOf('<section id="screen-analytics"'), html.indexOf("<!-- ================= SCREEN 2: ENTRY"));
  check("the home keeps the open coffees, the last cup and the latest cups", ['id="home-open"', 'id="card-last"', 'id="latest-list"', 'id="home-band"'].every(s => home.includes(s)));
  check("v9.44: four charts on the home, the 15 days first of the main column", ['id="home-days"', 'id="home-matrix"', 'id="home-temp"', 'id="home-spread"'].every(s => home.includes(s)) &&
    home.indexOf('class="grid-dashboard home-main"') < home.indexOf('id="home-days"') && home.indexOf('id="home-days"') < home.indexOf('id="card-last"'));
  check("the sentence « À retenir » and the wheel of the month left the home", !home.includes('id="home-finding"') && !html.includes("ui-home-widgets.js") &&
    !/home-finding|home-widget|hwg-|\.hf-/.test(read("css/home.css") + read("css/panel.css")));
  const charts = read("js/ui-home-charts.js");
  check("the charts are home-made (no Chart.js, there with the first paint), their marks open their cup", !/CHARTS\.\w|new Chart/.test(charts) && charts.includes('data-spot-cup="'));
  check("a mark is placed by percentages, in a nested svg", /class="hc-pt c' \+ codes\.colour\(e\.coffee_id\)/.test(charts) && charts.includes('width="1" height="1" overflow="visible"'));
  check("five coffee colours, none of them the brewers' blue or orange, and a light theme of their own",
    /--coffee-1: #e3b341; --coffee-2: #a98bea; --coffee-3: #e884ae; --coffee-4: #56c4d8; --coffee-5: #db6a55;/.test(read("css/home.css")) &&
    /:root\[data-theme="light"\] \.home \{\s*--coffee-1:/.test(read("css/home.css")));
  check("the charts' marks have their calm path", /prefers-reduced-motion[\s\S]*\.home-enter \.hc-pt > \*, \.home-enter \.hc-mean/.test(read("css/home.css")));
  check("the open coffees come right under the title, before the last cup", home.indexOf('class="title-page"') < home.indexOf('id="home-open"') && home.indexOf('id="home-open"') < home.indexOf('id="card-last"'));
  check("what v9.41 took out of the home is gone: the corner, the bags column, the month, the suggestion",
    ['id="stock-corner"', 'id="home-bags"', 'id="home-month"', 'id="home-brew"'].every(s => !home.includes(s)));
  const openSrc = read("js/ui-home-open.js");
  check("a card states the grams, opens the coffee sheet and brews", openSrc.includes('Math.round(s.leftover) + " g"') && openSrc.includes('class="ho-main" data-sheet="') && openSrc.includes("data-open-brew"));
  check("a dot of its chart opens its cup", openSrc.includes('data-spot-cup="') && read("js/ui-last-cup.js").includes('closest("[data-spot-cup]")'));
  check("the home shows five latest cups", /const LATEST_SHOWN = 5;/.test(read("js/ui-last-cup.js")));
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
  for (const f of ["js/ui-home.js", "js/ui-home-open.js", "js/ui-home-charts.js", "js/ui-analytics.js", "js/ui-story.js", "js/ui-nav.js"]) {
    for (const m of read(f).matchAll(/I18N\.t\("([a-z0-9_]+)"/g)) if (!m[1].endsWith("_")) used.add(m[1]);
  }
  ["an_month_title_7", "an_month_title_30", "an_month_title_90", "an_month_title_all", "an_bar", "an_bar_rated", "an_month_meta_unrated",
    "an_month_best_day", "an_month_best_week", "an_month_best_month", "an_period_7", "an_period_30", "an_period_90",
    "ho_trend_up", "ho_trend_down", "ho_title", "ho_title_ends", "ho_all", "ho_more", "story_all_switch", "story_all_brikka", "story_discovery_over"].forEach(k => used.add(k));
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
  check("and the zones drawn in JS are left to the code that draws them", read("js/i18n.js").includes("#home-week,#home-week-line,#home-open,#home-days,#home-matrix,#home-temp,#home-spread"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
