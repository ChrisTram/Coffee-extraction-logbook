/* COMPARE (v9.20, O5): what separates two cups, as facts and as one sentence.
 *
 * The comparison window used to align two columns and leave the reading to
 * Chris. This file reads them for him, with RULES and nothing else: the grind
 * in clicks of the C5 (8.32 µm each, GRIND), the water, the heat, the ratio,
 * the total time against the window of the recipe (its « total 2:00 à 2:30 »),
 * the defects of the diagnosis that left or came, and the score. It knows
 * neither the DOM nor DATA: the page (js/ui-compare.js) hands it two cups
 * with their calculations and a way to find a recipe, and turns the keys it
 * returns into words through I18N. That is what lets tools/journal.test.mjs
 * check every rule, and the sentence itself, without a browser.
 *
 * A is always the older cup, B the newer: the sentence tells what changed
 * from A to B, the way Chris corrects from one cup to the next. */
"use strict";

const COMPARE = (() => {

  // A grind change of this many clicks or less is « un peu ».
  const LITTLE_CLICKS = 2;
  // Degrees: one is a change, two or less is « un peu ».
  const LITTLE_DEGREES = 2;
  // The ratio (water over dose) has to move this much to be named.
  const RATIO_STEP = 0.5;
  // A score gap under this is « the same score ».
  const SCORE_STEP = 0.5;
  // A single time (« environ 3:30 ») becomes a window this wide on each side.
  const ABOUT_S = 15;
  // The bag has to be this many days older to be named.
  const BAG_DAYS = 7;

  const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const secondsOf = t => { const m = /^(\d+):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

  /* The TOTAL time window of a recipe, in seconds, read in its « total »
     text: « total 2:45 à 3:15 », « total environ 3:30 » (a quarter of a
     minute each side), « total environ 2:30 à 3:00, au plus tard 3:30 » (the
     first two). A recipe edited by hand may say anything: no window then. */
  function timeWindow(text) {
    const s = String(text || "");
    const times = (s.match(/\d+:\d{2}/g) || []).map(secondsOf).filter(v => v !== null);
    if (!times.length) return null;
    if (times.length >= 2 && times[1] > times[0]) return { from: times[0], to: times[1] };
    return /environ|about|≈/i.test(s) || times.length === 1 ? { from: times[0] - ABOUT_S, to: times[0] + ABOUT_S } : null;
  }

  /* The DRAWDOWN window of a Brikka recipe: « écoulement de 20 à 45
     secondes ». The Brikka has no total time window, its flow is the target. */
  function flowWindow(text) {
    const m = /(?:écoulement|flow)[^\d]*(\d+)\s*(?:à|to|-)\s*(\d+)\s*(?:secondes|seconds|s\b)/i.exec(String(text || ""));
    return m && Number(m[2]) > Number(m[1]) ? { from: Number(m[1]), to: Number(m[2]) } : null;
  }

  // Where a time falls against a window: "inside", "short", "long", or null.
  function windowState(seconds, win) {
    const v = num(seconds);
    if (v === null || !win) return null;
    return v < win.from ? "short" : v > win.to ? "long" : "inside";
  }

  /* The DEFECTS a diagnosis names, by family, with their weight: 1 for an
     « un peu », 2 for a clear-cut one. « Équilibré » and the others name none. */
  const DEFECTS = {
    "Un peu amer": ["bitter", 1], "Sur-extrait (amer)": ["bitter", 2],
    "Un peu acide": ["sour", 1], "Sous-extrait (acide)": ["sour", 2],
    "Un peu astringent": ["astringent", 1], "Astringent": ["astringent", 2],
    "Un peu léger": ["light", 1], "Trop léger (aqueux)": ["light", 2],
    "Un peu concentré": ["strong", 1], "Trop fort (concentré)": ["strong", 2],
    "Un peu éventé": ["stale", 1], "Creux, plat (café éventé)": ["stale", 2],
    "Un peu brûlé": ["burnt", 1], "Brûlé (défaut du sachet)": ["burnt", 2],
    "Acide ET amer (extraction inégale)": ["uneven", 2],
  };
  // The order they are told in: the ones a setting fixes first.
  const DEFECT_ORDER = ["bitter", "sour", "astringent", "uneven", "light", "strong", "burnt", "stale"];
  function defects(diagnostic) {
    const out = {};
    String(diagnostic || "").split("|").filter(Boolean).forEach(d => {
      const x = DEFECTS[d];
      if (x) out[x[0]] = Math.max(out[x[0]] || 0, x[1]);
    });
    return out;
  }
  const tagsOf = e => String((e && e.descriptors) || "").split("|").filter(Boolean);

  /* EVERYTHING that differs between a and b, as plain values. `recipeOf`
     finds a recipe by its name (it may return nothing). The cups carry their
     calculations in `_c`, as UI.extsWithCalcs() gives them. */
  function facts(a, b, recipeOf) {
    const find = typeof recipeOf === "function" ? recipeOf : () => null;
    const ca = a._c || {}, cb = b._c || {};
    const sameMethod = a.method === b.method;
    const recipeA = find(a.recipe) || null, recipeB = find(b.recipe) || null;
    const f = {
      sameCoffee: a.coffee_id === b.coffee_id,
      sameRecipe: (a.recipe || "") === (b.recipe || ""),
      sameMethod,
      method: sameMethod ? a.method : null,
      recipeA, recipeB,
    };

    const da = typeof GRIND !== "undefined" ? GRIND.parseDial(String(a.grind_dial || "")) : null;
    const db = typeof GRIND !== "undefined" ? GRIND.parseDial(String(b.grind_dial || "")) : null;
    f.grind = da && db ? { from: a.grind_dial, to: b.grind_dial, clicks: db.clicks - da.clicks,
      microns: Math.round((db.clicks - da.clicks) * GRIND.MICRONS_PER_CLICK) } : null;

    const pair = key => {
      const x = num(a[key]), y = num(b[key]);
      return x === null && y === null ? null : { from: x, to: y, delta: x !== null && y !== null ? y - x : null };
    };
    f.dose = pair("dose_g");
    f.water = pair("water_g");
    f.temp = sameMethod && a.method === "Brikka" ? null : pair("temperature_c");
    f.heat = sameMethod && a.method === "Brikka" ? pair("heat_level") : null;
    // Not stirring is stirring zero times: starting to stir is a change.
    const stirs = e => (e.method === "Switch" ? num(e.stir_count) || 0 : null);
    f.stir = sameMethod && a.method === "Switch" && stirs(a) !== stirs(b) ? { from: stirs(a), to: stirs(b), delta: stirs(b) - stirs(a) } : null;
    const ra = num(ca.ratio), rb = num(cb.ratio);
    f.ratio = ra !== null && rb !== null ? { from: ra, to: rb, delta: rb - ra, fromText: ca.ratioText, toText: cb.ratioText } : null;
    const pa = Number(a.preheated_water) === 1, pb = Number(b.preheated_water) === 1;
    f.preheat = sameMethod && a.method === "Brikka" && pa !== pb ? { from: pa, to: pb } : null;

    // The times, each against its own recipe's window.
    const winA = timeWindow(recipeA && recipeA.totalText), winB = timeWindow(recipeB && recipeB.totalText);
    f.time = pair("total_time_s");
    if (f.time) Object.assign(f.time, { winA, winB, stateA: windowState(a.total_time_s, winA), stateB: windowState(b.total_time_s, winB) });
    const flowA = flowWindow(recipeA && recipeA.totalText), flowB = flowWindow(recipeB && recipeB.totalText);
    f.flow = pair("flow_time_s");
    if (f.flow) Object.assign(f.flow, { winA: flowA, winB: flowB, stateA: windowState(a.flow_time_s, flowA), stateB: windowState(b.flow_time_s, flowB) });

    // What the tasting said: the defects that left, those that came, the tastes gained.
    const defA = defects(a.diagnostic), defB = defects(b.diagnostic);
    f.gone = DEFECT_ORDER.filter(k => defA[k] && !defB[k]);
    f.came = DEFECT_ORDER.filter(k => defB[k] && !defA[k]);
    f.eased = DEFECT_ORDER.filter(k => defA[k] && defB[k] && defB[k] < defA[k]);
    f.worsened = DEFECT_ORDER.filter(k => defA[k] && defB[k] && defB[k] > defA[k]);
    const tagsA = tagsOf(a), tagsB = tagsOf(b);
    f.gained = tagsB.filter(t => !tagsA.includes(t));
    f.lost = tagsA.filter(t => !tagsB.includes(t));

    f.score = pair("score_10");
    f.better = f.score && f.score.delta !== null && Math.abs(f.score.delta) >= SCORE_STEP ? (f.score.delta > 0 ? "b" : "a") : null;
    const oa = num(ca.days_open), ob = num(cb.days_open);
    f.bagDays = f.sameCoffee && oa !== null && ob !== null && Math.abs(ob - oa) >= BAG_DAYS ? ob - oa : null;
    return f;
  }

  /* WHAT CHANGED IN THE SETTINGS, as keys with their values, in the order
     they are told: grind first, the lever Chris touches least and that
     weighs most, then the water, the heat, the ratio, the dose, the rest. */
  function settingsWords(f) {
    const words = [];
    if (!f.sameMethod) return words;
    if (f.grind && f.grind.clicks) {
      const little = Math.abs(f.grind.clicks) <= LITTLE_CLICKS;
      words.push({ key: (f.grind.clicks > 0 ? "cmp_coarser" : "cmp_finer") + (little ? "_little" : "") });
    }
    if (f.temp && f.temp.delta) {
      const little = Math.abs(f.temp.delta) <= LITTLE_DEGREES;
      words.push({ key: (f.temp.delta > 0 ? "cmp_hotter" : "cmp_cooler") + (little ? "_little" : "") });
    }
    if (f.heat && f.heat.delta) words.push({ key: f.heat.delta > 0 ? "cmp_heat_up" : "cmp_heat_down" });
    if (f.preheat) words.push({ key: f.preheat.to ? "cmp_preheat_on" : "cmp_preheat_off" });
    const ratioMoved = f.ratio && Math.abs(f.ratio.delta) >= RATIO_STEP;
    if (ratioMoved) words.push({ key: f.ratio.delta > 0 ? "cmp_wider" : "cmp_tighter" });
    else if (f.dose && f.dose.delta && Math.abs(f.dose.delta) >= 0.5) words.push({ key: f.dose.delta > 0 ? "cmp_more_coffee" : "cmp_less_coffee" });
    if (f.stir && f.stir.delta) words.push({ key: f.stir.delta > 0 ? "cmp_more_stir" : "cmp_less_stir" });
    return words;
  }

  /* WHAT CAME OF IT: the defects of A that left, those B took on, else the
     tastes gained, then the score. Keys with their values. */
  function outcomeWords(f) {
    const out = [];
    f.gone.forEach(k => out.push({ key: "cmp_gone_" + k }));
    f.eased.forEach(k => out.push({ key: "cmp_eased_" + k }));
    f.came.forEach(k => out.push({ key: "cmp_came_" + k }));
    f.worsened.forEach(k => out.push({ key: "cmp_came_" + k }));
    if (!out.length && f.gained.length && f.better !== "a") out.push({ key: "cmp_gained", tags: f.gained.slice(0, 2) });
    if (f.better) out.push({ key: f.better === "b" ? "cmp_score_better" : "cmp_score_worse", x: Math.abs(f.score.delta) });
    else if (f.score && f.score.delta !== null && !out.length) out.push({ key: "cmp_score_same" });
    return out;
  }

  /* The time, against the recipe: back inside its window, out of it, or
     still out on the same side. The Brikka reads its drawdown instead. */
  function timeWords(f) {
    const t = f.method === "Brikka" ? f.flow : f.time;
    if (!t || t.stateA === null || t.stateB === null) return null;
    const flow = f.method === "Brikka" ? "_flow" : "";
    const win = t.winB || t.winA;
    if (t.stateA !== "inside" && t.stateB === "inside") return { key: "cmp_time_back" + flow, win };
    if (t.stateA === "inside" && t.stateB !== "inside") return { key: "cmp_time_out_" + t.stateB + flow, win };
    if (t.stateA !== "inside" && t.stateA === t.stateB && f.sameRecipe) return { key: "cmp_time_still_" + t.stateB + flow, win };
    return null;
  }

  /* THE SENTENCE. `t(key, vars)` is I18N.t, `fmt` formats a decimal and a
     tag. One to three sentences: the context when the two cups are not alike
     (two machines, two coffees, two recipes), then « settings : outcome »,
     then the time against the recipe, then the bag when it aged. */
  function verdict(f, t, fmt) {
    const format = fmt || {};
    const dec = format.decimal || (n => String(Math.round(n * 10) / 10).replace(".", ","));
    const tag = format.tag || (x => x);
    const dur = format.duration || (s => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"));
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const list = parts => (parts.length <= 1 ? parts.join("") : parts.slice(0, -1).join(", ") + t("cmp_and") + parts[parts.length - 1]);
    const say = w => w.key === "cmp_gained" ? t(w.key, { t: list(w.tags.map(tag)) })
      : w.x !== undefined ? t(w.key, { x: dec(w.x) }) : t(w.key);
    const sentences = [];
    if (!f.sameMethod) sentences.push(t("cmp_ctx_methods"));
    else if (!f.sameCoffee) sentences.push(t("cmp_ctx_coffees"));
    else if (!f.sameRecipe && f.recipeA && f.recipeB) sentences.push(t("cmp_ctx_recipes"));
    const settings = settingsWords(f).map(say);
    const outcome = outcomeWords(f).map(say);
    const left = settings.length ? cap(list(settings)) : f.sameMethod ? t("cmp_same_settings") : "";
    const right = outcome.length ? outcome.join(", ") : t("cmp_no_verdict");
    sentences.push(left ? left + t("cmp_colon") + right + "." : cap(right) + ".");
    const time = timeWords(f);
    if (time) sentences.push(cap(t(time.key, { w: time.win ? dur(time.win.from) + t("cmp_to") + dur(time.win.to) : "" })) + ".");
    if (f.bagDays !== null && f.bagDays > 0 && f.better === "a") sentences.push(t("cmp_bag_older", { n: f.bagDays }));
    return sentences.join(" ");
  }

  return {
    LITTLE_CLICKS, LITTLE_DEGREES, RATIO_STEP, SCORE_STEP, ABOUT_S, BAG_DAYS, DEFECT_ORDER,
    timeWindow, flowWindow, windowState, defects, facts, settingsWords, outcomeWords, timeWords, verdict,
  };
})();
