/* Tests of the SHELF group (v9.31): « Mes cafés » back to its rows one under
 * the other, filled with the figures around the jars (js/ui-shelf.js).
 *
 *   node tools/shelf.test.mjs
 *
 * The figures are pure, in js/bags.js: loaded here with the layers it reads,
 * as the browser loads classic scripts, then asked. The rest are checks of
 * the page and the sources: the columns of v9.25 are gone, every piece is
 * wired, every movement has its calm path, every word its two languages. */

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
const { BAGS } = new Function(SCRIPTS.map(read).join("\n") + "\nreturn { BAGS };")();

// ---------- Days ----------
{
  check("days count on the calendar", BAGS.daysBetween("2026-10-01", "2026-10-09") === 8);
  check("a date_time counts by its day", BAGS.daysBetween("2026-10-09T23:50", "2026-10-10T00:10") === 1);
  check("across a month and a year", BAGS.daysBetween("2026-09-30", "2026-10-01") === 1 && BAGS.daysBetween("2026-12-31", "2027-01-01") === 1);
  check("an unknown day gives nothing", BAGS.daysBetween("", "2026-10-01") === null && BAGS.daysBetween("2026-10-01", "nope") === null);
}

// ---------- The cups left ----------
{
  check("the cups left round down", BAGS.cupsLeft(186, 15) === 12 && BAGS.cupsLeft(45, 15) === 3);
  check("exactly one dose is one cup", BAGS.cupsLeft(15, 15) === 1);
  check("under one dose, none", BAGS.cupsLeft(14.9, 15) === 0);
  check("an empty jar or no dose, none", BAGS.cupsLeft(0, 15) === 0 && BAGS.cupsLeft(-8, 15) === 0 && BAGS.cupsLeft(100, 0) === 0 && BAGS.cupsLeft("", 15) === 0);
}

// ---------- The pace and the end of the bag ----------
{
  const cup = (day, grams) => ({ date_time: day + "T08:00", grams });
  const p = BAGS.pace([cup("2026-10-01", 15), cup("2026-10-03", 15), cup("2026-10-05", 15), cup("2026-10-07", 15)], "2026-10-01", "2026-10-09");
  check("the pace: the grams since the opening over its days, today included", p && Math.abs(p.perDay - 60 / 9) < 1e-9 && p.days === 9 && p.cups === 4, JSON.stringify(p));
  const old = [];
  for (let d = 1; d <= 30; d++) old.push(cup("2026-09-" + String(d).padStart(2, "0"), d <= 9 ? 30 : 10));
  const w = BAGS.pace(old, "2026-09-01", "2026-09-30");
  check("an old bag: only the last three weeks count", w && w.days === 21 && Math.abs(w.perDay - 10) < 1e-9, JSON.stringify(w));
  check("the window can be chosen", BAGS.pace(old, "2026-09-01", "2026-09-30", 7).days === 7);
  check("a single cup is not a pace", BAGS.pace([cup("2026-10-08", 15)], "2026-10-08", "2026-10-09") === null);
  check("a bag left aside for weeks has none", BAGS.pace([cup("2026-08-01", 15), cup("2026-08-02", 15)], "2026-08-01", "2026-10-09") === null);
  check("the cups of another day to come do not count", BAGS.pace([cup("2026-10-08", 15), cup("2026-10-12", 15)], "2026-10-01", "2026-10-09") === null);
  check("without an opening, it starts at the window", BAGS.pace([cup("2026-10-08", 15), cup("2026-10-09", 15)], "", "2026-10-09").days === 21);
  check("no today, no pace", BAGS.pace([cup("2026-10-08", 15), cup("2026-10-09", 15)], "", "") === null);

  check("the end: the grams left at that pace, rounded up to a day", BAGS.finishDay(186, 5, "2026-10-09") === "2026-11-16");
  check("a day and a half of coffee ends the second day", BAGS.finishDay(15, 10, "2026-10-09") === "2026-10-11");
  check("across the year", BAGS.finishDay(100, 10, "2026-12-25") === "2027-01-04");
  check("an empty jar ends today", BAGS.finishDay(0, 10, "2026-10-09") === "2026-10-09");
  check("without a pace, no end", BAGS.finishDay(100, 0, "2026-10-09") === null && BAGS.finishDay(100, null, "2026-10-09") === null);
}

// ---------- The strip at the top ----------
{
  const g = (grams, dose) => ({ gauge: { grams, dose, bag: 250 } });
  const t = BAGS.stockTotals([g(186, 15), g(190, 12.5), g(8, 15), { gauge: null }, g(-5, 15)]);
  check("the stock: the grams of every known bag, never below zero", t.grams === 384 && t.bags === 4, JSON.stringify(t));
  check("and the cups they make, each at its own dose", t.cups === 12 + 15, JSON.stringify(t));
  check("an empty shelf is zero", JSON.stringify(BAGS.stockTotals([])) === '{"grams":0,"cups":0,"bags":0}');

  const bags = [
    { purchase_date: "2026-10-02", price_vnd: 320000 },
    { purchase_date: "2026-10-05", price_vnd: "" },
    { purchase_date: "2026-09-30", price_vnd: 125000 },
    { purchase_date: "2025-10-03", price_vnd: 90000 },
  ];
  const m = BAGS.monthSpend(bags, "2026-10-09");
  check("the month's money: this month's bags with a price", m.total === 320000 && m.priced === 1 && m.bags === 2, JSON.stringify(m));
  check("last year's same month does not count", BAGS.monthSpend(bags, "2025-10-20").total === 90000);
  check("a month without a bag", JSON.stringify(BAGS.monthSpend(bags, "2026-11-01")) === '{"total":0,"bags":0,"priced":0}');

  const cost = BAGS.cupCost([{ grams: 15, price: 125000, size: 250 }, { grams: 20, price: 87000, size: 250 }, { grams: 15, price: "", size: 250 }, { grams: 15, price: 1000, size: 0 }]);
  check("the price of a cup: each at its bag's price per gram, the unknown ones left out", Math.abs(cost - (7500 + 6960) / 2) < 1e-9, String(cost));
  check("no price anywhere, no figure (never a free cup)", BAGS.cupCost([{ grams: 15, price: "", size: 250 }]) === null && BAGS.cupCost([]) === null);
}

// ---------- The page ----------
{
  const html = read("index.html"), css = read("css/stock.css"), coffees = read("js/ui-coffees.js"), shelf = read("js/ui-shelf.js");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("the columns of v9.25 are gone: no frame, no container query", !html.includes("cf-frame") && !/@container|container:/.test(rules));
  check("the shelf is a list of rows one under the other", html.includes('<div id="coffees-list" class="cf-shelves"></div>') && /\.cf-shelves \{ display: grid; gap: 28px; \}/.test(rules));
  check("no rule places a row in a column any more", !/\.cf-row-(open|rebuy|done) \{[^}]*grid-(column|row): (1|2);/.test(rules));
  const tags = [...html.matchAll(/<script defer src="(js\/[^"?]+)/g)].map(m => m[1]);
  check("the new file loads right after the shelf's", tags.indexOf("js/ui-shelf.js") === tags.indexOf("js/ui-coffees.js") + 1);
  check("and is precached", read("sw.js").includes('"./js/ui-shelf.js"'));
  check("the strip at the top, then the three rows", /cf-top[\s\S]*UI\.shelfSummary\(r\)[\s\S]*row\("open"[\s\S]*row\("rebuy"[\s\S]*row\("done"/.test(coffees));
  check("an open jar is a card, its jar a button that keeps the morph and the tilt", coffees.includes("UI.shelfOpenCard(it, i, stats, open +") && coffees.includes('class="cf-jar'));
  check("the card unfolds into the sheet, its jar flies", coffees.includes('el.closest(".cf-card")') && /vtName\(card, "cf-sheet"\)/.test(coffees) && /vtName\(art, "cf-jar"\)/.test(coffees));
  check("going back finds the jar, never a ribbon of the frise", coffees.includes(".cf-jar[data-sheet=\"' + id + '\"], #coffees-list .be-jar[data-sheet="));
  check("every finished tile shows its name, its average and its dates", coffees.includes('<b class="cf-name">') && shelf.includes("cf_done_avg") && shelf.includes("cf_done_span"));
  check("a name holds on two lines, then an ellipsis", /\.cf-name \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden;/.test(rules) && /\.cf-card-open \{[^}]*-webkit-line-clamp: 2;/.test(rules));
  check("« Voir les N autres » only when there are others", coffees.includes("more.hidden = !extra;"));
  check("« Refaire » goes through the prefill of every « Refaire »", shelf.includes("UI.redoCup(ext);") && shelf.includes('UI.toast(I18N.t("setting_prefilled"));'));
  check("under « À racheter », where the bag came from and what it cost", coffees.includes("meta: UI.shelfRebuyMeta(it.coffee.id)") && read("js/ui-bag-end.js").includes('(o.meta || "")'));
  check("the frise is drawn at its real width, and again when it changes", shelf.includes("new ResizeObserver") && /viewBox", "0 0 " \+ W/.test(shelf));
  check("the frise text keeps the site's floor", /\.cf-frise-svg text \{ font-size: 12px; \}/.test(rules));
  check("on a phone the jars come before the frise", /@media \(max-width: 560px\)[\s\S]*\.cf-top \{ display: contents; \}[\s\S]*\.cf-frise \{ order: 9; \}/.test(rules));
  const reduced = rules.slice(rules.indexOf("@media (prefers-reduced-motion: reduce)"));
  check("every new movement has its calm path", [".cf-arrive .cf-sum-tile", ".cf-arrive .cf-card", ".cf-arrive .cf-jar.is-done", ".cf-arrive .cf-frise .dw-ribbon-block"].every(s => reduced.includes(s)));
  check("the figures count up only when the page arrives in motion", /if \(arriving && !calm\(\) && !hidden\(\)\)[\s\S]{0,260}UI\.shelfCountUp\(zone\)/.test(coffees));
  check("the « Refaire » of a card is a touch target", /\.cf-redo \{[^}]*min-height: 44px;/.test(rules));
  const small = [...rules.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(x => Number(x[1]) < 0.75);
  check("no text under 0.75rem", small.length === 0, small.map(x => x[0]).join(", "));
}

// ---------- The words ----------
{
  const fr = read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const src = read("js/ui-shelf.js");
  const keys = [...new Set([...src.matchAll(/I18N\.t\("([a-z_]+)"/g)].map(m => m[1]))]
    .concat(["cf_sum_stock", "cf_sum_cups", "cf_sum_month", "cf_sum_cup", "cf_best", "cf_best_cup", "cf_fact_left", "cf_fact_pace", "cf_fact_end",
      "cf_sum_month_sub", "cf_sum_month_none", "cf_sum_month_unpriced", "cf_sum_cup_sub", "cf_sum_cup_none", "cf_rebuy_bag", "cf_rebuy_bag_noprice"]);
  const all = read("js/i18n.fr.js") + fr;
  const missing = keys.filter(k => !new RegExp("^\\s*" + k + ": \\{ fr:", "m").test(all) || !new RegExp("^\\s*" + k + ": ", "m").test(en));
  check("every new sentence exists in French and in English", keys.length > 25 && missing.length === 0, missing.join(", "));
  const block = fr.slice(fr.indexOf("// shelf (v9.31)"));
  check("the visible words say « tu », never « vous »", block.length > 100 && !/\bvous\b|\bvotre\b|\bvos\b/i.test(block));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
