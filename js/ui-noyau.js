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
    const fermer = () => {
      racine.querySelectorAll(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    };
    const annuler = () => { clearTimeout(minuteur); minuteur = null; cible = null; };

    racine.addEventListener("pointerdown", ev => {
      const el = ev.target.closest("[data-info]");
      if (!el) return;
      cible = el;
      minuteur = setTimeout(() => {
        fermer();
        el.classList.add("info-ouverte");
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
  function toastAction(message, libelle, action) {
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
    toast._h = setTimeout(() => {
      t.setAttribute("hidden", "");
      t.textContent = "";
    }, 5000);
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

  function cleLocale(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const j = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + j;
  }

  function maintenantLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
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

  /* Régularité : ÉCART MOYEN à la moyenne, pas écart type.
     L'écart type est la mesure canonique mais elle ne se lit pas : personne ne
     sait ce que vaut un sigma de 1,2. L'écart moyen se dit en français exact,
     "tes tasses s'écartent en moyenne de 1,2 point de ta moyenne", et sur une
     poignée de notes les deux donnent de toute façon des chiffres très proches.
     Clarté avant orthodoxie statistique. */
  function ecartMoyen(liste) {
    if (liste.length < 2) return null;
    const m = liste.reduce((a, b) => a + b, 0) / liste.length;
    return liste.reduce((a, n) => a + Math.abs(n - m), 0) / liste.length;
  }

  function moyenne(liste) {
    if (!liste.length) return null;
    return liste.reduce((a, b) => a + b, 0) / liste.length;
  }

  // Recettes vivantes (éditables, stockées avec les données).
  function recettesVivantes() { return DATA.state.recettes.filter(r => r.actif !== 0); }
  function recettesDeMethode(m) { return recettesVivantes().filter(r => r.methode === m); }
  function trouverRecette(nom) { return DATA.state.recettes.find(r => r.nom === nom); }
  function recetteAvecVariantes() { return recettesVivantes().find(r => r.variantes); }

  // Attribut title : la valeur complete d'une cellule tronquee, au survol.
  // Les guillemets doubles casseraient l'attribut, on les neutralise.
  function attrTitre(texte) {
    return String(texte || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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

  function extAvecCalculs() {
    return DATA.state.extractions.map(e => ({ ...e, _c: DATA.calculs(e) }));
  }

  // Dose prise quand rien ne la preremplit (recette sans dose, formulaire
  // vierge). 15 g est la dose de toutes les recettes Switch d'origine.
  const DOSE_REPLI_USINE = 15;

  // Puissance de feu par défaut, échelle personnelle de 1 à 10, Brikka seulement.
  const FEU_REPLI_USINE = 2;

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
  const replis = { dose: DOSE_REPLI_USINE, feu: FEU_REPLI_USINE, molette: MOLETTE_REPLI_USINE };

  function chargerReplis() {
    const r = DATA.reglagesCourants();
    replis.dose = r.dose_g;
    replis.feu = r.puissance_feu;
    replis.molette = r.mouture_dial;
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
    });
  }

  // ---------- Thème ----------

  function appliquerTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) { /* indisponible, tant pis */ }
    /* La barre d'état de la PWA installée suit le thème. Les deux balises du
       <head> ne connaissent que la préférence du système, et le navigateur
       retient celle dont le media correspond : on écrit donc la couleur choisie
       dans les DEUX, sinon celle qu'il retient contredirait le choix. */
    const teinte = theme === "sombre" ? "#171009" : "#f8f2e9";
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
     figée sur sa valeur du chargement.

     Le drapeau d'ouverture est vrai UNIQUEMENT pendant que
     chargerExtractionDansSaisie ouvre l'écran, pour que l'abandon d'édition ne
     casse pas la modification qu'on vient justement de demander. */
  const nav = { ecran: "tableau", ouvertureEdition: false };

  /* Enveloppe un changement d'écran dans une transition de vue quand le moteur
     sait le faire. Sinon on appelle directement : le repli est le comportement
     d'avant, pas une version dégradée.

     On respecte aussi le mouvement réduit ici et pas seulement en CSS : lancer la
     machinerie pour l'annuler ensuite serait du travail pour rien. */
  function avecTransition(fn) {
    const bouge = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (bouge || !document.startViewTransition) { fn(); return; }
    document.startViewTransition(fn);
  }

  function activerEcran(nom) {
    /* Arriver sur Saisie par la navigation veut dire "je veux noter une tasse",
       jamais "reprends la modification d'il y a dix minutes". On abandonne donc
       l'edition en cours, et on le DIT : sans le message, l'abandon serait aussi
       silencieux que le bug qu'il corrige. Rien n'est perdu en base, l'extraction
       modifiee n'avait pas ete enregistree et reste ouvrable depuis l'historique. */
    if (nom === "saisie" && UI.saisie.editId && !nav.ouvertureEdition) {
      UI.reinitialiserSaisie();
      toast(I18N.t("t_edition_abandonnee"));
    }
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
    if (nav.ecran === "tableau") UI.rendreTableau();
    else if (nav.ecran === "reglages") UI.rendreReglages();
    else if (nav.ecran === "historique") UI.rendreHistorique();
    else if (nav.ecran === "parametres") UI.rendreParametres();
    else if (nav.ecran === "guide" && force) UI.rendreConvertisseur();
  }

  return {
    $, $$, $f, APPUI_LONG_MS, CLE_REPLIS, DOSE_REPLI_USINE, ECRANS, ECRANS_RENOMMES,
    FEU_REPLI_USINE, MOLETTE_REPLI_USINE, activerAppuiLong, activerEcran, animerCompteur,
    antiRebond, appliquerTheme, attrTitre, avecTransition, basculerEtat, cacheChamps,
    chargerReplis, cleLocale, detailRatio, diagsAffiches, ecartMoyen, ecrireReplis,
    extAvecCalculs, fmtDateCourte, fmtDateHeure, fmtDecimal, fmtTemps, fmtVND,
    maintenantLocal, moyenne, nav, normaliserEcran, oublierSignatures, poser, poserTexte,
    recetteAvecVariantes, recettesDeMethode, recettesVivantes, rendreEcranCourant, replis,
    reprendreReplisLocaux, siChange, signatureTable, signatures,
    supprimerExtractionAvecRetour, toast, toastAction, trouverRecette,
  };
})();
