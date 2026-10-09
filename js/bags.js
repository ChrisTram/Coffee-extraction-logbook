/* THE BAGS, WITHOUT THE DOM (v9.18, O2, Q9 and B1).
 *
 * What « Mes cafés », the entry's jars, the end of a bag and the « Prochaine
 * tasse » card decide, as pure functions: the screens only draw what comes
 * out of here, and tools/stock.test.mjs checks it without a browser.
 *
 *   - shelfOf / shelves: the three rows of the shelf (open, to buy again,
 *     finished) and their order;
 *   - entryJars: the open bags offered at the top of the entry form, the most
 *     advanced first;
 *   - entryChoices: the entry's menu, the spent bags set apart at its end;
 *   - isSpent: less than one dose left, the moment a bag ends;
 *   - resumeCup: the cup a new bag picks up from (the last one of the bag
 *     before);
 *   - nextCup: B1, the next setting from the cups of a coffee: keep what
 *     worked, change one thing;
 *   - dialFrames: the notches a turning dial goes through.
 *   - daysBetween, cupsLeft, pace, finishDay, stockTotals, monthSpend,
 *     cupCost (v9.31): the figures around the jars of « Mes cafés ».
 *
 * Nothing is stored and nothing new is computed about a bag: the grams come
 * from DATA.bagGauge, the correction steps from TUNING.quantifiedCorrection. */
"use strict";

const BAGS = (() => {

  const num = v => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  const rated = e => !!e && e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null && num(e.score_10) !== null;
  const failed = e => Number(e && e.failed) === 1;
  const newestFirst = (a, b) => String(b.date_time || "").localeCompare(String(a.date_time || ""));

  /* LESS THAN ONE DOSE LEFT: the next cup does not fit in this bag, so the
     bag is over. Without a usual dose, only an empty bag is. `gauge` is
     DATA.bagGauge. */
  function isSpent(gauge) {
    if (!gauge) return false;
    return gauge.dose > 0 ? gauge.grams < gauge.dose : gauge.grams <= 0;
  }

  /* Where a coffee stands on the shelf. Archived: finished, whatever its
     bag says. Active with a spent bag: to buy again. Everything else is open,
     a coffee whose bag size nobody knows included: it is still in the
     cupboard. */
  function shelfOf(coffee, gauge) {
    if (!coffee || Number(coffee.active) === 0) return "done";
    return isSpent(gauge) ? "rebuy" : "open";
  }

  // The share of the bag still there; unknown sizes sort after every known one.
  const share = g => (g && g.bag > 0 ? Math.max(0, g.grams) / g.bag : Infinity);
  const byName = (a, b) => String(a.coffee.name || "").localeCompare(String(b.coffee.name || ""));
  const dayOf = it => (num(it.day) === null ? -1 : num(it.day));
  // The most advanced bag first, the oldest opening on a tie, then the name.
  const byAdvance = (a, b) => share(a.gauge) - share(b.gauge) || dayOf(b) - dayOf(a) || byName(a, b);

  /* The three rows. Each item is { coffee, gauge, day, lastCup } (day: days
     since the bag was opened, null when unknown; lastCup: date_time of the
     coffee's latest cup). Open: the most advanced bag first. To buy again
     and finished: the most recently drunk first, where the memory is
     freshest. */
  function shelves(items) {
    const rows = { open: [], rebuy: [], done: [] };
    (items || []).forEach(it => rows[shelfOf(it.coffee, it.gauge)].push(it));
    rows.open.sort(byAdvance);
    const recent = (a, b) => String(b.lastCup || "").localeCompare(String(a.lastCup || "")) || byName(a, b);
    rows.rebuy.sort(recent);
    rows.done.sort(recent);
    return rows;
  }

  /* THE ENTRY'S JARS (M1 in O2). The open bags of the coffees the entry
     form offers (active ones), the most advanced first: that is the bag to
     finish. Since v9.25 a spent bag (below one dose) is no longer offered:
     it is on the « À racheter » shelf, and the menu keeps it at its end,
     marked (entryChoices). At most `max`. */
  function entryJars(items, max) {
    return (items || []).filter(it => it.coffee && Number(it.coffee.active) !== 0 && it.gauge && it.gauge.grams > 0 && !isSpent(it.gauge))
      .sort(byAdvance).slice(0, max || 6);
  }

  /* THE ENTRY'S MENU (v9.25). The active coffees in their own order, those
     whose bag is spent set apart at the end: still reachable (the very last
     cup of a bag is logged after it), never offered first. A coffee whose
     bag size nobody knows is not spent. */
  function entryChoices(items) {
    const live = [], spent = [];
    (items || []).forEach(it => {
      if (!it || !it.coffee || Number(it.coffee.active) === 0) return;
      (isSpent(it.gauge) ? spent : live).push(it.coffee);
    });
    return { live: live, spent: spent };
  }

  /* WHERE THE LAST BAG STOPPED (Q9): the most recent cup of the coffee that
     was not botched. It is a reading of the past, offered once when a new
     bag is poured; nothing about it is stored. */
  function resumeCup(extractions, coffeeId) {
    return (extractions || []).filter(e => e.coffee_id === coffeeId && !failed(e)).sort(newestFirst)[0] || null;
  }

  /* The cups of a bag: those whose bag at their date is this one. `bagOf`
     is DATA.bagAtDate. Returns { n, average } over the rated ones too. */
  function bagCups(extractions, coffeeId, bagId, bagOf) {
    const own = (extractions || []).filter(e => e.coffee_id === coffeeId && (!bagId || (bagOf(coffeeId, e.date_time) || {}).id === bagId));
    const scores = own.filter(rated).map(e => num(e.score_10));
    return { n: own.length, rated: scores.length, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  }

  /* ---------- B1, the next cup ---------- */

  /* The setting a lock is about: the levers of the winning setting
     (TUNING.signature: recipe, grind, heat, preheating) and, on the Switch,
     the water temperature to the degree, the one lever the Switch adds. */
  function lockKey(e) {
    return TUNING.signature(e) + "|" + (e.method === "Switch" && num(e.temperature_c) !== null ? Math.round(num(e.temperature_c)) : "");
  }

  /* THE NEXT CUP, from history alone (B1). `cups`: the analysable cups of ONE
     coffee (botched ones already out). `opts`: { steps (the correction steps
     of Settings), ground (pre-ground coffee), threshold (Chris's average over
     all his rated cups) }.

     On the machine of the latest rated cup, in this order:
       1. LOCKED: two cups above his average share one setting. Keep it.
       2. FIX: the latest cup carries a diagnostic the correction knows how to
          quantify. Keep its setting and change ONE thing, the first lever
          TUNING.quantifiedCorrection proposes: the grind first, then the
          temperature (or the flame), then the ratio.
       3. CONFIRM: the latest cup is at or above this coffee's average with
          nothing to fix. The same setting again, to confirm it.
       4. BACK: the latest cup fell below with nothing to say why. Back to the
          setting of the best cup.
     Returns { kind, base, change, n, average, locked } or null without a
     rated cup. `base` is the cup to brew from, `change` the lever moved
     (null when nothing moves), `n` the rated cups it reads. */
  function nextCup(cups, opts) {
    const o = opts || {};
    const all = (cups || []).filter(rated).filter(e => !failed(e)).sort(newestFirst);
    if (!all.length) return null;
    const method = all[0].method;
    const list = all.filter(e => e.method === method);
    const scores = list.map(e => num(e.score_10));
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const threshold = num(o.threshold) !== null ? num(o.threshold) : average;
    const byScore = (a, b) => num(b.score_10) - num(a.score_10) || newestFirst(a, b);

    const groups = new Map();
    list.filter(e => num(e.score_10) > threshold).forEach(e => {
      const k = lockKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    const locks = [...groups.values()].filter(g => g.length >= 2).map(g => ({
      cups: g, mean: g.reduce((s, e) => s + num(e.score_10), 0) / g.length, latest: g.slice().sort(newestFirst)[0],
    })).sort((a, b) => b.mean - a.mean || newestFirst(a.latest, b.latest));
    const base = { n: list.length, average, method, threshold };
    if (locks.length) {
      return { ...base, kind: "locked", base: locks[0].cups.slice().sort(byScore)[0], change: null, locked: true, lockN: locks[0].cups.length };
    }
    const last = list[0];
    const levers = typeof TUNING !== "undefined" ? TUNING.quantifiedCorrection(last, o.steps, !!o.ground) : [];
    if (levers.length) return { ...base, kind: "fix", base: last, change: levers[0], locked: false };
    if (num(last.score_10) >= average - 1e-9) return { ...base, kind: "confirm", base: last, change: null, locked: false };
    return { ...base, kind: "back", base: list.slice().sort(byScore)[0], change: null, locked: false };
  }

  /* The cup the entry receives: the base, with the one lever moved. */
  function nextCupSettings(next) {
    if (!next || !next.base) return null;
    return next.change ? { ...next.base, [next.change.field]: next.change.to } : { ...next.base };
  }

  /* ---------- The dial that turns ---------- */

  /* The positions, in clicks, a dial goes through from one setting to
     another: every notch when it is close, bigger strides when it is far, so
     the whole turn fits in about `budgetMs` with frames of at least `minMs`.
     The last frame is always the target. */
  function dialFrames(fromClicks, toClicks, budgetMs, minMs) {
    const a = Math.round(Number(fromClicks)), b = Math.round(Number(toClicks));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [];
    const dist = Math.abs(b - a), dir = Math.sign(b - a);
    const most = Math.max(1, Math.floor((budgetMs || 520) / (minMs || 26)));
    const stride = Math.max(1, Math.ceil(dist / most));
    const frames = [];
    for (let c = a + dir * stride; dir > 0 ? c < b : c > b; c += dir * stride) frames.push(c);
    frames.push(b);
    return frames;
  }

  /* ---------- The shelf's figures (v9.31) ---------- */

  /* Days count on the calendar, not in hours: « 2026-10-09T23:50 » and
     « 2026-10-10T00:10 » are one day apart. A day is "YYYY-MM-DD", or the
     start of a date_time. */
  const DAY_MS = 86400000;
  function dayNumber(s) {
    const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number);
    return y && m && d ? Math.round(Date.UTC(y, m - 1, d) / DAY_MS) : null;
  }
  const dayString = n => new Date(n * DAY_MS).toISOString().slice(0, 10);
  // From day a to day b, in whole days (negative when b comes first); null when one is unknown.
  function daysBetween(a, b) {
    const x = dayNumber(a), y = dayNumber(b);
    return x === null || y === null ? null : y - x;
  }

  // The cups still in the jar at the usual dose, rounded down: a half cup is not a cup.
  function cupsLeft(grams, dose) {
    const g = num(grams), d = num(dose);
    return g !== null && d !== null && d > 0 && g > 0 ? Math.floor(g / d + 1e-9) : 0;
  }

  /* THE PACE OF A BAG: the grams it gives per day, over its last `windowDays`
     days (21 by default), or since its opening when that is closer. `cups`:
     { date_time, grams } of this bag. At least two cups in the window,
     otherwise there is no pace yet, only a cup. Returns { perDay, cups,
     days } or null; a bag left aside for weeks has none either. */
  function pace(cups, since, today, windowDays) {
    const t = dayNumber(today);
    if (t === null) return null;
    const s = dayNumber(since);
    const from = Math.max(s === null ? -Infinity : s, t - (windowDays || 21) + 1);
    const inside = (cups || []).filter(c => { const d = dayNumber(c && c.date_time); return d !== null && d >= from && d <= t; });
    if (inside.length < 2) return null;
    const start = Number.isFinite(from) ? from : Math.min(...inside.map(c => dayNumber(c.date_time)));
    const days = t - start + 1;
    const grams = inside.reduce((a, c) => a + (num(c.grams) || 0), 0);
    return grams > 0 ? { perDay: grams / days, cups: inside.length, days: days } : null;
  }

  /* When the jar will be empty at that pace: the day, "YYYY-MM-DD". Today
     when it already is; null without a pace. */
  function finishDay(grams, perDay, today) {
    const t = dayNumber(today), g = num(grams), p = num(perDay);
    if (t === null || p === null || !(p > 0)) return null;
    return dayString(t + (g === null || g <= 0 ? 0 : Math.ceil(g / p - 1e-9)));
  }

  /* What is in the cupboard: the grams of every bag known to the gram and
     the cups they make, each at its coffee's usual dose. `items`: the
     shelf's items ({ gauge }). */
  function stockTotals(items) {
    return (items || []).reduce((t, it) => {
      const g = it && it.gauge;
      if (!g) return t;
      return { grams: t.grams + Math.max(0, num(g.grams) || 0), cups: t.cups + cupsLeft(g.grams, g.dose), bags: t.bags + 1 };
    }, { grams: 0, cups: 0, bags: 0 });
  }

  /* The month's coffee money: the bags bought in the month of `today`, those
     with a price summed. Returns { total, bags, priced }. */
  function monthSpend(purchases, today) {
    const month = String(today || "").slice(0, 7);
    const mine = (purchases || []).filter(p => month.length === 7 && String(p.purchase_date || "").slice(0, 7) === month);
    const priced = mine.filter(p => num(p.price_vnd) > 0);
    return { total: priced.reduce((a, p) => a + num(p.price_vnd), 0), bags: mine.length, priced: priced.length };
  }

  /* THE PRICE OF A CUP, on average: each cup at the price per gram of its
     own bag times its dose. `cups`: { grams, price, size }; a cup whose bag
     has no price or size is left out, never counted free. Null without any. */
  function cupCost(cups) {
    const known = (cups || []).filter(c => num(c.grams) > 0 && num(c.price) > 0 && num(c.size) > 0);
    return known.length ? known.reduce((a, c) => a + num(c.price) / num(c.size) * num(c.grams), 0) / known.length : null;
  }

  return { isSpent, shelfOf, shelves, entryJars, entryChoices, resumeCup, bagCups, lockKey, nextCup, nextCupSettings, dialFrames,
    daysBetween, cupsLeft, pace, finishDay, stockTotals, monthSpend, cupCost };
})();
