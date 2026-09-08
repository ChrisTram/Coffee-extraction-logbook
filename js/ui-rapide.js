/* Saisie rapide : le panneau qui flotte par-dessus tous les écrans.
 *
 * Trois gestes, café, recette, note, et la tasse est enregistrée avec les
 * valeurs de la recette. Séparé de l'écran de saisie parce qu'il n'en partage
 * ni l'état (pas de brouillon, pas de chrono, pas d'édition) ni le formulaire :
 * il ne lui emprunte que la liste des cafés sélectionnables, par UI. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, activerEcran, maintenantLocal, recettesDeMethode, replis, toast, trouverRecette } = UI;

  let rapideOuvert = false;

  // Le câblage a besoin de savoir si le panneau est ouvert, pas de pouvoir
  // l'ouvrir en écrivant dans une variable.
  function rapideEstOuvert() { return rapideOuvert; }

  function basculerRapide(forcer) {
    rapideOuvert = forcer !== undefined ? forcer : !rapideOuvert;
    $("#panneau-rapide").classList.toggle("ouvert", rapideOuvert);
    $("#fab-rapide").classList.toggle("ouvert", rapideOuvert);
    if (rapideEstOuvert()) majPanneauRapide();
  }

  function majPanneauRapide() {
    const selCafe = $("#q-cafe");
    const v = selCafe.value;
    const cafes = UI.cafesSelectionnables();
    selCafe.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      cafes.map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("");
    if (v && cafes.some(c => c.id === v)) selCafe.value = v;
    /* Même défaut que le formulaire complet : le panneau rapide REFUSE
       d'enregistrer sans café, donc l'ouvrir sur un champ vide garantissait un
       aller-retour. On ne préremplit que si rien n'est déjà choisi, pour ne pas
       écraser une sélection en cours. */
    if (!selCafe.value && cafes[0]) selCafe.value = cafes[0].id;
    // Chaque ouverture repart SANS note : on note après avoir bu.
    $("#q-note-vide").checked = true;
    majAffichageNoteRapide();
    majRecettesRapide();
  }

  /* Même règle que le formulaire complet : une note vide s'affiche comme telle,
     et le curseur se grise pour ne pas avoir l'air de proposer une valeur. */
  function majAffichageNoteRapide() {
    const vide = $("#q-note-vide").checked;
    $("#q-note-affichee").textContent = vide ? I18N.t("n_pas_notee") : $("#q-note").value;
    $("#q-note").classList.toggle("curseur-inactif", vide);
  }

  function noteRapide() {
    return $("#q-note-vide").checked ? "" : $("#q-note").value;
  }

  function majRecettesRapide() {
    const sel = $("#q-recette");
    const v = sel.value;
    const groupes = ["Brikka", "Switch"].map(m => {
      const liste = recettesDeMethode(m);
      if (!liste.length) return "";
      return '<optgroup label="' + m + '">' +
        liste.map(r => "<option>" + r.nom + "</option>").join("") + "</optgroup>";
    }).join("");
    sel.innerHTML = groupes;
    if (v && trouverRecette(v)) sel.value = v;
    majAvertRapide();
  }

  function surChoixCafeRapide() {
    const cafe = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    if (cafe) {
      const r = trouverRecette(cafe.recette_recommandee);
      if (r && r.actif !== 0) $("#q-recette").value = r.nom;
    }
    majAvertRapide();
  }

  function majAvertRapide() {
    const cafe = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    const r = trouverRecette($("#q-recette").value);
    const av = r ? avertissementsCombinaison(cafe, r.methode, r.nom, DATA.state.recettes) : { msgs: [] };
    $("#q-avert").textContent = av.msgs.length ? "⚠ " + av.msgs[0] : "";
  }

  async function enregistrerRapide() {
    const cafeId = $("#q-cafe").value;
    const r = trouverRecette($("#q-recette").value);
    if (!cafeId) { toast(I18N.t("t_choisis_cafe")); return; }
    if (!r) { toast(I18N.t("t_choisis_recette")); return; }
    // Le café choisi dans le panneau. Un café déjà moulu n'a pas de réglage de
    // molette à enregistrer : la valeur de la recette serait une invention.
    const cafeQ = DATA.state.cafes.find(c => c.id === cafeId);
    await DATA.ajouterExtraction({
      date_heure: maintenantLocal(),
      cafe_id: cafeId,
      methode: r.methode,
      recette: r.nom,
      dose_g: r.dose || replis.dose,
      eau_g: r.eau,
      mouture_dial: cafeQ && Number(cafeQ.deja_moulu) === 1 ? "" : r.dial,
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
    const note = noteRapide();
    toast(note === "" ? I18N.t("t_rapide_sans_note", { r: r.nom }) : I18N.t("t_rapide", { r: r.nom, n: note }));
    basculerRapide(false);
  }

  /* Câblage du panneau. Appelé une fois par app.js, au démarrage. */
  function cablerRapide() {
    $("#fab-rapide").addEventListener("click", () => basculerRapide());
    $("#q-fermer").addEventListener("click", () => basculerRapide(false));
    $("#q-cafe").addEventListener("change", surChoixCafeRapide);
    $("#q-recette").addEventListener("change", majAvertRapide);
    /* pointerdown en plus d'input, comme sur le formulaire complet : poser le
       doigt sur le curseur là où il est déjà ne déclenche aucun input. */
    ["input", "pointerdown", "keydown"].forEach(ev =>
      $("#q-note").addEventListener(ev, () => {
        $("#q-note-vide").checked = false;
        majAffichageNoteRapide();
      }));
    $("#q-note-vide").addEventListener("change", majAffichageNoteRapide);
    $("#q-enregistrer").addEventListener("click", enregistrerRapide);
    $("#q-complet").addEventListener("click", () => { basculerRapide(false); activerEcran("saisie"); });
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    basculerRapide, cablerRapide, enregistrerRapide, majAffichageNoteRapide, majAvertRapide,
    majPanneauRapide, majRecettesRapide, noteRapide, rapideEstOuvert, surChoixCafeRapide,
  });
})();
