/* History screen: the table, its filters, its sorting, its comparator.
 *
 * The sorting and the expanded rows live here and nowhere else: they are
 * display preferences, they do not sync and are not stored in the data. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, icon, $$, debounce, titleAttr, localDateKey, detailRatio, displayedDiags, isFailed,
    analyzableExts, extsWithCalcs, fmtShortDate, fmtDateTime, fmtDecimal, fmtDuration, fmtVND,
    average, deleteExtractionWithUndo, toast } = UI;

  // ---------- History ----------

  const sortState = { column: "date_time", dir: -1 };

  /* Strips diacritics so that "brule" finds "brûlé" and "cafe" finds
     "café". Without it a search in French is unusable from the keyboard. */
  function withoutAccents(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* Everything a search makes sense in: what Chris WROTE, plus what he
     chose. Not the numbers, there are dedicated filters for that. */
  function searchableText(e) {
    const coffee = DATA.coffeeOf(e);
    return withoutAccents([
      e.comment, e.descriptors, e.diagnostic, e.recipe, e.method,
      coffee ? coffee.name : "",
    ].filter(Boolean).join(" ").toLowerCase());
  }

  function filterHistory() {
    const exts = extsWithCalcs();
    const fCoffee = $("#h-coffee").value;
    const fMethod = $("#h-method").value;
    const fDiag = $("#h-diagnostic").value;
    const fScore = parseFloat($("#h-rating-min").value);
    const fFrom = $("#h-from").value;
    const fTo = $("#h-to").value;
    /* Search insensitive to case AND accents: typing "brule" must find
       "brûlé". normalize plus stripping the diacritics is the only correct
       way to do it in French without a lookup table. */
    const q = withoutAccents($("#h-search").value.trim().toLowerCase());
    /* "" all, "ok" the successful ones, "failed" the failed ones. The filter
       lives here and not in analyzableExts(): the history is the log, it shows
       everything by default, and it is Chris who asks to see only one side. */
    const fFailed = $("#h-failed").value;
    return exts.filter(e =>
      (!fFailed || (fFailed === "failed" ? isFailed(e) : !isFailed(e))) &&
      (!q || searchableText(e).includes(q)) &&
      (!fCoffee || e.coffee_id === fCoffee) &&
      (!fMethod || e.method === fMethod) &&
      (!fDiag || (e.diagnostic || "").split("|").includes(fDiag)) &&
      (isNaN(fScore) || (e.score_10 !== "" && e.score_10 >= fScore)) &&
      (!fFrom || e.date_time.slice(0, 10) >= fFrom) &&
      (!fTo || e.date_time.slice(0, 10) <= fTo)
    );
  }

  function sortValue(e, col) {
    if (col === "coffee_name") return e._c.coffee_name;
    /* Empty numeric columns must end up at the BOTTOM whatever the direction,
       hence -1 rather than "": an empty string would compare as text and
       rise to the top in ascending order. */
    if (col === "dose_g" || col === "total_time_s" || col === "temperature_c" || col === "heat_level" ||
      col === "flow_time_s" || col === "yield_ml") {
      return e[col] === "" || e[col] === undefined ? -1 : Number(e[col]);
    }
    // The table's columns read in the calculations (v9.20).
    if (col === "days_open") return e._c.days_open === "" ? -1 : e._c.days_open;
    if (col === "cost") return e._c.cup_cost_vnd === "" ? -1 : e._c.cup_cost_vnd;
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "grind") return e._c.clicks === "" ? -1 : e._c.clicks;
    if (col === "score_10") return e.score_10 === "" ? -1 : e.score_10;
    return e[col] === "" ? -1 : e[col];
  }

  /* Deferred version for the FILTERS only. The other calls (deletion, sort,
     return from editing) stay immediate: they follow a single gesture, there
     is nothing to group. */
  const renderHistoryDeferred = debounce(() => renderHistory());

  /* The visible state of the segmented control, aligned on the <select> that is authoritative. */
  function updateMethodSegment() {
    const v = $("#h-method") ? $("#h-method").value : "";
    $$(".filter-method .seg").forEach(b =>
      b.setAttribute("aria-pressed", b.dataset.method === v ? "true" : "false"));
  }

  /* AS CARDS or as a table: the threshold is the rest of the site's, 1024 px. */
  function asCards() {
    return typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  }

  /* IN SLICES OF 100 (v8.75). The history drew every cup on each render; it
     now shows a hundred, then a hundred more on demand. The count and the
     summary, however, always cover the whole filtered list. */
  const HISTORY_CHUNK = 100;
  let historyLimit = HISTORY_CHUNK;
  function moreButton(leftover) {
    return leftover > 0
      ? '<button type="button" class="btn btn-small h-plus" id="h-plus">' +
        I18N.t("history_more", { n: Math.min(leftover, HISTORY_CHUNK), t: leftover }) + "</button>"
      : "";
  }
  function wireMore() {
    const b = $("#h-plus");
    if (b) b.addEventListener("click", () => { historyLimit += HISTORY_CHUNK; renderHistory(); });
  }

  function renderHistory() {
    const list = filterHistory().sort((a, b) => {
      const va = sortValue(a, sortState.column), vb = sortValue(b, sortState.column);
      // Text sorts with its accents (v8.72): "Là Việt" no longer runs after "Z".
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, I18N.locale()) * sortState.dir;
      if (va < vb) return -sortState.dir;
      if (va > vb) return sortState.dir;
      return 0;
    });
    $("#h-count").textContent = I18N.t("history_count", {
      n: list.length, s: list.length > 1 ? "s" : "", t: DATA.state.extractions.length,
    });
    $("#h-empty").hidden = list.length > 0;
    // M6: no cups at all, or filters that let nothing through. The bare table header goes too.
    if (!list.length) renderEmpty(DATA.state.extractions.length === 0);
    $("#h-table").hidden = list.length === 0;

    /* The overline tells the TOTAL and since when, not the filter: it is the
       screen's identity, the filter has its own banner just below. */
    const allExts = extsWithCalcs();
    const first = allExts.length
      ? allExts.reduce((a, e) => (a && a.date_time < e.date_time ? a : e)).date_time : "";
    $("#h-highlight").textContent = allExts.length
      ? I18N.t("history_highlight", { n: allExts.length, s: allExts.length > 1 ? "s" : "",
          d: fmtShortDate(String(first).slice(0, 10)) })
      : "";

    $$("#h-table th .sort").forEach(s => s.textContent = "");
    const th = $('#h-table th[data-sort="' + sortState.column + '"] .sort');
    if (th) th.textContent = sortState.dir > 0 ? "▲" : "▼";

    renderSummary(list);
    updateActiveFilters();

    /* NO MORE DAY SUBHEADING (v8.29). Chris did not want it: a whole row for
       a day name is one row less for a cup. The full date reads at the start
       of each row, like everywhere else. */
    /* The phone cards. The other container is emptied: two live renders at
       the same time mean the same ids twice in the page. */
    /* L3 (v8.93): BY BAG, the journal replaces the table and the cards. The
       filters, the summary and the count above stay the same. */
    UI.updateViews();
    const view = UI.historyView();
    const byBag = view === "bag" && list.length > 0;
    // O5 (v9.20): the table where cups are ticked, a computer view (js/ui-table.js).
    const asTable = view === "table" && list.length > 0 && !asCards();
    $("#h-journal").hidden = !byBag;
    $("#screen-history .table-container").hidden = byBag || asTable;
    const grid = $("#h-grid-wrap");
    if (grid) grid.hidden = !asTable;
    const visible = list.slice(0, historyLimit);
    const leftover = list.length - visible.length;
    if (byBag || asTable) {
      $("#h-body").innerHTML = "";
      $("#h-cards").innerHTML = "";
      if (byBag) { clearGrid(); UI.renderJournal(list); }
      else { $("#h-journal").innerHTML = ""; UI.renderTable(visible, list, moreButton(leftover)); wireMore(); }
      afterRender();
      return;
    }
    clearGrid();
    $("#h-journal").innerHTML = "";
    if (asCards()) {
      $("#h-body").innerHTML = "";
      $("#h-cards").innerHTML = renderCards(visible) + moreButton(leftover);
      wireMore();
      afterRender();
      return;
    }
    $("#h-cards").innerHTML = "";
    $("#h-body").innerHTML = visible.map(e => historyRow(e)).join("") +
      (leftover > 0 ? '<tr class="h-row-plus"><td colspan="10">' + moreButton(leftover) + "</td></tr>" : "");
    wireMore();
    afterRender();
  }

  // The table empties when another view shows: its « plus » button would double #h-plus.
  function clearGrid() {
    if (!$("#h-grid-wrap")) return;
    $("#h-grid").innerHTML = "";
    $("#h-grid-more").innerHTML = "";
  }

  /* After every render, whatever the view: the comparison bar, the cups
     corrected since they were last drawn (Q3, js/ui-scenes.js, played as
     soon as their row is seen), and the comparison page, which follows the
     data and the language (js/ui-compare.js). */
  function afterRender() {
    updateComparisonBar();
    if (UI.playCupEdits) UI.playCupEdits($("#screen-history"));
    if (UI.refreshCompare) UI.refreshCompare();
  }

  /* THE CARDS: the same list, each card carries its full date. */
  // The cards whose "⋯" menu is open, kept from one render to the next.
  const openMenus = new Set();

  /* ACTIVE FILTERS AS PILLS (A3, v8.82). The panel folded on the phone must
     not hide that a filter is running: each filter set has its pill and its
     cross, and the button counts how many there are. The machine already has
     its visible control and the search its field: they get none. */
  function updateActiveFilters() {
    const activeFilters = [];
    const selectText = id => { const s = $("#" + id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent : s.value; };
    [["h-coffee", "history_filter_coffee"], ["h-diagnostic", "history_filter_diagnosis"], ["h-failed", "history_filter_botched"]].forEach(([id, key]) => {
      if ($("#" + id).value) activeFilters.push([id, I18N.t(key) + " : " + selectText(id)]);
    });
    if ($("#h-rating-min").value) activeFilters.push(["h-rating-min", I18N.t("history_filter_score", { n: $("#h-rating-min").value })]);
    const dateFrom = $("#h-from").value, dateTo = $("#h-to").value;
    // A single day (from the week recap): one pill, not two.
    if (dateFrom && dateFrom === dateTo) activeFilters.push(["h-from h-to", I18N.t("history_filter_on", { d: fmtShortDate(dateFrom) })]);
    else {
      if (dateFrom) activeFilters.push(["h-from", I18N.t("history_filter_from", { d: fmtShortDate(dateFrom) })]);
      if (dateTo) activeFilters.push(["h-to", I18N.t("history_filter_until", { d: fmtShortDate(dateTo) })]);
    }
    $("#h-actives").innerHTML = activeFilters.map(([id, t]) =>
      '<button type="button" class="h-on" data-clear="' + id + '" aria-label="' + titleAttr(I18N.t("history_filter_remove", { f: t })) + '">' +
      titleAttr(t) + '<span aria-hidden="true">×</span></button>').join("");
    $("#h-filter").textContent = activeFilters.length ? I18N.t("history_filter_count", { n: activeFilters.length }) : I18N.t("history_filter");
  }

  function renderCards(list) {
    return list.map(extractionCard).join("");
  }

  /* M6 (v9.13): AN EMPTY HISTORY SAYS WHAT TO DO. A grey line « Aucune
     extraction ne correspond » left you to guess the way out. Now a small
     drawing, one sentence, and the button that leads somewhere: the first cup
     when there is none, clearing the filters when they let nothing through.
     The steam drifts, unless reduced motion is asked for (css/finishing.css). */
  const EMPTY_DRAWINGS = {
    none: '<svg class="es-drawing" viewBox="0 0 150 110" aria-hidden="true">' +
      '<path class="es-fill" d="M30 40 L110 40 L104 92 Q102 100 94 100 L46 100 Q38 100 36 92 Z"/>' +
      '<path class="es-handle" d="M110 50 Q130 52 128 66 Q126 80 106 80"/>' +
      '<path class="es-steam" d="M55 30 Q50 20 58 12 M72 30 Q67 18 76 8 M89 30 Q84 20 92 12"/>' +
      '<ellipse class="es-surface" cx="70" cy="44" rx="36" ry="5"/></svg>',
    filtered: '<svg class="es-drawing" viewBox="0 0 150 110" aria-hidden="true">' +
      '<path class="es-fill" d="M22 52 L86 52 L81 92 Q79 99 72 99 L36 99 Q29 99 27 92 Z"/>' +
      '<path class="es-handle" d="M86 60 Q102 62 100 74 Q98 85 83 85"/>' +
      '<circle class="es-lens" cx="104" cy="38" r="20"/>' +
      '<path class="es-glass" d="M118 52 L134 68"/>' +
      '<path class="es-steam" d="M96 31 Q104 27 112 31"/></svg>',
  };
  function renderEmpty(noCups) {
    const zone = $("#h-empty");
    const k = noCups ? "none" : "filtered";
    zone.dataset.empty = k;
    zone.innerHTML = EMPTY_DRAWINGS[k] +
      "<h3>" + I18N.t(noCups ? "empty_history_title" : "empty_filtered_title") + "</h3>" +
      "<p>" + I18N.t(noCups ? "empty_history_text" : "empty_filtered_text") + "</p>" +
      '<div class="empty-state-actions"><button type="button" class="btn btn-primary" data-empty-action="' + (noCups ? "new" : "clear") + '">' +
      I18N.t(noCups ? "empty_history_button" : "empty_filtered_button") + "</button></div>";
  }

  // Every filter back to empty, the machine segment with them.
  function clearFilters() {
    FILTERS.forEach(id => { $("#" + id).value = ""; });
    renderHistory();
    updateMethodSegment();
  }

  /* THE SUMMARY BANNER: what the current filter tells.

     The count alone said "12 out of 62" without ever saying whether those
     twelve were good, which is the question one asks when filtering. The
     failed ones are counted apart: they are what explains a low average, and
     the average leaves them out for the same reason the analyses do. */
  function renderSummary(list) {
    const target = $("#h-summary");
    if (!list.length) { target.innerHTML = ""; target.hidden = true; return; }
    target.hidden = false;
    const rated = list.filter(e => e.score_10 !== "" && !isFailed(e));
    const best = rated.slice().sort((a, b) => b.score_10 - a.score_10)[0];
    const failed = list.filter(isFailed).length;
    const block = (value, label, rating) =>
      '<div class="summary-item"><span class="summary-value">' + value + "</span>" +
      '<span class="summary-caption">' + label + "</span>" +
      (rating ? '<span class="summary-rating">' + rating + "</span>" : "") + "</div>";
    target.innerHTML =
      block(list.length, I18N.t("history_summary_cups")) +
      block(rated.length ? fmtDecimal(average(rated.map(e => e.score_10)), 1) : I18N.t("history_summary_none"),
        I18N.t("history_summary_average")) +
      (best
        ? block(best.score_10, I18N.t("history_summary_best"),
            I18N.tr(best._c.coffee_name) + " · " + best.method)
        : block(I18N.t("history_summary_none"), I18N.t("history_summary_best"))) +
      block(failed, I18N.t("history_summary_botched"));
  }

  /* The COMMENT in the row, truncated. It was only visible when expanding,
     while it is the only field that says WHY a cup was good. The row already
     carries a bubble with the whole text on hover. */
  /* The comment on its OWN row, full width. Measured, the ten columns ask
     for 1741 px out of 992 available: giving it a column amounted to giving
     it three words. Here it has the whole table, it is no longer truncated
     at all, and the numeric columns stay readable.

     It carries the same data-id as its row: clicking it opens the same
     extraction, otherwise half the surface of a cup does not respond. */
  function historyComment(e) {
    const c = String(e.comment || "").trim();
    if (!c) return "";
    return '<tr class="row-comment" data-id="' + e.id + '"><td colspan="10">' +
      titleAttr(c) + "</td></tr>";
  }

  /* The row's tastes, three at most then "+n", as on the card of the last
     five: two views of the same object must say the same thing. */
  const MAX_HISTORY_TASTES = 3;
  function historyTastes(e) {
    const tags = String(e.descriptors || "").split("|").filter(Boolean);
    if (!tags.length) return "";
    const seen = tags.slice(0, MAX_HISTORY_TASTES).map(t => '<span class="last-tag">' + I18N.tag(t) + "</span>");
    const leftover = tags.length - seen.length;
    return '<span class="h-tastes">' + seen.join("") +
      (leftover > 0 ? '<span class="last-tag last-tag-plus">+' + leftover + "</span>" : "") + "</span>";
  }

  /* The detail: the logbook stores 22 fields per extraction and the table
     shows 12. The rest (drawdown, cup, volume, milk, agitation, cost...) reads
     in the HOVER SHEET on desktop, and in the expanded card on the phone.
     openDetails now only serves the cards. */
  const openDetails = new Set();
  const comparison = new Set();

  /* The CONTENT of the detail, without its wrapper: the hover sheet puts it in
     a floating div, the phone card in an expanded div. A single content, so
     never two versions of the detail that diverge. withoutComment: the
     table already writes the whole comment under the row, the sheet does not
     repeat it. */
  function detailContent(e, withoutComment) {
    const item = (key, value) => value === "" || value === undefined || value === null
      ? "" : '<div class="detail-item"><span>' + I18N.t(key) + "</span><b>" + value + "</b></div>";
    const cells = [
      item("detail_time", e.total_time_s !== "" ? fmtDuration(e.total_time_s) : ""),
      item("detail_drawdown", e.flow_time_s !== "" ? fmtDuration(e.flow_time_s) : ""),
      item("detail_temp", e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C" : ""),
      item("detail_heat", e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined
        ? e.heat_level : ""),
      item("detail_kettle", e.heating_s !== "" && e.heating_s !== undefined ? fmtDuration(e.heating_s) : ""),
      item("detail_volume", e.yield_ml !== "" ? e.yield_ml + " ml" : ""),
      item("detail_water_added", e.added_water_ml !== "" ? e.added_water_ml + " ml" : ""),
      item("detail_milk", e.milk_ml !== "" ? e.milk_ml + " ml" : ""),
      item("detail_stirring", e.stir_count !== "" ? e.stir_count : ""),
      item("detail_cup", e.cup ? titleAttr(e.cup) : ""),
      item("detail_preheated", Number(e.preheated_water) === 1 ? I18N.t("yes") : ""),
      item("detail_drink", e._c.drink_ml !== "" ? e._c.drink_ml + " ml" : ""),
      item("detail_cost", e._c.cup_cost_vnd !== "" ? fmtVND(e._c.cup_cost_vnd) : ""),
    ].filter(Boolean).join("");
    const tags = (e.descriptors || "").split("|").filter(Boolean)
      .map(t => '<span class="detail-tag">' + I18N.tag(t) + "</span>").join("");
    const comment = withoutComment ? "" : e.comment;
    return (cells ? '<div class="detail-grid">' + cells + "</div>" : "") +
      (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
      (comment ? '<p class="detail-comment">' + titleAttr(comment) + "</p>" : "") +
      (cells || tags || comment ? "" : '<p class="detail-empty">' + I18N.t("detail_nothing") + "</p>");
  }

  /* The row's date: the day in ink, the time muted. fmtDateTime returns
     "9 Aug 14:43"; we cut on the last space. */
  function twoToneDate(dh) {
    const text = fmtDateTime(dh);
    const i = text.lastIndexOf(" ");
    if (i < 0) return "<time>" + text + "</time>";
    return "<time>" + text.slice(0, i) + '</time><span class="hour">' + text.slice(i + 1) + "</span>";
  }

  /* No more expand arrow (v8.33): the detail comes as a hover sheet, see
     wireHoverSheet(). */
  function historyRow(e) {
    const compare = comparison.has(e.id);
    return '<tr data-id="' + e.id + '" class="row-hist' + (compare ? " compared" : "") + '">' +
      '<td><span class="td-date">' + twoToneDate(e.date_time) + "</span></td>" +
      '<td class="td-text">' + I18N.tr(e._c.coffee_name) + "</td>" +
      '<td><span class="chip-method ' + e.method.toLowerCase() + '">' + e.method + "</span></td>" +
      '<td class="td-recipe">' + (e.recipe || "") + "</td>" +
      /* Dose and water together, as on the card of the last five: they are
         two halves of the same gesture, and splitting them into two columns
         would have cost width without teaching anything. */
      '<td class="td-num">' + (e.dose_g !== "" && e.water_g !== "" ? e.dose_g + " → " + e.water_g + " <small>g</small>" : "") + "</td>" +
      /* The complement (microns, ratio in the cup or in the drink) goes UNDER
         the value, small: on one line, "1.2.0 (499 µm)" was truncated to
         "1.2.0 (49…" in its column. */
      '<td class="td-num">' + (e.grind_dial ? e.grind_dial + '<small class="sub">' + e._c.microns + " µm</small>"
        : e._c.ground ? "<small>" + I18N.t("bag_default") + "</small>" : "") + "</td>" +
      '<td class="td-num" title="' + titleAttr(detailRatio(e._c.ratioBase, e.dose_g, e.water_g)) + '">' +
      e._c.ratioText +
      (e._c.cupRatioText ? '<small class="sub">' + I18N.t("ratio_cup_short") + " " + e._c.cupRatioText + "</small>" : "") +
      (e._c.drinkRatio ? '<small class="sub">' + I18N.t("ratio_drink_short") + " " + e._c.drinkRatio + "</small>" : "") + "</td>" +
      '<td class="rating-cell">' + (isFailed(e)
        ? '<span class="badge-failed" title="' + titleAttr(I18N.t("botched_badge_title")) + '">' + I18N.t("botched_badge") + "</span>"
        : "") + (e.score_10 !== "" ? fmtDecimal(Number(e.score_10), 1) : UI.rateMark(e)) + "</td>" +
      /* TASTES AND DIAGNOSIS in the same cell, not in two columns: one more
         column asks for four coordinated edits (see DECISIONS, "The trap of
         frozen widths") and shifts silently if one of them is
         forgotten. */
      // No comment bubble here: it is written in full just below.
      '<td class="chip-diagnostic">' +
      (e.diagnostic ? '<span class="h-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
      historyTastes(e) + "</td>" +
      "<td>" + actionsExtraction(e) + "</td></tr>" +
      historyComment(e);
  }

  /* THE FIVE ACTIONS, written ONCE and rendered by the row as by the card.
     That is what guarantees that a gesture possible on desktop is also
     possible on the phone: two separate lists diverge at the first addition.
     The click is delegated on data-action, so nothing else needs to know.

     A LIST since v9.20: one entry per action, in the order of the « ⋯ »
     menu. One more action is one more entry, here or pushed from its own
     file (UI.CUP_ACTIONS); an entry with `run(ext, button)` is run by the
     click handler, the others are handled there by name. `svg` (a function,
     read at render) replaces the line icon of `icon` when the core has none.

     « Partager » (v9.19, js/ui-share.js) is such an entry. Its action is not
     named « share »: ui-share.js also answers a data-action="share" from the
     whole document, and the same click would open the sheet twice. */
  const CUP_ACTIONS = [
    { action: "comparer", icon: "comparer", title: () => I18N.t("history_compare"), state: e => (comparison.has(e.id) ? " on" : "") },
    /* The failed toggle, FIRST among the write actions: it is the one
       clicked most often after the fact, and its state shows without hover. */
    { action: "failed", icon: "failed", pressed: e => isFailed(e), state: e => (isFailed(e) ? " on-failed" : ""),
      title: e => I18N.t(isFailed(e) ? "history_unmark_botched" : "history_mark_botched") },
    { action: "dupliquer", icon: "dupliquer", title: () => "Dupliquer pour refaire la même" },
    { action: "modifier", icon: "modifier", title: () => "Modifier" },
    { action: "partager", svg: () => (UI.shareIcon ? UI.shareIcon() : icon("dupliquer")), title: () => I18N.t("share_action"),
      run: ext => UI.shareCup(ext) },
    { action: "supprimer", icon: "supprimer", title: () => "Supprimer", state: () => " danger" },
  ];
  function actionsExtraction(e) {
    return '<div class="actions-row">' + CUP_ACTIONS.map(a =>
      '<button class="btn-row' + (a.state ? a.state(e) : "") + '" data-action="' + a.action + '"' +
      (a.pressed ? ' aria-pressed="' + a.pressed(e) + '"' : "") + ' title="' + titleAttr(a.title(e)) + '">' + (a.svg ? a.svg() : icon(a.icon)) + "</button>").join("") +
      "</div>";
  }

  /* ONE CUP AS A CARD, for the phone. Same information as the row, but
     stacked: time, machine, coffee, recipe, dose and water, ratio, rating,
     tastes and diagnosis, comment, and the same five actions. */
  /* A3 (v8.82): THE COMPACT CARD. 260 px per cup made twenty screens for
     sixty cups. The recipe and the figures share a line, the comment fits on
     one, and the six actions go behind "⋯": you open them for one cup, you
     do not read them on all. The date stays on each card, without a day
     subheading, as Chris wanted in v8.29. */
  function extractionCard(e) {
    const expanded = openDetails.has(e.id);
    const menu = expanded || openMenus.has(e.id);
    const meta = [];
    if (e.recipe) meta.push('<span class="h-card-recipe">' + I18N.tr(e.recipe) + "</span>");
    if (e.dose_g !== "" && e.water_g !== "") meta.push(e.dose_g + " → " + e.water_g + " g");
    if (e._c.ratioText) meta.push(e._c.ratioText);
    if (e.grind_dial) meta.push(I18N.t("dial") + " " + e.grind_dial);
    return '<article class="h-card' + (expanded ? " expanded" : "") + (menu ? " menu-ouvert" : "") +
      (comparison.has(e.id) ? " compared" : "") + (isFailed(e) ? " failed" : "") +
      '" data-id="' + e.id + '">' +
      '<div class="h-card-head">' +
        '<span class="h-card-hour">' + fmtDateTime(e.date_time) + "</span>" +
        '<span class="chip-method ' + e.method.toLowerCase() + '">' + e.method + "</span>" +
        // v9.27: « à noter » on a cup without a score (js/ui-rate-sheet.js).
        '<span class="h-card-rating">' + (e.score_10 !== "" ? fmtDecimal(Number(e.score_10), 1) : UI.rateMark(e)) + "</span>" +
        '<button type="button" class="btn-menu-card" data-action="menu" aria-expanded="' + menu + '" aria-label="' +
          titleAttr(I18N.t("history_actions")) + '">⋯</button>' +
      "</div>" +
      '<p class="h-card-coffee">' + I18N.tr(e._c.coffee_name) +
        (isFailed(e) ? '<span class="mention-failed">' + I18N.t("botched_badge") + "</span>" : "") + "</p>" +
      (meta.length ? '<p class="h-card-meta">' + meta.join(" · ") + "</p>" : "") +
      ((e.diagnostic || e.descriptors)
        ? '<p class="h-card-tastes">' +
          (e.diagnostic ? '<span class="h-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
          historyTastes(e) + "</p>"
        : "") +
      (e.comment ? '<p class="h-card-comment">' + titleAttr(e.comment) + "</p>" : "") +
      (!menu ? "" : '<div class="h-card-footer">' +
        /* In words and not as an arrow: the phone has no hover, the detail
           expands there, and the button says what it does. */
        '<button type="button" class="btn-detail-card" data-action="deplier" aria-expanded="' + expanded + '">' +
        I18N.t(expanded ? "history_details_hide" : "history_details") + "</button>" +
        actionsExtraction(e) +
      "</div>") +
      (expanded ? '<div class="h-card-detail">' + detailContent(e) + "</div>" : "") +
      "</article>";
  }

  /* Comparator: two extractions side by side, differences highlighted. It is
     the manual version of the cross test the guide recommends (same coffee in
     both machines on the same day), which did not exist.

     Selection goes through a button in the Actions column and NOT through a
     column of checkboxes: the table has just been frozen at nine columns,
     adding one would break the widths. */
  function toggleComparison(id) {
    if (comparison.has(id)) comparison.delete(id);
    else {
      // Beyond two, the oldest selection gives up its place: simpler than
      // refusing the click, and it lets comparisons follow one another.
      if (comparison.size >= 2) comparison.delete([...comparison][0]);
      comparison.add(id);
    }
    renderHistory();
    if (comparison.size === 2) openComparison();
  }

  function updateComparisonBar() {
    const bar = $("#bar-comparison");
    if (!bar) return;
    bar.hidden = comparison.size === 0;
    $("#comparison-count").textContent = I18N.t(
      comparison.size === 1 ? "compare_one" : "compare_two", { n: comparison.size });
    $("#comparison-open").disabled = comparison.size !== 2;
  }

  /* O5 (v9.20): the two cups open the comparison PAGE (js/ui-compare.js),
     the same one the table's « Comparer » opens, on a phone as on a computer.
     The window of two columns to read yourself is gone. */
  function openComparison() {
    const ids = [...comparison];
    if (ids.length === 2) UI.openCompare(ids[0], ids[1]);
  }

  /* ---------- My best settings ----------
     The calculation lives in js/tuning.js, without DOM, to be testable
     without a browser. Here, only the display. */
  // Opens the coffee sheet (js/ui-coffee-sheet.js), by delegation on data-sheet.
  const sheetButton = c => '<button type="button" class="btn btn-small btn-subtle" data-sheet="' + c.id + '">' +
    I18N.t("sheet_view") + "</button>";

  function tuningCard(summary) {
    const c = summary.coffee;
    const header = '<div class="setting-header"><b>' + c.name + "</b>" +
      (c.active === 0 ? ' <span class="coffee-meta">' + I18N.t("list_inactive") + "</span>" : "") +
      (summary.average !== null
        ? '<span class="setting-average">' + I18N.t("setting_average", { m: fmtDecimal(summary.average, 1), n: summary.total }) + "</span>"
        : "") + "</div>";

    if (summary.reason === "below_average") {
      const t = summary.bestCup;
      return '<article class="card setting' + (c.active === 0 ? " inactive" : "") + '">' + header +
        '<p class="card-empty">' + I18N.t("setting_below_average", {
          s: TUNING.MIN_CUPS, score: fmtDecimal(t.note, 1), k: t.times, n: summary.missing,
        }) + "</p>" +
        '<div class="setting-actions"><button type="button" class="btn btn-small" data-redo="' + t.id + '">' +
        I18N.t("setting_redo") + "</button>" + sheetButton(c) + "</div></article>";
    }
    if (!summary.best) {
      const key = summary.reason === "aucune" ? "setting_none"
        : summary.reason === "not_enough" ? "setting_not_enough" : "setting_scattered";
      return '<article class="card setting' + (c.active === 0 ? " inactive" : "") + '">' + header +
        '<p class="card-empty">' + I18N.t(key, { n: summary.missing, s: TUNING.MIN_CUPS }) + "</p>" +
        '<div class="setting-actions">' + sheetButton(c) + "</div></article>";
    }

    const m = summary.best;
    // Gap between the winning combination and the coffee's average: it is
    // what says whether the setting is really worth it or everything is equal.
    const gap = m.average - summary.average;
    const chips = [
      m.recipe ? '<span class="setting-chip">' + I18N.tr(m.recipe) + "</span>" : "",
      m.grind ? '<span class="setting-chip">' + I18N.t("dial") + " " + m.grind + "</span>"
        : '<span class="setting-chip">' + I18N.t("bag_default") + "</span>",
      m.power ? '<span class="setting-chip">' + I18N.t("setting_heat", { f: m.power }) + "</span>" : "",
      m.preheat ? '<span class="setting-chip">' + I18N.t("detail_preheated") + "</span>" : "",
    ].filter(Boolean).join("");

    return '<article class="card setting' + (c.active === 0 ? " inactive" : "") + '">' + header +
      '<div class="setting-rating"><b>' + fmtDecimal(m.average, 1) + "</b><small> / 10</small>" +
      '<span>' + I18N.t("setting_over", { n: m.n }) +
      (Math.abs(gap) >= 0.2 ? ", " + I18N.t(gap > 0 ? "setting_better" : "setting_worse",
        { x: fmtDecimal(Math.abs(gap), 1) }) : "") + "</span></div>" +
      '<div class="setting-chips">' + chips + "</div>" +
      '<div class="setting-actions"><button type="button" class="btn btn-small" data-redo="' + m.referenceId + '">' +
      I18N.t("setting_redo") + "</button>" + sheetButton(c) + "</div></article>";
  }

  // The screen itself (a table since O3, v9.19) lives in js/ui-tuning.js; the card stays for the coffee sheet.

  function fillFilters() {
    const selCoffee = $("#h-coffee");
    const v = selCoffee.value;
    selCoffee.innerHTML = '<option value="">' + I18N.t("all") + "</option>" +
      DATA.state.coffees.map(c => '<option value="' + TOOLS.escapeHtml(c.id) + '">' + TOOLS.escapeHtml(c.name) + "</option>").join("");
    selCoffee.value = v;
    const selDiag = $("#h-diagnostic");
    const vd = selDiag.value;
    selDiag.innerHTML = '<option value="">' + I18N.t("all") + "</option>" +
      DIAGNOSTICS.map(d => '<option value="' + d + '">' + I18N.diag(d) + "</option>").join("");
    selDiag.value = vd;
  }

  // Made available to the other screens.
  /* Wiring of the history controls. Called once by app.js. */
  const FILTERS = ["h-search", "h-coffee", "h-method", "h-diagnostic", "h-rating-min", "h-from", "h-to", "h-failed"];

  /* THE HOVER SHEET (v8.33), in place of the arrow that expanded a detail
     row: Chris found it ugly, and expanding pushed the whole table down. The
     sheet floats under the hovered row (above if space runs out), after a
     short delay so it does not flicker when the mouse only crosses the
     table. It only shows what the row does not say.

     Only with a real mouse: under a finger there is no hover, the phone
     cards keep their expanded detail. It hides over the action buttons,
     which it must not get in the way of, and on scroll.

     P3 (v9.13): WHEREVER A CUP APPEARS. The same sheet now follows the
     journal cards, the cards by date and the dashboard latest cups, and it
     ends on the keys that act on the hovered cup (R, E, C, see
     js/ui-shortcuts.js). The hovered cup is known even before the sheet
     shows: the keys work as soon as the mouse is on the row. */
  const HOVER_ZONES = ["#h-body", "#h-cards", "#h-journal", "#h-grid", "#latest-list"];
  const HOVER_ROWS = "tr.row-hist, tr.row-comment, .h-card, tr.last-clickable, tr.last-comment";
  const hover = { id: null, hide: null };
  function hoverKeys() {
    return '<p class="h-sheet-keys">' + [["R", "hover_redo"], ["E", "hover_edit"], ["C", "hover_compare"]]
      .map(([k, key]) => "<kbd>" + k + "</kbd> " + I18N.t(key)).join('<span aria-hidden="true"> · </span>') + "</p>";
  }
  function wireHoverSheet() {
    if (typeof matchMedia !== "function" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const sheet = document.createElement("div");
    sheet.className = "h-sheet";
    sheet.setAttribute("role", "tooltip");
    sheet.hidden = true;
    document.body.appendChild(sheet);
    let pendingTimer = null, currentId = null, mouseX = 0;

    const hide = () => {
      clearTimeout(pendingTimer);
      currentId = null;
      hover.id = null;
      sheet.classList.remove("visible");
      sheet.hidden = true;
    };
    hover.hide = hide;
    const show = (id, row) => {
      const e = extsWithCalcs().find(x => x.id === id);
      if (!e || !row || !row.isConnected) return;
      // The side panel already shows this cup: nothing to add.
      if (UI.panelCupId && UI.panelCupId() === id) return;
      const content = detailContent(e, true);
      if (content.includes("detail-empty")) return;
      sheet.innerHTML = content + hoverKeys();
      sheet.hidden = false;
      // Under the whole group, the row AND its comment: we do not cover what is being read.
      const following = row.nextElementSibling;
      const last = following && (following.classList.contains("row-comment") || following.classList.contains("last-comment")) ? following : row;
      const low = last.getBoundingClientRect().bottom;
      const high = row.getBoundingClientRect().top;
      const l = sheet.offsetWidth, h = sheet.offsetHeight;
      const top = low + 6 + h <= window.innerHeight - 12 ? low + 6 : Math.max(12, high - 6 - h);
      const left = Math.min(Math.max(12, mouseX - 60), window.innerWidth - l - 12);
      sheet.style.top = Math.round(top) + "px";
      sheet.style.left = Math.round(left) + "px";
      requestAnimationFrame(() => sheet.classList.add("visible"));
    };

    HOVER_ZONES.map(sel => $(sel)).filter(Boolean).forEach(zone => {
      zone.addEventListener("mousemove", ev => {
        mouseX = ev.clientX;
        let row = ev.target.closest(HOVER_ROWS);
        const onAction = ev.target.closest(".actions-row, .btn-menu-card, .h-card-footer, button, .tc-check");
        // A comment line belongs to the cup above it.
        if (row && (row.classList.contains("row-comment") || row.classList.contains("last-comment"))) row = row.previousElementSibling;
        const id = row && !onAction ? row.getAttribute("data-id") || row.getAttribute("data-ext") : null;
        if (id === currentId) return;
        hide();
        if (!id) return;
        currentId = id;
        hover.id = id;
        // The dashboard rows carry a title (« Ouvrir en édition »): the sheet says more, two bubbles say too much.
        if (row.hasAttribute("title")) row.removeAttribute("title");
        pendingTimer = setTimeout(() => show(id, row), 280);
      });
      zone.addEventListener("mouseleave", hide);
    });
    /* Any click, not only in the table: the sheet lives on the body, and a
       click on the rail changes screen without leaving the row. */
    document.addEventListener("click", hide, true);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
  }
  /* The cup under the mouse, for the keyboard shortcuts. The side panel
     forgets it when it moves to another cup: the keys then act on the cup
     last pointed at, by the mouse or by the arrows. */
  const hoveredCupId = () => hover.id;
  function forgetHover() { if (hover.hide) hover.hide(); }

  /* OPENING THE HISTORY ON A FILTER (v8.87), for example a day of the week
     recap. The other filters start from scratch: we come to see THAT day,
     not that day crossed with a coffee chosen a week ago. */
  function openHistoryOn(values) {
    FILTERS.forEach(id => { $("#" + id).value = ""; });
    Object.entries(values).forEach(([id, v]) => { $("#" + id).value = v; });
    UI.activateScreen("history");
    renderHistory();
  }

  function wireHistory() {
    FILTERS.forEach(id => $("#" + id).addEventListener("input", renderHistoryDeferred));
    $("#h-reset").addEventListener("click", () => {
      FILTERS.forEach(id => { $("#" + id).value = ""; });
      renderHistory();
    });
    // A3: the filter panel folds on the phone, the active ones stay as pills.
    $("#h-filter").addEventListener("click", () => {
      const expanded = $("#screen-history").classList.toggle("filters-open");
      $("#h-filter").setAttribute("aria-expanded", String(expanded));
    });
    $("#h-actives").addEventListener("click", ev => {
      const b = ev.target.closest("[data-clear]");
      if (!b) return;
      b.dataset.clear.split(" ").forEach(id => { $("#" + id).value = ""; });
      renderHistory();
    });
    $("#h-export").addEventListener("click", () => {
      DATA.exportExtractions(filterHistory().map(e => { const { _c, ...leftover } = e; return leftover; }));
      toast(I18N.t("toast_export_filter"));
    });
    $$("#h-table th[data-sort]").forEach(th => th.addEventListener("click", () => {
      if (sortState.column === th.dataset.sort) sortState.dir = -sortState.dir;
      else { sortState.column = th.dataset.sort; sortState.dir = -1; }
      renderHistory();
    }));
    /* BOTH CONTAINERS, table and cards: the same handler serves both
       renders. Attached to #h-body alone, it left the six card actions
       rendered but dead. */
    const onHistoryClick = async ev => {
      // The table's boxes and headers are its own (js/ui-table.js), not a click on a cup.
      if (ev.target.closest(".tc-check, thead")) return;
      const btn = ev.target.closest("[data-action]");
      if (!btn) {
        /* Clicking the ROW opens the extraction for editing, like the last
           five on the dashboard. Without it, only the pencil worked: a 24 px
           target for a row that looks clickable as a whole.
           O7 (v9.13): on a wide screen, in the side panel instead, beside
           the list (js/ui-panel.js); the pencil still edits. */
        const row = ev.target.closest("[data-id]");
        if (!row) return;
        /* A text selection is not a click. Without this test, copying a
           comment from the expanded detail would open the editor. */
        const selection = window.getSelection ? String(window.getSelection()) : "";
        if (selection.trim()) return;
        const rowExt = DATA.state.extractions.find(e => e.id === row.dataset.id);
        if (rowExt) UI.openCup(rowExt, row);
        return;
      }
      const row = btn.closest("[data-id]");
      const id = row.dataset.id;
      const ext = DATA.state.extractions.find(e => e.id === id);
      if (!ext) return;
      const extra = CUP_ACTIONS.find(a => a.action === btn.dataset.action && typeof a.run === "function");
      if (extra) { await extra.run(ext, btn); return; }
      if (btn.dataset.action === "supprimer") {
        // No more native confirm(): the undo replaces the question. A system
        // box on the phone breaks the app feel, and it does not go through
        // the i18n layer. Q5 (v9.20): the row goes to the grounds bin.
        await deleteExtractionWithUndo(ext, row);
      } else if (btn.dataset.action === "modifier") {
        UI.loadExtractionIntoEntry(ext, false);
      } else if (btn.dataset.action === "dupliquer") {
        UI.redoCup(ext);
        toast(I18N.t("toast_duplicated"));
      } else if (btn.dataset.action === "menu") {
        if (openMenus.has(id)) openMenus.delete(id);
        else openMenus.add(id);
        renderHistory();
      } else if (btn.dataset.action === "deplier") {
        if (openDetails.has(id)) openDetails.delete(id);
        else openDetails.add(id);
        renderHistory();
      } else if (btn.dataset.action === "comparer") {
        toggleComparison(id);
      } else if (btn.dataset.action === "failed") {
        /* One click writes. No confirmation: the gesture is reversible from
           the same button, and asking to confirm a toggle would be heavier
           than the toggle itself. */
        await DATA.editExtraction(id, { ...ext, failed: Number(ext.failed) === 1 ? "" : 1 });
        toast(I18N.t(Number(ext.failed) === 1 ? "toast_unbotched" : "toast_botched"));
      }
    };
    [$("#h-body"), $("#h-cards"), $("#h-journal"), $("#h-grid")].filter(Boolean).forEach(z => z.addEventListener("click", onHistoryClick));
    UI.wireJournal(renderHistory);
    // O5, Q3 and Q5 (v9.20): the table, the comparison page, the scenes.
    UI.wireTable();
    UI.wireCompare();
    UI.wireScenes();
    wireHoverSheet();
    // M6: the empty state button, rendered with the list.
    $("#h-empty").addEventListener("click", ev => {
      const b = ev.target.closest("[data-empty-action]");
      if (!b) return;
      if (b.dataset.emptyAction === "clear") clearFilters();
      else UI.activateScreen("entry");
    });

    /* The machine's segmented control DRIVES the <select>, which stays the
       source of truth: all the filtering, the reset and the export read it.
       Two sources for the same filter means two states that diverge. */
    $$(".filter-method .seg").forEach(b => b.addEventListener("click", () => {
      const sel = $("#h-method");
      sel.value = b.dataset.method;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      updateMethodSegment();
    }));
    /* The reset goes through the select: the segment must follow. */
    $("#h-reset").addEventListener("click", () => setTimeout(updateMethodSegment, 0));
    $("#comparison-open").addEventListener("click", openComparison);
    $("#comparison-clear").addEventListener("click", () => { comparison.clear(); renderHistory(); });

    /* The desktop layer (v9.13): side panel, palette and keyboard. Wired
       from here because app.js is at its 450-line cap; each file wires its
       own controls. */
    UI.wireSidePanel();
    UI.wirePalette();
    UI.wireShortcuts();
  }

  Object.assign(UI, {
    openHistoryOn, clearFilters, hoveredCupId, forgetHover, CUP_ACTIONS,
    FILTERS, toggleComparison, wireHistory, tuningCard, comparison, openDetails,
    filterHistory, historyRow, updateComparisonBar, openComparison,
    actionsExtraction, extractionCard, historyComment, detailContent, asCards,
    updateMethodSegment,
    renderCards,
    historyTastes, fillFilters, renderHistory, renderHistoryDeferred,
    renderSummary, withoutAccents, searchableText, sortState, sortValue,
  });
})();
