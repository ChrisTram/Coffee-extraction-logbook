/* Stopwatch for the Entry screen, and nothing else.
 *
 * Split out of js/ui-entry.js when that file went past the 1,200-line cap.
 * The seam is clean: the stopwatch has its own state, its own screen lock,
 * its own recipe steps, and it became a separate collapsible widget on
 * screen. It loads AFTER ui-entry.js, from which it borrows a few helpers.
 *
 * It talks to the rest through UI.: the form asks it to collapse, and it
 * writes the times into the form fields by id. */
"use strict";

(() => {

  // Borrowed from the core and the entry screen, both loaded before us.
  const { $, $f, writeDuration, fmtDuration, toast, findRecipe } = UI;

  // Single stopwatch: Start, Pause, Resume, Stop, Reset.
  // Steps come from the selected recipe, with a soft beep at each one.
  // Drawdown is derived: from the "open" step to the moment the stopwatch stops.
  const stopwatch = { state: "stopped", accumulated: 0, startTs: null, interval: null, passes: new Set() };
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
    if (stopwatch.state === "running") acquireWakeLock();
    else releaseWakeLock();
  }

  function stopwatchElapsed() {
    return (stopwatch.accumulated + (stopwatch.state === "running" ? Date.now() - stopwatch.startTs : 0)) / 1000;
  }

  function currentMilestones() {
    const r = findRecipe($("#f-recipe").value);
    if (!r) return [];
    return UI.stepsFor(r).filter(e => e.t !== null && e.t !== undefined);
  }

  function openingTime() {
    const step = currentMilestones().find(e => /ouvr|open/i.test(e.text));
    return step ? step.t : null;
  }

  function playBeep() {
    if (!$("#chrono-beep").checked) return;
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

  function updateStopwatchSteps(withBeeps) {
    const s = stopwatchElapsed();
    const steps = currentMilestones();
    const area = $("#chrono-steps");
    if (!steps.length) { area.hidden = true; return; }
    area.hidden = false;
    let current = null, next = null;
    steps.forEach(step => { if (step.t <= s) current = step; else if (!next) next = step; });
    const currentText = current
      ? fmtDuration(current.t) + " · " + current.text
      : I18N.t("timer_ready");
    $("#chrono-now").textContent = currentText;
    /* The same step in the header, so it reads WITHOUT expanding: on a phone
       the stopwatch is a collapsed strip stuck to the top, and a strip that
       does not say where you are just takes up space. Empty when the
       stopwatch is not running, otherwise it would announce a step not yet begun. */
    const shortLabel = $("#chrono-phase-short");
    if (shortLabel) shortLabel.textContent = stopwatch.state === "stopped" ? "" : currentText;
    if (next) {
      $("#chrono-next").textContent = I18N.t("timer_next", {
        t: fmtDuration(next.t), d: Math.max(0, Math.ceil(next.t - s)), text: next.text,
      });
    } else {
      $("#chrono-next").textContent = current ? I18N.t("timer_last") : "";
    }
    if (withBeeps && stopwatch.state === "running") {
      steps.forEach(step => {
        if (step.t > 0 && step.t <= s && !stopwatch.passes.has(step.t)) {
          stopwatch.passes.add(step.t);
          playBeep();
          // Brew mode is watched from a distance: a vibration on top of the
          // beep, where the phone allows it (Android; the iPhone lacks the API).
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            try { navigator.vibrate(120); } catch (e) { /* refused */ }
          }
        }
      });
    }
  }

  function stopwatchTick() {
    $("#chrono-total").textContent = fmtDuration(Math.floor(stopwatchElapsed()));
    updateStopwatchSteps(true);
    // The drawdown's « Reprendre le chrono » appears once the "open" step is passed.
    UI.refreshTimeWheels();
  }

  function updateStopwatchButtons() {
    const b = $("#btn-chrono");
    if (stopwatch.state === "stopped") b.textContent = I18N.t("timer_start");
    else if (stopwatch.state === "running") b.textContent = I18N.t("timer_pause");
    else b.textContent = I18N.t("timer_resume");
    $("#btn-chrono-stop").hidden = stopwatch.state === "stopped";
    $("#btn-chrono-reset").hidden = stopwatch.state === "stopped" && stopwatchElapsed() === 0;
    $(".chrono").classList.toggle("in-progress", stopwatch.state === "running");
    // Called on every stopwatch transition, the right place to align the
    // screen lock with no risk of forgetting it in a branch.
    syncWakeLock();
    // And the time wheels' « Reprendre le chrono » buttons (v9.13).
    UI.refreshTimeWheels();
  }

  function stopwatchPrimary() {
    /* Sound is unlocked INSIDE the gesture (v8.72): on iPhone, an audio
       context created later by the timer stays silent. */
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* audio unavailable */ }
    if (stopwatch.state === "stopped") {
      stopwatch.accumulated = 0;
      stopwatch.passes.clear();
      stopwatch.startTs = Date.now();
      stopwatch.state = "running";
      stopwatch.interval = setInterval(stopwatchTick, 200);
    } else if (stopwatch.state === "running") {
      stopwatch.accumulated += Date.now() - stopwatch.startTs;
      stopwatch.state = "pause";
      clearInterval(stopwatch.interval);
    } else {
      stopwatch.startTs = Date.now();
      stopwatch.state = "running";
      stopwatch.interval = setInterval(stopwatchTick, 200);
    }
    updateStopwatchButtons();
  }

  function stopStopwatch() {
    if (stopwatch.state === "stopped") return;
    if (stopwatch.state === "running") stopwatch.accumulated += Date.now() - stopwatch.startTs;
    clearInterval(stopwatch.interval);
    const total = Math.round(stopwatch.accumulated / 1000);
    stopwatch.state = "stopped";
    writeDuration("f-total", total);
    const tOpen = openingTime();
    if (tOpen !== null && total > tOpen) writeDuration("f-flow", total - tOpen);
    updateStopwatchButtons();
    toast(I18N.t("toast_times"));
  }

  function resetStopwatch() {
    clearInterval(stopwatch.interval);
    stopwatch.state = "stopped";
    stopwatch.accumulated = 0;
    stopwatch.startTs = null;
    stopwatch.passes.clear();
    $("#chrono-total").textContent = "0:00";
    updateStopwatchSteps(false);
    updateStopwatchButtons();
  }
  /* THE COLLAPSIBLE STOPWATCH.

     It lives under the recipe card, collapsed, because it is only used during
     the brew while the recipe is reread at every step.

     Two rules. The time stays readable when collapsed: the header carries it,
     a stopwatch you have to expand to read is useless. And it opens by itself
     on start and refuses to collapse while running: closing on a running
     stopwatch means losing the steps and the stop button at the exact moment
     you need them. */
  function isStopwatchRunning() {
    return !$("#btn-chrono-stop").hidden;
  }

  function toggleStopwatch(open) {
    const body = $("#chrono-body");
    if (!body) return;
    const wants = open === undefined ? body.hidden : open;
    /* A running stopwatch is never closed. */
    const isOpen = !wants && isStopwatchRunning() ? true : wants;
    body.hidden = !isOpen;
    // Hidden, the time wheels had no height to scroll: back on their values now.
    if (isOpen) UI.syncTimeWheels();
    $("#chrono-widget").classList.toggle("open", isOpen);
    $("#chrono-toggle").setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  Object.assign(UI, {
    toggleStopwatch, stopwatch, stopStopwatch, stopwatchPrimary, resetStopwatch, stopwatchTick,
    isStopwatchRunning, playBeep, updateStopwatchButtons, updateStopwatchSteps, currentMilestones,
    syncWakeLock, stopwatchElapsed, openingTime,
  });
})();
