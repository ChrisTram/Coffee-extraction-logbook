/* L1 (v9.21, tightened in v9.41): THE HOME, IN THREE QUESTIONS.
 *
 * Where are my open coffees, what did I drink, how is my week. The open
 * coffees are js/ui-home-open.js; ui-dashboard.js draws the last cup and the
 * latest cups; this file draws the rest:
 *
 *   - the WEEK in one line (cups, average, best), and on a wide screen as a
 *     card with a bar per day, tinted by the score (the recap's bars);
 *   - ONE finding « À retenir », that turns (1 sur 5), the others in Analyses;
 *   - THE BAND (J4): scrolling down, the last cup folds into a band stuck at
 *     the top, its name and its score flying from the card into it;
 *   - the blocks arrive one after the other when the screen opens.
 *
 * v9.41 took out of the home what Analyses and « Mes cafés » already say:
 * the month's card, the podium and the grinder map, the bags' column and the
 * suggestion line (each open coffee now has its own « Brasser »).
 *
 * The pure parts (the week, which finding first) take their data as
 * arguments: tools/home.test.mjs runs them without a page. */
"use strict";

(() => {

  const { $, titleAttr, localDateKey, fmtDecimal, average, nav } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const dayOf = dt => String(dt).slice(0, 10);

  // ---------- The week (pure) ----------

  /* The CURRENT week, Monday to Sunday, as the mockup's « 28 sept. au 4 oct. »:
     a bar per day (cups, and their average for the tint), the cups, the
     rated average and the best cup. Days still to come are marked as such. */
  function weekSummary(exts, analyzable, now) {
    const start = new Date(now || new Date());
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const today = localDateKey(now || new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      return { date: d, key: localDateKey(d) };
    });
    const keys = new Set(days.map(d => d.key));
    const cups = exts.filter(e => keys.has(dayOf(e.date_time)));
    const rated = analyzable.filter(e => e.score_10 !== "" && e.score_10 !== undefined && keys.has(dayOf(e.date_time)));
    days.forEach(d => {
      d.n = cups.filter(e => dayOf(e.date_time) === d.key).length;
      const notes = rated.filter(e => dayOf(e.date_time) === d.key).map(e => Number(e.score_10));
      d.mean = notes.length ? average(notes) : null;
      d.future = d.key > today;
    });
    const best = rated.slice().sort((a, b) => Number(b.score_10) - Number(a.score_10) ||
      String(b.date_time).localeCompare(String(a.date_time)))[0];
    return {
      start: start, end: days[6].date, days: days, cups: cups.length, rated: rated.length,
      mean: rated.length ? average(rated.map(e => Number(e.score_10))) : null,
      best: best ? { id: best.id, score: Number(best.score_10), date_time: best.date_time, coffee_id: best.coffee_id } : null,
    };
  }

  // « aujourd'hui », « hier », or the weekday: the best cup of the week is in it.
  function weekDayWord(dt, now) {
    const d = new Date(String(dt).slice(0, 10) + "T12:00"), t = new Date(now || new Date());
    t.setHours(12, 0, 0, 0);
    const gap = Math.round((t - d) / 86400000);
    if (gap === 0) return I18N.t("date_today").toLowerCase();
    if (gap === 1) return I18N.t("date_yesterday").toLowerCase();
    return d.toLocaleDateString(I18N.locale(), { weekday: "long" });
  }

  /* Which finding opens the card: a different one each day, so the card does
     not say the same thing every morning. */
  function findingStart(count, key) {
    if (!(count > 0)) return 0;
    const n = String(key || "").split("").reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7);
    return n % count;
  }

  // ---------- The week, drawn ----------

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

  /* A bar per day: the height counts the cups, the tint says their average
     (the recap's rule, v8.87: pale at 4 and below, full at 9). */
  const tint = m => (m === null ? 0.45 : Math.max(0.28, Math.min(1, (m - 4) / 5)));
  let weekShown = null;
  function renderWeek(w, morning) {
    const card = $("#home-week"), line = $("#home-week-line");
    if (!card || !line) return;
    if (!w) { card.hidden = true; line.hidden = true; return; }
    const fmtDay = d => d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
    const cupsText = I18N.t("home_week_cups", { n: w.cups, s: w.cups > 1 ? "s" : "" });
    const avgText = w.mean !== null ? I18N.t("home_week_avg", { m: fmtRating(w.mean) }) : I18N.t("home_week_unrated");
    const bestText = w.best ? I18N.t("home_week_best", { b: fmtRating(w.best.score), d: weekDayWord(w.best.date_time) }) : "";
    /* The line of a phone says the average as a bare figure, as the mockup's
       « 9 tasses · 7,8 · la meilleure, 9 hier »: one line, not two. */
    const shortAvg = w.mean !== null ? fmtRating(w.mean) : avgText;
    const figuresWith = avg => w.cups
      ? '<b class="hw-cups">' + escapeHtml(cupsText) + '</b><span class="hw-sep" aria-hidden="true">·</span><span class="hw-avg">' + escapeHtml(avg) + "</span>" +
        (bestText ? '<span class="hw-sep" aria-hidden="true">·</span><span class="hw-best">' + escapeHtml(bestText) + "</span>" : "")
      : '<span class="hw-none">' + escapeHtml(I18N.t("home_week_none")) + "</span>";
    const figures = figuresWith(avgText);
    const max = Math.max(1, ...w.days.map(d => d.n));
    const bars = w.days.map(d => '<span class="hw-day' + (d.future ? " future" : "") + '"><i style="--h:' +
      (d.n ? Math.max(0.14, d.n / max) : 0.06).toFixed(2) + ";--o:" + tint(d.mean).toFixed(2) + '"></i><small>' +
      escapeHtml(d.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" })) + "</small></span>").join("");
    const title = I18N.t("recap_title", { a: w.start.getMonth() === w.end.getMonth() ? String(w.start.getDate()) : fmtDay(w.start), b: fmtDay(w.end) });
    card.hidden = false;
    card.setAttribute("aria-label", title + ". " + (w.cups ? [cupsText, avgText, bestText].filter(Boolean).join(", ") : I18N.t("home_week_none")) + ". " + I18N.t("home_week_aria"));
    card.innerHTML = '<span class="hw-head"><span class="hw-title">' + escapeHtml(title) + '</span><span class="hw-figures">' + figures + "</span></span>" +
      '<span class="hw-bars" aria-hidden="true">' + bars + "</span>";
    line.hidden = false;
    line.title = I18N.t("home_week_aria");
    line.setAttribute("aria-label", card.getAttribute("aria-label"));
    line.innerHTML = '<span class="hw-label">' + escapeHtml(I18N.t("home_week_label")) + '</span><span class="hw-figures">' + figuresWith(shortAvg) + "</span>" +
      '<span class="hw-bars hw-mini" aria-hidden="true">' + bars + "</span>" + UI.icon("chevron");
    /* Q13: a cup that came in from the other device, the counts roll from
       what they showed; Q7: the first opening of the day, the bars grow. */
    if (weekShown && UI.arrivalsPlaying()) {
      [[card, avgText, weekShown.avg], [line, shortAvg, weekShown.shortAvg]].forEach(([el, avg, was]) => {
        const c = el.querySelector(".hw-cups"), a = el.querySelector(".hw-avg");
        if (c && weekShown.cups !== cupsText) UI.rollText(c, cupsText, weekShown.cups);
        if (a && was !== avg) UI.rollText(a, avg, was);
      });
    }
    weekShown = { cups: cupsText, avg: avgText, shortAvg: shortAvg };
    if (morning) [card, line].forEach(el => growBars(el, morning));
  }

  // The bars of the week grow from the ground, one after the other (Q7).
  function growBars(el, a) {
    if (!a || !el || !el.classList) return;
    const elapsed = performance.now() - a.t0;
    if (elapsed > 950) return;
    el.style.setProperty("--morning-shift", (-elapsed).toFixed(0) + "ms");
    [...el.querySelectorAll(".hw-day i")].forEach((bar, i) => bar.style.setProperty("--d", String(i)));
    el.classList.add("morning-grow");
    setTimeout(() => el.classList.remove("morning-grow"), Math.max(0, 1150 - elapsed));
  }

  /* v9.25: the side column follows the scroll on a wide screen (sticky,
     css/home.css). Under the band of the last cup when it fits the window;
     taller than the window, a negative top: it scrolls down to its foot
     first, then stays. Only a value: the phone's single column ignores it. */
  const SIDE_TOP = 84, SIDE_FOOT = 18;
  function sideTop(height, view) {
    if (!(height > 0) || !(view > 0)) return SIDE_TOP;
    return height + SIDE_TOP + SIDE_FOOT <= view ? SIDE_TOP : Math.round(view - height - SIDE_FOOT);
  }
  function placeSide() {
    const side = $("#home-side");
    if (!side || !side.style || typeof window.innerHeight !== "number") return;
    side.style.setProperty("--home-side-top", sideTop(side.offsetHeight, window.innerHeight) + "px");
  }

  // ---------- One finding, that turns ----------

  const finding = { list: [], index: null, day: "", timer: null, paused: false };
  const ROTATE_MS = 12000;
  function findingMarkup(c) {
    return '<p class="hf-text">' + c.text + "</p>" +
      (c.confidence ? '<p class="hf-proof">' + escapeHtml(I18N.t("finding_" + c.confidence)) + " · " +
        escapeHtml(I18N.t("finding_counts", { h: c.high.n, b: c.low.n })) + "</p>" : "");
  }
  function renderFinding(analyzable) {
    const card = $("#home-finding");
    if (!card) return;
    const list = UI.computeInsights(analyzable).filter(c => c.high);
    card.hidden = !list.length;
    finding.list = list;
    if (!list.length) { put(card, ""); return; }
    const today = localDateKey(new Date());
    if (finding.index === null || finding.day !== today) { finding.index = findingStart(list.length, today); finding.day = today; }
    finding.index %= list.length;
    const html = '<div class="card-head"><h3>' + escapeHtml(I18N.t("home_finding_title")) + "</h3>" +
      (list.length > 1 ? '<button type="button" class="btn-square-small hf-next" data-finding-next aria-label="' +
        titleAttr(I18N.t("home_finding_next")) + '">' + UI.icon("chevron") + "</button>" : "") + "</div>" +
      '<div class="hf-stage" aria-live="polite">' + findingMarkup(list[finding.index]) + "</div>" +
      '<p class="hf-foot"><span class="hf-pos">' + (list.length > 1 ? escapeHtml(I18N.t("home_finding_pos", { i: finding.index + 1, n: list.length })) : "") + "</span>" +
      '<button type="button" class="link-card hf-all" data-home-go="analytics">' + escapeHtml(I18N.t("home_finding_all")) + " ›</button></p>";
    put(card, html);
  }

  /* The next finding slides in from the right while the shown one leaves to
     the left. Calm: it is simply replaced. */
  function nextFinding(step) {
    const card = $("#home-finding");
    const list = finding.list;
    if (!card || list.length < 2) return;
    finding.index = (finding.index + (step || 1) + list.length) % list.length;
    const stage = card.querySelector(".hf-stage"), pos = card.querySelector(".hf-pos");
    if (pos) pos.textContent = I18N.t("home_finding_pos", { i: finding.index + 1, n: list.length });
    if (!stage) return;
    if (calm() || hidden() || typeof stage.insertAdjacentHTML !== "function") { stage.innerHTML = findingMarkup(list[finding.index]); return; }
    [...stage.children].forEach(el => { if (el.classList.contains("hf-out")) el.remove(); });
    const old = document.createElement("div");
    old.className = "hf-slide hf-out";
    old.setAttribute("aria-hidden", "true");
    while (stage.firstChild) old.appendChild(stage.firstChild);
    stage.appendChild(old);
    const fresh = document.createElement("div");
    fresh.className = "hf-slide hf-in";
    fresh.innerHTML = findingMarkup(list[finding.index]);
    stage.appendChild(fresh);
    setTimeout(() => { old.remove(); while (fresh.firstChild) stage.insertBefore(fresh.firstChild, fresh); fresh.remove(); }, 520);
  }

  /* It turns by itself every twelve seconds, but only seen: the home on
     screen, the page visible, the card in view, nobody reading it (pointer
     over it or focus inside), and never with reduced motion. */
  function startRotation() {
    if (finding.timer || typeof setInterval !== "function") return;
    finding.timer = setInterval(() => {
      const card = $("#home-finding");
      if (!card || card.hidden || finding.paused || calm() || hidden() || nav.screenName !== "dashboard") return;
      if (typeof card.getBoundingClientRect !== "function" || typeof window.innerHeight !== "number") return;
      const r = card.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || !r.height) return;
      nextFinding(1);
    }, ROTATE_MS);
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
    setTimeout(() => root.classList.remove("home-enter"), 1100);
  }

  // ---------- Render and wiring ----------

  /* Called by renderDashboard with what it already computed, or with null
     when the logbook is empty. */
  function renderHome(o) {
    if (!o) { renderWeek(null); renderBand(null); UI.renderMoments(null); return; }
    // v9.41: the open coffees first, under the title (js/ui-home-open.js).
    UI.renderOpenCoffees(o);
    renderWeek(weekSummary(o.exts, o.analyzable, new Date()), o.morning);
    renderFinding(o.analyzable);
    renderBand(o.last);
    // R4 and R9 (v9.23): the steam of a cup still hot, the streak on the week (js/ui-celebrate.js).
    UI.renderMoments(o);
    if (nav.screenName === "dashboard") onScroll();
    // The aroma wheel of the month, under the finding on a wide screen (js/ui-home-widgets.js).
    UI.renderHomeWidgets();
    placeSide();
  }

  function wireHome() {
    const go = screen => { if (UI.showAnalyticsPeriod && screen === "analytics") UI.showAnalyticsPeriod("7"); UI.activateScreen(screen); };
    [$("#home-week"), $("#home-week-line")].forEach(b => { if (b) b.addEventListener("click", () => go("analytics")); });
    // The side column's sticky top follows its height (a finding turning).
    const side = $("#home-side");
    if (side && typeof ResizeObserver === "function") new ResizeObserver(() => placeSide()).observe(side);
    const findingCard = $("#home-finding");
    if (findingCard) {
      findingCard.addEventListener("click", ev => {
        if (ev.target.closest("[data-finding-next]")) { nextFinding(1); return; }
        const link = ev.target.closest("[data-home-go]");
        if (link) UI.activateScreen(link.dataset.homeGo);
      });
      // Nobody reads a sentence that moves: the rotation waits under the pointer and the focus.
      findingCard.addEventListener("pointerenter", () => { finding.paused = true; });
      findingCard.addEventListener("pointerleave", () => { finding.paused = false; });
      findingCard.addEventListener("focusin", () => { finding.paused = true; });
      findingCard.addEventListener("focusout", () => { finding.paused = false; });
    }
    const bandEl = $("#home-band");
    if (bandEl) bandEl.addEventListener("click", ev => {
      if (!ev.target.closest("[data-band-top]")) return;
      window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { placeBand(); placeSide(); onScroll(); });
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
    startRotation();
    UI.wireOpenCoffees();
    UI.wireHomeWidgets();
  }

  Object.assign(UI, {
    weekSummary, findingStart, weekDayWord, renderHome, wireHome, nextFinding, sideTop,
  });
})();
