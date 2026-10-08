/* Tests of the aside group (v9.29): the entry's recipe card follows the form,
 * and sets the recipe next to what its author recommends.
 *
 *   node tools/aside.test.mjs
 *
 * The pure parts of js/recipes.js (the sources, the ratio, where a value
 * leaves the source, the water the steps are written for) run here without a
 * browser, then js/ui-recipe-source.js with a stub of the interface core (the
 * skeleton the live patch compares, the recipe « Garder » writes, the table).
 * Last, the hooks in the page and the files. boot.test.mjs runs the site. */

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

/* ---------- The layers ---------- */

const I18N = { t: (k, v) => k + (v ? JSON.stringify(v) : ""), tr: t => t, locale: () => "fr-FR" };
const R = new Function("I18N", read("js/tools.js") + "\n" + read("js/recipes.js") +
  "\nreturn { TOOLS, STARTER_RECIPES, TEMP_BY_ROAST, RECIPE_SOURCES, recipeSource, ratioOf, sourceTemperature, sourceGaps, stepsWater, pourFactor, scalePours, temperatureForCoffee, POUR_THRESHOLD_G };")(I18N);
const { STARTER_RECIPES, RECIPE_SOURCES, recipeSource, ratioOf, sourceTemperature, sourceGaps, stepsWater, pourFactor, scalePours } = R;
const seed = id => JSON.parse(JSON.stringify(STARTER_RECIPES.find(r => r.id === id)));
const coffee = roast => ({ id: "c", roast });

/* ---------- The sources: only what the file cites ---------- */
{
  const ids = Object.keys(RECIPE_SOURCES);
  check("every source belongs to an original recipe", ids.every(id => STARTER_RECIPES.some(r => r.id === id)), ids.join(", "));
  check("every source names its author", ids.every(id => String(RECIPE_SOURCES[id].by || "").length > 3));
  const none = STARTER_RECIPES.filter(r => !recipeSource(r)).map(r => r.id).sort();
  check("the Brikka ones and Le Costaud have no source: Chris's own, nothing invented",
    JSON.stringify(none) === JSON.stringify(["brikka-classique", "brikka-classique-bouillante", "brikka-flatwhite", "costaud-bloom", "costaud-immersion"]), none.join(", "));
  const s = id => RECIPE_SOURCES[id];
  check("One and Done: Lance Hedrick, 15 g / 225 g, 1:15", s("one-and-done").dose === 15 && s("one-and-done").water === 225 && ratioOf(15, 225) === 15 && /Hedrick/.test(s("one-and-done").by));
  check("Better 1 Cup: Hoffmann, 15 g / 250 g", s("hoffmann-1cup").dose === 15 && s("hoffmann-1cup").water === 250 && /Hoffmann/.test(s("hoffmann-1cup").by));
  check("Tetsu 4:6: Philocoffea, 20 g / 300 g, 93 88 83 °C by roast",
    s("tetsu-devil").dose === 20 && s("tetsu-devil").water === 300 && /Philocoffea/.test(s("tetsu-devil").by) &&
    ["Claire", "Medium", "Foncée"].map(t => sourceTemperature("tetsu-devil", coffee(t))).join() === "93,88,83");
  check("the Chronicler and its Sweet: 15 g / 240 g, 92 °C", ["chronicler", "sweet"].every(id => s(id).dose === 15 && s(id).water === 240 && s(id).temp === 92));
  check("the Sherrycipe: no temperature, its source gives none", s("sherrycipe").temp === null && sourceTemperature("sherrycipe", coffee("Medium")) === "");
  check("the Tetsu Devil says its figures come from summaries", s("devil-switch").unchecked === true && s("devil-switch").water === 280);
  /* A source that differs from the original recipe must be CITED in it: its
     note carries « Sa version : 20 g, 300 g » (or the figures of the source). */
  const cited = ids.filter(id => { const r = seed(id), x = s(id); return x.dose !== r.dose || x.water !== r.water; })
    .every(id => { const note = seed(id).note; return note.includes(s(id).dose + " g") && note.includes(s(id).water + " g") && /Source|Sa version/.test(note); });
  check("a source that leaves the original recipe is cited in its note", cited);
  check("a source that matches the original recipe matches it figure for figure",
    ids.filter(id => ["chronicler", "sweet", "hoffmann-1cup", "one-and-done", "sherrycipe"].includes(id))
      .every(id => s(id).dose === seed(id).dose && s(id).water === seed(id).water));
  check("recipeSource reads a recipe or an id, null for none", recipeSource("sweet") === s("sweet") && recipeSource(seed("sweet")) === s("sweet") &&
    recipeSource("r12") === null && recipeSource(null) === null && recipeSource("toString") === null);
}

/* ---------- The ratio ---------- */
{
  check("water over dose to one decimal", ratioOf(15, 250) === 16.7 && ratioOf(15, 240) === 16 && ratioOf("20", "300") === 15);
  check("a missing or zero figure gives no ratio", ratioOf("", 250) === "" && ratioOf(15, "") === "" && ratioOf(0, 250) === "");
}

/* ---------- Where Chris leaves the source ---------- */
{
  const oad = seed("one-and-done");
  check("the original recipe is the source: no gap", !sourceGaps(oad, { dose: 15, water: 225, temp: 92 }, null).any);
  const g = sourceGaps(oad, { dose: 15, water: 250, temp: 92 }, null);
  check("250 g where Hedrick says 225: the water and the ratio leave it, not the dose", g.water && g.ratio && !g.dose && !g.temp && g.any);
  check("a figure typed as text counts", sourceGaps(oad, { dose: "15", water: "225", temp: "92" }, null).any === false);
  check("inside the author's range is not a gap, outside is",
    !sourceGaps(oad, { temp: 90 }, null).temp && !sourceGaps(oad, { temp: 93 }, null).temp && sourceGaps(oad, { temp: 95 }, null).temp);
  check("with the coffee's roast, one degree around the table's figure",
    !sourceGaps(oad, { temp: 88 }, coffee("Foncée")).temp && !sourceGaps(oad, { temp: 89 }, coffee("Foncée")).temp && sourceGaps(oad, { temp: 92 }, coffee("Foncée")).temp);
  const t46 = seed("tetsu-devil");
  const gt = sourceGaps(t46, { dose: 15, water: 250, temp: 88 }, coffee("Medium"));
  check("the Tetsu 4:6 as the site carries it leaves Tetsu's 20 g / 300 g, not his 88 °C on a medium", gt.dose && gt.water && gt.ratio && !gt.temp);
  check("a hotter 4:6 on a medium is a gap", sourceGaps(t46, { temp: 93 }, coffee("Medium")).temp);
  check("same ratio, other quantities: the ratio is not a gap", !sourceGaps(t46, { dose: 16, water: 240 }, null).ratio);
  check("nothing typed is never a gap", !sourceGaps(oad, { dose: "", water: "", temp: "" }, null).any && !sourceGaps(oad, null, null).any);
  check("no temperature at the source, no temperature gap", !sourceGaps(seed("sherrycipe"), { temp: 99 }, null).temp);
  check("a recipe without a source has no gap", !sourceGaps(seed("costaud-bloom"), { dose: 99, water: 1 }, null).any);
}

/* ---------- The steps follow the water they are written for ---------- */
{
  const oad = seed("one-and-done");
  check("the original's steps are written for its water", stepsWater(oad) === 225 && pourFactor(oad, 225) === 1);
  // Settings set the water to 250 without touching the steps: they still say 225.
  const set = { ...oad, water: 250 };
  check("water changed in Settings, steps untouched: still written for 225", stepsWater(set) === 225);
  check("so a 250 g cup scales them, where it used to leave « jusqu'à 225 g »",
    scalePours(set.steps[2].text, pourFactor(set, 250)).includes("jusqu'à 250 g") && pourFactor(set, 250) !== 1);
  const own = { ...set, steps: set.steps.map(e => ({ ...e, text: e.text.replace("225 g", "250 g") })) };
  check("steps rewritten by hand are written for the recipe's water", stepsWater(own) === 250 && pourFactor(own, 250) === 1);
  check("a recipe without steps (the 4:6) scales on its water", stepsWater(seed("tetsu-devil")) === 250 && pourFactor(seed("tetsu-devil"), 300) === 1.2);
  check("a personal recipe scales on its water", stepsWater({ id: "r3", water: 200, steps: [{ t: 0, text: "Verser 100 g" }] }) === 200);
  check("no water typed, nothing scales", pourFactor(oad, "") === 1 && pourFactor(oad, 0) === 1 && pourFactor(null, 250) === 1);
  const h = seed("hoffmann-1cup");
  check("Hoffmann at 300 g: the 150 g pour becomes 180 g, the bloom 60 g",
    scalePours(h.steps[2].text, pourFactor(h, 300)) === "Verser jusqu'à 180 g." && /verser 60 g/.test(scalePours(h.steps[0].text, pourFactor(h, 300))));
}

/* ---------- js/ui-recipe-source.js with a stub core ---------- */
const fields = { "f-dose": { value: "15" }, "f-water": { value: "250" }, "f-temp": { value: "92" }, "f-coffee": { value: "" } };
const UI = {
  $: sel => fields[String(sel).replace("#", "")] || null,
  fmtDecimal: (n, d) => Number(n.toFixed(d)).toLocaleString("fr-FR", { maximumFractionDigits: d }),
  toast() {}, toastAction() {}, entry: { method: "Switch" },
  estimatedVolume: (d, w) => Math.max(0, Math.round((w - 2.1 * d) / 5) * 5),
};
const DATA = { state: { coffees: [], recipes: [] } };
new Function("UI", "TOOLS", "I18N", "DATA", "document", "STARTER_RECIPES", "TEMP_BY_ROAST", "recipeSource", "ratioOf", "sourceTemperature", "sourceGaps", "pourFactor", "scalePours", "temperatureForCoffee",
  read("js/ui-recipe-source.js"))(UI, R.TOOLS, I18N, DATA, { addEventListener() {} }, STARTER_RECIPES, R.TEMP_BY_ROAST, recipeSource, ratioOf, sourceTemperature, sourceGaps, pourFactor, scalePours, R.temperatureForCoffee);
const M = UI.recipeSourceMath;
{
  const a = '<td><span data-live="water" class="rs-off">250 g</span></td><b data-live="g" class="step-g">150 g</b>';
  const b = '<td><span data-live="water" class="">225 g</span></td><b data-live="g" class="step-g">135 g</b>';
  check("the skeleton ignores the live figures and their class", M.skeleton(a) === M.skeleton(b));
  check("the skeleton sees a change of structure", M.skeleton(a) !== M.skeleton(a.replace("<td>", "<td class=\"x\">")) && M.skeleton(a) !== M.skeleton(a + "<p>"));

  const kept = M.keptRecipe({ ...seed("one-and-done"), water: 250 }, RECIPE_SOURCES["one-and-done"]);
  check("« Garder » on a recipe set to 250: back to 225, the original steps and texts", kept.water === 225 && kept.dose === 15 &&
    JSON.stringify(kept.steps) === JSON.stringify(seed("one-and-done").steps) && kept.ratioText === seed("one-and-done").ratioText);
  const k46 = M.keptRecipe(seed("tetsu-devil"), RECIPE_SOURCES["tetsu-devil"]);
  check("« Garder » on the 4:6: Tetsu's 20 g / 300 g, and a ratio text that says so",
    k46.dose === 20 && k46.water === 300 && k46.ratioText === "ratio 1:15, environ 260 ml en tasse" && k46.tempText === seed("tetsu-devil").tempText);
  const own = { ...seed("hoffmann-1cup"), water: 300, steps: seed("hoffmann-1cup").steps.map(e => ({ ...e, text: scalePours(e.text, 1.2) })) };
  const kh = M.keptRecipe(own, RECIPE_SOURCES["hoffmann-1cup"]);
  check("« Garder » rewrites steps written for 300 g to the source's 250 g", kh.water === 250 && kh.steps[2].text === "Verser jusqu'à 150 g.");
  check("« Garder » keeps a temperature when the source gives none", M.keptRecipe({ ...seed("sherrycipe"), temp: 94 }, RECIPE_SOURCES.sherrycipe).temp === 94);

  // The table: the form at 250 g on the original One and Done.
  const html = UI.compareHtml(seed("one-and-done"));
  check("the table has this cup, the recipe and the source", /rs_col_now/.test(html) && /rs_col_mine/.test(html) && /rs_col_source/.test(html));
  check("this cup's water is live and marked off the recipe", /<span data-live="water" class="rs-off">250 g<\/span>/.test(html));
  check("the cup follows: its ratio and its volume", /data-live="ratio" class="rs-off">1:16,7</.test(html) && /data-live="cup" class="rs-off">≈ 220 ml</.test(html));
  check("the form leaves the source: « Essayer la source »; the recipe does not: no « Garder »", /data-rs="try"/.test(html) && !/data-rs="keep"/.test(html));
  const edited = UI.compareHtml({ ...seed("one-and-done"), water: 250 });
  check("a recipe set to 250 g: its source cell is tinted, « Garder » is offered", /rs-src rs-gap"><span>225 g/.test(edited) && /data-rs="keep"/.test(edited));
  fields["f-water"].value = "225";
  check("all three agree: no action, « suit la source »", /rs_same/.test(UI.compareHtml(seed("one-and-done"))) && !/data-rs=/.test(UI.compareHtml(seed("one-and-done"))));
  fields["f-water"].value = "250";
  const brikka = UI.compareHtml(seed("brikka-classique"));
  check("the Brikka: two columns, no temperature, « source non précisée »", /rs-two/.test(brikka) && !/rs_row_temp/.test(brikka) && /rs_none/.test(brikka) && !/data-rs=/.test(brikka));
  check("the one line summary tints the gap and names the author",
    /rs-gap">15 g \/ 225 g/.test(UI.sourceLineHtml({ ...seed("one-and-done"), water: 250 }, null)) &&
    /rs_line_same/.test(UI.sourceLineHtml(seed("one-and-done"), null)) && /rs_none/.test(UI.sourceLineHtml(seed("costaud-bloom"), null)));
}

/* ---------- The page and the files ---------- */
{
  const html = read("index.html"), sw = read("sw.js"), aside = read("js/ui-entry-aside.js"), css = read("css/aside.css");
  check("the module and the sheet are in the page and precached",
    /ui-entry-aside\.js\?v=[\d.]+"><\/script>\n<script defer src="js\/ui-recipe-source\.js\?v=/.test(html) &&
    /css\/panel\.css\?v=[\d.]+">\n<link rel="stylesheet" href="css\/aside\.css\?v=/.test(html) &&
    sw.includes('"./js/ui-recipe-source.js"') && sw.includes('"./css/aside.css"'));
  check("the card goes through the live patch, the band too", (aside.match(/UI\.patchHtml\(/g) || []).length >= 3);
  check("the temperature redraws the recipe card", /\$\("#f-temp"\)\.addEventListener\("input", updateRecipeAside\)/.test(aside));
  check("the steps' grams are live above the pour threshold", /data-live="g"/.test(aside) && /POUR_THRESHOLD_G/.test(aside));
  check("the Guide and the side panel carry the summary", /UI\.sourceLineHtml\(r, null\)/.test(read("js/ui-guide.js")) && /UI\.sourceLineHtml\(r, DATA\.coffeeOf\(e\)\)/.test(read("js/ui-panel-edit.js")));
  check("the Guide, the panel and the share scale on the water the steps are written for",
    /pourFactor\(recipe, targetWater\)/.test(read("js/ui-guide.js")) && /pourFactor\(r, e\.water_g\)/.test(read("js/ui-panel-edit.js")) && /pourFactor\(recipe, water\)/.test(read("js/ui-share.js")));
  check("every row animation has a calm path", /prefers-reduced-motion: reduce\)[\s\S]*\.rs-in tbody tr[^{]*\{ animation: none; \}/.test(css));
  check("no green, sizes from 0.75rem", !/green|#0f0|#00ff00|rgb\(0, ?128/i.test(css) &&
    [...css.matchAll(/font-size: ([\d.]+)rem/g)].every(m => Number(m[1]) >= 0.75));
  const fr = read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const keys = [...fr.slice(fr.indexOf("// aside (v9.29)")).matchAll(/^\s+(\w+): \{ fr:/gm)].map(m => m[1]);
  const missing = keys.filter(k => !new RegExp("^\\s+" + k + ": \"", "m").test(en));
  check("every new French text has its English half (" + keys.length + " keys)", keys.length >= 20 && missing.length === 0, missing.join(", "));
  const used = new Set([...(read("js/ui-recipe-source.js")).matchAll(/I18N\.t\("(rs_\w+)"/g)].map(m => m[1]));
  const unknown = [...used].filter(k => !keys.includes(k));
  check("every text the module asks for exists", unknown.length === 0, unknown.join(", "));
  const texts = Object.values(RECIPE_SOURCES).flatMap(s => [s.tempText, s.total, s.grind]).filter(t => t && /[a-zà-ÿ]/i.test(t) && !/^medium/.test(t));
  const untranslated = texts.filter(t => !en.includes(JSON.stringify(t) + ":"));
  check("the sources' words are translated", untranslated.length === 0, untranslated.join(" | "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
