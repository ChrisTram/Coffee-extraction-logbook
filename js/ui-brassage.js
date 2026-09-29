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
  // L7 : les recettes sans heures (la Brikka) avancent d'un toucher ; on retient où l'on en est.
  let pasManuel = 0;
  let dernierPalier = -1;
  let dernierCourant = "";
  const IMMINENT_S = 10;
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

    let i = -1;
    paliers.forEach((p, k) => { if (p.t <= s) i = k; });
    const courant = i >= 0 ? paliers[i] : null;
    const suivant = paliers[i + 1] || null;
    const cible = courant ? cibleDe(courant.texte) : null;
    const libresSeules = !paliers.length ? tout : [];
    if (pasManuel >= libresSeules.length) pasManuel = Math.max(0, libresSeules.length - 1);

    /* L7 (v8.90) : L'ANNEAU COMPTE JUSQU'AU PROCHAIN VERSEMENT, et non plus
       jusqu'à la fin : c'est lui qu'on attend, la tasse posée. Il passe au cuivre
       les dix dernières secondes. Sans versement à venir, il compte jusqu'au
       total annoncé, comme avant. */
    const debutArc = courant ? courant.t : 0;
    const finArc = suivant ? suivant.t : duree;
    const part = finArc > debutArc ? Math.min(1, Math.max(0, (s - debutArc) / (finArc - debutArc))) : 1;
    $("#br-trace").setAttribute("stroke-dashoffset", String(CIRC * (1 - part)));
    const reste = suivant ? suivant.t - s : null;
    $("#br-anneau").classList.toggle("imminent", reste !== null && reste <= IMMINENT_S && UI.chrono.etat === "encours");
    $("#br-anneau").classList.toggle("depasse", !suivant && s > duree);

    /* Au centre, EN ÉNORME, ce qu'il faut atteindre sur la balance : c'est la
       seule chose à lire à un mètre. Sans volume à viser, le temps prend la place. */
    const u = unite();
    if (cible) {
      $("#br-label").textContent = I18N.t("br_verse");
      $("#br-cible").textContent = String(cible);
      $("#br-dans").textContent = u + (suivant ? " · " + I18N.t("br_ensuite_dans", { t: fmtTemps(Math.max(0, Math.ceil(reste))) }) : "");
    } else if (libresSeules.length) {
      /* Une étape à l'œil qui vise un total (le 4:6, v8.99) : le total passe en
         énorme, comme une étape minutée ; sinon le temps écoulé. */
      const cibleLibre = cibleDe(libresSeules[pasManuel].texte);
      $("#br-label").textContent = I18N.t("br_etape_n", { n: pasManuel + 1, t: libresSeules.length });
      $("#br-cible").textContent = cibleLibre ? String(cibleLibre) : fmtTemps(Math.floor(s));
      $("#br-dans").textContent = (cibleLibre ? u + " · " : "") + I18N.t("br_toucher");
    } else {
      $("#br-label").textContent = courant ? I18N.t("br_chrono") : I18N.t("br_pret");
      $("#br-cible").textContent = fmtTemps(Math.floor(s));
      $("#br-dans").textContent = suivant ? I18N.t("br_ensuite_dans", { t: fmtTemps(Math.max(0, Math.ceil(reste))) }) : "";
    }
    $(".br-temps-ligne").hidden = !cible;

    // Le total versé, sur l'eau de la tasse : la carafe, en une barre.
    const eau = Number($("#f-eau").value) || 0;
    const verse = paliers.slice(0, i + 1).reduce((m, p) => Math.max(m, cibleDe(p.texte) || 0), 0);
    $("#br-total").hidden = !(eau > 0 && paliers.some(p => cibleDe(p.texte)));
    $("#br-total-niveau").style.width = (eau > 0 ? Math.min(100, (verse / eau) * 100) : 0).toFixed(1) + "%";
    $("#br-total-texte").textContent = I18N.t("br_total", { v: verse, e: eau, u });

    // Un palier franchi pendant que ça tourne : le téléphone vibre, en plus du bip du chrono.
    if (i !== dernierPalier) {
      if (i > dernierPalier && dernierPalier !== -2 && UI.chrono.etat === "encours" && navigator.vibrate) { try { navigator.vibrate(160); } catch (e) { /* pas de vibreur */ } }
      dernierPalier = i;
    }

    /* Une étape sans volume (« Ouvrir, laisser s'écouler ») n'a pas de chiffre à
       viser : c'est alors la consigne qui passe en grand. */
    const consigneManuelle = libresSeules.length ? libresSeules[pasManuel].texte : null;
    $("#br-consigne").classList.toggle("seule", (!!courant && !cible) || !!consigneManuelle);
    $("#br-consigne").textContent = consigneManuelle || (courant ? courant.texte
      : paliers.length ? I18N.t("br_attente", { texte: paliers[0].texte }) : I18N.t("br_sans_paliers"));
    const vanne = i >= 0 ? vanneA(paliers, i) : null;
    const badge = $("#br-vanne");
    badge.hidden = !vanne || UI.saisie.methode !== "Switch";
    if (vanne) badge.textContent = I18N.t(vanne === "ouverte" ? "br_vanne_ouverte" : "br_vanne_fermee");
    $("#br-suivante").textContent = suivant
      ? I18N.t("br_suivante", { d: Math.max(0, Math.ceil(suivant.t - s)), texte: suivant.texte })
      : courant ? I18N.t("ch_derniere") : libresSeules.length ? I18N.t("br_toucher") : "";

    // La frise : tous les paliers minutés, le courant en évidence ; les étapes
    // sans heure (la Brikka) en liste simple, à relire.
    const libres = tout.filter(e => e.t === null || e.t === undefined);
    poser($("#br-frise"), paliers.map((p, k) =>
      '<li class="' + (k === i ? "courant" : k < i ? "passe" : "") + '"><time>' + fmtTemps(p.t) + "</time><span>" +
      echap(p.texte) + "</span></li>").join("") +
      libres.map((p, k) => '<li class="libre' + (!paliers.length ? (k === pasManuel ? " courant" : k < pasManuel ? " passe" : "") : "") + '" data-pas="' + k + '"><time aria-hidden="true">' + (k + 1) + "</time><span>" + echap(p.texte) + "</span></li>").join(""));
    /* v9.01 : la frise est ce que Chris lit, la balance sous le Switch. L'étape
       en cours vient au milieu de l'écran quand elle change, pas à chaque tic. */
    const cleCourant = (paliers.length ? "p" + i : "l" + pasManuel) + "|" + (r ? r.id : "");
    if (cleCourant !== dernierCourant) {
      dernierCourant = cleCourant;
      const li = $("#br-frise li.courant");
      if (li && li.scrollIntoView) li.scrollIntoView({ block: "center", behavior: "smooth" });
    }

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
    pasManuel = 0;
    dernierPalier = -2;
    dernierCourant = "";
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
    $("#br-raz").addEventListener("click", () => { UI.chronoRaz(); finVisible = false; pasManuel = 0; peindre(); });
    /* L7 : une recette sans heures (la Brikka) avance d'un toucher n'importe où
       sur la scène, les mains prises. Les recettes minutées suivent le temps. */
    const avancer = ev => {
      const r = trouverRecette($("#f-recette").value);
      const tout = r ? UI.etapesPour(r) : [];
      if (!tout.length || tout.some(e => e.t !== null && e.t !== undefined)) return;
      // v9.01 : toucher une ligne de la frise y va directement ; ailleurs, l'étape suivante.
      const li = ev.target.closest && ev.target.closest("#br-frise li[data-pas]");
      pasManuel = li ? Number(li.dataset.pas) : (pasManuel + 1) % tout.length;
      peindre();
    };
    $(".br-scene").addEventListener("click", avancer);
    $("#br-frise").addEventListener("click", avancer);
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
