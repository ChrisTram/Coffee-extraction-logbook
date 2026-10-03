/* THE CUP (v9.13): the cup Chris drinks from, drawn, and filled with what he
 * just made. Two places use it:
 *
 *   - Q2, right after « Enregistrer » (full entry, quick entry, brew mode): a
 *     small card slides in, the chosen cup fills with the drink (a Brikka is
 *     dark with its crema, a Switch is an amber filter, a milk recipe is
 *     milky), steam rises, then the score lands on it like a stamp. Under it,
 *     four figures worth reading at that moment: the cup's ratio, the average
 *     for this coffee and this recipe, how far this cup is from it, and the
 *     grams left in the bag. No fill percentage: Chris does not care how full
 *     the cup is. The card never blocks: it sits in a corner, goes away by
 *     itself after a couple of seconds, and a tap or Escape sends it away.
 *   - J2, in the brew mode: the same drawing fills as the water goes in,
 *     replacing the old total bar. Chris has no carafe: the cup IS where the
 *     coffee ends up.
 *
 * The shapes come by FAMILY, read from the cup's name (an egg, a low tasting
 * cup, a mug), and their size from the capacity, so a cup added in the entry
 * form gets a sensible drawing too. The drink colours are fixed on purpose:
 * they draw coffee, not the interface. */
"use strict";

(() => {

  const { $, analyzableExts, average, fmtDecimal, fallbacks, findRecipe, icon } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  // The same default cups as the entry form (chooseMethod) and the quick entry.
  const DEFAULT_CUP = { Brikka: "Loveramics Flat White Egg", Switch: "Classic Mug" };
  // Width, height and capacity of the reference cup of each family, in viewBox units.
  const FAMILY_BASE = { egg: [124, 92, 150], low: [150, 64, 150], mug: [104, 124, 330] };
  const DRINKS = {
    brikka: { body: "#2b170b", top: "#b27a45", topW: 7 },
    filter: { body: "#7a3d16", top: "#b9783c", topW: 4 },
    milk: { body: "#b88a5f", top: "#efe4d4", topW: 10 },
  };
  // How high the card's cup is filled: a pleasant level, not a measurement.
  const CARD_LEVEL = 0.8;
  let clipCount = 0;

  function reducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* The cup row of a name, or the machine's default cup, with its family. */
  function cupOf(name, method) {
    const cups = DATA.state.cups || [];
    const row = cups.find(c => c.name === name) || cups.find(c => c.name === DEFAULT_CUP[method]) || null;
    const label = row ? row.name : DEFAULT_CUP[method] || "";
    const ml = row && Number(row.capacity_ml) > 0 ? Number(row.capacity_ml) : (method === "Switch" ? 330 : 150);
    const family = /mug/i.test(label) ? "mug"
      : /nutty|tasting|bowl|\bbol\b/i.test(label) ? "low"
        : /egg|oeuf|œuf/i.test(label) ? "egg"
          : ml > 200 ? "mug" : "egg";
    return { name: label, ml, family };
  }

  /* The outline of a cup, in a 220 wide box whose bottom sits at y = 150. */
  function shapeOf(cup) {
    const [l0, h0, ml0] = FAMILY_BASE[cup.family];
    const k = Math.max(0.8, Math.min(1.12, Math.cbrt(cup.ml / ml0)));
    const l = l0 * k, h = h0 * k, cx = 110, bottom = 150, top = bottom - h;
    const g = cx - l / 2, d = cx + l / 2;
    const n = v => v.toFixed(1);
    let body, handle = "";
    if (cup.family === "mug") {
      body = "M" + n(g) + " " + n(top) + " L" + n(d) + " " + n(top) + " L" + n(d) + " " + (bottom - 9) +
        " Q" + n(d) + " " + bottom + " " + n(d - 9) + " " + bottom + " L" + n(g + 9) + " " + bottom +
        " Q" + n(g) + " " + bottom + " " + n(g) + " " + (bottom - 9) + " Z";
      handle = "M" + n(d) + " " + n(top + h * 0.2) + " C" + n(d + 34) + " " + n(top + h * 0.2) + " " +
        n(d + 34) + " " + n(top + h * 0.64) + " " + n(d) + " " + n(top + h * 0.64);
    } else if (cup.family === "low") {
      body = "M" + n(g) + " " + n(top) + " L" + n(d) + " " + n(top) + " C" + n(d - 6) + " " + (bottom - 6) + " " +
        n(d - 30) + " " + bottom + " " + cx + " " + bottom + " C" + n(g + 30) + " " + bottom + " " +
        n(g + 6) + " " + (bottom - 6) + " " + n(g) + " " + n(top) + " Z";
    } else {
      body = "M" + n(g) + " " + n(top) + " L" + n(d) + " " + n(top) + " C" + n(d + 2) + " " + n(bottom - h * 0.2) + " " +
        n(d - l * 0.2) + " " + bottom + " " + cx + " " + bottom + " C" + n(g + l * 0.2) + " " + bottom + " " +
        n(g - 2) + " " + n(bottom - h * 0.2) + " " + n(g) + " " + n(top) + " Z";
      handle = "M" + n(d - 4) + " " + n(top + h * 0.18) + " C" + n(d + 22) + " " + n(top + h * 0.18) + " " +
        n(d + 22) + " " + n(top + h * 0.6) + " " + n(d - 10) + " " + n(top + h * 0.62);
    }
    return { body, handle, top, bottom, l, cx, saucer: cup.family !== "mug", family: cup.family };
  }

  // The liquid's surface line for a fraction of the cup, 0 empty, 1 to the brim.
  function levelY(sh, fraction) {
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    return f <= 0 ? sh.bottom + 8 : sh.bottom - (sh.bottom - sh.top - 5) * f;
  }

  function drinkOf(method, milk) {
    return milk ? DRINKS.milk : method === "Brikka" ? DRINKS.brikka : DRINKS.filter;
  }

  /* A gentle wave, wider than any cup, period 55: it slides sideways while
     water is being poured (CSS), and lies still otherwise. */
  const WAVE_TOP = "M-220 0 q13.75 -3 27.5 0" + " t27.5 0".repeat(23);
  const WAVE_BODY = WAVE_TOP + " L440 260 L-220 260 Z";

  /* The whole drawing. `steam` adds the three wisps over the cup, `marks` the
     pour targets as fractions (brew mode). */
  function cupSvg(cup, drink, opts) {
    const sh = shapeOf(cup);
    const o = opts || {};
    const id = "cup-clip-" + (++clipCount);
    const room = o.steam ? 46 : 8;
    const left = sh.cx - sh.l / 2 - 14, width = sh.l + 28 + (sh.handle ? 30 : 0);
    const height = sh.bottom - sh.top + room + (sh.saucer ? 20 : 8);
    const marks = (o.marks || []).filter(f => f > 0 && f < 1).map(f => {
      const y = levelY(sh, f).toFixed(1);
      return '<line class="cup-mark" x1="' + (sh.cx + sh.l * 0.1).toFixed(1) + '" x2="' + (sh.cx + sh.l * 0.36).toFixed(1) +
        '" y1="' + y + '" y2="' + y + '"></line>';
    }).join("");
    const wisps = o.steam
      ? '<g class="cup-steam" transform="translate(' + (sh.cx - 20) + " " + (sh.top - 42).toFixed(1) + ')">' +
        '<path d="M10 34 C4 24 16 18 10 6"></path><path d="M20 34 C14 24 26 18 20 6"></path><path d="M30 34 C24 24 36 18 30 6"></path></g>'
      : "";
    return '<svg class="cup-art cup-' + sh.family + '" viewBox="' + left.toFixed(1) + " " + (sh.top - room).toFixed(1) + " " +
      width.toFixed(1) + " " + height.toFixed(1) + '" aria-hidden="true" focusable="false">' +
      '<defs><clipPath id="' + id + '"><path d="' + sh.body + '"></path></clipPath></defs>' + wisps +
      (sh.handle ? '<path class="cup-handle-edge" d="' + sh.handle + '"></path><path class="cup-handle" d="' + sh.handle + '"></path>' : "") +
      (sh.saucer ? '<ellipse class="cup-saucer" cx="' + sh.cx + '" cy="' + (sh.bottom + 8) + '" rx="' + (sh.l * 0.62).toFixed(1) + '" ry="7"></ellipse>' : "") +
      '<path class="cup-porcelain" d="' + sh.body + '"></path>' +
      '<g clip-path="url(#' + id + ')"><g class="cup-liquid" style="transform: translateY(' + levelY(sh, o.fraction || 0).toFixed(1) + 'px)">' +
      '<g class="cup-wave"><path d="' + WAVE_BODY + '" fill="' + drink.body + '"></path>' +
      '<path d="' + WAVE_TOP + '" fill="none" stroke="' + drink.top + '" stroke-width="' + drink.topW + '"></path></g></g>' +
      marks + "</g>" +
      '<path class="cup-rim" d="' + sh.body + '"></path></svg>';
  }

  // ---------- Q2: the card after saving ----------

  /* What the card says about a saved cup. Read only: the figures come from
     DATA.calcs (ratio), the analysable cups of the same coffee and recipe
     (average, the same rule as the last cup card) and DATA.bagStock (grams
     left, this cup included since it is already saved). */
  function cupSummary(ext) {
    const c = DATA.calcs(ext);
    const rated = v => v !== "" && v !== undefined && v !== null;
    const score = rated(ext.score_10) ? Number(ext.score_10) : null;
    const same = analyzableExts().filter(e => e.id !== ext.id && e.coffee_id === ext.coffee_id &&
      e.recipe === ext.recipe && rated(e.score_10));
    const avg = same.length ? average(same.map(e => Number(e.score_10))) : null;
    const stock = ext.coffee_id ? DATA.bagStock(ext.coffee_id, fallbacks.dose) : null;
    const r = findRecipe(ext.recipe);
    // On the Brikka the water is the boiler's: the in-cup ratio says more, when measured.
    const inCup = ext.method === "Brikka" && !!c.cupRatioText;
    return {
      coffee: c.coffee_name, recipe: ext.recipe || "", method: ext.method || "", dose: ext.dose_g,
      cup: cupOf(ext.cup, ext.method),
      milk: Number(ext.milk_ml) > 0 || !!(r && r.milk),
      ratio: inCup ? c.cupRatioText : c.ratioText, ratioInCup: inCup,
      score, avg, n: same.length,
      diff: score !== null && avg !== null ? Math.round((score - avg) * 10) / 10 : null,
      left: stock ? stock.remaining : null,
    };
  }

  function fact(label, value) {
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + value + "</dd></div>";
  }

  function cardMarkup(s) {
    const facts = [];
    if (s.ratio) facts.push(fact(I18N.t("cup_ratio"), escapeHtml(s.ratio) + (s.ratioInCup ? " <small>" + escapeHtml(I18N.t("cup_in_cup")) + "</small>" : "")));
    facts.push(fact(I18N.t("cup_avg"), s.avg !== null
      ? "<b>" + fmtDecimal(s.avg, 1) + "</b> <small>" + escapeHtml(I18N.t("cup_avg_n", { n: s.n, s: s.n > 1 ? "s" : "" })) + "</small>"
      : escapeHtml(I18N.t("cup_avg_none"))));
    if (s.score === null) facts.push(fact(I18N.t("cup_this"), escapeHtml(I18N.t("not_rated_yet"))));
    else if (s.diff !== null) {
      const abs = fmtDecimal(Math.abs(s.diff), 1);
      facts.push(fact(I18N.t("cup_this"), escapeHtml(Math.abs(s.diff) < 0.05 ? I18N.t("cup_diff_same")
        : I18N.t(s.diff > 0 ? "cup_diff_up" : "cup_diff_down", { d: abs }))));
    }
    if (s.left !== null) {
      facts.push(fact(I18N.t("cup_left"), s.left > 0
        ? "<b>" + Math.round(s.left) + " g</b>" : escapeHtml(I18N.t("cup_bag_empty"))));
    }
    const sub = [I18N.tr(s.recipe), s.dose ? fmtDecimal(Number(s.dose), 1) + " g" : ""].filter(Boolean).join(" · ");
    return '<button type="button" class="cc-close" aria-label="' + escapeHtml(I18N.t("cup_close")) + '">' + icon("croix") + "</button>" +
      '<div class="cc-art">' + cupSvg(s.cup, drinkOf(s.method, s.milk), { steam: true, fraction: 0 }) +
      (s.score !== null ? '<span class="cc-stamp">' + fmtDecimal(s.score, 1) + "</span>" : "") + "</div>" +
      '<div class="cc-head"><p class="cc-kicker">' + escapeHtml(I18N.t("cup_saved")) + "</p>" +
      '<p class="cc-name">' + escapeHtml(I18N.tr(s.coffee)) + "</p>" +
      (sub ? '<p class="cc-sub">' + escapeHtml(sub) + "</p>" : "") + "</div>" +
      '<dl class="cc-facts">' + facts.join("") + "</dl>";
  }

  // How long the card stays once the score has landed: the whole card lives about 2.5 s.
  const SHOWN_MS = 1600;
  const card = { timers: [], wired: false };

  function clearTimers() { card.timers.forEach(clearTimeout); card.timers = []; }

  function hideCupCard() {
    const host = $("#cup-card");
    clearTimers();
    if (!host || host.hidden) return;
    host.classList.add("cc-out");
    card.timers.push(setTimeout(() => { host.hidden = true; host.classList.remove("cc-out"); }, reducedMotion() ? 0 : 260));
  }

  function scheduleHide(delay) {
    clearTimers();
    card.timers.push(setTimeout(hideCupCard, delay));
  }

  /* The card lets every tap through to the page under it (CSS): it never
     stands in the way of the next gesture. Only its cross takes a tap. */
  function wireCard(host) {
    if (card.wired) return;
    card.wired = true;
    host.addEventListener("click", ev => { if (ev.target.closest && ev.target.closest(".cc-close")) hideCupCard(); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !host.hidden) hideCupCard(); });
  }

  /* Shows the card for a cup just saved. The fill, the steam and the stamp
     are classes set one after the other; reduced motion gets the final
     picture at once. */
  function showCupCard(ext) {
    const host = $("#cup-card");
    if (!host || !ext) return;
    wireCard(host);
    clearTimers();
    const s = cupSummary(ext);
    host.classList.remove("cc-out", "cc-filled", "cc-stamped");
    host.innerHTML = cardMarkup(s);
    host.setAttribute("aria-label", I18N.t("cup_saved"));
    host.hidden = false;
    const liquid = host.querySelector(".cup-liquid");
    const sh = shapeOf(s.cup);
    const fill = () => {
      host.classList.add("cc-filled");
      if (liquid) liquid.style.transform = "translateY(" + levelY(sh, CARD_LEVEL).toFixed(1) + "px)";
    };
    if (reducedMotion()) {
      fill();
      host.classList.add("cc-stamped");
      scheduleHide(SHOWN_MS + 900);
      return;
    }
    // One layout read so the empty cup is painted before it starts filling.
    host.getBoundingClientRect();
    card.timers.push(setTimeout(fill, 120));
    card.timers.push(setTimeout(() => host.classList.add("cc-stamped"), 900));
    card.timers.push(setTimeout(hideCupCard, 900 + SHOWN_MS));
  }

  // ---------- J2: the cup of the brew mode ----------

  /* Paints the brew mode's cup in its host: built once per cup, machine and
     set of pour marks, then only the liquid moves, by a CSS transition. While
     brewing it holds coffee only: the milk of a milk recipe comes after. */
  function paintBrewCup(host, o) {
    if (!host) return;
    const cup = cupOf(o.cup, o.method);
    const marks = o.marks || [];
    const key = [cup.name, cup.ml, cup.family, o.method, marks.map(m => m.toFixed(3)).join(",")].join("|");
    const sh = shapeOf(cup);
    if (host.dataset.cupKey !== key) {
      host.innerHTML = cupSvg(cup, drinkOf(o.method, false), { marks, fraction: o.fraction });
      host.dataset.cupKey = key;
    }
    const liquid = host.querySelector(".cup-liquid");
    if (liquid) liquid.style.transform = "translateY(" + levelY(sh, o.fraction).toFixed(1) + "px)";
    host.classList.toggle("cup-pouring", !!o.running && o.fraction < 1 && !reducedMotion());
  }

  Object.assign(UI, {
    cupOf, cupSummary, showCupCard, hideCupCard, paintBrewCup,
  });
})();
