/* THE MOMENTS THAT MOVE (v9.13): the morning arrival (Q7) and the record that
 * shines (J6).
 *
 * Both are there for the pleasure of it, Chris asked for that in so many
 * words, and both are rare on purpose: the arrival plays at the first opening
 * of the day only, the record rolls the first time it is shown only. Nothing
 * here decides anything: the record itself is computed by DATA.bagRecord, the
 * levels by the jars (js/ui-jar.js). With reduced motion, everything is drawn
 * at its final value at once.
 *
 * A render can come in the middle of a movement (the sync answers a second
 * after the page opens, and the dashboard is drawn again). Every movement is
 * therefore a function of the time elapsed since it started, and a new render
 * resumes it where it is instead of starting it over. */
"use strict";

(() => {

  const { localDateKey } = UI;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const eased = p => 1 - Math.pow(1 - p, 3);

  // ---------- Q7: the morning arrival ----------

  /* The day of the last arrival, per device: the phone and the computer
     each have their own morning. */
  const MORNING_KEY = "morning-arrival";
  const MORNING_MS = 950;
  let arrival = null;

  // Pure: a new local day plays the arrival, the same day never again.
  function morningDue(lastDay, today) {
    return !!today && lastDay !== today;
  }

  /* Asked by the dashboard at each render, once it has cups to show. The
     first render of the day starts the arrival and writes the day; the
     renders that follow within the second get the same arrival, so that
     they resume it. Without storage, no arrival: it would play at every
     opening, which is the opposite of the idea. */
  function morningArrival() {
    const now = performance.now();
    if (arrival && now - arrival.t0 < MORNING_MS + 300) return arrival;
    arrival = null;
    if (hidden()) return null;
    const today = localDateKey(new Date());
    try {
      if (!morningDue(localStorage.getItem(MORNING_KEY), today)) return null;
      localStorage.setItem(MORNING_KEY, today);
    } catch (e) { return null; }
    if (calm()) return null;
    arrival = { t0: now, day: today };
    return arrival;
  }

  // The arrival under way, without starting one (the recap, drawn after the dashboard).
  function arrivalInProgress() {
    return arrival && performance.now() - arrival.t0 < MORNING_MS + 300 ? arrival : null;
  }

  /* The score of the last cup counts up to its value, from zero, in the same
     writing as the card (a whole number, or one decimal). */
  function countScore(card, a) {
    const el = card && card.querySelector ? card.querySelector(".big-rating") : null;
    if (!a || !el || el.querySelector(".odo")) return;
    const text = el.dataset.final || el.textContent;
    const target = Number(String(text).replace(",", "."));
    if (!(target > 0)) return;
    el.dataset.final = text;
    const dec = /[.,]/.test(text) ? 1 : 0, sep = text.includes(",") ? "," : ".";
    /* A frame that calls back at once (the test harness) ends the count on
       the spot; a page that gets no frame at all ends it by the clock. */
    let inside = false;
    const step = () => {
      if (el.isConnected === false) return;
      if (inside) { el.textContent = text; return; }
      inside = true;
      try {
        const p = Math.min(1, (performance.now() - a.t0) / MORNING_MS);
        el.textContent = p >= 1 ? text : (target * eased(p)).toFixed(dec).replace(".", sep);
        if (p < 1) requestAnimationFrame(step);
      } finally { inside = false; }
    };
    step();
    setTimeout(() => { if (el.isConnected !== false && !el.querySelector(".odo")) el.textContent = text; }, MORNING_MS + 150);
  }

  /* A wisp of steam rises from the score, as from the cup it stands for. */
  function steam(card, a) {
    if (!a || !card || typeof card.querySelector !== "function" || card.querySelector(".morning-steam")) return;
    const box = card.querySelector(".last-big-rating"), score = card.querySelector(".big-rating");
    if (!box || !score || typeof box.insertAdjacentHTML !== "function") return;
    const elapsed = performance.now() - a.t0;
    if (elapsed > MORNING_MS) return;
    box.insertAdjacentHTML("afterbegin",
      '<svg class="morning-steam" viewBox="0 0 40 34" aria-hidden="true" focusable="false" style="animation-delay:' + (-elapsed).toFixed(0) + 'ms">' +
      '<path d="M12 32 C8 24 16 18 12 6"></path><path d="M20 32 C16 22 24 16 20 2"></path><path d="M28 32 C24 24 32 18 28 6"></path></svg>');
    const wisp = box.querySelector(".morning-steam");
    const r = score.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (wisp && r.width) {
      wisp.style.left = (r.left - b.left + r.width / 2 - 20).toFixed(1) + "px";
      wisp.style.top = (r.top - b.top - 30).toFixed(1) + "px";
    }
    setTimeout(() => { if (wisp) wisp.remove(); }, Math.max(0, MORNING_MS + 500 - elapsed));
  }

  /* The bars of last week grow from the ground, one after the other. */
  function growRecap(card, a) {
    if (!a || !card || !card.classList) return;
    const elapsed = performance.now() - a.t0;
    if (elapsed > MORNING_MS) return;
    card.style.setProperty("--morning-shift", (-elapsed).toFixed(0) + "ms");
    [...card.querySelectorAll(".rc-day i")].forEach((bar, i) => bar.style.setProperty("--d", String(i)));
    card.classList.add("morning-grow");
    setTimeout(() => card.classList.remove("morning-grow"), Math.max(0, MORNING_MS + 200 - elapsed));
  }

  /* The whole arrival on the dashboard: the score, the steam (the stock
     pills are filled by the jars, the bars by the recap). */
  function playMorning(a) {
    if (!a) return;
    const card = document.getElementById("card-last");
    if (card && !card.hidden) { countScore(card, a); steam(card, a); }
  }

  // ---------- J6: the record that shines ----------

  const RECORD_KEY = "record-rolled";

  /* Pure: the columns of the odometer, from the old best to the new score,
     written with the same number of decimals. Each column rolls forward,
     never back: a digit that goes down goes round, and the last digit always
     makes a full turn, like a counter that ticks over. A leading column that
     did not exist before (9,5 to 10) starts blank. */
  function odometerColumns(fromScore, toScore) {
    const dec = Number.isInteger(Number(fromScore)) && Number.isInteger(Number(toScore)) ? 0 : 1;
    let a = Number(fromScore).toFixed(dec), b = Number(toScore).toFixed(dec);
    while (a.length < b.length) a = " " + a;
    while (b.length < a.length) b = " " + b;
    const last = b.length - 1;
    return [...b].map((ch, i) => {
      if (ch === ".") return { sep: true };
      const lead = a[i] === " ";
      const from = lead ? 0 : Number(a[i]), digit = ch === " " ? 0 : Number(ch);
      return { from: from, to: digit + (digit < from || i === last ? 10 : 0), lead: lead };
    });
  }

  function odometerHtml(cols, sep) {
    const cells = lead => Array.from({ length: 20 }, (_, i) => "<span>" + (lead && i === 0 ? "&nbsp;" : i % 10) + "</span>").join("");
    return '<span class="odo" aria-hidden="true">' + cols.map(c => c.sep
      ? '<span class="odo-sep">' + sep + "</span>"
      : '<span class="odo-col"><span class="odo-strip" style="--from:' + c.from + ";--to:" + c.to + '">' + cells(c.lead) + "</span></span>").join("") +
      "</span>";
  }

  /* The first time a record is shown on this device, its score rolls from the
     old best to the new one. Returns true if it rolls. The rotating border and
     the sentence are the card's (ui-last-cup.js): they stay as long as the
     record stands. */
  function playRecord(card, rec, ext) {
    if (!rec || !ext || !card || typeof card.querySelector !== "function") return false;
    let rolled = null;
    try { rolled = localStorage.getItem(RECORD_KEY); } catch (e) { return false; }
    if (rolled === ext.id || hidden()) return false;
    try { localStorage.setItem(RECORD_KEY, ext.id); } catch (e) { return false; }
    const el = card.querySelector(".big-rating");
    if (calm() || !el) return false;
    const sep = (1.5).toLocaleString(I18N.locale()).charAt(1) || ",";
    const text = el.textContent;
    el.innerHTML = odometerHtml(odometerColumns(rec.previous, rec.score), sep) + '<span class="offscreen">' + text + "</span>";
    const odo = el.querySelector(".odo");
    if (!odo) return false;
    void odo.getBoundingClientRect();
    requestAnimationFrame(() => odo.classList.add("odo-go"));
    return true;
  }

  Object.assign(UI, {
    morningDue, morningArrival, arrivalInProgress, playMorning, growRecap, odometerColumns, odometerHtml, playRecord,
  });
})();
