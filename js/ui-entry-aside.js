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
    const coffee = DATA.state.cafes.find(c => c.id === $("#f-coffee").value);
    if (!r && !coffee) { band.hidden = true; return; }
    const dose = $("#f-dose").value, water = $("#f-water").value, temp = $("#f-temp").value;
    const params = [dose && water ? dose + " g / " + water + " g" : "", temp ? temp + " °C" : ""].filter(Boolean).join(" · ");
    band.hidden = false;
    band.innerHTML =
      '<span class="br-name">' + (r ? '<span class="dot-method ' + r.methode.toLowerCase() + '"></span>' + titleAttr(r.nom) : I18N.t("aside_pick_recipe")) + "</span>" +
      (params ? '<span class="br-params">' + params + "</span>" : "") +
      (coffee ? '<span class="br-coffee">' + titleAttr(I18N.tr(coffee.nom)) + "</span>" : "") +
      '<span class="br-show">' + I18N.t("brew_view_recipe") + "</span>";
  }
  function openRecipeSheet(open) {
    const layout = $("#screen-saisie .entry-layout");
    if (!layout) return;
    layout.classList.toggle("aside-open", open);
    $("#band-recipe").setAttribute("aria-expanded", String(open));
    if (open) $("#aside-close").focus();
  }
  function wireRecipeBand() {
    $("#band-recipe").addEventListener("click", () =>
      openRecipeSheet(!$("#screen-saisie .entry-layout").classList.contains("aside-open")));
    $("#aside-close").addEventListener("click", () => { openRecipeSheet(false); $("#band-recipe").focus(); });
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape" && $("#screen-saisie .entry-layout").classList.contains("aside-open")) openRecipeSheet(false);
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
        '<div class="aside-title"><span class="dot-method ' + r.methode.toLowerCase() + '"></span><h4>' + r.nom + "</h4></div>" +
        (r.sousTitre ? '<p class="aside-sub">' + titleAttr(I18N.tr(r.sousTitre)) + "</p>" : "") +
        '<div class="recipe-params">' +
        '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
        (UI.waterFactor(r) !== 1
          ? '<span class="param-chip param-chip-adapted">' + I18N.t("aside_scaled", { e: $("#f-water").value }) + "</span>"
          : "") +
        (r.ratioTexte ? '<span class="param-chip">' + titleAttr(I18N.tr(r.ratioTexte)) + "</span>" : "") +
        (r.tempTexte ? '<span class="param-chip">' + titleAttr(I18N.tr(r.tempTexte)) + "</span>" : "") +
        '<span class="param-chip">' + I18N.t("dial") + " " + r.dial + "</span>" +
        (r.totalTexte ? '<span class="param-chip">' + titleAttr(I18N.tr(r.totalTexte)) + "</span>" : "") +
        "</div>" +
        (steps.length ? '<ol class="recipe-steps">' + steps.map(e =>
          "<li><span class=\"step-time\">" + (e.t === null ? "·" : fmtDuration(e.t)) + "</span><span>" + e.texte + "</span></li>"
        ).join("") + "</ol>" : "") +
        (r.pourQui ? '<p class="aside-forwho"><b>' + I18N.t("recipe_for_which") + "</b> " + titleAttr(I18N.tr(r.pourQui)) + "</p>" : "") +
        (r.cafesAssocies.length ? '<p class="aside-coffees"><b>' + I18N.t("recipe_coffees") + "</b> " + r.cafesAssocies.join(", ") + "</p>" : "") +
        (r.note ? '<p class="aside-recipe-note">' + titleAttr(I18N.tr(r.note)) + "</p>" : "") +
        '<button type="button" class="btn btn-small" id="aside-wt" data-r="' + r.id + '">' + I18N.t("aside_step_by_step") + "</button>";
      const btn = $("#aside-wt");
      if (btn) btn.addEventListener("click", () => UI.openWalkthrough(btn.dataset.r));
    }

    const coffee = DATA.state.cafes.find(c => c.id === $("#f-coffee").value);
    if (!coffee) {
      coffeeZone.innerHTML = '<p class="aside-empty">' + I18N.t("aside_pick_coffee") + "</p>";
    } else {
      const lines = [];
      const pct = coffee.pourcentage_cafe_reel === "" || coffee.pourcentage_cafe_reel === undefined ? 100 : Number(coffee.pourcentage_cafe_reel);
      let badge = "";
      if (pct < 100) badge = '<span class="badge-nonpure">' + pct + " % " + I18N.t("percent_coffee") + "</span>";
      else if ((coffee.tag || "").includes("référence")) badge = '<span class="badge-reference">' + I18N.t("badge_benchmark") + "</span>";
      const identity = [coffee.torrefacteur, coffee.origine].filter(Boolean).join(" · ");
      const profile = [coffee.espece, coffee.procede,
        coffee.torrefaction ? I18N.t("aside_roast", { t: coffee.torrefaction.toLowerCase() }) : ""].filter(Boolean).join(" · ");
      if (identity) lines.push('<p class="aside-sub">' + identity + "</p>");
      if (profile) lines.push("<p>" + profile + "</p>");
      if (coffee.notes_annoncees) lines.push('<p class="aside-notes">' + coffee.notes_annoncees + "</p>");
      if (Number(coffee.deja_moulu) === 1) lines.push('<p class="aside-reco">' + I18N.t("preground_aside") + "</p>");
      const advice = [coffee.machine_recommandee ? I18N.t("aside_machine", { m: I18N.machine(coffee.machine_recommandee) }) : "",
        coffee.recette_recommandee ? I18N.t("aside_recipe", { r: coffee.recette_recommandee }) : ""].filter(Boolean).join(", ");
      if (advice) lines.push('<p class="aside-reco">' + I18N.t("aside_recommended") + advice + "</p>");
      if (coffee.prix_vnd && coffee.format_grammes) {
        let priceLine = I18N.t("aside_price", {
          p: fmtVND(coffee.prix_vnd), g: coffee.format_grammes,
          pg: Math.round(coffee.prix_vnd / coffee.format_grammes).toLocaleString(I18N.locale()),
        });
        if (pct < 100) {
          priceLine += " " + I18N.t("aside_real_price", {
            pr: Math.round(coffee.prix_vnd / (coffee.format_grammes * pct / 100)).toLocaleString(I18N.locale()),
          });
        }
        lines.push("<p>" + priceLine + "</p>");
      }
      if (coffee.date_torrefaction) {
        const days = Math.floor((new Date() - new Date(coffee.date_torrefaction + "T00:00")) / 86400000);
        if (!isNaN(days) && days >= 0) {
          let freshness;
          if (days < 3) freshness = I18N.t("fresh_degassing");
          else if (days <= 42) freshness = I18N.t("fresh_ok");
          else freshness = I18N.t("fresh_old");
          lines.push('<p class="aside-age">' + I18N.t("aside_age", { j: days, s: days > 1 ? "s" : "", f: freshness }) + "</p>");
        }
      }
      coffeeZone.innerHTML = '<div class="aside-title"><h4>' + coffee.nom + "</h4>" + badge + "</div>" + lines.join("");
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
      cafe_id: $("#f-coffee").value, recette: $("#f-recipe").value,
      mouture_dial: $("#f-grind").value.trim(), ground: currentCoffeeGround(),
    };
    const exts = UI.analyzableExts().filter(e => e.id !== entry.editId);
    const list = TUNING.twins(exts, target, 3);
    if (list.length < 2) { zone.hidden = true; zone.innerHTML = ""; return; }
    const temp = $("#f-temp").value, heat = $("#f-power").value;
    const lines = list.map(j => {
      const e = j.ext;
      const diffs = [];
      if (!j.sameCoffee) {
        const other = DATA.state.cafes.find(c => c.id === e.cafe_id);
        diffs.push(other ? other.nom : I18N.t("twins_other_coffee"));
      }
      if (j.gap) {
        diffs.push(I18N.t("twins_dial", {
          d: e.mouture_dial,
          c: I18N.t(Math.abs(j.gap) > 1 ? "twins_clicks" : "twins_click", { n: (j.gap > 0 ? "+" : "") + j.gap }),
        }));
      }
      if (e.methode === "Switch" && e.temperature_c !== "" && String(e.temperature_c) !== String(temp)) {
        diffs.push(e.temperature_c + " °C");
      }
      if (e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined &&
        String(e.puissance_feu) !== String(heat)) diffs.push(I18N.t("twins_heat", { f: e.puissance_feu }));
      const [y, m, day] = String(e.date_heure).slice(0, 10).split("-").map(Number);
      const date = new Date(y, m - 1, day).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
      return '<li><span class="j-date">' + date + '</span><span class="j-gap' + (diffs.length ? "" : " j-same") + '">' +
        (diffs.length ? diffs.join(" · ") : I18N.t(target.ground ? "twins_same_preground" : "twins_same")) + '</span><b class="j-rating">' +
        fmtDecimal(Number(e.note_sur_10), 1) + "</b></li>";
    });
    const avg = list.reduce((s, j) => s + Number(j.ext.note_sur_10), 0) / list.length;
    zone.hidden = false;
    zone.innerHTML = '<div class="aside-title"><h4>' + I18N.t("twins_title") + "</h4></div>" +
      '<p class="aside-sub">' + I18N.t(target.ground ? "twins_rule_preground" : "twins_rule", { c: TUNING.TWIN_CLICKS }) +
      "</p>" +
      '<ol class="twins">' + lines.join("") + "</ol>" +
      '<p class="j-average">' + I18N.t("twins_average", { m: fmtDecimal(avg, 1), n: list.length }) + "</p>";
  }

  Object.assign(UI, { wireRecipeBand, updateEntryAside, updateRecipeBand, updateTwins, openRecipeSheet });
})();
