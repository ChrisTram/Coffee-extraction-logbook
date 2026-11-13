/* v9.44: THE HOME'S CHARTS.
 *
 * Chris, two days after v9.41: the wheel of the month's tastes and the
 * sentence « À retenir » mean nothing to him on the home, and the page looks
 * empty. He wants charts that say something at a glance. Four of them, all
 * home-made SVG and HTML (no Chart.js: they are there with the first paint),
 * all with the same two codes, so one legend reads them all:
 *
 *   A COLOUR IS A COFFEE, A SHAPE IS A RECIPE.
 *
 *   - TES 15 DERNIERS JOURS (#home-days, across the page): one mark per cup,
 *     its day along, its score up, the day's average as a line through the
 *     days. A cup not rated yet waits on a row of its own at the foot.
 *   - QUELLE RECETTE POUR QUEL CAFÉ (#home-matrix): a recipe per row, a
 *     coffee per column, the average in each cell, tinted by the score, the
 *     best of each coffee ringed. A cell opens its cups in the journal.
 *   - AU SWITCH, LA TEMPÉRATURE (#home-temp): the degrees along, the score
 *     up, and the degree that gave the best cups.
 *   - TES NOTES SUR 30 JOURS (#home-spread): one block per cup, stacked on
 *     its score.
 *
 * A mark of the first and the third opens its cup (data-spot-cup, the
 * document handler of js/ui-last-cup.js). Every coordinate is a percentage,
 * as in js/ui-home-open.js: the drawings take the card's width and the marks
 * keep their shape; a mark is a nested <svg>, the one SVG element that takes
 * a percentage for its place.
 *
 * The pure parts (the codes, the days, the matrix, the best degree, the
 * spread) take their data as arguments: tools/home.test.mjs runs them. */
"use strict";

(() => {

  const { $, titleAttr, fmtDecimal, average, localDateKey } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const plural = n => (n > 1 ? "s" : "");
  const dayOf = dt => String(dt).slice(0, 10);
  const rated = e => e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null && Number.isFinite(Number(e.score_10));
  const recipeOf = e => e.recipe || e.method || "";

  // ---------- The two codes (pure) ----------

  const COLOURS = 5;
  /* The marks, drawn around 0,0 in a box of about 12: a circle first (the
     most brewed recipe), then shapes that stay apart at 10 px. */
  const SHAPES = [
    '<circle r="5"></circle>',
    '<rect x="-4.5" y="-4.5" width="9" height="9" rx="1"></rect>',
    '<path d="M0 -6 5.7 4.3-5.7 4.3Z"></path>',
    '<path d="M0 -6.3 6.3 0 0 6.3-6.3 0Z"></path>',
    '<path d="M0 6 5.7 -4.3-5.7 -4.3Z"></path>',
    '<path d="M-2 -6h4v4h4v4h-4v4h-4v-4h-4v-4h4Z"></path>',
    '<path d="M-5.4 -3.1 0 -6.2 5.4 -3.1 5.4 3.1 0 6.2-5.4 3.1Z"></path>',
    '<path d="M0 -6.6 1.9 -2.1 6.3 -2.1 2.9 0.9 4.1 5.6 0 3-4.1 5.6-2.9 0.9-6.3 -2.1-1.9 -2.1Z"></path>',
  ];
  const ENCODE_DAYS = 60;

  /* Which coffee gets which colour, which recipe which shape: decided once
     for the whole home, from the last 60 days. The coffees, the one drunk
     last first, then the open ones not brewed yet; five colours, the others
     grey. The recipes, the most brewed first; eight shapes, the others a
     small dot. `open` is the list of open coffee ids. */
  function homeCodes(exts, open, now) {
    const from = new Date(now || new Date()); from.setDate(from.getDate() - ENCODE_DAYS + 1);
    const since = localDateKey(from);
    const recent = exts.filter(e => dayOf(e.date_time) >= since);
    const last = {};
    recent.forEach(e => { if (!last[e.coffee_id] || String(e.date_time) > last[e.coffee_id]) last[e.coffee_id] = String(e.date_time); });
    const coffees = Object.keys(last).sort((a, b) => last[b].localeCompare(last[a]) || a.localeCompare(b));
    (open || []).forEach(id => { if (!coffees.includes(id)) coffees.push(id); });
    const count = {};
    recent.forEach(e => { const r = recipeOf(e); if (r) count[r] = (count[r] || 0) + 1; });
    const recipes = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
    return {
      coffees: coffees, recipes: recipes,
      colour: id => { const i = coffees.indexOf(id); return i >= 0 && i < COLOURS ? i + 1 : 0; },
      shape: r => { const i = recipes.indexOf(r); return i >= 0 && i < SHAPES.length ? i : -1; },
    };
  }

  // ---------- The 15 days (pure) ----------

  const DAYS = 15;
  /* The last `n` days, today last: for each, its cups in the order they were
     drunk and the average of the rated analysable ones. */
  function lastDays(exts, analyzable, now, n) {
    const count = n || DAYS;
    const ok = new Set(analyzable.map(e => e.id));
    const today = new Date(now || new Date()); today.setHours(12, 0, 0, 0);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (count - 1 - i));
      const key = localDateKey(d);
      const cups = exts.filter(e => dayOf(e.date_time) === key).sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));
      const notes = cups.filter(e => rated(e) && ok.has(e.id)).map(e => Number(e.score_10));
      return { key: key, date: d, cups: cups, mean: notes.length ? average(notes) : null, rated: notes.length };
    });
  }

  /* Where a cup stands across its day's column, 0 to 1 of the whole chart:
     alone in the middle, several side by side, never past the column. */
  function cupX(day, j, n, days) {
    const step = n <= 1 ? 0 : Math.min(0.26, 0.8 / n);
    return ((day + 0.5) + (j - (n - 1) / 2) * step) / days;
  }

  /* The score scale shared by the home's charts: from a point under the
     lowest score to 10, four points tall at least. */
  function scoreScale(scores) {
    const list = scores.filter(Number.isFinite);
    const low = list.length ? Math.min(Math.floor(Math.min(...list)) - 1, 6) : 5;
    return { low: Math.max(0, low), high: 10 };
  }

  // ---------- The matrix (pure) ----------

  /* The average of each recipe on each coffee, over the rated analysable
     cups. Rows are recipes (the most brewed first), columns coffees. A cell:
     { avg, n } or null. The best cell of each column is flagged. */
  function recipeMatrix(cups, coffees, recipes) {
    const cell = {};
    cups.filter(rated).forEach(e => {
      const k = recipeOf(e) + "\u0000" + e.coffee_id;
      (cell[k] = cell[k] || []).push(Number(e.score_10));
    });
    const rows = recipes.map(r => ({ recipe: r, cells: coffees.map(c => {
      const list = cell[r + "\u0000" + c];
      return list ? { avg: average(list), n: list.length, best: false } : null;
    }) })).filter(row => row.cells.some(Boolean));
    coffees.forEach((c, i) => {
      const col = rows.map(row => row.cells[i]).filter(Boolean);
      if (col.length < 2) return;
      const top = Math.max(...col.map(x => x.avg));
      col.filter(x => x.avg === top).forEach(x => { x.best = true; });
    });
    return rows;
  }

  // ---------- The temperature (pure) ----------

  /* The degree that gave the best cups: by whole degree, two cups at least,
     the best average (the more cups on a tie). Null without such a degree. */
  function bestDegree(points) {
    const by = {};
    points.forEach(p => { const t = Math.round(p.t); (by[t] = by[t] || []).push(p.score); });
    const list = Object.keys(by).map(t => ({ t: Number(t), avg: average(by[t]), n: by[t].length })).filter(x => x.n >= 2)
      .sort((a, b) => b.avg - a.avg || b.n - a.n || a.t - b.t);
    return list[0] || null;
  }

  // ---------- The spread (pure) ----------

  /* The rated cups by score, half point by half point, from the lowest
     score to 10: one column per step, even empty, its cups oldest first. */
  function scoreSpread(cups) {
    const list = cups.filter(rated);
    if (!list.length) return [];
    const half = v => Math.round(Number(v) * 2) / 2;
    const low = Math.min(...list.map(e => half(e.score_10)));
    const out = [];
    for (let s = low; s <= 10; s += 0.5) {
      out.push({ score: s, cups: list.filter(e => half(e.score_10) === s).sort((a, b) => String(a.date_time).localeCompare(String(b.date_time))) });
    }
    return out;
  }

  // ---------- Drawing ----------

  const pc = v => (v * 100).toFixed(2) + "%";
  const coffeeName = id => { const c = DATA.state.coffees.find(x => x.id === id); return c ? I18N.tr(c.name) : ""; };
  const shortDay = dt => new Date(String(dt).slice(0, 10) + "T12:00").toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });

  // A mark at a place of the plot: a nested svg (it takes percentages), its shape inside.
  function mark(codes, e, x, y, extra) {
    const s = codes.shape(recipeOf(e));
    const tip = [shortDay(e.date_time) + " " + String(e.date_time).slice(11, 16), coffeeName(e.coffee_id), I18N.tr(recipeOf(e)),
      rated(e) ? fmtRating(Number(e.score_10)) : I18N.t("not_rated_yet")].filter(Boolean).join(" · ");
    return '<svg class="hc-pt c' + codes.colour(e.coffee_id) + (rated(e) ? "" : " open") + '" x="' + pc(x) + '" y="' + pc(y) + '" width="1" height="1" overflow="visible" data-spot-cup="' +
      titleAttr(e.id) + '"' + (extra || "") + "><title>" + escapeHtml(tip) + '</title><circle class="hc-hit" r="11"></circle>' +
      (s >= 0 ? SHAPES[s] : '<circle r="3"></circle>') + "</svg>";
  }
  const glyph = s => '<svg class="hc-glyph" viewBox="-8 -8 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
    (s >= 0 ? SHAPES[s] : '<circle r="3"></circle>') + "</svg>";

  // The horizontal lines of a score scale, and their figures beside the plot.
  function scoreLines(scale, y) {
    let lines = "", labels = "";
    const step = scale.high - scale.low > 6 ? 2 : 1;
    for (let v = Math.ceil(scale.low) + (step === 2 && Math.ceil(scale.low) % 2 ? 1 : 0); v <= scale.high; v += step) {
      lines += '<line class="hc-grid" x1="0" x2="100%" y1="' + pc(y(v)) + '" y2="' + pc(y(v)) + '"></line>';
      labels += '<span style="top:' + pc(y(v)) + '">' + v + "</span>";
    }
    return { lines: lines, labels: '<div class="hc-yaxis" aria-hidden="true">' + labels + "</div>" };
  }

  // The legend both codes share, for what a chart shows.
  function legend(codes, cups) {
    const coffees = codes.coffees.filter(id => cups.some(e => e.coffee_id === id));
    const recipes = codes.recipes.filter(r => cups.some(e => recipeOf(e) === r));
    const n = fn => cups.filter(fn).length;
    return '<div class="hc-legend"><p><span class="hc-legend-label">' + escapeHtml(I18N.t("hc_legend_coffees")) + "</span>" +
      coffees.map(id => '<button type="button" class="hc-key" data-sheet="' + titleAttr(id) + '"><i class="hc-dot c' + codes.colour(id) + '" aria-hidden="true"></i>' +
        escapeHtml(coffeeName(id)) + " <small>" + n(e => e.coffee_id === id) + "</small></button>").join("") + "</p>" +
      '<p><span class="hc-legend-label">' + escapeHtml(I18N.t("hc_legend_recipes")) + "</span>" +
      recipes.map(r => '<span class="hc-key">' + glyph(codes.shape(r)) + escapeHtml(I18N.tr(r)) + " <small>" + n(e => recipeOf(e) === r) + "</small></span>").join("") + "</p></div>";
  }

  // ---------- 1. The 15 days ----------

  function daysHtml(o, codes) {
    const days = lastDays(o.exts, o.analyzable, o.now);
    const cups = days.flatMap(d => d.cups);
    const head = '<div class="card-head"><h3>' + escapeHtml(I18N.t("hc_days_title")) + "</h3>";
    if (!cups.length) return head + '</div><p class="hc-none">' + escapeHtml(I18N.t("hc_days_none")) + "</p>";
    const scores = cups.filter(rated).map(e => Number(e.score_10));
    const waiting = cups.some(e => !rated(e));
    const scale = scoreScale(scores);
    const top = 0.07, bottom = waiting ? 0.8 : 0.93;
    const y = v => top + (1 - (v - scale.low) / (scale.high - scale.low)) * (bottom - top);
    const g = scoreLines(scale, y);
    const todayKey = localDateKey(o.now);
    let svg = g.lines;
    days.forEach((d, i) => {
      if (d.key === todayKey) svg += '<rect class="hc-today" x="' + pc(i / DAYS) + '" y="0" width="' + pc(1 / DAYS) + '" height="100%"></rect>';
    });
    if (waiting) svg += '<line class="hc-split" x1="0" x2="100%" y1="' + pc(0.86) + '" y2="' + pc(0.86) + '"></line>';
    // The day's average, a line through the days that have one.
    const means = days.map((d, i) => (d.mean === null ? null : { x: (i + 0.5) / DAYS, y: y(d.mean) })).filter(Boolean);
    for (let i = 1; i < means.length; i++) {
      svg += '<line class="hc-mean" style="--i:' + i + '" x1="' + pc(means[i - 1].x) + '" y1="' + pc(means[i - 1].y) + '" x2="' + pc(means[i].x) + '" y2="' + pc(means[i].y) + '"></line>';
    }
    let k = 0;
    days.forEach((d, i) => d.cups.forEach((e, j) => {
      svg += mark(codes, e, cupX(i, j, d.cups.length, DAYS), rated(e) ? y(Number(e.score_10)) : 0.93, ' style="--i:' + (k++) + '"');
    }));
    const mean = scores.length ? average(scores) : null;
    const figures = '<span class="hc-figures"><b>' + escapeHtml(I18N.t("home_week_cups", { n: cups.length, s: plural(cups.length) })) + "</b>" +
      (mean !== null ? '<span class="hw-sep" aria-hidden="true">·</span>' + escapeHtml(I18N.t("home_week_avg", { m: fmtRating(mean) })) : "") +
      (scores.length > 1 ? '<span class="hc-meankey"><i aria-hidden="true"></i>' + escapeHtml(I18N.t("hc_days_mean")) + "</span>" : "") + "</span>";
    const axis = '<div class="hc-xaxis" aria-hidden="true" style="--n:' + DAYS + '">' + days.map(d => '<span' + (d.key === todayKey ? ' class="today"' : "") + "><b>" +
      d.date.getDate() + "</b><small>" + escapeHtml(d.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" })) + "</small></span>").join("") + "</div>";
    const label = I18N.t("hc_days_aria", { n: cups.length, s: plural(cups.length), m: mean === null ? "·" : fmtRating(mean) });
    return head + figures + "</div>" +
      '<div class="hc-plot hc-plot-days">' + g.labels + (waiting ? '<span class="hc-wait" aria-hidden="true">' + escapeHtml(I18N.t("hc_days_wait")) + "</span>" : "") +
      '<svg class="hc-svg" role="img" aria-label="' + titleAttr(label) + '" width="100%" height="100%">' + svg + "</svg></div>" + axis + legend(codes, cups);
  }

  // ---------- 2. The matrix ----------

  const MATRIX_COFFEES = 4, MATRIX_RECIPES = 5;
  // The accent, stronger with the score: pale at 5 and under, full from 9.
  const tint = m => Math.round(Math.max(0.1, Math.min(1, (m - 5) / 4)) * 62);
  function matrixHtml(o, codes) {
    const coffees = codes.coffees.slice(0, MATRIX_COFFEES);
    const rows = recipeMatrix(o.analyzable.filter(e => coffees.includes(e.coffee_id)), coffees, codes.recipes).slice(0, MATRIX_RECIPES);
    if (!rows.length || !coffees.length) return "";
    const head = '<div class="card-head"><h3>' + escapeHtml(I18N.t("hc_matrix_title")) + '</h3></div><p class="hc-sub">' + escapeHtml(I18N.t("hc_matrix_sub")) + "</p>";
    const cols = coffees.map(id => '<span class="hm-col" role="columnheader" title="' + titleAttr(coffeeName(id)) + '"><i class="hc-dot c' + codes.colour(id) +
      '" aria-hidden="true"></i><span>' + escapeHtml(coffeeName(id)) + "</span></span>").join("");
    const body = rows.map(row => '<span class="hm-row" role="rowheader" title="' + titleAttr(I18N.tr(row.recipe)) + '">' + glyph(codes.shape(row.recipe)) +
      "<span>" + escapeHtml(I18N.tr(row.recipe)) + "</span></span>" + row.cells.map((c, i) => {
        const name = coffeeName(coffees[i]), recipe = I18N.tr(row.recipe);
        if (!c) return '<span class="hm-cell none" role="cell" title="' + titleAttr(I18N.t("hc_cell_none", { c: name, r: recipe })) + '">·</span>';
        const tip = I18N.t("hc_cell_title", { c: name, r: recipe, m: fmtRating(c.avg), n: c.n, s: plural(c.n) });
        return '<button type="button" class="hm-cell' + (c.best ? " best" : "") + '" role="cell" style="--t:' + tint(c.avg) + '%" data-matrix-coffee="' + titleAttr(coffees[i]) +
          '" data-matrix-recipe="' + titleAttr(row.recipe) + '" title="' + titleAttr(tip) + '" aria-label="' + titleAttr(tip) + '"><b>' + fmtRating(c.avg) + "</b><small>" + c.n + "</small></button>";
      }).join("")).join("");
    return head + '<div class="hm-grid" role="table" aria-label="' + titleAttr(I18N.t("hc_matrix_title")) + '" style="--cols:' + coffees.length + '">' +
      '<span class="hm-corner" aria-hidden="true"></span>' + cols + body + "</div>";
  }

  // ---------- 3. The temperature ----------

  const TEMP_MIN = 4;
  function tempHtml(o, codes) {
    const cups = o.analyzable.filter(e => e.method === "Switch" && rated(e) && Number(e.temperature_c) > 0);
    if (cups.length < TEMP_MIN) return "";
    const pts = cups.map(e => ({ e: e, t: Number(e.temperature_c), score: Number(e.score_10) }));
    const lo = Math.floor(Math.min(...pts.map(p => p.t))) - 1, hi = Math.ceil(Math.max(...pts.map(p => p.t))) + 1;
    const scale = scoreScale(pts.map(p => p.score));
    const y = v => 0.07 + (1 - (v - scale.low) / (scale.high - scale.low)) * 0.86;
    const x = t => (t - lo) / (hi - lo);
    const g = scoreLines(scale, y);
    // Cups at the same degree and the same score stand side by side.
    const seen = {};
    let svg = g.lines;
    pts.sort((a, b) => String(a.e.date_time).localeCompare(String(b.e.date_time))).forEach((p, i) => {
      const k = p.t + ":" + p.score, n = seen[k] = (seen[k] || 0) + 1;
      const shift = (n - 1) * 0.018 * (n % 2 ? 1 : -1) * Math.ceil((n - 1) / 2 + 0.5);
      svg += mark(codes, p.e, Math.max(0.02, Math.min(0.98, x(p.t) + shift)), y(p.score), ' style="--i:' + i + '"');
    });
    const best = bestDegree(pts);
    if (best) svg = '<rect class="hc-band" x="' + pc(x(best.t - 0.5)) + '" y="0" width="' + pc(1 / (hi - lo)) + '" height="100%"></rect>' + svg;
    const step = hi - lo > 8 ? 2 : 1;
    let axis = "";
    for (let t = lo + 1; t < hi; t += step) axis += '<span style="left:' + pc(x(t)) + '"' + (best && best.t === t ? ' class="best"' : "") + ">" + t + "°</span>";
    return '<div class="card-head"><h3>' + escapeHtml(I18N.t("hc_temp_title")) + "</h3></div>" +
      '<div class="hc-plot hc-plot-small">' + g.labels + '<svg class="hc-svg" role="img" aria-label="' + titleAttr(I18N.t("hc_temp_aria", { n: pts.length })) +
      '" width="100%" height="100%">' + svg + '</svg></div><div class="hc-taxis" aria-hidden="true">' + axis + "</div>" +
      (best ? '<p class="hc-reading">' + escapeHtml(I18N.t("hc_temp_best", { t: best.t, m: fmtRating(best.avg), n: best.n })) + "</p>" : "");
  }

  // ---------- 4. The spread ----------

  const SPREAD_DAYS = 30;
  function spreadHtml(o, codes) {
    const from = new Date(o.now); from.setDate(from.getDate() - SPREAD_DAYS + 1);
    const since = localDateKey(from);
    const cols = scoreSpread(o.analyzable.filter(e => dayOf(e.date_time) >= since));
    const total = cols.reduce((s, c) => s + c.cups.length, 0);
    if (total < 3) return "";
    const max = Math.max(...cols.map(c => c.cups.length));
    return '<div class="card-head"><h3>' + escapeHtml(I18N.t("hc_spread_title")) + '</h3><span class="hc-figures">' +
      escapeHtml(I18N.t("hc_spread_sub", { n: total })) + "</span></div>" +
      '<div class="hs-plot" role="img" aria-label="' + titleAttr(I18N.t("hc_spread_aria", { n: total })) + '" style="--max:' + max + '">' + cols.map(c =>
        '<span class="hs-col' + (Number.isInteger(c.score) ? "" : " half") + '"><span class="hs-stack">' + c.cups.map(e =>
          '<i class="hs-cup c' + codes.colour(e.coffee_id) + '" data-spot-cup="' + titleAttr(e.id) + '" title="' +
          titleAttr([shortDay(e.date_time), coffeeName(e.coffee_id), I18N.tr(recipeOf(e))].filter(Boolean).join(" · ")) + '"></i>').join("") +
        "</span><small>" + (c.cups.length || "") + "</small><b>" + fmtRating(c.score) + "</b></span>").join("") + "</div>";
  }

  // ---------- Render and wiring ----------

  /* Rewritten only when what a card says changed: a sync answering twice
     must not restart the marks arriving. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el) return;
    el.hidden = !html;
    if (written.get(el) === html) return;
    written.set(el, html);
    el.innerHTML = html;
  }

  // Called by renderHome with what the dashboard already computed.
  function renderHomeCharts(o) {
    const now = new Date();
    const open = typeof UI.stockData === "function" ? UI.stockData().filter(s => s.leftover > 0).map(s => s.coffee.id) : [];
    const codes = homeCodes(o.exts, open, now);
    const ctx = { exts: o.exts, analyzable: o.analyzable, now: now };
    put($("#home-days"), daysHtml(ctx, codes));
    put($("#home-matrix"), matrixHtml(ctx, codes));
    put($("#home-temp"), tempHtml(ctx, codes));
    put($("#home-spread"), spreadHtml(ctx, codes));
  }

  function wireHomeCharts() {
    const matrix = $("#home-matrix");
    if (matrix) matrix.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-matrix-coffee]");
      if (!b) return;
      // The cups of that recipe on that coffee, in the journal.
      UI.openHistoryOn({ "h-coffee": b.getAttribute("data-matrix-coffee"), "h-search": b.getAttribute("data-matrix-recipe") });
    });
  }

  Object.assign(UI, { homeCodes, lastDays, cupX, scoreScale, recipeMatrix, bestDegree, scoreSpread, renderHomeCharts, wireHomeCharts });
})();
