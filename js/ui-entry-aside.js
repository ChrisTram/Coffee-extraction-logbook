/* Entry screen: the side panel (the chosen recipe and coffee, in plain
 * sight) and the twin cups. Moved out of ui-entry.js in v8.78. */
"use strict";

(() => {

  // Borrowed from the core and from ui-entry.js, loaded before us.
  const { $, titleAttr, fmtDuration, fmtDecimal, fmtVND, findRecipe, entry, currentCoffeeGround } = UI;

  /* THE RECIPE STRIP (A4, v8.84). Below 1,400 px the card dropped under the
     whole form: the recipe, which you reread at every step, was at the end of
     the page. The strip sums it up under the timer, with the coffee, and opens
     the card. */
  function updateRecipeBand() {
    const band = $("#band-recipe");
    if (!band) return;
    const r = findRecipe($("#f-recipe").value);
    const coffee = DATA.state.coffees.find(c => c.id === $("#f-coffee").value);
    if (!r && !coffee) { band.hidden = true; return; }
    const dose = $("#f-dose").value, water = $("#f-water").value, temp = $("#f-temp").value;
    const params = [dose && water ? dose + " g / " + water + " g" : "", temp ? temp + " °C" : ""].filter(Boolean).join(" · ");
    band.hidden = false;
    band.innerHTML =
      '<span class="br-name">' + (r ? '<span class="dot-method ' + r.method.toLowerCase() + '"></span>' + titleAttr(r.name) : I18N.t("aside_pick_recipe")) + "</span>" +
      (params ? '<span class="br-params">' + params + "</span>" : "") +
      (coffee ? '<span class="br-coffee">' + titleAttr(I18N.tr(coffee.name)) + "</span>" : "") +
      '<span class="br-show">' + I18N.t("brew_view_recipe") + "</span>";
  }
  function openRecipeSheet(open) {
    const layout = $("#screen-entry .entry-layout");
    if (!layout) return;
    layout.classList.toggle("aside-open", open);
    $("#band-recipe").setAttribute("aria-expanded", String(open));
    if (open) $("#aside-close").focus();
  }
  function wireRecipeBand() {
    $("#band-recipe").addEventListener("click", () =>
      openRecipeSheet(!$("#screen-entry .entry-layout").classList.contains("aside-open")));
    $("#aside-close").addEventListener("click", () => { openRecipeSheet(false); $("#band-recipe").focus(); });
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && $("#screen-entry .entry-layout").classList.contains("aside-open")) openRecipeSheet(false);
    });
    // A setting that changes the strip: dose, water and temperature live in the form.
    ["f-dose", "f-water", "f-temp"].forEach(id => $("#" + id).addEventListener("input", updateRecipeBand));
  }

  // Entry side panel: the selected recipe and coffee, in plain sight.
  function updateEntryAside() {
    updateRecipeBand();
    const recipeZone = $("#aside-recipe");
    const coffeeZone = $("#aside-coffee");
    if (!recipeZone || !coffeeZone) return;

    const r = findRecipe($("#f-recipe").value);
    UI.updateVideoAside(r);
    if (!r) {
      recipeZone.innerHTML = '<p class="aside-empty">' + I18N.t("aside_pick_recipe") + "</p>";
    } else {
      const steps = UI.stepsFor(r);
      recipeZone.innerHTML =
        '<div class="aside-title"><span class="dot-method ' + r.method.toLowerCase() + '"></span><h4>' + r.name + "</h4></div>" +
        (r.subtitle ? '<p class="aside-sub">' + titleAttr(I18N.tr(r.subtitle)) + "</p>" : "") +
        '<div class="recipe-params">' +
        '<span class="param-chip">' + r.dose + " g / " + r.water + " g</span>" +
        (UI.waterFactor(r) !== 1
          ? '<span class="param-chip param-chip-adapted">' + I18N.t("aside_scaled", { e: $("#f-water").value }) + "</span>"
          : "") +
        (r.ratioText ? '<span class="param-chip">' + titleAttr(I18N.tr(r.ratioText)) + "</span>" : "") +
        (r.tempText ? '<span class="param-chip">' + titleAttr(I18N.tr(r.tempText)) + "</span>" : "") +
        '<span class="param-chip">' + I18N.t("dial") + " " + r.dial + "</span>" +
        (r.totalText ? '<span class="param-chip">' + titleAttr(I18N.tr(r.totalText)) + "</span>" : "") +
        "</div>" +
        (steps.length ? '<ol class="recipe-steps">' + steps.map(e =>
          "<li><span class=\"step-time\">" + (e.t === null ? "·" : fmtDuration(e.t)) + "</span><span>" + e.text + "</span></li>"
        ).join("") + "</ol>" : "") +
        (r.bestFor ? '<p class="aside-forwho"><b>' + I18N.t("recipe_for_which") + "</b> " + titleAttr(I18N.tr(r.bestFor)) + "</p>" : "") +
        (r.pairedCoffees.length ? '<p class="aside-coffees"><b>' + I18N.t("recipe_coffees") + "</b> " + r.pairedCoffees.join(", ") + "</p>" : "") +
        (r.note ? '<p class="aside-recipe-note">' + titleAttr(I18N.tr(r.note)) + "</p>" : "") +
        '<button type="button" class="btn btn-small" id="aside-wt" data-r="' + r.id + '">' + I18N.t("aside_step_by_step") + "</button>";
      const btn = $("#aside-wt");
      if (btn) btn.addEventListener("click", () => UI.openWalkthrough(btn.dataset.r));
    }

    const coffee = DATA.state.coffees.find(c => c.id === $("#f-coffee").value);
    if (!coffee) {
      coffeeZone.innerHTML = '<p class="aside-empty">' + I18N.t("aside_pick_coffee") + "</p>";
    } else {
      const lines = [];
      const pct = coffee.real_coffee_pct === "" || coffee.real_coffee_pct === undefined ? 100 : Number(coffee.real_coffee_pct);
      let badge = "";
      if (pct < 100) badge = '<span class="badge-nonpure">' + pct + " % " + I18N.t("percent_coffee") + "</span>";
      else if ((coffee.tag || "").includes("référence")) badge = '<span class="badge-reference">' + I18N.t("badge_benchmark") + "</span>";
      const identity = [coffee.roaster, coffee.origin].filter(Boolean).join(" · ");
      const profile = [coffee.species, coffee.process,
        coffee.roast ? I18N.t("aside_roast", { t: coffee.roast.toLowerCase() }) : ""].filter(Boolean).join(" · ");
      if (identity) lines.push('<p class="aside-sub">' + identity + "</p>");
      if (profile) lines.push("<p>" + profile + "</p>");
      if (coffee.roaster_notes) lines.push('<p class="aside-notes">' + coffee.roaster_notes + "</p>");
      if (Number(coffee.pre_ground) === 1) lines.push('<p class="aside-reco">' + I18N.t("preground_aside") + "</p>");
      const advice = [coffee.recommended_method ? I18N.t("aside_machine", { m: I18N.machine(coffee.recommended_method) }) : "",
        coffee.recommended_recipe ? I18N.t("aside_recipe", { r: coffee.recommended_recipe }) : ""].filter(Boolean).join(", ");
      if (advice) lines.push('<p class="aside-reco">' + I18N.t("aside_recommended") + advice + "</p>");
      if (coffee.price_vnd && coffee.bag_size_g) {
        let priceLine = I18N.t("aside_price", {
          p: fmtVND(coffee.price_vnd), g: coffee.bag_size_g,
          pg: Math.round(coffee.price_vnd / coffee.bag_size_g).toLocaleString(I18N.locale()),
        });
        if (pct < 100) {
          priceLine += " " + I18N.t("aside_real_price", {
            pr: Math.round(coffee.price_vnd / (coffee.bag_size_g * pct / 100)).toLocaleString(I18N.locale()),
          });
        }
        lines.push("<p>" + priceLine + "</p>");
      }
      if (coffee.roast_date) {
        const days = Math.floor((new Date() - new Date(coffee.roast_date + "T00:00")) / 86400000);
        if (!isNaN(days) && days >= 0) {
          let freshness;
          if (days < 3) freshness = I18N.t("fresh_degassing");
          else if (days <= 42) freshness = I18N.t("fresh_ok");
          else freshness = I18N.t("fresh_old");
          lines.push('<p class="aside-age">' + I18N.t("aside_age", { j: days, s: days > 1 ? "s" : "", f: freshness }) + "</p>");
        }
      }
      coffeeZone.innerHTML = '<div class="aside-title"><h4>' + coffee.name + "</h4>" + badge + "</div>" + lines.join("");
    }
    updateTwins();
    UI.updateStopwatchSteps(false);
  }

  /* THE TWIN CUPS (v8.44): what this setting gave the previous times.
     The calculation is in TUNING.twins (same recipe, grinder within three
     clicks). Each line says how it DIFFERS from the form, and only that: same
     coffee and same grinder setting are not written. Below two twins, the card
     hides, a single cup is not a reference point. */
  function updateTwins() {
    const zone = $("#aside-twins");
    if (!zone) return;
    const target = {
      coffee_id: $("#f-coffee").value, recipe: $("#f-recipe").value,
      grind_dial: $("#f-grind").value.trim(), ground: currentCoffeeGround(),
    };
    const exts = UI.analyzableExts().filter(e => e.id !== entry.editId);
    const list = TUNING.twins(exts, target, 3);
    if (list.length < 2) { zone.hidden = true; zone.innerHTML = ""; return; }
    const temp = $("#f-temp").value, heat = $("#f-power").value;
    const lines = list.map(j => {
      const e = j.ext;
      const diffs = [];
      if (!j.sameCoffee) {
        const other = DATA.state.coffees.find(c => c.id === e.coffee_id);
        diffs.push(other ? other.name : I18N.t("twins_other_coffee"));
      }
      if (j.gap) {
        diffs.push(I18N.t("twins_dial", {
          d: e.grind_dial,
          c: I18N.t(Math.abs(j.gap) > 1 ? "twins_clicks" : "twins_click", { n: (j.gap > 0 ? "+" : "") + j.gap }),
        }));
      }
      if (e.method === "Switch" && e.temperature_c !== "" && String(e.temperature_c) !== String(temp)) {
        diffs.push(e.temperature_c + " °C");
      }
      if (e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined &&
        String(e.heat_level) !== String(heat)) diffs.push(I18N.t("twins_heat", { f: e.heat_level }));
      const [y, m, day] = String(e.date_time).slice(0, 10).split("-").map(Number);
      const date = new Date(y, m - 1, day).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
      return '<li><span class="j-date">' + date + '</span><span class="j-gap' + (diffs.length ? "" : " j-same") + '">' +
        (diffs.length ? diffs.join(" · ") : I18N.t(target.ground ? "twins_same_preground" : "twins_same")) + '</span><b class="j-rating">' +
        fmtDecimal(Number(e.score_10), 1) + "</b></li>";
    });
    // The shared mean (H1, v9.19): at least two twins here, the card is hidden below that.
    const avg = TOOLS.average(list.map(j => Number(j.ext.score_10)));
    zone.hidden = false;
    zone.innerHTML = '<div class="aside-title"><h4>' + I18N.t("twins_title") + "</h4></div>" +
      '<p class="aside-sub">' + I18N.t(target.ground ? "twins_rule_preground" : "twins_rule", { c: TUNING.TWIN_CLICKS }) +
      "</p>" +
      '<ol class="twins">' + lines.join("") + "</ol>" +
      '<p class="j-average">' + I18N.t("twins_average", { m: fmtDecimal(avg, 1), n: list.length }) + "</p>";
  }

  Object.assign(UI, { wireRecipeBand, updateEntryAside, updateRecipeBand, updateTwins, openRecipeSheet });
})();
