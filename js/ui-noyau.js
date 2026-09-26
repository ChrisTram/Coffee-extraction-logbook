/* Noyau de l'interface : les outils partagés, le thème et la navigation.
 *
 * Tout le reste de l'interface est bâti là-dessus, donc ce fichier se charge en
 * premier et expose l'objet UI que les autres augmentent. Il ne connaît AUCUN
 * écran en particulier : quand il doit en redessiner un, il passe par UI, et
 * c'est volontaire. Un noyau qui appellerait rendreHistorique() directement ne
 * serait plus un noyau, ce serait l'application entière avec des étapes.
 *
 * Un nom placé ici est un nom que tous les écrans peuvent utiliser. C'est un
 * engagement : avant d'en ajouter un, vérifier qu'au moins deux écrans en ont
 * vraiment besoin. */
"use strict";

const UI = (() => {

  // ---------- Petits outils ----------

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* Bascule l'état visuel ET l'état annoncé d'un même geste. Les séparer serait
     la garantie qu'ils divergent : c'est déjà arrivé sur d'autres projets, la
     classe suit et l'attribut reste figé. */
  /* Appui LONG sur une pilule ou un tag : ouvre sa définition. Le survol n'existe
     pas au doigt et un tap ne déclenche pas :focus-visible, donc sur téléphone la
     moitié du vocabulaire était inatteignable. L'appui court garde son rôle de
     bascule, et on annule la bulle dès que le doigt bouge pour ne pas la déclencher
     pendant un défilement. */
  const APPUI_LONG_MS = 450;

  function activerAppuiLong(racine) {
    let minuteur = null, cible = null;
    // Vrai entre l'ouverture d'une bulle par appui long et le clic qui la suit.
    let bulleOuverteALInstant = false;
    const fermer = () => {
      racine.querySelectorAll(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    };
    const annuler = () => { clearTimeout(minuteur); minuteur = null; cible = null; };

    racine.addEventListener("pointerdown", ev => {
      const el = ev.target.closest("[data-info]");
      if (!el) return;
      cible = el;
      bulleOuverteALInstant = false;
      minuteur = setTimeout(() => {
        fermer();
        el.classList.add("info-ouverte");
        bulleOuverteALInstant = true;
        minuteur = null;
      }, APPUI_LONG_MS);
    });
    racine.addEventListener("pointermove", annuler);
    racine.addEventListener("pointerup", () => {
      // Un appui long a déjà ouvert la bulle : le clic qui suit ne doit pas
      // basculer la pilule en plus. On laisse le clic passer sinon.
      if (cible && cible.classList.contains("info-ouverte")) {
        setTimeout(fermer, 2500);
      }
      annuler();
    });
    racine.addEventListener("pointercancel", () => { annuler(); fermer(); });

    /* Le clic qui SUIT un appui long ne doit rien faire de plus : la bulle est
       déjà ouverte, c'était tout ce qu'on demandait. Sans ça, lire la définition
       d'un descripteur le sélectionnait au passage, et l'appui long est le seul
       moyen d'ouvrir la bulle sans souris.

       En phase de CAPTURE sur le conteneur, donc avant la cible et avant la
       remontée : c'est ce qui permet à stopPropagation() d'empêcher le
       gestionnaire délégué, posé sur ce même conteneur, de voir l'événement. */
    racine.addEventListener("click", ev => {
      if (!bulleOuverteALInstant) return;
      bulleOuverteALInstant = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
  }

  /* Retarde un appel jusqu'à ce que les frappes s'arrêtent. Une fonction par
     usage, pas une file partagée : deux champs différents ne doivent pas
     s'annuler l'un l'autre. */
  /* Signature d'une table : de quoi savoir si elle a bougé, sans la comparer
     ligne à ligne. maj_le bouge à chaque mutation (voir estampiller dans
     data.js), la longueur couvre les suppressions. */
  /* Cache de recherche pour les éléments STATIQUES d'index.html. À n'utiliser que
     sur des nœuds jamais remplacés : un nœud issu d'un innerHTML serait mis en
     cache détaché, et les écritures suivantes partiraient dans le vide. */
  const cacheChamps = new Map();
  function $f(sel) {
    let el = cacheChamps.get(sel);
    if (!el) { el = document.querySelector(sel); if (el) cacheChamps.set(sel, el); }
    return el;
  }

  /* N'écrit QUE si ça change. Une affectation innerHTML invalide la mise en page
     même quand le contenu est identique, et la ligne live est réécrite à chaque
     caractère alors que la plupart des frappes n'en changent aucune partie :
     taper dans la molette ne touche ni au ratio ni au coût. */
  function poser(el, html) {
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function poserTexte(el, texte) {
    if (el && el.textContent !== texte) el.textContent = texte;
  }

  function signatureTable(tableau) {
    let max = 0;
    for (const x of tableau) if (x.maj_le > max) max = x.maj_le;
    return tableau.length + ":" + max;
  }

  /* N execute la fonction que si la signature a changé depuis la dernière fois.
     La cle separe les memoires : deux appelants ne doivent pas se marcher dessus. */
  const signatures = new Map();
  function siChange(cle, tableau, fn) {
    const s = signatureTable(tableau);
    if (signatures.get(cle) === s) return false;
    signatures.set(cle, s);
    fn();
    return true;
  }

  /* Force le prochain rendu, quelle que soit la signature. Sert à la bascule de
     langue : les données n'ont pas bougé, mais tout le texte doit être refait. */
  function oublierSignatures() {
    signatures.clear();
  }

  function antiRebond(fn, delai) {
    let h = null;
    return (...args) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...args), delai === undefined ? 120 : delai);
    };
  }

  function basculerEtat(el, actif) {
    el.classList.toggle("actif", actif);
    el.setAttribute("aria-pressed", actif ? "true" : "false");
  }

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.setAttribute("hidden", ""), 2600);
  }

  /* Message avec un bouton d'action, cinq secondes. Sert à l'annulation d'une
     suppression, qui est DÉJÀ faite quand ce message s'affiche : voir
     supprimerExtractionAvecRetour. Le bouton disparaît avec le message, il n'y a
     donc pas de suite à gérer. */
  /* UN SEUL À LA FOIS (v8.71) : deux touches sur « Enregistrer » pendant
     l'écriture créaient deux tasses. L'appel suivant est ignoré tant que le
     premier n'a pas fini. */
  function unSeulALaFois(fn) {
    let enCours = false;
    return async (...args) => {
      if (enCours) return undefined;
      enCours = true;
      try { return await fn(...args); } finally { enCours = false; }
    };
  }

  /* LES MISES À JOUR SE SIGNALENT (v8.72). Il fallait « recharger deux fois » :
     la PWA installée reprend depuis la mémoire au lieu de recharger, et rien ne
     surveillait les nouvelles versions. Au retour sur l'appli on demande au
     service worker de vérifier, et quand un nouveau prend la main, un message
     propose de recharger, une seule fois, et seulement s'il y avait déjà une
     version (pas à la toute première installation). */
  function surveillerMisesAJour() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    const avaitVersion = !!navigator.serviceWorker.controller;
    let proposee = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!avaitVersion || proposee) return;
      proposee = true;
      toastAction(I18N.t("maj_prete"), I18N.t("maj_recharger"), () => location.reload(), true);
    });
    navigator.serviceWorker.register("sw.js").then(reg => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => { /* hors ligne */ });
      });
    }).catch(() => { /* pas critique */ });
  }

  function toastAction(message, libelle, action, persistant) {
    const t = $("#toast");
    t.innerHTML = "";
    t.appendChild(document.createTextNode(message + " "));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = libelle;
    b.addEventListener("click", () => {
      t.setAttribute("hidden", "");
      clearTimeout(toast._h);
      action();
    });
    t.appendChild(b);
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    if (persistant) return;
    toast._h = setTimeout(() => {
      t.setAttribute("hidden", "");
      t.textContent = "";
    }, 5000);
  }

  /* Question oui ou non dans un <dialog>, à la place de confirm().

     Sur le téléphone, confirm() est une boîte système : elle sort du thème,
     ignore la langue de la page (le message passe par I18N mais pas ses
     boutons) et casse l'impression d'application installée. Ici tout est dans
     la page. Le choix SÛR reçoit le focus : Entrée annule, il faut viser pour
     confirmer. Échap ferme le dialogue natif, donc annule aussi.

     Renvoie une promesse de booléen, pour que l'appelant s'écrive comme avant :
     `if (!await confirmer(texte)) return;`. */
  function confirmer(message, options) {
    const d = $("#modale-confirmer");
    if (!d || typeof d.showModal !== "function") return Promise.resolve(window.confirm(message));
    const danger = !!(options && options.danger);
    poserTexte($("#confirmer-titre"), I18N.t("c_titre"));
    poserTexte($("#confirmer-texte"), message);
    const ok = $("#confirmer-ok"), non = $("#confirmer-annuler");
    ok.textContent = (options && options.libelle) || I18N.t("c_ok");
    non.textContent = I18N.t("t_annuler");
    ok.classList.toggle("btn-danger", danger);
    // Réaffectés à chaque ouverture : un seul gestionnaire, jamais empilés.
    ok.onclick = () => d.close("ok");
    non.onclick = () => d.close("annuler");
    return new Promise(resolve => {
      const surFermeture = () => {
        d.removeEventListener("close", surFermeture);
        resolve(d.returnValue === "ok");
      };
      d.addEventListener("close", surFermeture);
      d.returnValue = "";
      d.showModal();
      non.focus();
    });
  }

  /* Supprime pour de vrai, immédiatement, et propose de revenir en arrière.

     L'ordre compte et il est délibéré. Retarder la suppression aurait été plus
     simple à écrire, mais fermer l'onglet pendant le délai aurait alors ANNULÉ
     une suppression que Chris croyait faite. Ici la ligne part tout de suite,
     part à la synchro tout de suite, et l'annulation la réinsère comme une
     nouvelle écriture, ce que la fusion sait gérer : elle est postérieure à la
     pierre tombale, donc elle gagne. */
  async function supprimerExtractionAvecRetour(ext) {
    const copie = { ...ext };
    delete copie._c;
    await DATA.supprimerExtraction(ext.id);
    UI.rendreHistorique();
    toastAction(I18N.t("t_supprimee"), I18N.t("t_annuler"), async () => {
      await DATA.restaurerExtraction(copie);
      UI.rendreHistorique();
      toast(I18N.t("t_restauree"));
    });
  }

  function fmtTemps(s) {
    if (s === "" || s === null || s === undefined || isNaN(s)) return "";
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function fmtVND(n) {
    if (n === "" || n === null || isNaN(n)) return "";
    return Math.round(n).toLocaleString("fr-FR") + " ₫";
  }

  // Une seule définition, dans outils.js : voir l'en-tête de ce fichier là.
  const { moyenne, cleLocale } = OUTILS;

  function maintenantLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /* LA PISTE D'UN CURSEUR. Les curseurs sont dessines en CSS (piste fine, pouce
     borde d'accent) au lieu d'accent-color, qui rend differemment sur chaque
     moteur. Le CSS ne connait pas la valeur : on lui pose --pc, la part de
     course parcourue, et le degrade de la piste s'arrete la. A appeler a chaque
     input ET a chaque ecriture de .value par le code, sinon la piste ment. */
  function peindreCurseur(curseur) {
    if (!curseur) return;
    const min = Number(curseur.min) || 0, max = Number(curseur.max);
    const v = Number(curseur.value);
    const pc = isNaN(max) || max === min || isNaN(v) ? 0 : ((v - min) / (max - min)) * 100;
    curseur.style.setProperty("--pc", Math.max(0, Math.min(100, pc)) + "%");
  }

  /* LA NOTE SANS POUCE (v8.40). Un curseur ne peut pas être vide : l'absence de
     note vivait dans une case « pas encore notée », à décocher EN PLUS de régler
     la note. Elle vit maintenant sur le curseur lui même, par la classe
     curseur-inactif, tant qu'on n'y a pas touché. Poser le doigt n'importe où
     sur la piste note, en un seul geste. Depuis la v8.68 cette classe n'a plus
     de style : le curseur garde la même allure, le libellé dit l'état.
     Même mécanisme dans la saisie et dans la saisie rapide. */
  function noteVide(curseur) {
    return !!curseur && curseur.classList.contains("curseur-inactif");
  }
  function marquerNote(curseur, vide) {
    if (curseur) curseur.classList.toggle("curseur-inactif", vide);
  }
  /* Les touches qui CHANGENT la valeur. Tabuler à travers le curseur ne doit pas
     noter la tasse : l'ancien keydown sans filtre le faisait. */
  const TOUCHES_CURSEUR = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
  /* pointerdown en plus d'input : poser le doigt là où le curseur est déjà ne
     déclenche aucun input, et la note serait restée vide sans le savoir. */
  function brancherNote(curseur, apres) {
    const toucher = () => { marquerNote(curseur, false); apres(); };
    curseur.addEventListener("input", toucher);
    curseur.addEventListener("pointerdown", toucher);
    curseur.addEventListener("keydown", ev => { if (TOUCHES_CURSEUR.includes(ev.key)) toucher(); });
  }

  /* LA DICTÉE DU COMMENTAIRE (v8.43). Parler pendant que la tasse refroidit,
     les mains prises. La reconnaissance vocale de Chrome et de Safari passe par
     leurs serveurs : le bouton n'existe que si le navigateur la connaît ET
     qu'on est en ligne, et il se cache dès que la connexion tombe. Le texte
     dicté S'AJOUTE à ce qui est déjà écrit et reste modifiable : rien ne part
     en base avant Enregistrer. */
  function brancherDictee(bouton, champ, libelle) {
    const Reco = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!bouton || !champ || !Reco) return;
    const visible = () => { bouton.hidden = typeof navigator !== "undefined" && navigator.onLine === false; };
    visible();
    window.addEventListener("online", visible);
    window.addEventListener("offline", visible);
    let reco = null;
    const etat = actif => {
      bouton.setAttribute("aria-pressed", String(actif));
      if (libelle) libelle.textContent = I18N.t(actif ? "dictee_ecoute" : "dictee");
    };
    bouton.addEventListener("click", () => {
      if (reco) { reco.stop(); return; }
      reco = new Reco();
      reco.lang = I18N.locale();
      reco.interimResults = false;
      reco.continuous = false;
      const avant = champ.value.trim();
      reco.onresult = ev => {
        const dit = Array.from(ev.results).map(r => r[0].transcript).join(" ").trim();
        if (!dit) return;
        champ.value = (avant ? avant + " " : "") + dit;
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      };
      reco.onerror = ev => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast(I18N.t("dictee_refusee"));
        else if (ev.error === "network") toast(I18N.t("dictee_reseau"));
      };
      reco.onend = () => { reco = null; etat(false); };
      try { reco.start(); etat(true); } catch (e) { reco = null; etat(false); }
    });
  }

  /* LES ICONES EN TRAIT. Meme dessin que la navigation : 1,8 px, bouts ronds,
     couleur du texte. Elles remplacent les glyphes Unicode (⇄ ⚠ ⧉ ✎ 🗑) des
     boutons d'action, qui changeaient de dessin selon la plateforme et que la
     regle « jamais d'emoji » de la navigation interdisait deja ailleurs. Le
     nom est une cle, pas du texte : ce qui se lit est le title du bouton. */
  const ICONES = {
    chevron: '<path d="m9 6 6 6-6 6"/>',
    gauche: '<path d="m15 6-6 6 6 6"/>',
    comparer: '<path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/>',
    ratee: '<path d="M12 4 3 19h18z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    dupliquer: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    modifier: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    supprimer: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    croix: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  };
  function icone(nom) {
    return '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONES[nom] || "") + "</svg>";
  }

  function fmtDateHeure(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return dh;
    return d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  // "2026-08-12" vers "12 août 2026", en construisant la date en LOCAL
  // (new Date("2026-08-12") serait interprété en UTC).
  function fmtDateCourte(s) {
    const [a, m, j] = String(s).split("-").map(Number);
    if (!a || !m || !j) return s;
    return new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtDecimal(n, dec) {
    return Number(n.toFixed(dec)).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
  }

  function animerCompteur(el, cible, decimales, suffixe, prefixe) {
    const duree = 750, depart = performance.now();
    const dec = decimales || 0;
    function pas(t) {
      const p = Math.min(1, (t - depart) / duree);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = cible * eased;
      el.textContent = (prefixe || "") +
        v.toLocaleString(I18N.locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (suffixe || "");
      if (p < 1) requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  }

  // Recettes vivantes (éditables, stockées avec les données).
  function recettesVivantes() { return DATA.state.recettes.filter(r => r.actif !== 0); }
  function recettesDeMethode(m) { return recettesVivantes().filter(r => r.methode === m); }
  function trouverRecette(nom) { return DATA.state.recettes.find(r => r.nom === nom); }
  function recetteAvecVariantes() { return recettesVivantes().find(r => r.variantes); }

  // Attribut title : la valeur complete d'une cellule tronquee, au survol.
  // Les guillemets doubles casseraient l'attribut, on les neutralise.
  // L'échappement commun (OUTILS.echap), sous son ancien nom.
  function attrTitre(texte) {
    return OUTILS.echap(texte || "");
  }

  // "Sous-extrait (acide)|Astringent" vers un affichage traduit "Under-extracted (sour), Astringent".
  function diagsAffiches(s) {
    return (s || "").split("|").filter(Boolean).map(d => I18N.diag(d)).join(", ");
  }

  function detailRatio(base, dose, eau) {
    if (base === "chaudiere") return I18N.t("rt_chaudiere", { d: dose, e: eau });
    if (base === "infusion") return I18N.t("rt_infusion", { d: dose, e: eau });
    return "";
  }

  /* Vrai quand la tasse a été marquée ratée. Une colonne vide veut dire "pas
     dit", donc non ratée : c'est le cas de tout ce qui précède le drapeau. */
  function estRatee(e) { return Number(e.ratee) === 1; }

  const CLE_INCLURE_RATEES = "inclure-ratees";
  /* Préférence de LECTURE, donc locale comme le thème et les bips : elle change
     ce que les chiffres racontent, pas les données. Rien à synchroniser. */
  function inclureRatees() {
    try { return localStorage.getItem(CLE_INCLURE_RATEES) === "1"; } catch (e) { return false; }
  }

  function basculerRatees(inclure) {
    try { localStorage.setItem(CLE_INCLURE_RATEES, inclure ? "1" : "0"); } catch (e) { /* tant pis */ }
  }

  /* Les extractions dont on tire des CONSEILS : insights, meilleurs réglages,
     goûts, duel des machines, tendance. Une tasse ratée décrit un geste manqué,
     pas un réglage, et la garder peut faire condamner un réglage correct.

     Les COMPTAGES gardent tout, toujours : tasses bues, grammes consommés, coût,
     calendrier d'activité, stock des sachets. Le café a bien été utilisé, et une
     erreur de geste n'efface pas la dépense. C'est la ligne de partage, et elle
     tient en une phrase : ce qui décrit CE QUI S'EST PASSÉ compte tout, ce qui
     conseille CE QU'IL FAUT FAIRE écarte les ratées. */
  function extAnalysables() {
    const tout = extAvecCalculs();
    return inclureRatees() ? tout : tout.filter(e => !estRatee(e));
  }

  /* GARDÉES EN MÉMOIRE (v8.75). Chaque rendu, et chaque frappe dans la saisie,
     recalculait ratio, âge du sachet et le reste pour tout l'historique, des
     dizaines de fois par rendu du tableau de bord. Le calcul est refait quand
     les données bougent : révision de DATA, ou tables remplacées ou allongées
     (chargement, synchro, ajout). Une copie du tableau est rendue à chaque
     appel : un appelant qui trie ne dérange pas les autres. */
  /* Chaque tasse garde son calcul tant que SON contenu ne change pas (même
     modifiée sur place, par un chemin qui ne notifie pas), et tant que les cafés
     et les sachets dont il dépend n'ont pas bougé (révision de DATA, tables
     remplacées ou allongées). Le tableau rendu est neuf à chaque appel. */
  let memoGlobal = null, memoVersion = 0;
  const memoParTasse = new WeakMap();
  function extAvecCalculs() {
    const s = DATA.state;
    const cle = [DATA.revisionDonnees ? DATA.revisionDonnees() : 0, s.cafes, s.cafes.length, s.achats, s.achats.length];
    if (!memoGlobal || cle.some((v, i) => v !== memoGlobal[i])) { memoGlobal = cle; memoVersion++; }
    return s.extractions.map(e => {
      const sig = JSON.stringify(e);
      const m = memoParTasse.get(e);
      if (m && m.v === memoVersion && m.sig === sig) return m.obj;
      const obj = { ...e, _c: DATA.calculs(e) };
      memoParTasse.set(e, { sig, v: memoVersion, obj });
      return obj;
    });
  }

  // Dose prise quand rien ne la preremplit (recette sans dose, formulaire
  // vierge). 15 g est la dose de toutes les recettes Switch d'origine.
  const DOSE_REPLI_USINE = 15;

  // Puissance de feu par défaut, échelle personnelle de 1 à 10, Brikka seulement.
  /* 3 depuis que Chris l'a redemande. L'echelle a deja fait 3, puis 4, puis 2
     (pas de schema v1 et v2) : elle revient a son point de depart. */
  const FEU_REPLI_USINE = 3;

  /* Réglage RÉEL du broyeur, celui où la molette est physiquement posée. Ce n'est
     pas la même chose que le dial d'une recette, qui est une CIBLE : la Brikka
     vise 1.2.0 et le Switch 1.6.0, mais Chris laisse son C5 sur 1.5.0, le
     "compromis qui marche dans les deux" de son guide, pour ne pas recompter les
     crans à chaque changement de machine. Le formulaire préremplissait la cible
     et lui faisait donc enregistrer une mouture qu'il n'avait pas utilisée.
     La cible reste visible dans le panneau latéral, et l'avertissement de plage
     continue de signaler un écart réel. */
  const MOLETTE_REPLI_USINE = "1.5.0";

  /* VUE en lecture sur la table `reglages`, qui se synchronise. Ces trois
     valeurs décrivent le MATÉRIEL de Chris : sa molette de broyeur est la même
     vue du téléphone et de l'ordinateur. Elles vivaient en localStorage, donc son
     téléphone ignorait ce qu'il réglait sur l'ordinateur, et il ne pouvait pas le
     voir puisque ce sont des champs préremplis d'apparence normale.

     Le thème et les bips, eux, restent locaux à juste titre : un téléphone en
     cuisine et un ordinateur n'ont pas les mêmes besoins.

     `replis` reste un objet simple parce qu'il est lu partout dans le code de
     rendu ; il est juste rafraîchi depuis DATA à chaque notification. */
  const CLE_REPLIS = "replis-saisie";
  /* Temps d'ébullition de la bouilloire, en secondes, depuis l'eau du robinet.
     ZÉRO tant que Chris ne l'a pas chronométrée : sans mesure, pas
     d'estimation, l'aide de saisie demande de la faire une fois. */
  /* DEUX MINUTES, mesurees par Chris sur sa bouilloire : eau du robinet au gros
     bouillon. Valait 0 jusqu'ici, et le modele refuse de calculer sans temps
     d'ebullition : l'estimation du degre depuis le temps de chauffe ne partait
     donc JAMAIS tant qu'on n'etait pas alle la regler dans Parametres. Un repli
     d'usine juste vaut mieux qu'un repli neutre qui desactive la fonction. */
  const EBULLITION_USINE = 120;
  const replis = { dose: DOSE_REPLI_USINE, feu: FEU_REPLI_USINE, molette: MOLETTE_REPLI_USINE, ebullition: EBULLITION_USINE, bulles: "" };

  function chargerReplis() {
    const r = DATA.reglagesCourants();
    replis.dose = r.dose_g;
    replis.feu = r.puissance_feu;
    replis.molette = r.mouture_dial;
    replis.ebullition = r.ebullition_s;
    replis.bulles = r.bulles_s;
    // Les pas de la correction chiffrée (v8.48), tels quels : les colonnes de la ligne.
    replis.dessins = r.dessins || "";
    replis.pas = { pas_crans: r.pas_crans, pas_degres: r.pas_degres, pas_feu: r.pas_feu,
      pas_eau_g: r.pas_eau_g, pas_dose_g: r.pas_dose_g };
  }

  /* Reprise unique des réglages posés avant la synchro. Sans elle, Chris
     retrouverait les valeurs d'usine et devrait tout reposer à la main. Marquée
     une fois, et seulement si la table est encore vide : une reprise qui
     écraserait un réglage déjà synchronisé serait pire que pas de reprise. */
  async function reprendreReplisLocaux() {
    let brut = null;
    try {
      if (localStorage.getItem("replis-repris")) return;
      brut = JSON.parse(localStorage.getItem(CLE_REPLIS) || "null");
      localStorage.setItem("replis-repris", "1");
    } catch (e) { return; }
    if (!brut || DATA.state.reglages.length) return;
    await DATA.majReglages({
      dose_g: brut.dose,
      puissance_feu: brut.feu,
      mouture_dial: brut.molette,
    });
    chargerReplis();
  }

  async function ecrireReplis() {
    await DATA.majReglages({
      dose_g: replis.dose,
      puissance_feu: replis.feu,
      mouture_dial: replis.molette,
      ebullition_s: replis.ebullition,
      bulles_s: replis.bulles,
      ...(replis.pas || {}),
      dessins: replis.dessins || "",
    });
  }

  // ---------- Thème ----------

  /* Les deux palettes sombres (v8.34) : data-theme dit la famille, data-sombre
     la palette. La couleur de la barre d etat suit la palette. */
  const TEINTES = { clair: "#f4ede3", graphite: "#111113", nuit: "#0b1017" };
  function appliquerTheme(theme, palette) {
    document.documentElement.setAttribute("data-theme", theme);
    if (palette) document.documentElement.setAttribute("data-sombre", palette);
    try {
      localStorage.setItem("theme", theme);
      if (palette) localStorage.setItem("sombre", palette);
    } catch (e) { /* indisponible, tant pis */ }
    /* La barre d'état de la PWA installée suit le thème. Les deux balises du
       <head> ne connaissent que la préférence du système, et le navigateur
       retient celle dont le media correspond : on écrit donc la couleur choisie
       dans les DEUX, sinon celle qu'il retient contredirait le choix. */
    const teinte = theme === "sombre"
      ? TEINTES[document.documentElement.getAttribute("data-sombre")] || TEINTES.graphite
      : TEINTES.clair;
    document.querySelectorAll('meta[name="theme-color"]')
      .forEach(m => m.setAttribute("content", teinte));
    if (typeof Chart !== "undefined") {
      CHARTS.appliquerDefauts();
      rendreEcranCourant(true);
    }
  }

  /* La restauration au chargement vit dans le <head> d'index.html, pas ici : un
     script différé n'agit qu'après le premier rendu, et le thème clair
     clignotait donc en sombre à chaque ouverture. */

  // ---------- Navigation ----------

  const ECRANS = ["tableau", "saisie", "historique", "reglages", "guide", "parametres"];

  /* Anciens noms d'écran encore présents dans un signet ou un raccourci PWA.
     "reference" a fusionné dans "guide" : la référence et le guide d'achat
     parlaient du même matériel et se consultaient l'un après l'autre. */
  const ECRANS_RENOMMES = { reference: "guide" };
  function normaliserEcran(nom) {
    return ECRANS_RENOMMES[nom] || nom;
  }
  /* État de navigation, en un seul objet muté en place plutôt qu'en variables
     séparées. La forme compte : plusieurs fichiers le lisent et l'écrivent, et
     un objet partagé se lit partout à jour, là où une variable empruntée serait
     figée sur sa valeur du chargement. */
  const nav = { ecran: "tableau" };

  /* Enveloppe un changement d'écran dans une transition de vue quand le moteur
     sait le faire. Sinon on appelle directement : le repli est le comportement
     d'avant, pas une version dégradée.

     On respecte aussi le mouvement réduit ici et pas seulement en CSS : lancer la
     machinerie pour l'annuler ensuite serait du travail pour rien. */
  function avecTransition(fn) {
    const bouge = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* Document CACHÉ (onglet en arrière-plan, fenêtre réduite) : le navigateur
       n'a aucune occasion de rendu, donc la fonction de mise à jour attendrait
       indéfiniment et l'écran ne basculerait qu'au retour. On bascule tout de
       suite, sans animation : personne ne la regarde. */
    const cache = typeof document.visibilityState === "string" && document.visibilityState === "hidden";
    if (bouge || cache || !document.startViewTransition) { fn(); return; }
    const transition = document.startViewTransition(fn);
    /* Une transition interrompue par la suivante, ou sautée, rejette ses
       promesses : c'est normal, et sans ce catch chaque bascule rapide d'écran
       laissait un "Uncaught (in promise)" dans la console. */
    if (transition && transition.ready) transition.ready.catch(() => {});
    if (transition && transition.finished) transition.finished.catch(() => {});
  }

  /* pourEdition : vrai UNIQUEMENT quand c'est chargerExtractionDansSaisie qui
     ouvre l'écran. C'était un drapeau partagé, posé avant un corps de quarante
     lignes et remis à zéro après, sans finally : une exception au milieu le
     laissait à true pour toujours et l'abandon d'édition ci-dessous ne se
     déclenchait plus jamais. Chris rouvrait alors une ancienne extraction en
     croyant en saisir une nouvelle, et la modifiait sans le vouloir.

     En paramètre, il n'y a plus d'état à laisser coincé : l'information
     appartient à l'appel, elle vit le temps de l'appel. */
  function activerEcran(nom, pourEdition) {
    /* Arriver sur Saisie par la navigation veut dire "je veux noter une tasse",
       jamais "reprends la modification d'il y a dix minutes". On abandonne donc
       l'edition en cours, et on le DIT : sans le message, l'abandon serait aussi
       silencieux que le bug qu'il corrige. Rien n'est perdu en base, l'extraction
       modifiee n'avait pas ete enregistree et reste ouvrable depuis l'historique. */
    if (nom === "saisie" && UI.saisie.editId && !pourEdition) {
      UI.reinitialiserSaisie();
      toast(I18N.t("t_edition_abandonnee"));
    }
    /* Arriver sur Saisie pour une NOUVELLE tasse doit montrer l'heure qu'il est.
       Ici et pas dans rendreEcranCourant : celui-ci se rejoue à chaque
       notification de données, et la date sauterait pendant qu'on remplit le
       formulaire. À l'arrivée, une fois, c'est ce qu'on veut. */
    if (nom === "saisie" && !UI.saisie.editId) UI.rafraichirDateSaisie();
    nav.ecran = nom;
    // Seule la bascule VISUELLE entre dans la transition. L'abandon d'édition
    // ci-dessus est de la logique métier : il se produit dans tous les cas.
    avecTransition(() => {
      $$(".ecran").forEach(e => e.classList.remove("actif"));
      /* aria-current="page" et pas aria-pressed : ce sont des liens de navigation
          déguisés en boutons, pas des bascules. */
      $$(".nav-btn").forEach(b => {
        b.classList.toggle("actif", b.dataset.ecran === nom);
        if (b.dataset.ecran === nom) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      const sec = $("#ecran-" + nom);
      if (sec) sec.classList.add("actif");
      if (location.hash !== "#" + nom) history.replaceState(null, "", "#" + nom);
      rendreEcranCourant();
    });
    window.scrollTo({ top: 0 });
  }

  function rendreEcranCourant(force) {
    if (nav.ecran === "tableau") { UI.rendreTableau(); UI.rendreDessins(); }
    else if (nav.ecran === "reglages") UI.rendreReglages();
    else if (nav.ecran === "historique") UI.rendreHistorique();
    else if (nav.ecran === "parametres") UI.rendreParametres();
    else if (nav.ecran === "guide" && force) UI.rendreConvertisseur();
  }

  return {
    $, $$, $f, APPUI_LONG_MS, CLE_REPLIS, DOSE_REPLI_USINE, EBULLITION_USINE, ECRANS, ECRANS_RENOMMES,
    FEU_REPLI_USINE, MOLETTE_REPLI_USINE, activerAppuiLong, activerEcran, animerCompteur,
    antiRebond, appliquerTheme, attrTitre, avecTransition, basculerEtat, cacheChamps,
    basculerRatees, chargerReplis, cleLocale, confirmer, detailRatio, diagsAffiches,
    ecrireReplis, estRatee, extAnalysables, inclureRatees,
    extAvecCalculs, fmtDateCourte, fmtDateHeure, fmtDecimal, fmtTemps, fmtVND, icone,
    maintenantLocal, marquerNote, brancherDictee, brancherNote, noteVide, peindreCurseur, moyenne, nav, normaliserEcran, oublierSignatures, poser, poserTexte,
    recetteAvecVariantes, recettesDeMethode, recettesVivantes, rendreEcranCourant, replis,
    reprendreReplisLocaux, siChange, signatureTable, signatures,
    supprimerExtractionAvecRetour, toast, toastAction, trouverRecette, unSeulALaFois, surveillerMisesAJour,
  };
})();
