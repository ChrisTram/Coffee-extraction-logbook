/* M4 (v9.13): THE CURVE UNDER THE FINGER.
 *
 * Slide a finger along a curve and each cup reads under it, without aiming at
 * a three pixel dot: a vertical guide marks the nearest point, a dot sits on
 * it, and a bubble above the curve tells what it is. For the home-made SVG
 * curves: the bag's rating curve in the journal, the coffee sheet's curve and
 * the moving average of "Ta progression". The Chart.js chart of the thirty
 * days does the same through its own tooltip (js/charts.js).
 *
 * A curve opts in with data-scrub on its <svg>; its points are the elements
 * carrying data-scrub-tip (the text of the bubble) and the circles carrying a
 * <title>, read in the curve's own coordinates (cx, cy). data-scrub-top and
 * data-scrub-bottom bound the guide to the plot area. By default only touch
 * and pen scrub: desktop keeps what it had (the native tooltips of the
 * titles). data-scrub="hover" also follows the mouse, for a curve that had no
 * tooltip at all.
 *
 * The curves are redrawn by their screens: nothing here is wired per curve,
 * one set of listeners on the document serves them all. */
"use strict";

(() => {

  const SVG_NS = "http://www.w3.org/2000/svg";
  // How long the bubble stays once the finger has left, to finish reading it.
  const LINGER_MS = 1600;

  let tipEl = null;
  // The curve being scrubbed by a pressed pointer, and the one showing a mark.
  let pressed = null, shown = null, hideTimer = null;

  const isTouch = ev => ev.pointerType && ev.pointerType !== "mouse";

  // The points of a curve, in its own coordinates.
  function pointsOf(svg) {
    const out = [];
    svg.querySelectorAll("[data-scrub-tip], circle").forEach(n => {
      let text = n.getAttribute("data-scrub-tip");
      if (!text) { const t = n.querySelector("title"); text = t ? t.textContent : ""; }
      const x = Number(n.getAttribute("cx")), y = Number(n.getAttribute("cy"));
      if (text && Number.isFinite(x) && Number.isFinite(y)) out.push({ node: n, x, y, text });
    });
    return out;
  }

  // From an element's coordinates to the screen's, and from the screen's to the svg's.
  function toScreen(svg, node, x, y) {
    const m = node.getScreenCTM(), p = svg.createSVGPoint();
    p.x = x; p.y = y;
    return m ? p.matrixTransform(m) : null;
  }
  function toSvg(svg, sx, sy) {
    const m = svg.getScreenCTM(), p = svg.createSVGPoint();
    p.x = sx; p.y = sy;
    return m ? p.matrixTransform(m.inverse()) : null;
  }

  // The point whose x is nearest to the pointer: we read along the time axis.
  function nearest(svg, clientX) {
    let best = null, gap = Infinity;
    pointsOf(svg).forEach(p => {
      const s = toScreen(svg, p.node, p.x, p.y);
      if (!s) return;
      const d = Math.abs(s.x - clientX);
      if (d < gap) { gap = d; best = { text: p.text, sx: s.x, sy: s.y }; }
    });
    return best;
  }

  /* The guide and the dot, drawn in the curve itself so they scroll and scale
     with it. Non-scaling strokes: a curve stretched by preserveAspectRatio
     (the journal's) keeps a one pixel guide and a round dot, the dot being a
     zero length line with round caps. */
  function markOf(svg) {
    let g = svg.querySelector(".scrub-mark");
    if (g) return g;
    g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "scrub-mark");
    g.setAttribute("aria-hidden", "true");
    ["scrub-guide", "scrub-halo", "scrub-dot"].forEach(c => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("class", c);
      l.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(l);
    });
    svg.appendChild(g);
    return g;
  }
  function drawMark(svg, p) {
    const at = toSvg(svg, p.sx, p.sy);
    if (!at) return;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const bound = (v, fallback) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
    const top = bound(svg.dataset.scrubTop, vb ? vb.y : 0);
    const bottom = bound(svg.dataset.scrubBottom, vb ? vb.y + vb.height : 0);
    const [guide, halo, dot] = markOf(svg).children;
    [["x1", at.x], ["x2", at.x], ["y1", top], ["y2", bottom]].forEach(([k, v]) => guide.setAttribute(k, v.toFixed(1)));
    [halo, dot].forEach(l => [["x1", at.x], ["x2", at.x], ["y1", at.y], ["y2", at.y]].forEach(([k, v]) => l.setAttribute(k, v.toFixed(1))));
  }

  /* The bubble. Under a finger it sits ABOVE the curve, centred on the point:
     the finger hides whatever is under it. Under a mouse it follows the
     cursor, like the other SVG tooltips. Inside an open dialog (the coffee
     sheet) it moves into it, otherwise the top layer would hide it. */
  function placeTip(svg, p, ev) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "svg-tooltip scrub-tip";
    }
    const host = svg.closest("dialog") || document.body;
    if (tipEl.parentNode !== host) host.appendChild(tipEl);
    tipEl.textContent = p.text;
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight, box = svg.getBoundingClientRect();
    let x, y;
    if (isTouch(ev)) {
      x = p.sx - w / 2;
      y = box.top - h - 10;
      if (y < 8) y = Math.min(window.innerHeight - h - 8, box.bottom + 10);
    } else {
      x = ev.clientX + 14;
      y = ev.clientY + 14;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    }
    tipEl.style.left = Math.round(Math.max(8, Math.min(x, window.innerWidth - w - 8))) + "px";
    tipEl.style.top = Math.round(Math.max(8, y)) + "px";
  }

  function show(svg, ev) {
    clearTimeout(hideTimer);
    const p = nearest(svg, ev.clientX);
    if (!p) { hide(); return; }
    if (shown && shown !== svg) hide();
    shown = svg;
    drawMark(svg, p);
    placeTip(svg, p, ev);
  }

  function hide() {
    clearTimeout(hideTimer);
    if (shown) {
      const g = shown.querySelector(".scrub-mark");
      if (g) g.remove();
    }
    shown = null;
    if (tipEl) tipEl.hidden = true;
  }

  const curveAt = (ev, selector) => (ev.target && ev.target.closest ? ev.target.closest(selector) : null);

  function wireScrub() {
    document.addEventListener("pointerdown", ev => {
      const svg = curveAt(ev, "svg[data-scrub]");
      if (!svg) { if (shown) hide(); return; }
      if (!isTouch(ev) && !/\bhover\b/.test(svg.dataset.scrub)) return;
      pressed = { svg, id: ev.pointerId };
      show(svg, ev);
    });
    document.addEventListener("pointermove", ev => {
      if (pressed && pressed.id === ev.pointerId) {
        if (pressed.svg.isConnected) show(pressed.svg, ev); else { pressed = null; hide(); }
        return;
      }
      if (isTouch(ev)) return;
      // The mouse reads the curves that ask for it, and lets go when it leaves them.
      const svg = curveAt(ev, 'svg[data-scrub~="hover"]');
      if (svg) show(svg, ev);
      else if (shown) hide();
    });
    const release = ev => {
      if (!pressed || pressed.id !== ev.pointerId) return;
      pressed = null;
      if (isTouch(ev)) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, LINGER_MS); }
    };
    document.addEventListener("pointerup", release);
    // The browser took the gesture for a scroll: the reading stops there.
    document.addEventListener("pointercancel", ev => { if (pressed && pressed.id === ev.pointerId) { pressed = null; hide(); } });
    window.addEventListener("scroll", () => { if (shown && !pressed) hide(); }, { passive: true });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape" && shown) hide(); });
  }

  // Made available to the other screens.
  Object.assign(UI, { wireScrub, hideScrub: hide });
})();
