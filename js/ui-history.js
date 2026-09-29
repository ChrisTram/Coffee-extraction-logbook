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

  const sortState = { column: "date_heure", dir: -1 };

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
      e.commentaire, e.descripteurs, e.diagnostic, e.recette, e.methode,
      coffee ? coffee.nom : "",
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
    /* "" all, "ok" the successful ones, "ratee" the failed ones. The filter
       lives here and not in analyzableExts(): the history is the log, it shows
       everything by default, and it is Chris who asks to see only one side. */
    const fFailed = $("#h-failed").value;
    return exts.filter(e =>
      (!fFailed || (fFailed === "ratee" ? isFailed(e) : !isFailed(e))) &&
      (!q || searchableText(e).includes(q)) &&
      (!fCoffee || e.cafe_id === fCoffee) &&
      (!fMethod || e.methode === fMethod) &&
      (!fDiag || (e.diagnostic || "").split("|").includes(fDiag)) &&
      (isNaN(fScore) || (e.note_sur_10 !== "" && e.note_sur_10 >= fScore)) &&
      (!fFrom || e.date_heure.slice(0, 10) >= fFrom) &&
      (!fTo || e.date_heure.slice(0, 10) <= fTo)
    );
  }

  function sortValue(e, col) {
    if (col === "cafe_nom") return e._c.cafe_nom;
    /* Empty numeric columns must end up at the BOTTOM whatever the direction,
       hence -1 rather than "": an empty string would compare as text and
       rise to the top in ascending order. */
    if (col === "dose_g" || col === "temps_total_s" || col === "temperature_c" || col === "puissance_feu") {
      return e[col] === "" || e[col] === undefined ? -1 : Number(e[col]);
    }
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "mouture") return e._c.clicks === "" ? -1 : e._c.clicks;
    if (col === "note_sur_10") return e.note_sur_10 === "" ? -1 : e.note_sur_10;
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
        I18N.t("h_plus", { n: Math.min(leftover, HISTORY_CHUNK), t: leftover }) + "</button>"
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
    $("#h-count").textContent = I18N.t("h_compte", {
      n: list.length, s: list.length > 1 ? "s" : "", t: DATA.state.extractions.length,
    });
    $("#h-empty").hidden = list.length > 0;

    /* The overline tells the TOTAL and since when, not the filter: it is the
       screen's identity, the filter has its own banner just below. */
    const allExts = extsWithCalcs();
    const first = allExts.length
      ? allExts.reduce((a, e) => (a && a.date_heure < e.date_heure ? a : e)).date_heure : "";
    $("#h-highlight").textContent = allExts.length
      ? I18N.t("h_surligne", { n: allExts.length, s: allExts.length > 1 ? "s" : "",
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
    const byBag = UI.historyView() === "sachet" && list.length > 0;
    $("#h-journal").hidden = !byBag;
    $("#screen-historique .table-container").hidden = byBag;
    if (byBag) {
      $("#h-body").innerHTML = "";
      $("#h-cards").innerHTML = "";
      UI.renderJournal(list);
      updateComparisonBar();
      return;
    }
    $("#h-journal").innerHTML = "";
    const visible = list.slice(0, historyLimit);
    const leftover = list.length - visible.length;
    if (asCards()) {
      $("#h-body").innerHTML = "";
      $("#h-cards").innerHTML = renderCards(visible) + moreButton(leftover);
      wireMore();
      updateComparisonBar();
      return;
    }
    $("#h-cards").innerHTML = "";
    $("#h-body").innerHTML = visible.map(e => historyRow(e)).join("") +
      (leftover > 0 ? '<tr class="h-row-plus"><td colspan="10">' + moreButton(leftover) + "</td></tr>" : "");
    wireMore();
    displayed = new Map(visible.map(e => [e.id, e]));
    updateComparisonBar();
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
    [["h-coffee", "h_f_cafe"], ["h-diagnostic", "h_f_diag"], ["h-failed", "h_f_ratees"]].forEach(([id, key]) => {
      if ($("#" + id).value) activeFilters.push([id, I18N.t(key) + " : " + selectText(id)]);
    });
    if ($("#h-rating-min").value) activeFilters.push(["h-rating-min", I18N.t("h_f_note", { n: $("#h-rating-min").value })]);
    const dateFrom = $("#h-from").value, dateTo = $("#h-to").value;
    // A single day (from the week recap): one pill, not two.
    if (dateFrom && dateFrom === dateTo) activeFilters.push(["h-from h-to", I18N.t("h_f_le", { d: fmtShortDate(dateFrom) })]);
    else {
      if (dateFrom) activeFilters.push(["h-from", I18N.t("h_f_du", { d: fmtShortDate(dateFrom) })]);
      if (dateTo) activeFilters.push(["h-to", I18N.t("h_f_au", { d: fmtShortDate(dateTo) })]);
    }
    $("#h-actives").innerHTML = activeFilters.map(([id, t]) =>
      '<button type="button" class="h-on" data-clear="' + id + '" aria-label="' + titleAttr(I18N.t("h_f_retirer", { f: t })) + '">' +
      titleAttr(t) + '<span aria-hidden="true">×</span></button>').join("");
    $("#h-filter").textContent = activeFilters.length ? I18N.t("h_filtrer_n", { n: activeFilters.length }) : I18N.t("h_filtrer");
  }

  function renderCards(list) {
    return list.map(extractionCard).join("");
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
    const rated = list.filter(e => e.note_sur_10 !== "" && !isFailed(e));
    const best = rated.slice().sort((a, b) => b.note_sur_10 - a.note_sur_10)[0];
    const failed = list.filter(isFailed).length;
    const block = (value, label, rating) =>
      '<div class="summary-item"><span class="summary-value">' + value + "</span>" +
      '<span class="summary-caption">' + label + "</span>" +
      (rating ? '<span class="summary-rating">' + rating + "</span>" : "") + "</div>";
    target.innerHTML =
      block(list.length, I18N.t("h_res_tasses")) +
      block(rated.length ? fmtDecimal(average(rated.map(e => e.note_sur_10)), 1) : I18N.t("h_res_aucune"),
        I18N.t("h_res_moyenne")) +
      (best
        ? block(best.note_sur_10, I18N.t("h_res_meilleure"),
            I18N.tr(best._c.cafe_nom) + " · " + best.methode)
        : block(I18N.t("h_res_aucune"), I18N.t("h_res_meilleure"))) +
      block(failed, I18N.t("h_res_ratees"));
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
    const c = String(e.commentaire || "").trim();
    if (!c) return "";
    return '<tr class="row-comment" data-id="' + e.id + '"><td colspan="10">' +
      titleAttr(c) + "</td></tr>";
  }

  /* The row's tastes, three at most then "+n", as on the card of the last
     five: two views of the same object must say the same thing. */
  const MAX_HISTORY_TASTES = 3;
  function historyTastes(e) {
    const tags = String(e.descripteurs || "").split("|").filter(Boolean);
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
  // The extractions of the displayed table, by id: the sheet re-reads them on hover.
  let displayed = new Map();

  /* The CONTENT of the detail, without its wrapper: the hover sheet puts it in
     a floating div, the phone card in an expanded div. A single content, so
     never two versions of the detail that diverge. withoutComment: the
     table already writes the whole comment under the row, the sheet does not
     repeat it. */
  function detailContent(e, withoutComment) {
    const item = (key, value) => value === "" || value === undefined || value === null
      ? "" : '<div class="detail-item"><span>' + I18N.t(key) + "</span><b>" + value + "</b></div>";
    const cells = [
      item("d_temps", e.temps_total_s !== "" ? fmtDuration(e.temps_total_s) : ""),
      item("d_ecoulement", e.temps_ecoulement_s !== "" ? fmtDuration(e.temps_ecoulement_s) : ""),
      item("d_temp", e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C" : ""),
      item("d_feu", e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined
        ? e.puissance_feu : ""),
      item("d_chauffe", e.chauffe_s !== "" && e.chauffe_s !== undefined ? fmtDuration(e.chauffe_s) : ""),
      item("d_volume", e.volume_extrait_ml !== "" ? e.volume_extrait_ml + " ml" : ""),
      item("d_eau_ajoutee", e.eau_ajoutee_ml !== "" ? e.eau_ajoutee_ml + " ml" : ""),
      item("d_lait", e.lait_ml !== "" ? e.lait_ml + " ml" : ""),
      item("d_agitation", e.agitation_nb !== "" ? e.agitation_nb : ""),
      item("d_tasse", e.tasse),
      item("d_prechauffee", Number(e.eau_prechauffee) === 1 ? I18N.t("oui") : ""),
      item("d_boisson", e._c.volume_boisson_ml !== "" ? e._c.volume_boisson_ml + " ml" : ""),
      item("d_cout", e._c.cout_tasse_vnd !== "" ? fmtVND(e._c.cout_tasse_vnd) : ""),
    ].filter(Boolean).join("");
    const tags = (e.descripteurs || "").split("|").filter(Boolean)
      .map(t => '<span class="detail-tag">' + I18N.tag(t) + "</span>").join("");
    const comment = withoutComment ? "" : e.commentaire;
    return (cells ? '<div class="detail-grid">' + cells + "</div>" : "") +
      (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
      (comment ? '<p class="detail-comment">' + comment + "</p>" : "") +
      (cells || tags || comment ? "" : '<p class="detail-empty">' + I18N.t("d_rien") + "</p>");
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
      '<td><span class="td-date">' + twoToneDate(e.date_heure) + "</span></td>" +
      '<td class="td-text">' + I18N.tr(e._c.cafe_nom) + "</td>" +
      '<td><span class="chip-method ' + e.methode.toLowerCase() + '">' + e.methode + "</span></td>" +
      '<td class="td-recipe">' + (e.recette || "") + "</td>" +
      /* Dose and water together, as on the card of the last five: they are
         two halves of the same gesture, and splitting them into two columns
         would have cost width without teaching anything. */
      '<td class="td-num">' + (e.dose_g !== "" && e.eau_g !== "" ? e.dose_g + " → " + e.eau_g + " <small>g</small>" : "") + "</td>" +
      /* The complement (microns, ratio in the cup or in the drink) goes UNDER
         the value, small: on one line, "1.2.0 (499 µm)" was truncated to
         "1.2.0 (49…" in its column. */
      '<td class="td-num">' + (e.mouture_dial ? e.mouture_dial + '<small class="sub">' + e._c.microns + " µm</small>"
        : e._c.ground ? "<small>" + I18N.t("paquet") + "</small>" : "") + "</td>" +
      '<td class="td-num" title="' + titleAttr(detailRatio(e._c.ratioBase, e.dose_g, e.eau_g)) + '">' +
      e._c.ratioTexte +
      (e._c.cupRatioText ? '<small class="sub">' + I18N.t("rt_tasse_court") + " " + e._c.cupRatioText + "</small>" : "") +
      (e._c.drinkRatio ? '<small class="sub">' + I18N.t("rt_boisson_court") + " " + e._c.drinkRatio + "</small>" : "") + "</td>" +
      '<td class="rating-cell">' + (isFailed(e)
        ? '<span class="badge-failed" title="' + titleAttr(I18N.t("rt_badge_titre")) + '">' + I18N.t("rt_badge") + "</span>"
        : "") + (e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) : "") + "</td>" +
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
     The click is delegated on data-action, so nothing else needs to know. */
  function actionsExtraction(e) {
    const compare = comparison.has(e.id);
    return '<div class="actions-row">' +
      '<button class="btn-row' + (compare ? " on" : "") + '" data-action="comparer" title="' +
      titleAttr(I18N.t("h_comparer")) + '">' + icon("comparer") + "</button>" +
      /* The failed toggle, FIRST among the write actions: it is the one
         clicked most often after the fact, and its state shows without hover. */
      '<button class="btn-row' + (isFailed(e) ? " on-failed" : "") + '" data-action="ratee" aria-pressed="' +
      isFailed(e) + '" title="' + titleAttr(I18N.t(isFailed(e) ? "h_derater" : "h_rater")) + '">' + icon("ratee") + "</button>" +
      '<button class="btn-row" data-action="dupliquer" title="Dupliquer pour refaire la même">' + icon("dupliquer") + "</button>" +
      '<button class="btn-row" data-action="modifier" title="Modifier">' + icon("modifier") + "</button>" +
      '<button class="btn-row danger" data-action="supprimer" title="Supprimer">' + icon("supprimer") + "</button>" +
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
    if (e.recette) meta.push('<span class="h-card-recipe">' + I18N.tr(e.recette) + "</span>");
    if (e.dose_g !== "" && e.eau_g !== "") meta.push(e.dose_g + " → " + e.eau_g + " g");
    if (e._c.ratioTexte) meta.push(e._c.ratioTexte);
    if (e.mouture_dial) meta.push(I18N.t("molette") + " " + e.mouture_dial);
    return '<article class="h-card' + (expanded ? " expanded" : "") + (menu ? " menu-ouvert" : "") +
      (comparison.has(e.id) ? " compared" : "") + (isFailed(e) ? " failed" : "") +
      '" data-id="' + e.id + '">' +
      '<div class="h-card-head">' +
        '<span class="h-card-hour">' + fmtDateTime(e.date_heure) + "</span>" +
        '<span class="chip-method ' + e.methode.toLowerCase() + '">' + e.methode + "</span>" +
        '<span class="h-card-rating">' + (e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) : "") + "</span>" +
        '<button type="button" class="btn-menu-card" data-action="menu" aria-expanded="' + menu + '" aria-label="' +
          titleAttr(I18N.t("h_actions")) + '">⋯</button>' +
      "</div>" +
      '<p class="h-card-coffee">' + I18N.tr(e._c.cafe_nom) +
        (isFailed(e) ? '<span class="mention-failed">' + I18N.t("rt_badge") + "</span>" : "") + "</p>" +
      (meta.length ? '<p class="h-card-meta">' + meta.join(" · ") + "</p>" : "") +
      ((e.diagnostic || e.descripteurs)
        ? '<p class="h-card-tastes">' +
          (e.diagnostic ? '<span class="h-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
          historyTastes(e) + "</p>"
        : "") +
      (e.commentaire ? '<p class="h-card-comment">' + titleAttr(e.commentaire) + "</p>" : "") +
      (!menu ? "" : '<div class="h-card-footer">' +
        /* In words and not as an arrow: the phone has no hover, the detail
           expands there, and the button says what it does. */
        '<button type="button" class="btn-detail-card" data-action="deplier" aria-expanded="' + expanded + '">' +
        I18N.t(expanded ? "h_detail_masquer" : "h_detail") + "</button>" +
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
      comparison.size === 1 ? "cmp_une" : "cmp_deux", { n: comparison.size });
    $("#comparison-open").disabled = comparison.size !== 2;
  }

  // Rows of the comparison table. Each entry knows how to read its displayable value.
  function comparisonFields() {
    return [
      { key: "d_cafe", read: e => I18N.tr(e._c.cafe_nom) },
      { key: "d_methode", read: e => e.methode },
      { key: "d_recette", read: e => e.recette },
      { key: "d_dose", read: e => e.dose_g !== "" ? e.dose_g + " g" : "" },
      { key: "d_eau", read: e => e.eau_g !== "" ? e.eau_g + " g" : "" },
      { key: "d_ratio", read: e => e._c.ratioTexte },
      { key: "d_ouvert", read: e => e._c.jours_ouvert === "" ? "" : e._c.jours_ouvert },
      { key: "d_mouture", read: e => e.mouture_dial || (e._c.ground ? I18N.t("paquet") : "") },
      { key: "d_temp", read: e => e.temperature_c !== "" ? e.temperature_c + " °C" : "" },
      { key: "d_puissance", read: e => e.puissance_feu !== "" ? e.puissance_feu + " / 10" : "" },
      { key: "d_prechauffee", read: e => Number(e.eau_prechauffee) === 1 ? I18N.t("oui") : I18N.t("non") },
      { key: "d_total", read: e => e.temps_total_s !== "" ? fmtDuration(e.temps_total_s) : "" },
      { key: "d_ecoulement", read: e => e.temps_ecoulement_s !== "" ? fmtDuration(e.temps_ecoulement_s) : "" },
      { key: "d_volume", read: e => e.volume_extrait_ml !== "" ? e.volume_extrait_ml + " ml" : "" },
      { key: "d_tasse", read: e => e.tasse },
      { key: "d_note", read: e => e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) + " / 10" : "" },
      { key: "d_diagnostic", read: e => e.diagnostic ? displayedDiags(e.diagnostic) : "" },
      { key: "d_descripteurs", read: e => (e.descripteurs || "").split("|").filter(Boolean).map(t => I18N.tag(t)).join(", ") },
      { key: "d_commentaire", read: e => e.commentaire },
    ];
  }

  function openComparison() {
    const ids = [...comparison];
    const exts = extsWithCalcs().filter(e => ids.includes(e.id))
      .sort((x, y) => String(x.date_heure).localeCompare(String(y.date_heure)));
    if (exts.length !== 2) return;
    const [a, b] = exts;

    $("#comparison-titles").innerHTML = "<th></th><th>" + fmtDateTime(a.date_heure) +
      "</th><th>" + fmtDateTime(b.date_heure) + "</th>";
    $("#comparison-body").innerHTML = comparisonFields().map(c => {
      const va = String(c.read(a) || ""), vb = String(c.read(b) || "");
      if (!va && !vb) return "";
      // Highlight ONLY what differs: that is where the explanation of the
      // rating gap lies, the rest is visual noise.
      const deferred = va !== vb;
      return '<tr' + (deferred ? ' class="deferred"' : "") + "><th>" + I18N.t(c.key) + "</th>" +
        "<td>" + va + "</td><td>" + vb + "</td></tr>";
    }).join("");

    const gap = a.note_sur_10 !== "" && b.note_sur_10 !== ""
      ? I18N.t("cmp_ecart", { x: fmtDecimal(Math.abs(a.note_sur_10 - b.note_sur_10), 1) })
      : I18N.t("cmp_sans_note");
    $("#comparison-summary").textContent = gap;
    $("#modal-comparison").showModal();
  }

  /* ---------- My best settings ----------
     The calculation lives in js/tuning.js, without DOM, to be testable
     without a browser. Here, only the display. */
  // Opens the coffee sheet (js/ui-coffee-sheet.js), by delegation on data-sheet.
  const sheetButton = c => '<button type="button" class="btn btn-small btn-subtle" data-sheet="' + c.id + '">' +
    I18N.t("fi_voir") + "</button>";

  function tuningCard(summary) {
    const c = summary.coffee;
    const header = '<div class="setting-header"><b>' + c.nom + "</b>" +
      (c.actif === 0 ? ' <span class="coffee-meta">' + I18N.t("li_inactif") + "</span>" : "") +
      (summary.average !== null
        ? '<span class="setting-average">' + I18N.t("rg_moyenne", { m: fmtDecimal(summary.average, 1), n: summary.total }) + "</span>"
        : "") + "</div>";

    if (summary.reason === "sous_moyenne") {
      const t = summary.bestCup;
      return '<article class="card setting' + (c.actif === 0 ? " inactive" : "") + '">' + header +
        '<p class="card-empty">' + I18N.t("rg_sous_moyenne", {
          s: TUNING.MIN_CUPS, note: fmtDecimal(t.note, 1), k: t.times, n: summary.missing,
        }) + "</p>" +
        '<div class="setting-actions"><button type="button" class="btn btn-small" data-redo="' + t.id + '">' +
        I18N.t("rg_refaire") + "</button>" + sheetButton(c) + "</div></article>";
    }
    if (!summary.best) {
      const key = summary.reason === "aucune" ? "rg_aucune"
        : summary.reason === "pas_assez" ? "rg_pas_assez" : "rg_eparpille";
      return '<article class="card setting' + (c.actif === 0 ? " inactive" : "") + '">' + header +
        '<p class="card-empty">' + I18N.t(key, { n: summary.missing, s: TUNING.MIN_CUPS }) + "</p>" +
        '<div class="setting-actions">' + sheetButton(c) + "</div></article>";
    }

    const m = summary.best;
    // Gap between the winning combination and the coffee's average: it is
    // what says whether the setting is really worth it or everything is equal.
    const gap = m.average - summary.average;
    const chips = [
      m.recette ? '<span class="setting-chip">' + I18N.tr(m.recette) + "</span>" : "",
      m.grind ? '<span class="setting-chip">' + I18N.t("molette") + " " + m.grind + "</span>"
        : '<span class="setting-chip">' + I18N.t("paquet") + "</span>",
      m.power ? '<span class="setting-chip">' + I18N.t("rg_feu", { f: m.power }) + "</span>" : "",
      m.preheat ? '<span class="setting-chip">' + I18N.t("d_prechauffee") + "</span>" : "",
    ].filter(Boolean).join("");

    return '<article class="card setting' + (c.actif === 0 ? " inactive" : "") + '">' + header +
      '<div class="setting-rating"><b>' + fmtDecimal(m.average, 1) + "</b><small> / 10</small>" +
      '<span>' + I18N.t("rg_sur", { n: m.n }) +
      (Math.abs(gap) >= 0.2 ? ", " + I18N.t(gap > 0 ? "rg_mieux" : "rg_moins",
        { x: fmtDecimal(Math.abs(gap), 1) }) : "") + "</span></div>" +
      '<div class="setting-chips">' + chips + "</div>" +
      '<div class="setting-actions"><button type="button" class="btn btn-small" data-redo="' + m.referenceId + '">' +
      I18N.t("rg_refaire") + "</button>" + sheetButton(c) + "</div></article>";
  }

  function renderTuning() {
    /* Advice, so the analysable set: a failed cup describes a missed gesture
       and would get a correct setting condemned. */
    const exts = analyzableExts();
    const summaries = TUNING.forAllCoffees(DATA.state.cafes, exts);
    $("#tuning-list").innerHTML = summaries.length
      ? summaries.map(tuningCard).join("")
      : '<p class="card-empty">' + I18N.t("rg_sans_cafe") + "</p>";
    $$("[data-redo]").forEach(b => b.addEventListener("click", () => {
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.redo);
      if (!ext) return;
      UI.redoCup(ext);
      toast(I18N.t("rg_preremplie"));
    }));
  }

  function fillFilters() {
    const selCoffee = $("#h-coffee");
    const v = selCoffee.value;
    selCoffee.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DATA.state.cafes.map(c => '<option value="' + TOOLS.escapeHtml(c.id) + '">' + TOOLS.escapeHtml(c.nom) + "</option>").join("");
    selCoffee.value = v;
    const selDiag = $("#h-diagnostic");
    const vd = selDiag.value;
    selDiag.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
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
     which it must not get in the way of, and on scroll. */
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
      sheet.classList.remove("visible");
      sheet.hidden = true;
    };
    const show = id => {
      const e = displayed.get(id);
      const row = $('#h-body tr.row-hist[data-id="' + id + '"]');
      if (!e || !row) return;
      const content = detailContent(e, true);
      if (content.includes("detail-empty")) return;
      sheet.innerHTML = content;
      sheet.hidden = false;
      // Under the whole group, the row AND its comment: we do not cover what is being read.
      const following = row.nextElementSibling;
      const last = following && following.classList.contains("row-comment") ? following : row;
      const low = last.getBoundingClientRect().bottom;
      const high = row.getBoundingClientRect().top;
      const l = sheet.offsetWidth, h = sheet.offsetHeight;
      const top = low + 6 + h <= window.innerHeight - 12 ? low + 6 : Math.max(12, high - 6 - h);
      const left = Math.min(Math.max(12, mouseX - 60), window.innerWidth - l - 12);
      sheet.style.top = Math.round(top) + "px";
      sheet.style.left = Math.round(left) + "px";
      requestAnimationFrame(() => sheet.classList.add("visible"));
    };

    const body = $("#h-body");
    body.addEventListener("mousemove", ev => {
      mouseX = ev.clientX;
      const row = ev.target.closest("[data-id]");
      const onAction = ev.target.closest(".actions-row");
      const id = row && !onAction ? row.dataset.id : null;
      if (id === currentId) return;
      hide();
      if (!id) return;
      currentId = id;
      pendingTimer = setTimeout(() => show(id), 280);
    });
    body.addEventListener("mouseleave", hide);
    /* Any click, not only in the table: the sheet lives on the body, and a
       click on the rail changes screen without leaving the row. */
    document.addEventListener("click", hide, true);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
  }

  /* OPENING THE HISTORY ON A FILTER (v8.87), for example a day of the week
     recap. The other filters start from scratch: we come to see THAT day,
     not that day crossed with a coffee chosen a week ago. */
  function openHistoryOn(values) {
    FILTERS.forEach(id => { $("#" + id).value = ""; });
    Object.entries(values).forEach(([id, v]) => { $("#" + id).value = v; });
    UI.activateScreen("historique");
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
      const expanded = $("#screen-historique").classList.toggle("filters-open");
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
      toast(I18N.t("t_export_filtre"));
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
      const btn = ev.target.closest("[data-action]");
      if (!btn) {
        /* Clicking the ROW opens the extraction for editing, like the last
           five on the dashboard. Without it, only the pencil worked: a 24 px
           target for a row that looks clickable as a whole. */
        const row = ev.target.closest("[data-id]");
        if (!row) return;
        /* A text selection is not a click. Without this test, copying a
           comment from the expanded detail would open the editor. */
        const selection = window.getSelection ? String(window.getSelection()) : "";
        if (selection.trim()) return;
        const rowExt = DATA.state.extractions.find(e => e.id === row.dataset.id);
        if (rowExt) UI.loadExtractionIntoEntry(rowExt, false);
        return;
      }
      const id = btn.closest("[data-id]").dataset.id;
      const ext = DATA.state.extractions.find(e => e.id === id);
      if (!ext) return;
      if (btn.dataset.action === "supprimer") {
        // No more native confirm(): the undo replaces the question. A system
        // box on the phone breaks the app feel, and it does not go through
        // the i18n layer.
        await deleteExtractionWithUndo(ext);
      } else if (btn.dataset.action === "modifier") {
        UI.loadExtractionIntoEntry(ext, false);
      } else if (btn.dataset.action === "dupliquer") {
        UI.redoCup(ext);
        toast(I18N.t("t_dupliquee"));
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
      } else if (btn.dataset.action === "ratee") {
        /* One click writes. No confirmation: the gesture is reversible from
           the same button, and asking to confirm a toggle would be heavier
           than the toggle itself. */
        await DATA.editExtraction(id, { ...ext, ratee: Number(ext.ratee) === 1 ? "" : 1 });
        toast(I18N.t(Number(ext.ratee) === 1 ? "t_deratee" : "t_ratee"));
      }
    };
    [$("#h-body"), $("#h-cards"), $("#h-journal")].forEach(z => z.addEventListener("click", onHistoryClick));
    UI.wireJournal(renderHistory);
    wireHoverSheet();

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
  }

  Object.assign(UI, {
    openHistoryOn,
    FILTERS, toggleComparison, wireHistory, tuningCard, comparisonFields, comparison, openDetails,
    filterHistory, historyRow, updateComparisonBar, openComparison,
    actionsExtraction, extractionCard, historyComment, detailContent, asCards,
    updateMethodSegment,
    renderCards,
    historyTastes, fillFilters, renderHistory, renderHistoryDeferred, renderTuning,
    renderSummary, withoutAccents, searchableText, sortState, sortValue,
  });
})();
