/* Tests of the STOCK group (v9.18): « Mes cafés » as a page with its shelf
 * (O2), the entry's jars, the end of a bag (Q9), the next cup (B1) and the
 * grinder dial that turns to a prefilled setting.
 *
 *   node tools/stock.test.mjs
 *
 * The decisions are pure, in js/bags.js: loaded here with the layers it
 * reads (GRIND, the diagnostics' levers, TUNING), as the browser loads
 * classic scripts, then asked. The rest are checks of the page and the
 * sources, for what a fake DOM cannot show: where the pieces sit, that every
 * movement has its calm path, that the reprise of a bag is never stored. */

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

const SCRIPTS = ["js/legacy-names.js", "js/tools.js", "js/grind.js", "js/recipes.js", "js/tuning.js", "js/bags.js"];
const { BAGS, GRIND } = new Function(SCRIPTS.map(read).join("\n") + "\nreturn { BAGS, GRIND, TUNING };")();

// ---------- The end of a bag ----------
{
  const g = (grams, dose, bag) => ({ grams, dose, bag: bag || 250, remaining: grams });
  check("a bag with less than one dose is spent", BAGS.isSpent(g(14, 15)) && BAGS.isSpent(g(0, 15)));
  check("one dose left is still a cup", !BAGS.isSpent(g(15, 15)) && !BAGS.isSpent(g(120, 15)));
  check("without a usual dose, only an empty bag is spent", BAGS.isSpent(g(0, 0)) && !BAGS.isSpent(g(3, 0)));
  check("no gauge (no bag size known), nothing to end", BAGS.isSpent(null) === false);
}

// ---------- The shelf ----------
{
  const c = (id, active, name) => ({ id, name: name || id, active });
  const g = (grams, bag, dose) => ({ grams, bag, dose: dose || 15, remaining: grams });
  check("an archived coffee is finished, whatever its bag says", BAGS.shelfOf(c("a", 0), g(200, 250)) === "done");
  check("an active coffee with a spent bag is to buy again", BAGS.shelfOf(c("a", 1), g(9, 250)) === "rebuy");
  check("an active coffee of unknown size stays open", BAGS.shelfOf(c("a", 1), null) === "open");
  const items = [
    { coffee: c("full", 1), gauge: g(240, 250), day: 2, lastCup: "2026-10-01T08:00" },
    { coffee: c("half", 1), gauge: g(100, 250), day: 9, lastCup: "2026-10-03T08:00" },
    { coffee: c("unknown", 1), gauge: null, day: null, lastCup: "" },
    { coffee: c("tie-old", 1), gauge: g(50, 250), day: 20, lastCup: "2026-10-02T08:00" },
    { coffee: c("tie-new", 1), gauge: g(50, 250), day: 3, lastCup: "2026-10-02T09:00" },
    { coffee: c("emptyA", 1), gauge: g(0, 250), day: 30, lastCup: "2026-09-20T08:00" },
    { coffee: c("emptyB", 1), gauge: g(4, 200), day: 25, lastCup: "2026-10-03T07:00" },
    { coffee: c("gone1", 0), gauge: g(0, 250), day: null, lastCup: "2026-08-01T08:00" },
    { coffee: c("gone2", 0), gauge: g(190, 250), day: null, lastCup: "2026-09-01T08:00" },
  ];
  const r = BAGS.shelves(items);
  const ids = list => list.map(it => it.coffee.id).join(",");
  check("open: the most advanced bag first, the oldest opening on a tie, unknown sizes last",
    ids(r.open) === "tie-old,tie-new,half,full,unknown", ids(r.open));
  check("to buy again: the latest emptied first", ids(r.rebuy) === "emptyB,emptyA", ids(r.rebuy));
  check("finished: the latest drunk first", ids(r.done) === "gone2,gone1", ids(r.done));
  check("every coffee lands on exactly one row", r.open.length + r.rebuy.length + r.done.length === items.length);

  const jars = BAGS.entryJars(items, 6);
  check("the entry's jars: active coffees with beans left only", ids(jars) === "emptyB,tie-old,tie-new,half,full",
    ids(jars));
  check("a bag under one dose is still offered (a smaller cup is a cup), an empty one is not",
    jars.some(it => it.coffee.id === "emptyB") && !jars.some(it => it.coffee.id === "emptyA"));
  check("the entry's jars are capped", BAGS.entryJars(items, 2).length === 2);
}

// ---------- Where the last bag stopped ----------
{
  const exts = [
    { id: "1", coffee_id: "x", date_time: "2026-10-01T08:00", recipe: "A" },
    { id: "2", coffee_id: "x", date_time: "2026-10-03T08:00", recipe: "B", failed: 1 },
    { id: "3", coffee_id: "x", date_time: "2026-10-02T08:00", recipe: "C" },
    { id: "4", coffee_id: "y", date_time: "2026-10-04T08:00", recipe: "D" },
  ];
  check("the resume reads the latest cup of the coffee", BAGS.resumeCup(exts, "x").id === "3");
  check("a botched cup is not where a bag stopped", BAGS.resumeCup(exts, "x").id !== "2");
  check("no cup, no resume", BAGS.resumeCup(exts, "z") === null);
  const bagOf = (id, when) => ({ id: String(when) >= "2026-10-02" ? "new" : "old" });
  const rated = [{ coffee_id: "x", date_time: "2026-10-02T08:00", score_10: 7 }, { coffee_id: "x", date_time: "2026-10-03T08:00", score_10: 8 },
    { coffee_id: "x", date_time: "2026-10-03T09:00", score_10: "" }, { coffee_id: "x", date_time: "2026-10-01T08:00", score_10: 2 }];
  const cups = BAGS.bagCups(rated, "x", "new", bagOf);
  check("the cups of a bag are those its date gives it", cups.n === 3 && cups.rated === 2 && cups.average === 7.5, JSON.stringify(cups));
}

// ---------- B1, the next cup ----------
{
  const cup = (id, day, score, extra) => ({ id, coffee_id: "c", method: "Switch", recipe: "Chronicler", dose_g: 15, water_g: 240,
    grind_dial: "1.4.2", temperature_c: 92, heat_level: "", preheated_water: "", diagnostic: "", failed: "",
    date_time: "2026-10-" + String(day).padStart(2, "0") + "T08:00", score_10: score, ...(extra || {}) });
  const steps = { step_clicks: 2, step_degrees: 2, step_heat: 1, step_water_g: 15, step_dose_g: 1 };

  check("no rated cup, no card", BAGS.nextCup([cup("a", 1, "")], { steps }) === null);

  const fix = BAGS.nextCup([cup("a", 1, 7, { diagnostic: "Équilibré" }), cup("b", 2, 6.5, { diagnostic: "Un peu amer" })], { steps, threshold: 9 });
  check("a diagnostic to fix: keep the last setting, change ONE thing", fix.kind === "fix" && fix.base.id === "b" && !!fix.change);
  check("the grind first, with the correction steps of Settings (bitter: two clicks coarser)",
    fix.change.lever === "grind" && fix.change.from === "1.4.2" && fix.change.to === "1.4.4", JSON.stringify(fix.change));
  const target = BAGS.nextCupSettings(fix);
  check("the prefill carries the one lever moved and nothing else",
    target.grind_dial === "1.4.4" && target.temperature_c === 92 && target.recipe === "Chronicler" && target.id === "b");
  check("« sur N tasses » counts the rated cups read", fix.n === 2);

  const ground = BAGS.nextCup([cup("a", 1, 6, { diagnostic: "Un peu amer", grind_dial: "" })], { steps, ground: true, threshold: 9 });
  check("a pre-ground coffee has no grind: the temperature comes next",
    ground.kind === "fix" && ground.change.lever === "temperature" && ground.change.to === 90, JSON.stringify(ground.change));

  const locked = BAGS.nextCup([cup("a", 1, 8), cup("b", 2, 8.5), cup("c", 3, 6, { grind_dial: "1.5.0", diagnostic: "Un peu acide" })], { steps, threshold: 7 });
  check("two cups above his average at one setting: réglage verrouillé", locked.kind === "locked" && locked.locked === true && locked.change === null);
  check("the lock brews from its best cup", locked.base.id === "b");
  const notLocked = BAGS.nextCup([cup("a", 1, 8), cup("b", 2, 8.5, { temperature_c: 96 })], { steps, threshold: 7 });
  check("on the Switch, another temperature is another setting", notLocked.kind !== "locked");
  const oneAbove = BAGS.nextCup([cup("a", 1, 8), cup("b", 2, 6)], { steps, threshold: 7 });
  check("one cup above the average does not lock", oneAbove.kind !== "locked");

  const confirm = BAGS.nextCup([cup("a", 1, 6), cup("b", 2, 7.5)], { steps, threshold: 9 });
  check("the last one at the coffee's level, nothing to fix: the same again, to confirm",
    confirm.kind === "confirm" && confirm.base.id === "b" && confirm.change === null);
  const back = BAGS.nextCup([cup("a", 1, 8), cup("b", 2, 5)], { steps, threshold: 9 });
  check("the last one below, no diagnostic to say why: back to the best cup", back.kind === "back" && back.base.id === "a");

  const machines = BAGS.nextCup([cup("a", 1, 9, { method: "Brikka", heat_level: 3 }), cup("b", 2, 7)], { steps, threshold: 9 });
  check("only the machine of the latest cup is read", machines.n === 1 && machines.base.method === "Switch");
  const botched = BAGS.nextCup([cup("a", 1, 7), cup("b", 2, 2, { failed: 1, diagnostic: "Sur-extrait (amer)" })], { steps, threshold: 9 });
  check("a botched cup advises nothing", botched.base.id === "a" && botched.n === 1);
  check("the lock key holds the levers of the winning setting, and the Switch temperature",
    BAGS.lockKey(cup("a", 1, 7)) !== BAGS.lockKey(cup("a", 1, 7, { temperature_c: 94 })) &&
    BAGS.lockKey(cup("a", 1, 7, { method: "Brikka", temperature_c: 90 })) === BAGS.lockKey(cup("a", 1, 7, { method: "Brikka", temperature_c: 99 })));
}

// ---------- The dial that turns ----------
{
  const f = BAGS.dialFrames(75, 72, 520, 34);
  check("a few clicks tick by one by one", f.join(",") === "74,73,72", f.join(","));
  const far = BAGS.dialFrames(0, 150, 520, 26);
  check("a long way takes bigger strides and fits the time", far.length <= 20 && far[far.length - 1] === 150 &&
    far.every((x, i) => i === 0 || x > far[i - 1]), far.join(","));
  check("no way, no frame", BAGS.dialFrames(60, 60).length === 0 && BAGS.dialFrames("x", 3).length === 0);
  check("the frames are clicks the grinder knows", far.every(c => GRIND.dialFromClicks(c)));
}

// ---------- The page ----------
{
  const html = read("index.html");
  const rail = html.slice(html.indexOf('<nav class="rail"'), html.indexOf("</nav>"));
  check("« Mes cafés » is a screen of its own", html.includes('<section id="screen-coffees" class="screen">'));
  check("the window it replaced is gone", !html.includes('id="modal-coffees"'));
  check("the rail leads to it, right after the history",
    rail.indexOf('data-screen="coffees"') > rail.indexOf('data-screen="history"') && rail.indexOf('data-screen="coffees"') < rail.indexOf('data-screen="tuning"'));
  const page = html.slice(html.indexOf('<section id="screen-coffees"'), html.indexOf("</section>", html.indexOf('<section id="screen-coffees"')));
  check("the coffee and bag forms, and their lists, moved into the page",
    ["form-coffee", "form-bag", "list-species", "list-processes", "coffee-new", "coffees-list"].every(id => page.includes('id="' + id + '"')));
  const block = html.slice(html.indexOf('<section class="entry-block">'), html.indexOf('<div class="entry-head">'));
  check("the entry's jars sit above the coffee menu", block.includes('id="coffee-jars"') && html.includes('<select id="f-coffee"></select>'));
  const core = read("js/ui-core.js");
  check("the screen is known to the navigation", /const SCREEN_NAMES = \[[^\]]*"coffees"/.test(core) && core.includes('nav.screenName === "coffees") UI.renderCoffeeList()'));
  check("on the phone it lights « Plus »", /coffees: "plus"/.test(read("js/ui-nav.js")));
  check("Ctrl K offers it", read("js/ui-palette.js").includes('["coffees", "G C",'));
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map(m => m[1]);
  check("its sheet loads right after finishing.css", links.indexOf("css/stock.css") === links.indexOf("css/finishing.css") + 1, links.join(", "));
  const sw = read("sw.js");
  check("and everything new is precached", ["./css/stock.css", "./js/bags.js", "./js/ui-coffees.js", "./js/ui-bag-end.js"].every(u => sw.includes('"' + u + '"')));
  const old = ["UI.openCoffeesModal()"].filter(s => read("js/ui-drawings.js").includes(s) || read("js/ui-empty.js").includes(s));
  check("the old window's callers open the page (its name stays as an alias)",
    old.length === 0 || read("js/ui-coffees.js").includes("const openCoffeesModal = openCoffeesPage;"));
}

// ---------- The behaviours that must not drift ----------
{
  const entry = read("js/ui-entry.js"), dial = read("js/ui-dial.js"), end = read("js/ui-bag-end.js"), coffees = read("js/ui-coffees.js");
  check("every prefill turns the dial, at the one place they all go through",
    entry.includes("if (isDuplicate) UI.turnGrindDial(grindBefore);") && entry.includes("const grindBefore = $(\"#f-grind\").value;"));
  check("the dial jumps under reduced motion or on a hidden page", dial.includes("calm() || pageHidden()) return;"));
  check("a gesture on the dial ends a turn under way", dial.includes("endTurn(inst);\n    const next = stepDial"));
  check("the reprise of a bag prefills once, through « Refaire », and stores nothing",
    end.includes("UI.redoCup(last);") && end.includes('toast(I18N.t("setting_prefilled"));') &&
    !/editCoffee\([^)]*recommended_(recipe|method)/.test(end));
  check("opening a bag goes through the same purchase as the « Nouveau sachet » form", end.includes("await DATA.addPurchase({ coffee_id: id, purchase_date: today"));
  check("« Ranger ce café » archives, it deletes nothing", end.includes("await DATA.editCoffee(id, { ...c, active: 0 });") && !/delete(Purchase|Extraction|Coffee)/.test(end));
  check("the menu stays the truth: a jar writes it and replays its change event",
    coffees.includes('sel.dispatchEvent(new Event("change", { bubbles: true }));'));
  check("a frozen page never keeps the sheet from opening or closing", coffees.includes("t.skipTransition()"));
}

// ---------- The styles ----------
{
  // The comments say what the rules do, in words that may name a colour: only the rules count.
  const css = read("css/stock.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const animated = [...css.matchAll(/^([^{@}\n][^{}\n]*)\{[^}]*\banimation:(?!\s*none)[^;]+;/gm)].map(m => m[1].trim())
    .filter(sel => !sel.startsWith("::view-transition"));
  const calmMissing = animated.flatMap(sel => sel.split(",").map(s => s.trim())).filter(s => !reduced.includes(s));
  check("every movement of the sheet stops under reduced motion", animated.length > 5 && calmMissing.length === 0, calmMissing.join(" | "));
  const small = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75).map(m => m[0]);
  check("no text under 0.75rem", small.length === 0, small.join(", "));
  const greens = [...css.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => m[1]).filter(h => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return g > r && g > b;
  });
  check("no green, not even in the kraft of a bag", greens.length === 0 && !/\bgreen\b/i.test(css), greens.join(", "));
  const targets = [".cf-count", ".cj-tile", ".be-actions .btn-small"].every(s => new RegExp(s.replace(/\./g, "\\.") + "[^{]*\\{[^}]*min-height: 44px").test(css));
  check("the new controls are touch targets of 44 px", targets);
}

// ---------- The words ----------
{
  const fr = read("js/i18n.fr.js"), en = read("js/i18n.en.js");
  const src = ["js/ui-coffees.js", "js/ui-bag-end.js", "js/ui-coffee-sheet.js"].map(read).join("\n");
  // A key built from a prefix ("nc_why_" + kind) is listed whole below.
  const keys = [...new Set([...src.matchAll(/I18N\.t\("([a-z_]+)"/g)].map(m => m[1]))].filter(k => !k.endsWith("_"));
  const dynamic = ["nc_what_locked", "nc_what_confirm", "nc_what_back", "nc_why_locked", "nc_why_fix", "nc_why_confirm", "nc_why_back",
    "cf_row_open", "cf_row_rebuy", "cf_row_done"];
  const missing = [...keys, ...dynamic].filter(k => !new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(fr) || !new RegExp("^\\s*" + k + ": ", "m").test(en));
  check("every new sentence exists in French and in English", keys.length > 30 && missing.length === 0, missing.join(", "));
  const block = fr.slice(fr.indexOf("// stock (v9.18)"));
  check("the visible words say « tu », never « vous »", !/\bvous\b|\bvotre\b|\bvos\b/i.test(block));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
