/* J1, THE RATING DIAL (v9.13): the score is given by turning a dial.
 *
 * An arc from 0 to 10 by half points, a knob to drag around it (or a tap on
 * the arc), the arrow keys, Page Up and Down, Home and End. The word under
 * the score changes with it (à revoir, correcte, bonne tasse, superbe,
 * exceptionnelle), and the phone gives a tiny tick per half point where it can
 * vibrate (Android; the iPhone has no vibration API).
 *
 * THE SLIDER STAYS THE SOURCE OF TRUTH. Each dial drives the hidden range
 * input it replaces (#f-rating, #q-rating, #br-rating): its value and its
 * "not rated yet" class (UI.isRatingEmpty) are what saving, the draft and
 * the clear button already read and write. The dial only sets the value and
 * fires the slider's own input event, so wireRating marks the cup rated and
 * refreshes the label exactly as a touch on the slider did.
 *
 * Chris may prefer the old slider: RATING_DIAL_ON = false brings it back
 * everywhere, nothing else to touch. */
"use strict";

(() => {

  const { isRatingEmpty, markRating } = UI;

  /* THE SWITCH. false: no dial is mounted, the hosts stay hidden and the
     three plain sliders are back, help text included (CSS reads the host). */
  const RATING_DIAL_ON = true;

  // Geometry, in viewBox units: centre, ring radius, start angle and sweep (degrees, SVG axes).
  const C = 120, R = 92, START = 135, SWEEP = 270, STEP = 0.5;
  const KEYS = { ArrowUp: STEP, ArrowRight: STEP, ArrowDown: -STEP, ArrowLeft: -STEP, PageUp: 1, PageDown: -1 };
  const dials = new Map();

  const pt = (a, r) => [C + r * Math.cos(a * Math.PI / 180), C + r * Math.sin(a * Math.PI / 180)];
  function arc(a0, a1, r) {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return "M" + x0.toFixed(2) + " " + y0.toFixed(2) + " A" + r + " " + r + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " +
      x1.toFixed(2) + " " + y1.toFixed(2);
  }

  function ratingWord(n) {
    const key = n < 5 ? "low" : n < 7 ? "ok" : n < 8.5 ? "good" : n < 9.5 ? "great" : "top";
    return I18N.t("rating_word_" + key);
  }

  const fmt = n => Number(n).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 });

  /* The score under a point of the dial (viewBox units), by half points.
     Off the ring it is null, so a finger landing in the middle scrolls the
     page instead of rating; `free` (during a drag) accepts any point. The
     gap at the bottom goes to the nearest end. */
  function ratingAt(x, y, free) {
    const dx = x - C, dy = y - C, dist = Math.sqrt(dx * dx + dy * dy);
    if (!free && (dist < R - 36 || dist > R + 30)) return null;
    let rel = Math.atan2(dy, dx) * 180 / Math.PI - START;
    while (rel < 0) rel += 360;
    while (rel >= 360) rel -= 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    return Math.round(rel / SWEEP * 10 / STEP) * STEP;
  }

  function markup(uid) {
    let ticks = "";
    for (let i = 0; i <= 10; i++) {
      const a = START + SWEEP * i / 10, major = i % 5 === 0;
      const [x0, y0] = pt(a, R + 15), [x1, y1] = pt(a, R + (major ? 25 : 20));
      ticks += '<line class="' + (major ? "rd-major" : "rd-minor") + '" x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) +
        '" x2="' + x1.toFixed(1) + '" y2="' + y1.toFixed(1) + '"></line>';
    }
    return '<svg class="rd-svg" viewBox="0 0 240 240" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="10">' +
      '<defs><linearGradient id="rd-g-' + uid + '" x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="rd-stop-a"></stop>' +
      '<stop offset="1" class="rd-stop-b"></stop></linearGradient></defs>' + ticks +
      '<path class="rd-track" d="' + arc(START, START + SWEEP, R) + '"></path>' +
      '<path class="rd-fill" d="" stroke="url(#rd-g-' + uid + ')"></path>' +
      '<path class="rd-hit" d="' + arc(START, START + SWEEP, R) + '"></path>' +
      '<circle class="rd-knob" r="15" cx="0" cy="0"></circle>' +
      '<text class="rd-score" x="120" y="132"></text><text class="rd-word" x="120" y="164"></text></svg>';
  }

  function paintRatingDial(slider) {
    const d = dials.get(slider);
    if (!d) return;
    const empty = isRatingEmpty(slider);
    const n = Math.max(0, Math.min(10, Number(slider.value) || 0));
    const a = START + SWEEP * n / 10;
    const [kx, ky] = pt(a, R);
    if (d.fill) d.fill.setAttribute("d", !empty && n > 0 ? arc(START, a, R) : "");
    if (d.knob) {
      d.knob.setAttribute("cx", kx.toFixed(1));
      d.knob.setAttribute("cy", ky.toFixed(1));
    }
    if (d.score) d.score.textContent = empty ? I18N.t("rating_dial_empty") : fmt(n);
    if (d.word) d.word.textContent = empty ? "" : ratingWord(n);
    d.host.classList.toggle("rd-empty", empty);
    const svg = d.svg;
    if (!svg) return;
    svg.setAttribute("aria-label", I18N.t("rating_dial_aria"));
    if (empty) svg.removeAttribute("aria-valuenow");
    else svg.setAttribute("aria-valuenow", String(n));
    svg.setAttribute("aria-valuetext", empty ? I18N.t("not_rated_yet") : I18N.t("rating_dial_value", { n: fmt(n), w: ratingWord(n) }));
  }

  function vibrate() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(6); } catch (e) { /* no vibrator */ }
    }
  }

  /* The only write: the slider's value and its rated state, then its own
     input event, which refreshes the label and drafts the form. */
  function setRating(slider, n, haptic) {
    const v = Math.max(0, Math.min(10, Math.round(n / STEP) * STEP));
    const changed = v !== Number(slider.value);
    if (!changed && !isRatingEmpty(slider)) return false;
    slider.value = String(v);
    markRating(slider, false);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    if (changed && haptic) vibrate();
    return true;
  }

  function pointValue(d, ev, free) {
    const b = d.svg.getBoundingClientRect();
    if (!b || !b.width) return null;
    return ratingAt((ev.clientX - b.left) / b.width * 240, (ev.clientY - b.top) / b.height * 240, free);
  }

  function wire(d) {
    const svg = d.svg;
    svg.addEventListener("pointerdown", ev => {
      if (ev.button !== undefined && ev.button !== 0) return;
      const n = pointValue(d, ev, false);
      if (n === null) return;
      ev.preventDefault();
      d.dragging = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic event */ }
      try { svg.focus({ preventScroll: true }); } catch (e) { /* old engine */ }
      setRating(d.slider, n, true);
    });
    svg.addEventListener("pointermove", ev => {
      if (!d.dragging) return;
      const n = pointValue(d, ev, true);
      if (n !== null) setRating(d.slider, n, true);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(e => svg.addEventListener(e, () => { d.dragging = false; }));
    /* A finger landing on the ring turns the dial instead of scrolling the
       page, on every engine (the CSS touch-action of the ring says the same). */
    svg.addEventListener("touchstart", ev => {
      const t = ev.touches && ev.touches[0];
      if (t && pointValue(d, t, false) !== null) ev.preventDefault();
    }, { passive: false });
    svg.addEventListener("keydown", ev => {
      const base = Number(d.slider.value) || 0;
      const target = ev.key === "Home" ? 0 : ev.key === "End" ? 10 : KEYS[ev.key] !== undefined ? base + KEYS[ev.key] : null;
      if (target === null) return;
      ev.preventDefault();
      setRating(d.slider, target, false);
    });
  }

  /* Mounts the dial in its host (a hidden element right after the slider in
     the page) and hides the slider. Returns null when the switch is off. */
  function mountRatingDial(slider, host) {
    if (!RATING_DIAL_ON || !slider || !host || dials.has(slider)) return null;
    const uid = String(slider.id || dials.size);
    host.innerHTML = markup(uid);
    const svg = host.querySelector("svg");
    const help = slider.getAttribute ? slider.getAttribute("aria-describedby") : null;
    if (svg && help) svg.setAttribute("aria-describedby", help);
    const d = {
      slider, host, svg, dragging: false,
      fill: host.querySelector(".rd-fill"), knob: host.querySelector(".rd-knob"),
      score: host.querySelector(".rd-score"), word: host.querySelector(".rd-word"),
    };
    dials.set(slider, d);
    if (svg) wire(d);
    host.hidden = false;
    slider.hidden = true;
    paintRatingDial(slider);
    return d;
  }

  // Focus goes to the dial when there is one: the slider under it is hidden.
  function focusRating(slider) {
    const d = dials.get(slider);
    const target = d && d.svg ? d.svg : slider;
    if (target && target.focus) target.focus();
  }

  Object.assign(UI, { RATING_DIAL_ON, mountRatingDial, paintRatingDial, focusRating, ratingWord, ratingAt, setRating });
})();
