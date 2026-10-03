/* The COFFEE CARD (v8.46): everything the logbook knows about a coffee, in
 * one place.
 *
 * Before it, this was scattered: the bag and its stock in « Mes cafés », the
 * best setting in « Mes meilleurs réglages », the tastes in the history, the
 * freshness in the entry form column. And nothing showed how a coffee
 * evolves over the life of its bag.
 *
 * Freshness starts from the bag's OPENING DATE, not the roast date: Chris's
 * bags almost never carry one. Each cup therefore has its day of the bag
 * (DATA.calcs, days_open), and the WINDOW is learned from its ratings:
 * the day bands where the cups of THIS coffee beat its average, from
 * MIN_PER_BAND cups per band. As long as there are not enough, the card
 * shows the curve without a window, and says so.
 *
 * Opens from « Mes meilleurs réglages » and « Mes cafés », in a dialog on
 * the page. No new data: everything is already entered. */
"use strict";

(() => {

  const { $, analyzableExts, extsWithCalcs, fmtDecimal, average, fallbacks, toast } = UI;

  /* The day bands of the bag, in days since opening (0 = the day itself).
     Tight at the start, where the coffee moves the most, then wider. */
  const BANDS = [[0, 3], [4, 7], [8, 11], [12, 15], [16, 21], [22, 28], [29, 60]];
  const MIN_PER_BAND = 3;
  const REORDER_CUPS = 3;
  let openId = null;
  // L4: the open tab, and whether opening pushed an entry into the browser history.
  let sheetTab = "setting";
  let historyEntry = false;
  // True when the card closes to open another screen: the history entry then becomes that screen's.
  let closingToNavigate = false;
  // The coffee on the other side in « Comparer avec… » (v8.56), reset on each card.
  let compareId = "";

  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);

  function localDate(s) {
    const [a, m, j] = String(s).slice(0, 10).split("-").map(Number);
    return a && m && j ? new Date(a, m - 1, j) : null;
  }
  function shortDay(s) {
    const d = localDate(s);
    return d ? d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) : "";
  }

  /* The day of the CURRENT bag, counted like the cups: 0 on the opening
     day. Null without an open bag. */
  function currentBagDay(coffeeId) {
    const s = DATA.currentBag(coffeeId);
    if (!s || !s.opened_date) return null;
    const d = localDate(s.opened_date);
    if (!d) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { day: Math.max(0, Math.round((today - d) / 86400000)), openedOn: s.opened_date };
  }

  /* THE LEARNED WINDOW. The bands with enough cups; among them, those above
     the coffee's average. The window runs from the first good one to the
     last good one: an isolated dip in the middle of a good bag is noise, not
     a closing. At least two documented bands are needed, otherwise there is
     nothing to compare. */
  function learnWindow(rated, coffeeAvg) {
    const bands = BANDS.map(([a, b]) => {
      const ratings = rated.filter(e => e._c.days_open !== "" && e._c.days_open >= a && e._c.days_open <= b)
        .map(e => Number(e.score_10));
      return { a, b, n: ratings.length, mean: ratings.length ? average(ratings) : null };
    });
    const documented = bands.filter(t => t.n >= MIN_PER_BAND);
    if (documented.length < 2) return { bands: bands, sweetSpot: null };
    const good = documented.filter(t => t.mean >= coffeeAvg);
    if (!good.length || good.length === documented.length) return { bands: bands, sweetSpot: null };
    /* The end stops at the last day a cup documents: the last band runs to
       day 60, and announcing « encore 19 jours » on days nobody tasted would
       be making it up. */
    const days = rated.filter(e => e._c.days_open !== "").map(e => e._c.days_open);
    const start = good[0].a, end = Math.min(good[good.length - 1].b, Math.max(...days));
    const inside = rated.filter(e => e._c.days_open !== "" && e._c.days_open >= start && e._c.days_open <= end);
    const outside = rated.filter(e => e._c.days_open !== "" && (e._c.days_open < start || e._c.days_open > end));
    if (!inside.length || !outside.length) return { bands: bands, sweetSpot: null };
    return {
      bands: bands,
      sweetSpot: {
        start: start, end: end,
        inside: average(inside.map(e => Number(e.score_10))),
        outside: average(outside.map(e => Number(e.score_10))),
      },
    };
  }

  /* The Guide shop, found by roaster: the links live in the Guide screen,
     sorted by house. Nothing if the roaster is not there. */
  function shopLink(coffee) {
    const t = String(coffee.roaster || "").trim().toLowerCase();
    if (!t) return null;
    const headings = Array.from(document.querySelectorAll(".shop h3"));
    const h = headings.find(x => {
      const name = (x.firstChild && x.firstChild.nodeValue ? x.firstChild.nodeValue : x.textContent).trim().toLowerCase();
      return name && (name.startsWith(t) || t.startsWith(name));
    });
    const a = h && h.querySelector("a[href]");
    return a ? a.getAttribute("href") : null;
  }

  /* MANUAL COUNT (v8.96): one field, prefilled with the computed stock.
     Hidden until the jar or « Corriger » has been clicked. */
  /* AND THE JAR ON THE SCALE (v9.13, Q8): Chris puts his jar on the scale and
     types what it shows; the empty jar, weighed once in Settings, comes off,
     and the count goes through the same correctStock. Until that weight
     exists, the section says where to set it instead of guessing one. */
  const fmtGrams = n => fmtDecimal(n, 1);
  function stockEditor(stock, coffee) {
    // A negative stock is wrong: an empty field rather than a 0 to erase, the bag size as a hint.
    const current = stock && stock.remaining > 0 ? Math.round(stock.remaining) : "";
    const hint = stock ? stock.format : 250;
    const tare = DATA.currentSettings().jar_tare_g;
    const bag = stock ? stock.format : Number(coffee.bag_size_g) || 0;
    const weigh = tare !== "" && Number(tare) > 0
      ? '<div class="sh-weigh"><label class="sh-weigh-title" for="sh-weigh-g">' + I18N.t("weigh_title") + "</label>" +
        '<div class="sh-stock-row">' +
          '<input type="text" id="sh-weigh-g" inputmode="decimal" autocomplete="off" enterkeyhint="done" data-tare="' + tare +
            '" data-bag="' + bag + '" aria-describedby="sh-weigh-out">' +
          "<span>" + I18N.t("weigh_unit") + "</span>" +
          '<button type="button" class="btn btn-small btn-primary" data-weigh>' + I18N.t("weigh_button") + "</button>" +
        "</div>" +
        '<p class="sh-weigh-out" id="sh-weigh-out" aria-live="polite">' + I18N.t("weigh_ready", { t: fmtGrams(Number(tare)) }) + "</p></div>"
      : '<div class="sh-weigh"><p class="sh-weigh-title">' + I18N.t("weigh_title") + "</p>" +
        '<p class="sh-quiet">' + I18N.t("weigh_no_tare") +
        ' <button type="button" class="sh-correct" data-empty-go="settings-jar">' + I18N.t("weigh_set_tare") + "</button></p></div>";
    return '<form class="sh-stock-editing" id="sh-stock-editing" hidden>' +
      '<label for="sh-stock-g">' + I18N.t("sheet_stock_label") + "</label>" +
      '<div class="sh-stock-row">' +
        '<input type="number" id="sh-stock-g" min="0" max="5000" step="1" inputmode="decimal" value="' + current +
          '" placeholder="' + hint + '">' +
        "<span>g</span>" +
        '<button type="submit" class="btn btn-small btn-primary">' + I18N.t("sheet_stock_save") + "</button>" +
        '<button type="button" class="btn btn-small btn-subtle" data-stock-cancel>' + I18N.t("sheet_stock_cancel") + "</button>" +
      "</div>" +
      '<p class="sh-quiet">' + I18N.t("sheet_stock_help") + "</p>" + weigh + "</form>";
  }

  /* What the scale reading gives, said as it is typed: the subtraction, or
     why it cannot be right. Returns the weighing (DATA.weighJar). */
  function weighReading() {
    const field = $("#sh-weigh-g"), out = $("#sh-weigh-out");
    if (!field || !out) return null;
    const w = DATA.weighJar(field.value, field.dataset.tare, field.dataset.bag);
    const typed = String(field.value).trim() !== "";
    out.classList.toggle("sh-weigh-bad", typed && w.error !== "");
    out.innerHTML = !typed ? escapeHtml(I18N.t("weigh_ready", { t: fmtGrams(Number(field.dataset.tare)) }))
      : w.error === "no_reading" ? escapeHtml(I18N.t("weigh_no_reading"))
      : w.error === "below_jar" ? escapeHtml(I18N.t("weigh_below_jar", { t: fmtGrams(w.tare) }))
      : w.error === "above_bag" ? escapeHtml(I18N.t("weigh_above_bag", { n: fmtGrams(w.net), f: fmtGrams(w.bag) }))
      : escapeHtml(I18N.t("weigh_result", { r: fmtGrams(w.total), t: fmtGrams(w.tare) })) + " <b>" +
        escapeHtml(I18N.t("weigh_net", { n: fmtGrams(w.net) })) + "</b>";
    return w;
  }

  async function applyWeighing() {
    const w = weighReading();
    if (!w) return;
    if (w.error) { $("#sh-weigh-g").focus(); return; }
    await DATA.correctStock(openId, w.net);
    toast(I18N.t("toast_weighed", { n: fmtGrams(w.net) }));
  }

  function bagBlock(coffee, exts, rated, coffeeAvg) {
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const dose = doses.length ? average(doses) : fallbacks.dose;
    const stock = DATA.bagStock(coffee.id, fallbacks.dose);
    const jc = currentBagDay(coffee.id);
    const f = learnWindow(rated, coffeeAvg);
    let html = '<section class="sh-block sh-bag"><h3 class="sh-h">' + I18N.t("sheet_bag") + "</h3>";
    if (stock) {
      const left = Math.max(0, stock.remaining);
      const cups = Math.floor(left / dose);
      const pc = Math.max(0, Math.min(100, (left / stock.format) * 100));
      html += '<div class="sh-gauge" role="img" aria-label="' + escapeHtml(I18N.t("sheet_gauge", { r: fmtDecimal(left, 0), f: stock.format })) +
        '"><i style="width:' + pc.toFixed(1) + '%"></i></div>' +
        '<div class="sh-row"><span><b>' + fmtDecimal(left, 0) + " g</b> " + I18N.t("sheet_out_of", { f: stock.format }) +
          ' <button type="button" class="sh-correct" data-stock-edit>' + I18N.t("sheet_stock_correct") + "</button></span>" +
        "<span>" + (stock.remaining <= 0 ? I18N.t("stock_empty") : I18N.t("sheet_cups", { n: cups })) + "</span></div>" +
        (stock.corrected ? '<p class="sh-quiet">' + I18N.t("sheet_stock_counted", {
          d: new Date(stock.corrected).toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" }) }) + "</p>" : "");
      if (cups <= REORDER_CUPS) {
        const link = shopLink(coffee);
        html += '<p class="sh-rebuy">' + I18N.t("sheet_rebuy") +
          (link ? ' <a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' +
            I18N.t("sheet_shop", { t: escapeHtml(coffee.roaster) }) + "</a>" : "") + "</p>";
      }
    } else {
      html += '<p class="sh-quiet">' + I18N.t("sheet_no_stock") +
        ' <button type="button" class="sh-correct" data-stock-edit>' + I18N.t("sheet_stock_enter") + "</button></p>";
    }
    // Delete the current bag, entered by mistake (v8.77): the function existed without a button.
    const bag = DATA.currentBag(coffee.id);
    if (bag) html += '<button type="button" class="btn btn-small btn-subtle sh-delete-bag" data-delete-bag="' + escapeHtml(bag.id) + '">' + I18N.t("sheet_delete_bag") + "</button>";

    // The freshness ruler: day 1 on the left, the window in accent, today as a line.
    const max = Math.max(28, ...rated.map(e => e._c.days_open === "" ? 0 : e._c.days_open), jc ? jc.day : 0);
    const x = j => Math.max(0, Math.min(100, (j / max) * 100));
    if (f.sweetSpot || jc) {
      html += '<div class="sh-freshness" aria-hidden="true">' +
        (f.sweetSpot ? '<span class="sh-window" style="left:' + x(f.sweetSpot.start).toFixed(1) + "%;width:" +
          (x(Math.min(f.sweetSpot.end, max)) - x(f.sweetSpot.start)).toFixed(1) + '%"></span>' : "") +
        (jc ? '<span class="sh-today" style="left:' + x(jc.day).toFixed(1) + '%"></span>' : "") + "</div>" +
        '<div class="sh-leg"><span>' + I18N.t("sheet_day", { n: 1 }) + "</span>" +
        (f.sweetSpot ? "<span>" + I18N.t("sheet_window_legend", { a: f.sweetSpot.start + 1, b: Math.min(f.sweetSpot.end, max) + 1 }) + "</span>" : "") +
        "<span>" + I18N.t("sheet_day", { n: max + 1 }) + "</span></div>";
    }
    const sentences = [];
    if (jc) sentences.push(I18N.t("sheet_opened", { n: jc.day + 1, d: shortDay(jc.openedOn) }));
    if (f.sweetSpot) {
      sentences.push(I18N.t("sheet_window", {
        a: f.sweetSpot.start + 1, b: Math.min(f.sweetSpot.end, max) + 1, x: fmtRating(f.sweetSpot.inside), y: fmtRating(f.sweetSpot.outside),
      }));
      if (jc) {
        const key = jc.day < f.sweetSpot.start ? "sheet_before" : jc.day > f.sweetSpot.end ? "sheet_after"
          : jc.day === f.sweetSpot.end ? "sheet_inside_edge" : "sheet_inside";
        sentences.push(I18N.t(key, { n: Math.abs((jc.day < f.sweetSpot.start ? f.sweetSpot.start : f.sweetSpot.end) - jc.day) }));
      }
    } else if (rated.some(e => e._c.days_open !== "")) {
      sentences.push(I18N.t("sheet_no_window", { n: MIN_PER_BAND }));
    }
    if (sentences.length) html += '<p class="sh-text">' + sentences.join(" ") + "</p>";
    return { html: html + "</section>", sweetSpot: f, max, jc };
  }

  /* The curve: each cup as a dot, each band's average as a line, the window
     as background. Same rating scale as everywhere, from 0 to 10. */
  function curveBlock(rated, f, max, jc) {
    const points = rated.filter(e => e._c.days_open !== "");
    let html = '<section class="sh-block sh-curve"><h3 class="sh-h">' + I18N.t("sheet_curve") + "</h3>";
    if (points.length < 2) return html + '<p class="sh-quiet">' + I18N.t("sheet_curve_empty") + "</p></section>";
    const G = 30, D = 312, H = 12, B = 132, L = 320;
    const x = j => G + (Math.min(j, max) / max) * (D - G);
    const y = n => B - (n / 10) * (B - H);
    let svg = "";
    if (f.sweetSpot) {
      svg += '<rect x="' + x(f.sweetSpot.start).toFixed(1) + '" y="' + H + '" width="' +
        (x(Math.min(f.sweetSpot.end, max)) - x(f.sweetSpot.start)).toFixed(1) + '" height="' + (B - H) + '" class="sh-c-window"></rect>';
    }
    [0, 5, 10].forEach(n => {
      svg += '<line x1="' + G + '" y1="' + y(n) + '" x2="' + D + '" y2="' + y(n) + '" class="sh-c-grid"></line>' +
        '<text x="' + (G - 6) + '" y="' + (y(n) + 3) + '" text-anchor="end">' + n + "</text>";
    });
    points.forEach(e => {
      svg += '<circle cx="' + x(e._c.days_open).toFixed(1) + '" cy="' + y(Number(e.score_10)).toFixed(1) +
        '" r="3" class="sh-c-point" data-cup="' + escapeHtml(e.id) + '"><title>' + escapeHtml(shortDay(e.date_time) + " : " + fmtRating(Number(e.score_10))) + "</title></circle>";
    });
    const bandAverages = f.bands.filter(t => t.n > 0 && t.a <= max)
      .map(t => [x((t.a + Math.min(t.b, max)) / 2), y(t.mean)]);
    if (bandAverages.length > 1) {
      svg += '<path d="M' + bandAverages.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + '" class="sh-c-row"></path>';
    }
    if (jc && jc.day <= max) {
      svg += '<line x1="' + x(jc.day) + '" y1="' + H + '" x2="' + x(jc.day) + '" y2="' + B + '" class="sh-c-today"></line>';
    }
    svg += '<text x="' + G + '" y="' + (B + 16) + '">' + I18N.t("sheet_day", { n: 1 }) + "</text>" +
      '<text x="' + D + '" y="' + (B + 16) + '" text-anchor="end">' + I18N.t("sheet_day", { n: max + 1 }) + "</text>";
    // data-scrub: under a finger, each cup reads without aiming at its dot (M4, js/ui-scrub.js).
    return html + '<svg class="sh-svg" viewBox="0 0 ' + L + ' 152" data-scrub data-scrub-top="' + H + '" data-scrub-bottom="' + B + '" role="img" aria-label="' +
      escapeHtml(I18N.t("sheet_curve_aria", { n: points.length })) + '">' + svg + "</svg></section>";
  }

  function latestBlock(exts) {
    const latest = exts.slice().sort((a, b) => String(b.date_time).localeCompare(String(a.date_time))).slice(0, 5);
    return '<section class="sh-block sh-latest"><h3 class="sh-h">' + I18N.t("sheet_latest") + "</h3>" +
      '<ol class="sh-list">' + latest.map(e =>
        '<li><span class="sh-date">' + shortDay(e.date_time) + '</span><span class="sh-what">' +
        '<span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' + escapeHtml(I18N.tr(e.recipe || "")) +
        (e.grind_dial ? " · " + escapeHtml(e.grind_dial) : "") + "</span><b>" +
        (e.score_10 === "" ? "·" : fmtRating(Number(e.score_10))) + "</b></li>").join("") + "</ol></section>";
  }

  function renderSheet() {
    const coffee = DATA.state.coffees.find(c => c.id === openId);
    const zone = $("#sheet-content");
    if (!coffee || !zone) return;
    // What happened (latest cups, stock) versus what advises
    // (averages, window, setting): the same rule as the dashboard.
    const exts = extsWithCalcs().filter(e => e.coffee_id === coffee.id);
    const rated = analyzableExts().filter(e => e.coffee_id === coffee.id && e.score_10 !== "");
    const coffeeAvg = rated.length ? average(rated.map(e => Number(e.score_10))) : 0;
    const machines = {};
    exts.forEach(e => { if (e.method) machines[e.method] = (machines[e.method] || 0) + 1; });
    const machine = Object.entries(machines).sort((a, b) => b[1] - a[1])[0];
    const pct = Number(coffee.real_coffee_pct);
    const chips = [
      coffee.roaster, coffee.origin, [coffee.species, coffee.process].filter(Boolean).join(" · "), coffee.roast,
    ].filter(Boolean).map(t => '<span class="sh-chip">' + escapeHtml(t) + "</span>").join("") +
      (pct > 0 && pct < 100 ? '<span class="sh-chip sh-chip-alert">' + pct + " % " + I18N.t("percent_coffee") + "</span>" : "") +
      (machine ? '<span class="sh-chip"><span class="dot-method ' + machine[0].toLowerCase() + '"></span>' +
        I18N.t("sheet_mostly", { m: I18N.machine(machine[0]) }) + "</span>" : "");

    const bag = bagBlock(coffee, exts, rated, coffeeAvg);
    const report = TUNING.forCoffee(coffee.id, analyzableExts());
    /* L4 (v8.92): THE CARD, A PASSPORT. Nine blocks stacked one under another
       made 2,750 px on the phone. At the top, who this coffee is: its jar at
       the bag's level, its shade by roast, and four figures. Below, four
       tabs: how you nail it, what it gives you, its bags, its cups. */
    const stock = DATA.bagStock(coffee.id, fallbacks.dose);
    /* Q8 (v9.13): the jar is the real one, to the gram (js/ui-jar.js). Its
       level, its graduations and its red under three cups come from the same
       gauge as the corner of the dashboard. */
    const gauge = DATA.bagGauge(coffee.id, fallbacks.dose);
    const jar = { coffeeId: coffee.id, grams: gauge ? gauge.grams : 0, bag: gauge ? gauge.bag : 0, low: !!(gauge && gauge.low),
      roast: UI.jarRoast(coffee), labels: true, unknown: !gauge };
    const best = rated.length ? Math.max(...rated.map(e => Number(e.score_10))) : null;
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const cost = UI.costPerCup(coffee, doses.length ? average(doses) : fallbacks.dose);
    const kpi = (v, l) => '<div class="sh-kpi"><b>' + v + "</b><span>" + l + "</span></div>";
    const TABS = [["setting", "sheet_tab_setting"], ["tastes", "sheet_tab_tastes"], ["bags", "sheet_tab_bags"], ["cups", "sheet_tab_cups"]];
    if (!TABS.some(([k]) => k === sheetTab)) sheetTab = "setting";
    const panel = (key, html) => '<div class="sh-panel" role="tabpanel" id="sh-p-' + key + '" aria-labelledby="sh-o-' + key + '"' +
      (key === sheetTab ? "" : " hidden") + '><div class="sh-grid">' + html + "</div></div>";
    const tastesBlock = '<section class="sh-block sh-tastes"><h3 class="sh-h">' + I18N.t("sheet_tastes") + "</h3>" +
      '<div class="sh-wheel"><svg id="sheet-wheel" class="wheel" viewBox="0 0 300 300" role="img" aria-label="' +
      escapeHtml(I18N.t("sheet_wheel_aria")) + '"></svg><div class="wheel-detail" id="sheet-wheel-detail" aria-live="polite"></div></div>' +
      '<p class="sh-quiet" id="sheet-wheel-empty" hidden>' + I18N.t("sheet_tastes_empty") + "</p></section>";
    const settingBlock = '<section class="sh-block sh-setting"><h3 class="sh-h">' + I18N.t("sheet_setting") + "</h3>" +
      UI.tuningCard({ coffee: coffee, ...report }) + "</section>";
    /* The drawings of this coffee (v8.50), rendered by js/ui-drawings.js. */
    const fingerprintBlock = '<section class="sh-block"><h3 class="sh-h">' + I18N.t("sheet_fingerprint") + "</h3>" +
      '<svg id="sheet-footprint" class="sh-drawing" viewBox="0 0 320 210" role="img" aria-label="' + escapeHtml(I18N.t("sheet_fingerprint")) + '"></svg>' +
      '<p class="sh-text" id="sheet-footprint-reading"></p></section>';
    const trajectoryBlock = '<section class="sh-block"><h3 class="sh-h">' + I18N.t("sheet_trajectory") + "</h3>" +
      '<svg id="sheet-trajectory" class="sh-drawing" viewBox="0 0 320 172" role="img" aria-label="' + escapeHtml(I18N.t("sheet_trajectory")) + '"></svg>' +
      '<p class="sh-text" id="sheet-trajectory-reading"></p></section>';
    const grinderBlock = '<section class="sh-block"><h3 class="sh-h">' + I18N.t("sheet_grinder") + "</h3>" +
      '<svg id="sheet-grinder" class="sh-drawing" viewBox="0 0 320 126" role="img" aria-label="' + escapeHtml(I18N.t("sheet_grinder")) + '"></svg>' +
      '<p class="sh-text" id="sheet-grinder-reading"></p></section>';
    zone.innerHTML =
      '<header class="sh-head sh-passport">' +
        /* THE JAR IS CORRECTED WITH ONE CLICK (v8.96): its grams below, a bean
           drawn inside so that an empty bag no longer looks like a missing
           image, and the click opens the manual count just below. */
        '<div class="sh-jar-block">' +
          '<button type="button" class="sh-jar" data-stock-edit aria-label="' +
            escapeHtml(I18N.t("sheet_stock_aria", { g: stock ? fmtDecimal(Math.max(0, stock.remaining), 0) : "?" })) + '"' +
            (gauge ? UI.jarData(jar) : "") + ">" + UI.jarSvg(jar) + "</button>" +
          /* Below zero, the computation is necessarily wrong (cups from another bag,
             bag not entered): « à compter » invites a correction, where « 0 g »
             suggested an empty bag. */
          (stock && stock.remaining < 0
            ? '<button type="button" class="sh-jar-g sh-to-count" data-stock-edit>' + I18N.t("sheet_stock_to_count") + "</button>"
            : '<span class="sh-jar-g' + (jar.low ? " low" : "") + '"' + (gauge ? ' data-jar-grams="' + escapeHtml(coffee.id) + '"' : "") + ">" +
              (stock ? fmtDecimal(stock.remaining, 0) + " g" : "") + "</span>") +
        "</div>" +
        '<div class="sh-identity"><p class="highlight">' + I18N.t("sheet_highlight") + "</p>" +
        '<h2 id="sheet-name">' + escapeHtml(coffee.name) + "</h2>" + '<div class="sh-chips">' + chips + "</div></div>" +
      "</header>" +
      stockEditor(stock, coffee) +
      /* M6 (v9.13): a coffee without a cup says what to do, instead of four
         figures at zero. */
      (exts.length ? '<div class="sh-kpis">' +
        kpi(exts.length, I18N.t("sheet_kpi_cups")) +
        kpi(rated.length ? fmtRating(coffeeAvg) : "·", I18N.t("sheet_kpi_average")) +
        kpi(best !== null ? fmtRating(best) : "·", I18N.t("sheet_kpi_best")) +
        // Price only: « 7 348 ₫ la tasse de 14,7 g » would repeat the label below.
        kpi(cost ? escapeHtml(String(cost).replace(/^([^₫]*₫).*$/, "$1")) : "·", I18N.t("sheet_kpi_cost")) +
      "</div>" : firstCupHint(coffee)) +
      '<div class="sh-tabs" role="tablist" aria-label="' + escapeHtml(I18N.t("sheet_tabs")) + '">' +
        TABS.map(([k, key]) => '<button type="button" role="tab" id="sh-o-' + k + '" data-tab="' + k + '" aria-controls="sh-p-' + k +
          '" aria-selected="' + (k === sheetTab) + '" tabindex="' + (k === sheetTab ? 0 : -1) + '">' + I18N.t(key) + "</button>").join("") +
      "</div>" +
      panel("setting", settingBlock + grinderBlock + trajectoryBlock) +
      panel("tastes", tastesBlock + fingerprintBlock) +
      panel("bags", bag.html + curveBlock(rated, bag.sweetSpot, bag.max, bag.jc)) +
      panel("cups", latestBlock(exts) + compareBlock(coffee));
    UI.drawFingerprint("sheet-footprint", coffee.id);
    UI.drawTrajectory("sheet-trajectory", coffee.id);
    UI.drawGrinder("sheet-grinder", coffee.id);
    renderComparison();
    const tasteCount = CHARTS.aromaWheel(rated, { svg: "sheet-wheel", detail: "sheet-wheel-detail", reading: "" });
    $("#sheet-wheel-empty").hidden = tasteCount > 0;
    $(".sh-wheel").hidden = tasteCount === 0;
    // The jar moves from what this device showed last (a cup, a weighing, a new bag).
    UI.playJars(zone);
  }

  /* M6 (v9.13): THE COFFEE WITHOUT A CUP. Its bag (opened, or waiting), the
     recipe its card recommends, and the button that brews the first one. */
  function firstCupHint(coffee) {
    const jc = currentBagDay(coffee.id);
    const bag = DATA.currentBag(coffee.id);
    const lines = [];
    if (jc) lines.push(jc.day === 0 ? I18N.t("sheet_first_opened_today") : I18N.t("sheet_first_opened", { n: jc.day, s: jc.day > 1 ? "s" : "" }));
    else if (bag) lines.push(I18N.t("sheet_first_sleeping"));
    if (coffee.recommended_recipe) lines.push(I18N.t("sheet_first_recipe", { r: I18N.tr(coffee.recommended_recipe) }));
    else lines.push(I18N.t("sheet_first_any"));
    return UI.emptyHint({
      drawing: "cup", title: I18N.t("sheet_first_title", { c: coffee.name }), text: lines.join(" "),
      action: I18N.t("sheet_first_go"), go: "sheet-brew", wide: true,
    });
  }

  /* TWO COFFEES SIDE BY SIDE (v8.56). « Comparer avec… » at the foot of the card:
     the two fingerprints overlaid, and face to face what helps choose what to
     buy again, their average, their brewer, their best setting, their
     freshness window, their cost per cup and the recurring taste. Everything
     comes from the same computations as the rest of the card. */
  function compareBlock(coffee) {
    const others = DATA.state.coffees.filter(c => c.id !== coffee.id && DATA.state.extractions.some(e => e.coffee_id === c.id));
    if (!others.length) return "";
    return '<section class="sh-block sh-compare"><div class="sh-compare-head"><h3 class="sh-h">' + I18N.t("sheet_compare") + "</h3>" +
      '<select id="sheet-compare" aria-label="' + escapeHtml(I18N.t("sheet_compare")) + '"><option value="">' + escapeHtml(I18N.t("sheet_compare_pick")) + "</option>" +
      others.map(c => '<option value="' + escapeHtml(c.id) + '"' + (c.id === compareId ? " selected" : "") + ">" + escapeHtml(c.name) + "</option>").join("") +
      '</select></div><div id="sheet-comparison"></div></section>';
  }
  function coffeeSummary(c) {
    const rated = analyzableExts().filter(e => e.coffee_id === c.id && e.score_10 !== "");
    const exts = extsWithCalcs().filter(e => e.coffee_id === c.id);
    const avg = rated.length ? average(rated.map(e => Number(e.score_10))) : null;
    const machines = {};
    exts.forEach(e => { if (e.method) machines[e.method] = (machines[e.method] || 0) + 1; });
    const machine = Object.keys(machines).sort((a, b) => machines[b] - machines[a])[0];
    const report = TUNING.forCoffee(c.id, analyzableExts());
    const m = report.best;
    const f = learnWindow(rated, avg || 0).sweetSpot;
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const tags = {};
    rated.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
    const topTaste = Object.keys(tags).sort((a, b) => tags[b] - tags[a])[0];
    return [
      avg === null ? I18N.t("sheet_not_rated") : I18N.t("sheet_cmp_average", { m: fmtRating(avg), n: rated.length }),
      machine ? I18N.machine(machine) : "·",
      m ? [I18N.tr(m.recipe || ""), m.grind || ""].filter(Boolean).join(" · ") + ", " + fmtRating(m.average) : I18N.t("sheet_cmp_no_setting"),
      f ? I18N.t("sheet_cmp_days", { a: f.start + 1, b: f.end + 1 }) : I18N.t("sheet_cmp_no_window"),
      UI.costPerCup(c, doses.length ? average(doses) : fallbacks.dose) || "·",
      topTaste ? I18N.tag(topTaste) : "·",
    ];
  }
  function renderComparison() {
    const zone = $("#sheet-comparison");
    if (!zone) return;
    const a = DATA.state.coffees.find(c => c.id === openId), b = DATA.state.coffees.find(c => c.id === compareId);
    if (!a || !b) { zone.innerHTML = ""; return; }
    const ra = coffeeSummary(a), rb = coffeeSummary(b);
    const rows = ["sheet_cmp_score", "sheet_cmp_machine", "sheet_cmp_setting", "sheet_cmp_window", "sheet_cmp_cost", "sheet_cmp_taste"];
    zone.innerHTML = '<div class="sh-compare-body"><div>' +
      '<svg id="sheet-duo" class="sh-drawing" viewBox="0 0 320 210" role="img" aria-label="' + escapeHtml(I18N.t("sheet_duo_aria", { a: a.name, b: b.name })) + '"></svg>' +
      '<div class="sh-duo-leg"><span><i class="sh-duo-a"></i>' + escapeHtml(a.name) + '</span><span><i class="sh-duo-b"></i>' + escapeHtml(b.name) + "</span></div>" +
      '<p class="sh-text" id="sheet-duo-reading"></p></div>' +
      '<table class="sh-duo-table"><thead><tr><th></th><th>' + escapeHtml(a.name) + "</th><th>" + escapeHtml(b.name) + "</th></tr></thead><tbody>" +
      rows.map((key, i) => "<tr><th>" + escapeHtml(I18N.t(key)) + "</th><td>" + escapeHtml(ra[i]) + "</td><td>" + escapeHtml(rb[i]) + "</td></tr>").join("") +
      "</tbody></table></div>";
    UI.drawFingerprint("sheet-duo", a.id, b.id);
  }

  function openSheet(coffeeId) {
    if (!DATA.state.coffees.some(c => c.id === coffeeId)) return;
    if (coffeeId !== openId) { compareId = ""; sheetTab = "setting"; }
    openId = coffeeId;
    renderSheet();
    const m = $("#modal-sheet");
    /* The phone back button closes the card instead of leaving the screen:
       opening pushes an entry into the browser history (without touching
       the address, which drives the screens). */
    if (!m.open) {
      try { history.pushState({ sheet: coffeeId }, ""); historyEntry = true; } catch (e) { historyEntry = false; }
      // v9.13: on a wide screen, beside the screen instead of over it (js/ui-panel.js).
      if (!UI.showInSidePanel(m, coffeeId)) m.showModal();
    }
    // Now on screen: the jar plays the change since this device last showed it.
    UI.playJars($("#sheet-content"));
    const scroller = $("#sheet-content");
    if (scroller) scroller.scrollTop = 0;
  }

  // Re-rendered when the data or the language changes, if it is open.
  function renderOpenSheet() {
    const m = $("#modal-sheet");
    if (m && m.open) renderSheet();
  }

  function showTab(k, focus) {
    sheetTab = k;
    document.querySelectorAll(".sh-tabs [role=tab]").forEach(b => {
      const on = b.dataset.tab === k;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    document.querySelectorAll(".sh-panel").forEach(p => { p.hidden = p.id !== "sh-p-" + k; });
  }

  function wireSheet() {
    // The card tabs: the content is rewritten on each render, so we delegate.
    $("#sheet-content").addEventListener("click", ev => {
      const b = ev.target.closest(".sh-tabs [data-tab]");
      if (b) showTab(b.dataset.tab);
    });
    $("#sheet-content").addEventListener("keydown", ev => {
      const b = ev.target.closest(".sh-tabs [data-tab]");
      if (!b) return;
      const list = [...document.querySelectorAll(".sh-tabs [data-tab]")];
      const i = list.indexOf(b);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
      if (j === undefined) return;
      ev.preventDefault();
      showTab(list[(j + list.length) % list.length].dataset.tab, true);
    });
    // Phone back: we close; closing any other way removes the pushed entry.
    window.addEventListener("popstate", () => {
      const m = $("#modal-sheet");
      if (m.open && historyEntry) { historyEntry = false; m.close(); }
    });
    $("#modal-sheet").addEventListener("close", () => {
      /* Simply closing removes the entry pushed on opening. Closing to go
         elsewhere (Brew, Edit) leaves it: activateScreen rewrites it to its
         address, and going back now would cancel that screen change. */
      if (historyEntry && !closingToNavigate) { try { history.back(); } catch (e) { /* nothing to remove */ } }
      historyEntry = false;
      closingToNavigate = false;
    });
    /* The manual count: open, cancel, save (v8.96). */
    const editor = () => $("#sh-stock-editing");
    const closeEditor = () => { const f = editor(); if (f) f.hidden = true; };
    $("#sheet-content").addEventListener("click", ev => {
      if (ev.target.closest("[data-stock-cancel]")) { closeEditor(); return; }
      if (!ev.target.closest("[data-stock-edit]")) return;
      const f = editor();
      if (!f) return;
      f.hidden = false;
      f.scrollIntoView({ block: "nearest" });
      /* With an empty jar weight set, the jar on the scale is THE gesture
         (Q8): its field takes the focus. Otherwise the grams, as before. */
      const field = $("#sh-weigh-g") || $("#sh-stock-g");
      field.focus();
      field.select();
    });
    $("#sheet-content").addEventListener("input", ev => {
      if (ev.target.id === "sh-weigh-g") weighReading();
    });
    $("#sheet-content").addEventListener("click", ev => {
      if (ev.target.closest("[data-weigh]")) applyWeighing();
    });
    $("#sheet-content").addEventListener("keydown", ev => {
      // Escape closes the count, not the whole card.
      if (ev.key !== "Escape" || !ev.target.closest("#sh-stock-editing")) return;
      ev.preventDefault();
      ev.stopPropagation();
      closeEditor();
    });
    $("#sheet-content").addEventListener("submit", async ev => {
      if (!ev.target.closest("#sh-stock-editing")) return;
      ev.preventDefault();
      // Enter in the scale field weighs; it does not save the grams field above it.
      if (document.activeElement && document.activeElement.id === "sh-weigh-g") { applyWeighing(); return; }
      const g = Number(String($("#sh-stock-g").value).replace(",", "."));
      if (!Number.isFinite(g) || g < 0) { $("#sh-stock-g").focus(); return; }
      await DATA.correctStock(openId, g);
      toast(I18N.t("toast_stock_corrected", { g: fmtDecimal(g, 0) }));
    });
    $("#sheet-content").addEventListener("click", async ev => {
      const b = ev.target.closest("[data-delete-bag]");
      if (!b) return;
      const a = DATA.state.purchases.find(x => x.id === b.dataset.deleteBag);
      if (!a || !await UI.askConfirm(I18N.t("confirm_delete_bag", { d: a.purchase_date || "?" }), { danger: true })) return;
      await DATA.deletePurchase(a.id);
      UI.toast(I18N.t("toast_bag_deleted"));
    });
    $("#sheet-brew").addEventListener("click", () => {
      const id = openId;
      closingToNavigate = true;
      $("#modal-sheet").close();
      UI.resetEntry();
      const sel = $("#f-coffee");
      sel.value = id;
      if (sel.value === id) UI.onCoffeeChoice();
      else toast(I18N.t("sheet_inactive"));
      // No edit in progress (resetEntry just closed it): nothing to abandon.
      UI.activateScreen("entry");
    });
    /* The two ways out of an empty or unweighable part of the card (v9.13):
       brew the first cup, or set the empty jar in Settings. */
    $("#sheet-content").addEventListener("click", ev => {
      const b = ev.target.closest("[data-empty-go]");
      if (!b) return;
      if (b.dataset.emptyGo === "sheet-brew") { $("#sheet-brew").click(); return; }
      if (b.dataset.emptyGo !== "settings-jar") return;
      closingToNavigate = true;
      $("#modal-sheet").close();
      UI.openSettingsSection("ps-jar");
    });
    $("#sheet-edit").addEventListener("click", () => {
      const id = openId;
      closingToNavigate = true;
      $("#modal-sheet").close();
      UI.openCoffeesModal();
      UI.openCoffeeForm(id);
    });
    $("#sheet-content").addEventListener("change", ev => {
      if (ev.target.id !== "sheet-compare") return;
      compareId = ev.target.value;
      renderComparison();
    });
    // The « Refaire » button of the best setting card, rendered in the coffee card.
    $("#sheet-content").addEventListener("click", ev => {
      const b = ev.target.closest("[data-redo]");
      if (!b) return;
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.redo);
      if (!ext) return;
      $("#modal-sheet").close();
      UI.redoCup(ext);
      toast(I18N.t("setting_prefilled"));
    });
    // Delegated on the document: the « Fiche » buttons are born with their lists.
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-sheet]");
      if (b) openSheet(b.dataset.sheet);
    });
    DATA.subscribe(renderOpenSheet);
  }

  // Under names that say what they are outside this file: the dashboard shelf uses them.
  const freshnessWindow = learnWindow, bagDay = currentBagDay, BAG_SLICES = BANDS;
  Object.assign(UI, { wireSheet, freshnessWindow, bagDay, openSheet, renderOpenSheet, BAG_SLICES });
})();
