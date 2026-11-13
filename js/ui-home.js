/* THE HOME'S FRAME (L1, v9.21; what is left of it after v9.41, v9.44, v9.45).
 *
 * The open coffees are js/ui-home-open.js, the charts js/ui-home-charts.js,
 * the last cup and the latest cups js/ui-dashboard.js. This file holds what
 * ties the page together:
 *
 *   - THE BAND (J4): scrolling down, the last cup folds into a band stuck at
 *     the top, its name and its score flying from the card into it;
 *   - the blocks arriving one after the other when the screen opens.
 *
 * What left, and why: v9.41 the month's card, the podium, the grinder map,
 * the bags' column and the suggestion line (Analyses and the open coffees say
 * them); v9.44 the sentence « À retenir » and the wheel of the month's
 * tastes; v9.45 the week (its card and its line: Chris did not read its bars,
 * the 30 days chart shows the same days, and the streak moved beside the
 * date). */
"use strict";

(() => {

  const { $, titleAttr, fmtDecimal, nav } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";

  /* Rewritten only when what it says changed (compared with what was
     written, not with innerHTML, which the browser serializes its own way):
     a sync answering twice must not cut a movement under way. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el || written.get(el) === html) return false;
    written.set(el, html);
    el.innerHTML = html;
    return true;
  }

  // ---------- The band (J4) ----------

  const band = { cup: null, shown: false, ticking: false };
  function renderBand(e) {
    const el = $("#home-band");
    if (!el) return;
    band.cup = e || null;
    if (!e) { el.hidden = true; put(el, ""); band.shown = false; el.classList.remove("shown"); return; }
    el.hidden = false;
    const score = e.score_10 !== "" && e.score_10 !== undefined ? fmtRating(Number(e.score_10)) : "";
    const html = '<button type="button" class="hbd-inner" data-band-top aria-label="' + titleAttr(I18N.t("home_band_aria")) + '">' +
      '<span class="hbd-who"><small>' + escapeHtml(I18N.t("home_band_label")) + "</small>" +
      '<span class="hbd-name"><span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' +
      escapeHtml(I18N.tr(e._c ? e._c.coffee_name : "")) + "</span></span>" +
      (score ? '<span class="hbd-score">' + escapeHtml(score) + "</span>" : "") + "</button>";
    put(el, html);
    el.setAttribute("aria-hidden", String(!band.shown));
    placeBand();
  }

  /* The band covers the screen's column, beside the rail and the side panel.
     By its two edges, never by a width (v9.23): while the screen arrives, its
     transform makes it the band's containing block, and a left plus a width
     pushed the hidden band past the window's right edge, so the page scrolled
     sideways. Two edges keep it inside whatever holds it. */
  function placeBand() {
    const el = $("#home-band"), main = $("main");
    if (!el || !main || typeof main.getBoundingClientRect !== "function") return;
    const r = main.getBoundingClientRect();
    const view = document.documentElement && document.documentElement.clientWidth;
    if (!r.width || !view) return;
    el.style.left = Math.round(r.left) + "px";
    el.style.right = Math.max(0, Math.round(view - r.right)) + "px";
    el.style.width = "";
  }

  /* Shown once the card's head (name and score) has gone under the top edge;
     hidden as soon as it comes back. Showing it, the name and the score fly
     from where they were in the card to their place in the band (FLIP). */
  function updateBand() {
    band.ticking = false;
    const el = $("#home-band"), head = $("#card-last .lc-head");
    if (!el || el.hidden || !band.cup || !head || nav.screenName !== "dashboard") return;
    const r = head.getBoundingClientRect();
    const want = r.height > 0 && r.bottom < 12;
    if (want === band.shown) return;
    band.shown = want;
    el.setAttribute("aria-hidden", String(!want));
    if (want) placeBand();
    const fromName = head.querySelector(".last-big-coffee"), fromScore = head.querySelector(".big-rating");
    const first = want && fromName ? [fromName.getBoundingClientRect(), fromScore ? fromScore.getBoundingClientRect() : null] : null;
    el.classList.toggle("shown", want);
    if (!want || calm() || hidden() || !first) return;
    [[".hbd-name", first[0]], [".hbd-score", first[1]]].forEach(([sel, a]) => {
      const to = el.querySelector(sel);
      if (!to || !a || typeof to.animate !== "function") return;
      const b = to.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const sx = a.width / b.width, sy = a.height / b.height;
      to.animate([
        { transform: "translate(" + (a.left - b.left).toFixed(1) + "px, " + (a.top - b.top).toFixed(1) + "px) scale(" + sx.toFixed(3) + ", " + sy.toFixed(3) + ")", opacity: 0.4 },
        { transform: "none", opacity: 1 },
      ], { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" });
    });
  }
  function onScroll() {
    if (band.ticking || nav.screenName !== "dashboard") return;
    band.ticking = true;
    requestAnimationFrame(updateBand);
  }

  // ---------- The entrance ----------

  /* The blocks arrive one after the other when the home screen opens (and
     only then: a sync redrawing it must not replay the entrance). */
  function playEntrance() {
    const root = $("#dashboard-content");
    if (!root || calm() || hidden() || !root.classList) return;
    root.classList.remove("home-enter");
    void root.offsetWidth;
    root.classList.add("home-enter");
    // Until the last dot of the open coffees has landed (css/home.css).
    setTimeout(() => root.classList.remove("home-enter"), 900);
  }

  // ---------- Render and wiring ----------

  /* Called by renderDashboard with what it already computed, or with null
     when the logbook is empty. */
  function renderHome(o) {
    if (!o) { renderBand(null); UI.renderMoments(null); return; }
    // v9.41: the open coffees first, under the title (js/ui-home-open.js).
    UI.renderOpenCoffees(o);
    // v9.44, v9.45: the matrix, the bags' end, the 30 days (js/ui-home-charts.js).
    UI.renderHomeCharts(o);
    renderBand(o.last);
    // R4 and R9 (v9.23): the steam of a cup still hot, the streak beside the date (js/ui-celebrate.js).
    UI.renderMoments(o);
    if (nav.screenName === "dashboard") onScroll();
  }

  function wireHome() {
    const bandEl = $("#home-band");
    if (bandEl) bandEl.addEventListener("click", ev => {
      if (!ev.target.closest("[data-band-top]")) return;
      window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { placeBand(); onScroll(); });
    /* The entrance plays when the home screen gets its "on" class, which
       activateScreen gives it (at boot too, behind the loading silhouette). */
    const screen = $("#screen-dashboard");
    if (screen && typeof MutationObserver === "function") {
      new MutationObserver(records => {
        if (records.some(r => !String(r.oldValue || "").split(" ").includes("on")) && screen.classList.contains("on")) {
          playEntrance();
          band.shown = false;
          const el = $("#home-band");
          if (el) el.classList.remove("shown");
        }
      }).observe(screen, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    }
    UI.wireOpenCoffees();
    UI.wireHomeCharts();
  }

  Object.assign(UI, {
    renderHome, wireHome,
  });
})();
