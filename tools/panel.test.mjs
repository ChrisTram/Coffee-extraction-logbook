/* Tests of the panel group (v9.27): the cup panel you write in, rating
 * later, the home's side column filled again.
 *
 *   node tools/panel.test.mjs
 *
 * The pure parts of js/ui-panel-edit.js (reading and writing the inline
 * fields, which fields changed, what a rating writes, his usual tastes, the
 * search), MILESTONES.forEdit (what a late rating may celebrate), the
 * average next to the grams (js/ui-home-widgets.js) and the ← → keys of the
 * shortcuts run here with a stub of the interface core. Then the hooks the
 * screens carry are read in their files. boot.test.mjs runs the site for real. */

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

/* ---------- The layers the files need ---------- */

const { TOOLS, GRIND, MILESTONES } = new Function(
  read("js/tools.js") + "\n" + read("js/grind.js") + "\n" + read("js/milestones.js") + "\nreturn { TOOLS, GRIND, MILESTONES };")();

const I18N = { t: k => k, locale: () => "fr-FR", tag: t => t, tr: t => t, group: g => g, diag: d => d, machine: m => m, subscribe() {} };
function stubUI() {
  const noop = () => "";
  return {
    $: () => null, $$: () => [], titleAttr: s => String(s || ""), isFailed: e => Number(e.failed) === 1,
    fmtDecimal: (n, d) => Number(n.toFixed(d)).toLocaleString("fr-FR", { maximumFractionDigits: d }),
    fmtDuration: s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"),
    dayLabelOf: noop, fmtHour: noop, displayedDiags: noop, icon: noop, toast() {}, nav: { screenName: "dashboard" },
    analyzableExts: () => [],
  };
}
function load(file, UI, extra) {
  const names = ["UI", "TOOLS", "GRIND", "MILESTONES", "I18N", "DATA", "document", "window", "matchMedia", "setTimeout", "clearTimeout"];
  const e = extra || {};
  new Function(...names, read(file))(UI, TOOLS, GRIND, MILESTONES, I18N, e.DATA || { state: { extractions: [] } },
    e.document || { addEventListener() {}, createElement: () => null }, e.window || { addEventListener() {} },
    () => ({ matches: false }), () => 0, () => {});
  return UI;
}

const P = load("js/ui-panel-edit.js", stubUI()).panelEditMath;

/* ---------- Reading the inline fields ---------- */
{
  check("a number takes a comma or a point, spaces ignored", P.parseNumber("15,5") === 15.5 && P.parseNumber(" 15.5 ") === 15.5 && P.parseNumber("1 000") === 1000);
  check("nothing typed is nothing, letters are not a number", P.parseNumber("") === "" && P.parseNumber("abc") === null && P.parseNumber("-3") === null);
  check("a time reads as m:ss, m'ss, « m ss » or 3m45", P.parseTime("3:45") === 225 && P.parseTime("3'45") === 225 &&
    P.parseTime("3 45") === 225 && P.parseTime("3m45") === 225 && P.parseTime("4:05") === 245);
  check("a bare number under 10 is minutes, above it seconds, with a unit as said",
    P.parseTime("4") === 240 && P.parseTime("258") === 258 && P.parseTime("90s") === 90 && P.parseTime("2 min") === 120);
  check("a time with 60 seconds or more, or words, is refused", P.parseTime("3:75") === null && P.parseTime("trois") === null);

  const grind = P.parseField("grind", "1,5,0");
  check("the grind is the entry's dial, written back as rotation.number.click", grind.ok && grind.value === "1.5.0", JSON.stringify(grind));
  check("a grind past the stop or out of format is refused with its message",
    P.parseField("grind", "3.1.0").ok === false && P.parseField("grind", "15").error === "pe_err_grind");
  check("an emptied grind is allowed (a pre-ground bag)", P.parseField("grind", " ").ok && P.parseField("grind", "").value === "");
  check("the time is stored in seconds", P.parseField("time", "4:18").value === 258 && P.parseField("time", "45:00").ok === false);
  check("dose, water and degrees keep one decimal", P.parseField("dose", "14,25").value === 14.3 && P.parseField("water", "225").value === 225 &&
    P.parseField("temp", "92,5").value === 92.5);
  const range = P.parseField("dose", "80");
  check("a figure out of its bounds says them", range.ok === false && range.error === "pe_err_range" && range.vars.a === 1 && range.vars.b === 60);
  check("the heat is a whole number from 1 to 10", P.parseField("heat", "3").value === 3 && !P.parseField("heat", "3,5").ok && !P.parseField("heat", "11").ok);
}

/* ---------- Writing them back ---------- */
{
  check("a time shows as m:ss", P.formatField("time", 258) === "4:18" && P.formatField("time", 60) === "1:00");
  check("a decimal shows with the French comma", P.formatField("dose", 14.5, "fr-FR") === "14,5" && P.formatField("water", "225", "fr-FR") === "225");
  check("in English it shows with a point, never a thousands separator", P.formatField("dose", 14.5, "en-US") === "14.5" && P.formatField("water", 1000, "en-US") === "1000");
  check("an empty value shows empty, the dial as is", P.formatField("dose", "") === "" && P.formatField("grind", "1.4.3") === "1.4.3");
  const back = ["1,4,3", "3'05", "14,5"].map((t, i) => P.formatField(["grind", "time", "dose"][i], P.parseField(["grind", "time", "dose"][i], t).value, "fr-FR"));
  check("what is typed comes back in the site's own format", back.join("|") === "1.4.3|3:05|14,5", back.join("|"));
}

/* ---------- Which fields changed, and what a rating writes ---------- */
{
  const row = { id: "e1", score_10: "7.5", failed: "", dose_g: 15, water_g: "225", comment: "", grind_dial: "1.5.0" };
  check("15 and \"15\", \"\" and undefined are the same value", P.same(15, "15") && P.same("", undefined) && !P.same("7", "7.5") && P.same("7.50", 7.5));
  check("only the fields that differ are changes", P.changedFields(row, { dose_g: "15", water_g: 230, comment: "" }).join() === "water_g");
  check("a new score is written by half points, as a string", JSON.stringify(P.ratingPayload(row, 8.26, false)) === JSON.stringify({ score_10: "8.5" }));
  check("the same score writes nothing", Object.keys(P.ratingPayload(row, "7.5", false)).length === 0);
  check("clearing writes an empty score", P.ratingPayload(row, "", false).score_10 === "");
  check("the « ratée » box writes 1, or empty to unmark", P.ratingPayload(row, 7.5, true).failed === 1 &&
    P.ratingPayload({ ...row, failed: 1 }, 7.5, false).failed === "");
  check("a score is kept between 0 and 10", P.ratingPayload(row, 12).score_10 === "10" && P.ratingPayload(row, -1).score_10 === "0");
  const edited = P.editedRow({ ...row, _c: { ratioText: "1:15" } }, { score_10: "9", comment: "" });
  check("the cup saved is the stored one with its changes, its computed part left out",
    edited.score_10 === "9" && edited.dose_g === 15 && !("_c" in edited) && edited.id === "e1");
}

/* ---------- His usual tastes, the search, the toggles ---------- */
{
  const exts = [
    { coffee_id: "a", descriptors: "caramel|rond" }, { coffee_id: "b", descriptors: "fruits rouges|rond" },
    { coffee_id: "b", descriptors: "fruits rouges" }, { coffee_id: "a", descriptors: "miel" },
  ];
  const all = ["rond", "caramel", "miel", "fruits rouges", "cacao"];
  const usual = P.usualTastes(exts, "a", 10, all);
  check("the tastes of this coffee count three times, then the most ticked", usual.slice(0, 2).join() === "rond,caramel" && usual.includes("fruits rouges"), usual.join());
  check("the list is cut to its limit", P.usualTastes(exts, "a", 2, all).length === 2);
  check("the search ignores case and accents, the names starting with it first",
    P.findTastes("RO", ["fruits rouges", "rond"]).join() === "rond,fruits rouges" &&
    P.findTastes("brule", ["brûlé", "rond"]).join() === "brûlé" && P.findTastes("  ", all).length === 0);
  check("the search reads the shown name too", P.findTastes("honey", ["miel"], t => (t === "miel" ? "honey" : t)).join() === "miel");
  check("a toggled diagnostic keeps the entry's order", P.toggled(["Un peu amer"], "Équilibré", ["Équilibré", "Un peu acide", "Un peu amer"]).join("|") === "Équilibré|Un peu amer");
  check("a toggled taste goes out, or in at the end", P.toggled(["a", "b"], "a").join() === "b" && P.toggled(["a"], "c").join() === "a,c");
}

/* ---------- A late rating and the milestones ---------- */
{
  const cup = (id, day, score, extra) => ({ id, date_time: day + "T08:00", coffee_id: "c1", recipe: "R", score_10: score, failed: "", ...(extra || {}) });
  const before = [cup("e1", "2026-09-01", 7), cup("e2", "2026-09-02", 8), cup("e3", "2026-09-03", "")];
  const after = before.map(e => (e.id === "e3" ? { ...e, score_10: 10 } : e));
  const seen = MILESTONES.compute(before).map(m => m.id);
  const r = MILESTONES.forEdit(after, "e3", before[2], seen);
  check("a first 10 given late is celebrated", r.celebrate.length === 1 && r.celebrate[0].kind === "score10", JSON.stringify(r.celebrate));
  check("and remembered: the same edit again celebrates nothing", MILESTONES.forEdit(after, "e3", before[2], r.seen).celebrate.length === 0);
  const tenth = Array.from({ length: 10 }, (_, i) => cup("t" + i, "2026-08-" + String(10 + i).padStart(2, "0"), 6));
  const tenthAfter = tenth.map((e, i) => (i === 9 ? { ...e, score_10: 6.5 } : e));
  const r2 = MILESTONES.forEdit(tenthAfter, "t9", tenth[9], null);
  check("rating a cup again never celebrates its count, its streak or its recipe", r2.celebrate.length === 0, JSON.stringify(r2.celebrate));
  const failedTen = after.map(e => (e.id === "e3" ? { ...e, failed: 1 } : e));
  check("a botched cup's 10 is no milestone", MILESTONES.forEdit(failedTen, "e3", before[2], seen).celebrate.length === 0);
}

/* ---------- The average next to the grams ---------- */
{
  const H = load("js/ui-home-widgets.js", stubUI());
  const m = H.coffeeAverages([
    { coffee_id: "a", score_10: 8 }, { coffee_id: "a", score_10: "7" }, { coffee_id: "a", score_10: "" },
    { coffee_id: "b", score_10: "" }, { coffee_id: "c", score_10: 6.5 },
  ]);
  check("the average of each coffee is over its rated cups only", m.get("a") === 7.5 && m.get("c") === 6.5);
  check("a coffee without a rated cup has no average", !m.has("b"));
  const stub = stubUI();
  stub.analyzableExts = () => [{ coffee_id: "a", score_10: 8 }, { coffee_id: "a", score_10: 7.5 }];
  const H2 = load("js/ui-home-widgets.js", stub, { DATA: { state: { extractions: [{ updated_at: 1 }] } } });
  const html = H2.bagAverageHtml("a", "hb-avg");
  check("the grams get « · 7,8 » in the serif of the scores", html.includes("<b>7,8</b>") && html.includes("hb-avg") && html.includes("bag-avg-sep"), html);
  check("nothing for a coffee never rated", H2.bagAverageHtml("z", "sc-avg") === "");
}

/* ---------- The keys ---------- */
{
  const S = load("js/ui-shortcuts.js", stubUI());
  const ctx = o => ({ typing: false, modal: false, brew: false, panelOpen: true, panelCup: true, bubble: false, chord: false, screen: "history", onRow: false, has: () => true, ...(o || {}) });
  check("← → rate the cup in the side panel", S.shortcutFor({ key: "ArrowRight" }, ctx()) === "rate-up" && S.shortcutFor({ key: "ArrowLeft" }, ctx()) === "rate-down");
  check("not without a cup beside, nor while typing", S.shortcutFor({ key: "ArrowRight" }, ctx({ panelCup: false })) === null &&
    S.shortcutFor({ key: "ArrowLeft" }, ctx({ typing: true })) === null);
  check("↓ ↑ still walk the list", S.shortcutFor({ key: "ArrowDown" }, ctx()) === "next");
  check("the help lists the new keys", S.SHORTCUTS.some(s => s.label === "keys_help_panel_rate" && s.keys.join() === "←,→"));
}

/* ---------- The hooks, in their files ---------- */
{
  const panel = read("js/ui-panel.js"), edit = read("js/ui-panel-edit.js"), sheet = read("js/ui-rate-sheet.js");
  check("the panel draws its cup through the editor and refills it in place",
    panel.includes("UI.panelCupHtml(e)") && panel.includes("UI.refreshPanelCup(") && panel.includes("UI.mountPanelCup(body, e") && panel.includes("UI.releasePanelCup()"));
  check("the R15 morph still opens and folds the panel", panel.includes('UI.morphOpen(touched, show, "#side-panel"') && panel.includes("UI.morphBack($(\"#side-panel\")"));
  check("the score keeps its class, the morph glides the row's score into it", edit.includes('class="sp-rating pe-score"'));
  check("one write path, the entry's", edit.includes("DATA.editExtraction(id, editedRow(row, changes))") && sheet.includes("DATA.editExtraction(id, M.editedRow(row, changes))"));
  check("a late rating asks for its moment, once", edit.includes("UI.editMoment(saved, before)") && sheet.includes("UI.editMoment(saved, before)") &&
    read("js/ui-celebrate.js").includes("MILESTONES.forEdit("));
  check("the lists carry « à noter », the last cup « Noter »",
    read("js/ui-history.js").split("UI.rateMark(e)").length === 3 && read("js/ui-table.js").includes("UI.rateMark(e)") &&
    read("js/ui-dashboard.js").includes("UI.rateMark(e)") && read("js/ui-last-cup.js").includes("UI.rateAction(e)"));
  check("a figure given late rolls in from a dot", read("js/ui-scenes.js").includes('h.from === "" ? "·" : h.from'));
  check("the rows and the chips carry the average", read("js/ui-home.js").includes('UI.bagAverageHtml(s.coffee.id, "hb-avg")') &&
    read("js/ui-dashboard.js").includes('UI.bagAverageHtml(s.coffee.id, "sc-avg")'));
  check("the small cards tilt with the others", read("js/ui-feel.js").includes(".home-widget"));
  const css = read("css/panel.css");
  check("every movement has its calm path", /prefers-reduced-motion: reduce\)[\s\S]*\.pe-rate\.pe-call[\s\S]*\.home-enter \.home-widget/.test(css));
  check("no green, only tokens for colours", !/#[0-9a-f]{3,6}\b|green|rgb\(/i.test(css));
  check("a phone keeps its chips without the average", /@media \(max-width: 700px\) \{ \.sc-avg \{ display: none; \} \}/.test(css));
  const html = read("index.html"), sw = read("sw.js");
  ["js/ui-home-widgets.js", "js/ui-panel-edit.js", "js/ui-rate-sheet.js", "css/panel.css"].forEach(f =>
    check(f + " is in the page and precached", html.includes(f + "?v=") && sw.includes('"./' + f + '"')));
  const fr = read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  const keys = [...fr.slice(fr.indexOf("// panel (v9.27)")).matchAll(/^\s+(\w+): \{ fr:/gm)].map(m => m[1]);
  const missing = keys.filter(k => !new RegExp("^\\s+" + k + ": \"", "m").test(en));
  check("every new French text has its English half (" + keys.length + " keys)", keys.length > 40 && missing.length === 0, missing.join(", "));
  const used = new Set([...(edit + sheet + read("js/ui-home-widgets.js")).matchAll(/I18N\.t\("((?:pe|rate|hwg|bag_avg)_\w+)"/g)].map(m => m[1]));
  const unknown = [...used].filter(k => !k.endsWith("_") && !keys.includes(k));
  check("every text the new files ask for exists", unknown.length === 0, unknown.join(", "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
