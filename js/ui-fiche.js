/* The COFFEE CARD (v8.46): everything the logbook knows about a coffee, in
 * one place.
 *
 * Before it, this was scattered: the bag and its stock in « Mes cafés », the
 * best setting in « Mes meilleurs réglages », the tastes in the history, the
 * freshness in the entry form column. And nothing showed how a coffee
 * evolves over the life of its bag.
 *
 * Freshness starts from the bag's OPENING DATE, not the roast date: Chris's
 * bags almost never carry one. Each cup therefore has its day of the bag
 * (DATA.calcs, jours_ouvert), and the WINDOW is learned from its ratings:
 * the day bands where the cups of THIS coffee beat its average, from
 * MIN_PER_BAND cups per band. As long as there are not enough, the card
 * shows the curve without a window, and says so.
 *
 * Opens from « Mes meilleurs réglages » and « Mes cafés », in a dialog on
 * the page. No new data: everything is already entered. */
"use strict";

(() => {

  const { $, analyzableExts, extsWithCalcs, fmtDecimal, average, fallbacks, toast } = UI;

  /* The day bands of the bag, in days since opening (0 = the day itself).
     Tight at the start, where the coffee moves the most, then wider. */
  const BANDS = [[0, 3], [4, 7], [8, 11], [12, 15], [16, 21], [22, 28], [29, 60]];
  const MIN_PER_BAND = 3;
  const REORDER_CUPS = 3;
  let openId = null;
  // L4: the open tab, and whether opening pushed an entry into the browser history.
  let sheetTab = "reglage";
  let historyEntry = false;
  // True when the card closes to open another screen: the history entry then becomes that screen's.
  let closingToNavigate = false;
  // The coffee on the other side in « Comparer avec… » (v8.56), reset on each card.
  let compareId = "";

  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);

  function localDate(s) {
    const [a, m, j] = String(s).slice(0, 10).split("-").map(Number);
    return a && m && j ? new Date(a, m - 1, j) : null;
  }
  function shortDay(s) {
    const d = localDate(s);
    return d ? d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) : "";
  }

  /* The day of the CURRENT bag, counted like the cups: 0 on the opening
     day. Null without an open bag. */
  function currentBagDay(coffeeId) {
    const s = DATA.currentBag(coffeeId);
    if (!s || !s.date_ouverture) return null;
    const d = localDate(s.date_ouverture);
    if (!d) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { day: Math.max(0, Math.round((today - d) / 86400000)), openedOn: s.date_ouverture };
  }

  /* THE LEARNED WINDOW. The bands with enough cups; among them, those above
     the coffee's average. The window runs from the first good one to the
     last good one: an isolated dip in the middle of a good bag is noise, not
     a closing. At least two documented bands are needed, otherwise there is
     nothing to compare. */
  function learnWindow(rated, coffeeAvg) {
    const bands = BANDS.map(([a, b]) => {
      const ratings = rated.filter(e => e._c.jours_ouvert !== "" && e._c.jours_ouvert >= a && e._c.jours_ouvert <= b)
        .map(e => Number(e.note_sur_10));
      return { a, b, n: ratings.length, mean: ratings.length ? average(ratings) : null };
    });
    const documented = bands.filter(t => t.n >= MIN_PER_BAND);
    if (documented.length < 2) return { bands: bands, sweetSpot: null };
    const good = documented.filter(t => t.mean >= coffeeAvg);
    if (!good.length || good.length === documented.length) return { bands: bands, sweetSpot: null };
    /* The end stops at the last day a cup documents: the last band runs to
       day 60, and announcing « encore 19 jours » on days nobody tasted would
       be making it up. */
    const days = rated.filter(e => e._c.jours_ouvert !== "").map(e => e._c.jours_ouvert);
    const start = good[0].a, end = Math.min(good[good.length - 1].b, Math.max(...days));
    const inside = rated.filter(e => e._c.jours_ouvert !== "" && e._c.jours_ouvert >= start && e._c.jours_ouvert <= end);
    const outside = rated.filter(e => e._c.jours_ouvert !== "" && (e._c.jours_ouvert < start || e._c.jours_ouvert > end));
    if (!inside.length || !outside.length) return { bands: bands, sweetSpot: null };
    return {
      bands: bands,
      sweetSpot: {
        start: start, end: end,
        inside: average(inside.map(e => Number(e.note_sur_10))),
        outside: average(outside.map(e => Number(e.note_sur_10))),
      },
    };
  }

  /* The Guide shop, found by roaster: the links live in the Guide screen,
     sorted by house. Nothing if the roaster is not there. */
  function shopLink(coffee) {
    const t = String(coffee.torrefacteur || "").trim().toLowerCase();
    if (!t) return null;
    const headings = Array.from(document.querySelectorAll(".boutique h3"));
    const h = headings.find(x => {
      const name = (x.firstChild && x.firstChild.nodeValue ? x.firstChild.nodeValue : x.textContent).trim().toLowerCase();
      return name && (name.startsWith(t) || t.startsWith(name));
    });
    const a = h && h.querySelector("a[href]");
    return a ? a.getAttribute("href") : null;
  }

  /* The coffee bean in the jar: an ellipse and its slit, in outline. */
  const BEAN_SVG = '<svg class="fc-grain" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="6.2" ry="8.8" transform="rotate(32 12 12)"/>' +
    '<path d="M8.6 6.2c2.6 2.2 1.2 4.6 3.4 6.6s3.2 2.4 3.4 5"/></svg>';

  /* MANUAL COUNT (v8.96): one field, prefilled with the computed stock.
     Hidden until the jar or « Corriger » has been clicked. */
  function stockEditor(stock) {
    // A negative stock is wrong: an empty field rather than a 0 to erase, the bag size as a hint.
    const current = stock && stock.remaining > 0 ? Math.round(stock.remaining) : "";
    const hint = stock ? stock.format : 250;
    return '<form class="fc-stock-edition" id="fc-stock-edition" hidden>' +
      '<label for="fc-stock-g">' + I18N.t("fi_stock_label") + "</label>" +
      '<div class="fc-stock-ligne">' +
        '<input type="number" id="fc-stock-g" min="0" max="5000" step="1" inputmode="decimal" value="' + current +
          '" placeholder="' + hint + '">' +
        "<span>g</span>" +
        '<button type="submit" class="btn btn-petit btn-primaire">' + I18N.t("fi_stock_enregistrer") + "</button>" +
        '<button type="button" class="btn btn-petit btn-discret" data-stock-annuler>' + I18N.t("fi_stock_annuler") + "</button>" +
      "</div>" +
      '<p class="fc-muet">' + I18N.t("fi_stock_aide") + "</p></form>";
  }

  function bagBlock(coffee, exts, rated, coffeeAvg) {
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const dose = doses.length ? average(doses) : fallbacks.dose;
    const stock = DATA.bagStock(coffee.id, fallbacks.dose);
    const jc = currentBagDay(coffee.id);
    const f = learnWindow(rated, coffeeAvg);
    let html = '<section class="fc-bloc fc-sachet"><h3 class="fc-h">' + I18N.t("fi_sachet") + "</h3>";
    if (stock) {
      const left = Math.max(0, stock.remaining);
      const cups = Math.floor(left / dose);
      const pc = Math.max(0, Math.min(100, (left / stock.format) * 100));
      html += '<div class="fc-jauge" role="img" aria-label="' + escapeHtml(I18N.t("fi_jauge", { r: fmtDecimal(left, 0), f: stock.format })) +
        '"><i style="width:' + pc.toFixed(1) + '%"></i></div>' +
        '<div class="fc-ligne"><span><b>' + fmtDecimal(left, 0) + " g</b> " + I18N.t("fi_sur", { f: stock.format }) +
          ' <button type="button" class="fc-corriger" data-stock-edit>' + I18N.t("fi_stock_corriger") + "</button></span>" +
        "<span>" + (stock.remaining <= 0 ? I18N.t("stock_vide") : I18N.t("fi_tasses", { n: cups })) + "</span></div>" +
        (stock.corrected ? '<p class="fc-muet">' + I18N.t("fi_stock_compte", {
          d: new Date(stock.corrected).toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" }) }) + "</p>" : "");
      if (cups <= REORDER_CUPS) {
        const link = shopLink(coffee);
        html += '<p class="fc-reachat">' + I18N.t("fi_reachat") +
          (link ? ' <a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' +
            I18N.t("fi_boutique", { t: escapeHtml(coffee.torrefacteur) }) + "</a>" : "") + "</p>";
      }
    } else {
      html += '<p class="fc-muet">' + I18N.t("fi_sans_stock") +
        ' <button type="button" class="fc-corriger" data-stock-edit>' + I18N.t("fi_stock_saisir") + "</button></p>";
    }
    // Delete the current bag, entered by mistake (v8.77): the function existed without a button.
    const bag = DATA.currentBag(coffee.id);
    if (bag) html += '<button type="button" class="btn btn-petit btn-discret fc-suppr-sachet" data-suppr-sachet="' + escapeHtml(bag.id) + '">' + I18N.t("fi_suppr_sachet") + "</button>";

    // The freshness ruler: day 1 on the left, the window in accent, today as a line.
    const max = Math.max(28, ...rated.map(e => e._c.jours_ouvert === "" ? 0 : e._c.jours_ouvert), jc ? jc.day : 0);
    const x = j => Math.max(0, Math.min(100, (j / max) * 100));
    if (f.sweetSpot || jc) {
      html += '<div class="fc-fraicheur" aria-hidden="true">' +
        (f.sweetSpot ? '<span class="fc-fenetre" style="left:' + x(f.sweetSpot.start).toFixed(1) + "%;width:" +
          (x(Math.min(f.sweetSpot.end, max)) - x(f.sweetSpot.start)).toFixed(1) + '%"></span>' : "") +
        (jc ? '<span class="fc-aujourdhui" style="left:' + x(jc.day).toFixed(1) + '%"></span>' : "") + "</div>" +
        '<div class="fc-leg"><span>' + I18N.t("fi_jour", { n: 1 }) + "</span>" +
        (f.sweetSpot ? "<span>" + I18N.t("fi_fenetre_leg", { a: f.sweetSpot.start + 1, b: Math.min(f.sweetSpot.end, max) + 1 }) + "</span>" : "") +
        "<span>" + I18N.t("fi_jour", { n: max + 1 }) + "</span></div>";
    }
    const sentences = [];
    if (jc) sentences.push(I18N.t("fi_ouvert", { n: jc.day + 1, d: shortDay(jc.openedOn) }));
    if (f.sweetSpot) {
      sentences.push(I18N.t("fi_fenetre", {
        a: f.sweetSpot.start + 1, b: Math.min(f.sweetSpot.end, max) + 1, x: fmtRating(f.sweetSpot.inside), y: fmtRating(f.sweetSpot.outside),
      }));
      if (jc) {
        const key = jc.day < f.sweetSpot.start ? "fi_avant" : jc.day > f.sweetSpot.end ? "fi_apres"
          : jc.day === f.sweetSpot.end ? "fi_dedans_bord" : "fi_dedans";
        sentences.push(I18N.t(key, { n: Math.abs((jc.day < f.sweetSpot.start ? f.sweetSpot.start : f.sweetSpot.end) - jc.day) }));
      }
    } else if (rated.some(e => e._c.jours_ouvert !== "")) {
      sentences.push(I18N.t("fi_pas_de_fenetre", { n: MIN_PER_BAND }));
    }
    if (sentences.length) html += '<p class="fc-texte">' + sentences.join(" ") + "</p>";
    return { html: html + "</section>", sweetSpot: f, max, jc };
  }

  /* The curve: each cup as a dot, each band's average as a line, the window
     as background. Same rating scale as everywhere, from 0 to 10. */
  function curveBlock(rated, f, max, jc) {
    const points = rated.filter(e => e._c.jours_ouvert !== "");
    let html = '<section class="fc-bloc fc-courbe"><h3 class="fc-h">' + I18N.t("fi_courbe") + "</h3>";
    if (points.length < 2) return html + '<p class="fc-muet">' + I18N.t("fi_courbe_vide") + "</p></section>";
    const G = 30, D = 312, H = 12, B = 132, L = 320;
    const x = j => G + (Math.min(j, max) / max) * (D - G);
    const y = n => B - (n / 10) * (B - H);
    let svg = "";
    if (f.sweetSpot) {
      svg += '<rect x="' + x(f.sweetSpot.start).toFixed(1) + '" y="' + H + '" width="' +
        (x(Math.min(f.sweetSpot.end, max)) - x(f.sweetSpot.start)).toFixed(1) + '" height="' + (B - H) + '" class="fc-c-fenetre"></rect>';
    }
    [0, 5, 10].forEach(n => {
      svg += '<line x1="' + G + '" y1="' + y(n) + '" x2="' + D + '" y2="' + y(n) + '" class="fc-c-grille"></line>' +
        '<text x="' + (G - 6) + '" y="' + (y(n) + 3) + '" text-anchor="end">' + n + "</text>";
    });
    points.forEach(e => {
      svg += '<circle cx="' + x(e._c.jours_ouvert).toFixed(1) + '" cy="' + y(Number(e.note_sur_10)).toFixed(1) +
        '" r="3" class="fc-c-point" data-tasse="' + escapeHtml(e.id) + '"><title>' + escapeHtml(shortDay(e.date_heure) + " : " + fmtRating(Number(e.note_sur_10))) + "</title></circle>";
    });
    const bandAverages = f.bands.filter(t => t.n > 0 && t.a <= max)
      .map(t => [x((t.a + Math.min(t.b, max)) / 2), y(t.mean)]);
    if (bandAverages.length > 1) {
      svg += '<path d="M' + bandAverages.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") + '" class="fc-c-ligne"></path>';
    }
    if (jc && jc.day <= max) {
      svg += '<line x1="' + x(jc.day) + '" y1="' + H + '" x2="' + x(jc.day) + '" y2="' + B + '" class="fc-c-auj"></line>';
    }
    svg += '<text x="' + G + '" y="' + (B + 16) + '">' + I18N.t("fi_jour", { n: 1 }) + "</text>" +
      '<text x="' + D + '" y="' + (B + 16) + '" text-anchor="end">' + I18N.t("fi_jour", { n: max + 1 }) + "</text>";
    return html + '<svg class="fc-svg" viewBox="0 0 ' + L + ' 152" role="img" aria-label="' +
      escapeHtml(I18N.t("fi_courbe_aria", { n: points.length })) + '">' + svg + "</svg></section>";
  }

  function latestBlock(exts) {
    const latest = exts.slice().sort((a, b) => String(b.date_heure).localeCompare(String(a.date_heure))).slice(0, 5);
    return '<section class="fc-bloc fc-dernieres"><h3 class="fc-h">' + I18N.t("fi_dernieres") + "</h3>" +
      '<ol class="fc-liste">' + latest.map(e =>
        '<li><span class="fc-date">' + shortDay(e.date_heure) + '</span><span class="fc-quoi">' +
        '<span class="pastille-methode ' + String(e.methode || "").toLowerCase() + '"></span>' + escapeHtml(I18N.tr(e.recette || "")) +
        (e.mouture_dial ? " · " + escapeHtml(e.mouture_dial) : "") + "</span><b>" +
        (e.note_sur_10 === "" ? "·" : fmtRating(Number(e.note_sur_10))) + "</b></li>").join("") + "</ol></section>";
  }

  function renderSheet() {
    const coffee = DATA.state.cafes.find(c => c.id === openId);
    const zone = $("#fiche-contenu");
    if (!coffee || !zone) return;
    // What happened (latest cups, stock) versus what advises
    // (averages, window, setting): the same rule as the dashboard.
    const exts = extsWithCalcs().filter(e => e.cafe_id === coffee.id);
    const rated = analyzableExts().filter(e => e.cafe_id === coffee.id && e.note_sur_10 !== "");
    const coffeeAvg = rated.length ? average(rated.map(e => Number(e.note_sur_10))) : 0;
    const machines = {};
    exts.forEach(e => { if (e.methode) machines[e.methode] = (machines[e.methode] || 0) + 1; });
    const machine = Object.entries(machines).sort((a, b) => b[1] - a[1])[0];
    const pct = Number(coffee.pourcentage_cafe_reel);
    const chips = [
      coffee.torrefacteur, coffee.origine, [coffee.espece, coffee.procede].filter(Boolean).join(" · "), coffee.torrefaction,
    ].filter(Boolean).map(t => '<span class="fc-chip">' + escapeHtml(t) + "</span>").join("") +
      (pct > 0 && pct < 100 ? '<span class="fc-chip fc-chip-alerte">' + pct + " % " + I18N.t("pct_cafe") + "</span>" : "") +
      (machine ? '<span class="fc-chip"><span class="pastille-methode ' + machine[0].toLowerCase() + '"></span>' +
        I18N.t("fi_surtout", { m: I18N.machine(machine[0]) }) + "</span>" : "");

    const bag = bagBlock(coffee, exts, rated, coffeeAvg);
    const report = TUNING.forCoffee(coffee.id, analyzableExts());
    /* L4 (v8.92): THE CARD, A PASSPORT. Nine blocks stacked one under another
       made 2,750 px on the phone. At the top, who this coffee is: its jar at
       the bag's level, its shade by roast, and four figures. Below, four
       tabs: how you nail it, what it gives you, its bags, its cups. */
    const stock = DATA.bagStock(coffee.id, fallbacks.dose);
    const level = stock ? Math.max(0, Math.min(100, (stock.remaining / stock.format) * 100)) : 60;
    const roast = String(coffee.torrefaction || "").toLowerCase();
    const tint = /clair|light|blond/.test(roast) ? "#c48a4d" : /fonc|dark|brun/.test(roast) ? "#5a3219" : "#8f5a33";
    const best = rated.length ? Math.max(...rated.map(e => Number(e.note_sur_10))) : null;
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const cost = UI.costPerCup(coffee, doses.length ? average(doses) : fallbacks.dose);
    const kpi = (v, l) => '<div class="fc-kpi"><b>' + v + "</b><span>" + l + "</span></div>";
    const TABS = [["reglage", "fi_o_reglage"], ["gouts", "fi_o_gouts"], ["sachets", "fi_o_sachets"], ["tasses", "fi_o_tasses"]];
    if (!TABS.some(([k]) => k === sheetTab)) sheetTab = "reglage";
    const panel = (key, html) => '<div class="fc-panneau" role="tabpanel" id="fc-p-' + key + '" aria-labelledby="fc-o-' + key + '"' +
      (key === sheetTab ? "" : " hidden") + '><div class="fc-grille">' + html + "</div></div>";
    const tastesBlock = '<section class="fc-bloc fc-gouts"><h3 class="fc-h">' + I18N.t("fi_gouts") + "</h3>" +
      '<div class="fc-roue"><svg id="fiche-roue" class="roue" viewBox="0 0 300 300" role="img" aria-label="' +
      escapeHtml(I18N.t("fi_roue_aria")) + '"></svg><div class="roue-detail" id="fiche-roue-detail" aria-live="polite"></div></div>' +
      '<p class="fc-muet" id="fiche-roue-vide" hidden>' + I18N.t("fi_gouts_vide") + "</p></section>";
    const settingBlock = '<section class="fc-bloc fc-reglage"><h3 class="fc-h">' + I18N.t("fi_reglage") + "</h3>" +
      UI.tuningCard({ coffee: coffee, ...report }) + "</section>";
    /* The drawings of this coffee (v8.50), rendered by js/ui-dessins.js. */
    const fingerprintBlock = '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_empreinte") + "</h3>" +
      '<svg id="fiche-empreinte" class="fc-dessin" viewBox="0 0 320 210" role="img" aria-label="' + escapeHtml(I18N.t("fi_empreinte")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-empreinte-lecture"></p></section>';
    const trajectoryBlock = '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_trajectoire") + "</h3>" +
      '<svg id="fiche-trajectoire" class="fc-dessin" viewBox="0 0 320 172" role="img" aria-label="' + escapeHtml(I18N.t("fi_trajectoire")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-trajectoire-lecture"></p></section>';
    const grinderBlock = '<section class="fc-bloc"><h3 class="fc-h">' + I18N.t("fi_moulin") + "</h3>" +
      '<svg id="fiche-moulin" class="fc-dessin" viewBox="0 0 320 126" role="img" aria-label="' + escapeHtml(I18N.t("fi_moulin")) + '"></svg>' +
      '<p class="fc-texte" id="fiche-moulin-lecture"></p></section>';
    zone.innerHTML =
      '<header class="fc-tete fc-passeport">' +
        /* THE JAR IS CORRECTED WITH ONE CLICK (v8.96): its grams below, a bean
           drawn inside so that an empty bag no longer looks like a missing
           image, and the click opens the manual count just below. */
        '<div class="fc-bocal-bloc">' +
          '<button type="button" class="fc-bocal" data-stock-edit aria-label="' +
            escapeHtml(I18N.t("fi_stock_aria", { g: stock ? fmtDecimal(Math.max(0, stock.remaining), 0) : "?" })) +
            '" style="--niveau:' + level.toFixed(0) + "%;--teinte:" + tint + '"><i></i>' + BEAN_SVG + "</button>" +
          /* Below zero, the computation is necessarily wrong (cups from another bag,
             bag not entered): « à compter » invites a correction, where « 0 g »
             suggested an empty bag. */
          (stock && stock.remaining < 0
            ? '<button type="button" class="fc-bocal-g fc-a-compter" data-stock-edit>' + I18N.t("fi_stock_a_compter") + "</button>"
            : '<span class="fc-bocal-g">' + (stock ? fmtDecimal(stock.remaining, 0) + " g" : "") + "</span>") +
        "</div>" +
        '<div class="fc-identite"><p class="surligne">' + I18N.t("fi_surligne") + "</p>" +
        '<h2 id="fiche-nom">' + escapeHtml(coffee.nom) + "</h2>" + '<div class="fc-chips">' + chips + "</div></div>" +
      "</header>" +
      stockEditor(stock) +
      '<div class="fc-kpis">' +
        kpi(exts.length, I18N.t("fi_k_tasses")) +
        kpi(rated.length ? fmtRating(coffeeAvg) : "·", I18N.t("fi_k_moyenne")) +
        kpi(best !== null ? fmtRating(best) : "·", I18N.t("fi_k_meilleure")) +
        // Price only: « 7 348 ₫ la tasse de 14,7 g » would repeat the label below.
        kpi(cost ? escapeHtml(String(cost).replace(/^([^₫]*₫).*$/, "$1")) : "·", I18N.t("fi_k_cout")) +
      "</div>" +
      '<div class="fc-onglets" role="tablist" aria-label="' + escapeHtml(I18N.t("fi_onglets")) + '">' +
        TABS.map(([k, key]) => '<button type="button" role="tab" id="fc-o-' + k + '" data-onglet="' + k + '" aria-controls="fc-p-' + k +
          '" aria-selected="' + (k === sheetTab) + '" tabindex="' + (k === sheetTab ? 0 : -1) + '">' + I18N.t(key) + "</button>").join("") +
      "</div>" +
      panel("reglage", settingBlock + grinderBlock + trajectoryBlock) +
      panel("gouts", tastesBlock + fingerprintBlock) +
      panel("sachets", bag.html + curveBlock(rated, bag.sweetSpot, bag.max, bag.jc)) +
      panel("tasses", latestBlock(exts) + compareBlock(coffee));
    UI.drawFingerprint("fiche-empreinte", coffee.id);
    UI.drawTrajectory("fiche-trajectoire", coffee.id);
    UI.drawGrinder("fiche-moulin", coffee.id);
    renderComparison();
    const tasteCount = CHARTS.aromaWheel(rated, { svg: "fiche-roue", detail: "fiche-roue-detail", reading: "" });
    $("#fiche-roue-vide").hidden = tasteCount > 0;
    $(".fc-roue").hidden = tasteCount === 0;
  }

  /* TWO COFFEES SIDE BY SIDE (v8.56). « Comparer avec… » at the foot of the card:
     the two fingerprints overlaid, and face to face what helps choose what to
     buy again, their average, their brewer, their best setting, their
     freshness window, their cost per cup and the recurring taste. Everything
     comes from the same computations as the rest of the card. */
  function compareBlock(coffee) {
    const others = DATA.state.cafes.filter(c => c.id !== coffee.id && DATA.state.extractions.some(e => e.cafe_id === c.id));
    if (!others.length) return "";
    return '<section class="fc-bloc fc-comparer"><div class="fc-comparer-tete"><h3 class="fc-h">' + I18N.t("fi_comparer") + "</h3>" +
      '<select id="fiche-comparer" aria-label="' + escapeHtml(I18N.t("fi_comparer")) + '"><option value="">' + escapeHtml(I18N.t("fi_comparer_choisir")) + "</option>" +
      others.map(c => '<option value="' + escapeHtml(c.id) + '"' + (c.id === compareId ? " selected" : "") + ">" + escapeHtml(c.nom) + "</option>").join("") +
      '</select></div><div id="fiche-comparaison"></div></section>';
  }
  function coffeeSummary(c) {
    const rated = analyzableExts().filter(e => e.cafe_id === c.id && e.note_sur_10 !== "");
    const exts = extsWithCalcs().filter(e => e.cafe_id === c.id);
    const avg = rated.length ? average(rated.map(e => Number(e.note_sur_10))) : null;
    const machines = {};
    exts.forEach(e => { if (e.methode) machines[e.methode] = (machines[e.methode] || 0) + 1; });
    const machine = Object.keys(machines).sort((a, b) => machines[b] - machines[a])[0];
    const report = TUNING.forCoffee(c.id, analyzableExts());
    const m = report.best;
    const f = learnWindow(rated, avg || 0).sweetSpot;
    const doses = exts.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const tags = {};
    rated.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
    const topTaste = Object.keys(tags).sort((a, b) => tags[b] - tags[a])[0];
    return [
      avg === null ? I18N.t("fi_pas_notee") : I18N.t("fi_cmp_moyenne", { m: fmtRating(avg), n: rated.length }),
      machine ? I18N.machine(machine) : "·",
      m ? [I18N.tr(m.recette || ""), m.grind || ""].filter(Boolean).join(" · ") + ", " + fmtRating(m.average) : I18N.t("fi_cmp_pas_de_reglage"),
      f ? I18N.t("fi_cmp_jours", { a: f.start + 1, b: f.end + 1 }) : I18N.t("fi_cmp_pas_de_fenetre"),
      UI.costPerCup(c, doses.length ? average(doses) : fallbacks.dose) || "·",
      topTaste ? I18N.tag(topTaste) : "·",
    ];
  }
  function renderComparison() {
    const zone = $("#fiche-comparaison");
    if (!zone) return;
    const a = DATA.state.cafes.find(c => c.id === openId), b = DATA.state.cafes.find(c => c.id === compareId);
    if (!a || !b) { zone.innerHTML = ""; return; }
    const ra = coffeeSummary(a), rb = coffeeSummary(b);
    const rows = ["fi_cmp_note", "fi_cmp_machine", "fi_cmp_reglage", "fi_cmp_fenetre", "fi_cmp_cout", "fi_cmp_gout"];
    zone.innerHTML = '<div class="fc-comparer-corps"><div>' +
      '<svg id="fiche-duo" class="fc-dessin" viewBox="0 0 320 210" role="img" aria-label="' + escapeHtml(I18N.t("fi_duo_aria", { a: a.nom, b: b.nom })) + '"></svg>' +
      '<div class="fc-duo-leg"><span><i class="fc-duo-a"></i>' + escapeHtml(a.nom) + '</span><span><i class="fc-duo-b"></i>' + escapeHtml(b.nom) + "</span></div>" +
      '<p class="fc-texte" id="fiche-duo-lecture"></p></div>' +
      '<table class="fc-duo-table"><thead><tr><th></th><th>' + escapeHtml(a.nom) + "</th><th>" + escapeHtml(b.nom) + "</th></tr></thead><tbody>" +
      rows.map((key, i) => "<tr><th>" + escapeHtml(I18N.t(key)) + "</th><td>" + escapeHtml(ra[i]) + "</td><td>" + escapeHtml(rb[i]) + "</td></tr>").join("") +
      "</tbody></table></div>";
    UI.drawFingerprint("fiche-duo", a.id, b.id);
  }

  function openSheet(coffeeId) {
    if (!DATA.state.cafes.some(c => c.id === coffeeId)) return;
    if (coffeeId !== openId) { compareId = ""; sheetTab = "reglage"; }
    openId = coffeeId;
    renderSheet();
    const m = $("#modale-fiche");
    /* The phone back button closes the card instead of leaving the screen:
       opening pushes an entry into the browser history (without touching
       the address, which drives the screens). */
    if (!m.open) {
      try { history.pushState({ sheet: coffeeId }, ""); historyEntry = true; } catch (e) { historyEntry = false; }
      m.showModal();
    }
    const scroller = $("#fiche-contenu");
    if (scroller) scroller.scrollTop = 0;
  }

  // Re-rendered when the data or the language changes, if it is open.
  function renderOpenSheet() {
    const m = $("#modale-fiche");
    if (m && m.open) renderSheet();
  }

  function showTab(k, focus) {
    sheetTab = k;
    document.querySelectorAll(".fc-onglets [role=tab]").forEach(b => {
      const on = b.dataset.onglet === k;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    document.querySelectorAll(".fc-panneau").forEach(p => { p.hidden = p.id !== "fc-p-" + k; });
  }

  function wireSheet() {
    // The card tabs: the content is rewritten on each render, so we delegate.
    $("#fiche-contenu").addEventListener("click", ev => {
      const b = ev.target.closest(".fc-onglets [data-onglet]");
      if (b) showTab(b.dataset.onglet);
    });
    $("#fiche-contenu").addEventListener("keydown", ev => {
      const b = ev.target.closest(".fc-onglets [data-onglet]");
      if (!b) return;
      const list = [...document.querySelectorAll(".fc-onglets [data-onglet]")];
      const i = list.indexOf(b);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
      if (j === undefined) return;
      ev.preventDefault();
      showTab(list[(j + list.length) % list.length].dataset.onglet, true);
    });
    // Phone back: we close; closing any other way removes the pushed entry.
    window.addEventListener("popstate", () => {
      const m = $("#modale-fiche");
      if (m.open && historyEntry) { historyEntry = false; m.close(); }
    });
    $("#modale-fiche").addEventListener("close", () => {
      /* Simply closing removes the entry pushed on opening. Closing to go
         elsewhere (Brew, Edit) leaves it: activateScreen rewrites it to its
         address, and going back now would cancel that screen change. */
      if (historyEntry && !closingToNavigate) { try { history.back(); } catch (e) { /* nothing to remove */ } }
      historyEntry = false;
      closingToNavigate = false;
    });
    /* The manual count: open, cancel, save (v8.96). */
    const editor = () => $("#fc-stock-edition");
    const closeEditor = () => { const f = editor(); if (f) f.hidden = true; };
    $("#fiche-contenu").addEventListener("click", ev => {
      if (ev.target.closest("[data-stock-annuler]")) { closeEditor(); return; }
      if (!ev.target.closest("[data-stock-edit]")) return;
      const f = editor();
      if (!f) return;
      f.hidden = false;
      f.scrollIntoView({ block: "nearest" });
      const field = $("#fc-stock-g");
      field.focus();
      field.select();
    });
    $("#fiche-contenu").addEventListener("keydown", ev => {
      // Escape closes the count, not the whole card.
      if (ev.key !== "Escape" || !ev.target.closest("#fc-stock-edition")) return;
      ev.preventDefault();
      ev.stopPropagation();
      closeEditor();
    });
    $("#fiche-contenu").addEventListener("submit", async ev => {
      if (!ev.target.closest("#fc-stock-edition")) return;
      ev.preventDefault();
      const g = Number(String($("#fc-stock-g").value).replace(",", "."));
      if (!Number.isFinite(g) || g < 0) { $("#fc-stock-g").focus(); return; }
      await DATA.correctStock(openId, g);
      toast(I18N.t("t_stock_corrige", { g: fmtDecimal(g, 0) }));
    });
    $("#fiche-contenu").addEventListener("click", async ev => {
      const b = ev.target.closest("[data-suppr-sachet]");
      if (!b) return;
      const a = DATA.state.achats.find(x => x.id === b.dataset.supprSachet);
      if (!a || !await UI.askConfirm(I18N.t("c_suppr_sachet", { d: a.date_achat || "?" }), { danger: true })) return;
      await DATA.deletePurchase(a.id);
      UI.toast(I18N.t("t_sachet_supprime"));
    });
    $("#fiche-brasser").addEventListener("click", () => {
      const id = openId;
      closingToNavigate = true;
      $("#modale-fiche").close();
      UI.resetEntry();
      const sel = $("#f-cafe");
      sel.value = id;
      if (sel.value === id) UI.onCoffeeChoice();
      else toast(I18N.t("fi_inactif"));
      // No edit in progress (resetEntry just closed it): nothing to abandon.
      UI.activateScreen("saisie");
    });
    $("#fiche-modifier").addEventListener("click", () => {
      const id = openId;
      closingToNavigate = true;
      $("#modale-fiche").close();
      UI.openCoffeesModal();
      UI.openCoffeeForm(id);
    });
    $("#fiche-contenu").addEventListener("change", ev => {
      if (ev.target.id !== "fiche-comparer") return;
      compareId = ev.target.value;
      renderComparison();
    });
    // The « Refaire » button of the best setting card, rendered in the coffee card.
    $("#fiche-contenu").addEventListener("click", ev => {
      const b = ev.target.closest("[data-refaire]");
      if (!b) return;
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.refaire);
      if (!ext) return;
      $("#modale-fiche").close();
      UI.redoCup(ext);
      toast(I18N.t("rg_preremplie"));
    });
    // Delegated on the document: the « Fiche » buttons are born with their lists.
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-fiche]");
      if (b) openSheet(b.dataset.fiche);
    });
    DATA.subscribe(renderOpenSheet);
  }

  // Under names that say what they are outside this file: the dashboard shelf uses them.
  const freshnessWindow = learnWindow, bagDay = currentBagDay, BAG_SLICES = BANDS;
  Object.assign(UI, { wireSheet, freshnessWindow, bagDay, openSheet, renderOpenSheet, BAG_SLICES });
})();
