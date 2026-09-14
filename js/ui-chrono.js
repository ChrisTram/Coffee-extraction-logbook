/* Chronomètre de l'écran Saisie, et rien d'autre.
 *
 * Sorti de js/ui-saisie.js quand celui-ci a dépassé le plafond de 1 200 lignes.
 * La couture est nette : le chrono a son propre état, son propre verrou d'écran,
 * ses propres paliers de recette, et il est devenu un widget repliable distinct
 * à l'écran. Il est chargé APRÈS ui-saisie.js, dont il emprunte quelques outils.
 *
 * Il parle au reste par UI. : le formulaire lui demande de se replier, il écrit
 * les temps dans les champs du formulaire par identifiant. */
"use strict";

(() => {

  // Emprunté au noyau et à la saisie, tous deux chargés avant nous.
  const { $, $f, ecrireDuree, fmtTemps, toast, trouverRecette } = UI;

  // Chronomètre unique : Démarrer, Pause, Reprendre, Arrêter, Reset.
  // Les paliers viennent de la recette sélectionnée, avec bip discret à chacun.
  // L'écoulement se déduit : du palier "ouvrir" à l'arrêt du chrono.
  const chrono = { etat: "arrete", accumule: 0, departTs: null, interval: null, passes: new Set() };
  let audioCtx = null;

  // Verrou d'écran pendant le chrono : l'écran du téléphone ne doit pas se
  // verrouiller au milieu d'une extraction, les mains sont mouillées.
  // L'API n'existe qu'en contexte sécurisé (https), donc PAS en file:// : on
  // échoue en silence, ce n'est pas une fonction critique. Le système relâche
  // le verrou dès que l'onglet passe en arrière plan, d'où la reprise sur
  // visibilitychange.
  let screenWakeLock = null;

  async function acquireWakeLock() {
    if (screenWakeLock || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { if (screenWakeLock === lock) screenWakeLock = null; });
      screenWakeLock = lock;
    } catch (e) { /* refusé, ou onglet caché : tant pis */ }
  }

  function releaseWakeLock() {
    if (!screenWakeLock) return;
    const lock = screenWakeLock;
    screenWakeLock = null;
    lock.release().catch(() => { /* déjà relâché */ });
  }

  // Un seul point de vérité : le verrou suit l'état du chrono.
  function syncWakeLock() {
    if (chrono.etat === "encours") acquireWakeLock();
    else releaseWakeLock();
  }

  function chronoEcoule() {
    return (chrono.accumule + (chrono.etat === "encours" ? Date.now() - chrono.departTs : 0)) / 1000;
  }

  function paliersCourants() {
    const r = trouverRecette($("#f-recette").value);
    if (!r) return [];
    return UI.etapesPour(r).filter(e => e.t !== null && e.t !== undefined);
  }

  function tOuverture() {
    const pal = paliersCourants().find(e => /ouvr|open/i.test(e.texte));
    return pal ? pal.t : null;
  }

  function jouerBip() {
    if (!$("#chrono-bip").checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.3);
    } catch (e) { /* audio indisponible */ }
  }

  function majEtapesChrono(avecBips) {
    const s = chronoEcoule();
    const paliers = paliersCourants();
    const zone = $("#chrono-etapes");
    if (!paliers.length) { zone.hidden = true; return; }
    zone.hidden = false;
    let courante = null, suivante = null;
    paliers.forEach(pal => { if (pal.t <= s) courante = pal; else if (!suivante) suivante = pal; });
    const texteCourant = courante
      ? fmtTemps(courante.t) + " · " + courante.texte
      : I18N.t("ch_pret");
    $("#chrono-courante").textContent = texteCourant;
    /* Le meme palier dans l'entete, pour qu'il se lise SANS deplier : sur
       telephone le chrono est un bandeau replie colle en haut, et un bandeau qui
       ne dit pas ou on en est ne fait que prendre de la place. Vide quand le
       chrono ne tourne pas, sinon il annoncerait un palier qui n'a pas commence. */
    const court = $("#chrono-palier-court");
    if (court) court.textContent = chrono.etat === "arrete" ? "" : texteCourant;
    if (suivante) {
      $("#chrono-suivante").textContent = I18N.t("ch_suivante", {
        t: fmtTemps(suivante.t), d: Math.max(0, Math.ceil(suivante.t - s)), texte: suivante.texte,
      });
    } else {
      $("#chrono-suivante").textContent = courante ? I18N.t("ch_derniere") : "";
    }
    if (avecBips && chrono.etat === "encours") {
      paliers.forEach(pal => {
        if (pal.t > 0 && pal.t <= s && !chrono.passes.has(pal.t)) {
          chrono.passes.add(pal.t);
          jouerBip();
        }
      });
    }
  }

  function chronoTic() {
    $("#chrono-total").textContent = fmtTemps(Math.floor(chronoEcoule()));
    majEtapesChrono(true);
  }

  function majBoutonsChrono() {
    const b = $("#btn-chrono");
    if (chrono.etat === "arrete") b.textContent = I18N.t("ch_demarrer");
    else if (chrono.etat === "encours") b.textContent = I18N.t("ch_pause");
    else b.textContent = I18N.t("ch_reprendre");
    $("#btn-chrono-stop").hidden = chrono.etat === "arrete";
    $("#btn-chrono-raz").hidden = chrono.etat === "arrete" && chronoEcoule() === 0;
    $(".chrono").classList.toggle("en-cours", chrono.etat === "encours");
    // Appelée à chaque transition du chrono, c'est le bon endroit pour aligner
    // le verrou d'écran sans risque d'oubli dans une branche.
    syncWakeLock();
  }

  function chronoPrincipal() {
    if (chrono.etat === "arrete") {
      chrono.accumule = 0;
      chrono.passes.clear();
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    } else if (chrono.etat === "encours") {
      chrono.accumule += Date.now() - chrono.departTs;
      chrono.etat = "pause";
      clearInterval(chrono.interval);
    } else {
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    }
    majBoutonsChrono();
  }

  function chronoArreter() {
    if (chrono.etat === "arrete") return;
    if (chrono.etat === "encours") chrono.accumule += Date.now() - chrono.departTs;
    clearInterval(chrono.interval);
    const total = Math.round(chrono.accumule / 1000);
    chrono.etat = "arrete";
    ecrireDuree("f-total", total);
    const tOuv = tOuverture();
    if (tOuv !== null && total > tOuv) ecrireDuree("f-ecoulement", total - tOuv);
    majBoutonsChrono();
    toast(I18N.t("t_temps"));
  }

  function chronoRaz() {
    clearInterval(chrono.interval);
    chrono.etat = "arrete";
    chrono.accumule = 0;
    chrono.departTs = null;
    chrono.passes.clear();
    $("#chrono-total").textContent = "0:00";
    majEtapesChrono(false);
    majBoutonsChrono();
  }
  /* LE CHRONO REPLIABLE.

     Il vit sous la fiche recette, replie, parce qu'il ne sert que pendant
     l'extraction alors que la recette se relit a chaque etape.

     Deux regles. Le temps reste lisible replie : c'est l'entete qui le porte,
     un chrono qu'il faut deplier pour lire ne sert a rien. Et il s'ouvre tout
     seul au demarrage et refuse de se replier tant qu'il tourne : se refermer
     sur un chrono en marche, c'est perdre les paliers et le bouton d'arret au
     moment precis ou on en a besoin. */
  function chronoTourne() {
    return !$("#btn-chrono-stop").hidden;
  }

  function basculerChrono(ouvrir) {
    const corps = $("#chrono-corps");
    if (!corps) return;
    const veut = ouvrir === undefined ? corps.hidden : ouvrir;
    /* On ne referme pas un chrono en marche. */
    const etat = !veut && chronoTourne() ? true : veut;
    corps.hidden = !etat;
    $("#chrono-widget").classList.toggle("ouvert", etat);
    $("#chrono-basculer").setAttribute("aria-expanded", etat ? "true" : "false");
  }

  Object.assign(UI, {
    basculerChrono, chrono, chronoArreter, chronoPrincipal, chronoRaz, chronoTic,
    chronoTourne, jouerBip, majBoutonsChrono, majEtapesChrono, paliersCourants,
    syncWakeLock,
  });
})();
