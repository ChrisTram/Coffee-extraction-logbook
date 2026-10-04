/* MILESTONES (v9.23, R9): the streaks and the milestones of the logbook.
 *
 * Pure, like js/compare.js: it knows neither the DOM nor DATA. The interface
 * (js/ui-celebrate.js) hands it the cups, and turns what it returns into
 * words through I18N: the streak on the home's week line, the burst of beans
 * after « Enregistrer », the tile of Analyses. tools/moments.test.mjs checks
 * every rule without a browser.
 *
 * A STREAK is a run of consecutive local days with at least one cup. The
 * current one counts up to today, or up to yesterday while today has no cup
 * yet: at eight in the morning, before the first coffee, it must not fall to
 * zero (the calendar's rule, DECISIONS.md).
 *
 * THE MILESTONES, chosen to stay rare: the 10th, 50th, 100th, 250th, 500th
 * and 1000th cup; the 5th, 10th and 25th different coffee; the first 9 or
 * more, the first 10; a record streak (a run longer than every run before
 * it, from a week on, once per run); the first cup of a new recipe (not the
 * very first cup of the logbook, whose recipe is always new). Each one has
 * a stable id, its day and the cup that crossed it.
 *
 * WHAT A SAVE CROSSES is the difference between the milestones without the
 * saved cup and with it. Nothing else celebrates: a sync or an import that
 * brings old cups never goes through a save, so it never fires a burst. */
"use strict";

const MILESTONES = (() => {

  const CUPS = [10, 50, 100, 250, 500, 1000];
  const COFFEES = [5, 10, 25];
  // A record streak is a milestone from a week on: shorter runs come and go.
  const STREAK_MIN = 7;
  // Which milestone leads when several come with the same cup.
  const RANK = { cups: 0, score10: 1, score9: 2, streak: 3, coffees: 4, recipe: 5 };

  const dayOf = dt => String(dt || "").slice(0, 10);
  const pad = n => String(n).padStart(2, "0");
  const keyOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  // A local day key moved by k days, at noon so a change of hour never skips one.
  function shiftDay(key, k) {
    const d = new Date(key + "T12:00");
    d.setDate(d.getDate() + k);
    return keyOf(d);
  }
  const isRated = e => e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null && Number.isFinite(Number(e.score_10));
  const isFailed = e => Number(e.failed) === 1;

  // The dated cups, oldest first; two cups of the same minute keep their id order.
  function chronological(exts) {
    return (exts || []).filter(e => e && /^\d{4}-\d{2}-\d{2}/.test(String(e.date_time || "")))
      .sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)) ||
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }

  // The runs of consecutive days, oldest first: { from, to, len }.
  function runsOf(list) {
    const runs = [];
    [...new Set(list.map(e => dayOf(e.date_time)))].sort().forEach(k => {
      const last = runs[runs.length - 1];
      if (last && shiftDay(last.to, 1) === k) { last.to = k; last.len += 1; }
      else runs.push({ from: k, to: k, len: 1 });
    });
    return runs;
  }

  /* The current streak and the best one. A cup dated after today has not
     happened yet: it counts for neither. `today` says whether today already
     has its cup (the week line dims the streak until it does). */
  function streaks(exts, now) {
    const today = keyOf(now ? new Date(now) : new Date());
    const runs = runsOf(chronological(exts).filter(e => dayOf(e.date_time) <= today));
    const last = runs[runs.length - 1];
    const alive = last && (last.to === today || last.to === shiftDay(today, -1)) ? last : null;
    // On a tie, the latest run is the best one: the one you remember.
    const best = runs.reduce((m, r) => (!m || r.len >= m.len ? r : m), null);
    return {
      current: alive ? alive.len : 0, from: alive ? alive.from : null, today: !!last && last.to === today,
      best: best ? best.len : 0, bestFrom: best ? best.from : null, bestTo: best ? best.to : null,
    };
  }

  /* Every milestone reached, by day (the most telling first on the same day). */
  function compute(exts) {
    const list = chronological(exts);
    const out = [];
    const at = (e, extra) => Object.assign({ date: dayOf(e.date_time), cupId: e.id }, extra);
    CUPS.forEach(n => { if (list.length >= n) out.push(at(list[n - 1], { id: "cups-" + n, kind: "cups", n: n })); });
    const coffees = new Set(), firsts = [], recipes = new Set();
    let first9 = null, first10 = null;
    list.forEach((e, i) => {
      if (e.coffee_id && !coffees.has(e.coffee_id)) { coffees.add(e.coffee_id); firsts.push(e); }
      if (e.recipe && !recipes.has(e.recipe)) {
        recipes.add(e.recipe);
        if (i > 0) out.push(at(e, { id: "recipe-" + e.recipe, kind: "recipe", recipe: e.recipe }));
      }
      // A botched cup advises nothing (analyzableExts): its score is no milestone.
      if (!isFailed(e) && isRated(e)) {
        const s = Number(e.score_10);
        if (s >= 9 && !first9) first9 = e;
        if (s >= 10 && !first10) first10 = e;
      }
    });
    COFFEES.forEach(n => { if (firsts.length >= n) out.push(at(firsts[n - 1], { id: "coffees-" + n, kind: "coffees", n: n })); });
    // A first 10 that is also the first 9 is one milestone, the 10.
    if (first9 && first9 !== first10) out.push(at(first9, { id: "score-9", kind: "score9", score: Number(first9.score_10) }));
    if (first10) out.push(at(first10, { id: "score-10", kind: "score10", score: 10 }));
    /* A record streak: the day a run goes past every run before it, and past
       a week. Once per run, whatever it becomes after: a record that grows
       by a day is not a new one every morning. */
    let before = 0;
    runsOf(list).forEach(r => {
      const k = Math.max(before + 1, STREAK_MIN);
      if (r.len >= k) {
        const day = shiftDay(r.from, k - 1);
        const cup = list.find(e => dayOf(e.date_time) === day);
        out.push({ id: "streak-" + r.from, kind: "streak", n: r.len, reached: k, from: r.from, to: r.to, date: day, cupId: cup ? cup.id : null });
      }
      before = Math.max(before, r.len);
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || RANK[a.kind] - RANK[b.kind]);
  }

  /* What `after` has that `before` did not. A record run that only grew
     (a cup filled the gap between two runs, or came the day before it
     started) is the same record, under another id: not a new one. */
  function crossed(before, after) {
    const had = new Set(before.map(m => m.id));
    const runs = before.filter(m => m.kind === "streak");
    return after.filter(m => !had.has(m.id) &&
      !(m.kind === "streak" && runs.some(r => r.from <= m.to && m.from <= r.to)));
  }

  // The most telling first: the cups, the scores, the streak, the coffees, the recipes.
  function lead(list) {
    return list.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.n || 0) - (a.n || 0));
  }

  /* What a save celebrates. `seen` are the ids this device already
     celebrated or knew, null the very first time: then everything before
     the save counts as known. Returns the milestones to celebrate, in order,
     and the ids to remember now (everything reached, whatever brought it). */
  function forSave(exts, savedId, seen) {
    const all = exts || [];
    const before = compute(all.filter(e => e.id !== savedId));
    const after = compute(all);
    const known = new Set(Array.isArray(seen) ? seen : before.map(m => m.id));
    const celebrate = lead(crossed(before, after).filter(m => !known.has(m.id)));
    after.forEach(m => known.add(m.id));
    return { celebrate: celebrate, seen: [...known] };
  }

  // The next cup milestone, and how many cups are left to it; null past the last.
  function nextCups(exts) {
    const n = chronological(exts).length;
    const next = CUPS.find(k => k > n);
    return next ? { n: next, left: next - n } : null;
  }

  return { CUPS, COFFEES, STREAK_MIN, streaks, compute, crossed, lead, forSave, nextCups, runsOf, shiftDay };
})();
