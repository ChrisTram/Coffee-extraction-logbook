/* O5 + P2 (v9.20): THE JOURNAL AS A TABLE, where cups are ticked.
 *
 * Every journal action was one cup at a time: two cups to compare were
 * picked one by one, an export took the whole filter. On a computer the
 * journal gets a third view, « Table », next to « Par sachet » and « Par
 * date »: a box per cup, and as soon as one is ticked a bar slides in with
 * what can be done to all of them at once. Two cups: « Comparer » (the page
 * of js/ui-compare.js). Any number: « Exporter » (the CSV of the history
 * export, for these cups only) and « Marquer ratées » (or the reverse when
 * they all are). Shift ticks a whole range.
 *
 * The columns sort like the date table (the same sort state) and are chosen
 * in « Colonnes ▾ »; the choice is a display preference of this device
 * (localStorage history-columns), like the view itself. The phone has no
 * table: below 1024 px this view shows the cards by date.
 *
 * The rows carry the same class and id attribute as the date table's
 * (tr.row-hist, data-id), so the hover sheet, the side panel, the keyboard
 * shortcuts, the edit roll and the deletion scene treat them alike. */
"use strict";

(() => {

  const { $, titleAttr, displayedDiags, isFailed, fmtDateTime, fmtDecimal, fmtDuration, fmtVND, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  const COLUMNS_KEY = "history-columns";
  /* The columns, in their order. `on`: shown until Chris chooses otherwise
     (the mockup's nine). `sort`: the key of UI.sortValue. `num`: figures,
     aligned and never wrapped. `w`: the width in pixels of a column of
     figures; the words (coffee, recipe, tastes, comment) share the rest and
     wrap, and the table scrolls in its card before they drop under TEXT_MIN.
     The date cannot be hidden: it is the row's name. */
  const COLUMNS = [
    { key: "date", sort: "date_time", on: true, fixed: true, w: 116 },
    { key: "coffee", sort: "coffee_name", on: true, text: true },
    { key: "method", sort: "method", on: false, w: 96 },
    { key: "recipe", sort: "recipe", on: true, text: true },
    { key: "grind", sort: "grind", on: true, num: true, w: 84 },
    { key: "dose", sort: "dose_g", on: true, num: true, w: 98 },
    { key: "ratio", sort: "ratio", on: true, num: true, w: 66 },
    { key: "water", sort: "temperature_c", on: false, num: true, w: 90 },
    { key: "time", sort: "total_time_s", on: true, num: true, w: 62 },
    { key: "flow", sort: "flow_time_s", on: false, num: true, w: 96 },
    { key: "volume", sort: "yield_ml", on: false, num: true, w: 78 },
    { key: "tastes", sort: "diagnostic", on: true, text: true },
    { key: "comment", sort: "comment", on: false, text: true },
    { key: "days", sort: "days_open", on: false, num: true, w: 86 },
    { key: "cost", sort: "cost", on: false, num: true, w: 90 },
    { key: "score", sort: "score_10", on: true, num: true, w: 62 },
    { key: "actions", on: false, w: 172 },
  ];
  const CHECK_W = 46, TEXT_MIN = 130;

  // The ticked cups, and the last one ticked (the start of a Shift range).
  const ticked = new Set();
  const state = { last: null, menuOpen: false, ids: [] };

  /* The visible column keys: the saved choice, or the defaults. Unknown keys
     are dropped and the date always stays. Pure on its input, for the tests. */
  function columnsFrom(saved) {
    let keys = null;
    try { keys = saved ? JSON.parse(saved) : null; } catch (e) { keys = null; }
    if (!Array.isArray(keys)) return COLUMNS.filter(c => c.on).map(c => c.key);
    return COLUMNS.filter(c => c.fixed || keys.includes(c.key)).map(c => c.key);
  }
  function visibleColumns() {
    let saved = null;
    try { saved = localStorage.getItem(COLUMNS_KEY); } catch (e) { /* no storage: the defaults */ }
    return columnsFrom(saved);
  }
  function saveColumns(keys) {
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys)); } catch (e) { /* the choice lasts the session */ }
  }

  // ---------- Cells ----------

  function dateCell(e) {
    const text = fmtDateTime(e.date_time);
    const i = text.lastIndexOf(" ");
    return '<span class="td-date"><time>' + (i < 0 ? text : text.slice(0, i)) + "</time>" +
      (i < 0 ? "" : '<span class="hour">' + text.slice(i + 1) + "</span>") + "</span>";
  }
  /* In words, not pills: a table reads across, and pills stacked one per
     line made every row four lines high. The diagnosis first, muted. */
  function tastesCell(e) {
    const tags = String(e.descriptors || "").split("|").filter(Boolean);
    const seen = tags.slice(0, 4).map(x => I18N.tag(x)).join(", ") + (tags.length > 4 ? " +" + (tags.length - 4) : "");
    return (e.diagnostic ? '<span class="tc-diag">' + escapeHtml(displayedDiags(e.diagnostic)) + '</span>' + (seen ? ' · ' : '') : '') + escapeHtml(seen);
  }
  const CELLS = {
    date: dateCell,
    coffee: e => '<span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' + titleAttr(I18N.tr(e._c.coffee_name)),
    method: e => '<span class="chip-method ' + String(e.method || "").toLowerCase() + '">' + escapeHtml(e.method || "") + "</span>",
    recipe: e => titleAttr(I18N.tr(e.recipe || "")),
    grind: e => e.grind_dial ? escapeHtml(e.grind_dial) + (e._c.microns ? '<small class="sub">' + e._c.microns + " µm</small>" : "")
      : e._c.ground ? "<small>" + I18N.t("bag_default") + "</small>" : "",
    dose: e => e.dose_g !== "" && e.water_g !== "" ? e.dose_g + " → " + e.water_g + " <small>g</small>" : e.dose_g !== "" ? e.dose_g + " <small>g</small>" : "",
    ratio: e => e._c.ratioText || "",
    water: e => e.method === "Brikka"
      ? (e.heat_level !== "" && e.heat_level !== undefined ? escapeHtml(I18N.t("setting_heat", { f: e.heat_level })) : "")
      : (e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C" : ""),
    time: e => fmtDuration(e.total_time_s),
    flow: e => fmtDuration(e.flow_time_s),
    volume: e => e.yield_ml !== "" && e.yield_ml !== undefined ? e.yield_ml + " ml" : "",
    tastes: tastesCell,
    comment: e => titleAttr(e.comment || ""),
    days: e => e._c.days_open === "" ? "" : escapeHtml(I18N.t("tbl_day", { n: Number(e._c.days_open) + 1 })),
    cost: e => e._c.cup_cost_vnd !== "" ? fmtVND(e._c.cup_cost_vnd) : "",
    score: e => (isFailed(e) ? '<span class="badge-failed" title="' + titleAttr(I18N.t("botched_badge_title")) + '">' + I18N.t("botched_badge") + "</span>" : "") +
      (e.score_10 !== "" ? fmtDecimal(Number(e.score_10), 1) : UI.rateMark(e)),
    actions: e => UI.actionsExtraction(e),
  };
  const colOf = key => COLUMNS.find(c => c.key === key);
  const label = key => I18N.t("tbl_col_" + key);

  // ---------- Rendering ----------

  function header(keys, ids) {
    const all = ids.length > 0 && ids.every(id => ticked.has(id));
    const some = !all && ids.some(id => ticked.has(id));
    return "<thead><tr>" +
      '<th class="tc-check"><label class="tick-hit" title="' + titleAttr(I18N.t("tbl_tick_all")) + '"><input type="checkbox" class="tick" data-tick-all' +
        (all ? " checked" : "") + (some ? ' data-mixed="1"' : "") + ' aria-label="' + titleAttr(I18N.t("tbl_tick_all")) + '"></label></th>' +
      keys.map(k => {
        const c = colOf(k);
        const sorted = c.sort && UI.sortState.column === c.sort;
        return '<th class="tc-' + k + (c.num ? " tc-num" : "") + '"' + (c.sort ? ' data-grid-sort="' + c.sort + '"' : "") +
          (sorted ? ' aria-sort="' + (UI.sortState.dir > 0 ? "ascending" : "descending") + '"' : "") + ">" +
          escapeHtml(label(k)) + (sorted ? ' <span class="sort">' + (UI.sortState.dir > 0 ? "▲" : "▼") + "</span>" : "") + "</th>";
      }).join("") + "</tr></thead>";
  }

  function row(e, keys) {
    const on = ticked.has(e.id);
    return '<tr class="row-hist row-grid' + (on ? " ticked" : "") + (isFailed(e) ? " row-failed" : "") + '" data-id="' + escapeHtml(e.id) + '">' +
      '<td class="tc-check"><label class="tick-hit"><input type="checkbox" class="tick" data-tick="' + escapeHtml(e.id) + '"' + (on ? " checked" : "") +
        ' aria-label="' + titleAttr(I18N.t("tbl_tick_one", { d: fmtDateTime(e.date_time), c: I18N.tr(e._c.coffee_name) })) + '"></label></td>' +
      keys.map(k => {
        const c = colOf(k);
        return '<td class="tc-' + k + (c.num ? " tc-num" : "") + (c.text ? " tc-text" : "") + '">' + CELLS[k](e) + "</td>";
      }).join("") + "</tr>";
  }

  /* `visible` is the slice drawn, `list` the whole filtered list (what « tout
     cocher » covers), `more` the « Afficher plus » button. */
  function renderTable(visible, list, more) {
    const table = $("#h-grid");
    if (!table) return;
    const keys = visibleColumns();
    // A cup filtered out or deleted is no longer ticked: the actions act on what is seen.
    const inList = new Set(list.map(e => e.id));
    [...ticked].forEach(id => { if (!inList.has(id)) ticked.delete(id); });
    state.ids = visible.map(e => e.id);
    const width = k => colOf(k).w;
    const cols = '<colgroup><col style="width:' + CHECK_W + 'px">' +
      keys.map(k => "<col" + (width(k) ? ' style="width:' + width(k) + 'px"' : "") + ">").join("") + "</colgroup>";
    table.style.minWidth = keys.reduce((n, k) => n + (width(k) || TEXT_MIN), CHECK_W) + "px";
    table.innerHTML = cols + header(keys, list.map(e => e.id)) +
      '<tbody id="h-grid-body">' + visible.map(e => row(e, keys)).join("") + "</tbody>";
    const mixed = table.querySelector("[data-mixed]");
    if (mixed) mixed.indeterminate = true;
    const foot = $("#h-grid-more");
    if (foot) foot.innerHTML = more || "";
    renderTools(list);
  }

  // The bar of what can be done to the ticked cups, and the « Colonnes » menu.
  function renderTools(list) {
    const zone = $("#h-grid-tools");
    if (!zone) return;
    const chosen = list.filter(e => ticked.has(e.id));
    const n = chosen.length;
    const allFailed = n > 0 && chosen.every(isFailed);
    const keys = visibleColumns();
    const bar = n
      ? '<span class="gt-count">' + escapeHtml(I18N.t(n > 1 ? "tbl_chosen_many" : "tbl_chosen_one", { n })) + "</span>" +
        (n === 2 ? '<button type="button" class="btn btn-small btn-primary" data-grid-act="compare">' + escapeHtml(I18N.t("tbl_compare")) + "</button>" : "") +
        '<button type="button" class="btn btn-small" data-grid-act="export">' + escapeHtml(I18N.t("tbl_export")) + "</button>" +
        '<button type="button" class="btn btn-small" data-grid-act="failed">' + escapeHtml(I18N.t(allFailed ? "tbl_unmark_failed" : "tbl_mark_failed")) + "</button>" +
        '<button type="button" class="btn btn-small btn-subtle" data-grid-act="clear">' + escapeHtml(I18N.t("tbl_clear")) + "</button>"
      : '<span class="gt-hint">' + escapeHtml(I18N.t("tbl_hint")) + "</span>";
    const menu = '<div class="gt-cols"><button type="button" class="btn btn-small" data-grid-act="columns" aria-expanded="' + state.menuOpen + '" aria-haspopup="true">' +
      escapeHtml(I18N.t("tbl_columns")) + ' <span aria-hidden="true">▾</span></button>' +
      '<div class="gt-menu" role="group" aria-label="' + titleAttr(I18N.t("tbl_columns_aria")) + '"' + (state.menuOpen ? "" : " hidden") + ">" +
        COLUMNS.filter(c => !c.fixed).map(c => '<label class="gt-option"><input type="checkbox" data-grid-col="' + c.key + '"' +
          (keys.includes(c.key) ? " checked" : "") + "> " + escapeHtml(label(c.key)) + "</label>").join("") +
        '<button type="button" class="btn btn-small btn-subtle gt-reset" data-grid-act="columns-reset">' + escapeHtml(I18N.t("tbl_columns_reset")) + "</button>" +
      "</div></div>";
    zone.innerHTML = '<div class="gt-bar' + (n ? " open" : "") + '" aria-live="polite">' + bar + "</div>" + menu;
  }

  // ---------- Actions ----------

  function chosenCups() {
    return UI.filterHistory().filter(e => ticked.has(e.id));
  }

  async function act(action) {
    const cups = chosenCups();
    if (action === "clear") { ticked.clear(); UI.renderHistory(); return; }
    if (action === "compare" && cups.length === 2) { UI.openCompare(cups[0].id, cups[1].id); return; }
    if (action === "export" && cups.length) {
      DATA.exportExtractions(cups.map(e => { const { _c, ...rest } = e; return rest; }));
      toast(I18N.t("tbl_exported", { n: cups.length, s: cups.length > 1 ? "s" : "" }));
      return;
    }
    if (action === "failed" && cups.length) {
      // All failed already: the same button takes the mark off, the gesture undoes itself.
      const mark = !cups.every(isFailed);
      for (const e of cups) {
        const raw = DATA.state.extractions.find(x => x.id === e.id);
        if (raw && isFailed(raw) !== mark) await DATA.editExtraction(raw.id, { ...raw, failed: mark ? 1 : "" });
      }
      toast(I18N.t(mark ? "tbl_marked" : "tbl_unmarked", { n: cups.length, s: cups.length > 1 ? "s" : "" }));
    }
  }

  function tick(id, on, range) {
    if (range && state.last && state.ids.includes(state.last) && state.ids.includes(id)) {
      const [i, j] = [state.ids.indexOf(state.last), state.ids.indexOf(id)].sort((x, y) => x - y);
      state.ids.slice(i, j + 1).forEach(x => (on ? ticked.add(x) : ticked.delete(x)));
    } else if (on) ticked.add(id);
    else ticked.delete(id);
    state.last = id;
    UI.renderHistory();
  }

  function wireTable() {
    const wrap = $("#h-grid-wrap");
    if (!wrap) return;
    let shift = false;
    wrap.addEventListener("pointerdown", ev => { shift = !!ev.shiftKey; }, true);
    wrap.addEventListener("keydown", ev => { shift = !!ev.shiftKey; }, true);
    wrap.addEventListener("change", ev => {
      const box = ev.target;
      if (box.matches && box.matches("[data-tick]")) { tick(box.dataset.tick, box.checked, shift); return; }
      if (box.matches && box.matches("[data-tick-all]")) {
        UI.filterHistory().forEach(e => (box.checked ? ticked.add(e.id) : ticked.delete(e.id)));
        UI.renderHistory();
        return;
      }
      if (box.matches && box.matches("[data-grid-col]")) {
        const keys = [...wrap.querySelectorAll("[data-grid-col]")].filter(x => x.checked).map(x => x.dataset.gridCol);
        saveColumns(keys);
        UI.renderHistory();
      }
    });
    wrap.addEventListener("click", ev => {
      const th = ev.target.closest("[data-grid-sort]");
      if (th) {
        const col = th.dataset.gridSort;
        if (UI.sortState.column === col) UI.sortState.dir = -UI.sortState.dir;
        else { UI.sortState.column = col; UI.sortState.dir = -1; }
        UI.renderHistory();
        return;
      }
      const b = ev.target.closest("[data-grid-act]");
      if (b) {
        const action = b.dataset.gridAct;
        if (action === "columns") { state.menuOpen = !state.menuOpen; UI.renderHistory(); return; }
        if (action === "columns-reset") {
          try { localStorage.removeItem(COLUMNS_KEY); } catch (e) { /* nothing saved */ }
          UI.renderHistory();
          return;
        }
        act(action);
      }
      /* A click on a row (or on its action buttons) goes through the history's
         own handler, attached to #h-grid by wireHistory: the cup opens beside
         or in the entry, exactly as from the date table. */
    });
    // The columns menu closes on a click elsewhere and on Escape.
    document.addEventListener("click", ev => {
      if (!state.menuOpen || (ev.target.closest && ev.target.closest(".gt-cols"))) return;
      state.menuOpen = false;
      const m = $("#h-grid-tools .gt-menu"), btn = $('#h-grid-tools [data-grid-act="columns"]');
      if (m) m.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !state.menuOpen) return;
      state.menuOpen = false;
      UI.renderHistory();
    });
  }

  const tickedCups = () => [...ticked];
  Object.assign(UI, { renderTable, wireTable, columnsFrom, visibleColumns, tickedCups, TABLE_COLUMNS: COLUMNS });
})();
