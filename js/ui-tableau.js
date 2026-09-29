/* Home screen: the activity calendar, the analyses and the latest
 * extractions. The computed sentences live in ui-constats.js and the big
 * card of the last cup in ui-derniere.js (split out in v8.78). */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, animerCompteur, attrTitre, cleLocale, diagsAffiches,
    cleJour, estRatee, extAnalysables, extAvecCalculs, fmtDecimal, fmtHeure, libelleJour, moyenne, nav, replis, trouverRecette } = UI;
  // And from the two pieces moved out of here in v8.78, loaded just before.
  const { MIN_GAP, MIN_SAMPLE, note1, cablerConstats, rendreInsights,
    DERNIERES_AFFICHEES, commentaireDerniere, goutsDerniere, mesuresCourtes, rendreDerniereTasse } = UI;

  // ---------- Activity calendar ----------
  // 18 weeks and not 26: at one or two cups a day, six months of grid are
  // mostly six months of empty cells, which makes it look like the calendar
  // does not work.
  /* Ceiling of the calendar window. The number ACTUALLY shown is computed
     from the container width, see semainesVisibles(): beyond this ceiling
     nothing more is learned, below it things get crammed. */
  const SEMAINES_HEATMAP = 18;
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

  function semainesVisibles() {
    const frame = $("#g-heatmap");
    const available = frame ? frame.clientWidth : 0;
    if (!available) return SEMAINES_HEATMAP;
    const fit = Math.floor((available - 34) / 21);
    return Math.max(MIN_WEEKS, Math.min(SEMAINES_HEATMAP, fit));
  }

  /* Quantifies the displayed period. A grid of cells says nothing measurable
     on its own; these five numbers are what people come looking for.

     The CURRENT STREAK is counted from the last active day, and is only
     announced if that day is today or yesterday. Otherwise, at eight in the
     morning before the first coffee, it would drop to zero every day and
     would no longer mean anything. */
  function statsHeatmap(perDay, weeks) {
    const windowWeeks = weeks || SEMAINES_HEATMAP;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (windowWeeks * 7 - 1));

    const days = [];
    const day = new Date(start);
    while (day <= end) {
      days.push(perDay[cleLocale(day)] || 0);
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

    return { tasses: cups, joursActifs: activeDays, serieEnCours: currentStreak, meilleureSerie: bestStreak, parSemaine: perWeek };
  }

  /* THE SCALE LEGEND. The calendar shades follow an ABSOLUTE scale, so a
     colour always means the same thing: that is what makes a legend useful,
     and that is why it must exist. Without it, the calendar is a run of
     browns. */
  function rendreLegendeHeatmap() {
    const target = $("#heatmap-legende");
    if (!target) return;
    const cells = [0, 1, 2, 3, 4].map(n =>
      '<span class="hm-i hm-n' + n + '"></span>').join("");
    target.innerHTML = '<span>' + I18N.t("hm_leg_moins") + "</span>" + cells +
      "<span>" + I18N.t("hm_leg_plus") + "</span>";
  }

  function rendreStatsHeatmap(perDay, weeks) {
    const windowWeeks = weeks || SEMAINES_HEATMAP;
    const s = statsHeatmap(perDay, windowWeeks);
    if (!s.tasses) {
      $("#heatmap-stats").innerHTML =
        '<p class="carte-vide">' + I18N.t("hm_resume_vide", { s: windowWeeks }) + "</p>";
      return;
    }
    const cells = [
      { v: s.tasses, l: I18N.t("hm_st_tasses") },
      { v: s.joursActifs, l: I18N.t("hm_st_jours") },
      { v: s.serieEnCours, l: I18N.t("hm_st_serie_now") },
      { v: s.meilleureSerie, l: I18N.t("hm_st_serie_max") },
      { v: fmtDecimal(s.parSemaine, 1), l: I18N.t("hm_st_semaine") },
    ];
    $("#heatmap-stats").innerHTML = cells
      .map(c => '<div class="mini-stat"><b>' + c.v + "</b><span>" + c.l + "</span></div>")
      .join("");
  }

  /* An empty chart does not say WHY it is empty, and it reads like a broken
     site. These three cards are the only ones that can stay empty for a long
     time with perfectly valid data, so each one states its real cause
     rather than a generic "no data" that helps nobody. */
  function majCarteVide(id, pointCount, key) {
    const empty = pointCount === 0;
    $("#boite-" + id).hidden = empty;
    const msg = $("#vide-" + id);
    msg.hidden = !empty;
    if (empty) msg.textContent = I18N.t(key);
  }

  function causeMoutureVide(rated) {
    if (!rated.length) return "vide_rien";
    // Most common case for a drinker of pre-ground coffee: the grind is
    // deliberately not stored, so the scatter cannot show anything.
    const allPreGround = rated.every(e => {
      const c = DATA.cafeDe(e);
      return c && Number(c.deja_moulu) === 1;
    });
    return allPreGround ? "vide_mouture_moulu" : "vide_mouture";
  }

  function causeGoutsVide(rated) {
    if (!rated.length) return "vide_rien";
    const withTags = rated.filter(e => (e.descripteurs || "").trim() !== "").length;
    // Tell "you never tick descriptors" apart from "not enough times the
    // same one yet", because the action to take is not the same.
    return withTags === 0 ? "vide_gouts_aucun" : "vide_gouts_seuil";
  }

  /* Average rating per descriptor. It is the only dashboard chart that talks
     about TASTE rather than settings, even though that is what the logbook is
     about. It replaces a scatter of rating against coffee age, which depended
     on a roast date that Vietnamese bags almost never carry: it was therefore
     structurally empty.

     Here the data is always there, since descriptors are ticked on every
     cup. We keep the 10 best and the 5 worst: out of 59 tags, showing all
     would be unreadable, and the extremes carry the information. */
  const MIN_TASSES_GOUT = 3;
  const TOP_GOUTS = 10;
  const PIRES_GOUTS = 5;

  function rendreGouts(rated) {
    const byTag = {};
    rated.forEach(e => {
      (e.descripteurs || "").split("|").filter(Boolean).forEach(tag => {
        (byTag[tag] = byTag[tag] || []).push(e.note_sur_10);
      });
    });

    const ranked = Object.entries(byTag)
      .filter(([, ratings]) => ratings.length >= MIN_TASSES_GOUT)
      .map(([tag, ratings]) => ({ tag, moy: moyenne(ratings), n: ratings.length }))
      .sort((a, b) => b.moy - a.moy);

    if (!ranked.length) {
      $("#note-gouts").textContent = "";
      return [];
    }

    // The extremes, without duplicates if the list is short.
    const kept = ranked.length > TOP_GOUTS + PIRES_GOUTS
      ? [...ranked.slice(0, TOP_GOUTS), ...ranked.slice(-PIRES_GOUTS)]
      : ranked;

    const overallAvg = moyenne(rated.map(e => e.note_sur_10));
    const items = kept.map(c => ({
      label: I18N.tag(c.tag),
      value: +c.moy.toFixed(1),
      extra: I18N.t("b_extractions", { n: c.n }),
    }));
    // Green above your average, red below: without a reference, "7,9" does not
    // say whether it is good for YOU.
    const colors = kept.map(c =>
      c.moy >= overallAvg
        ? getComputedStyle(document.documentElement).getPropertyValue("--ok").trim()
        : getComputedStyle(document.documentElement).getPropertyValue("--danger").trim());

    CHARTS.barresHorizontales("g-gouts", items, colors, I18N.t("axe_note_moy"), 10);
    $("#note-gouts").textContent = I18N.t("gouts_note", {
      m: fmtDecimal(overallAvg, 1),
      n: MIN_TASSES_GOUT,
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
      a: high.label, ma: note1(high.value), b: low.label, mb: note1(low.value),
    });
  }

  function readMachines(nB, nS) {
    if (nB.length < MIN_SAMPLE || nS.length < MIN_SAMPLE) return "";
    const mB = moyenne(nB), mS = moyenne(nS), gap = Math.abs(mB - mS);
    if (gap < MIN_GAP) return I18N.t("lec_machines_egal", { mb: note1(mB), ms: note1(mS) });
    return I18N.t(mS > mB ? "lec_switch_devant" : "lec_brikka_devant", {
      x: note1(gap), s: gap >= 2 ? "s" : "",
      souvent: nB.length === nS.length ? ""
        : I18N.t(nB.length > nS.length ? "lec_souvent_brikka" : "lec_souvent_switch"),
    });
  }

  function readDiagnostics(byDiag) {
    const total = Object.values(byDiag).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(byDiag).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return "";
    return I18N.t("lec_diag", { d: diagsAffiches(sorted[0][0]), n: sorted[0][1], t: total });
  }

  function readGrind(analyzable) {
    let best = null;
    ["Brikka", "Switch"].forEach(m => {
      const byDial = {};
      analyzable.filter(e => e.methode === m && e.note_sur_10 !== "" && e.mouture_dial)
        .forEach(e => (byDial[e.mouture_dial] = byDial[e.mouture_dial] || []).push(e.note_sur_10));
      Object.entries(byDial).filter(([, ns]) => ns.length >= MIN_SAMPLE).forEach(([dial, ns]) => {
        const avg = moyenne(ns);
        if (!best || avg > best.moy) best = { m, dial, moy: avg, n: ns.length };
      });
    });
    return best ? I18N.t(best.m === "Brikka" ? "lec_mouture_brikka" : "lec_mouture_switch", {
      d: best.dial, x: note1(best.moy), n: best.n,
    }) : "";
  }

  function readTastes(items, overallAvg) {
    if (items.length < 2) return "";
    const good = items.filter(i => i.value >= overallAvg).slice(0, 2).map(i => i.label);
    const worst = items[items.length - 1];
    if (!good.length) return "";
    return I18N.t(worst.value < overallAvg ? "lec_gouts" : "lec_gouts_sans_pire", {
      a: good.join(I18N.t("lec_et")), p: worst.label,
    });
  }

  /* The TABS. The chosen tab is remembered in this browser: you come back to
     the question you were asking. The panels are never display: none (see
     .analyses-pile): they are inert and invisible, so that each chart keeps
     its size. */
  const TAB_KEY = "analyse-onglet";
  function showAnalysis(name, focus) {
    const buttons = $$(".onglets-analyses [role=tab]");
    if (!buttons.some(b => b.dataset.analyse === name)) name = "cafes";
    buttons.forEach(b => {
      const active = b.dataset.analyse === name;
      b.setAttribute("aria-selected", String(active));
      b.tabIndex = active ? 0 : -1;
      if (active && focus) b.focus();
      const panel = $("#analyse-" + b.dataset.analyse);
      panel.classList.toggle("courant", active);
      panel.inert = !active;
      panel.setAttribute("aria-hidden", String(!active));
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* without storage, back to Cafés */ }
  }

  function causeDuelVide(rated) {
    if (!rated.length) return "vide_rien";
    const machines = new Set(rated.map(e => e.methode).filter(Boolean));
    // A single brewer used: there is nothing to compare, it is not a bug.
    return machines.size < 2 ? "vide_duel_une_machine" : "vide_duel";
  }

  function rendreTableau() {
    /* TWO data sets, and knowing which one to take is the only question that
       matters here. exts counts WHAT HAPPENED, analyzable advises WHAT TO DO.
       See extAnalysables() in the core for the rule. */
    const exts = extAvecCalculs();
    const analyzable = extAnalysables();
    /* The "include failed cups" toggle lives in the Settings screen since
       v7.91: as a banner here, it took the place of the first figure on every
       opening for a setting changed once a month. */
    const empty = exts.length === 0;
    $("#tableau-vide").hidden = !empty;
    $("#tableau-contenu").hidden = empty;
    if (empty) return;
    rendreStockCoin();

    const today = cleLocale(new Date());
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const mondayKey = cleLocale(monday);
    const currentMonth = today.slice(0, 7);
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

    const ratings = analyzable.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const ratings7d = analyzable.filter(e => e.note_sur_10 !== "" && new Date(e.date_heure) >= weekAgo).map(e => e.note_sur_10);

    // Estimated caffeine per day over the last 7 days.
    const caffeineOf = e => {
      const coffee = DATA.cafeDe(e);
      return cafeineMg(e.dose_g || 0, coffee ? coffee.espece : "", coffee ? coffee.pourcentage_cafe_reel : 100);
    };
    const caffeine7d = exts.filter(e => new Date(e.date_heure) >= weekAgo).reduce((a, e) => a + caffeineOf(e), 0);

    /* FOUR tiles, not seven. Seven aligned figures get COUNTED instead of
       read: you hunt for the one you wanted. The four that remain are those
       that move from one day to the next. The other three, total, overall
       rating and caffeine, have not gone: they move to a line under the grid,
       where they can be read when looked for without taking the glance. */
    const kpis = [
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) === today).length, label: I18N.t("kpi_auj"), dec: 0 },
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) >= mondayKey).length, label: I18N.t("kpi_semaine"), dec: 0 },
      { valeur: moyenne(ratings7d) || 0, label: I18N.t("kpi_note7"), dec: 1, sur10: true },
      { valeur: REGLAGES.ecartACafeEgal(analyzable) || 0, label: I18N.t("kpi_regularite"), dec: 1, plusMoins: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-valeur"><span class="kpi-nombre"></span>' +
      (k.sur10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : k.plusMoins ? "<small> pt</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    /* An average without cups is not zero (v8.38): "0,0 / 10" read like a
       week of failed cups. A dash, with no animation or unit. */
    kpis[2].vide = !ratings7d.length;
    kpis[3].vide = ratings.length < 2;
    $$("#kpis .kpi-nombre").forEach((el, i) => {
      if (kpis[i].vide) {
        el.textContent = "-";
        el.parentElement.querySelector("small")?.remove();
        return;
      }
      animerCompteur(el, kpis[i].valeur, kpis[i].dec, "", kpis[i].plusMoins ? "± " : "");
    });

    /* The three figures taken out of the tiles. They stay readable, in plain
       text, and are no longer in the path of the eye. */
    const row = (caption, value) =>
      "<li><span>" + caption + "</span><b>" + value + "</b></li>";
    $("#kpis-secondaires").innerHTML =
      row(I18N.t("kpi_total"), exts.length) +
      row(I18N.t("kpi_note"), fmtDecimal(moyenne(ratings) || 0, 1) + " / 10") +
      row(I18N.t("kpi_cafeine"), "≈ " + Math.round(caffeine7d / 7) + " mg");

    /* The page header subline: today's date, as in the mockup. */
    $("#tableau-surligne").textContent = now.toLocaleDateString(I18N.locale(),
      { weekday: "long", day: "numeric", month: "long" });

    rendreDerniereTasse(exts);

    rendreInsights(analyzable);

    // Last 30 days: bars, rating, grams, caffeine in the tooltip
    const labels = [], counts = [], averages = [], details = [], trend = [];
    /* The trend is computed over the WHOLE rated history, not over the 30 days:
       a rolling average restarting at the window edge would be empty for the
       first four days shown. It is then projected day by day, keeping the
       last known value, so that it does not break on days without a cup. */
    const rolling = REGLAGES.moyenneGlissante(analyzable, 5);
    let iRoll = 0, latest = null, lastDate = null;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = cleLocale(d);
      const dayCups = exts.filter(e => e.date_heure.slice(0, 10) === key);
      labels.push(d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }));
      counts.push(dayCups.length);
      const dayRatings = dayCups.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
      averages.push(dayRatings.length ? +moyenne(dayRatings).toFixed(1) : null);
      if (!dayCups.length) { details.push(""); continue; }
      const g = dayCups.reduce((a, e) => a + (e.dose_g || 0), 0);
      const mg = dayCups.reduce((a, e) => a + caffeineOf(e), 0);
      const coffeeNames = [...new Set(dayCups.map(e => (DATA.cafeDe(e) || {}).nom).filter(Boolean))];
      details.push(I18N.t("tip_cafe_g", { g: Math.round(g * 10) / 10 }) + "\n" +
        I18N.t("tip_cafeine", { mg }) + "\n" + coffeeNames.join(", "));
    }
    // Second pass: the trend follows the same labels as the bars.
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = cleLocale(d);
      while (iRoll < rolling.length && String(rolling[iRoll].date).slice(0, 10) <= key) {
        if (rolling[iRoll].valeur !== null) {
          latest = rolling[iRoll].valeur;
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
    CHARTS.barresEtLigne30j("g-30jours", labels, counts, averages, details, trend, UI.rendreCafes30j(exts));

    // Heatmap
    const perDay = {}, infoPerDay = {};
    exts.forEach(e => {
      const key = e.date_heure.slice(0, 10);
      perDay[key] = (perDay[key] || 0) + 1;
    });
    const ratingsPerDay = {};
    analyzable.forEach(e => { if (e.note_sur_10 !== "") (ratingsPerDay[e.date_heure.slice(0, 10)] = ratingsPerDay[e.date_heure.slice(0, 10)] || []).push(e.note_sur_10); });
    Object.keys(perDay).forEach(key => { if (ratingsPerDay[key]) infoPerDay[key] = I18N.t("d_note") + " " + moyenne(ratingsPerDay[key]).toFixed(1); });
    /* As many weeks as the card can show, without scrolling. The same number
       goes to the five figures below: the grid and its summary describe the
       same window. */
    const weeks = semainesVisibles();
    CHARTS.heatmap("g-heatmap", perDay, infoPerDay, weeks);
    $("#heatmap-titre").textContent = I18N.t("hm_titre", { n: weeks });
    rendreStatsHeatmap(perDay, weeks);
    rendreLegendeHeatmap();

    /* ON FIRST RENDER the card has no width yet: semainesVisibles() falls back
       to the ceiling and draws 18 weeks squashed to scale. Once layout is
       done, we recount, and only redraw if the count changed. The flag
       prevents the loop: a single catch-up. */
    if (!heatmapRecounted) {
      heatmapRecounted = true;
      setTimeout(() => {
        heatmapRecounted = false;
        if (nav.ecran === "tableau" && semainesVisibles() !== weeks) UI.rendreTableau();
      }, 0);
    }

    // Average rating per coffee
    const byCoffee = {};
    exts.forEach(e => {
      if (e.note_sur_10 === "") return;
      (byCoffee[e._c.cafe_nom] = byCoffee[e._c.cafe_nom] || []).push(e.note_sur_10);
    });
    const coffeeItems = Object.entries(byCoffee)
      .map(([name, ns]) => ({ label: I18N.tr(name), value: +moyenne(ns).toFixed(1), extra: I18N.t("b_extractions", { n: ns.length }), nomBrut: name }))
      .sort((a, b) => b.value - a.value);
    // The reference coffee (benchmark) stands out in green.
    const coffeeColors = coffeeItems.map(i => {
      const c = DATA.state.cafes.find(x => x.nom === i.nomBrut);
      return c && (c.tag || "").includes("référence") ? CHARTS.C_DEUX : undefined;
    });
    const coffeeAccents = coffeeColors.some(Boolean) ? coffeeColors.map(c => c || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) : null;
    CHARTS.barresHorizontales("g-cafes", coffeeItems, coffeeAccents, I18N.t("axe_note_moy"), 10);
    $("#lecture-cafes").textContent = readRanking(
      coffeeItems.map(i => ({ ...i, n: byCoffee[i.nomBrut].length })), "lec_cafes_deux", "lec_cafes");

    // Brikka versus Switch duel
    const brikka = analyzable.filter(e => e.methode === "Brikka");
    const swtch = analyzable.filter(e => e.methode === "Switch");
    const nB = brikka.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const nS = swtch.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    $("#duel-machines").innerHTML =
      '<div class="duel-col brikka"><b>' + brikka.length + "</b><span>" + I18N.t("d_ext_brikka") + "</span><b>" +
      (nB.length ? moyenne(nB).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>" +
      '<div class="duel-col switch"><b>' + swtch.length + "</b><span>" + I18N.t("d_ext_switch") + "</span><b>" +
      (nS.length ? moyenne(nS).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>";

    // Coffees brewed in both brewers
    const bothCoffees = DATA.state.cafes.filter(c => {
      const eb = analyzable.some(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "");
      const es = analyzable.some(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "");
      return eb && es;
    });
    CHARTS.comparatifMachines("g-duel",
      bothCoffees.map(c => c.nom),
      bothCoffees.map(c => +moyenne(analyzable.filter(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)),
      bothCoffees.map(c => +moyenne(analyzable.filter(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)));

    // Scatter plots
    const pts = m => analyzable
      .filter(e => e.methode === m && e.note_sur_10 !== "" && e._c.microns !== "")
      .map(e => ({ x: e._c.microns, y: e.note_sur_10, nom: e._c.cafe_nom + ", " + e.mouture_dial }));
    CHARTS.nuage("g-mouture", pts("Brikka"), pts("Switch"), I18N.t("axe_mouture"), "µm");

    const rated = analyzable.filter(e => e.note_sur_10 !== "");
    const tastes = rendreGouts(rated);
    $("#lecture-gouts").textContent = readTastes(tastes, moyenne(rated.map(e => e.note_sur_10)) || 0);
    $("#lecture-machines").textContent = readMachines(nB, nS);
    $("#lecture-mouture").textContent = readGrind(analyzable);

    // The three cards that can stay empty with valid data.
    majCarteVide("mouture", pts("Brikka").length + pts("Switch").length, causeMoutureVide(rated));
    majCarteVide("gouts", tastes.length, causeGoutsVide(rated));
    majCarteVide("aromes", CHARTS.roueAromes(rated), causeGoutsVide(rated));
    majCarteVide("duel", bothCoffees.length, causeDuelVide(rated));

    // Diagnostics
    const byDiag = {};
    analyzable.forEach(e => (e.diagnostic || "").split("|").filter(Boolean).forEach(d => {
      byDiag[d] = (byDiag[d] || 0) + 1;
    }));
    const diagLabels = DIAGNOSTICS.filter(d => byDiag[d]);
    CHARTS.anneauDiagnostics("g-diagnostics", diagLabels, diagLabels.map(d => byDiag[d]));
    $("#lecture-diagnostics").textContent = readDiagnostics(byDiag);

    // Rating per recipe
    const byRecipe = {};
    analyzable.forEach(e => {
      if (e.note_sur_10 === "" || !e.recette) return;
      (byRecipe[e.recette] = byRecipe[e.recette] || []).push(e.note_sur_10);
    });
    const recipeItems = Object.entries(byRecipe)
      .map(([name, ns]) => ({ label: name, value: +moyenne(ns).toFixed(1), extra: I18N.t("b_extractions", { n: ns.length }) }))
      .sort((a, b) => b.value - a.value);
    const recipeColors = recipeItems.map(i => {
      const r = trouverRecette(i.label);
      return r ? (r.methode === "Brikka" ? CHARTS.C_BRIKKA : CHARTS.C_SWITCH) : CHARTS.C_DEUX;
    });
    CHARTS.barresHorizontales("g-recettes", recipeItems, recipeColors, I18N.t("axe_note_moy"), 10);
    $("#lecture-recettes").textContent = readRanking(
      recipeItems.map(i => ({ ...i, label: I18N.tr(i.label), n: byRecipe[i.label].length })), "lec_recettes_deux", "lec_recettes");

    // 5 latest
    /* EIGHT and not five: the card stretches to the height of its row, and
       five lines left a big blank there. Lines are better than emptiness. */
    const latestCups = [...exts].sort((a, b) => b.date_heure.localeCompare(a.date_heure))
      .slice(0, DERNIERES_AFFICHEES);
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
    $("#dernieres-liste").innerHTML = latestCups.map(e => {
      const day = cleJour(e.date_heure);
      const header = day !== currentDay
        ? '<tr class="d-jour"><th colspan="5" scope="colgroup">' + libelleJour(e.date_heure) + "</th></tr>" : "";
      currentDay = day;
      return header +
      '<tr class="derniere-cliquable' + (estRatee(e) ? " ligne-ratee" : "") +
      '" data-ext="' + e.id + '" tabindex="0" role="button" title="' + attrTitre(I18N.t("h_editer")) + '">' +
      '<td class="d-quand">' + fmtHeure(e.date_heure) + "</td>" +
      '<td class="d-cafe"><span class="pastille-methode ' + e.methode.toLowerCase() +
        '" title="' + attrTitre(e.methode) + '"></span><b>' + I18N.tr(e._c.cafe_nom) + "</b>" +
        (estRatee(e) ? '<span class="mention-ratee">' + I18N.t("rt_badge") + "</span>" : "") + "</td>" +
      '<td class="d-mesures">' +
        (e.recette ? '<span class="d-recette">' + I18N.tr(e.recette) + "</span>" : "") +
        mesuresCourtes(e) +
        (e.diagnostic ? '<span class="d-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
      "</td>" +
      '<td class="d-gouts">' + goutsDerniere(e) + "</td>" +
      '<td class="d-note">' + (e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) : "") + "</td></tr>" +
      commentaireDerniere(e);
    }).join("");
    /* The full text on hover, but ONLY if the line truncated it: a comment
       readable in full does not need repeating. Measured on hover and not at
       render: the screen may render hidden, and everything measures 0. */
    $("#dernieres-liste").onmouseover = ev => {
      const td = ev.target.closest(".derniere-commentaire td");
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
    const cutoff = cleLocale(tenDaysAgo);
    return DATA.state.cafes.filter(c => c.actif !== 0).map(c => {
      const stock = DATA.stockSachet(c.id, replis.dose);
      if (!stock) return null;
      const ownCups = DATA.state.extractions.filter(e => e.cafe_id === c.id);
      const doses = ownCups.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
      const dose = doses.length ? moyenne(doses) : replis.dose;
      const left = Math.max(0, stock.restant);
      const latest = ownCups.reduce((m, e) => (String(e.date_heure) > m ? String(e.date_heure) : m), "");
      if (left <= 0 && latest.slice(0, 10) < cutoff) return null;
      return { cafe: c, reste: left, pc: Math.min(100, (left / stock.format) * 100), tasses: Math.floor(left / dose) };
      // What is left first, lowest to highest; empty bags after.
    }).filter(Boolean).sort((a, b) => (a.reste <= 0) - (b.reste <= 0) || a.reste - b.reste);
  }
  function rendreStockCoin() {
    const zone = $("#stock-coin");
    if (!zone) return;
    const all = stockData();
    zone.hidden = !all.length;
    const shown = all.slice(0, STOCK_MAX);
    zone.innerHTML = shown.map(s => {
      const low = s.tasses < 3;
      const tooltip = I18N.t(s.reste <= 0 ? "sc_vide_titre" : "sc_titre", { c: I18N.tr(s.cafe.nom), g: Math.round(s.reste), n: s.tasses, s: s.tasses > 1 ? "s" : "" });
      return '<button type="button" class="sc-sachet' + (low ? " bas" : "") + '" data-fiche="' + s.cafe.id + '" title="' + attrTitre(tooltip) + '" aria-label="' + attrTitre(tooltip) + '">' +
        '<span class="sc-verre" style="--pc:' + s.pc.toFixed(0) + '%" aria-hidden="true"></span>' +
        '<b>' + (s.reste <= 0 ? I18N.t("sc_vide") : Math.round(s.reste) + " g") + "</b>" +
        '<span class="sc-nom">' + attrTitre(I18N.tr(s.cafe.nom)) + "</span></button>";
    }).join("") + (all.length > STOCK_MAX ? '<span class="sc-plus">+' + (all.length - STOCK_MAX) + "</span>" : "");
  }

  /* Wiring of the dashboard controls. Called once by app.js. */
  function cablerTableau() {
    cablerConstats();
    const tabs = $(".onglets-analyses");
    tabs.addEventListener("click", ev => {
      const b = ev.target.closest("[role=tab]");
      if (b) showAnalysis(b.dataset.analyse);
    });
    // Left and right arrows, Home and End: the keyboard of a real tab list.
    tabs.addEventListener("keydown", ev => {
      const list = $$(".onglets-analyses [role=tab]");
      const i = list.findIndex(b => b.getAttribute("aria-selected") === "true");
      const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
      if (target === undefined) return;
      ev.preventDefault();
      showAnalysis(list[(target + list.length) % list.length].dataset.analyse, true);
    });
    let initial = "cafes";
    try { initial = localStorage.getItem(TAB_KEY) || initial; } catch (e) { /* same */ }
    showAnalysis(initial);

    // Delegated on the list: its content is rewritten on every render, one
    // handler per line would leak on each dashboard refresh.
    const openLatest = target => {
      const li = target.closest("[data-ext]");
      if (!li) return;
      const ext = DATA.state.extractions.find(x => x.id === li.dataset.ext);
      if (!ext) return;
      UI.chargerExtractionDansSaisie(ext, false);
    };
    /* The table AND the big card open the extraction. Delegating on both
       rather than on document: a global handler would catch clicks from the
       whole dashboard to serve only two areas. */
    [$("#dernieres-liste"), $("#carte-derniere")].forEach(zone => {
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
    rendreLegendeHeatmap, rendreStockCoin, semainesVisibles,
    MIN_TASSES_GOUT, PIRES_GOUTS, SEMAINES_HEATMAP, TOP_GOUTS,
    cablerTableau, causeDuelVide, causeGoutsVide, causeMoutureVide,
    majCarteVide, rendreGouts, rendreStatsHeatmap, rendreTableau,
    statsHeatmap,
  });
})();
