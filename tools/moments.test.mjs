/* Tests of the moments group (v9.23): R4 the steam of a cup still hot, R9
 * the streaks and the milestones.
 *
 *   node tools/moments.test.mjs
 *
 * The rules are pure, in js/milestones.js: they run here on hand-made cups.
 * Then js/ui-celebrate.js runs with a stub of the interface core for what it
 * decides without a page (how long a cup steams, the line of a moment, the
 * streak's words, what a save celebrates once per device), and the page, the
 * styles and the dictionaries are read for what the work promised: the hooks
 * in the save flow and the home, the tile of Analyses, the calm path of every
 * movement, no sound, the two languages. boot.test.mjs runs the screens for real. */

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

const layers = ["js/legacy-names.js", "js/tools.js", "js/i18n.fr.js", "js/i18n.fr2.js", "js/i18n.js", "js/milestones.js"]
  .map(read).join("\n");
const store = new Map();
const storage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};
const { TOOLS, I18N, MILESTONES } = new Function("localStorage", "document",
  layers + "\nreturn { TOOLS, I18N, MILESTONES };")(storage, { createElement: () => ({}) });

const DATA = { state: { extractions: [] }, bagRecord: () => null };
const UI = {
  $: () => null, titleAttr: s => TOOLS.escapeHtml(s || ""),
  fmtDecimal: (n, dec) => Number(n.toFixed(dec)).toLocaleString("fr-FR", { maximumFractionDigits: dec }),
  debounce: fn => fn, showCupCard() {},
};
const fakeDocument = { visibilityState: "visible", addEventListener() {}, documentElement: null };
new Function("UI", "DATA", "TOOLS", "I18N", "MILESTONES", "document", "window", "localStorage", read("js/ui-celebrate.js"))(
  UI, DATA, TOOLS, I18N, MILESTONES, fakeDocument, { addEventListener() {} }, storage);

// A cup, with what the rules read.
let seq = 0;
const cup = (day, o) => ({ id: "e" + (++seq), date_time: day + "T" + ((o && o.time) || "08:30"), coffee_id: "c1",
  recipe: "Tetsu 4:6", score_10: "", failed: "", ...o });
// A local date key, k days after `from` (negative: before).
const shift = (from, k) => MILESTONES.shiftDay(from, k);
// n cups, one a day from `from`.
const daily = (from, n, o) => Array.from({ length: n }, (_, i) => cup(shift(from, i), o));
const ids = list => list.map(m => m.id);

/* ---------- R9: the milestones ---------- */
{
  const cups = daily("2026-01-01", 120);
  const list = MILESTONES.compute(cups);
  const at = id => list.find(m => m.id === id);
  check("the 10th, 50th and 100th cup, not the 250th", at("cups-10") && at("cups-50") && at("cups-100") && !at("cups-250"), ids(list).join());
  check("each on its own cup and day", at("cups-10").cupId === cups[9].id && at("cups-100").date === cups[99].date_time.slice(0, 10));
  check("one recipe all along: no new recipe", !list.some(m => m.kind === "recipe"));
  check("the list runs by day", list.every((m, i) => i === 0 || list[i - 1].date <= m.date));

  // Two cups of the same minute: the id decides, numerically (e9 before e10).
  const same = [cup("2026-02-01", { id: "e10" }), cup("2026-02-01", { id: "e9" })];
  const fill = daily("2026-01-20", 8);
  check("two cups of the same minute keep their id order", MILESTONES.compute([...fill, ...same]).find(m => m.id === "cups-10").cupId === "e10");
}
{
  const coffees = ["c1", "c2", "c1", "c3", "c4", "c2", "c5", "c6"].map((c, i) => cup(shift("2026-03-01", i), { coffee_id: c }));
  const list = MILESTONES.compute(coffees);
  const fifth = list.find(m => m.id === "coffees-5");
  check("the 5th different coffee, on its first cup", fifth && fifth.cupId === coffees[6].id, JSON.stringify(fifth));
  check("not the 10th before it exists", !list.some(m => m.id === "coffees-10"));
}
{
  const cups = [cup("2026-04-01", { score_10: 8 }), cup("2026-04-02", { score_10: 9.5, failed: 1 }), cup("2026-04-03", { score_10: "" }),
    cup("2026-04-04", { score_10: 9 }), cup("2026-04-05", { score_10: 9.5 }), cup("2026-04-06", { score_10: 10 })];
  const list = MILESTONES.compute(cups);
  const nine = list.find(m => m.id === "score-9"), ten = list.find(m => m.id === "score-10");
  check("a botched 9,5 is no milestone: the first 9 is the next good one", nine && nine.cupId === cups[3].id && nine.score === 9, JSON.stringify(nine));
  check("the first 10", ten && ten.cupId === cups[5].id);
  const straight = MILESTONES.compute([cup("2026-04-10", { score_10: 7 }), cup("2026-04-11", { score_10: 10 })]);
  check("a first 10 that is also the first 9 is one milestone", ids(straight).join() === "score-10", ids(straight).join());
}
{
  const cups = [cup("2026-05-01", { recipe: "Brikka classique" }), cup("2026-05-02", { recipe: "Brikka classique" }),
    cup("2026-05-03", { recipe: "Tetsu 4:6" }), cup("2026-05-04", { recipe: "" }), cup("2026-05-05", { recipe: "Tetsu 4:6" })];
  const recipes = MILESTONES.compute(cups).filter(m => m.kind === "recipe");
  check("the first cup's recipe is not new; the first Tetsu is", recipes.length === 1 && recipes[0].recipe === "Tetsu 4:6" && recipes[0].cupId === cups[2].id,
    JSON.stringify(recipes));
}
{
  // Runs of 5, 8, 9, 6 and 9 days, a day off between each.
  const runs = [5, 8, 9, 6, 9];
  let day = "2026-06-01";
  const cups = [];
  runs.forEach(n => { cups.push(...daily(day, n)); day = shift(day, n + 1); });
  const streaks = MILESTONES.compute(cups).filter(m => m.kind === "streak");
  check("a record streak from a week on, once per record run", streaks.length === 2, JSON.stringify(streaks));
  check("the 8-day run beats the 5 on its 7th day (a week)", streaks[0].from === "2026-06-07" && streaks[0].date === "2026-06-13" && streaks[0].n === 8 && streaks[0].reached === 7,
    JSON.stringify(streaks[0]));
  check("the 9-day run, on its 9th day; a 9 that only ties is none", streaks[1].n === 9 && streaks[1].date === shift(streaks[1].from, 8), JSON.stringify(streaks[1]));
}

/* ---------- R9: the streak of today ---------- */
{
  const now = new Date(2026, 9, 4, 8, 0); // Sunday 4 October, 8 in the morning
  const run = daily("2026-09-28", 6); // Monday to Saturday
  const s = MILESTONES.streaks(run, now);
  check("no cup yet today: the streak counts up to yesterday", s.current === 6 && !s.today && s.from === "2026-09-28", JSON.stringify(s));
  const withToday = MILESTONES.streaks([...run, cup("2026-10-04", { time: "07:40" })], now);
  check("today's cup makes it seven, lit", withToday.current === 7 && withToday.today);
  check("two days without a cup: no streak", MILESTONES.streaks(daily("2026-09-25", 6), now).current === 0);
  const best = MILESTONES.streaks([...daily("2026-08-01", 10), ...run], now);
  check("the best streak and its days", best.best === 10 && best.bestFrom === "2026-08-01" && best.bestTo === "2026-08-10", JSON.stringify(best));
  check("a cup dated tomorrow has not happened", MILESTONES.streaks([...run, cup("2026-10-05")], now).current === 6);
  check("an empty logbook", MILESTONES.streaks([], now).current === 0 && MILESTONES.streaks([], now).best === 0);
}

/* ---------- R9: what a save celebrates ---------- */
{
  const base = daily("2026-01-01", 99);
  const hundredth = cup("2026-04-10", { score_10: 10 });
  const all = [...base, hundredth];
  const r = MILESTONES.forSave(all, hundredth.id, ["cups-10", "cups-50"]);
  check("saving the 100th cup crosses it, and a first 10 with it, the cups first", ids(r.celebrate).join() === "cups-100,score-10", ids(r.celebrate).join());
  check("and everything reached is remembered", ["cups-10", "cups-50", "cups-100", "score-10"].every(id => r.seen.includes(id)));
  const again = MILESTONES.forSave(all, hundredth.id, r.seen);
  check("once per device: the same milestone never bursts twice", again.celebrate.length === 0);
  const first = MILESTONES.forSave(all, hundredth.id, null);
  check("the first time, what was there before is known, the save still celebrates", ids(first.celebrate).join() === "cups-100,score-10" &&
    first.seen.includes("cups-50"));
  // A sync brought a 10 from the other device: the next save here does not burst for it.
  const synced = [...base.slice(0, 50), cup("2026-03-01", { score_10: 10 })];
  const mine = cup("2026-03-02");
  check("a milestone a sync brought is not this save's", MILESTONES.forSave([...synced, mine], mine.id, []).celebrate.length === 0);
  const old = cup("2025-12-01");
  check("a cup logged for an old day crosses the count all the same", ids(MILESTONES.forSave([...base, old], old.id, []).celebrate).includes("cups-100"));
  // A record run of 8 days, then a missing day filled: the run only grows, no new record.
  const a = daily("2026-07-01", 8), b = daily("2026-07-10", 3), gap = cup("2026-07-09");
  check("a record run that only grows is not a new record", MILESTONES.forSave([...a, ...b, gap], gap.id, []).celebrate.length === 0);
  const seven = daily("2026-08-01", 6), today = cup("2026-08-07");
  check("the 7th day of a first long run is a record", ids(MILESTONES.forSave([...seven, today], today.id, []).celebrate).join() === "streak-2026-08-01");
  check("the next cup milestone", JSON.stringify(MILESTONES.nextCups(base)) === JSON.stringify({ n: 100, left: 1 }) && MILESTONES.nextCups(daily("2026-01-01", 1000)) === null);
}

/* ---------- R4: how long a cup steams ---------- */
{
  const now = new Date(2026, 9, 4, 10, 0);
  const st = UI.steamState("2026-10-04T09:55", now);
  check("five minutes old: it steams ten more minutes", st && st.age === 5 * 60000 && st.left === 10 * 60000, JSON.stringify(st));
  check("a cup logged two hours back gets none", UI.steamState("2026-10-04T08:00", now) === null);
  check("fifteen minutes is the end of it", UI.steamState("2026-10-04T09:45", now) === null && UI.steamState("2026-10-04T09:46", now) !== null);
  check("half a minute ahead (the other device's clock) still steams", UI.steamState("2026-10-04T10:00:30", now) && UI.steamState("2026-10-04T10:00:30", now).age === 0);
  check("a cup dated later today does not", UI.steamState("2026-10-04T10:05", now) === null && UI.steamState("", now) === null);
}

/* ---------- R9: the words of the moment ---------- */
{
  const m = (kind, o) => ({ kind, ...o });
  check("« 100e tasse ! »", UI.momentLine([m("cups", { n: 100 })], false) === "100e tasse !", UI.momentLine([m("cups", { n: 100 })], false));
  check("two milestones, the first leads", UI.momentLine([m("cups", { n: 100 }), m("score10", { score: 10 }), m("recipe", { recipe: "Tetsu 4:6" })], false) === "100e tasse et ton premier 10 !");
  check("a record of the bag joins the same line, one moment", UI.momentLine([m("score9", { score: 9.5 }), m("recipe", { recipe: "Tetsu 4:6" })], true) === "Ton premier 9,5 et record sur ce sachet !",
    UI.momentLine([m("score9", { score: 9.5 })], true));
  check("a new recipe, a record streak, a coffee", UI.momentLine([m("recipe", { recipe: "Tetsu 4:6" })], false) === "Nouvelle recette, Tetsu 4:6 !" &&
    UI.momentLine([m("streak", { n: 9 })], false) === "Série record, 9 jours !" && UI.momentLine([m("coffees", { n: 5 })], false) === "5e café différent !");
  check("nothing to say, no line", UI.momentLine([], true) === "");
  check("no streak under two days", UI.streakHtml({ current: 1, today: true }) === "" && UI.streakHtml(null) === "");
  const pending = UI.streakHtml({ current: 6, today: false });
  check("six days, dimmed until today has its cup", pending.replace(/&#39;|&#x27;/g, "'").includes("6 jours d'affilée") && pending.includes("hw-streak pending") && !pending.includes("\u{1F525}"));
  check("lit once it has", !UI.streakHtml({ current: 6, today: true }).includes("pending"));
}

/* ---------- R9: saveMoment, through the device's memory ---------- */
{
  store.clear();
  const base = daily("2026-01-01", 49);
  const fiftieth = cup("2026-03-01");
  DATA.state.extractions = [...base, fiftieth];
  DATA.bagRecord = e => (e.id === fiftieth.id ? { score: 9 } : null);
  const moment = UI.saveMoment(fiftieth);
  check("the 50th cup saved: one moment, with the record of the bag", moment && moment.line === "50e tasse et record sur ce sachet !" && moment.record, JSON.stringify(moment));
  check("remembered on this device", JSON.parse(store.get("milestones-seen")).includes("cups-50"));
  check("saved again (deleted and logged anew): no second burst", UI.saveMoment(fiftieth) === null);
  check("a save that crosses nothing has no moment", UI.saveMoment(base[3]) === null);
}

/* ---------- The hooks and the page ---------- */
{
  const html = read("index.html");
  const entry = read("js/ui-entry.js"), quick = read("js/ui-quick.js"), home = read("js/ui-home.js"), cupJs = read("js/ui-cup.js"), an = read("js/ui-analytics.js");
  check("the full entry and the quick entry save through the moment", entry.includes("UI.showSavedCup(saved)") && quick.includes("UI.showSavedCup(saved)") &&
    !/UI\.showCupCard\(saved\)/.test(entry + quick));
  check("the cup's card can stay longer for a milestone", /function showCupCard\(ext, opts\)/.test(cupJs) && (cupJs.match(/\+ hold\)/g) || []).length === 2);
  check("the home calls the moments after its band, and when it empties", (home.match(/UI\.renderMoments\(/g) || []).length === 2 &&
    home.indexOf("UI.renderMoments(o)") > home.indexOf("renderBand(o.last)"));
  check("Analyses draws the tile", an.includes("UI.renderMilestoneTile()"));
  const tile = html.slice(html.indexOf('data-tile="milestones"') - 80, html.indexOf('id="tile-milestones"') + 40);
  check("the tile: full width, its own window said, its body drawn in JS", /an-tile an-tile-full ms-tile/.test(tile) && tile.includes("an-fixed") &&
    tile.includes("Séries et paliers") && read("js/i18n.js").includes('"#tile-milestones"'));
  const pageScripts = [...html.matchAll(/<script defer src="(js\/[^"?]+)/g)].map(m => m[1]);
  check("the rules load before the screens, the screen after the moments", pageScripts.indexOf("js/milestones.js") > -1 &&
    pageScripts.indexOf("js/milestones.js") < pageScripts.indexOf("js/ui-core.js") && pageScripts.indexOf("js/ui-celebrate.js") === pageScripts.indexOf("js/ui-moments.js") + 1);
  const sw = read("sw.js");
  check("the sheet comes last, after home.css and gestures.css, and all three files are precached",
    /gestures\.css\?v=[\d.]+">\n<link rel="stylesheet" href="css\/moments\.css\?v=/.test(html) && html.indexOf("css/moments.css") > html.indexOf("css/home.css") &&
    ["./css/moments.css", "./js/milestones.js", "./js/ui-celebrate.js"].every(f => sw.includes('"' + f + '"')));
  const src = read("js/ui-celebrate.js");
  check("the burst never plays with reduced motion nor hidden, and never sounds", /function burst[\s\S]{0,120}calm\(\) \|\| hidden\(\)/.test(src) &&
    !/Audio|vibrate|youtube/i.test(src + read("js/milestones.js")));
  check("the steam goes by one timer, never by polling", src.includes("setTimeout(removeSteam") && !/setInterval/.test(src));
  check("a celebration never stands in the way of the save", /try \{ moment = saveMoment\(saved\); \} catch/.test(src));
}

/* ---------- Two fixes to the home of v9.21, found while checking this work ---------- */
{
  const home = read("js/ui-home.js"), homeCss = read("css/home.css").replace(/\/\*[\s\S]*?\*\//g, ""), core = read("js/ui-core.js");
  const place = home.slice(home.indexOf("function placeBand"), home.indexOf("function updateBand"));
  check("the band is placed by its two edges, never by a width (the page no longer scrolls sideways)",
    place.includes("el.style.right =") && !/style\.width = Math/.test(place));
  /* Every wider hit area drawn by an absolute ::after needs a positioned host:
     without one, .hf-next's took the whole window, swallowed every tap of the
     home and pushed the page 8 px sideways. */
  const allCss = ["base", "screens", "dialogs", "finishing", "stock", "extras", "journal", "home", "gestures", "moments"]
    .map(f => read("css/" + f + ".css")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const hosts = [...allCss.matchAll(/([^{}]+)\{[^}]*position:\s*absolute;[^}]*inset:\s*-\d+px[^}]*\}/g)]
    .flatMap(m => m[1].split(",").map(s => s.trim()).filter(s => /::after$|::before$/.test(s)).map(s => s.replace(/::(after|before)$/, "")));
  // A host is positioned by a rule whose selector ends on its first class (« .comm-head .dictate » positions « .dictate.listening »).
  const positioned = [...allCss.matchAll(/([^{}]+)\{[^}]*position:\s*(?:relative|absolute|fixed|sticky)/g)]
    .flatMap(m => m[1].split(",").map(s => s.trim().split(/\s+/).pop()).filter(s => !s.includes("::")));
  const unpositioned = hosts.filter(h => { const first = (h.match(/^[.#][\w-]+/) || [h])[0]; return !positioned.some(p => p === h || p === first || p.startsWith(first + ".") || p.startsWith(first + ":")); });
  check("every hit area wider than its button has a positioned host", hosts.length >= 3 && unpositioned.length === 0, unpositioned.join(", "));
  check("the finding's next button is one of them", hosts.includes(".hf-next") && /\.hf-next \{[^}]*position: relative/.test(homeCss));
  check("a screen switch never waits forever for a frame (it used to keep the old screen, in its old language)",
    /let done = false;[\s\S]{0,200}startViewTransition\(run\)[\s\S]{0,200}skipTransition\(\)[\s\S]{0,40}run\(\);[\s\S]{0,20}\}, 500\)/.test(core));
}

/* ---------- The styles: the calm path, the type floor, no green ---------- */
{
  const css = read("css/moments.css");
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, negative = false;
  for (const ch of noComments) { if (ch === "{") depth++; if (ch === "}") { depth--; if (depth < 0) negative = true; } }
  check("moments.css closes what it opens", depth === 0 && !negative, String(depth));
  const tiny = [...noComments.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem", tiny.length === 0, tiny.map(m => m[0]).join());
  const calm = noComments.split("@media (prefers-reduced-motion: reduce)").length - 1;
  check("each of the four blocks has its calm path", calm >= 4, String(calm));
  const still = noComments.slice(noComments.indexOf("@media (prefers-reduced-motion: reduce)"));
  check("reduced motion: a still, faint wisp, and the line without its spring", /\.lc-w \{ animation: none; \}/.test(still) && /\.lc-w:not\(:first-child\) \{ display: none; \}/.test(still) &&
    /\.cc-milestone\.on \{ transition: opacity/.test(still));
  check("hidden, the steam stops", /html\.steam-still \.lc-w, html\.steam-still \.lc-w svg \{ animation-play-state: paused; \}/.test(noComments));
  const hue = hex => {
    const v = hex.length === 4 ? hex.slice(1).split("").map(c => parseInt(c + c, 16)) : [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = v.map(x => x / 255), max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 0.08) return null;
    const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    return (h * 60 + 360) % 360;
  };
  const colours = [...(noComments + read("js/ui-celebrate.js")).matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map(m => m[0]);
  const green = colours.filter(c => { const h = hue(c); return h !== null && h > 70 && h < 170; });
  check("no green, the beans are browns and the accent", green.length === 0 && !/\bgreen\b/i.test(noComments) && colours.length >= 4, green.join());
}

/* ---------- Both languages ---------- */
{
  const fr = read("js/i18n.fr.js") + read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const used = new Set();
  for (const f of ["js/ui-celebrate.js"]) for (const m of read(f).matchAll(/I18N\.t\("([a-z0-9_]+)"/g)) used.add(m[1]);
  ["streak_title", "streak_pending"].forEach(k => used.add(k));
  const missing = [...used].filter(k => !new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(fr) || !new RegExp("^\\s*" + k + ": ", "m").test(en));
  check("every text of the moments exists in French and in English", used.size > 15 && missing.length === 0, missing.join(", "));
  const enObj = new Function(en + "\nreturn I18N_EN;")();
  check("the tile's title has its English", enObj.UI["Séries et paliers"] === "Streaks and milestones" && enObj.UI["sur tout ton carnet"]);
  check("the English line reads", enObj.T.ms_line === "{x}!" && enObj.T.ms_cups === "{n}th cup");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
