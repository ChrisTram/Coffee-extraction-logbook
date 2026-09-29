/* Entry screen: the form and the timer. The draft lives in ui-brouillon.js,
 * the quick panel floating on top of it in ui-rapide.js, the side panel in
 * ui-saisie-aside.js and the taste pills in ui-pilules.js (split out in v8.78,
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
      return;
    }
    $("#" + prefix + "-min").value = Math.floor(total / 60);
    $("#" + prefix + "-sec").value = total % 60;
  }

  const entry = {
    methode: "Brikka",
    descripteurs: new Set(),
    diagnostics: new Set(),
    editId: null,
    /* True as soon as the date comes from Chris rather than from a default.
       Without it, refreshing the date on arriving at the screen would overwrite
       the cup from last night that he is in the middle of logging. */
    dateTouched: false,
  };

  function selectableCoffees() {
    return DATA.state.cafes.filter(c => c.actif !== 0);
  }

  function currentCoffeeGround() {
    const c = DATA.state.cafes.find(x => x.id === $("#f-cafe").value);
    return !!(c && Number(c.deja_moulu) === 1);
  }

  function fillCoffeeSelect(keepId) {
    // Deactivated coffees do NOT appear in the entry form. Only exception:
    // editing an old extraction whose coffee has since been deactivated
    // (the option is injected back so the value stays displayable).
    const sel = $("#f-cafe");
    const value = keepId || sel.value;
    const keptInactive = DATA.state.cafes.find(c => c.id === value && c.actif === 0);
    sel.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      selectableCoffees().map(c => '<option value="' + titleAttr(c.id) + '">' + titleAttr(c.nom) + "</option>").join("") +
      (keptInactive ? '<option value="' + titleAttr(keptInactive.id) + '">' + titleAttr(keptInactive.nom) + " " + I18N.t("inactif") + "</option>" : "");
    if (value) sel.value = value;
  }

  function fillRecipeSelect() {
    const sel = $("#f-recette");
    const value = sel.value;
    const list = recipesForMethod(entry.methode);
    sel.innerHTML = list.map(r => "<option>" + r.nom + "</option>").join("");
    if (list.some(r => r.nom === value)) sel.value = value;
    else {
      /* Fall back to the FIRST recipe when none is marked as default, which is
         the case for every Brikka one. The browser already selects the first
         option on its own, but the code did not know: from its point of view
         sel.value stayed empty, so prefillFromRecipe returned without doing
         anything and the 150 g of water never arrived. */
      const fallback = list.find(r => r.parDefaut) || list[0];
      if (fallback) sel.value = fallback.nom;
    }
  }

  function chooseMethod(m, keepRecipe) {
    entry.methode = m;
    $$(".btn-methode").forEach(b => setPressed(b, b.dataset.methode === m));
    // Fields specific to each method.
    $("#champ-ajout-eau").hidden = m !== "Brikka";
    $("#champ-puissance").hidden = m !== "Brikka";
    $("#champ-agitation").hidden = m !== "Switch";
    /* The whole temperature is a SWITCH field. On the Brikka the water heats in
       the boiler, there is nothing to measure beforehand: the only question is
       the "preheated water" box, and it has its own field. */
    $("#champ-temp").hidden = m !== "Switch";
    if ($("#ligne-chauffe")) $("#ligne-chauffe").hidden = m !== "Switch";
    updateTempHint();
    // Default cup: Flat White Egg for the Brikka, Classic Mug for the Switch.
    const defaultCups = { "Brikka": "Loveramics Flat White Egg", "Switch": "Classic Mug" };
    const currentCup = $("#f-tasse").value;
    if ((currentCup === "" || Object.values(defaultCups).includes(currentCup)) &&
        DATA.state.tasses.some(t => t.nom === defaultCups[m])) {
      $("#f-tasse").value = defaultCups[m];
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
    const r = findRecipe($("#f-recette").value);
    const familyDecides = !!r && PREHEAT_FAMILIES.includes(r.famille || "");
    /* ALWAYS visible on the Brikka (v7.95, at Chris's request): it is the only
       question the Brikka asks about the water. In the brikka-classique family
       the box and the recipe variant say the same thing, so they stay in
       agreement both ways: the recipe checks the box, and checking the box
       changes the recipe (onPreheat). */
    $("#champ-prechauffe").hidden = entry.methode !== "Brikka";
    if (familyDecides) $("#f-prechauffe").checked = PREHEATED_WATER_RECIPES.includes(r.id);
  }

  /* Checking or unchecking "preheated water" when the recipe is one of the two
     classic Brikka ones switches to the other variant, so that a preheated
     recipe cannot be saved with the box unchecked. On the other Brikka
     recipes, the box is a plain data point about the cup. */
  function onPreheat() {
    const r = findRecipe($("#f-recette").value);
    if (!r || !PREHEAT_FAMILIES.includes(r.famille || "")) return;
    const wanted = $("#f-prechauffe").checked;
    const target = recipesForMethod("Brikka").find(x =>
      x.famille === r.famille && PREHEATED_WATER_RECIPES.includes(x.id) === wanted);
    if (!target || target.nom === r.nom) return;
    $("#f-recette").value = target.nom;
    prefillFromRecipe(target.nom);
    updateWarnings();
  }

  // Does the recipe ask for stirring? Checks agitation by default.
  function updateAgitationFromRecipe() {
    const r = findRecipe($("#f-recette").value);
    if (!r || r.methode !== "Switch") return;
    const stirs = UI.stepsFor(r).some(e => /remuer/i.test(e.texte));
    $("#f-agitation-oui").checked = stirs;
    $("#ligne-agitation").hidden = !stirs;
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
    const r = findRecipe($("#f-recette").value);
    const visible = !!(r && r.lait);
    $("#champ-lait").hidden = !visible;
    if (!visible) return;
    const cup = DATA.state.tasses.find(t => t.nom === $("#f-tasse").value);
    /* The MEASURED coffee volume, never estimated on a Brikka: same reason as in
       estimatedVolume, and milk computed from a wrong volume is wrong milk.
       Without a measurement nothing is prefilled and we say so. */
    const measured = parseFloat($("#f-volume").value) ||
      estimatedVolume(parseFloat($("#f-dose").value), parseFloat($("#f-eau").value));
    /* Fall back to the recipe's DECLARED yield. This is not a computed estimate,
       it is a measured figure written in the recipe: on a Brikka,
       estimatedVolume() returns 0 on purpose, the old formula announced 139 ml
       where Chris measures 90 to 115. Without this fallback, the milk was never
       computed for Brikka recipes, which are precisely the milk ones. */
    const coffeeVol = measured > 0 ? measured : (r.volumeTypique || 0);
    const declared = !(measured > 0) && coffeeVol > 0;
    if (!cup) {
      $("#lait-hint").textContent = I18N.t("lait_choisir_tasse");
      return;
    }
    if (!(coffeeVol > 0)) {
      $("#lait-hint").textContent = I18N.t("lait_sans_volume");
      return;
    }
    /* The SPACE to fill, not yet the milk to pour: see below. */
    const milk = Math.max(0, cup.contenance_ml - coffeeVol);
    if (milk === 0) {
      $("#lait-hint").textContent = I18N.t("lait_trop_petit");
      return;
    }
    /* BOTH DRINKS at once, counted on the SAME basis: cold milk to pour into the
       jug. Milk swells when frothed, so you pour less than the space to fill,
       and all the less the more you froth it. */
    const flat = Math.round(milk / SWELL_FLAT);
    const cappu = Math.round(milk / SWELL_CAPPU);
    $("#f-lait").value = flat;
    $("#lait-hint").textContent =
      I18N.t("lait_deux", { e: milk, l: flat, c: cappu, t: cup.contenance_ml, v: coffeeVol }) +
      (declared ? " " + I18N.t("lait_declare") : "");
  }

  // Cups: dropdown list, capacity warning, mini editor.
  function fillCupSelect() {
    const sel = $("#f-tasse");
    const v = sel.value;
    sel.innerHTML = '<option value=""></option>' + DATA.state.tasses.map(t =>
      '<option value="' + titleAttr(t.nom) + '">' + titleAttr(t.nom) + " · " + t.contenance_ml + " ml</option>").join("");
    if (v && DATA.state.tasses.some(t => t.nom === v)) sel.value = v;
  }

  /* The cup overflow warning was REMOVED. It compared the expected volume to the
     capacity and cried overflow, assuming everything is served at once. But
     you can perfectly well pour in two goes, which makes the warning wrong in
     a perfectly normal use. A warning that is wrong mostly teaches you to
     ignore warnings.
     Cup capacity remains useful: it is used to compute the milk. */


  function renderCupEditor() {
    $("#tasses-liste").innerHTML = DATA.state.tasses.map(t =>
      '<div class="tasse-ligne"><span>' + t.nom + " · " + t.contenance_ml + ' ml</span>' +
      '<button type="button" class="btn-ligne danger" data-tasse-suppr="' + t.id + '" title="' + I18N.t("btn_supprimer") + '">' + icon("croix") + "</button></div>"
    ).join("");
    $$("[data-tasse-suppr]").forEach(b => b.addEventListener("click", async () => {
      await DATA.deleteCup(b.dataset.tasseSuppr);
      renderCupEditor();
      fillCupSelect();
    }));
  }

  /* A recipe whose grind is ON PURPOSE outside its machine's range (the Neo
     Brew, extra coarse) carries its setting: entry keeps it and does not warn. */
  const wantedDial = r => !!r && !!GRIND.parseDial(r.dial) && !GRIND.checkRange(r.methode, r.dial).ok;
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
    $("#f-eau").value = r.eau || "";
    // From the chosen coffee's roast when the source gives one per roast level (v9.00).
    const targetTemp = temperatureForCoffee(r, DATA.state.cafes.find(c => c.id === $("#f-cafe").value));
    $("#f-temp").value = targetTemp === "" || targetTemp === undefined ? "" : targetTemp;
    // A new recipe starts with no heating time: it is a measurement of the
    // current cup, not a recipe value. The hint says how long to aim for.
    writeDuration("f-chauffe", "");
    updateTempHint();
    // The grinder SETTING, not the recipe's target: see FACTORY_DIAL.
    $("#f-mouture").value = currentCoffeeGround() ? "" : wantedDial(r) ? r.dial : fallbacks.dial;
    if (r.methode === "Brikka") $("#f-puissance").value = r.puissance_feu || fallbacks.fire;
    updateAgitationFromRecipe();
    updatePreheatField();
    updateMilk();
    updateLive();
    updateWarnings();
    // The "not rated yet" label is generated: it does not follow the TreeWalker.
    updateRatingDisplay();
  }

  function onCoffeeChoice() {
    const coffee = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    if (!coffee) { updateWarnings(); return; }
    // Preselects the recommended machine and recipe, everything stays editable.
    const recommended = findRecipe(coffee.recette_recommandee);
    if (recommended) {
      chooseMethod(recommended.methode, true);
      fillRecipeSelect();
      $("#f-recette").value = recommended.nom;
      prefillFromRecipe(recommended.nom);
    } else if (coffee.machine_recommandee === "Brikka" || coffee.machine_recommandee === "Switch") {
      chooseMethod(coffee.machine_recommandee);
      prefillFromRecipe($("#f-recette").value);
    } else {
      // Same recipe, other coffee: the temperature follows its roast (v9.00).
      const r = findRecipe($("#f-recette").value);
      const t = r && TEMP_BY_ROAST[r.id] ? temperatureForCoffee(r, coffee) : "";
      if (t !== "" && t !== undefined) { $("#f-temp").value = t; updateTempHint(); }
    }
    updateWarnings();
    updateLive();
  }

  /* TEMPERATURE FROM HEATING TIME, Switch only. Chris types how long the
     kettle spent on the stove; the degree is derived from it (model in
     recettes.js, boiling time in Settings) and written into the temperature
     field, which stays editable by hand and remains the stored value.
     With no time entered but a recipe target, the hint says how long to
     aim for. The Brikka sees none of this: its row is hidden. */
  function onHeatInput() {
    const s = readDuration("f-chauffe");
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
    if (entry.methode !== "Switch") { setText(hint, ""); return; }
    const e = fallbacks.boil;
    const s = readDuration("f-chauffe");
    const t = $("#f-temp").value;
    /* Without a boiling time there is nothing to say: the factory fallback sets
       one, and Settings lets you correct it. The old paragraph asking you to
       go and time your kettle distorted the layout for a setting you make
       once. */
    if (!(e > 0)) { setText(hint, ""); return; }
    if (s !== "") {
      setText(hint, I18N.t("temp_estimee", { d: fmtDuration(s), t: temperatureFromHeating(s, e, fallbacks.bubbles) }));
    } else if (t !== "") {
      setText(hint, I18N.t("temp_conseil", { t, d: fmtDuration(heatTimeForTemperature(t, e, fallbacks.bubbles)) }));
    } else {
      setText(hint, "");
    }
  }

  /* The rating is optional. As long as the slider has not been touched, it
     has no thumb (isRatingEmpty, in the core): we save "" and the extraction
     counts as unrated everywhere (averages, insights, best settings, which
     already filter on note_sur_10 !== ""). The Clear button returns to that state. */
  function updateRatingDisplay() {
    const slider = $("#f-note");
    const empty = isRatingEmpty(slider);
    const label = empty ? I18N.t("n_pas_notee") : slider.value + " / 10";
    $("#note-affichee").textContent = label;
    slider.setAttribute("aria-valuetext", label);
    $("#f-note-aide").hidden = !empty;
    $("#f-note-effacer").hidden = empty;
    paintSlider(slider);
  }

  /* What goes to the database: an empty string when the cup is not rated, so
     that averages, insights and best settings all exclude it the same way.
     They already filter on note_sur_10 !== "". */
  function entryRating() {
    return isRatingEmpty($("#f-note")) ? "" : $("#f-note").value;
  }

  /* Age of the bag at the time of the cup, shown under the coffee choice.
     Read-only: it is DERIVED from the bag's opening date, entering it by hand
     would be a second truth. Silent as long as no opening date is filled in,
     rather than showing a false zero. */
  function updateBagAge() {
    const zone = $("#age-paquet");
    if (!zone) return;
    const c = DATA.calcs({
      cafe_id: $("#f-cafe").value,
      date_heure: $("#f-date").value || localNow(),
    });
    if (c.jours_ouvert === "") { zone.hidden = true; zone.textContent = ""; return; }
    zone.hidden = false;
    zone.textContent = I18N.t("ap_jours", { n: c.jours_ouvert });
  }

  function updateWarnings() {
    const zone = $("#avertissements");
    const coffee = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    const warnings = combinationWarnings(coffee, entry.methode, $("#f-recette").value, DATA.state.recettes);
    const msgs = warnings.msgs.slice();
    const dial = $("#f-mouture").value.trim();
    if (dial && !currentCoffeeGround() && !wantedDial(findRecipe($("#f-recette").value))) {
      const v = GRIND.checkRange(entry.methode, dial);
      if (!v.ok) msgs.push(v.message);
    }
    zone.innerHTML = msgs.map(m => '<div class="avertissement">' + m + "</div>").join("");
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
    if (entry.methode === "Brikka") return 0;
    if (!(dose > 0) || !(water > 0)) return 0;
    return Math.max(0, Math.round((water - 2.1 * dose) / 5) * 5);
  }

  function updateLive() {
    updateSliders();
    const dose = parseFloat($f("#f-dose").value);
    const water = parseFloat($f("#f-eau").value);
    /* Same logic as DATA.calcs: the main ratio is WATER over DOSE on both
       machines, it is the universal convention and the only one comparable to
       a recipe. The in-cup ratio follows second, and only if it is measured. */
    const volume = parseFloat($f("#f-volume").value);
    const brikka = entry.methode === "Brikka";
    let ratio = "…", base = "";
    if (dose > 0 && water > 0) {
      ratio = "1:" + (water / dose).toFixed(1);
      base = brikka ? "chaudiere" : "infusion";
    }
    const inCup = dose > 0 && volume > 0 ? "1:" + (volume / dose).toFixed(1) : "";
    const explanation = base ? detailRatio(base, dose, water) : I18N.t("rt_rien");
    setHtml($f("#live-ratio"), I18N.t("lv_ratio") +
      ' <b class="aide-ratio" tabindex="0" data-info="' + titleAttr(explanation) + '">' + ratio + "</b>" +
      (inCup ? ' <small>(' + I18N.t("rt_tasse_court") + " " + inCup + ")</small>" : ""));

    // Pre-ground coffee: the dial does not apply, the bag's default grind.
    const preground = currentCoffeeGround();
    const grindField = $f("#f-mouture");
    grindField.disabled = preground;
    if (preground && grindField.value) grindField.value = "";
    grindField.placeholder = preground ? I18N.t("paquet") : "1.5.0";

    const dial = grindField.value.trim();
    const p = GRIND.parseDial(dial);
    const outOfRange = !preground && p && !GRIND.checkRange(entry.methode, dial).ok && !wantedDial(findRecipe($f("#f-recette").value));
    setHtml($f("#live-mouture"), I18N.t("lv_mouture") + " <b>" +
      (preground ? I18N.t("paquet")
        : p ? I18N.t("lv_detail", { c: p.clicks, u: Math.round(p.microns) })
        : dial ? I18N.t("lv_invalide") : "…") + "</b>");
    $f("#live-mouture").classList.toggle("hors-plage", !!outOfRange || (!preground && dial !== "" && !p));
    // Detail shown right under the dial field.
    const grindDetail = $f("#mouture-detail");
    if (preground) {
      setText(grindDetail, I18N.t("paquet"));
      grindDetail.classList.remove("hint-alerte");
    } else if (p) {
      setText(grindDetail, I18N.t("lv_detail", { c: p.clicks, u: Math.round(p.microns) }) + " · " + GRIND.bandOf(p.microns).nom);
      grindDetail.classList.toggle("hint-alerte", !!outOfRange);
    } else {
      setText(grindDetail, dial ? I18N.t("lv_invalide") : "");
      grindDetail.classList.toggle("hint-alerte", !!dial);
    }

    const coffee = DATA.state.cafes.find(c => c.id === $f("#f-cafe").value);
    let cost = "…";
    if (coffee && coffee.prix_vnd && coffee.format_grammes && dose > 0) {
      cost = fmtVND(coffee.prix_vnd / coffee.format_grammes * dose);
      // Not pure coffee: second value, the cost relative to the real coffee.
      const pct = coffee.pourcentage_cafe_reel === "" || coffee.pourcentage_cafe_reel === undefined ? 100 : Number(coffee.pourcentage_cafe_reel);
      if (pct < 100 && pct > 0) {
        cost += " <small>(" + I18N.t("lv_cout_reel", { v: fmtVND(coffee.prix_vnd / (coffee.format_grammes * pct / 100) * dose) }) + ")</small>";
      }
    }
    setHtml($f("#live-cout"), I18N.t("lv_cout") + " <b>" + cost + "</b>");

    // Drink volume: extraction plus added water plus milk, live.
    const volBase = parseFloat($f("#f-volume").value) || estimatedVolume(dose, water) || 0;
    const addedWater = !$f("#champ-ajout-eau").hidden && $f("#f-ajout-eau-oui").checked ? (parseFloat($f("#f-eau-ajoutee").value) || 0) : 0;
    const milkMl = !$f("#champ-lait").hidden ? (parseFloat($f("#f-lait").value) || 0) : 0;
    const drinkSpan = $f("#live-boisson");
    if (volBase > 0 && (addedWater > 0 || milkMl > 0)) {
      const parts = [];
      if (addedWater > 0) parts.push("+" + addedWater + " ml");
      if (milkMl > 0) parts.push("+" + milkMl + " ml " + I18N.t("lv_lait"));
      drinkSpan.hidden = false;
      setHtml(drinkSpan, I18N.t("lv_boisson") + " <b>" + volBase + " ml (" + parts.join(", ") + ") = " + (volBase + addedWater + milkMl) + " ml</b>");
    } else {
      drinkSpan.hidden = true;
    }

    const btnVol = $f("#volume-estime");
    const estimate = estimatedVolume(dose, water);
    if (estimate) {
      btnVol.hidden = false;
      btnVol.textContent = I18N.t("vol_estime", { v: estimate });
      btnVol.title = I18N.t("vol_titre", { m: entry.methode });
      btnVol.dataset.valeur = estimate;
    } else {
      btnVol.hidden = true;
      delete btnVol.dataset.valeur;
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
        '<b class="diag-alerte">' + I18N.diag(UNEVEN_DIAG) + "</b><br>" +
        I18N.tr(DIAGNOSTIC_CORRECTIONS[UNEVEN_DIAG] || "");
      return;
    }

    const quantified = correctionText(TUNING.quantifiedCorrection(extFromForm(), fallbacks.stepSizes, currentCoffeeGround()));
    $("#diagnostic-correction").innerHTML = lines.join("<br>") +
      (quantified ? '<span class="corr-chiffree">' + quantified + "</span>" : "");
  }

  /* THE QUANTIFIED CORRECTION (v8.48), in words. The calculation is TUNING.quantifiedCorrection;
     here only the sentence: the first lever, then the others "if that is not
     enough". Empty when there is nothing to quantify. */
  function leverText(l) {
    if (l.lever === "mouture") {
      return I18N.t("cc_mouture", { de: l.from, vers: l.to, e: (l.gap > 0 ? "+" : "") + l.gap,
        a: l.microns[0], b: l.microns[1] });
    }
    return I18N.t("cc_" + l.lever, { de: fmtDecimal(l.from, 1), vers: fmtDecimal(l.to, 1) });
  }
  function correctionText(levers, brief) {
    if (!levers.length) return "";
    const [first, ...others] = levers;
    return I18N.t("cc_prochaine", { q: leverText(first) }) +
      (others.length && !brief ? " " + I18N.t("cc_ensuite", { q: others.map(leverText).join(", ") }) : "");
  }
  // The fields the correction reads, as the form holds them.
  function extFromForm() {
    return {
      methode: entry.methode, mouture_dial: $("#f-mouture").value.trim().replace(/,/g, "."),
      temperature_c: $("#f-temp").value, puissance_feu: $("#f-puissance").value,
      eau_g: $("#f-eau").value, dose_g: $("#f-dose").value,
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
    { slider: "f-dose-curseur", field: "f-dose" },
    { slider: "f-eau-curseur", field: "f-eau" },
    { slider: "f-puissance-curseur", field: "f-puissance" },
    { slider: "f-agitation-curseur", field: "f-agitation" },
    {
      slider: "f-mouture-curseur", field: "f-mouture",
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
    $$("[data-pas]").forEach(b => {
      const field = $("#" + b.dataset.pasChamp);
      if (!field) return;
      const step = () => {
        if (field.value === "") field.value = field.min || 0;
        else if (Number(b.dataset.pas) > 0) field.stepUp();
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
    paintSlider($("#f-note"));
  }

  function resetEntry(keepCoffee) {
    entry.editId = null;
    entry.dateTouched = false;
    entry.diagnostics.clear();
    entry.descripteurs.clear();
    $("#saisie-titre").textContent = I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = I18N.t("s_enregistrer");
    $("#btn-annuler-edition").hidden = true;
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
      $("#f-cafe").value = firstCoffee ? firstCoffee.id : "";
    }
    $("#f-commentaire").value = "";
    // No thumb: the slider must not suggest any rating.
    $("#f-note").value = 5;
    markRating($("#f-note"), true);
    updateRatingDisplay();
    writeDuration("f-total", "");
    writeDuration("f-ecoulement", "");
    $("#f-volume").value = "";
    $("#f-eau").value = "";
    $("#f-temp").value = "";
    writeDuration("f-chauffe", "");
    $("#f-puissance").value = fallbacks.fire;
    $("#f-prechauffe").checked = false;
    $("#f-ratee").checked = false;
    $("#f-ajout-eau-oui").checked = false;
    $("#f-eau-ajoutee").hidden = true;
    $("#f-eau-ajoutee").value = "";
    $("#f-lait").value = "";
    updateAgitationFromRecipe();
    updateMilk();
    $$("#f-diagnostic .pilule").forEach(x => setPressed(x, false));
    $$("#f-descripteurs .tag").forEach(x => setPressed(x, false));
    UI.updateVisibleFamilies();
    $("#diagnostic-correction").textContent = "";
    UI.resetStopwatch();
    /* LAST, and this is the important point: the lines above set the fallbacks,
       the recipe has the final word. Without this call the blank form stayed
       empty, and the defaults set in Settings only arrived if you changed
       recipe again by hand. Placed higher up, it would be overwritten by the
       reset of the preheating.
       prefillFromRecipe ends with updateWarnings and updateLive. */
    prefillFromRecipe($("#f-recette").value);
  }

  function loadExtractionIntoEntry(ext, isDuplicate) {
    fillCoffeeSelect(ext.cafe_id);
    entry.editId = isDuplicate ? null : ext.id;
    $("#f-date").value = isDuplicate ? localNow() : ext.date_heure;
    // It comes from the opened extraction, not from a default: leave it alone.
    entry.dateTouched = !isDuplicate;
    $("#f-cafe").value = ext.cafe_id;
    chooseMethod(ext.methode || "Brikka", true);
    fillRecipeSelect();
    if (ext.recette) $("#f-recette").value = ext.recette;
    $("#f-dose").value = ext.dose_g;
    $("#f-eau").value = ext.eau_g;
    $("#f-temp").value = ext.temperature_c;
    writeDuration("f-chauffe", ext.chauffe_s === undefined ? "" : ext.chauffe_s);
    updateTempHint();
    $("#f-mouture").value = ext.mouture_dial;
    $("#f-volume").value = ext.volume_extrait_ml;
    $("#f-ajout-eau-oui").checked = ext.eau_ajoutee_ml !== "" && ext.eau_ajoutee_ml !== undefined;
    $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
    $("#f-eau-ajoutee").value = ext.eau_ajoutee_ml !== undefined ? ext.eau_ajoutee_ml : "";
    $("#f-prechauffe").checked = Number(ext.eau_prechauffee) === 1;
    $("#f-ratee").checked = Number(ext.ratee) === 1;
    updatePreheatField();
    $("#f-puissance").value = ext.puissance_feu || "";
    $("#f-agitation-oui").checked = ext.agitation_nb !== "" && ext.agitation_nb !== undefined;
    $("#ligne-agitation").hidden = !$("#f-agitation-oui").checked;
    $("#f-agitation").value = ext.agitation_nb !== undefined && ext.agitation_nb !== "" ? ext.agitation_nb : 1;
    $("#f-tasse").value = ext.tasse || "";
    $("#f-lait").value = ext.lait_ml !== undefined ? ext.lait_ml : "";
    $("#champ-lait").hidden = !(findRecipe(ext.recette) || {}).lait;
    writeDuration("f-total", ext.temps_total_s);
    writeDuration("f-ecoulement", ext.temps_ecoulement_s);
    $("#f-note").value = ext.note_sur_10 === "" ? 5 : ext.note_sur_10;
    markRating($("#f-note"), ext.note_sur_10 === "");
    updateRatingDisplay();
    $("#f-commentaire").value = ext.commentaire;
    entry.diagnostics = new Set((ext.diagnostic || "").split("|").filter(Boolean));
    $$("#f-diagnostic .pilule").forEach(x => x.classList.toggle("actif", entry.diagnostics.has(x.dataset.diag)));
    updateDiagnosticCorrection();
    entry.descripteurs = new Set((ext.descripteurs || "").split("|").filter(Boolean));
    $$("#f-descripteurs .tag").forEach(x => x.classList.toggle("actif", entry.descripteurs.has(x.dataset.tag)));
    /* A family that has just received a checked taste must reappear. */
    UI.updateVisibleFamilies();
    $("#saisie-titre").textContent = isDuplicate ? I18N.t("s_dupliquee") : I18N.t("s_modifier");
    $("#btn-enregistrer").textContent = isDuplicate ? I18N.t("s_enregistrer") : I18N.t("s_enregistrer_modif");
    $("#btn-annuler-edition").hidden = isDuplicate;
    updateWarnings();
    updateLive();
    // The second argument tells the Entry screen that this switch IS the opening
    // of an edit, so it must not abandon it on arrival.
    activateScreen("saisie", true);
  }

  /* REMAKING A CUP means taking its SETTINGS, not its result (v8.41).
     Duplication also copied the rating, the tastes, the diagnostics, the
     comment and the measured times: a cup not yet brewed arrived with the
     previous day's 7, exactly the invented rating that "not rated yet"
     exists to prevent. Used by the history's Duplicate button and by the
     icon's "Refaire ma dernière tasse" shortcut. */
  function settingsOnly(ext) {
    return {
      ...ext, note_sur_10: "", commentaire: "", diagnostic: "", descripteurs: "", ratee: "",
      temps_total_s: "", temps_ecoulement_s: "", volume_extrait_ml: "",
    };
  }
  function redoCup(ext) {
    loadExtractionIntoEntry(settingsOnly(ext), true);
  }
  /* The most recent by date, not the last in the array: a cup added after the
     fact with a past date lands at the end of the list. */
  function redoLast() {
    const latest = DATA.state.extractions.reduce(
      (a, e) => (!a || String(e.date_heure) > String(a.date_heure) ? e : a), null);
    if (!latest) { activateScreen("saisie"); return false; }
    redoCup(latest);
    return true;
  }

  async function saveEntry(ev) {
    ev.preventDefault();
    if (!$("#f-dose").value) { toast(I18N.t("t_dose")); return; }
    const ext = {
      date_heure: $("#f-date").value || localNow(),
      cafe_id: $("#f-cafe").value,
      methode: entry.methode,
      recette: $("#f-recette").value,
      dose_g: $("#f-dose").value,
      eau_g: $("#f-eau").value,
      mouture_dial: $("#f-mouture").value.trim().replace(/,/g, "."),
      // Brikka: neither temperature nor heating time, the water heats in the boiler.
      temperature_c: entry.methode === "Switch" ? $("#f-temp").value : "",
      chauffe_s: entry.methode === "Switch" ? readDuration("f-chauffe") : "",
      temps_total_s: readDuration("f-total"),
      temps_ecoulement_s: readDuration("f-ecoulement"),
      volume_extrait_ml: $("#f-volume").value,
      eau_ajoutee_ml: entry.methode === "Brikka" && $("#f-ajout-eau-oui").checked ? $("#f-eau-ajoutee").value : "",
      lait_ml: !$("#champ-lait").hidden ? $("#f-lait").value : "",
      agitation_nb: entry.methode === "Switch" && $("#f-agitation-oui").checked ? ($("#f-agitation").value || 1) : "",
      tasse: $("#f-tasse").value,
      eau_prechauffee: entry.methode === "Brikka" && $("#f-prechauffe").checked ? 1 : "",
      ratee: $("#f-ratee").checked ? 1 : "",
      puissance_feu: entry.methode === "Brikka" ? $("#f-puissance").value : "",
      note_sur_10: entryRating(),
      diagnostic: DIAGNOSTICS.filter(d => entry.diagnostics.has(d)).join("|"),
      descripteurs: Array.from(entry.descripteurs).join("|"),
      commentaire: $("#f-commentaire").value.trim(),
    };
    if (entry.editId) {
      await DATA.editExtraction(entry.editId, ext);
      UI.clearDraft();
      toast(I18N.t("t_modifiee"));
      resetEntry();
      activateScreen("historique");
    } else {
      await DATA.addExtraction(ext);
      UI.clearDraft();
      /* A quantifiable diagnostic: the message offers to prepare the next cup
         with the correction applied. Nothing changes without that click, and
         the message goes away by itself. */
      const levers = TUNING.quantifiedCorrection(ext, fallbacks.stepSizes, currentCoffeeGround());
      if (levers.length) {
        UI.toastAction(I18N.t("t_enregistree") + ". " + correctionText(levers, true), I18N.t("cc_preparer"), () => {
          redoCup({ ...ext, [levers[0].field]: levers[0].to });
          UI.scheduleDraft();
          toast(I18N.t("cc_prete"));
        });
      } else {
        toast(I18N.t("t_enregistree"));
      }
      resetEntry(true);
      activateScreen("tableau");
    }
  }

  /* Wiring of the screen's controls. Called once by app.js, at startup.
     Each screen wires what belongs to it: the form, the timer, the options and
     the cup editor live here, and a four-hundred-line wiring function in
     app.js no longer exists. */

  function wireEntry() {
    wireDictation($("#f-dicter"), $("#f-commentaire"), $("#f-dicter-texte"));
    $$(".btn-methode").forEach(b => b.addEventListener("click", () => {
      chooseMethod(b.dataset.methode);
      prefillFromRecipe($("#f-recette").value);
    }));
    $("#f-cafe").addEventListener("change", onCoffeeChoice);
    /* As soon as Chris touches the date, it is HIS: arriving on the screen will
       no longer replace it. He sometimes logs a cup from last night. "input" as
       well as "change": on a datetime-local field, each edited part emits
       "input", and "change" only arrives on confirmation. */
    ["input", "change"].forEach(ev => $("#f-date").addEventListener(ev, markDateTouched));
    $("#f-date").addEventListener("change", updateBagAge);
    $("#f-recette").addEventListener("change", () => { prefillFromRecipe($("#f-recette").value); updateWarnings(); });
    ["f-temp", "f-puissance"].forEach(id => $("#" + id).addEventListener("input", UI.updateTwins));
    ["f-mouture", "f-temp", "f-puissance", "f-eau", "f-dose"].forEach(id =>
      $("#" + id).addEventListener("input", updateDiagnosticCorrection));
    ["f-dose", "f-eau", "f-mouture", "f-volume"].forEach(id =>
      $("#" + id).addEventListener("input", () => { updateLive(); updateWarnings(); }));
    // updateWarnings redraws the side panel, the timer needs an explicit
    // reminder: its steps are scaled to the water entered.
    $("#f-eau").addEventListener("input", () => UI.updateStopwatchSteps(false));
    // The extracted volume drives the milk prefill, it must refresh it.
    $("#f-volume").addEventListener("input", updateMilk);
    ["f-chauffe-min", "f-chauffe-sec"].forEach(id => $("#" + id).addEventListener("input", onHeatInput));
    $("#f-prechauffe").addEventListener("change", onPreheat);
    // A manual entry of the degree always has the final word; the hint follows.
    $("#f-temp").addEventListener("input", updateTempHint);
    wireRating($("#f-note"), updateRatingDisplay);
    $("#f-note-effacer").addEventListener("click", () => {
      $("#f-note").value = 5;
      markRating($("#f-note"), true);
      updateRatingDisplay();
      UI.scheduleDraft();
      $("#f-note").focus();
    });
    $("#chrono-basculer").addEventListener("click", () => UI.toggleStopwatch());
    /* Start OPENS the timer: an extraction has just been started, the steps
       and the stop button must be at hand without one more click. */
    $("#btn-chrono").addEventListener("click", () => { UI.toggleStopwatch(true); });
    $("#btn-chrono").addEventListener("click", UI.stopwatchPrimary);
    $("#btn-chrono-stop").addEventListener("click", UI.stopStopwatch);
    $("#btn-chrono-raz").addEventListener("click", UI.resetStopwatch);
    // ONCE ONLY: the containers survive pill rebuilds, attaching them
    // from buildPills would stack one set per language switch.
    UI.wirePills();
    UI.wireRecipeBand();
    wireSliders();
    wireSteppers();
    enableLongPress($("#f-diagnostic"));
    enableLongPress($("#f-descripteurs"));
    $("#gouts-plus").addEventListener("click", () => UI.toggleFamilies());
    $("#chrono-bip").addEventListener("change", () => {
      try { localStorage.setItem("bips", $("#chrono-bip").checked ? "1" : "0"); } catch (e) { /* never mind */ }
    });
    $("#form-saisie").addEventListener("submit", oneAtATime(saveEntry));
    $("#form-saisie").addEventListener("input", UI.scheduleDraft);
    $("#form-saisie").addEventListener("change", UI.scheduleDraft);
    // visibilitychange is the last reliable event before a mobile browser
    // unloads the page: write right away, without waiting for the debounce.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") UI.saveDraft();
    });
    $("#btn-annuler-edition").addEventListener("click", () => { resetEntry(); activateScreen("historique"); });
    $("#btn-gerer-cafes").addEventListener("click", () => UI.openCoffeesModal());
    $("#volume-estime").addEventListener("click", () => {
      const v = $("#volume-estime").dataset.valeur;
      if (v !== undefined) { $("#f-volume").value = v; updateLive(); }
    });

    // Added water, agitation, milk, cup
    $("#f-ajout-eau-oui").addEventListener("change", () => {
      $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
      updateLive();
    });
    $("#f-eau-ajoutee").addEventListener("input", updateLive);
    $("#f-agitation-oui").addEventListener("change", () => {
      $("#ligne-agitation").hidden = !$("#f-agitation-oui").checked;
      if ($("#f-agitation-oui").checked && !$("#f-agitation").value) $("#f-agitation").value = 1;
    });
    $("#f-lait").addEventListener("input", updateLive);
    $("#f-tasse").addEventListener("change", () => { updateMilk(); updateLive(); });
    $("#btn-tasses").addEventListener("click", () => {
      const editor = $("#tasses-editeur");
      editor.hidden = !editor.hidden;
      if (!editor.hidden) renderCupEditor();
    });
    $("#tasse-ajouter").addEventListener("click", async () => {
      const name = $("#tasse-nom").value.trim();
      const ml = parseFloat($("#tasse-ml").value);
      if (!name || !(ml > 0)) { toast(I18N.t("t_tasse_invalide")); return; }
      await DATA.addCup(name, ml);
      $("#tasse-nom").value = "";
      $("#tasse-ml").value = "";
      renderCupEditor();
      fillCupSelect();
      $("#f-tasse").value = name;
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
