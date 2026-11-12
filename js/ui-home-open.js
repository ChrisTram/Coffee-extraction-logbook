/* v9.41: YOUR OPEN COFFEES, AT THE TOP OF THE HOME.
 *
 * Chris asked for it in his own words: on the home, straight away, for each
 * coffee open right now, the average of its scores and how it is moving. One
 * card per open bag, under the title, on every width:
 *
 *   - the jar (js/ui-jar.js), the grams left, the cups they make and the day
 *     of the bag: the stock stays readable without scrolling (v8.89);
 *   - the coffee's AVERAGE, in the serif of the scores, over its analysable
 *     rated cups (the one shared average, H1);
 *   - its TREND: the last cups against the ones before, « +0,6 sur tes 3
 *     dernières », « stable », with an arrow; nothing under four rated cups;
 *   - its scores, one dot per cup in the colour of its brewer, the average as
 *     a dashed level and a rolling line that says where it is heading. A dot
 *     opens its cup (the document handler of js/ui-last-cup.js);
 *   - the last and the best score, the average per brewer when both were
 *     used, and « Brasser », which prefills the entry with the winning
 *     setting (TUNING.forCoffee), else with the latest cup's.
 *
 * It replaces three things that said the same in three places: the chips
 * under the title, the column « Tes sachets, en grammes » and the line « À
 * brasser, si tu veux ». A bag at its end keeps its scene (js/ui-bag-end.js),
 * after the open ones.
 *
 * The pure parts (trend, rolling mean, scale, per brewer, which cup to brew
 * again) take their data as arguments: tools/home.test.mjs runs them. */
"use strict";

(() => {

  const { $, titleAttr, fmtDecimal, average } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const rated = e => e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null && Number.isFinite(Number(e.score_10));
  const byDate = (a, b) => String(a.date_time).localeCompare(String(b.date_time));

  // ---------- Pure ----------

  /* THE TREND of a coffee, from its scores, oldest first. The last cups (three
     from six scores on, two under) against all the ones before. Under four
     scores, no trend: two cups against one say nothing. Within a quarter of a
     point, it is « stable ». */
  const TREND_MIN = 4, TREND_FLAT = 0.25;
  function coffeeTrend(scores) {
    const list = (scores || []).map(Number).filter(Number.isFinite);
    const n = list.length;
    if (!n) return { n: 0, avg: null, last: null, best: null, delta: null, dir: null, window: 0 };
    const out = { n: n, avg: average(list), last: list[n - 1], best: Math.max(...list), delta: null, dir: null, window: 0 };
    if (n >= TREND_MIN) {
      const k = n >= 6 ? 3 : 2;
      out.window = k;
      out.delta = average(list.slice(-k)) - average(list.slice(0, -k));
      out.dir = Math.abs(out.delta) < TREND_FLAT ? "flat" : out.delta > 0 ? "up" : "down";
    }
    return out;
  }

  // The mean of each score with the two before it: the line of the chart.
  function rollingMean(scores, k) {
    const w = k || 3;
    return scores.map((_, i) => average(scores.slice(Math.max(0, i - w + 1), i + 1)));
  }

  /* The chart's scale: half a point of air around the scores, three points
     tall at least (a coffee that never moves is a flat line in the middle,
     not a line glued to an edge), never past 10,5. */
  function sparkScale(scores) {
    let low = Math.floor(Math.min(...scores)) - 0.5, high = Math.ceil(Math.max(...scores)) + 0.5;
    while (high - low < 3) { low -= 0.5; high += 0.5; }
    if (high > 10.5) { low -= high - 10.5; high = 10.5; }
    return { low: Math.max(0, low), high: high };
  }

  // The average per brewer, the most used first; a brewer without a score is not in it.
  function methodAverages(cups) {
    const per = {};
    cups.forEach(e => { (per[e.method] = per[e.method] || []).push(Number(e.score_10)); });
    return Object.keys(per).filter(Boolean).map(m => ({ method: m, avg: average(per[m]), n: per[m].length }))
      .sort((a, b) => b.n - a.n || a.method.localeCompare(b.method));
  }

  /* WHICH CUP « BRASSER » TAKES ITS SETTING FROM: the reference of the
     winning setting (TUNING.forCoffee), else the latest cup of the coffee.
     Null for a coffee never brewed: the entry opens on the coffee alone. */
  function brewTarget(coffeeId, exts, analyzable) {
    const report = TUNING.forCoffee(coffeeId, analyzable);
    const best = report && report.best ? exts.find(e => e.id === report.best.referenceId) : null;
    if (best) return { refId: best.id, kind: "best" };
    const last = exts.filter(e => e.coffee_id === coffeeId).sort(byDate).pop();
    return last ? { refId: last.id, kind: "last" } : null;
  }

  /* What a card says, for one row of the stock (UI.stockData): the coffee's
     rated analysable cups, oldest first, and what is read from them. */
  const DOTS_MAX = 24;
  function openCoffee(row, exts, analyzable) {
    const id = row.coffee.id;
    const cups = analyzable.filter(e => e.coffee_id === id && rated(e)).sort(byDate);
    const own = exts.filter(e => e.coffee_id === id);
    const latest = own.reduce((m, e) => (String(e.date_time) > m ? String(e.date_time) : m), "");
    return {
      row: row, id: id, cups: cups.slice(-DOTS_MAX), total: own.length, latest: latest,
      trend: coffeeTrend(cups.map(e => Number(e.score_10))), methods: methodAverages(cups),
    };
  }

  // ---------- The chart ----------

  const day = dt => new Date(String(dt).slice(0, 16)).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
  const pc = v => v.toFixed(2) + "%";

  /* Every coordinate is a percentage: the drawing takes the card's width and
     the dots stay round at any size. No path for the same reason: the rolling
     line is a run of segments. */
  function chartHtml(c) {
    const list = c.cups;
    if (!list.length) return '<div class="ho-evo"><p class="ho-nochart">' + escapeHtml(I18N.t("ho_no_score")) + "</p></div>";
    const scores = list.map(e => Number(e.score_10));
    const s = sparkScale(scores);
    const x = i => (list.length > 1 ? 3 + (i / (list.length - 1)) * 94 : 50);
    const y = v => 12 + (1 - (v - s.low) / (s.high - s.low)) * 76;
    const roll = rollingMean(scores);
    let svg = '<line class="ho-avg" x1="0" x2="100%" y1="' + pc(y(c.trend.avg)) + '" y2="' + pc(y(c.trend.avg)) + '"></line>';
    if (list.length >= 3) {
      for (let i = 1; i < roll.length; i++) {
        svg += '<line class="ho-roll" style="--i:' + i + '" x1="' + pc(x(i - 1)) + '" y1="' + pc(y(roll[i - 1])) +
          '" x2="' + pc(x(i)) + '" y2="' + pc(y(roll[i])) + '"></line>';
      }
    }
    list.forEach((e, i) => {
      const last = i === list.length - 1;
      const tip = [day(e.date_time), I18N.tr(e.recipe || e.method || ""), fmtRating(Number(e.score_10))].filter(Boolean).join(" · ");
      svg += '<g class="ho-dot ' + String(e.method || "").toLowerCase() + (last ? " last" : "") + '" data-spot-cup="' + titleAttr(e.id) +
        '" style="--i:' + i + '"><title>' + escapeHtml(tip) + "</title>" +
        '<circle class="ho-hit" cx="' + pc(x(i)) + '" cy="' + pc(y(scores[i])) + '" r="10"></circle>' +
        '<circle class="ho-pt" cx="' + pc(x(i)) + '" cy="' + pc(y(scores[i])) + '" r="' + (last ? 5 : 3.5) + '"></circle></g>';
    });
    const label = I18N.t("ho_chart_aria", { n: list.length, s: list.length > 1 ? "s" : "", c: I18N.tr(c.row.coffee.name),
      a: fmtRating(scores[0]), b: fmtRating(scores[scores.length - 1]) });
    return '<div class="ho-evo"><p class="ho-evo-head">' + trendHtml(c.trend) + '<span class="ho-count">' +
      escapeHtml(I18N.t("ho_notes", { n: c.trend.n, s: c.trend.n > 1 ? "s" : "" })) + "</span></p>" +
      '<div class="ho-chart"><svg class="ho-spark" role="img" aria-label="' + titleAttr(label) + '" width="100%" height="100%">' + svg + "</svg>" +
      '<span class="ho-axis" aria-hidden="true"><span>' + escapeHtml(day(list[0].date_time)) + "</span><span>" +
      escapeHtml(list.length > 1 ? day(list[list.length - 1].date_time) : "") + "</span></span></div></div>";
  }

  // ---------- The card ----------

  const ARROW = '<svg class="ho-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 6h8M6.5 2.5 10 6 6.5 9.5"></path></svg>';
  function trendHtml(t) {
    if (!t.dir) return '<span class="ho-trend wait">' + escapeHtml(I18N.t("ho_trend_wait", { n: TREND_MIN })) + "</span>";
    const d = fmtRating(Math.abs(t.delta));
    const text = t.dir === "flat" ? I18N.t("ho_trend_flat", { k: t.window })
      : I18N.t(t.dir === "up" ? "ho_trend_up" : "ho_trend_down", { d: d, k: t.window });
    return '<span class="ho-trend ' + t.dir + '">' + ARROW + "<span>" + escapeHtml(text) + "</span></span>";
  }

  function cardHtml(c, i) {
    const s = c.row, t = c.trend, name = I18N.tr(s.coffee.name);
    const low = s.cups < 3, empty = s.leftover <= 0;
    const since = DATA.bagStock(s.coffee.id, UI.fallbacks.dose);
    const days = since && since.since ? BAGS.daysBetween(since.since, TOOLS.localDateKey(new Date())) : null;
    const cupsLeft = empty ? I18N.t("stock_chip_empty") : I18N.t("cf_fact_cups", { n: s.cups, s: s.cups > 1 ? "s" : "" });
    const opened = empty ? "" : days === 0 ? I18N.t("cf_opened_today") : days > 0 ? I18N.t("cf_opened", { n: days }) : "";
    const aria = I18N.t(empty ? "stock_chip_empty_title" : "stock_chip_title", { c: name, g: Math.round(s.leftover), n: s.cups, s: s.cups > 1 ? "s" : "" }) +
      (t.avg !== null ? " " + I18N.t("ho_avg_aria", { m: fmtRating(t.avg), n: t.n, s: t.n > 1 ? "s" : "" }) : "");
    const facts = [];
    if (t.last !== null) facts.push('<span><small>' + escapeHtml(I18N.t("ho_last")) + "</small> <b>" + fmtRating(t.last) + "</b></span>");
    if (t.n > 1) facts.push('<span><small>' + escapeHtml(I18N.t("ho_best")) + "</small> <b>" + fmtRating(t.best) + "</b></span>");
    if (c.methods.length > 1) c.methods.forEach(m => facts.push('<span class="ho-method"><i class="dot-method ' + m.method.toLowerCase() +
      '" aria-hidden="true"></i><small>' + escapeHtml(m.method) + "</small> <b>" + fmtRating(m.avg) + "</b></span>"));
    return '<li class="ho-item" style="--i:' + i + '"><div class="card ho-card' + (low ? " low" : "") + '">' +
      '<button type="button" class="ho-main" data-sheet="' + titleAttr(s.coffee.id) + '" aria-label="' + titleAttr(aria) + '">' +
        '<span class="ho-jar"' + UI.jarData({ coffeeId: s.coffee.id, grams: s.leftover, bag: s.bag, low: low }) + ">" +
          UI.jarSvg({ grams: s.leftover, bag: s.bag, roast: UI.jarRoast(s.coffee) }) + "</span>" +
        '<span class="ho-id"><span class="ho-name">' + escapeHtml(name) + "</span>" +
          '<span class="ho-stock"><b' + (empty ? "" : ' data-jar-grams="' + titleAttr(s.coffee.id) + '"') + ">" +
            escapeHtml(empty ? "" : Math.round(s.leftover) + " g") + "</b><span>" + escapeHtml(cupsLeft) + "</span>" +
            (opened ? '<span class="ho-opened">' + escapeHtml(opened) + "</span>" : "") + "</span>" +
          '<span class="ho-level" aria-hidden="true"><i style="--pc:' + s.pc.toFixed(0) + '%"></i></span></span>' +
        '<span class="ho-score">' + (t.avg !== null
          ? "<b>" + fmtRating(t.avg) + "</b><small>" + escapeHtml(I18N.t("ho_avg")) + "</small>"
          : '<b class="none">·</b><small>' + escapeHtml(I18N.t("ho_unrated")) + "</small>") + "</span>" +
      "</button>" + chartHtml(c) +
      '<p class="ho-foot"><span class="ho-facts">' + facts.join("") + "</span>" +
        '<button type="button" class="btn btn-small ho-brew" data-open-brew="' + titleAttr(s.coffee.id) + '" aria-label="' +
          titleAttr(I18N.t("ho_brew_aria", { c: name })) + '">' + escapeHtml(I18N.t("home_brew_go")) + "</button></p></div></li>";
  }

  // ---------- Render and wiring ----------

  const SHOWN = 4;
  let written = "";
  /* Called by renderHome with what the dashboard already computed. The open
     coffees, the one drunk last first; then the bags at their end. Rewritten
     only when it changed: a sync answering twice must not cut a jar's
     movement or the dots arriving. */
  function renderOpenCoffees(o) {
    const zone = $("#home-open");
    if (!zone) return;
    const ends = typeof UI.bagEndCoffees === "function" ? UI.bagEndCoffees() : [];
    const scenes = ends.map((id, i) => UI.bagEndScene(id, { layout: "corner", index: i })).filter(Boolean);
    const all = UI.stockData().filter(s => !ends.includes(s.coffee.id)).map(s => openCoffee(s, o.exts, o.analyzable))
      .sort((a, b) => (a.row.leftover <= 0) - (b.row.leftover <= 0) || b.latest.localeCompare(a.latest));
    zone.hidden = !all.length && !scenes.length;
    if (zone.hidden) { written = ""; zone.innerHTML = ""; return; }
    const more = all.length - SHOWN;
    const html = '<div class="ho-head"><h3 id="ho-title">' + escapeHtml(I18N.t(all.length ? "ho_title" : "ho_title_ends")) + "</h3>" +
      '<button type="button" class="link-card" data-open-all>' + escapeHtml(I18N.t(more > 0 ? "ho_more" : "ho_all", { n: more })) + "</button></div>" +
      (all.length ? '<ul class="ho-list">' + all.slice(0, SHOWN).map(cardHtml).join("") + "</ul>" : "") +
      (scenes.length ? '<ul class="ho-ends">' + scenes.map((sc, i) => '<li class="ho-end" style="--i:' + (all.length + i) + '">' + sc + "</li>").join("") + "</ul>" +
        /* A phone keeps one pill for them (the corner's, until v9.41): it opens « Mes cafés » and its « À racheter » shelf. */
        '<button type="button" class="ho-ends-pill" data-open-all title="' + titleAttr(I18N.t("home_bag_end_title")) + '"><b>' + escapeHtml(I18N.t("home_bag_end")) + "</b><span>" +
        escapeHtml(ends.length === 1 ? I18N.tr((DATA.state.coffees.find(c => c.id === ends[0]) || {}).name || "") : I18N.t("home_bag_end_many", { n: ends.length })) +
        "</span>" + UI.icon("chevron") + "</button>" : "");
    if (html !== written) { zone.innerHTML = html; written = html; }
    // The jars move with the grams (a cup, a new bag); the morning fills them once.
    const morning = o.morning;
    UI.playJars(zone, morning && !morning.jarsFilled ? { from: 0, quiet: true } : undefined);
    if (morning) morning.jarsFilled = true;
    // The end of a bag plays the first time it is seen.
    if (scenes.length && typeof UI.playBagScenes === "function") UI.playBagScenes(zone);
  }

  // « Brasser »: the « Refaire » path with the cup that holds the setting, never its result.
  function brewCoffee(coffeeId) {
    const target = brewTarget(coffeeId, DATA.state.extractions, UI.analyzableExts());
    const ref = target ? DATA.state.extractions.find(e => e.id === target.refId) : null;
    if (ref) {
      UI.redoCup(ref);
      UI.toast(I18N.t("setting_prefilled"));
      return;
    }
    UI.resetEntry();
    const sel = $("#f-coffee");
    if (sel) { sel.value = coffeeId; if (sel.value === coffeeId) UI.onCoffeeChoice(); }
    UI.activateScreen("entry");
  }

  function wireOpenCoffees() {
    const zone = $("#home-open");
    if (!zone) return;
    zone.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-open-brew]");
      if (b) { brewCoffee(b.getAttribute("data-open-brew")); return; }
      if (ev.target.closest && ev.target.closest("[data-open-all]")) UI.openCoffeesPage();
    });
  }

  Object.assign(UI, { coffeeTrend, rollingMean, sparkScale, methodAverages, brewTarget, openCoffee, renderOpenCoffees, wireOpenCoffees });
})();
