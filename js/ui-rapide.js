/* Saisie rapide : le panneau qui flotte par-dessus tous les écrans.
 *
 * Trois gestes, café, recette, note, et la tasse est enregistrée avec les
 * valeurs de la recette. Séparé de l'écran de saisie parce qu'il n'en partage
 * ni l'état (pas de brouillon, pas de chrono, pas d'édition) ni le formulaire :
 * il ne lui emprunte que la liste des cafés sélectionnables, par UI. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, activerEcran, brancherNote, maintenantLocal, marquerNote, noteVide, peindreCurseur, recettesDeMethode, replis, toast, trouverRecette, unSeulALaFois } = UI;

  let rapideOuvert = false;

  // Le câblage a besoin de savoir si le panneau est ouvert, pas de pouvoir
  // l'ouvrir en écrivant dans une variable.
  function rapideEstOuvert() { return rapideOuvert; }

  function basculerRapide(forcer) {
    rapideOuvert = forcer !== undefined ? forcer : !rapideOuvert;
    $("#panneau-rapide").classList.toggle("ouvert", rapideOuvert);
    $("#fab-rapide").classList.toggle("ouvert", rapideOuvert);
    /* Le voile ne sert pas qu'a assombrir : il donne une cible de fermeture de
       la taille de l'ecran, ce qu'une croix de 30 px ne fait pas au pouce. */
    $("#voile-rapide").hidden = !rapideOuvert;
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
    $("#q-note").value = 5;
    marquerNote($("#q-note"), true);
    /* L'heure de l'enregistrement, affichee parce qu'elle n'est pas modifiable
       ici : la feuille enregistre MAINTENANT, autant le montrer. */
    $("#q-quand").textContent = I18N.t("q_maintenant", {
      h: new Date().toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
    });
    majAffichageNoteRapide();
    majRecettesRapide();
    majReprisRapide();
  }

  /* Même règle que le formulaire complet : pas de pouce tant qu'on n'a pas
     touché, et une note vide s'affiche comme telle. */
  function majAffichageNoteRapide() {
    const curseur = $("#q-note");
    const vide = noteVide(curseur);
    const dit = vide ? I18N.t("n_pas_notee") : curseur.value + " / 10";
    $("#q-note-affichee").textContent = dit;
    curseur.setAttribute("aria-valuetext", dit);
    $("#q-note-aide").hidden = !vide;
    $("#q-note-effacer").hidden = vide;
    peindreCurseur(curseur);
  }

  function noteRapide() {
    return noteVide($("#q-note")) ? "" : $("#q-note").value;
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
    majReprisRapide();
  }

  /* CE QUE LA RECETTE IMPOSE, en chiffres. La feuille n'a que trois champs et
     enregistre tout le reste depuis la recette : sans cette ligne il fallait
     connaitre la recette par coeur pour savoir ce qu'on venait d'ecrire. La
     pastille de machine est la aussi, c'est le seul endroit ou la methode se
     voit dans cette feuille. */
  function majReprisRapide() {
    const r = trouverRecette($("#q-recette").value);
    const cible = $("#q-repris");
    if (!r) { cible.innerHTML = ""; return; }
    const bouts = [];
    if (r.dose) bouts.push(r.dose + " g");
    if (r.eau) bouts.push(r.eau + " g");
    if (r.dial) bouts.push(I18N.t("molette") + " " + r.dial);
    cible.innerHTML =
      '<span class="pastille-methode ' + String(r.methode).toLowerCase() + '"></span>' +
      "<span>" + (bouts.length ? I18N.t("q_repris", { v: bouts.join(", ") }) : I18N.tr(r.methode)) + "</span>";
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
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    basculerRapide, cablerRapide, enregistrerRapide, majAffichageNoteRapide, majAvertRapide,
    majReprisRapide,
    majPanneauRapide, majRecettesRapide, noteRapide, rapideEstOuvert, surChoixCafeRapide,
  });
})();
