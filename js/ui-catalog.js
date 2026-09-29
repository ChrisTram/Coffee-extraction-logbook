/* The management modals: coffees, bags, recipes, and the Settings screen.
 *
 * They share one rule: each modal owns ITS editing state and does not
 * publish it. The wiring says "restore the current recipe", it does not read
 * the id to hand it back to the data layer. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, titleAttr, toggleFailed, askConfirm, saveFallbacks, analyzableExts, extsWithCalcs,
    fmtShortDate, fmtDecimal, fmtVND, includeFailed, localNow, average, recipesForMethod,
    fallbacks, toast } = UI;

  // ---------- Coffee management ----------

  let editingCoffeeId = null;

  function openCoffeesModal() {
    renderCoffeeList();
    $("#form-coffee").hidden = true;
    $("#form-bag").hidden = true;
    const m = $("#modal-coffees");
    if (!m.open) m.showModal();
  }

  /* Cost of a cup of this coffee, at the given dose. Silent if the price or
     the bag size is missing: an invented cost would be worse than no cost.

     Second figure for NON-PURE coffees. The Sáng Tạo is 82 % coffee, so
     534 ₫ per gram of real coffee against 348 for the G4: it looks 26 % more
     expensive per gram, it is 53 % more. The pourcentage_cafe_reel field was
     only used for the caffeine calculation until now. */
  function costPerCup(coffee, dose) {
    if (!coffee.prix_vnd || !coffee.format_grammes || !(dose > 0)) return "";
    const perGram = coffee.prix_vnd / coffee.format_grammes;
    const base = I18N.t("cost_per_cup", { v: fmtVND(perGram * dose), d: fmtDecimal(dose, 1) });
    const pct = coffee.pourcentage_cafe_reel === "" || coffee.pourcentage_cafe_reel === undefined
      ? 100 : Number(coffee.pourcentage_cafe_reel);
    if (!(pct > 0) || pct >= 100) return base;
    return base + " " + I18N.t("cost_real", { v: fmtVND(perGram / (pct / 100) * dose) });
  }

  function renderCoffeeList() {
    // Active ones first (original order kept), deactivated always at the end
    // of the list. Each coffee carries an average score badge (over its
    // rated brews) and the date it was added to the system.
    const sorted = [...DATA.state.cafes].sort((a, b) => (a.actif === 0 ? 1 : 0) - (b.actif === 0 ? 1 : 0));
    $("#coffees-list").innerHTML = sorted.map(c => {
      const notes = DATA.state.extractions
        .filter(e => e.cafe_id === c.id && e.note_sur_10 !== "")
        .map(e => Number(e.note_sur_10));
      const scoreBadge = notes.length
        ? ' <span class="badge-rating" title="' + I18N.t("count_brews", { n: notes.length }) + '">★ ' +
          fmtDecimal(average(notes), 1) + "</span>"
        : "";
      // Stock of the current bag. A missing dose counts as the default dose,
      // otherwise a forgotten entry would make the bag look untouched.
      const stock = DATA.bagStock(c.id, fallbacks.dose);
      let stockBadge = "";
      // Dose used for the cost, the same as for the cups left.
      let cupCost = fallbacks.dose;
      if (stock) {
        /* What is left is counted with this coffee's AVERAGE dose, not the
           fallback dose: Chris doses 16 g on the G4 and 14 on another, a single
           figure would overestimate the cups left by almost 10 %. Falls back
           on the default dose while the coffee has no brew. */
        const doses = DATA.state.extractions
          .filter(e => e.cafe_id === c.id && Number(e.dose_g) > 0)
          .map(e => Number(e.dose_g));
        const typicalDose = doses.length ? average(doses) : fallbacks.dose;
        cupCost = typicalDose;
        const cupsLeft = Math.max(0, Math.floor(stock.remaining / typicalDose));
        const level = stock.remaining <= 0 ? "empty" : cupsLeft <= 3 ? "low" : "ok";
        const label = stock.remaining <= 0
          ? I18N.t("stock_empty")
          : I18N.t("stock_left", { g: fmtDecimal(stock.remaining, 0), n: cupsLeft });
        stockBadge = ' <span class="badge-stock badge-stock-' + level + '" title="' +
          I18N.t("stock_title", {
            f: stock.format,
            c: fmtDecimal(stock.consumed, 0),
            r: fmtDecimal(Math.max(0, stock.remaining), 0),
            d: fmtDecimal(typicalDose, 1),
            src: I18N.t(doses.length ? "stock_dose_average" : "stock_dose_fallback"),
          }) + '">' + label + "</span>";
      }
      return '<div class="coffee-row' + (c.actif === 0 ? " inactive" : "") +
      (stock && stock.remaining <= 0 ? " depleted" : "") + '">' +
      "<div><b>" + c.nom + "</b>" + scoreBadge + stockBadge +
      (Number(c.pourcentage_cafe_reel) < 100 ? ' <span class="badge-nonpure">' + c.pourcentage_cafe_reel + " % " + I18N.t("percent_coffee") + "</span>" : "") +
      ((c.tag || "").includes("référence") ? ' <span class="badge-reference">' + I18N.t("badge_benchmark") + "</span>" : "") +
      "<div class=\"coffee-meta\">" +
      [c.torrefacteur, c.espece, c.procede,
        c.machine_recommandee ? I18N.t("list_machine", { m: I18N.machine(c.machine_recommandee) }) : "",
        c.prix_vnd ? fmtVND(c.prix_vnd) + " / " + c.format_grammes + " g" : "",
        /* Cost of ONE cup, at this coffee's average dose. It is the only price
           figure that compares from one bag to another: the bag price depends
           on the size, the price per gram says nothing until you know how
           much you use. */
        costPerCup(c, cupCost),
        c.date_ajout ? I18N.t("list_added", { d: fmtShortDate(c.date_ajout) }) : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<span class="coffee-meta">' + (c.actif === 0 ? I18N.t("list_inactive") : "") + "</span>" +
      '<button class="btn btn-small" data-sheet="' + c.id + '">' + I18N.t("sheet_view") + "</button>" +
      '<button class="btn btn-small" data-coffee-bag="' + c.id + '">' + I18N.t("btn_new_bag") + "</button>" +
      '<button class="btn btn-small" data-coffee-edit="' + c.id + '">' + I18N.t("btn_edit") + "</button></div>";
    }).join("");
    $$("[data-coffee-edit]").forEach(b => b.addEventListener("click", () => openCoffeeForm(b.dataset.coffeeEdit)));
    $$("[data-coffee-bag]").forEach(b => b.addEventListener("click", () => openBagForm(b.dataset.coffeeBag)));
  }

  // ---------- New bag ----------
  // Saving a repurchase resets the stock counter AND gives the coffee an
  // up-to-date roast date. That second effect fixes a real lie of the old
  // model: a repurchased coffee kept the date of the very first bag, so the
  // displayed freshness was wrong forever.
  let bagCoffeeId = null;

  function openBagForm(coffeeId) {
    const c = DATA.state.cafes.find(x => x.id === coffeeId);
    if (!c) return;
    bagCoffeeId = coffeeId;
    $("#form-bag-title").textContent = I18N.t("bag_title", { n: c.nom });
    $("#s-date").value = localNow().slice(0, 10);
    $("#s-format").value = c.format_grammes || "";
    $("#s-price").value = c.prix_vnd || "";
    // The usual case is opening the bag on the day it is recorded. Chris can
    // clear the field if the bag goes into the cupboard.
    $("#s-opening").value = localNow().slice(0, 10);
    $("#s-roast").value = "";
    $("#form-bag").hidden = false;
    $("#s-date").focus();
  }

  // Closing the form also means forgetting the target coffee: the two already
  // went together, they just lived in two different files.
  function closeBagForm() {
    $("#form-bag").hidden = true;
    bagCoffeeId = null;
  }

  async function saveBag(ev) {
    ev.preventDefault();
    if (!bagCoffeeId) return;
    await DATA.addPurchase({
      cafe_id: bagCoffeeId,
      date_achat: $("#s-date").value || localNow().slice(0, 10),
      format_grammes: $("#s-format").value,
      prix_vnd: $("#s-price").value,
      date_torrefaction: $("#s-roast").value,
      date_ouverture: $("#s-opening").value,
    });
    $("#form-bag").hidden = true;
    bagCoffeeId = null;
    renderCoffeeList();
    toast(I18N.t("toast_bag"));
  }

  function openCoffeeForm(id) {
    editingCoffeeId = id || null;
    const c = id ? DATA.state.cafes.find(x => x.id === id) : null;
    $("#form-coffee-title").textContent = c ? I18N.t("form_edit", { n: c.nom }) : I18N.t("form_new_coffee");
    $("#c-name").value = c ? c.nom : "";
    $("#c-roaster").value = c ? c.torrefacteur : "";
    $("#c-origin").value = c ? c.origine : "";
    $("#c-species").value = c ? c.espece : "";
    $("#c-process").value = c ? c.procede : "";
    $("#c-roasting").value = c ? c.torrefaction : "";
    $("#c-format").value = c ? c.format_grammes : "";
    $("#c-price").value = c ? c.prix_vnd : "";
    $("#c-date-roast").value = c ? c.date_torrefaction : "";
    $("#c-machine").value = c ? c.machine_recommandee : "";
    $("#c-recipe").value = c ? c.recette_recommandee : "";
    $("#c-notes").value = c ? c.notes_annoncees : "";
    $("#c-pct").value = c ? (c.pourcentage_cafe_reel === "" || c.pourcentage_cafe_reel === undefined ? 100 : c.pourcentage_cafe_reel) : 100;
    $("#c-ground").checked = c ? Number(c.deja_moulu) === 1 : false;
    $("#c-on").checked = c ? c.actif !== 0 : true;
    $("#form-coffee").hidden = false;
    $("#c-name").focus();
  }

  async function saveCoffee(ev) {
    ev.preventDefault();
    const coffee = {
      nom: $("#c-name").value.trim(),
      torrefacteur: $("#c-roaster").value.trim(),
      origine: $("#c-origin").value.trim(),
      espece: $("#c-species").value.trim(),
      procede: $("#c-process").value.trim(),
      torrefaction: $("#c-roasting").value,
      format_grammes: $("#c-format").value,
      prix_vnd: $("#c-price").value,
      date_torrefaction: $("#c-date-roast").value,
      machine_recommandee: $("#c-machine").value,
      recette_recommandee: $("#c-recipe").value,
      notes_annoncees: $("#c-notes").value.trim(),
      pourcentage_cafe_reel: $("#c-pct").value || 100,
      tag: (editingCoffeeId && (DATA.state.cafes.find(x => x.id === editingCoffeeId) || {}).tag) || "",
      deja_moulu: $("#c-ground").checked ? 1 : 0,
      actif: $("#c-on").checked ? 1 : 0,
    };
    if (Number(coffee.pourcentage_cafe_reel) < 100 && !coffee.tag) coffee.tag = "café aromatisé";
    if (editingCoffeeId) await DATA.editCoffee(editingCoffeeId, coffee);
    else await DATA.addCoffee(coffee);
    $("#form-coffee").hidden = true;
    renderCoffeeList();
    UI.fillCoffeeSelect();
    UI.fillFilters();
    toast(I18N.t("toast_coffee"));
  }

  // ---------- Recipe management ----------

  let editingRecipeId = null;

  function openRecipesModal() {
    renderRecipeList();
    $("#form-recipe").hidden = true;
    const m = $("#modal-recipes");
    if (!m.open) m.showModal();
  }

  function renderRecipeList() {
    $("#recipes-list").innerHTML = DATA.state.recettes.map(r =>
      '<div class="coffee-row' + (r.actif === 0 ? " inactive" : "") + '">' +
      '<span class="chip-method ' + r.methode.toLowerCase() + '">' + r.methode + "</span>" +
      "<div><b>" + r.nom + "</b><div class=\"coffee-meta\">" +
      [r.numero, r.dose + " g / " + r.eau + " g", I18N.t("dial") + " " + r.dial,
        DATA.isOriginalRecipe(r.id) ? "" : I18N.t("list_custom"),
        r.actif === 0 ? I18N.t("list_hidden") : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<button class="btn btn-small" data-recipe-form="' + r.id + '">' + I18N.t("btn_edit") + "</button></div>"
    ).join("");
    $$("[data-recipe-form]").forEach(b => b.addEventListener("click", () => openRecipeForm(b.dataset.recipeForm)));
  }

  function openRecipeForm(id) {
    editingRecipeId = id || null;
    const r = id ? DATA.state.recettes.find(x => x.id === id) : null;
    $("#form-recipe-title").textContent = r ? I18N.t("form_edit", { n: r.nom }) : I18N.t("form_new_recipe");
    $("#r-name").value = r ? r.nom : "";
    $("#r-method").value = r ? r.methode : "Switch";
    $("#r-num").value = r ? r.numero : "";
    $("#r-subtitle").value = r ? r.sousTitre : "";
    $("#r-dose").value = r ? r.dose : 15;
    $("#r-water").value = r ? r.eau : 225;
    $("#r-temp").value = r ? r.temp : 92;
    $("#r-fire").value = r ? r.puissance_feu : "";
    $("#r-temp-text").value = r ? r.tempTexte : "";
    $("#r-dial").value = r ? r.dial : "1.5.0";
    $("#r-ratio-text").value = r ? r.ratioTexte : "";
    $("#r-total-text").value = r ? r.totalTexte : "";
    $("#r-steps").value = r ? stepsToText(r.etapes) : "";
    $("#r-forwho").value = r ? r.pourQui : "";
    $("#r-coffees").value = r ? r.cafesAssocies.join("\n") : "";
    $("#r-note").value = r ? r.note : "";
    $("#r-video").value = r ? r.video || "" : "";
    $("#r-default").checked = r ? !!r.parDefaut : false;
    $("#r-advanced").checked = r ? !!r.avancee : false;
    $("#r-on").checked = r ? r.actif !== 0 : true;
    const isOriginal = r && DATA.isOriginalRecipe(r.id);
    $("#recipe-restore").hidden = !isOriginal;
    $("#recipe-delete").hidden = !r || isOriginal;
    $("#form-recipe").hidden = false;
    $("#r-name").focus();
  }

  function readRecipeForm() {
    return {
      nom: $("#r-name").value.trim(),
      methode: $("#r-method").value,
      numero: $("#r-num").value.trim(),
      sousTitre: $("#r-subtitle").value.trim(),
      dose: $("#r-dose").value,
      eau: $("#r-water").value,
      temp: $("#r-temp").value,
      puissance_feu: $("#r-fire").value,
      // Without a temperature target, no invented text: " °C" on its own makes no sense.
      tempTexte: $("#r-temp-text").value.trim() ||
        ($("#r-temp").value ? $("#r-temp").value + " °C" : ""),
      dial: $("#r-dial").value.trim().replace(/,/g, "."),
      ratioTexte: $("#r-ratio-text").value.trim(),
      totalTexte: $("#r-total-text").value.trim(),
      etapes: textToSteps($("#r-steps").value),
      pourQui: $("#r-forwho").value.trim(),
      cafesAssocies: $("#r-coffees").value.split("\n").map(s => s.trim()).filter(Boolean),
      note: $("#r-note").value.trim(),
      video: $("#r-video").value.trim(),
      parDefaut: $("#r-default").checked,
      avancee: $("#r-advanced").checked,
      actif: $("#r-on").checked ? 1 : 0,
    };
  }

  /* Restore and delete act on the OPEN recipe, the one the form knows. The
     wiring used to just read that id to hand it back to DATA, which forced
     the modal to publish its internal state. */
  async function restoreCurrentRecipe() {
    if (!editingRecipeId) return;
    if (!await askConfirm(I18N.t("confirm_restore"))) return;
    await DATA.resetRecipe(editingRecipeId);
    $("#form-recipe").hidden = true;
    renderRecipeList();
    toast(I18N.t("toast_recipe_restored"));
  }

  async function deleteCurrentRecipe() {
    if (!editingRecipeId) return;
    if (!await askConfirm(I18N.t("confirm_delete_recipe"), { danger: true })) return;
    await DATA.deleteRecipe(editingRecipeId);
    $("#form-recipe").hidden = true;
    renderRecipeList();
    toast(I18N.t("toast_recipe_deleted"));
  }

  async function saveRecipe(ev) {
    ev.preventDefault();
    const recipe = readRecipeForm();
    if (!recipe.nom) { toast(I18N.t("toast_recipe_name")); return; }
    const dial = GRIND.parseDial(recipe.dial);
    if (recipe.dial && !dial) { toast(I18N.t("toast_grind_invalid")); return; }
    if (editingRecipeId) await DATA.editRecipe(editingRecipeId, recipe);
    else await DATA.addRecipe(recipe);
    $("#form-recipe").hidden = true;
    renderRecipeList();
    toast(I18N.t("toast_recipe"));
  }

  // ---------- Settings screen ----------
  /* This screen stores nothing on its own. Each row of the table edits the
     RECIPE itself, the same card as "Manage recipes": a single source of
     truth, already synced. The only settings specific to the screen are the
     two fallbacks, local to the device. */

  // The name a screen reader reads for a recipe table field (v8.76): "Chronicler · dose (g)".
  const fieldName = (r, key) => titleAttr(I18N.tr(r.nom) + " · " + I18N.t(key));

  function renderParameters() {
    const rows = ["Brikka", "Switch"].map(m => {
      const list = recipesForMethod(m);
      if (!list.length) return "";
      return '<tr class="param-group"><td colspan="6">' + m + "</td></tr>" +
        list.map(r =>
          '<tr data-param-recipe="' + r.id + '">' +
          "<td>" + I18N.tr(r.nom) + "</td>" +
          '<td data-l="' + I18N.t("param_col_dose") + '"><input type="number" step="0.5" min="1" data-field="dose" aria-label="' + fieldName(r, "param_col_dose") + '" value="' + (r.dose || "") + '"></td>' +
          '<td data-l="' + I18N.t("param_col_water") + '"><input type="number" step="1" min="10" data-field="eau" aria-label="' + fieldName(r, "param_col_water") + '" value="' + (r.eau || "") + '"></td>' +
          '<td data-l="' + I18N.t("param_col_temp") + '"><input type="number" step="1" min="60" max="100" data-field="temp" aria-label="' + fieldName(r, "param_col_temp") + '" value="' + (r.temp === "" ? "" : r.temp) +
            '" placeholder="' + I18N.t("param_empty") + '"></td>' +
          '<td data-l="' + I18N.t("param_col_heat") + '">' + (r.methode === "Brikka"
            ? '<input type="number" step="1" min="1" max="10" data-field="puissance_feu" aria-label="' + fieldName(r, "param_col_heat") + '" value="' + (r.puissance_feu || "") + '">'
            : '<span class="param-none">&middot;</span>') + "</td>" +
          '<td data-l="' + I18N.t("param_col_dial") + '"><input type="text" data-field="dial" aria-label="' + fieldName(r, "param_col_dial") + '" value="' + titleAttr(r.dial || "") + '"></td>' +
          "</tr>").join("");
    }).join("");
    $("#param-recipes").innerHTML = rows;
    $("#param-dose-default").value = fallbacks.dose;
    $("#param-fire-default").value = fallbacks.fire;
    $("#param-dial").value = fallbacks.dial;
    UI.writeDuration("param-boil", fallbacks.boil);
    UI.writeDuration("param-bubbles", fallbacks.bubbles);
    STEP_FIELDS.forEach(([id, key]) => { $("#" + id).value = (fallbacks.stepSizes || {})[key]; });
    updateDialDetail();
    $("#param-beeps").checked = $("#chrono-beep").checked;
    updateFailed();
    updateSettingsIndex();
  }

  /* L6 (v8.91): EACH ROW OF THE LIST SHOWS ITS VALUE. You know what is set
     without opening the page, as in a phone's settings. */
  let currentSection = "ps-recipes";
  function updateSettingsIndex() {
    const steps = fallbacks.stepSizes || {};
    const n = UI.liveRecipes ? UI.liveRecipes().length : DATA.state.recettes.length;
    const p = GRIND.parseDial(String(fallbacks.dial || ""));
    const values = {
      recipes: I18N.t("pivot_recipes", { n }),
      fallback: fallbacks.dose + " g · " + I18N.t("pivot_heat", { f: fallbacks.fire }),
      dial: fallbacks.dial + (p ? " · ≈ " + Math.round(p.microns) + " µm" : ""),
      kettle: fallbacks.bubbles ? I18N.t("pivot_bubbles", { t: UI.fmtDuration(fallbacks.bubbles) }) : I18N.t("pivot_to_measure"),
      incr: steps.pas_crans ? I18N.t("pivot_clicks", { n: steps.pas_crans }) : "",
      device: I18N.t($("#chrono-beep").checked ? "pivot_beeps_on" : "pivot_beeps_off"),
      data: ($("#sync-status") || { textContent: "" }).textContent.trim().slice(0, 40),
    };
    Object.entries(values).forEach(([k, v]) => { const el = $("#piv-" + k); if (el) el.textContent = v; });
    showSettingsSection(currentSection, false);
  }
  function showSettingsSection(id, open) {
    currentSection = id;
    $$(".param-section").forEach(s => s.classList.toggle("active", s.id === id));
    $$(".param-index [data-section]").forEach(b => b.setAttribute("aria-current", String(b.dataset.section === id)));
    // "This device" saves with a tap: no Save button under it.
    $("#param-actions").hidden = id === "ps-device";
    if (open) {
      $("#param-body").classList.add("expanded");
      window.scrollTo({ top: 0 });
    }
  }

  /* The toggle for including failed cups, and the count of what it leaves
     out today. A reading preference, local like the beeps. */
  function updateFailed() {
    const excluded = extsWithCalcs().length - analyzableExts().length;
    $("#param-failed").checked = includeFailed();
    $("#count-failed").textContent = I18N.t("botched_excluded", { n: excluded });
  }

  // Clicks and microns under the field, to check the right setting was typed.
  function updateDialDetail() {
    const p = GRIND.parseDial($("#param-dial").value.trim().replace(/,/g, "."));
    $("#param-dial-detail").textContent = p
      ? I18N.t("param_dial_detail", { c: p.clicks, m: Math.round(p.microns) })
      : "";
  }

  // The fields of the "My correction steps" card and their settings column.
  const STEP_FIELDS = [["param-incr-notches", "pas_crans"], ["param-incr-degrees", "pas_degres"],
    ["param-incr-fire", "pas_feu"], ["param-incr-water", "pas_eau_g"], ["param-incr-dose", "pas_dose_g"]];

  async function saveParameters() {
    const dose = Number($("#param-dose-default").value);
    const heat = Number($("#param-fire-default").value);
    const dial = $("#param-dial").value.trim().replace(/,/g, ".");
    if (!(dose > 0)) { toast(I18N.t("toast_param_dose")); return; }
    if (!(heat >= 1 && heat <= 10)) { toast(I18N.t("toast_param_heat")); return; }
    if (!GRIND.parseDial(dial)) { toast(I18N.t("toast_grind_invalid")); return; }
    const boilTime = UI.readDuration("param-boil");
    if (boilTime === "" || !(boilTime >= 30 && boilTime <= 1800)) { toast(I18N.t("toast_param_boil")); return; }
    // The first bubbles come BEFORE the rolling boil, otherwise the curve makes no sense.
    const bubblesTime = UI.readDuration("param-bubbles");
    if (bubblesTime === "" || !(bubblesTime >= 10 && bubblesTime < boilTime)) { toast(I18N.t("toast_param_bubbles")); return; }
    fallbacks.dose = dose;
    fallbacks.fire = Math.round(heat);
    fallbacks.dial = dial;
    fallbacks.boil = boilTime;
    fallbacks.bubbles = bubblesTime;
    /* Correction steps: an out-of-range value is not refused, normalisation
       brings it back to the default, as for a recipe's heat. */
    fallbacks.stepSizes = Object.fromEntries(STEP_FIELDS.map(([id, key]) => [key, Number($("#" + id).value)]));
    await saveFallbacks();
    UI.loadFallbacks();

    /* Only recipes actually touched are rewritten: each write stamps maj_le
       and would win the merge against another device. */
    let touched = 0;
    for (const tr of $$("[data-param-recipe]")) {
      const r = DATA.state.recettes.find(x => x.id === tr.dataset.paramRecipe);
      if (!r) continue;
      const vals = {};
      tr.querySelectorAll("[data-field]").forEach(i => { vals[i.dataset.field] = i.value.trim(); });
      const changed =
        String(r.dose || "") !== vals.dose ||
        String(r.eau || "") !== vals.eau ||
        String(r.temp === "" ? "" : r.temp) !== vals.temp ||
        String(r.dial || "") !== vals.dial ||
        (r.methode === "Brikka" && String(r.puissance_feu || "") !== vals.puissance_feu);
      if (!changed) continue;
      if (vals.dial && !GRIND.parseDial(vals.dial.replace(/,/g, "."))) { toast(I18N.t("toast_grind_invalid")); return; }
      // The table only shows these fields: we start from the whole recipe so
      // nothing is lost along the way (steps, text, associated coffees…).
      await DATA.editRecipe(r.id, {
        ...r,
        dose: vals.dose,
        eau: vals.eau,
        temp: vals.temp,
        dial: vals.dial.replace(/,/g, "."),
        puissance_feu: r.methode === "Brikka" ? vals.puissance_feu : "",
        // The displayed text followed the old target, it becomes wrong without this.
        tempTexte: vals.temp ? vals.temp + " °C" : (r.methode === "Brikka" ? I18N.t("param_temp_heat") : ""),
      });
      touched++;
    }
    renderParameters();
    UI.fillRecipeSelect();
    toast(touched ? I18N.t("toast_param_ok", { n: touched }) : I18N.t("toast_param_fallbacks"));
  }

  // Made available to the other screens.
  /* Wiring of the coffee, bag and recipe modals and of the Settings screen.
     Called once by app.js. */
  function wireCatalog() {
    /* The two header shortcuts disappeared along with the header (Comptoir
       redesign, step 2). The modals stay reachable where they are needed:
       #btn-manage-coffees on the Entry screen, #btn-manage-recipes in the Guide.
       Those two buttons still exist and are wired by their screens. */

    // Coffee: form, and bags
    $("#coffee-new").addEventListener("click", () => openCoffeeForm(null));
    $("#coffee-cancel").addEventListener("click", () => { $("#form-coffee").hidden = true; });
    $("#form-coffee").addEventListener("submit", saveCoffee);
    $("#form-bag").addEventListener("submit", saveBag);
    $("#bag-cancel").addEventListener("click", closeBagForm);

    // Recipes: form
    $("#recipe-new").addEventListener("click", () => openRecipeForm(null));
    $("#recipe-cancel").addEventListener("click", () => { $("#form-recipe").hidden = true; });
    $("#form-recipe").addEventListener("submit", saveRecipe);
    $("#recipe-restore").addEventListener("click", restoreCurrentRecipe);
    $("#recipe-delete").addEventListener("click", deleteCurrentRecipe);

    // Settings
    $("#param-save").addEventListener("click", saveParameters);
    $("#param-cancel").addEventListener("click", renderParameters);
    $$(".param-index [data-section]").forEach(b => b.addEventListener("click", () => showSettingsSection(b.dataset.section, true)));
    $(".param-index [data-opens-db]").addEventListener("click", () => $("#btn-data").click());
    $("#param-back").addEventListener("click", () => $("#param-body").classList.remove("expanded"));
    $("#param-dial").addEventListener("input", updateDialDetail);
    // The Settings checkbox and the stopwatch one drive the same setting.
    $("#param-beeps").addEventListener("change", () => {
      $("#chrono-beep").checked = $("#param-beeps").checked;
      $("#chrono-beep").dispatchEvent(new Event("change"));
    });
    /* The dashboard redraws itself on the next visit to the screen: that is
       where the toggle changes what the numbers say. */
    $("#param-failed").addEventListener("change", () => {
      toggleFailed($("#param-failed").checked);
      updateFailed();
    });
  }

  Object.assign(UI, {
    wireCatalog, costPerCup, saveCoffee, saveParameters, saveRecipe,
    updateFailed,
    saveBag, closeBagForm, readRecipeForm, updateDialDetail, openCoffeeForm,
    openRecipeForm, openBagForm, openCoffeesModal, openRecipesModal,
    renderCoffeeList, renderRecipeList, renderParameters,
    restoreCurrentRecipe, deleteCurrentRecipe,
  });
})();
