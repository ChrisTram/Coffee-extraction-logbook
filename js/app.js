/* Application: data binding, listener wiring, startup.
 *
 * This file loads LAST and defines almost nothing: it plugs functions
 * defined elsewhere into document elements, then starts the app. If it
 * starts to contain screen logic, that logic is in the wrong place. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, ECRANS, activerAppuiLong, activerEcran, antiRebond, appliquerTheme, basculerEtat,
    chargerReplis, ecrireReplis, nav, normaliserEcran, oublierSignatures, recettesVivantes,
    rendreEcranCourant, replis, reprendreReplisLocaux, siChange,
    supprimerExtractionAvecRetour, toast, trouverRecette } = UI;

  // ---------- Data: binding, import, export ----------

  function majBadges() {
    $("#badge-demo").hidden = !DATA.state.demoActive;
    const linked = !!DATA.state.dirHandle;
    $("#badge-fichier").hidden = !linked;
    // "Re-authorise" when the browser took the permission back (v8.72); tapping the badge asks again.
    if (linked) $("#badge-fichier-nom").textContent = DATA.state.fichierAReautoriser ? I18N.t("f_reautoriser") : DATA.state.dirHandle.name;
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

  // A status line for sync between devices. The manual button only appears
  // where sync makes sense, so not on file:// nor in demo mode.
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
    const syncState = DATA.state.syncEtat;
    let text;
    if (syncState === "ok") {
      text = I18N.t("sync_ok", {
        h: new Date(DATA.state.syncLe).toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
      });
    } else {
      text = I18N.t(LIBELLES_SYNC[syncState] || "sync_jamais");
    }
    // The server document has a cap: we warn at half, early enough to archive.
    const { syncTaille: size, syncPlafond: cap } = DATA.state;
    if (cap > 0 && size / cap >= 0.5) {
      text += " " + I18N.t("sync_taille", { p: Math.round(100 * size / cap) });
    }
    $$(".sync-texte").forEach(e => { e.textContent = text; });
    /* The rail dot takes the colour of the state: it is the only place where
       sync is visible without opening a panel. */
    const dot = $(".rail-point");
    if (dot) dot.dataset.etat = DATA.state.syncEtat || "jamais";
    $("#don-sync").hidden = !DATA.syncPossible();
  }

  async function actionLier(create) {
    if (!DATA.state.fsDisponible) {
      toast(I18N.t("t_fs"));
      $("#don-note-fs").hidden = false;
      return;
    }
    try {
      const name = await DATA.lierDossier(create);
      toast(I18N.t("t_dossier", { n: name }));
      $("#modale-donnees").close();
      $("#modale-accueil").close();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e.message || I18N.t("t_liaison"));
    }
  }

  // ---------- Wiring ----------

  /* The phone's "More" sheet (the rail, no effect above 1024 px).
     Closed, it is inert to the keyboard; open, focus follows it (v8.76). */
  const enFeuille = () => typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  function updateInertia() {
    const rail = $("#rail");
    if (rail) rail.inert = enFeuille() && !rail.classList.contains("ouverte");
  }
  function toggleNavSheet(open) {
    const rail = $("#rail");
    if (!rail) return;
    rail.classList.toggle("ouverte", !!open);
    $("#voile-nav").hidden = !open;
    $("#btn-plus").setAttribute("aria-expanded", open ? "true" : "false");
    updateInertia();
    if (!enFeuille()) return;
    if (open) { const e = [...rail.querySelectorAll("button")].find(b => b.offsetParent !== null); if (e) e.focus(); }
    else if (rail.contains(document.activeElement)) $("#btn-plus").focus();
  }

  function cabler() {
    updateInertia();
    if (typeof matchMedia === "function") matchMedia("(max-width: 1023px)").addEventListener("change", updateInertia);
    // Navigation
    $$(".nav-btn").forEach(b => b.addEventListener("click", () => {
      activerEcran(b.dataset.ecran);
      /* On a phone the rail IS the "More" sheet: picking a screen must close
         it, otherwise it hides the screen that was just opened. */
      toggleNavSheet(false);
    }));

    /* The phone's "More" sheet. The rail and the sheet are the same element:
       see the navigation comment in index.html. */
    $("#btn-plus").addEventListener("click", () => {
      toggleNavSheet(!$("#rail").classList.contains("ouverte"));
    });
    $("#voile-nav").addEventListener("click", () => toggleNavSheet(false));

    // The rail brand leads back to the dashboard. We keep the href for the
    // keyboard and opening in a tab, but a plain click switches screens.
    const brandLink = $(".rail-marque");
    if (brandLink) {
      brandLink.addEventListener("click", ev => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        activerEcran("tableau");
      });
    }
    $$("[data-va]").forEach(b => b.addEventListener("click", () => activerEcran(b.dataset.va)));
    // The calendar counts its weeks over its card width: it redraws on resize (debounced).
    window.addEventListener("resize", antiRebond(() => {
      if (nav.ecran === "tableau") UI.rendreTableau();
    }, 200));

    // History changes shape at 1024 px (table or cards): matchMedia, one single event at the threshold.
    if (typeof matchMedia === "function") {
      const breakpoint = matchMedia("(max-width: 1023px)");
      const follow = () => { if (nav.ecran === "historique") UI.rendreHistorique(); };
      if (breakpoint.addEventListener) breakpoint.addEventListener("change", follow);
    }

    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (h === "refaire") { openRedo(); return; }
      const target = normaliserEcran(h);
      if (ECRANS.includes(target) && target !== nav.ecran) activerEcran(target);
    });

    /* Theme: a single button cycles light, Graphite, Night, then light. */
    $("#btn-theme").addEventListener("click", () => {
      const root = document.documentElement;
      if (root.getAttribute("data-theme") !== "sombre") appliquerTheme("sombre", "graphite");
      else if (root.getAttribute("data-sombre") !== "nuit") appliquerTheme("sombre", "nuit");
      else appliquerTheme("clair");
    });

    // Language
    $("#btn-lang").addEventListener("click", () => I18N.basculer());
    I18N.abonner(rafraichirLangue);

    /* Each screen wires its own controls; all that remains here is what
       belongs to no screen (navigation, theme, language, modals, reflexes). */
    UI.cablerTableau();
    UI.cablerSaisie();
    UI.cablerRapide();
    UI.cablerHistorique();
    UI.cablerGuide();
    UI.cablerCatalogue();
    UI.cablerFiche();
    UI.cablerBrassage();
    UI.cablerDessins();

    // Resume when the network comes back (DATA.synchroniser handles a sync already in progress).
    window.addEventListener("online", () => {
      if (DATA.syncPossible()) DATA.synchroniser(false);
    });
    // On returning to the app (v8.71): a reopened phone updates right away.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && DATA.syncPossible()) DATA.synchroniser(false);
    });
    /* A failed local write no longer goes unnoticed (v8.71). */
    let storageWarned = false;
    window.addEventListener("carnet-stockage-ko", () => {
      if (storageWarned) return;
      storageWarned = true;
      toast(I18N.t("t_stockage_ko"));
    });
    /* The server knows a more recent version: we offer to reload. */
    let staleWarned = false;
    DATA.abonner(() => {
      if (DATA.state.syncEtat !== "version-perimee" || staleWarned) return;
      staleWarned = true;
      UI.toastAction(I18N.t("sync_perimee"), I18N.t("maj_recharger"), () => location.reload());
    });

    // Escape also closes what is not a <dialog>: quick panel, expanded forms, bubbles.
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if ($("#rail").classList.contains("ouverte")) { toggleNavSheet(false); return; }
      if (UI.rapideEstOuvert()) { UI.basculerRapide(false); return; }
      const openForms = ["#form-cafe", "#form-sachet", "#form-recette"]
        .map(s => $(s)).filter(x => x && !x.hidden);
      if (openForms.length) { openForms.forEach(x => { x.hidden = true; }); return; }
      // A help bubble opened by finger closes too, before anything else.
      $$(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    });

    // Generic modals
    // The linked folder badge asks for permission again when it is gone (v8.72).
    $("#badge-fichier").addEventListener("click", async () => {
      if (!DATA.state.fichierAReautoriser) return;
      toast(I18N.t(await DATA.reautoriserDossier() ? "f_reautorise" : "f_refuse"));
      majBadges();
    });
    // Every Close button closes its window, even without data-ferme (v8.72): the comparison one did nothing.
    $$(".modale-fermer").forEach(b => b.addEventListener("click", () => (b.dataset.ferme ? $("#" + b.dataset.ferme) : b.closest("dialog")).close()));

    // Welcome
    $("#acc-creer").addEventListener("click", () => actionLier(true));
    $("#acc-ouvrir").addEventListener("click", () => actionLier(false));
    // Three buttons load the demo (welcome, Data panel, empty dashboard): one single function.
    const loadDemo = async () => {
      await DATA.chargerDemo();
      $("#modale-accueil").close();
      toast(I18N.t("t_demo"));
    };
    $("#acc-demo").addEventListener("click", loadDemo);
    $("#btn-demo-vide").addEventListener("click", loadDemo);
    $("#acc-plus-tard").addEventListener("click", () => $("#modale-accueil").close());

    // Data
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
        /* A preview BEFORE importing (v8.71): the recognised table, and what
           arrives, changes or gets created. Nothing is written without "Import". */
        const text = await f.text();
        const a = DATA.analyserImport(text);
        const tableName = I18N.t("tbl_" + a.table);
        const detail = a.table === "tout"
          ? I18N.t("imp_apercu_tout", { n: a.n })
          : I18N.t("imp_apercu", { n: a.n, t: tableName, nv: a.nouvelles, md: a.modifiees }) +
            (a.sansId ? " " + I18N.t("imp_sans_id", { n: a.sansId }) : "") +
            (a.doublons ? " " + I18N.t("imp_doublons", { n: a.doublons }) : "");
        if (!await UI.confirmer(detail, { libelle: I18N.t("imp_ok") })) { ev.target.value = ""; return; }
        const res = await DATA.importerTexteCSV(text);
        toast(I18N.t("t_import", { n: res.n, t: tableName }));
        majStatutDonnees();
      } catch (e) { toast(e.message); }
      ev.target.value = "";
    });
    // The six tables and the full re-importable file (v8.71), plus three.
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
    // Unlink the folder (v8.77): the function existed without a button.
    $("#don-delier").addEventListener("click", async () => { await DATA.delierDossier(); majStatutDonnees(); majBadges(); toast(I18N.t("t_delie")); });
    $("#don-vider").addEventListener("click", async () => {
      if (!await UI.confirmer(I18N.t("c_vider"), { danger: true })) return;
      await DATA.viderDonnees();
      majStatutDonnees();
      toast(I18N.t("t_reinit"));
    });
    $("#don-sync").addEventListener("click", async () => {
      const result = await DATA.synchroniser(true);
      toast(I18N.t(result === "ok" ? "t_sync_ok" : "t_sync_ko"));
    });

    // Data changes refresh the interface.
    DATA.abonner(genre => {
      // A sync state change alone only redraws its badge (v8.75).
      if (genre === "sync") { majBadges(); majStatutSync(); return; }
      // Settings may arrive from another device: we reread before rendering.
      chargerReplis();
      // Always: these two are tiny and reflect the current state.
      majBadges();
      majStatutSync();
      // The rest is only redone if its table moved (a cup changes neither coffees, nor recipes, nor cups).
      const cafes = DATA.state.cafes, recipes = DATA.state.recettes;
      siChange("cafes", cafes, () => { UI.remplirSelectCafes(); remplirSelectRecetteReco(); });
      siChange("filtres", DATA.state.extractions, UI.remplirFiltres);
      siChange("recettes", recipes, () => {
        UI.remplirSelectRecettes();
        UI.rendreRecettes();
      });
      siChange("tasses", DATA.state.tasses, UI.remplirSelectTasses);
      if (UI.rapideEstOuvert()) UI.majPanneauRapide();
      rendreEcranCourant();
    });
  }

  /* The icon's "Redo my last cup" shortcut (manifest.json) opens
     ./#refaire: the entry form prefilled with the last cup's settings. */
  function openRedo() {
    toast(I18N.t(UI.refaireDerniere() ? "t_refaire" : "t_refaire_vide"));
  }

  function remplirSelectRecetteReco() {
    const sel = $("#c-recette");
    const v = sel.value;
    sel.innerHTML = '<option value="">' + I18N.t("aucune") + "</option>" +
      recettesVivantes().map(r => "<option>" + r.nom + "</option>").join("");
    if (v && trouverRecette(v)) sel.value = v;
  }

  // Language switch: re-renders everything generated in JavaScript.
  function rafraichirLangue() {
    // The data has not moved, all the TEXT has: we invalidate the caches.
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
    // The "not rated yet" label is generated: the TreeWalker does not follow it.
    UI.majAffichageNote();
    if (UI.rapideEstOuvert()) UI.majPanneauRapide();
    rendreEcranCourant(true);
  }

  // ---------- Startup ----------

  /* Footer version, read from <meta name="app-version"> (set by
     tools/bump_version.mjs): tells which version runs on a given device. */
  const VERSION = OUTILS.versionSite() || "dev";

  async function demarrer() {
    /* BEFORE any rendering: if Chris had left the site in English, the
       translation pack must be there, otherwise the page would show in French
       then flicker. Does nothing at all in French, the normal case. */
    await I18N.preparer(I18N.langueSouhaitee());
    I18N.appliquerStatique();
    $("#version-site").textContent = "v" + VERSION;
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    CHARTS.appliquerDefauts();
    UI.construirePilules();
    cabler();
    UI.rendreTablePlages();

    // Storage that fails to open no longer blocks the loading screen (v8.72): the logbook runs in memory.
    let hasData = false;
    try { hasData = await DATA.init(); } catch (e) { console.error(e); toast(I18N.t("t_stockage_ko")); }
    majBadges();
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    UI.remplirSelectRecettes();
    remplirSelectRecetteReco();
    UI.remplirSelectTasses();
    UI.rendreRecettes();
    try { $("#chrono-bip").checked = localStorage.getItem("bips") !== "0"; } catch (e) { /* never mind */ }
    // BEFORE anything that reads replis: the converter and the entry form depend on it.
    await reprendreReplisLocaux();
    chargerReplis();
    UI.rendreReperesMouture();
    UI.rendreConvertisseur();
    UI.choisirMethode("Brikka");
    UI.reinitialiserSaisie();
    if (UI.restaurerBrouillon()) toast(I18N.t("t_brouillon"));

    const h = location.hash.slice(1);
    if (h === "refaire") openRedo();
    else activerEcran(ECRANS.includes(normaliserEcran(h)) ? normaliserEcran(h) : "tableau");

    // The first screen is rendered: the loading overlay has no reason to stay.
    const overlay = $("#chargement");
    if (overlay) overlay.remove();

    // The system releases the screen lock when the tab goes to the background.
    // On return, if the stopwatch is still running, we take it back.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") UI.syncWakeLock();
    });

    // Service worker, and the message when a new version is ready.
    UI.surveillerMisesAJour();

    /* Local data first, sync next (v8.72): the welcome screen and its demo
       only appear if, after the sync, there is still nothing. */
    const welcomeIfEmpty = () => {
      if (DATA.state.cafes.length || DATA.state.extractions.length) return;
      if (!DATA.state.fsDisponible) {
        $("#acc-note-fs").hidden = false;
        $("#acc-creer").disabled = true;
        $("#acc-ouvrir").disabled = true;
      }
      $("#modale-accueil").showModal();
    };
    if (DATA.syncPossible()) DATA.synchroniser(false).then(welcomeIfEmpty);
    else if (!hasData) welcomeIfEmpty();
  }

  document.addEventListener("DOMContentLoaded", demarrer);

  // Made available to the other screens.
  Object.assign(UI, {
    LIBELLES_SYNC, VERSION, actionLier, cabler, demarrer, majBadges, majStatutDonnees,
    majStatutSync, rafraichirLangue, remplirSelectRecetteReco,
  });
})();
