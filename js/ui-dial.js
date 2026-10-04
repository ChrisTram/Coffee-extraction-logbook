/* THE GRINDER DIAL (v9.13, Q4 and M2 merged): wherever a dial setting is
 * typed, the C5's dial is drawn next to it.
 *
 * Fifty ticks per turn, the numbers 0 to 9, and a needle that moves one notch
 * per click with a small spring, like the real dial: one look tells a click
 * from a turn. A − and a + button move ONE click (held, they repeat), the
 * arrow keys too while the field has focus, and the text field stays: typing
 * "1.4.4" still works and the dial follows. Microns come from GRIND
 * (its official base per click), never recomputed here.
 *
 * In the entry form the dial also carries the coffee's GOLDEN ZONE, the same
 * three-click window as the grinder map of the dashboard (UI.grinderData):
 * an arc on the dial, a band on the slider over the machine's range, and one
 * sentence saying whether the setting sits in it or how many clicks away.
 *
 * The recipe form and the Settings dial get the compact version (dial and
 * buttons), built around their existing field: no markup to keep in sync.
 * The field stays the source of truth everywhere; the dial follows it,
 * whatever writes it (typing, a recipe prefill, the draft, the Guide's
 * "set my grinder" button), see watchValue.
 *
 * v9.18: A PREFILL TURNS IT. When an action prefills the entry's grind (the
 * « Refaire » path: a cup redone, the reprise of a new bag, a winning
 * setting, the next cup of a coffee), the needle goes to the new setting
 * notch by notch instead of jumping, and the field glows a moment
 * (turnGrindDial). */
"use strict";

(() => {

  const { $, fallbacks, fmtDecimal } = UI;

  const DEG = 360 / 50;
  const instances = [];
  let zoneCache = { key: "", rows: [] };

  const nextFrame = fn => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pageHidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const needleAt = (inst, deg) => { if (inst.needle) inst.needle.style.transform = "rotate(" + deg.toFixed(1) + "deg)"; };

  function vibrate(ms) {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(ms); } catch (e) { /* no vibrator */ }
    }
  }

  const readDial = input => GRIND.parseDial(String((input && input.value) || "").trim().replace(/,/g, "."));

  /* The setting d clicks away, from a typed dial; an empty or unreadable
     field starts from the grinder's real setting (Settings). Bounded by the
     hard stop. */
  function stepDial(dial, d, fallback) {
    const p = GRIND.parseDial(String(dial || "").trim().replace(/,/g, ".")) ||
      GRIND.parseDial(String(fallback || "")) || GRIND.parseDial("1.5.0");
    return GRIND.dialFromClicks(Math.max(0, Math.min(GRIND.MAX_CLICKS, p.clicks + d)));
  }

  // ---------- The face ----------

  const polar = (deg, r) => [100 + r * Math.sin(deg * Math.PI / 180), 100 - r * Math.cos(deg * Math.PI / 180)];

  // A band between two radii, from one angle to another (degrees, clockwise from the top).
  function band(r1, r2, a0, a1) {
    const [x0, y0] = polar(a0, r2), [x1, y1] = polar(a1, r2), [x2, y2] = polar(a1, r1), [x3, y3] = polar(a0, r1);
    const large = a1 - a0 > 180 ? 1 : 0;
    const f = v => v.toFixed(1);
    return "M" + f(x0) + " " + f(y0) + " A" + r2 + " " + r2 + " 0 " + large + " 1 " + f(x1) + " " + f(y1) +
      " L" + f(x2) + " " + f(y2) + " A" + r1 + " " + r1 + " 0 " + large + " 0 " + f(x3) + " " + f(y3) + " Z";
  }

  function faceMarkup() {
    let ticks = "", numbers = "";
    for (let i = 0; i < 50; i++) {
      const major = i % 5 === 0;
      const [x1, y1] = polar(i * DEG, major ? 72 : 81), [x2, y2] = polar(i * DEG, 90);
      ticks += '<line class="' + (major ? "gd-major" : "gd-minor") + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
        '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"></line>';
      if (major) {
        const [x, y] = polar(i * DEG, 56);
        numbers += '<text x="' + x.toFixed(1) + '" y="' + (y + 8).toFixed(1) + '">' + (i / 5) + "</text>";
      }
    }
    return '<circle class="gd-bezel" cx="100" cy="100" r="97"></circle>' +
      '<path class="gd-gold" d=""></path>' + ticks + '<g class="gd-numbers">' + numbers + "</g>" +
      '<g class="gd-pips">' + [86, 100, 114].map(x => '<circle cx="' + x + '" cy="68" r="4.5"></circle>').join("") + "</g>" +
      '<g class="gd-needle"><line x1="100" y1="116" x2="100" y2="30"></line><circle cx="100" cy="100" r="11"></circle></g>';
  }

  // ---------- The golden zone ----------

  /* The coffee's golden zone on this machine, from the grinder map's own
     calculation: three clicks, at least three rated cups. Kept until the data
     or the failed-cups preference change. */
  function goldenZone(coffeeId, method) {
    if (!coffeeId || !method || typeof UI.grinderData !== "function") return null;
    const key = coffeeId + "|" + (DATA.dataRevision ? DATA.dataRevision() : 0) + "|" +
      DATA.state.extractions.length + "|" + (UI.includeFailed ? UI.includeFailed() : "");
    if (zoneCache.key !== key) zoneCache = { key, rows: UI.grinderData(coffeeId) || [] };
    const row = zoneCache.rows.find(r => r.m === method);
    return row && row.golden ? { from: row.golden.from, to: row.golden.a, mean: row.golden.mean, n: row.golden.n } : null;
  }

  /* Where a setting stands against the zone: inside, or k clicks finer or
     coarser. Pure, so it is tested. */
  function zoneStatus(clicks, zone) {
    if (!zone || clicks === null || clicks === undefined) return null;
    if (clicks < zone.from) return { side: "finer", k: zone.from - clicks };
    if (clicks > zone.to) return { side: "coarser", k: clicks - zone.to };
    return { side: "in", k: 0 };
  }

  function zoneSentence(st, zone) {
    const vars = { a: GRIND.dialFromClicks(zone.from), b: GRIND.dialFromClicks(zone.to), m: fmtDecimal(zone.mean, 1),
      n: zone.n, k: st.k, s: st.k > 1 ? "s" : "" };
    return I18N.t(st.side === "in" ? "grind_zone_in" : st.side === "finer" ? "grind_zone_finer" : "grind_zone_coarser", vars);
  }

  // ---------- Painting ----------

  function paint(inst) {
    const p = readDial(inst.input);
    const off = !!inst.input.disabled || !p;
    inst.box.classList.toggle("gd-off", off);
    if (p) {
      if (inst.clicks === null) {
        // First position: no spin from zero to 1.5.0 when the page opens.
        inst.angle = p.clicks * DEG;
        inst.box.classList.add("gd-instant");
        nextFrame(() => nextFrame(() => inst.box.classList.remove("gd-instant")));
      } else {
        inst.angle += (p.clicks - inst.clicks) * DEG;
      }
      inst.clicks = p.clicks;
      // While a prefill turns the dial (turnGrindDial), the needle and the pips are its own.
      if (!inst.turn) {
        needleAt(inst, inst.angle);
        inst.pips.forEach((c, k) => c.classList.toggle("on", k < p.rotation));
      }
    }
    if (inst.minus) inst.minus.disabled = !!inst.input.disabled || (!!p && p.clicks <= 0);
    if (inst.plus) inst.plus.disabled = !!inst.input.disabled || (!!p && p.clicks >= GRIND.MAX_CLICKS);
    if (inst.um) inst.um.textContent = p ? I18N.t("grind_um", { u: Math.round(p.microns) }) : "";

    const method = inst.opts.method ? inst.opts.method() : "";
    const zone = !inst.input.disabled && inst.opts.coffee ? goldenZone(inst.opts.coffee(), method) : null;
    // The arc only when the zone is on the turn the dial shows: on another turn it would point to the wrong click.
    const sameTurn = zone && p && Math.floor(zone.from / 50) <= p.rotation && Math.floor(zone.to / 50) >= p.rotation;
    if (inst.gold) {
      inst.gold.setAttribute("d", sameTurn
        ? band(81, 96, (zone.from - p.rotation * 50 - 0.5) * DEG, (zone.to - p.rotation * 50 + 0.5) * DEG) : "");
    }
    const st = zoneStatus(p ? p.clicks : null, zone);
    if (inst.zone) {
      inst.zone.hidden = !st;
      inst.zone.textContent = st ? zoneSentence(st, zone) : "";
      inst.zone.classList.toggle("gd-zone-in", !!st && st.side === "in");
    }
    if (inst.slider) {
      /* The slider becomes M2's track: the machine's range and the golden
         zone drawn behind its thumb, on the 0 to 150 clicks scale. */
      const range = GRIND.METHODS.find(x => x.id === String(method).toLowerCase());
      const pc = c => (Math.max(0, Math.min(GRIND.MAX_CLICKS, c)) / GRIND.MAX_CLICKS * 100).toFixed(2) + "%";
      const style = inst.slider.style;
      style.setProperty("--rmin", range ? pc(range.minC) : "0%");
      style.setProperty("--rmax", range ? pc(range.maxC) : "0%");
      style.setProperty("--zmin", zone ? pc(zone.from - 0.6) : "0%");
      style.setProperty("--zmax", zone ? pc(zone.to + 0.6) : "0%");
    }
    relabel(inst);
  }

  // Built here, so translated here; the entry's buttons are static HTML and translate themselves.
  function relabel(inst) {
    if (!inst.opts.built) return;
    if (inst.minus) inst.minus.setAttribute("aria-label", I18N.t("grind_finer"));
    if (inst.plus) inst.plus.setAttribute("aria-label", I18N.t("grind_coarser"));
  }

  /* THE DIAL FOLLOWS ITS FIELD, whoever writes it. The field's value is
     read and written through the browser's own property; this adds a repaint
     after each write, on that one element. Without it, every place that
     prefills a dial (recipe form, Settings, the Guide) would need a line to
     remember. Nothing else changes: same value, same events. */
  function watchValue(inst) {
    const input = inst.input;
    const proto = typeof window !== "undefined" && window.HTMLInputElement && window.HTMLInputElement.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (!desc || !desc.set || Object.prototype.hasOwnProperty.call(input, "value")) return;
    let pending = false;
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: true,
      get() { return desc.get.call(this); },
      set(v) {
        desc.set.call(this, v);
        if (pending) return;
        pending = true;
        nextFrame(() => { pending = false; paint(inst); });
      },
    });
  }

  // ---------- Gestures ----------

  function step(inst, d) {
    if (inst.input.disabled) return;
    endTurn(inst);
    const next = stepDial(inst.input.value, d, fallbacks.dial);
    if (next === inst.input.value) return;
    inst.input.value = next;
    // The field's own event: the live line, the warnings and the draft listen to it.
    inst.input.dispatchEvent(new Event("input", { bubbles: true }));
    paint(inst);
    vibrate(5);
  }

  /* Held, a button repeats like a system arrow: 400 ms, then a click every
     110 ms. The click that follows a press is swallowed; a keyboard click
     (Enter, Space) steps on its own. */
  function wireButton(inst, button, d) {
    if (!button) return;
    let timer = null, repeater = null, pressed = false;
    const stop = () => { clearTimeout(timer); clearInterval(repeater); timer = repeater = null; };
    button.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      pressed = true;
      step(inst, d);
      timer = setTimeout(() => { repeater = setInterval(() => step(inst, d), 110); }, 400);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(e => button.addEventListener(e, stop));
    if (typeof window !== "undefined") window.addEventListener("blur", stop);
    button.addEventListener("click", () => {
      if (pressed) { pressed = false; return; }
      step(inst, d);
    });
  }

  function wireInstance(inst) {
    wireButton(inst, inst.minus, -1);
    wireButton(inst, inst.plus, 1);
    inst.input.addEventListener("input", () => { endTurn(inst); paint(inst); });
    // Up and down move one click while typing; the text field has no arrows of its own.
    inst.input.addEventListener("keydown", ev => {
      const d = { ArrowUp: 1, ArrowDown: -1 }[ev.key];
      if (!d) return;
      ev.preventDefault();
      step(inst, d);
    });
    watchValue(inst);
    instances.push(inst);
    paint(inst);
  }

  function makeInstance(input, box, opts) {
    const face = box.querySelector(".gd-face");
    if (face) face.innerHTML = faceMarkup();
    const inst = {
      input, box, opts: opts || {}, clicks: null, angle: 0,
      needle: face ? face.querySelector(".gd-needle") : null,
      gold: face ? face.querySelector(".gd-gold") : null,
      pips: face && face.querySelectorAll ? Array.from(face.querySelectorAll(".gd-pips circle")) : [],
      minus: box.querySelector("[data-grind-step='-1']"),
      plus: box.querySelector("[data-grind-step='1']"),
      um: box.querySelector(".gd-um"),
      zone: opts && opts.zone ? opts.zone : null,
      slider: opts && opts.slider ? opts.slider : null,
    };
    wireInstance(inst);
    return inst;
  }

  // ---------- A prefill turns the dial (v9.18) ----------

  /* The whole turn fits in about half a second, a notch every 34 ms at most:
     a few clicks tick by one by one, a long way takes bigger strides
     (BAGS.dialFrames). It waits to be SEEN: the entry screen may still be in
     its transition, and on the phone the grind field sits below the fold;
     until then the needle stays on the old setting, the field already holds
     the new one (it is the truth). Not seen within six seconds, or a gesture
     on the dial, or reduced motion: the needle simply lands. */
  const TURN_MS = 520, TURN_STEP_MS = 34, TURN_WAIT_MS = 6000;
  let turnWatcher = null;

  function endTurn(inst) {
    const t = inst.turn;
    if (!t) return;
    inst.turn = null;
    t.timers.forEach(clearTimeout);
    if (turnWatcher) turnWatcher.unobserve(inst.box);
    inst.box.classList.remove("gd-turning");
    paint(inst);
  }

  function runTurn(inst, t) {
    if (inst.turn !== t || t.running) return;
    t.running = true;
    clearTimeout(t.giveUp);
    inst.box.classList.add("gd-turning");
    // The field glows while the needle travels; its text rolls from the old setting.
    inst.input.classList.remove("gd-glow");
    void (inst.input.getBoundingClientRect && inst.input.getBoundingClientRect());
    inst.input.classList.add("gd-glow");
    t.timers.push(setTimeout(() => inst.input.classList.remove("gd-glow"), 1400));
    if (UI.rollField) UI.rollField(inst.input, t.fromText);
    const frames = BAGS.dialFrames(t.from, t.to, TURN_MS, TURN_STEP_MS);
    const every = Math.min(70, Math.max(TURN_STEP_MS, TURN_MS / frames.length));
    frames.forEach((c, k) => t.timers.push(setTimeout(() => {
      if (inst.turn !== t) return;
      needleAt(inst, t.start + (c - t.from) * DEG);
      inst.pips.forEach((pip, n) => pip.classList.toggle("on", n < Math.floor(c / 50)));
      if (k === frames.length - 1) t.timers.push(setTimeout(() => endTurn(inst), 180));
    }, k * every)));
  }

  /* The entry's dial goes from `fromDial` (what it showed before the
     prefill) to what its field now holds. Called by loadExtractionIntoEntry
     for every prefill, so every caller gets it. */
  function turnGrindDial(fromDial) {
    const inst = instances.find(x => x.input && x.input.id === "f-grind");
    if (!inst) return;
    endTurn(inst);
    /* An empty field before (a pre-ground coffee was chosen): the grinder
       itself still sits on its real setting, Settings' one; it turns from there. */
    const typed = GRIND.parseDial(String(fromDial || "").trim().replace(/,/g, "."));
    const from = typed || GRIND.parseDial(String(fallbacks.dial || ""));
    const to = readDial(inst.input);
    if (!from || !to || from.clicks === to.clicks || inst.input.disabled || calm() || pageHidden()) return;
    // The angle keeps accumulating, so the needle turns the short way it is used to.
    const target = inst.clicks === null ? to.clicks * DEG : inst.angle + (to.clicks - inst.clicks) * DEG;
    const t = { from: from.clicks, to: to.clicks, start: target - (to.clicks - from.clicks) * DEG,
      fromText: typed ? String(fromDial).trim() : "", timers: [], running: false, giveUp: null };
    inst.turn = t;
    inst.clicks = to.clicks;
    inst.angle = target;
    // Back on the old setting at once, without the spring.
    inst.box.classList.add("gd-instant");
    needleAt(inst, t.start);
    inst.pips.forEach((pip, n) => pip.classList.toggle("on", n < from.rotation));
    nextFrame(() => nextFrame(() => inst.box.classList.remove("gd-instant")));
    t.giveUp = setTimeout(() => { if (inst.turn === t && !t.running) endTurn(inst); }, TURN_WAIT_MS);
    if (typeof IntersectionObserver !== "function") { t.timers.push(setTimeout(() => runTurn(inst, t), 200)); return; }
    if (!turnWatcher) {
      turnWatcher = new IntersectionObserver(entries => entries.forEach(en => {
        if (!en.isIntersecting) return;
        const i = instances.find(x => x.box === en.target);
        turnWatcher.unobserve(en.target);
        // A breath after it shows: the screen change may still be fading in.
        if (i && i.turn) i.turn.timers.push(setTimeout(() => runTurn(i, i.turn), 220));
      }), { threshold: 0.6 });
    }
    turnWatcher.observe(inst.box);
  }

  const stepButton = d => '<button type="button" class="gd-step" data-grind-step="' + d + '">' +
    '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    (d < 0 ? '<path d="M5 12h14"/>' : '<path d="M12 5v14"/><path d="M5 12h14"/>') + "</svg></button>";

  /* The compact dial, built around an existing field (recipe form, Settings). */
  function mountCompact(input, opts) {
    if (!input || !input.parentNode || typeof input.insertAdjacentElement !== "function" ||
        (input.closest && input.closest(".grind-dial"))) return null;
    const box = document.createElement("div");
    box.className = "grind-dial gd-compact";
    box.innerHTML = '<svg class="gd-face" viewBox="0 0 200 200" aria-hidden="true" focusable="false"></svg>' +
      '<div class="gd-body"><div class="gd-row">' + stepButton(-1) + '<span class="gd-slot"></span>' + stepButton(1) + "</div>" +
      (opts && opts.microns ? '<span class="gd-um" aria-hidden="true"></span>' : "") + "</div>";
    input.insertAdjacentElement("beforebegin", box);
    const slot = box.querySelector(".gd-slot");
    if (slot && slot.replaceWith) slot.replaceWith(input);
    return makeInstance(input, box, { ...(opts || {}), built: true });
  }

  /* All the dials: the entry's (static markup, with its slider and golden
     zone), then the recipe form's and the Settings one. Called once, by the
     entry's wiring. */
  function wireGrindDials() {
    const input = $("#f-grind"), box = $("#field-grind");
    if (input && box && !instances.some(x => x.input === input)) {
      makeInstance(input, box, {
        slider: $("#f-grind-slider"), zone: $("#grind-zone"),
        method: () => UI.entry.method,
        coffee: () => (UI.currentCoffeeGround && UI.currentCoffeeGround() ? "" : ($("#f-coffee") || {}).value),
      });
    }
    mountCompact($("#r-dial"), { microns: true, method: () => ($("#r-method") || {}).value });
    mountCompact($("#param-dial"), { microns: false });
  }

  // Every dial at once: after a language switch or a data change.
  function paintGrindDials() { instances.forEach(paint); }

  Object.assign(UI, {
    wireGrindDials, paintGrindDials, stepDial, zoneStatus, grindGoldenZone: goldenZone, turnGrindDial,
  });
})();
