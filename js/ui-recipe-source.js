/* THE RECIPE NEXT TO ITS SOURCE (v9.29).
 *
 * Chris: « Quand je change les grammes d'eau, ça ne change pas la valeur à
 * droite ? », and « je ne sais pas quel est le recommandé de base ». The
 * entry's recipe card now sets three columns side by side: this cup (the
 * form, live), his recipe (as stored, which he edited) and what the author
 * recommends (RECIPE_SOURCES, js/recipes.js). The figures of this cup roll
 * as he types (UI.rollText) instead of the card being redrawn; a gap from
 * the source is tinted. Two actions: « Essayer la source » fills dose, water
 * and temperature of this cup, « Garder pour cette recette » makes them the
 * recipe's defaults; both can be undone from their message.
 *
 * The Guide's recipe cards and the side panel carry a one line summary of
 * the source (sourceLineHtml). The pure parts (sources, gaps, the water the
 * steps are written for) live in js/recipes.js, tested without a browser. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, fmtDecimal, toast, toastAction } = UI;
  const esc = TOOLS.escapeHtml;

  const has = v => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  const grams = v => (has(v) ? fmtDecimal(Number(v), 1) + " g" : "·");
  const ratioText = (d, w) => { const r = ratioOf(d, w); return r === "" ? "·" : "1:" + fmtDecimal(r, 1); };
  const degrees = v => (has(v) ? fmtDecimal(Number(v), 1) + " °C" : "·");
  const formCoffee = () => DATA.state.coffees.find(c => c.id === $("#f-coffee").value) || null;

  /* ---------- Live patching ---------- */

  /* What a card looks like without its live figures: the elements marked
     data-live lose their text and their class. Two renders with the same
     skeleton differ only by those figures. */
  const skeleton = html => String(html).replace(/<(\w+) data-live="([^"]*)"[^>]*>[^<]*<\/\1>/g, "<$1 data-live=\"$2\">");

  /* Writes `html` into `zone`. When only the live figures changed, they roll
     in place (the card is not redrawn, a button keeps its focus); otherwise
     the whole zone is written. Returns true when it was redrawn. */
  function patchHtml(zone, html) {
    if (!zone) return false;
    const sk = skeleton(html);
    if (zone._skeleton === sk && typeof document.createElement === "function") {
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      const fresh = tpl.content && tpl.content.querySelectorAll ? tpl.content.querySelectorAll("[data-live]") : null;
      const old = zone.querySelectorAll ? zone.querySelectorAll("[data-live]") : null;
      if (fresh && old && fresh.length === old.length) {
        old.forEach((el, i) => {
          const next = fresh[i].textContent;
          const shown = el.dataset.rollTo !== undefined ? el.dataset.rollTo : el.textContent;
          if (el.className !== fresh[i].className) el.className = fresh[i].className;
          if (shown !== next) UI.rollText(el, next);
        });
        return false;
      }
    }
    zone.innerHTML = html;
    zone._skeleton = sk;
    return true;
  }

  /* ---------- What the form, the recipe and the source say ---------- */

  function formValues() {
    return { dose: $("#f-dose").value, water: $("#f-water").value, temp: UI.entry.method === "Switch" ? $("#f-temp").value : "" };
  }
  function recipeValues(r, coffee) {
    return { dose: r.dose, water: r.water, temp: r.method === "Switch" ? temperatureForCoffee(r, coffee) : "" };
  }
  // The source's temperature as shown: a figure for this coffee's roast, else its text, else « non donnée ».
  function sourceTempLabel(r, coffee) {
    const s = recipeSource(r);
    if (!s) return "";
    const table = TEMP_BY_ROAST[r.id];
    if (coffee && table && table[coffee.roast]) return degrees(table[coffee.roast]);
    if (s.tempText) return I18N.tr(s.tempText);
    return has(s.temp) ? degrees(s.temp) : I18N.t("rs_temp_none");
  }
  const volume = (r, d, w) => (r.method === "Switch" && has(d) && has(w) ? UI.estimatedVolume(Number(d), Number(w)) : 0);

  // The line under the table: who, the time window, the grind.
  function metaHtml(r) {
    const s = recipeSource(r);
    if (!s) return '<p class="rs-meta rs-none">' + esc(I18N.t("rs_none")) + "</p>";
    const bits = [I18N.t("rs_by", { a: s.by })];
    if (s.total) bits.push(I18N.t("rs_total", { t: I18N.tr(s.total) }));
    if (s.grind) bits.push(I18N.t("rs_grind", { g: I18N.tr(s.grind) }));
    return '<p class="rs-meta">' + esc(bits.join(" · ")) + (s.unchecked ? ' <span class="rs-unchecked">' + esc(I18N.t("rs_unchecked")) + "</span>" : "") + "</p>";
  }

  /* THE ENTRY'S TABLE. Rows: coffee, water, ratio, then on the Switch the
     temperature and the expected volume. The first column is the form and
     carries data-live: patchHtml rolls it. */
  function compareHtml(r) {
    const coffee = formCoffee(), s = recipeSource(r), now = formValues(), mine = recipeValues(r, coffee);
    const gaps = sourceGaps(r, mine, coffee);
    const off = (a, b) => has(a) && has(b) && Number(a) !== Number(b);
    const rows = [
      { k: "dose", label: I18N.t("rs_row_dose"), now: grams(now.dose), mine: grams(mine.dose), src: s ? grams(s.dose) : "", off: off(now.dose, mine.dose), gap: gaps.dose },
      { k: "water", label: I18N.t("rs_row_water"), now: grams(now.water), mine: grams(mine.water), src: s ? grams(s.water) : "", off: off(now.water, mine.water), gap: gaps.water },
      { k: "ratio", label: I18N.t("rs_row_ratio"), now: ratioText(now.dose, now.water), mine: ratioText(mine.dose, mine.water),
        src: s ? ratioText(s.dose, s.water) : "", off: off(ratioOf(now.dose, now.water), ratioOf(mine.dose, mine.water)), gap: gaps.ratio },
    ];
    if (r.method === "Switch") {
      rows.push({ k: "temp", label: I18N.t("rs_row_temp"), now: degrees(now.temp), mine: degrees(mine.temp), src: s ? sourceTempLabel(r, coffee) : "",
        off: off(now.temp, mine.temp), gap: gaps.temp });
      const v = (d, w) => { const x = volume(r, d, w); return x ? "≈ " + x + " ml" : "·"; };
      rows.push({ k: "cup", label: I18N.t("rs_row_cup"), now: v(now.dose, now.water), mine: v(mine.dose, mine.water), src: s ? v(s.dose, s.water) : "",
        off: volume(r, now.dose, now.water) !== volume(r, mine.dose, mine.water), gap: false });
    }
    const head = "<thead><tr><td></td>" +
      '<th scope="col" class="rs-now">' + esc(I18N.t("rs_col_now")) + "</th>" +
      '<th scope="col">' + esc(I18N.t("rs_col_mine")) + "</th>" +
      (s ? '<th scope="col" class="rs-src" title="' + esc(I18N.t("rs_col_source_title")) + '">' + esc(I18N.t("rs_col_source")) + "</th>" : "") +
      "</tr></thead>";
    const body = rows.map((x, i) => '<tr style="--i:' + i + '"><th scope="row">' + esc(x.label) + "</th>" +
      '<td class="rs-now"><span data-live="' + x.k + '" class="' + (x.off ? "rs-off" : "") + '">' + esc(x.now) + "</span></td>" +
      "<td>" + esc(x.mine) + "</td>" +
      (s ? '<td class="rs-src' + (x.gap ? " rs-gap" : "") + '"><span>' + esc(x.src) + "</span></td>" : "") + "</tr>").join("");
    const tryIt = s && sourceGaps(r, now, coffee).any;
    const keep = s && gaps.any;
    const actions = tryIt || keep
      ? '<div class="rs-actions">' +
        (tryIt ? '<button type="button" class="btn btn-small" data-rs="try" data-r="' + esc(r.id) + '">' + esc(I18N.t("rs_try")) + "</button>" : "") +
        (keep ? '<button type="button" class="btn btn-small btn-subtle" data-rs="keep" data-r="' + esc(r.id) + '">' + esc(I18N.t("rs_keep")) + "</button>" : "") +
        "</div>"
      : s ? '<p class="rs-meta rs-same">' + esc(I18N.t("rs_same")) + "</p>" : "";
    return '<div class="rs" data-rs-recipe="' + esc(r.id) + '"><table class="rs-table' + (s ? "" : " rs-two") + '">' + head + "<tbody>" + body + "</tbody></table>" +
      metaHtml(r) + actions + "</div>";
  }

  /* THE ONE LINE SUMMARY, for the Guide's cards and the side panel: the
     source's figures, a gap from the recipe tinted; « conforme » when there
     is none; « non précisée » when no author is written. */
  function sourceLineHtml(r, coffee) {
    if (!r) return "";
    const s = recipeSource(r);
    if (!s) return '<p class="rs-line rs-none">' + esc(I18N.t("rs_none")) + "</p>";
    const gaps = sourceGaps(r, recipeValues(r, coffee || null), coffee || null);
    if (!gaps.any) return '<p class="rs-line">' + esc(I18N.t("rs_line_same", { a: s.by })) + "</p>";
    const part = (text, gap) => '<span class="' + (gap ? "rs-gap" : "") + '">' + esc(text) + "</span>";
    const temp = r.method === "Switch" && (has(s.temp) || s.tempText) ? " · " + part(sourceTempLabel(r, coffee || null), gaps.temp) : "";
    return '<p class="rs-line"><b>' + esc(I18N.t("rs_line_label", { a: s.by })) + "</b> " +
      part(grams(s.dose) + " / " + grams(s.water), gaps.dose || gaps.water) + " · " + part(ratioText(s.dose, s.water), gaps.ratio) + temp + "</p>";
  }

  /* ---------- The two actions ---------- */

  /* Writes values into the form's fields, as typing would (each emits
     « input »: the live line, the card, the draft and the timer follow), and
     rolls their text. Returns what they held, for the undo. */
  function fillForm(values) {
    const before = {};
    let n = 0;
    [["f-dose", values.dose], ["f-water", values.water], ["f-temp", values.temp]].forEach(([id, v]) => {
      const c = $("#" + id);
      if (!c || v === "" || v === null || v === undefined) return;
      const old = c.value;
      before[id.slice(2)] = old;
      if (String(old) === String(v)) return;
      c.value = v;
      c.dispatchEvent(new Event("input", { bubbles: true }));
      UI.rollField(c, old, n++ * 70);
    });
    if (before.temp !== undefined && typeof UI.updateTempHint === "function") UI.updateTempHint();
    return before;
  }

  function sourceValues(r) {
    const s = recipeSource(r);
    if (!s) return null;
    const t = sourceTemperature(r, formCoffee());
    return { dose: s.dose, water: s.water, temp: r.method === "Switch" && t !== "" ? t : "" };
  }

  function trySource(r) {
    const v = sourceValues(r);
    if (!v) return;
    const before = fillForm(v);
    toastAction(I18N.t("rs_tried"), I18N.t("rs_undo"), () => fillForm(before));
  }

  /* The source's figures become the recipe's defaults. The steps follow the
     new water (they are rewritten for it, scalePours), and the texts that
     state the old figures follow too: the original's when the new figures
     are the original's, else a plain one. */
  function keptRecipe(r, s) {
    const seed = STARTER_RECIPES.find(d => d.id === r.id);
    const f = pourFactor(r, s.water);
    const temp = has(s.temp) ? s.temp : r.temp;
    const asSeed = !!seed && Number(seed.dose) === s.dose && Number(seed.water) === s.water;
    const ratio = ratioOf(s.dose, s.water), cup = volume(r, s.dose, s.water);
    return {
      ...r, dose: s.dose, water: s.water, temp,
      steps: (r.steps || []).map(e => ({ ...e, text: f === 1 ? e.text : scalePours(e.text, f) })),
      tempText: seed && Number(temp) === Number(seed.temp) ? seed.tempText : has(temp) ? temp + " °C" : r.tempText,
      ratioText: asSeed ? seed.ratioText
        : r.method === "Switch" ? "ratio 1:" + String(ratio).replace(".", ",") + ", environ " + cup + " ml en tasse" : r.ratioText,
    };
  }

  async function keepSource(r) {
    const s = recipeSource(r);
    if (!s) return;
    const before = { ...r, steps: (r.steps || []).map(e => ({ ...e })), pairedCoffees: [...(r.pairedCoffees || [])] };
    await DATA.editRecipe(r.id, keptRecipe(r, s));
    const formBefore = fillForm(sourceValues(r));
    refreshAll();
    toastAction(I18N.t("rs_kept", { r: I18N.tr(r.name) }), I18N.t("rs_undo"), async () => {
      await DATA.editRecipe(r.id, before);
      fillForm(formBefore);
      refreshAll();
      toast(I18N.t("rs_restored"));
    });
  }

  function refreshAll() {
    UI.updateEntryAside();
    if (typeof UI.renderRecipes === "function") UI.renderRecipes();
  }

  // One listener for every card that carries the actions.
  function wireRecipeSource() {
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-rs]");
      if (!b) return;
      const r = DATA.state.recipes.find(x => x.id === b.dataset.r);
      if (!r) return;
      if (b.dataset.rs === "try") trySource(r);
      else if (b.dataset.rs === "keep") keepSource(r);
    });
  }

  Object.assign(UI, { patchHtml, compareHtml, sourceLineHtml, wireRecipeSource, recipeSourceMath: { skeleton, keptRecipe } });
})();
