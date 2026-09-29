/* Entry screen: the diagnostic and taste pills, and folding the families.
 * Moved out of ui-saisie.js in v8.78. */
"use strict";

(() => {

  // Borrowed from the core and from ui-saisie.js, loaded before us.
  const { $, $$, basculerEtat, saisie, majCorrectionDiagnostic } = UI;

  /* A diagnostic's bubble: WHEN to tick it, then WHAT to do. Two lines, the
     bubble's CSS is white-space pre-line. The correction alone left you
     guessing which case you are in, and a good correction applied to the
     wrong diagnostic makes the next cup worse. */
  function infoDiagnostic(d) {
    const when = I18N.tr(DIAGNOSTIC_QUAND[d] || "");
    const corr = I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || "");
    return [when, corr].filter(Boolean).join("\n");
  }

  /* One listener per CONTAINER, set once at wiring. The containers are never
     replaced, only their content is: delegation therefore survives every
     rebuild, and construirePilules() has nothing left to reattach. 85
     listeners saved on each language switch. */
  function brancherPilules() {
    $("#f-diagnostic").addEventListener("click", ev => {
      const b = ev.target.closest(".pilule");
      if (!b || !b.dataset.diag) return;
      const d = b.dataset.diag;
      if (saisie.diagnostics.has(d)) saisie.diagnostics.delete(d);
      else saisie.diagnostics.add(d);
      basculerEtat(b, saisie.diagnostics.has(d));
      UI.planifierBrouillon();
      majCorrectionDiagnostic();
    });
    /* After each click on a pill, we recompute: see majFamillesVisibles. */
    $("#f-descripteurs").addEventListener("click", ev => {
      const b = ev.target.closest(".tag");
      if (!b || !b.dataset.tag) return;
      const t = b.dataset.tag;
      if (saisie.descripteurs.has(t)) saisie.descripteurs.delete(t);
      else saisie.descripteurs.add(t);
      basculerEtat(b, saisie.descripteurs.has(t));
    });
  }

  function construirePilules() {
    // MULTIPLE-choice diagnostics (a cup can be a bit bitter AND astringent).
    // Each pill carries its correction as a tooltip (data-info, CSS bubble
    // on hover).
    // Grouped by what needs correcting: setting, ratio, or the coffee itself.
    // A flat list of sixteen entries reads badly and pushes you to tick at random.
    $("#f-diagnostic").innerHTML = DIAGNOSTICS_GROUPES.map(g =>
      '<div class="tags-groupe"><span class="tags-groupe-nom">' + I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.diags.map(d =>
        '<button type="button" class="pilule" aria-pressed="false" data-diag="' + d + '" data-info="' +
        infoDiagnostic(d) + '">' + I18N.diag(d) + "</button>").join("") +
      "</div></div>").join("");
    // Clicks are delegated once and for all, see brancherPilules().

    // Descriptors grouped by family of the flavour wheel. Each tag carries
    // its definition as a tooltip (data-info, CSS bubble on hover).
    $("#f-descripteurs").innerHTML = DESCRIPTEURS_GROUPES.map(g =>
      '<div class="tags-groupe" data-groupe="' + g.nom + '"><span class="tags-groupe-nom">' +
      I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" aria-pressed="false" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");
    majFamillesVisibles();
  }

  /* HOW MANY FAMILIES STAY VISIBLE when everything is folded. Two, as in the
     brief: enough to understand there are others, few enough for the block
     to fit on the screen. */
  const VISIBLE_FAMILIES = 2;
  const FAMILIES_KEY = "gouts-toutes-familles";

  /* OPEN BY DEFAULT. Folding stays, but it is a choice: Chris does not want
     to have to click to see his own list. Only an explicitly saved "0"
     folds the families. */
  function allFamilies() {
    try { return localStorage.getItem(FAMILIES_KEY) !== "0"; } catch (e) { return true; }
  }

  function basculerFamilles(open) {
    const wanted = open === undefined ? !allFamilies() : !!open;
    try { localStorage.setItem(FAMILIES_KEY, wanted ? "1" : "0"); } catch (e) { /* private browsing */ }
    majFamillesVisibles();
  }

  /* WHICH FAMILIES SHOW. A family holding a ticked taste stays visible no
     matter what: hiding a ticked pill suggests it is not ticked, yet the
     next save keeps it. The first two are always there, the rest follow the
     button.

     Called on every selection change, and not only at first render: editing
     an old cup ticks tastes AFTER the pills are built. */
  function majFamillesVisibles() {
    const zone = $("#f-descripteurs");
    if (!zone) return;
    const showAll = allFamilies();
    let hiddenCount = 0;
    $$("#f-descripteurs .tags-groupe").forEach((g, i) => {
      const ticked = !!g.querySelector(".tag.actif");
      const visible = showAll || ticked || i < VISIBLE_FAMILIES;
      g.hidden = !visible;
      if (!visible) hiddenCount++;
    });
    const b = $("#gouts-plus");
    if (!b) return;
    b.hidden = !showAll && hiddenCount === 0;
    b.textContent = showAll ? I18N.t("gouts_moins") : I18N.t("gouts_plus", { n: hiddenCount });
    b.setAttribute("aria-expanded", showAll ? "true" : "false");
  }

  Object.assign(UI, {
    basculerFamilles, brancherPilules, construirePilules, infoDiagnostic, majFamillesVisibles,
  });
})();
