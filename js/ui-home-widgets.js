/* THE AROMA WHEEL OF THE MONTH, ON THE HOME (v9.27, alone since v9.41).
 *
 * Under the finding, on a wide screen, the wheel of the month's tastes: the
 * one drawing Chris wanted back on the home. Drawn by CHARTS.aromaWheel with
 * the rated analysable cups of the last 30 days; a tap opens its Analyses
 * tile, large. Nothing when the month has no taste, nothing on a phone.
 *
 * v9.41 took out its two neighbours (the recipe podium and the grinder map,
 * both one tap away in Analyses) and the average beside the grams, now part
 * of each open coffee's card (js/ui-home-open.js). The card arrives with the
 * column's stagger and tilts with the home's other small cards
 * (js/ui-feel.js). Reduced motion: it is simply there. */
"use strict";

(() => {

  const { $, nav } = UI;

  // Built once, after the finding: the drawing function finds its svg by id.
  function host() {
    let box = $("#home-widgets");
    if (box) return box;
    const anchor = $("#home-finding");
    if (!anchor || !anchor.parentNode || typeof document.createElement !== "function") return null;
    box = document.createElement("div");
    box.id = "home-widgets";
    box.className = "home-widgets";
    box.innerHTML = '<button type="button" class="card home-widget hwg-wheel" data-widget-tile="tastes" hidden>' +
      '<span class="hwg-head"><span class="hw-title"></span>' + UI.icon("chevron") + "</span>" +
      '<svg id="hwg-wheel" class="wheel hwg-art" viewBox="0 0 300 300" aria-hidden="true" focusable="false"></svg>' +
      '<span class="hwg-reading" id="hwg-wheel-reading"></span></button>';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
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

  /* Called after each home render. Nothing is drawn while the column is not
     shown (a phone, the side panel narrowing the home). */
  function renderHomeWidgets() {
    const box = host();
    if (!box) return;
    box.hidden = false;
    if (typeof getComputedStyle !== "function" || getComputedStyle(box).display === "none") return;
    const card = box.querySelector(".hwg-wheel");
    const rated = UI.inPeriod(UI.analyzableExts(), UI.periodStart("30", new Date())).filter(e => e.score_10 !== "");
    card.querySelector(".hw-title").textContent = I18N.t("hwg_wheel_title");
    card.setAttribute("aria-label", I18N.t("hwg_wheel_title") + ". " + I18N.t("hwg_open"));
    card.title = I18N.t("hwg_open");
    const shown = rated.length > 0 && CHARTS.aromaWheel(rated, { svg: "hwg-wheel", detail: "hwg-wheel-detail", reading: "hwg-wheel-reading" }) > 0;
    quiet(card.querySelector("svg"));
    card.hidden = !shown;
    box.hidden = !shown;
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
    if (typeof window.addEventListener === "function") window.addEventListener("resize", UI.debounce(() => {
      if (nav.screenName === "dashboard") renderHomeWidgets();
    }, 200));
    I18N.subscribe(() => { if ($("#home-widgets")) renderHomeWidgets(); });
  }

  Object.assign(UI, { renderHomeWidgets, wireHomeWidgets });
})();
