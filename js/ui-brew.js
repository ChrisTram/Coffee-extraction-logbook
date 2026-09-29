/* BREW MODE (v8.47): the entry stopwatch, full screen.
 *
 * While pouring, you only want to see three things: the time, what to reach,
 * and what to do next. The entry stopwatch lives in a column, surrounded by
 * thirty-four fields; here it takes the whole screen, readable from a metre
 * away.
 *
 * This is NOT a second stopwatch. It drives and reads the same state (UI.stopwatch),
 * with the same buttons: starting here starts the entry, stopping carries the
 * total time and the drawdown into the form, the beeps and the screen lock are
 * the stopwatch's own. Closing the mode leaves the stopwatch running.
 *
 * A pour target shows in GRAMS by default since v8.74: Chris brews on a
 * scale. A g / ml toggle, remembered on the device, switches to millilitres (a
 * gram of water is a millilitre). The step text, checked by Chris, is never
 * rewritten. */
"use strict";

(() => {

  const { $, wireRating, fmtDuration, markRating, setHtml, findRecipe } = UI;

  const UNIT_KEY = "brassage-unite";
  const CIRC = 2 * Math.PI * 52;
  let timer = null;
  // True between a stop from this mode and closing: the cup is done, we rate it.
  let endVisible = false;
  // L7: recipes without times (the Brikka) advance on a tap; we remember where we are.
  let manualStep = 0;
  let lastStepIdx = -1;
  let lastCurrentKey = "";
  const IMMINENT_S = 10;
  const escapeHtml = TOOLS.escapeHtml;

  function unit() {
    // Grams by default since v8.74: Chris has a scale. Millilitres stay one tap away.
    try { return localStorage.getItem(UNIT_KEY) === "ml" ? "ml" : "g"; } catch (e) { return "g"; }
  }

  /* A step's target: the CUMULATIVE volume to reach. "jusqu'à 120 g" and
     "compléter à 240 g" state the cumulative; otherwise the first gram figure
     ("Bloom 45 g", "verser 50 g"), which at the first step IS the cumulative. */
  function targetOf(text) {
    const t = String(text || "");
    // No \b before "à": outside ASCII, JavaScript sees no word boundary there.
    const cumulative = t.match(/(?:^|[\s'’])à\s*(\d+)\s*g\b/i) || t.match(/\bto\s*(\d+)\s*g\b/i);
    const first = t.match(/(\d+)\s*g\b/);
    const n = cumulative ? Number(cumulative[1]) : first ? Number(first[1]) : null;
    return n && n >= 20 ? n : null;
  }

  /* The Switch valve state, as the recipe describes it up to here. */
  function valveAt(steps, i) {
    let state = null;
    for (let k = 0; k <= i; k++) {
      const t = steps[k].texte;
      if (/ferm|closed/i.test(t)) state = "fermee";
      if (/ouvr|open/i.test(t)) state = "ouverte";
    }
    return state;
  }

  /* The ring duration: the total stated by the recipe ("3:00", or the start
     of a range "2:45 à 3:15"), otherwise the last step plus one minute,
     otherwise the average total time of this recipe. */
  function targetDuration(r, steps) {
    const m = String(r && r.totalTexte || "").match(/(\d+):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    if (steps.length) return steps[steps.length - 1].t + 60;
    const timed = DATA.state.extractions.filter(e => r && e.recette === r.nom && Number(e.temps_total_s) > 0)
      .map(e => Number(e.temps_total_s));
    return timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : 300;
  }

  function elapsed() {
    const c = UI.stopwatch;
    return (c.accumulated + (c.state === "encours" ? Date.now() - c.startTs : 0)) / 1000;
  }

  function paint() {
    const r = findRecipe($("#f-recipe").value);
    const all = r ? UI.stepsFor(r) : [];
    const steps = all.filter(e => e.t !== null && e.t !== undefined);
    const s = elapsed();
    const duration = targetDuration(r, steps);
    const coffee = DATA.state.cafes.find(c => c.id === $("#f-coffee").value);

    $("#br-machine").textContent = [I18N.machine(UI.entry.methode), coffee ? coffee.nom : ""].filter(Boolean).join(" · ");
    $("#br-title").textContent = r ? I18N.tr(r.nom) : I18N.t("brew_no_recipe");
    $("#br-dose").textContent = [$("#f-dose").value ? $("#f-dose").value + " g" : "",
      $("#f-water").value ? $("#f-water").value + " " + unit() : ""].filter(Boolean).join(" · ");
    $("#br-time").textContent = fmtDuration(Math.floor(s));
    $("#br-over").textContent = I18N.t("brew_of", { t: fmtDuration(duration) });

    let i = -1;
    steps.forEach((p, k) => { if (p.t <= s) i = k; });
    const current = i >= 0 ? steps[i] : null;
    const nextStep = steps[i + 1] || null;
    const target = current ? targetOf(current.texte) : null;
    const freeOnly = !steps.length ? all : [];
    if (manualStep >= freeOnly.length) manualStep = Math.max(0, freeOnly.length - 1);

    /* L7 (v8.90): THE RING COUNTS TO THE NEXT POUR, no longer to the end:
       that is what you wait for, cup set down. It turns copper for the last
       ten seconds. With no pour ahead, it counts to the stated total, as
       before. */
    const arcStart = current ? current.t : 0;
    const arcEnd = nextStep ? nextStep.t : duration;
    const frac = arcEnd > arcStart ? Math.min(1, Math.max(0, (s - arcStart) / (arcEnd - arcStart))) : 1;
    $("#br-trace").setAttribute("stroke-dashoffset", String(CIRC * (1 - frac)));
    const remaining = nextStep ? nextStep.t - s : null;
    $("#br-ring").classList.toggle("imminent", remaining !== null && remaining <= IMMINENT_S && UI.stopwatch.state === "encours");
    $("#br-ring").classList.toggle("exceeded", !nextStep && s > duration);

    /* In the centre, HUGE, what to reach on the scale: the only thing to read
       from a metre away. With no volume to aim for, the time takes its place. */
    const u = unit();
    if (target) {
      $("#br-label").textContent = I18N.t("brew_pour_to");
      $("#br-target").textContent = String(target);
      $("#br-in").textContent = u + (nextStep ? " · " + I18N.t("brew_next_in", { t: fmtDuration(Math.max(0, Math.ceil(remaining))) }) : "");
    } else if (freeOnly.length) {
      /* An untimed step that aims for a total (the 4:6, v8.99): the total goes
         huge, like a timed step; otherwise the elapsed time. */
      const freeTarget = targetOf(freeOnly[manualStep].texte);
      $("#br-label").textContent = I18N.t("brew_step_n", { n: manualStep + 1, t: freeOnly.length });
      $("#br-target").textContent = freeTarget ? String(freeTarget) : fmtDuration(Math.floor(s));
      $("#br-in").textContent = (freeTarget ? u + " · " : "") + I18N.t("brew_tap");
    } else {
      $("#br-label").textContent = current ? I18N.t("brew_timer") : I18N.t("brew_ready");
      $("#br-target").textContent = fmtDuration(Math.floor(s));
      $("#br-in").textContent = nextStep ? I18N.t("brew_next_in", { t: fmtDuration(Math.max(0, Math.ceil(remaining))) }) : "";
    }
    $(".br-time-row").hidden = !target;

    // Total poured, out of the cup's water: the carafe, as one bar.
    const water = Number($("#f-water").value) || 0;
    const poured = steps.slice(0, i + 1).reduce((m, p) => Math.max(m, targetOf(p.texte) || 0), 0);
    $("#br-total").hidden = !(water > 0 && steps.some(p => targetOf(p.texte)));
    $("#br-total-level").style.width = (water > 0 ? Math.min(100, (poured / water) * 100) : 0).toFixed(1) + "%";
    $("#br-total-text").textContent = I18N.t("brew_total", { v: poured, e: water, u });

    // A step crossed while running: the phone vibrates, on top of the stopwatch beep.
    if (i !== lastStepIdx) {
      if (i > lastStepIdx && lastStepIdx !== -2 && UI.stopwatch.state === "encours" && navigator.vibrate) { try { navigator.vibrate(160); } catch (e) { /* no vibrator */ } }
      lastStepIdx = i;
    }

    /* A step with no volume ("Ouvrir, laisser s'écouler") has no figure to
       aim for: the instruction then goes large. */
    const manualCue = freeOnly.length ? freeOnly[manualStep].texte : null;
    $("#br-instruction").classList.toggle("alone", (!!current && !target) || !!manualCue);
    $("#br-instruction").textContent = manualCue || (current ? current.texte
      : steps.length ? I18N.t("brew_waiting", { text: steps[0].texte }) : I18N.t("brew_no_stages"));
    const valve = i >= 0 ? valveAt(steps, i) : null;
    const badge = $("#br-valve");
    badge.hidden = !valve || UI.entry.methode !== "Switch";
    if (valve) badge.textContent = I18N.t(valve === "ouverte" ? "brew_valve_open" : "brew_valve_closed");
    $("#br-next").textContent = nextStep
      ? I18N.t("brew_next", { d: Math.max(0, Math.ceil(nextStep.t - s)), text: nextStep.texte })
      : current ? I18N.t("timer_last") : freeOnly.length ? I18N.t("brew_tap") : "";

    // The timeline: every timed step, the current one highlighted; untimed
    // steps (the Brikka) as a plain list, to reread.
    const untimed = all.filter(e => e.t === null || e.t === undefined);
    setHtml($("#br-timeline"), steps.map((p, k) =>
      '<li class="' + (k === i ? "current" : k < i ? "past" : "") + '"><time>' + fmtDuration(p.t) + "</time><span>" +
      escapeHtml(p.texte) + "</span></li>").join("") +
      untimed.map((p, k) => '<li class="free' + (!steps.length ? (k === manualStep ? " current" : k < manualStep ? " past" : "") : "") + '" data-incr="' + k + '"><time aria-hidden="true">' + (k + 1) + "</time><span>" + escapeHtml(p.texte) + "</span></li>").join(""));
    /* v9.01: the timeline is what Chris reads, the scale under the Switch. The
       current step scrolls to the middle of the screen when it changes, not on every tick. */
    const currentKey = (steps.length ? "p" + i : "l" + manualStep) + "|" + (r ? r.id : "");
    if (currentKey !== lastCurrentKey) {
      lastCurrentKey = currentKey;
      const li = $("#br-timeline li.current");
      if (li && li.scrollIntoView) li.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    const state = UI.stopwatch.state;
    $("#br-go").textContent = I18N.t(state === "arrete" ? (s > 0 ? "brew_start_again" : "timer_start")
      : state === "encours" ? "timer_pause" : "timer_resume");
    $("#br-stop").hidden = state === "arrete";
    $("#br-reset").hidden = state === "arrete" && s === 0;
    $("#br-end").hidden = !(endVisible && state === "arrete");
    $(".br-buttons").hidden = endVisible && state === "arrete";
    $(".br-unit [data-unit=ml]").setAttribute("aria-pressed", String(unit() === "ml"));
    $(".br-unit [data-unit=g]").setAttribute("aria-pressed", String(unit() === "g"));
  }

  function openBrew() {
    const m = $("#modal-brew");
    endVisible = false;
    manualStep = 0;
    lastStepIdx = -2;
    lastCurrentKey = "";
    paint();
    if (!m.open) m.showModal();
    clearInterval(timer);
    timer = setInterval(paint, 250);
  }

  function closeBrew() {
    clearInterval(timer);
    timer = null;
    const m = $("#modal-brew");
    if (m.open) m.close();
  }

  function wireBrew() {
    $("#btn-brew").addEventListener("click", openBrew);
    $("#br-close").addEventListener("click", closeBrew);
    $("#modal-brew").addEventListener("close", () => { clearInterval(timer); timer = null; });
    $("#br-go").addEventListener("click", () => {
      // "Start again" after a stop: we restart from zero, not from the old time.
      if (UI.stopwatch.state === "arrete" && elapsed() > 0) UI.resetStopwatch();
      endVisible = false;
      UI.stopwatchPrimary();
      UI.toggleStopwatch(true);
      paint();
    });
    $("#br-stop").addEventListener("click", () => {
      UI.stopStopwatch();
      endVisible = true;
      const c = $("#br-rating");
      c.value = 5;
      markRating(c, true);
      updateBrewNote();
      paint();
    });
    $("#br-reset").addEventListener("click", () => { UI.resetStopwatch(); endVisible = false; manualStep = 0; paint(); });
    /* L7: a recipe without times (the Brikka) advances with a tap anywhere
       on the stage, hands full. Timed recipes follow the clock. */
    const advance = ev => {
      const r = findRecipe($("#f-recipe").value);
      const all = r ? UI.stepsFor(r) : [];
      if (!all.length || all.some(e => e.t !== null && e.t !== undefined)) return;
      // v9.01: tapping a timeline row goes straight to it; elsewhere, the next step.
      const li = ev.target.closest && ev.target.closest("#br-timeline li[data-incr]");
      manualStep = li ? Number(li.dataset.incr) : (manualStep + 1) % all.length;
      paint();
    };
    $(".br-scene").addEventListener("click", advance);
    $("#br-timeline").addEventListener("click", advance);
    document.querySelectorAll(".br-unit [data-unit]").forEach(b => b.addEventListener("click", () => {
      try { localStorage.setItem(UNIT_KEY, b.dataset.unit); } catch (e) { /* no storage, ml */ }
      paint();
    }));
    // The end score writes into the form's: a single score, the one that goes to the database.
    wireRating($("#br-rating"), () => {
      const f = $("#f-rating");
      f.value = $("#br-rating").value;
      markRating(f, false);
      UI.updateRatingDisplay();
      updateBrewNote();
    });
    $("#br-save").addEventListener("click", () => {
      closeBrew();
      $("#form-entry").requestSubmit();
    });
    $("#br-complete").addEventListener("click", closeBrew);
  }

  function updateBrewNote() {
    const c = $("#br-rating");
    const empty = UI.isRatingEmpty(c);
    $("#br-rating-spoken").textContent = empty ? I18N.t("not_rated_yet") : c.value + " / 10";
    UI.paintSlider(c);
  }

  Object.assign(UI, { wireBrew, pourTarget: targetOf, closeBrew, openBrew });
})();
