/* Q3 and Q5 (v9.20): SMALL SCENES THAT SAY WHAT A GESTURE JUST DID.
 *
 * Q3, THE FIGURES THAT ROLL AFTER AN EDIT. A cup corrected after the fact
 * (the dial was 1.4.4, the score revised the next day) came back in the list
 * exactly as before: nothing said the correction went through. Now, back in
 * the list, ONLY the figures that changed roll like a counter (UI.rollText,
 * js/ui-roll.js), on a copper background that fades in two seconds. Nothing
 * else moves: no message, no scroll, no shift, nothing to dismiss. It plays
 * once, when the row is actually seen, and also for a correction that came
 * from the other device through the sync.
 *
 * HOW IT KNOWS: every data notification, the figures of each cup are
 * compared with what this page last knew of them (memory only). A cup whose
 * figures moved waits, with its old values, for a row carrying its id
 * (data-id or data-ext) to be drawn and seen, in any list: the journal, the
 * table, the latest cups of the dashboard, the coffee sheet. The rows are
 * found by their id attribute only, so a list redrawn by another file needs
 * no wiring beyond being watched (UI.watchCupRows). New cups are not edits
 * (js/ui-arrivals.js tells those), and a correction not seen within ten
 * minutes is forgotten.
 *
 * Q5, THE CUP THAT GOES TO THE GROUNDS. Deleting a cup squeezes its row into
 * a puck of coffee grounds that flies into a small bin, in the « Tasse
 * supprimée » message; the message's « Annuler » carries a ring that empties
 * in five seconds, and while it is not empty a touch brings the cup back, the
 * puck flying out of the bin and opening into its row. The rows around close
 * the gap, and open it again, instead of jumping. The deletion itself is the
 * same as before: done at once, synced at once (DECISIONS, « Supprimer, puis
 * pouvoir revenir en arrière »).
 *
 * The same small scene, UI.discardScene(element), plays for the other
 * things thrown away here: a cup of the entry's cup list, a recipe, an edit
 * given up. Reduced motion, a hidden page: the gesture happens, nothing
 * flies, and the ring stays still. */
"use strict";

(() => {

  const { $, $$, fmtDecimal, fmtDuration, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const safeId = id => typeof id === "string" && /^[\w-]+$/.test(id);

  // ---------- Q3: the figures that roll after an edit ----------

  // The fields whose change rolls: the figures of a cup, not its words.
  const FIGURES = ["dose_g", "water_g", "grind_dial", "temperature_c", "heat_level", "total_time_s", "flow_time_s", "yield_ml", "score_10"];
  // A correction not seen in this time is forgotten.
  const EDIT_KEPT_MS = 10 * 60 * 1000;
  // The copper behind the changed figures fades in this time.
  const FLASH_MS = 2000;
  // Where cup rows are drawn, watched from the start; other lists join through UI.watchCupRows.
  const ZONES = ["#h-body", "#h-cards", "#h-journal", "#h-grid", "#latest-list", "#sheet-content"];

  const known = new Map();      // id -> the figures this page last knew
  const pending = new Map();    // id -> { before, after, at }: corrected, not seen yet
  const playing = new Map();    // id -> { pairs, t0 }: seen, rolling or fading
  // A row already decorated carries _editDone: it is redrawn as a new element anyway.
  const isDone = row => !!row._editDone;
  const markDone = row => { row._editDone = true; };

  function figuresOf(e) {
    const o = { method: e.method || "" };
    FIGURES.forEach(k => { o[k] = e[k] === undefined || e[k] === null ? "" : String(e[k]); });
    return o;
  }
  const sameFigures = (x, y) => FIGURES.every(k => x[k] === y[k]);

  /* Compares the cups with what was known of them. Pure on its inputs:
     `rows` the extractions, `memory` the map of what was known (updated in
     place), `waiting` the map of corrections not yet seen (updated in place). */
  function noteEdits(rows, memory, waiting, at) {
    const seen = new Set();
    (rows || []).forEach(e => {
      if (!e || !e.id) return;
      seen.add(e.id);
      const fig = figuresOf(e);
      const before = memory.get(e.id);
      memory.set(e.id, fig);
      if (!before || sameFigures(before, fig)) return;
      const w = waiting.get(e.id);
      // Corrected twice before being seen: it rolls from what was shown first.
      const from = w ? w.before : before;
      if (sameFigures(from, fig)) waiting.delete(e.id);
      else waiting.set(e.id, { before: from, after: fig, at });
    });
    [...memory.keys()].forEach(id => { if (!seen.has(id)) { memory.delete(id); waiting.delete(id); } });
  }
  function collectEdits() {
    noteEdits(DATA.state.extractions, known, pending, Date.now());
    [...pending].forEach(([id, w]) => { if (Date.now() - w.at > EDIT_KEPT_MS) pending.delete(id); });
  }

  /* The texts a changed figure can be written as in a row, old and new:
     the dial, its microns, the degrees, the heat, the times, the ratio, the
     volume, the score (with a comma or a point). Dose and water are read in
     their « 15 → 225 » pair. Pure. */
  function figurePairs(before, after, fmt) {
    const f = fmt || {};
    const dec = f.decimal || (n => String(n));
    const dur = f.duration || (s => String(s));
    const heat = f.heat || (n => String(n));
    const pairs = [];
    const add = (kind, from, to) => { if (to !== "" && from !== to) pairs.push({ kind, from: String(from), to: String(to) }); };
    if (before.grind_dial !== after.grind_dial) {
      add("token", before.grind_dial, after.grind_dial);
      const p = d => (typeof GRIND !== "undefined" ? GRIND.parseDial(d) : null);
      const a = p(before.grind_dial), b = p(after.grind_dial);
      if (a && b) add("token", Math.round(a.microns) + " µm", Math.round(b.microns) + " µm");
    }
    if (before.temperature_c !== after.temperature_c && after.temperature_c !== "") add("token", before.temperature_c + " °C", after.temperature_c + " °C");
    if (before.heat_level !== after.heat_level && after.heat_level !== "" && after.method === "Brikka") add("token", heat(before.heat_level), heat(after.heat_level));
    ["total_time_s", "flow_time_s"].forEach(k => { if (before[k] !== after[k]) add("token", dur(before[k]), dur(after[k])); });
    if (before.yield_ml !== after.yield_ml && after.yield_ml !== "") add("token", before.yield_ml + " ml", after.yield_ml + " ml");
    const ratio = (x, y) => (Number(x) > 0 && y !== "" ? "1:" + (Number(y) / Number(x)).toFixed(1) : "");
    if (before.dose_g !== after.dose_g || before.water_g !== after.water_g) {
      add("token", ratio(before.dose_g, before.water_g), ratio(after.dose_g, after.water_g));
      if (before.dose_g !== after.dose_g) add("dose", before.dose_g, after.dose_g);
      if (before.water_g !== after.water_g) add("water", before.water_g, after.water_g);
    }
    if (before.yield_ml !== after.yield_ml || before.dose_g !== after.dose_g) add("token", ratio(before.dose_g, before.yield_ml), ratio(after.dose_g, after.yield_ml));
    if (before.score_10 !== after.score_10 && after.score_10 !== "") {
      const s = v => (v === "" ? "" : dec(Number(v)));
      add("score", s(before.score_10), s(after.score_10));
      if (String(after.score_10) !== s(after.score_10)) add("score", String(before.score_10), String(after.score_10));
    }
    return pairs.filter(p => p.to);
  }

  /* Where the new texts of `pairs` sit in a piece of text: [{ start, end,
     from, to }], without overlaps. A token must stand on its own (no digit,
     point, comma or colon glued to it); a score must be the whole text, or
     followed by « / 10 »; dose and water are found in their arrow pair. Pure. */
  function findFigures(text, pairs) {
    const hits = [];
    const glued = c => !!c && /[\d.,:]/.test(c);
    pairs.forEach(p => {
      if (p.kind === "token") {
        let i = text.indexOf(p.to);
        while (i >= 0) {
          if (!glued(text[i - 1]) && !glued(text[i + p.to.length])) hits.push({ start: i, end: i + p.to.length, from: p.from, to: p.to });
          i = text.indexOf(p.to, i + 1);
        }
      } else if (p.kind === "score") {
        const trimmed = text.trim(), lead = text.indexOf(trimmed);
        if (trimmed === p.to || trimmed === p.to + " / 10" || trimmed === p.to + "/10") hits.push({ start: lead, end: lead + p.to.length, from: p.from, to: p.to });
      } else {
        const re = /(\d+(?:[.,]\d+)?)(\s*→\s*)(\d+(?:[.,]\d+)?)/g;
        let m;
        while ((m = re.exec(text))) {
          if (p.kind === "dose" && m[1] === p.to) hits.push({ start: m.index, end: m.index + m[1].length, from: p.from, to: p.to });
          if (p.kind === "water" && m[3] === p.to) {
            const s = m.index + m[1].length + m[2].length;
            hits.push({ start: s, end: s + m[3].length, from: p.from, to: p.to });
          }
        }
      }
    });
    hits.sort((a, b) => a.start - b.start);
    return hits.filter((h, i) => !hits.slice(0, i).some(o => h.start < o.end && o.start < h.end));
  }

  const fmtPairs = () => ({ decimal: n => fmtDecimal(n, 1), duration: fmtDuration, heat: n => I18N.t("setting_heat", { f: n }) });

  /* Wraps each changed figure of a row in a span that rolls from the old
     text and wears the fading copper. `shift`: how far into the scene the
     row already is (a render in the middle resumes it, it does not restart). */
  function decorate(row, pairs, shift) {
    if (typeof document.createTreeWalker !== "function" || typeof row.querySelectorAll !== "function") return;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    const still = calm();
    nodes.forEach(node => {
      const parent = node.parentElement;
      if (!parent || parent.closest("button, input, select, svg, .edit-fig, .roll, .offscreen")) return;
      const text = node.nodeValue || "";
      const hits = findFigures(text, pairs);
      if (!hits.length) return;
      const frag = document.createDocumentFragment();
      let at = 0;
      const spans = [];
      hits.forEach(h => {
        if (h.start > at) frag.appendChild(document.createTextNode(text.slice(at, h.start)));
        const span = document.createElement("span");
        span.className = "edit-fig" + (still ? " still" : "");
        span.textContent = h.to;
        span.style.setProperty("--edit-shift", (-Math.round(shift)) + "ms");
        frag.appendChild(span);
        spans.push([span, h]);
        at = h.end;
      });
      if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
      parent.replaceChild(frag, node);
      spans.forEach(([span, h]) => {
        if (!still && shift < UI.ROLL_MS) UI.rollText(span, h.to, h.from);
        // The copper goes once it has faded; under reduced motion it simply stays its two seconds.
        setTimeout(() => span.classList.remove("edit-fig", "still"), Math.max(0, FLASH_MS - shift) + 60);
      });
    });
  }

  const inView = row => {
    if (typeof row.getBoundingClientRect !== "function" || typeof window.innerHeight !== "number") return false;
    const r = row.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  };
  const rowId = row => row.getAttribute("data-id") || row.getAttribute("data-ext");

  let seen = null;
  function start(row) {
    const id = rowId(row);
    const w = pending.get(id);
    if (!w || row.isConnected === false || isDone(row)) return;
    pending.delete(id);
    const pairs = figurePairs(w.before, w.after, fmtPairs());
    if (!pairs.length) return;
    playing.set(id, { pairs, t0: now() });
    markDone(row);
    decorate(row, pairs, 0);
  }

  /* Gives life to the corrected cups drawn in `root`: each rolls the first
     time its row is seen; a row redrawn while its scene plays resumes it. */
  function playCupEdits(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    collectEdits();
    if (!pending.size && !playing.size) return;
    const t = now();
    [...playing].forEach(([id, p]) => { if (t - p.t0 > FLASH_MS) playing.delete(id); });
    const rows = [...root.querySelectorAll("[data-id], [data-ext]")].filter(r => !isDone(r) && !r.closest("button") &&
      String(r.tagName).toLowerCase() !== "button");
    const later = [];
    rows.forEach(row => {
      const id = rowId(row);
      if (playing.has(id)) {
        const p = playing.get(id);
        markDone(row);
        decorate(row, p.pairs, t - p.t0);
        return;
      }
      if (!pending.has(id)) return;
      if (!hidden() && inView(row)) start(row);
      else later.push(row);
    });
    if (!later.length || typeof IntersectionObserver !== "function") return;
    if (!seen) {
      seen = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting || hidden()) return;
        seen.unobserve(entry.target);
        start(entry.target);
      }));
    }
    // The rows a redraw replaced will never be seen: they are let go.
    watching.forEach(row => { if (!row.isConnected) seen.unobserve(row); });
    watching = watching.filter(row => row.isConnected).concat(later);
    later.forEach(row => seen.observe(row));
  }
  let watching = [];

  /* Watches a list where cup rows are drawn: after each redraw, its
     corrected cups play. For a list drawn by another file (the dashboard's
     latest cups, the coffee sheet): one call, or nothing if its container is
     one of ZONES. */
  function watchCupRows(target) {
    const el = typeof target === "string" ? $(target) : target;
    if (!el || el._cupRowsWatched || typeof MutationObserver !== "function") return;
    el._cupRowsWatched = true;
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      Promise.resolve().then(() => { queued = false; playCupEdits(el); });
    }).observe(el, { childList: true, subtree: true });
  }

  // ---------- Q5: the cup that goes to the grounds ----------

  const SQUEEZE_MS = 230, FLY_MS = 400, UNDO_MS = 5000, PUCK = 26;
  const BIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="bin-lid" d="M4 7h16M9 7V4.5h6V7"/>' +
    '<path class="bin-body" d="M6 7.5l1 12.5h10l1-12.5"/><path class="bin-ribs" d="M10 11v6M14 11v6"/></svg>';

  const mayPlay = el => !calm() && !hidden() && !!el && typeof el.animate === "function" && typeof el.getBoundingClientRect === "function";

  // The open window an element sits in: a scene drawn outside it would pass under it.
  const hostOf = el => (el && el.closest && el.closest("dialog[open]")) || document.body;

  // The row and the lines that belong to it (a table row's comment below).
  function partsOf(el) {
    const parts = [el];
    const id = el.getAttribute && (el.getAttribute("data-id") || el.getAttribute("data-ext"));
    let next = el.nextElementSibling;
    while (id && next && next.classList && (next.classList.contains("row-comment") || next.classList.contains("last-comment")) &&
      (next.getAttribute("data-id") || next.getAttribute("data-ext")) === id) { parts.push(next); next = next.nextElementSibling; }
    return parts;
  }
  function unionRect(els) {
    const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rs.length) return null;
    const left = Math.min(...rs.map(r => r.left)), top = Math.min(...rs.map(r => r.top));
    const right = Math.max(...rs.map(r => r.right)), bottom = Math.max(...rs.map(r => r.bottom));
    return { left, top, width: right - left, height: bottom - top };
  }
  // The part of a rect inside the window, for the elements taller than it.
  function clip(r) {
    const top = Math.max(r.top, 8), bottom = Math.min(r.top + r.height, window.innerHeight - 8);
    return { left: r.left, top, width: r.width, height: Math.max(40, bottom - top) };
  }

  /* The visual copy that leaves. A table row becomes a strip of its cells; a
     small card is cloned; a big block (a form) becomes a plain sheet with
     its title, it would be too heavy to copy and only its shape is seen. */
  function ghostOf(els, rect, label) {
    const g = document.createElement("div");
    g.className = "discard-ghost";
    g.setAttribute("aria-hidden", "true");
    const first = els[0];
    const copy = document.createElement("div");
    copy.className = "discard-copy";
    const big = rect.height > 240;
    if (big) {
      g.classList.add("sheet");
      copy.textContent = label || "";
    } else if (String(first.tagName).toLowerCase() === "tr") {
      g.classList.add("strip");
      els.forEach(tr => {
        const line = document.createElement("div");
        line.className = "discard-line";
        [...tr.children].forEach(td => {
          const cell = document.createElement("div");
          cell.className = "discard-cell";
          cell.style.width = td.getBoundingClientRect().width + "px";
          cell.innerHTML = td.innerHTML;
          line.appendChild(cell);
        });
        copy.appendChild(line);
      });
    } else {
      const clone = first.cloneNode(true);
      [clone, ...clone.querySelectorAll("[id]")].forEach(x => x.removeAttribute && x.removeAttribute("id"));
      clone.classList.add("discard-clone");
      copy.appendChild(clone);
    }
    g.appendChild(copy);
    Object.assign(g.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
    hostOf(first).appendChild(g);
    return g;
  }

  // The points of a curve from p to q, arched upward, for the flight.
  function arc(p, q, lift) {
    const c = { x: (p.x + q.x) / 2, y: Math.min(p.y, q.y) - lift };
    return Array.from({ length: 9 }, (_, i) => {
      const s = i / 8, u = 1 - s;
      return { x: u * u * p.x + 2 * u * s * c.x + s * s * q.x, y: u * u * p.y + 2 * u * s * c.y + s * s * q.y, s };
    });
  }

  const centerOf = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // The ghost becomes a puck at its centre (squeeze), or opens from one (open).
  function squeeze(g, rect, open) {
    const c = centerOf(rect);
    const flat = { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px", borderRadius: "14px" };
    const puck = { left: c.x - PUCK / 2 + "px", top: c.y - PUCK / 2 + "px", width: PUCK + "px", height: PUCK + "px", borderRadius: "50%" };
    const frames = open ? [puck, flat] : [flat, { ...puck, borderRadius: "40%", offset: 0.7 }, puck];
    const a = g.animate(frames, { duration: SQUEEZE_MS, easing: open ? "cubic-bezier(0.2, 0.8, 0.3, 1)" : "cubic-bezier(0.5, 0, 0.75, 0.6)", fill: "both" });
    g.classList.toggle("grounds", !open);
    const copy = g.querySelector(".discard-copy");
    if (copy) copy.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }],
      { duration: SQUEEZE_MS, fill: "both" });
    return a.finished.catch(() => {});
  }

  /* The puck, drawn at `origin`, flies from `from` to `to` along an arc,
     turning; it shrinks into the bin, and grows back out of it. */
  function fly(g, origin, from, to, back) {
    const pts = arc(from, to, Math.max(60, Math.abs(to.y - from.y) * 0.35));
    const frames = pts.map(p => ({
      transform: "translate(" + (p.x - origin.x).toFixed(1) + "px, " + (p.y - origin.y).toFixed(1) + "px) rotate(" + Math.round(p.s * (back ? -360 : 300)) + "deg) scale(" +
        (back ? 0.55 + 0.45 * p.s : 1 - 0.45 * p.s).toFixed(2) + ")",
    }));
    return g.animate(frames, { duration: FLY_MS, easing: back ? "cubic-bezier(0.2, 0.7, 0.4, 1)" : "cubic-bezier(0.5, 0, 0.7, 1)", fill: "both" })
      .finished.catch(() => {});
  }

  // The bin swallows (the lid jumps) or gives back.
  function gulp(bin) {
    if (!bin) return;
    bin.classList.remove("gulp");
    void bin.offsetWidth;
    bin.classList.add("gulp");
  }

  /* A bin of its own, for what has no undo message to sit in: it rises at
     the bottom, takes the puck, and goes. */
  function floatBin(host) {
    const b = document.createElement("span");
    b.className = "discard-bin-float";
    b.setAttribute("aria-hidden", "true");
    b.innerHTML = BIN_SVG;
    (host || document.body).appendChild(b);
    return b;
  }

  /* THE SCENE, for any element thrown away. Returns a promise that settles
     when the puck is in the bin. opts.bin: the bin to fly into (an element),
     otherwise one rises; opts.label: the title of a big block's sheet. The
     element itself is not touched: the caller removes it, as before. */
  function discardScene(el, opts) {
    const o = opts || {};
    if (!mayPlay(el)) return Promise.resolve();
    const parts = partsOf(el);
    const full = unionRect(parts);
    if (!full) return Promise.resolve();
    const rect = clip(full);
    const label = o.label || (el.querySelector && el.querySelector("h2, h3") ? el.querySelector("h2, h3").textContent : "");
    const g = ghostOf(parts, rect, label);
    const host = hostOf(el);
    const bin = o.bin || floatBin(host);
    const own = !o.bin;
    return squeeze(g, rect, false).then(() => {
      const target = typeof o.target === "function" ? o.target() : null;
      const br = target || bin.getBoundingClientRect();
      const c = centerOf(rect);
      return fly(g, c, c, { x: br.left + br.width / 2, y: br.top + br.height * 0.45 }, false);
    }).then(() => {
      gulp(bin);
      g.remove();
      if (own) setTimeout(() => bin.classList.add("leaving"), 260);
      if (own) setTimeout(() => bin.remove(), 620);
    });
  }

  /* The reverse: a puck leaves `fromRect` (the bin), flies to the element and
     opens into it. The element stays invisible until the copy has landed. */
  function restoreScene(el, fromRect) {
    if (!mayPlay(el) || !fromRect) return Promise.resolve();
    const parts = partsOf(el);
    const full = unionRect(parts);
    if (!full || full.top + full.height < 0 || full.top > window.innerHeight) return Promise.resolve();
    const rect = clip(full);
    parts.forEach(p => p.classList.add("discard-waiting"));
    const g = ghostOf(parts, rect, "");
    g.classList.add("grounds");
    const c = centerOf(rect), from = centerOf(fromRect);
    Object.assign(g.style, { left: c.x - PUCK / 2 + "px", top: c.y - PUCK / 2 + "px", width: PUCK + "px", height: PUCK + "px", borderRadius: "50%" });
    const reveal = () => { g.remove(); parts.forEach(p => p.classList.remove("discard-waiting")); };
    // Drawn at the row, the puck starts at the bin and comes back along the arc.
    return fly(g, c, from, c, true)
      .then(() => { g.getAnimations().forEach(a => a.cancel()); return squeeze(g, rect, true); })
      .then(reveal, reveal);
  }

  /* FLIP: the rows of a list slide from where they were to where the new
     render put them, instead of jumping. `before` comes from positions(). */
  function positions(root) {
    const map = new Map();
    if (!root) return map;
    root.querySelectorAll("[data-id], [data-ext]").forEach(r => {
      const key = rowId(r) + (r.classList.contains("row-comment") || r.classList.contains("last-comment") ? "|c" : "");
      if (!map.has(key)) map.set(key, r.getBoundingClientRect().top);
    });
    return map;
  }
  function slideRows(root, before) {
    if (!root || calm() || hidden()) return;
    root.querySelectorAll("[data-id], [data-ext]").forEach(r => {
      const key = rowId(r) + (r.classList.contains("row-comment") || r.classList.contains("last-comment") ? "|c" : "");
      if (!before.has(key) || typeof r.animate !== "function") return;
      const dy = before.get(key) - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 1 || !inView(r)) return;
      r.animate([{ transform: "translateY(" + dy.toFixed(1) + "px)" }, { transform: "none" }],
        { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" });
    });
  }

  // The list a cup row lives in: the container the renders rewrite.
  const listOf = el => (el && el.closest && el.closest("#h-body, #h-cards, #h-journal, #h-grid, #latest-list, #sheet-content")) || (el && el.parentElement) || null;

  /* The row of a cup on the screen shown, found by its id attribute. */
  function findCupRow(id) {
    if (!safeId(id)) return null;
    return $$('[data-id="' + id + '"], [data-ext="' + id + '"]').find(r => {
      const tag = String(r.tagName).toLowerCase();
      if (tag === "button" || tag === "input" || r.closest("#h-compare, #side-panel, .h-sheet")) return false;
      if (r.classList.contains("row-comment") || r.classList.contains("last-comment")) return false;
      return typeof r.getClientRects === "function" && r.getClientRects().length > 0 && !!r.closest(".screen.on, dialog[open]");
    }) || null;
  }

  /* The undo message: the bin, the words, and « Annuler » with its ring that
     empties in five seconds. In the shared #toast, so a later message
     simply takes its place. */
  function undoToast(message, onUndo) {
    const t = $("#toast");
    if (!t) return null;
    t.innerHTML = '<span class="undo-bin">' + BIN_SVG + '</span><span class="undo-text">' + escapeHtml(message) + "</span>";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action undo-btn";
    b.innerHTML = '<svg class="undo-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle></svg>' + escapeHtml(I18N.t("toast_undo"));
    b.addEventListener("click", () => {
      clearTimeout(toast._h);
      onUndo();
    });
    t.appendChild(b);
    t.style.setProperty("--undo-ms", UNDO_MS + "ms");
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.setAttribute("hidden", ""); t.textContent = ""; }, UNDO_MS);
    return t.querySelector(".undo-bin");
  }

  /* DELETING A CUP, with its scene. Called by UI.deleteExtractionWithUndo
     (js/ui-core.js) for every caller, with the clicked row when it has one,
     otherwise the row is looked for by the cup's id. */
  async function discardCup(ext, row) {
    const copied = { ...ext };
    delete copied._c;
    const el = row && row.isConnected !== false ? (row.closest && row.closest("[data-id], [data-ext]")) || row : findCupRow(ext.id);
    const play = mayPlay(el);
    const list = play ? listOf(el) : null;
    let ghost = null, rect = null;
    if (play) {
      const parts = partsOf(el);
      const full = unionRect(parts);
      if (full) {
        rect = clip(full);
        ghost = ghostOf(parts, rect, "");
      }
    }
    const before = list ? positions(list) : null;
    await DATA.deleteExtraction(ext.id);
    UI.renderHistory();
    if (list && before) slideRows(list, before);
    let bin = null;
    bin = undoToast(I18N.t("toast_deleted"), async () => {
      const from = bin && bin.getBoundingClientRect ? bin.getBoundingClientRect() : null;
      const back = list ? positions(list) : null;
      await DATA.restoreExtraction(copied);
      UI.renderHistory();
      if (list && back) slideRows(list, back);
      toast(I18N.t("toast_restored"));
      const again = findCupRow(copied.id);
      if (again && from) restoreScene(again, from);
    });
    if (!ghost) return;
    await squeeze(ghost, rect, false);
    const br = bin && bin.getBoundingClientRect ? bin.getBoundingClientRect() : null;
    const c = centerOf(rect);
    if (br && br.width) await fly(ghost, c, c, { x: br.left + br.width / 2, y: br.top + br.height * 0.45 }, false);
    gulp(bin);
    ghost.remove();
  }

  function wireScenes() {
    DATA.subscribe(kind => { if (kind !== "sync") collectEdits(); });
    ZONES.forEach(watchCupRows);
    // A page that comes back plays what waited for it.
    document.addEventListener("visibilitychange", () => {
      if (hidden() || !pending.size) return;
      ZONES.map(s => $(s)).filter(Boolean).forEach(playCupEdits);
    });
  }

  Object.assign(UI, {
    noteEdits, figurePairs, findFigures, playCupEdits, watchCupRows, collectEdits,
    discardScene, restoreScene, discardCup, findCupRow, undoToast, wireScenes, EDIT_FLASH_MS: FLASH_MS,
  });
})();
