/* THE HOME'S CHARTS (v9.44, reworked in v9.45).
 *
 * Chris wants charts on the home, not sentences, and a page that is full.
 * Three of them, all home-made SVG and HTML (no Chart.js: they are there with
 * the first paint), with one code, so one legend reads them all:
 *
 *   A COLOUR IS A COFFEE, A SHAPE IS A RECIPE.
 *
 *   - QUELLE RECETTE POUR QUEL CAFÉ (#home-matrix): a recipe per row, a
 *     coffee per column, the average in each cell, tinted by the score, the
 *     best of each coffee ringed. A cell opens its cups in the journal.
 *   - TES 30 DERNIERS JOURS (#home-days, right under the open coffees and
 *     across the page since v9.46; 15 days in v9.44): one mark per cup, its
 *     day along, its score up, the day's average as a line. A cup not rated
 *     yet waits on a row at the foot.
 *   - TES SACHETS, JUSQU'À QUAND (#home-stock, v9.45, across the page at the
 *     foot): the grams of each open bag, cup after cup since it was opened,
 *     then the dashed line of its pace down to the day it will be empty.
 *
 * v9.45 took out two charts of v9.44 Chris did not want: the temperature on
 * the Switch (« pas assez précis »: four cups per degree say little) and the
 * scores of 30 days (the 30 days chart shows the same cups).
 *
 * A mark opens its cup (data-spot-cup, the document handler of
 * js/ui-last-cup.js). Every coordinate is a percentage, as in
 * js/ui-home-open.js: the drawings take the card's width and the marks keep
 * their shape; a mark is a nested <svg>, the one SVG element that takes a
 * percentage for its place.
 *
 * The pure parts (the codes, the days, the matrix, a bag's line) take their
 * data as arguments: tools/home.test.mjs runs them. */
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

  // ---------- The 30 days (pure) ----------

  const DAYS = 30;
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

  // ---------- A bag's line (pure) ----------

  const DAY_MS = 86400000;
  /* The grams of a bag over time, from what is left now back to its opening.
     `cups`: { date_time, grams } of this bag; `since`: the day it was opened
     (or counted by hand); `left`: the grams left now. Times are days from
     `since`, as numbers. Returns the steps (a point before and after each
     cup, the bag never above its own start), today's time, and where the
     dashed line ends when the bag has a pace (`perDay` grams). */
  function bagLine(left, cups, since, now, perDay) {
    const t0 = new Date(String(since).slice(0, 10) + "T00:00").getTime();
    const at = dt => (new Date(String(dt).slice(0, 16)).getTime() - t0) / DAY_MS;
    const list = (cups || []).filter(c => Number(c.grams) > 0).map(c => ({ t: Math.max(0, at(c.date_time)), g: Number(c.grams) })).sort((a, b) => a.t - b.t);
    const today = Math.max(0, (new Date(now).getTime() - t0) / DAY_MS);
    let g = Math.max(0, Number(left) || 0) + list.reduce((s, c) => s + c.g, 0);
    const steps = [{ t: 0, g: g }];
    list.forEach(c => { steps.push({ t: c.t, g: g }); g = Math.max(0, g - c.g); steps.push({ t: c.t, g: g }); });
    steps.push({ t: Math.max(today, list.length ? list[list.length - 1].t : 0), g: g });
    const end = perDay > 0 && g > 0 ? today + g / perDay : null;
    return { steps: steps, start: steps[0].g, left: g, today: today, end: end };
  }

  // ---------- Drawing ----------

  const pc = v => (v * 100).toFixed(2) + "%";
  const coffeeName = id => { const c = DATA.state.coffees.find(x => x.id === id); return c ? I18N.tr(c.name) : ""; };
  const shortDay = dt => new Date(String(dt).slice(0, 10) + "T12:00").toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });

  // A mark at a place of the plot: a nested svg (it takes percentages), its shape inside.
  function mark(codes, e, x, y, extra) {
    const s = codes.shape(recipeOf(e));
    const tip = [shortDay(e.date_time) + " " + String(e.date_time).slice(11, 16), coffeeName(e.coffee_id), I18N.tr(recipeOf(e)),
      rated(e) ? fmtRating(Number(e.score_10)) : I18N.t("not_rated_yet"), Number(e.failed) ? I18N.t("botched_badge") : ""].filter(Boolean).join(" · ");
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

  // ---------- The 30 days ----------

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
    // Under each column its day; the first of a month says the month, the others their weekday.
    const axis = '<div class="hc-xaxis" aria-hidden="true" style="--n:' + DAYS + '">' + days.map(d => '<span class="' + (d.key === todayKey ? "today" : "") +
      (d.date.getDate() === 1 ? " first" : "") + '"><b>' + d.date.getDate() + "</b><small>" +
      escapeHtml(d.date.toLocaleDateString(I18N.locale(), d.date.getDate() === 1 ? { month: "short" } : { weekday: "narrow" })) + "</small></span>").join("") + "</div>";
    const label = I18N.t("hc_days_aria", { n: cups.length, s: plural(cups.length), m: mean === null ? "·" : fmtRating(mean) });
    /* The plot and its days slide together on a narrow card (css/home.css gives
       them a floor width and opens them on the last days): 30 columns do not fit a phone. */
    return head + figures + "</div>" +
      '<div class="hc-scroll"><div class="hc-wide"><div class="hc-plot hc-plot-days">' + g.labels +
      (waiting ? '<span class="hc-wait" aria-hidden="true">' + escapeHtml(I18N.t("hc_days_wait")) + "</span>" : "") +
      '<svg class="hc-svg" role="img" aria-label="' + titleAttr(label) + '" width="100%" height="100%">' + svg + "</svg></div>" + axis + "</div></div>" + legend(codes, cups);
  }

  // ---------- The matrix ----------

  const MATRIX_COFFEES = 4, MATRIX_RECIPES = 6;
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

  // ---------- The bags, until when ----------

  const STOCK_BACK = 45, STOCK_AHEAD = 60;
  const dayMonth = d => d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
  /* One line per open bag whose size is known. The days run from the oldest
     opening (45 days back at most) to the latest end (60 days ahead at
     most); the grams go up to the fullest bag. */
  function stockHtml(o, codes) {
    const rows = (typeof UI.stockData === "function" ? UI.stockData() : []).filter(s => s.leftover > 0);
    const todayKey = localDateKey(o.now);
    const bags = rows.map(s => {
      const id = s.coffee.id, stock = DATA.bagStock(id, UI.fallbacks.dose);
      if (!stock) return null;
      // Counted by hand: the line starts from the count (the cups before it belong to another story).
      const since = stock.corrected ? String(stock.corrected).slice(0, 10) : (stock.since || todayKey);
      const cups = o.exts.filter(e => e.coffee_id === id && (stock.corrected ? String(e.date_time) > String(stock.corrected) : dayOf(e.date_time) >= since))
        .map(e => ({ date_time: e.date_time, grams: Number(e.dose_g) || UI.fallbacks.dose }));
      const pace = BAGS.pace(cups, since, todayKey, undefined, UI.awayPeriods());
      return { id: id, since: since, pace: pace, line: bagLine(s.leftover, cups, since, o.now, pace ? pace.perDay : 0) };
    }).filter(Boolean);
    if (!bags.length) return "";
    // One clock for all the bags: days from today (negative before).
    const t0 = b => new Date(b.since + "T00:00").getTime();
    const day0 = new Date(o.now).getTime();
    const rel = (b, t) => (t0(b) + t * DAY_MS - day0) / DAY_MS;
    const from = Math.max(-STOCK_BACK, Math.min(...bags.map(b => rel(b, 0)), -1));
    const to = Math.min(STOCK_AHEAD, Math.max(...bags.map(b => (b.line.end === null ? 3 : rel(b, b.line.end))), 3) + 1);
    const top = Math.max(...bags.map(b => b.line.start), 1);
    const x = d => Math.max(0, Math.min(1, (d - from) / (to - from)));
    const y = g => 0.06 + (1 - g / top) * 0.88;
    let svg = "", labels = "";
    const step = top > 300 ? 100 : 50;
    for (let g = 0; g <= top; g += step) {
      svg += '<line class="hc-grid" x1="0" x2="100%" y1="' + pc(y(g)) + '" y2="' + pc(y(g)) + '"></line>';
      labels += '<span style="top:' + pc(y(g)) + '">' + g + "</span>";
    }
    svg += '<line class="hc-now" x1="' + pc(x(0)) + '" x2="' + pc(x(0)) + '" y1="0" y2="100%"></line>';
    bags.forEach(b => {
      const cls = "c" + codes.colour(b.id);
      const s = b.line.steps;
      for (let i = 1; i < s.length; i++) {
        svg += '<line class="hk-line ' + cls + '" x1="' + pc(x(rel(b, s[i - 1].t))) + '" y1="' + pc(y(s[i - 1].g)) + '" x2="' + pc(x(rel(b, s[i].t))) + '" y2="' + pc(y(s[i].g)) + '"></line>';
      }
      if (b.line.end !== null) {
        svg += '<line class="hk-ahead ' + cls + '" x1="' + pc(x(0)) + '" y1="' + pc(y(b.line.left)) + '" x2="' + pc(x(rel(b, b.line.end))) + '" y2="' + pc(y(0)) + '"></line>' +
          '<circle class="hk-end ' + cls + '" cx="' + pc(x(rel(b, b.line.end))) + '" cy="' + pc(y(0)) + '" r="4"></circle>';
      }
      svg += '<circle class="hk-now ' + cls + '" cx="' + pc(x(0)) + '" cy="' + pc(y(b.line.left)) + '" r="4.5"></circle>';
    });
    const date = d => { const t = new Date(o.now); t.setDate(t.getDate() + Math.round(d)); return t; };
    const axis = '<div class="hc-taxis" aria-hidden="true"><span class="start" style="left:0">' + escapeHtml(dayMonth(date(from))) + '</span><span class="now" style="left:' + pc(x(0)) + '">' +
      escapeHtml(I18N.t("date_today").toLowerCase()) + '</span><span class="end" style="left:100%">' + escapeHtml(dayMonth(date(to))) + "</span></div>";
    const list = '<ul class="hk-list">' + bags.map(b => {
      const end = b.line.end === null ? null : date(rel(b, b.line.end));
      return '<li><button type="button" class="hk-bag" data-sheet="' + titleAttr(b.id) + '"><i class="hc-dot c' + codes.colour(b.id) + '" aria-hidden="true"></i>' +
        '<span class="hk-name">' + escapeHtml(coffeeName(b.id)) + "</span><b>" + Math.round(b.line.left) + " g</b>" +
        '<span class="hk-pace">' + escapeHtml(b.pace ? I18N.t("cf_fact_pace_v", { g: fmtDecimal(b.pace.perDay, 1) }) : I18N.t("hc_stock_no_pace")) + "</span>" +
        '<span class="hk-until">' + escapeHtml(end ? I18N.t("hc_stock_until", { d: dayMonth(end) }) : "") + "</span></button></li>";
    }).join("") + "</ul>";
    // Two parts: the drawing, and the figures of each bag (side by side on a wide card).
    return '<div class="card-head"><h3>' + escapeHtml(I18N.t("hc_stock_title")) + '</h3></div><p class="hc-sub">' + escapeHtml(I18N.t("hc_stock_sub")) + "</p>" +
      '<div class="hk-parts"><div class="hk-draw"><div class="hc-plot hc-plot-small"><div class="hc-yaxis" aria-hidden="true">' + labels + '</div><svg class="hc-svg" role="img" aria-label="' +
      titleAttr(I18N.t("hc_stock_aria", { n: bags.length, s: plural(bags.length) })) + '" width="100%" height="100%">' + svg + "</svg></div>" + axis + "</div>" + list + "</div>";
  }

  // ---------- Render and wiring ----------

  /* Rewritten only when what a card says changed: a sync answering twice
     must not restart the marks arriving. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el) return false;
    el.hidden = !html;
    if (written.get(el) === html) return false;
    written.set(el, html);
    el.innerHTML = html;
    return true;
  }

  // Called by renderHome with what the dashboard already computed.
  function renderHomeCharts(o) {
    const now = new Date();
    const open = typeof UI.stockData === "function" ? UI.stockData().filter(s => s.leftover > 0).map(s => s.coffee.id) : [];
    const codes = homeCodes(o.exts, open, now);
    const ctx = { exts: o.exts, analyzable: o.analyzable, now: now };
    put($("#home-days"), daysHtml(ctx, codes));
    put($("#home-matrix"), matrixHtml(ctx, codes));
    put($("#home-stock"), stockHtml(ctx, codes));
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

  Object.assign(UI, { homeCodes, lastDays, cupX, scoreScale, recipeMatrix, bagLine, renderHomeCharts, wireHomeCharts });
})();
