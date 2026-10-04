/* O5 (v9.20): THE COMPARISON PAGE. Two cups, and what separates them.
 *
 * Until now two cups picked one by one opened a window of two columns to
 * read yourself, without a verdict. Now they open a page of their own,
 * #history/compare, inside the history screen: the two cups at the edges,
 * what changed in the middle (each difference with what it means: « un clic
 * plus gros », « revenu dans la fenêtre »), one sentence built from rules
 * (js/compare.js, no guessing) and their tastes drawn one over the other.
 * « Brasser avec le réglage de B » prefills the entry once, through the same
 * path as « Refaire »; nothing is stored as a default.
 *
 * Back (the page's, the browser's or the phone's, or Escape) returns to the
 * journal exactly where it was: the list underneath is only hidden, never
 * redrawn for the occasion, and the scroll comes back. On a phone the same
 * page stacks: a table of both cups, the differences highlighted.
 *
 * The page slides in, the differences arrive one after the other and the
 * drawing traces itself (css/journal.css); reduced motion shows it all at once. */
"use strict";

(() => {

  const { $, titleAttr, displayedDiags, extsWithCalcs, fmtDateTime, fmtDecimal, fmtDuration, findRecipe, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  const ROUTE = "history/compare";
  // The ids shown (A older, B newer), the scroll to come back to, and whether the page pushed a history entry.
  const view = { ids: null, pushed: false, pendingPush: false, scrollY: 0, renderedFor: "" };

  const screen = () => $("#screen-history");
  const zone = () => $("#h-compare");
  const isOpen = () => !!view.ids;
  const t = (k, v) => I18N.t(k, v);
  const fmtRating = n => fmtDecimal(Number(n), 1);
  const signed = (n, dec) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtDecimal(Math.abs(n), dec || 0);

  function cupsOf(ids) {
    const all = extsWithCalcs();
    return ids.map(id => all.find(e => e.id === id)).filter(Boolean)
      .sort((x, y) => String(x.date_time).localeCompare(String(y.date_time)));
  }

  // ---------- The words of a difference ----------

  // « un clic », « deux clics », « 12 clics ».
  function clicksText(n) {
    const k = Math.abs(n);
    if (k === 1) return t("cmp_one_click");
    const words = t("cmp_number_words").split("|");
    return t("cmp_n_clicks", { n: k >= 2 && k - 2 < words.length ? words[k - 2] : String(k) });
  }

  function timeNote(p, flow) {
    if (!p || p.from === null || p.to === null) return "";
    const suffix = flow ? "_flow" : "";
    if (p.stateA && p.stateB && p.stateA !== "inside" && p.stateB === "inside") return t("cmp_note_back" + suffix);
    if (p.stateA === "inside" && p.stateB && p.stateB !== "inside") return t("cmp_note_out_" + p.stateB);
    return p.delta ? signed(p.delta) + " s" : "";
  }

  function tastesText(e) {
    const diags = String(e.diagnostic || "").split("|").filter(Boolean).map(d => I18N.diag(d));
    const tags = String(e.descriptors || "").split("|").filter(Boolean).map(x => I18N.tag(x));
    const all = diags.concat(tags);
    return all.slice(0, 2).join(", ") + (all.length > 2 ? " +" + (all.length - 2) : "");
  }

  const doseText = e => (e.dose_g !== "" && e.water_g !== "" ? e.dose_g + " → " + e.water_g + " g" : e.dose_g !== "" ? e.dose_g + " g" : "");
  const heatText = e => (e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined ? t("setting_heat", { f: e.heat_level }) : "");
  const tempText = e => (e.temperature_c !== "" && e.temperature_c !== undefined && e.method !== "Brikka" ? e.temperature_c + " °C" : "");
  const grindText = e => e.grind_dial || (e._c.ground ? t("bag_default") : "");

  /* Every row both cups can be read on, with its note. The desktop middle
     column lists the CHANGED ones, the phone table all of them. */
  function rows(a, b, f) {
    const list = [];
    const add = (key, label, va, vb, note) => {
      const x = String(va || ""), y = String(vb || "");
      if (!x && !y) return;
      // A note compares two values: with one side empty (a Brikka has no water degrees) there is none.
      list.push({ key, label, a: x, b: y, changed: x !== y, note: x !== y && x && y ? note || "" : "" });
    };
    add("coffee", t("detail_coffee"), I18N.tr(a._c.coffee_name), I18N.tr(b._c.coffee_name));
    add("recipe", t("detail_recipe"), I18N.tr(a.recipe || ""), I18N.tr(b.recipe || ""));
    add("grind", t("cmp_row_grind"), grindText(a), grindText(b), f.grind && f.grind.clicks
      ? t(f.grind.clicks > 0 ? "cmp_note_coarser" : "cmp_note_finer", { n: clicksText(f.grind.clicks), u: signed(f.grind.microns) }) : "");
    add("dose", t("cmp_row_dose"), doseText(a), doseText(b),
      f.ratio && f.ratio.fromText !== f.ratio.toText ? t("cmp_note_ratio", { a: f.ratio.fromText, b: f.ratio.toText }) : "");
    add("temp", t("cmp_row_water"), tempText(a), tempText(b), f.temp && f.temp.delta ? signed(f.temp.delta) + " °C" : "");
    add("heat", t("cmp_row_heat"), heatText(a), heatText(b), f.heat && f.heat.delta ? t(f.heat.delta > 0 ? "cmp_note_heat_up" : "cmp_note_heat_down") : "");
    if (a.method === "Brikka" || b.method === "Brikka") {
      const pre = e => (e.method === "Brikka" ? t(Number(e.preheated_water) === 1 ? "cmp_preheated_yes" : "cmp_preheated_no") : "");
      add("preheat", t("detail_preheated"), pre(a), pre(b));
    }
    add("time", t("detail_time"), fmtDuration(a.total_time_s), fmtDuration(b.total_time_s), timeNote(f.time, false));
    add("flow", t("detail_drawdown"), fmtDuration(a.flow_time_s), fmtDuration(b.flow_time_s), timeNote(f.flow, true));
    add("stir", t("detail_stirring"), a.stir_count, b.stir_count);
    add("tastes", t("cmp_row_tastes"), tastesText(a), tastesText(b));
    add("score", t("detail_score"), a.score_10 !== "" ? fmtRating(a.score_10) : "", b.score_10 !== "" ? fmtRating(b.score_10) : "",
      f.score && f.score.delta !== null && f.score.delta !== 0 ? signed(f.score.delta, 1) : "");
    return list;
  }

  // ---------- The tastes, one over the other ----------

  /* A radar like the coffee sheet's fingerprint (js/ui-drawings.js), for two
     single cups. The axes: six families always (body, cocoa, sweet, fruity,
     acidity, floral), any other family either cup touched, and the defects
     of their diagnosis (bitter, sour...). One taste of a family reaches half
     way, two the edge; a defect « un peu » half way, a clear-cut one the edge. */
  const BASE_FAMILIES = ["Corps et texture", "Cacao et noix", "Sucré", "Fruité", "Acidité", "Floral et thé"];
  function tasteAxes(a, b) {
    const families = DESCRIPTOR_GROUPS.filter(g => BASE_FAMILIES.includes(g.name) ||
      [a, b].some(e => String(e.descriptors || "").split("|").some(x => g.tags.includes(x))));
    const da = COMPARE.defects(a.diagnostic), db = COMPARE.defects(b.diagnostic);
    const defectKeys = COMPARE.DEFECT_ORDER.filter(k => da[k] || db[k]);
    const count = (e, g) => String(e.descriptors || "").split("|").filter(x => g.tags.includes(x)).length;
    return families.map(g => ({ label: I18N.group(g.name).split(" ")[0], a: Math.min(1, count(a, g) / 2), b: Math.min(1, count(b, g) / 2) }))
      .concat(defectKeys.map(k => ({ label: t("cmp_axis_" + k), a: (da[k] || 0) / 2, b: (db[k] || 0) / 2, defect: true })));
  }

  function tasteDrawing(a, b) {
    const axes = tasteAxes(a, b);
    if (!axes.some(x => x.a || x.b)) return '<p class="cmp-none">' + escapeHtml(t("cmp_no_tastes")) + "</p>";
    const N = axes.length, C = [170, 112], R = 78, MIN = 0.06;
    const pt = (i, r) => { const ang = -Math.PI / 2 + (i / N) * Math.PI * 2; return [C[0] + Math.cos(ang) * r, C[1] + Math.sin(ang) * r]; };
    const points = side => axes.map((x, i) => pt(i, R * Math.max(MIN, x[side])).map(n => n.toFixed(1)).join(",")).join(" ");
    let s = "";
    [0.5, 1].forEach(k => {
      s += '<polygon class="dw-web" points="' + axes.map((_, i) => pt(i, R * k).map(n => n.toFixed(1)).join(",")).join(" ") + '"></polygon>';
    });
    axes.forEach((x, i) => {
      const [ex, ey] = pt(i, R), [lx, ly] = pt(i, R + 14);
      s += '<line class="dw-radius" x1="' + C[0] + '" y1="' + C[1] + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"></line>' +
        '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="' + (lx < C[0] - 8 ? "end" : lx > C[0] + 8 ? "start" : "middle") + '"' +
        (x.defect ? ' class="cmp-defect"' : "") + ">" + escapeHtml(x.label) + "</text>";
    });
    // pathLength 1: the outline traces itself from 0 to 1 in CSS, whatever its real length.
    s += '<polygon class="cmp-shape-a" pathLength="1" points="' + points("a") + '"></polygon>' +
      '<polygon class="cmp-shape-b" pathLength="1" points="' + points("b") + '"></polygon>';
    return '<svg class="cmp-svg" viewBox="0 0 340 228" role="img" aria-label="' + titleAttr(t("cmp_tastes_aria")) + '">' + s + "</svg>";
  }

  // ---------- The page ----------

  function cupCard(e, letter, showCoffee) {
    const tags = String(e.descriptors || "").split("|").filter(Boolean);
    const diags = String(e.diagnostic || "").split("|").filter(Boolean);
    const line = [I18N.tr(e.recipe || ""), e.grind_dial || "", tempText(e) || heatText(e), fmtDuration(e.total_time_s)].filter(Boolean).join(" · ");
    return '<article class="cmp-cup cmp-' + letter.toLowerCase() + '" data-id="' + escapeHtml(e.id) + '">' +
      '<p class="cmp-eyebrow">' + escapeHtml(t("cmp_cup_label", { k: letter, d: fmtDateTime(e.date_time) })) + "</p>" +
      (showCoffee ? '<p class="cmp-coffee">' + titleAttr(I18N.tr(e._c.coffee_name)) + "</p>" : "") +
      '<p class="cmp-score">' + (e.score_10 !== "" ? fmtRating(e.score_10) : '<span class="cmp-unrated">' + escapeHtml(t("not_rated_yet")) + "</span>") + "</p>" +
      (line ? '<p class="cmp-line"><span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' + titleAttr(line) + "</p>" : "") +
      (diags.length || tags.length ? '<p class="cmp-tags">' +
        diags.map(d => '<span class="last-tag cmp-diag">' + escapeHtml(I18N.diag(d)) + "</span>").join("") +
        tags.map(x => '<span class="last-tag">' + escapeHtml(I18N.tag(x)) + "</span>").join("") + "</p>" : "") +
      (e.comment ? '<p class="cmp-comment">« ' + titleAttr(e.comment) + " »</p>" : "") +
      '<button type="button" class="btn btn-subtle btn-small cmp-edit" data-cmp="edit" data-id="' + escapeHtml(e.id) + '">' + escapeHtml(t("btn_edit")) + "</button>" +
      "</article>";
  }

  function render(entering) {
    const z = zone();
    const cups = view.ids ? cupsOf(view.ids) : [];
    if (!z || cups.length !== 2) { closeCompare(true); return; }
    const [a, b] = cups;
    const f = COMPARE.facts(a, b, name => findRecipe(name));
    const lines = rows(a, b, f);
    // The coffee is on the cards; the score is always told, even unchanged.
    const changed = lines.filter(r => (r.changed && r.key !== "coffee") || r.key === "score");
    const settingsMoved = lines.some(r => r.changed && !["coffee", "tastes", "score", "time", "flow"].includes(r.key));
    const verdict = COMPARE.verdict(f, t, { decimal: n => fmtDecimal(n, 1), tag: x => I18N.tag(x), duration: fmtDuration });
    const best = f.better === "a" ? a : b;
    const bestLetter = best === a ? "A" : "B";
    const title = f.sameCoffee ? t("cmp_title_coffee", { c: I18N.tr(a._c.coffee_name) }) : t("cmp_title");
    const brew = cls => '<button type="button" class="btn btn-primary ' + cls + '" data-cmp="brew" data-id="' + escapeHtml(best.id) + '">' +
      escapeHtml(t("cmp_brew_with", { k: bestLetter })) + "</button>";
    const diffs = changed.map((r, i) => '<li class="cmp-diff' + (r.changed ? " on" : "") + '" style="--i:' + i + '">' +
      '<span class="cmp-label">' + escapeHtml(r.label) + "</span>" +
      '<b class="cmp-values">' + titleAttr(r.a || "·") + ' <span class="cmp-arrow" aria-hidden="true">→</span> ' + titleAttr(r.b || "·") + "</b>" +
      (r.note ? '<small class="cmp-note">' + titleAttr(r.note) + "</small>" : "") + "</li>").join("");
    const table = '<table class="cmp-table"><thead><tr><th></th>' +
      '<th scope="col">' + escapeHtml(t("cmp_col", { k: "A", d: fmtDateTime(a.date_time) })) + "</th>" +
      '<th scope="col">' + escapeHtml(t("cmp_col", { k: "B", d: fmtDateTime(b.date_time) })) + "</th></tr></thead><tbody>" +
      lines.map((r, i) => '<tr class="cmp-row' + (r.changed ? " on" : "") + '" style="--i:' + i + '"><th scope="row">' + escapeHtml(r.label) + "</th>" +
        "<td>" + titleAttr(r.a) + "</td><td>" + titleAttr(r.b) + (r.note ? '<small class="cmp-note">' + titleAttr(r.note) + "</small>" : "") + "</td></tr>").join("") +
      "</tbody></table>";
    const html = '<div class="cmp-page' + (entering ? " entering" : "") + '">' +
      '<header class="cmp-head">' +
        '<button type="button" class="cmp-back" data-cmp="back"><span aria-hidden="true">‹</span> ' + escapeHtml(t("cmp_back")) + "</button>" +
        '<h2 class="title-page cmp-title">' + titleAttr(title) + "</h2>" +
        (f.sameCoffee ? "" : '<p class="cmp-sub">' + titleAttr(I18N.tr(a._c.coffee_name) + t("cmp_and") + I18N.tr(b._c.coffee_name)) + "</p>") +
        brew("cmp-brew-top") +
      "</header>" +
      '<div class="cmp-grid">' +
        cupCard(a, "A", !f.sameCoffee) +
        '<section class="cmp-mid" aria-live="polite">' +
          '<h3 class="cmp-h cmp-h-wide">' + escapeHtml(t("cmp_changed")) + "</h3>" +
          '<h3 class="cmp-h cmp-h-narrow">' + escapeHtml(t("cmp_separates")) + "</h3>" +
          '<ul class="cmp-diffs">' + diffs + (settingsMoved ? "" : '<li class="cmp-diff cmp-same" style="--i:' + changed.length + '">' + escapeHtml(t("cmp_same_settings_line")) + "</li>") + "</ul>" +
          '<p class="cmp-verdict" style="--i:' + (changed.length + 1) + '">' + escapeHtml(verdict) + "</p>" +
          brew("cmp-brew-bottom") +
        "</section>" +
        cupCard(b, "B", !f.sameCoffee) +
      "</div>" +
      table +
      '<section class="cmp-tastes"><h3 class="cmp-h">' + escapeHtml(t("cmp_tastes")) + "</h3>" + tasteDrawing(a, b) +
        '<p class="cmp-legend"><span class="cmp-key-a">' + escapeHtml(t("cmp_cup_label", { k: "A", d: fmtDateTime(a.date_time) })) + "</span>" +
        '<span class="cmp-key-b">' + escapeHtml(t("cmp_cup_label", { k: "B", d: fmtDateTime(b.date_time) })) + "</span></p></section>" +
      "</div>";
    // Rewritten only when it changed: a sync that brings nothing must not replay the entrance.
    const key = html.replace(" entering", "");
    if (!entering && key === view.renderedFor) return;
    view.renderedFor = key;
    z.innerHTML = html;
    z.hidden = false;
  }

  // ---------- Opening and closing ----------

  /* Runs fn once the history screen is the one shown and its hash written:
     activateScreen switches inside a view transition, so a history entry
     pushed before it would be rewritten by its replaceState. */
  function whenOnHistory(fn) {
    let tries = 0;
    const check = () => {
      const s = screen();
      if ((s && s.classList.contains("on") && location.hash === "#history") || tries++ > 50) { fn(); return; }
      setTimeout(check, 30);
    };
    check();
  }

  function openCompare(idA, idB) {
    const cups = cupsOf([idA, idB]);
    if (cups.length !== 2 || !screen() || !zone()) return false;
    const wasOpen = isOpen();
    const fromElsewhere = UI.nav.screenName !== "history";
    if (!wasOpen) view.scrollY = typeof window.scrollY === "number" ? window.scrollY : 0;
    view.ids = cups.map(e => e.id);
    /* Opening: the route is not written yet. Set BEFORE activateScreen, which
       renders the history at once when the page is hidden (no transition)
       and would otherwise close the page it is opening. */
    if (!wasOpen) view.pendingPush = true;
    // The side panel and the hover sheet belong to the list underneath.
    if (UI.panelIsOpen && UI.panelIsOpen()) UI.closePanel();
    if (UI.forgetHover) UI.forgetHover();
    if (fromElsewhere) { view.scrollY = 0; UI.activateScreen("history"); }
    screen().classList.add("comparing");
    render(true);
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0 });
    const push = () => {
      view.pendingPush = false;
      if (!isOpen() || location.hash === "#" + ROUTE || typeof history.pushState !== "function") return;
      try { history.pushState({ compare: view.ids }, "", "#" + ROUTE); view.pushed = true; } catch (e) { view.pushed = false; }
    };
    if (!wasOpen) {
      if (fromElsewhere) whenOnHistory(push); else push();
    }
    return true;
  }

  /* Closes the page. quiet: the history entry is already gone (Back, another
     screen); otherwise the page's own Back steps back through it. */
  function closeCompare(quiet) {
    if (!isOpen()) return;
    const pushed = view.pushed;
    view.ids = null; view.pushed = false; view.pendingPush = false; view.renderedFor = "";
    const s = screen(), z = zone();
    if (s) s.classList.remove("comparing");
    if (z) { z.hidden = true; z.innerHTML = ""; }
    if (!quiet && location.hash === "#" + ROUTE) {
      if (pushed && typeof history.back === "function") history.back();
      else if (typeof history.replaceState === "function") history.replaceState(null, "", "#history");
    }
    const y = view.scrollY;
    if (typeof window.scrollTo === "function") requestAnimationFrame(() => window.scrollTo({ top: y }));
  }

  /* Called at the end of every history render: the page follows the data
     and the language, and closes when its route was left without an event
     (the rail's Historique rewrites the hash with replaceState). */
  function refreshCompare() {
    if (!isOpen()) return;
    if (!view.pendingPush && location.hash !== "#" + ROUTE) { closeCompare(true); return; }
    render(false);
  }

  function wireCompare() {
    const z = zone();
    if (!z) return;
    z.addEventListener("click", ev => {
      const b = ev.target.closest("[data-cmp]");
      if (!b) return;
      const action = b.dataset.cmp;
      if (action === "back") { closeCompare(false); return; }
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.id);
      if (!ext) return;
      if (action === "brew") {
        // A one-time prefill, the « Refaire » path: nothing becomes a default.
        closeCompare(true);
        UI.redoCup(ext);
        toast(I18N.t("setting_prefilled"));
      } else if (action === "edit") {
        closeCompare(true);
        UI.loadExtractionIntoEntry(ext, false);
      }
    });
    // Back from the browser or the phone: the route is left, the page goes.
    window.addEventListener("popstate", () => { if (isOpen() && location.hash !== "#" + ROUTE) closeCompare(true); });
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !isOpen() || UI.nav.screenName !== "history") return;
      try { if (document.querySelector("dialog:modal")) return; } catch (e) { /* older engines */ }
      closeCompare(false);
    });
    /* Another screen: the page goes with the list it came from. Not while it
       is opening from another screen: the history screen is not shown yet. */
    if (typeof MutationObserver === "function" && screen()) {
      new MutationObserver(() => { if (isOpen() && !view.pendingPush && !screen().classList.contains("on")) closeCompare(true); })
        .observe(screen(), { attributes: true, attributeFilter: ["class"] });
    }
  }

  const compareOpen = isOpen;
  Object.assign(UI, { openCompare, closeCompare, refreshCompare, wireCompare, compareOpen, compareRows: rows, tasteAxes, clicksText });
})();
