/* Application: data binding, listener wiring, startup.
 *
 * This file loads LAST and defines almost nothing: it plugs functions
 * defined elsewhere into document elements, then starts the app. If it
 * starts to contain screen logic, that logic is in the wrong place. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, SCREEN_NAMES, enableLongPress, activateScreen, debounce, applyTheme, setPressed,
    loadFallbacks, saveFallbacks, nav, normalizeScreen, forgetSignatures, liveRecipes,
    renderCurrentScreen, fallbacks, migrateLocalFallbacks, ifChanged,
    deleteExtractionWithUndo, toast, findRecipe } = UI;

  // ---------- Data: binding, import, export ----------

  function updateBadges() {
    $("#badge-demo").hidden = !DATA.state.demoActive;
    const linked = !!DATA.state.dirHandle;
    $("#badge-file").hidden = !linked;
    // "Re-authorise" when the browser took the permission back (v8.72); tapping the badge asks again.
    if (linked) $("#badge-file-name").textContent = DATA.state.fileNeedsReauth ? I18N.t("folder_reauthorize") : DATA.state.dirHandle.name;
  }

  function updateDataStatus() {
    $("#db-unlink").hidden = !DATA.state.dirHandle;
    let s;
    if (DATA.state.dirHandle) s = I18N.t("status_linked", { n: DATA.state.dirHandle.name });
    else if (DATA.state.demoActive) s = I18N.t("status_demo");
    else s = I18N.t("status_browser");
    $("#db-status").textContent = s +
      I18N.t("status_counts", { c: DATA.state.coffees.length, e: DATA.state.extractions.length });
    UI.updateSyncStatus();
  }

  /* The sync status line and its bean live in js/ui-sync-bean.js since v9.13. */

  async function linkAction(create) {
    if (!DATA.state.fsAvailable) {
      toast(I18N.t("toast_fs_unavailable"));
      $("#db-fs-note").hidden = false;
      return;
    }
    try {
      const name = await DATA.linkFolder(create);
      toast(I18N.t("toast_folder", { n: name }));
      $("#modal-data").close();
      $("#modal-welcome").close();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e.message || I18N.t("toast_link_failed"));
    }
  }

  // ---------- Wiring ----------

  /* The phone's "More" sheet (the rail, no effect above 1024 px).
     Closed, it is inert to the keyboard; open, focus follows it (v8.76). */
  const isSheetLayout = () => typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  function updateInertia() {
    const rail = $("#rail");
    if (rail) rail.inert = isSheetLayout() && !rail.classList.contains("expanded");
  }
  function toggleNavSheet(open) {
    const rail = $("#rail");
    if (!rail) return;
    rail.classList.toggle("expanded", !!open);
    $("#overlay-nav").hidden = !open;
    $("#btn-plus").setAttribute("aria-expanded", open ? "true" : "false");
    updateInertia();
    if (!isSheetLayout()) return;
    if (open) { const e = [...rail.querySelectorAll("button")].find(b => b.offsetParent !== null); if (e) e.focus(); }
    else if (rail.contains(document.activeElement)) $("#btn-plus").focus();
  }

  function wireApp() {
    updateInertia();
    if (typeof matchMedia === "function") matchMedia("(max-width: 1023px)").addEventListener("change", updateInertia);
    // Navigation
    $$(".nav-btn").forEach(b => b.addEventListener("click", () => {
      activateScreen(b.dataset.screen);
      /* On a phone the rail IS the "More" sheet: picking a screen must close
         it, otherwise it hides the screen that was just opened. */
      toggleNavSheet(false);
    }));

    /* The phone's "More" sheet. The rail and the sheet are the same element:
       see the navigation comment in index.html. */
    $("#btn-plus").addEventListener("click", () => {
      toggleNavSheet(!$("#rail").classList.contains("expanded"));
    });
    $("#overlay-nav").addEventListener("click", () => toggleNavSheet(false));
    // The bar's centre button and sliding mark (js/ui-nav.js), the finger on the curves (js/ui-scrub.js).
    UI.wireNav();
    UI.wireScrub();

    // The rail brand leads back to the dashboard. We keep the href for the
    // keyboard and opening in a tab, but a plain click switches screens.
    const brandLink = $(".rail-brand");
    if (brandLink) {
      brandLink.addEventListener("click", ev => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        activateScreen("dashboard");
      });
    }
    $$("[data-go]").forEach(b => b.addEventListener("click", () => activateScreen(b.dataset.go)));
    // The calendar counts its weeks over its card width: it redraws on resize (debounced).
    window.addEventListener("resize", debounce(() => {
      if (nav.screenName === "dashboard") UI.renderDashboard();
    }, 200));

    // History changes shape at 1024 px (table or cards): matchMedia, one single event at the threshold.
    if (typeof matchMedia === "function") {
      const breakpoint = matchMedia("(max-width: 1023px)");
      const follow = () => { if (nav.screenName === "history") UI.renderHistory(); };
      if (breakpoint.addEventListener) breakpoint.addEventListener("change", follow);
    }

    window.addEventListener("hashchange", () => {
      const target = normalizeScreen(location.hash.slice(1));
      if (target === "redo") { openRedo(); return; }
      if (SCREEN_NAMES.includes(target) && target !== nav.screenName) activateScreen(target);
      // An old hash (#historique) on the screen already open is rewritten too.
      else if (target === nav.screenName && location.hash !== "#" + target) history.replaceState(null, "", "#" + target);
    });

    /* Theme: a single button cycles light, Graphite, Night, then light. */
    $("#btn-theme").addEventListener("click", () => {
      const root = document.documentElement;
      if (root.getAttribute("data-theme") !== "dark") applyTheme("dark", "graphite");
      else if (root.getAttribute("data-palette") !== "night") applyTheme("dark", "night");
      else applyTheme("light");
    });

    // Language
    $("#btn-lang").addEventListener("click", () => I18N.toggleLanguage());
    I18N.subscribe(refreshLanguage);

    /* Each screen wires its own controls; all that remains here is what
       belongs to no screen (navigation, theme, language, modals, reflexes). */
    UI.wireDashboard();
    UI.wireEntry();
    UI.wireQuick();
    UI.wireHistory();
    UI.wireGuide();
    UI.wireCatalog();
    UI.wireSheet();
    UI.wireBrew();
    UI.wireDrawings();

    // Resume when the network comes back (DATA.synchronize handles a sync already in progress).
    window.addEventListener("online", () => {
      if (DATA.syncPossible()) DATA.synchronize(false);
    });
    // On returning to the app (v8.71): a reopened phone updates right away.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && DATA.syncPossible()) DATA.synchronize(false);
    });
    /* A failed local write no longer goes unnoticed (v8.71). */
    let storageWarned = false;
    window.addEventListener("carnet-storage-failed", () => {
      if (storageWarned) return;
      storageWarned = true;
      toast(I18N.t("toast_storage_failed"));
    });
    /* The server knows a more recent version: we offer to reload. */
    let staleWarned = false;
    DATA.subscribe(() => {
      if (DATA.state.syncState !== "outdated-version" || staleWarned) return;
      staleWarned = true;
      UI.toastAction(I18N.t("sync_outdated"), I18N.t("update_reload"), () => location.reload());
    });

    // Escape also closes what is not a <dialog>: quick panel, expanded forms, bubbles.
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if ($("#rail").classList.contains("expanded")) { toggleNavSheet(false); return; }
      if (UI.isQuickOpen()) { UI.toggleQuick(false); return; }
      const openForms = ["#form-coffee", "#form-bag", "#form-recipe"]
        .map(s => $(s)).filter(x => x && !x.hidden);
      if (openForms.length) { openForms.forEach(x => { x.hidden = true; }); return; }
      // A help bubble opened by finger closes too, before anything else.
      $$(".info-expanded").forEach(x => x.classList.remove("info-expanded"));
    });

    // Generic modals
    // The linked folder badge asks for permission again when it is gone (v8.72).
    $("#badge-file").addEventListener("click", async () => {
      if (!DATA.state.fileNeedsReauth) return;
      toast(I18N.t(await DATA.reauthorizeFolder() ? "folder_reauthorized" : "folder_refused"));
      updateBadges();
    });
    // Every Close button closes its window, even without data-closes (v8.72): the comparison one did nothing.
    $$(".modal-close").forEach(b => b.addEventListener("click", () => (b.dataset.closes ? $("#" + b.dataset.closes) : b.closest("dialog")).close()));

    // Welcome
    $("#welcome-create").addEventListener("click", () => linkAction(true));
    $("#welcome-open").addEventListener("click", () => linkAction(false));
    // Three buttons load the demo (welcome, Data panel, empty dashboard): one single function.
    const loadDemo = async () => {
      await DATA.loadDemo();
      $("#modal-welcome").close();
      toast(I18N.t("toast_demo"));
    };
    $("#welcome-demo").addEventListener("click", loadDemo);
    $("#btn-demo-empty").addEventListener("click", loadDemo);
    $("#welcome-later").addEventListener("click", () => $("#modal-welcome").close());

    // Data
    $("#btn-data").addEventListener("click", () => {
      updateDataStatus();
      const fsOk = DATA.state.fsAvailable;
      $("#db-fs-note").hidden = fsOk;
      $("#db-link").disabled = !fsOk;
      $("#db-open").disabled = !fsOk;
      $("#modal-data").showModal();
    });
    $("#db-link").addEventListener("click", () => linkAction(true));
    $("#db-open").addEventListener("click", () => linkAction(false));
    $("#db-import").addEventListener("click", () => $("#db-file").click());
    $("#db-file").addEventListener("change", async ev => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        /* A preview BEFORE importing (v8.71): the recognised table, and what
           arrives, changes or gets created. Nothing is written without "Import". */
        const text = await f.text();
        const a = DATA.analyzeImport(text);
        const tableName = I18N.t("table_" + a.table);
        const detail = a.table === "all"
          ? I18N.t("import_preview_all", { n: a.n })
          : I18N.t("import_preview", { n: a.n, t: tableName, added: a.added, changed: a.modified }) +
            (a.withoutId ? " " + I18N.t("import_without_id", { n: a.withoutId }) : "") +
            (a.duplicates ? " " + I18N.t("import_duplicates", { n: a.duplicates }) : "");
        if (!await UI.askConfirm(detail, { label: I18N.t("import_ok") })) { ev.target.value = ""; return; }
        const res = await DATA.importCsvText(text);
        toast(I18N.t("toast_import", { n: res.n, t: tableName }));
        updateDataStatus();
      } catch (e) { toast(e.message); }
      ev.target.value = "";
    });
    // The six tables and the full re-importable file (v8.71), plus three.
    $("#db-export").addEventListener("click", () => {
      DATA.exportAll();
      toast(I18N.t("toast_export_all"));
    });
    $("#db-demo").addEventListener("click", async () => {
      if (DATA.state.extractions.length && !await UI.askConfirm(I18N.t("confirm_demo"))) return;
      await DATA.loadDemo();
      updateDataStatus();
      toast(I18N.t("toast_demo"));
    });
    // Unlink the folder (v8.77): the function existed without a button.
    $("#db-unlink").addEventListener("click", async () => { await DATA.unlinkFolder(); updateDataStatus(); updateBadges(); toast(I18N.t("toast_unlinked")); });
    $("#db-clear").addEventListener("click", async () => {
      if (!await UI.askConfirm(I18N.t("confirm_reset"), { danger: true })) return;
      await DATA.clearData();
      updateDataStatus();
      toast(I18N.t("toast_reset"));
    });
    $("#db-sync").addEventListener("click", async () => {
      const result = await DATA.synchronize(true);
      toast(I18N.t(result === "ok" ? "toast_sync_ok" : "toast_sync_failed"));
    });

    // Data changes refresh the interface.
    DATA.subscribe(kind => {
      // A sync state change alone only redraws its badge (v8.75).
      if (kind === "sync") { updateBadges(); UI.updateSyncStatus(); return; }
      // Settings may arrive from another device: we reread before rendering.
      loadFallbacks();
      // Always: these two are tiny and reflect the current state.
      updateBadges();
      UI.updateSyncStatus();
      // The rest is only redone if its table moved (a cup changes neither coffees, nor recipes, nor cups).
      const coffees = DATA.state.coffees, recipes = DATA.state.recipes;
      ifChanged("coffees", coffees, () => { UI.fillCoffeeSelect(); fillRecommendedRecipeSelect(); });
      ifChanged("filtres", DATA.state.extractions, UI.fillFilters);
      ifChanged("recipes", recipes, () => {
        UI.fillRecipeSelect();
        UI.renderRecipes();
      });
      ifChanged("cups", DATA.state.cups, UI.fillCupSelect);
      if (UI.isQuickOpen()) UI.updateQuickPanel();
      renderCurrentScreen();
    });
  }

  /* The icon's "Redo my last cup" shortcut (manifest.json) opens
     ./#redo: the entry form prefilled with the last cup's settings. */
  function openRedo() {
    toast(I18N.t(UI.redoLast() ? "toast_redo" : "toast_redo_empty"));
  }

  function fillRecommendedRecipeSelect() {
    const sel = $("#c-recipe");
    const v = sel.value;
    sel.innerHTML = '<option value="">' + I18N.t("none") + "</option>" +
      liveRecipes().map(r => "<option>" + r.name + "</option>").join("");
    if (v && findRecipe(v)) sel.value = v;
  }

  // Language switch: re-renders everything generated in JavaScript.
  function refreshLanguage() {
    // The data has not moved, all the TEXT has: we invalidate the caches.
    forgetSignatures();
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    UI.buildPills();
    $$("#f-diagnostic .pill").forEach(x => setPressed(x, UI.entry.diagnostics.has(x.dataset.diag)));
    $$("#f-descriptors .tag").forEach(x => setPressed(x, UI.entry.descriptors.has(x.dataset.tag)));
    UI.updateDiagnosticCorrection();
    UI.updateStopwatchButtons();
    UI.updateStopwatchSteps(false);
    $("#entry-title").textContent = UI.entry.editId ? I18N.t("entry_edit") : I18N.t("entry_new");
    $("#btn-save").textContent = UI.entry.editId ? I18N.t("entry_save_changes") : I18N.t("entry_save");
    UI.fillCoffeeSelect();
    UI.fillFilters();
    UI.fillRecipeSelect();
    fillRecommendedRecipeSelect();
    UI.fillCupSelect();
    UI.renderRecipes();
    UI.renderRangeTable();
    UI.renderConverter();
    updateBadges();
    UI.updateMilk();
    UI.updateLive();
    UI.updateWarnings();
    // The "not rated yet" label is generated: the TreeWalker does not follow it.
    UI.updateRatingDisplay();
    if (UI.isQuickOpen()) UI.updateQuickPanel();
    renderCurrentScreen(true);
  }

  // ---------- Startup ----------

  /* Footer version, read from <meta name="app-version"> (set by
     tools/bump_version.mjs): tells which version runs on a given device. */
  const VERSION = TOOLS.versionSite() || "dev";

  async function startApp() {
    /* BEFORE any rendering: if Chris had left the site in English, the
       translation pack must be there, otherwise the page would show in French
       then flicker. Does nothing at all in French, the normal case. */
    await I18N.prepare(I18N.wantedLanguage());
    I18N.applyStatic();
    $("#version-site").textContent = "v" + VERSION;
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    CHARTS.applyDefaults();
    UI.buildPills();
    wireApp();
    UI.renderRangeTable();

    // Storage that fails to open no longer blocks the loading screen (v8.72): the logbook runs in memory.
    let hasData = false;
    try { hasData = await DATA.init(); } catch (e) { console.error(e); toast(I18N.t("toast_storage_failed")); }
    updateBadges();
    UI.fillCoffeeSelect();
    UI.fillFilters();
    UI.fillRecipeSelect();
    fillRecommendedRecipeSelect();
    UI.fillCupSelect();
    UI.renderRecipes();
    try { $("#chrono-beep").checked = localStorage.getItem("beeps") !== "0"; } catch (e) { /* never mind */ }
    // BEFORE anything that reads replis: the converter and the entry form depend on it.
    await migrateLocalFallbacks();
    loadFallbacks();
    UI.renderGrindMarkers();
    UI.renderConverter();
    UI.chooseMethod("Brikka");
    UI.resetEntry();
    if (UI.restoreDraft()) toast(I18N.t("toast_draft"));

    /* An old hash (#tableau, #saisie, a bookmark or a PWA shortcut from before
       v9.06) lands on its new screen, and activateScreen rewrites the hash. */
    const h = normalizeScreen(location.hash.slice(1));
    try {
      if (h === "redo") openRedo();
      else activateScreen(SCREEN_NAMES.includes(h) ? h : "dashboard");
    } finally {
      /* The loading silhouette gives way inside the screen transition (activateScreen).
         Here only as a net: a render that threw must not leave the screens hidden behind it. */
      setTimeout(() => { const overlay = $("#loading"); if (overlay) overlay.remove(); }, 800);
    }

    // The system releases the screen lock when the tab goes to the background.
    // On return, if the stopwatch is still running, we take it back.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") UI.syncWakeLock();
    });

    // Service worker, and the message when a new version is ready.
    UI.watchForUpdates();

    /* Local data first, sync next (v8.72): the welcome screen and its demo
       only appear if, after the sync, there is still nothing. */
    const welcomeIfEmpty = () => {
      if (DATA.state.coffees.length || DATA.state.extractions.length) return;
      if (!DATA.state.fsAvailable) {
        $("#welcome-fs-note").hidden = false;
        $("#welcome-create").disabled = true;
        $("#welcome-open").disabled = true;
      }
      $("#modal-welcome").showModal();
    };
    if (DATA.syncPossible()) DATA.synchronize(false).then(welcomeIfEmpty);
    else if (!hasData) welcomeIfEmpty();
  }

  document.addEventListener("DOMContentLoaded", startApp);

  // Made available to the other screens.
  Object.assign(UI, {
    VERSION, linkAction, wireApp, startApp, updateBadges, updateDataStatus,
    refreshLanguage, fillRecommendedRecipeSelect, toggleNavSheet,
  });
})();
