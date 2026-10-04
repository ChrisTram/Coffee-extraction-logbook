/* O1 (v9.21): THE ANALYSES PAGE.
 *
 * The analyses lived at the bottom of the dashboard, seven tabs and seven
 * drawings 2,900 px down. They now have a page of their own, with the period
 * at the top (7 jours, 30 jours, 3 mois, Tout) and a grid of tiles that open
 * large in place:
 *
 *   - the period in bars, a bar per day (per week over three months, per
 *     month over everything), the height counting the cups, the tint saying
 *     their score;
 *   - your coffees ranked by average, your recipes on a podium, the grinder
 *     map, your tastes (a taste opens its cups in the journal), the key
 *     figures: these follow the period;
 *   - the calendar and the 30 days chart keep their own window, and say so;
 *   - then every finding (the home shows one), the analyses in tabs (they
 *     follow the period too) and the drawings.
 *
 * NOTHING HERE RUNS AT BOOT. renderCurrentScreen calls renderAnalytics only
 * while the page is shown: the first opening builds it, Chart.js arrives on
 * demand (charts.js), and a data change while elsewhere costs nothing.
 *
 * The pure parts (the period, the bars, the ranking, the tastes, the figures)
 * take their data as arguments: tools/home.test.mjs runs them. */
"use strict";

(() => {

  const { $, $$, titleAttr, localDateKey, fmtDecimal, average, nav, extsWithCalcs, analyzableExts, animateCounter } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const dayOf = dt => String(dt).slice(0, 10);
  const plural = n => (n > 1 ? "s" : "");

  // ---------- The period (pure) ----------

  const PERIODS = ["7", "30", "90", "all"];
  const PERIOD_KEY = "analytics-period";

  // The first day of the period, at midnight, or null for « Tout ».
  function periodStart(period, now) {
    const p = String(period);
    if (!PERIODS.includes(p) || p === "all") return null;
    const d = new Date(now || new Date());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (Number(p) - 1));
    return d;
  }
  function inPeriod(list, start) {
    if (!start) return list.slice();
    const from = localDateKey(start);
    return list.filter(e => dayOf(e.date_time) >= from);
  }

  // ---------- The bars over time (pure) ----------

  /* One bucket per day over 7 and 30 days, per week (Monday) over three
     months, per month over everything. Each: its first and last day (to open
     it in the journal), its cups and the average of its rated ones. */
  function timeBars(exts, analyzable, period, now) {
    const p = String(period);
    const today = new Date(now || new Date()); today.setHours(0, 0, 0, 0);
    const unit = p === "all" ? "month" : p === "90" ? "week" : "day";
    const buckets = [];
    if (unit === "day") {
      const n = p === "7" ? 7 : 30;
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const k = localDateKey(d);
        buckets.push({ from: k, to: k, date: d });
      }
    } else if (unit === "week") {
      const monday = new Date(today); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      for (let i = 12; i >= 0; i--) {
        const a = new Date(monday); a.setDate(a.getDate() - i * 7);
        const b = new Date(a); b.setDate(b.getDate() + 6);
        buckets.push({ from: localDateKey(a), to: localDateKey(b), date: a });
      }
    } else {
      const first = exts.reduce((m, e) => (dayOf(e.date_time) < m ? dayOf(e.date_time) : m), localDateKey(today));
      const cursor = new Date(first.slice(0, 7) + "-01T12:00");
      const end = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      // Never more than three years of bars: beyond that, a bar is a hair.
      const floor = new Date(end); floor.setMonth(floor.getMonth() - 35);
      if (cursor < floor) cursor.setTime(floor.getTime());
      while (cursor <= end) {
        const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
        buckets.push({ from: localDateKey(cursor), to: localDateKey(last), date: new Date(cursor) });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    const find = k => buckets.find(b => k >= b.from && k <= b.to);
    buckets.forEach(b => { b.n = 0; b.notes = []; });
    exts.forEach(e => { const b = find(dayOf(e.date_time)); if (b) b.n += 1; });
    analyzable.forEach(e => {
      if (e.score_10 === "" || e.score_10 === undefined) return;
      const b = find(dayOf(e.date_time));
      if (b) b.notes.push(Number(e.score_10));
    });
    buckets.forEach(b => { b.mean = b.notes.length ? average(b.notes) : null; delete b.notes; });
    return { unit: unit, bars: buckets };
  }

  // ---------- Coffees, tastes, figures (pure) ----------

  /* The coffees of the period, by average of their rated cups, the most
     brewed first on a tie. Each says how many cups, and on which brewer. */
  function rankCoffees(exts, analyzable) {
    const by = new Map();
    analyzable.forEach(e => {
      if (e.score_10 === "" || e.score_10 === undefined) return;
      const x = by.get(e.coffee_id) || { id: e.coffee_id, notes: [] };
      x.notes.push(Number(e.score_10));
      by.set(e.coffee_id, x);
    });
    return [...by.values()].map(x => {
      const own = exts.filter(e => e.coffee_id === x.id);
      const c = DATA.state.coffees.find(k => k.id === x.id);
      return { id: x.id, name: c ? c.name : (own[0] && own[0]._c ? own[0]._c.coffee_name : ""), mean: average(x.notes), rated: x.notes.length,
        n: own.length, brikka: own.filter(e => e.method === "Brikka").length, switch: own.filter(e => e.method === "Switch").length };
    }).sort((a, b) => b.mean - a.mean || b.n - a.n);
  }

  /* The tastes ticked in the period, the most ticked first. NEW: a taste
     ticked for the very first time inside the period (there is no « new »
     over everything, nor in a logbook younger than the period). */
  function tasteCounts(periodExts, allExts, start) {
    const count = new Map();
    periodExts.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => count.set(t, (count.get(t) || 0) + 1)));
    const firstSeen = new Map();
    allExts.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => {
      const d = dayOf(e.date_time);
      if (!firstSeen.has(t) || d < firstSeen.get(t)) firstSeen.set(t, d);
    }));
    /* Nothing is new when the logbook itself starts inside the period: every
       taste would be, and the word would say nothing. */
    const firstCup = allExts.reduce((m, e) => (dayOf(e.date_time) < m ? dayOf(e.date_time) : m), "9999");
    const from = start && firstCup < localDateKey(start) ? localDateKey(start) : null;
    return [...count.entries()].map(([tag, n]) => ({ tag, n, isNew: !!from && firstSeen.get(tag) >= from }))
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
  }

  /* The key figures of the period. The days count from the period's start,
     or from the first cup for « Tout », so a daily average is a real one. */
  function keyFigures(exts, analyzable, start, now) {
    const today = new Date(now || new Date()); today.setHours(12, 0, 0, 0);
    const firstDay = start ? new Date(localDateKey(start) + "T12:00")
      : exts.length ? new Date(exts.reduce((m, e) => (dayOf(e.date_time) < m ? dayOf(e.date_time) : m), "9999") + "T12:00") : today;
    const span = Math.max(1, Math.round((today - firstDay) / 86400000) + 1);
    const rated = analyzable.filter(e => e.score_10 !== "" && e.score_10 !== undefined);
    const best = rated.slice().sort((a, b) => Number(b.score_10) - Number(a.score_10) || String(b.date_time).localeCompare(String(a.date_time)))[0];
    return {
      cups: exts.length,
      days: new Set(exts.map(e => dayOf(e.date_time))).size,
      span: span,
      mean: rated.length ? average(rated.map(e => Number(e.score_10))) : null,
      rated: rated.length,
      consistency: rated.length >= 2 ? TUNING.gapAtSameCoffee(analyzable) || 0 : null,
      caffeine: exts.reduce((s, e) => s + UI.caffeineOf(e), 0) / span,
      grams: exts.reduce((s, e) => s + (Number(e.dose_g) || 0), 0),
      coffees: new Set(exts.map(e => e.coffee_id).filter(Boolean)).size,
      best: best ? { id: best.id, score: Number(best.score_10) } : null,
    };
  }

  // ---------- State ----------

  const state = { period: "30", built: false, open: null, figures: {} };
  function readPeriod() {
    try { const p = localStorage.getItem(PERIOD_KEY); if (PERIODS.includes(p)) return p; } catch (e) { /* default */ }
    return "30";
  }

  // ---------- The tiles, drawn ----------

  /* A tile is rewritten only when what it says changed: a sync answering
     twice must not replay its bars and its chips. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el || written.get(el) === html) return false;
    written.set(el, html);
    el.innerHTML = html;
    return true;
  }

  const MONTH_TITLES = { 7: "an_month_title_7", 30: "an_month_title_30", 90: "an_month_title_90", all: "an_month_title_all" };
  const tint = m => (m === null ? 0.4 : Math.max(0.24, Math.min(1, (m - 4) / 5)));
  function bucketLabel(b, unit) {
    if (unit === "month") return b.date.toLocaleDateString(I18N.locale(), { month: "long", year: "numeric" });
    if (unit === "week") return I18N.t("an_week_of", { d: b.date.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) });
    return b.date.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long" });
  }
  function axisLabel(b, unit, count) {
    if (unit === "month") return b.date.toLocaleDateString(I18N.locale(), { month: "narrow" });
    if (unit === "week") return String(b.date.getDate());
    return count <= 7 ? b.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" }) : String(b.date.getDate());
  }

  // `mean`: the period's average over its rated cups, the figure the key figures say too.
  function renderMonth(t, mean) {
    const body = $("#tile-month");
    if (!body) return;
    $("#tile-month-title").textContent = I18N.t(MONTH_TITLES[state.period]);
    const cups = t.bars.reduce((s, b) => s + b.n, 0);
    const notes = mean === undefined ? null : mean;
    $("#tile-month-meta").textContent = cups
      ? I18N.t(notes !== null ? "an_month_meta" : "an_month_meta_unrated", { n: cups, s: plural(cups), m: notes !== null ? fmtRating(notes) : "" })
      : I18N.t("an_empty_period");
    const max = Math.max(1, ...t.bars.map(b => b.n));
    const every = t.bars.length > 16 ? Math.ceil(t.bars.length / 10) : 1;
    const bars = t.bars.map((b, i) => {
      const title = b.n ? I18N.t(b.mean !== null ? "an_bar_rated" : "an_bar", { d: bucketLabel(b, t.unit), n: b.n, s: plural(b.n), m: b.mean !== null ? fmtRating(b.mean) : "" })
        : bucketLabel(b, t.unit) + " : 0";
      return '<span class="an-bar' + (b.n ? "" : " zero") + '" title="' + titleAttr(title) + '" style="--h:' +
        (b.n ? Math.max(0.08, b.n / max) : 0.03).toFixed(3) + ";--o:" + tint(b.mean).toFixed(2) + ";--i:" + i + '">' +
        '<i></i><small' + (i % every === 0 || i === t.bars.length - 1 ? "" : ' class="quiet"') + ">" +
        escapeHtml(axisLabel(b, t.unit, t.bars.length)) + "</small></span>";
    }).join("");
    const best = t.bars.filter(b => b.n).sort((a, b) => (b.mean === null ? -1 : b.mean) - (a.mean === null ? -1 : a.mean) || b.n - a.n)[0];
    const bestLine = best && best.mean !== null
      ? '<p class="an-more an-best-line">' + escapeHtml(I18N.t("an_month_best_" + t.unit, { d: bucketLabel(best, t.unit), n: best.n, s: plural(best.n), m: fmtRating(best.mean) })) +
        ' <button type="button" class="link-card" data-journal-from="' + best.from + '" data-journal-to="' + best.to + '">' + escapeHtml(I18N.t("an_month_open_journal")) + " ›</button></p>"
      : "";
    put(body, '<div class="an-bars" data-unit="' + t.unit + '" style="--count:' + t.bars.length + '" role="img" aria-label="' +
      titleAttr($("#tile-month-title").textContent + ". " + $("#tile-month-meta").textContent) + '">' + bars + "</div>" +
      '<p class="an-more an-legend">' + escapeHtml(I18N.t("an_month_legend")) + "</p>" + bestLine);
  }

  function renderCoffees(list) {
    const body = $("#tile-coffees");
    if (!body) return;
    if (!list.length) { put(body, '<p class="an-none">' + escapeHtml(I18N.t("an_coffees_none")) + "</p>"); return; }
    put(body, '<ol class="an-ranks">' + list.map((c, i) =>
      '<li' + (i >= 5 ? ' class="an-more-row"' : "") + '><button type="button" class="an-rank-row" data-sheet="' + titleAttr(c.id) + '" aria-label="' +
        titleAttr(I18N.t("an_coffee_aria", { c: I18N.tr(c.name), m: fmtRating(c.mean), n: c.rated, s: plural(c.rated) })) + '" style="--w:' + (c.mean / 10 * 100).toFixed(1) + "%;--i:" + i + '">' +
        '<span class="an-rank-name">' + escapeHtml(I18N.tr(c.name)) + "</span>" +
        '<span class="an-rank-bar" aria-hidden="true"><i></i></span>' +
        '<b class="an-rank-value">' + fmtRating(c.mean) + "</b>" +
        '<small class="an-more an-rank-sub">' + escapeHtml(I18N.t("an_cups", { n: c.n, s: plural(c.n) }) +
          (c.brikka && c.switch ? " · " + I18N.t("an_split", { b: c.brikka, w: c.switch }) : "")) + "</small>" +
      "</button></li>").join("") + "</ol>" +
      (list.length > 5 ? '<p class="an-less an-hint">' + escapeHtml(I18N.t("an_more_rows", { n: list.length - 5 })) + "</p>" : ""));
  }

  function renderRecipes(analyzable) {
    UI.drawPodium("tile-podium", analyzable);
    const by = {};
    analyzable.forEach(e => { if (e.score_10 !== "" && e.recipe) (by[e.recipe] = by[e.recipe] || []).push(Number(e.score_10)); });
    const rows = Object.entries(by).map(([name, notes]) => ({ name, mean: average(notes), n: notes.length, r: UI.findRecipe(name) }))
      .sort((a, b) => b.mean - a.mean || b.n - a.n);
    put($("#tile-recipes-list"), rows.map((r, i) =>
      '<li class="an-more"><button type="button" class="an-rank-row"' + (r.r ? ' data-guide-recipe="' + titleAttr(r.r.id) + '"' : " disabled") +
        ' style="--w:' + (r.mean / 10 * 100).toFixed(1) + "%;--i:" + i + '">' +
        '<span class="an-rank-name">' + escapeHtml(I18N.tr(r.name)) + "</span>" +
        '<span class="an-rank-bar" aria-hidden="true"><i></i></span><b class="an-rank-value">' + fmtRating(r.mean) + "</b>" +
        '<small class="an-rank-sub">' + escapeHtml(I18N.t("an_cups", { n: r.n, s: plural(r.n) })) + "</small></button></li>").join(""));
  }

  function renderTastes(list, rated) {
    const body = $("#tile-tastes");
    if (!body) return;
    put(body, list.length ? list.map((t, i) =>
      '<button type="button" class="an-chip' + (t.isNew ? " new" : "") + (i >= 10 ? " an-more" : "") + '" data-taste="' + titleAttr(t.tag) + '" style="--i:' + i + '" aria-label="' +
        titleAttr(I18N.t("an_taste_aria", { t: I18N.tag(t.tag), n: t.n })) + '">' + escapeHtml(I18N.tag(t.tag)) +
        "<small>" + t.n + (t.isNew ? ", " + escapeHtml(I18N.t("an_new")) : "") + "</small></button>").join("")
      : '<p class="an-none">' + escapeHtml(I18N.t("an_tastes_none")) + "</p>");
    const box = $("#tile-wheel-box");
    if (box) box.hidden = !CHARTS.aromaWheel(rated, { svg: "tile-wheel", detail: "tile-wheel-detail", reading: "tile-wheel-reading" });
  }

  /* The key figures. When the period changes, each one ROLLS from what it
     showed to its new value (js/ui-roll.js); the first time, they count up. */
  function renderFigures(f) {
    const kpis = $("#kpis"), more = $("#kpis-secondary");
    if (!kpis || !more) return;
    const tiles = [
      { k: "cups", v: f.cups, dec: 0, label: I18N.t("an_kpi_cups") },
      { k: "mean", v: f.mean, dec: 1, unit: " / 10", label: I18N.t("an_kpi_mean") },
      { k: "consistency", v: f.consistency, dec: 1, prefix: "± ", unit: " pt", label: I18N.t("kpi_consistency") },
      { k: "caffeine", v: f.cups ? f.caffeine : null, dec: 0, prefix: "≈ ", unit: " mg", label: I18N.t("an_kpi_caffeine") },
    ];
    if (!kpis.querySelector(".kpi")) {
      kpis.innerHTML = tiles.map(t => '<div class="kpi" data-kpi="' + t.k + '"><div class="kpi-value"><span class="kpi-number"></span><small class="kpi-unit"></small></div>' +
        '<div class="kpi-label"></div></div>').join("");
    }
    tiles.forEach(t => {
      const box = kpis.querySelector('[data-kpi="' + t.k + '"]');
      if (!box) return;
      const num = box.querySelector(".kpi-number"), unit = box.querySelector(".kpi-unit");
      box.querySelector(".kpi-label").textContent = t.label;
      const empty = t.v === null || t.v === undefined;
      unit.textContent = empty ? "" : t.unit || "";
      const text = empty ? "-" : (t.prefix || "") + Number(t.v).toLocaleString(I18N.locale(), { minimumFractionDigits: t.dec, maximumFractionDigits: t.dec });
      const before = state.figures[t.k];
      if (before !== undefined && before !== text) UI.rollText(num, text, before);
      else {
        // The final figure first: a page that gets no frame still shows it.
        num.textContent = text;
        // The first time, they count up; not off screen, nor with reduced motion.
        if (before === undefined && !empty && !calm() && typeof num.getClientRects === "function" && num.getClientRects().length) {
          animateCounter(num, Number(t.v), t.dec, "", t.prefix || "");
        }
      }
      state.figures[t.k] = text;
    });
    const row = (caption, value) => "<li><span>" + escapeHtml(caption) + "</span><b>" + escapeHtml(value) + "</b></li>";
    put(more,
      row(I18N.t("an_kpi_days"), I18N.t("an_days_of", { n: f.days, t: f.span })) +
      row(I18N.t("an_kpi_grams"), Math.round(f.grams).toLocaleString(I18N.locale()) + " g") +
      row(I18N.t("an_kpi_coffees"), String(f.coffees)) +
      (f.best ? '<li><span>' + escapeHtml(I18N.t("an_kpi_best")) + '</span><button type="button" class="link-card an-best-cup" data-cup="' + titleAttr(f.best.id) + '">' +
        fmtRating(f.best.score) + "</button></li>" : ""));
  }

  function renderHighlight(f) {
    const el = $("#an-highlight");
    if (!el) return;
    if (state.period === "all") {
      const first = extsWithCalcs().reduce((m, e) => (dayOf(e.date_time) < m ? dayOf(e.date_time) : m), "9999");
      el.textContent = I18N.t("an_highlight_all", { n: f.cups, s: plural(f.cups),
        d: first === "9999" ? "" : new Date(first + "T12:00").toLocaleDateString(I18N.locale(), { day: "numeric", month: "long", year: "numeric" }) });
    } else {
      el.textContent = I18N.t("an_highlight_period", { n: f.cups, s: plural(f.cups), p: I18N.t("an_period_" + state.period) });
    }
  }

  // ---------- The period selector ----------

  function placePeriodMark(instant) {
    const group = $("#an-period"), mark = group ? group.querySelector(".an-period-mark") : null;
    if (!group || !mark || typeof group.querySelector !== "function") return;
    const b = group.querySelector('[data-period="' + state.period + '"]');
    if (!b || !b.offsetWidth) return;
    if (instant) mark.classList.remove("ready");
    mark.style.transform = "translateX(" + b.offsetLeft + "px)";
    mark.style.width = b.offsetWidth + "px";
    if (!mark.classList.contains("ready")) { void mark.offsetWidth; mark.classList.add("ready"); }
  }
  function paintPeriod() {
    $$("#an-period [data-period]").forEach(b => {
      const on = b.dataset.period === state.period;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    placePeriodMark(false);
  }
  /* Choosing a period: the tiles that follow it are redrawn, and say so with
     a short lift; the calendar and the chart, which keep their window, stay. */
  function setPeriod(p, focus) {
    if (!PERIODS.includes(String(p))) return;
    state.period = String(p);
    try { localStorage.setItem(PERIOD_KEY, state.period); } catch (e) { /* remembered for this visit only */ }
    paintPeriod();
    if (focus) { const b = $('#an-period [data-period="' + state.period + '"]'); if (b) b.focus(); }
    if (nav.screenName !== "analytics") return;
    renderPeriodTiles();
    if (!calm()) $$("#an-tiles .an-tile[data-period-aware]").forEach(t => {
      t.classList.remove("an-refresh"); void t.offsetWidth; t.classList.add("an-refresh");
      setTimeout(() => t.classList.remove("an-refresh"), 600);
    });
  }

  // ---------- Opening a tile in place (FLIP) ----------

  /* The tile grows to the grid's full width where it stands, the others
     move out of its way: First the positions, Last after the change, then
     each tile is played back from where it was (Invert, Play). The content
     is counter-scaled meanwhile, so the text does not stretch. */
  function flipTiles(change) {
    const grid = $("#an-tiles");
    if (!grid || typeof grid.querySelectorAll !== "function") { change(); return; }
    const tiles = [...grid.querySelectorAll(".an-tile")];
    const still = calm() || hidden() || typeof grid.animate !== "function";
    const first = still ? null : new Map(tiles.map(t => [t, t.getBoundingClientRect()]));
    change();
    if (still) return;
    const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)", duration = 460;
    /* While they fly, the tiles clip what they hold: the counter-scaled
       content of a growing tile is revealed by it, and never widens the page. */
    grid.classList.add("flipping");
    clearTimeout(flipTiles.timer);
    flipTiles.timer = setTimeout(() => grid.classList.remove("flipping"), duration + 40);
    tiles.forEach(t => {
      const a = first.get(t), b = t.getBoundingClientRect();
      if (!a || !b.width || !b.height || !a.width || !a.height) return;
      const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
      t.animate([{ transformOrigin: "0 0", transform: "translate(" + dx + "px, " + dy + "px) scale(" + sx + ", " + sy + ")" },
        { transformOrigin: "0 0", transform: "none" }], { duration: duration, easing: easing });
      if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
      [...t.children].forEach(c => c.animate([{ transformOrigin: "0 0", transform: "scale(" + (1 / sx) + ", " + (1 / sy) + ")" },
        { transformOrigin: "0 0", transform: "none" }], { duration: duration, easing: easing }));
    });
  }

  function toggleTile(tile, force) {
    if (!tile) return;
    const open = force === undefined ? !tile.classList.contains("open") : !!force;
    flipTiles(() => {
      $$("#an-tiles .an-tile.open").forEach(t => {
        if (t === tile) return;
        t.classList.remove("open");
        const b = t.querySelector(".an-tile-toggle");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      tile.classList.toggle("open", open);
      const b = tile.querySelector(".an-tile-toggle");
      if (b) b.setAttribute("aria-expanded", String(open));
      state.open = open ? tile.dataset.tile : null;
      // What depends on the width is redrawn at its new size.
      if (tile.dataset.tile === "calendar") UI.renderCalendar(extsWithCalcs(), analyzableExts());
    });
    if (open && typeof tile.scrollIntoView === "function") {
      setTimeout(() => {
        const r = tile.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) tile.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "nearest" });
      }, 480);
    }
  }

  // ---------- Render ----------

  /* What follows the period: the bars, the coffees, the recipes, the
     tastes, the grinder, the figures, and the analyses in tabs. */
  function renderPeriodTiles() {
    const all = extsWithCalcs(), allAnalyzable = analyzableExts();
    const start = periodStart(state.period, new Date());
    const exts = inPeriod(all, start), analyzable = inPeriod(allAnalyzable, start);
    const rated = analyzable.filter(e => e.score_10 !== "");
    const f = keyFigures(exts, analyzable, start, new Date());
    renderMonth(timeBars(exts, analyzable, state.period, new Date()), f.mean);
    renderCoffees(rankCoffees(exts, analyzable));
    renderRecipes(analyzable);
    renderTastes(tasteCounts(exts, all, start), rated);
    UI.drawGrinder("tile-grinder", null, analyzable);
    renderFigures(f);
    renderHighlight(f);
    UI.renderAnalysesCharts({ all: all, allAnalyzable: allAnalyzable, exts: exts, analyzable: analyzable });
  }

  function renderAnalytics() {
    const empty = DATA.state.extractions.length === 0;
    $("#an-empty").hidden = !empty;
    $("#an-content").hidden = empty;
    if (empty) return;
    if (!state.built) { state.built = true; state.period = readPeriod(); }
    paintPeriod();
    renderPeriodTiles();
    UI.renderInsights(analyzableExts());
    UI.renderDrawings();
    UI.renderStoryBanner();
    UI.maybeOpenStory();
    requestAnimationFrame(() => placePeriodMark(true));
  }

  // From the home's week line: the page opens on this period.
  function showAnalyticsPeriod(p) {
    if (!PERIODS.includes(String(p))) return;
    state.built = true;
    state.period = String(p);
    try { localStorage.setItem(PERIOD_KEY, state.period); } catch (e) { /* this visit */ }
  }

  // ---------- Wiring ----------

  function wireAnalytics() {
    const group = $("#an-period");
    if (group) {
      group.addEventListener("click", ev => {
        const b = ev.target.closest("[data-period]");
        if (b) setPeriod(b.dataset.period);
      });
      // A real radio group: the arrows move the choice, Home and End go to the ends.
      group.addEventListener("keydown", ev => {
        const i = PERIODS.indexOf(state.period);
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: PERIODS.length - 1 }[ev.key];
        if (to === undefined) return;
        ev.preventDefault();
        setPeriod(PERIODS[(to + PERIODS.length) % PERIODS.length], true);
      });
    }
    const grid = $("#an-tiles");
    if (grid) {
      // A cup of the grinder map or the best cup: its bubble, before anything else.
      grid.addEventListener("click", UI.onPointClick, true);
      grid.addEventListener("click", ev => {
        const tile = ev.target.closest(".an-tile");
        if (!tile) return;
        if (ev.target.closest(".an-tile-toggle")) { toggleTile(tile); return; }
        const taste = ev.target.closest("[data-taste]");
        if (taste) { UI.openHistoryOn({ "h-search": taste.dataset.taste }); return; }
        const recipe = ev.target.closest("[data-guide-recipe]");
        if (recipe) { UI.openRecipe(recipe.getAttribute("data-guide-recipe"), recipe); return; }
        const journal = ev.target.closest("[data-journal-from]");
        if (journal) { UI.openHistoryOn({ "h-from": journal.dataset.journalFrom, "h-to": journal.dataset.journalTo }); return; }
        // Anything else that acts (a coffee, a legend pill, the wheel) acts; the rest of a closed tile opens it.
        if (ev.target.closest("button, a, [data-sheet], [data-cup], [role=button], canvas, .wheel, .heatmap-container")) return;
        if (!tile.classList.contains("open")) toggleTile(tile, true);
      });
      grid.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        const step = ev.target.closest("[data-guide-recipe]");
        if (step && step.tagName !== "BUTTON") { ev.preventDefault(); UI.openRecipe(step.getAttribute("data-guide-recipe"), step); }
      });
    }
    // Escape folds the open tile back, when nothing else is open over it.
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || nav.screenName !== "analytics" || !state.open) return;
      if (document.querySelector("dialog[open]") || document.querySelector(".info-expanded")) return;
      toggleTile($('#an-tiles .an-tile[data-tile="' + state.open + '"]'), false);
    });
    // The calendar counts its weeks on its width, and the selector's mark follows the buttons.
    window.addEventListener("resize", UI.debounce(() => {
      if (nav.screenName !== "analytics") return;
      UI.renderCalendar(extsWithCalcs(), analyzableExts());
      placePeriodMark(true);
    }, 200));
    I18N.subscribe(() => placePeriodMark(true));
  }

  Object.assign(UI, {
    periodStart, inPeriod, timeBars, rankCoffees, tasteCounts, keyFigures,
    renderAnalytics, wireAnalytics, showAnalyticsPeriod, setAnalyticsPeriod: setPeriod, toggleTile,
  });
})();
