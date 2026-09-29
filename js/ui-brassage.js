/* BREW MODE (v8.47): the entry stopwatch, full screen.
 *
 * While pouring, you only want to see three things: the time, what to reach,
 * and what to do next. The entry stopwatch lives in a column, surrounded by
 * thirty-four fields; here it takes the whole screen, readable from a metre
 * away.
 *
 * This is NOT a second stopwatch. It drives and reads the same state (UI.chrono),
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

  const { $, brancherNote, fmtTemps, marquerNote, poser, trouverRecette } = UI;

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
  const echap = OUTILS.echap;

  function unit() {
    // Grams by default since v8.74: Chris has a scale. Millilitres stay one tap away.
    try { return localStorage.getItem(UNIT_KEY) === "ml" ? "ml" : "g"; } catch (e) { return "g"; }
  }

  /* A step's target: the CUMULATIVE volume to reach. "jusqu'à 120 g" and
     "compléter à 240 g" state the cumulative; otherwise the first gram figure
     ("Bloom 45 g", "verser 50 g"), which at the first step IS the cumulative. */
  function targetOf(texte) {
    const t = String(texte || "");
    // No \b before "à": outside ASCII, JavaScript sees no word boundary there.
    const cumul = t.match(/(?:^|[\s'’])à\s*(\d+)\s*g\b/i) || t.match(/\bto\s*(\d+)\s*g\b/i);
    const first = t.match(/(\d+)\s*g\b/);
    const n = cumul ? Number(cumul[1]) : first ? Number(first[1]) : null;
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
    const c = UI.chrono;
    return (c.accumule + (c.etat === "encours" ? Date.now() - c.departTs : 0)) / 1000;
  }

  function paint() {
    const r = trouverRecette($("#f-recette").value);
    const all = r ? UI.etapesPour(r) : [];
    const steps = all.filter(e => e.t !== null && e.t !== undefined);
    const s = elapsed();
    const duree = targetDuration(r, steps);
    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);

    $("#br-machine").textContent = [I18N.machine(UI.saisie.methode), cafe ? cafe.nom : ""].filter(Boolean).join(" · ");
    $("#br-titre").textContent = r ? I18N.tr(r.nom) : I18N.t("br_sans_recette");
    $("#br-dose").textContent = [$("#f-dose").value ? $("#f-dose").value + " g" : "",
      $("#f-eau").value ? $("#f-eau").value + " " + unit() : ""].filter(Boolean).join(" · ");
    $("#br-temps").textContent = fmtTemps(Math.floor(s));
    $("#br-sur").textContent = I18N.t("br_sur", { t: fmtTemps(duree) });

    let i = -1;
    steps.forEach((p, k) => { if (p.t <= s) i = k; });
    const current = i >= 0 ? steps[i] : null;
    const suivant = steps[i + 1] || null;
    const target = current ? targetOf(current.texte) : null;
    const freeOnly = !steps.length ? all : [];
    if (manualStep >= freeOnly.length) manualStep = Math.max(0, freeOnly.length - 1);

    /* L7 (v8.90): THE RING COUNTS TO THE NEXT POUR, no longer to the end:
       that is what you wait for, cup set down. It turns copper for the last
       ten seconds. With no pour ahead, it counts to the stated total, as
       before. */
    const arcStart = current ? current.t : 0;
    const finArc = suivant ? suivant.t : duree;
    const frac = finArc > arcStart ? Math.min(1, Math.max(0, (s - arcStart) / (finArc - arcStart))) : 1;
    $("#br-trace").setAttribute("stroke-dashoffset", String(CIRC * (1 - frac)));
    const remaining = suivant ? suivant.t - s : null;
    $("#br-anneau").classList.toggle("imminent", remaining !== null && remaining <= IMMINENT_S && UI.chrono.etat === "encours");
    $("#br-anneau").classList.toggle("depasse", !suivant && s > duree);

    /* In the centre, HUGE, what to reach on the scale: the only thing to read
       from a metre away. With no volume to aim for, the time takes its place. */
    const u = unit();
    if (target) {
      $("#br-label").textContent = I18N.t("br_verse");
      $("#br-cible").textContent = String(target);
      $("#br-dans").textContent = u + (suivant ? " · " + I18N.t("br_ensuite_dans", { t: fmtTemps(Math.max(0, Math.ceil(remaining))) }) : "");
    } else if (freeOnly.length) {
      /* An untimed step that aims for a total (the 4:6, v8.99): the total goes
         huge, like a timed step; otherwise the elapsed time. */
      const freeTarget = targetOf(freeOnly[manualStep].texte);
      $("#br-label").textContent = I18N.t("br_etape_n", { n: manualStep + 1, t: freeOnly.length });
      $("#br-cible").textContent = freeTarget ? String(freeTarget) : fmtTemps(Math.floor(s));
      $("#br-dans").textContent = (freeTarget ? u + " · " : "") + I18N.t("br_toucher");
    } else {
      $("#br-label").textContent = current ? I18N.t("br_chrono") : I18N.t("br_pret");
      $("#br-cible").textContent = fmtTemps(Math.floor(s));
      $("#br-dans").textContent = suivant ? I18N.t("br_ensuite_dans", { t: fmtTemps(Math.max(0, Math.ceil(remaining))) }) : "";
    }
    $(".br-temps-ligne").hidden = !target;

    // Total poured, out of the cup's water: the carafe, as one bar.
    const water = Number($("#f-eau").value) || 0;
    const poured = steps.slice(0, i + 1).reduce((m, p) => Math.max(m, targetOf(p.texte) || 0), 0);
    $("#br-total").hidden = !(water > 0 && steps.some(p => targetOf(p.texte)));
    $("#br-total-niveau").style.width = (water > 0 ? Math.min(100, (poured / water) * 100) : 0).toFixed(1) + "%";
    $("#br-total-texte").textContent = I18N.t("br_total", { v: poured, e: water, u });

    // A step crossed while running: the phone vibrates, on top of the stopwatch beep.
    if (i !== lastStepIdx) {
      if (i > lastStepIdx && lastStepIdx !== -2 && UI.chrono.etat === "encours" && navigator.vibrate) { try { navigator.vibrate(160); } catch (e) { /* no vibrator */ } }
      lastStepIdx = i;
    }

    /* A step with no volume ("Ouvrir, laisser s'écouler") has no figure to
       aim for: the instruction then goes large. */
    const manualCue = freeOnly.length ? freeOnly[manualStep].texte : null;
    $("#br-consigne").classList.toggle("seule", (!!current && !target) || !!manualCue);
    $("#br-consigne").textContent = manualCue || (current ? current.texte
      : steps.length ? I18N.t("br_attente", { texte: steps[0].texte }) : I18N.t("br_sans_paliers"));
    const valve = i >= 0 ? valveAt(steps, i) : null;
    const badge = $("#br-vanne");
    badge.hidden = !valve || UI.saisie.methode !== "Switch";
    if (valve) badge.textContent = I18N.t(valve === "ouverte" ? "br_vanne_ouverte" : "br_vanne_fermee");
    $("#br-suivante").textContent = suivant
      ? I18N.t("br_suivante", { d: Math.max(0, Math.ceil(suivant.t - s)), texte: suivant.texte })
      : current ? I18N.t("ch_derniere") : freeOnly.length ? I18N.t("br_toucher") : "";

    // The timeline: every timed step, the current one highlighted; untimed
    // steps (the Brikka) as a plain list, to reread.
    const untimed = all.filter(e => e.t === null || e.t === undefined);
    poser($("#br-frise"), steps.map((p, k) =>
      '<li class="' + (k === i ? "courant" : k < i ? "passe" : "") + '"><time>' + fmtTemps(p.t) + "</time><span>" +
      echap(p.texte) + "</span></li>").join("") +
      untimed.map((p, k) => '<li class="libre' + (!steps.length ? (k === manualStep ? " courant" : k < manualStep ? " passe" : "") : "") + '" data-pas="' + k + '"><time aria-hidden="true">' + (k + 1) + "</time><span>" + echap(p.texte) + "</span></li>").join(""));
    /* v9.01: the timeline is what Chris reads, the scale under the Switch. The
       current step scrolls to the middle of the screen when it changes, not on every tick. */
    const currentKey = (steps.length ? "p" + i : "l" + manualStep) + "|" + (r ? r.id : "");
    if (currentKey !== lastCurrentKey) {
      lastCurrentKey = currentKey;
      const li = $("#br-frise li.courant");
      if (li && li.scrollIntoView) li.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    const state = UI.chrono.etat;
    $("#br-go").textContent = I18N.t(state === "arrete" ? (s > 0 ? "br_recommencer" : "ch_demarrer")
      : state === "encours" ? "ch_pause" : "ch_reprendre");
    $("#br-stop").hidden = state === "arrete";
    $("#br-raz").hidden = state === "arrete" && s === 0;
    $("#br-fin").hidden = !(endVisible && state === "arrete");
    $(".br-boutons").hidden = endVisible && state === "arrete";
    $(".br-unite [data-unite=ml]").setAttribute("aria-pressed", String(unit() === "ml"));
    $(".br-unite [data-unite=g]").setAttribute("aria-pressed", String(unit() === "g"));
  }

  function ouvrirBrassage() {
    const m = $("#modale-brassage");
    endVisible = false;
    manualStep = 0;
    lastStepIdx = -2;
    lastCurrentKey = "";
    paint();
    if (!m.open) m.showModal();
    clearInterval(timer);
    timer = setInterval(paint, 250);
  }

  function fermerBrassage() {
    clearInterval(timer);
    timer = null;
    const m = $("#modale-brassage");
    if (m.open) m.close();
  }

  function cablerBrassage() {
    $("#btn-brassage").addEventListener("click", ouvrirBrassage);
    $("#br-fermer").addEventListener("click", fermerBrassage);
    $("#modale-brassage").addEventListener("close", () => { clearInterval(timer); timer = null; });
    $("#br-go").addEventListener("click", () => {
      // "Start again" after a stop: we restart from zero, not from the old time.
      if (UI.chrono.etat === "arrete" && elapsed() > 0) UI.chronoRaz();
      endVisible = false;
      UI.chronoPrincipal();
      UI.basculerChrono(true);
      paint();
    });
    $("#br-stop").addEventListener("click", () => {
      UI.chronoArreter();
      endVisible = true;
      const c = $("#br-note");
      c.value = 5;
      marquerNote(c, true);
      updateBrewNote();
      paint();
    });
    $("#br-raz").addEventListener("click", () => { UI.chronoRaz(); endVisible = false; manualStep = 0; paint(); });
    /* L7: a recipe without times (the Brikka) advances with a tap anywhere
       on the stage, hands full. Timed recipes follow the clock. */
    const advance = ev => {
      const r = trouverRecette($("#f-recette").value);
      const all = r ? UI.etapesPour(r) : [];
      if (!all.length || all.some(e => e.t !== null && e.t !== undefined)) return;
      // v9.01: tapping a timeline row goes straight to it; elsewhere, the next step.
      const li = ev.target.closest && ev.target.closest("#br-frise li[data-pas]");
      manualStep = li ? Number(li.dataset.pas) : (manualStep + 1) % all.length;
      paint();
    };
    $(".br-scene").addEventListener("click", advance);
    $("#br-frise").addEventListener("click", advance);
    document.querySelectorAll(".br-unite [data-unite]").forEach(b => b.addEventListener("click", () => {
      try { localStorage.setItem(UNIT_KEY, b.dataset.unite); } catch (e) { /* no storage, ml */ }
      paint();
    }));
    // The end score writes into the form's: a single score, the one that goes to the database.
    brancherNote($("#br-note"), () => {
      const f = $("#f-note");
      f.value = $("#br-note").value;
      marquerNote(f, false);
      UI.majAffichageNote();
      updateBrewNote();
    });
    $("#br-enregistrer").addEventListener("click", () => {
      fermerBrassage();
      $("#form-saisie").requestSubmit();
    });
    $("#br-completer").addEventListener("click", fermerBrassage);
  }

  function updateBrewNote() {
    const c = $("#br-note");
    const empty = UI.noteVide(c);
    $("#br-note-dite").textContent = empty ? I18N.t("n_pas_notee") : c.value + " / 10";
    UI.peindreCurseur(c);
  }

  Object.assign(UI, { cablerBrassage, cibleVersement: targetOf, fermerBrassage, ouvrirBrassage });
})();
