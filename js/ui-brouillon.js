/* Entry draft: what the form held when the page was unloaded, put back in
 * place at startup.
 *
 * A separate file since v7.93: it shares with the entry screen only the
 * `saisie` object and the field ids, and it calls it through UI. It loads
 * AFTER ui-saisie.js to borrow `saisie`, which is an object mutated in
 * place, so safe to borrow. */
"use strict";

(() => {

  // Borrowed from the core, plus the entry state, exposed by ui-saisie.js.
  const { $, $$, setPressed, markRating, isRatingEmpty, entry } = UI;

  /* ---------- Entry draft ----------
     On a phone, leaving the tab during an extraction is enough for the
     browser to unload the page to reclaim memory. Without a draft, everything
     typed disappears, and it is precisely during the extraction that you
     step out of the app.

     Deliberately in localStorage and NOT in the synced data: a draft belongs
     to one device, sending it to the server would make a ghost entry appear
     on the other one. */
  const DRAFT_KEY = "brouillon-saisie";
  const DRAFT_MAX_MS = 24 * 60 * 60 * 1000;
  /* The draft's DATE has its own, much shorter, validity. The draft exists to
     survive the page being unloaded during an extraction, which is counted in
     minutes; keeping its timestamp for 24 h brought back the previous day's
     date on a fresh entry. Two hours easily cover a session, interruptions
     included. */
  const DRAFT_DATE_MAX_MS = 2 * 60 * 60 * 1000;
  const DRAFT_FIELDS = [
    "f-date", "f-cafe", "f-recette", "f-dose", "f-eau", "f-mouture", "f-temp",
    "f-chauffe-min", "f-chauffe-sec",
    "f-volume", "f-eau-ajoutee", "f-lait", "f-agitation", "f-tasse", "f-note",
    "f-commentaire", "f-total-min", "f-total-sec", "f-ecoulement-min", "f-ecoulement-sec",
    "f-puissance",
  ];
  // "ratée" and agitation were forgotten on restore (v8.72).
  const DRAFT_CHECKBOXES = ["f-prechauffe", "f-ajout-eau-oui", "f-ratee", "f-agitation-oui"];
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
        le: Date.now(),
        methode: entry.methode,
        diagnostics: [...entry.diagnostics],
        descripteurs: [...entry.descripteurs],
        /* The rating lives in the slider's value AND in its "not rated yet"
           state (v8.40). Without the state, a rating given before the page
           was unloaded came back unrated. */
        noteVide: isRatingEmpty($("#f-note")),
        valeurs: values,
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
    const v = b.valeurs || {};
    return Boolean(v["f-cafe"] || (v["f-commentaire"] || "").trim() ||
      b.diagnostics.length || b.descripteurs.length || b.noteVide === false ||
      v["f-total-min"] || v["f-total-sec"] || v["f-volume"] || v["f-eau"]);
  }

  function restoreDraft() {
    let b;
    try { b = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return false; }
    if (!b || !b.valeurs) return false;
    if (Date.now() - (b.le || 0) > DRAFT_MAX_MS) { clearDraft(); return false; }
    if (!isDraftUseful(b)) return false;

    /* WITHOUT garderRecette (v8.37): with it, the draft's method applied but
       the recipe list stayed the one of the previous method. A Switch recipe
       set in a menu of Brikka recipes does not exist, and the browser left
       the menu EMPTY. Chris then landed on the entry screen without a recipe,
       every time he had brewed on the Switch the day before. */
    if (b.methode) UI.chooseMethod(b.methode);
    const freshDate = Date.now() - (b.le || 0) <= DRAFT_DATE_MAX_MS;
    Object.entries(b.valeurs).forEach(([id, value]) => {
      // A stale date does not replace the current time.
      if (id === "f-date" && !freshDate) return;
      const el = $("#" + id);
      if (el && value !== undefined && value !== null) el.value = value;
    });
    /* A date restored from a fresh draft comes from Chris, not from a default:
       arriving on the screen must therefore not replace it. */
    if (freshDate && b.valeurs["f-date"]) entry.dateTouched = true;
    DRAFT_CHECKBOXES.forEach(id => { const el = $("#" + id); if (el) el.checked = !!b.valeurs[id]; });

    /* NEVER an empty coffee or recipe after a restore: a draft can keep a
       coffee deactivated since, a recipe renamed or deleted, or an empty
       value. We then fall back on the first coffee and the method's first
       recipe, as on a fresh form: most of the time it is the one Chris
       keeps, and it is one click less. */
    if (!$("#f-cafe").value) {
      const first = UI.selectableCoffees()[0];
      if (first) $("#f-cafe").value = first.id;
    }
    // Without prefillFromRecipe: it would overwrite the draft's dose and water.
    if (!$("#f-recette").value) UI.fillRecipeSelect();

    entry.diagnostics = new Set(b.diagnostics || []);
    entry.descripteurs = new Set(b.descripteurs || []);
    $$("#f-diagnostic .pilule").forEach(x => setPressed(x, entry.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => setPressed(x, entry.descripteurs.has(x.dataset.tag)));

    /* THROUGH THE OFFICIAL FUNCTION, not by hand. This line wrote the field's
        value directly, ignoring "not rated yet": after restoring an unrated
        draft, the screen announced "5" on a cup that saving was going to
        file as UNRATED. With the slider also sitting on 5, nothing betrayed
        the gap. It also forgot the "/ 10" and the stepper's inactive state. */
    // A draft from before v8.40 has no state: it stays unrated.
    markRating($("#f-note"), b.noteVide !== false);
    UI.updateRatingDisplay();
    $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
    UI.updateDiagnosticCorrection();
    UI.updateWarnings();
    UI.updateLive();
    UI.updateEntryAside();
    return true;
  }

  // Made available to the entry screen (wiring, saving) and to app.js (startup).
  Object.assign(UI, {
    DRAFT_MAX_MS, DRAFT_CHECKBOXES, DRAFT_FIELDS, DRAFT_KEY, DRAFT_DATE_MAX_MS,
    isDraftUseful, saveDraft, clearDraft, scheduleDraft, restoreDraft,
  });
})();
