/* O7 (v9.13): THE SIDE PANEL. The screen stays, the detail opens on the right.
 *
 * Until now, on a computer, every detail opened ON TOP of everything: a cup
 * opened the entry form, a coffee its sheet in a window, a recipe sent you
 * to the Guide. You lost the list you were reading. From 1,100 px wide, a
 * cup, a coffee or a recipe opens in a column on the right, the screen
 * shrinks beside it and stays usable (css/finishing.css), and the arrows walk
 * the list it came from: ↑ ↓ (or J K) for the next one, Escape to close.
 * Changing screens closes it: the list it walked is gone.
 *
 * Nothing is drawn twice. A cup is the history detail (UI.detailContent), a
 * recipe is the Guide card (UI.recipeCard), and a coffee is the coffee sheet
 * itself: its <dialog> opens with show() instead of showModal(), styled as
 * the panel. Below 1,100 px and on the phone, nothing changes: the cup opens
 * in the entry form, the sheet in its window, the recipe in the Guide.
 *
 * Wired by UI.wireSidePanel(), called from wireHistory (app.js is at its
 * 450-line cap). */
"use strict";

(() => {

  const { $, $$, titleAttr, isFailed, displayedDiags, extsWithCalcs, fmtDecimal, dayLabelOf, fmtHour, icon, toast } = UI;

  const WIDE = "(min-width: 1100px)";
  const isWide = () => typeof matchMedia === "function" && matchMedia(WIDE).matches;
  // Ids go into selectors: only the safe ones (the logbook's ids all are).
  const safeId = id => typeof id === "string" && /^[\w-]+$/.test(id);

  /* What the panel shows (a cup, a recipe or a coffee), and the list it came
     from. A list is a container selector, a row selector and the attribute
     carrying the id: it is re-read on every step, never kept as elements,
     since the screens re-render with the data. */
  const panel = { kind: null, id: null, list: null, screen: null };
  // The coffee about to open, noted before the sheet's own handler runs.
  let pendingSheet = null;

  /* A modal window is open (Mes cafés, a confirmation, the palette): a panel
     opened under it would be inert, so the window behaviour stays. */
  function modalOpen() {
    try { return !!document.querySelector("dialog:modal"); } catch (e) {
      return $$("dialog[open]").some(d => !d.classList.contains("as-panel"));
    }
  }
  function panelWanted() { return isWide() && !modalOpen(); }
  const sheetDialog = () => $("#modal-sheet");
  const sheetAsPanel = () => { const d = sheetDialog(); return !!(d && d.open && d.classList.contains("as-panel")); };
  const asideOpen = () => { const a = $("#side-panel"); return !!(a && !a.hidden); };
  function isOpen() { return asideOpen() || sheetAsPanel(); }

  // ---------- The lists ----------

  const CUP_LISTS = [
    { root: "#h-body", rows: "tr.row-hist", attr: "data-id" },
    { root: "#h-cards", rows: ".h-card", attr: "data-id" },
    { root: "#h-journal", rows: ".h-card", attr: "data-id" },
    { root: "#latest-list", rows: "tr.last-clickable", attr: "data-ext" },
  ];
  function cupListFrom(el) {
    if (!el || !el.closest) return null;
    const spec = CUP_LISTS.find(s => el.closest(s.root));
    if (spec) return { ...spec };
    return el.closest("#card-last") ? { ...CUP_LISTS[3] } : null;
  }
  /* A coffee or a recipe clicked anywhere: its siblings are the other items
     of the nearest container that has an id (the stock corner, a drawing,
     the tuning cards, the 30-day legend, the podium). */
  function listAround(el, attr) {
    const host = el && el.closest ? el.closest("[id]") : null;
    return host && safeId(host.id) ? { root: "#" + host.id, rows: "[" + attr + "]", attr } : null;
  }

  function idsOf(list, kind) {
    if (list && list.ids) return list.ids;
    const root = list && list.root ? $(list.root) : null;
    if (root) {
      const seen = [];
      root.querySelectorAll(list.rows + "[" + list.attr + "]").forEach(r => {
        const v = r.getAttribute(list.attr);
        if (v && !seen.includes(v)) seen.push(v);
      });
      if (seen.length) return seen;
    }
    // No list (the palette, a link): the natural order of the kind.
    if (kind === "cup") return DATA.state.extractions.slice()
      .sort((a, b) => String(b.date_time).localeCompare(String(a.date_time))).map(e => e.id);
    if (kind === "recipe") return UI.liveRecipes().map(r => r.id);
    if (kind === "coffee") return DATA.state.coffees.filter(c => c.active !== 0).map(c => c.id);
    return [];
  }

  function currentRow() {
    const l = panel.list;
    if (!l || !l.root || !safeId(panel.id)) return null;
    const root = $(l.root);
    return root ? root.querySelector(l.rows + "[" + l.attr + '="' + panel.id + '"]') : null;
  }

  /* The current item, marked in its list by ONE style rule written here: the
     lists re-render on every data change, and a class set on a row would
     vanish with it. */
  let markStyle = null;
  function markCurrent() {
    if (!markStyle) {
      markStyle = document.createElement("style");
      document.head.appendChild(markStyle);
    }
    const id = panel.id;
    if (!safeId(id) || !isOpen()) { markStyle.textContent = ""; return; }
    const q = '="' + id + '"]';
    markStyle.textContent = panel.kind === "cup"
      ? "tr.row-hist[data-id" + q + " > td, tr.last-clickable[data-ext" + q + " > td { background: var(--accent-bg); }" +
        "tr.row-hist[data-id" + q + " > td:first-child, tr.last-clickable[data-ext" + q + " > td:first-child { box-shadow: inset 3px 0 0 var(--accent); }" +
        ".h-card[data-id" + q + " { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }"
      : panel.kind === "coffee"
        ? ".sc-bag[data-sheet" + q + ", .lc-coffee[data-sheet" + q + " { outline: 2px solid var(--accent); outline-offset: 2px; }"
        : "";
  }

  // ---------- The panel shell ----------

  /* The screen makes room: main and the footer shrink by the panel width
     (css/finishing.css, .side-open). The dashboard calendar counts its weeks
     on resize, so we tell it the width changed. */
  function setRoom(on) {
    const had = document.body.classList.contains("side-open");
    document.body.classList.toggle("side-open", on);
    if (had !== on && typeof Event === "function" && window.dispatchEvent) window.dispatchEvent(new Event("resize"));
  }

  // refreshing: the same item redrawn (new data, new language), the reading position stays.
  function showAside(kind, id, list, html, title, refreshing) {
    const aside = $("#side-panel");
    if (!aside) return;
    // A coffee shown beside gives its place: one panel at a time.
    if (sheetAsPanel()) { panel.kind = null; sheetDialog().close(); }
    panel.kind = kind; panel.id = id; panel.list = list; panel.screen = UI.nav.screenName;
    $("#side-panel-kind").textContent = title;
    $("#side-panel-body").innerHTML = html;
    const ids = idsOf(list, kind), i = ids.indexOf(id);
    $("#side-panel-pos").textContent = i >= 0 && ids.length > 1 ? I18N.t("panel_position", { i: i + 1, n: ids.length }) : "";
    $$("#side-panel [data-panel-step]").forEach(b => {
      const target = i + Number(b.dataset.panelStep);
      b.disabled = i < 0 || target < 0 || target >= ids.length;
    });
    $("#side-panel-hint").textContent = I18N.t(kind === "cup" ? "panel_hint_cup" : "panel_hint");
    if (aside.hidden) {
      aside.hidden = false;
      // The entrance, restarted on each opening; prefers-reduced-motion cancels it in CSS.
      aside.classList.remove("sp-enter");
      void aside.offsetWidth;
      aside.classList.add("sp-enter");
    }
    if (!refreshing) {
      $("#side-panel-body").scrollTop = 0;
      // The keys now act on this cup, not on the one the mouse rested on before.
      if (UI.forgetHover) UI.forgetHover();
    }
    setRoom(true);
    markCurrent();
  }

  function closePanel() {
    if (asideOpen()) $("#side-panel").hidden = true;
    if (sheetAsPanel()) sheetDialog().close();
    panel.kind = null; panel.id = null; panel.list = null;
    setRoom(false);
    markCurrent();
  }

  // ---------- A cup ----------

  function cupHtml(e) {
    const coffee = DATA.coffeeOf(e);
    const coffeeName = I18N.tr(coffee ? coffee.name : e._c.coffee_name || "") || I18N.t("journal_unknown_coffee");
    const recipe = e.recipe ? UI.findRecipe(e.recipe) : null;
    const kpi = (v, l) => (v === "" || v === undefined || v === null ? ""
      : '<div class="sp-kpi"><b>' + v + "</b><span>" + l + "</span></div>");
    const dial = e.grind_dial
      ? titleAttr(e.grind_dial) + (e._c.microns ? "<small>" + e._c.microns + " µm</small>" : "")
      : e._c.ground ? I18N.t("bag_default") : "";
    const kpis = [
      kpi(e.dose_g !== "" ? e.dose_g + " g" : "", I18N.t("panel_dose")),
      kpi(e.water_g !== "" ? e.water_g + " g" : "", I18N.t("panel_water")),
      kpi(dial, I18N.t("panel_dial")),
      kpi(e._c.ratioText || "", I18N.t("detail_ratio")),
    ].join("");
    const compared = !!(UI.comparison && UI.comparison.has(e.id));
    const rating = e.score_10 !== ""
      ? '<b class="sp-rating">' + fmtDecimal(Number(e.score_10), 1) + "</b><span>" + I18N.t("dash_out_of_10") + "</span>"
      : '<span class="sp-unrated">' + I18N.t("not_rated_yet") + "</span>";
    const link = (kind, id, text, title) => '<button type="button" class="sp-link" data-sp="' + kind + '" data-sp-id="' + titleAttr(id) + '"' +
      (title ? ' title="' + titleAttr(title) + '"' : "") + ">" + titleAttr(text) + "</button>";
    return '<article class="sp-cup' + (isFailed(e) ? " failed" : "") + '">' +
      '<header class="sp-head">' +
        '<div class="sp-titles">' +
          '<p class="sp-eyebrow">' + titleAttr(dayLabelOf(e.date_time) + " " + fmtHour(e.date_time)) + "</p>" +
          '<h2 class="sp-title">' + (coffee ? link("coffee", coffee.id, coffeeName, I18N.t("sheet_view")) : titleAttr(coffeeName)) + "</h2>" +
          '<p class="sp-sub"><span class="dot-method ' + String(e.method || "").toLowerCase() + '"></span>' +
            titleAttr(I18N.machine(e.method || "")) +
            (e.recipe ? '<span class="sp-dot" aria-hidden="true">·</span>' +
              (recipe ? link("recipe", recipe.id, I18N.tr(e.recipe), "") : titleAttr(I18N.tr(e.recipe))) : "") + "</p>" +
        "</div>" +
        '<div class="sp-score">' + (isFailed(e) ? '<span class="badge-failed">' + I18N.t("botched_badge") + "</span>" : "") + rating + "</div>" +
      "</header>" +
      (kpis ? '<div class="sp-kpis">' + kpis + "</div>" : "") +
      (e.diagnostic ? '<p class="sp-diag">' + titleAttr(displayedDiags(e.diagnostic)) + "</p>" : "") +
      '<div class="sp-detail">' + UI.detailContent(e) + "</div>" +
      '<div class="sp-actions">' +
        '<button type="button" class="btn btn-primary btn-small" data-sp="redo">' + icon("dupliquer") + I18N.t("bubble_redo") + "</button>" +
        '<button type="button" class="btn btn-small" data-sp="edit">' + icon("modifier") + I18N.t("btn_edit") + "</button>" +
        '<button type="button" class="btn btn-small' + (compared ? " on" : "") + '" data-sp="compare" aria-pressed="' + compared + '">' +
          icon("comparer") + I18N.t("panel_compare") + "</button>" +
      "</div>" +
    "</article>";
  }

  /* Opens a cup: beside on a wide screen, in the entry form otherwise (the
     behaviour of every cup click until v9.12). `origin` is the clicked row,
     or a list. */
  function openCup(ext, origin) {
    const e = ext && extsWithCalcs().find(x => x.id === ext.id);
    if (!e) return;
    if (!panelWanted()) {
      UI.loadExtractionIntoEntry(DATA.state.extractions.find(x => x.id === e.id), false);
      return;
    }
    const list = origin && (origin.root || origin.ids) ? origin : cupListFrom(origin) || (panel.kind === "cup" ? panel.list : null);
    showAside("cup", e.id, list, cupHtml(e), I18N.t("panel_kind_cup"));
    const row = currentRow();
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }

  // ---------- A recipe ----------

  /* The Guide card, unchanged, with its attributes renamed: the Guide wires
     its own buttons on each render, and a copy of their data attributes here
     would get a second set of handlers. Its ids are prefixed, and the live
     4:6 block stays the Guide's. */
  function recipeHtml(r) {
    const group = r.family ? UI.liveRecipes().filter(x => x.family === r.family) : [];
    const card = UI.recipeCard(r, group.length > 1 ? group : null)
      .replace(/ id="body-/g, ' id="sp-body-').replace(/aria-controls="body-/g, 'aria-controls="sp-body-')
      .replace('<div class="tetsu-variants" id="tetsu-block"></div>', "")
      .replace(/data-(brew|walkthrough|recipe-edit|video|toggle|var-fam|var-id)=/g, "data-sp-$1=")
      .replace(/ collapsed"/, '"').replace(/aria-expanded="false"/, 'aria-expanded="true"');
    return '<div class="sp-recipe">' + card + "</div>" +
      '<div class="sp-actions"><button type="button" class="btn btn-small" data-sp="guide">' + I18N.t("panel_in_guide") + "</button></div>";
  }

  function openRecipe(id, origin) {
    const r = DATA.state.recipes.find(x => x.id === id);
    if (!r) return;
    if (!panelWanted()) { UI.activateScreen("guide"); UI.showRecipe(id); return; }
    const list = origin && (origin.root || origin.ids) ? origin
      : listAround(origin, "data-guide-recipe") || (panel.kind === "recipe" ? panel.list : null);
    showAside("recipe", id, list, recipeHtml(r), I18N.t("panel_kind_recipe"));
  }

  // ---------- A coffee: the sheet, beside ----------

  /* Called by js/ui-coffee-sheet.js instead of showModal(): true when the
     sheet opened as the panel, false to let it open as a window. */
  function showInSidePanel(dialog, coffeeId) {
    if (!dialog) return false;
    // The close event that removes the class comes on the next frame: a quick reopening as a window must not keep it.
    if (!panelWanted()) { dialog.classList.remove("as-panel"); return false; }
    if (asideOpen()) $("#side-panel").hidden = true;
    dialog.classList.add("as-panel");
    try { dialog.show(); } catch (e) { dialog.classList.remove("as-panel"); return false; }
    panel.kind = "coffee";
    panel.id = coffeeId;
    panel.screen = UI.nav.screenName;
    panel.list = pendingSheet && pendingSheet.id === coffeeId ? pendingSheet.list : null;
    pendingSheet = null;
    setRoom(true);
    markCurrent();
    return true;
  }

  function openCoffee(id, origin) {
    const list = origin && (origin.root || origin.ids) ? origin : listAround(origin, "data-sheet");
    pendingSheet = { id, list };
    UI.openSheet(id);
    // Already beside: openSheet only re-rendered it, the panel follows.
    if (sheetAsPanel()) { panel.kind = "coffee"; panel.id = id; panel.list = list || panel.list; markCurrent(); }
  }

  // ---------- Walking the list ----------

  function step(delta) {
    if (!isOpen() || !panel.kind) return false;
    const ids = idsOf(panel.list, panel.kind);
    const i = ids.indexOf(panel.id);
    const target = ids[i + delta];
    if (i < 0 || !target) return false;
    const list = panel.list || { ids };
    if (panel.kind === "cup") openCup({ id: target }, list);
    else if (panel.kind === "recipe") openRecipe(target, list);
    else openCoffee(target, list);
    const row = currentRow();
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    // Keyboard users walking the list with the focus on a row keep it on the new one.
    const active = document.activeElement;
    if (row && active && active.closest && panel.list && panel.list.root && active.closest(panel.list.root)) {
      if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "-1");
      row.focus({ preventScroll: true });
    }
    return true;
  }

  // The cup the panel shows, for the keyboard shortcuts (E, C, R).
  const panelCupId = () => (asideOpen() && panel.kind === "cup" ? panel.id : null);

  // ---------- Re-rendering, on data and language changes ----------

  function refresh() {
    if (!asideOpen() || !panel.kind) return;
    if (panel.kind === "cup") {
      const e = extsWithCalcs().find(x => x.id === panel.id);
      if (!e) { closePanel(); return; }
      showAside("cup", e.id, panel.list, cupHtml(e), I18N.t("panel_kind_cup"), true);
    } else if (panel.kind === "recipe") {
      const r = DATA.state.recipes.find(x => x.id === panel.id);
      if (!r) { closePanel(); return; }
      showAside("recipe", r.id, panel.list, recipeHtml(r), I18N.t("panel_kind_recipe"), true);
    }
  }

  // ---------- Wiring ----------

  function onRecipeCardClick(b) {
    const d = b.dataset;
    if (d.spVarId) { openRecipe(d.spVarId, panel.list); return; }
    if (d.spToggle) {
      const open = b.closest(".recipe-card").classList.toggle("collapsed") === false;
      b.setAttribute("aria-expanded", String(open));
      return;
    }
    if (d.spVideo) { UI.startVideo(b); return; }
    if (d.spWalkthrough) { UI.openWalkthrough(d.spWalkthrough); return; }
    if (d.spRecipeEdit) { UI.openRecipesModal(); UI.openRecipeForm(d.spRecipeEdit); return; }
    if (d.spBrew) { closePanel(); UI.brewRecipe(d.spBrew); }
  }

  function onPanelClick(ev) {
    const stepper = ev.target.closest("[data-panel-step]");
    if (stepper) { step(Number(stepper.dataset.panelStep)); return; }
    if (ev.target.closest("#side-panel-close")) { closePanel(); return; }
    const inCard = ev.target.closest(".sp-recipe [data-sp-brew], .sp-recipe [data-sp-walkthrough], .sp-recipe [data-sp-recipe-edit]," +
      " .sp-recipe [data-sp-video], .sp-recipe [data-sp-toggle], .sp-recipe [data-sp-var-id]");
    if (inCard) { onRecipeCardClick(inCard); return; }
    const a = ev.target.closest("[data-sp]");
    if (!a) return;
    const action = a.dataset.sp;
    if (action === "coffee") { openCoffee(a.dataset.spId); return; }
    if (action === "recipe") { openRecipe(a.dataset.spId); return; }
    if (action === "guide") {
      const id = panel.id;
      closePanel();
      UI.activateScreen("guide");
      UI.showRecipe(id);
      return;
    }
    const ext = DATA.state.extractions.find(x => x.id === panel.id);
    if (!ext) return;
    if (action === "redo") { closePanel(); UI.redoCup(ext); toast(I18N.t("toast_duplicated")); }
    else if (action === "edit") { closePanel(); UI.loadExtractionIntoEntry(ext, false); }
    else if (action === "compare") compareCup(ext.id);
  }

  /* Into the history comparator (two cups side by side). The second one
     opens the comparison by itself. */
  function compareCup(id) {
    const had = UI.comparison.has(id);
    UI.toggleComparison(id);
    if (UI.comparison.size < 2) toast(I18N.t(had ? "panel_compare_removed" : "panel_compare_added"));
    refresh();
  }

  /* The dashboard's latest cups and its big card open the extraction for
     editing (js/ui-dashboard.js). On a wide screen we take the click first,
     in the capture phase, and open the panel instead. */
  function interceptCups(zone) {
    if (!zone) return;
    const take = ev => {
      if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
      if (!panelWanted()) return;
      const row = ev.target.closest("[data-ext]");
      if (!row) return;
      const ext = DATA.state.extractions.find(x => x.id === row.dataset.ext);
      if (!ext) return;
      ev.stopPropagation();
      ev.preventDefault();
      openCup(ext, row);
    };
    zone.addEventListener("click", take, true);
    zone.addEventListener("keydown", take, true);
  }

  function wireSidePanel() {
    const aside = $("#side-panel");
    if (!aside) return;
    aside.addEventListener("click", onPanelClick);
    interceptCups($("#latest-list"));
    interceptCups($("#card-last"));
    // The recipe podium (js/ui-drawings.js) sends to the Guide: beside, on a wide screen.
    const drawings = $("#card-drawings");
    if (drawings) {
      const takeRecipe = ev => {
        const stepEl = ev.target.closest && ev.target.closest("[data-guide-recipe]");
        if (!stepEl || !panelWanted()) return;
        if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
        ev.stopPropagation();
        ev.preventDefault();
        openRecipe(stepEl.getAttribute("data-guide-recipe"), stepEl);
      };
      drawings.addEventListener("click", takeRecipe, true);
      drawings.addEventListener("keydown", takeRecipe, true);
    }
    /* A coffee opens through the sheet's own delegated handler: we only note
       which list it came from, before it runs. Already beside, the sheet
       re-renders in place and the panel follows. */
    const noteCoffee = ev => {
      if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
      const b = ev.target.closest && ev.target.closest("[data-sheet]");
      if (!b) return;
      const id = b.getAttribute("data-sheet"), list = listAround(b, "data-sheet");
      pendingSheet = { id, list };
      if (sheetAsPanel()) { panel.kind = "coffee"; panel.id = id; panel.list = list; setTimeout(markCurrent, 0); }
    };
    document.addEventListener("click", noteCoffee, true);
    document.addEventListener("keydown", noteCoffee, true);
    const sheet = sheetDialog();
    if (sheet) {
      sheet.addEventListener("close", () => {
        const wasPanel = sheet.classList.contains("as-panel");
        sheet.classList.remove("as-panel");
        if (!wasPanel) return;
        if (panel.kind === "coffee") { panel.kind = null; panel.id = null; panel.list = null; }
        if (!asideOpen()) setRoom(false);
        markCurrent();
      });
    }
    // Narrowing the window under 1,100 px closes the panel: there is no room left for it.
    if (typeof matchMedia === "function") {
      const mq = matchMedia(WIDE);
      if (mq.addEventListener) mq.addEventListener("change", () => { if (!mq.matches && isOpen()) closePanel(); });
    }
    /* Another screen (the rail, a link, the palette, a shortcut): the list the
       panel walked is gone, the panel goes with it. Watched on the screens
       themselves, whatever path changed them. */
    if (typeof MutationObserver === "function") {
      const watch = new MutationObserver(() => { if (isOpen() && panel.screen && UI.nav.screenName !== panel.screen) closePanel(); });
      $$(".screen").forEach(sec => watch.observe(sec, { attributes: true, attributeFilter: ["class"] }));
    }
    DATA.subscribe(kind => { if (kind !== "sync") refresh(); });
    I18N.subscribe(refresh);
  }

  // Under the names the other files read.
  const panelStep = step, panelIsOpen = isOpen;
  Object.assign(UI, {
    wireSidePanel, openCup, openRecipe, openCoffee, showInSidePanel, closePanel, compareCup,
    panelStep, panelIsOpen, panelWanted, panelCupId, cupListFrom,
  });
})();
