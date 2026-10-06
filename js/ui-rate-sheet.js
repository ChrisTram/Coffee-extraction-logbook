/* v9.27: RATING LATER, FROM WHERE THE CUP IS.
 *
 * Chris often rates a cup after drinking it, sometimes hours later. Until
 * now that meant opening the whole entry form. Now:
 *
 *   - a cup not rated yet says so where it is listed: « à noter » in the
 *     journal (cards, table, chapters) and in the home's latest cups, and the
 *     home's last cup card carries a clear « Noter »;
 *   - on a computer (the side panel, from 1,100 px), that action opens the
 *     cup beside with its dial lit and focused (js/ui-panel-edit.js);
 *   - narrower, and on the phone, a small sheet rises from the bottom: the
 *     rating dial, the « ratée » box, « Enregistrer la note », and « Tout
 *     modifier » for the rest. It saves through the same path as the panel
 *     (the cup as stored, the score on top, DATA.editExtraction), then says
 *     « Note enregistrée » with « Annuler » in the message; a first 9 or 10
 *     reached late bursts its beans from the dial (once per device).
 *
 * The sheet is the quick entry's (css/dialogs.css, .panel-quick), built once
 * on first use; the dial is the J1 dial. Reduced motion: it simply appears. */
"use strict";

(() => {

  const { $, titleAttr, isFailed, dayLabelOf, fmtHour, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rowOf = id => DATA.state.extractions.find(x => x.id === id) || null;
  const unrated = e => !!e && !isFailed(e) && (e.score_10 === "" || e.score_10 === undefined || e.score_10 === null);

  // ---------- The marks in the lists ----------

  /* « à noter », for a cup without a score (a botched cup asks for nothing).
     A button of its own: a tap rates, it does not open the row. */
  function rateMark(e) {
    if (!unrated(e)) return "";
    return '<button type="button" class="rate-mark" data-rate-cup="' + titleAttr(e.id) + '" aria-label="' + titleAttr(I18N.t("rate_mark_aria")) + '">' +
      escapeHtml(I18N.t("rate_mark")) + "</button>";
  }

  // The home's last cup: « Noter », large, where the score would be.
  function rateAction(e) {
    if (!unrated(e)) return "";
    return '<button type="button" class="btn btn-primary btn-small rate-action" data-rate-cup="' + titleAttr(e.id) + '">' +
      '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M5.6 18.4a9 9 0 1 1 12.8 0"/><path d="M12 12l3.5-3.5"/></svg>' + escapeHtml(I18N.t("rate_action")) + "</button>";
  }

  // The row a mark sits in, for the panel to grow from it and walk its list.
  const ROWS = "tr.row-hist, .h-card, tr.last-clickable, #card-last";

  /* Rates a cup: beside on a wide screen, in the sheet otherwise. */
  function rateCup(id, from) {
    const ext = rowOf(id);
    if (!ext) return;
    if (UI.panelWanted && UI.panelWanted()) {
      const row = from && from.closest ? from.closest(ROWS) : null;
      UI.openCup(ext, row, { focus: true });
      return;
    }
    openSheet(ext, from);
  }

  // ---------- The sheet ----------

  let sh = null;
  let back = null;            // the element the focus goes back to

  function build() {
    if (sh || typeof document.createElement !== "function" || !document.body) return sh;
    const veil = document.createElement("div");
    veil.className = "overlay-nav rs-veil";
    veil.hidden = true;
    const box = document.createElement("div");
    box.className = "panel-quick rate-sheet";
    box.id = "rate-sheet";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "rs-title");
    box.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"></div>' +
      '<div class="quick-header"><div><p class="quick-when rs-when"></p><h3 id="rs-title"></h3><p class="rs-sub"></p></div>' +
        '<button type="button" class="btn-icon rs-close"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button></div>' +
      '<input type="range" id="rs-rating" class="slider-rating slider-inactive" min="0" max="10" step="0.5" value="5">' +
      '<div class="rating-dial rs-dial" id="rs-rating-dial" hidden></div>' +
      '<label class="pe-failed rs-failed"><input type="checkbox" id="rs-failed"><span></span></label>' +
      '<div class="quick-actions"><button type="button" class="btn btn-primary rs-save"></button><button type="button" class="btn btn-subtle rs-full"></button></div>';
    document.body.appendChild(veil);
    document.body.appendChild(box);
    const q = s => box.querySelector(s);
    sh = { veil, box, slider: q("#rs-rating"), host: q("#rs-rating-dial"), failed: q("#rs-failed"), save: q(".rs-save"), full: q(".rs-full"), id: null };
    UI.mountRatingDial(sh.slider, sh.host);
    UI.wireRating(sh.slider, () => { UI.paintRatingDial(sh.slider); sh.save.disabled = false; });
    sh.failed.addEventListener("change", () => { sh.save.disabled = false; });
    veil.addEventListener("click", () => closeSheet());
    q(".rs-close").addEventListener("click", () => closeSheet());
    sh.save.addEventListener("click", UI.oneAtATime(saveSheet));
    sh.full.addEventListener("click", () => {
      const ext = rowOf(sh.id);
      closeSheet(true);
      if (ext) UI.loadExtractionIntoEntry(ext, false);
    });
    box.addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.preventDefault(); closeSheet(); } });
    words();
    I18N.subscribe(words);
    return sh;
  }

  function words() {
    if (!sh) return;
    sh.box.setAttribute("aria-label", I18N.t("rate_sheet_title"));
    sh.box.querySelector("#rs-title").textContent = I18N.t("rate_sheet_title");
    sh.box.querySelector(".rs-failed span").textContent = I18N.t("pe_failed");
    sh.box.querySelector(".rs-close").setAttribute("aria-label", I18N.t("rate_sheet_close"));
    sh.save.textContent = I18N.t("rate_sheet_save");
    sh.full.textContent = I18N.t("rate_sheet_full");
    if (sh.id) fillHead(rowOf(sh.id));
    UI.paintRatingDial(sh.slider);
  }

  function fillHead(e) {
    if (!e) return;
    const coffee = DATA.coffeeOf(e);
    const name = I18N.tr(coffee ? coffee.name : "") || I18N.t("journal_unknown_coffee");
    sh.box.querySelector(".rs-when").textContent = dayLabelOf(e.date_time) + " " + fmtHour(e.date_time);
    sh.box.querySelector(".rs-sub").textContent = [name, I18N.machine(e.method || ""), I18N.tr(e.recipe || "")].filter(Boolean).join(" · ");
  }

  function openSheet(ext, from) {
    if (!build()) return;
    sh.id = ext.id;
    back = from && from.focus ? from : null;
    fillHead(ext);
    const empty = ext.score_10 === "" || ext.score_10 === undefined;
    sh.slider.value = empty ? "5" : String(ext.score_10);
    UI.markRating(sh.slider, empty);
    sh.failed.checked = isFailed(ext);
    sh.save.disabled = empty;
    UI.paintRatingDial(sh.slider);
    sh.veil.hidden = false;
    sh.box.classList.add("open");
    // The sheet rises (its CSS transition), then the dial takes the focus.
    setTimeout(() => UI.focusRating(sh.slider), calm() ? 0 : 180);
  }

  function closeSheet(quiet) {
    if (!sh || !sh.box.classList.contains("open")) return;
    sh.box.classList.remove("open");
    sh.veil.hidden = true;
    sh.id = null;
    if (!quiet && back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    back = null;
  }

  async function saveSheet() {
    const id = sh.id, row = rowOf(id);
    if (!row) { closeSheet(); return; }
    const M = UI.panelEditMath;
    const changes = M.ratingPayload(row, UI.isRatingEmpty(sh.slider) ? "" : sh.slider.value, sh.failed.checked);
    const r = sh.host.getBoundingClientRect ? sh.host.getBoundingClientRect() : null;
    if (!M.changedFields(row, changes).length) { closeSheet(); return; }
    const before = { ...row };
    const saved = await DATA.editExtraction(id, M.editedRow(row, changes));
    closeSheet(true);
    if (!saved) return;
    let moment = null;
    if (saved.score_10 !== "" && !M.same(before.score_10, saved.score_10)) {
      try { moment = UI.editMoment(saved, before); } catch (e) { moment = null; }
    }
    if (moment && moment.items.length && !calm() && r && r.width && UI.beanBurst) UI.beanBurst(r.left + r.width / 2, r.top + r.height * 0.4, document.body);
    const text = saved.score_10 === "" ? I18N.t("pe_saved_cleared") : I18N.t("pe_saved_rating");
    UI.toastAction(moment ? text + " · " + moment.line : text, I18N.t("pe_undo"), async () => {
      const now = rowOf(id);
      if (!now) return;
      await DATA.editExtraction(id, M.editedRow(now, { score_10: before.score_10, failed: before.failed }));
      toast(I18N.t("pe_undone"));
    });
  }

  // ---------- Wiring ----------

  /* One listener for every mark, in the capture phase: the row under it
     (a button itself, or watched by the side panel) never sees the tap. */
  function wireRateSheet() {
    const take = ev => {
      if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
      const b = ev.target && ev.target.closest ? ev.target.closest("[data-rate-cup]") : null;
      if (!b) return;
      ev.stopPropagation();
      ev.preventDefault();
      rateCup(b.getAttribute("data-rate-cup"), b);
    };
    document.addEventListener("click", take, true);
    document.addEventListener("keydown", take, true);
  }

  const isRateSheetOpen = () => !!(sh && sh.box.classList.contains("open"));

  Object.assign(UI, { rateMark, rateAction, rateCup, wireRateSheet, closeRateSheet: closeSheet, isRateSheetOpen });
})();
