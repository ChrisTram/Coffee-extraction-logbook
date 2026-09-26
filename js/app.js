/* Application : liaison des données, câblage des écouteurs, démarrage.
 *
 * Ce fichier se charge en DERNIER et ne définit presque rien : il branche des
 * fonctions définies ailleurs sur des éléments du document, puis lance le
 * démarrage. S'il se met à contenir de la logique d'écran, c'est qu'elle est au
 * mauvais endroit. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, ECRANS, activerAppuiLong, activerEcran, antiRebond, appliquerTheme, basculerEtat,
    chargerReplis, ecrireReplis, nav, normaliserEcran, oublierSignatures, recettesVivantes,
    rendreEcranCourant, replis, reprendreReplisLocaux, siChange,
    supprimerExtractionAvecRetour, toast, trouverRecette } = UI;

  // ---------- Données : liaison, import, export ----------

  function majBadges() {
    $("#badge-demo").hidden = !DATA.state.demoActive;
    const lie = !!DATA.state.dirHandle;
    $("#badge-fichier").hidden = !lie;
    // « À réautoriser » quand le navigateur a repris la permission (v8.72) ; toucher le badge la redemande.
    if (lie) $("#badge-fichier-nom").textContent = DATA.state.fichierAReautoriser ? I18N.t("f_reautoriser") : DATA.state.dirHandle.name;
  }

  function majStatutDonnees() {
    $("#don-delier").hidden = !DATA.state.dirHandle;
    let s;
    if (DATA.state.dirHandle) s = I18N.t("statut_lie", { n: DATA.state.dirHandle.name });
    else if (DATA.state.demoActive) s = I18N.t("statut_demo");
    else s = I18N.t("statut_nav");
    $("#donnees-statut").textContent = s +
      I18N.t("statut_compte", { c: DATA.state.cafes.length, e: DATA.state.extractions.length });
    majStatutSync();
  }

  // Une ligne d'état pour la synchro entre appareils. Le bouton manuel n'apparaît
  // que là où la synchro a un sens, donc pas en file:// ni en démo.
  const LIBELLES_SYNC = {
    local: "sync_local",
    demo: "sync_demo",
    encours: "sync_encours",
    "hors-ligne": "sync_horsligne",
    "session-expiree": "sync_session",
    "non-configuree": "sync_nonconf",
    "version-perimee": "sync_perimee",
    erreur: "sync_erreur",
  };

  function majStatutSync() {
    const etat = DATA.state.syncEtat;
    let texte;
    if (etat === "ok") {
      texte = I18N.t("sync_ok", {
        h: new Date(DATA.state.syncLe).toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
      });
    } else {
      texte = I18N.t(LIBELLES_SYNC[etat] || "sync_jamais");
    }
    // Le document serveur a un plafond : on prévient à la moitié, assez tôt pour archiver.
    const { syncTaille: taille, syncPlafond: plafond } = DATA.state;
    if (plafond > 0 && taille / plafond >= 0.5) {
      texte += " " + I18N.t("sync_taille", { p: Math.round(100 * taille / plafond) });
    }
    $$(".sync-texte").forEach(e => { e.textContent = texte; });
    /* Le point du rail prend la couleur de l'etat : c'est le seul endroit ou la
       synchro est visible sans ouvrir un panneau. */
    const point = $(".rail-point");
    if (point) point.dataset.etat = DATA.state.syncEtat || "jamais";
    $("#don-sync").hidden = !DATA.syncPossible();
  }

  async function actionLier(creer) {
    if (!DATA.state.fsDisponible) {
      toast(I18N.t("t_fs"));
      $("#don-note-fs").hidden = false;
      return;
    }
    try {
      const nom = await DATA.lierDossier(creer);
      toast(I18N.t("t_dossier", { n: nom }));
      $("#modale-donnees").close();
      $("#modale-accueil").close();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e.message || I18N.t("t_liaison"));
    }
  }

  // ---------- Câblage ----------

  /* La feuille « Plus » du téléphone (le rail, sans effet au-delà de 1024 px).
     Fermée, elle est inerte au clavier ; ouverte, le focus la suit (v8.76). */
  const enFeuille = () => typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  function majInertie() {
    const rail = $("#rail");
    if (rail) rail.inert = enFeuille() && !rail.classList.contains("ouverte");
  }
  function basculerFeuilleNav(ouvrir) {
    const rail = $("#rail");
    if (!rail) return;
    rail.classList.toggle("ouverte", !!ouvrir);
    $("#voile-nav").hidden = !ouvrir;
    $("#btn-plus").setAttribute("aria-expanded", ouvrir ? "true" : "false");
    majInertie();
    if (!enFeuille()) return;
    if (ouvrir) { const e = [...rail.querySelectorAll("button")].find(b => b.offsetParent !== null); if (e) e.focus(); }
    else if (rail.contains(document.activeElement)) $("#btn-plus").focus();
  }

  function cabler() {
    majInertie();
    if (typeof matchMedia === "function") matchMedia("(max-width: 1023px)").addEventListener("change", majInertie);
    // Navigation
    $$(".nav-btn").forEach(b => b.addEventListener("click", () => {
      activerEcran(b.dataset.ecran);
      /* Sur telephone le rail EST la feuille « Plus » : choisir un ecran doit la
         refermer, sinon elle masque celui qu'on vient d'ouvrir. */
      basculerFeuilleNav(false);
    }));

    /* La feuille « Plus » du telephone. Le rail et elle sont le meme element :
       voir le commentaire de la navigation dans index.html. */
    $("#btn-plus").addEventListener("click", () => {
      basculerFeuilleNav(!$("#rail").classList.contains("ouverte"));
    });
    $("#voile-nav").addEventListener("click", () => basculerFeuilleNav(false));

    // La marque du rail ramene au tableau de bord. On garde le href pour le
    // clavier et l'ouverture dans un onglet, mais un clic simple bascule d'ecran.
    const lienMarque = $(".rail-marque");
    if (lienMarque) {
      lienMarque.addEventListener("click", ev => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        activerEcran("tableau");
      });
    }
    $$("[data-va]").forEach(b => b.addEventListener("click", () => activerEcran(b.dataset.va)));
    // Le calendrier compte ses semaines sur la largeur de sa carte : il se refait au redimensionnement (anti rebond).
    window.addEventListener("resize", antiRebond(() => {
      if (nav.ecran === "tableau") UI.rendreTableau();
    }, 200));

    // L'historique change de forme à 1024 px (table ou cartes) : matchMedia, un seul événement au seuil.
    if (typeof matchMedia === "function") {
      const seuil = matchMedia("(max-width: 1023px)");
      const suivre = () => { if (nav.ecran === "historique") UI.rendreHistorique(); };
      if (seuil.addEventListener) seuil.addEventListener("change", suivre);
    }

    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (h === "refaire") { ouvrirRefaire(); return; }
      const cible = normaliserEcran(h);
      if (ECRANS.includes(cible) && cible !== nav.ecran) activerEcran(cible);
    });

    /* Thème : un seul bouton fait le tour clair, Graphite, Nuit, puis clair. */
    $("#btn-theme").addEventListener("click", () => {
      const racine = document.documentElement;
      if (racine.getAttribute("data-theme") !== "sombre") appliquerTheme("sombre", "graphite");
      else if (racine.getAttribute("data-sombre") !== "nuit") appliquerTheme("sombre", "nuit");
      else appliquerTheme("clair");
    });

    // Langue
    $("#btn-lang").addEventListener("click", () => I18N.basculer());
    I18N.abonner(rafraichirLangue);

    /* Chaque écran câble ses propres contrôles ; il ne reste ici que ce qui
       n'appartient à aucun écran (navigation, thème, langue, modales, réflexes). */
    UI.cablerTableau();
    UI.cablerSaisie();
    UI.cablerRapide();
    UI.cablerHistorique();
    UI.cablerGuide();
    UI.cablerCatalogue();
    UI.cablerFiche();
    UI.cablerBrassage();
    UI.cablerDessins();

    // Reprise quand le réseau revient (DATA.synchroniser gère une synchro déjà en cours).
    window.addEventListener("online", () => {
      if (DATA.syncPossible()) DATA.synchroniser(false);
    });
    // Au retour sur l'appli (v8.71) : un téléphone rouvert se remet à jour tout de suite.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && DATA.syncPossible()) DATA.synchroniser(false);
    });
    /* Une écriture locale ratée ne passe plus en silence (v8.71). */
    let stockageSignale = false;
    window.addEventListener("carnet-stockage-ko", () => {
      if (stockageSignale) return;
      stockageSignale = true;
      toast(I18N.t("t_stockage_ko"));
    });
    /* Le serveur connaît une version plus récente : on propose de recharger. */
    let perimeeSignalee = false;
    DATA.abonner(() => {
      if (DATA.state.syncEtat !== "version-perimee" || perimeeSignalee) return;
      perimeeSignalee = true;
      UI.toastAction(I18N.t("sync_perimee"), I18N.t("maj_recharger"), () => location.reload());
    });

    // Échap ferme aussi ce qui n'est pas un <dialog> : panneau rapide, formulaires dépliés, bulles.
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if ($("#rail").classList.contains("ouverte")) { basculerFeuilleNav(false); return; }
      if (UI.rapideEstOuvert()) { UI.basculerRapide(false); return; }
      const ouverts = ["#form-cafe", "#form-sachet", "#form-recette"]
        .map(s => $(s)).filter(x => x && !x.hidden);
      if (ouverts.length) { ouverts.forEach(x => { x.hidden = true; }); return; }
      // Une bulle d'aide ouverte au doigt se ferme aussi, avant tout le reste.
      $$(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    });

    // Modales génériques
    // Le badge du dossier lié redemande la permission quand elle est partie (v8.72).
    $("#badge-fichier").addEventListener("click", async () => {
      if (!DATA.state.fichierAReautoriser) return;
      toast(I18N.t(await DATA.reautoriserDossier() ? "f_reautorise" : "f_refuse"));
      majBadges();
    });
    // Tout bouton Fermer ferme sa fenêtre, même sans data-ferme (v8.72) : celui de la comparaison ne faisait rien.
    $$(".modale-fermer").forEach(b => b.addEventListener("click", () => (b.dataset.ferme ? $("#" + b.dataset.ferme) : b.closest("dialog")).close()));

    // Accueil
    $("#acc-creer").addEventListener("click", () => actionLier(true));
    $("#acc-ouvrir").addEventListener("click", () => actionLier(false));
    // Trois boutons chargent la démonstration (accueil, panneau Données, tableau de bord vide) : une seule fonction.
    const chargerLaDemo = async () => {
      await DATA.chargerDemo();
      $("#modale-accueil").close();
      toast(I18N.t("t_demo"));
    };
    $("#acc-demo").addEventListener("click", chargerLaDemo);
    $("#btn-demo-vide").addEventListener("click", chargerLaDemo);
    $("#acc-plus-tard").addEventListener("click", () => $("#modale-accueil").close());

    // Données
    $("#btn-donnees").addEventListener("click", () => {
      majStatutDonnees();
      const fsOk = DATA.state.fsDisponible;
      $("#don-note-fs").hidden = fsOk;
      $("#don-lier").disabled = !fsOk;
      $("#don-ouvrir").disabled = !fsOk;
      $("#modale-donnees").showModal();
    });
    $("#don-lier").addEventListener("click", () => actionLier(true));
    $("#don-ouvrir").addEventListener("click", () => actionLier(false));
    $("#don-importer").addEventListener("click", () => $("#don-fichier").click());
    $("#don-fichier").addEventListener("change", async ev => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        /* Un aperçu AVANT d'importer (v8.71) : la table reconnue, et ce qui
           arrive, change ou se crée. Rien n'est écrit sans « Importer ». */
        const texte = await f.text();
        const a = DATA.analyserImport(texte);
        const nomTable = I18N.t("tbl_" + a.table);
        const detail = a.table === "tout"
          ? I18N.t("imp_apercu_tout", { n: a.n })
          : I18N.t("imp_apercu", { n: a.n, t: nomTable, nv: a.nouvelles, md: a.modifiees }) +
            (a.sansId ? " " + I18N.t("imp_sans_id", { n: a.sansId }) : "") +
            (a.doublons ? " " + I18N.t("imp_doublons", { n: a.doublons }) : "");
        if (!await UI.confirmer(detail, { libelle: I18N.t("imp_ok") })) { ev.target.value = ""; return; }
        const res = await DATA.importerTexteCSV(texte);
        toast(I18N.t("t_import", { n: res.n, t: nomTable }));
        majStatutDonnees();
      } catch (e) { toast(e.message); }
      ev.target.value = "";
    });
    // Les six tables et le fichier complet réimportable (v8.71), plus trois.
    $("#don-exporter").addEventListener("click", () => {
      DATA.exporterTout();
      toast(I18N.t("t_export_tout"));
    });
    $("#don-demo").addEventListener("click", async () => {
      if (DATA.state.extractions.length && !await UI.confirmer(I18N.t("c_demo"))) return;
      await DATA.chargerDemo();
      majStatutDonnees();
      toast(I18N.t("t_demo"));
    });
    // Délier le dossier (v8.77) : la fonction existait sans bouton.
    $("#don-delier").addEventListener("click", async () => { await DATA.delierDossier(); majStatutDonnees(); majBadges(); toast(I18N.t("t_delie")); });
    $("#don-vider").addEventListener("click", async () => {
      if (!await UI.confirmer(I18N.t("c_vider"), { danger: true })) return;
      await DATA.viderDonnees();
      majStatutDonnees();
      toast(I18N.t("t_reinit"));
    });
    $("#don-sync").addEventListener("click", async () => {
      const etat = await DATA.synchroniser(true);
      toast(I18N.t(etat === "ok" ? "t_sync_ok" : "t_sync_ko"));
    });

    // Les changements de données rafraîchissent l'interface.
    DATA.abonner(genre => {
      // Un changement d'état de la synchro seul ne redessine que sa pastille (v8.75).
      if (genre === "sync") { majBadges(); majStatutSync(); return; }
      // Les réglages peuvent arriver d'un autre appareil : on relit avant de rendre.
      chargerReplis();
      // Toujours : ces deux là sont minuscules et reflètent l'état courant.
      majBadges();
      majStatutSync();
      // Le reste ne se refait que si sa table a bougé (une tasse ne change ni cafés, ni recettes, ni tasses).
      const cafes = DATA.state.cafes, recettes = DATA.state.recettes;
      siChange("cafes", cafes, () => { UI.remplirSelectCafes(); remplirSelectRecetteReco(); });
      siChange("filtres", DATA.state.extractions, UI.remplirFiltres);
      siChange("recettes", recettes, () => {
        UI.remplirSelectRecettes();
        UI.rendreRecettes();
      });
      siChange("tasses", DATA.state.tasses, UI.remplirSelectTasses);
      if (UI.rapideEstOuvert()) UI.majPanneauRapide();
      rendreEcranCourant();
    });
  }

  /* Le raccourci « Refaire ma dernière tasse » de l'icône (manifest.json) ouvre
     ./#refaire : la saisie préremplie avec les réglages de la dernière tasse. */
  function ouvrirRefaire() {
    toast(I18N.t(UI.refaireDerniere() ? "t_refaire" : "t_refaire_vide"));
  }

  function remplirSelectRecetteReco() {
    const sel = $("#c-recette");
    const v = sel.value;
    sel.innerHTML = '<option value="">' + I18N.t("aucune") + "</option>" +
      recettesVivantes().map(r => "<option>" + r.nom + "</option>").join("");
    if (v && trouverRecette(v)) sel.value = v;
  }

  // Bascule de langue : re-rend tout ce qui est généré en JavaScript.
  function rafraichirLangue() {
    // Les données n'ont pas bougé, tout le TEXTE si : on invalide les mémoires.
    oublierSignatures();
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    UI.construirePilules();
    $$("#f-diagnostic .pilule").forEach(x => basculerEtat(x, UI.saisie.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => basculerEtat(x, UI.saisie.descripteurs.has(x.dataset.tag)));
    UI.majCorrectionDiagnostic();
    UI.majBoutonsChrono();
    UI.majEtapesChrono(false);
    $("#saisie-titre").textContent = UI.saisie.editId ? I18N.t("s_modifier") : I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = UI.saisie.editId ? I18N.t("s_enregistrer_modif") : I18N.t("s_enregistrer");
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    UI.remplirSelectRecettes();
    remplirSelectRecetteReco();
    UI.remplirSelectTasses();
    UI.rendreRecettes();
    UI.rendreTablePlages();
    UI.rendreConvertisseur();
    majBadges();
    UI.majLait();
    UI.majLive();
    UI.majAvertissements();
    // Le libelle "pas encore notee" est genere : il ne suit pas le TreeWalker.
    UI.majAffichageNote();
    if (UI.rapideEstOuvert()) UI.majPanneauRapide();
    rendreEcranCourant(true);
  }

  // ---------- Démarrage ----------

  /* Version du pied de page, lue dans <meta name="app-version"> (posée par
     tools/bump_version.mjs) : dit quelle version tourne sur un appareil donné. */
  const VERSION = OUTILS.versionSite() || "dev";

  async function demarrer() {
    /* AVANT tout rendu : si Chris avait laissé le site en anglais, le paquet de
       traduction doit être là, sinon la page s'afficherait en français puis
       clignoterait. Ne fait rien du tout en français, le cas normal. */
    await I18N.preparer(I18N.langueSouhaitee());
    I18N.appliquerStatique();
    $("#version-site").textContent = "v" + VERSION;
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    CHARTS.appliquerDefauts();
    UI.construirePilules();
    cabler();
    UI.rendreTablePlages();

    // Un stockage qui ne s'ouvre pas ne bloque plus l'écran de chargement (v8.72) : le carnet part en mémoire.
    let aDesDonnees = false;
    try { aDesDonnees = await DATA.init(); } catch (e) { console.error(e); toast(I18N.t("t_stockage_ko")); }
    majBadges();
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    UI.remplirSelectRecettes();
    remplirSelectRecetteReco();
    UI.remplirSelectTasses();
    UI.rendreRecettes();
    try { $("#chrono-bip").checked = localStorage.getItem("bips") !== "0"; } catch (e) { /* tant pis */ }
    // AVANT tout ce qui lit replis : le convertisseur et la saisie en dependent.
    await reprendreReplisLocaux();
    chargerReplis();
    UI.rendreReperesMouture();
    UI.rendreConvertisseur();
    UI.choisirMethode("Brikka");
    UI.reinitialiserSaisie();
    if (UI.restaurerBrouillon()) toast(I18N.t("t_brouillon"));

    const h = location.hash.slice(1);
    if (h === "refaire") ouvrirRefaire();
    else activerEcran(ECRANS.includes(normaliserEcran(h)) ? normaliserEcran(h) : "tableau");

    // Le premier écran est rendu : le voile de chargement n'a plus de raison d'être.
    const voile = $("#chargement");
    if (voile) voile.remove();

    // Le système relâche le verrou d'écran quand l'onglet part en arrière plan.
    // Au retour, si le chrono tourne toujours, on le reprend.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") UI.syncWakeLock();
    });

    // Service worker, et le message quand une nouvelle version est prête.
    UI.surveillerMisesAJour();

    /* Données locales d'abord, synchro ensuite (v8.72) : l'accueil et sa démo
       n'apparaissent que si, après la synchro, il n'y a toujours rien. */
    const accueilSiVide = () => {
      if (DATA.state.cafes.length || DATA.state.extractions.length) return;
      if (!DATA.state.fsDisponible) {
        $("#acc-note-fs").hidden = false;
        $("#acc-creer").disabled = true;
        $("#acc-ouvrir").disabled = true;
      }
      $("#modale-accueil").showModal();
    };
    if (DATA.syncPossible()) DATA.synchroniser(false).then(accueilSiVide);
    else if (!aDesDonnees) accueilSiVide();
  }

  document.addEventListener("DOMContentLoaded", demarrer);

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    LIBELLES_SYNC, VERSION, actionLier, cabler, demarrer, majBadges, majStatutDonnees,
    majStatutSync, rafraichirLangue, remplirSelectRecetteReco,
  });
})();
