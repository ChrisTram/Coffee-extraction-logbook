/* v9.27: THE CUP PANEL YOU WRITE IN.
 *
 * Since v9.13 a cup opened beside the screen on a computer (js/ui-panel.js),
 * read only, and more than half of the column stayed empty. Chris often
 * comes back later to rate a cup: now the panel is where he does it.
 *
 *   - THE SCORE FIRST, in place: the J1 rating dial (js/ui-rating-dial.js) at
 *     the top, half points, the « ratée » box, saved at once. A cup not rated
 *     yet opens with the dial lit and focused: ← → rate it, ↓ ↑ walk on to the
 *     next cup, the focus staying on the dial, so a row of cups is rated in a
 *     row. A small line says « Note enregistrée » with « Annuler » for a few
 *     seconds, and a first 9 or a first 10 reached late gets its moment there.
 *   - THE QUICK EDITS: the tastes (his usual ones first, and a search), the
 *     diagnostic, the comment with its microphone (R13), the main figures
 *     (grind, water or heat, total time, dose and water), each saved on
 *     blur or Enter, read and written the way the entry form does.
 *   - THE CONTEXT under them: how the cup stands against the coffee's
 *     average, its twin cups, the recipe and its window, the next cup (B1).
 *
 * ONE PATH TO THE DATA, the entry's: the cup as stored, the changed fields
 * on top, DATA.editExtraction (updated_at, the local write, the sync). So the
 * Q3 roll plays in the lists, the J6 record shines and R9 counts as after
 * any edit. Changes made within a short while go out as one write.
 *
 * THE EDITOR IS BUILT ONCE. The dial and the microphone keep listeners for
 * life (js/ui-rating-dial.js, js/ui-dictate.js): the panel moves the same
 * block from cup to cup, and a data change refills its fields in place
 * (never the one being typed in) instead of redrawing it, so the focus and
 * the caret survive a save. The pure parts are tested in tools/panel.test.mjs. */
"use strict";

(() => {

  const { $, titleAttr, isFailed, fmtDecimal, fmtDuration, dayLabelOf, fmtHour, displayedDiags, icon, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A rating settles this long after the last turn of the dial; the other changes a little later.
  const RATING_MS = 650, CHIPS_MS = 700, TEXT_MS = 1500;
  // « Note enregistrée » and its « Annuler » stay this long.
  const UNDO_MS = 6000;
  const USUAL_TASTES = 10, FOUND_TASTES = 8;

  // ---------- Pure parts ----------

  // The panel's figures: the kind of field, the column it writes, its bounds.
  const FIGURES = [
    { key: "grind", field: "grind_dial" },
    { key: "temp", field: "temperature_c", min: 40, max: 100, method: "Switch" },
    { key: "heat", field: "heat_level", min: 1, max: 10, integer: true, method: "Brikka" },
    { key: "time", field: "total_time_s" },
    { key: "dose", field: "dose_g", min: 1, max: 60 },
    { key: "water", field: "water_g", min: 1, max: 1000 },
  ];
  const figureOf = key => FIGURES.find(f => f.key === key) || null;

  /* A number as typed: a comma or a point, spaces ignored. "" for nothing,
     null when it is not a number. */
  function parseNumber(text) {
    const t = String(text === undefined || text === null ? "" : text).replace(/\s+/g, "").replace(",", ".");
    if (t === "") return "";
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }

  /* A duration as typed: « 3:45 », « 3'45 », « 3 45 », « 3m45 »; a bare
     number under 10 is minutes (« 4 »), above it seconds (« 258 »), as the
     entry's two fields would read them. "" for nothing, null when unreadable. */
  function parseTime(text) {
    const t = String(text === undefined || text === null ? "" : text).trim().toLowerCase();
    if (t === "") return "";
    let m = t.match(/^(\d{1,2})\s*(?::|'|m|min|\s|\.|,|h)\s*(\d{1,2})\s*(?:s|")?$/);
    if (m) {
      const sec = Number(m[2]);
      return sec < 60 ? Number(m[1]) * 60 + sec : null;
    }
    m = t.match(/^(\d{1,4})\s*(s|min|m)?$/);
    if (!m) return null;
    const n = Number(m[1]);
    if (m[2] === "s") return n;
    if (m[2] === "min" || m[2] === "m") return n * 60;
    return n < 10 ? n * 60 : n;
  }

  /* What a figure field holds, ready to store: { ok, value } or { ok: false,
     error, vars }. The grind is the entry's: the dial read by GRIND, written
     back as rotation.number.click; the time is seconds, as stored. */
  function parseField(key, text) {
    const f = figureOf(key);
    if (!f) return { ok: false, error: "pe_err_number" };
    if (key === "grind") {
      const t = String(text === undefined || text === null ? "" : text).trim();
      if (t === "") return { ok: true, value: "" };
      const p = typeof GRIND !== "undefined" ? GRIND.parseDial(t) : null;
      return p ? { ok: true, value: GRIND.dialFromClicks(p.clicks) } : { ok: false, error: "pe_err_grind" };
    }
    if (key === "time") {
      const s = parseTime(text);
      if (s === "") return { ok: true, value: "" };
      return s === null || s > 30 * 60 ? { ok: false, error: "pe_err_time" } : { ok: true, value: s };
    }
    const n = parseNumber(text);
    if (n === "") return { ok: true, value: "" };
    if (n === null || (f.integer && !Number.isInteger(n))) return { ok: false, error: "pe_err_number" };
    if (n < f.min || n > f.max) return { ok: false, error: "pe_err_range", vars: { a: f.min, b: f.max } };
    return { ok: true, value: Math.round(n * 10) / 10 };
  }

  /* A stored value, shown: the dial as is, the time in m:ss, the numbers
     with the locale's decimal sign (a comma in French). */
  function formatField(key, value, locale) {
    if (value === "" || value === undefined || value === null) return "";
    if (key === "grind") return String(value);
    if (key === "time") {
      const s = Number(value);
      return Number.isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0") : "";
    }
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(locale || "fr-FR", { maximumFractionDigits: 1, useGrouping: false }) : String(value);
  }

  // Two stored values say the same thing: 15 and "15", "" and undefined.
  function same(a, b) {
    const x = a === undefined || a === null ? "" : String(a), y = b === undefined || b === null ? "" : String(b);
    if (x === y) return true;
    return x !== "" && y !== "" && Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Number(x) === Number(y);
  }
  // The columns of `changes` whose value differs from the cup's.
  function changedFields(row, changes) {
    return Object.keys(changes || {}).filter(k => !same((row || {})[k], changes[k]));
  }

  /* What the rating writes: the score by half points ("" when cleared) and
     the « ratée » mark, only what differs from the cup. */
  function ratingPayload(row, score, failed) {
    const out = {};
    const s = score === "" || score === null || score === undefined ? ""
      : String(Math.max(0, Math.min(10, Math.round(Number(score) * 2) / 2)));
    if (!same(row && row.score_10, s)) out.score_10 = s;
    if (failed !== undefined && (Number(row && row.failed) === 1) !== !!failed) out.failed = failed ? 1 : "";
    return out;
  }

  // The cup with its changes, as the entry would save it (its computed part left out).
  function editedRow(row, changes) {
    const next = { ...row };
    delete next._c;
    changedFields(row, changes).forEach(k => { next[k] = changes[k]; });
    return next;
  }

  /* HIS USUAL TASTES: the tastes he ticks most, those of this coffee
     counting three times, the most frequent first, then the order of the
     wheel. Pure. */
  function usualTastes(exts, coffeeId, limit, all) {
    const count = new Map();
    (exts || []).forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => {
      count.set(t, (count.get(t) || 0) + (coffeeId && e.coffee_id === coffeeId ? 3 : 1));
    }));
    const order = all || [];
    return [...count.keys()].sort((a, b) => count.get(b) - count.get(a) ||
      (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 999 : order.indexOf(b)))
      .slice(0, limit || USUAL_TASTES);
  }

  // A text without case nor accents, for the search.
  const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // The tastes whose name (stored or shown) holds the query, those starting with it first.
  function findTastes(query, all, label) {
    const q = fold(query).trim();
    if (!q) return [];
    const name = t => fold(label ? label(t) : t);
    return (all || []).filter(t => name(t).includes(q) || fold(t).includes(q))
      .sort((a, b) => (name(a).startsWith(q) ? 0 : 1) - (name(b).startsWith(q) ? 0 : 1));
  }

  // A set of values toggled, kept in the reference order (the entry writes diagnostics that way).
  function toggled(list, value, order) {
    const set = new Set(list);
    if (set.has(value)) set.delete(value); else set.add(value);
    return order ? order.filter(v => set.has(v)).concat([...set].filter(v => !order.includes(v))) : [...set];
  }

  // ---------- The cup, as stored ----------

  const rowOf = id => DATA.state.extractions.find(x => x.id === id) || null;
  const split = s => String(s || "").split("|").filter(Boolean);

  // ---------- Writing: one path, gathered ----------

  const pending = { id: null, changes: {}, before: null, timer: 0 };
  let chain = Promise.resolve();
  let shown = null;          // the id the editor shows

  function queue(id, changes, delay) {
    if (pending.id && pending.id !== id) flush();
    const row = rowOf(id);
    if (!row) return;
    if (!pending.id) { pending.id = id; pending.before = { ...row }; pending.changes = {}; }
    Object.assign(pending.changes, changes);
    clearTimeout(pending.timer);
    pending.timer = setTimeout(flush, delay);
  }

  // Everything waiting goes out now (the panel moves on, closes, or the page hides).
  function flush() {
    clearTimeout(pending.timer);
    if (!pending.id) return chain;
    const { id, changes, before } = pending;
    pending.id = null; pending.changes = {}; pending.before = null;
    chain = chain.then(() => write(id, changes, before)).catch(e => console.error(e));
    return chain;
  }

  async function write(id, changes, before) {
    const row = rowOf(id);
    if (!row) return null;
    const keys = changedFields(row, changes);
    if (!keys.length) return null;
    const saved = await DATA.editExtraction(id, editedRow(row, changes));
    if (!saved) return null;
    if (keys.includes("score_10") || keys.includes("failed")) ratingSaved(saved, before);
    keys.forEach(k => flashSaved(id, k));
    return saved;
  }

  // ---------- The editor, built once ----------

  let ed = null;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  const MIC = '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';

  function buildEditor() {
    if (ed || typeof document.createElement !== "function") return ed;
    const root = el("div", "pe");
    root.innerHTML =
      '<section class="pe-rate">' +
        '<div class="pe-dial-wrap">' +
          '<input type="range" id="pe-rating" class="slider-rating slider-inactive" min="0" max="10" step="0.5" value="5" aria-describedby="pe-rate-help">' +
          '<div class="rating-dial pe-dial" id="pe-rating-dial" hidden></div>' +
          '<b class="sp-rating pe-score" aria-hidden="true"></b>' +
        "</div>" +
        '<div class="pe-rate-side">' +
          '<p class="pe-rate-title"></p>' +
          '<p class="pe-word"></p>' +
          '<p class="pe-rate-help" id="pe-rate-help"></p>' +
          '<div class="pe-rate-tools">' +
            '<label class="pe-failed"><input type="checkbox" id="pe-failed"><span></span></label>' +
            '<button type="button" class="rating-clear pe-clear" hidden></button>' +
          "</div>" +
          '<p class="pe-status" aria-live="polite" hidden><span class="pe-status-text"></span><button type="button" class="pe-undo"></button></p>' +
        "</div>" +
      "</section>" +
      '<section class="pe-block pe-figs"><div class="pe-fig-grid"></div>' +
        // v9.32: the cup it was drunk from, a menu of Chris's cups (Paramètres), saved on change.
        '<label class="pe-fig pe-cupsel"><span class="pe-fig-label"></span><select class="pe-cup-select"></select></label>' +
        '<p class="pe-msg" aria-live="polite" hidden></p></section>' +
      '<section class="pe-block pe-tastes"><div class="pe-h"><h3></h3><small class="pe-h-note"></small></div>' +
        '<div class="pe-chips" role="group"></div>' +
        '<input type="search" class="pe-search" enterkeyhint="done" autocomplete="off">' +
        '<div class="pe-chips pe-found" role="group"></div></section>' +
      '<section class="pe-block pe-diag"><div class="pe-h"><h3></h3></div><div class="pe-diag-groups"></div></section>' +
      '<section class="pe-block pe-comment"><div class="pe-h comm-head"><h3><label for="pe-comment"></label></h3>' +
        '<button type="button" class="dictate" id="pe-dictate" aria-pressed="false" aria-describedby="pe-dictate-live" hidden>' + MIC + '<span id="pe-dictate-text"></span></button></div>' +
        '<textarea id="pe-comment" rows="3" enterkeyhint="done"></textarea>' +
        '<p class="dictate-live" id="pe-dictate-live" aria-live="polite" hidden></p></section>';
    const q = s => root.querySelector(s);
    ed = {
      root, slider: q("#pe-rating"), host: q("#pe-rating-dial"), score: q(".pe-score"), word: q(".pe-word"),
      failed: q("#pe-failed"), clear: q(".pe-clear"), status: q(".pe-status"), statusText: q(".pe-status-text"), undoBtn: q(".pe-undo"),
      figs: q(".pe-fig-grid"), cup: q(".pe-cup-select"), msg: q(".pe-msg"), chips: q(".pe-tastes .pe-chips"), search: q(".pe-search"), found: q(".pe-found"),
      diags: q(".pe-diag-groups"), comment: q("#pe-comment"), ratingDirty: false, undo: null, statusTimer: 0,
    };
    UI.mountRatingDial(ed.slider, ed.host);
    UI.wireRating(ed.slider, onRatingInput);
    wireEditor();
    UI.wireDictation(q("#pe-dictate"), ed.comment, q("#pe-dictate-text"), q("#pe-dictate-live"));
    labels();
    I18N.subscribe(labels);
    return ed;
  }

  // The words of the editor, again on each change of language.
  function labels() {
    if (!ed) return;
    const r = ed.root, set = (s, t) => { const n = r.querySelector(s); if (n) n.textContent = t; };
    set(".pe-rate-title", I18N.t("pe_rate_title"));
    set(".pe-failed span", I18N.t("pe_failed"));
    ed.clear.textContent = I18N.t("pe_clear");
    ed.undoBtn.textContent = I18N.t("pe_undo");
    set(".pe-tastes h3", I18N.t("pe_tastes"));
    set(".pe-tastes .pe-h-note", I18N.t("pe_tastes_usual"));
    set(".pe-diag h3", I18N.t("pe_diag"));
    set(".pe-cupsel .pe-fig-label", I18N.t("pe_fig_cup"));
    set(".pe-comment label", I18N.t("detail_comment"));
    ed.search.placeholder = I18N.t("pe_tastes_search");
    ed.search.setAttribute("aria-label", I18N.t("pe_tastes_search"));
    ed.comment.placeholder = I18N.t("pe_comment_ph");
    ed.chips.setAttribute("aria-label", I18N.t("pe_tastes"));
    ed.found.setAttribute("aria-label", I18N.t("pe_tastes_search"));
    paintRating();
  }

  // ---------- The rating ----------

  const ratingText = n => fmtDecimal(Number(n), 1);
  function paintRating() {
    if (!ed) return;
    const empty = UI.isRatingEmpty(ed.slider);
    ed.score.textContent = empty ? "" : ratingText(ed.slider.value);
    ed.score.hidden = empty;
    ed.word.textContent = empty ? I18N.t("rating_dial_empty") : UI.ratingWord(Number(ed.slider.value));
    ed.clear.hidden = empty;
    ed.root.querySelector(".pe-rate").classList.toggle("pe-unrated", empty);
    const help = ed.root.querySelector(".pe-rate-help");
    if (help) help.textContent = I18N.t(empty ? "pe_rate_call" : "pe_rate_hint");
    UI.paintRatingDial(ed.slider);
  }

  function onRatingInput() {
    if (!ed || !shown) return;
    ed.ratingDirty = true;
    paintRating();
    queue(shown, ratingPayload(rowOf(shown), UI.isRatingEmpty(ed.slider) ? "" : ed.slider.value, ed.failed.checked), RATING_MS);
  }

  /* Saved: the line, its « Annuler », and the moment of a first 9 or 10
     (js/ui-celebrate.js decides, once per device). */
  function ratingSaved(saved, before) {
    if (!ed) return;
    ed.ratingDirty = false;
    let moment = null;
    if (saved.score_10 !== "" && before && !same(before.score_10, saved.score_10)) {
      try { moment = UI.editMoment(saved, before); } catch (e) { moment = null; }
    }
    const text = saved.score_10 === "" ? I18N.t("pe_saved_cleared") : I18N.t("pe_saved_rating");
    ed.undo = before ? { id: saved.id, score_10: before.score_10, failed: before.failed } : null;
    showStatus(moment ? text + " · " + moment.line : text, !!ed.undo, !!moment);
    if (moment && moment.items.length && shown === saved.id) burstFromDial();
  }

  function showStatus(text, withUndo, isMoment) {
    clearTimeout(ed.statusTimer);
    ed.statusText.textContent = text;
    ed.undoBtn.hidden = !withUndo;
    ed.status.classList.toggle("pe-moment", !!isMoment);
    ed.status.hidden = false;
    ed.status.classList.remove("pe-in");
    void ed.status.offsetWidth;
    ed.status.classList.add("pe-in");
    ed.statusTimer = setTimeout(() => { ed.status.hidden = true; ed.undo = null; }, isMoment ? UNDO_MS + 2000 : UNDO_MS);
  }

  function burstFromDial() {
    if (calm() || typeof UI.beanBurst !== "function" || !ed.host.isConnected) return;
    const r = ed.host.getBoundingClientRect();
    if (r.width) UI.beanBurst(r.left + r.width / 2, r.top + r.height * 0.4, ed.root);
  }

  async function undoRating() {
    const u = ed && ed.undo;
    if (!u) return;
    ed.undo = null;
    await flush();
    const row = rowOf(u.id);
    if (!row) return;
    await DATA.editExtraction(u.id, editedRow(row, { score_10: u.score_10, failed: u.failed }));
    showStatus(I18N.t("pe_undone"), false, false);
  }

  // ---------- The figures ----------

  function figuresFor(e) {
    return FIGURES.filter(f => !f.method || f.method === e.method)
      .filter(f => f.key !== "grind" || !(e._c && e._c.ground) || e.grind_dial);
  }

  function renderFigures(e) {
    const list = figuresFor(e);
    const sig = list.map(f => f.key).join(",") + "|" + I18N.locale();
    if (ed.figs.dataset.sig !== sig) {
      ed.figs.dataset.sig = sig;
      ed.figs.innerHTML = list.map(f =>
        '<label class="pe-fig" data-fig="' + f.key + '"><span class="pe-fig-label">' + escapeHtml(I18N.t("pe_fig_" + f.key)) + "</span>" +
        '<input type="text" data-fig-input="' + f.key + '" inputmode="' + (f.key === "time" ? "numeric" : "decimal") + '" enterkeyhint="done" autocomplete="off" spellcheck="false"' +
        (f.key === "grind" ? ' placeholder="1.5.0"' : f.key === "time" ? ' placeholder="3:30"' : "") + "></label>").join("");
    }
    list.forEach(f => {
      const input = ed.figs.querySelector('[data-fig-input="' + f.key + '"]');
      if (!input || document.activeElement === input || input.dataset.dirty === "1") return;
      input.value = formatField(f.key, e[f.field], I18N.locale());
      input.removeAttribute("aria-invalid");
    });
  }

  /* The cup menu: Chris's cups, plus the cup stored on this one if it has
     left the list since, and « aucune » for a cup logged without one. Rebuilt
     only when the list changes; the value follows the cup shown, except while
     the menu has the focus. */
  function renderCup(e) {
    const names = (DATA.state.cups || []).map(c => c.name).filter(Boolean);
    const current = e.cup || "";
    if (current && !names.includes(current)) names.push(current);
    const sig = names.join("|") + "|" + I18N.locale();
    if (ed.cup.dataset.sig !== sig) {
      ed.cup.dataset.sig = sig;
      ed.cup.innerHTML = '<option value="">' + escapeHtml(I18N.t("pe_cup_none")) + "</option>" +
        names.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + "</option>").join("");
    }
    if (document.activeElement !== ed.cup) ed.cup.value = current;
  }

  function commitFigure(input) {
    if (!shown || !input) return;
    const key = input.dataset.figInput, f = figureOf(key);
    const r = parseField(key, input.value);
    if (!r.ok) {
      input.setAttribute("aria-invalid", "true");
      ed.msg.textContent = I18N.t(r.error, r.vars || {});
      ed.msg.hidden = false;
      return;
    }
    input.removeAttribute("aria-invalid");
    ed.msg.hidden = true;
    input.dataset.dirty = "";
    input.value = formatField(key, r.value, I18N.locale());
    queue(shown, { [f.field]: r.value }, 0);
  }

  // The field's label says « enregistré » a moment, its border warms (css/panel.css).
  function flashSaved(id, field) {
    if (!ed || shown !== id) return;
    const f = FIGURES.find(x => x.field === field);
    const box = f ? ed.figs.querySelector('[data-fig="' + f.key + '"]')
      : field === "cup" ? ed.root.querySelector(".pe-cupsel")
      : field === "comment" ? ed.root.querySelector(".pe-comment")
        : field === "descriptors" ? ed.root.querySelector(".pe-tastes")
          : field === "diagnostic" ? ed.root.querySelector(".pe-diag") : null;
    if (!box) return;
    box.classList.remove("pe-saved");
    void box.offsetWidth;
    box.classList.add("pe-saved");
    box.dataset.savedWord = I18N.t("pe_saved");
    clearTimeout(box._savedTimer);
    box._savedTimer = setTimeout(() => box.classList.remove("pe-saved"), 1600);
  }

  // ---------- The tastes and the diagnostic ----------

  const ALL_TASTES = () => (typeof DESCRIPTORS !== "undefined" ? DESCRIPTORS : []);
  function chip(t, on, cls) {
    return '<button type="button" class="tag pe-chip' + (on ? " on" : "") + (cls ? " " + cls : "") + '" aria-pressed="' + on + '" data-pe-tag="' +
      titleAttr(t) + '">' + escapeHtml(I18N.tag(t)) + "</button>";
  }
  function renderTastes(e) {
    const ticked = split(e.descriptors);
    const usual = usualTastes(DATA.state.extractions, e.coffee_id, USUAL_TASTES, ALL_TASTES());
    const list = ticked.concat(usual.filter(t => !ticked.includes(t)));
    ed.chips.innerHTML = list.map(t => chip(t, ticked.includes(t))).join("");
    renderFound(e);
  }
  function renderFound(e) {
    const ticked = split(e.descriptors);
    const found = findTastes(ed.search.value, ALL_TASTES(), t => I18N.tag(t)).slice(0, FOUND_TASTES);
    ed.found.hidden = !ed.search.value.trim();
    ed.found.innerHTML = found.length ? found.map(t => chip(t, ticked.includes(t), "pe-found-chip")).join("")
      : '<p class="pe-none">' + escapeHtml(I18N.t("pe_tastes_none")) + "</p>";
  }
  function toggleTaste(t) {
    const e = rowOf(shown);
    if (!e) return;
    const pend = pending.id === shown && pending.changes.descriptors !== undefined ? pending.changes.descriptors : e.descriptors;
    const next = toggled(split(pend), t).join("|");
    queue(shown, { descriptors: next }, CHIPS_MS);
    // Drawn at once from what will be saved: the chip answers the finger, not the write.
    renderTastes({ ...e, descriptors: next });
  }

  function renderDiags(e) {
    const on = new Set(split(e.diagnostic));
    const groups = typeof DIAGNOSTIC_GROUPS !== "undefined" ? DIAGNOSTIC_GROUPS : [];
    ed.diags.innerHTML = groups.map(g =>
      '<div class="pe-diag-group"><span class="pe-diag-name">' + escapeHtml(I18N.group(g.name)) + '</span><div class="pe-chips">' +
      g.diags.map(d => '<button type="button" class="pill pe-chip' + (on.has(d) ? " on" : "") + '" aria-pressed="' + on.has(d) + '" data-pe-diag="' +
        titleAttr(d) + '">' + escapeHtml(I18N.diag(d)) + "</button>").join("") + "</div></div>").join("");
  }
  function toggleDiag(d) {
    const e = rowOf(shown);
    if (!e) return;
    const pend = pending.id === shown && pending.changes.diagnostic !== undefined ? pending.changes.diagnostic : e.diagnostic;
    const order = typeof DIAGNOSTICS !== "undefined" ? DIAGNOSTICS : null;
    const next = toggled(split(pend), d, order).join("|");
    queue(shown, { diagnostic: next }, CHIPS_MS);
    renderDiags({ ...e, diagnostic: next });
  }

  // ---------- Wiring the editor ----------

  function wireEditor() {
    const r = ed.root;
    ed.failed.addEventListener("change", () => {
      if (!shown) return;
      queue(shown, ratingPayload(rowOf(shown), UI.isRatingEmpty(ed.slider) ? "" : ed.slider.value, ed.failed.checked), 0);
    });
    ed.clear.addEventListener("click", () => {
      if (!shown) return;
      ed.slider.value = "5";
      UI.markRating(ed.slider, true);
      paintRating();
      queue(shown, ratingPayload(rowOf(shown), "", ed.failed.checked), 0);
      UI.focusRating(ed.slider);
    });
    ed.undoBtn.addEventListener("click", undoRating);
    /* ↓ ↑ on the dial walk the list, as everywhere in the panel: the dial
       keeps ← → (and Page Up, Page Down, Home, End). Taken before the dial
       sees them, in the capture phase. */
    ed.host.addEventListener("keydown", ev => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      ev.preventDefault();
      ev.stopPropagation();
      flush();
      if (UI.panelStep) UI.panelStep(ev.key === "ArrowDown" ? 1 : -1);
    }, true);
    // A drag ends: the score goes out now.
    ed.host.addEventListener("pointerup", () => { if (pending.id) { clearTimeout(pending.timer); pending.timer = setTimeout(flush, 120); } });
    // The figures: Enter or leaving the field saves, Escape puts the stored value back.
    ed.figs.addEventListener("input", ev => { const i = ev.target.closest("[data-fig-input]"); if (i) i.dataset.dirty = "1"; });
    ed.figs.addEventListener("keydown", ev => {
      const i = ev.target.closest("[data-fig-input]");
      if (!i) return;
      if (ev.key === "Enter") { ev.preventDefault(); commitFigure(i); if (i.select) i.select(); }
      else if (ev.key === "Escape") {
        const row = rowOf(shown), f = figureOf(i.dataset.figInput);
        if (row && f) { i.value = formatField(f.key, row[f.field], I18N.locale()); i.dataset.dirty = ""; i.removeAttribute("aria-invalid"); ed.msg.hidden = true; ev.stopPropagation(); }
      }
    });
    ed.figs.addEventListener("focusout", ev => {
      const i = ev.target.closest("[data-fig-input]");
      if (i && i.dataset.dirty === "1") commitFigure(i);
    });
    // The cup: saved as soon as it is picked.
    ed.cup.addEventListener("change", () => { if (shown) queue(shown, { cup: ed.cup.value }, 0); });
    // The tastes and the diagnostic: one tap toggles, saved together a moment later.
    r.addEventListener("click", ev => {
      const t = ev.target.closest("[data-pe-tag]");
      if (t) { toggleTaste(t.getAttribute("data-pe-tag")); return; }
      const d = ev.target.closest("[data-pe-diag]");
      if (d) toggleDiag(d.getAttribute("data-pe-diag"));
    });
    ed.search.addEventListener("input", () => { const e = rowOf(shown); if (e) renderFound(viewOf(e)); });
    ed.search.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        const first = ed.found.querySelector("[data-pe-tag]");
        if (first) { toggleTaste(first.getAttribute("data-pe-tag")); ed.search.value = ""; renderFound(viewOf(rowOf(shown))); }
      } else if (ev.key === "Escape" && ed.search.value) { ev.stopPropagation(); ed.search.value = ""; renderFound(viewOf(rowOf(shown))); }
    });
    // The comment: Enter saves (Shift Enter for a new line), leaving saves, a dictation saves after a pause.
    ed.comment.addEventListener("input", () => {
      ed.comment.dataset.dirty = "1";
      if (shown) queue(shown, { comment: ed.comment.value.trim() }, TEXT_MS);
    });
    ed.comment.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        if (shown) { queue(shown, { comment: ed.comment.value.trim() }, 0); ed.comment.dataset.dirty = ""; }
      }
    });
    ed.comment.addEventListener("blur", () => {
      if (ed.comment.dataset.dirty === "1" && shown) { queue(shown, { comment: ed.comment.value.trim() }, 0); ed.comment.dataset.dirty = ""; }
    });
    // The page hides (the phone sleeps, a tab changes): nothing waits.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }

  // The cup as the editor should show it: stored, with what is still waiting to be written.
  function viewOf(e) {
    if (!e) return e;
    return pending.id === e.id ? { ...e, ...pending.changes } : e;
  }

  /* Fills the editor with a cup. `fresh`: another cup than before, every
     field takes its values; otherwise the field being typed in, or edited
     and not saved yet, is left alone. */
  function fill(ext, fresh) {
    const e = viewOf(ext);
    if (fresh) {
      ed.ratingDirty = false;
      ed.root.querySelectorAll("[data-dirty]").forEach(n => { n.dataset.dirty = ""; });
      ed.msg.hidden = true;
      ed.search.value = "";
      if (!ed.undo || ed.undo.id !== e.id) { ed.status.hidden = true; ed.undo = null; }
    }
    if (fresh || !ed.ratingDirty) {
      const empty = e.score_10 === "" || e.score_10 === undefined;
      ed.slider.value = empty ? "5" : String(e.score_10);
      UI.markRating(ed.slider, empty);
      ed.failed.checked = isFailed(e);
    }
    paintRating();
    renderFigures(e);
    renderCup(e);
    renderTastes(e);
    renderDiags(e);
    if (fresh || (document.activeElement !== ed.comment && ed.comment.dataset.dirty !== "1")) ed.comment.value = e.comment || "";
  }

  // ---------- The panel's cup: the parts drawn as text ----------

  const link = (kind, id, text, title) => '<button type="button" class="sp-link" data-sp="' + kind + '" data-sp-id="' + titleAttr(id) + '"' +
    (title ? ' title="' + titleAttr(title) + '"' : "") + ">" + titleAttr(text) + "</button>";

  function headHtml(e) {
    const coffee = DATA.coffeeOf(e);
    const name = I18N.tr(coffee ? coffee.name : e._c.coffee_name || "") || I18N.t("journal_unknown_coffee");
    const recipe = e.recipe ? UI.findRecipe(e.recipe) : null;
    return '<div class="sp-titles">' +
      '<p class="sp-eyebrow">' + titleAttr(dayLabelOf(e.date_time) + " " + fmtHour(e.date_time)) + "</p>" +
      '<h2 class="sp-title">' + (coffee ? link("coffee", coffee.id, name, I18N.t("sheet_view")) : titleAttr(name)) + "</h2>" +
      '<p class="sp-sub"><span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' +
        titleAttr(I18N.machine(e.method || "")) +
        (e.recipe ? '<span class="sp-dot" aria-hidden="true">·</span>' +
          (recipe ? link("recipe", recipe.id, I18N.tr(e.recipe), "") : titleAttr(I18N.tr(e.recipe))) : "") +
        (e._c && e._c.ratioText ? '<span class="sp-dot" aria-hidden="true">·</span><span class="pe-ratio">' + titleAttr(e._c.ratioText) + "</span>" : "") +
      "</p></div>";
  }

  // What the inline fields do not hold, read only.
  function otherHtml(e) {
    const item = (key, value) => value === "" || value === undefined || value === null ? ""
      : '<div class="detail-item"><span>' + I18N.t(key) + "</span><b>" + value + "</b></div>";
    const cells = [
      item("detail_drawdown", e.flow_time_s !== "" ? fmtDuration(e.flow_time_s) : ""),
      item("detail_kettle", e.heating_s !== "" && e.heating_s !== undefined ? fmtDuration(e.heating_s) : ""),
      item("detail_volume", e.yield_ml !== "" ? e.yield_ml + " ml" : ""),
      item("detail_water_added", e.added_water_ml !== "" && e.added_water_ml !== undefined ? e.added_water_ml + " ml" : ""),
      item("detail_milk", e.milk_ml !== "" && e.milk_ml !== undefined ? e.milk_ml + " ml" : ""),
      item("detail_stirring", e.stir_count !== "" && e.stir_count !== undefined ? e.stir_count : ""),
      item("detail_cup", e.cup ? titleAttr(e.cup) : ""),
      item("detail_preheated", Number(e.preheated_water) === 1 ? I18N.t("yes") : ""),
      item("detail_drink", e._c.drink_ml !== "" && e._c.drink_ml !== undefined ? e._c.drink_ml + " ml" : ""),
      item("detail_cost", e._c.cup_cost_vnd !== "" && e._c.cup_cost_vnd !== undefined ? UI.fmtVND(e._c.cup_cost_vnd) : ""),
    ].filter(Boolean).join("");
    return cells ? '<section class="pe-block pe-other"><div class="pe-h"><h3>' + escapeHtml(I18N.t("pe_more")) + '</h3></div><div class="detail-grid">' + cells + "</div></section>" : "";
  }

  /* Against the coffee's average: the strip of the home's last cup (its
     rank among the rated cups of the coffee), or the average alone while
     this cup has no score. */
  function averageHtml(e) {
    const strip = UI.rankAmongSiblings ? UI.rankAmongSiblings(e) : "";
    if (strip) return '<section class="pe-block pe-avg">' + strip + "</section>";
    const notes = UI.analyzableExts().filter(x => x.coffee_id === e.coffee_id && x.score_10 !== "" && x.id !== e.id).map(x => Number(x.score_10));
    if (!notes.length) return "";
    return '<section class="pe-block pe-avg"><p class="pe-avg-line">' + escapeHtml(I18N.t("pe_avg_only", {
      m: fmtDecimal(TOOLS.average(notes), 1), n: notes.length, s: notes.length > 1 ? "s" : "" })) + "</p></section>";
  }

  // The twin cups (TUNING.twins, the entry's rule): what the same setting gave before.
  function twinsHtml(e) {
    const target = { coffee_id: e.coffee_id, recipe: e.recipe, grind_dial: String(e.grind_dial || "").trim(), ground: !!(e._c && e._c.ground) };
    const list = TUNING.twins(UI.analyzableExts().filter(x => x.id !== e.id), target, 3);
    if (list.length < 2) return "";
    const lines = list.map(j => {
      const x = j.ext, diffs = [];
      if (!j.sameCoffee) {
        const other = DATA.state.coffees.find(c => c.id === x.coffee_id);
        diffs.push(other ? I18N.tr(other.name) : I18N.t("twins_other_coffee"));
      }
      if (j.gap) diffs.push(I18N.t("twins_dial", { d: x.grind_dial, c: I18N.t(Math.abs(j.gap) > 1 ? "twins_clicks" : "twins_click", { n: (j.gap > 0 ? "+" : "") + j.gap }) }));
      if (x.method === "Switch" && x.temperature_c !== "" && !same(x.temperature_c, e.temperature_c)) diffs.push(x.temperature_c + " °C");
      if (x.method === "Brikka" && x.heat_level !== "" && x.heat_level !== undefined && !same(x.heat_level, e.heat_level)) diffs.push(I18N.t("twins_heat", { f: x.heat_level }));
      const day = new Date(String(x.date_time).slice(0, 10) + "T12:00").toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
      return '<li><button type="button" class="pe-twin" data-pe-cup="' + titleAttr(x.id) + '"><span class="j-date">' + escapeHtml(day) + '</span><span class="j-gap' + (diffs.length ? "" : " j-same") + '">' +
        escapeHtml(diffs.length ? diffs.join(" · ") : I18N.t(target.ground ? "twins_same_preground" : "twins_same")) + '</span><b class="j-rating">' +
        fmtDecimal(Number(x.score_10), 1) + "</b></button></li>";
    });
    const avg = TOOLS.average(list.map(j => Number(j.ext.score_10)));
    return '<section class="pe-block pe-twins"><div class="pe-h"><h3>' + escapeHtml(I18N.t("twins_title")) + "</h3><small>" +
      escapeHtml(I18N.t(target.ground ? "twins_rule_preground" : "twins_rule", { c: TUNING.TWIN_CLICKS })) + "</small></div>" +
      '<ol class="twins">' + lines.join("") + "</ol>" +
      '<p class="j-average">' + escapeHtml(I18N.t("twins_average", { m: fmtDecimal(avg, 1), n: list.length })) + "</p></section>";
  }

  // The recipe: its figures, its window (the target time) and its steps, scaled to this cup's water.
  function recipeHtml(e) {
    const r = e.recipe ? UI.findRecipe(e.recipe) : null;
    if (!r) return "";
    const chips = [
      r.dose && r.water ? r.dose + " g / " + r.water + " g" : "",
      r.ratioText ? I18N.tr(r.ratioText) : "", r.tempText ? I18N.tr(r.tempText) : "",
      r.dial ? I18N.t("dial") + " " + r.dial : "",
    ].filter(Boolean).map(c => '<span class="param-chip">' + escapeHtml(c) + "</span>").join("");
    const factor = typeof pourFactor === "function" ? pourFactor(r, e.water_g) : 1;
    const steps = r.has_variants ? [] : (r.steps || []).map(s => {
      const text = I18N.tr(s.text);
      return { t: s.t, text: factor !== 1 && typeof scalePours === "function" ? scalePours(text, factor) : text };
    });
    return '<section class="pe-block pe-recipe"><div class="pe-h"><h3>' + escapeHtml(I18N.t("pe_recipe_title")) + "</h3>" +
        link("recipe", r.id, I18N.tr(r.name), "") + "</div>" +
      (r.totalText ? '<p class="pe-window">' + escapeHtml(I18N.t("pe_recipe_window", { t: I18N.tr(r.totalText) })) + "</p>" : "") +
      (chips ? '<div class="recipe-params">' + chips + "</div>" : "") +
      (typeof UI.sourceLineHtml === "function" ? UI.sourceLineHtml(r, DATA.coffeeOf(e)) : "") +
      (steps.length ? '<ol class="recipe-steps">' + steps.map(s => '<li><span class="step-time">' + (s.t === null || s.t === undefined ? "·" : fmtDuration(s.t)) +
        "</span><span>" + escapeHtml(s.text) + "</span></li>").join("") + "</ol>" : "") + "</section>";
  }

  // B1, the next cup of this coffee, when its cups say something.
  function nextHtml(e) {
    const coffee = DATA.coffeeOf(e);
    if (!coffee || typeof UI.nextCupBlock !== "function") return "";
    return UI.nextCupBlock(coffee).replace('id="nc-h"', 'id="sp-nc-h"').replace('aria-labelledby="nc-h"', 'aria-labelledby="sp-nc-h"');
  }

  function moreHtml(e) {
    return otherHtml(e) + averageHtml(e) + twinsHtml(e) + recipeHtml(e) + nextHtml(e);
  }

  function actionsHtml(e) {
    const compared = !!(UI.comparison && UI.comparison.has(e.id));
    return '<button type="button" class="btn btn-primary btn-small" data-sp="redo">' + icon("dupliquer") + I18N.t("bubble_redo") + "</button>" +
      '<button type="button" class="btn btn-small" data-sp="edit">' + icon("modifier") + I18N.t("pe_edit_all") + "</button>" +
      '<button type="button" class="btn btn-small' + (compared ? " on" : "") + '" data-sp="compare" aria-pressed="' + compared + '">' +
        icon("comparer") + I18N.t("panel_compare") + "</button>" +
      '<button type="button" class="btn btn-small" data-share-cup="' + titleAttr(e.id) + '">' + UI.shareIcon() + I18N.t("share_action") + "</button>";
  }

  /* The whole cup, for js/ui-panel.js: the head, the slot the editor goes
     into, the context and the actions. */
  function panelCupHtml(e) {
    return '<article class="sp-cup pe-cup' + (isFailed(e) ? " failed" : "") + '">' +
      '<header class="sp-head pe-head">' + headHtml(e) + "</header>" +
      '<div class="pe-slot"></div>' +
      '<div class="pe-more">' + moreHtml(e) + "</div>" +
      '<div class="sp-actions">' + actionsHtml(e) + "</div>" +
    "</article>";
  }

  /* After the panel drew a cup: the editor moves into its slot and takes
     the cup. `opts.focus`: the dial takes the focus (a cup not rated yet, or
     « Noter »), lit for a moment. */
  function mountPanelCup(body, ext, opts) {
    const o = opts || {};
    if (!body || !buildEditor()) return;
    const slot = body.querySelector(".pe-slot");
    if (!slot) return;
    const dialSvg = ed.host.querySelector("svg");
    const hadFocus = !!dialSvg && document.activeElement === dialSvg;
    if (shown && shown !== ext.id) flush();
    const fresh = shown !== ext.id;
    shown = ext.id;
    slot.replaceWith(ed.root);
    fill(ext, fresh);
    const unrated = ext.score_10 === "" || ext.score_10 === undefined;
    if (o.focus || (fresh && unrated && !o.quiet) || hadFocus) {
      const rate = ed.root.querySelector(".pe-rate");
      if (unrated || o.focus) {
        rate.classList.remove("pe-call");
        void rate.offsetWidth;
        rate.classList.add("pe-call");
      }
      focusDial();
      /* Growing out of its row (R15), the panel is still hidden under the
         travelling card and cannot take the focus: once more after the trip. */
      if (document.activeElement !== dialSvg) {
        const id = ext.id;
        setTimeout(() => {
          const a = document.activeElement;
          if (shown === id && ed.root.isConnected && (!a || a === document.body)) focusDial();
        }, 560);
      }
    }
  }

  function focusDial() {
    const svg = ed && ed.host.querySelector("svg");
    if (svg && svg.focus) { try { svg.focus({ preventScroll: true }); } catch (e) { svg.focus(); } }
  }

  /* A data change while the same cup is shown: the head, the context and
     the actions are drawn again, the editor is only refilled. Returns false
     when the panel should draw everything (another cup, no editor). */
  function refreshPanelCup(body, ext) {
    if (!body || !ed || shown !== ext.id || !body.contains(ed.root)) return false;
    const card = body.querySelector(".pe-cup");
    if (!card) return false;
    card.classList.toggle("failed", isFailed(ext));
    const put = (sel, html) => { const n = card.querySelector(sel); if (n && n._html !== html) { n.innerHTML = html; n._html = html; } };
    put(".pe-head", headHtml(ext));
    put(".pe-more", moreHtml(ext));
    put(".sp-actions", actionsHtml(ext));
    fill(ext, false);
    return true;
  }

  // The panel closes or moves away from the cups: what waits is written, the editor leaves.
  function releasePanelCup() {
    flush();
    shown = null;
    if (ed && ed.root.parentNode) ed.root.remove();
  }

  // ← → from anywhere in the page while a cup is beside: the dial turns by half a point.
  function panelRate(delta) {
    if (!ed || !shown || !ed.root.isConnected) return false;
    const base = UI.isRatingEmpty(ed.slider) ? (delta > 0 ? 4.5 : 5.5) : Number(ed.slider.value);
    focusDial();
    UI.setRating(ed.slider, base + delta, false);
    return true;
  }

  // The panel's own buttons: a twin cup opens in the panel, « Brasser avec » prefills the entry.
  function onMoreClick(ev) {
    const twin = ev.target.closest && ev.target.closest("[data-pe-cup]");
    if (twin) {
      const ext = DATA.state.extractions.find(x => x.id === twin.getAttribute("data-pe-cup"));
      if (ext) UI.openCup(ext, { ids: [ext.id] });
      return true;
    }
    const next = ev.target.closest && ev.target.closest("[data-next-cup]");
    if (next) {
      const coffee = DATA.state.coffees.find(c => c.id === next.getAttribute("data-next-cup"));
      const target = coffee && UI.nextCupFor ? BAGS.nextCupSettings(UI.nextCupFor(coffee)) : null;
      if (!target) return true;
      flush();
      UI.closePanel();
      UI.redoCup(target);
      toast(I18N.t("setting_prefilled"));
      return true;
    }
    return false;
  }

  // Under the names the other files read; the pure parts for js/ui-rate-sheet.js and the tests.
  const flushPanelEdits = flush, onPanelMoreClick = onMoreClick;
  const panelEditMath = { parseNumber, parseTime, parseField, formatField, changedFields, ratingPayload, editedRow, usualTastes, findTastes, toggled, same };
  Object.assign(UI, {
    panelCupHtml, mountPanelCup, refreshPanelCup, releasePanelCup, panelRate, flushPanelEdits, onPanelMoreClick, panelEditMath,
  });
})();
