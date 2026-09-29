/* Quick entry: the panel that floats above every screen.
 *
 * Three gestures, coffee, recipe, rating, and the cup is saved with the
 * recipe's values. Kept apart from the entry screen because it shares neither
 * its state (no draft, no timer, no editing) nor its form: the only thing it
 * borrows is the list of selectable coffees, through UI. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, activerEcran, brancherNote, maintenantLocal, marquerNote, noteVide, peindreCurseur, recettesDeMethode, replis, toast, trouverRecette, unSeulALaFois } = UI;

  let quickOpen = false;

  // The wiring needs to know whether the panel is open, not to be able to
  // open it by writing to a variable.
  function rapideEstOuvert() { return quickOpen; }

  function basculerRapide(force) {
    quickOpen = force !== undefined ? force : !quickOpen;
    $("#panneau-rapide").classList.toggle("ouvert", quickOpen);
    $("#fab-rapide").classList.toggle("ouvert", quickOpen);
    /* The veil is not only there to darken: it gives a screen-sized close
       target, which a 30 px cross does not do for a thumb. */
    $("#voile-rapide").hidden = !quickOpen;
    if (rapideEstOuvert()) majPanneauRapide();
  }

  function majPanneauRapide() {
    const coffeeSelect = $("#q-cafe");
    const v = coffeeSelect.value;
    const coffees = UI.cafesSelectionnables();
    coffeeSelect.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      coffees.map(c => '<option value="' + OUTILS.echap(c.id) + '">' + OUTILS.echap(c.nom) + "</option>").join("");
    if (v && coffees.some(c => c.id === v)) coffeeSelect.value = v;
    /* Same default as the full form: the quick panel REFUSES to save without
       a coffee, so opening it on an empty field guaranteed a round trip. We
       only prefill when nothing is chosen yet, so as not to overwrite a
       selection in progress. */
    if (!coffeeSelect.value && coffees[0]) coffeeSelect.value = coffees[0].id;
    // Every opening starts WITHOUT a rating: you rate after drinking.
    $("#q-note").value = 5;
    marquerNote($("#q-note"), true);
    /* The save time, shown because it cannot be edited here: the sheet saves
       NOW, might as well say so. */
    $("#q-quand").textContent = I18N.t("q_maintenant", {
      h: new Date().toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
    });
    majAffichageNoteRapide();
    majRecettesRapide();
    majReprisRapide();
  }

  /* Same rule as the full form: no thumb until it has been touched, and an
     empty rating shows as such. */
  function majAffichageNoteRapide() {
    const slider = $("#q-note");
    const empty = noteVide(slider);
    const shown = empty ? I18N.t("n_pas_notee") : slider.value + " / 10";
    $("#q-note-affichee").textContent = shown;
    slider.setAttribute("aria-valuetext", shown);
    $("#q-note-aide").hidden = !empty;
    $("#q-note-effacer").hidden = empty;
    peindreCurseur(slider);
  }

  function noteRapide() {
    return noteVide($("#q-note")) ? "" : $("#q-note").value;
  }

  function majRecettesRapide() {
    const sel = $("#q-recette");
    const v = sel.value;
    const groups = ["Brikka", "Switch"].map(m => {
      const list = recettesDeMethode(m);
      if (!list.length) return "";
      return '<optgroup label="' + m + '">' +
        list.map(r => "<option>" + r.nom + "</option>").join("") + "</optgroup>";
    }).join("");
    sel.innerHTML = groups;
    if (v && trouverRecette(v)) sel.value = v;
    majAvertRapide();
  }

  function surChoixCafeRapide() {
    const coffee = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    if (coffee) {
      const r = trouverRecette(coffee.recette_recommandee);
      if (r && r.actif !== 0) $("#q-recette").value = r.nom;
    }
    majAvertRapide();
  }

  function majAvertRapide() {
    const coffee = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    const r = trouverRecette($("#q-recette").value);
    const warn = r ? avertissementsCombinaison(coffee, r.methode, r.nom, DATA.state.recettes) : { msgs: [] };
    $("#q-avert").textContent = warn.msgs.length ? "⚠ " + warn.msgs[0] : "";
    majReprisRapide();
  }

  /* WHAT THE RECIPE IMPOSES, in numbers. The sheet has only three fields and
     saves everything else from the recipe: without this line you had to know
     the recipe by heart to know what you had just written. The machine dot is
     here too, it is the only place the method shows in this sheet. */
  function majReprisRapide() {
    const r = trouverRecette($("#q-recette").value);
    const target = $("#q-repris");
    if (!r) { target.innerHTML = ""; return; }
    const parts = [];
    if (r.dose) parts.push(r.dose + " g");
    if (r.eau) parts.push(r.eau + " g");
    if (r.dial) parts.push(I18N.t("molette") + " " + r.dial);
    target.innerHTML =
      '<span class="pastille-methode ' + String(r.methode).toLowerCase() + '"></span>' +
      "<span>" + (parts.length ? I18N.t("q_repris", { v: parts.join(", ") }) : I18N.tr(r.methode)) + "</span>";
  }

  async function enregistrerRapide() {
    const coffeeId = $("#q-cafe").value;
    const r = trouverRecette($("#q-recette").value);
    if (!coffeeId) { toast(I18N.t("t_choisis_cafe")); return; }
    if (!r) { toast(I18N.t("t_choisis_recette")); return; }
    // The coffee chosen in the panel. A pre-ground coffee has no grinder
    // setting to save: the recipe's value would be made up.
    const quickCoffee = DATA.state.cafes.find(c => c.id === coffeeId);
    await DATA.ajouterExtraction({
      date_heure: maintenantLocal(),
      cafe_id: coffeeId,
      methode: r.methode,
      recette: r.nom,
      dose_g: r.dose || replis.dose,
      eau_g: r.eau,
      mouture_dial: quickCoffee && Number(quickCoffee.deja_moulu) === 1 ? "" : r.dial,
      temperature_c: r.temp,
      temps_total_s: "",
      temps_ecoulement_s: "",
      volume_extrait_ml: "",
      tasse: (DATA.state.tasses.find(t => t.nom === (r.methode === "Brikka" ? "Loveramics Flat White Egg" : "Classic Mug")) || { nom: "" }).nom,
      note_sur_10: noteRapide(),
      diagnostic: "",
      descripteurs: "",
      commentaire: "",
    });
    const rating = noteRapide();
    toast(rating === "" ? I18N.t("t_rapide_sans_note", { r: r.nom }) : I18N.t("t_rapide", { r: r.nom, n: rating }));
    basculerRapide(false);
  }

  /* Panel wiring. Called once by app.js, at startup. */
  function cablerRapide() {
    $("#fab-rapide").addEventListener("click", () => basculerRapide());
    $("#q-fermer").addEventListener("click", () => basculerRapide(false));
    $("#q-cafe").addEventListener("change", surChoixCafeRapide);
    $("#q-recette").addEventListener("change", majAvertRapide);
    $("#voile-rapide").addEventListener("click", () => basculerRapide(false));
    brancherNote($("#q-note"), majAffichageNoteRapide);
    $("#q-note-effacer").addEventListener("click", () => {
      $("#q-note").value = 5;
      marquerNote($("#q-note"), true);
      majAffichageNoteRapide();
      $("#q-note").focus();
    });
    $("#q-enregistrer").addEventListener("click", unSeulALaFois(enregistrerRapide));
    $("#q-complet").addEventListener("click", () => { basculerRapide(false); activerEcran("saisie"); });

    /* A9 (v8.88): THE BUTTON STEPS ASIDE WHEN YOU SCROLL DOWN. Sitting at the
       bottom right, it hid the end of the comments and a column of the last
       cup. It leaves when you scroll down, comes back as soon as you scroll
       up, and stays put while its panel is open. Eight pixels of slack: a
       shaky finger does not make it flicker. */
    const fab = $("#fab-rapide");
    // Two reads and a class: no need to wait for a frame, the work is too light.
    let lastY = window.scrollY;
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      if (quickOpen || y < 120) fab.classList.remove("fab-cache");
      else if (y > lastY + 8) fab.classList.add("fab-cache");
      else if (y < lastY - 8) fab.classList.remove("fab-cache");
      if (Math.abs(y - lastY) > 8) lastY = y;
    }, { passive: true });
  }

  // Made available to the other screens.
  Object.assign(UI, {
    basculerRapide, cablerRapide, enregistrerRapide, majAffichageNoteRapide, majAvertRapide,
    majReprisRapide,
    majPanneauRapide, majRecettesRapide, noteRapide, rapideEstOuvert, surChoixCafeRapide,
  });
})();
