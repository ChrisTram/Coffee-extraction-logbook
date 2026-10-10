/* Quick entry: the panel that floats above every screen.
 *
 * Three gestures, coffee, recipe, rating, and the cup is saved with the
 * recipe's values. Kept apart from the entry screen because it shares neither
 * its state (no draft, no timer, no editing) nor its form: the only thing it
 * borrows is the list of selectable coffees, through UI. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, activateScreen, wireRating, localNow, markRating, isRatingEmpty, paintSlider, recipesForMethod, fallbacks, toast, findRecipe, oneAtATime } = UI;

  let quickOpen = false;

  // The wiring needs to know whether the panel is open, not to be able to
  // open it by writing to a variable.
  function isQuickOpen() { return quickOpen; }

  function toggleQuick(force) {
    quickOpen = force !== undefined ? force : !quickOpen;
    $("#panel-quick").classList.toggle("open", quickOpen);
    /* The veil is not only there to darken: it gives a screen-sized close
       target, which a 30 px cross does not do for a thumb. */
    $("#overlay-quick").hidden = !quickOpen;
    if (isQuickOpen()) updateQuickPanel();
  }

  function updateQuickPanel() {
    const coffeeSelect = $("#q-coffee");
    const v = coffeeSelect.value;
    const coffees = UI.selectableCoffees();
    // v9.25: the form's options, the spent bags at the end and marked.
    coffeeSelect.innerHTML = '<option value="">' + I18N.t("pick_coffee") + "</option>" + UI.coffeeOptions();
    if (v && coffees.some(c => c.id === v)) coffeeSelect.value = v;
    /* Same default as the full form: the quick panel REFUSES to save without
       a coffee, so opening it on an empty field guaranteed a round trip. We
       only prefill when nothing is chosen yet, so as not to overwrite a
       selection in progress. */
    if (!coffeeSelect.value && coffees[0]) coffeeSelect.value = coffees[0].id;
    // Every opening starts WITHOUT a rating: you rate after drinking.
    $("#q-rating").value = 5;
    markRating($("#q-rating"), true);
    /* The cup's time (v9.34): now by default, editable for a cup logged
       late. Untouched, the save takes the time of the save itself. */
    const when = $("#q-date");
    when.value = localNow();
    when.dataset.touched = "";
    updateQuickRatingDisplay();
    updateQuickRecipes();
    updateQuickRepeat();
  }

  /* Same rule as the full form: no thumb until it has been touched, and an
     empty rating shows as such. */
  function updateQuickRatingDisplay() {
    const slider = $("#q-rating");
    const empty = isRatingEmpty(slider);
    const shown = empty ? I18N.t("not_rated_yet") : slider.value + " / 10";
    $("#q-rating-shown").textContent = shown;
    slider.setAttribute("aria-valuetext", shown);
    $("#q-rating-help").hidden = !empty;
    $("#q-rating-clear").hidden = empty;
    paintSlider(slider);
    UI.paintRatingDial(slider);
  }

  function quickRating() {
    return isRatingEmpty($("#q-rating")) ? "" : $("#q-rating").value;
  }

  function updateQuickRecipes() {
    const sel = $("#q-recipe");
    const v = sel.value;
    const groups = ["Brikka", "Switch"].map(m => {
      const list = recipesForMethod(m);
      if (!list.length) return "";
      return '<optgroup label="' + m + '">' +
        list.map(r => "<option>" + r.name + "</option>").join("") + "</optgroup>";
    }).join("");
    sel.innerHTML = groups;
    if (v && findRecipe(v)) sel.value = v;
    updateQuickWarnings();
  }

  function onQuickCoffeeChoice() {
    const coffee = DATA.state.coffees.find(c => c.id === $("#q-coffee").value);
    if (coffee) {
      const r = findRecipe(coffee.recommended_recipe);
      if (r && r.active !== 0) $("#q-recipe").value = r.name;
    }
    updateQuickWarnings();
  }

  function updateQuickWarnings() {
    const coffee = DATA.state.coffees.find(c => c.id === $("#q-coffee").value);
    const r = findRecipe($("#q-recipe").value);
    const warn = r ? combinationWarnings(coffee, r.method, r.name, DATA.state.recipes) : { msgs: [] };
    $("#q-warn").textContent = warn.msgs.length ? "⚠ " + warn.msgs[0] : "";
    updateQuickRepeat();
  }

  /* WHAT THE RECIPE IMPOSES, in numbers. The sheet has only three fields and
     saves everything else from the recipe: without this line you had to know
     the recipe by heart to know what you had just written. The machine shows
     here too, it is the only place the method shows in this sheet: since
     v9.17 (Q12) as the small brewer of the entry form (js/ui-brewer.js),
     built once and kept, so that a recipe of the other machine melts it into
     the other brewer, and the figures roll. */
  function updateQuickRepeat() {
    const r = findRecipe($("#q-recipe").value);
    const target = $("#q-resumed");
    if (!r) { target.innerHTML = ""; return; }
    const parts = [];
    if (r.dose) parts.push(r.dose + " g");
    if (r.water) parts.push(r.water + " g");
    if (r.dial) parts.push(I18N.t("dial") + " " + r.dial);
    let art = target.querySelector(".brewer"), line = target.querySelector(".quick-resumed-text");
    if (!art || !line) {
      target.innerHTML = '<span class="brewer brewer-mini" aria-hidden="true"></span><span class="quick-resumed-text"></span>';
      art = target.querySelector(".brewer");
      line = target.querySelector(".quick-resumed-text");
    }
    UI.paintBrewer(art, r.method);
    if (art) art.title = I18N.tr(r.method);
    UI.rollText(line, parts.length ? I18N.t("quick_from_recipe", { v: parts.join(", ") }) : I18N.tr(r.method));
  }

  async function saveQuick() {
    const coffeeId = $("#q-coffee").value;
    const r = findRecipe($("#q-recipe").value);
    if (!coffeeId) { toast(I18N.t("toast_pick_coffee")); return; }
    if (!r) { toast(I18N.t("toast_pick_recipe")); return; }
    // The coffee chosen in the panel. A pre-ground coffee has no grinder
    // setting to save: the recipe's value would be made up.
    const quickCoffee = DATA.state.coffees.find(c => c.id === coffeeId);
    const saved = await DATA.addExtraction({
      date_time: ($("#q-date").dataset.touched === "1" && $("#q-date").value) || localNow(),
      coffee_id: coffeeId,
      method: r.method,
      recipe: r.name,
      dose_g: r.dose || fallbacks.dose,
      water_g: r.water,
      grind_dial: quickCoffee && Number(quickCoffee.pre_ground) === 1 ? "" : r.dial,
      temperature_c: r.temp,
      total_time_s: "",
      flow_time_s: "",
      yield_ml: "",
      cup: (DATA.state.cups.find(t => t.name === (r.method === "Brikka" ? "Loveramics Flat White Egg" : "Classic Mug")) || { name: "" }).name,
      score_10: quickRating(),
      diagnostic: "",
      descriptors: "",
      comment: "",
    });
    const rating = quickRating();
    toast(rating === "" ? I18N.t("toast_quick_unrated", { r: r.name }) : I18N.t("toast_quick", { r: r.name, n: rating }));
    toggleQuick(false);
    // Q2 (v9.13): the cup fills, the same card as the full entry (and its milestone, R9).
    UI.showSavedCup(saved);
  }

  /* Panel wiring. Called once by app.js, at startup. Since v9.13 the panel opens
     from the bottom bar (long press on its central button) and from the "Plus"
     sheet, both in js/ui-nav.js: the floating button that used to open it is gone. */
  function wireQuick() {
    $("#q-close").addEventListener("click", () => toggleQuick(false));
    $("#q-coffee").addEventListener("change", onQuickCoffeeChoice);
    $("#q-recipe").addEventListener("change", updateQuickWarnings);
    $("#overlay-quick").addEventListener("click", () => toggleQuick(false));
    wireRating($("#q-rating"), updateQuickRatingDisplay);
    // J1 (v9.13): the rating dial drives the slider, now hidden.
    UI.mountRatingDial($("#q-rating"), $("#q-rating-dial"));
    $("#q-rating-clear").addEventListener("click", () => {
      $("#q-rating").value = 5;
      markRating($("#q-rating"), true);
      updateQuickRatingDisplay();
      UI.focusRating($("#q-rating"));
    });
    ["input", "change"].forEach(ev => $("#q-date").addEventListener(ev, () => { $("#q-date").dataset.touched = "1"; }));
    $("#q-save").addEventListener("click", oneAtATime(saveQuick));
    $("#q-full").addEventListener("click", () => { toggleQuick(false); activateScreen("entry"); });
  }

  // Made available to the other screens.
  Object.assign(UI, {
    toggleQuick, wireQuick, saveQuick, updateQuickRatingDisplay, updateQuickWarnings,
    updateQuickRepeat,
    updateQuickPanel, updateQuickRecipes, quickRating, isQuickOpen, onQuickCoffeeChoice,
  });
})();
