/* Le MODE BRASSAGE (v8.47) : le chrono de la saisie en plein écran.
 *
 * Pendant qu'on verse, on ne veut voir que trois choses : le temps, ce qu'il
 * faut atteindre, et quoi faire ensuite. Le chrono de la saisie vit dans une
 * colonne, entouré de trente-quatre champs ; ici il prend tout l'écran, lisible
 * à un mètre.
 *
 * Ce n'est PAS un second chrono. Il pilote et lit le même état (UI.chrono), avec
 * les mêmes boutons : démarrer ici démarre la saisie, arrêter reporte le temps
 * total et l'écoulement dans le formulaire, les bips et le verrou d'écran sont
 * ceux du chrono. Fermer le mode laisse tourner le chrono.
 *
 * La cible d'un versement s'affiche en MILLILITRES par défaut : Chris n'a pas
 * encore de balance, et un gramme d'eau est un millilitre. Une bascule g / ml,
 * retenue sur l'appareil, rend les grammes le jour où la balance arrive. Le
 * texte des étapes, vérifié par Chris, n'est jamais réécrit. */
"use strict";

(() => {

  const { $, brancherNote, fmtTemps, marquerNote, poser, trouverRecette } = UI;

  const CLE_UNITE = "brassage-unite";
  const CIRC = 2 * Math.PI * 52;
  let minuteur = null;
  // Vrai entre l'arrêt depuis ce mode et la fermeture : la tasse est faite, on la note.
  let finVisible = false;
  const echap = OUTILS.echap;

  function unite() {
    // En grammes par défaut depuis la v8.74 : Chris a une balance. Les millilitres restent à un toucher.
    try { return localStorage.getItem(CLE_UNITE) === "ml" ? "ml" : "g"; } catch (e) { return "g"; }
  }

  /* La cible d'un palier : le volume CUMULÉ à atteindre. « jusqu'à 120 g » et
     « compléter à 240 g » disent le cumul ; sinon le premier nombre de grammes
     (« Bloom 45 g », « verser 50 g »), qui au premier palier EST le cumul. */
  function cibleDe(texte) {
    const t = String(texte || "");
    // Pas de \b devant « à » : hors ASCII, JavaScript n'y voit aucune frontière de mot.
    const cumul = t.match(/(?:^|[\s'’])à\s*(\d+)\s*g\b/i) || t.match(/\bto\s*(\d+)\s*g\b/i);
    const premier = t.match(/(\d+)\s*g\b/);
    const n = cumul ? Number(cumul[1]) : premier ? Number(premier[1]) : null;
    return n && n >= 20 ? n : null;
  }

  /* L'état de la vanne du Switch, tel que la recette le dit jusqu'ici. */
  function vanneA(paliers, i) {
    let etat = null;
    for (let k = 0; k <= i; k++) {
      const t = paliers[k].texte;
      if (/ferm|closed/i.test(t)) etat = "fermee";
      if (/ouvr|open/i.test(t)) etat = "ouverte";
    }
    return etat;
  }

  /* La durée de l'anneau : le total annoncé par la recette (« 3:00 », ou le
     début d'une plage « 2:45 à 3:15 »), sinon le dernier palier plus une
     minute, sinon la moyenne des temps totaux de cette recette. */
  function dureeVisee(r, paliers) {
    const m = String(r && r.totalTexte || "").match(/(\d+):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    if (paliers.length) return paliers[paliers.length - 1].t + 60;
    const passes = DATA.state.extractions.filter(e => r && e.recette === r.nom && Number(e.temps_total_s) > 0)
      .map(e => Number(e.temps_total_s));
    return passes.length ? Math.round(passes.reduce((a, b) => a + b, 0) / passes.length) : 300;
  }

  function ecoule() {
    const c = UI.chrono;
    return (c.accumule + (c.etat === "encours" ? Date.now() - c.departTs : 0)) / 1000;
  }

  function peindre() {
    const r = trouverRecette($("#f-recette").value);
    const tout = r ? UI.etapesPour(r) : [];
    const paliers = tout.filter(e => e.t !== null && e.t !== undefined);
    const s = ecoule();
    const duree = dureeVisee(r, paliers);
    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);

    $("#br-machine").textContent = [I18N.machine(UI.saisie.methode), cafe ? cafe.nom : ""].filter(Boolean).join(" · ");
    $("#br-titre").textContent = r ? I18N.tr(r.nom) : I18N.t("br_sans_recette");
    $("#br-dose").textContent = [$("#f-dose").value ? $("#f-dose").value + " g" : "",
      $("#f-eau").value ? $("#f-eau").value + " " + unite() : ""].filter(Boolean).join(" · ");
    $("#br-temps").textContent = fmtTemps(Math.floor(s));
    $("#br-sur").textContent = I18N.t("br_sur", { t: fmtTemps(duree) });
    $("#br-trace").setAttribute("stroke-dashoffset", String(CIRC * (1 - Math.min(s, duree) / duree)));
    $("#br-anneau").classList.toggle("depasse", s > duree);

    let i = -1;
    paliers.forEach((p, k) => { if (p.t <= s) i = k; });
    const courant = i >= 0 ? paliers[i] : null;
    const suivant = paliers[i + 1] || null;
    const cible = courant ? cibleDe(courant.texte) : null;
    /* Une étape sans volume (« Ouvrir, laisser s'écouler ») n'a pas de chiffre à
       viser : c'est alors la consigne qui passe en grand. */
    $("#br-cible").textContent = cible ? cible + " " + unite() : courant ? "" : I18N.t("br_pret");
    $("#br-consigne").classList.toggle("seule", !!courant && !cible);
    $("#br-consigne").textContent = courant ? courant.texte
      : paliers.length ? I18N.t("br_attente", { texte: paliers[0].texte }) : I18N.t("br_sans_paliers");
    const vanne = i >= 0 ? vanneA(paliers, i) : null;
    const badge = $("#br-vanne");
    badge.hidden = !vanne || UI.saisie.methode !== "Switch";
    if (vanne) badge.textContent = I18N.t(vanne === "ouverte" ? "br_vanne_ouverte" : "br_vanne_fermee");
    $("#br-suivante").textContent = suivant
      ? I18N.t("br_suivante", { d: Math.max(0, Math.ceil(suivant.t - s)), texte: suivant.texte })
      : courant ? I18N.t("ch_derniere") : "";

    // La frise : tous les paliers minutés, le courant en évidence ; les étapes
    // sans heure (la Brikka) en liste simple, à relire.
    const libres = tout.filter(e => e.t === null || e.t === undefined);
    poser($("#br-frise"), paliers.map((p, k) =>
      '<li class="' + (k === i ? "courant" : k < i ? "passe" : "") + '"><time>' + fmtTemps(p.t) + "</time><span>" +
      echap(p.texte) + "</span></li>").join("") +
      libres.map(p => '<li class="libre"><time aria-hidden="true">·</time><span>' + echap(p.texte) + "</span></li>").join(""));

    const etat = UI.chrono.etat;
    $("#br-go").textContent = I18N.t(etat === "arrete" ? (s > 0 ? "br_recommencer" : "ch_demarrer")
      : etat === "encours" ? "ch_pause" : "ch_reprendre");
    $("#br-stop").hidden = etat === "arrete";
    $("#br-raz").hidden = etat === "arrete" && s === 0;
    $("#br-fin").hidden = !(finVisible && etat === "arrete");
    $(".br-boutons").hidden = finVisible && etat === "arrete";
    $(".br-unite [data-unite=ml]").setAttribute("aria-pressed", String(unite() === "ml"));
    $(".br-unite [data-unite=g]").setAttribute("aria-pressed", String(unite() === "g"));
  }

  function ouvrirBrassage() {
    const m = $("#modale-brassage");
    finVisible = false;
    peindre();
    if (!m.open) m.showModal();
    clearInterval(minuteur);
    minuteur = setInterval(peindre, 250);
  }

  function fermerBrassage() {
    clearInterval(minuteur);
    minuteur = null;
    const m = $("#modale-brassage");
    if (m.open) m.close();
  }

  function cablerBrassage() {
    $("#btn-brassage").addEventListener("click", ouvrirBrassage);
    $("#br-fermer").addEventListener("click", fermerBrassage);
    $("#modale-brassage").addEventListener("close", () => { clearInterval(minuteur); minuteur = null; });
    $("#br-go").addEventListener("click", () => {
      // « Recommencer » après un arrêt : on repart de zéro, pas de l'ancien temps.
      if (UI.chrono.etat === "arrete" && ecoule() > 0) UI.chronoRaz();
      finVisible = false;
      UI.chronoPrincipal();
      UI.basculerChrono(true);
      peindre();
    });
    $("#br-stop").addEventListener("click", () => {
      UI.chronoArreter();
      finVisible = true;
      const c = $("#br-note");
      c.value = 5;
      marquerNote(c, true);
      majNoteBrassage();
      peindre();
    });
    $("#br-raz").addEventListener("click", () => { UI.chronoRaz(); finVisible = false; peindre(); });
    document.querySelectorAll(".br-unite [data-unite]").forEach(b => b.addEventListener("click", () => {
      try { localStorage.setItem(CLE_UNITE, b.dataset.unite); } catch (e) { /* sans stockage, ml */ }
      peindre();
    }));
    // La note de fin écrit dans celle du formulaire : une seule note, celle qui part en base.
    brancherNote($("#br-note"), () => {
      const f = $("#f-note");
      f.value = $("#br-note").value;
      marquerNote(f, false);
      UI.majAffichageNote();
      majNoteBrassage();
    });
    $("#br-enregistrer").addEventListener("click", () => {
      fermerBrassage();
      $("#form-saisie").requestSubmit();
    });
    $("#br-completer").addEventListener("click", fermerBrassage);
  }

  function majNoteBrassage() {
    const c = $("#br-note");
    const vide = UI.noteVide(c);
    $("#br-note-dite").textContent = vide ? I18N.t("n_pas_notee") : c.value + " / 10";
    UI.peindreCurseur(c);
  }

  Object.assign(UI, { cablerBrassage, cibleVersement: cibleDe, fermerBrassage, ouvrirBrassage });
})();
