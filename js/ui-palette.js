/* P1 + M5 (v9.13): SEARCH AND ACT, Ctrl K.
 *
 * Every action of the logbook went through a screen and a button. One key
 * now opens a field that finds a coffee, a cup by its comment or its tastes,
 * a recipe, a page of the Guide, and offers what to do: a new cup, brew a
 * coffee with its winning setting, redo the last cup, go to a screen. The
 * arrows choose, Enter runs, Escape closes; the mouse works too.
 *
 * Ctrl K (⌘ K on a Mac) from anywhere, or the « Chercher » button of the rail.
 * On the phone the rail is the « Plus » sheet: the same button opens the same
 * search, full screen. The ranking lives in js/search.js (pure, tested), the
 * Guide index in js/ui-guide.js (the Guide search builds it): nothing is
 * indexed twice. */
"use strict";

(() => {

  const { $, $$, titleAttr, extsWithCalcs, analyzableExts, fmtDecimal, average, fallbacks, dayLabelOf, fmtHour, toast } = UI;

  const state = { items: [], results: [], active: 0, query: "", cupIds: [] };
  const fmtRating = n => fmtDecimal(n, 1);
  const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

  /* The palette's icons, same drawing as the rail (1.8 px stroke). The core's
     UI.icon() holds those of the history actions; these only live here. */
  const ICONS = {
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    redo: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    brew: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5v2M12 3.5v2"/>',
    coffee: '<ellipse cx="12" cy="12" rx="6.2" ry="8.8" transform="rotate(32 12 12)"/><path d="M8.6 6.2c2.6 2.2 1.2 4.6 3.4 6.6s3.2 2.4 3.4 5"/>',
    cup: '<path d="M5 9h12v4a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2 2 0 0 1 0 4H17"/><path d="M4 21h15"/>',
    recipe: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19"/><path d="M8 7.5h7"/>',
    guide: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.6h.01"/>',
    screen: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
    taste: '<path d="M12 21c-4.4 0-7-3-7-6.5C5 9 12 3 12 3s7 6 7 11.5c0 3.5-2.6 6.5-7 6.5z"/><path d="M9.5 15.5c.6 1.3 1.6 2 3 2"/>',
  };
  const ico = name => '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  const GROUP_ICON = { actions: "plus", coffees: "coffee", cups: "cup", recipes: "recipe", tastes: "taste", guide: "guide", screens: "screen", history: "search" };

  // ---------- What can be found ----------

  // The screens, their keys, and the words that lead to them in both languages.
  const SCREENS = [
    ["dashboard", "G A", "accueil tableau de bord dashboard home"],
    ["history", "G H", "historique par date history log"],
    ["journal", "G J", "journal par sachet bag"],
    ["coffees", "G C", "mes cafes sachets bocaux stock etagere racheter coffees bags jars shelf"],
    ["tuning", "G T", "mes reglages gagnants meilleurs tuning best settings"],
    ["guide", "G G", "guide recettes vocabulaire recipes"],
    ["settings", "G P", "parametres reglages settings preferences"],
    ["entry", "N", "saisie entry form"],
  ];
  function screenLabel(s) {
    if (s === "journal") return I18N.t("palette_journal");
    const entry = $('.rail-entry[data-screen="' + s + '"] span');
    return entry && entry.textContent ? entry.textContent.trim() : s;
  }
  function goTo(s) {
    if (s === "journal") UI.openHistoryView("bag");
    else if (s === "history") UI.openHistoryView("date");
    else UI.activateScreen(s);
  }

  // The coffees, most recently brewed first: that is the order of the « Brasser » actions.
  function coffeesByRecency(exts) {
    const last = new Map();
    exts.forEach(e => { if (String(e.date_time) > (last.get(e.coffee_id) || "")) last.set(e.coffee_id, String(e.date_time)); });
    return DATA.state.coffees.slice().sort((a, b) =>
      (a.active === 0) - (b.active === 0) || String(last.get(b.id) || "").localeCompare(String(last.get(a.id) || "")));
  }

  /* A cup reads by what Chris wrote: its comment as the title (cut around
     the word found, see excerpt), the day, the coffee, the recipe and the
     rating below. Without a comment, the coffee is the title. */
  const cupWhen = e => dayLabelOf(e.date_time) + " " + fmtHour(e.date_time);
  function cupTitle(e) {
    const c = String(e.comment || "").trim();
    return c ? "« " + (c.length > 70 ? c.slice(0, 68).trim() + "…" : c) + " »" : I18N.tr(e._c.coffee_name || "");
  }
  function cupLine(e) {
    return [cupWhen(e), String(e.comment || "").trim() ? I18N.tr(e._c.coffee_name || "") : "", I18N.tr(e.recipe || ""),
      e.score_10 !== "" ? fmtRating(Number(e.score_10)) : ""].filter(Boolean).join(" · ");
  }
  /* The comment cut so that the first word found shows, even on a phone:
     « …zéro amertume. » rather than « Superbe, notes de ja… ». */
  function excerpt(text, query) {
    const t = String(text || "").trim();
    const w = SEARCH.words(query)[0];
    const i = w ? SEARCH.fold(t).indexOf(w) : -1;
    if (i <= 24 || SEARCH.fold(t).length !== t.length) return t;
    const from = t.lastIndexOf(" ", i - 12);
    return "…" + t.slice(from < 0 ? i : from + 1);
  }

  // Brewing: the sheet's « Brasser ce café » (a fresh entry on this coffee).
  function brewCoffee(id) {
    UI.resetEntry();
    const sel = $("#f-coffee");
    sel.value = id;
    if (sel.value === id) UI.onCoffeeChoice();
    else toast(I18N.t("sheet_inactive"));
    UI.activateScreen("entry");
  }
  // Brewing with the winning setting: the « Refaire » of Mes réglages, on its reference cup.
  function brewBest(referenceId) {
    const ext = DATA.state.extractions.find(e => e.id === referenceId);
    if (!ext) return;
    UI.redoCup(ext);
    toast(I18N.t("setting_prefilled"));
  }
  function redoLast() { toast(I18N.t(UI.redoLast() ? "toast_redo" : "toast_redo_empty")); }
  // « Chez toi » of the Guide card, short: your average on this recipe.
  function atHome(r, analyzable) {
    const ratings = analyzable.filter(e => e.recipe === r.name && e.score_10 !== "").map(e => Number(e.score_10));
    return ratings.length ? I18N.t("palette_at_home", { m: fmtRating(average(ratings)) }) : I18N.t("recipe_never_made");
  }

  /* Every item, built once per opening: what it matches on (name, detail,
     keywords, read by SEARCH) and what it shows (title, sub, hint or keys). */
  function buildItems() {
    const items = [];
    const exts = extsWithCalcs();
    const analyzable = analyzableExts();
    const latest = exts.slice().sort((a, b) => String(b.date_time).localeCompare(String(a.date_time)));
    const coffees = coffeesByRecency(exts);

    items.push({ group: "actions", name: I18N.t("palette_new"), detail: I18N.t("palette_new_words"), title: I18N.t("palette_new"),
      kbd: "N", icon: "plus", order: 0, run: () => UI.activateScreen("entry") });
    if (latest.length) items.push({ group: "actions", name: I18N.t("palette_redo"), detail: I18N.t("palette_redo_words"),
      title: I18N.t("palette_redo"), sub: cupWhen(latest[0]) + " · " + I18N.tr(latest[0]._c.coffee_name || ""), kbd: "R", icon: "redo", order: 1, run: redoLast });
    coffees.filter(c => c.active !== 0).forEach((c, i) => {
      const report = TUNING.forCoffee(c.id, analyzable);
      const best = report.best;
      if (best) items.push({
        group: "actions", name: c.name, detail: I18N.t("palette_brew_words"), title: I18N.t("palette_brew_best", { c: c.name }),
        sub: [I18N.tr(best.recipe || ""), best.grind || I18N.t("bag_default"), I18N.t("palette_best_score", { m: fmtRating(best.average), n: best.n })].filter(Boolean).join(" · "),
        icon: "brew", order: 2 + i * 2, coffee: c.id, run: () => brewBest(best.referenceId),
      });
      items.push({ group: "actions", name: c.name, detail: I18N.t("palette_new_words"), title: I18N.t("palette_new_of", { c: c.name }),
        icon: "plus", order: 3 + i * 2, run: () => brewCoffee(c.id) });
    });

    coffees.forEach((c, i) => {
      const own = exts.filter(e => e.coffee_id === c.id);
      const rated = analyzable.filter(e => e.coffee_id === c.id && e.score_10 !== "");
      const stock = DATA.bagStock(c.id, fallbacks.dose);
      items.push({
        group: "coffees", name: c.name, detail: [c.roaster, c.origin, c.species, c.process, c.roast].filter(Boolean).join(" "),
        keywords: [c.roaster_notes, c.tag].filter(Boolean).join(" "), title: c.name,
        sub: [stock ? Math.max(0, Math.round(stock.remaining)) + " g" : "",
          rated.length ? fmtRating(average(rated.map(e => Number(e.score_10)))) : "",
          I18N.t("palette_cups", { n: own.length, s: own.length > 1 ? "s" : "" }),
          c.active === 0 ? I18N.t("list_inactive") : ""].filter(Boolean).join(" · "),
        hint: I18N.t("palette_hint_sheet"), order: i, run: () => UI.openCoffee(c.id),
      });
    });

    latest.forEach((e, i) => {
      const tags = String(e.descriptors || "").split("|").filter(Boolean);
      const diags = String(e.diagnostic || "").split("|").filter(Boolean);
      items.push({
        group: "cups", id: e.id, name: e.comment || "",
        detail: [e._c.coffee_name, ...tags, ...tags.map(t => I18N.tag(t)), ...diags, ...diags.map(d => I18N.diag(d)),
          e.recipe, I18N.tr(e.recipe || "")].filter(Boolean).join(" "),
        keywords: [e.method, dayLabelOf(e.date_time)].filter(Boolean).join(" "),
        title: cupTitle(e), quote: String(e.comment || "").trim(), sub: cupLine(e), hint: I18N.t("palette_hint_cup"), order: i,
        run: () => UI.openCup(e, { ids: state.cupIds.length ? state.cupIds : null }),
      });
    });

    UI.liveRecipes().forEach((r, i) => {
      const names = [...new Set([r.name, I18N.tr(r.name)])].join(" ");
      items.push({
        group: "recipes", name: names, detail: [r.method, I18N.tr(r.subtitle || "")].filter(Boolean).join(" "),
        keywords: [I18N.tr(r.bestFor || ""), (r.pairedCoffees || []).join(" ")].join(" "),
        title: I18N.tr(r.name), sub: [r.method, r.dose && r.water ? r.dose + " g / " + r.water + " g" : "", atHome(r, analyzable)].filter(Boolean).join(" · "),
        hint: I18N.t("palette_hint_recipe"), order: i, run: () => UI.openRecipe(r.id),
      });
    });

    /* The tasting vocabulary: a taste, its definition, and the cups that
       carry it (the history, searched on its stored French name). */
    const perTag = new Map();
    exts.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => perTag.set(t, (perTag.get(t) || 0) + 1)));
    DESCRIPTOR_GROUPS.forEach(g => g.tags.forEach(t => {
      const n = perTag.get(t) || 0;
      items.push({
        group: "tastes", name: [...new Set([t, I18N.tag(t)])].join(" "), detail: I18N.group(g.name), keywords: I18N.tagInfo(t),
        title: I18N.tag(t), sub: [I18N.group(g.name), I18N.t("palette_cups", { n, s: n > 1 ? "s" : "" }), I18N.tagInfo(t)].filter(Boolean).join(" · "),
        hint: I18N.t("palette_hint_taste"), icon: "taste", order: -n, run: () => UI.openHistoryOn({ "h-search": t }),
      });
    }));

    UI.guideSearchIndex().filter(x => !x.recipe).forEach((x, i) => {
      items.push({
        group: "guide", name: x.title, detail: x.detail, title: x.title, sub: x.detail,
        hint: I18N.t(x.type), order: i, run: () => { UI.activateScreen("guide"); UI.goToGuideEntry(x); },
      });
    });

    SCREENS.forEach(([s, keys, words], i) => {
      const label = screenLabel(s);
      items.push({ group: "screens", name: label, detail: words, title: I18N.t("palette_go", { s: label }), kbd: keys, icon: "screen",
        order: i, run: () => goTo(s) });
    });
    items.push({ group: "screens", name: I18N.t("palette_help"), detail: "raccourcis clavier aide keyboard shortcuts help",
      title: I18N.t("palette_help"), kbd: "?", icon: "keys", order: SCREENS.length, run: () => UI.toggleShortcutsHelp(true) });
    return items;
  }

  /* With nothing typed: what you open the palette for most of the time.
     A new cup, the last one again, the coffee of the moment with its winning
     setting, the three latest cups, the screens. */
  function defaults(items) {
    const actions = items.filter(x => x.group === "actions");
    const pick = [actions.find(x => x.kbd === "N"), actions.find(x => x.kbd === "R"),
      ...actions.filter(x => x.coffee).slice(0, 2)].filter(Boolean);
    return [...pick, ...items.filter(x => x.group === "cups").slice(0, 3), ...items.filter(x => x.group === "screens")];
  }

  /* Ranked by js/search.js, then one last line: the same words in the
     history search, for when the five cups shown are not enough. */
  function compute(query) {
    state.query = query;
    const q = query.trim();
    if (!q) {
      state.results = defaults(state.items);
      state.cupIds = [];
    } else {
      state.results = SEARCH.rank(state.items, q);
      // The arrows of the side panel walk ALL the matching cups, not only the five shown.
      state.cupIds = SEARCH.rank(state.items.filter(x => x.group === "cups"), q, { cups: 100000 }).map(x => x.id);
      if (SEARCH.words(q).join("").length >= 2) {
        state.results.push({ group: "history", title: I18N.t("palette_in_history", { q }), sub: I18N.t("palette_in_history_sub"),
          icon: "search", run: () => UI.openHistoryOn({ "h-search": q }) });
      }
    }
    state.active = 0;
  }

  // ---------- Display ----------

  /* The typed words, underlined in the title. The fold keeps the length of
     the text (accents are separate code points once decomposed) except for
     œ and æ: then we do not underline rather than underline beside. */
  function highlight(text, query) {
    const plain = String(text || "");
    const words = SEARCH.words(query);
    const folded = SEARCH.fold(plain);
    if (!words.length || folded.length !== plain.length) return titleAttr(plain);
    const marks = new Array(plain.length).fill(false);
    words.forEach(w => { let i = folded.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = folded.indexOf(w, i + w.length); } });
    let html = "", open = false;
    for (let i = 0; i < plain.length; i++) {
      if (marks[i] && !open) { html += "<mark>"; open = true; }
      if (!marks[i] && open) { html += "</mark>"; open = false; }
      html += titleAttr(plain[i]);
    }
    return html + (open ? "</mark>" : "");
  }

  function keysHtml(keys) {
    return '<span class="cmd-keys">' + keys.split(" ").map(k => "<kbd>" + titleAttr(k) + "</kbd>").join("") + "</span>";
  }

  function render() {
    const zone = $("#cmd-results");
    if (!zone) return;
    let html = "", group = null;
    state.results.forEach((it, i) => {
      if (it.group !== group) {
        if (group !== null) html += "</div>";
        group = it.group;
        html += '<div class="cmd-group" role="group" aria-labelledby="cmd-g-' + group + '"><p class="cmd-group-name" id="cmd-g-' + group + '">' +
          I18N.t("palette_group_" + group) + "</p>";
      }
      html += '<div class="cmd-item' + (i === state.active ? " on" : "") + '" role="option" id="cmd-opt-' + i + '" data-i="' + i +
        '" aria-selected="' + (i === state.active) + '">' +
        '<span class="cmd-ico">' + ico(it.icon || GROUP_ICON[it.group]) + "</span>" +
        '<span class="cmd-text"><b>' + (it.quote && state.query.trim() ? "« " + highlight(excerpt(it.quote, state.query), state.query) + " »" : highlight(it.title, state.query)) + "</b>" + (it.sub ? "<small>" + titleAttr(it.sub) + "</small>" : "") + "</span>" +
        (it.kbd ? keysHtml(it.kbd) : it.hint ? '<span class="cmd-hint">' + titleAttr(it.hint) + "</span>" : "") +
        "</div>";
    });
    if (group !== null) html += "</div>";
    zone.innerHTML = state.results.length ? html
      : '<p class="cmd-nothing">' + titleAttr(I18N.t("palette_nothing", { q: state.query.trim() })) + "</p>";
    const input = $("#cmd-input");
    if (input) {
      if (state.results.length) input.setAttribute("aria-activedescendant", "cmd-opt-" + state.active);
      else input.removeAttribute("aria-activedescendant");
    }
  }

  function setActive(i, scroll) {
    if (!state.results.length) return;
    state.active = (i + state.results.length) % state.results.length;
    $$("#cmd-results .cmd-item").forEach(el => {
      const on = Number(el.dataset.i) === state.active;
      el.classList.toggle("on", on);
      el.setAttribute("aria-selected", String(on));
      if (on && scroll && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
    $("#cmd-input").setAttribute("aria-activedescendant", "cmd-opt-" + state.active);
  }

  // ---------- Opening, running ----------

  const dialog = () => $("#modal-cmd");
  const isPaletteOpen = () => { const d = dialog(); return !!(d && d.open); };

  function openPalette() {
    const d = dialog();
    if (!d || d.open) return;
    // On the phone, the « Plus » sheet that holds the button closes first.
    const rail = $("#rail");
    if (rail && rail.classList.contains("expanded") && $("#overlay-nav")) $("#overlay-nav").click();
    state.items = buildItems();
    const input = $("#cmd-input");
    input.value = "";
    compute("");
    render();
    d.showModal();
    input.focus();
  }
  function closePalette() { const d = dialog(); if (d && d.open) d.close(); }
  function togglePalette() { if (isPaletteOpen()) closePalette(); else openPalette(); }

  function runItem(i) {
    const it = state.results[i];
    if (!it) return;
    // Closed BEFORE running: the side panel refuses to open under a modal window.
    closePalette();
    it.run();
  }

  function wirePalette() {
    const d = dialog();
    if (!d) return;
    const input = $("#cmd-input");
    input.addEventListener("input", () => { compute(input.value); render(); });
    input.addEventListener("keydown", ev => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        setActive(state.active + (ev.key === "ArrowDown" ? 1 : -1), true);
      } else if (ev.key === "Enter" && !ev.isComposing) {
        ev.preventDefault();
        runItem(state.active);
      }
    });
    const results = $("#cmd-results");
    results.addEventListener("click", ev => {
      const it = ev.target.closest(".cmd-item");
      if (it) runItem(Number(it.dataset.i));
    });
    // The mouse chooses too, without stealing the focus from the field.
    results.addEventListener("mousemove", ev => {
      const it = ev.target.closest(".cmd-item");
      if (it && Number(it.dataset.i) !== state.active) setActive(Number(it.dataset.i), false);
    });
    results.addEventListener("mousedown", ev => { if (ev.target.closest(".cmd-item")) ev.preventDefault(); });
    $("#cmd-close").addEventListener("click", closePalette);
    // A click on the backdrop closes, like Escape.
    d.addEventListener("click", ev => { if (ev.target === d) closePalette(); });
    const button = $("#btn-search");
    if (button) button.addEventListener("click", openPalette);
    // ⌘ K on a Mac, written as such.
    if (isMac()) $$("[data-key-mod]").forEach(k => { k.textContent = "⌘"; });

    /* Ctrl K or ⌘ K, from anywhere, even from a field: that is the point of
       the combination. In the capture phase, before the fields' own keys. Not
       over another window (the brew mode, Mes cafés): its actions would land
       behind it. */
    document.addEventListener("keydown", ev => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || String(ev.key).toLowerCase() !== "k") return;
      if (!isPaletteOpen() && !onlyPanelsOpen()) return;
      ev.preventDefault();
      togglePalette();
    }, true);
    // The language changed while open: the texts are rebuilt.
    I18N.subscribe(() => { if (isPaletteOpen()) { state.items = buildItems(); compute(input.value); render(); } });
  }
  // No window open, apart from the coffee sheet shown as the side panel.
  function onlyPanelsOpen() {
    return !$$("dialog[open]").some(x => x !== dialog() && !x.classList.contains("as-panel"));
  }

  // For the tests: what the palette lists for a query, without the DOM.
  function paletteResults(q) {
    state.items = buildItems();
    compute(q || "");
    return state.results;
  }

  Object.assign(UI, { wirePalette, openPalette, closePalette, togglePalette, isPaletteOpen, paletteResults });
})();
