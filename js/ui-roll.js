/* THE VALUE THAT ROLLS (v9.17), shared by Q12 and Q13.
 *
 * When a figure changes because of something that just happened (the machine
 * switched, a cup arrived from the other device), it does not jump: the old
 * value slides up and out while the new one comes up from below, under half
 * a second, like the digits of a counter. Two forms:
 *
 *   - rollText(el, text): a plain element (a figure, a line of text) gets its
 *     new text through the roll;
 *   - rollField(control, oldText): an input or a select KEEPS its value, it is
 *     the truth that saving reads. A copy of its text rolls ABOVE it (the
 *     control's own text is transparent meanwhile, or, for a select, covered
 *     by its own background so its arrow stays), and the first touch, focus
 *     or keystroke on the control ends the roll on the spot: typing is never
 *     held up.
 *
 * Reduced motion, a hidden page or an element that is not on screen: the new
 * value is written at once, nothing moves. */
"use strict";

(() => {

  const escapeHtml = TOOLS.escapeHtml;
  const ROLL_MS = 420;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const onScreen = el => !!el && typeof el.getClientRects === "function" && el.getClientRects().length > 0;
  // Whether a roll may play on this element now.
  const mayRoll = el => !calm() && !hidden() && onScreen(el) && typeof el.querySelector === "function";

  // The two faces of a roll: the old value leaving, the new one arriving.
  const faces = (from, to) =>
    '<span class="roll" aria-hidden="true"><i class="roll-out">' + escapeHtml(from) + '</i><i class="roll-in">' +
    escapeHtml(to) + "</i></span>";

  /* The element's text becomes `text`. It rolls from what it showed (or from
     `from` when given) when the two differ. Returns true if it rolls. */
  function rollText(el, text, from) {
    if (!el) return false;
    const next = String(text);
    const before = from !== undefined ? String(from)
      : el.dataset && el.dataset.rollTo !== undefined ? el.dataset.rollTo : String(el.textContent || "");
    clearTimeout(el._rollTimer);
    if (before === next || !before || !mayRoll(el)) {
      el.textContent = next;
      if (el.dataset) delete el.dataset.rollTo;
      return false;
    }
    el.dataset.rollTo = next;
    el.innerHTML = faces(before, next) + '<span class="offscreen">' + escapeHtml(next) + "</span>";
    el._rollTimer = setTimeout(() => {
      if (el.dataset.rollTo !== next) return;
      el.textContent = next;
      delete el.dataset.rollTo;
    }, ROLL_MS + 80);
    return true;
  }

  // The visible text of a control: the chosen option of a select, the value of an input.
  function controlText(control) {
    if (!control) return "";
    if (String(control.tagName).toLowerCase() === "select") {
      const o = control.options && control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
      return o ? String(o.textContent || "").trim() : "";
    }
    return String(control.value || "");
  }

  /* Ends the roll of a control at once: its own text comes back. */
  function endField(control) {
    if (!control || !control._roll) return;
    const r = control._roll;
    control._roll = null;
    clearTimeout(r.timer);
    r.events.forEach(([name, fn]) => control.removeEventListener(name, fn, true));
    if (r.layer && r.layer.remove) r.layer.remove();
    control.classList.remove("roll-field");
  }

  /* The control already holds its new value; its text rolls from `oldText`
     to it, `delay` ms later (a few fields one after the other read as one
     movement). Nothing happens when the text did not change. */
  function rollField(control, oldText, delay) {
    if (!control) return false;
    endField(control);
    const next = controlText(control), before = String(oldText === undefined || oldText === null ? "" : oldText);
    // The field Chris is in is left alone: he may be typing in it.
    if (before === next || !mayRoll(control) || document.activeElement === control) return false;
    /* The copy goes INTO the control's offset parent, the box its absolute
       position is measured from (a positioned or transformed ancestor). When
       that is a static body, it is measured from the document instead. */
    const host = control.offsetParent;
    if (!host || typeof getComputedStyle !== "function") return false;
    const style = getComputedStyle(control);
    const atRoot = (host === document.body || host === document.documentElement) && getComputedStyle(host).position === "static";
    const r = control.getBoundingClientRect();
    const h = atRoot ? { left: -window.scrollX, top: -window.scrollY } : host.getBoundingClientRect();
    const inner = atRoot ? { x: 0, y: 0 } : { x: host.scrollLeft - host.clientLeft, y: host.scrollTop - host.clientTop };
    if (!r.width || !r.height) return false;
    const layer = document.createElement("span");
    layer.className = "roll-layer";
    layer.setAttribute("aria-hidden", "true");
    const align = style.textAlign;
    const px = v => parseFloat(v) || 0;
    const bl = px(style.borderLeftWidth), br = px(style.borderRightWidth), bt = px(style.borderTopWidth), bb = px(style.borderBottomWidth);
    /* A select draws its arrow in its text colour: rather than hide both, the
       copy covers the text only, on the select's own background, and the
       arrow stays. A select without a background of its own falls back to
       the transparent text. */
    const bg = style.backgroundColor;
    const cover = String(control.tagName).toLowerCase() === "select" && !!bg && bg !== "transparent" && !/,\s*0\)$/.test(bg);
    const arrow = cover ? px(style.paddingRight) + 22 : 0;
    Object.assign(layer.style, {
      left: (r.left - h.left + inner.x + bl).toFixed(1) + "px",
      top: (r.top - h.top + inner.y + bt).toFixed(1) + "px",
      width: Math.max(0, r.width - bl - br - arrow).toFixed(1) + "px",
      height: Math.max(0, r.height - bt - bb).toFixed(1) + "px",
      paddingLeft: px(style.paddingLeft) + "px",
      paddingRight: cover ? "0px" : px(style.paddingRight) + "px",
      background: cover ? bg : "transparent",
      borderRadius: style.borderRadius,
      // Piece by piece: the « font » shorthand reads empty on some engines.
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      letterSpacing: style.letterSpacing,
      color: style.color,
      justifyContent: align === "center" ? "center" : align === "right" || align === "end" ? "flex-end" : "flex-start",
    });
    layer.innerHTML = faces(before, next);
    layer.querySelectorAll(".roll > i").forEach(i => { i.style.animationDelay = (delay || 0) + "ms"; });
    host.appendChild(layer);
    if (!cover) control.classList.add("roll-field");
    const stop = () => endField(control);
    const events = ["pointerdown", "focus", "input", "keydown"].map(name => [name, stop]);
    events.forEach(([name, fn]) => control.addEventListener(name, fn, true));
    control._roll = { layer, events, timer: setTimeout(stop, (delay || 0) + ROLL_MS + 60) };
    return true;
  }

  Object.assign(UI, { rollText, rollField, endField, controlText, ROLL_MS });
})();
