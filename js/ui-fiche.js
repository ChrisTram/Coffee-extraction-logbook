/* La FICHE D'UN CAFÉ (v8.46) : tout ce que le carnet sait d'un café, au même
 * endroit.
 *
 * Avant elle, c'était éclaté : le sachet et son stock dans « Mes cafés », le
 * meilleur réglage dans « Mes meilleurs réglages », les goûts dans
 * l'historique, la fraîcheur dans la colonne de la saisie. Et rien ne montrait
 * comment un café évolue au fil de son sachet.
 *
 * La fraîcheur part de la DATE D'OUVERTURE du sachet, pas de la torréfaction :
 * les paquets de Chris n'en portent presque jamais. Chaque tasse a donc son jour
 * du sachet (DATA.calculs, jours_ouvert), et la FENÊTRE est apprise de ses
 * notes : les tranches de jours où les tasses de CE café dépassent sa moyenne,
 * dès MIN_TRANCHE tasses par tranche. Tant qu'il n'y en a pas assez, la fiche
 * montre la courbe sans fenêtre, et le dit.
 *
 * S'ouvre depuis « Mes meilleurs réglages » et « Mes cafés », dans un dialogue
 * de la page. Aucune donnée nouvelle : tout est déjà saisi. */
"use strict";

(() => {

  const { $, extAnalysables, extAvecCalculs, fmtDecimal, moyenne, replis, toast } = UI;

  /* Les tranches de jours du sachet, en jours depuis l'ouverture (0 = le jour
     même). Serrées au début, là où le café bouge le plus, puis plus larges. */
  const TRANCHES = [[0, 3], [4, 7], [8, 11], [12, 15], [16, 21], [22, 28], [29, 60]];
  const MIN_TRANCHE = 3;
  const REACHAT_TASSES = 3;
  let ficheId = null;
  // Le café d'en face dans « Comparer avec… » (v8.56), remis à zéro à chaque fiche.
  let compareId = "";

  const echap = OUTILS.echap;
  const note1 = n => fmtDecimal(n, 1);

  function dateLocale(s) {
    const [a, m, j] = String(s).slice(0, 10).split("-").map(Number);
    return a && m && j ? new Date(a, m - 1, j) : null;
  }
  function jourCourt(s) {
    const d = dateLocale(s);
    return d ? d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) : "";
  }

  /* Le jour du sachet EN COURS, compté comme les tasses : 0 le jour de
     l'ouverture. Null sans sachet ouvert. */
  function jourCourant(cafeId) {
    const s = DATA.sachetCourant(cafeId);
    if (!s || !s.date_ouverture) return null;
    const d = dateLocale(s.date_ouverture);
    if (!d) return null;
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    return { jour: Math.max(0, Math.round((auj - d) / 86400000)), ouverture: s.date_ouverture };
  }

  /* LA FENÊTRE APPRISE. Les tranches qui ont assez de tasses ; parmi elles,
     celles au-dessus de la moyenne du café. La fenêtre va de la première bonne
     à la dernière bonne : un creux isolé au milieu d'un bon sachet est du
     bruit, pas une fermeture. Il faut au moins deux tranches documentées, sinon
     il n'y a rien à comparer. */
  function fenetre(notees, moyCafe) {
    const tranches = TRANCHES.map(([a, b]) => {
      const notes = notees.filter(e => e._c.jours_ouvert !== "" && e._c.jours_ouvert >= a && e._c.jours_ouvert <= b)
        .map(e => Number(e.note_sur_10));
      return { a, b, n: notes.length, moy: notes.length ? moyenne(notes) : null };
    });
    const documentees = tranches.filter(t => t.n >= MIN_TRANCHE);
    if (documentees.length < 2) return { tranches, fenetre: null };
    const bonnes = documentees.filter(t => t.moy >= moyCafe);
    if (!bonnes.length || bonnes.length === documentees.length) return { tranches, fenetre: null };
    /* La fin s'arrête au dernier jour qu'une tasse documente : la dernière
       tranche court jusqu'au jour 60, et annoncer « encore 19 jours » sur des
       jours que personne n'a goûtés serait inventer. */
    const jours = notees.filter(e => e._c.jours_ouvert !== "").map(e => e._c.jours_ouvert);
    const debut = bonnes[0].a, fin = Math.min(bonnes[bonnes.length - 1].b, Math.max(...jours));
    const dedans = notees.filter(e => e._c.jours_ouvert !== "" && e._c.jours_ouvert >= debut && e._c.jours_ouvert <= fin);
    const dehors = notees.filter(e => e._c.jours_ouvert !== "" && (e._c.jours_ouvert < debut || e._c.jours_ouvert > fin));
    if (!dedans.length || !dehors.length) return { tranches, fenetre: null };
    return {
      tranches,
      fenetre: {
        debut, fin,
        dedans: moyenne(dedans.map(e => Number(e.note_sur_10))),
        dehors: moyenne(dehors.map(e => Number(e.note_sur_10))),
      },
    };
  }

  /* La boutique du Guide, retrouvée par le torréfacteur : les liens vivent dans
     l'écran Guide, rangés par maison. Rien si le torréfacteur n'y est pas. */
  function lienBoutique(cafe) {
    const t = String(cafe.torrefacteur || "").trim().toLowerCase();
    if (!t) return null;
    const titres = Array.from(document.querySelectorAll(".boutique h3"));
    const h = titres.find(x => {
      const nom = (x.firstChild && x.firstChild.nodeValue ? x.firstChild.nodeValue : x.textContent).trim().toLowerCase();
      return nom && (nom.startsWith(t) || t.startsWith(nom));
    });
    const a = h && h.querySelector("a[href]");
    return a ? a.getAttribute("href") : null;
  }

  function blocSachet(cafe, exts, notees, moyCafe) {
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const dose = doses.length ? moyenne(doses) : replis.dose;
    const stock = DATA.stockSachet(cafe.id, replis.dose);
    const jc = jourCourant(cafe.id);
    const f = fenetre(notees, moyCafe);
    let html = '<section class="fc-bloc fc-sachet"><h3 class="fc-h">' + I18N.t("fi_sachet") + "</h3>";
    if (stock) {
      const reste = Math.max(0, stock.restant);
      const tasses = Math.floor(reste / dose);
      const pc = Math.max(0, Math.min(100, (reste / stock.format) * 100));
      html += '<div class="fc-jauge" role="img" aria-label="' + echap(I18N.t("fi_jauge", { r: fmtDecimal(reste, 0), f: stock.format })) +
        '"><i style="width:' + pc.toFixed(1) + '%"></i></div>' +
        '<div class="fc-ligne"><span><b>' + fmtDecimal(reste, 0) + " g</b> " + I18N.t("fi_sur", { f: stock.format }) + "</span>" +
        "<span>" + (stock.restant <= 0 ? I18N.t("stock_vide") : I18N.t("fi_tasses", { n: tasses })) + "</span></div>";
      if (tasses <= REACHAT_TASSES) {
        const lien = lienBoutique(cafe);
        html += '<p class="fc-reachat">' + I18N.t("fi_reachat") +
          (lien ? ' <a href="' + echap(lien) + '" target="_blank" rel="noopener">' +
            I18N.t("fi_boutique", { t: echap(cafe.torrefacteur) }) + "</a>" : "") + "</p>";
      }
    } else {
      html += '<p class="fc-muet">' + I18N.t("fi_sans_stock") + "</p>";
    }
    // Supprimer le sachet en cours, saisi par erreur (v8.77) : la fonction existait sans bouton.
    const sachet = DATA.sachetCourant(cafe.id);
    if (sachet) html += '<button type="button" class="btn btn-petit btn-discret fc-suppr-sachet" data-suppr-sachet="' + echap(sachet.id) + '">' + I18N.t("fi_suppr_sachet") + "</button>";

    // La réglette de fraîcheur : jour 1 à gauche, la fenêtre en accent, aujourd'hui en trait.
    const max = Math.max(28, ...notees.map(e => e._c.jours_ouvert === "" ? 0 : e._c.jours_ouvert), jc ? jc.jour : 0);
    const x = j => Math.max(0, Math.min(100, (j / max) * 100));
    if (f.fenetre || jc) {
      html += '<div class="fc-fraicheur" aria-hidden="true">' +
        (f.fenetre ? '<span class="fc-fenetre" style="left:' + x(f.fenetre.debut).toFixed(1) + "%;width:" +
          (x(Math.min(f.fenetre.fin, max)) - x(f.fenetre.debut)).toFixed(1) + '%"></span>' : "") +
        (jc ? '<span class="fc-aujourdhui" style="left:' + x(jc.jour).toFixed(1) + '%"></span>' : "") + "</div>" +
        '<div class="fc-leg"><span>' + I18N.t("fi_jour", { n: 1 }) + "</span>" +
        (f.fenetre ? "<span>" + I18N.t("fi_fenetre_leg", { a: f.fenetre.debut + 1, b: Math.min(f.fenetre.fin, max) + 1 }) + "</span>" : "") +
        "<span>" + I18N.t("fi_jour", { n: max + 1 }) + "</span></div>";
    }
    const phrases = [];
    if (jc) phrases.push(I18N.t("fi_ouvert", { n: jc.jour + 1, d: jourCourt(jc.ouverture) }));
    if (f.fenetre) {
      phrases.push(I18N.t("fi_fenetre", {
        a: f.fenetre.debut + 1, b: Math.min(f.fenetre.fin, max) + 1, x: note1(f.fenetre.dedans), y: note1(f.fenetre.dehors),
      }));
      if (jc) {
        const cle = jc.jour < f.fenetre.debut ? "fi_avant" : jc.jour > f.fenetre.fin ? "fi_apres"
          : jc.jour === f.fenetre.fin ? "fi_dedans_bord" : "fi_dedans";
        phrases.push(I18N.t(cle, { n: Math.abs((jc.jour < f.fenetre.debut ? f.fenetre.debut : f.fenetre.fin) - jc.jour) }));
      }
    } else if (notees.some(e => e._c.jours_ouvert !== "")) {
      phrases.push(I18N.t("fi_pas_de_fenetre", { n: MIN_TRANCHE }));
    }
    if (phrases.length) html += '<p class="fc-texte">' + phrases.join(" ") + "</p>";
    return { html: html + "</section>", fenetre: f, max, jc };
  }

  /* La courbe : chaque tasse en point, la moyenne de chaque tranche en ligne,
     la fenêtre en fond. Même échelle de notes que partout, de 0 à 10. */
  function blocCourbe(notees, f, max, jc) {
    const points = notees.filter(e => e._c.jours_ouvert !== "");
    let html = '<section class="fc-bloc fc-courbe"><h3 class="fc-h">' + I18N.t("fi_courbe") + "</h3>";
    if (points.length < 2) return html + '<p class="fc-muet">' + I18N.t("fi_courbe_vide") + "</p></section>";
    const G = 30, D = 312, H = 12, B = 132, L = 320;
    const x = j => G + (Math.min(j, max) / max) * (D - G);
    const y = n => B - (n / 10) * (B - H);
    let svg = "";
    if (f.fenetre) {
      svg += '<rect x="' + x(f.fenetre.debut).toFixed(1) + '" y="' + H + '" width="' +
        (x(Math.min(f.fenetre.fin, max)) - x(f.fenetre.debut)).toFixed(1) + '" height="' + (B - H) + '" class="fc-c-fenetre"></rect>';
    }
    [0, 5, 10].forEach(n => {
      svg += '<line x1="' + G + '" y1="' + y(n) + '" x2="' + D + '" y2="' + y(n) + '" class="fc-c-grille"></line>' +
        '<text x="' + (G - 6) + '" y="' + (y(n) + 3) + '" text-anchor="end">' + n + "</text>";
    });
    points.forEach(e => {
      svg += '<circle cx="' + x(e._c.jours_ouvert).toFixed(1) + '" cy="' + y(Number(e.note_sur_10)).toFixed(1) +
        '" r="3" class="fc-c-point" data-tasse="' + echap(e.id) + '"><title>' + echap(jourCourt(e.date_heure) + " : " + note1(Number(e.note_sur_10))) + "</title></circle>";
    });
    const moyens = f.tranches.filter(t => t.n > 0 && t.a <= max)
      .map(t => [x((t.a + Math.min(t.b, max)) / 2), y(t.moy)]);
    if (moyens.length > 1) {
      svg += '<path d="M' + moyens.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + '" class="fc-c-ligne"></path>';
    }
    if (jc && jc.jour <= max) {
      svg += '<line x1="' + x(jc.jour) + '" y1="' + H + '" x2="' + x(jc.jour) + '" y2="' + B + '" class="fc-c-auj"></line>';
    }
    svg += '<text x="' + G + '" y="' + (B + 16) + '">' + I18N.t("fi_jour", { n: 1 }) + "</text>" +
      '<text x="' + D + '" y="' + (B + 16) + '" text-anchor="end">' + I18N.t("fi_jour", { n: max + 1 }) + "</text>";
    return html + '<svg class="fc-svg" viewBox="0 0 ' + L + ' 152" role="img" aria-label="' +
      echap(I18N.t("fi_courbe_aria", { n: points.length })) + '">' + svg + "</svg></section>";
  }

  function blocDernieres(exts) {
    const dernieres = exts.slice().sort((a, b) => String(b.date_heure).localeCompare(String(a.date_heure))).slice(0, 5);
    return '<section class="fc-bloc fc-dernieres"><h3 class="fc-h">' + I18N.t("fi_dernieres") + "</h3>" +
      '<ol class="fc-liste">' + dernieres.map(e =>
        '<li><span class="fc-date">' + jourCourt(e.date_heure) + '</span><span class="fc-quoi">' +
        '<span class="pastille-methode ' + String(e.methode || "").toLowerCase() + '"></span>' + echap(I18N.tr(e.recette || "")) +
        (e.mouture_dial ? " · " + echap(e.mouture_dial) : "") + "</span><b>" +
        (e.note_sur_10 === "" ? "·" : note1(Number(e.note_sur_10))) + "</b></li>").join("") + "</ol></section>";
  }

  function rendreFiche() {
    const cafe = DATA.state.cafes.find(c => c.id === ficheId);
    const zone = $("#fiche-contenu");
    if (!cafe || !zone) return;
    // Ce qui s'est passé (dernières tasses, stock) contre ce qui conseille
    // (moyennes, fenêtre, réglage) : la même règle que le tableau de bord.
    const exts = extAvecCalculs().filter(e => e.cafe_id === cafe.id);
    const notees = extAnalysables().filter(e => e.cafe_id === cafe.id && e.note_sur_10 !== "");
    const moyCafe = notees.length ? moyenne(notees.map(e => Number(e.note_sur_10))) : 0;
    const machines = {};
    exts.forEach(e => { if (e.methode) machines[e.methode] = (machines[e.methode] || 0) + 1; });
    const machine = Object.entries(machines).sort((a, b) => b[1] - a[1])[0];
    const pct = Number(cafe.pourcentage_cafe_reel);
    const chips = [
      cafe.torrefacteur, cafe.origine, [cafe.espece, cafe.procede].filter(Boolean).join(" · "), cafe.torrefaction,
    ].filter(Boolean).map(t => '<span class="fc-chip">' + echap(t) + "</span>").join("") +
      (pct > 0 && pct < 100 ? '<span class="fc-chip fc-chip-alerte">' + pct + " % " + I18N.t("pct_cafe") + "</span>" : "") +
      (machine ? '<span class="fc-chip"><span class="pastille-methode ' + machine[0].toLowerCase() + '"></span>' +
        I18N.t("fi_surtout", { m: I18N.machine(machine[0]) }) + "</span>" : "");

    const sachet = blocSachet(cafe, exts, notees, moyCafe);
    const bilan = REGLAGES.pourCafe(cafe.id, extAnalysables());
    zone.innerHTML =
      '<header class="fc-tete"><div><p class="surligne">' + I18N.t("fi_surligne") + "</p>" +
      '<h2 id="fiche-nom">' + echap(cafe.nom) + "</h2>" + '<div class="fc-chips">' + chips + "</div></div>" +
      '<div class="fc-note">' + (notees.length
        ? "<b>" + note1(moyCafe) + "</b><span>" + I18N.t("fi_moyenne", { n: notees.length }) + "</span>"
        : "<span>" + I18N.t("fi_pas_notee") + "</span>") + "</div></header>" +
      '<div class="fc-grille">' + sachet.html + blocCourbe(notees, sachet.fenetre, sachet.max, sachet.jc) +
      '<section class="fc-bloc fc-gouts"><h3 class="fc-h">' + I18N.t("fi_gouts") + "</h3>" +
      '<div class="fc-roue"><svg id="fiche-roue" class="roue" viewBox="0 0 300 300" role="img" aria-label="' +
      echap(I18N.t("fi_roue_aria")) + '"></svg><div class="roue-detail" id="fiche-roue-detail" aria-live="polite"></div></div>' +
      '<p class="fc-muet" id="fiche-roue-vide" hidden>' + I18N.t("fi_gouts_vide") + "</p></section>" +
      '<section class="fc-bloc fc-reglage"><h3 class="fc-h">' + I18N.t("fi_reglage") + "</h3>" +
      UI.carteReglage({ cafe, ...bilan }) + "</section>" +
      /* Les dessins de ce café (v8.50), rendus par js/ui-dessins.js. */
      '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_empreinte") + "</h3>" +
      '<svg id="fiche-empreinte" class="fc-dessin" viewBox="0 0 320 210" role="img" aria-label="' + echap(I18N.t("fi_empreinte")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-empreinte-lecture"></p></section>' +
      '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_trajectoire") + "</h3>" +
      '<svg id="fiche-trajectoire" class="fc-dessin" viewBox="0 0 320 172" role="img" aria-label="' + echap(I18N.t("fi_trajectoire")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-trajectoire-lecture"></p></section>' +
      '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_moulin") + "</h3>" +
      '<svg id="fiche-moulin" class="fc-dessin" viewBox="0 0 320 126" role="img" aria-label="' + echap(I18N.t("fi_moulin")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-moulin-lecture"></p></section>' +
      blocDernieres(exts) + blocComparer(cafe) + "</div>";
    UI.dessinerEmpreinte("fiche-empreinte", cafe.id);
    UI.dessinerTrajectoire("fiche-trajectoire", cafe.id);
    UI.dessinerMoulin("fiche-moulin", cafe.id);
    rendreComparaison();
    const nbGouts = CHARTS.roueAromes(notees, { svg: "fiche-roue", detail: "fiche-roue-detail", lecture: "" });
    $("#fiche-roue-vide").hidden = nbGouts > 0;
    $(".fc-roue").hidden = nbGouts === 0;
  }

  /* DEUX CAFÉS CÔTE À CÔTE (v8.56). « Comparer avec… » en pied de fiche : les deux
     empreintes superposées, et face à face ce qui aide à choisir quoi racheter,
     leur moyenne, leur machine, leur meilleur réglage, leur fenêtre de fraîcheur,
     leur coût par tasse et le goût qui revient. Tout vient des mêmes calculs que
     le reste de la fiche. */
  function blocComparer(cafe) {
    const autres = DATA.state.cafes.filter(c => c.id !== cafe.id && DATA.state.extractions.some(e => e.cafe_id === c.id));
    if (!autres.length) return "";
    return '<section class="fc-bloc fc-comparer"><div class="fc-comparer-tete"><h3 class="fc-h">' + I18N.t("fi_comparer") + "</h3>" +
      '<select id="fiche-comparer" aria-label="' + echap(I18N.t("fi_comparer")) + '"><option value="">' + echap(I18N.t("fi_comparer_choisir")) + "</option>" +
      autres.map(c => '<option value="' + echap(c.id) + '"' + (c.id === compareId ? " selected" : "") + ">" + echap(c.nom) + "</option>").join("") +
      '</select></div><div id="fiche-comparaison"></div></section>';
  }
  function resumeCafe(c) {
    const notees = extAnalysables().filter(e => e.cafe_id === c.id && e.note_sur_10 !== "");
    const exts = extAvecCalculs().filter(e => e.cafe_id === c.id);
    const moy = notees.length ? moyenne(notees.map(e => Number(e.note_sur_10))) : null;
    const machines = {};
    exts.forEach(e => { if (e.methode) machines[e.methode] = (machines[e.methode] || 0) + 1; });
    const machine = Object.keys(machines).sort((a, b) => machines[b] - machines[a])[0];
    const bilan = REGLAGES.pourCafe(c.id, extAnalysables());
    const m = bilan.meilleure;
    const f = fenetre(notees, moy || 0).fenetre;
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const tags = {};
    notees.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
    const gout = Object.keys(tags).sort((a, b) => tags[b] - tags[a])[0];
    return [
      moy === null ? I18N.t("fi_pas_notee") : I18N.t("fi_cmp_moyenne", { m: note1(moy), n: notees.length }),
      machine ? I18N.machine(machine) : "·",
      m ? [I18N.tr(m.recette || ""), m.mouture || ""].filter(Boolean).join(" · ") + ", " + note1(m.moyenne) : I18N.t("fi_cmp_pas_de_reglage"),
      f ? I18N.t("fi_cmp_jours", { a: f.debut + 1, b: f.fin + 1 }) : I18N.t("fi_cmp_pas_de_fenetre"),
      UI.coutParTasse(c, doses.length ? moyenne(doses) : replis.dose) || "·",
      gout ? I18N.tag(gout) : "·",
    ];
  }
  function rendreComparaison() {
    const zone = $("#fiche-comparaison");
    if (!zone) return;
    const a = DATA.state.cafes.find(c => c.id === ficheId), b = DATA.state.cafes.find(c => c.id === compareId);
    if (!a || !b) { zone.innerHTML = ""; return; }
    const ra = resumeCafe(a), rb = resumeCafe(b);
    const lignes = ["fi_cmp_note", "fi_cmp_machine", "fi_cmp_reglage", "fi_cmp_fenetre", "fi_cmp_cout", "fi_cmp_gout"];
    zone.innerHTML = '<div class="fc-comparer-corps"><div>' +
      '<svg id="fiche-duo" class="fc-dessin" viewBox="0 0 320 210" role="img" aria-label="' + echap(I18N.t("fi_duo_aria", { a: a.nom, b: b.nom })) + '"></svg>' +
      '<div class="fc-duo-leg"><span><i class="fc-duo-a"></i>' + echap(a.nom) + '</span><span><i class="fc-duo-b"></i>' + echap(b.nom) + "</span></div>" +
      '<p class="fc-texte" id="fiche-duo-lecture"></p></div>' +
      '<table class="fc-duo-table"><thead><tr><th></th><th>' + echap(a.nom) + "</th><th>" + echap(b.nom) + "</th></tr></thead><tbody>" +
      lignes.map((cle, i) => "<tr><th>" + echap(I18N.t(cle)) + "</th><td>" + echap(ra[i]) + "</td><td>" + echap(rb[i]) + "</td></tr>").join("") +
      "</tbody></table></div>";
    UI.dessinerEmpreinte("fiche-duo", a.id, b.id);
  }

  function ouvrirFiche(cafeId) {
    if (!DATA.state.cafes.some(c => c.id === cafeId)) return;
    if (cafeId !== ficheId) compareId = "";
    ficheId = cafeId;
    rendreFiche();
    const m = $("#modale-fiche");
    if (!m.open) m.showModal();
    const haut = $("#fiche-contenu");
    if (haut) haut.scrollTop = 0;
  }

  // Re-rendue quand les données ou la langue changent, si elle est ouverte.
  function rendreFicheOuverte() {
    const m = $("#modale-fiche");
    if (m && m.open) rendreFiche();
  }

  function cablerFiche() {
    $("#fiche-contenu").addEventListener("click", async ev => {
      const b = ev.target.closest("[data-suppr-sachet]");
      if (!b) return;
      const a = DATA.state.achats.find(x => x.id === b.dataset.supprSachet);
      if (!a || !await UI.confirmer(I18N.t("c_suppr_sachet", { d: a.date_achat || "?" }), { danger: true })) return;
      await DATA.supprimerAchat(a.id);
      UI.toast(I18N.t("t_sachet_supprime"));
    });
    $("#fiche-brasser").addEventListener("click", () => {
      const id = ficheId;
      $("#modale-fiche").close();
      UI.reinitialiserSaisie();
      const sel = $("#f-cafe");
      sel.value = id;
      if (sel.value === id) UI.surChoixCafe();
      else toast(I18N.t("fi_inactif"));
      // Sans édition en cours (reinitialiserSaisie vient de la fermer) : rien à abandonner.
      UI.activerEcran("saisie");
    });
    $("#fiche-modifier").addEventListener("click", () => {
      const id = ficheId;
      $("#modale-fiche").close();
      UI.ouvrirModaleCafes();
      UI.ouvrirFormCafe(id);
    });
    $("#fiche-contenu").addEventListener("change", ev => {
      if (ev.target.id !== "fiche-comparer") return;
      compareId = ev.target.value;
      rendreComparaison();
    });
    // Le bouton « Refaire » de la carte du meilleur réglage, rendue dans la fiche.
    $("#fiche-contenu").addEventListener("click", ev => {
      const b = ev.target.closest("[data-refaire]");
      if (!b) return;
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.refaire);
      if (!ext) return;
      $("#modale-fiche").close();
      UI.refaireTasse(ext);
      toast(I18N.t("rg_preremplie"));
    });
    // Délégué sur le document : les boutons « Fiche » naissent avec leurs listes.
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-fiche]");
      if (b) ouvrirFiche(b.dataset.fiche);
    });
    DATA.abonner(rendreFicheOuverte);
  }

  // Sous des noms qui disent ce qu'ils sont hors de ce fichier : l'étagère du tableau de bord s'en sert.
  const fenetreFraicheur = fenetre, jourSachet = jourCourant, TRANCHES_SACHET = TRANCHES;
  Object.assign(UI, { cablerFiche, fenetreFraicheur, jourSachet, ouvrirFiche, rendreFicheOuverte, TRANCHES_SACHET });
})();
