/* « MES CAFÉS », WHAT SURROUNDS THE JARS (v9.31).
 *
 * Chris never has many open bags: three rows of lone jars left the page
 * empty. Around the shelf of js/ui-coffees.js, this file draws what fills it,
 * short, from what is already entered:
 *
 *   - the strip at the top: the grams in the cupboard, the cups they make,
 *     the month's coffee money and the price of a cup, beside « la frise des
 *     sachets » (the bags of the last three months, UI.timelineData of the
 *     Analyses drawing), drawn here wide, at the width it is given;
 *   - each open jar's card: the days of the bag and of the roast, the cups
 *     left, the pace in grams per day and the day the bag should end, the
 *     best setting with « Refaire », the last cup;
 *   - under « À racheter », where the bag came from and what it cost;
 *   - the finished ones as small tiles: name, final average, first and last
 *     cup.
 *
 * Every figure is decided in js/bags.js (pure, tools/shelf.test.mjs); this
 * file reads the data and writes the HTML. Nothing is stored. */
"use strict";

(() => {

  const { fmtDecimal, fmtVND, analyzableExts, fallbacks } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const today = () => TOOLS.localDateKey(new Date());
  const plural = n => (n > 1 ? "s" : "");

  function shortDay(s) {
    const [a, m, j] = String(s || "").slice(0, 10).split("-").map(Number);
    return a && m && j ? new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) : "";
  }
  const grams = e => Number(e.dose_g) || fallbacks.dose;
  const newest = (a, b) => String(b.date_time || "").localeCompare(String(a.date_time || ""));

  // ---------- The strip at the top ----------

  /* The price of a cup over the last thirty days: each cup at the price per
     gram of the bag it came from (the coffee card when no bag was entered). */
  function recentCupCost(t) {
    const since = TOOLS.localDateKey(new Date(Date.now() - 29 * 86400000));
    const coffees = new Map(DATA.state.coffees.map(c => [c.id, c]));
    return BAGS.cupCost(DATA.state.extractions.filter(e => String(e.date_time).slice(0, 10) >= since && String(e.date_time).slice(0, 10) <= t)
      .map(e => {
        const bag = DATA.bagAtDate(e.coffee_id, e.date_time), c = coffees.get(e.coffee_id) || {};
        return { grams: grams(e), price: bag ? bag.price_vnd : c.price_vnd, size: bag ? bag.bag_size_g : c.bag_size_g };
      }));
  }

  /* The four figures. `rows`: the shelf (BAGS.shelves), the grams of the
     open bags and of those to buy again (a few crumbs still count). */
  function shelfSummary(rows) {
    const t = today();
    const stock = BAGS.stockTotals(rows.open.concat(rows.rebuy));
    const spend = BAGS.monthSpend(DATA.state.purchases, t);
    const cost = recentCupCost(t);
    // count: { n, prefix, suffix }, a figure that counts up from zero when the page is arrived on.
    const tile = (key, value, sub, i, count) => '<div class="cf-sum-tile" style="--i:' + i + '"><span class="cf-sum-label">' + escapeHtml(I18N.t(key)) +
      '</span><b class="cf-sum-value"' + (count ? ' data-count="' + count.n + '" data-count-pre="' + escapeHtml(count.prefix || "") + '" data-count-post="' + escapeHtml(count.suffix || "") + '"' : "") +
      ">" + escapeHtml(value) + '</b><span class="cf-sum-sub">' + escapeHtml(sub) + "</span></div>";
    return '<div class="cf-sum" role="group" aria-label="' + escapeHtml(I18N.t("cf_sum_aria")) + '">' +
      tile("cf_sum_stock", fmtDecimal(stock.grams, 0) + " g", I18N.t("cf_sum_bags", { n: stock.bags, s: plural(stock.bags) }), 0,
        { n: Math.round(stock.grams), suffix: " g" }) +
      tile("cf_sum_cups", "≈ " + stock.cups, I18N.t("cf_sum_cups_sub"), 1, { n: stock.cups, prefix: "≈ " }) +
      tile("cf_sum_month", spend.priced ? fmtVND(spend.total) : spend.bags ? "·" : fmtVND(0),
        I18N.t(!spend.bags ? "cf_sum_month_none" : spend.priced ? "cf_sum_month_sub" : "cf_sum_month_unpriced", { n: spend.bags, s: plural(spend.bags) }), 2) +
      tile("cf_sum_cup", cost === null ? "·" : fmtVND(cost), I18N.t(cost === null ? "cf_sum_cup_none" : "cf_sum_cup_sub"), 3) +
      "</div>";
  }

  /* LA FRISE DES SACHETS: the place it takes, filled by drawShelfFrise once its
     width is known. Absent without a bag in the last three months. */
  function shelfFrise() {
    const bags = UI.timelineData ? UI.timelineData() : [];
    if (!bags.length) return "";
    return '<section class="cf-frise" aria-labelledby="cf-frise-h"><h3 class="cf-row-h" id="cf-frise-h">' + escapeHtml(I18N.t("cf_frise_title")) +
      ' <span class="cf-row-n">' + bags.length + "</span></h3>" +
      '<div class="cf-frise-box"><svg id="cf-frise-svg" class="drawing-svg cf-frise-svg" role="img" aria-label="' + escapeHtml(I18N.t("cf_frise_aria")) + '"></svg></div></section>';
  }

  // The tint of a bag's average, as accent opacity: 5 pale, 8.5 full, like the Analyses drawing.
  const tint = n => (n === null ? 0.18 : Math.max(0.18, Math.min(1, 0.18 + ((n - 5) / 3.5) * 0.82))).toFixed(2);

  /* One ribbon per bag, from its opening to its last cup (today while it is
     going), at the real width of the place: one unit per pixel, so the text
     stays at its size however wide the screen. A ribbon opens its sheet. */
  let friseWidth = 0, watched = null, watcher = null;
  function drawShelfFrise(force) {
    const svg = document.getElementById("cf-frise-svg");
    if (!svg) return;
    // Its box is watched: a new width (the window, the rail, the side panel) redraws it.
    if (typeof ResizeObserver === "function" && watched !== svg.parentNode) {
      if (!watcher) watcher = new ResizeObserver(() => requestAnimationFrame(() => drawShelfFrise(false)));
      watcher.disconnect();
      watched = svg.parentNode;
      watcher.observe(watched);
    }
    // Measured on its box: an empty drawing is not displayed, so it has no width of its own.
    const W = Math.round((svg.parentNode && svg.parentNode.clientWidth) || 0);
    if (!W || (!force && W === friseWidth && svg.firstChild)) return;
    friseWidth = W;
    const bags = UI.timelineData();
    const now = new Date();
    const t0 = Math.min(...bags.map(b => b.start.getTime())), t1 = Math.max(now.getTime(), ...bags.map(b => b.end.getTime()));
    const x = d => 8 + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * (W - 16);
    const ROW = 21, H = 6 + bags.length * ROW;
    let s = "";
    const m = new Date(t0); m.setDate(1); m.setMonth(m.getMonth() + 1); m.setHours(12);
    for (; m.getTime() < t1; m.setMonth(m.getMonth() + 1)) {
      s += '<line x1="' + x(m).toFixed(1) + '" y1="2" x2="' + x(m).toFixed(1) + '" y2="' + H + '" class="dw-grid"></line>' +
        '<text x="' + x(m).toFixed(1) + '" y="' + (H + 14) + '" text-anchor="middle">' + escapeHtml(m.toLocaleDateString(I18N.locale(), { month: "short" })) + "</text>";
    }
    s += '<line x1="' + x(now).toFixed(1) + '" y1="0" x2="' + x(now).toFixed(1) + '" y2="' + H + '" class="cf-frise-today"></line>';
    bags.forEach((b, i) => {
      const y = 4 + i * ROW, a = x(b.start), w = Math.max(12, x(b.end) - a);
      const full = b.coffee.name + (b.mean !== null ? " · " + fmtDecimal(b.mean, 1) : "");
      /* The name reads inside a long ribbon, after a short one, before it at
         the right end; where it fits best, shortened to the room it has
         (about 6.8 units a letter). */
      const room = { inside: w - 14, after: W - (a + w) - 14, before: a - 14 };
      const where = full.length * 6.8 <= room.inside ? "inside" : full.length * 6.8 <= room.after ? "after"
        : ["inside", "after", "before"].sort((p, q) => room[q] - room[p])[0];
      const fit = Math.max(4, Math.floor(room[where] / 6.8));
      const label = full.length <= fit ? full : full.slice(0, fit - 1).trimEnd() + "…";
      const inside = where === "inside", after = where === "after";
      const tx = inside ? a + 7 : after ? a + w + 6 : a - 6;
      s += '<g class="dw-ribbon' + (b.ongoing ? " in-progress" : "") + '" data-sheet="' + escapeHtml(b.coffee.id) + '" tabindex="0" role="button" style="--i:' + i + '" aria-label="' +
        escapeHtml(I18N.t("drawing_ribbon_aria", { c: b.coffee.name, n: b.n })) + '"><title>' + escapeHtml(b.coffee.name) + "</title>" +
        '<rect x="' + a.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="16" rx="8" class="dw-ribbon-block" style="fill-opacity:' + tint(b.mean) + '"></rect>' +
        '<text x="' + tx.toFixed(1) + '" y="' + (y + 12) + '" class="dw-ribbon-text"' + (!inside && !after ? ' text-anchor="end"' : "") + ">" + escapeHtml(label) + "</text></g>";
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + (H + 20));
    svg.setAttribute("height", String(H + 20));
    svg.innerHTML = s;
  }

  // ---------- An open jar's card ----------

  /* What the card says about one open bag, every figure from js/bags.js.
     `stats`: the coffee's { avg, n } over its rated analysable cups. */
  function openFacts(it, stats) {
    const c = it.coffee, g = it.gauge, t = today();
    const stock = DATA.bagStock(c.id, fallbacks.dose);
    const since = stock ? stock.since : "";
    const own = DATA.state.extractions.filter(e => e.coffee_id === c.id);
    const bagCups = own.filter(e => !since || String(e.date_time).slice(0, 10) >= since);
    const pace = g ? BAGS.pace(bagCups.map(e => ({ date_time: e.date_time, grams: grams(e) })), since, t) : null;
    const report = TUNING.forCoffee(c.id, analyzableExts());
    let best = null;
    if (report.best) best = { label: "cf_best", ref: report.best.referenceId, recipe: report.best.recipe, grind: report.best.grind, score: report.best.average };
    else if (report.bestCup) {
      const e = own.find(x => x.id === report.bestCup.id);
      if (e) best = { label: "cf_best_cup", ref: e.id, recipe: e.recipe, grind: e.grind_dial, score: report.bestCup.note };
    }
    return {
      opened: it.day,
      roast: stock && stock.roastDate ? BAGS.daysBetween(stock.roastDate, t) : null,
      cups: g ? BAGS.cupsLeft(g.grams, g.dose) : null,
      pace: pace,
      end: pace ? BAGS.finishDay(g.grams, pace.perDay, t) : null,
      best: best,
      last: own.slice().sort(newest)[0] || null,
      stats: stats || { avg: null, n: 0 },
    };
  }

  /* The card's right side: name, average, the bag's days, three figures,
     the best setting and the last cup. `jar` is the jar button, drawn by
     js/ui-coffees.js (it keeps the morph, the tilt and the grams that roll). */
  function shelfOpenCard(it, i, stats, jar) {
    const c = it.coffee, f = openFacts(it, stats);
    const when = [
      f.opened === null ? I18N.t("cf_opened_wait") : f.opened === 0 ? I18N.t("cf_opened_today") : I18N.t("cf_opened", { n: f.opened }),
      f.roast !== null && f.roast >= 0 ? I18N.t("cf_roasted", { n: f.roast }) : "",
    ].filter(Boolean).join(" · ");
    const fact = (label, value, cls) => '<div class="cf-fact' + (cls ? " " + cls : "") + '"><dt>' + escapeHtml(I18N.t(label)) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
    const facts = '<dl class="cf-facts">' +
      fact("cf_fact_left", f.cups === null ? I18N.t("cf_to_count") : I18N.t("cf_fact_cups", { n: f.cups, s: plural(f.cups) }), it.gauge && it.gauge.low ? "is-low" : "") +
      fact("cf_fact_pace", f.pace ? I18N.t("cf_fact_pace_v", { g: fmtDecimal(f.pace.perDay, 1) }) : I18N.t("cf_fact_no_pace")) +
      fact("cf_fact_end", f.end ? shortDay(f.end) : "·") + "</dl>";
    const b = f.best;
    const best = b ? '<div class="cf-best"><span class="cf-best-label">' + escapeHtml(I18N.t(b.label)) + '</span><span class="cf-best-what">' +
      escapeHtml([I18N.tr(b.recipe || ""), b.grind || I18N.t("bag_default")].filter(Boolean).join(" · ")) + " <b>" + fmtDecimal(b.score, 1) + "</b></span>" +
      '<button type="button" class="btn btn-small cf-redo" data-cf-redo="' + escapeHtml(b.ref) + '" aria-label="' + escapeHtml(I18N.t("cf_redo_aria", { c: c.name })) + '">' +
      escapeHtml(I18N.t("cf_redo")) + "</button></div>" : "";
    const l = f.last;
    const last = l ? '<p class="cf-last"><span>' + escapeHtml(I18N.t("cf_last")) + "</span> " + escapeHtml(l.score_10 !== "" && l.score_10 !== undefined && l.score_10 !== null
      ? I18N.t("cf_last_v", { d: shortDay(l.date_time), m: fmtDecimal(Number(l.score_10), 1) }) : I18N.t("cf_last_unrated", { d: shortDay(l.date_time) })) + "</p>" : "";
    const avg = f.stats.avg;
    return '<article class="cf-card' + (it.gauge && it.gauge.low ? " is-low" : "") + '" style="--i:' + i + '">' + jar +
      '<div class="cf-info"><div class="cf-info-head"><h4 class="cf-card-name"><button type="button" class="cf-card-open" data-sheet="' + escapeHtml(c.id) + '">' +
      escapeHtml(c.name) + '</button></h4><span class="cf-avg"><b>' + (avg === null ? "·" : fmtDecimal(avg, 1)) + "</b><small>" +
      escapeHtml(avg === null ? I18N.t("cf_avg_none") : I18N.t("cf_avg_n", { n: f.stats.n, s: plural(f.stats.n) })) + "</small></span></div>" +
      '<p class="cf-when">' + escapeHtml(when) + "</p>" + facts + best + last + "</div></article>";
  }

  // ---------- To buy again, finished ----------

  /* Where the bag came from and what it cost, under the end of a bag: the
     roaster, the last bag's size, price and day. */
  function shelfRebuyMeta(id) {
    const c = DATA.state.coffees.find(x => x.id === id);
    if (!c) return "";
    const bag = DATA.currentBag(id);
    const size = bag ? bag.bag_size_g : c.bag_size_g, price = bag ? bag.price_vnd : c.price_vnd;
    const parts = [c.roaster ? I18N.t("cf_rebuy_at", { r: c.roaster }) : ""];
    if (bag && bag.purchase_date) {
      parts.push(I18N.t(Number(price) > 0 ? "cf_rebuy_bag" : "cf_rebuy_bag_noprice", { g: size || "?", p: fmtVND(Number(price)), d: shortDay(bag.purchase_date) }));
    } else if (Number(price) > 0) parts.push(fmtVND(Number(price)));
    const text = parts.filter(Boolean).join(" · ");
    return text ? '<p class="be-meta">' + escapeHtml(text) + "</p>" : "";
  }

  /* A finished coffee's tile, under its jar's name: its final average and
     the cups it gave, then its first and last cup. */
  function shelfDoneLines(c, stats) {
    const own = DATA.state.extractions.filter(e => e.coffee_id === c.id).map(e => String(e.date_time)).sort();
    const s = stats || { avg: null, n: 0 };
    const top = s.avg === null ? I18N.t("cf_done") : I18N.t("cf_done_avg", { m: fmtDecimal(s.avg, 1), n: s.n, s: plural(s.n) });
    const span = own.length ? (own.length > 1 && own[0].slice(0, 10) !== own[own.length - 1].slice(0, 10)
      ? I18N.t("cf_done_span", { a: shortDay(own[0]), b: shortDay(own[own.length - 1]) }) : I18N.t("cf_done_on", { d: shortDay(own[0]) })) : "";
    return { top: top, span: span };
  }

  /* Arriving on the page, the grams and the cups count up from zero, with
     the jars that fill (UI.animateCounter, about 750 ms). The caller skips
     it under reduced motion and on a hidden page. */
  function shelfCountUp(zone) {
    if (!zone || typeof zone.querySelectorAll !== "function" || !UI.animateCounter) return;
    zone.querySelectorAll("[data-count]").forEach(el => {
      const n = Number(el.dataset.count);
      if (Number.isFinite(n) && n > 0) UI.animateCounter(el, n, 0, el.dataset.countPost || "", el.dataset.countPre || "");
    });
  }

  // ---------- Wiring ----------

  /* « Refaire » on a card: the entry, prefilled with that cup's setting
     once, the dial turning (the path of every « Refaire »). */
  function onShelfClick(ev) {
    const b = ev.target.closest && ev.target.closest("[data-cf-redo]");
    if (!b) return false;
    const ext = DATA.state.extractions.find(e => e.id === b.dataset.cfRedo);
    if (!ext) return true;
    UI.redoCup(ext);
    UI.toast(I18N.t("setting_prefilled"));
    return true;
  }

  Object.assign(UI, { shelfSummary, shelfFrise, drawShelfFrise, shelfOpenCard, shelfRebuyMeta, shelfDoneLines, onShelfClick, shelfCountUp });
})();
