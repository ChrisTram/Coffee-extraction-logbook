/* History screen: the table, its filters, its sorting, its comparator.
 *
 * The sorting and the expanded rows live here and nowhere else: they are
 * display preferences, they do not sync and are not stored in the data. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, icone, $$, antiRebond, attrTitre, cleLocale, detailRatio, diagsAffiches, estRatee,
    extAnalysables, extAvecCalculs, fmtDateCourte, fmtDateHeure, fmtDecimal, fmtTemps, fmtVND,
    moyenne, supprimerExtractionAvecRetour, toast } = UI;

  // ---------- History ----------

  const tri = { colonne: "date_heure", sens: -1 };

  /* Strips diacritics so that "brule" finds "brûlé" and "cafe" finds
     "café". Without it a search in French is unusable from the keyboard. */
  function sansAccents(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* Everything a search makes sense in: what Chris WROTE, plus what he
     chose. Not the numbers, there are dedicated filters for that. */
  function texteCherchable(e) {
    const cafe = DATA.cafeDe(e);
    return sansAccents([
      e.commentaire, e.descripteurs, e.diagnostic, e.recette, e.methode,
      cafe ? cafe.nom : "",
    ].filter(Boolean).join(" ").toLowerCase());
  }

  function filtrerHistorique() {
    const exts = extAvecCalculs();
    const fCoffee = $("#h-cafe").value;
    const fMethod = $("#h-methode").value;
    const fDiag = $("#h-diagnostic").value;
    const fScore = parseFloat($("#h-note-min").value);
    const fFrom = $("#h-du").value;
    const fTo = $("#h-au").value;
    /* Search insensitive to case AND accents: typing "brule" must find
       "brûlé". normalize plus stripping the diacritics is the only correct
       way to do it in French without a lookup table. */
    const q = sansAccents($("#h-recherche").value.trim().toLowerCase());
    /* "" all, "ok" the successful ones, "ratee" the failed ones. The filter
       lives here and not in extAnalysables(): the history is the log, it shows
       everything by default, and it is Chris who asks to see only one side. */
    const fFailed = $("#h-ratee").value;
    return exts.filter(e =>
      (!fFailed || (fFailed === "ratee" ? estRatee(e) : !estRatee(e))) &&
      (!q || texteCherchable(e).includes(q)) &&
      (!fCoffee || e.cafe_id === fCoffee) &&
      (!fMethod || e.methode === fMethod) &&
      (!fDiag || (e.diagnostic || "").split("|").includes(fDiag)) &&
      (isNaN(fScore) || (e.note_sur_10 !== "" && e.note_sur_10 >= fScore)) &&
      (!fFrom || e.date_heure.slice(0, 10) >= fFrom) &&
      (!fTo || e.date_heure.slice(0, 10) <= fTo)
    );
  }

  function valeurTri(e, col) {
    if (col === "cafe_nom") return e._c.cafe_nom;
    /* Empty numeric columns must end up at the BOTTOM whatever the direction,
       hence -1 rather than "": an empty string would compare as text and
       rise to the top in ascending order. */
    if (col === "dose_g" || col === "temps_total_s" || col === "temperature_c" || col === "puissance_feu") {
      return e[col] === "" || e[col] === undefined ? -1 : Number(e[col]);
    }
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "mouture") return e._c.crans === "" ? -1 : e._c.crans;
    if (col === "note_sur_10") return e.note_sur_10 === "" ? -1 : e.note_sur_10;
    return e[col] === "" ? -1 : e[col];
  }

  /* Deferred version for the FILTERS only. The other calls (deletion, sort,
     return from editing) stay immediate: they follow a single gesture, there
     is nothing to group. */
  const rendreHistoriqueDifferee = antiRebond(() => rendreHistorique());

  /* The visible state of the segmented control, aligned on the <select> that is authoritative. */
  function majSegmentMethode() {
    const v = $("#h-methode") ? $("#h-methode").value : "";
    $$(".filtre-methode .seg").forEach(b =>
      b.setAttribute("aria-pressed", b.dataset.methode === v ? "true" : "false"));
  }

  /* AS CARDS or as a table: the threshold is the rest of the site's, 1024 px. */
  function enCartes() {
    return typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  }

  /* IN SLICES OF 100 (v8.75). The history drew every cup on each render; it
     now shows a hundred, then a hundred more on demand. The count and the
     summary, however, always cover the whole filtered list. */
  const TRANCHE_HISTORIQUE = 100;
  let historyLimit = TRANCHE_HISTORIQUE;
  function moreButton(reste) {
    return reste > 0
      ? '<button type="button" class="btn btn-petit h-plus" id="h-plus">' +
        I18N.t("h_plus", { n: Math.min(reste, TRANCHE_HISTORIQUE), t: reste }) + "</button>"
      : "";
  }
  function wireMore() {
    const b = $("#h-plus");
    if (b) b.addEventListener("click", () => { historyLimit += TRANCHE_HISTORIQUE; rendreHistorique(); });
  }

  function rendreHistorique() {
    const liste = filtrerHistorique().sort((a, b) => {
      const va = valeurTri(a, tri.colonne), vb = valeurTri(b, tri.colonne);
      // Text sorts with its accents (v8.72): "Là Việt" no longer runs after "Z".
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, I18N.locale()) * tri.sens;
      if (va < vb) return -tri.sens;
      if (va > vb) return tri.sens;
      return 0;
    });
    $("#h-compte").textContent = I18N.t("h_compte", {
      n: liste.length, s: liste.length > 1 ? "s" : "", t: DATA.state.extractions.length,
    });
    $("#h-vide").hidden = liste.length > 0;

    /* The overline tells the TOTAL and since when, not the filter: it is the
       screen's identity, the filter has its own banner just below. */
    const toutes = extAvecCalculs();
    const premiere = toutes.length
      ? toutes.reduce((a, e) => (a && a.date_heure < e.date_heure ? a : e)).date_heure : "";
    $("#h-surligne").textContent = toutes.length
      ? I18N.t("h_surligne", { n: toutes.length, s: toutes.length > 1 ? "s" : "",
          d: fmtDateCourte(String(premiere).slice(0, 10)) })
      : "";

    $$("#h-table th .tri").forEach(s => s.textContent = "");
    const th = $('#h-table th[data-tri="' + tri.colonne + '"] .tri');
    if (th) th.textContent = tri.sens > 0 ? "▲" : "▼";

    rendreResume(liste);
    majFiltresActifs();

    /* NO MORE DAY SUBHEADING (v8.29). Chris did not want it: a whole row for
       a day name is one row less for a cup. The full date reads at the start
       of each row, like everywhere else. */
    /* The phone cards. The other container is emptied: two live renders at
       the same time mean the same ids twice in the page. */
    /* L3 (v8.93): BY BAG, the journal replaces the table and the cards. The
       filters, the summary and the count above stay the same. */
    UI.majVues();
    const byBag = UI.vueHistorique() === "sachet" && liste.length > 0;
    $("#h-journal").hidden = !byBag;
    $("#ecran-historique .table-conteneur").hidden = byBag;
    if (byBag) {
      $("#h-corps").innerHTML = "";
      $("#h-cartes").innerHTML = "";
      UI.rendreJournal(liste);
      majBarreComparaison();
      return;
    }
    $("#h-journal").innerHTML = "";
    const visibles = liste.slice(0, historyLimit);
    const reste = liste.length - visibles.length;
    if (enCartes()) {
      $("#h-corps").innerHTML = "";
      $("#h-cartes").innerHTML = rendreCartes(visibles) + moreButton(reste);
      wireMore();
      majBarreComparaison();
      return;
    }
    $("#h-cartes").innerHTML = "";
    $("#h-corps").innerHTML = visibles.map(e => ligneHistorique(e)).join("") +
      (reste > 0 ? '<tr class="h-ligne-plus"><td colspan="10">' + moreButton(reste) + "</td></tr>" : "");
    wireMore();
    displayed = new Map(visibles.map(e => [e.id, e]));
    majBarreComparaison();
  }

  /* THE CARDS: the same list, each card carries its full date. */
  // The cards whose "⋯" menu is open, kept from one render to the next.
  const openMenus = new Set();

  /* ACTIVE FILTERS AS PILLS (A3, v8.82). The panel folded on the phone must
     not hide that a filter is running: each filter set has its pill and its
     cross, and the button counts how many there are. The machine already has
     its visible control and the search its field: they get none. */
  function majFiltresActifs() {
    const actifs = [];
    const selectText = id => { const s = $("#" + id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent : s.value; };
    [["h-cafe", "h_f_cafe"], ["h-diagnostic", "h_f_diag"], ["h-ratee", "h_f_ratees"]].forEach(([id, cle]) => {
      if ($("#" + id).value) actifs.push([id, I18N.t(cle) + " : " + selectText(id)]);
    });
    if ($("#h-note-min").value) actifs.push(["h-note-min", I18N.t("h_f_note", { n: $("#h-note-min").value })]);
    const du = $("#h-du").value, au = $("#h-au").value;
    // A single day (from the week recap): one pill, not two.
    if (du && du === au) actifs.push(["h-du h-au", I18N.t("h_f_le", { d: fmtDateCourte(du) })]);
    else {
      if (du) actifs.push(["h-du", I18N.t("h_f_du", { d: fmtDateCourte(du) })]);
      if (au) actifs.push(["h-au", I18N.t("h_f_au", { d: fmtDateCourte(au) })]);
    }
    $("#h-actifs").innerHTML = actifs.map(([id, t]) =>
      '<button type="button" class="h-actif" data-vider="' + id + '" aria-label="' + attrTitre(I18N.t("h_f_retirer", { f: t })) + '">' +
      attrTitre(t) + '<span aria-hidden="true">×</span></button>').join("");
    $("#h-filtrer").textContent = actifs.length ? I18N.t("h_filtrer_n", { n: actifs.length }) : I18N.t("h_filtrer");
  }

  function rendreCartes(liste) {
    return liste.map(carteExtraction).join("");
  }

  /* THE SUMMARY BANNER: what the current filter tells.

     The count alone said "12 out of 62" without ever saying whether those
     twelve were good, which is the question one asks when filtering. The
     failed ones are counted apart: they are what explains a low average, and
     the average leaves them out for the same reason the analyses do. */
  function rendreResume(liste) {
    const cible = $("#h-resume");
    if (!liste.length) { cible.innerHTML = ""; cible.hidden = true; return; }
    cible.hidden = false;
    const notees = liste.filter(e => e.note_sur_10 !== "" && !estRatee(e));
    const meilleure = notees.slice().sort((a, b) => b.note_sur_10 - a.note_sur_10)[0];
    const ratees = liste.filter(estRatee).length;
    const bloc = (valeur, libelle, note) =>
      '<div class="resume-item"><span class="resume-valeur">' + valeur + "</span>" +
      '<span class="resume-libelle">' + libelle + "</span>" +
      (note ? '<span class="resume-note">' + note + "</span>" : "") + "</div>";
    cible.innerHTML =
      bloc(liste.length, I18N.t("h_res_tasses")) +
      bloc(notees.length ? fmtDecimal(moyenne(notees.map(e => e.note_sur_10)), 1) : I18N.t("h_res_aucune"),
        I18N.t("h_res_moyenne")) +
      (meilleure
        ? bloc(meilleure.note_sur_10, I18N.t("h_res_meilleure"),
            I18N.tr(meilleure._c.cafe_nom) + " · " + meilleure.methode)
        : bloc(I18N.t("h_res_aucune"), I18N.t("h_res_meilleure"))) +
      bloc(ratees, I18N.t("h_res_ratees"));
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
  function commentaireHistorique(e) {
    const c = String(e.commentaire || "").trim();
    if (!c) return "";
    return '<tr class="ligne-commentaire" data-id="' + e.id + '"><td colspan="10">' +
      attrTitre(c) + "</td></tr>";
  }

  /* The row's tastes, three at most then "+n", as on the card of the last
     five: two views of the same object must say the same thing. */
  const MAX_HISTORY_TASTES = 3;
  function goutsHistorique(e) {
    const tags = String(e.descripteurs || "").split("|").filter(Boolean);
    if (!tags.length) return "";
    const vus = tags.slice(0, MAX_HISTORY_TASTES).map(t => '<span class="derniere-tag">' + I18N.tag(t) + "</span>");
    const reste = tags.length - vus.length;
    return '<span class="h-gouts">' + vus.join("") +
      (reste > 0 ? '<span class="derniere-tag derniere-tag-plus">+' + reste + "</span>" : "") + "</span>";
  }

  /* The detail: the logbook stores 22 fields per extraction and the table
     shows 12. The rest (drawdown, cup, volume, milk, agitation, cost...) reads
     in the HOVER SHEET on desktop, and in the expanded card on the phone.
     detailsOuverts now only serves the cards. */
  const detailsOuverts = new Set();
  const comparaison = new Set();
  // The extractions of the displayed table, by id: the sheet re-reads them on hover.
  let displayed = new Map();

  /* The CONTENT of the detail, without its wrapper: the hover sheet puts it in
     a floating div, the phone card in an expanded div. A single content, so
     never two versions of the detail that diverge. withoutComment: the
     table already writes the whole comment under the row, the sheet does not
     repeat it. */
  function detailContenu(e, withoutComment) {
    const item = (cle, valeur) => valeur === "" || valeur === undefined || valeur === null
      ? "" : '<div class="detail-item"><span>' + I18N.t(cle) + "</span><b>" + valeur + "</b></div>";
    const cases = [
      item("d_temps", e.temps_total_s !== "" ? fmtTemps(e.temps_total_s) : ""),
      item("d_ecoulement", e.temps_ecoulement_s !== "" ? fmtTemps(e.temps_ecoulement_s) : ""),
      item("d_temp", e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C" : ""),
      item("d_feu", e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined
        ? e.puissance_feu : ""),
      item("d_chauffe", e.chauffe_s !== "" && e.chauffe_s !== undefined ? fmtTemps(e.chauffe_s) : ""),
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
    const commentaire = withoutComment ? "" : e.commentaire;
    return (cases ? '<div class="detail-grille">' + cases + "</div>" : "") +
      (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
      (commentaire ? '<p class="detail-commentaire">' + commentaire + "</p>" : "") +
      (cases || tags || commentaire ? "" : '<p class="detail-vide">' + I18N.t("d_rien") + "</p>");
  }

  /* The row's date: the day in ink, the time muted. fmtDateHeure returns
     "9 Aug 14:43"; we cut on the last space. */
  function twoToneDate(dh) {
    const texte = fmtDateHeure(dh);
    const i = texte.lastIndexOf(" ");
    if (i < 0) return "<time>" + texte + "</time>";
    return "<time>" + texte.slice(0, i) + '</time><span class="heure">' + texte.slice(i + 1) + "</span>";
  }

  /* No more expand arrow (v8.33): the detail comes as a hover sheet, see
     wireHoverSheet(). */
  function ligneHistorique(e) {
    const compare = comparaison.has(e.id);
    return '<tr data-id="' + e.id + '" class="ligne-histo' + (compare ? " comparee" : "") + '">' +
      '<td><span class="td-date">' + twoToneDate(e.date_heure) + "</span></td>" +
      '<td class="td-texte">' + I18N.tr(e._c.cafe_nom) + "</td>" +
      '<td><span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span></td>" +
      '<td class="td-recette">' + (e.recette || "") + "</td>" +
      /* Dose and water together, as on the card of the last five: they are
         two halves of the same gesture, and splitting them into two columns
         would have cost width without teaching anything. */
      '<td class="td-num">' + (e.dose_g !== "" && e.eau_g !== "" ? e.dose_g + " → " + e.eau_g + " <small>g</small>" : "") + "</td>" +
      /* The complement (microns, ratio in the cup or in the drink) goes UNDER
         the value, small: on one line, "1.2.0 (499 µm)" was truncated to
         "1.2.0 (49…" in its column. */
      '<td class="td-num">' + (e.mouture_dial ? e.mouture_dial + '<small class="sous">' + e._c.microns + " µm</small>"
        : e._c.moulu ? "<small>" + I18N.t("paquet") + "</small>" : "") + "</td>" +
      '<td class="td-num" title="' + attrTitre(detailRatio(e._c.ratioBase, e.dose_g, e.eau_g)) + '">' +
      e._c.ratioTexte +
      (e._c.ratioTasseTexte ? '<small class="sous">' + I18N.t("rt_tasse_court") + " " + e._c.ratioTasseTexte + "</small>" : "") +
      (e._c.ratioBoisson ? '<small class="sous">' + I18N.t("rt_boisson_court") + " " + e._c.ratioBoisson + "</small>" : "") + "</td>" +
      '<td class="note-cellule">' + (estRatee(e)
        ? '<span class="badge-ratee" title="' + attrTitre(I18N.t("rt_badge_titre")) + '">' + I18N.t("rt_badge") + "</span>"
        : "") + (e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) : "") + "</td>" +
      /* TASTES AND DIAGNOSIS in the same cell, not in two columns: one more
         column asks for four coordinated edits (see DECISIONS, "The trap of
         frozen widths") and shifts silently if one of them is
         forgotten. */
      // No comment bubble here: it is written in full just below.
      '<td class="chip-diagnostic">' +
      (e.diagnostic ? '<span class="h-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
      goutsHistorique(e) + "</td>" +
      "<td>" + actionsExtraction(e) + "</td></tr>" +
      commentaireHistorique(e);
  }

  /* THE FIVE ACTIONS, written ONCE and rendered by the row as by the card.
     That is what guarantees that a gesture possible on desktop is also
     possible on the phone: two separate lists diverge at the first addition.
     The click is delegated on data-action, so nothing else needs to know. */
  function actionsExtraction(e) {
    const compare = comparaison.has(e.id);
    return '<div class="actions-ligne">' +
      '<button class="btn-ligne' + (compare ? " actif" : "") + '" data-action="comparer" title="' +
      attrTitre(I18N.t("h_comparer")) + '">' + icone("comparer") + "</button>" +
      /* The failed toggle, FIRST among the write actions: it is the one
         clicked most often after the fact, and its state shows without hover. */
      '<button class="btn-ligne' + (estRatee(e) ? " actif-ratee" : "") + '" data-action="ratee" aria-pressed="' +
      estRatee(e) + '" title="' + attrTitre(I18N.t(estRatee(e) ? "h_derater" : "h_rater")) + '">' + icone("ratee") + "</button>" +
      '<button class="btn-ligne" data-action="dupliquer" title="Dupliquer pour refaire la même">' + icone("dupliquer") + "</button>" +
      '<button class="btn-ligne" data-action="modifier" title="Modifier">' + icone("modifier") + "</button>" +
      '<button class="btn-ligne danger" data-action="supprimer" title="Supprimer">' + icone("supprimer") + "</button>" +
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
  function carteExtraction(e) {
    const ouvert = detailsOuverts.has(e.id);
    const menu = ouvert || openMenus.has(e.id);
    const meta = [];
    if (e.recette) meta.push('<span class="h-carte-recette">' + I18N.tr(e.recette) + "</span>");
    if (e.dose_g !== "" && e.eau_g !== "") meta.push(e.dose_g + " → " + e.eau_g + " g");
    if (e._c.ratioTexte) meta.push(e._c.ratioTexte);
    if (e.mouture_dial) meta.push(I18N.t("molette") + " " + e.mouture_dial);
    return '<article class="h-carte' + (ouvert ? " ouverte" : "") + (menu ? " menu-ouvert" : "") +
      (comparaison.has(e.id) ? " comparee" : "") + (estRatee(e) ? " ratee" : "") +
      '" data-id="' + e.id + '">' +
      '<div class="h-carte-tete">' +
        '<span class="h-carte-heure">' + fmtDateHeure(e.date_heure) + "</span>" +
        '<span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span>" +
        '<span class="h-carte-note">' + (e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) : "") + "</span>" +
        '<button type="button" class="btn-menu-carte" data-action="menu" aria-expanded="' + menu + '" aria-label="' +
          attrTitre(I18N.t("h_actions")) + '">⋯</button>' +
      "</div>" +
      '<p class="h-carte-cafe">' + I18N.tr(e._c.cafe_nom) +
        (estRatee(e) ? '<span class="mention-ratee">' + I18N.t("rt_badge") + "</span>" : "") + "</p>" +
      (meta.length ? '<p class="h-carte-meta">' + meta.join(" · ") + "</p>" : "") +
      ((e.diagnostic || e.descripteurs)
        ? '<p class="h-carte-gouts">' +
          (e.diagnostic ? '<span class="h-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
          goutsHistorique(e) + "</p>"
        : "") +
      (e.commentaire ? '<p class="h-carte-commentaire">' + attrTitre(e.commentaire) + "</p>" : "") +
      (!menu ? "" : '<div class="h-carte-pied">' +
        /* In words and not as an arrow: the phone has no hover, the detail
           expands there, and the button says what it does. */
        '<button type="button" class="btn-detail-carte" data-action="deplier" aria-expanded="' + ouvert + '">' +
        I18N.t(ouvert ? "h_detail_masquer" : "h_detail") + "</button>" +
        actionsExtraction(e) +
      "</div>") +
      (ouvert ? '<div class="h-carte-detail">' + detailContenu(e) + "</div>" : "") +
      "</article>";
  }

  /* Comparator: two extractions side by side, differences highlighted. It is
     the manual version of the cross test the guide recommends (same coffee in
     both machines on the same day), which did not exist.

     Selection goes through a button in the Actions column and NOT through a
     column of checkboxes: the table has just been frozen at nine columns,
     adding one would break the widths. */
  function basculerComparaison(id) {
    if (comparaison.has(id)) comparaison.delete(id);
    else {
      // Beyond two, the oldest selection gives up its place: simpler than
      // refusing the click, and it lets comparisons follow one another.
      if (comparaison.size >= 2) comparaison.delete([...comparaison][0]);
      comparaison.add(id);
    }
    rendreHistorique();
    if (comparaison.size === 2) ouvrirComparaison();
  }

  function majBarreComparaison() {
    const barre = $("#barre-comparaison");
    if (!barre) return;
    barre.hidden = comparaison.size === 0;
    $("#comparaison-compte").textContent = I18N.t(
      comparaison.size === 1 ? "cmp_une" : "cmp_deux", { n: comparaison.size });
    $("#comparaison-ouvrir").disabled = comparaison.size !== 2;
  }

  // Rows of the comparison table. Each entry knows how to read its displayable value.
  function champsComparaison() {
    return [
      { cle: "d_cafe", lire: e => I18N.tr(e._c.cafe_nom) },
      { cle: "d_methode", lire: e => e.methode },
      { cle: "d_recette", lire: e => e.recette },
      { cle: "d_dose", lire: e => e.dose_g !== "" ? e.dose_g + " g" : "" },
      { cle: "d_eau", lire: e => e.eau_g !== "" ? e.eau_g + " g" : "" },
      { cle: "d_ratio", lire: e => e._c.ratioTexte },
      { cle: "d_ouvert", lire: e => e._c.jours_ouvert === "" ? "" : e._c.jours_ouvert },
      { cle: "d_mouture", lire: e => e.mouture_dial || (e._c.moulu ? I18N.t("paquet") : "") },
      { cle: "d_temp", lire: e => e.temperature_c !== "" ? e.temperature_c + " °C" : "" },
      { cle: "d_puissance", lire: e => e.puissance_feu !== "" ? e.puissance_feu + " / 10" : "" },
      { cle: "d_prechauffee", lire: e => Number(e.eau_prechauffee) === 1 ? I18N.t("oui") : I18N.t("non") },
      { cle: "d_total", lire: e => e.temps_total_s !== "" ? fmtTemps(e.temps_total_s) : "" },
      { cle: "d_ecoulement", lire: e => e.temps_ecoulement_s !== "" ? fmtTemps(e.temps_ecoulement_s) : "" },
      { cle: "d_volume", lire: e => e.volume_extrait_ml !== "" ? e.volume_extrait_ml + " ml" : "" },
      { cle: "d_tasse", lire: e => e.tasse },
      { cle: "d_note", lire: e => e.note_sur_10 !== "" ? fmtDecimal(Number(e.note_sur_10), 1) + " / 10" : "" },
      { cle: "d_diagnostic", lire: e => e.diagnostic ? diagsAffiches(e.diagnostic) : "" },
      { cle: "d_descripteurs", lire: e => (e.descripteurs || "").split("|").filter(Boolean).map(t => I18N.tag(t)).join(", ") },
      { cle: "d_commentaire", lire: e => e.commentaire },
    ];
  }

  function ouvrirComparaison() {
    const ids = [...comparaison];
    const exts = extAvecCalculs().filter(e => ids.includes(e.id))
      .sort((x, y) => String(x.date_heure).localeCompare(String(y.date_heure)));
    if (exts.length !== 2) return;
    const [a, b] = exts;

    $("#comparaison-titres").innerHTML = "<th></th><th>" + fmtDateHeure(a.date_heure) +
      "</th><th>" + fmtDateHeure(b.date_heure) + "</th>";
    $("#comparaison-corps").innerHTML = champsComparaison().map(c => {
      const va = String(c.lire(a) || ""), vb = String(c.lire(b) || "");
      if (!va && !vb) return "";
      // Highlight ONLY what differs: that is where the explanation of the
      // rating gap lies, the rest is visual noise.
      const differe = va !== vb;
      return '<tr' + (differe ? ' class="differe"' : "") + "><th>" + I18N.t(c.cle) + "</th>" +
        "<td>" + va + "</td><td>" + vb + "</td></tr>";
    }).join("");

    const ecart = a.note_sur_10 !== "" && b.note_sur_10 !== ""
      ? I18N.t("cmp_ecart", { x: fmtDecimal(Math.abs(a.note_sur_10 - b.note_sur_10), 1) })
      : I18N.t("cmp_sans_note");
    $("#comparaison-resume").textContent = ecart;
    $("#modale-comparaison").showModal();
  }

  /* ---------- My best settings ----------
     The calculation lives in js/reglages.js, without DOM, to be testable
     without a browser. Here, only the display. */
  // Opens the coffee sheet (js/ui-fiche.js), by delegation on data-fiche.
  const sheetButton = c => '<button type="button" class="btn btn-petit btn-discret" data-fiche="' + c.id + '">' +
    I18N.t("fi_voir") + "</button>";

  function carteReglage(bilan) {
    const c = bilan.cafe;
    const entete = '<div class="reglage-entete"><b>' + c.nom + "</b>" +
      (c.actif === 0 ? ' <span class="cafe-meta">' + I18N.t("li_inactif") + "</span>" : "") +
      (bilan.moyenne !== null
        ? '<span class="reglage-moyenne">' + I18N.t("rg_moyenne", { m: fmtDecimal(bilan.moyenne, 1), n: bilan.total }) + "</span>"
        : "") + "</div>";

    if (bilan.raison === "sous_moyenne") {
      const t = bilan.meilleureTasse;
      return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
        '<p class="carte-vide">' + I18N.t("rg_sous_moyenne", {
          s: REGLAGES.MIN_TASSES, note: fmtDecimal(t.note, 1), k: t.fois, n: bilan.manque,
        }) + "</p>" +
        '<div class="reglage-actions"><button type="button" class="btn btn-petit" data-refaire="' + t.id + '">' +
        I18N.t("rg_refaire") + "</button>" + sheetButton(c) + "</div></article>";
    }
    if (!bilan.meilleure) {
      const cle = bilan.raison === "aucune" ? "rg_aucune"
        : bilan.raison === "pas_assez" ? "rg_pas_assez" : "rg_eparpille";
      return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
        '<p class="carte-vide">' + I18N.t(cle, { n: bilan.manque, s: REGLAGES.MIN_TASSES }) + "</p>" +
        '<div class="reglage-actions">' + sheetButton(c) + "</div></article>";
    }

    const m = bilan.meilleure;
    // Gap between the winning combination and the coffee's average: it is
    // what says whether the setting is really worth it or everything is equal.
    const ecart = m.moyenne - bilan.moyenne;
    const chips = [
      m.recette ? '<span class="reglage-chip">' + I18N.tr(m.recette) + "</span>" : "",
      m.mouture ? '<span class="reglage-chip">' + I18N.t("molette") + " " + m.mouture + "</span>"
        : '<span class="reglage-chip">' + I18N.t("paquet") + "</span>",
      m.puissance ? '<span class="reglage-chip">' + I18N.t("rg_feu", { f: m.puissance }) + "</span>" : "",
      m.prechauffe ? '<span class="reglage-chip">' + I18N.t("d_prechauffee") + "</span>" : "",
    ].filter(Boolean).join("");

    return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
      '<div class="reglage-note"><b>' + fmtDecimal(m.moyenne, 1) + "</b><small> / 10</small>" +
      '<span>' + I18N.t("rg_sur", { n: m.n }) +
      (Math.abs(ecart) >= 0.2 ? ", " + I18N.t(ecart > 0 ? "rg_mieux" : "rg_moins",
        { x: fmtDecimal(Math.abs(ecart), 1) }) : "") + "</span></div>" +
      '<div class="reglage-chips">' + chips + "</div>" +
      '<div class="reglage-actions"><button type="button" class="btn btn-petit" data-refaire="' + m.referenceId + '">' +
      I18N.t("rg_refaire") + "</button>" + sheetButton(c) + "</div></article>";
  }

  function rendreReglages() {
    /* Advice, so the analysable set: a failed cup describes a missed gesture
       and would get a correct setting condemned. */
    const exts = extAnalysables();
    const summaries = REGLAGES.tous(DATA.state.cafes, exts);
    $("#reglages-liste").innerHTML = summaries.length
      ? summaries.map(carteReglage).join("")
      : '<p class="carte-vide">' + I18N.t("rg_sans_cafe") + "</p>";
    $$("[data-refaire]").forEach(b => b.addEventListener("click", () => {
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.refaire);
      if (!ext) return;
      UI.refaireTasse(ext);
      toast(I18N.t("rg_preremplie"));
    }));
  }

  function remplirFiltres() {
    const selCafe = $("#h-cafe");
    const v = selCafe.value;
    selCafe.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DATA.state.cafes.map(c => '<option value="' + OUTILS.echap(c.id) + '">' + OUTILS.echap(c.nom) + "</option>").join("");
    selCafe.value = v;
    const selDiag = $("#h-diagnostic");
    const vd = selDiag.value;
    selDiag.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DIAGNOSTICS.map(d => '<option value="' + d + '">' + I18N.diag(d) + "</option>").join("");
    selDiag.value = vd;
  }

  // Made available to the other screens.
  /* Wiring of the history controls. Called once by app.js. */
  const FILTRES = ["h-recherche", "h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au", "h-ratee"];

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
    const fiche = document.createElement("div");
    fiche.className = "h-fiche";
    fiche.setAttribute("role", "tooltip");
    fiche.hidden = true;
    document.body.appendChild(fiche);
    let minuteur = null, currentId = null, mouseX = 0;

    const cacher = () => {
      clearTimeout(minuteur);
      currentId = null;
      fiche.classList.remove("visible");
      fiche.hidden = true;
    };
    const montrer = id => {
      const e = displayed.get(id);
      const ligne = $('#h-corps tr.ligne-histo[data-id="' + id + '"]');
      if (!e || !ligne) return;
      const contenu = detailContenu(e, true);
      if (contenu.includes("detail-vide")) return;
      fiche.innerHTML = contenu;
      fiche.hidden = false;
      // Under the whole group, the row AND its comment: we do not cover what is being read.
      const suite = ligne.nextElementSibling;
      const dernier = suite && suite.classList.contains("ligne-commentaire") ? suite : ligne;
      const bas = dernier.getBoundingClientRect().bottom;
      const haut = ligne.getBoundingClientRect().top;
      const l = fiche.offsetWidth, h = fiche.offsetHeight;
      const top = bas + 6 + h <= window.innerHeight - 12 ? bas + 6 : Math.max(12, haut - 6 - h);
      const left = Math.min(Math.max(12, mouseX - 60), window.innerWidth - l - 12);
      fiche.style.top = Math.round(top) + "px";
      fiche.style.left = Math.round(left) + "px";
      requestAnimationFrame(() => fiche.classList.add("visible"));
    };

    const corps = $("#h-corps");
    corps.addEventListener("mousemove", ev => {
      mouseX = ev.clientX;
      const ligne = ev.target.closest("[data-id]");
      const onAction = ev.target.closest(".actions-ligne");
      const id = ligne && !onAction ? ligne.dataset.id : null;
      if (id === currentId) return;
      cacher();
      if (!id) return;
      currentId = id;
      minuteur = setTimeout(() => montrer(id), 280);
    });
    corps.addEventListener("mouseleave", cacher);
    /* Any click, not only in the table: the sheet lives on the body, and a
       click on the rail changes screen without leaving the row. */
    document.addEventListener("click", cacher, true);
    window.addEventListener("scroll", cacher, { passive: true, capture: true });
  }

  /* OPENING THE HISTORY ON A FILTER (v8.87), for example a day of the week
     recap. The other filters start from scratch: we come to see THAT day,
     not that day crossed with a coffee chosen a week ago. */
  function ouvrirHistoriqueSur(valeurs) {
    FILTRES.forEach(id => { $("#" + id).value = ""; });
    Object.entries(valeurs).forEach(([id, v]) => { $("#" + id).value = v; });
    UI.activerEcran("historique");
    rendreHistorique();
  }

  function cablerHistorique() {
    FILTRES.forEach(id => $("#" + id).addEventListener("input", rendreHistoriqueDifferee));
    $("#h-reinitialiser").addEventListener("click", () => {
      FILTRES.forEach(id => { $("#" + id).value = ""; });
      rendreHistorique();
    });
    // A3: the filter panel folds on the phone, the active ones stay as pills.
    $("#h-filtrer").addEventListener("click", () => {
      const ouvert = $("#ecran-historique").classList.toggle("filtres-ouverts");
      $("#h-filtrer").setAttribute("aria-expanded", String(ouvert));
    });
    $("#h-actifs").addEventListener("click", ev => {
      const b = ev.target.closest("[data-vider]");
      if (!b) return;
      b.dataset.vider.split(" ").forEach(id => { $("#" + id).value = ""; });
      rendreHistorique();
    });
    $("#h-exporter").addEventListener("click", () => {
      DATA.exporterExtractions(filtrerHistorique().map(e => { const { _c, ...reste } = e; return reste; }));
      toast(I18N.t("t_export_filtre"));
    });
    $$("#h-table th[data-tri]").forEach(th => th.addEventListener("click", () => {
      if (tri.colonne === th.dataset.tri) tri.sens = -tri.sens;
      else { tri.colonne = th.dataset.tri; tri.sens = -1; }
      rendreHistorique();
    }));
    /* BOTH CONTAINERS, table and cards: the same handler serves both
       renders. Attached to #h-corps alone, it left the six card actions
       rendered but dead. */
    const onHistoryClick = async ev => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) {
        /* Clicking the ROW opens the extraction for editing, like the last
           five on the dashboard. Without it, only the pencil worked: a 24 px
           target for a row that looks clickable as a whole. */
        const ligne = ev.target.closest("[data-id]");
        if (!ligne) return;
        /* A text selection is not a click. Without this test, copying a
           comment from the expanded detail would open the editor. */
        const selection = window.getSelection ? String(window.getSelection()) : "";
        if (selection.trim()) return;
        const rowExt = DATA.state.extractions.find(e => e.id === ligne.dataset.id);
        if (rowExt) UI.chargerExtractionDansSaisie(rowExt, false);
        return;
      }
      const id = btn.closest("[data-id]").dataset.id;
      const ext = DATA.state.extractions.find(e => e.id === id);
      if (!ext) return;
      if (btn.dataset.action === "supprimer") {
        // No more native confirm(): the undo replaces the question. A system
        // box on the phone breaks the app feel, and it does not go through
        // the i18n layer.
        await supprimerExtractionAvecRetour(ext);
      } else if (btn.dataset.action === "modifier") {
        UI.chargerExtractionDansSaisie(ext, false);
      } else if (btn.dataset.action === "dupliquer") {
        UI.refaireTasse(ext);
        toast(I18N.t("t_dupliquee"));
      } else if (btn.dataset.action === "menu") {
        if (openMenus.has(id)) openMenus.delete(id);
        else openMenus.add(id);
        rendreHistorique();
      } else if (btn.dataset.action === "deplier") {
        if (detailsOuverts.has(id)) detailsOuverts.delete(id);
        else detailsOuverts.add(id);
        rendreHistorique();
      } else if (btn.dataset.action === "comparer") {
        basculerComparaison(id);
      } else if (btn.dataset.action === "ratee") {
        /* One click writes. No confirmation: the gesture is reversible from
           the same button, and asking to confirm a toggle would be heavier
           than the toggle itself. */
        await DATA.modifierExtraction(id, { ...ext, ratee: Number(ext.ratee) === 1 ? "" : 1 });
        toast(I18N.t(Number(ext.ratee) === 1 ? "t_deratee" : "t_ratee"));
      }
    };
    [$("#h-corps"), $("#h-cartes"), $("#h-journal")].forEach(z => z.addEventListener("click", onHistoryClick));
    UI.cablerJournal(rendreHistorique);
    wireHoverSheet();

    /* The machine's segmented control DRIVES the <select>, which stays the
       source of truth: all the filtering, the reset and the export read it.
       Two sources for the same filter means two states that diverge. */
    $$(".filtre-methode .seg").forEach(b => b.addEventListener("click", () => {
      const sel = $("#h-methode");
      sel.value = b.dataset.methode;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      majSegmentMethode();
    }));
    /* The reset goes through the select: the segment must follow. */
    $("#h-reinitialiser").addEventListener("click", () => setTimeout(majSegmentMethode, 0));
    $("#comparaison-ouvrir").addEventListener("click", ouvrirComparaison);
    $("#comparaison-vider").addEventListener("click", () => { comparaison.clear(); rendreHistorique(); });
  }

  Object.assign(UI, {
    ouvrirHistoriqueSur,
    FILTRES, basculerComparaison, cablerHistorique, carteReglage, champsComparaison, comparaison, detailsOuverts,
    filtrerHistorique, ligneHistorique, majBarreComparaison, ouvrirComparaison,
    actionsExtraction, carteExtraction, commentaireHistorique, detailContenu, enCartes,
    majSegmentMethode,
    rendreCartes,
    goutsHistorique, remplirFiltres, rendreHistorique, rendreHistoriqueDifferee, rendreReglages,
    rendreResume, sansAccents, texteCherchable, tri, valeurTri,
  });
})();
