/* Q13 (v9.17): THE CUP THAT ARRIVES FROM THE OTHER DEVICE.
 *
 * Chris logs a cup on the phone in the kitchen; the computer is open on the
 * dashboard. When the sync brings that cup, the bean turns raw then roasted
 * and pops (js/ui-sync-bean.js), the cup slides in at the top of the latest
 * cups with a copper background that fades, and a small pill says « de
 * l'autre appareil »; the grams of its bag move in the stock corner
 * (js/ui-jar.js) and the counts of the day and the week roll to their new
 * figure (js/ui-roll.js) instead of counting up from zero. He knows it went
 * through without reloading anything.
 *
 * WHICH CUPS: those DATA.synchronize found in the merged result and not on
 * this device just before the merge (DATA.lastArrivals, memory only, never
 * written). A cup saved here, even during the exchange, never counts; a first
 * sync on an empty device does not either. The pill does not guess which
 * device: the extractions do not say where they were logged, and a guess
 * (« du téléphone » on a computer) would be wrong the day Chris uses a
 * tablet. The data says « another device », so the pill says that.
 *
 * WHEN: the pill stays SHOWN_MS after the arrival. The slide plays ONCE per
 * cup, when its row is actually seen: the dashboard not on screen, the page
 * hidden, or the row scrolled out of view, and it waits. A render in the
 * middle of the slide (the sync notifies twice) resumes it where it is.
 * Reduced motion: the pill only, nothing slides, nothing rolls. */
"use strict";

(() => {

  const escapeHtml = TOOLS.escapeHtml;

  // How long a cup that came in keeps its pill.
  const SHOWN_MS = 10 * 60 * 1000;
  // The slide (480 ms) and the copper fading behind it.
  const PLAY_MS = 2200;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  // id -> the moment its slide started (performance.now()).
  const played = new Map();

  /* The ids still wearing their pill. Pure on its input: `list` is
     DATA.lastArrivals(), `at` the current time in ms. */
  function shownArrivals(list, at) {
    return new Set((list || []).filter(a => a && a.id && at - a.at < SHOWN_MS).map(a => a.id));
  }
  function recentArrivals() {
    return typeof DATA.lastArrivals === "function" ? shownArrivals(DATA.lastArrivals(), Date.now()) : new Set();
  }

  // The pill of a row.
  function arrivalPill() {
    return '<span class="arrival-from">' + escapeHtml(I18N.t("arrival_from_other")) + "</span>";
  }

  /* Whether this render shows a cup that has yet to slide, or is sliding:
     the dashboard then rolls its counts from what it showed. */
  function arrivalsPlaying() {
    if (calm()) return false;
    const t = now();
    return [...recentArrivals()].some(id => !played.has(id) || t - played.get(id) < PLAY_MS);
  }

  /* Starts, or resumes, the slide of the rows of one cup. */
  function slide(rows, t0) {
    const shift = Math.max(0, now() - t0);
    if (shift >= PLAY_MS) return;
    rows.forEach(row => {
      row.style.setProperty("--arrival-shift", (-shift).toFixed(0) + "ms");
      row.classList.add("arrival-play");
    });
    setTimeout(() => rows.forEach(row => row.classList.remove("arrival-play")), PLAY_MS - shift + 50);
  }

  let seen = null;
  /* Gives life to the arrived rows just drawn in `list` (the dashboard's
     latest cups). Each slides the first time it is in view. */
  function playArrivals(list) {
    if (seen) seen.disconnect();
    if (!list || typeof list.querySelectorAll !== "function" || calm()) return;
    const rows = [...list.querySelectorAll("tr.arrived[data-ext]")];
    const byCup = id => [...list.querySelectorAll("tr[data-ext]")].filter(r => r.dataset.ext === id);
    const waiting = [];
    rows.forEach(row => {
      const id = row.dataset.ext;
      if (played.has(id)) slide(byCup(id), played.get(id));
      else waiting.push(row);
    });
    if (!waiting.length) return;
    wireReturn();
    const start = row => {
      const id = row.dataset.ext;
      if (played.has(id) || row.isConnected === false) return;
      played.set(id, now());
      slide(byCup(id), played.get(id));
    };
    if (hidden()) return;
    /* In view right now: it starts in this very task, before the row is ever
       painted still. Otherwise it starts as it scrolls in (or at once when
       there is nothing to tell whether it is in view). */
    const inView = row => {
      if (typeof row.getBoundingClientRect !== "function" || typeof window.innerHeight !== "number") return false;
      const r = row.getBoundingClientRect();
      return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    };
    const later = waiting.filter(row => {
      if (inView(row) || typeof IntersectionObserver !== "function") { start(row); return false; }
      return true;
    });
    if (!later.length) return;
    seen = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting || hidden()) return;
      seen.unobserve(entry.target);
      start(entry.target);
    }));
    later.forEach(row => seen.observe(row));
  }

  /* The page comes back: the rows that waited while it was hidden are
     looked at again (the observer may have answered while hidden). Wired
     the first time a row waits. */
  let returnWired = false;
  function wireReturn() {
    if (returnWired || typeof document.addEventListener !== "function") return;
    returnWired = true;
    document.addEventListener("visibilitychange", () => {
      if (hidden() || !UI.nav || UI.nav.screenName !== "dashboard") return;
      const list = document.getElementById("latest-list");
      if (list && list.querySelector && list.querySelector("tr.arrived[data-ext]")) playArrivals(list);
    });
  }

  Object.assign(UI, { shownArrivals, recentArrivals, arrivalPill, arrivalsPlaying, playArrivals, ARRIVAL_SHOWN_MS: SHOWN_MS });
})();
