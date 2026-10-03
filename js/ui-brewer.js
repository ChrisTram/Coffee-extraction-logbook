/* Q12 (v9.17): THE BRIKKA THAT TURNS INTO THE SWITCH.
 *
 * Next to the machine's two buttons, a small drawing of the brewer: the
 * octagonal aluminium Brikka with its black handle, or the Switch, a glass
 * cone on its glass base, with the coffee bed and the cup underneath.
 * Switching machine MELTS one silhouette into the other (both have the same
 * number of points, so every point slides to its partner), the aluminium
 * turns to glass, and the fields that change with the machine ROLL from their
 * old value to the new one (js/ui-roll.js): the recipe, the dose, the water,
 * the grinder, the cup. A field that only exists on the other machine (the
 * temperature of the Switch, the heat of the Brikka) slides in. About 600 ms,
 * and nothing waits for it: the inputs hold their new values at once.
 *
 * The same drawing stands in the quick entry, in place of the machine dot,
 * and changes when the chosen recipe belongs to the other machine.
 *
 * Only a change Chris makes moves (a tap, a key, a coffee or a recipe
 * picked): the startup and the draft draw it still. Reduced motion, a hidden
 * page, a drawing not on screen: it is drawn at its new shape at once. One
 * exception, « Refaire » or « Modifier » on a cup of the other machine: the
 * entry is not on screen yet when its machine changes, so the drawing waits
 * until it shows, up to a second and a half later, and melts then. */
"use strict";

(() => {

  const { $ } = UI;

  const MORPH_MS = 600;
  // A change made while the drawing was off screen still plays if it shows within this delay.
  const PENDING_MS = 1500;
  /* Only a change Chris just made moves: the paints of the startup (the
     default machine, then the draft) never do. The browser says whether a
     tap or a key just happened; without that API, the first seconds after
     loading stay still. */
  const QUIET_START_MS = 2500;
  // The fields roll one after the other, this far apart.
  const STAGGER_MS = 55;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const onScreen = el => !!el && typeof el.getClientRects === "function" && el.getClientRects().length > 0;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const userActed = () => (typeof navigator !== "undefined" && navigator.userActivation
    ? !!navigator.userActivation.isActive : now() > QUIET_START_MS);

  /* The two silhouettes in a 200 x 220 box, the same number of points each.
     The Brikka: knob, lid, upper chamber, waist, boiler, spout on the left,
     handle on the right. The Switch: the rim of the cone, the cone narrowing
     to the valve, then the glass base. */
  const SHAPES = {
    Brikka: {
      body: [[90, 14], [110, 14], [110, 24], [130, 28], [140, 90], [118, 104], [146, 116], [152, 200], [146, 206],
        [54, 206], [48, 200], [54, 116], [82, 104], [60, 90], [56, 58], [34, 42], [70, 28], [90, 24]],
      handle: [[134, 38], [176, 46], [180, 54], [170, 100], [160, 98], [142, 86]],
    },
    Switch: {
      body: [[36, 36], [164, 36], [164, 46], [156, 52], [116, 116], [116, 130], [150, 142], [152, 200], [146, 206],
        [54, 206], [48, 200], [50, 142], [84, 130], [84, 116], [44, 52], [36, 46], [36, 40], [36, 38]],
      handle: [[164, 38], [178, 38], [182, 42], [178, 46], [164, 46], [164, 42]],
    },
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  // The outline at k (0 the Brikka, 1 the Switch).
  const pathAt = (a, b, k) => "M" + a.map((p, i) => lerp(p[0], b[i][0], k).toFixed(1) + " " + lerp(p[1], b[i][1], k).toFixed(1)).join(" L") + " Z";
  const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const kOf = method => (method === "Switch" ? 1 : 0);

  /* The drawing. Colours come from finishing.css (aluminium and glass follow
     the theme, the coffee is drawn coffee colour); the Brikka's seams and the
     Switch's coffee cross-fade there, keyed on data-method. */
  const BREWER_SVG = '<svg class="brewer-art" viewBox="0 0 200 220" aria-hidden="true" focusable="false">' +
    '<ellipse class="bw-shadow" cx="100" cy="211" rx="66" ry="6"></ellipse>' +
    '<path class="bw-handle"></path><path class="bw-body"></path>' +
    '<g class="bw-brikka"><path class="bw-seam" d="M54 116 L146 116 M60 90 L140 90"></path>' +
    '<path class="bw-gleam" d="M118 122 L122 194"></path></g>' +
    '<g class="bw-switch"><path class="bw-bed" d="M58 50 L142 50 L112 110 L88 110 Z"></path>' +
    '<path class="bw-cup" d="M56 156 L144 156 L146 196 L54 196 Z"></path></g>' +
    "</svg>";

  function draw(el, k) {
    const body = el.querySelector(".bw-body"), handle = el.querySelector(".bw-handle");
    if (body) body.setAttribute("d", pathAt(SHAPES.Brikka.body, SHAPES.Switch.body, k));
    if (handle) handle.setAttribute("d", pathAt(SHAPES.Brikka.handle, SHAPES.Switch.handle, k));
  }

  /* The melt, from k = from to the machine's k. A function of the time
     elapsed, finished by the clock if no frame comes (a throttled tab), and
     ended on the spot by a requestAnimationFrame that calls back at once
     (the test harness). */
  function morph(el, from, to) {
    const run = {};
    el._run = run;
    const t0 = now();
    let inside = false;
    const finish = () => { if (el._run !== run) return; el._run = null; el._k = to; draw(el, to); };
    const step = () => {
      if (el._run !== run) return;
      if (inside) { finish(); return; }
      inside = true;
      try {
        const p = Math.min(1, (now() - t0) / MORPH_MS);
        el._k = from + (to - from) * easeInOut(p);
        draw(el, el._k);
        if (p < 1) requestAnimationFrame(step); else finish();
      } finally { inside = false; }
    };
    step();
    setTimeout(finish, MORPH_MS + 120);
  }

  /* The drawing seen for the first time after a change made off screen: it
     melts then, if the change is recent. */
  let watcher = null;
  function watch(el) {
    if (typeof IntersectionObserver !== "function") return false;
    if (!watcher) {
      watcher = new IntersectionObserver(entries => entries.forEach(entry => {
        const el = entry.target, pending = el._pending;
        if (!entry.isIntersecting || !pending) return;
        el._pending = null;
        const to = kOf(el.dataset.method);
        if (now() - pending.at > PENDING_MS || calm() || hidden()) { el._k = to; draw(el, to); return; }
        morph(el, el._k, to);
      }));
    }
    if (!el._watched) { watcher.observe(el); el._watched = true; }
    return true;
  }

  /* Gives the brewer the machine's shape. The first call builds the drawing
     at its shape; a change of machine melts it when it is on screen. */
  function paintBrewer(el, method) {
    if (!el || typeof el.querySelector !== "function") return;
    const m = method === "Switch" ? "Switch" : "Brikka";
    const target = kOf(m);
    if (!el._built) {
      el.innerHTML = BREWER_SVG;
      el._built = true;
      el._k = target;
      el.dataset.method = m;
      draw(el, target);
      return;
    }
    if (el.dataset.method === m) return;
    el.dataset.method = m;
    const from = typeof el._k === "number" ? el._k : 1 - target;
    el._run = null;
    el._pending = null;
    const quiet = calm() || hidden() || !userActed() || from === target;
    if (!quiet && onScreen(el) && typeof requestAnimationFrame === "function") { morph(el, from, target); return; }
    if (!quiet && !onScreen(el) && watch(el)) {
      /* Kept at its old shape until it shows, then it melts; if it does not
         show soon enough, it takes its new shape anyway. */
      const pending = { at: now() };
      el._pending = pending;
      el._k = from;
      draw(el, from);
      setTimeout(() => {
        if (el._pending !== pending) return;
        el._pending = null;
        el._k = target;
        draw(el, target);
      }, PENDING_MS);
      return;
    }
    el._k = target;
    draw(el, target);
  }

  // ---------- The entry's fields follow the machine ----------

  // The controls whose text rolls, in the order they roll.
  const ROLLED = ["f-recipe", "f-dose", "f-water", "f-grind", "f-power", "f-temp", "f-cup"];
  // The fields that exist on one machine only: they slide in when they appear.
  const METHOD_ONLY = ["field-temp", "field-power", "field-add-water", "field-agitation", "field-preheat"];

  /* What the entry shows before a change of machine: the text of each
     control on screen, and which machine-only fields are shown. */
  function methodSnapshot() {
    const texts = {}, shown = {};
    ROLLED.forEach(id => {
      const c = $("#" + id);
      if (c && onScreen(c)) texts[id] = UI.controlText(c);
    });
    METHOD_ONLY.forEach(id => { const f = $("#" + id); if (f) shown[id] = !f.hidden; });
    return { method: UI.entry ? UI.entry.method : "", texts, shown };
  }

  /* After the change: each control that was on screen and changed rolls to
     its new text, the fields that just appeared slide in. Returns how many
     controls roll. */
  function playMethodChange(before) {
    if (!before || calm() || hidden()) return 0;
    let n = 0;
    ROLLED.forEach(id => {
      const c = $("#" + id);
      if (!c || !(id in before.texts)) return;
      if (UI.rollField(c, before.texts[id], n * STAGGER_MS)) n++;
    });
    METHOD_ONLY.forEach(id => {
      const f = $("#" + id);
      if (!f || f.hidden || before.shown[id] !== false || !onScreen(f)) return;
      f.classList.remove("method-arrive");
      void f.offsetWidth;
      f.classList.add("method-arrive");
      setTimeout(() => f.classList.remove("method-arrive"), 520);
    });
    return n;
  }

  Object.assign(UI, { paintBrewer, methodSnapshot, playMethodChange, BREWER_SHAPES: SHAPES, brewerPathAt: pathAt });
})();
