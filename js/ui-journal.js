/* L3 (v8.93): THE LOGBOOK, BY BAG.
 *
 * A single list of sixty cups never told how a bag had gone: you had to
 * filter, then count by hand. Here each bag is a chapter, with its summary on
 * top (dates, cups, average, the best one, the best setting, the price per
 * cup, and the rating curve over the days). The cups below are the same cards
 * as the history by date.
 *
 * The most recent chapter opens, the others stay on one line. The history
 * filters apply: we sort whatever they let through. */
"use strict";

(() => {

  // Borrowed from the core and from ui-historique.js, loaded before us.
  const { $, attrTitre, estRatee, fmtDateCourte, fmtDecimal, moyenne } = UI;

  const VIEW_KEY = "historique-vue";
  const VISIBLE_COUNT = 5;
  const openKeys = new Set();
  const expandedKeys = new Set();
  let firstRender = true;
  const note1 = n => fmtDecimal(n, 1);
  // "19 août": the year is only written if it is not the current one.
  function dayLabel(d) {
    const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
    if (!y || !m || !day) return fmtDateCourte(d);
    const date = new Date(y, m - 1, day);
    return date.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
  }

  function vueHistorique() {
    try { return localStorage.getItem(VIEW_KEY) === "date" ? "date" : "sachet"; } catch (e) { return "sachet"; }
  }
  function setView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* without storage, the view goes back to by-bag */ }
  }

  // Cups sorted by bag; a cup without a recorded bag goes into its coffee's chapter.
  function chapters(list) {
    const byKey = new Map();
    list.forEach(e => {
      const s = DATA.sachetALaDate(e.cafe_id, e.date_heure);
      const key = s ? s.id : "sans|" + e.cafe_id;
      if (!byKey.has(key)) byKey.set(key, { key, bag: s, coffee: DATA.cafeDe(e), cups: [] });
      byKey.get(key).cups.push(e);
    });
    const result = [...byKey.values()];
    result.forEach(c => c.cups.sort((a, b) => String(b.date_heure).localeCompare(String(a.date_heure))));
    return result.sort((a, b) => String(b.cups[0].date_heure).localeCompare(String(a.cups[0].date_heure)));
  }

  // The rating over the bag, in one line: each point is a rated cup, in order.
  function curve(rated) {
    if (rated.length < 2) return "";
    const ordered = rated.slice().sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
    const W = 240, H = 34, x = i => 4 + i * ((W - 8) / (ordered.length - 1)), y = n => H - 4 - (Math.max(3, Math.min(10, n)) - 3) / 7 * (H - 8);
    const d = "M" + ordered.map((e, i) => x(i).toFixed(1) + " " + y(Number(e.note_sur_10)).toFixed(1)).join(" L");
    // Stretched across the full width (v8.95): on desktop, kept at its proportions, it stayed a stroke in the middle.
    return '<svg class="jn-courbe" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" vector-effect="non-scaling-stroke"></path></svg>';
  }

  function resume(c) {
    const coffee = c.coffee, s = c.bag;
    const rated = c.cups.filter(e => e.note_sur_10 !== "" && !estRatee(e));
    const avg = rated.length ? moyenne(rated.map(e => Number(e.note_sur_10))) : null;
    const best = rated.slice().sort((a, b) => Number(b.note_sur_10) - Number(a.note_sur_10))[0] || null;
    const current = s && coffee ? DATA.sachetCourant(coffee.id) : null;
    const stock = current && current.id === s.id ? DATA.stockSachet(coffee.id, UI.replis.dose) : null;
    const ongoing = !!(stock && stock.restant > 0);
    const oldest = c.cups[c.cups.length - 1].date_heure;
    const start = s ? (s.date_ouverture || s.date_achat) : String(oldest).slice(0, 10);
    const end = String(c.cups[0].date_heure).slice(0, 10);
    const doses = c.cups.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const price = s && Number(s.prix_vnd) > 0 && Number(s.format_grammes) > 0 && doses.length
      ? Math.round(Number(s.prix_vnd) / Number(s.format_grammes) * moyenne(doses)) : null;
    return { rated, avg, best, ongoing, stock, start, end, price };
  }

  function chapter(c) {
    const r = resume(c);
    const isOpen = openKeys.has(c.key);
    const name = c.coffee ? I18N.tr(c.coffee.nom) : I18N.t("jn_sans_cafe");
    const when = r.ongoing
      ? I18N.t("jn_depuis", { d: dayLabel(r.start) })
      : r.start === r.end ? dayLabel(r.start) : I18N.t("jn_du_au", { a: dayLabel(r.start), b: dayLabel(r.end) });
    const status = !c.bag ? I18N.t("jn_sans_sachet")
      : r.ongoing ? I18N.t("jn_en_cours", { g: Math.round(r.stock.restant) }) : I18N.t("jn_fini");
    const setting = r.best ? [I18N.tr(r.best.recette || ""), r.best.mouture_dial || ""].filter(Boolean).join(" · ") : "";
    const kpi = (v, l) => '<div class="jn-kpi"><b>' + v + "</b><span>" + l + "</span></div>";
    const cups = expandedKeys.has(c.key) ? c.cups : c.cups.slice(0, VISIBLE_COUNT);
    const hidden = c.cups.length - cups.length;
    return '<section class="jn-chapitre' + (isOpen ? " ouvert" : "") + (r.ongoing ? " en-cours" : "") + '">' +
      '<button type="button" class="jn-tete" data-chapitre="' + attrTitre(c.key) + '" aria-expanded="' + isOpen + '">' +
        '<span class="jn-titre"><b>' + attrTitre(name) + "</b>" +
          '<span class="jn-etat' + (r.ongoing ? " vif" : "") + '">' + status + "</span></span>" +
        '<span class="jn-sous">' + when + " · " + I18N.t("jn_tasses", { n: c.cups.length, s: c.cups.length > 1 ? "s" : "" }) +
          (c.bag && c.bag.format_grammes ? " · " + c.bag.format_grammes + " g" : "") + "</span>" +
        '<span class="jn-moy">' + (r.avg !== null ? note1(r.avg) : "·") + "</span>" +
      "</button>" +
      (isOpen
        ? '<div class="jn-corps">' +
            '<div class="jn-resume">' +
              '<div class="jn-kpis">' +
                kpi(r.avg !== null ? note1(r.avg) : "·", I18N.t("jn_moyenne", { n: r.rated.length })) +
                kpi(r.best ? note1(Number(r.best.note_sur_10)) : "·", I18N.t("jn_meilleure")) +
                kpi(r.price ? r.price.toLocaleString(I18N.locale()) + " ₫" : "·", I18N.t("jn_la_tasse")) +
              "</div>" + curve(r.rated) +
              (setting ? '<p class="jn-reglage">' + I18N.t("jn_reglage", { r: attrTitre(setting), n: note1(Number(r.best.note_sur_10)) }) + "</p>" : "") +
            "</div>" +
            '<div class="h-cartes jn-tasses">' + cups.map(e => UI.carteExtraction(e)).join("") + "</div>" +
            (hidden > 0 ? '<button type="button" class="btn btn-discret btn-petit jn-tout" data-journal-tout="' + attrTitre(c.key) + '">' +
              I18N.t("jn_voir_tout", { n: hidden, s: hidden > 1 ? "s" : "" }) + "</button>" : "") +
          "</div>"
        : "") +
      "</section>";
  }

  function rendreJournal(list) {
    const zone = $("#h-journal");
    if (!zone) return;
    const ch = chapters(list);
    // On first opening, the most recent chapter is unfolded: it is the one you came to see.
    if (firstRender && ch.length) { openKeys.add(ch[0].key); firstRender = false; }
    zone.innerHTML = ch.map(chapter).join("");
  }

  function cablerJournal(render) {
    $("#h-journal").addEventListener("click", ev => {
      const t = ev.target.closest("[data-chapitre]");
      if (t) {
        const k = t.dataset.chapitre;
        if (openKeys.has(k)) openKeys.delete(k); else openKeys.add(k);
        render();
        return;
      }
      const all = ev.target.closest("[data-journal-tout]");
      if (all) { expandedKeys.add(all.dataset.journalTout); render(); }
    });
    document.querySelectorAll(".h-vues [data-vue]").forEach(b => b.addEventListener("click", () => { setView(b.dataset.vue); render(); }));
  }

  function majVues() {
    const v = vueHistorique();
    document.querySelectorAll(".h-vues [data-vue]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vue === v)));
  }

  Object.assign(UI, { cablerJournal, majVues, rendreJournal, vueHistorique });
})();
