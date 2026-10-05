/* Guide screen: the reference recipes, the step-by-step mode, the grind
 * converter and the range tables.
 *
 * The recipes shown here adapt to the grams of water actually entered: a
 * recipe written for 240 g shown as-is to someone pouring 150 would be a
 * trap, not a reference. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, debounce, titleAttr, setPressed, saveFallbacks, analyzableExts, fmtDecimal, fmtDuration, average,
    paintSlider, recipeWithVariants, liveRecipes, fallbacks, toast } = UI;

  // ---------- Reference: recipes ----------

  const tetsuChoice = { p40: "sucre", p60: "plein" };
  const familySelection = {}; // family -> id of the displayed variant

  /* THE GUIDE AS A LIBRARY (v8.52). Two new things on each recipe, both
     computed, nothing written by hand:

     - its coffee PROFILES, for the filters: washed or fermented, read from its
       "Who it's for" text, the first sentence first (« Les lavés propres… »,
       « Les fermentés, natural, honey… »), the whole text otherwise. A recipe
       that targets no profile (the Brikkas) applies to all and shows under both.
       Linked coffees were tried and dropped: the Balanced, washed, appears in
       almost every list and made everything "washed". Changing a recipe's
       text changes its filter;
     - "At home": the average of your rated cups on THIS recipe. */
  const WASHED = /lav|wash/i, FERMENTED = /natur|honey|ana[eé]ro|ferment/i;
  function recipeProfiles(r) {
    const text = String(r.bestFor || "");
    const readProfiles = t => [WASHED.test(t) ? "lave" : "", FERMENTED.test(t) ? "fermente" : ""].filter(Boolean);
    const firstSentence = readProfiles(text.split(/[.:]/)[0]);
    const p = firstSentence.length ? firstSentence : readProfiles(text);
    return p.length ? p : ["lave", "fermente"];
  }
  /* A6 (v8.85): RECIPES COLLAPSE. Sixteen phone screens to scroll down the
     Guide, every recipe expanded while you are looking for one. Collapsed, a
     recipe fits on one line: brewer, dose and water, temperature, your rating
     at home. The ones you open stay open from one visit to the next. */
  const OPEN_KEY = "guide-open-recipes";
  const openRecipes = new Set();
  try { JSON.parse(localStorage.getItem(OPEN_KEY) || "[]").forEach(id => openRecipes.add(id)); } catch (e) { /* without storage, everything collapsed */ }
  function toggleRecipe(id, expand) {
    if (expand) openRecipes.add(id); else openRecipes.delete(id);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openRecipes])); } catch (e) { /* same */ }
  }
  function homeRating(r) {
    const ratings = analyzableExts().filter(e => e.recipe === r.name && e.score_10 !== "").map(e => Number(e.score_10));
    return ratings.length ? fmtDecimal(average(ratings), 1) : "";
  }
  // O3 (v9.19): « Chez toi » grew the curve of your scores and your best setting (js/ui-tuning.js).
  function atHome(r) { return UI.recipeAtHome(r); }
  const filter = { value: "all" };
  try { filter.value = localStorage.getItem("guide-filter") || "all"; } catch (e) { /* without storage, all */ }
  function applyFilter() {
    $$("#grid-recipes .recipe-card").forEach(c => {
      const v = filter.value;
      c.hidden = !(v === "all" || c.classList.contains(v.toLowerCase()) || (c.dataset.profiles || "").split(" ").includes(v));
    });
    $$("#library-filters [data-filter]").forEach(b => setPressed(b, b.dataset.filter === filter.value));
    const empty = $("#library-empty");
    if (empty) empty.hidden = $$("#grid-recipes .recipe-card").some(c => !c.hidden);
  }

  /* THE GUIDE TABS (v8.52). The table of contents shows ONE panel at a time,
     the one holding the link target; anchors remain, and a target that is not
     at the top of its panel (What to buy, Buying rules) scrolls into view.
     Recipes first, and the chosen tab is remembered. */
  function showGuide(target) {
    const el = target ? document.getElementById(target) : null;
    const panel = el ? el.closest(".guide-panel") : $("#gp-" + (target || "recipes"));
    if (!panel) return;
    $$(".guide-panel").forEach(p => { p.hidden = p !== panel; });
    $$(".guide-tabs [data-guide]").forEach(a => {
      const active = a.dataset.guide === panel.dataset.panel;
      a.classList.toggle("current", active);
      if (active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    try { localStorage.setItem("guide-tab", panel.dataset.panel); } catch (e) { /* never mind */ }
    if (el && el !== panel.querySelector("h2, .ref-title-row h2")) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Opens ONE recipe in the Guide (v8.53, the dashboard podium): its displayed
     variant if it belongs to a family, the filter reset to "All" so it is not
     hidden, then the card centred, briefly highlighted. */
  function showRecipe(id) {
    const r = DATA.state.recipes.find(x => x.id === id);
    if (!r) { showGuide("ref-recipes"); return; }
    if (r.family) familySelection[r.family] = r.id;
    toggleRecipe(id, true);
    filter.value = "all";
    renderRecipes();
    showGuide("ref-recipes");
    const card = $('#grid-recipes [data-recipe="' + id + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("recipe-revealed");
    setTimeout(() => card.classList.remove("recipe-revealed"), 1800);
  }

  /* THE RECIPE VIDEO (v8.64). A YouTube link becomes "Watch the video": the
     player only loads on click, inside the card, from youtube-nocookie (no
     cookie until something is played, and no surprise sound when the Guide
     opens). Any other link stays a link. */
  const youtubeId = url => (String(url || "").match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || "";
  const attr = TOOLS.escapeHtml;
  function videoBlock(r) {
    if (!r.video) return "";
    const id = youtubeId(r.video);
    return '<div class="recipe-video">' +
      (id ? '<button type="button" class="btn btn-small" data-video="' + id + '">' + I18N.t("library_video") + "</button>" : "") +
      '<a class="recipe-video-link" href="' + attr(r.video) + '" target="_blank" rel="noopener">' +
      I18N.t(id ? "library_youtube" : "library_source") + "</a></div>";
  }
  function startVideo(button) {
    const frame = document.createElement("iframe");
    frame.className = "recipe-player";
    frame.src = "https://www.youtube-nocookie.com/embed/" + button.dataset.video + "?autoplay=1&rel=0";
    frame.title = I18N.t("library_video");
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    button.replaceWith(frame);
  }

  /* THE VIDEO IN THE ENTRY FORM (v8.69), under the recipe card of the right panel.
     Its own card, not inside the recipe card: that card redraws on every
     keystroke, and a playing video would have been cut off. It is only rebuilt
     when the recipe or its link changes. */
  function updateVideoAside(r) {
    const zone = $("#aside-video");
    if (!zone) return;
    const key = r ? r.id + "|" + (r.video || "") : "";
    if (zone.dataset.for === key) return;
    zone.dataset.for = key;
    const block = r ? videoBlock(r) : "";
    zone.hidden = !block;
    zone.innerHTML = block;
    const b = zone.querySelector("[data-video]");
    if (b) b.addEventListener("click", () => startVideo(b));
  }

  /* WHICH COFFEE, WHICH RECIPE (v8.74). The table from recipes.js, and in each
     cell what your cups say: your average with the recommended recipe on the
     coffees of that profile, and your best recipe here when another one does
     better over at least three cups. */
  function renderMatrix() {
    const table = $("#matrix-recipes");
    if (!table || typeof COFFEE_RECIPE_MATRIX === "undefined") return;
    const M = COFFEE_RECIPE_MATRIX;
    const recipe = id => DATA.state.recipes.find(r => r.id === id);
    const profiles = new Map(DATA.state.coffees.map(c => [c.id, coffeeProfile(c)]));
    const cups = analyzableExts().filter(e => e.score_10 !== "");
    const cellStats = (l, c) => {
      const byRecipe = {};
      cups.forEach(e => {
        const p = profiles.get(e.coffee_id);
        if (!p || p.row !== l || p.column !== c) return;
        (byRecipe[e.recipe] = byRecipe[e.recipe] || []).push(Number(e.score_10));
      });
      return byRecipe;
    };
    const recipeLink = r => '<button type="button" class="link-recipe" data-matrix="' + attr(r.id) + '">' + attr(I18N.tr(r.name)) + "</button>";
    const fmt1 = n => fmtDecimal(n, 1);
    let html = "<thead><tr><th></th>" + M.columns.map(c => "<th>" + attr(I18N.tr(c.name)) + "</th>").join("") + "</tr></thead><tbody>";
    M.rows.forEach(l => {
      html += '<tr><th scope="row">' + attr(I18N.tr(l.name)) + "</th>";
      M.columns.forEach(c => {
        const k = M.cells[l.id + "|" + c.id];
        const r = k && recipe(k.recipe);
        if (!r) { html += '<td class="m-empty"></td>'; return; }
        const stats = cellStats(l.id, c.id);
        const mine = stats[r.name] || [];
        const best = Object.entries(stats).filter(([name, n]) => name !== r.name && n.length >= 3)
          .map(([name, n]) => ({ name: name, mean: average(n), n: n.length })).sort((a, b) => b.mean - a.mean)[0];
        const alt = k.alternative && recipe(k.alternative);
        html += '<td data-col="' + attr(I18N.tr(c.name)) + '">' + recipeLink(r) +
          (k.temp ? '<span class="m-temp">' + attr(k.temp) + "</span>" : "") +
          (alt ? '<span class="m-other">' + I18N.t("matrix_or") + " " + recipeLink(alt) + "</span>" : "") +
          (mine.length ? '<span class="m-at-home">' + I18N.t("matrix_at_home", { m: fmt1(average(mine)), n: mine.length }) + "</span>" : "") +
          (best && (mine.length < 3 || best.mean > average(mine))
            ? '<span class="m-best">' + I18N.t("matrix_best", { r: attr(I18N.tr(best.name)), m: fmt1(best.mean) }) + "</span>" : "") +
          "</td>";
      });
      html += "</tr>";
    });
    table.innerHTML = html + "</tbody>";
    if (!table.dataset.wired) {
      table.dataset.wired = "1";
      table.addEventListener("click", ev => {
        const b = ev.target.closest("[data-matrix]");
        if (b) UI.showRecipe(b.dataset.matrix);
      });
    }
  }

  function recipeCard(r, group) {
    const badges = (r.isDefault ? '<span class="badge-default">' + I18N.t("badge_default") + "</span>" : "") +
      (r.advanced ? '<span class="badge-advanced">' + I18N.t("badge_advanced") + "</span>" : "");
    const params =
      '<span class="param-chip">' + r.dose + " g / " + r.water + " g</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.ratioText)) + "</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.tempText)) + "</span>" +
      '<span class="param-chip">' + I18N.t("dial") + " " + r.dial + "</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.totalText)) + "</span>";
    let steps = "";
    if (r.steps.length) {
      steps = '<ol class="recipe-steps">' + r.steps.map(e =>
        "<li><span class=\"step-time\">" + (e.t === null ? "·" : fmtDuration(e.t)) + "</span><span>" + attr(I18N.tr(e.text)) + "</span></li>"
      ).join("") + "</ol>";
    }
    const tetsuBlock = r.has_variants ? '<div class="tetsu-variants" id="tetsu-block"></div>' : "";
    // Variant toggle when the recipe belongs to a family.
    let pills = "";
    if (group && group.length > 1) {
      pills = '<div class="variants-recipe">' + group.map(x =>
        '<button type="button" class="pill' + (x.id === r.id ? " on" : "") +
        '" data-var-fam="' + r.family + '" data-var-id="' + x.id + '">' +
        I18N.tr(x.variant || x.name) + "</button>").join("") + "</div>";
    }
    const isOpen = openRecipes.has(r.id);
    const rating = homeRating(r);
    const summary = [r.method, r.dose + " g / " + r.water + " g", r.temp ? r.temp + " °C" : ""].filter(Boolean).join(" · ");
    return '<article class="card recipe-card ' + r.method.toLowerCase() + (isOpen ? "" : " collapsed") + '" data-recipe="' + r.id + '" data-profiles="' +
      recipeProfiles(r).join(" ") + '">' +
      '<div class="recipe-header">' +
      (r.number ? '<span class="recipe-num">' + r.number + "</span>" : '<span class="recipe-num">' + r.method + "</span>") +
      badges + "</div>" +
      '<h3><button type="button" class="recipe-toggle" data-toggle="' + r.id + '" aria-expanded="' + isOpen + '" aria-controls="body-' + r.id + '">' +
        '<span class="rb-name">' + r.name + "</span>" +
        '<span class="rb-summary">' + attr(summary) + "</span>" +
        '<span class="rb-rating">' + (rating ? rating : I18N.t("recipe_never_made")) + "</span>" +
      "</button></h3>" +
      '<div class="recipe-body" id="body-' + r.id + '">' +
      pills +
      '<p class="recipe-sub">' + attr(I18N.tr(r.subtitle)) + "</p>" +
      '<div class="recipe-params">' + params + "</div>" +
      videoBlock(r) +
      atHome(r) +
      steps + tetsuBlock +
      (r.bestFor ? '<p class="recipe-forwho"><b>' + I18N.t("recipe_for_which") + "</b> " + attr(I18N.tr(r.bestFor)) + "</p>" : "") +
      (r.pairedCoffees.length ? '<p class="recipe-coffees"><b>' + I18N.t("recipe_coffees") + "</b> " + r.pairedCoffees.join(", ") + "</p>" : "") +
      (r.note ? '<p class="recipe-note">' + attr(I18N.tr(r.note)) + "</p>" : "") +
      '<div class="recipe-actions">' +
      '<button class="btn btn-primary btn-small" data-brew="' + r.id + '">' + I18N.t("guide_brew") + "</button>" +
      '<button class="btn btn-small" data-walkthrough="' + r.id + '">' + I18N.t("aside_step_by_step") + "</button>" +
      '<button class="btn btn-small" data-recipe-edit="' + r.id + '">' + I18N.t("btn_edit") + "</button>" +
      '<button type="button" class="btn btn-small btn-subtle" data-share-recipe="' + r.id + '">' + UI.shareIcon() + I18N.t("share_action") + "</button>" +
      "</div></div></article>";
  }

  /* L5 (v8.94): BREW A RECIPE from the Guide. The entry form opens with the
     chosen brewer and recipe, and its values already filled in. */
  /* R15 (v9.26): from a recipe CARD (the Guide's, the side panel's), the
     brew mode opens straight away, over the page: the card grows into it
     (js/ui-morph.js) and folds back into it on « Fermer ». The entry is
     filled the same way behind it; « Compléter la saisie » goes there. */
  function brewRecipe(id, card) {
    const r = DATA.state.recipes.find(x => x.id === id);
    if (!r) return;
    UI.resetEntry(true);
    UI.chooseMethod(r.method);
    const sel = $("#f-recipe");
    sel.value = r.name;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    if (!card || !UI.openBrew) { UI.activateScreen("entry"); return; }
    const find = () => $(".screen.on .recipe-card[data-recipe=\"" + id + "\"], #side-panel:not([hidden]) .recipe-card[data-recipe=\"" + id + "\"]");
    if (UI.morphOpen) UI.morphOpen(card, UI.openBrew, "#modal-brew", { id, find });
    else UI.openBrew();
  }

  /* THE GUIDE HOME (L5). The doors: one per section of the table of contents,
     with what you find there. "For your coffee": the coffee of your last cup,
     its cell in the coffee and recipe table, and your rating on the two
     recipes it suggests. */
  const DOORS = { recipes: "guide_door_recipes", grinder: "guide_door_grinder", diagnostic: "guide_door_diagnosis", rules: "guide_door_rules",
    vocabulary: "guide_door_vocabulary", shops: "guide_door_shops", gear: "guide_door_gear", messages: "guide_door_messages" };
  function renderGuideHome() {
    const doors = $("#guide-doors");
    if (!doors) return;
    const counts = { recipes: liveRecipes().length, vocabulary: $$("#sheets-vocabulary .sheet").length };
    doors.innerHTML = $$(".guide-tabs [data-guide]").filter(a => a.dataset.guide !== "home").map(a =>
      '<button type="button" class="ga-door" data-door="' + attr(a.getAttribute("href").slice(1)) + '"><b>' + attr(a.textContent.trim()) + "</b><span>" +
      attr(I18N.t(DOORS[a.dataset.guide] || "guide_door_other", { n: counts[a.dataset.guide] || 0 })) + "</span></button>").join("");
    const zone = $("#guide-for-you");
    const lastCup = DATA.state.extractions.slice().sort((a, b) => String(b.date_time).localeCompare(String(a.date_time)))[0];
    const coffee = lastCup ? DATA.coffeeOf(lastCup) : null;
    const p = coffee && typeof coffeeProfile === "function" ? coffeeProfile(coffee) : null;
    const k = p && p.row && p.column ? COFFEE_RECIPE_MATRIX.cells[p.row + "|" + p.column] : null;
    const suggested = k ? [k.recipe, k.alternative].filter(Boolean).map(id => DATA.state.recipes.find(r => r.id === id)).filter(Boolean) : [];
    zone.hidden = !suggested.length;
    if (!suggested.length) { zone.innerHTML = ""; return; }
    zone.innerHTML = '<h3 id="guide-for-you-title" class="ga-h">' + attr(I18N.t("guide_for_you", { c: I18N.tr(coffee.name) })) + "</h3>" +
      '<div class="ga-cards">' + suggested.map((r, i) => {
        const rating = homeRating(r);
        return '<button type="button" class="ga-card' + (i === 0 ? " first" : "") + '" data-for-you="' + r.id + '">' +
          '<span class="ga-label">' + attr(I18N.t(i === 0 ? "guide_starting" : "guide_to_try")) + "</span>" +
          "<b>" + attr(I18N.tr(r.name)) + "</b>" +
          '<span class="ga-params">' + attr([r.method, i === 0 && k.temp ? k.temp : r.temp ? r.temp + " °C" : ""].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="ga-rating">' + (rating ? I18N.t("guide_at_home", { m: rating }) : I18N.t("recipe_never_made")) + "</span></button>";
      }).join("") + "</div>";
  }

  /* THE GUIDE SEARCH (L5). An index built once, on the first character: the
     recipes, the vocabulary cards and the headings of each section. Accents
     do not count: "cafe" finds "café". */
  let guideIndex = null;
  const stripAccents = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function buildIndex() {
    const idx = [];
    liveRecipes().forEach(r => idx.push({ type: "guide_type_recipe", title: I18N.tr(r.name), detail: [r.method, I18N.tr(r.subtitle || "")].filter(Boolean).join(" · "), recipe: r.id }));
    $$("#sheets-vocabulary .sheet").forEach(f => {
      const s = f.querySelector("summary");
      if (s) idx.push({ type: "guide_type_word", title: s.textContent.trim(), detail: (f.querySelector(".sheet-body") || f).textContent.trim().replace(/\s+/g, " ").slice(0, 90), el: f });
    });
    $$(".guide-panel").forEach(p => {
      if (p.id === "gp-home" || p.id === "gp-recipes" || p.id === "gp-vocabulary") return;
      p.querySelectorAll("h2, h3, h4").forEach(h => {
        const nextEl = h.nextElementSibling;
        idx.push({ type: "guide_type_tip", title: h.textContent.trim(), detail: nextEl ? nextEl.textContent.trim().replace(/\s+/g, " ").slice(0, 90) : "", el: h });
      });
    });
    return idx.map(x => ({ ...x, key: stripAccents(x.title + " " + x.detail) }));
  }
  // Built on demand, also searched by the palette (js/ui-palette.js, v9.13).
  function guideSearchIndex() {
    if (!guideIndex) guideIndex = buildIndex();
    return guideIndex;
  }
  let matches = [];
  function searchGuide() {
    const q = stripAccents($("#guide-search").value.trim());
    const zone = $("#guide-results");
    if (!q) { zone.innerHTML = ""; return; }
    guideSearchIndex();
    // Title first: a word found in the title ranks above a word found in the text.
    matches = guideIndex.filter(x => x.key.includes(q))
      .sort((a, b) => Number(!stripAccents(a.title).includes(q)) - Number(!stripAccents(b.title).includes(q))).slice(0, 8);
    zone.innerHTML = matches.length
      ? matches.map((x, i) => '<button type="button" class="ga-result" data-result="' + i + '"><span class="ga-type">' + attr(I18N.t(x.type)) + "</span><b>" +
          attr(x.title) + "</b><span>" + attr(x.detail) + "</span></button>").join("")
      : '<p class="ga-nothing">' + attr(I18N.t("guide_no_result", { q: $("#guide-search").value.trim() })) + "</p>";
  }
  function goToResult(i) {
    goToGuideEntry(matches[i]);
  }
  // One entry of the index: the recipe, or the panel holding the card or the heading.
  function goToGuideEntry(x) {
    if (!x) return;
    if (x.recipe) { showRecipe(x.recipe); return; }
    const panel = x.el.closest(".guide-panel");
    if (!panel) return;
    const heading = panel.querySelector("h2");
    showGuide(heading && heading.id ? heading.id : null);
    if (x.el.tagName === "DETAILS") x.el.open = true;
    x.el.scrollIntoView({ behavior: "smooth", block: "start" });
    x.el.classList.add("recipe-revealed");
    setTimeout(() => x.el.classList.remove("recipe-revealed"), 1800);
  }

  function renderRecipes() {
    renderMatrix();
    renderGuideHome();
    guideIndex = null;
    const list = liveRecipes();
    const rendered = new Set();
    const cards = [];
    list.forEach(r => {
      if (rendered.has(r.id)) return;
      if (r.family) {
        const group = list.filter(x => x.family === r.family);
        if (group.length > 1) {
          group.forEach(x => rendered.add(x.id));
          const memo = familySelection[r.family];
          const sel = group.find(x => x.id === memo) || group[0];
          cards.push(recipeCard(sel, group));
          return;
        }
      }
      rendered.add(r.id);
      cards.push(recipeCard(r, null));
    });
    $("#grid-recipes").innerHTML = cards.join("");
    applyFilter();

    renderTetsu();

    $$("[data-var-fam]").forEach(b => b.addEventListener("click", () => {
      familySelection[b.dataset.varFam] = b.dataset.varId;
      renderRecipes();
    }));
    $$("[data-toggle]").forEach(b => b.addEventListener("click", () => {
      const card = b.closest(".recipe-card");
      const expand = card.classList.contains("collapsed");
      card.classList.toggle("collapsed", !expand);
      b.setAttribute("aria-expanded", String(expand));
      toggleRecipe(b.dataset.toggle, expand);
    }));
    $$("[data-brew]").forEach(b => b.addEventListener("click", () => brewRecipe(b.dataset.brew, b.closest(".recipe-card"))));
    $$("[data-walkthrough]").forEach(b => b.addEventListener("click", () => openWalkthrough(b.dataset.walkthrough)));
    $$("#grid-recipes [data-video]").forEach(b => b.addEventListener("click", () => startVideo(b)));
    $$("[data-recipe-edit]").forEach(b => b.addEventListener("click", () => {
      UI.openRecipesModal();
      UI.openRecipeForm(b.dataset.recipeEdit);
    }));
  }

  function tetsuPours() {
    const v40 = TETSU.first40.find(v => v.id === tetsuChoice.p40);
    const v60 = TETSU.last60.find(v => v.id === tetsuChoice.p60);
    const r = recipeWithVariants();
    const water = r ? r.water : 300;
    return { pours: TETSU.pours(water, v40, v60), v40, v60, water: water };
  }

  function renderTetsu() {
    const block = $("#tetsu-block");
    if (!block) return;
    const { pours, v40, v60, water: water } = tetsuPours();
    let total = 0;
    const lines = pours.map((p, i) => {
      total += p;
      const phase = i < 2 ? "40 %" : "60 %";
      return "<li><span class=\"step-time\">" + (i + 1) + "</span><span>" +
        I18N.t("tetsu_line", { p, c: total }) + " <small>(" + phase + ")</small></span></li>";
    }).join("");
    block.innerHTML =
      '<div class="tetsu-group"><span class="label">' + I18N.t("tetsu_40") + "</span>" +
      '<div class="tetsu-options">' + TETSU.first40.map(v =>
        '<button type="button" class="pill' + (v.id === tetsuChoice.p40 ? " on" : "") + '" data-t40="' + v.id + '">' + I18N.tr(v.name) + "</button>").join("") +
      "</div></div>" +
      '<div class="tetsu-group"><span class="label">' + I18N.t("tetsu_60") + "</span>" +
      '<div class="tetsu-options">' + TETSU.last60.map(v =>
        '<button type="button" class="pill' + (v.id === tetsuChoice.p60 ? " on" : "") + '" data-t60="' + v.id + '">' + I18N.tr(v.name) + "</button>").join("") +
      "</div></div>" +
      '<ul class="tetsu-pours">' + lines + "</ul>" +
      '<p class="tetsu-detail">' + I18N.tr(v40.detail) + " " + I18N.tr(v60.detail) + " " + I18N.t("tetsu_end") + "</p>";
    $$("[data-t40]").forEach(b => b.addEventListener("click", () => { tetsuChoice.p40 = b.dataset.t40; renderTetsu(); }));
    $$("[data-t60]").forEach(b => b.addEventListener("click", () => { tetsuChoice.p60 = b.dataset.t60; renderTetsu(); }));
  }

  // ---------- Step-by-step mode ----------

  const walkthrough = { recipe: null, steps: [], index: -1, startedAt: null, interval: null };

  /* The computation lives in recipes.js, without DOM, so it is testable
     without a browser. Here we only read the field. 1 means "nothing to
     scale", and the texts then stay intact down to the character. */
  function waterFactor(recipe) {
    const targetWater = parseFloat($("#f-water").value);
    if (!recipe || !(recipe.water > 0) || !(targetWater > 0)) return 1;
    return targetWater / recipe.water;
  }

  function stepsFor(recipe) {
    const f = waterFactor(recipe);
    const rescale = list => f === 1 ? list
      : list.map(e => ({ ...e, text: scalePours(e.text, f) }));
    // Translated BEFORE scaling (v8.77): the original sentence is the key.
    const translate = list => list.map(e => ({ ...e, text: I18N.tr(e.text) }));
    if (recipe.has_variants) {
      const { pours } = tetsuPours();
      let total = 0;
      /* The TOTAL first, like every other recipe (« jusqu'à 90 g »): the pour
         alone (30, 60, then 45) could not be read on the scale, and the Brew
         mode, which looks for « à X g », showed 60 instead of 90. */
      /* BY EYE, no schedule (v8.99): Tetsu pours when the water has almost all
         drained, and his 45 seconds hold for 20 g and 60 g pours. At 15 g
         the bed is thinner, it empties sooner, and the timer made you wait
         over a dry bed. The Brew mode advances with a tap. */
      return rescale(pours.map((p, i) => {
        total += p;
        return { t: null, text: i === 0
          ? I18N.t("walkthrough_first", { c: total, b: I18N.t("walkthrough_bloom") })
          : I18N.t("walkthrough_pour", { p, c: total, b: I18N.t("walkthrough_bed") }) };
      }).concat([{ t: null, text: I18N.t("walkthrough_drain") }]));
    }
    return rescale(translate(recipe.steps));
  }

  function openWalkthrough(recipeId) {
    const r = DATA.state.recipes.find(x => x.id === recipeId);
    if (!r) return;
    walkthrough.recipe = r;
    walkthrough.steps = stepsFor(r);
    walkthrough.index = -1;
    clearInterval(walkthrough.interval);
    walkthrough.startedAt = null;
    $("#wt-title").textContent = r.name;
    $("#wt-chrono").textContent = "0:00";
    $("#wt-params").textContent = r.dose + " g / " + r.water + " g, " + I18N.tr(r.tempText) + ", " + I18N.t("dial") + " " + r.dial + ", " + I18N.tr(r.totalText);
    $("#wt-start").textContent = I18N.t("walkthrough_start");
    $("#wt-next").disabled = true;
    renderWalkthroughSteps();
    $("#modal-walkthrough").showModal();
  }

  function renderWalkthroughSteps() {
    $("#wt-steps").innerHTML = walkthrough.steps.map((e, i) =>
      '<li class="' + (i < walkthrough.index ? "done" : i === walkthrough.index ? "now" : "") + '">' +
      '<span class="step-time">' + (e.t === null ? "·" : fmtDuration(e.t)) + "</span><span>" + e.text + "</span></li>"
    ).join("");
  }

  function walkthroughTick() {
    const s = Math.floor((Date.now() - walkthrough.startedAt) / 1000);
    $("#wt-chrono").textContent = fmtDuration(s);
    // Automatic advance on timed steps.
    const nextIdx = walkthrough.index + 1;
    if (nextIdx < walkthrough.steps.length && walkthrough.steps[nextIdx].t !== null && s >= walkthrough.steps[nextIdx].t) {
      walkthrough.index = nextIdx;
      renderWalkthroughSteps();
    }
  }

  function startWalkthrough() {
    if (walkthrough.startedAt) {
      clearInterval(walkthrough.interval);
      walkthrough.startedAt = null;
      $("#wt-start").textContent = I18N.t("walkthrough_restart");
      $("#wt-next").disabled = true;
      return;
    }
    walkthrough.startedAt = Date.now();
    walkthrough.index = 0;
    renderWalkthroughSteps();
    walkthrough.interval = setInterval(walkthroughTick, 300);
    $("#wt-start").textContent = I18N.t("walkthrough_stop");
    $("#wt-next").disabled = false;
  }

  function nextWalkthroughStep() {
    if (walkthrough.index < walkthrough.steps.length - 1) {
      walkthrough.index++;
      renderWalkthroughSteps();
    }
  }

  // ---------- Reference: converter and tables ----------

  /* Live advice under the grinder slider. Three questions, in this order:
     does it work on MY brewers, what taste does it give if I move, and how
     far am I from my saved setting. Nothing invented: the ranges come from
     GRIND, the gap is counted in clicks. */
  function grindAdvice(p) {
    const brikkaOk = GRIND.checkRange("Brikka", GRIND.dialFromClicks(p.clicks)).ok;
    const switchOk = GRIND.checkRange("Switch", GRIND.dialFromClicks(p.clicks)).ok;
    const lines = [];

    if (brikkaOk && switchOk) lines.push("<b>" + I18N.t("dial_both") + "</b>");
    else if (brikkaOk) lines.push("<b>" + I18N.t("dial_brikka") + "</b>");
    else if (switchOk) lines.push("<b>" + I18N.t("dial_switch") + "</b>");
    else lines.push('<b class="conv-out">' + I18N.t("dial_none") + "</b>");

    lines.push(I18N.t("dial_finer"));
    lines.push(I18N.t("dial_coarser"));

    // Gap to the saved setting, in clicks, the unit the hand understands.
    const d = GRIND.parseDial(fallbacks.dial);
    if (d) {
      const gap = p.clicks - d.clicks;
      lines.push(gap === 0
        ? I18N.t("dial_current", { m: fallbacks.dial })
        : I18N.t("dial_gap", {
          n: Math.abs(gap),
          direction: I18N.t(gap > 0 ? "dial_open" : "dial_close"),
          m: fallbacks.dial,
        }));
    }
    return lines.map(x => "<p>" + x + "</p>").join("");
  }

  const renderConverterDeferred = debounce(() => renderConverter(), 90);

  function renderConverter() {
    const text = $("#conv-dial").value.trim().replace(/,/g, ".");
    const zone = $("#conv-result");
    const p = GRIND.parseDial(text);
    if (!p) {
      zone.innerHTML = '<span class="conv-error">' + I18N.t("conv_error") + "</span>";
      $("#conv-advice").innerHTML = "";
      $("#conv-apply").disabled = true;
      CHARTS.diagram("ruler", null, fallbacks.dial);
      return;
    }
    // The slider always follows the value, including when it comes from the text.
    if (Number($("#conv-slider").value) !== p.clicks) $("#conv-slider").value = p.clicks;
    paintSlider($("#conv-slider"));
    const compatible = GRIND.compatibleMethods(p.microns).map(m => I18N.method(m.name));
    zone.innerHTML =
      '<span class="conv-chip"><b>' + p.clicks + "</b> " + I18N.t("conv_clicks") + "</span>" +
      '<span class="conv-chip">' + I18N.t("conv_about") + " <b>" + Math.round(p.microns) + "</b> " + I18N.t("conv_microns") + "</span>" +
      '<span class="conv-chip">' + I18N.t("conv_band") + " <b>" + GRIND.bandOf(p.microns).name + "</b></span>" +
      '<span class="conv-chip">' + (compatible.length ? I18N.t("conv_fits") + " <b>" + compatible.join(", ") + "</b>" : "<b>" + I18N.t("conv_outside") + "</b>") + "</span>";
    $("#conv-advice").innerHTML = grindAdvice(p);
    $("#conv-apply").disabled = text === fallbacks.dial;
    $("#conv-apply").textContent = text === fallbacks.dial
      ? I18N.t("conv_already") : I18N.t("conv_apply");
    CHARTS.diagram("ruler", text, fallbacks.dial);
  }

  // Marks under the slider: the reference positions, clickable.
  function renderGrindMarkers() {
    $("#conv-markers").innerHTML = GRIND.REFERENCES.map(r =>
      '<button type="button" class="conv-marker" data-dial="' + r.dial + '" title="' +
      titleAttr(I18N.tr(r.usage)) + '">' + r.dial + "</button>").join("");
    $$("#conv-markers .conv-marker").forEach(b => b.addEventListener("click", () => {
      $("#conv-dial").value = b.dataset.dial;
      renderConverter();
    }));
  }

  function renderRangeTable() {
    $("#table-ranges").innerHTML = GRIND.METHODS.map(m => {
      const highlight = m.id === "brikka" || m.id === "switch";
      const name = I18N.method(m.name);
      return "<tr" + (highlight ? ' class="row-own"' : "") + "><td>" + (highlight ? "<b>" + name + "</b>" : name) + "</td>" +
        "<td>" + (m.minU === 0 ? I18N.t("range_under", { x: m.maxU }) : I18N.t("range_from_to", { a: m.minU, b: m.maxU })) + "</td>" +
        "<td>" + (m.minC === 0 ? I18N.t("range_under", { x: m.maxC }) : I18N.t("range_from_to", { a: m.minC, b: m.maxC })) + "</td>" +
        "<td><code>" + I18N.dialRange(m.dialText) + "</code></td></tr>";
    }).join("");
  }

  // Made available to the other screens.
  /* Wiring of the Guide controls: grinder, step by step, copy buttons.
     Called once by app.js. */
  function wireGuide() {
    $("#conv-dial").addEventListener("input", renderConverterDeferred);
    $("#conv-slider").addEventListener("input", () => {
      $("#conv-dial").value = GRIND.dialFromClicks(Number($("#conv-slider").value));
      /* IMMEDIATE, and it is a deliberate change. The debounce added in v7.57
         covered a full SVG redraw on each click; since the ruler skeleton
         is built only once, only two attributes are left to move. Keeping
         the 90 ms wait would mean paying the cost without the benefit, on
         the only control of the site that is handled continuously. The text
         field keeps its debounce. */
      renderConverter();
    });
    /* The only path that really changes a setting from this screen. It writes
       the same fallback as the Settings screen, so there is only one source. */
    $("#conv-apply").addEventListener("click", async () => {
      const dial = $("#conv-dial").value.trim().replace(/,/g, ".");
      if (!GRIND.parseDial(dial)) { toast(I18N.t("toast_grind_invalid")); return; }
      fallbacks.dial = dial;
      await saveFallbacks();
      renderConverter();
      if ($("#param-dial")) $("#param-dial").value = dial;
      toast(I18N.t("toast_dial_applied", { m: dial }));
    });
    $("#wt-start").addEventListener("click", startWalkthrough);
    $("#wt-next").addEventListener("click", nextWalkthroughStep);
    $("#modal-walkthrough").addEventListener("close", () => clearInterval(walkthrough.interval));
    $("#btn-manage-recipes").addEventListener("click", () => UI.openRecipesModal());
    $$("#library-filters [data-filter]").forEach(b => b.addEventListener("click", () => {
      filter.value = b.dataset.filter;
      try { localStorage.setItem("guide-filter", filter.value); } catch (e) { /* never mind */ }
      applyFilter();
    }));
    $$(".guide-tabs [data-guide]").forEach(a => a.addEventListener("click", ev => {
      ev.preventDefault();
      showGuide(a.getAttribute("href").slice(1));
    }));
    // At startup: the remembered tab, otherwise the Guide home (L5).
    let tab = "home";
    try { tab = localStorage.getItem("guide-tab") || "home"; } catch (e) { /* home */ }
    const panel = $("#gp-" + tab) || $("#gp-home");
    $("#guide-search").addEventListener("input", searchGuide);
    $("#guide-results").addEventListener("click", ev => {
      const b = ev.target.closest("[data-result]");
      if (b) goToResult(Number(b.dataset.result));
    });
    $("#guide-doors").addEventListener("click", ev => {
      const b = ev.target.closest("[data-door]");
      if (b) showGuide(b.dataset.door);
    });
    $("#guide-for-you").addEventListener("click", ev => {
      const b = ev.target.closest("[data-for-you]");
      if (b) showRecipe(b.dataset.forYou);
    });
    const heading = panel && panel.querySelector("h2");
    showGuide(heading && heading.id ? heading.id : null);

    // Copy buttons for the Vietnamese messages
    $$("[data-copy]").forEach(b => b.addEventListener("click", async () => {
      const block = document.getElementById(b.dataset.copy);
      const text = block ? block.textContent.trim() : "";
      try {
        await navigator.clipboard.writeText(text);
        toast(I18N.t("toast_copied"));
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast(I18N.t("toast_copied"));
      }
    }));
  }

  Object.assign(UI, { updateVideoAside, guideSearchIndex, goToGuideEntry, brewRecipe, startVideo,
    wireGuide, recipeCard, atHome, grindAdvice, showGuide, showRecipe, recipeProfiles, stepsFor, waterFactor, familySelection, openWalkthrough,
    walkthrough, startWalkthrough, nextWalkthroughStep, walkthroughTick, renderConverter, renderConverterDeferred,
    renderWalkthroughSteps, renderRecipes, renderGrindMarkers, renderRangeTable, renderTetsu,
    tetsuChoice, tetsuPours,
  });
})();
