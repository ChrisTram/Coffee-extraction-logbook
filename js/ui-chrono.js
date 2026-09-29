/* Stopwatch for the Entry screen, and nothing else.
 *
 * Split out of js/ui-saisie.js when that file went past the 1,200-line cap.
 * The seam is clean: the stopwatch has its own state, its own screen lock,
 * its own recipe steps, and it became a separate collapsible widget on
 * screen. It loads AFTER ui-saisie.js, from which it borrows a few helpers.
 *
 * It talks to the rest through UI.: the form asks it to collapse, and it
 * writes the times into the form fields by id. */
"use strict";

(() => {

  // Borrowed from the core and the entry screen, both loaded before us.
  const { $, $f, ecrireDuree, fmtTemps, toast, trouverRecette } = UI;

  // Single stopwatch: Start, Pause, Resume, Stop, Reset.
  // Steps come from the selected recipe, with a soft beep at each one.
  // Drawdown is derived: from the "open" step to the moment the stopwatch stops.
  const chrono = { etat: "arrete", accumule: 0, departTs: null, interval: null, passes: new Set() };
  let audioCtx = null;

  // Screen lock while timing: the phone screen must not lock in the middle
  // of a brew, hands are wet.
  // The API only exists in a secure context (https), so NOT on file://: we
  // fail silently, it is not a critical feature. The system releases the
  // lock as soon as the tab goes to the background, hence the re-acquire on
  // visibilitychange.
  let screenWakeLock = null;

  async function acquireWakeLock() {
    if (screenWakeLock || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { if (screenWakeLock === lock) screenWakeLock = null; });
      screenWakeLock = lock;
    } catch (e) { /* refused, or hidden tab: never mind */ }
  }

  function releaseWakeLock() {
    if (!screenWakeLock) return;
    const lock = screenWakeLock;
    screenWakeLock = null;
    lock.release().catch(() => { /* already released */ });
  }

  // Single source of truth: the lock follows the stopwatch state.
  function syncWakeLock() {
    if (chrono.etat === "encours") acquireWakeLock();
    else releaseWakeLock();
  }

  function chronoElapsed() {
    return (chrono.accumule + (chrono.etat === "encours" ? Date.now() - chrono.departTs : 0)) / 1000;
  }

  function paliersCourants() {
    const r = trouverRecette($("#f-recette").value);
    if (!r) return [];
    return UI.etapesPour(r).filter(e => e.t !== null && e.t !== undefined);
  }

  function openingTime() {
    const step = paliersCourants().find(e => /ouvr|open/i.test(e.texte));
    return step ? step.t : null;
  }

  function jouerBip() {
    if (!$("#chrono-bip").checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.3);
    } catch (e) { /* audio unavailable */ }
  }

  function majEtapesChrono(withBeeps) {
    const s = chronoElapsed();
    const steps = paliersCourants();
    const area = $("#chrono-etapes");
    if (!steps.length) { area.hidden = true; return; }
    area.hidden = false;
    let current = null, next = null;
    steps.forEach(step => { if (step.t <= s) current = step; else if (!next) next = step; });
    const currentText = current
      ? fmtTemps(current.t) + " · " + current.texte
      : I18N.t("ch_pret");
    $("#chrono-courante").textContent = currentText;
    /* The same step in the header, so it reads WITHOUT expanding: on a phone
       the stopwatch is a collapsed strip stuck to the top, and a strip that
       does not say where you are just takes up space. Empty when the
       stopwatch is not running, otherwise it would announce a step not yet begun. */
    const shortLabel = $("#chrono-palier-court");
    if (shortLabel) shortLabel.textContent = chrono.etat === "arrete" ? "" : currentText;
    if (next) {
      $("#chrono-suivante").textContent = I18N.t("ch_suivante", {
        t: fmtTemps(next.t), d: Math.max(0, Math.ceil(next.t - s)), texte: next.texte,
      });
    } else {
      $("#chrono-suivante").textContent = current ? I18N.t("ch_derniere") : "";
    }
    if (withBeeps && chrono.etat === "encours") {
      steps.forEach(step => {
        if (step.t > 0 && step.t <= s && !chrono.passes.has(step.t)) {
          chrono.passes.add(step.t);
          jouerBip();
          // Brew mode is watched from a distance: a vibration on top of the
          // beep, where the phone allows it (Android; the iPhone lacks the API).
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            try { navigator.vibrate(120); } catch (e) { /* refused */ }
          }
        }
      });
    }
  }

  function chronoTic() {
    $("#chrono-total").textContent = fmtTemps(Math.floor(chronoElapsed()));
    majEtapesChrono(true);
  }

  function majBoutonsChrono() {
    const b = $("#btn-chrono");
    if (chrono.etat === "arrete") b.textContent = I18N.t("ch_demarrer");
    else if (chrono.etat === "encours") b.textContent = I18N.t("ch_pause");
    else b.textContent = I18N.t("ch_reprendre");
    $("#btn-chrono-stop").hidden = chrono.etat === "arrete";
    $("#btn-chrono-raz").hidden = chrono.etat === "arrete" && chronoElapsed() === 0;
    $(".chrono").classList.toggle("en-cours", chrono.etat === "encours");
    // Called on every stopwatch transition, the right place to align the
    // screen lock with no risk of forgetting it in a branch.
    syncWakeLock();
  }

  function chronoPrincipal() {
    /* Sound is unlocked INSIDE the gesture (v8.72): on iPhone, an audio
       context created later by the timer stays silent. */
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* audio unavailable */ }
    if (chrono.etat === "arrete") {
      chrono.accumule = 0;
      chrono.passes.clear();
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    } else if (chrono.etat === "encours") {
      chrono.accumule += Date.now() - chrono.departTs;
      chrono.etat = "pause";
      clearInterval(chrono.interval);
    } else {
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    }
    majBoutonsChrono();
  }

  function chronoArreter() {
    if (chrono.etat === "arrete") return;
    if (chrono.etat === "encours") chrono.accumule += Date.now() - chrono.departTs;
    clearInterval(chrono.interval);
    const total = Math.round(chrono.accumule / 1000);
    chrono.etat = "arrete";
    ecrireDuree("f-total", total);
    const tOpen = openingTime();
    if (tOpen !== null && total > tOpen) ecrireDuree("f-ecoulement", total - tOpen);
    majBoutonsChrono();
    toast(I18N.t("t_temps"));
  }

  function chronoRaz() {
    clearInterval(chrono.interval);
    chrono.etat = "arrete";
    chrono.accumule = 0;
    chrono.departTs = null;
    chrono.passes.clear();
    $("#chrono-total").textContent = "0:00";
    majEtapesChrono(false);
    majBoutonsChrono();
  }
  /* THE COLLAPSIBLE STOPWATCH.

     It lives under the recipe card, collapsed, because it is only used during
     the brew while the recipe is reread at every step.

     Two rules. The time stays readable when collapsed: the header carries it,
     a stopwatch you have to expand to read is useless. And it opens by itself
     on start and refuses to collapse while running: closing on a running
     stopwatch means losing the steps and the stop button at the exact moment
     you need them. */
  function chronoTourne() {
    return !$("#btn-chrono-stop").hidden;
  }

  function basculerChrono(open) {
    const body = $("#chrono-corps");
    if (!body) return;
    const wants = open === undefined ? body.hidden : open;
    /* A running stopwatch is never closed. */
    const isOpen = !wants && chronoTourne() ? true : wants;
    body.hidden = !isOpen;
    $("#chrono-widget").classList.toggle("ouvert", isOpen);
    $("#chrono-basculer").setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  Object.assign(UI, {
    basculerChrono, chrono, chronoArreter, chronoPrincipal, chronoRaz, chronoTic,
    chronoTourne, jouerBip, majBoutonsChrono, majEtapesChrono, paliersCourants,
    syncWakeLock,
  });
})();
