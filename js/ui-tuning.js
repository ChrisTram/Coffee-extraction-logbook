/* O3 (v9.19): THE WINNING SETTINGS, BY COFFEE AND BY RECIPE.
 *
 * « Mes meilleurs réglages » stacked one card per coffee, with nothing to do
 * from them. It is now a TABLE of every coffee whose best setting is proven
 * (the rule of js/tuning.js: three cups at the same setting), sorted by
 * score, sortable, with « Refaire » at the end of each row: the same prefill
 * path as everywhere (UI.redoCup on the reference cup, toast
 * setting_prefilled). On the phone, the same rows as cards with « Refaire ce
 * réglage ». Below: « À retenter » (a cup scored high once, never made
 * again), « Ce qui gagne partout » (the safest value of a lever across
 * coffees, per machine), and the coffees still on their way, with what is
 * missing.
 *
 * D2 joins it: on each recipe card of the Guide, « Chez toi » (v8.52) grows
 * the curve of your scores on this recipe over time and your best setting on
 * it. Touching the curve opens the history searched on the recipe (the
 * history has no recipe filter: its search reads the recipe name).
 *
 * The calculation is pure, in js/tuning.js; here only the display. Rows
 * stagger in, the curve draws itself; both are still under reduced motion. */
"use strict";

(() => {

  const { $, titleAttr, analyzableExts, fmtDecimal, fmtShortDate, toast } = UI;

  const fmt1 = n => fmtDecimal(n, 1);
  const coffeeName = id => { const c = DATA.state.coffees.find(x => x.id === id); return c ? c.name : ""; };

  // ---------- The words of a setting ----------

  // The grind as written, or the bag's default for a pre-ground coffee.
  const grindText = g => (g ? g : I18N.t("bag_default"));
  // The water of the Switch, or the heat (and the preheating) of the Brikka.
  function waterText(method, temp, heat, preheat) {
    if (method === "Brikka") {
      return [heat !== null && heat !== undefined && heat !== "" ? I18N.t("tuning_heat", { f: heat }) : "",
        preheat ? I18N.t("tuning_preheated") : ""].filter(Boolean).join(" · ");
    }
    return temp !== null && temp !== undefined && temp !== "" ? temp + " °C" : "";
  }
  function doseText(e) {
    if (!e || e.dose_g === "" || e.dose_g === undefined) return "";
    return e.water_g !== "" && e.water_g !== undefined ? e.dose_g + " → " + e.water_g + " g" : e.dose_g + " g";
  }
  // A row's setting, from its reference cup (the one « Refaire » copies).
  function rowCells(row) {
    const ref = row.ref || {};
    const method = ref.method || "";
    return {
      recipe: row.best.recipe ? I18N.tr(row.best.recipe) : "",
      grind: grindText(row.best.grind),
      water: waterText(method, ref.temperature_c, row.best.power || ref.heat_level, row.best.preheat),
      dose: doseText(ref),
      method: method,
    };
  }

  // ---------- The table ----------

  const sort = { key: "score", dir: -1 };
  const SORTERS = {
    coffee: (a, b) => String(a.coffee.name).localeCompare(String(b.coffee.name), I18N.locale()),
    cups: (a, b) => a.best.n - b.best.n,
    score: (a, b) => a.best.average - b.best.average || a.best.n - b.best.n,
  };
  function sortedRows(rows) {
    const s = SORTERS[sort.key] || SORTERS.score;
    // The coffees in use stay first whatever the column: a finished coffee is history.
    return rows.slice().sort((a, b) => (a.coffee.active === 0) - (b.coffee.active === 0) || sort.dir * s(a, b));
  }
  function sortHead(key, label, extra) {
    const on = sort.key === key;
    return '<th scope="col"' + (extra || "") + (on ? ' aria-sort="' + (sort.dir < 0 ? "descending" : "ascending") + '"' : "") + ">" +
      '<button type="button" class="wt-sort" data-wt-sort="' + key + '">' + label +
      '<span class="wt-arrow" aria-hidden="true">' + (on ? (sort.dir < 0 ? "↓" : "↑") : "") + "</span></button></th>";
  }

  const redoButton = (id, label, cls) => '<button type="button" class="btn btn-small' + (cls ? " " + cls : "") + '" data-wt-redo="' + titleAttr(id) + '">' + label + "</button>";
  const sheetLink = c => '<button type="button" class="wt-coffee" data-sheet="' + titleAttr(c.id) + '">' + titleAttr(c.name) + "</button>";

  function tableHtml(rows) {
    const head = "<thead><tr>" + sortHead("coffee", I18N.t("tuning_col_coffee")) +
      '<th scope="col">' + I18N.t("tuning_col_recipe") + '</th><th scope="col">' + I18N.t("tuning_col_grind") + "</th>" +
      '<th scope="col">' + I18N.t("tuning_col_water") + '</th><th scope="col">' + I18N.t("tuning_col_dose") + "</th>" +
      sortHead("cups", I18N.t("tuning_col_cups"), ' class="wt-num"') + sortHead("score", I18N.t("tuning_col_score"), ' class="wt-num"') +
      '<th scope="col"><span class="offscreen">' + I18N.t("tuning_col_action") + "</span></th></tr></thead>";
    const body = rows.map((r, i) => {
      const c = rowCells(r);
      const done = r.coffee.active === 0;
      return '<tr class="wt-row' + (i === 0 && !done ? " wt-top" : "") + (done ? " wt-done" : "") + '" style="--wt-i:' + i + '">' +
        '<td class="wt-name"><span class="dot-method ' + titleAttr(c.method.toLowerCase()) + '" aria-hidden="true"></span>' + sheetLink(r.coffee) +
          (done ? ' <span class="wt-finished">' + I18N.t("list_inactive") + "</span>" : "") + "</td>" +
        "<td>" + titleAttr(c.recipe) + '</td><td class="wt-mono">' + titleAttr(c.grind) + "</td><td>" + titleAttr(c.water) + "</td>" +
        '<td class="wt-mono">' + titleAttr(c.dose) + '</td><td class="wt-num">' + r.best.n + "</td>" +
        '<td class="wt-num"><b class="wt-score">' + fmt1(r.best.average) + "</b></td>" +
        '<td class="wt-act">' + (done ? "" : redoButton(r.best.referenceId, I18N.t("tuning_redo"), i === 0 ? "btn-primary" : "")) + "</td></tr>";
    }).join("");
    return '<div class="card wt-table-card"><table class="wt-table">' + head + "<tbody>" + body + "</tbody></table></div>";
  }

  function cardsHtml(rows) {
    return '<div class="wt-cards">' + rows.map((r, i) => {
      const c = rowCells(r);
      const done = r.coffee.active === 0;
      const line = [c.recipe, c.grind, c.water, I18N.t("tuning_cups", { n: r.best.n })].filter(Boolean).join(" · ");
      return '<article class="card wt-card' + (i === 0 && !done ? " wt-top" : "") + (done ? " wt-done" : "") + '" style="--wt-i:' + i + '">' +
        '<div class="wt-card-head">' + sheetLink(r.coffee) + '<b class="wt-score">' + fmt1(r.best.average) + "</b></div>" +
        '<p class="wt-card-line">' + titleAttr(line) + (done ? " · " + I18N.t("list_inactive") : "") + "</p>" +
        (done ? "" : redoButton(r.best.referenceId, I18N.t("tuning_redo_setting"), i === 0 ? "btn-primary wt-card-redo" : "wt-card-redo")) +
        "</article>";
    }).join("") + "</div>";
  }

  // ---------- À retenter, ce qui gagne partout, en route ----------

  function retryHtml(list) {
    if (!list.length) return "";
    return '<section class="card wt-side wt-retry" aria-labelledby="wt-retry-title"><h3 id="wt-retry-title">' + I18N.t("tuning_retry_title") + "</h3>" +
      '<ul class="wt-list">' + list.map(x => {
        const e = x.ext;
        // The recipe says the machine; without one, the machine does.
        const setting = [e.recipe ? I18N.tr(e.recipe) : I18N.t(e.method === "Brikka" ? "tuning_at_brikka" : "tuning_at_switch"),
          grindText(e.grind_dial), waterText(e.method, e.temperature_c, e.heat_level, Number(e.preheated_water) === 1)].filter(Boolean).join(" · ");
        return "<li><p>" + I18N.t("tuning_retry_line", { c: titleAttr(x.coffee.name), s: titleAttr(setting), m: fmt1(x.score) }) +
          ' <span class="wt-when">' + titleAttr(fmtShortDate(String(e.date_time).slice(0, 10))) + "</span></p>" +
          redoButton(e.id, I18N.t("tuning_retry_button"), "btn-subtle") + "</li>";
      }).join("") + "</ul></section>";
  }

  function safeValue(s) {
    if (s.lever === "temperature") return s.value + " °C";
    if (s.lever === "heat") return I18N.t("tuning_heat", { f: s.value });
    return s.value;
  }
  function safestHtml(list) {
    const body = list.length
      ? "<p>" + I18N.t(list.length > 1 ? "tuning_safe_two" : "tuning_safe_one", {
        v: list.map(s => "<b>" + titleAttr(safeValue(s)) + "</b> " + I18N.t(s.method === "Brikka" ? "tuning_at_brikka" : "tuning_at_switch")).join(", "),
      }) + "</p>" + '<p class="wt-proof">' + list.map(s => I18N.t("tuning_safe_proof", {
        v: titleAttr(safeValue(s)), x: fmt1(s.gap), n: s.n, k: s.coffees,
      })).join(" ") + "</p>"
      : '<p class="wt-proof">' + I18N.t("tuning_safe_none", { n: TUNING.SAFE_MIN_CUPS }) + "</p>";
    return '<section class="card wt-side wt-safe" aria-labelledby="wt-safe-title"><h3 id="wt-safe-title">' + I18N.t("tuning_safe_title") + "</h3>" + body + "</section>";
  }

  function pendingHtml(list) {
    if (!list.length) return "";
    return '<section class="card wt-pending" aria-labelledby="wt-pending-title"><h3 id="wt-pending-title">' + I18N.t("tuning_pending_title") + "</h3>" +
      '<ul class="wt-list">' + list.map(s => {
        const key = s.reason === "below_average" ? "setting_below_average" : s.reason === "not_enough" ? "setting_not_enough" : "setting_scattered";
        const t = s.bestCup || {};
        return "<li><p>" + sheetLink(s.coffee) + ' <span class="wt-avg">' + I18N.t("setting_average", { m: fmt1(s.average), n: s.total }) + "</span></p>" +
          '<p class="wt-why">' + I18N.t(key, { s: TUNING.MIN_CUPS, score: t.note !== undefined ? fmt1(t.note) : "", k: t.times, n: s.missing }) + "</p>" +
          (s.reason === "below_average" && t.id ? redoButton(t.id, I18N.t("setting_redo"), "btn-subtle") : "") + "</li>";
      }).join("") + "</ul></section>";
  }

  // ---------- The screen ----------

  let lastHtml = "";
  function renderTuning() {
    const zone = $("#tuning-list");
    if (!zone) return;
    /* Advice, so the analysable set: a failed cup describes a missed gesture
       and would get a correct setting condemned. */
    const exts = analyzableExts();
    const coffees = DATA.state.coffees;
    const { rows, pending } = TUNING.winningRows(coffees, exts);
    let html;
    if (!coffees.length || (!rows.length && !pending.length)) {
      html = '<div class="wt-board">' + UI.emptyHint({
        drawing: "cup", wide: true, title: I18N.t(coffees.length ? "tuning_empty_title" : "setting_no_coffee"),
        text: I18N.t("tuning_empty_text", { s: TUNING.MIN_CUPS }), action: I18N.t("tuning_empty_action"), go: "entry",
      }) + "</div>";
    } else {
      const sorted = sortedRows(rows);
      html = '<div class="wt-board">' +
        (rows.length ? tableHtml(sorted) + cardsHtml(sorted)
          : '<p class="card wt-none">' + I18N.t("tuning_no_winner", { s: TUNING.MIN_CUPS }) + "</p>") +
        '<div class="wt-sides">' + retryHtml(TUNING.toRetry(coffees, exts)) + safestHtml(TUNING.safestSettings(exts)) + "</div>" +
        pendingHtml(pending) + "</div>";
    }
    // Written only when it changed: a sync that brings nothing new does not replay the entrance.
    if (html === lastHtml && zone.innerHTML) return;
    lastHtml = html;
    zone.innerHTML = html;
  }

  // ---------- D2: « Chez toi » on a Guide recipe card ----------

  /* The curve of the scores on this recipe, in date order: a line, a dot per
     cup, and the average as a dashed line. The scale runs from a point under
     the lowest score to 10, so a progress of one point reads. */
  const CURVE_W = 300, CURVE_H = 64, PAD = 6;
  function curveSvg(points, mean) {
    if (points.length < 2) return "";
    const t = points.map(p => new Date(p.date).getTime() || 0);
    const t0 = Math.min(...t), t1 = Math.max(...t);
    const low = Math.max(0, Math.floor(Math.min(...points.map(p => p.score))) - 1);
    const x = i => PAD + (t1 > t0 ? (t[i] - t0) / (t1 - t0) : i / (points.length - 1)) * (CURVE_W - 2 * PAD);
    const y = s => PAD + (1 - (Math.max(low, Math.min(10, s)) - low) / (10 - low || 1)) * (CURVE_H - 2 * PAD);
    const d = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.score).toFixed(1)).join(" ");
    const dots = points.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.score).toFixed(1) + '" r="2.6" style="--rh-i:' + i + '">' +
      "<title>" + titleAttr(fmtShortDate(String(p.date).slice(0, 10)) + " · " + fmt1(p.score)) + "</title></circle>").join("");
    return '<svg class="rh-svg" viewBox="0 0 ' + CURVE_W + " " + CURVE_H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false" data-scrub="hover"' +
      ' data-scrub-top="' + PAD + '" data-scrub-bottom="' + (CURVE_H - PAD) + '">' +
      (mean === null || mean === undefined ? "" : '<path class="rh-mean" d="M0 ' + y(mean).toFixed(1) + " H" + CURVE_W + '"></path>') +
      '<path class="rh-line" pathLength="1" d="' + d + '"></path>' + dots + "</svg>";
  }

  function recipeAtHome(r) {
    const h = TUNING.recipeHome(r.name, analyzableExts());
    if (!h.n) return '<p class="recipe-at-home">' + I18N.t("library_not_tried") + "</p>";
    const best = h.best;
    const bestText = best ? [grindText(best.grind), waterText(best.method, best.temperature, best.heat, best.preheat), coffeeName(best.coffeeId)]
      .filter(Boolean).join(" · ") : "";
    return '<div class="rh">' +
      '<p class="recipe-at-home">' + I18N.t("library_at_home", { m: fmt1(h.average), n: h.n }) + "</p>" +
      (h.points.length > 1 ? '<button type="button" class="rh-curve" data-rh-journal="' + titleAttr(r.name) + '" aria-label="' +
        titleAttr(I18N.t("tuning_curve_open", { r: I18N.tr(r.name) })) + '">' + curveSvg(h.points, h.average) + "</button>" : "") +
      (best ? '<p class="rh-best">' + I18N.t("tuning_recipe_best", { s: titleAttr(bestText), m: fmt1(best.average), n: best.n }) +
        ' <button type="button" class="rh-redo" data-wt-redo="' + titleAttr(best.referenceId) + '">' + I18N.t("tuning_redo") + "</button></p>" : "") +
      "</div>";
  }

  // The history, searched on this recipe: its search reads the recipe name.
  function openRecipeCups(name) {
    const open = document.querySelector("dialog[open]");
    if (open && !open.classList.contains("as-panel")) open.close();
    if (UI.panelIsOpen && UI.panelIsOpen()) UI.closePanel();
    if (UI.historyView && UI.historyView() !== "date" && UI.openHistoryView) UI.openHistoryView("date");
    UI.openHistoryOn({ "h-search": name });
  }

  // ---------- Wiring ----------

  function redo(id) {
    const ext = DATA.state.extractions.find(e => e.id === id);
    if (!ext) return;
    if (UI.panelIsOpen && UI.panelIsOpen()) UI.closePanel();
    UI.redoCup(ext);
    toast(I18N.t("setting_prefilled"));
  }

  function wireTuning() {
    // Delegated on the document: the screen, the Guide cards and their copy in the side panel.
    document.addEventListener("click", ev => {
      const t = ev.target.closest ? ev.target : null;
      if (!t) return;
      const sortBtn = t.closest("[data-wt-sort]");
      if (sortBtn) {
        const key = sortBtn.dataset.wtSort;
        if (sort.key === key) sort.dir = -sort.dir;
        else { sort.key = key; sort.dir = key === "coffee" ? 1 : -1; }
        lastHtml = "";
        renderTuning();
        const again = $('[data-wt-sort="' + key + '"]');
        if (again) again.focus();
        return;
      }
      const r = t.closest("[data-wt-redo]");
      if (r) { redo(r.dataset.wtRedo); return; }
      const j = t.closest("[data-rh-journal]");
      if (j) openRecipeCups(j.dataset.rhJournal);
    });
    // The words change with the language: the next render rewrites them.
    I18N.subscribe(() => { lastHtml = ""; });
  }

  Object.assign(UI, { renderTuning, wireTuning, recipeAtHome });
})();
