/* The management modals: coffees, bags, recipes, and the Settings screen.
 *
 * They share one rule: each modal owns ITS editing state and does not
 * publish it. The wiring says "restore the current recipe", it does not read
 * the id to hand it back to the data layer. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, attrTitre, basculerRatees, confirmer, ecrireReplis, extAnalysables, extAvecCalculs,
    fmtDateCourte, fmtDecimal, fmtVND, inclureRatees, maintenantLocal, moyenne, recettesDeMethode,
    replis, toast } = UI;

  // ---------- Coffee management ----------

  let editingCafeId = null;

  function ouvrirModaleCafes() {
    rendreListeCafes();
    $("#form-cafe").hidden = true;
    $("#form-sachet").hidden = true;
    const m = $("#modale-cafes");
    if (!m.open) m.showModal();
  }

  /* Cost of a cup of this coffee, at the given dose. Silent if the price or
     the bag size is missing: an invented cost would be worse than no cost.

     Second figure for NON-PURE coffees. The Sáng Tạo is 82 % coffee, so
     534 ₫ per gram of real coffee against 348 for the G4: it looks 26 % more
     expensive per gram, it is 53 % more. The pourcentage_cafe_reel field was
     only used for the caffeine calculation until now. */
  function coutParTasse(cafe, dose) {
    if (!cafe.prix_vnd || !cafe.format_grammes || !(dose > 0)) return "";
    const perGram = cafe.prix_vnd / cafe.format_grammes;
    const base = I18N.t("cout_tasse", { v: fmtVND(perGram * dose), d: fmtDecimal(dose, 1) });
    const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined
      ? 100 : Number(cafe.pourcentage_cafe_reel);
    if (!(pct > 0) || pct >= 100) return base;
    return base + " " + I18N.t("cout_reel", { v: fmtVND(perGram / (pct / 100) * dose) });
  }

  function rendreListeCafes() {
    // Active ones first (original order kept), deactivated always at the end
    // of the list. Each coffee carries an average score badge (over its
    // rated brews) and the date it was added to the system.
    const sorted = [...DATA.state.cafes].sort((a, b) => (a.actif === 0 ? 1 : 0) - (b.actif === 0 ? 1 : 0));
    $("#cafes-liste").innerHTML = sorted.map(c => {
      const notes = DATA.state.extractions
        .filter(e => e.cafe_id === c.id && e.note_sur_10 !== "")
        .map(e => Number(e.note_sur_10));
      const scoreBadge = notes.length
        ? ' <span class="badge-note" title="' + I18N.t("b_extractions", { n: notes.length }) + '">★ ' +
          fmtDecimal(moyenne(notes), 1) + "</span>"
        : "";
      // Stock of the current bag. A missing dose counts as the default dose,
      // otherwise a forgotten entry would make the bag look untouched.
      const stock = DATA.stockSachet(c.id, replis.dose);
      let stockBadge = "";
      // Dose used for the cost, the same as for the cups left.
      let coutTasse = replis.dose;
      if (stock) {
        /* What is left is counted with this coffee's AVERAGE dose, not the
           fallback dose: Chris doses 16 g on the G4 and 14 on another, a single
           figure would overestimate the cups left by almost 10 %. Falls back
           on the default dose while the coffee has no brew. */
        const doses = DATA.state.extractions
          .filter(e => e.cafe_id === c.id && Number(e.dose_g) > 0)
          .map(e => Number(e.dose_g));
        const doseTypique = doses.length ? moyenne(doses) : replis.dose;
        coutTasse = doseTypique;
        const cupsLeft = Math.max(0, Math.floor(stock.restant / doseTypique));
        const level = stock.restant <= 0 ? "vide" : cupsLeft <= 3 ? "bas" : "ok";
        const label = stock.restant <= 0
          ? I18N.t("stock_vide")
          : I18N.t("stock_reste", { g: fmtDecimal(stock.restant, 0), n: cupsLeft });
        stockBadge = ' <span class="badge-stock badge-stock-' + level + '" title="' +
          I18N.t("stock_titre", {
            f: stock.format,
            c: fmtDecimal(stock.consomme, 0),
            r: fmtDecimal(Math.max(0, stock.restant), 0),
            d: fmtDecimal(doseTypique, 1),
            src: I18N.t(doses.length ? "stock_dose_moy" : "stock_dose_defaut"),
          }) + '">' + label + "</span>";
      }
      return '<div class="cafe-ligne' + (c.actif === 0 ? " inactif" : "") +
      (stock && stock.restant <= 0 ? " epuise" : "") + '">' +
      "<div><b>" + c.nom + "</b>" + scoreBadge + stockBadge +
      (Number(c.pourcentage_cafe_reel) < 100 ? ' <span class="badge-nonpur">' + c.pourcentage_cafe_reel + " % " + I18N.t("pct_cafe") + "</span>" : "") +
      ((c.tag || "").includes("référence") ? ' <span class="badge-reference">' + I18N.t("badge_etalon") + "</span>" : "") +
      "<div class=\"cafe-meta\">" +
      [c.torrefacteur, c.espece, c.procede,
        c.machine_recommandee ? I18N.t("li_machine", { m: I18N.machine(c.machine_recommandee) }) : "",
        c.prix_vnd ? fmtVND(c.prix_vnd) + " / " + c.format_grammes + " g" : "",
        /* Cost of ONE cup, at this coffee's average dose. It is the only price
           figure that compares from one bag to another: the bag price depends
           on the size, the price per gram says nothing until you know how
           much you use. */
        coutParTasse(c, coutTasse),
        c.date_ajout ? I18N.t("li_ajoute", { d: fmtDateCourte(c.date_ajout) }) : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<span class="cafe-meta">' + (c.actif === 0 ? I18N.t("li_inactif") : "") + "</span>" +
      '<button class="btn btn-petit" data-fiche="' + c.id + '">' + I18N.t("fi_voir") + "</button>" +
      '<button class="btn btn-petit" data-cafe-sachet="' + c.id + '">' + I18N.t("btn_sachet") + "</button>" +
      '<button class="btn btn-petit" data-cafe-edit="' + c.id + '">' + I18N.t("btn_modifier") + "</button></div>";
    }).join("");
    $$("[data-cafe-edit]").forEach(b => b.addEventListener("click", () => ouvrirFormCafe(b.dataset.cafeEdit)));
    $$("[data-cafe-sachet]").forEach(b => b.addEventListener("click", () => ouvrirFormSachet(b.dataset.cafeSachet)));
  }

  // ---------- New bag ----------
  // Saving a repurchase resets the stock counter AND gives the coffee an
  // up-to-date roast date. That second effect fixes a real lie of the old
  // model: a repurchased coffee kept the date of the very first bag, so the
  // displayed freshness was wrong forever.
  let bagCafeId = null;

  function ouvrirFormSachet(cafeId) {
    const c = DATA.state.cafes.find(x => x.id === cafeId);
    if (!c) return;
    bagCafeId = cafeId;
    $("#form-sachet-titre").textContent = I18N.t("sachet_titre", { n: c.nom });
    $("#s-date").value = maintenantLocal().slice(0, 10);
    $("#s-format").value = c.format_grammes || "";
    $("#s-prix").value = c.prix_vnd || "";
    // The usual case is opening the bag on the day it is recorded. Chris can
    // clear the field if the bag goes into the cupboard.
    $("#s-ouverture").value = maintenantLocal().slice(0, 10);
    $("#s-torref").value = "";
    $("#form-sachet").hidden = false;
    $("#s-date").focus();
  }

  // Closing the form also means forgetting the target coffee: the two already
  // went together, they just lived in two different files.
  function fermerFormSachet() {
    $("#form-sachet").hidden = true;
    bagCafeId = null;
  }

  async function enregistrerSachet(ev) {
    ev.preventDefault();
    if (!bagCafeId) return;
    await DATA.ajouterAchat({
      cafe_id: bagCafeId,
      date_achat: $("#s-date").value || maintenantLocal().slice(0, 10),
      format_grammes: $("#s-format").value,
      prix_vnd: $("#s-prix").value,
      date_torrefaction: $("#s-torref").value,
      date_ouverture: $("#s-ouverture").value,
    });
    $("#form-sachet").hidden = true;
    bagCafeId = null;
    rendreListeCafes();
    toast(I18N.t("t_sachet"));
  }

  function ouvrirFormCafe(id) {
    editingCafeId = id || null;
    const c = id ? DATA.state.cafes.find(x => x.id === id) : null;
    $("#form-cafe-titre").textContent = c ? I18N.t("f_modif", { n: c.nom }) : I18N.t("fc_nouveau");
    $("#c-nom").value = c ? c.nom : "";
    $("#c-torrefacteur").value = c ? c.torrefacteur : "";
    $("#c-origine").value = c ? c.origine : "";
    $("#c-espece").value = c ? c.espece : "";
    $("#c-procede").value = c ? c.procede : "";
    $("#c-torrefaction").value = c ? c.torrefaction : "";
    $("#c-format").value = c ? c.format_grammes : "";
    $("#c-prix").value = c ? c.prix_vnd : "";
    $("#c-date-torref").value = c ? c.date_torrefaction : "";
    $("#c-machine").value = c ? c.machine_recommandee : "";
    $("#c-recette").value = c ? c.recette_recommandee : "";
    $("#c-notes").value = c ? c.notes_annoncees : "";
    $("#c-pct").value = c ? (c.pourcentage_cafe_reel === "" || c.pourcentage_cafe_reel === undefined ? 100 : c.pourcentage_cafe_reel) : 100;
    $("#c-moulu").checked = c ? Number(c.deja_moulu) === 1 : false;
    $("#c-actif").checked = c ? c.actif !== 0 : true;
    $("#form-cafe").hidden = false;
    $("#c-nom").focus();
  }

  async function enregistrerCafe(ev) {
    ev.preventDefault();
    const cafe = {
      nom: $("#c-nom").value.trim(),
      torrefacteur: $("#c-torrefacteur").value.trim(),
      origine: $("#c-origine").value.trim(),
      espece: $("#c-espece").value.trim(),
      procede: $("#c-procede").value.trim(),
      torrefaction: $("#c-torrefaction").value,
      format_grammes: $("#c-format").value,
      prix_vnd: $("#c-prix").value,
      date_torrefaction: $("#c-date-torref").value,
      machine_recommandee: $("#c-machine").value,
      recette_recommandee: $("#c-recette").value,
      notes_annoncees: $("#c-notes").value.trim(),
      pourcentage_cafe_reel: $("#c-pct").value || 100,
      tag: (editingCafeId && (DATA.state.cafes.find(x => x.id === editingCafeId) || {}).tag) || "",
      deja_moulu: $("#c-moulu").checked ? 1 : 0,
      actif: $("#c-actif").checked ? 1 : 0,
    };
    if (Number(cafe.pourcentage_cafe_reel) < 100 && !cafe.tag) cafe.tag = "café aromatisé";
    if (editingCafeId) await DATA.modifierCafe(editingCafeId, cafe);
    else await DATA.ajouterCafe(cafe);
    $("#form-cafe").hidden = true;
    rendreListeCafes();
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    toast(I18N.t("t_cafe"));
  }

  // ---------- Recipe management ----------

  let editingRecipeId = null;

  function ouvrirModaleRecettes() {
    rendreListeRecettes();
    $("#form-recette").hidden = true;
    const m = $("#modale-recettes");
    if (!m.open) m.showModal();
  }

  function rendreListeRecettes() {
    $("#recettes-liste").innerHTML = DATA.state.recettes.map(r =>
      '<div class="cafe-ligne' + (r.actif === 0 ? " inactif" : "") + '">' +
      '<span class="chip-methode ' + r.methode.toLowerCase() + '">' + r.methode + "</span>" +
      "<div><b>" + r.nom + "</b><div class=\"cafe-meta\">" +
      [r.numero, r.dose + " g / " + r.eau + " g", I18N.t("molette") + " " + r.dial,
        DATA.estRecetteDorigine(r.id) ? "" : I18N.t("li_perso"),
        r.actif === 0 ? I18N.t("li_masquee") : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<button class="btn btn-petit" data-recette-form="' + r.id + '">' + I18N.t("btn_modifier") + "</button></div>"
    ).join("");
    $$("[data-recette-form]").forEach(b => b.addEventListener("click", () => ouvrirFormRecette(b.dataset.recetteForm)));
  }

  function ouvrirFormRecette(id) {
    editingRecipeId = id || null;
    const r = id ? DATA.state.recettes.find(x => x.id === id) : null;
    $("#form-recette-titre").textContent = r ? I18N.t("f_modif", { n: r.nom }) : I18N.t("fr_nouvelle");
    $("#r-nom").value = r ? r.nom : "";
    $("#r-methode").value = r ? r.methode : "Switch";
    $("#r-numero").value = r ? r.numero : "";
    $("#r-sous-titre").value = r ? r.sousTitre : "";
    $("#r-dose").value = r ? r.dose : 15;
    $("#r-eau").value = r ? r.eau : 225;
    $("#r-temp").value = r ? r.temp : 92;
    $("#r-feu").value = r ? r.puissance_feu : "";
    $("#r-temp-texte").value = r ? r.tempTexte : "";
    $("#r-dial").value = r ? r.dial : "1.5.0";
    $("#r-ratio-texte").value = r ? r.ratioTexte : "";
    $("#r-total-texte").value = r ? r.totalTexte : "";
    $("#r-etapes").value = r ? etapesVersTexte(r.etapes) : "";
    $("#r-pourqui").value = r ? r.pourQui : "";
    $("#r-cafes").value = r ? r.cafesAssocies.join("\n") : "";
    $("#r-note").value = r ? r.note : "";
    $("#r-video").value = r ? r.video || "" : "";
    $("#r-defaut").checked = r ? !!r.parDefaut : false;
    $("#r-avancee").checked = r ? !!r.avancee : false;
    $("#r-actif").checked = r ? r.actif !== 0 : true;
    const isOriginal = r && DATA.estRecetteDorigine(r.id);
    $("#recette-retablir").hidden = !isOriginal;
    $("#recette-supprimer").hidden = !r || isOriginal;
    $("#form-recette").hidden = false;
    $("#r-nom").focus();
  }

  function lireFormRecette() {
    return {
      nom: $("#r-nom").value.trim(),
      methode: $("#r-methode").value,
      numero: $("#r-numero").value.trim(),
      sousTitre: $("#r-sous-titre").value.trim(),
      dose: $("#r-dose").value,
      eau: $("#r-eau").value,
      temp: $("#r-temp").value,
      puissance_feu: $("#r-feu").value,
      // Without a temperature target, no invented text: " °C" on its own makes no sense.
      tempTexte: $("#r-temp-texte").value.trim() ||
        ($("#r-temp").value ? $("#r-temp").value + " °C" : ""),
      dial: $("#r-dial").value.trim().replace(/,/g, "."),
      ratioTexte: $("#r-ratio-texte").value.trim(),
      totalTexte: $("#r-total-texte").value.trim(),
      etapes: texteVersEtapes($("#r-etapes").value),
      pourQui: $("#r-pourqui").value.trim(),
      cafesAssocies: $("#r-cafes").value.split("\n").map(s => s.trim()).filter(Boolean),
      note: $("#r-note").value.trim(),
      video: $("#r-video").value.trim(),
      parDefaut: $("#r-defaut").checked,
      avancee: $("#r-avancee").checked,
      actif: $("#r-actif").checked ? 1 : 0,
    };
  }

  /* Restore and delete act on the OPEN recipe, the one the form knows. The
     wiring used to just read that id to hand it back to DATA, which forced
     the modal to publish its internal state. */
  async function retablirRecetteCourante() {
    if (!editingRecipeId) return;
    if (!await confirmer(I18N.t("c_retablir"))) return;
    await DATA.reinitialiserRecette(editingRecipeId);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_retablie"));
  }

  async function supprimerRecetteCourante() {
    if (!editingRecipeId) return;
    if (!await confirmer(I18N.t("c_suppr_recette"), { danger: true })) return;
    await DATA.supprimerRecette(editingRecipeId);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_recette_supprimee"));
  }

  async function enregistrerRecette(ev) {
    ev.preventDefault();
    const recipe = lireFormRecette();
    if (!recipe.nom) { toast(I18N.t("t_nom_recette")); return; }
    const dial = GRIND.parseDial(recipe.dial);
    if (recipe.dial && !dial) { toast(I18N.t("t_mouture_invalide")); return; }
    if (editingRecipeId) await DATA.modifierRecette(editingRecipeId, recipe);
    else await DATA.ajouterRecette(recipe);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_recette"));
  }

  // ---------- Settings screen ----------
  /* This screen stores nothing on its own. Each row of the table edits the
     RECIPE itself, the same card as "Manage recipes": a single source of
     truth, already synced. The only settings specific to the screen are the
     two fallbacks, local to the device. */

  // The name a screen reader reads for a recipe table field (v8.76): "Chronicler · dose (g)".
  const nomChamp = (r, cle) => attrTitre(I18N.tr(r.nom) + " · " + I18N.t(cle));

  function rendreParametres() {
    const rows = ["Brikka", "Switch"].map(m => {
      const list = recettesDeMethode(m);
      if (!list.length) return "";
      return '<tr class="param-groupe"><td colspan="6">' + m + "</td></tr>" +
        list.map(r =>
          '<tr data-param-recette="' + r.id + '">' +
          "<td>" + I18N.tr(r.nom) + "</td>" +
          '<td data-l="' + I18N.t("pc_dose") + '"><input type="number" step="0.5" min="1" data-champ="dose" aria-label="' + nomChamp(r, "pc_dose") + '" value="' + (r.dose || "") + '"></td>' +
          '<td data-l="' + I18N.t("pc_eau") + '"><input type="number" step="1" min="10" data-champ="eau" aria-label="' + nomChamp(r, "pc_eau") + '" value="' + (r.eau || "") + '"></td>' +
          '<td data-l="' + I18N.t("pc_temp") + '"><input type="number" step="1" min="60" max="100" data-champ="temp" aria-label="' + nomChamp(r, "pc_temp") + '" value="' + (r.temp === "" ? "" : r.temp) +
            '" placeholder="' + I18N.t("param_vide") + '"></td>' +
          '<td data-l="' + I18N.t("pc_feu") + '">' + (r.methode === "Brikka"
            ? '<input type="number" step="1" min="1" max="10" data-champ="puissance_feu" aria-label="' + nomChamp(r, "pc_feu") + '" value="' + (r.puissance_feu || "") + '">'
            : '<span class="param-sans">&middot;</span>') + "</td>" +
          '<td data-l="' + I18N.t("pc_dial") + '"><input type="text" data-champ="dial" aria-label="' + nomChamp(r, "pc_dial") + '" value="' + attrTitre(r.dial || "") + '"></td>' +
          "</tr>").join("");
    }).join("");
    $("#param-recettes").innerHTML = rows;
    $("#param-dose-defaut").value = replis.dose;
    $("#param-feu-defaut").value = replis.feu;
    $("#param-molette").value = replis.molette;
    UI.ecrireDuree("param-ebullition", replis.ebullition);
    UI.ecrireDuree("param-bulles", replis.bulles);
    STEP_FIELDS.forEach(([id, cle]) => { $("#" + id).value = (replis.pas || {})[cle]; });
    majDetailMolette();
    $("#param-bips").checked = $("#chrono-bip").checked;
    majRatees();
    updateSettingsIndex();
  }

  /* L6 (v8.91): EACH ROW OF THE LIST SHOWS ITS VALUE. You know what is set
     without opening the page, as in a phone's settings. */
  let currentSection = "ps-recettes";
  function updateSettingsIndex() {
    const steps = replis.pas || {};
    const n = UI.recettesVivantes ? UI.recettesVivantes().length : DATA.state.recettes.length;
    const p = GRIND.parseDial(String(replis.molette || ""));
    const values = {
      recettes: I18N.t("piv_recettes", { n }),
      repli: replis.dose + " g · " + I18N.t("piv_feu", { f: replis.feu }),
      molette: replis.molette + (p ? " · ≈ " + Math.round(p.microns) + " µm" : ""),
      bouilloire: replis.bulles ? I18N.t("piv_bulles", { t: UI.fmtTemps(replis.bulles) }) : I18N.t("piv_a_mesurer"),
      pas: steps.pas_crans ? I18N.t("piv_crans", { n: steps.pas_crans }) : "",
      appareil: I18N.t($("#chrono-bip").checked ? "piv_bips_oui" : "piv_bips_non"),
      donnees: ($("#sync-statut") || { textContent: "" }).textContent.trim().slice(0, 40),
    };
    Object.entries(values).forEach(([k, v]) => { const el = $("#piv-" + k); if (el) el.textContent = v; });
    showSettingsSection(currentSection, false);
  }
  function showSettingsSection(id, open) {
    currentSection = id;
    $$(".param-section").forEach(s => s.classList.toggle("active", s.id === id));
    $$(".param-index [data-section]").forEach(b => b.setAttribute("aria-current", String(b.dataset.section === id)));
    // "This device" saves with a tap: no Save button under it.
    $("#param-actions").hidden = id === "ps-appareil";
    if (open) {
      $("#param-corps").classList.add("ouverte");
      window.scrollTo({ top: 0 });
    }
  }

  /* The toggle for including failed cups, and the count of what it leaves
     out today. A reading preference, local like the beeps. */
  function majRatees() {
    const excluded = extAvecCalculs().length - extAnalysables().length;
    $("#param-ratees").checked = inclureRatees();
    $("#compte-ratees").textContent = I18N.t("rt_exclues", { n: excluded });
  }

  // Clicks and microns under the field, to check the right setting was typed.
  function majDetailMolette() {
    const p = GRIND.parseDial($("#param-molette").value.trim().replace(/,/g, "."));
    $("#param-molette-detail").textContent = p
      ? I18N.t("param_molette_detail", { c: p.crans, m: Math.round(p.microns) })
      : "";
  }

  // The fields of the "My correction steps" card and their settings column.
  const STEP_FIELDS = [["param-pas-crans", "pas_crans"], ["param-pas-degres", "pas_degres"],
    ["param-pas-feu", "pas_feu"], ["param-pas-eau", "pas_eau_g"], ["param-pas-dose", "pas_dose_g"]];

  async function enregistrerParametres() {
    const dose = Number($("#param-dose-defaut").value);
    const heat = Number($("#param-feu-defaut").value);
    const dial = $("#param-molette").value.trim().replace(/,/g, ".");
    if (!(dose > 0)) { toast(I18N.t("t_param_dose")); return; }
    if (!(heat >= 1 && heat <= 10)) { toast(I18N.t("t_param_feu")); return; }
    if (!GRIND.parseDial(dial)) { toast(I18N.t("t_mouture_invalide")); return; }
    const boilTime = UI.lireDuree("param-ebullition");
    if (boilTime === "" || !(boilTime >= 30 && boilTime <= 1800)) { toast(I18N.t("t_param_ebullition")); return; }
    // The first bubbles come BEFORE the rolling boil, otherwise the curve makes no sense.
    const bubblesTime = UI.lireDuree("param-bulles");
    if (bubblesTime === "" || !(bubblesTime >= 10 && bubblesTime < boilTime)) { toast(I18N.t("t_param_bulles")); return; }
    replis.dose = dose;
    replis.feu = Math.round(heat);
    replis.molette = dial;
    replis.ebullition = boilTime;
    replis.bulles = bubblesTime;
    /* Correction steps: an out-of-range value is not refused, normalisation
       brings it back to the default, as for a recipe's heat. */
    replis.pas = Object.fromEntries(STEP_FIELDS.map(([id, cle]) => [cle, Number($("#" + id).value)]));
    await ecrireReplis();
    UI.chargerReplis();

    /* Only recipes actually touched are rewritten: each write stamps maj_le
       and would win the merge against another device. */
    let touched = 0;
    for (const tr of $$("[data-param-recette]")) {
      const r = DATA.state.recettes.find(x => x.id === tr.dataset.paramRecette);
      if (!r) continue;
      const vals = {};
      tr.querySelectorAll("[data-champ]").forEach(i => { vals[i.dataset.champ] = i.value.trim(); });
      const changed =
        String(r.dose || "") !== vals.dose ||
        String(r.eau || "") !== vals.eau ||
        String(r.temp === "" ? "" : r.temp) !== vals.temp ||
        String(r.dial || "") !== vals.dial ||
        (r.methode === "Brikka" && String(r.puissance_feu || "") !== vals.puissance_feu);
      if (!changed) continue;
      if (vals.dial && !GRIND.parseDial(vals.dial.replace(/,/g, "."))) { toast(I18N.t("t_mouture_invalide")); return; }
      // The table only shows these fields: we start from the whole recipe so
      // nothing is lost along the way (steps, text, associated coffees…).
      await DATA.modifierRecette(r.id, {
        ...r,
        dose: vals.dose,
        eau: vals.eau,
        temp: vals.temp,
        dial: vals.dial.replace(/,/g, "."),
        puissance_feu: r.methode === "Brikka" ? vals.puissance_feu : "",
        // The displayed text followed the old target, it becomes wrong without this.
        tempTexte: vals.temp ? vals.temp + " °C" : (r.methode === "Brikka" ? I18N.t("param_temp_feu") : ""),
      });
      touched++;
    }
    rendreParametres();
    UI.remplirSelectRecettes();
    toast(touched ? I18N.t("t_param_ok", { n: touched }) : I18N.t("t_param_replis"));
  }

  // Made available to the other screens.
  /* Wiring of the coffee, bag and recipe modals and of the Settings screen.
     Called once by app.js. */
  function cablerCatalogue() {
    /* The two header shortcuts disappeared along with the header (Comptoir
       redesign, step 2). The modals stay reachable where they are needed:
       #btn-gerer-cafes on the Entry screen, #btn-gerer-recettes in the Guide.
       Those two buttons still exist and are wired by their screens. */

    // Coffee: form, and bags
    $("#cafe-nouveau").addEventListener("click", () => ouvrirFormCafe(null));
    $("#cafe-annuler").addEventListener("click", () => { $("#form-cafe").hidden = true; });
    $("#form-cafe").addEventListener("submit", enregistrerCafe);
    $("#form-sachet").addEventListener("submit", enregistrerSachet);
    $("#sachet-annuler").addEventListener("click", fermerFormSachet);

    // Recipes: form
    $("#recette-nouvelle").addEventListener("click", () => ouvrirFormRecette(null));
    $("#recette-annuler").addEventListener("click", () => { $("#form-recette").hidden = true; });
    $("#form-recette").addEventListener("submit", enregistrerRecette);
    $("#recette-retablir").addEventListener("click", retablirRecetteCourante);
    $("#recette-supprimer").addEventListener("click", supprimerRecetteCourante);

    // Settings
    $("#param-enregistrer").addEventListener("click", enregistrerParametres);
    $("#param-annuler").addEventListener("click", rendreParametres);
    $$(".param-index [data-section]").forEach(b => b.addEventListener("click", () => showSettingsSection(b.dataset.section, true)));
    $(".param-index [data-ouvre-donnees]").addEventListener("click", () => $("#btn-donnees").click());
    $("#param-retour").addEventListener("click", () => $("#param-corps").classList.remove("ouverte"));
    $("#param-molette").addEventListener("input", majDetailMolette);
    // The Settings checkbox and the stopwatch one drive the same setting.
    $("#param-bips").addEventListener("change", () => {
      $("#chrono-bip").checked = $("#param-bips").checked;
      $("#chrono-bip").dispatchEvent(new Event("change"));
    });
    /* The dashboard redraws itself on the next visit to the screen: that is
       where the toggle changes what the numbers say. */
    $("#param-ratees").addEventListener("change", () => {
      basculerRatees($("#param-ratees").checked);
      majRatees();
    });
  }

  Object.assign(UI, {
    cablerCatalogue, coutParTasse, enregistrerCafe, enregistrerParametres, enregistrerRecette,
    majRatees,
    enregistrerSachet, fermerFormSachet, lireFormRecette, majDetailMolette, ouvrirFormCafe,
    ouvrirFormRecette, ouvrirFormSachet, ouvrirModaleCafes, ouvrirModaleRecettes,
    rendreListeCafes, rendreListeRecettes, rendreParametres,
    retablirRecetteCourante, supprimerRecetteCourante,
  });
})();
