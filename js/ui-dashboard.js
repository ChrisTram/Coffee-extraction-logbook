/* Home screen: the activity calendar, the analyses and the latest
 * extractions. The computed sentences live in ui-findings.js and the big
 * card of the last cup in ui-last-cup.js (split out in v8.78). */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, animateCounter, titleAttr, localDateKey, displayedDiags,
    dayKey, isFailed, analyzableExts, extsWithCalcs, fmtDecimal, fmtHour, dayLabelOf, average, nav, fallbacks, findRecipe } = UI;
  // And from the two pieces moved out of here in v8.78, loaded just before.
  const { MIN_GAP, MIN_SAMPLE, fmtRating, wireFindings, renderInsights,
    LATEST_SHOWN, lastComment, lastTastes, shortMeasures, renderLastCup } = UI;

  // ---------- Activity calendar ----------
  // 18 weeks and not 26: at one or two cups a day, six months of grid are
  // mostly six months of empty cells, which makes it look like the calendar
  // does not work.
  /* Ceiling of the calendar window. The number ACTUALLY shown is computed
     from the container width, see visibleWeeks(): beyond this ceiling
     nothing more is learned, below it things get crammed. */
  const HEATMAP_WEEKS = 18;
  const MIN_WEEKS = 6;

  /* HOW MANY WEEKS FIT, really. A cell is 17 px plus 4 of gutter, and the
     day column takes 34 on the left: that is the whole arithmetic. Without
     this computation, the SVG forced 620 px into a 257 px card and the card
     scrolled horizontally, which a card must never do.

     The result serves BOTH the grid and the five figures below it: two
     different windows for the same block would make a block that
     contradicts itself. */
  /* Prevents the catch-up from calling itself endlessly. */
  let heatmapRecounted = false;

  function visibleWeeks() {
    const frame = $("#g-heatmap");
    const available = frame ? frame.clientWidth : 0;
    if (!available) return HEATMAP_WEEKS;
    const fit = Math.floor((available - 34) / 21);
    return Math.max(MIN_WEEKS, Math.min(HEATMAP_WEEKS, fit));
  }

  /* Quantifies the displayed period. A grid of cells says nothing measurable
     on its own; these five numbers are what people come looking for.

     The CURRENT STREAK is counted from the last active day, and is only
     announced if that day is today or yesterday. Otherwise, at eight in the
     morning before the first coffee, it would drop to zero every day and
     would no longer mean anything. */
  function statsHeatmap(perDay, weeks) {
    const windowWeeks = weeks || HEATMAP_WEEKS;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowWeeks * 7 - 1));

    const days = [];
    const day = new Date(start);
    while (day <= end) {
      days.push(perDay[localDateKey(day)] || 0);
      day.setDate(day.getDate() + 1);
    }

    let cups = 0, activeDays = 0, streak = 0, bestStreak = 0;
    days.forEach(n => {
      if (n > 0) {
        cups += n;
        activeDays += 1;
        streak += 1;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    });

    // Current streak: walk back from the end, allowing today to still be
    // empty (last index = today).
    let currentStreak = 0;
    let i = days.length - 1;
    if (days[i] === 0) i -= 1; // today not started yet, start from yesterday
    while (i >= 0 && days[i] > 0) { currentStreak += 1; i -= 1; }

    // Weekly average relative to the time ACTUALLY covered: dividing by
    // 18 weeks when the first coffee is 15 days old would give a wrong and
    // discouraging number.
    const firstActive = days.findIndex(n => n > 0);
    const coveredDays = firstActive === -1 ? 0 : days.length - firstActive;
    const perWeek = coveredDays > 0 ? cups / (coveredDays / 7) : 0;

    return { cups: cups, activeDays: activeDays, currentStreak: currentStreak, bestStreak: bestStreak, perWeek: perWeek };
  }

  /* THE SCALE LEGEND. The calendar shades follow an ABSOLUTE scale, so a
     colour always means the same thing: that is what makes a legend useful,
     and that is why it must exist. Without it, the calendar is a run of
     browns. */
  function renderHeatmapLegend() {
    const target = $("#heatmap-legend");
    if (!target) return;
    const cells = [0, 1, 2, 3, 4].map(n =>
      '<span class="hm-i hm-n' + n + '"></span>').join("");
    target.innerHTML = '<span>' + I18N.t("heatmap_legend_less") + "</span>" + cells +
      "<span>" + I18N.t("heatmap_legend_more") + "</span>";
  }

  function renderHeatmapStats(perDay, weeks) {
    const windowWeeks = weeks || HEATMAP_WEEKS;
    const s = statsHeatmap(perDay, windowWeeks);
    if (!s.cups) {
      $("#heatmap-stats").innerHTML =
        '<p class="card-empty">' + I18N.t("heatmap_summary_empty", { s: windowWeeks }) + "</p>";
      return;
    }
    const cells = [
      { v: s.cups, l: I18N.t("heatmap_stat_cups") },
      { v: s.activeDays, l: I18N.t("heatmap_stat_days") },
      { v: s.currentStreak, l: I18N.t("heatmap_stat_streak_now") },
      { v: s.bestStreak, l: I18N.t("heatmap_stat_streak_max") },
      { v: fmtDecimal(s.perWeek, 1), l: I18N.t("heatmap_stat_week") },
    ];
    $("#heatmap-stats").innerHTML = cells
      .map(c => '<div class="mini-stat"><b>' + c.v + "</b><span>" + c.l + "</span></div>")
      .join("");
  }

  /* An empty chart does not say WHY it is empty, and it reads like a broken
     site. These three cards are the only ones that can stay empty for a long
     time with perfectly valid data, so each one states its real cause
     rather than a generic "no data" that helps nobody. */
  function updateEmptyCard(id, pointCount, key) {
    const empty = pointCount === 0;
    $("#box-" + id).hidden = empty;
    const msg = $("#empty-" + id);
    msg.hidden = !empty;
    if (empty) msg.textContent = I18N.t(key);
  }

  function emptyGrindCause(rated) {
    if (!rated.length) return "empty_nothing";
    // Most common case for a drinker of pre-ground coffee: the grind is
    // deliberately not stored, so the scatter cannot show anything.
    const allPreGround = rated.every(e => {
      const c = DATA.coffeeOf(e);
      return c && Number(c.pre_ground) === 1;
    });
    return allPreGround ? "empty_grind_preground" : "empty_grind";
  }

  function emptyTastesCause(rated) {
    if (!rated.length) return "empty_nothing";
    const withTags = rated.filter(e => (e.descriptors || "").trim() !== "").length;
    // Tell "you never tick descriptors" apart from "not enough times the
    // same one yet", because the action to take is not the same.
    return withTags === 0 ? "empty_tastes_none" : "empty_tastes_threshold";
  }

  /* Average rating per descriptor. It is the only dashboard chart that talks
     about TASTE rather than settings, even though that is what the logbook is
     about. It replaces a scatter of rating against coffee age, which depended
     on a roast date that Vietnamese bags almost never carry: it was therefore
     structurally empty.

     Here the data is always there, since descriptors are ticked on every
     cup. We keep the 10 best and the 5 worst: out of 59 tags, showing all
     would be unreadable, and the extremes carry the information. */
  const MIN_TASTE_CUPS = 3;
  const TOP_TASTES = 10;
  const WORST_TASTES = 5;

  function renderTastes(rated) {
    const byTag = {};
    rated.forEach(e => {
      (e.descriptors || "").split("|").filter(Boolean).forEach(tag => {
        (byTag[tag] = byTag[tag] || []).push(e.score_10);
      });
    });

    const ranked = Object.entries(byTag)
      .filter(([, ratings]) => ratings.length >= MIN_TASTE_CUPS)
      .map(([tag, ratings]) => ({ tag, mean: average(ratings), n: ratings.length }))
      .sort((a, b) => b.mean - a.mean);

    if (!ranked.length) {
      $("#rating-tastes").textContent = "";
      return [];
    }

    // The extremes, without duplicates if the list is short.
    const kept = ranked.length > TOP_TASTES + WORST_TASTES
      ? [...ranked.slice(0, TOP_TASTES), ...ranked.slice(-WORST_TASTES)]
      : ranked;

    const overallAvg = average(rated.map(e => e.score_10));
    const items = kept.map(c => ({
      label: I18N.tag(c.tag),
      value: +c.mean.toFixed(1),
      extra: I18N.t("count_brews", { n: c.n }),
    }));
    // Green above your average, red below: without a reference, "7,9" does not
    // say whether it is good for YOU.
    const colors = kept.map(c =>
      c.mean >= overallAvg
        ? getComputedStyle(document.documentElement).getPropertyValue("--ok").trim()
        : getComputedStyle(document.documentElement).getPropertyValue("--danger").trim());

    CHARTS.horizontalBars("g-tastes", items, colors, I18N.t("axis_average_score"), 10);
    $("#rating-tastes").textContent = I18N.t("tastes_score", {
      m: fmtDecimal(overallAvg, 1),
      n: MIN_TASTE_CUPS,
    });
    return items;
  }

  /* THE ANALYSIS READINGS (v8.39). One sentence per tab, next to the chart,
     so it does not need interpreting. Each one stays silent (empty string)
     when its data does not allow a conclusion: same thresholds as
     everywhere, three cups per group. */
  function readRanking(items, keyOne, keyTwo) {
    const ok = items.filter(i => i.n >= MIN_SAMPLE);
    if (ok.length < 2) return "";
    const high = ok[0], low = ok[ok.length - 1];
    return I18N.t(ok.length > 2 ? keyTwo : keyOne, {
      a: high.label, ma: fmtRating(high.value), b: low.label, mb: fmtRating(low.value),
    });
  }

  function readMachines(nB, nS) {
    if (nB.length < MIN_SAMPLE || nS.length < MIN_SAMPLE) return "";
    const mB = average(nB), mS = average(nS), gap = Math.abs(mB - mS);
    if (gap < MIN_GAP) return I18N.t("reading_machines_level", { mb: fmtRating(mB), ms: fmtRating(mS) });
    return I18N.t(mS > mB ? "reading_switch_ahead" : "reading_brikka_ahead", {
      x: fmtRating(gap), s: gap >= 2 ? "s" : "",
      often: nB.length === nS.length ? ""
        : I18N.t(nB.length > nS.length ? "reading_often_brikka" : "reading_often_switch"),
    });
  }

  function readDiagnostics(byDiag) {
    const total = Object.values(byDiag).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(byDiag).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return "";
    return I18N.t("reading_diagnosis", { d: displayedDiags(sorted[0][0]), n: sorted[0][1], t: total });
  }

  function readGrind(analyzable) {
    let best = null;
    ["Brikka", "Switch"].forEach(m => {
      const byDial = {};
      analyzable.filter(e => e.method === m && e.score_10 !== "" && e.grind_dial)
        .forEach(e => (byDial[e.grind_dial] = byDial[e.grind_dial] || []).push(e.score_10));
      Object.entries(byDial).filter(([, ns]) => ns.length >= MIN_SAMPLE).forEach(([dial, ns]) => {
        const avg = average(ns);
        if (!best || avg > best.mean) best = { m, dial, mean: avg, n: ns.length };
      });
    });
    return best ? I18N.t(best.m === "Brikka" ? "reading_grind_brikka" : "reading_grind_switch", {
      d: best.dial, x: fmtRating(best.mean), n: best.n,
    }) : "";
  }

  function readTastes(items, overallAvg) {
    if (items.length < 2) return "";
    const good = items.filter(i => i.value >= overallAvg).slice(0, 2).map(i => i.label);
    const worst = items[items.length - 1];
    if (!good.length) return "";
    return I18N.t(worst.value < overallAvg ? "reading_tastes" : "reading_tastes_no_worst", {
      a: good.join(I18N.t("reading_and")), p: worst.label,
    });
  }

  /* The TABS. The chosen tab is remembered in this browser: you come back to
     the question you were asking. The panels are never display: none (see
     .analyses-stack): they are inert and invisible, so that each chart keeps
     its size. */
  const TAB_KEY = "analysis-tab";
  function showAnalysis(name, focus) {
    const buttons = $$(".tabs-analyses [role=tab]");
    if (!buttons.some(b => b.dataset.analysis === name)) name = "coffees";
    buttons.forEach(b => {
      const active = b.dataset.analysis === name;
      b.setAttribute("aria-selected", String(active));
      b.tabIndex = active ? 0 : -1;
      if (active && focus) b.focus();
      const panel = $("#analysis-" + b.dataset.analysis);
      panel.classList.toggle("current", active);
      panel.inert = !active;
      panel.setAttribute("aria-hidden", String(!active));
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* without storage, back to Cafés */ }
  }

  function emptyDuelCause(rated) {
    if (!rated.length) return "empty_nothing";
    const machines = new Set(rated.map(e => e.method).filter(Boolean));
    // A single brewer used: there is nothing to compare, it is not a bug.
    return machines.size < 2 ? "empty_duel_one_machine" : "empty_duel";
  }

  function renderDashboard() {
    /* TWO data sets, and knowing which one to take is the only question that
       matters here. exts counts WHAT HAPPENED, analyzable advises WHAT TO DO.
       See analyzableExts() in the core for the rule. */
    const exts = extsWithCalcs();
    const analyzable = analyzableExts();
    /* The "include failed cups" toggle lives in the Settings screen since
       v7.91: as a banner here, it took the place of the first figure on every
       opening for a setting changed once a month. */
    const empty = exts.length === 0;
    $("#dashboard-empty").hidden = !empty;
    $("#dashboard-content").hidden = empty;
    if (empty) return;
    renderStockCorner();

    const today = localDateKey(new Date());
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const mondayKey = localDateKey(monday);
    const currentMonth = today.slice(0, 7);
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

    const ratings = analyzable.filter(e => e.score_10 !== "").map(e => e.score_10);
    const ratings7d = analyzable.filter(e => e.score_10 !== "" && new Date(e.date_time) >= weekAgo).map(e => e.score_10);

    // Estimated caffeine per day over the last 7 days.
    const caffeineOf = e => {
      const coffee = DATA.coffeeOf(e);
      return caffeineMg(e.dose_g || 0, coffee ? coffee.species : "", coffee ? coffee.real_coffee_pct : 100);
    };
    const caffeine7d = exts.filter(e => new Date(e.date_time) >= weekAgo).reduce((a, e) => a + caffeineOf(e), 0);

    /* FOUR tiles, not seven. Seven aligned figures get COUNTED instead of
       read: you hunt for the one you wanted. The four that remain are those
       that move from one day to the next. The other three, total, overall
       rating and caffeine, have not gone: they move to a line under the grid,
       where they can be read when looked for without taking the glance. */
    const kpis = [
      { value: exts.filter(e => e.date_time.slice(0, 10) === today).length, label: I18N.t("kpi_today"), dec: 0 },
      { value: exts.filter(e => e.date_time.slice(0, 10) >= mondayKey).length, label: I18N.t("kpi_week"), dec: 0 },
      { value: average(ratings7d) || 0, label: I18N.t("kpi_score_7d"), dec: 1, outOf10: true },
      { value: TUNING.gapAtSameCoffee(analyzable) || 0, label: I18N.t("kpi_consistency"), dec: 1, plusMinus: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-value"><span class="kpi-number"></span>' +
      (k.outOf10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : k.plusMinus ? "<small> pt</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    /* An average without cups is not zero (v8.38): "0,0 / 10" read like a
       week of failed cups. A dash, with no animation or unit. */
    kpis[2].empty = !ratings7d.length;
    kpis[3].empty = ratings.length < 2;
    $$("#kpis .kpi-number").forEach((el, i) => {
      if (kpis[i].empty) {
        el.textContent = "-";
        el.parentElement.querySelector("small")?.remove();
        return;
      }
      animateCounter(el, kpis[i].value, kpis[i].dec, "", kpis[i].plusMinus ? "± " : "");
    });

    /* The three figures taken out of the tiles. They stay readable, in plain
       text, and are no longer in the path of the eye. */
    const row = (caption, value) =>
      "<li><span>" + caption + "</span><b>" + value + "</b></li>";
    $("#kpis-secondary").innerHTML =
      row(I18N.t("kpi_total"), exts.length) +
      row(I18N.t("kpi_score"), fmtDecimal(average(ratings) || 0, 1) + " / 10") +
      row(I18N.t("kpi_caffeine"), "≈ " + Math.round(caffeine7d / 7) + " mg");

    /* The page header subline: today's date, as in the mockup. */
    $("#dashboard-highlight").textContent = now.toLocaleDateString(I18N.locale(),
      { weekday: "long", day: "numeric", month: "long" });

    renderLastCup(exts);

    renderInsights(analyzable);

    // Last 30 days: bars, rating, grams, caffeine in the tooltip
    const labels = [], counts = [], averages = [], details = [], trend = [];
    /* The trend is computed over the WHOLE rated history, not over the 30 days:
       a rolling average restarting at the window edge would be empty for the
       first four days shown. It is then projected day by day, keeping the
       last known value, so that it does not break on days without a cup. */
    const rolling = TUNING.rollingAverage(analyzable, 5);
    let iRoll = 0, latest = null, lastDate = null;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const dayCups = exts.filter(e => e.date_time.slice(0, 10) === key);
      labels.push(d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }));
      counts.push(dayCups.length);
      const dayRatings = dayCups.filter(e => e.score_10 !== "").map(e => e.score_10);
      averages.push(dayRatings.length ? +average(dayRatings).toFixed(1) : null);
      if (!dayCups.length) { details.push(""); continue; }
      const g = dayCups.reduce((a, e) => a + (e.dose_g || 0), 0);
      const mg = dayCups.reduce((a, e) => a + caffeineOf(e), 0);
      const coffeeNames = [...new Set(dayCups.map(e => (DATA.coffeeOf(e) || {}).name).filter(Boolean))];
      details.push(I18N.t("tip_coffee_grams", { g: Math.round(g * 10) / 10 }) + "\n" +
        I18N.t("tip_caffeine", { mg }) + "\n" + coffeeNames.join(", "));
    }
    // Second pass: the trend follows the same labels as the bars.
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      while (iRoll < rolling.length && String(rolling[iRoll].date).slice(0, 10) <= key) {
        if (rolling[iRoll].value !== null) {
          latest = rolling[iRoll].value;
          lastDate = String(rolling[iRoll].date).slice(0, 10);
        }
        iRoll += 1;
      }
      /* Extended at most seven days after the last rated cup (v8.38): beyond
         that, it drew a flat line across a month without a single cup, a
         trend that nothing measured. */
      const stale = lastDate &&
        (new Date(key + "T12:00") - new Date(lastDate + "T12:00")) / 86400000 > 7;
      trend.push(stale ? null : latest);
    }
    CHARTS.barsAndLine30d("g-30days", labels, counts, averages, details, trend, UI.renderCoffees30d(exts));

    // Heatmap
    const perDay = {}, infoPerDay = {};
    exts.forEach(e => {
      const key = e.date_time.slice(0, 10);
      perDay[key] = (perDay[key] || 0) + 1;
    });
    const ratingsPerDay = {};
    analyzable.forEach(e => { if (e.score_10 !== "") (ratingsPerDay[e.date_time.slice(0, 10)] = ratingsPerDay[e.date_time.slice(0, 10)] || []).push(e.score_10); });
    Object.keys(perDay).forEach(key => { if (ratingsPerDay[key]) infoPerDay[key] = I18N.t("detail_score") + " " + average(ratingsPerDay[key]).toFixed(1); });
    /* As many weeks as the card can show, without scrolling. The same number
       goes to the five figures below: the grid and its summary describe the
       same window. */
    const weeks = visibleWeeks();
    CHARTS.heatmap("g-heatmap", perDay, infoPerDay, weeks);
    $("#heatmap-title").textContent = I18N.t("heatmap_title", { n: weeks });
    renderHeatmapStats(perDay, weeks);
    renderHeatmapLegend();

    /* ON FIRST RENDER the card has no width yet: visibleWeeks() falls back
       to the ceiling and draws 18 weeks squashed to scale. Once layout is
       done, we recount, and only redraw if the count changed. The flag
       prevents the loop: a single catch-up. */
    if (!heatmapRecounted) {
      heatmapRecounted = true;
      setTimeout(() => {
        heatmapRecounted = false;
        if (nav.screenName === "dashboard" && visibleWeeks() !== weeks) UI.renderDashboard();
      }, 0);
    }

    // Average rating per coffee
    const byCoffee = {};
    exts.forEach(e => {
      if (e.score_10 === "") return;
      (byCoffee[e._c.coffee_name] = byCoffee[e._c.coffee_name] || []).push(e.score_10);
    });
    const coffeeItems = Object.entries(byCoffee)
      .map(([name, ns]) => ({ label: I18N.tr(name), value: +average(ns).toFixed(1), extra: I18N.t("count_brews", { n: ns.length }), rawName: name }))
      .sort((a, b) => b.value - a.value);
    // The reference coffee (benchmark) stands out in green.
    const coffeeColors = coffeeItems.map(i => {
      const c = DATA.state.coffees.find(x => x.name === i.rawName);
      return c && (c.tag || "").includes("référence") ? CHARTS.C_BOTH : undefined;
    });
    const coffeeAccents = coffeeColors.some(Boolean) ? coffeeColors.map(c => c || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) : null;
    CHARTS.horizontalBars("g-coffees", coffeeItems, coffeeAccents, I18N.t("axis_average_score"), 10);
    $("#reading-coffees").textContent = readRanking(
      coffeeItems.map(i => ({ ...i, n: byCoffee[i.rawName].length })), "reading_coffees_two", "reading_coffees");

    // Brikka versus Switch duel
    const brikka = analyzable.filter(e => e.method === "Brikka");
    const swtch = analyzable.filter(e => e.method === "Switch");
    const nB = brikka.filter(e => e.score_10 !== "").map(e => e.score_10);
    const nS = swtch.filter(e => e.score_10 !== "").map(e => e.score_10);
    $("#duel-machines").innerHTML =
      '<div class="duel-col brikka"><b>' + brikka.length + "</b><span>" + I18N.t("dash_brikka_brews") + "</span><b>" +
      (nB.length ? average(nB).toFixed(1) : "...") + "</b><span>" + I18N.t("detail_score") + "</span></div>" +
      '<div class="duel-col switch"><b>' + swtch.length + "</b><span>" + I18N.t("dash_switch_brews") + "</span><b>" +
      (nS.length ? average(nS).toFixed(1) : "...") + "</b><span>" + I18N.t("detail_score") + "</span></div>";

    // Coffees brewed in both brewers
    const bothCoffees = DATA.state.coffees.filter(c => {
      const eb = analyzable.some(e => e.coffee_id === c.id && e.method === "Brikka" && e.score_10 !== "");
      const es = analyzable.some(e => e.coffee_id === c.id && e.method === "Switch" && e.score_10 !== "");
      return eb && es;
    });
    CHARTS.machineComparison("g-duel",
      bothCoffees.map(c => c.name),
      bothCoffees.map(c => +average(analyzable.filter(e => e.coffee_id === c.id && e.method === "Brikka" && e.score_10 !== "").map(e => e.score_10)).toFixed(1)),
      bothCoffees.map(c => +average(analyzable.filter(e => e.coffee_id === c.id && e.method === "Switch" && e.score_10 !== "").map(e => e.score_10)).toFixed(1)));

    // Scatter plots
    const pts = m => analyzable
      .filter(e => e.method === m && e.score_10 !== "" && e._c.microns !== "")
      .map(e => ({ x: e._c.microns, y: e.score_10, name: e._c.coffee_name + ", " + e.grind_dial }));
    CHARTS.scatter("g-grind", pts("Brikka"), pts("Switch"), I18N.t("axis_grind"), "µm");

    const rated = analyzable.filter(e => e.score_10 !== "");
    const tastes = renderTastes(rated);
    $("#reading-tastes").textContent = readTastes(tastes, average(rated.map(e => e.score_10)) || 0);
    $("#reading-machines").textContent = readMachines(nB, nS);
    $("#reading-grind").textContent = readGrind(analyzable);

    // The three cards that can stay empty with valid data.
    updateEmptyCard("grind", pts("Brikka").length + pts("Switch").length, emptyGrindCause(rated));
    updateEmptyCard("tastes", tastes.length, emptyTastesCause(rated));
    updateEmptyCard("aromas", CHARTS.aromaWheel(rated), emptyTastesCause(rated));
    updateEmptyCard("duel", bothCoffees.length, emptyDuelCause(rated));

    // Diagnostics
    const byDiag = {};
    analyzable.forEach(e => (e.diagnostic || "").split("|").filter(Boolean).forEach(d => {
      byDiag[d] = (byDiag[d] || 0) + 1;
    }));
    const diagLabels = DIAGNOSTICS.filter(d => byDiag[d]);
    CHARTS.diagnosticsRing("g-diagnostics", diagLabels, diagLabels.map(d => byDiag[d]));
    $("#reading-diagnostics").textContent = readDiagnostics(byDiag);

    // Rating per recipe
    const byRecipe = {};
    analyzable.forEach(e => {
      if (e.score_10 === "" || !e.recipe) return;
      (byRecipe[e.recipe] = byRecipe[e.recipe] || []).push(e.score_10);
    });
    const recipeItems = Object.entries(byRecipe)
      .map(([name, ns]) => ({ label: name, value: +average(ns).toFixed(1), extra: I18N.t("count_brews", { n: ns.length }) }))
      .sort((a, b) => b.value - a.value);
    const recipeColors = recipeItems.map(i => {
      const r = findRecipe(i.label);
      return r ? (r.method === "Brikka" ? CHARTS.C_BRIKKA : CHARTS.C_SWITCH) : CHARTS.C_BOTH;
    });
    CHARTS.horizontalBars("g-recipes", recipeItems, recipeColors, I18N.t("axis_average_score"), 10);
    $("#reading-recipes").textContent = readRanking(
      recipeItems.map(i => ({ ...i, label: I18N.tr(i.label), n: byRecipe[i.label].length })), "reading_recipes_two", "reading_recipes");

    // 5 latest
    /* EIGHT and not five: the card stretches to the height of its row, and
       five lines left a big blank there. Lines are better than emptiness. */
    const latestCups = [...exts].sort((a, b) => b.date_time.localeCompare(a.date_time))
      .slice(0, LATEST_SHOWN);
    // Each line opens the editing of its extraction. role and tabindex rather
    // than a real button: the content is structured (div, span) and a button is
    // not allowed to contain it.
    /* A REAL TABLE, and no longer a list of blocks: the columns align the
       same quantities from one line to the next, which a list does not do.

       NO MORE COMMENT TOOLTIP ON HOVER (v8.33): it is already written on the
       line just below, the tooltip repeated it word for word. Chris found it
       absurd. The title only says what the click does. */
    /* GROUPED BY DAY (v8.82): the date becomes a subheading and the column
       only keeps the time. As a column, « 26 sept. 14:43 » fit neither on the
       phone (44 px, « 2… ») nor on a 1,280 laptop. The brewer no longer has
       its column: its colour dot moves in front of the coffee name. */
    let currentDay = "";
    $("#latest-list").innerHTML = latestCups.map(e => {
      const day = dayKey(e.date_time);
      const header = day !== currentDay
        ? '<tr class="d-day"><th colspan="5" scope="colgroup">' + dayLabelOf(e.date_time) + "</th></tr>" : "";
      currentDay = day;
      return header +
      '<tr class="last-clickable' + (isFailed(e) ? " row-failed" : "") +
      '" data-ext="' + e.id + '" tabindex="0" role="button" title="' + titleAttr(I18N.t("history_edit")) + '">' +
      '<td class="d-when">' + fmtHour(e.date_time) + "</td>" +
      '<td class="d-coffee"><span class="dot-method ' + e.method.toLowerCase() +
        '" title="' + titleAttr(e.method) + '"></span><b>' + I18N.tr(e._c.coffee_name) + "</b>" +
        (isFailed(e) ? '<span class="mention-failed">' + I18N.t("botched_badge") + "</span>" : "") + "</td>" +
      '<td class="d-measures">' +
        (e.recipe ? '<span class="d-recipe">' + I18N.tr(e.recipe) + "</span>" : "") +
        shortMeasures(e) +
        (e.diagnostic ? '<span class="d-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
      "</td>" +
      '<td class="d-tastes">' + lastTastes(e) + "</td>" +
      '<td class="d-rating">' + (e.score_10 !== "" ? fmtDecimal(Number(e.score_10), 1) : "") + "</td></tr>" +
      lastComment(e);
    }).join("");
    /* The full text on hover, but ONLY if the line truncated it: a comment
       readable in full does not need repeating. Measured on hover and not at
       render: the screen may render hidden, and everything measures 0. */
    $("#latest-list").onmouseover = ev => {
      const td = ev.target.closest(".last-comment td");
      if (td) td.title = td.scrollWidth > td.clientWidth + 1 ? td.textContent : "";
    };
  }

  /* STOCK IN THE CORNER (v8.89). How many grams are left in each open bag,
     lowest first, under the dashboard title: it is the question you ask
     before brewing, and it should not require scrolling down to the shelf.
     A small jar shows the level, the colour turns red under three cups. A
     bag emptied in the last ten days stays shown as "empty", after the
     others, as a reminder to buy more; beyond that, it disappears. */
  const STOCK_MAX = 4;
  function stockData() {
    const tenDaysAgo = new Date(); tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const cutoff = localDateKey(tenDaysAgo);
    return DATA.state.coffees.filter(c => c.active !== 0).map(c => {
      const stock = DATA.bagStock(c.id, fallbacks.dose);
      if (!stock) return null;
      const ownCups = DATA.state.extractions.filter(e => e.coffee_id === c.id);
      const doses = ownCups.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
      const dose = doses.length ? average(doses) : fallbacks.dose;
      const left = Math.max(0, stock.remaining);
      const latest = ownCups.reduce((m, e) => (String(e.date_time) > m ? String(e.date_time) : m), "");
      if (left <= 0 && latest.slice(0, 10) < cutoff) return null;
      return { coffee: c, leftover: left, pc: Math.min(100, (left / stock.format) * 100), cups: Math.floor(left / dose) };
      // What is left first, lowest to highest; empty bags after.
    }).filter(Boolean).sort((a, b) => (a.leftover <= 0) - (b.leftover <= 0) || a.leftover - b.leftover);
  }
  function renderStockCorner() {
    const zone = $("#stock-corner");
    if (!zone) return;
    const all = stockData();
    zone.hidden = !all.length;
    const shown = all.slice(0, STOCK_MAX);
    zone.innerHTML = shown.map(s => {
      const low = s.cups < 3;
      const tooltip = I18N.t(s.leftover <= 0 ? "stock_chip_empty_title" : "stock_chip_title", { c: I18N.tr(s.coffee.name), g: Math.round(s.leftover), n: s.cups, s: s.cups > 1 ? "s" : "" });
      return '<button type="button" class="sc-bag' + (low ? " low" : "") + '" data-sheet="' + s.coffee.id + '" title="' + titleAttr(tooltip) + '" aria-label="' + titleAttr(tooltip) + '">' +
        '<span class="sc-glass" style="--pc:' + s.pc.toFixed(0) + '%" aria-hidden="true"></span>' +
        '<b>' + (s.leftover <= 0 ? I18N.t("stock_chip_empty") : Math.round(s.leftover) + " g") + "</b>" +
        '<span class="sc-name">' + titleAttr(I18N.tr(s.coffee.name)) + "</span></button>";
    }).join("") + (all.length > STOCK_MAX ? '<span class="sc-plus">+' + (all.length - STOCK_MAX) + "</span>" : "");
  }

  /* Wiring of the dashboard controls. Called once by app.js. */
  function wireDashboard() {
    wireFindings();
    const tabs = $(".tabs-analyses");
    tabs.addEventListener("click", ev => {
      const b = ev.target.closest("[role=tab]");
      if (b) showAnalysis(b.dataset.analysis);
    });
    // Left and right arrows, Home and End: the keyboard of a real tab list.
    tabs.addEventListener("keydown", ev => {
      const list = $$(".tabs-analyses [role=tab]");
      const i = list.findIndex(b => b.getAttribute("aria-selected") === "true");
      const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
      if (target === undefined) return;
      ev.preventDefault();
      showAnalysis(list[(target + list.length) % list.length].dataset.analysis, true);
    });
    let initial = "coffees";
    try { initial = localStorage.getItem(TAB_KEY) || initial; } catch (e) { /* same */ }
    showAnalysis(initial);

    // Delegated on the list: its content is rewritten on every render, one
    // handler per line would leak on each dashboard refresh.
    const openLatest = target => {
      const li = target.closest("[data-ext]");
      if (!li) return;
      const ext = DATA.state.extractions.find(x => x.id === li.dataset.ext);
      if (!ext) return;
      UI.loadExtractionIntoEntry(ext, false);
    };
    /* The table AND the big card open the extraction. Delegating on both
       rather than on document: a global handler would catch clicks from the
       whole dashboard to serve only two areas. */
    [$("#latest-list"), $("#card-last")].forEach(zone => {
      zone.addEventListener("click", ev => openLatest(ev.target));
      zone.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        openLatest(ev.target);
      });
    });
  }

  // Made available to the other screens.
  Object.assign(UI, {
    renderHeatmapLegend, renderStockCorner, visibleWeeks,
    MIN_TASTE_CUPS, WORST_TASTES, HEATMAP_WEEKS, TOP_TASTES,
    wireDashboard, emptyDuelCause, emptyTastesCause, emptyGrindCause,
    updateEmptyCard, renderTastes, renderHeatmapStats, renderDashboard,
    statsHeatmap,
  });
})();
