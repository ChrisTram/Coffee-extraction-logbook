/* Entry draft: what the form held when the page was unloaded, put back in
 * place at startup.
 *
 * A separate file since v7.93: it shares with the entry screen only the
 * `entry` object and the field ids, and it calls it through UI. It loads
 * AFTER ui-entry.js to borrow `entry`, which is an object mutated in
 * place, so safe to borrow. */
"use strict";

(() => {

  // Borrowed from the core, plus the entry state, exposed by ui-entry.js.
  const { $, $$, setPressed, markRating, isRatingEmpty, entry } = UI;

  /* ---------- Entry draft ----------
     On a phone, leaving the tab during an extraction is enough for the
     browser to unload the page to reclaim memory. Without a draft, everything
     typed disappears, and it is precisely during the extraction that you
     step out of the app.

     Deliberately in localStorage and NOT in the synced data: a draft belongs
     to one device, sending it to the server would make a ghost entry appear
     on the other one. */
  const DRAFT_KEY = "entry-draft";
  const DRAFT_MAX_MS = 24 * 60 * 60 * 1000;
  /* The draft's DATE has its own, much shorter, validity. The draft exists to
     survive the page being unloaded during an extraction, which is counted in
     minutes; keeping its timestamp for 24 h brought back the previous day's
     date on a fresh entry. Two hours easily cover a session, interruptions
     included. */
  const DRAFT_DATE_MAX_MS = 2 * 60 * 60 * 1000;
  const DRAFT_FIELDS = [
    "f-date", "f-coffee", "f-recipe", "f-dose", "f-water", "f-grind", "f-temp",
    "f-heat-min", "f-heat-sec",
    "f-volume", "f-water-added", "f-milk", "f-agitation", "f-cup", "f-rating",
    "f-comment", "f-total-min", "f-total-sec", "f-flow-min", "f-flow-sec",
    "f-power",
  ];
  // "ratée" and agitation were forgotten on restore (v8.72).
  const DRAFT_CHECKBOXES = ["f-preheat", "f-add-water-yes", "f-failed", "f-agitation-yes"];
  let draftTimer = null;

  function saveDraft() {
    // NEVER save while editing an existing extraction: the draft would
    // overwrite the form at the next startup with values that belong to a
    // row already saved.
    if (entry.editId) return;
    const values = {};
    DRAFT_FIELDS.forEach(id => { const el = $("#" + id); if (el) values[id] = el.value; });
    DRAFT_CHECKBOXES.forEach(id => { const el = $("#" + id); if (el) values[id] = el.checked; });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(),
        method: entry.method,
        diagnostics: [...entry.diagnostics],
        descriptors: [...entry.descriptors],
        /* The rating lives in the slider's value AND in its "not rated yet"
           state (v8.40). Without the state, a rating given before the page
           was unloaded came back unrated. */
        ratingEmpty: isRatingEmpty($("#f-rating")),
        /* v9.34: whether the date was set by hand. A blank form's date is
           only the time it was opened (often right after the previous cup was
           saved): restored as if chosen, it put that old time on the next cup. */
        dateTouched: !!entry.dateTouched,
        values,
      }));
    } catch (e) { /* storage full or refused, never mind */ }
  }

  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  }

  function clearDraft() {
    clearTimeout(draftTimer);
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* never mind */ }
  }

  /* Only restores if the draft says something: without this test, the blank
     form saved at first load would trigger a "draft restored" message at
     every opening, which would be absurd. */
  function isDraftUseful(b) {
    const v = b.values || {};
    // The coffee alone says nothing: a blank form always has one (v9.34).
    return Boolean((v["f-comment"] || "").trim() ||
      b.diagnostics.length || b.descriptors.length || b.ratingEmpty === false ||
      v["f-total-min"] || v["f-total-sec"] || v["f-volume"] || v["f-water"]);
  }

  function restoreDraft() {
    let b;
    try { b = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return false; }
    /* A draft saved before v9.06 has French keys (le, methode, valeurs...)
       and possibly French field ids: both translated (js/legacy-names.js). */
    b = LEGACY.renameDraft(b);
    if (!b || !b.values) return false;
    if (Date.now() - (b.savedAt || 0) > DRAFT_MAX_MS) { clearDraft(); return false; }
    if (!isDraftUseful(b)) return false;

    /* WITHOUT garderRecette (v8.37): with it, the draft's method applied but
       the recipe list stayed the one of the previous method. A Switch recipe
       set in a menu of Brikka recipes does not exist, and the browser left
       the menu EMPTY. Chris then landed on the entry screen without a recipe,
       every time he had brewed on the Switch the day before. */
    if (b.method) UI.chooseMethod(b.method);
    const freshDate = Date.now() - (b.savedAt || 0) <= DRAFT_DATE_MAX_MS;
    Object.entries(b.values).forEach(([id, value]) => {
      // A stale date does not replace the current time.
      if (id === "f-date" && !(freshDate && b.dateTouched)) return;
      const el = $("#" + id);
      if (el && value !== undefined && value !== null) el.value = value;
    });
    /* A date restored from a fresh draft comes from Chris, not from a default:
       arriving on the screen must therefore not replace it. */
    if (freshDate && b.dateTouched && b.values["f-date"]) entry.dateTouched = true;
    DRAFT_CHECKBOXES.forEach(id => { const el = $("#" + id); if (el) el.checked = !!b.values[id]; });

    /* NEVER an empty coffee or recipe after a restore: a draft can keep a
       coffee deactivated since, a recipe renamed or deleted, or an empty
       value. We then fall back on the first coffee and the method's first
       recipe, as on a fresh form: most of the time it is the one Chris
       keeps, and it is one click less. */
    if (!$("#f-coffee").value) {
      const first = UI.selectableCoffees()[0];
      if (first) $("#f-coffee").value = first.id;
    }
    // Without prefillFromRecipe: it would overwrite the draft's dose and water.
    if (!$("#f-recipe").value) UI.fillRecipeSelect();

    entry.diagnostics = new Set(b.diagnostics || []);
    entry.descriptors = new Set(b.descriptors || []);
    $$("#f-diagnostic .pill").forEach(x => setPressed(x, entry.diagnostics.has(x.dataset.diag)));
    $$("#f-descriptors .tag").forEach(x => setPressed(x, entry.descriptors.has(x.dataset.tag)));

    /* THROUGH THE OFFICIAL FUNCTION, not by hand. This line wrote the field's
        value directly, ignoring "not rated yet": after restoring an unrated
        draft, the screen announced "5" on a cup that saving was going to
        file as UNRATED. With the slider also sitting on 5, nothing betrayed
        the gap. It also forgot the "/ 10" and the stepper's inactive state. */
    // A draft from before v8.40 has no state: it stays unrated.
    markRating($("#f-rating"), b.ratingEmpty !== false);
    UI.updateRatingDisplay();
    $("#f-water-added").hidden = !$("#f-add-water-yes").checked;
    // The time wheels (v9.13) follow the fields the draft just wrote.
    UI.syncTimeWheels();
    UI.updateDiagnosticCorrection();
    UI.updateWarnings();
    UI.updateLive();
    UI.updateEntryAside();
    return true;
  }

  /* N1 (v9.21): WHETHER THE FORM HOLDS A CUP IN PROGRESS, for the dot of
     « Nouvelle tasse ». Read from the form itself, not from the stored draft:
     the stored one outlives a reset (and is written on every page hide, even
     untouched). What counts is what only a cup being brewed or tasted fills:
     a running stopwatch, the times, the volume, the rating, the tastes, the
     diagnostic, the comment, « ratée ». The coffee, the recipe, the dose and
     the grind are prefilled, they say nothing. Never while editing a saved cup. */
  const CUP_FIELDS = ["f-comment", "f-total-min", "f-total-sec", "f-flow-min", "f-flow-sec", "f-volume"];
  function draftInForm() {
    if (entry.editId) return false;
    if (UI.stopwatch && UI.stopwatch.state !== "stopped") return true;
    const filled = id => { const el = $("#" + id); return !!el && String(el.value || "").trim() !== ""; };
    const failed = $("#f-failed"), rating = $("#f-rating");
    return entry.descriptors.size > 0 || entry.diagnostics.size > 0 || !!(rating && !isRatingEmpty(rating)) ||
      CUP_FIELDS.some(filled) || !!(failed && failed.checked);
  }

  // Made available to the entry screen (wiring, saving) and to app.js (startup).
  Object.assign(UI, {
    DRAFT_MAX_MS, DRAFT_CHECKBOXES, DRAFT_FIELDS, DRAFT_KEY, DRAFT_DATE_MAX_MS,
    isDraftUseful, saveDraft, clearDraft, scheduleDraft, restoreDraft, draftInForm,
  });
})();
