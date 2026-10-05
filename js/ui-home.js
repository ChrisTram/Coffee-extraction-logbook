/* L1 (v9.21): THE HOME, IN THREE QUESTIONS.
 *
 * What did I drink, where are my bags, how is my week. ui-dashboard.js draws
 * the corner, the last cup and the latest cups; this file adds what the home
 * learned in v9.21:
 *
 *   - the WEEK in one line (cups, average, best), and on a wide screen in the
 *     head with a bar per day, tinted by the score (the recap's bars);
 *   - on a wide screen, a column with the BAGS in their jars (Q8), the lowest
 *     first, in grams and cups left;
 *   - ONE finding « À retenir », that turns (1 sur 5), the others in Analyses;
 *   - « À brasser, si tu veux » at the very bottom, small, hidden for the day
 *     on request: a bag to finish or to come back to, with its setting, and
 *     « Brasser » prefills the entry through the « Refaire » path;
 *   - THE BAND (J4): scrolling down, the last cup folds into a band stuck at
 *     the top, its name and its score flying from the card into it;
 *   - the blocks arrive one after the other when the screen opens.
 *
 * The pure parts (the week, the suggestion, which finding first) take their
 * data as arguments: tools/home.test.mjs runs them without a page. */
"use strict";

(() => {

  const { $, titleAttr, localDateKey, fmtDecimal, average, nav } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const dayOf = dt => String(dt).slice(0, 10);

  // ---------- The week (pure) ----------

  /* The CURRENT week, Monday to Sunday, as the mockup's « 28 sept. au 4 oct. »:
     a bar per day (cups, and their average for the tint), the cups, the
     rated average and the best cup. Days still to come are marked as such. */
  function weekSummary(exts, analyzable, now) {
    const start = new Date(now || new Date());
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const today = localDateKey(now || new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      return { date: d, key: localDateKey(d) };
    });
    const keys = new Set(days.map(d => d.key));
    const cups = exts.filter(e => keys.has(dayOf(e.date_time)));
    const rated = analyzable.filter(e => e.score_10 !== "" && e.score_10 !== undefined && keys.has(dayOf(e.date_time)));
    days.forEach(d => {
      d.n = cups.filter(e => dayOf(e.date_time) === d.key).length;
      const notes = rated.filter(e => dayOf(e.date_time) === d.key).map(e => Number(e.score_10));
      d.mean = notes.length ? average(notes) : null;
      d.future = d.key > today;
    });
    const best = rated.slice().sort((a, b) => Number(b.score_10) - Number(a.score_10) ||
      String(b.date_time).localeCompare(String(a.date_time)))[0];
    return {
      start: start, end: days[6].date, days: days, cups: cups.length, rated: rated.length,
      mean: rated.length ? average(rated.map(e => Number(e.score_10))) : null,
      best: best ? { id: best.id, score: Number(best.score_10), date_time: best.date_time, coffee_id: best.coffee_id } : null,
    };
  }

  /* v9.25: YOUR MONTH, at the foot of the side column. The last 30 days as
     Analyses counts them (UI.timeBars, a bar per day), the cups, the rated
     average, and the next cup milestone with how far along the way to it
     the logbook is (from the milestone before, or from zero). */
  function monthSummary(exts, analyzable, now) {
    const t = UI.timeBars(exts, analyzable, "30", now);
    const from = t.bars[0].from, to = t.bars[t.bars.length - 1].to;
    const notes = analyzable.filter(e => e.score_10 !== "" && e.score_10 !== undefined &&
      dayOf(e.date_time) >= from && dayOf(e.date_time) <= to).map(e => Number(e.score_10));
    const ms = typeof MILESTONES === "object" && MILESTONES ? MILESTONES : null;
    const next = ms ? ms.nextCups(exts) : null;
    let progress = null;
    if (next) {
      const done = next.n - next.left;
      const prev = ms.CUPS.filter(k => k <= done).pop() || 0;
      progress = Math.max(0, Math.min(1, (done - prev) / (next.n - prev)));
    }
    return {
      bars: t.bars, cups: t.bars.reduce((sum, b) => sum + b.n, 0),
      mean: notes.length ? average(notes) : null, next: next, progress: progress,
    };
  }

  // « aujourd'hui », « hier », or the weekday: the best cup of the week is in it.
  function weekDayWord(dt, now) {
    const d = new Date(String(dt).slice(0, 10) + "T12:00"), t = new Date(now || new Date());
    t.setHours(12, 0, 0, 0);
    const gap = Math.round((t - d) / 86400000);
    if (gap === 0) return I18N.t("date_today").toLowerCase();
    if (gap === 1) return I18N.t("date_yesterday").toLowerCase();
    return d.toLocaleDateString(I18N.locale(), { weekday: "long" });
  }

  // ---------- The suggestion (pure) ----------

  /* « À BRASSER, SI TU VEUX » (I3). Among the open bags (the corner's list,
     grams left above zero), in this order: one down to three cups or less,
     to finish while it is good (the lowest); one not brewed for three days
     or more, or never; otherwise the best average. With its setting: the
     winning one (TUNING.forCoffee), else the setting of its latest cup.
     Returns null when no bag is open. */
  function brewSuggestion(o) {
    const now = o.now || new Date();
    const open = (o.bags || []).filter(b => b.leftover > 0);
    if (!open.length) return null;
    const today = new Date(now); today.setHours(12, 0, 0, 0);
    const lastOf = id => o.exts.filter(e => e.coffee_id === id).reduce((m, e) => (String(e.date_time) > m ? String(e.date_time) : m), "");
    const idleDays = id => {
      const last = lastOf(id);
      return last ? Math.round((today - new Date(dayOf(last) + "T12:00")) / 86400000) : null;
    };
    let pick = null, reason = null;
    const low = open.filter(b => b.cups <= 3).sort((a, b) => a.leftover - b.leftover)[0];
    if (low) { pick = low; reason = { key: "brew_reason_low", vars: { g: Math.round(low.leftover) } }; }
    if (!pick) {
      const idle = open.map(b => ({ b, d: idleDays(b.coffee.id) })).filter(x => x.d === null || x.d >= 3)
        .sort((a, b) => (b.d === null ? 1e9 : b.d) - (a.d === null ? 1e9 : a.d))[0];
      if (idle) { pick = idle.b; reason = idle.d === null ? { key: "brew_reason_new", vars: {} } : { key: "brew_reason_idle", vars: { n: idle.d } }; }
    }
    if (!pick) {
      const ranked = open.map(b => {
        const notes = o.analyzable.filter(e => e.coffee_id === b.coffee.id && e.score_10 !== "").map(e => Number(e.score_10));
        return { b, m: notes.length ? average(notes) : null };
      }).filter(x => x.m !== null).sort((a, b) => b.m - a.m);
      pick = ranked.length ? ranked[0].b : open[0];
      reason = ranked.length ? { key: "brew_reason_best", vars: { m: fmtRating(ranked[0].m) } }
        : { key: "brew_reason_low", vars: { g: Math.round(pick.leftover) } };
    }
    const id = pick.coffee.id;
    const report = TUNING.forCoffee(id, o.analyzable);
    let ref = report.best ? o.exts.find(e => e.id === report.best.referenceId) : null;
    const kind = ref ? "best" : "last";
    if (!ref) ref = o.exts.filter(e => e.coffee_id === id).sort((a, b) => String(b.date_time).localeCompare(String(a.date_time)))[0] || null;
    return { coffeeId: id, coffeeName: pick.coffee.name, reason: reason, kind: kind, refId: ref ? ref.id : null,
      recipe: ref ? ref.recipe || "" : pick.coffee.recommended_recipe || "", grind: ref ? ref.grind_dial || "" : "",
      method: ref ? ref.method : "", temperature: ref ? ref.temperature_c : "", heat: ref ? ref.heat_level : "" };
  }

  /* Which finding opens the card: a different one each day, so the card does
     not say the same thing every morning. */
  function findingStart(count, key) {
    if (!(count > 0)) return 0;
    const n = String(key || "").split("").reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7);
    return n % count;
  }

  // ---------- The week, drawn ----------

  /* Rewritten only when what it says changed (compared with what was
     written, not with innerHTML, which the browser serializes its own way):
     a sync answering twice must not cut a movement under way. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el || written.get(el) === html) return false;
    written.set(el, html);
    el.innerHTML = html;
    return true;
  }

  /* A bar per day: the height counts the cups, the tint says their average
     (the recap's rule, v8.87: pale at 4 and below, full at 9). */
  const tint = m => (m === null ? 0.45 : Math.max(0.28, Math.min(1, (m - 4) / 5)));
  let weekShown = null;
  function renderWeek(w, morning) {
    const card = $("#home-week"), line = $("#home-week-line");
    if (!card || !line) return;
    if (!w) { card.hidden = true; line.hidden = true; return; }
    const fmtDay = d => d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
    const cupsText = I18N.t("home_week_cups", { n: w.cups, s: w.cups > 1 ? "s" : "" });
    const avgText = w.mean !== null ? I18N.t("home_week_avg", { m: fmtRating(w.mean) }) : I18N.t("home_week_unrated");
    const bestText = w.best ? I18N.t("home_week_best", { b: fmtRating(w.best.score), d: weekDayWord(w.best.date_time) }) : "";
    /* The line of a phone says the average as a bare figure, as the mockup's
       « 9 tasses · 7,8 · la meilleure, 9 hier »: one line, not two. */
    const shortAvg = w.mean !== null ? fmtRating(w.mean) : avgText;
    const figuresWith = avg => w.cups
      ? '<b class="hw-cups">' + escapeHtml(cupsText) + '</b><span class="hw-sep" aria-hidden="true">·</span><span class="hw-avg">' + escapeHtml(avg) + "</span>" +
        (bestText ? '<span class="hw-sep" aria-hidden="true">·</span><span class="hw-best">' + escapeHtml(bestText) + "</span>" : "")
      : '<span class="hw-none">' + escapeHtml(I18N.t("home_week_none")) + "</span>";
    const figures = figuresWith(avgText);
    const max = Math.max(1, ...w.days.map(d => d.n));
    const bars = w.days.map(d => '<span class="hw-day' + (d.future ? " future" : "") + '"><i style="--h:' +
      (d.n ? Math.max(0.14, d.n / max) : 0.06).toFixed(2) + ";--o:" + tint(d.mean).toFixed(2) + '"></i><small>' +
      escapeHtml(d.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" })) + "</small></span>").join("");
    const title = I18N.t("recap_title", { a: w.start.getMonth() === w.end.getMonth() ? String(w.start.getDate()) : fmtDay(w.start), b: fmtDay(w.end) });
    card.hidden = false;
    card.setAttribute("aria-label", title + ". " + (w.cups ? [cupsText, avgText, bestText].filter(Boolean).join(", ") : I18N.t("home_week_none")) + ". " + I18N.t("home_week_aria"));
    card.innerHTML = '<span class="hw-head"><span class="hw-title">' + escapeHtml(title) + '</span><span class="hw-figures">' + figures + "</span></span>" +
      '<span class="hw-bars" aria-hidden="true">' + bars + "</span>";
    line.hidden = false;
    line.title = I18N.t("home_week_aria");
    line.setAttribute("aria-label", card.getAttribute("aria-label"));
    line.innerHTML = '<span class="hw-label">' + escapeHtml(I18N.t("home_week_label")) + '</span><span class="hw-figures">' + figuresWith(shortAvg) + "</span>" +
      '<span class="hw-bars hw-mini" aria-hidden="true">' + bars + "</span>" + UI.icon("chevron");
    /* Q13: a cup that came in from the other device, the counts roll from
       what they showed; Q7: the first opening of the day, the bars grow. */
    if (weekShown && UI.arrivalsPlaying()) {
      [[card, avgText, weekShown.avg], [line, shortAvg, weekShown.shortAvg]].forEach(([el, avg, was]) => {
        const c = el.querySelector(".hw-cups"), a = el.querySelector(".hw-avg");
        if (c && weekShown.cups !== cupsText) UI.rollText(c, cupsText, weekShown.cups);
        if (a && was !== avg) UI.rollText(a, avg, was);
      });
    }
    weekShown = { cups: cupsText, avg: avgText, shortAvg: shortAvg };
    if (morning) [card, line].forEach(el => growBars(el, morning));
  }

  // The bars of the week grow from the ground, one after the other (Q7).
  function growBars(el, a) {
    if (!a || !el || !el.classList) return;
    const elapsed = performance.now() - a.t0;
    if (elapsed > 950) return;
    el.style.setProperty("--morning-shift", (-elapsed).toFixed(0) + "ms");
    [...el.querySelectorAll(".hw-day i")].forEach((bar, i) => bar.style.setProperty("--d", String(i)));
    el.classList.add("morning-grow");
    setTimeout(() => el.classList.remove("morning-grow"), Math.max(0, 1150 - elapsed));
  }

  /* The month's card: its figures, a thin bar per day, the milestone ring. */
  function renderMonthCard(m) {
    const card = $("#home-month");
    if (!card) return;
    if (!m || !m.cups) { card.hidden = true; put(card, ""); return; }
    const cupsText = I18N.t("home_week_cups", { n: m.cups, s: m.cups > 1 ? "s" : "" });
    const avgText = m.mean !== null ? I18N.t("home_week_avg", { m: fmtRating(m.mean) }) : I18N.t("home_week_unrated");
    const max = Math.max(1, ...m.bars.map(b => b.n));
    const bars = m.bars.map((b, i) => "<i" + (b.n ? "" : ' class="zero"') + ' style="--h:' + (b.n ? Math.max(0.12, b.n / max) : 0.05).toFixed(2) +
      ";--o:" + tint(b.mean).toFixed(2) + ";--i:" + i + '"></i>').join("");
    const day = b => b.date.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
    const nextText = m.next ? I18N.t("ms_next", { n: m.next.n, k: m.next.left }) : "";
    const ring = m.next ? '<svg class="hm-ring" viewBox="0 0 36 36" aria-hidden="true" style="--p:' + Math.round(m.progress * 100) + '">' +
      '<circle class="hm-ring-bg" cx="18" cy="18" r="15.9"></circle><circle class="hm-ring-on" cx="18" cy="18" r="15.9" pathLength="100"></circle></svg>' : "";
    card.hidden = false;
    card.setAttribute("aria-label", I18N.t("home_month_title") + ". " + cupsText + ", " + avgText + ". " +
      (nextText ? nextText + ". " : "") + I18N.t("home_month_aria"));
    put(card, '<span class="hm-head"><span class="hw-title">' + escapeHtml(I18N.t("home_month_title")) + "</span>" +
      '<span class="hw-figures"><b>' + escapeHtml(cupsText) + '</b><span class="hw-sep" aria-hidden="true">·</span>' + escapeHtml(avgText) + "</span>" +
      UI.icon("chevron") + "</span>" +
      '<span class="hm-bars" aria-hidden="true" style="--count:' + m.bars.length + '">' + bars + "</span>" +
      '<span class="hm-axis" aria-hidden="true"><span>' + escapeHtml(day(m.bars[0])) + "</span><span>" +
      escapeHtml(I18N.t("date_today").toLowerCase()) + "</span></span>" +
      (nextText ? '<span class="hm-next">' + ring + "<span>" + escapeHtml(nextText) + "</span></span>" : ""));
  }

  /* v9.25: the side column follows the scroll on a wide screen (sticky,
     css/home.css). Under the band of the last cup when it fits the window;
     taller than the window, a negative top: it scrolls down to its foot
     first, then stays. Only a value: the phone's single column ignores it. */
  const SIDE_TOP = 84, SIDE_FOOT = 18;
  function sideTop(height, view) {
    if (!(height > 0) || !(view > 0)) return SIDE_TOP;
    return height + SIDE_TOP + SIDE_FOOT <= view ? SIDE_TOP : Math.round(view - height - SIDE_FOOT);
  }
  function placeSide() {
    const side = $("#home-side");
    if (!side || !side.style || typeof window.innerHeight !== "number") return;
    side.style.setProperty("--home-side-top", sideTop(side.offsetHeight, window.innerHeight) + "px");
  }

  // ---------- The bags, in their jars ----------

  const BAGS_SHOWN = 5;
  let bagsHtml = "";
  /* Q9 (v9.18): a bag at its end shows its scene here, on top, in place of
     its row: the jar tilts, « vide », Racheter, then the bag to open and the
     setting to take up again (js/ui-bag-end.js, layout "corner"; its buttons
     work by themselves). The column only exists on a wide screen: a phone
     has the corner's pill, which opens « Mes cafés ». */
  function renderBags(morning) {
    const card = $("#home-bags");
    if (!card) return;
    const ends = typeof UI.bagEndCoffees === "function" ? UI.bagEndCoffees() : [];
    const scenes = ends.map((id, i) => UI.bagEndScene(id, { layout: "corner", index: i })).filter(Boolean);
    const all = UI.stockData().filter(s => !ends.includes(s.coffee.id));
    card.hidden = !all.length && !scenes.length;
    if (card.hidden) { bagsHtml = ""; return; }
    const html = '<div class="card-head"><h3>' + escapeHtml(I18N.t("home_bags_title")) + "</h3></div>" +
      (scenes.length ? '<div class="hb-ends">' + scenes.join("") + "</div>" : "") +
      '<ul class="hb-list">' + all.slice(0, BAGS_SHOWN).map(s => {
        const low = s.cups < 3, empty = s.leftover <= 0;
        const tip = I18N.t(empty ? "stock_chip_empty_title" : "stock_chip_title", { c: I18N.tr(s.coffee.name), g: Math.round(s.leftover), n: s.cups, s: s.cups > 1 ? "s" : "" });
        return '<li><button type="button" class="hb-bag' + (low ? " low" : "") + '" data-sheet="' + titleAttr(s.coffee.id) + '" aria-label="' + titleAttr(tip) + '">' +
          '<span class="hb-jar"' + UI.jarData({ coffeeId: s.coffee.id, grams: s.leftover, bag: s.bag, low: low }) + ">" +
            UI.jarSvg({ grams: s.leftover, bag: s.bag, roast: UI.jarRoast(s.coffee) }) + "</span>" +
          '<span class="hb-text"><span class="hb-name">' + escapeHtml(I18N.tr(s.coffee.name)) + "</span>" +
            '<span class="hb-figures"><b' + (empty ? "" : ' data-jar-grams="' + titleAttr(s.coffee.id) + '"') + ">" +
              escapeHtml(empty ? I18N.t("stock_chip_empty") : Math.round(s.leftover) + " g") + "</b>" +
              (empty ? "" : "<small>" + escapeHtml(I18N.t("home_bag_cups", { n: s.cups, s: s.cups > 1 ? "s" : "" })) + "</small>") + "</span>" +
            '<span class="hb-level" aria-hidden="true"><i style="--pc:' + s.pc.toFixed(0) + '%"></i></span></span>' +
          "</button></li>";
      }).join("") + "</ul>" +
      (all.length > BAGS_SHOWN ? '<p class="hb-more">' + escapeHtml(I18N.t("home_bag_more", { n: all.length - BAGS_SHOWN })) + "</p>" : "");
    if (html !== bagsHtml) { card.innerHTML = html; bagsHtml = html; }
    // The jars move with the corner's (the same flight per coffee); the morning fills them once.
    UI.playJars(card, morning && !morning.bagsFilled ? { from: 0, quiet: true } : undefined);
    if (morning) morning.bagsFilled = true;
    // The end of a bag plays the first time it is seen (never in the hidden column of a phone).
    if (scenes.length && typeof UI.playBagScenes === "function") UI.playBagScenes(card);
  }

  // ---------- One finding, that turns ----------

  const finding = { list: [], index: null, day: "", timer: null, paused: false };
  const ROTATE_MS = 12000;
  function findingMarkup(c) {
    return '<p class="hf-text">' + c.text + "</p>" +
      (c.confidence ? '<p class="hf-proof">' + escapeHtml(I18N.t("finding_" + c.confidence)) + " · " +
        escapeHtml(I18N.t("finding_counts", { h: c.high.n, b: c.low.n })) + "</p>" : "");
  }
  function renderFinding(analyzable) {
    const card = $("#home-finding");
    if (!card) return;
    const list = UI.computeInsights(analyzable).filter(c => c.high);
    card.hidden = !list.length;
    finding.list = list;
    if (!list.length) { put(card, ""); return; }
    const today = localDateKey(new Date());
    if (finding.index === null || finding.day !== today) { finding.index = findingStart(list.length, today); finding.day = today; }
    finding.index %= list.length;
    const html = '<div class="card-head"><h3>' + escapeHtml(I18N.t("home_finding_title")) + "</h3>" +
      (list.length > 1 ? '<button type="button" class="btn-square-small hf-next" data-finding-next aria-label="' +
        titleAttr(I18N.t("home_finding_next")) + '">' + UI.icon("chevron") + "</button>" : "") + "</div>" +
      '<div class="hf-stage" aria-live="polite">' + findingMarkup(list[finding.index]) + "</div>" +
      '<p class="hf-foot"><span class="hf-pos">' + (list.length > 1 ? escapeHtml(I18N.t("home_finding_pos", { i: finding.index + 1, n: list.length })) : "") + "</span>" +
      '<button type="button" class="link-card hf-all" data-home-go="analytics">' + escapeHtml(I18N.t("home_finding_all")) + " ›</button></p>";
    put(card, html);
  }

  /* The next finding slides in from the right while the shown one leaves to
     the left. Calm: it is simply replaced. */
  function nextFinding(step) {
    const card = $("#home-finding");
    const list = finding.list;
    if (!card || list.length < 2) return;
    finding.index = (finding.index + (step || 1) + list.length) % list.length;
    const stage = card.querySelector(".hf-stage"), pos = card.querySelector(".hf-pos");
    if (pos) pos.textContent = I18N.t("home_finding_pos", { i: finding.index + 1, n: list.length });
    if (!stage) return;
    if (calm() || hidden() || typeof stage.insertAdjacentHTML !== "function") { stage.innerHTML = findingMarkup(list[finding.index]); return; }
    [...stage.children].forEach(el => { if (el.classList.contains("hf-out")) el.remove(); });
    const old = document.createElement("div");
    old.className = "hf-slide hf-out";
    old.setAttribute("aria-hidden", "true");
    while (stage.firstChild) old.appendChild(stage.firstChild);
    stage.appendChild(old);
    const fresh = document.createElement("div");
    fresh.className = "hf-slide hf-in";
    fresh.innerHTML = findingMarkup(list[finding.index]);
    stage.appendChild(fresh);
    setTimeout(() => { old.remove(); while (fresh.firstChild) stage.insertBefore(fresh.firstChild, fresh); fresh.remove(); }, 520);
  }

  /* It turns by itself every twelve seconds, but only seen: the home on
     screen, the page visible, the card in view, nobody reading it (pointer
     over it or focus inside), and never with reduced motion. */
  function startRotation() {
    if (finding.timer || typeof setInterval !== "function") return;
    finding.timer = setInterval(() => {
      const card = $("#home-finding");
      if (!card || card.hidden || finding.paused || calm() || hidden() || nav.screenName !== "dashboard") return;
      if (typeof card.getBoundingClientRect !== "function" || typeof window.innerHeight !== "number") return;
      const r = card.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || !r.height) return;
      nextFinding(1);
    }, ROTATE_MS);
  }

  // ---------- À brasser, si tu veux ----------

  const BREW_KEY = "brew-hint-hidden";
  let suggestion = null;
  function renderBrew(exts, analyzable) {
    const zone = $("#home-brew");
    if (!zone) return;
    let hiddenDay = null;
    try { hiddenDay = localStorage.getItem(BREW_KEY); } catch (e) { /* without storage, it shows */ }
    suggestion = hiddenDay === localDateKey(new Date()) ? null
      : brewSuggestion({ bags: UI.stockData(), exts: exts, analyzable: analyzable, now: new Date() });
    zone.hidden = !suggestion;
    if (!suggestion) { put(zone, ""); return; }
    const s = suggestion;
    const setting = [s.recipe ? I18N.tr(s.recipe) : "", s.grind,
      s.method === "Switch" && s.temperature !== "" && s.temperature !== undefined && s.temperature !== null ? s.temperature + " °C" : "",
      s.method === "Brikka" && s.heat !== "" && s.heat !== undefined && s.heat !== null ? I18N.t("home_heat", { f: s.heat }) : ""].filter(Boolean).join(", ");
    const html = '<p class="hbw-text"><b>' + escapeHtml(I18N.t("home_brew_lead")) + "</b> " +
      '<span class="hbw-coffee">' + escapeHtml(I18N.tr(s.coffeeName)) + "</span>, " + escapeHtml(I18N.t(s.reason.key, s.reason.vars)) +
      (setting ? '<span class="hbw-sep" aria-hidden="true"> · </span><span class="hbw-setting">' + escapeHtml(setting) + "</span>" : "") + "</p>" +
      '<span class="hbw-actions"><button type="button" class="link-card hbw-go" data-brew-go>' + escapeHtml(I18N.t("home_brew_go")) + " ›</button>" +
      '<button type="button" class="btn-square-small hbw-hide" data-brew-hide aria-label="' + titleAttr(I18N.t("home_brew_hide")) + '" title="' +
        titleAttr(I18N.t("home_brew_hide")) + '">' + UI.icon("croix") + "</button></span>";
    put(zone, html);
  }

  function brewNow() {
    const s = suggestion;
    if (!s) return;
    const ref = s.refId ? DATA.state.extractions.find(e => e.id === s.refId) : null;
    if (ref) {
      // The « Refaire » path: the settings of that cup, never its result.
      UI.redoCup(ref);
      UI.toast(I18N.t("setting_prefilled"));
      return;
    }
    UI.resetEntry();
    const sel = $("#f-coffee");
    if (sel) { sel.value = s.coffeeId; if (sel.value === s.coffeeId) UI.onCoffeeChoice(); }
    UI.activateScreen("entry");
  }

  function hideBrew() {
    try { localStorage.setItem(BREW_KEY, localDateKey(new Date())); } catch (e) { /* it comes back next render */ }
    const zone = $("#home-brew");
    if (!zone) return;
    if (calm() || typeof zone.animate !== "function") { zone.hidden = true; return; }
    zone.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }], { duration: 220, easing: "ease-in", fill: "forwards" });
    // By the clock, not on the animation's end: a page that gets no frame hides it too.
    setTimeout(() => { zone.hidden = true; zone.getAnimations().forEach(a => a.cancel()); }, 230);
  }

  // ---------- The band (J4) ----------

  const band = { cup: null, shown: false, ticking: false };
  function renderBand(e) {
    const el = $("#home-band");
    if (!el) return;
    band.cup = e || null;
    if (!e) { el.hidden = true; put(el, ""); band.shown = false; el.classList.remove("shown"); return; }
    el.hidden = false;
    const score = e.score_10 !== "" && e.score_10 !== undefined ? fmtRating(Number(e.score_10)) : "";
    const html = '<button type="button" class="hbd-inner" data-band-top aria-label="' + titleAttr(I18N.t("home_band_aria")) + '">' +
      '<span class="hbd-who"><small>' + escapeHtml(I18N.t("home_band_label")) + "</small>" +
      '<span class="hbd-name"><span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' +
      escapeHtml(I18N.tr(e._c ? e._c.coffee_name : "")) + "</span></span>" +
      (score ? '<span class="hbd-score">' + escapeHtml(score) + "</span>" : "") + "</button>";
    put(el, html);
    el.setAttribute("aria-hidden", String(!band.shown));
    placeBand();
  }

  /* The band covers the screen's column, beside the rail and the side panel.
     By its two edges, never by a width (v9.23): while the screen arrives, its
     transform makes it the band's containing block, and a left plus a width
     pushed the hidden band past the window's right edge, so the page scrolled
     sideways. Two edges keep it inside whatever holds it. */
  function placeBand() {
    const el = $("#home-band"), main = $("main");
    if (!el || !main || typeof main.getBoundingClientRect !== "function") return;
    const r = main.getBoundingClientRect();
    const view = document.documentElement && document.documentElement.clientWidth;
    if (!r.width || !view) return;
    el.style.left = Math.round(r.left) + "px";
    el.style.right = Math.max(0, Math.round(view - r.right)) + "px";
    el.style.width = "";
  }

  /* Shown once the card's head (name and score) has gone under the top edge;
     hidden as soon as it comes back. Showing it, the name and the score fly
     from where they were in the card to their place in the band (FLIP). */
  function updateBand() {
    band.ticking = false;
    const el = $("#home-band"), head = $("#card-last .lc-head");
    if (!el || el.hidden || !band.cup || !head || nav.screenName !== "dashboard") return;
    const r = head.getBoundingClientRect();
    const want = r.height > 0 && r.bottom < 12;
    if (want === band.shown) return;
    band.shown = want;
    el.setAttribute("aria-hidden", String(!want));
    if (want) placeBand();
    const fromName = head.querySelector(".last-big-coffee"), fromScore = head.querySelector(".big-rating");
    const first = want && fromName ? [fromName.getBoundingClientRect(), fromScore ? fromScore.getBoundingClientRect() : null] : null;
    el.classList.toggle("shown", want);
    if (!want || calm() || hidden() || !first) return;
    [[".hbd-name", first[0]], [".hbd-score", first[1]]].forEach(([sel, a]) => {
      const to = el.querySelector(sel);
      if (!to || !a || typeof to.animate !== "function") return;
      const b = to.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const sx = a.width / b.width, sy = a.height / b.height;
      to.animate([
        { transform: "translate(" + (a.left - b.left).toFixed(1) + "px, " + (a.top - b.top).toFixed(1) + "px) scale(" + sx.toFixed(3) + ", " + sy.toFixed(3) + ")", opacity: 0.4 },
        { transform: "none", opacity: 1 },
      ], { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" });
    });
  }
  function onScroll() {
    if (band.ticking || nav.screenName !== "dashboard") return;
    band.ticking = true;
    requestAnimationFrame(updateBand);
  }

  // ---------- The entrance ----------

  /* The blocks arrive one after the other when the home screen opens (and
     only then: a sync redrawing it must not replay the entrance). */
  function playEntrance() {
    const root = $("#dashboard-content");
    if (!root || calm() || hidden() || !root.classList) return;
    root.classList.remove("home-enter");
    void root.offsetWidth;
    root.classList.add("home-enter");
    setTimeout(() => root.classList.remove("home-enter"), 1100);
  }

  // ---------- Render and wiring ----------

  /* Called by renderDashboard with what it already computed, or with null
     when the logbook is empty. */
  function renderHome(o) {
    if (!o) { renderWeek(null); renderMonthCard(null); renderBand(null); UI.renderMoments(null); return; }
    renderWeek(weekSummary(o.exts, o.analyzable, new Date()), o.morning);
    renderBags(o.morning);
    renderFinding(o.analyzable);
    renderBrew(o.exts, o.analyzable);
    renderMonthCard(monthSummary(o.exts, o.analyzable, new Date()));
    renderBand(o.last);
    // R4 and R9 (v9.23): the steam of a cup still hot, the streak on the week (js/ui-celebrate.js).
    UI.renderMoments(o);
    if (nav.screenName === "dashboard") onScroll();
    placeSide();
  }

  function wireHome() {
    const go = screen => { if (UI.showAnalyticsPeriod && screen === "analytics") UI.showAnalyticsPeriod("7"); UI.activateScreen(screen); };
    [$("#home-week"), $("#home-week-line")].forEach(b => { if (b) b.addEventListener("click", () => go("analytics")); });
    // v9.25: the month opens Analyses on its 30 days.
    const month = $("#home-month");
    if (month) month.addEventListener("click", () => { if (UI.showAnalyticsPeriod) UI.showAnalyticsPeriod("30"); UI.activateScreen("analytics"); });
    // The side column's sticky top follows its height (a finding turning, a bag ending).
    const side = $("#home-side");
    if (side && typeof ResizeObserver === "function") new ResizeObserver(() => placeSide()).observe(side);
    // The corner's « Fin de sachet » pill (a phone): « Mes cafés » and its « À racheter » shelf.
    const corner = $("#stock-corner");
    if (corner) corner.addEventListener("click", ev => {
      if (ev.target.closest && ev.target.closest("[data-home-coffees]")) UI.openCoffeesPage();
    });
    const findingCard = $("#home-finding");
    if (findingCard) {
      findingCard.addEventListener("click", ev => {
        if (ev.target.closest("[data-finding-next]")) { nextFinding(1); return; }
        const link = ev.target.closest("[data-home-go]");
        if (link) UI.activateScreen(link.dataset.homeGo);
      });
      // Nobody reads a sentence that moves: the rotation waits under the pointer and the focus.
      findingCard.addEventListener("pointerenter", () => { finding.paused = true; });
      findingCard.addEventListener("pointerleave", () => { finding.paused = false; });
      findingCard.addEventListener("focusin", () => { finding.paused = true; });
      findingCard.addEventListener("focusout", () => { finding.paused = false; });
    }
    const brew = $("#home-brew");
    if (brew) brew.addEventListener("click", ev => {
      if (ev.target.closest("[data-brew-go]")) brewNow();
      else if (ev.target.closest("[data-brew-hide]")) hideBrew();
    });
    const bandEl = $("#home-band");
    if (bandEl) bandEl.addEventListener("click", ev => {
      if (!ev.target.closest("[data-band-top]")) return;
      window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { placeBand(); placeSide(); onScroll(); });
    /* The entrance plays when the home screen gets its "on" class, which
       activateScreen gives it (at boot too, behind the loading silhouette). */
    const screen = $("#screen-dashboard");
    if (screen && typeof MutationObserver === "function") {
      new MutationObserver(records => {
        if (records.some(r => !String(r.oldValue || "").split(" ").includes("on")) && screen.classList.contains("on")) {
          playEntrance();
          band.shown = false;
          const el = $("#home-band");
          if (el) el.classList.remove("shown");
        }
      }).observe(screen, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    }
    startRotation();
  }

  Object.assign(UI, {
    weekSummary, brewSuggestion, findingStart, weekDayWord, renderHome, wireHome, nextFinding, monthSummary, sideTop,
  });
})();
