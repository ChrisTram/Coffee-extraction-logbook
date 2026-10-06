/* v9.27: THE HOME'S SIDE COLUMN, FILLED AGAIN.
 *
 * Two small things Chris asked for on the home of a computer:
 *
 *   - THE AVERAGE NEXT TO THE GRAMS. Wherever the home shows a bag in grams
 *     (the rows of « Tes sachets, en grammes », the chips under « Accueil »),
 *     the coffee's average sits beside it, small, in the serif of the scores:
 *     « 191 g · 12 tasses · 7,8 ». The same average as everywhere: the
 *     analysable rated cups (no botched one), through TOOLS.average. Nothing
 *     when the coffee has no rated cup. A phone keeps its chips as they were
 *     (css/panel.css): its corner must stay one short row.
 *   - SMALL CARDS UNDER « TON MOIS ». The v9.21 home sent its drawings to
 *     Analyses and left the foot of the column empty. Under the month, three
 *     small cards come back, in this order: the aroma wheel of the month's
 *     tastes (his favourite drawing), the recipe podium of the month, the
 *     grinder map of the month. Each is drawn by its own function
 *     (CHARTS.aromaWheel, UI.drawPodium, UI.drawGrinder) and a tap opens its
 *     Analyses tile, large. They stop where the main column stops: the last
 *     ones that would make the column taller than it are hidden, so the page
 *     never grows for them. A phone gets none of them.
 *
 * The cards arrive with the column's stagger and tilt with the home's other
 * small cards (js/ui-feel.js). Reduced motion: they are simply there. */
"use strict";

(() => {

  const { $, titleAttr, fmtDecimal, nav } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  // ---------- The average of a coffee (pure) ----------

  /* The average of each coffee over its analysable rated cups, as a Map;
     a coffee without a rated cup is not in it. */
  function coffeeAverages(analyzable) {
    const per = new Map();
    (analyzable || []).forEach(e => {
      if (e.score_10 === "" || e.score_10 === undefined || e.score_10 === null || !Number.isFinite(Number(e.score_10))) return;
      if (!per.has(e.coffee_id)) per.set(e.coffee_id, []);
      per.get(e.coffee_id).push(Number(e.score_10));
    });
    return new Map([...per].map(([id, list]) => [id, TOOLS.average(list)]));
  }

  // Read once per render of the home: the corner and the rows ask for each coffee.
  let cache = { at: -1, map: new Map() };
  function averageOf(coffeeId) {
    const stamp = DATA.state.extractions.length + ":" + (DATA.state.extractions.reduce((m, e) => Math.max(m, Number(e.updated_at) || 0), 0));
    if (cache.at !== stamp) cache = { at: stamp, map: coffeeAverages(UI.analyzableExts()) };
    return cache.map.has(coffeeId) ? cache.map.get(coffeeId) : null;
  }

  /* The average, written next to the grams: « · 7,8 ». Empty when the
     coffee has no rated cup. `cls` places it (the rows, the chips). */
  function bagAverageHtml(coffeeId, cls) {
    const m = averageOf(coffeeId);
    if (m === null) return "";
    const text = fmtDecimal(m, 1);
    return '<span class="bag-avg ' + (cls || "") + '" title="' + titleAttr(I18N.t("bag_avg_title", { m: text })) + '">' +
      '<span class="bag-avg-sep" aria-hidden="true">·</span><b>' + escapeHtml(text) + '</b><span class="offscreen">' +
      escapeHtml(I18N.t("bag_avg_aria", { m: text })) + "</span></span>";
  }

  // ---------- The small cards under « Ton mois » ----------

  const WIDGETS = [
    { key: "wheel", tile: "tastes", svg: '<svg id="hwg-wheel" class="wheel hwg-art" viewBox="0 0 300 300" aria-hidden="true" focusable="false"></svg>' },
    { key: "podium", tile: "recipes", svg: '<svg id="hwg-podium" class="drawing-svg hwg-art" viewBox="0 0 320 150" aria-hidden="true" focusable="false"></svg>' },
    { key: "grinder", tile: "grinder", svg: '<svg id="hwg-grinder" class="drawing-svg hwg-art" viewBox="0 0 320 126" aria-hidden="true" focusable="false"></svg>' },
  ];

  // Built once, after the month's card: the drawing functions find their svg by id.
  function host() {
    let box = $("#home-widgets");
    if (box) return box;
    const month = $("#home-month");
    if (!month || !month.parentNode || typeof document.createElement !== "function") return null;
    box = document.createElement("div");
    box.id = "home-widgets";
    box.className = "home-widgets";
    box.innerHTML = WIDGETS.map((w, i) =>
      '<button type="button" class="card home-widget hwg-' + w.key + '" data-widget-tile="' + w.tile + '" style="--hwg-i:' + i + '" hidden>' +
        '<span class="hwg-head"><span class="hw-title"></span>' + UI.icon("chevron") + "</span>" +
        w.svg + '<span class="hwg-reading" id="hwg-' + w.key + '-reading"></span></button>').join("");
    month.parentNode.insertBefore(box, month.nextSibling);
    box.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-widget-tile]");
      if (b) openTile(b.getAttribute("data-widget-tile"));
    });
    return box;
  }

  // A drawing inside a button holds nothing that takes the focus or a tap of its own.
  function quiet(svg) {
    if (!svg) return;
    svg.querySelectorAll("[tabindex], [role], [data-guide-recipe], [data-cup]").forEach(n => {
      n.removeAttribute("tabindex"); n.removeAttribute("role"); n.removeAttribute("data-guide-recipe"); n.removeAttribute("data-cup");
    });
  }

  /* Draws the cards that have something to show, with the month's cups:
     null when a card has nothing (a month without a taste, a podium without
     enough cups per recipe). */
  function drawWidgets(box) {
    const all = UI.analyzableExts();
    const start = UI.periodStart("30", new Date());
    const month = UI.inPeriod(all, start);
    const rated = month.filter(e => e.score_10 !== "");
    const shown = {};
    WIDGETS.forEach(w => {
      const card = box.querySelector(".hwg-" + w.key);
      const title = card.querySelector(".hw-title");
      title.textContent = I18N.t("hwg_" + w.key + "_title");
      card.setAttribute("aria-label", I18N.t("hwg_" + w.key + "_title") + ". " + I18N.t("hwg_open"));
      card.title = I18N.t("hwg_open");
      let ok = false;
      if (w.key === "wheel") ok = rated.length > 0 && CHARTS.aromaWheel(rated, { svg: "hwg-wheel", detail: "hwg-wheel-detail", reading: "hwg-wheel-reading" }) > 0;
      else if (w.key === "podium") { UI.drawPodium("hwg-podium", month); ok = !!card.querySelector(".dw-stair"); }
      else { UI.drawGrinder("hwg-grinder", null, month); ok = !!card.querySelector(".dw-grain"); }
      quiet(card.querySelector("svg"));
      shown[w.key] = ok;
    });
    return shown;
  }

  /* The bottom of the main column, measured from the top of the layout: the
     side column must not go past it. */
  function leftHeight() {
    const layout = $("#dashboard-content .home-layout");
    if (!layout || typeof layout.getBoundingClientRect !== "function") return 0;
    const top = layout.getBoundingClientRect().top;
    const bottoms = [".home-head", ".home-main", ".home-brew"].map(s => layout.querySelector(":scope > " + s))
      .filter(el => el && !el.hidden && el.getClientRects().length).map(el => el.getBoundingClientRect().bottom);
    return bottoms.length ? Math.max(...bottoms) - top : 0;
  }

  // Shows the cards that have something, then hides the last ones while the column is taller than the main one.
  let drawn = {};
  function fitWidgets() {
    const box = $("#home-widgets"), side = $("#home-side");
    if (!box || !side || typeof getComputedStyle !== "function" || getComputedStyle(box).display === "none") return;
    const cards = WIDGETS.map(w => box.querySelector(".hwg-" + w.key));
    cards.forEach((c, i) => { c.hidden = !drawn[WIDGETS[i].key]; });
    const limit = leftHeight();
    if (!limit) return;
    for (let i = cards.length - 1; i >= 0 && side.offsetHeight > limit + 2; i--) {
      if (!cards[i].hidden) cards[i].hidden = true;
    }
    box.hidden = cards.every(c => c.hidden);
  }

  /* Called after each home render. Nothing is drawn while the column is not
     shown (a phone, the side panel narrowing the home). */
  function renderHomeWidgets() {
    const box = host();
    if (!box) return;
    box.hidden = false;
    if (typeof getComputedStyle !== "function" || getComputedStyle(box).display === "none") return;
    drawn = drawWidgets(box);
    fitWidgets();
  }

  // Analyses, on the month, with the matching tile open large.
  function openTile(tile) {
    if (UI.showAnalyticsPeriod) UI.showAnalyticsPeriod("30");
    UI.activateScreen("analytics");
    setTimeout(() => {
      const t = $('#an-tiles .an-tile[data-tile="' + tile + '"]');
      if (t && !t.classList.contains("open")) UI.toggleTile(t, true);
    }, 60);
  }

  function wireHomeWidgets() {
    const main = $("#dashboard-content .home-main");
    const refit = () => { if (nav.screenName === "dashboard") fitWidgets(); };
    if (main && typeof ResizeObserver === "function") new ResizeObserver(refit).observe(main);
    if (typeof window.addEventListener === "function") window.addEventListener("resize", UI.debounce(() => {
      if (nav.screenName === "dashboard") renderHomeWidgets();
    }, 200));
    I18N.subscribe(() => { if ($("#home-widgets")) renderHomeWidgets(); });
  }

  Object.assign(UI, { coffeeAverages, bagAverageHtml, renderHomeWidgets, wireHomeWidgets, fitHomeWidgets: fitWidgets });
})();
