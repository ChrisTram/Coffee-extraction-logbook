/* Entry screen: the form and the timer. The draft lives in ui-draft.js,
 * the quick panel floating on top of it in ui-quick.js, the side panel in
 * ui-entry-aside.js and the taste pills in ui-pills.js (split out in v8.78,
 * loaded right after us).
 *
 * This is the longest file, and for a good reason: this is where Chris spends
 * his time, often one-handed, on the phone, during an extraction. The draft
 * exists because leaving the tab is enough for a phone to unload the page to
 * reclaim memory. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, $f, enableLongPress, activateScreen, titleAttr, setPressed, detailRatio, fmtDuration,
    fmtDecimal, fmtVND, icon, localNow, wireDictation, wireRating, markRating, nav, isRatingEmpty, paintSlider, setHtml, setText, recipesForMethod, fallbacks, toast,
    findRecipe, oneAtATime } = UI;

  // ---------- Entry ----------

  /* Durations entered in minutes AND seconds, stored in seconds.
     Typing "4 min 18" is faster and less error-prone than converting 258 in
     your head, especially on a phone. Storage does not change: the CSVs keep
     seconds, so the history stays readable and there is nothing to migrate. */
  function readDuration(prefix) {
    const min = parseInt($("#" + prefix + "-min").value, 10);
    const sec = parseInt($("#" + prefix + "-sec").value, 10);
    const m = Number.isFinite(min) ? min : 0;
    const s = Number.isFinite(sec) ? sec : 0;
    // Both fields empty means "no time", not "zero seconds".
    if (!Number.isFinite(min) && !Number.isFinite(sec)) return "";
    return m * 60 + s;
  }

  function writeDuration(prefix, seconds) {
    const total = Number(seconds);
    if (seconds === "" || seconds === null || seconds === undefined || !Number.isFinite(total)) {
      $("#" + prefix + "-min").value = "";
      $("#" + prefix + "-sec").value = "";
    } else {
      $("#" + prefix + "-min").value = Math.floor(total / 60);
      $("#" + prefix + "-sec").value = total % 60;
    }
    // The wheels drawn over the fields (v9.13) follow what was just written.
    UI.syncTimeWheel(prefix);
  }

  const entry = {
    method: "Brikka",
    descriptors: new Set(),
    diagnostics: new Set(),
    editId: null,
    /* True as soon as the date comes from Chris rather than from a default.
       Without it, refreshing the date on arriving at the screen would overwrite
       the cup from last night that he is in the middle of logging. */
    dateTouched: false,
  };

  function selectableCoffees() {
    return DATA.state.coffees.filter(c => c.active !== 0);
  }

  function currentCoffeeGround() {
    const c = DATA.state.coffees.find(x => x.id === $("#f-coffee").value);
    return !!(c && Number(c.pre_ground) === 1);
  }

  function fillCoffeeSelect(keepId) {
    // Deactivated coffees do NOT appear in the entry form. Only exception:
    // editing an old extraction whose coffee has since been deactivated
    // (the option is injected back so the value stays displayable).
    const sel = $("#f-coffee");
    const value = keepId || sel.value;
    const keptInactive = DATA.state.coffees.find(c => c.id === value && c.active === 0);
    sel.innerHTML = '<option value="">' + I18N.t("pick_coffee") + "</option>" +
      selectableCoffees().map(c => '<option value="' + titleAttr(c.id) + '">' + titleAttr(c.name) + "</option>").join("") +
      (keptInactive ? '<option value="' + titleAttr(keptInactive.id) + '">' + titleAttr(keptInactive.name) + " " + I18N.t("inactive_suffix") + "</option>" : "");
    if (value) sel.value = value;
    // O2 (v9.18): the open bags as jars above the menu, which they drive and follow (js/ui-coffees.js).
    UI.renderCoffeeJars();
  }

  function fillRecipeSelect() {
    const sel = $("#f-recipe");
    const value = sel.value;
    const list = recipesForMethod(entry.method);
    sel.innerHTML = list.map(r => "<option>" + r.name + "</option>").join("");
    if (list.some(r => r.name === value)) sel.value = value;
    else {
      /* Fall back to the FIRST recipe when none is marked as default, which is
         the case for every Brikka one. The browser already selects the first
         option on its own, but the code did not know: from its point of view
         sel.value stayed empty, so prefillFromRecipe returned without doing
         anything and the 150 g of water never arrived. */
      const fallback = list.find(r => r.isDefault) || list[0];
      if (fallback) sel.value = fallback.name;
    }
  }

  function chooseMethod(m, keepRecipe) {
    entry.method = m;
    $$(".btn-method").forEach(b => setPressed(b, b.dataset.method === m));
    // Q12 (v9.17): the brewer drawn next to the buttons melts into the other one.
    UI.paintBrewer($("#f-brewer"), m);
    // Fields specific to each method.
    $("#field-add-water").hidden = m !== "Brikka";
    $("#field-power").hidden = m !== "Brikka";
    $("#field-agitation").hidden = m !== "Switch";
    /* The whole temperature is a SWITCH field. On the Brikka the water heats in
       the boiler, there is nothing to measure beforehand: the only question is
       the "preheated water" box, and it has its own field. */
    $("#field-temp").hidden = m !== "Switch";
    if ($("#row-heat")) $("#row-heat").hidden = m !== "Switch";
    UI.syncTimeWheel("f-heat");
    updateTempHint();
    // Default cup: Flat White Egg for the Brikka, Classic Mug for the Switch.
    const defaultCups = { "Brikka": "Loveramics Flat White Egg", "Switch": "Classic Mug" };
    const currentCup = $("#f-cup").value;
    if ((currentCup === "" || Object.values(defaultCups).includes(currentCup)) &&
        DATA.state.cups.some(t => t.name === defaultCups[m])) {
      $("#f-cup").value = defaultCups[m];
    }
    if (!keepRecipe) fillRecipeSelect();
    updatePreheatField();
    updateWarnings();
    updateLive();
  }

  /* The "preheated water" box only makes sense when the recipe does not already
     settle the question. In the brikka-classique family, it is THE difference
     between the two variants: showing the box as well would allow saving a
     contradiction, such as a preheated recipe with the box unchecked.
     So the box is hidden and the value is derived from the recipe. */
  function updatePreheatField() {
    const r = findRecipe($("#f-recipe").value);
    const familyDecides = !!r && PREHEAT_FAMILIES.includes(r.family || "");
    /* ALWAYS visible on the Brikka (v7.95, at Chris's request): it is the only
       question the Brikka asks about the water. In the brikka-classique family
       the box and the recipe variant say the same thing, so they stay in
       agreement both ways: the recipe checks the box, and checking the box
       changes the recipe (onPreheat). */
    $("#field-preheat").hidden = entry.method !== "Brikka";
    if (familyDecides) $("#f-preheat").checked = PREHEATED_WATER_RECIPES.includes(r.id);
  }

  /* Checking or unchecking "preheated water" when the recipe is one of the two
     classic Brikka ones switches to the other variant, so that a preheated
     recipe cannot be saved with the box unchecked. On the other Brikka
     recipes, the box is a plain data point about the cup. */
  function onPreheat() {
    const r = findRecipe($("#f-recipe").value);
    if (!r || !PREHEAT_FAMILIES.includes(r.family || "")) return;
    const wanted = $("#f-preheat").checked;
    const target = recipesForMethod("Brikka").find(x =>
      x.family === r.family && PREHEATED_WATER_RECIPES.includes(x.id) === wanted);
    if (!target || target.name === r.name) return;
    $("#f-recipe").value = target.name;
    prefillFromRecipe(target.name);
    updateWarnings();
  }

  // Does the recipe ask for stirring? Checks agitation by default.
  function updateAgitationFromRecipe() {
    const r = findRecipe($("#f-recipe").value);
    if (!r || r.method !== "Switch") return;
    const stirs = UI.stepsFor(r).some(e => /remuer/i.test(e.text));
    $("#f-agitation-yes").checked = stirs;
    $("#row-agitation").hidden = !stirs;
    if (stirs && !$("#f-agitation").value) $("#f-agitation").value = 1;
  }

  /* How much the milk SWELLS when frothed, depending on the target texture. The
     space to fill divided by this factor gives the COLD milk to measure in the
     jug. A flat white is a smooth texture, barely aerated. A cappuccino aims
     for a third of foam, about half as much volume again: that is why it
     starts from less milk while filling the same cup. */
  const SWELL_FLAT = 1.1;
  const SWELL_CAPPU = 1.5;

  // Milk field: visible when the recipe calls for it, prefilled from the cup.
  function updateMilk() {
    const r = findRecipe($("#f-recipe").value);
    const visible = !!(r && r.milk);
    $("#field-milk").hidden = !visible;
    if (!visible) return;
    const cup = DATA.state.cups.find(t => t.name === $("#f-cup").value);
    /* The MEASURED coffee volume, never estimated on a Brikka: same reason as in
       estimatedVolume, and milk computed from a wrong volume is wrong milk.
       Without a measurement nothing is prefilled and we say so. */
    const measured = parseFloat($("#f-volume").value) ||
      estimatedVolume(parseFloat($("#f-dose").value), parseFloat($("#f-water").value));
    /* Fall back to the recipe's DECLARED yield. This is not a computed estimate,
       it is a measured figure written in the recipe: on a Brikka,
       estimatedVolume() returns 0 on purpose, the old formula announced 139 ml
       where Chris measures 90 to 115. Without this fallback, the milk was never
       computed for Brikka recipes, which are precisely the milk ones. */
    const coffeeVol = measured > 0 ? measured : (r.typicalVolume || 0);
    const declared = !(measured > 0) && coffeeVol > 0;
    if (!cup) {
      $("#milk-hint").textContent = I18N.t("milk_pick_cup");
      return;
    }
    if (!(coffeeVol > 0)) {
      $("#milk-hint").textContent = I18N.t("milk_no_volume");
      return;
    }
    /* The SPACE to fill, not yet the milk to pour: see below. */
    const milk = Math.max(0, cup.capacity_ml - coffeeVol);
    if (milk === 0) {
      $("#milk-hint").textContent = I18N.t("milk_cup_too_small");
      return;
    }
    /* BOTH DRINKS at once, counted on the SAME basis: cold milk to pour into the
       jug. Milk swells when frothed, so you pour less than the space to fill,
       and all the less the more you froth it. */
    const flat = Math.round(milk / SWELL_FLAT);
    const cappu = Math.round(milk / SWELL_CAPPU);
    $("#f-milk").value = flat;
    $("#milk-hint").textContent =
      I18N.t("milk_two", { e: milk, l: flat, c: cappu, t: cup.capacity_ml, v: coffeeVol }) +
      (declared ? " " + I18N.t("milk_declared") : "");
  }

  // Cups: dropdown list, capacity warning, mini editor.
  function fillCupSelect() {
    const sel = $("#f-cup");
    const v = sel.value;
    sel.innerHTML = '<option value=""></option>' + DATA.state.cups.map(t =>
      '<option value="' + titleAttr(t.name) + '">' + titleAttr(t.name) + " · " + t.capacity_ml + " ml</option>").join("");
    if (v && DATA.state.cups.some(t => t.name === v)) sel.value = v;
  }

  /* The cup overflow warning was REMOVED. It compared the expected volume to the
     capacity and cried overflow, assuming everything is served at once. But
     you can perfectly well pour in two goes, which makes the warning wrong in
     a perfectly normal use. A warning that is wrong mostly teaches you to
     ignore warnings.
     Cup capacity remains useful: it is used to compute the milk. */


  function renderCupEditor() {
    $("#cups-list").innerHTML = DATA.state.cups.map(t =>
      '<div class="cup-row"><span>' + t.name + " · " + t.capacity_ml + ' ml</span>' +
      '<button type="button" class="btn-row danger" data-cup-delete="' + t.id + '" title="' + I18N.t("btn_delete") + '">' + icon("croix") + "</button></div>"
    ).join("");
    $$("[data-cup-delete]").forEach(b => b.addEventListener("click", async () => {
      // Q5 (v9.20): the cup of the list goes to the grounds bin.
      UI.discardScene(b.closest(".cup-row"));
      await DATA.deleteCup(b.dataset.cupDelete);
      renderCupEditor();
      fillCupSelect();
    }));
  }

  /* A recipe whose grind is ON PURPOSE outside its machine's range (the Neo
     Brew, extra coarse) carries its setting: entry keeps it and does not warn. */
  const wantedDial = r => !!r && !!GRIND.parseDial(r.dial) && !GRIND.checkRange(r.method, r.dial).ok;
  function prefillFromRecipe(recipeName) {
    const r = findRecipe(recipeName);
    if (!r) return;
    /* The form now follows the RECIPE, including for water and temperature,
       instead of hard-coded values that overwrote it. That is what makes
       "Gérer les recettes" the real place to set your defaults: a single
       source of truth, editable, and already synced across devices.
       A recipe without a target temperature leaves the field EMPTY, which is
       the case for the Brikka ones: the temperature depends on the heat
       setting there, fixing it in advance would make no sense. */
    $("#f-dose").value = r.dose || fallbacks.dose;
    $("#f-water").value = r.water || "";
    // From the chosen coffee's roast when the source gives one per roast level (v9.00).
    const targetTemp = temperatureForCoffee(r, DATA.state.coffees.find(c => c.id === $("#f-coffee").value));
    $("#f-temp").value = targetTemp === "" || targetTemp === undefined ? "" : targetTemp;
    // A new recipe starts with no heating time: it is a measurement of the
    // current cup, not a recipe value. The hint says how long to aim for.
    writeDuration("f-heat", "");
    updateTempHint();
    // The grinder SETTING, not the recipe's target: see FACTORY_DIAL.
    $("#f-grind").value = currentCoffeeGround() ? "" : wantedDial(r) ? r.dial : fallbacks.dial;
    if (r.method === "Brikka") $("#f-power").value = r.heat_level || fallbacks.fire;
    updateAgitationFromRecipe();
    updatePreheatField();
    updateMilk();
    updateLive();
    updateWarnings();
    // The "not rated yet" label is generated: it does not follow the TreeWalker.
    updateRatingDisplay();
  }

  function onCoffeeChoice() {
    const coffee = DATA.state.coffees.find(c => c.id === $("#f-coffee").value);
    if (!coffee) { updateWarnings(); return; }
    // A coffee made on the other machine switches it: the fields roll as for a tap on the machine (Q12).
    const before = UI.methodSnapshot();
    // Preselects the recommended machine and recipe, everything stays editable.
    const recommended = findRecipe(coffee.recommended_recipe);
    if (recommended) {
      chooseMethod(recommended.method, true);
      fillRecipeSelect();
      $("#f-recipe").value = recommended.name;
      prefillFromRecipe(recommended.name);
    } else if (coffee.recommended_method === "Brikka" || coffee.recommended_method === "Switch") {
      chooseMethod(coffee.recommended_method);
      prefillFromRecipe($("#f-recipe").value);
    } else {
      // Same recipe, other coffee: the temperature follows its roast (v9.00).
      const r = findRecipe($("#f-recipe").value);
      const t = r && TEMP_BY_ROAST[r.id] ? temperatureForCoffee(r, coffee) : "";
      if (t !== "" && t !== undefined) { $("#f-temp").value = t; updateTempHint(); }
    }
    if (entry.method !== before.method) UI.playMethodChange(before);
    updateWarnings();
    updateLive();
  }

  /* TEMPERATURE FROM HEATING TIME, Switch only. Chris types how long the
     kettle spent on the stove; the degree is derived from it (model in
     recipes.js, boiling time in Settings) and written into the temperature
     field, which stays editable by hand and remains the stored value.
     With no time entered but a recipe target, the hint says how long to
     aim for. The Brikka sees none of this: its row is hidden. */
  function onHeatInput() {
    const s = readDuration("f-heat");
    if (s !== "") {
      const t = temperatureFromHeating(s, fallbacks.boil, fallbacks.bubbles);
      if (t !== "") $("#f-temp").value = t;
    }
    updateTempHint();
    updateWarnings();
  }

  function updateTempHint() {
    const hint = $("#temp-hint");
    if (!hint) return;
    if (entry.method !== "Switch") { setText(hint, ""); return; }
    const e = fallbacks.boil;
    const s = readDuration("f-heat");
    const t = $("#f-temp").value;
    /* Without a boiling time there is nothing to say: the factory fallback sets
       one, and Settings lets you correct it. The old paragraph asking you to
       go and time your kettle distorted the layout for a setting you make
       once. */
    if (!(e > 0)) { setText(hint, ""); return; }
    if (s !== "") {
      setText(hint, I18N.t("temp_estimate", { d: fmtDuration(s), t: temperatureFromHeating(s, e, fallbacks.bubbles) }));
    } else if (t !== "") {
      setText(hint, I18N.t("temp_advice", { t, d: fmtDuration(heatTimeForTemperature(t, e, fallbacks.bubbles)) }));
    } else {
      setText(hint, "");
    }
  }

  /* The rating is optional. As long as the slider has not been touched, it
     has no thumb (isRatingEmpty, in the core): we save "" and the extraction
     counts as unrated everywhere (averages, insights, best settings, which
     already filter on score_10 !== ""). The Clear button returns to that state. */
  function updateRatingDisplay() {
    const slider = $("#f-rating");
    const empty = isRatingEmpty(slider);
    const label = empty ? I18N.t("not_rated_yet") : slider.value + " / 10";
    $("#rating-shown").textContent = label;
    slider.setAttribute("aria-valuetext", label);
    $("#f-rating-help").hidden = !empty;
    $("#f-rating-clear").hidden = empty;
    paintSlider(slider);
    UI.paintRatingDial(slider);
  }

  /* What goes to the database: an empty string when the cup is not rated, so
     that averages, insights and best settings all exclude it the same way.
     They already filter on score_10 !== "". */
  function entryRating() {
    return isRatingEmpty($("#f-rating")) ? "" : $("#f-rating").value;
  }

  /* Age of the bag at the time of the cup, shown under the coffee choice.
     Read-only: it is DERIVED from the bag's opening date, entering it by hand
     would be a second truth. Silent as long as no opening date is filled in,
     rather than showing a false zero. */
  function updateBagAge() {
    const zone = $("#age-pack");
    if (!zone) return;
    const c = DATA.calcs({
      coffee_id: $("#f-coffee").value,
      date_time: $("#f-date").value || localNow(),
    });
    if (c.days_open === "") { zone.hidden = true; zone.textContent = ""; return; }
    zone.hidden = false;
    zone.textContent = I18N.t("bag_open_days", { n: c.days_open });
  }

  function updateWarnings() {
    const zone = $("#warnings");
    const coffee = DATA.state.coffees.find(c => c.id === $("#f-coffee").value);
    const warnings = combinationWarnings(coffee, entry.method, $("#f-recipe").value, DATA.state.recipes);
    const msgs = warnings.msgs.slice();
    const dial = $("#f-grind").value.trim();
    if (dial && !currentCoffeeGround() && !wantedDial(findRecipe($("#f-recipe").value))) {
      const v = GRIND.checkRange(entry.method, dial);
      if (!v.ok) msgs.push(v.message);
    }
    zone.innerHTML = msgs.map(m => '<div class="warning">' + m + "</div>").join("");
    updateBagAge();
    UI.updateEntryAside();
  }

  /* Explains the displayed ratio: which formula was used, and why. The
     calculation differs by machine and nobody can guess it by looking at a
     "1:5,6". See DATA.calcs for the logic. */
  /* ESTIMATED cup volume, when Chris has not measured it.

     SWITCH: the paper and the grounds retain about 2.1 g of water per gram of
     coffee. The rest passes through, so `eau - 2,1 x dose` is a good approximation.

     BRIKKA: NO ESTIMATE, on purpose. The formula was `eau - 0,7 x
     dose`, i.e. 139 ml announced for 150 g in the boiler and 16 g of coffee.
     Chris measures 90 to 115 ml. The error came from the model: on a moka pot
     the boiler does not empty, part of the water stays below the mouth of the
     tube and another part leaves as steam, and both losses depend on the
     flame and the moment you take it off the heat, not on the dose. A wrong
     figure is worse than no figure: it fed the ratio, the drink volume and
     the "reprendre" button.
     Do not put a Brikka formula back without measured data. */
  function estimatedVolume(dose, water) {
    if (entry.method === "Brikka") return 0;
    if (!(dose > 0) || !(water > 0)) return 0;
    return Math.max(0, Math.round((water - 2.1 * dose) / 5) * 5);
  }

  function updateLive() {
    updateSliders();
    const dose = parseFloat($f("#f-dose").value);
    const water = parseFloat($f("#f-water").value);
    /* Same logic as DATA.calcs: the main ratio is WATER over DOSE on both
       machines, it is the universal convention and the only one comparable to
       a recipe. The in-cup ratio follows second, and only if it is measured. */
    const volume = parseFloat($f("#f-volume").value);
    const brikka = entry.method === "Brikka";
    let ratio = "…", base = "";
    if (dose > 0 && water > 0) {
      ratio = "1:" + (water / dose).toFixed(1);
      base = brikka ? "boiler" : "infusion";
    }
    const inCup = dose > 0 && volume > 0 ? "1:" + (volume / dose).toFixed(1) : "";
    const explanation = base ? detailRatio(base, dose, water) : I18N.t("ratio_nothing");
    setHtml($f("#live-ratio"), I18N.t("live_ratio") +
      ' <b class="help-ratio" tabindex="0" data-info="' + titleAttr(explanation) + '">' + ratio + "</b>" +
      (inCup ? ' <small>(' + I18N.t("ratio_cup_short") + " " + inCup + ")</small>" : ""));

    // Pre-ground coffee: the dial does not apply, the bag's default grind.
    const preground = currentCoffeeGround();
    const grindField = $f("#f-grind");
    grindField.disabled = preground;
    if (preground && grindField.value) grindField.value = "";
    grindField.placeholder = preground ? I18N.t("bag_default") : "1.5.0";

    const dial = grindField.value.trim();
    const p = GRIND.parseDial(dial);
    const outOfRange = !preground && p && !GRIND.checkRange(entry.method, dial).ok && !wantedDial(findRecipe($f("#f-recipe").value));
    setHtml($f("#live-grind"), I18N.t("live_grind") + " <b>" +
      (preground ? I18N.t("bag_default")
        : p ? I18N.t("live_detail", { c: p.clicks, u: Math.round(p.microns) })
        : dial ? I18N.t("live_invalid") : "…") + "</b>");
    $f("#live-grind").classList.toggle("out-range", !!outOfRange || (!preground && dial !== "" && !p));
    // Detail shown right under the dial field.
    const grindDetail = $f("#grind-detail");
    if (preground) {
      setText(grindDetail, I18N.t("bag_default"));
      grindDetail.classList.remove("hint-alert");
    } else if (p) {
      setText(grindDetail, I18N.t("live_detail", { c: p.clicks, u: Math.round(p.microns) }) + " · " + GRIND.bandOf(p.microns).name);
      grindDetail.classList.toggle("hint-alert", !!outOfRange);
    } else {
      setText(grindDetail, dial ? I18N.t("live_invalid") : "");
      grindDetail.classList.toggle("hint-alert", !!dial);
    }
    /* The dials (v9.13) after the field's state: value, pre-ground, coffee and
       machine; the recipe form's and Settings' follow a language switch here too. */
    UI.paintGrindDials();

    const coffee = DATA.state.coffees.find(c => c.id === $f("#f-coffee").value);
    let cost = "…";
    if (coffee && coffee.price_vnd && coffee.bag_size_g && dose > 0) {
      cost = fmtVND(coffee.price_vnd / coffee.bag_size_g * dose);
      // Not pure coffee: second value, the cost relative to the real coffee.
      const pct = coffee.real_coffee_pct === "" || coffee.real_coffee_pct === undefined ? 100 : Number(coffee.real_coffee_pct);
      if (pct < 100 && pct > 0) {
        cost += " <small>(" + I18N.t("live_real_cost", { v: fmtVND(coffee.price_vnd / (coffee.bag_size_g * pct / 100) * dose) }) + ")</small>";
      }
    }
    setHtml($f("#live-cost"), I18N.t("live_cost") + " <b>" + cost + "</b>");

    // Drink volume: extraction plus added water plus milk, live.
    const volBase = parseFloat($f("#f-volume").value) || estimatedVolume(dose, water) || 0;
    const addedWater = !$f("#field-add-water").hidden && $f("#f-add-water-yes").checked ? (parseFloat($f("#f-water-added").value) || 0) : 0;
    const milkMl = !$f("#field-milk").hidden ? (parseFloat($f("#f-milk").value) || 0) : 0;
    const drinkSpan = $f("#live-drink");
    if (volBase > 0 && (addedWater > 0 || milkMl > 0)) {
      const parts = [];
      if (addedWater > 0) parts.push("+" + addedWater + " ml");
      if (milkMl > 0) parts.push("+" + milkMl + " ml " + I18N.t("live_milk"));
      drinkSpan.hidden = false;
      setHtml(drinkSpan, I18N.t("live_drink") + " <b>" + volBase + " ml (" + parts.join(", ") + ") = " + (volBase + addedWater + milkMl) + " ml</b>");
    } else {
      drinkSpan.hidden = true;
    }

    const btnVol = $f("#volume-estimate");
    const estimate = estimatedVolume(dose, water);
    if (estimate) {
      btnVol.hidden = false;
      btnVol.textContent = I18N.t("volume_estimate", { v: estimate });
      btnVol.title = I18N.t("volume_title", { m: entry.method });
      btnVol.dataset.value = estimate;
    } else {
      btnVol.hidden = true;
      delete btnVol.dataset.value;
    }
  }


  // Corrections for the checked diagnostics, one line each, under the pills.
  // Opposite families on the extraction axis: checking one of each stacks two
  // corrections that cancel out (grind finer AND coarser). That is the sign
  // of an uneven extraction, which has its own value.
  const UNDER_EXTRACTED_DIAGS = ["Un peu acide", "Sous-extrait (acide)"];
  const OVER_EXTRACTED_DIAGS = ["Un peu amer", "Sur-extrait (amer)", "Un peu astringent", "Astringent"];
  const UNEVEN_DIAG = DERIVED_DIAGNOSTIC;

  function updateDiagnosticCorrection() {
    const lines = DIAGNOSTICS
      .filter(d => entry.diagnostics.has(d))
      .map(d => I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || ""))
      .filter(Boolean);

    /* Sour AND bitter together: the site CONCLUDES instead of asking Chris to
       check a third pill. The two original corrections cancel out (grind
       finer AND coarser), so they are replaced instead of stacked, otherwise
       he reads two opposite pieces of advice without knowing which to follow. */
    const uneven = UNDER_EXTRACTED_DIAGS.some(d => entry.diagnostics.has(d)) &&
      OVER_EXTRACTED_DIAGS.some(d => entry.diagnostics.has(d));
    if (uneven) {
      $("#diagnostic-correction").innerHTML =
        '<b class="diag-alert">' + I18N.diag(UNEVEN_DIAG) + "</b><br>" +
        I18N.tr(DIAGNOSTIC_CORRECTIONS[UNEVEN_DIAG] || "");
      return;
    }

    const quantified = correctionText(TUNING.quantifiedCorrection(extFromForm(), fallbacks.stepSizes, currentCoffeeGround()));
    $("#diagnostic-correction").innerHTML = lines.join("<br>") +
      (quantified ? '<span class="corr-numeric">' + quantified + "</span>" : "");
  }

  /* THE QUANTIFIED CORRECTION (v8.48), in words. The calculation is TUNING.quantifiedCorrection;
     here only the sentence: the first lever, then the others "if that is not
     enough". Empty when there is nothing to quantify. */
  function leverText(l) {
    if (l.lever === "grind") {
      return I18N.t("correction_grind", { from: l.from, to: l.to, e: (l.gap > 0 ? "+" : "") + l.gap,
        a: l.microns[0], b: l.microns[1] });
    }
    return I18N.t("correction_" + l.lever, { from: fmtDecimal(l.from, 1), to: fmtDecimal(l.to, 1) });
  }
  function correctionText(levers, brief) {
    if (!levers.length) return "";
    const [first, ...others] = levers;
    return I18N.t("correction_next", { q: leverText(first) }) +
      (others.length && !brief ? " " + I18N.t("correction_then", { q: others.map(leverText).join(", ") }) : "");
  }
  // The fields the correction reads, as the form holds them.
  function extFromForm() {
    return {
      method: entry.method, grind_dial: $("#f-grind").value.trim().replace(/,/g, "."),
      temperature_c: $("#f-temp").value, heat_level: $("#f-power").value,
      water_g: $("#f-water").value, dose_g: $("#f-dose").value,
      diagnostic: DIAGNOSTICS.filter(d => entry.diagnostics.has(d)).join("|"),
    };
  }

  /* Called on EVERY arrival on the Entry screen for a new cup. The date was
     only set when the form was reset, i.e. at startup and after a save: on a
     phone where the page stays open, it therefore showed the time of the
     previous cup. */
  function refreshEntryDate() {
    if (entry.dateTouched) return;
    $("#f-date").value = localNow();
  }

  // The date comes from Chris as soon as he touches it, no longer from a default.
  function markDateTouched() { entry.dateTouched = true; }

  /* The slider / field pairs. The FIELD remains the source of truth, the slider
     drives it: all the rest of the code reads the field, the draft saves it,
     editing fills it. Reversing the roles would have meant touching everything.

     Grind is the only special case: its field holds a dial
     rotation.number.click, not a number, so the slider runs over CLICKS and
     the conversion goes through the grind engine, like the Guide's
     converter. */
  const SLIDER_PAIRS = [
    { slider: "f-dose-slider", field: "f-dose" },
    { slider: "f-water-slider", field: "f-water" },
    { slider: "f-power-slider", field: "f-power" },
    { slider: "f-agitation-slider", field: "f-agitation" },
    {
      slider: "f-grind-slider", field: "f-grind",
      toField: clicks => GRIND.dialFromClicks(Number(clicks)),
      toSlider: dial => { const p = GRIND.parseDial(dial); return p ? p.clicks : null; },
    },
  ];

  /* THE UP AND DOWN BUTTONS of number fields (v8.35). Chrome hides its own
     arrows below a certain width: Temperature, 66 px, had none.
     stepUp/stepDown do the work, including the field's min and max bounds;
     we then replay its input event, which the rest of the form listens to for
     the live line, the draft and the warnings.

     Holding the button repeats, like a real system arrow: 400 ms before the
     first repeat, then one step every 90 ms. Without it, going from 92 to 100
     takes eight clicks. */
  function wireSteppers() {
    let timer = null, repeater = null;
    const stop = () => { clearTimeout(timer); clearInterval(repeater); timer = repeater = null; };
    $$("[data-incr]").forEach(b => {
      const field = $("#" + b.dataset.incrField);
      if (!field) return;
      const step = () => {
        if (field.value === "") field.value = field.min || 0;
        else if (Number(b.dataset.incr) > 0) field.stepUp();
        else field.stepDown();
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      b.addEventListener("pointerdown", ev => {
        // Left button only: a right click opens the menu, it does not count.
        if (ev.button !== 0) return;
        ev.preventDefault();
        step();
        timer = setTimeout(() => { repeater = setInterval(step, 90); }, 400);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(e => b.addEventListener(e, stop));
    });
    window.addEventListener("blur", stop);
  }

  function wireSliders() {
    SLIDER_PAIRS.forEach(c => {
      const slider = $("#" + c.slider), field = $("#" + c.field);
      if (!slider || !field) return;
      slider.addEventListener("input", () => {
        paintSlider(slider);
        field.value = c.toField ? c.toField(slider.value) : slider.value;
        /* Replay the FIELD's event: that is what the rest of the form listens to,
           for the live line, the draft and the warnings.
           Calling them by hand here would forget one sooner or later. */
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }

  /* Puts the sliders back in line with their fields. Called from updateLive(), so
     after every reset, every recipe prefill and every opening of an
     extraction: those are the moments when the field changes WITHOUT the
     slider being touched. */
  function updateSliders() {
    SLIDER_PAIRS.forEach(c => {
      const slider = $("#" + c.slider), field = $("#" + c.field);
      if (!slider || !field) return;
      const v = c.toSlider ? c.toSlider(field.value) : field.value;
      // An empty or unreadable value leaves the slider where it is: moving it
      // to the minimum would suggest a setting Chris did not make.
      if (v === null || v === "" || isNaN(Number(v))) { paintSlider(slider); return; }
      if (String(slider.value) !== String(v)) slider.value = v;
      paintSlider(slider);
    });
    paintSlider($("#f-rating"));
  }

  function resetEntry(keepCoffee) {
    entry.editId = null;
    entry.dateTouched = false;
    entry.diagnostics.clear();
    entry.descriptors.clear();
    $("#entry-title").textContent = I18N.t("entry_new");
    $("#btn-save").textContent = I18N.t("entry_save");
    $("#btn-cancel-editing").hidden = true;
    $("#f-date").value = localNow();
    $("#f-dose").value = fallbacks.dose;
    /* The coffee is no longer left empty. Chris usually has only one active
       coffee at a time, and choosing it for every cup is a pointless click. We
       take the first in the list, the one the menu already shows on top.

       Deliberately WITHOUT onCoffeeChoice(): choosing a coffee by hand also
       applies its recommended machine and recipe, and switching the machine
       on every new entry would be much more than a prefilled field. */
    if (!keepCoffee) {
      const firstCoffee = selectableCoffees()[0];
      $("#f-coffee").value = firstCoffee ? firstCoffee.id : "";
    }
    $("#f-comment").value = "";
    // No thumb: the slider must not suggest any rating.
    $("#f-rating").value = 5;
    markRating($("#f-rating"), true);
    updateRatingDisplay();
    writeDuration("f-total", "");
    writeDuration("f-flow", "");
    $("#f-volume").value = "";
    $("#f-water").value = "";
    $("#f-temp").value = "";
    writeDuration("f-heat", "");
    $("#f-power").value = fallbacks.fire;
    $("#f-preheat").checked = false;
    $("#f-failed").checked = false;
    $("#f-add-water-yes").checked = false;
    $("#f-water-added").hidden = true;
    $("#f-water-added").value = "";
    $("#f-milk").value = "";
    updateAgitationFromRecipe();
    updateMilk();
    $$("#f-diagnostic .pill").forEach(x => setPressed(x, false));
    $$("#f-descriptors .tag").forEach(x => setPressed(x, false));
    UI.updateVisibleFamilies();
    $("#diagnostic-correction").textContent = "";
    UI.resetStopwatch();
    /* LAST, and this is the important point: the lines above set the fallbacks,
       the recipe has the final word. Without this call the blank form stayed
       empty, and the defaults set in Settings only arrived if you changed
       recipe again by hand. Placed higher up, it would be overwritten by the
       reset of the preheating.
       prefillFromRecipe ends with updateWarnings and updateLive. */
    prefillFromRecipe($("#f-recipe").value);
  }

  function loadExtractionIntoEntry(ext, isDuplicate) {
    // What the dial showed before a prefill: it turns from there (v9.18).
    const grindBefore = $("#f-grind").value;
    fillCoffeeSelect(ext.coffee_id);
    entry.editId = isDuplicate ? null : ext.id;
    $("#f-date").value = isDuplicate ? localNow() : ext.date_time;
    // It comes from the opened extraction, not from a default: leave it alone.
    entry.dateTouched = !isDuplicate;
    $("#f-coffee").value = ext.coffee_id;
    chooseMethod(ext.method || "Brikka", true);
    fillRecipeSelect();
    if (ext.recipe) $("#f-recipe").value = ext.recipe;
    $("#f-dose").value = ext.dose_g;
    $("#f-water").value = ext.water_g;
    $("#f-temp").value = ext.temperature_c;
    writeDuration("f-heat", ext.heating_s === undefined ? "" : ext.heating_s);
    updateTempHint();
    $("#f-grind").value = ext.grind_dial;
    $("#f-volume").value = ext.yield_ml;
    $("#f-add-water-yes").checked = ext.added_water_ml !== "" && ext.added_water_ml !== undefined;
    $("#f-water-added").hidden = !$("#f-add-water-yes").checked;
    $("#f-water-added").value = ext.added_water_ml !== undefined ? ext.added_water_ml : "";
    $("#f-preheat").checked = Number(ext.preheated_water) === 1;
    $("#f-failed").checked = Number(ext.failed) === 1;
    updatePreheatField();
    $("#f-power").value = ext.heat_level || "";
    $("#f-agitation-yes").checked = ext.stir_count !== "" && ext.stir_count !== undefined;
    $("#row-agitation").hidden = !$("#f-agitation-yes").checked;
    $("#f-agitation").value = ext.stir_count !== undefined && ext.stir_count !== "" ? ext.stir_count : 1;
    $("#f-cup").value = ext.cup || "";
    $("#f-milk").value = ext.milk_ml !== undefined ? ext.milk_ml : "";
    $("#field-milk").hidden = !(findRecipe(ext.recipe) || {}).milk;
    writeDuration("f-total", ext.total_time_s);
    writeDuration("f-flow", ext.flow_time_s);
    $("#f-rating").value = ext.score_10 === "" ? 5 : ext.score_10;
    markRating($("#f-rating"), ext.score_10 === "");
    updateRatingDisplay();
    $("#f-comment").value = ext.comment;
    entry.diagnostics = new Set((ext.diagnostic || "").split("|").filter(Boolean));
    $$("#f-diagnostic .pill").forEach(x => x.classList.toggle("on", entry.diagnostics.has(x.dataset.diag)));
    updateDiagnosticCorrection();
    entry.descriptors = new Set((ext.descriptors || "").split("|").filter(Boolean));
    $$("#f-descriptors .tag").forEach(x => x.classList.toggle("on", entry.descriptors.has(x.dataset.tag)));
    /* A family that has just received a checked taste must reappear. */
    UI.updateVisibleFamilies();
    $("#entry-title").textContent = isDuplicate ? I18N.t("entry_duplicated") : I18N.t("entry_edit");
    $("#btn-save").textContent = isDuplicate ? I18N.t("entry_save") : I18N.t("entry_save_changes");
    $("#btn-cancel-editing").hidden = isDuplicate;
    updateWarnings();
    updateLive();
    // The second argument tells the Entry screen that this switch IS the opening
    // of an edit, so it must not abandon it on arrival.
    activateScreen("entry", true);
    /* A PREFILL TURNS THE DIAL (v9.18): « Refaire », the reprise of a new bag,
       the winning setting of Ctrl K or of Mes réglages, the next cup of a
       coffee all come through here. The grinder dial turns notch by notch
       from what it showed to the new setting, and the field glows. An edit
       opens as it is. */
    if (isDuplicate) UI.turnGrindDial(grindBefore);
  }

  /* REMAKING A CUP means taking its SETTINGS, not its result (v8.41).
     Duplication also copied the rating, the tastes, the diagnostics, the
     comment and the measured times: a cup not yet brewed arrived with the
     previous day's 7, exactly the invented rating that "not rated yet"
     exists to prevent. Used by the history's Duplicate button and by the
     icon's "Refaire ma dernière tasse" shortcut. */
  function settingsOnly(ext) {
    return {
      ...ext, score_10: "", comment: "", diagnostic: "", descriptors: "", failed: "",
      total_time_s: "", flow_time_s: "", yield_ml: "",
    };
  }
  function redoCup(ext) {
    loadExtractionIntoEntry(settingsOnly(ext), true);
  }
  /* The most recent by date, not the last in the array: a cup added after the
     fact with a past date lands at the end of the list. */
  function redoLast() {
    const latest = DATA.state.extractions.reduce(
      (a, e) => (!a || String(e.date_time) > String(a.date_time) ? e : a), null);
    if (!latest) { activateScreen("entry"); return false; }
    redoCup(latest);
    return true;
  }

  async function saveEntry(ev) {
    ev.preventDefault();
    if (!$("#f-dose").value) { toast(I18N.t("toast_dose")); return; }
    const ext = {
      date_time: $("#f-date").value || localNow(),
      coffee_id: $("#f-coffee").value,
      method: entry.method,
      recipe: $("#f-recipe").value,
      dose_g: $("#f-dose").value,
      water_g: $("#f-water").value,
      grind_dial: $("#f-grind").value.trim().replace(/,/g, "."),
      // Brikka: neither temperature nor heating time, the water heats in the boiler.
      temperature_c: entry.method === "Switch" ? $("#f-temp").value : "",
      heating_s: entry.method === "Switch" ? readDuration("f-heat") : "",
      total_time_s: readDuration("f-total"),
      flow_time_s: readDuration("f-flow"),
      yield_ml: $("#f-volume").value,
      added_water_ml: entry.method === "Brikka" && $("#f-add-water-yes").checked ? $("#f-water-added").value : "",
      milk_ml: !$("#field-milk").hidden ? $("#f-milk").value : "",
      stir_count: entry.method === "Switch" && $("#f-agitation-yes").checked ? ($("#f-agitation").value || 1) : "",
      cup: $("#f-cup").value,
      preheated_water: entry.method === "Brikka" && $("#f-preheat").checked ? 1 : "",
      failed: $("#f-failed").checked ? 1 : "",
      heat_level: entry.method === "Brikka" ? $("#f-power").value : "",
      score_10: entryRating(),
      diagnostic: DIAGNOSTICS.filter(d => entry.diagnostics.has(d)).join("|"),
      descriptors: Array.from(entry.descriptors).join("|"),
      comment: $("#f-comment").value.trim(),
    };
    if (entry.editId) {
      await DATA.editExtraction(entry.editId, ext);
      UI.clearDraft();
      toast(I18N.t("toast_updated"));
      resetEntry();
      activateScreen("history");
    } else {
      const saved = await DATA.addExtraction(ext);
      UI.clearDraft();
      /* A quantifiable diagnostic: the message offers to prepare the next cup
         with the correction applied. Nothing changes without that click, and
         the message goes away by itself. */
      const levers = TUNING.quantifiedCorrection(ext, fallbacks.stepSizes, currentCoffeeGround());
      if (levers.length) {
        UI.toastAction(I18N.t("toast_saved") + ". " + correctionText(levers, true), I18N.t("correction_prepare"), () => {
          redoCup({ ...ext, [levers[0].field]: levers[0].to });
          UI.scheduleDraft();
          toast(I18N.t("correction_ready"));
        });
      } else {
        toast(I18N.t("toast_saved"));
      }
      resetEntry(true);
      activateScreen("dashboard");
      // Q2 (v9.13): the cup fills on top of the dashboard, without blocking it.
      UI.showCupCard(saved);
    }
  }

  /* Wiring of the screen's controls. Called once by app.js, at startup.
     Each screen wires what belongs to it: the form, the timer, the options and
     the cup editor live here, and a four-hundred-line wiring function in
     app.js no longer exists. */

  function wireEntry() {
    wireDictation($("#f-dictate"), $("#f-comment"), $("#f-dictate-text"), $("#f-dictate-live"));
    /* Q12 (v9.17): what the fields showed before, so that what the other
       machine changes rolls to its new value (js/ui-brewer.js). The fields
       hold their new values at once: the roll only draws on top of them. */
    $$(".btn-method").forEach(b => b.addEventListener("click", () => {
      const before = UI.methodSnapshot();
      chooseMethod(b.dataset.method);
      prefillFromRecipe($("#f-recipe").value);
      UI.playMethodChange(before);
    }));
    $("#f-coffee").addEventListener("change", onCoffeeChoice);
    /* As soon as Chris touches the date, it is HIS: arriving on the screen will
       no longer replace it. He sometimes logs a cup from last night. "input" as
       well as "change": on a datetime-local field, each edited part emits
       "input", and "change" only arrives on confirmation. */
    ["input", "change"].forEach(ev => $("#f-date").addEventListener(ev, markDateTouched));
    $("#f-date").addEventListener("change", updateBagAge);
    $("#f-recipe").addEventListener("change", () => { prefillFromRecipe($("#f-recipe").value); updateWarnings(); });
    ["f-temp", "f-power"].forEach(id => $("#" + id).addEventListener("input", UI.updateTwins));
    ["f-grind", "f-temp", "f-power", "f-water", "f-dose"].forEach(id =>
      $("#" + id).addEventListener("input", updateDiagnosticCorrection));
    ["f-dose", "f-water", "f-grind", "f-volume"].forEach(id =>
      $("#" + id).addEventListener("input", () => { updateLive(); updateWarnings(); }));
    // updateWarnings redraws the side panel, the timer needs an explicit
    // reminder: its steps are scaled to the water entered.
    $("#f-water").addEventListener("input", () => UI.updateStopwatchSteps(false));
    // The extracted volume drives the milk prefill, it must refresh it.
    $("#f-volume").addEventListener("input", updateMilk);
    ["f-heat-min", "f-heat-sec"].forEach(id => $("#" + id).addEventListener("input", onHeatInput));
    $("#f-preheat").addEventListener("change", onPreheat);
    // A manual entry of the degree always has the final word; the hint follows.
    $("#f-temp").addEventListener("input", updateTempHint);
    wireRating($("#f-rating"), updateRatingDisplay);
    $("#f-rating-clear").addEventListener("click", () => {
      $("#f-rating").value = 5;
      markRating($("#f-rating"), true);
      updateRatingDisplay();
      UI.scheduleDraft();
      UI.focusRating($("#f-rating"));
    });
    $("#chrono-toggle").addEventListener("click", () => UI.toggleStopwatch());
    /* Start OPENS the timer: an extraction has just been started, the steps
       and the stop button must be at hand without one more click. */
    $("#btn-chrono").addEventListener("click", () => { UI.toggleStopwatch(true); });
    $("#btn-chrono").addEventListener("click", UI.stopwatchPrimary);
    $("#btn-chrono-stop").addEventListener("click", UI.stopStopwatch);
    $("#btn-chrono-reset").addEventListener("click", UI.resetStopwatch);
    // ONCE ONLY: the containers survive pill rebuilds, attaching them
    // from buildPills would stack one set per language switch.
    UI.wirePills();
    UI.wireRecipeBand();
    wireSliders();
    wireSteppers();
    /* v9.13: the drawn controls, each driving the field it sits on: the
       grinder dials (here, in the recipe form and in Settings), the rating
       dial, and the time wheels. */
    UI.wireGrindDials();
    UI.mountRatingDial($("#f-rating"), $("#f-rating-dial"));
    UI.mountTimeWheel("f-total", $("#f-total-wheel"), $("#f-total-quick"), "total");
    UI.mountTimeWheel("f-flow", $("#f-flow-wheel"), $("#f-flow-quick"), "flow");
    UI.mountTimeWheel("f-heat", $("#row-heat"), $("#f-heat-quick"), null);
    enableLongPress($("#f-diagnostic"));
    enableLongPress($("#f-descriptors"));
    $("#tastes-plus").addEventListener("click", () => UI.toggleFamilies());
    $("#chrono-beep").addEventListener("change", () => {
      try { localStorage.setItem("beeps", $("#chrono-beep").checked ? "1" : "0"); } catch (e) { /* never mind */ }
    });
    $("#form-entry").addEventListener("submit", oneAtATime(saveEntry));
    $("#form-entry").addEventListener("input", UI.scheduleDraft);
    $("#form-entry").addEventListener("change", UI.scheduleDraft);
    // visibilitychange is the last reliable event before a mobile browser
    // unloads the page: write right away, without waiting for the debounce.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") UI.saveDraft();
    });
    // Q5 (v9.20): the edit given up goes to the grounds bin, as a sheet with its name.
    $("#btn-cancel-editing").addEventListener("click", () => {
      UI.discardScene($("#form-entry"), { label: I18N.t("scene_edit_dropped") });
      resetEntry();
      activateScreen("history");
    });
    // « Mes cafés » is a page since v9.18.
    $("#btn-manage-coffees").addEventListener("click", () => UI.openCoffeesPage());
    $("#volume-estimate").addEventListener("click", () => {
      const v = $("#volume-estimate").dataset.value;
      if (v !== undefined) { $("#f-volume").value = v; updateLive(); }
    });

    // Added water, agitation, milk, cup
    $("#f-add-water-yes").addEventListener("change", () => {
      $("#f-water-added").hidden = !$("#f-add-water-yes").checked;
      updateLive();
    });
    $("#f-water-added").addEventListener("input", updateLive);
    $("#f-agitation-yes").addEventListener("change", () => {
      $("#row-agitation").hidden = !$("#f-agitation-yes").checked;
      if ($("#f-agitation-yes").checked && !$("#f-agitation").value) $("#f-agitation").value = 1;
    });
    $("#f-milk").addEventListener("input", updateLive);
    $("#f-cup").addEventListener("change", () => { updateMilk(); updateLive(); });
    $("#btn-cups").addEventListener("click", () => {
      const editor = $("#cups-editor");
      editor.hidden = !editor.hidden;
      if (!editor.hidden) renderCupEditor();
    });
    $("#cup-add").addEventListener("click", async () => {
      const name = $("#cup-name").value.trim();
      const ml = parseFloat($("#cup-ml").value);
      if (!name || !(ml > 0)) { toast(I18N.t("toast_cup_invalid")); return; }
      await DATA.addCup(name, ml);
      $("#cup-name").value = "";
      $("#cup-ml").value = "";
      renderCupEditor();
      fillCupSelect();
      $("#f-cup").value = name;
      updateMilk();
      updateLive();
    });
  }

  // Made available to the other screens.
  Object.assign(UI, {
    wireSliders, wireEntry, currentCoffeeGround,
    selectableCoffees, loadExtractionIntoEntry, chooseMethod, UNEVEN_DIAG, UNDER_EXTRACTED_DIAGS, OVER_EXTRACTED_DIAGS, writeDuration, saveEntry,
    readDuration, updateRatingDisplay, redoLast, redoCup, updateBagAge, updateAgitationFromRecipe,
    updateWarnings, updatePreheatField, updateDiagnosticCorrection,
    updateSliders, updateMilk, updateLive, updateTempHint, markDateTouched,
    entryRating, prefillFromRecipe, refreshEntryDate, resetEntry,
    fillCoffeeSelect, fillRecipeSelect, fillCupSelect, renderCupEditor,
    entry, onHeatInput, onCoffeeChoice, onPreheat, estimatedVolume,
  });
})();
