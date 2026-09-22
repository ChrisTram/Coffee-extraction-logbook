/* Brouillon de saisie : ce que le formulaire contenait quand la page a été
 * déchargée, remis en place au démarrage.
 *
 * Fichier à part depuis la v7.93 : il ne partage avec l'écran de saisie que
 * l'objet `saisie` et les identifiants de champs, et il l'appelle par UI. Il
 * se charge APRÈS ui-saisie.js pour emprunter `saisie`, qui est un objet muté
 * en place, donc sûr à emprunter. */
"use strict";

(() => {

  // Emprunté au noyau, et l'état de la saisie, exposé par ui-saisie.js.
  const { $, $$, basculerEtat, saisie } = UI;

  /* ---------- Brouillon de saisie ----------
     Sur téléphone, quitter l'onglet pendant une extraction suffit à ce que le
     navigateur décharge la page pour récupérer de la mémoire. Sans brouillon,
     tout ce qui était tapé disparaît, et c'est justement pendant l'extraction
     qu'on sort de l'appli.

     Volontairement en localStorage et PAS dans les données synchronisées : un
     brouillon est propre à un appareil, l'envoyer sur le serveur ferait
     apparaître une saisie fantôme sur l'autre. */
  const CLE_BROUILLON = "brouillon-saisie";
  const BROUILLON_MAX_MS = 24 * 60 * 60 * 1000;
  /* La DATE du brouillon a sa propre durée de validité, bien plus courte. Le
     brouillon existe pour survivre au déchargement de la page pendant une
     extraction, ce qui se compte en minutes ; garder son horodatage 24 h faisait
     réapparaître la date de la veille sur une saisie neuve. Deux heures couvrent
     largement une séance, interruptions comprises. */
  const DATE_BROUILLON_MAX_MS = 2 * 60 * 60 * 1000;
  const CHAMPS_BROUILLON = [
    "f-date", "f-cafe", "f-recette", "f-dose", "f-eau", "f-mouture", "f-temp",
    "f-chauffe-min", "f-chauffe-sec",
    "f-volume", "f-eau-ajoutee", "f-lait", "f-agitation", "f-tasse", "f-note",
    "f-commentaire", "f-total-min", "f-total-sec", "f-ecoulement-min", "f-ecoulement-sec",
    "f-puissance",
  ];
  const CASES_BROUILLON = ["f-prechauffe", "f-ajout-eau-oui"];
  let brouillonMinuteur = null;

  function ecrireBrouillon() {
    // On ne sauvegarde JAMAIS pendant l'édition d'une extraction existante :
    // le brouillon écraserait le formulaire au prochain démarrage avec des
    // valeurs qui appartiennent à une ligne déjà enregistrée.
    if (saisie.editId) return;
    const valeurs = {};
    CHAMPS_BROUILLON.forEach(id => { const el = $("#" + id); if (el) valeurs[id] = el.value; });
    CASES_BROUILLON.forEach(id => { const el = $("#" + id); if (el) valeurs[id] = el.checked; });
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify({
        le: Date.now(),
        methode: saisie.methode,
        diagnostics: [...saisie.diagnostics],
        descripteurs: [...saisie.descripteurs],
        valeurs,
      }));
    } catch (e) { /* stockage plein ou refusé, tant pis */ }
  }

  function planifierBrouillon() {
    clearTimeout(brouillonMinuteur);
    brouillonMinuteur = setTimeout(ecrireBrouillon, 400);
  }

  function effacerBrouillon() {
    clearTimeout(brouillonMinuteur);
    try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* tant pis */ }
  }

  /* Ne restaure que si le brouillon dit quelque chose : sans ce test, le
     formulaire vierge sauvegardé au premier chargement déclencherait un message
     "brouillon repris" à chaque ouverture, ce qui serait absurde. */
  function brouillonUtile(b) {
    const v = b.valeurs || {};
    return Boolean(v["f-cafe"] || (v["f-commentaire"] || "").trim() ||
      b.diagnostics.length || b.descripteurs.length ||
      v["f-total-min"] || v["f-total-sec"] || v["f-volume"] || v["f-eau"]);
  }

  function restaurerBrouillon() {
    let b;
    try { b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || "null"); } catch (e) { return false; }
    if (!b || !b.valeurs) return false;
    if (Date.now() - (b.le || 0) > BROUILLON_MAX_MS) { effacerBrouillon(); return false; }
    if (!brouillonUtile(b)) return false;

    /* SANS garderRecette (v8.37) : avec, la méthode du brouillon s'appliquait
       mais la liste des recettes restait celle de la méthode d'avant. Une
       recette Switch posée dans un menu de recettes Brikka n'existe pas, et le
       navigateur laissait le menu VIDE. Chris arrivait alors sur la saisie sans
       recette, à chaque fois qu'il avait brassé au Switch la veille. */
    if (b.methode) UI.choisirMethode(b.methode);
    const dateFraiche = Date.now() - (b.le || 0) <= DATE_BROUILLON_MAX_MS;
    Object.entries(b.valeurs).forEach(([id, valeur]) => {
      // Une date périmée ne remplace pas l'heure qu'il est.
      if (id === "f-date" && !dateFraiche) return;
      const el = $("#" + id);
      if (el && valeur !== undefined && valeur !== null) el.value = valeur;
    });
    /* Une date reprise d'un brouillon frais vient de Chris, pas d'un défaut :
       l'arrivée sur l'écran ne doit donc pas la remplacer. */
    if (dateFraiche && b.valeurs["f-date"]) saisie.dateTouchee = true;
    CASES_BROUILLON.forEach(id => { const el = $("#" + id); if (el) el.checked = !!b.valeurs[id]; });

    /* JAMAIS de café ni de recette vides après une reprise : un brouillon peut
       garder un café désactivé depuis, une recette renommée ou supprimée, ou
       une valeur vide. On retombe alors sur le premier café et la première
       recette de la méthode, comme sur un formulaire neuf : la plupart du
       temps c'est celle que Chris garde, et c'est un clic de moins. */
    if (!$("#f-cafe").value) {
      const premier = UI.cafesSelectionnables()[0];
      if (premier) $("#f-cafe").value = premier.id;
    }
    // Sans prefillDepuisRecette : il écraserait la dose et l'eau du brouillon.
    if (!$("#f-recette").value) UI.remplirSelectRecettes();

    saisie.diagnostics = new Set(b.diagnostics || []);
    saisie.descripteurs = new Set(b.descripteurs || []);
    $$("#f-diagnostic .pilule").forEach(x => basculerEtat(x, saisie.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => basculerEtat(x, saisie.descripteurs.has(x.dataset.tag)));

    /* PAR LA FONCTION OFFICIELLE, pas a la main. Cette ligne ecrivait
        directement la valeur du champ, en ignorant « pas encore notee » : apres
        la reprise d'un brouillon non note, l'ecran annoncait « 5 » sur une tasse
        que l'enregistrement allait ranger comme NON NOTEE. Le curseur etant lui
        aussi pose sur 5, rien ne trahissait l'ecart. Elle oubliait aussi le
        « / 10 » et l'etat inactif du stepper. */
     UI.majAffichageNote();
    $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
    UI.majCorrectionDiagnostic();
    UI.majAvertissements();
    UI.majLive();
    UI.majAsideSaisie();
    return true;
  }

  // Mis à disposition de la saisie (câblage, enregistrement) et d'app.js (démarrage).
  Object.assign(UI, {
    BROUILLON_MAX_MS, CASES_BROUILLON, CHAMPS_BROUILLON, CLE_BROUILLON, DATE_BROUILLON_MAX_MS,
    brouillonUtile, ecrireBrouillon, effacerBrouillon, planifierBrouillon, restaurerBrouillon,
  });
})();
