/* Entry screen: the diagnostic and taste pills, and folding the families.
 * Moved out of ui-entry.js in v8.78. */
"use strict";

(() => {

  // Borrowed from the core and from ui-entry.js, loaded before us.
  const { $, $$, setPressed, entry, updateDiagnosticCorrection } = UI;

  /* A diagnostic's bubble: WHEN to tick it, then WHAT to do. Two lines, the
     bubble's CSS is white-space pre-line. The correction alone left you
     guessing which case you are in, and a good correction applied to the
     wrong diagnostic makes the next cup worse. */
  function infoDiagnostic(d) {
    const when = I18N.tr(DIAGNOSTIC_WHEN[d] || "");
    const corr = I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || "");
    return [when, corr].filter(Boolean).join("\n");
  }

  /* One listener per CONTAINER, set once at wiring. The containers are never
     replaced, only their content is: delegation therefore survives every
     rebuild, and buildPills() has nothing left to reattach. 85
     listeners saved on each language switch. */
  function wirePills() {
    $("#f-diagnostic").addEventListener("click", ev => {
      const b = ev.target.closest(".pill");
      if (!b || !b.dataset.diag) return;
      const d = b.dataset.diag;
      if (entry.diagnostics.has(d)) entry.diagnostics.delete(d);
      else entry.diagnostics.add(d);
      setPressed(b, entry.diagnostics.has(d));
      UI.scheduleDraft();
      updateDiagnosticCorrection();
    });
    /* After each click on a pill, we recompute: see updateVisibleFamilies. */
    $("#f-descriptors").addEventListener("click", ev => {
      const b = ev.target.closest(".tag");
      if (!b || !b.dataset.tag) return;
      const t = b.dataset.tag;
      if (entry.descripteurs.has(t)) entry.descripteurs.delete(t);
      else entry.descripteurs.add(t);
      setPressed(b, entry.descripteurs.has(t));
    });
  }

  function buildPills() {
    // MULTIPLE-choice diagnostics (a cup can be a bit bitter AND astringent).
    // Each pill carries its correction as a tooltip (data-info, CSS bubble
    // on hover).
    // Grouped by what needs correcting: setting, ratio, or the coffee itself.
    // A flat list of sixteen entries reads badly and pushes you to tick at random.
    $("#f-diagnostic").innerHTML = DIAGNOSTIC_GROUPS.map(g =>
      '<div class="tags-group"><span class="tags-group-name">' + I18N.group(g.nom) + "</span>" +
      '<div class="tags">' + g.diags.map(d =>
        '<button type="button" class="pill" aria-pressed="false" data-diag="' + d + '" data-info="' +
        infoDiagnostic(d) + '">' + I18N.diag(d) + "</button>").join("") +
      "</div></div>").join("");
    // Clicks are delegated once and for all, see wirePills().

    // Descriptors grouped by family of the flavour wheel. Each tag carries
    // its definition as a tooltip (data-info, CSS bubble on hover).
    $("#f-descriptors").innerHTML = DESCRIPTOR_GROUPS.map(g =>
      '<div class="tags-group" data-group="' + g.nom + '"><span class="tags-group-name">' +
      I18N.group(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" aria-pressed="false" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");
    updateVisibleFamilies();
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

  function toggleFamilies(open) {
    const wanted = open === undefined ? !allFamilies() : !!open;
    try { localStorage.setItem(FAMILIES_KEY, wanted ? "1" : "0"); } catch (e) { /* private browsing */ }
    updateVisibleFamilies();
  }

  /* WHICH FAMILIES SHOW. A family holding a ticked taste stays visible no
     matter what: hiding a ticked pill suggests it is not ticked, yet the
     next save keeps it. The first two are always there, the rest follow the
     button.

     Called on every selection change, and not only at first render: editing
     an old cup ticks tastes AFTER the pills are built. */
  function updateVisibleFamilies() {
    const zone = $("#f-descriptors");
    if (!zone) return;
    const showAll = allFamilies();
    let hiddenCount = 0;
    $$("#f-descriptors .tags-group").forEach((g, i) => {
      const ticked = !!g.querySelector(".tag.on");
      const visible = showAll || ticked || i < VISIBLE_FAMILIES;
      g.hidden = !visible;
      if (!visible) hiddenCount++;
    });
    const b = $("#tastes-plus");
    if (!b) return;
    b.hidden = !showAll && hiddenCount === 0;
    b.textContent = showAll ? I18N.t("tastes_fewer") : I18N.t("tastes_more", { n: hiddenCount });
    b.setAttribute("aria-expanded", showAll ? "true" : "false");
  }

  Object.assign(UI, {
    toggleFamilies, wirePills, buildPills, infoDiagnostic, updateVisibleFamilies,
  });
})();
