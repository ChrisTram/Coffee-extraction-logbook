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

  // Borrowed from the core and from ui-history.js, loaded before us.
  const { $, titleAttr, isFailed, fmtShortDate, fmtDecimal, average } = UI;

  const VIEW_KEY = "history-view";
  const VISIBLE_COUNT = 5;
  const openKeys = new Set();
  const expandedKeys = new Set();
  let firstRender = true;
  const fmtRating = n => fmtDecimal(n, 1);
  // "19 août": the year is only written if it is not the current one.
  function dayLabel(d) {
    const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
    if (!y || !m || !day) return fmtShortDate(d);
    const date = new Date(y, m - 1, day);
    return date.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
  }

  function historyView() {
    try { return localStorage.getItem(VIEW_KEY) === "date" ? "date" : "bag"; } catch (e) { return "bag"; }
  }
  function setView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* without storage, the view goes back to by-bag */ }
  }

  // Cups sorted by bag; a cup without a recorded bag goes into its coffee's chapter.
  function chapters(list) {
    const byKey = new Map();
    list.forEach(e => {
      const s = DATA.bagAtDate(e.coffee_id, e.date_time);
      const key = s ? s.id : "sans|" + e.coffee_id;
      if (!byKey.has(key)) byKey.set(key, { key, bag: s, coffee: DATA.coffeeOf(e), cups: [] });
      byKey.get(key).cups.push(e);
    });
    const result = [...byKey.values()];
    result.forEach(c => c.cups.sort((a, b) => String(b.date_time).localeCompare(String(a.date_time))));
    return result.sort((a, b) => String(b.cups[0].date_time).localeCompare(String(a.cups[0].date_time)));
  }

  // The rating over the bag, in one line: each point is a rated cup, in order.
  function curve(rated) {
    if (rated.length < 2) return "";
    const ordered = rated.slice().sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));
    const W = 240, H = 34, x = i => 4 + i * ((W - 8) / (ordered.length - 1)), y = n => H - 4 - (Math.max(3, Math.min(10, n)) - 3) / 7 * (H - 8);
    const d = "M" + ordered.map((e, i) => x(i).toFixed(1) + " " + y(Number(e.score_10)).toFixed(1)).join(" L");
    /* Each cup reads under the finger, or the mouse (M4, v9.13, js/ui-scrub.js):
       an invisible point per cup carries its day, recipe and rating. */
    const tips = ordered.map((e, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(Number(e.score_10)).toFixed(1) + '" r="0" data-scrub-tip="' +
      titleAttr([dayLabel(e.date_time), I18N.tr(e.recipe || ""), fmtRating(Number(e.score_10))].filter(Boolean).join(" · ")) + '"></circle>').join("");
    // Stretched across the full width (v8.95): on desktop, kept at its proportions, it stayed a stroke in the middle.
    return '<svg class="jn-curve" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true" data-scrub="hover"><path d="' + d + '" vector-effect="non-scaling-stroke"></path>' + tips + "</svg>";
  }

  function resume(c) {
    const coffee = c.coffee, s = c.bag;
    const rated = c.cups.filter(e => e.score_10 !== "" && !isFailed(e));
    const avg = rated.length ? average(rated.map(e => Number(e.score_10))) : null;
    const best = rated.slice().sort((a, b) => Number(b.score_10) - Number(a.score_10))[0] || null;
    const current = s && coffee ? DATA.currentBag(coffee.id) : null;
    const stock = current && current.id === s.id ? DATA.bagStock(coffee.id, UI.fallbacks.dose) : null;
    const ongoing = !!(stock && stock.remaining > 0);
    const oldest = c.cups[c.cups.length - 1].date_time;
    const start = s ? (s.opened_date || s.purchase_date) : String(oldest).slice(0, 10);
    const end = String(c.cups[0].date_time).slice(0, 10);
    const doses = c.cups.filter(e => Number(e.dose_g) > 0).map(e => Number(e.dose_g));
    const price = s && Number(s.price_vnd) > 0 && Number(s.bag_size_g) > 0 && doses.length
      ? Math.round(Number(s.price_vnd) / Number(s.bag_size_g) * average(doses)) : null;
    return { rated, avg, best, ongoing, stock, start, end, price };
  }

  function chapter(c) {
    const r = resume(c);
    const isOpen = openKeys.has(c.key);
    const name = c.coffee ? I18N.tr(c.coffee.name) : I18N.t("journal_unknown_coffee");
    const when = r.ongoing
      ? I18N.t("journal_since", { d: dayLabel(r.start) })
      : r.start === r.end ? dayLabel(r.start) : I18N.t("journal_from_to", { a: dayLabel(r.start), b: dayLabel(r.end) });
    const status = !c.bag ? I18N.t("journal_no_bag")
      : r.ongoing ? I18N.t("journal_open", { g: Math.round(r.stock.remaining) }) : I18N.t("journal_finished");
    const setting = r.best ? [I18N.tr(r.best.recipe || ""), r.best.grind_dial || ""].filter(Boolean).join(" · ") : "";
    const kpi = (v, l) => '<div class="jn-kpi"><b>' + v + "</b><span>" + l + "</span></div>";
    const cups = expandedKeys.has(c.key) ? c.cups : c.cups.slice(0, VISIBLE_COUNT);
    const hidden = c.cups.length - cups.length;
    return '<section class="jn-chapter' + (isOpen ? " open" : "") + (r.ongoing ? " in-progress" : "") + '">' +
      '<button type="button" class="jn-head" data-chapter="' + titleAttr(c.key) + '" aria-expanded="' + isOpen + '">' +
        '<span class="jn-title"><b>' + titleAttr(name) + "</b>" +
          '<span class="jn-state' + (r.ongoing ? " vivid" : "") + '">' + status + "</span></span>" +
        '<span class="jn-sub">' + when + " · " + I18N.t("journal_cups", { n: c.cups.length, s: c.cups.length > 1 ? "s" : "" }) +
          (c.bag && c.bag.bag_size_g ? " · " + c.bag.bag_size_g + " g" : "") + "</span>" +
        '<span class="jn-avg">' + (r.avg !== null ? fmtRating(r.avg) : "·") + "</span>" +
      "</button>" +
      (isOpen
        ? '<div class="jn-body">' +
            '<div class="jn-summary">' +
              '<div class="jn-kpis">' +
                kpi(r.avg !== null ? fmtRating(r.avg) : "·", I18N.t("journal_average", { n: r.rated.length })) +
                kpi(r.best ? fmtRating(Number(r.best.score_10)) : "·", I18N.t("journal_best")) +
                kpi(r.price ? r.price.toLocaleString(I18N.locale()) + " ₫" : "·", I18N.t("journal_per_cup")) +
              "</div>" + curve(r.rated) +
              (setting ? '<p class="jn-setting">' + I18N.t("journal_best_setting", { r: titleAttr(setting), n: fmtRating(Number(r.best.score_10)) }) + "</p>" : "") +
            "</div>" +
            '<div class="h-cards jn-cups">' + cups.map(e => UI.extractionCard(e)).join("") + "</div>" +
            (hidden > 0 ? '<button type="button" class="btn btn-subtle btn-small jn-all" data-journal-all="' + titleAttr(c.key) + '">' +
              I18N.t("journal_see_all", { n: hidden, s: hidden > 1 ? "s" : "" }) + "</button>" : "") +
          "</div>"
        : "") +
      "</section>";
  }

  function renderJournal(list) {
    const zone = $("#h-journal");
    if (!zone) return;
    const ch = chapters(list);
    // On first opening, the most recent chapter is unfolded: it is the one you came to see.
    if (firstRender && ch.length) { openKeys.add(ch[0].key); firstRender = false; }
    zone.innerHTML = ch.map(chapter).join("");
  }

  function wireJournal(render) {
    $("#h-journal").addEventListener("click", ev => {
      const t = ev.target.closest("[data-chapter]");
      if (t) {
        const k = t.dataset.chapter;
        if (openKeys.has(k)) openKeys.delete(k); else openKeys.add(k);
        render();
        return;
      }
      const all = ev.target.closest("[data-journal-all]");
      if (all) { expandedKeys.add(all.dataset.journalAll); render(); }
    });
    document.querySelectorAll(".h-views [data-view]").forEach(b => b.addEventListener("click", () => { setView(b.dataset.view); render(); }));
  }

  function updateViews() {
    const v = historyView();
    document.querySelectorAll(".h-views [data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  }

  Object.assign(UI, { wireJournal, updateViews, renderJournal, historyView });
})();
