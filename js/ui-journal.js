/* L3 (v8.93) : LE JOURNAL, PAR SACHET.
 *
 * Une seule liste de soixante tasses ne disait jamais comment s'était passé un
 * sachet : il fallait filtrer, puis compter à la main. Ici chaque sachet est un
 * chapitre, avec son résumé en tête (dates, tasses, moyenne, la meilleure, le
 * meilleur réglage, le prix de la tasse, et la courbe de la note au fil des
 * jours). Les tasses dessous sont les mêmes cartes que l'historique par date.
 *
 * Le chapitre le plus récent s'ouvre, les autres restent en une ligne. Les
 * filtres de l'historique s'appliquent : on range ce qu'ils laissent passer. */
"use strict";

(() => {

  // Emprunté au noyau et à ui-historique.js, chargés avant nous.
  const { $, attrTitre, estRatee, fmtDateCourte, fmtDecimal, moyenne } = UI;

  const CLE_VUE = "historique-vue";
  const VISIBLES = 5;
  const ouverts = new Set();
  const complets = new Set();
  let premierRendu = true;
  const note1 = n => fmtDecimal(n, 1);
  // « 19 août » : l'année ne s'écrit que si ce n'est pas celle en cours.
  function jour(d) {
    const [y, m, j] = String(d).slice(0, 10).split("-").map(Number);
    if (!y || !m || !j) return fmtDateCourte(d);
    const date = new Date(y, m - 1, j);
    return date.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
  }

  function vueHistorique() {
    try { return localStorage.getItem(CLE_VUE) === "date" ? "date" : "sachet"; } catch (e) { return "sachet"; }
  }
  function choisirVue(v) {
    try { localStorage.setItem(CLE_VUE, v); } catch (e) { /* sans stockage, la vue revient par sachet */ }
  }

  // Les tasses rangées par sachet ; une tasse sans sachet enregistré va dans le chapitre de son café.
  function chapitres(liste) {
    const par = new Map();
    liste.forEach(e => {
      const s = DATA.sachetALaDate(e.cafe_id, e.date_heure);
      const cle = s ? s.id : "sans|" + e.cafe_id;
      if (!par.has(cle)) par.set(cle, { cle, sachet: s, cafe: DATA.cafeDe(e), tasses: [] });
      par.get(cle).tasses.push(e);
    });
    const liste2 = [...par.values()];
    liste2.forEach(c => c.tasses.sort((a, b) => String(b.date_heure).localeCompare(String(a.date_heure))));
    return liste2.sort((a, b) => String(b.tasses[0].date_heure).localeCompare(String(a.tasses[0].date_heure)));
  }

  // La note au fil du sachet, en une ligne : chaque point est une tasse notée, dans l'ordre.
  function courbe(notees) {
    if (notees.length < 2) return "";
    const ordre = notees.slice().sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
    const W = 240, H = 34, x = i => 4 + i * ((W - 8) / (ordre.length - 1)), y = n => H - 4 - (Math.max(3, Math.min(10, n)) - 3) / 7 * (H - 8);
    const d = "M" + ordre.map((e, i) => x(i).toFixed(1) + " " + y(Number(e.note_sur_10)).toFixed(1)).join(" L");
    // Étirée sur toute la largeur (v8.95) : sur ordinateur, gardée à ses proportions, elle restait un trait au centre.
    return '<svg class="jn-courbe" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" vector-effect="non-scaling-stroke"></path></svg>';
  }

  function resume(c) {
    const cafe = c.cafe, s = c.sachet;
    const notees = c.tasses.filter(e => e.note_sur_10 !== "" && !estRatee(e));
    const moy = notees.length ? moyenne(notees.map(e => Number(e.note_sur_10))) : null;
    const meilleure = notees.slice().sort((a, b) => Number(b.note_sur_10) - Number(a.note_sur_10))[0] || null;
    const courant = s && cafe ? DATA.sachetCourant(cafe.id) : null;
    const stock = courant && courant.id === s.id ? DATA.stockSachet(cafe.id, UI.replis.dose) : null;
    const enCours = !!(stock && stock.restant > 0);
    const plusVieille = c.tasses[c.tasses.length - 1].date_heure;
    const debut = s ? (s.date_ouverture || s.date_achat) : String(plusVieille).slice(0, 10);
    const fin = String(c.tasses[0].date_heure).slice(0, 10);
    const doses = c.tasses.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const prix = s && Number(s.prix_vnd) > 0 && Number(s.format_grammes) > 0 && doses.length
      ? Math.round(Number(s.prix_vnd) / Number(s.format_grammes) * moyenne(doses)) : null;
    return { notees, moy, meilleure, enCours, stock, debut, fin, prix };
  }

  function chapitre(c) {
    const r = resume(c);
    const ouvert = ouverts.has(c.cle);
    const nom = c.cafe ? I18N.tr(c.cafe.nom) : I18N.t("jn_sans_cafe");
    const quand = r.enCours
      ? I18N.t("jn_depuis", { d: jour(r.debut) })
      : r.debut === r.fin ? jour(r.debut) : I18N.t("jn_du_au", { a: jour(r.debut), b: jour(r.fin) });
    const etat = !c.sachet ? I18N.t("jn_sans_sachet")
      : r.enCours ? I18N.t("jn_en_cours", { g: Math.round(r.stock.restant) }) : I18N.t("jn_fini");
    const reglage = r.meilleure ? [I18N.tr(r.meilleure.recette || ""), r.meilleure.mouture_dial || ""].filter(Boolean).join(" · ") : "";
    const kpi = (v, l) => '<div class="jn-kpi"><b>' + v + "</b><span>" + l + "</span></div>";
    const tasses = complets.has(c.cle) ? c.tasses : c.tasses.slice(0, VISIBLES);
    const reste = c.tasses.length - tasses.length;
    return '<section class="jn-chapitre' + (ouvert ? " ouvert" : "") + (r.enCours ? " en-cours" : "") + '">' +
      '<button type="button" class="jn-tete" data-chapitre="' + attrTitre(c.cle) + '" aria-expanded="' + ouvert + '">' +
        '<span class="jn-titre"><b>' + attrTitre(nom) + "</b>" +
          '<span class="jn-etat' + (r.enCours ? " vif" : "") + '">' + etat + "</span></span>" +
        '<span class="jn-sous">' + quand + " · " + I18N.t("jn_tasses", { n: c.tasses.length, s: c.tasses.length > 1 ? "s" : "" }) +
          (c.sachet && c.sachet.format_grammes ? " · " + c.sachet.format_grammes + " g" : "") + "</span>" +
        '<span class="jn-moy">' + (r.moy !== null ? note1(r.moy) : "·") + "</span>" +
      "</button>" +
      (ouvert
        ? '<div class="jn-corps">' +
            '<div class="jn-resume">' +
              '<div class="jn-kpis">' +
                kpi(r.moy !== null ? note1(r.moy) : "·", I18N.t("jn_moyenne", { n: r.notees.length })) +
                kpi(r.meilleure ? note1(Number(r.meilleure.note_sur_10)) : "·", I18N.t("jn_meilleure")) +
                kpi(r.prix ? r.prix.toLocaleString(I18N.locale()) + " ₫" : "·", I18N.t("jn_la_tasse")) +
              "</div>" + courbe(r.notees) +
              (reglage ? '<p class="jn-reglage">' + I18N.t("jn_reglage", { r: attrTitre(reglage), n: note1(Number(r.meilleure.note_sur_10)) }) + "</p>" : "") +
            "</div>" +
            '<div class="h-cartes jn-tasses">' + tasses.map(e => UI.carteExtraction(e)).join("") + "</div>" +
            (reste > 0 ? '<button type="button" class="btn btn-discret btn-petit jn-tout" data-journal-tout="' + attrTitre(c.cle) + '">' +
              I18N.t("jn_voir_tout", { n: reste, s: reste > 1 ? "s" : "" }) + "</button>" : "") +
          "</div>"
        : "") +
      "</section>";
  }

  function rendreJournal(liste) {
    const zone = $("#h-journal");
    if (!zone) return;
    const ch = chapitres(liste);
    // À la première ouverture, le chapitre le plus récent est déplié : c'est celui qu'on vient voir.
    if (premierRendu && ch.length) { ouverts.add(ch[0].cle); premierRendu = false; }
    zone.innerHTML = ch.map(chapitre).join("");
  }

  function cablerJournal(rendre) {
    $("#h-journal").addEventListener("click", ev => {
      const t = ev.target.closest("[data-chapitre]");
      if (t) {
        const k = t.dataset.chapitre;
        if (ouverts.has(k)) ouverts.delete(k); else ouverts.add(k);
        rendre();
        return;
      }
      const tout = ev.target.closest("[data-journal-tout]");
      if (tout) { complets.add(tout.dataset.journalTout); rendre(); }
    });
    document.querySelectorAll(".h-vues [data-vue]").forEach(b => b.addEventListener("click", () => { choisirVue(b.dataset.vue); rendre(); }));
  }

  function majVues() {
    const v = vueHistorique();
    document.querySelectorAll(".h-vues [data-vue]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vue === v)));
  }

  Object.assign(UI, { cablerJournal, majVues, rendreJournal, vueHistorique });
})();
