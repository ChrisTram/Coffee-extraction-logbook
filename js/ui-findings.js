/* Dashboard: the computed sentences and their carousel (moved out of
 * ui-dashboard.js in v8.78).
 *
 * Findings are COMPUTED sentences, not more charts, and the rules stay
 * deliberately cautious: there must be enough rated brews in each of the
 * compared groups before asserting anything. Better to say nothing than
 * to say something silly based on three cups. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, titleAttr, fmtDecimal, average, nav, findRecipe } = UI;

  // ---------- Automatic insights ----------
  // Computed sentences, not extra charts. The rules are deliberately
  // simple AND cautious: at least MIN_SAMPLE rated brews in EACH of the
  // compared groups, and at least MIN_GAP points of difference, otherwise we
  // stay quiet. With a handful of brews, any correlation is noise, and an
  // assertive sentence would be a lie. Each rule returns an already
  // translated string, or null.

  const MIN_SAMPLE = 3;
  const MIN_GAP = 0.4;
  const fmtRating = n => fmtDecimal(n, 1);

  /* THE PROOF UNDER THE SENTENCE (v8.36). A sentence alone asks to be taken
     on trust; below it, the two compared averages, their counts and two
     bars on the same scale (out of 10) show where the finding comes from.

     The confidence level is not a statistician's calculation, and it does
     not pretend to be: "solid gap" when the gap reaches 0.8 points AND both
     groups have at least five cups, "likely gap" otherwise. The display
     thresholds do not move: under 0.4 points or under three cups per group,
     we still stay quiet. */
  const SOLID_GAP = 0.8;
  const SOLID_N = 5;
  function confidenceLevel(hi, lo, nHi, nLo) {
    return hi - lo >= SOLID_GAP && Math.min(nHi, nLo) >= SOLID_N ? "solid" : "likely";
  }

  /* A complete finding: the sentence, both sides of the comparison, and
     what to judge it by. Every rule returns this shape, or null. */
  function makeFinding(text, high, low) {
    return { text: text, high: high, low: low, confidence: confidenceLevel(high.note, low.note, high.n, low.n) };
  }

  // Compares named groups {key: [scores]} and sets the BEST against the REST
  // POOLED TOGETHER, not against the second.
  //
  // Why: grind splits into many fine groups (13 dial settings on the Switch
  // in the demo). Between first and second the gap is then always tiny, even
  // when the gap between the best and all the rest exceeds a point. Testing
  // first against second would mean never saying anything. Pooling the rest
  // also gives a much larger comparison count, hence a less noisy average.
  //
  // Returns null if fewer than two groups reach MIN_SAMPLE, or if the gap
  // stays under MIN_GAP.
  function bestOfGroups(groups) {
    const classes = Object.entries(groups)
      .filter(([, notes]) => notes.length >= MIN_SAMPLE)
      .map(([key, notes]) => ({ key, notes, mean: average(notes) }))
      .sort((a, b) => b.mean - a.mean);
    if (classes.length < 2) return null;

    const winner = classes[0];
    const rest = classes.slice(1).flatMap(c => c.notes);
    const restAvg = average(rest);
    if (winner.mean - restAvg < MIN_GAP) return null;
    return { winner: winner, meanRest: restAvg, nRest: rest.length };
  }

  /* Age of the BAG, not age of the roast. The previous rule started from
     `roast_date`, missing from Chris's five coffees and likely to stay
     so: it could never fire even once. The opening day, on the other hand, he
     always knows, and it is what he describes as moving his cups the most.
     The bands follow degassing, then staling. */
  function insightBagAge(rated) {
    const groups = { finding_bag_fresh: [], finding_bag_middle: [], finding_bag_old: [] };
    rated.forEach(e => {
      const days = e._c.days_open;
      if (days === "" || days < 0) return;
      if (days <= 7) groups.finding_bag_fresh.push(e.score_10);
      else if (days <= 21) groups.finding_bag_middle.push(e.score_10);
      else groups.finding_bag_old.push(e.score_10);
    });
    const res = bestOfGroups(groups);
    if (!res) return null;
    return makeFinding(
      I18N.t("finding_bag", {
        when: I18N.t(res.winner.key),
        high: fmtRating(res.winner.mean),
        low: fmtRating(res.meanRest),
      }),
      { label: I18N.t(res.winner.key), note: res.winner.mean, n: res.winner.notes.length },
      { label: I18N.t("finding_rest_time"), note: res.meanRest, n: res.nRest });
  }

  /* THE FINDING PER COFFEE AND PER MACHINE, the most useful sentence of the lot.

     The other rules compare groups over the WHOLE history. Mixing a Sáng Tạo
     on the Brikka and a Liberica on the Switch to conclude about heat power
     describes no real cup. This one therefore isolates each (coffee, machine)
     pair and looks, among six levers, for the one that best separates ITS cups.

     The safeguards are the same as everywhere: three cups on each side and
     0.4 points of gap. On Chris's current data, none passes yet, and that is
     the right behaviour: the best gap per coffee comes out at 0.17. */
  function insightsByCoffee(exts) {
    return TUNING.findingsByCoffee(DATA.state.coffees, exts, {
      minBatch: MIN_SAMPLE * 2,
      minPerGroup: MIN_SAMPLE,
      minGap: MIN_GAP,
    }).slice(0, 2).map(c => makeFinding(
      I18N.t("finding_coffee_lever", {
        coffee: c.coffee ? c.coffee.name : "",
        machine: I18N.machine(c.method),
        lever: I18N.t("lever_" + c.lever),
        value: I18N.tr(String(c.value)),
        high: fmtRating(c.high),
        low: fmtRating(c.low),
        n: c.n,
      }),
      { label: I18N.t("lever_" + c.lever) + " " + I18N.tr(String(c.value)), note: c.high, n: c.n },
      { label: I18N.t("finding_rest"), note: c.low, n: c.nRest }));
  }

  // Duel between recipes of the same family: that is the comparison that makes
  // sense (same method, same intent), unlike a global ranking.
  function insightRecipes(rated) {
    const byFamily = {};
    rated.forEach(e => {
      const r = findRecipe(e.recipe);
      if (!r || !r.family) return;
      const f = (byFamily[r.family] = byFamily[r.family] || {});
      (f[r.name] = f[r.name] || []).push(e.score_10);
    });
    // A true duel, so we ONLY talk about families where exactly two recipes
    // have enough rated brews. With three recipes or more, naming a loser
    // would be wrong (it may only be second).
    for (const family of Object.keys(byFamily)) {
      const classes = Object.entries(byFamily[family])
        .filter(([, notes]) => notes.length >= MIN_SAMPLE)
        .map(([label, notes]) => ({ name: label, mean: average(notes), n: notes.length }))
        .sort((a, b) => b.mean - a.mean);
      if (classes.length !== 2) continue;
      if (classes[0].mean - classes[1].mean < MIN_GAP) continue;
      return makeFinding(
        I18N.t("finding_recipes", {
          winner: I18N.tr(classes[0].name),
          loser: I18N.tr(classes[1].name),
          high: fmtRating(classes[0].mean),
          low: fmtRating(classes[1].mean),
        }),
        { label: I18N.tr(classes[0].name), note: classes[0].mean, n: classes[0].n },
        { label: I18N.tr(classes[1].name), note: classes[1].mean, n: classes[1].n });
    }
    return null;
  }

  // Time of day: the hour is already in date_time, so this rule costs no
  // extra input. Answers "is my first cup really better, or just drunk with
  // more enthusiasm".
  function insightMoment(rated) {
    const groups = { finding_time_morning: [], finding_time_afternoon: [], finding_time_evening: [] };
    rated.forEach(e => {
      const hour = Number(String(e.date_time).slice(11, 13));
      if (!Number.isFinite(hour)) return;
      if (hour < 12) groups.finding_time_morning.push(e.score_10);
      else if (hour < 18) groups.finding_time_afternoon.push(e.score_10);
      else groups.finding_time_evening.push(e.score_10);
    });
    const res = bestOfGroups(groups);
    if (!res) return null;
    return makeFinding(
      I18N.t("finding_time", {
        when: I18N.t(res.winner.key),
        high: fmtRating(res.winner.mean),
        low: fmtRating(res.meanRest),
      }),
      { label: I18N.t(res.winner.key), note: res.winner.mean, n: res.winner.notes.length },
      { label: I18N.t("finding_rest_day"), note: res.meanRest, n: res.nRest });
  }

  // Heat power, Brikka only. This is exactly the variable Chris is trying
  // to tune: as long as it is 3 everywhere, the rule stays quiet, and it
  // will speak as soon as he has tried something else.
  function insightPower(rated) {
    const groups = {};
    rated
      .filter(e => e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined)
      .forEach(e => (groups[e.heat_level] = groups[e.heat_level] || []).push(e.score_10));
    const res = bestOfGroups(groups);
    if (!res) return null;
    return makeFinding(
      I18N.t("finding_heat", {
        heat: res.winner.key,
        high: fmtRating(res.winner.mean),
        low: fmtRating(res.meanRest),
      }),
      { label: I18N.t("setting_heat", { f: res.winner.key }), note: res.winner.mean, n: res.winner.notes.length },
      { label: I18N.t("finding_rest_settings"), note: res.meanRest, n: res.nRest });
  }

  /* THREE MORE FINDINGS (v8.42). Data entered with every cup that no rule
     read: the Switch water temperature, the Brikka preheated water, the
     Switch agitation. Same mould as the rules above, same silence thresholds
     (MIN_SAMPLE, MIN_GAP). Each one looks ONLY at the relevant machine:
     preheated water on a Switch means nothing. */

  // The bands follow what the kettle really delivers, not the recipes'
  // target: under 91, the water has had time to cool; 94 and above, just
  // off the heat.
  function tempBand(t) {
    return t <= 90 ? "finding_temp_low" : t <= 93 ? "finding_temp_middle" : "finding_temp_high";
  }
  function insightTemperature(rated) {
    const groups = { finding_temp_low: [], finding_temp_middle: [], finding_temp_high: [] };
    rated.forEach(e => {
      const t = Number(e.temperature_c);
      if (e.method !== "Switch" || e.temperature_c === "" || !Number.isFinite(t)) return;
      groups[tempBand(t)].push(e.score_10);
    });
    const res = bestOfGroups(groups);
    if (!res) return null;
    return makeFinding(
      I18N.t("finding_temp", { range: I18N.t(res.winner.key) }),
      { label: I18N.t(res.winner.key), note: res.winner.mean, n: res.winner.notes.length },
      { label: I18N.t("finding_rest_temp"), note: res.meanRest, n: res.nRest });
  }

  /* Only two groups: the rest IS the other group, so we name it. */
  function duelOf(groups, phrase) {
    const res = bestOfGroups(groups);
    if (!res) return null;
    const other = Object.keys(groups).find(k => k !== res.winner.key);
    return makeFinding(
      phrase(I18N.t(res.winner.key)),
      { label: I18N.t(res.winner.key), note: res.winner.mean, n: res.winner.notes.length },
      { label: I18N.t(other), note: res.meanRest, n: res.nRest });
  }
  function insightPreheat(rated) {
    const groups = { finding_preheat_yes: [], finding_preheat_no: [] };
    rated.filter(e => e.method === "Brikka").forEach(e =>
      groups[Number(e.preheated_water) === 1 ? "finding_preheat_yes" : "finding_preheat_no"].push(e.score_10));
    return duelOf(groups, what => I18N.t("finding_preheat", { what: what }));
  }
  function insightAgitation(rated) {
    const groups = { finding_stir_yes: [], finding_stir_no: [] };
    rated.filter(e => e.method === "Switch").forEach(e =>
      groups[e.stir_count !== "" && e.stir_count !== undefined && Number(e.stir_count) > 0
        ? "finding_stir_yes" : "finding_stir_no"].push(e.score_10));
    return duelOf(groups, what => I18N.t("finding_stir", { what: what }));
  }

  function computeInsights(exts) {
    const rated = exts.filter(e => e.score_10 !== "");
    /* Findings PER COFFEE first: they are more precise, hence more
       actionable. The global rules next, and they announce themselves
       that they mix coffees: that is their limit, might as well say it. */
    const findings = insightsByCoffee(exts).concat([
      insightBagAge(rated),
      insightRecipes(rated),
      insightMoment(rated),
      insightPower(rated),
      insightTemperature(rated),
      insightPreheat(rated),
      insightAgitation(rated),
    ].filter(Boolean).map(c => ({ ...c, text: I18N.t("finding_global", { p: c.text }) })));

    if (findings.length) return findings;

    // Nothing to say: we explain WHY rather than leaving an empty frame.
    // That is the difference between "not enough data" and "the site is broken".
    // We do NOT ask for roast dates here: Vietnamese bags almost never
    // carry them, the reminder would be a permanent reproach.
    return [{ text: I18N.t("finding_empty", { n: MIN_SAMPLE }) }];
  }

  /* THE PROOF, ON ONE LINE (v8.37). v8.36 laid it out as two rows of bars
     with a separate footer: 164 px per finding, and the thirty-day chart,
     which aligns to its neighbour's height, grew to 370 px of drawing. It
     also repeated, as a label, the setting the sentence had just named.

     Here a 0 to 10 ruler, the score scale (normalising on the gap would make
     0.4 points look like a chasm), with two dots: the setting in accent, the
     rest in neutral, and the line between them. Then "6.8 vs 5.2", and on
     the right the confidence with both counts. Nothing is lost. */
  function scaleBar(c) {
    const hi = c.high.note, lo = c.low.note;
    const pc = n => Math.max(0, Math.min(100, (Number(n) / 10) * 100)).toFixed(1) + "%";
    const from = Math.min(hi, lo), to = Math.max(hi, lo);
    // The labels of both sides, for a screen reader: the sentence already names them visually.
    const spoken = c.high.label + " " + fmtRating(hi) + ", " + c.low.label + " " + fmtRating(lo);
    return '<span class="ruler" role="img" aria-label="' + titleAttr(spoken) + '">' +
      '<i class="ruler-line" style="left:' + pc(from) + ";width:calc(" + pc(to) + " - " + pc(from) + ')"></i>' +
      '<i class="ruler-point low" style="left:' + pc(lo) + '"></i>' +
      '<i class="ruler-point high" style="left:' + pc(hi) + '"></i></span>';
  }

  /* THE CAROUSEL (v8.39). Findings used to stack, and the card, taller than
     the neighbouring chart, stretched it along. They now all sit in the same
     grid cell, only one visible: the card takes the height of the longest,
     never the sum, and switching findings makes nothing jump. */
  let currentInsight = 0;
  function showInsight(i) {
    const items = $$("#insights > li");
    if (!items.length) return;
    currentInsight = (i + items.length) % items.length;
    items.forEach((li, k) => {
      li.classList.toggle("current", k === currentInsight);
      li.setAttribute("aria-hidden", String(k !== currentInsight));
    });
    const pos = $("#insights-nav .insights-pos");
    if (pos) pos.textContent = (currentInsight + 1) + " / " + items.length;
  }

  /* The carousel arrows. Called by wireDashboard. */
  function wireFindings() {
    $("#insights-nav").addEventListener("click", ev => {
      const b = ev.target.closest("[data-insight]");
      if (b) showInsight(currentInsight + Number(b.dataset.insight));
    });
  }

  function renderInsights(exts) {
    const findings = computeInsights(exts);
    const navEl = $("#insights-nav");
    navEl.hidden = findings.length < 2;
    navEl.innerHTML = findings.length < 2 ? "" :
      '<span class="insights-pos"></span>' +
      '<button type="button" class="btn-square-small" data-insight="-1" aria-label="' + titleAttr(I18N.t("finding_previous")) + '">' + UI.icon("gauche") + "</button>" +
      '<button type="button" class="btn-square-small" data-insight="1" aria-label="' + titleAttr(I18N.t("finding_next")) + '">' + UI.icon("chevron") + "</button>";
    $("#insights").innerHTML = findings.map(c => {
      if (!c.high) return '<li class="finding finding-empty"><p>' + c.text + "</p></li>";
      return '<li class="finding"><p>' + c.text + "</p>" +
        '<div class="proof">' + scaleBar(c) +
        '<span class="proof-figures">' + I18N.t("finding_versus", { h: fmtRating(c.high.note), b: fmtRating(c.low.note) }) + "</span>" +
        '<span class="proof-footer">' + I18N.t("finding_" + c.confidence) + " · " +
        I18N.t("finding_counts", { h: c.high.n, b: c.low.n }) + "</span></div></li>";
    }).join("");
    showInsight(currentInsight);
  }

  Object.assign(UI, {
    MIN_GAP, MIN_SAMPLE, fmtRating,
    bestOfGroups, wireFindings, computeInsights,
    insightBagAge, insightAgitation, insightMoment, insightPreheat, insightPower,
    insightRecipes, insightTemperature, insightsByCoffee, renderInsights,
  });
})();
