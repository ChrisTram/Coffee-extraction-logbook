/* R8 (v9.24): THE CARDS THAT TILT UNDER THE MOUSE.
 *
 * On a computer only (a fine pointer that hovers, a mouse event), a few
 * cards lean slightly towards the pointer, at most 3 degrees, and a soft
 * copper glow follows it inside the card. The rest of R8 (buttons that
 * squish, the bean of the switches, the checkboxes that fill like a cup) is
 * CSS only, in css/feel.css.
 *
 * WHICH CARDS. The home's small cards (the week, the last cup, the finding),
 * the Analyses tiles while closed, the jars of « Mes cafés », the cards of
 * Réglages gagnants. Never a card holding a field (a slider would move under
 * the hand), a chart read with the pointer, nor a large panel: past 700 px of
 * width or 560 of height a card stays still, and the larger a card, the less
 * it leans, so a big one never feels like a boat.
 *
 * THE TEXT NEVER TILTS. A 3D transform is drawn as a picture of the element,
 * projected: the text in it goes soft. So what leans is the card's SKIN, its
 * background, border and shadow, lifted onto a pseudo-element (::after, or
 * ::before when ::after is taken) behind the content, which stays flat and
 * sharp; the glow is a layer of that skin. For a jar, the leaning part is the
 * jar drawing, which carries no text. While the skin is out, the card's own
 * background, border and shadow are transparent; nothing moves in the layout.
 * On leaving, the skin springs flat and takes the card's colours at rest, then
 * it goes and every inline value is put back as it was.
 *
 * HOW. One listener for the whole page; the pointer is read in an animation
 * frame, at most one per frame, and nothing runs while the mouse is still. A
 * press puts the card flat at once (a tile opens, a jar becomes its sheet),
 * and so does a scroll. With reduced motion, nothing tilts and nothing glows. */
"use strict";

(() => {

  const TARGETS = "#home-week, #card-last, #home-finding, .home-week-line, .an-tile, .cf-jar, .wt-side";
  const MAX_DEG = 3;
  const CALM_SIZE = 380;          // up to this side, the full 3 degrees; beyond, less
  const MAX_W = 700, MAX_H = 560;
  const LEAVE_MS = 560;
  // What the skin takes over from the card, and gives back.
  const SKIN_PROPS = ["background-color", "background-image", "border-top-color", "border-right-color",
    "border-bottom-color", "border-left-color", "box-shadow", "position", "isolation", "transition"];

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = () => typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* How far a card of this size may lean: the full angle for a small card,
     less as it grows, never under half. Pure. */
  function tiltLimit(width, height) {
    const side = Math.max(Number(width) || 0, Number(height) || 0);
    if (!side || width > MAX_W || height > MAX_H) return 0;
    return Math.max(MAX_DEG / 2, Math.min(MAX_DEG, MAX_DEG * CALM_SIZE / side));
  }

  /* The lean for a pointer at (px, py), each from 0 (left, top) to 1 (right,
     bottom): the side under the pointer goes down, as under a light hand.
     Degrees, rounded to the hundredth. Pure. */
  function tiltAngles(px, py, limit) {
    const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
    const round = v => Math.round(v * 100) / 100 || 0;
    return { rx: round((0.5 - clamp(py)) * 2 * limit), ry: round((clamp(px) - 0.5) * 2 * limit) };
  }

  // A pseudo-element nobody draws, or the one our skin already uses.
  const freePseudo = (el, which) => el.classList.contains("feel-skin-" + which) || getComputedStyle(el, "::" + which).content === "none";

  /* A card that may lean now: its limit and how (a jar's drawing, or a skin
     on a free pseudo-element), or null. */
  function planFor(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    if (el.matches(".an-tile.open, .an-tile-full") || el.closest(".an-tiles.flipping")) return null;
    if (el.querySelector("input, select, textarea, canvas, [data-scrub]")) return null;
    // An arrival still playing owns the card.
    if (typeof el.getAnimations === "function" &&
      el.getAnimations().some(a => typeof a.animationName === "string" && a.playState === "running")) return null;
    const r = el.getBoundingClientRect();
    const limit = tiltLimit(r.width, r.height);
    if (!limit) return null;
    if (el.matches(".cf-jar")) {
      const art = el.querySelector(".cf-art");
      return art ? { limit, rect: r, art } : null;
    }
    const cs = getComputedStyle(el);
    // A clipping card would cut the skin's border; a static card turning relative must not catch a stray absolute child.
    if (cs.overflow !== "visible") return null;
    if (cs.position === "static" && [...el.querySelectorAll("*")].some(c => getComputedStyle(c).position === "absolute" && c.offsetParent && !el.contains(c.offsetParent))) return null;
    const pseudo = freePseudo(el, "after") ? "after" : freePseudo(el, "before") ? "before" : null;
    return pseudo ? { limit, rect: r, pseudo } : null;
  }

  let card = null;      // { el, rect, limit, art | pseudo, kept }
  let pressed = null;   // the card pressed last: it stays at rest until the pointer leaves it
  let pending = null;   // the last pointer, { target, x, y }
  let frame = 0;
  const leaving = new WeakMap();   // a card springing back: its timer and its kept values

  // The skin's look, read from the card as it is drawn now.
  function skinValues(cs) {
    return {
      "--skin-inset": ["Top", "Right", "Bottom", "Left"].map(s => "-" + cs["border" + s + "Width"]).join(" "),
      "--skin-border": cs.borderTopWidth + " " + (cs.borderTopStyle === "none" ? "solid" : cs.borderTopStyle),
      "--skin-border-color": cs.borderTopColor,
      "--skin-bg": cs.backgroundColor,
      "--skin-under": cs.backgroundImage || "none",
      "--skin-shadow": cs.boxShadow,
    };
  }
  /* The card's own look while the skin wears it: its inline values are put
     back for the time of one read, then ours again. The card's transitions
     are ours by then, so nothing animates. */
  const LOOK_PROPS = SKIN_PROPS.filter(p => !["transition", "position", "isolation"].includes(p));
  function ownLook(el, kept) {
    const mine = LOOK_PROPS.map(p => el.style.getPropertyValue(p));
    LOOK_PROPS.forEach(p => el.style.setProperty(p, kept[p]));
    const look = skinValues(getComputedStyle(el));
    LOOK_PROPS.forEach((p, i) => el.style.setProperty(p, mine[i]));
    return look;
  }

  function enter(el, plan) {
    const was = leaving.get(el);
    if (was) { clearTimeout(was.timer); leaving.delete(el); }
    card = { el, ...plan, kept: was ? was.kept : null };
    el.classList.remove("feel-leaving");
    el.style.setProperty("--feel-glow", "var(--feel-glow-max)");
    if (plan.art) {
      if (!card.kept) card.kept = { transition: el.style.transition };
      el.style.transition = "--feel-glow 260ms ease";
      el.classList.add("feel-tilt");
      return;
    }
    if (!card.kept) {
      card.kept = {};
      SKIN_PROPS.forEach(p => { card.kept[p] = el.style.getPropertyValue(p); });
    }
    /* Our transitions first: a hover fading the border in is cut short, so
       the skin takes the colour the hover is going to, not where it started. */
    el.style.transition = "--feel-glow 260ms ease";
    const look = was ? ownLook(el, card.kept) : skinValues(getComputedStyle(el));
    Object.entries(look).forEach(([k, v]) => el.style.setProperty(k, v));
    // The card hands its look to the skin, at once.
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.isolation = "isolate";
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = "none";
    el.style.borderColor = "transparent";
    el.style.boxShadow = "none";
    el.classList.add("feel-tilt", "feel-skin-" + plan.pseudo);
  }

  /* Back to rest: the skin springs flat and the glow fades while the skin
     takes the card's colours at rest; then the skin goes, every inline value
     comes back, and the sheets speak again. */
  function leave(now) {
    if (!card) return;
    const { el, art, kept } = card;
    card = null;
    const restore = () => {
      leaving.delete(el);
      el.classList.remove("feel-tilt", "feel-leaving", "feel-skin-after", "feel-skin-before");
      ["--feel-glow", "--glow-x", "--glow-y", "--skin-transform", "--skin-inset", "--skin-border", "--skin-border-color",
        "--skin-bg", "--skin-under", "--skin-shadow"].forEach(p => el.style.removeProperty(p));
      if (art) { art.style.transform = ""; el.style.transition = kept.transition; return; }
      // The card takes its look back with no transition, then gets its transitions back.
      SKIN_PROPS.filter(p => p !== "transition").forEach(p => el.style.setProperty(p, kept[p]));
      void getComputedStyle(el).borderTopColor;
      el.style.transition = kept.transition;
    };
    if (now) { restore(); return; }
    el.style.setProperty("--feel-glow", "0%");
    if (art) art.style.transform = "";
    else {
      // The skin fades to the card's colours at rest (the pointer has left it) while it springs flat.
      const rest = ownLook(el, kept);
      ["--skin-border-color", "--skin-bg", "--skin-shadow", "--skin-under"].forEach(k => el.style.setProperty(k, rest[k]));
      el.classList.add("feel-leaving");
      el.style.setProperty("--skin-transform", "perspective(1000px) rotateX(0deg) rotateY(0deg)");
    }
    // Re-entering before the end picks the card up where it is (enter reads this).
    leaving.set(el, { kept, timer: setTimeout(restore, LEAVE_MS + 40) });
  }

  function lean(x, y) {
    if (!card) return;
    const { el, rect, limit, art } = card;
    const px = (x - rect.left) / (rect.width || 1), py = (y - rect.top) / (rect.height || 1);
    const a = tiltAngles(px, py, limit);
    const turn = "rotateX(" + a.rx + "deg) rotateY(" + a.ry + "deg)";
    // The jar keeps its own hover lift (stock.css, .cf-art 3 px up).
    if (art) art.style.transform = "perspective(600px) translateY(-3px) " + turn;
    else el.style.setProperty("--skin-transform", "perspective(1000px) " + turn);
    el.style.setProperty("--glow-x", Math.round(x - rect.left) + "px");
    el.style.setProperty("--glow-y", Math.round(y - rect.top) + "px");
  }

  // One frame: which card is under the pointer, then its lean.
  function step() {
    frame = 0;
    const p = pending;
    pending = null;
    if (!p) return;
    const el = p.target && typeof p.target.closest === "function" ? p.target.closest(TARGETS) : null;
    if (card && card.el !== el) leave(false);
    if (pressed && pressed !== el) pressed = null;
    if (el && !card && el !== pressed && !calm() && finePointer()) {
      const plan = planFor(el);
      if (plan) enter(el, plan);
    }
    if (card) lean(p.x, p.y);
  }

  function wireFeel() {
    if (typeof document.addEventListener !== "function") return;
    document.addEventListener("pointermove", ev => {
      if (ev.pointerType !== "mouse") return;
      pending = { target: ev.target, x: ev.clientX, y: ev.clientY };
      if (!frame) frame = requestAnimationFrame(step);
    }, { passive: true });
    // Out of the window: nothing under the pointer any more.
    document.addEventListener("pointerout", ev => { if (!ev.relatedTarget && card) leave(false); });
    /* A press gives the card back its own look at once (a tile opens in
       place, a jar becomes its sheet, a card leads elsewhere), and it stays
       at rest until the pointer leaves it. */
    document.addEventListener("pointerdown", () => {
      if (!card) return;
      pressed = card.el;
      leave(true);
    }, true);
    window.addEventListener("scroll", flattenTilt, { passive: true, capture: true });
    document.addEventListener("visibilitychange", flattenTilt);
  }

  /* The card back to its own look at once. Also called by js/ui-accent.js
     when the accent or the theme changes: the skin holds the colours read
     when the pointer came in, the card itself follows the live tokens. */
  function flattenTilt() { if (card) leave(true); }

  Object.assign(UI, {
    tiltLimit, tiltAngles, wireFeel, flattenTilt,
  });
})();
