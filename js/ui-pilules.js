/* Écran de saisie : les pilules des diagnostics et des goûts, et le repli des
 * familles. Sorties de ui-saisie.js en v8.78. */
"use strict";

(() => {

  // Emprunté au noyau et à ui-saisie.js, chargés avant nous.
  const { $, $$, basculerEtat, saisie, majCorrectionDiagnostic } = UI;

  /* Bulle d'un diagnostic : QUAND le cocher, puis QUOI faire. Deux lignes, la
     CSS de la bulle est en white-space pre-line. La correction seule laissait
     deviner dans quel cas on se trouve, et une bonne correction appliquée au
     mauvais diagnostic empire la tasse suivante. */
  function infoDiagnostic(d) {
    const quand = I18N.tr(DIAGNOSTIC_QUAND[d] || "");
    const corr = I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || "");
    return [quand, corr].filter(Boolean).join("\n");
  }

  /* Un écouteur par CONTENEUR, posé une seule fois au câblage. Les conteneurs ne
     sont jamais remplacés, seul leur contenu l'est : la délégation survit donc à
     toutes les reconstructions, et construirePilules() n'a plus rien à
     réattacher. 85 écouteurs économisés à chaque bascule de langue. */
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
    /* Apres chaque clic sur une pastille, on recalcule : voir majFamillesVisibles. */
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
    // Diagnostics à choix MULTIPLE (une tasse peut être un peu amère ET
    // astringente). Chaque pilule porte sa correction en infobulle (data-info,
    // bulle CSS au survol).
    // Groupés par ce qu'il faut corriger : réglage, ratio, ou le café lui même.
    // Une liste à plat de seize entrées se lit mal et pousse à cocher au hasard.
    $("#f-diagnostic").innerHTML = DIAGNOSTICS_GROUPES.map(g =>
      '<div class="tags-groupe"><span class="tags-groupe-nom">' + I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.diags.map(d =>
        '<button type="button" class="pilule" aria-pressed="false" data-diag="' + d + '" data-info="' +
        infoDiagnostic(d) + '">' + I18N.diag(d) + "</button>").join("") +
      "</div></div>").join("");
    // Les clics sont délégués une fois pour toutes, voir brancherPilules().

    // Descripteurs groupés par famille de la roue des saveurs. Chaque tag
    // porte sa définition en infobulle (data-info, bulle CSS au survol).
    $("#f-descripteurs").innerHTML = DESCRIPTEURS_GROUPES.map(g =>
      '<div class="tags-groupe" data-groupe="' + g.nom + '"><span class="tags-groupe-nom">' +
      I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" aria-pressed="false" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");
    majFamillesVisibles();
  }

  /* COMBIEN DE FAMILLES RESTENT VISIBLES quand tout est replie. Deux, comme le
     brief : assez pour comprendre qu'il y en a d'autres, assez peu pour que le
     bloc tienne dans l'ecran. */
  const FAMILLES_VISIBLES = 2;
  const CLE_FAMILLES = "gouts-toutes-familles";

  /* OUVERT PAR DEFAUT. Le repli reste, mais il se choisit : Chris ne veut pas
     avoir a cliquer pour voir sa propre liste. Seul un « 0 » explicitement
     enregistre replie les familles. */
  function toutesFamilles() {
    try { return localStorage.getItem(CLE_FAMILLES) !== "0"; } catch (e) { return true; }
  }

  function basculerFamilles(ouvrir) {
    const veut = ouvrir === undefined ? !toutesFamilles() : !!ouvrir;
    try { localStorage.setItem(CLE_FAMILLES, veut ? "1" : "0"); } catch (e) { /* navigation privee */ }
    majFamillesVisibles();
  }

  /* QUELLES FAMILLES SE VOIENT. Une famille qui contient un gout coche reste
     visible quoi qu'il arrive : cacher une pastille cochee, c'est faire croire
     qu'elle ne l'est pas, et l'enregistrement suivant la garde pourtant. Les
     deux premieres sont toujours la, le reste suit le bouton.

     Appelee a chaque changement de selection, et pas seulement au premier
     rendu : l'edition d'une tasse ancienne coche des gouts APRES la
     construction des pastilles. */
  function majFamillesVisibles() {
    const zone = $("#f-descripteurs");
    if (!zone) return;
    const tout = toutesFamilles();
    let caches = 0;
    $$("#f-descripteurs .tags-groupe").forEach((g, i) => {
      const coche = !!g.querySelector(".tag.actif");
      const visible = tout || coche || i < FAMILLES_VISIBLES;
      g.hidden = !visible;
      if (!visible) caches++;
    });
    const b = $("#gouts-plus");
    if (!b) return;
    b.hidden = !tout && caches === 0;
    b.textContent = tout ? I18N.t("gouts_moins") : I18N.t("gouts_plus", { n: caches });
    b.setAttribute("aria-expanded", tout ? "true" : "false");
  }

  Object.assign(UI, {
    basculerFamilles, brancherPilules, construirePilules, infoDiagnostic, majFamillesVisibles,
  });
})();
