/* R15 (v9.26): EVERYTHING TRANSFORMS. What you touch becomes the next screen.
 *
 * Going from a list to its detail used to swap the screens at once: the row
 * vanished, the detail appeared, and the eye had to find its place again.
 * Now the row grows into the detail. A ghost card leaves the touched row
 * (hidden during the trip) and travels to the detail's box, taking its
 * place, its size, its corners and its colour; the texts both share (the
 * coffee's name, the recipe, the score) glide from their place in the row to
 * their place in the detail; the rest of the detail arrives just after, one
 * piece after the other. Closing plays it backwards, into the row.
 *
 * ONE helper for every place: UI.morphOpen(source, update, target, opts).
 * `update` opens the detail (it always runs, once, whatever happens), and
 * `target` names the detail's box, read AFTER the update since the detail
 * often does not exist before. UI.morphBack(detail, update, opts) closes it
 * into the element it came from, if that one is still on screen.
 *
 * Plain WAAPI, the way of the notebook's demo, and not a view transition
 * like the jar of Mes cafés (v9.18): a view transition freezes the page
 * into a picture while it plays (no tap goes through), never runs in a page
 * that gets no frames, and cannot be stopped halfway by the next tap. Here
 * the ghost lets every tap through, a second tap ends the trip in place, and
 * two timers clean everything up even when no frame ever comes.
 *
 * The shared texts are found by `data-morph-key` or by the selectors of
 * KEYS below (written here, so the screens' templates stay untouched), and
 * only glide when they say the same thing: a comment never flies into a
 * coffee's name. The pure parts are tested in tools/morph.test.mjs. */
"use strict";

(() => {

  /* The one timing of every movement that changes what you look at: the
     Analyses tiles (v9.21) read it too. Under 450 ms for the trip, and no
     input is ever held: the ghost lets every tap through. */
  const MOTION = { duration: 440, back: 380, ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", rest: 260, stagger: 40, fade: 200 };
  // How far outside the window a box may start or land: a long card starts from what shows of it.
  const MARGIN = 24;
  // At most this many pieces of the detail arrive one by one; the next ones arrive with the last.
  const MAX_STAGGER = 8;

  // ---------- Pure parts ----------

  /* A box cut to the window, give or take the margin: null when nothing of
     it shows (then there is nothing to grow from). */
  function clampRect(r, vw, vh, margin) {
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    const m = margin || 0;
    const left = Math.max(r.left, -m), top = Math.max(r.top, -m);
    const right = Math.min(r.left + r.width, vw + m), bottom = Math.min(r.top + r.height, vh + m);
    // Something must show INSIDE the window itself, not only in the margin.
    if (Math.min(right, vw) - Math.max(left, 0) <= 0 || Math.min(bottom, vh) - Math.max(top, 0) <= 0) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  /* The FLIP of a shared text. The element `box` holds the text `text`; it is
     scaled by k from its top left corner, and moved so that the text lands
     on the source text `from`: same left edge, same middle line. */
  function flipText(box, text, from, k) {
    const dx = from.left - box.left - k * (text.left - box.left);
    const dy = from.top + from.height / 2 - box.top - k * (text.top + text.height / 2 - box.top);
    return { dx, dy };
  }

  // The words of a text, without case, accents or punctuation.
  function wordsOf(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d").split(/[^a-z0-9]+/).filter(Boolean);
  }
  /* Two texts say the same thing when one holds the other, or when most of
     the shorter one's words are in the longer: « Brikka classique » and
     « Brikka · Brikka classique (eau préchauffée) » do, a comment and a
     coffee's name do not. Numbers must be equal: 8,5 is not 8. */
  function sameText(a, b) {
    const x = wordsOf(a), y = wordsOf(b);
    if (!x.length || !y.length) return false;
    const figure = s => /^[\d\s.,/]+$/.test(String(s).trim());
    if (figure(a) || figure(b)) return x.join(".") === y.join(".");
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    const flat = l => " " + l.join(" ") + " ";
    if (flat(long).includes(flat(short))) return true;
    if (short.length < 2) return false;
    const shared = short.filter(w => long.includes(w)).length;
    return shared / short.length >= 0.6;
  }

  /* The pairs to glide: for each key, the first element of the source and the
     first of the detail, when both exist and say the same thing. */
  function matchKeys(from, to) {
    const pairs = [];
    const seen = new Set();
    from.forEach(f => {
      if (seen.has(f.key)) return;
      const t = to.find(x => x.key === f.key);
      if (!t || !sameText(f.text, t.text)) return;
      seen.add(f.key);
      pairs.push({ key: f.key, from: f, to: t });
    });
    return pairs;
  }

  // A colour that paints nothing: transparent, or an alpha of zero.
  function isClear(c) {
    const s = String(c || "").trim().toLowerCase();
    if (!s || s === "transparent") return true;
    return /^rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(s) || /\/\s*0(\.0+)?\s*\)$/.test(s);
  }

  /* The colour a gradient settles on: its last solid stop. The big card of
     the home is a gradient that ends on the panel colour. */
  function gradientColor(image) {
    const stops = String(image || "").match(/rgba?\([^)]*\)/g) || [];
    // Solid only: a half-seen stop (an accent wash at 0.13) is not the card's colour.
    return stops.reverse().find(c => !isClear(c) && !/,\s*0?\.\d+\s*\)$/.test(c)) || null;
  }

  /* Where the ghost flies. A detail in the top layer (a modal window) is above
     everything: the ghost only has to be above the page. A detail with its own
     layer (the side panel) gets the ghost just under it. Any other detail is
     lifted above the ghost for the trip. `over`: the trip starts from a whole
     screen (the brew mode), the ghost covers the rail and the bars too. */
  function layerOf(o) {
    if (o.topLayer) return { ghost: 1000, raise: null };
    if (typeof o.z === "number" && !o.over) return { ghost: o.z - 1, raise: null };
    return o.over ? { ghost: 1000, raise: 1001 } : { ghost: 1, raise: 2 };
  }

  // The box around two boxes, and whether a box holds another (to the pixel).
  function union(a, b) {
    const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
    return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
  }
  function contains(outer, inner) {
    return inner.left >= outer.left - 1 && inner.top >= outer.top - 1 &&
      inner.left + inner.width <= outer.left + outer.width + 1 && inner.top + inner.height <= outer.top + outer.height + 1;
  }

  // When the n-th piece of the detail starts arriving, in a trip of `duration` ms.
  function restDelay(n, duration) {
    return Math.round(duration * 0.5) + Math.min(n, MAX_STAGGER) * MOTION.stagger;
  }

  // ---------- Reading the page ----------

  /* The shared texts. A selector list per key, source and detail together:
     the journal's cards and table, the home's latest cups and its big card,
     the Ctrl K results, the side panel, the coffee sheet, the entry's band,
     the Guide's recipe card and the brew mode. */
  const KEYS = {
    name: ".h-card-coffee, td.d-coffee b, .last-big-coffee, td.tc-coffee, #h-body td.td-text, .cmd-text b, .sp-title, #sheet-name, " +
      "#band-recipe .br-coffee, .rb-name, #br-title",
    recipe: ".h-card-recipe, td .d-recipe, .last-big-context, td.tc-recipe, #h-body td.td-recipe, .sp-sub, #band-recipe .br-name",
    // A recipe card's figures: its summary when folded, its first chip when open.
    meta: ".rb-summary, .recipe-params .param-chip:first-child, #br-dose",
    score: ".h-card-rating, td.d-rating, .big-rating, td.tc-score, .sp-rating",
  };

  const vw = () => window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
  const vh = () => window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const isEl = el => !!(el && el.nodeType === 1 && typeof el.getBoundingClientRect === "function");
  const canMove = el => isEl(el) && typeof el.animate === "function" && !calm() && !hidden();
  const onScreen = el => isEl(el) && el.isConnected !== false && !!clampRect(el.getBoundingClientRect(), vw(), vh(), 0);

  /* The tight box of an element's text (a block title is as wide as its
     column, its words are not). A figure that rolls (UI.rollText) holds a
     tall strip of digits: then the element's own box. */
  function textRect(el) {
    const own = el.getBoundingClientRect();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0 && r.height <= own.height + 2) return r;
    } catch (e) { /* no range: the element's box */ }
    return own;
  }

  function keyedIn(root) {
    const out = [];
    const add = (key, el) => {
      if (out.some(k => k.key === key) || !el.getClientRects().length) return;
      out.push({ key, el, text: el.textContent });
    };
    if (root.matches && root.matches("[data-morph-key]")) add(root.getAttribute("data-morph-key"), root);
    root.querySelectorAll("[data-morph-key]").forEach(el => add(el.getAttribute("data-morph-key"), el));
    Object.keys(KEYS).forEach(key => {
      const el = [...root.querySelectorAll(KEYS[key])].find(x => x.getClientRects().length);
      if (el) add(key, el);
    });
    return out;
  }

  /* The look of a box, copied BEFORE any class changes: the accent colours
     are registered properties (v9.24), and a live style read after a class
     change already gives the new values. A box with no paint of its own (a
     table row, a screen) takes the colour of what shows behind it. */
  function lookOf(el) {
    const cs = getComputedStyle(el);
    let bg = cs.backgroundColor;
    if (isClear(bg)) bg = gradientColor(cs.backgroundImage) || bg;
    const own = !isClear(bg);
    if (!own) {
      const cell = el.firstElementChild;
      const candidates = cell && /^T[DH]$/.test(cell.tagName) ? [cell] : [];
      for (let p = el.parentElement; p; p = p.parentElement) candidates.push(p);
      const solid = candidates.map(c => getComputedStyle(c).backgroundColor).find(c => !isClear(c));
      bg = solid || "transparent";
    }
    const border = parseFloat(cs.borderTopWidth) > 0 && !isClear(cs.borderTopColor) ? cs.borderTopColor : "transparent";
    return { bg, own, border, radius: cs.borderTopLeftRadius || "0px" };
  }

  function inTopLayer(el) {
    try {
      const d = el.closest && el.closest("dialog");
      return !!(d && d.matches(":modal"));
    } catch (e) { return false; }
  }
  // The outermost numbered layer around the element, the one that counts against the ghost's.
  function outerZ(el) {
    let z = null;
    for (let p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position !== "static" && cs.zIndex !== "auto" && !isNaN(Number(cs.zIndex))) z = Number(cs.zIndex);
    }
    return z;
  }

  /* The pieces of the detail that are not shared texts: the children that hold
     no shared text, and inside those that do, the same rule again. */
  function restOf(root, keyEls) {
    const out = [];
    (function walk(node, depth) {
      [...node.children].forEach(c => {
        if (keyEls.includes(c)) return;
        if (depth < 4 && keyEls.some(k => c.contains(k))) { walk(c, depth + 1); return; }
        out.push(c);
      });
    })(root, 0);
    return out.filter(onScreen);
  }

  // ---------- The trip ----------

  let trip = null;
  let busy = false;
  // The detail and what opened it: closing folds it back there.
  const memo = new WeakMap();

  // An inline style set for the trip, and its way back.
  function setStyle(t, el, prop, value) {
    const was = el.style[prop];
    el.style[prop] = value;
    t.restore.push(() => { el.style[prop] = was; });
  }

  /* Lets a clipping box show what overflows it. A plain block keeps the new
     formatting context its overflow gave it (flow-root), so nothing in it
     moves; a scrolled box is left alone, it would jump back to its top. */
  function unclip(t, el) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible" && cs.overflowY === "visible") return;
    if (el.scrollTop || el.scrollLeft) return;
    if (cs.display === "block") setStyle(t, el, "display", "flow-root");
    else if (!/flex|grid|inline-block|table-cell/.test(cs.display)) return;
    setStyle(t, el, "overflow", "visible");
  }

  /* The update runs here: nothing it starts may animate on its own (a view
     transition would freeze the page over the ghost), and a jump to the top
     of the page is instant, so the detail is measured where it will stay. */
  function run(update) {
    const html = document.documentElement;
    const was = html && html.style ? html.style.scrollBehavior : "";
    busy = true;
    if (html && html.style) html.style.scrollBehavior = "auto";
    try { update(); } finally {
      busy = false;
      if (html && html.style) html.style.scrollBehavior = was;
    }
  }

  // The ghost has landed: the detail gets its own look back. The pieces may still be arriving.
  function land(t) {
    if (t.landed) return;
    t.landed = true;
    if (t.ghost) t.ghost.remove();
    if (t.dest) t.dest.classList.remove("morph-dest");
  }

  /* Ends the trip where it is: the detail as it should be, every inline style
     restored, nothing left behind. A second tap, the next trip, or the timer. */
  function finish() {
    const t = trip;
    if (!t) return;
    trip = null;
    t.timers.forEach(clearTimeout);
    document.removeEventListener("pointerdown", t.stop, true);
    document.removeEventListener("keydown", t.stop, true);
    if (t.after) { try { t.after(); } catch (e) { /* the update's own error is not the trip's */ } }
    land(t);
    t.anims.forEach(a => { try { a.cancel(); } catch (e) { /* already gone */ } });
    t.restore.reverse().forEach(fn => fn());
  }

  function begin(t, total, landAt) {
    trip = t;
    t.stop = () => { if (trip === t) finish(); };
    document.addEventListener("pointerdown", t.stop, true);
    document.addEventListener("keydown", t.stop, true);
    /* A page that gets no frames never ends its animations: the timers do,
       so the detail always ends up as it should, with or without movement. */
    if (landAt) t.timers.push(setTimeout(() => { if (trip === t) land(t); }, landAt + 60));
    t.timers.push(setTimeout(t.stop, total + 120));
    Promise.all(t.anims.map(a => a.finished)).then(t.stop, () => {});
  }

  function resolve(to) {
    const el = typeof to === "function" ? to() : typeof to === "string" ? document.querySelector(to) : to;
    return isEl(el) && el.isConnected !== false ? el : null;
  }

  /* THE MORPH. `from` is what you touched, `update` opens what comes next,
     `to` its box. Returns true when it moves, false when the update ran
     without movement (reduced motion, a hidden page, a source out of view, a
     detail that did not open). */
  function morph(from, update, to, opts) {
    const o = opts || {};
    finish();
    // A trip inside a trip's update (a cup opened by a palette result): the outer one moves.
    if (busy) { update(); return false; }
    const start = canMove(from) && from.isConnected !== false ? clampRect(from.getBoundingClientRect(), vw(), vh(), MARGIN) : null;
    if (!start) { run(update); if (o.remember) o.remember(resolve(to)); return false; }

    // Everything of the source is read BEFORE the update changes the page.
    const fromLook = lookOf(from);
    const fromTop = inTopLayer(from);
    const fromKeys = keyedIn(from).map(k => ({ ...k, rect: textRect(k.el), font: parseFloat(getComputedStyle(k.el).fontSize) || 16 }))
      .filter(k => clampRect(k.rect, vw(), vh(), 0));

    run(update);
    const dest = resolve(to);
    if (o.remember) o.remember(dest);
    if (!dest || dest === from || !canMove(dest)) return false;

    const destLook = lookOf(dest);
    const t = { anims: [], restore: [], timers: [], ghost: null, dest: null, landed: false };
    dest.classList.add("morph-dest");
    t.dest = dest;
    const end = clampRect(dest.getBoundingClientRect(), vw(), vh(), MARGIN);
    if (!end) { dest.classList.remove("morph-dest"); return false; }
    const duration = o.back ? MOTION.back : MOTION.duration;

    // The source lifts out of its list for the trip.
    if (from.isConnected !== false) setStyle(t, from, "visibility", "hidden");

    // The layers: the ghost under the detail's content, above the rest of the page.
    const over = o.over === true || (fromTop && start.width * start.height > 0.5 * vw() * vh());
    const layer = layerOf({ topLayer: inTopLayer(dest), z: outerZ(dest), over });
    if (layer.raise !== null) {
      if (getComputedStyle(dest).position === "static") setStyle(t, dest, "position", "relative");
      setStyle(t, dest, "zIndex", String(layer.raise));
    }

    // The shared texts: the detail's own glide from where the source's were.
    const pairs = matchKeys(fromKeys, keyedIn(dest));
    /* A box that clips its content (the entry's timer card, the panel's
       scrolling body) would cut a text flying in from outside it: it lets
       it through for the trip, only when the flight leaves it. */
    pairs.forEach(p => {
      const path = union(p.from.rect, textRect(p.to.el));
      for (let a = p.to.el.parentElement; a; a = a.parentElement) {
        if (!contains(a.getBoundingClientRect(), path)) unclip(t, a);
        if (a === dest) break;
      }
    });
    pairs.forEach(p => {
      if (getComputedStyle(p.to.el).display === "inline") setStyle(t, p.to.el, "display", "inline-block");
      setStyle(t, p.to.el, "transformOrigin", "0 0");
    });
    const glides = pairs.map(p => {
      const el = p.to.el, box = el.getBoundingClientRect(), text = textRect(el);
      if (!clampRect(text, vw(), vh(), 0)) return null;
      const k = p.from.font / (parseFloat(getComputedStyle(el).fontSize) || p.from.font);
      const { dx, dy } = flipText(box, text, p.from.rect, k);
      return { el, frames: [{ transform: "translate(" + dx + "px, " + dy + "px) scale(" + k + ")" }, { transform: "none" }] };
    }).filter(Boolean);

    const ghost = document.createElement("div");
    ghost.className = "morph-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.zIndex = String(layer.ghost);
    document.body.appendChild(ghost);
    t.ghost = ghost;
    const box = r => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    const first = { ...box(start), borderRadius: fromLook.radius, backgroundColor: fromLook.bg, borderColor: fromLook.border, opacity: 1 };
    const last = { ...box(end), borderRadius: destLook.radius, backgroundColor: destLook.bg, borderColor: destLook.border,
      // A detail with no paint of its own (a whole screen): the ghost melts into the page as it lands.
      opacity: destLook.own ? 1 : 0 };
    const timing = { duration, easing: MOTION.ease, fill: "forwards" };
    t.anims.push(ghost.animate(destLook.own ? [first, last] : [first, { opacity: 1, offset: 0.6 }, last], timing));
    glides.forEach(g => t.anims.push(g.el.animate(g.frames, { duration, easing: MOTION.ease })));

    // The rest of the detail arrives after, one piece at a time.
    const rest = restOf(dest, pairs.map(p => p.to.el));
    let latest = duration;
    /* The boxes that hold a shared text (the entry's recipe band, a panel's
       header) cannot fade, their text is already there: only their own
       paint arrives, with the first pieces. */
    const holders = [];
    pairs.forEach(p => {
      for (let a = p.to.el.parentElement; a && a !== dest; a = a.parentElement) if (!holders.includes(a)) holders.push(a);
    });
    holders.filter(onScreen).forEach(el => t.anims.push(el.animate(
      [{ backgroundColor: "transparent", borderColor: "transparent", boxShadow: "none", offset: 0 }],
      { duration: MOTION.rest, delay: restDelay(0, duration), easing: "ease-out", fill: "backwards" })));
    rest.forEach((el, n) => {
      const delay = restDelay(n, duration);
      latest = Math.max(latest, delay + MOTION.rest);
      t.anims.push(el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
        { duration: MOTION.rest, delay, easing: "ease-out", fill: "backwards" }));
    });
    // A modal window's veil comes in late, once the ghost covers what it veils.
    if (inTopLayer(dest)) {
      try { t.anims.push(dest.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration, pseudoElement: "::backdrop" })); } catch (e) { /* no veil animation, it is there at once */ }
    }
    t.anims[0].finished.then(() => land(t), () => {});
    begin(t, latest, duration);
    return true;
  }

  // ---------- The three entry points ----------

  /* Opens `to` from `from`, and remembers the way back. opts.id: what the
     detail shows (a cup's id), so that closing after walking to another cup
     does not fold into the first one; opts.find: finds the source again when
     its list has been redrawn in the meantime. */
  function morphOpen(from, update, to, opts) {
    const o = opts || {};
    return morph(from, update, to, {
      ...o,
      remember: dest => { if (dest) memo.set(dest, { el: from, id: o.id, find: o.find }); },
    });
  }

  function morphClose(from, update, to, opts) {
    return morph(from, update, to, { ...(opts || {}), back: true });
  }

  // A simple fade, then the update: for a detail whose source is gone.
  function fade(el, update) {
    if (!canMove(el)) { update(); return; }
    const t = { anims: [], restore: [], timers: [], ghost: null, dest: null, landed: true, after: update };
    t.anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fade, easing: "ease-in", fill: "forwards" }));
    if (inTopLayer(el)) {
      try { t.anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fade, easing: "ease-in", fill: "forwards", pseudoElement: "::backdrop" })); } catch (e) { /* the veil goes with the window */ }
    }
    begin(t, MOTION.fade, 0);
  }

  /* Closes `detail` back into what opened it, when that is still on screen
     (opts.id must match what the detail shows); otherwise a fade when
     opts.fade, or the plain update. The update always runs once. */
  function morphBack(detail, update, opts) {
    const o = opts || {};
    finish();
    const m = isEl(detail) ? memo.get(detail) : null;
    let source = null;
    if (m && (o.id === undefined || m.id === undefined || String(m.id) === String(o.id))) {
      source = m.el && m.el.isConnected !== false ? m.el : null;
      if (!source && m.find) source = resolve(m.find);
    }
    if (!source && o.find) source = resolve(o.find);
    if (source && onScreen(source) && canMove(detail)) {
      memo.delete(detail);
      const id = o.id;
      morphClose(detail, update, () => {
        // The list may have been redrawn by the update: the same item, found again.
        if (source.isConnected !== false) return source;
        return m && m.find ? m.find() : o.find ? o.find() : null;
      }, { id });
      return true;
    }
    if (o.fade) { fade(detail, update); return true; }
    update();
    return false;
  }

  // The open detail, whatever opened it: the side panel, the coffee sheet, or the entry on the phone.
  function morphDetail() {
    const aside = document.getElementById("side-panel");
    if (aside && !aside.hidden) return aside;
    const sheet = document.getElementById("modal-sheet");
    if (sheet && sheet.open) return sheet;
    return UI.nav && UI.nav.screenName === "entry" ? document.getElementById("screen-entry") : null;
  }

  const morphing = () => busy;

  Object.assign(UI, {
    MOTION, morphOpen, morphClose, morphBack, morphing, morphDetail, morphFinish: finish,
    // The pure parts, for tools/morph.test.mjs.
    morphMath: { clampRect, flipText, wordsOf, sameText, matchKeys, isClear, gradientColor, layerOf, restDelay, union, contains, KEYS },
  });
})();
