/* Écran d'historique : le tableau, ses filtres, son tri, son comparateur.
 *
 * Le tri et les lignes dépliées vivent ici et nulle part ailleurs : ce sont des
 * préférences d'affichage, elles ne se synchronisent pas et ne se rangent pas
 * dans les données. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, antiRebond, attrTitre, detailRatio, diagsAffiches, extAvecCalculs, fmtDateHeure,
    fmtDecimal, fmtTemps, fmtVND, toast } = UI;

  // ---------- Historique ----------

  const tri = { colonne: "date_heure", sens: -1 };

  /* Retire les diacritiques pour que "brule" trouve "brûlé" et "cafe" trouve
     "café". Sans ça une recherche en français est inutilisable au clavier. */
  function sansAccents(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* Tout ce dans quoi une recherche a du sens : ce que Chris a ÉCRIT, plus ce
     qu'il a choisi. Pas les nombres, on a des filtres dédiés pour ça. */
  function texteCherchable(e) {
    const cafe = DATA.cafeDe(e);
    return sansAccents([
      e.commentaire, e.descripteurs, e.diagnostic, e.recette, e.methode,
      cafe ? cafe.nom : "",
    ].filter(Boolean).join(" ").toLowerCase());
  }

  function filtrerHistorique() {
    const exts = extAvecCalculs();
    const fCafe = $("#h-cafe").value;
    const fMethode = $("#h-methode").value;
    const fDiag = $("#h-diagnostic").value;
    const fNote = parseFloat($("#h-note-min").value);
    const fDu = $("#h-du").value;
    const fAu = $("#h-au").value;
    /* Recherche insensible à la casse ET aux accents : taper "brule" doit trouver
       "brûlé". normalize + suppression des diacritiques, c'est la seule façon
       correcte de le faire en français sans table de correspondance. */
    const q = sansAccents($("#h-recherche").value.trim().toLowerCase());
    return exts.filter(e =>
      (!q || texteCherchable(e).includes(q)) &&
      (!fCafe || e.cafe_id === fCafe) &&
      (!fMethode || e.methode === fMethode) &&
      (!fDiag || (e.diagnostic || "").split("|").includes(fDiag)) &&
      (isNaN(fNote) || (e.note_sur_10 !== "" && e.note_sur_10 >= fNote)) &&
      (!fDu || e.date_heure.slice(0, 10) >= fDu) &&
      (!fAu || e.date_heure.slice(0, 10) <= fAu)
    );
  }

  function valeurTri(e, col) {
    if (col === "cafe_nom") return e._c.cafe_nom;
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "mouture") return e._c.crans === "" ? -1 : e._c.crans;
    if (col === "note_sur_10") return e.note_sur_10 === "" ? -1 : e.note_sur_10;
    return e[col] === "" ? -1 : e[col];
  }

  /* Version différée pour les FILTRES seulement. Les autres appels (suppression,
     tri, retour d'édition) restent immédiats : ils suivent un geste unique, il n'y
     a rien à regrouper. */
  const rendreHistoriqueDifferee = antiRebond(() => rendreHistorique());

  function rendreHistorique() {
    const liste = filtrerHistorique().sort((a, b) => {
      const va = valeurTri(a, tri.colonne), vb = valeurTri(b, tri.colonne);
      if (va < vb) return -tri.sens;
      if (va > vb) return tri.sens;
      return 0;
    });
    $("#h-compte").textContent = I18N.t("h_compte", {
      n: liste.length, s: liste.length > 1 ? "s" : "", t: DATA.state.extractions.length,
    });
    $("#h-vide").hidden = liste.length > 0;

    $$("#h-table th .tri").forEach(s => s.textContent = "");
    const th = $('#h-table th[data-tri="' + tri.colonne + '"] .tri');
    if (th) th.textContent = tri.sens > 0 ? "▲" : "▼";

    $("#h-corps").innerHTML = liste.map(e => ligneHistorique(e)).join("");
    majBarreComparaison();
  }

  /* Détail dépliable : le carnet stocke 22 champs par extraction et le tableau
     n'en montre que 8. Tout le reste (commentaire, descripteurs, temps, tasse,
     puissance de feu, volume) disparaissait à l'enregistrement. Le détail se
     rend dans une ligne en colspan, donc sans toucher aux largeurs de colonnes
     qui viennent d'être figées. */
  const detailsOuverts = new Set();
  const comparaison = new Set();

  function ligneDetail(e) {
    const item = (cle, valeur) => valeur === "" || valeur === undefined || valeur === null
      ? "" : '<div class="detail-item"><span>' + I18N.t(cle) + "</span><b>" + valeur + "</b></div>";
    const cases = [
      item("d_dose", e.dose_g !== "" ? e.dose_g + " g" : ""),
      item("d_eau", e.eau_g !== "" ? e.eau_g + " g" : ""),
      item("d_temp", e.temperature_c !== "" ? e.temperature_c + " °C" : ""),
      item("d_puissance", e.puissance_feu !== "" ? e.puissance_feu + " / 10" : ""),
      item("d_total", e.temps_total_s !== "" ? fmtTemps(e.temps_total_s) : ""),
      item("d_ecoulement", e.temps_ecoulement_s !== "" ? fmtTemps(e.temps_ecoulement_s) : ""),
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

    return '<tr class="ligne-detail" data-detail="' + e.id + '"><td colspan="9">' +
      (cases ? '<div class="detail-grille">' + cases + "</div>" : "") +
      (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
      (e.commentaire ? '<p class="detail-commentaire">' + e.commentaire + "</p>" : "") +
      (cases || tags || e.commentaire ? "" : '<p class="detail-vide">' + I18N.t("d_rien") + "</p>") +
      "</td></tr>";
  }

  function ligneHistorique(e) {
    const ouvert = detailsOuverts.has(e.id);
    const compare = comparaison.has(e.id);
    return '<tr data-id="' + e.id + '" class="ligne-histo' + (ouvert ? " ouverte" : "") +
      (compare ? " comparee" : "") + '">' +
      '<td><button type="button" class="btn-deplier" data-action="deplier" aria-expanded="' + ouvert +
      '" title="' + attrTitre(I18N.t("h_detail")) + '">' + (ouvert ? "▾" : "▸") + "</button> " +
      fmtDateHeure(e.date_heure) + "</td>" +
      '<td title="' + attrTitre(I18N.tr(e._c.cafe_nom)) + '">' + I18N.tr(e._c.cafe_nom) + "</td>" +
      '<td><span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span></td>" +
      '<td title="' + attrTitre(e.recette) + '">' + (e.recette || "") + "</td>" +
      "<td>" + (e.mouture_dial ? e.mouture_dial + " <small>(" + e._c.microns + " µm)</small>" : e._c.moulu ? "<small>" + I18N.t("paquet") + "</small>" : "") + "</td>" +
      '<td title="' + attrTitre(detailRatio(e._c.ratioBase, e.dose_g, e.eau_g)) + '">' +
      e._c.ratioTexte +
      (e._c.ratioTasseTexte ? ' <small>(' + I18N.t("rt_tasse_court") + " " + e._c.ratioTasseTexte + ")</small>" : "") +
      (e._c.ratioBoisson ? ' <small>(' + I18N.t("rt_boisson_court") + " " + e._c.ratioBoisson + ")</small>" : "") + "</td>" +
      '<td class="note-cellule">' + (e.note_sur_10 !== "" ? e.note_sur_10 : "") + "</td>" +
      '<td class="chip-diagnostic" title="' + attrTitre(e.diagnostic ? diagsAffiches(e.diagnostic) : "") + '">' +
      (e.diagnostic ? diagsAffiches(e.diagnostic) : "") + "</td>" +
      '<td><div class="actions-ligne">' +
      '<button class="btn-ligne' + (compare ? " actif" : "") + '" data-action="comparer" title="' +
      attrTitre(I18N.t("h_comparer")) + '">⇄</button>' +
      '<button class="btn-ligne" data-action="dupliquer" title="Dupliquer pour refaire la même">⧉</button>' +
      '<button class="btn-ligne" data-action="modifier" title="Modifier">✎</button>' +
      '<button class="btn-ligne danger" data-action="supprimer" title="Supprimer">🗑</button>' +
      "</div></td></tr>" + (ouvert ? ligneDetail(e) : "");
  }

  /* Comparateur : deux extractions côte à côte, différences surlignées. C'est le
     test croisé en version manuelle, celui que le guide recommande (même café
     dans les deux machines le même jour) et qui n'existait pas.

     La sélection passe par un bouton de la colonne Actions et PAS par une colonne
     de cases à cocher : le tableau vient d'être figé à neuf colonnes, en ajouter
     une casserait les largeurs. */
  function basculerComparaison(id) {
    if (comparaison.has(id)) comparaison.delete(id);
    else {
      // Au delà de deux, la plus ancienne sélection cède sa place : plus simple
      // que de refuser le clic, et ça permet d'enchaîner les comparaisons.
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

  // Lignes du tableau de comparaison. Chaque entrée sait lire sa valeur affichable.
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
      { cle: "d_note", lire: e => e.note_sur_10 !== "" ? e.note_sur_10 + " / 10" : "" },
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
      // Surligner UNIQUEMENT ce qui diffère : c'est là que se trouve l'explication
      // de l'écart de note, le reste est du bruit visuel.
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

  /* ---------- Mes meilleurs réglages ----------
     Le calcul vit dans js/reglages.js, sans DOM, pour être testable sans
     navigateur. Ici, uniquement l'affichage. */
  function carteReglage(bilan) {
    const c = bilan.cafe;
    const entete = '<div class="reglage-entete"><b>' + c.nom + "</b>" +
      (c.actif === 0 ? ' <span class="cafe-meta">' + I18N.t("li_inactif") + "</span>" : "") +
      (bilan.moyenne !== null
        ? '<span class="reglage-moyenne">' + I18N.t("rg_moyenne", { m: fmtDecimal(bilan.moyenne, 1), n: bilan.total }) + "</span>"
        : "") + "</div>";

    if (!bilan.meilleure) {
      const cle = bilan.raison === "aucune" ? "rg_aucune"
        : bilan.raison === "pas_assez" ? "rg_pas_assez" : "rg_eparpille";
      return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
        '<p class="carte-vide">' + I18N.t(cle, { n: bilan.manque, s: REGLAGES.MIN_TASSES }) + "</p></article>";
    }

    const m = bilan.meilleure;
    // Écart entre la combinaison gagnante et la moyenne du café : c'est lui qui
    // dit si le réglage vaut vraiment le coup ou si tout se vaut.
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
      '<button type="button" class="btn btn-petit" data-refaire="' + m.referenceId + '">' +
      I18N.t("rg_refaire") + "</button></article>";
  }

  function rendreReglages() {
    const exts = DATA.state.extractions;
    const bilans = REGLAGES.tous(DATA.state.cafes, exts);
    $("#reglages-liste").innerHTML = bilans.length
      ? bilans.map(carteReglage).join("")
      : '<p class="carte-vide">' + I18N.t("rg_sans_cafe") + "</p>";
    $$("[data-refaire]").forEach(b => b.addEventListener("click", () => {
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.refaire);
      if (!ext) return;
      UI.chargerExtractionDansSaisie(ext, true);
      toast(I18N.t("rg_preremplie"));
    }));
  }

  function remplirFiltres() {
    const selCafe = $("#h-cafe");
    const v = selCafe.value;
    selCafe.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DATA.state.cafes.map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("");
    selCafe.value = v;
    const selDiag = $("#h-diagnostic");
    const vd = selDiag.value;
    selDiag.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DIAGNOSTICS.map(d => '<option value="' + d + '">' + I18N.diag(d) + "</option>").join("");
    selDiag.value = vd;
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    basculerComparaison, carteReglage, champsComparaison, comparaison, detailsOuverts,
    filtrerHistorique, ligneDetail, ligneHistorique, majBarreComparaison, ouvrirComparaison,
    remplirFiltres, rendreHistorique, rendreHistoriqueDifferee, rendreReglages, sansAccents,
    texteCherchable, tri, valeurTri,
  });
})();
