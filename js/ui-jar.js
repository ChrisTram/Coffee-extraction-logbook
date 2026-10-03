/* THE JAR (v9.13, Q8 « Ton bocal, au gramme près »).
 *
 * One drawing for every place that shows what is left of a bag: the coffee
 * sheet, the shelf of the dashboard, and the small glass of the stock pills.
 * The level is the grams left over the bag size, the graduations mark every
 * 50 g up to the bag, and the surface is a heap of beans, never flat: a flat
 * line reads as a liquid, and this is a jar of beans.
 *
 * AND IT MOVES WHEN THE GRAMS CHANGE. Each device remembers the last grams it
 * SHOWED for each coffee (localStorage "jar-grams"); a jar drawn with another
 * value goes from the remembered one to the new one: a cup saved, the level
 * drops, a few beans jump out, the grams roll down; a new bag, beans rain in
 * and the level rises; below three cups of the usual dose, red and one shake.
 * Remembering what was SHOWN, not what was saved, is the point: open the
 * dashboard an hour after the cup, and the drop still plays, once.
 *
 * Every jar of the same coffee drawn in the same render pass joins the same
 * movement (a "flight"), and a render in the middle of it (a sync arriving,
 * a re-render of the sheet) picks it up where it is instead of restarting.
 * With reduced motion, the new value is drawn at once. */
"use strict";

(() => {

  const { fmtDecimal } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  // ---------- The drawing ----------

  /* The jar's own units: a viewBox of 120 by 172. Inside the glass, a full
     bag sits at TOP and an empty one at BOTTOM; a count above the bag size
     (a weighing can say 260 g of a 250 g bag) rises a little above TOP. */
  const W = 120, H = 172, TOP = 48, BOTTOM = 165;
  const BODY = "M31 30 L89 30 Q100 30 100 42 L100 154 Q100 168 86 168 L34 168 Q20 168 20 154 L20 42 Q20 30 31 30 Z";

  /* The beans' colours follow the roast, as the sheet's jar did (v8.92).
     They are the colours of coffee, not of the theme: a bean is brown in the
     light theme too. */
  const ROASTS = {
    light: { bg: "#8c5a2e", a: "#b07a45", b: "#c79255", slit: "#4e2e14" },
    medium: { bg: "#5a3219", a: "#7a4a28", b: "#946036", slit: "#2a150a" },
    dark: { bg: "#2e1a0f", a: "#48291a", b: "#5c3820", slit: "#120804" },
  };
  function jarRoast(coffee) {
    const r = String((coffee && coffee.roast) || "").toLowerCase();
    return /clair|light|blond/.test(r) ? "light" : /fonc|dark|brun/.test(r) ? "dark" : "medium";
  }

  function jarLevelY(grams, bag) {
    if (!(bag > 0)) return BOTTOM - (BOTTOM - TOP) * 0.6;
    const g = Math.max(0, Math.min(Number(grams) || 0, bag * 1.15));
    return BOTTOM - (BOTTOM - TOP) * g / bag;
  }

  /* The heap: a row of humps of three heights, so the surface is never a
     ruler line, then down the sides and under the bottom (the glass clips
     it). Nothing drawn below half a gram. */
  function jarPile(grams, bag) {
    if (!(Number(grams) > 0.5) && bag > 0) return "";
    const y = jarLevelY(grams, bag);
    let d = "M14 " + (y + 3).toFixed(1);
    for (let x = 14, k = 0; x < 106; x += 9, k++) {
      d += " Q" + (x + 4.5) + " " + (y - 3 - (k % 3) * 1.2).toFixed(1) + " " + (x + 9) + " " + (y + 1.5).toFixed(1);
    }
    return d + " L106 " + (H + 4) + " L14 " + (H + 4) + " Z";
  }

  /* The graduations: a tick every 50 g up to the bag, a figure where there is
     room for one, on a round step (every 50 g on a 250 g bag, every 100 on a
     500 g one, every 250 on a kilo). */
  function ticks(bag, labels) {
    if (!(bag > 0)) return "";
    const pxPer50 = (BOTTOM - TOP) * 50 / bag;
    const every = [50, 100, 250, 500, 1000].find(n => n * pxPer50 / 50 >= 20) || 1000;
    let s = "";
    for (let g = 50; g <= bag + 0.01; g += 50) {
      const y = jarLevelY(g, bag).toFixed(1);
      const named = g % every === 0;
      s += '<line class="jar-tick-halo" x1="' + (named ? 86 : 90) + '" x2="98" y1="' + y + '" y2="' + y + '"></line>' +
        '<line class="jar-tick" x1="' + (named ? 86 : 90) + '" x2="98" y1="' + y + '" y2="' + y + '"></line>';
      if (labels && named) s += '<text class="jar-label" x="83" y="' + (Number(y) + 3.8).toFixed(1) + '" text-anchor="end">' + g + "</text>";
    }
    return s;
  }

  let uidCount = 0;
  /* The INSIDE of the jar, for an <svg viewBox="0 0 120 172">: the sheet
     wraps it in its own svg, the shelf nests it in its drawing. `unknown`
     draws a jar of no known size: half full, without graduations, faded. */
  function jarInner(o) {
    const uid = "jar" + (++uidCount);
    const tone = ROASTS[o.roast] || ROASTS.medium;
    const bag = Number(o.bag) || 0;
    const grams = Math.max(0, Number(o.grams) || 0);
    return '<defs><clipPath id="' + uid + '-c"><path d="' + BODY + '"></path></clipPath>' +
      '<pattern id="' + uid + '-b" width="18" height="14" patternUnits="userSpaceOnUse">' +
        '<rect width="18" height="14" fill="' + tone.bg + '"></rect>' +
        '<ellipse cx="5" cy="4" rx="4.2" ry="3" fill="' + tone.a + '"></ellipse>' +
        '<ellipse cx="14" cy="11" rx="4.2" ry="3" fill="' + tone.b + '"></ellipse>' +
        '<path d="M1.5 4 H8.5 M10.5 11 H17.5" stroke="' + tone.slit + '" stroke-width="0.8"></path></pattern></defs>' +
      '<rect class="jar-lid" x="25" y="5" width="70" height="25" rx="6"></rect>' +
      '<rect class="jar-lid-band" x="25" y="17" width="70" height="3"></rect>' +
      '<g clip-path="url(#' + uid + '-c)"><rect class="jar-inside" x="0" y="0" width="' + W + '" height="' + H + '"></rect>' +
        '<path class="jar-pile' + (o.unknown ? " jar-pile-unknown" : "") + '" fill="url(#' + uid + '-b)" d="' +
          jarPile(o.unknown ? 1 : grams, o.unknown ? 0 : bag) + '"></path>' +
        '<g class="jar-crumbs"' + (grams > 0.5 || o.unknown ? ' visibility="hidden"' : "") + '>' +
          '<ellipse cx="50" cy="161" rx="5" ry="3.4" fill="' + tone.a + '"></ellipse>' +
          '<ellipse cx="66" cy="162" rx="5" ry="3.4" fill="' + tone.b + '" transform="rotate(18 66 162)"></ellipse></g></g>' +
      (o.unknown ? "" : ticks(bag, o.labels)) +
      '<path class="jar-glass" d="' + BODY + '"></path>' +
      '<path class="jar-shine" d="M29 50 Q26 104 30 154"></path>';
  }

  // Data attributes that let the animation find, value and repaint a jar.
  function jarData(o) {
    return ' data-jar="' + escapeHtml(o.coffeeId) + '" data-jar-g="' + (Math.round(Math.max(0, Number(o.grams) || 0) * 10) / 10) +
      '" data-jar-bag="' + (Number(o.bag) || 0) + '"' + (o.low ? ' data-jar-low="1"' : "");
  }

  /* A whole jar as an <svg>, sized by its container's CSS. */
  function jarSvg(o) {
    return '<svg class="jar-svg" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true" focusable="false">' + jarInner(o) + "</svg>";
  }

  // ---------- The movement ----------

  const MEMORY_KEY = "jar-grams";
  let memory = null;
  function remembered() {
    if (!memory) {
      try { memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}") || {}; } catch (e) { memory = {}; }
    }
    return memory;
  }
  function remember(id, grams) {
    const m = remembered();
    if (m[id] === grams) return;
    m[id] = grams;
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); } catch (e) { /* without storage, every jar is drawn still */ }
  }

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";

  // One flight per coffee: { id, from, to, t0, ms, els: Set, texts: Set }.
  const flights = new Map();
  const eased = p => 1 - Math.pow(1 - p, 3);
  function valueAt(f, t) {
    const p = Math.min(1, Math.max(0, (t - f.t0) / f.ms));
    return f.from + (f.to - f.from) * eased(p);
  }

  function paint(el, grams) {
    const bag = Number(el.dataset.jarBag) || 0;
    if (el.dataset.jarKind === "glass") {
      const pc = bag > 0 ? Math.min(100, Math.max(0, grams) / bag * 100) : 0;
      el.style.setProperty("--pc", pc.toFixed(1) + "%");
      return;
    }
    const pile = el.querySelector(".jar-pile");
    if (pile && !pile.classList.contains("jar-pile-unknown")) pile.setAttribute("d", jarPile(grams, bag));
    const crumbs = el.querySelector(".jar-crumbs");
    if (crumbs) crumbs.setAttribute("visibility", grams > 0.5 ? "hidden" : "visible");
  }
  const gramsText = v => fmtDecimal(Math.max(0, v), 0) + " g";

  /* The beans: a few jump out of the heap (a cup), or rain in from above the
     lid (a new bag). Drawn in HTML above the jar, in the element that holds
     it: inside an open <dialog> the page body would sit under the top layer. */
  function flyBeans(el, out, grams) {
    if (calm() || typeof document.createElement !== "function") return;
    // The small glass of a pill does the same in miniature: three tiny beans.
    const glass = el.dataset.jarKind === "glass";
    const art = glass ? el : el.querySelector("svg.jar-svg") || el;
    const host = glass ? el.closest && el.closest(".sc-bag") : el.ownerSVGElement ? el.ownerSVGElement.parentElement : el;
    if (!host || typeof art.getBoundingClientRect !== "function") return;
    const r = art.getBoundingClientRect(), h = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const bag = Number(el.dataset.jarBag) || 0;
    const k = r.height / H;
    const size = glass ? 4 : Math.max(5, Math.round(9 * k * 1.25));
    const level = glass ? r.height * (1 - (bag > 0 ? Math.min(1, Math.max(0, grams) / bag) : 0)) : jarLevelY(grams, bag) * k;
    const surface = r.top - h.top + level;
    const lift = glass ? 16 : r.height * 0.32, spread = glass ? 26 : r.width * 0.9;
    for (let i = 0; i < (glass ? 3 : 5); i++) {
      const b = document.createElement("span");
      b.className = "jar-bean";
      b.style.width = size + "px";
      b.style.height = Math.round(size * 1.35) + "px";
      b.style.left = (r.left - h.left + r.width * (0.3 + Math.random() * 0.4) - size / 2).toFixed(1) + "px";
      b.style.top = (out ? surface - size : r.top - h.top - size * 2).toFixed(1) + "px";
      host.appendChild(b);
      if (typeof b.animate !== "function") { b.remove(); continue; }
      const dx = (Math.random() - 0.5) * spread, fall = surface - (r.top - h.top) + size;
      const frames = out
        ? [{ transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: "translate(" + (dx * 0.6).toFixed(1) + "px, " + (-lift).toFixed(1) + "px) rotate(" + (dx * 4).toFixed(0) + "deg)", opacity: 1, offset: 0.45 },
          { transform: "translate(" + dx.toFixed(1) + "px, " + (-lift * 0.2).toFixed(1) + "px) rotate(" + (dx * 7).toFixed(0) + "deg)", opacity: 0 }]
        : [{ transform: "translate(0, 0)", opacity: 0 },
          { transform: "translate(" + (dx * 0.15).toFixed(1) + "px, " + (fall * 0.92).toFixed(1) + "px) rotate(" + (dx * 5).toFixed(0) + "deg)", opacity: 1, offset: 0.8 },
          { transform: "translate(" + (dx * 0.15).toFixed(1) + "px, " + fall.toFixed(1) + "px) rotate(" + (dx * 6).toFixed(0) + "deg)", opacity: 0 }];
      const run = b.animate(frames, { duration: 760 + i * 60, delay: i * 45, easing: "cubic-bezier(0.3, 0.6, 0.6, 1)", fill: "both" });
      run.onfinish = () => b.remove();
      run.oncancel = () => b.remove();
    }
  }

  /* One shake, when a jar lands low. The pill shakes as a whole. */
  function shake(el) {
    if (calm() || !el.dataset.jarLow) return;
    const target = el.dataset.jarKind === "glass" && el.closest ? (el.closest(".sc-bag") || el) : el;
    target.classList.remove("jar-shake");
    void (target.getBoundingClientRect && target.getBoundingClientRect());
    target.classList.add("jar-shake");
    setTimeout(() => target.classList.remove("jar-shake"), 700);
  }

  // Paints a flight at a value; at its end, the final figures and the shake.
  function draw(f, v, done) {
    f.els.forEach(el => {
      if (el.isConnected === false) { f.els.delete(el); return; }
      paint(el, v);
    });
    f.texts.forEach(x => {
      if (x.isConnected === false) { f.texts.delete(x); return; }
      x.textContent = done ? x.dataset.jarFinal : gramsText(v);
    });
  }
  function land(f) {
    flights.delete(f.id);
    draw(f, f.to, true);
    f.els.forEach(shake);
  }

  let scheduled = false, depth = 0;
  function frame() {
    scheduled = false;
    /* A requestAnimationFrame that calls back at once (the test harness)
       would recurse without end: the movements are then finished on the spot. */
    if (depth > 0) { [...flights.values()].forEach(land); return; }
    depth++;
    try {
      const t = performance.now();
      [...flights.values()].forEach(f => {
        if (t - f.t0 >= f.ms) land(f);
        else draw(f, valueAt(f, t), false);
      });
      if (flights.size) kick();
    } finally { depth--; }
  }
  function kick() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(frame);
  }

  function join(f, el, texts, t, fresh) {
    const added = !f.els.has(el);
    f.els.add(el);
    texts.forEach(x => {
      if (!f.texts.has(x)) { x.dataset.jarFinal = x.textContent; f.texts.add(x); }
      x.textContent = gramsText(valueAt(f, t));
    });
    paint(el, valueAt(f, t));
    if (fresh && added) flyBeans(el, f.to < f.from, f.to < f.from ? f.from : f.to);
  }

  /* A JAR NOBODY SEES DOES NOT MOVE. Drawn while the page is hidden, or under
     an open window (a bag saved from « Mes cafés » redraws the dashboard
     behind it), it waits with its new figures, and plays its change when the
     page comes back or the window closes: that is when it is seen. */
  const waiting = new Set();
  let waitingWired = false;
  function replay() {
    const roots = [...waiting];
    waiting.clear();
    roots.forEach(r => { if (r.isConnected !== false) playJars(r); });
  }
  function playLater(root, dialog) {
    waiting.add(root);
    if (dialog) dialog.addEventListener("close", () => setTimeout(replay, 0), { once: true });
    if (waitingWired || typeof document.addEventListener !== "function") return;
    waitingWired = true;
    document.addEventListener("visibilitychange", () => { if (!hidden()) replay(); });
  }
  // The open window drawn above `root`, if any (a window holding it does not count).
  function coveredBy(root) {
    const d = typeof document.querySelector === "function" ? document.querySelector("dialog[open]") : null;
    return d && typeof d.contains === "function" && root !== document && !d.contains(root) ? d : null;
  }

  /* Gives life to the jars just drawn under `root`. `opts.from` forces the
     starting value (the morning arrival fills every jar from empty). */
  function playJars(root, opts) {
    const scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    const jars = [...scope.querySelectorAll("[data-jar]")];
    if (!jars.length) return;
    /* Not on screen at all (a screen not shown, a window not open yet): drawn
       still, nothing remembered; it plays when it is drawn again in view. */
    const unseen = scope !== document && typeof scope.getClientRects === "function" && !scope.getClientRects().length;
    const cover = unseen ? null : coveredBy(scope);
    if (unseen || ((hidden() || cover) && !(opts && opts.from !== undefined))) {
      jars.forEach(el => paint(el, Number(el.dataset.jarG) || 0));
      if (!unseen) playLater(scope, cover);
      return;
    }
    const t = performance.now();
    jars.forEach(el => {
      const id = el.dataset.jar, to = Number(el.dataset.jarG) || 0;
      const texts = [...scope.querySelectorAll("[data-jar-grams]")].filter(x => x.dataset.jarGrams === id);
      let f = flights.get(id);
      if (f && f.to === to && t - f.t0 < f.ms) { join(f, el, texts, t, t - f.t0 < 150); return; }
      const start = opts && opts.from !== undefined ? opts.from : f ? valueAt(f, t) : remembered()[id];
      remember(id, to);
      if (start === undefined || start === null || Math.abs(start - to) < 0.05 || calm()) {
        flights.delete(id);
        paint(el, to);
        /* A movement that never got its last frame (a tab in the background
           gets none) leaves its figures halfway: they get their final text. */
        texts.forEach(x => { if (x.dataset.jarFinal !== undefined) x.textContent = x.dataset.jarFinal; });
        return;
      }
      f = { id: id, from: Number(start), to: to, t0: t, ms: to < start ? 820 : 950, els: new Set(), texts: new Set() };
      flights.set(id, f);
      join(f, el, texts, t, !(opts && opts.quiet));
      kick();
      /* A safety net: a page that gets no frame (a throttled tab, a saving
         mode) still ends on the true figures. */
      const flight = f;
      setTimeout(() => { if (flights.get(id) === flight) land(flight); }, f.ms + 150);
    });
  }

  Object.assign(UI, {
    jarSvg, jarInner, jarData, jarRoast, jarPile, jarLevelY, playJars,
  });
})();
