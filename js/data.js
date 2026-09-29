/* Data layer: the state, the mutations, the sync and the startup.
 *
 * Principle: the truth lives in the CSV files of the linked folder, IndexedDB
 * always keeps a working copy so nothing is lost, and the D1 server makes the
 * devices converge. This file OWNS the state and evolves it; whatever does
 * not need the state lives next to it:
 *
 *   data-csv.js         read and write the CSV format
 *   data-schema.js      columns, normalisation, seeds
 *   data-store.js       IndexedDB, File System Access, download
 *   data-calcs.js       derived fields and bag lookups (read only)
 *   data-migrations.js  schema version and catch-ups of existing data
 *
 * The DATA facade returned at the bottom exposes the same name as before for
 * each function, wherever it lives: the rest of the site did not move. */
"use strict";

const DATA = (() => {

  const { csvParse, csvSerialize } = DATA_CSV;
  const { COFFEE_COLS, EXT_COLS, SETTINGS_ID, SETTINGS_COLS, RECIPE_COLS, CUP_COLS, PURCHASE_COLS,
    stampRow, carryTimestamps, newId, localDateToday, clockNow, setClockOffset,
    normalizeCoffee, normalizeExtraction, normalizeSettings, normalizeRecipe, normalizePurchase,
    normalizeCup, recipeToRow, defaultRecipes, defaultCups } = DATA_SCHEMA;
  const { openDB, kvGet, kvSet, kvSetMany, checkPermission, writeFile, readFile, download } = DATA_STORE;

  const state = {
    cafes: [],
    extractions: [],
    recettes: [],
    tasses: [],
    // One purchase = one bag. Without this table, a re-bought coffee kept ONE
    // single roast date, so freshness lied from the second bag on, and the
    // remaining stock could not be computed.
    achats: [],
    reglages: [],
    dirHandle: null,
    fsAvailable: typeof window !== "undefined" && "showDirectoryPicker" in window,
    demoActive: false,

    // Sync between devices. `tombes` remembers deletions
    // ({table: {id: timestamp}}): without them, a row deleted on the phone
    // would come back at the next exchange with the desktop, which still has it.
    // Outside the CSV files: this is sync machinery, not coffee data.
    tombes: typeof SYNC === "undefined" ? {} : SYNC.emptyTombstones(),
    syncState: "inconnu",
    syncedAt: null,
    // Size of the document on the server and the cap it accepts, in bytes.
    // Returned on every exchange; the Data panel warns past the halfway mark.
    syncSize: 0,
    syncCap: 0,
  };

  /* Read-only helpers and catch-ups, bound to the state above. The functions
     passed as helpers are declarations, so already hoisted at this point. */
  const { coffeeOf, calcs, bagAtDate, currentBag, bagStock } = DATA_CALCS.forState(state);
  const { migrateData, applySchema, CURRENT_SCHEMA } =
    DATA_MIGRATIONS.forState(state, { markDeleted, currentSettings });

  /* Lays a tombstone. The date is used to decide against a possible rewrite
     of the same row on the other device. */
  function markDeleted(table, id) {
    if (!state.tombes[table]) state.tombes[table] = {};
    state.tombes[table][id] = clockNow();
  }

  /* THE REVISION (v8.75): it changes with every notification that touches the
     data. The interface keeps its per-cup calculations as long as it does not
     move, instead of recomputing everything on every render and keystroke. A
     "sync" notification (only the sync status) does not change it, and the
     subscribers know they have nothing to redraw but the status dot. */
  const subscriberList = [];
  let revision = 0;
  function subscribe(fn) { subscriberList.push(fn); }
  function notify(kind) {
    if (kind !== "sync") revision++;
    subscriberList.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } });
  }
  function dataRevision() { return revision; }

  function currentSettings() {
    return state.reglages[0] || normalizeSettings({});
  }

  /* Writes the settings and makes them travel. Like every mutation, it stamps:
     the device that sets last wins the merge, which is exactly what we want
     for a preference. */
  async function updateSettings(partial) {
    const merged = stampRow(normalizeSettings({ ...currentSettings(), ...partial }));
    state.reglages = [merged];
    await persist();
    return merged;
  }

  function csvRecipes() {
    return csvSerialize(state.recettes.map(recipeToRow), RECIPE_COLS);
  }

  async function addPurchase(purchase) {
    const a = stampRow(normalizePurchase(purchase));
    a.id = newId("a", state.achats);
    state.achats.push(a);
    // The coffee record follows the latest bag: format, price and roast date
    // shown elsewhere must stay consistent with it.
    const coffee = state.cafes.find(c => c.id === a.cafe_id);
    if (coffee) {
      if (a.format_grammes !== "") coffee.format_grammes = a.format_grammes;
      if (a.prix_vnd !== "") coffee.prix_vnd = a.prix_vnd;
      coffee.date_torrefaction = a.date_torrefaction;
      stampRow(coffee);
    }
    await persist();
    return a;
  }

  /* CORRECTING THE STOCK BY HAND (v8.96). Writes the count on the current
     bag; with no bag recorded for this coffee, creates one dated today, in the
     coffee's format, to hold the count. The time is the cups' one, local and to
     the minute, so that "the cups after" compares as text. */
  async function correctStock(coffeeId, grams) {
    const g = Math.round(Number(grams) * 10) / 10;
    if (!Number.isFinite(g) || g < 0) return null;
    const d = new Date(clockNow());
    const when = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const bag = currentBag(coffeeId);
    if (!bag) {
      const coffee = state.cafes.find(c => c.id === coffeeId);
      if (!coffee) return null;
      return addPurchase({
        cafe_id: coffeeId, date_achat: when.slice(0, 10),
        format_grammes: Number(coffee.format_grammes) > 0 ? coffee.format_grammes : Math.max(g, 1),
        prix_vnd: coffee.prix_vnd, date_torrefaction: coffee.date_torrefaction,
        restant_g: g, restant_le: when,
      });
    }
    bag.restant_g = g;
    bag.restant_le = when;
    stampRow(bag);
    await persist();
    return bag;
  }

  async function deletePurchase(id) {
    markDeleted("achats", id);
    state.achats = state.achats.filter(x => x.id !== id);
    await persist();
  }

  async function saveLocal() {
    await kvSetMany({
      cafes: state.cafes, extractions: state.extractions, recettes: state.recettes,
      tasses: state.tasses, demoActive: state.demoActive, achats: state.achats,
      reglages: state.reglages, tombes: state.tombes,
    });
  }

  // ---------- File System Access ----------

  let pendingWrite = null;
  async function saveFiles() {
    if (!state.dirHandle) return false;
    // Groups writes that come close together.
    if (pendingWrite) clearTimeout(pendingWrite);
    return new Promise(resolve => {
      pendingWrite = setTimeout(async () => {
        try {
          /* WITHOUT ASKING (v8.72). The permission request, made here from a
             timer, outside any gesture, was silently refused after a restart:
             the CSV files stopped being written and the badge still said
             "linked". Now we only look; if the permission is gone, the badge
             says "to re-authorise" and a tap asks for it again. */
          const ok = await state.dirHandle.queryPermission({ mode: "readwrite" }) === "granted";
          if (state.fileNeedsReauth !== !ok) { state.fileNeedsReauth = !ok; notify(); }
          if (!ok) { resolve(false); return; }
          await writeFile(state.dirHandle, "cafes.csv", csvSerialize(state.cafes, COFFEE_COLS));
          await writeFile(state.dirHandle, "extractions.csv", csvSerialize(state.extractions, EXT_COLS));
          await writeFile(state.dirHandle, "recettes.csv", csvRecipes());
          await writeFile(state.dirHandle, "tasses.csv", csvSerialize(state.tasses, CUP_COLS));
          await writeFile(state.dirHandle, "achats.csv", csvSerialize(state.achats, PURCHASE_COLS));
          await writeFile(state.dirHandle, "reglages.csv", csvSerialize(state.reglages, SETTINGS_COLS));
          resolve(true);
        } catch (e) {
          console.error("Écriture fichier impossible", e);
          resolve(false);
        }
      }, 400);
    });
  }

  async function linkFolder(create) {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await checkPermission(handle)) throw new Error("Permission refusée");
    state.dirHandle = handle;
    /* Linking a folder while leaving the demo (v8.71): the 62 demo cups
       would have become real data, then gone to the server. */
    if (state.demoActive) {
      state.extractions = []; state.achats = [];
      state.cafes = STARTER_COFFEES.map(normalizeCoffee);
      state.recettes = defaultRecipes(); state.tasses = defaultCups();
    }
    if (create) {
      if (!state.cafes.length) state.cafes = STARTER_COFFEES.map(normalizeCoffee);
      if (!state.recettes.length) state.recettes = defaultRecipes();
      if (!state.tasses.length) state.tasses = defaultCups();
      state.demoActive = false;
      await writeFile(state.dirHandle, "cafes.csv", csvSerialize(state.cafes, COFFEE_COLS));
      await writeFile(state.dirHandle, "extractions.csv", csvSerialize(state.extractions, EXT_COLS));
      await writeFile(state.dirHandle, "recettes.csv", csvRecipes());
      await writeFile(state.dirHandle, "tasses.csv", csvSerialize(state.tasses, CUP_COLS));
      await writeFile(state.dirHandle, "achats.csv", csvSerialize(state.achats, PURCHASE_COLS));
      await writeFile(state.dirHandle, "reglages.csv", csvSerialize(state.reglages, SETTINGS_COLS));
    } else {
      const tc = await readFile(state.dirHandle, "cafes.csv");
      const te = await readFile(state.dirHandle, "extractions.csv");
      const tr = await readFile(state.dirHandle, "recettes.csv");
      const tt = await readFile(state.dirHandle, "tasses.csv");
      const ta = await readFile(state.dirHandle, "achats.csv");
      const tg = await readFile(state.dirHandle, "reglages.csv");
      if (tc === null && te === null) {
        throw new Error("Ce dossier ne contient ni cafes.csv ni extractions.csv.");
      }
      if (tc !== null) state.cafes = carryTimestamps(csvParse(tc).map(normalizeCoffee), state.cafes, COFFEE_COLS);
      if (te !== null) state.extractions = carryTimestamps(csvParse(te).map(normalizeExtraction), state.extractions, EXT_COLS);
      if (tr !== null) state.recettes = carryTimestamps(csvParse(tr).map(normalizeRecipe), state.recettes, RECIPE_COLS);
      else if (!state.recettes.length) state.recettes = defaultRecipes();
      if (tt !== null) state.tasses = carryTimestamps(csvParse(tt).map(normalizeCup), state.tasses, CUP_COLS);
      if (ta !== null) state.achats = carryTimestamps(csvParse(ta).map(normalizePurchase), state.achats, PURCHASE_COLS);
      if (tg !== null) state.reglages = carryTimestamps(csvParse(tg).map(normalizeSettings), state.reglages, SETTINGS_COLS).slice(0, 1);
      migrateData();
      await writeFile(state.dirHandle, "recettes.csv", csvRecipes());
      state.demoActive = false;
    }
    await kvSet("dirHandle", handle);
    await saveLocal();
    notify();
    return handle.name;
  }

  // On a tap of the "to re-authorise" badge: a real gesture, the request goes through.
  async function reauthorizeFolder() {
    if (!state.dirHandle) return false;
    const ok = await checkPermission(state.dirHandle);
    state.fileNeedsReauth = !ok;
    if (ok) await saveFiles();
    notify();
    return ok;
  }

  async function unlinkFolder() {
    state.dirHandle = null;
    await kvSet("dirHandle", null);
    notify();
  }

  // ---------- Import and export ----------

  function detectTable(rows) {
    if (!rows.length) return null;
    const keys = Object.keys(rows[0]);
    if (keys.includes("date_achat")) return "achats";
    if (keys.includes("contenance_ml")) return "tasses";
    if (keys.includes("pour_qui") || keys.includes("sous_titre")) return "recettes";
    if (keys.includes("cafe_id") || keys.includes("diagnostic")) return "extractions";
    if (keys.includes("torrefacteur") || keys.includes("machine_recommandee")) return "cafes";
    return null;
  }

  /* THE IMPORT (v8.71). Three defects fixed at once:
     - a table without a branch (the purchases) fell into the "else" and
       OVERWROTE all the extractions; each table now has its branch, and an
       unknown table is refused;
     - the table was replaced whole: the import now MERGES by id, a row
       missing from the file stays in place;
     - a row identical to the one we have keeps its date, only new or
       changed rows are stamped (carryTimestamps).
     A row without an id gets one; a duplicated id keeps its last row.
     analyzeImport describes all of this BEFORE, for the confirmation.
     The full exported file (JSON) can be re-imported too, through the same
     merge as the sync. */
  const IMPORT = {
    cafes: { cols: () => COFFEE_COLS, norm: r => normalizeCoffee(r), pref: "c" },
    extractions: { cols: () => EXT_COLS, norm: r => normalizeExtraction(r), pref: "e" },
    recettes: { cols: () => RECIPE_COLS, norm: r => normalizeRecipe(r), pref: "r" },
    tasses: { cols: () => CUP_COLS, norm: r => normalizeCup(r), pref: "t" },
    achats: { cols: () => PURCHASE_COLS, norm: r => normalizePurchase(r), pref: "a" },
    reglages: { cols: () => SETTINGS_COLS, norm: r => normalizeSettings(r), pref: "g" },
  };

  function prepareImport(text) {
    if (/^\s*\{/.test(text)) {
      let doc;
      try { doc = JSON.parse(text); } catch (e) { throw new Error(I18N.t("imp_json_illisible")); }
      if (!doc || !doc.tables) throw new Error(I18N.t("imp_json_illisible"));
      const n = Object.values(doc.tables).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
      return { table: "tout", doc, n, added: 0, modified: 0, withoutId: 0, duplicates: 0 };
    }
    const rows = csvParse(text);
    const table = detectTable(rows);
    if (!table) throw new Error(I18N.t("imp_inconnue"));
    const def = IMPORT[table];
    const currentRows = table === "reglages" ? state.reglages : state[table];
    const byId = new Map();
    let withoutId = 0, duplicates = 0;
    rows.map(def.norm).forEach(l => {
      if (!l.id) { l.id = newId(def.pref, [...currentRows, ...byId.values()]); withoutId++; }
      if (byId.has(l.id)) duplicates++;
      byId.set(l.id, l);
    });
    const stamped = carryTimestamps([...byId.values()], currentRows, def.cols());
    const known = new Map(currentRows.map(l => [l.id, l]));
    const added = stamped.filter(l => !known.has(l.id)).length;
    const modified = stamped.filter(l => known.has(l.id) && l.maj_le !== known.get(l.id).maj_le).length;
    return { table, rows: stamped, n: stamped.length, added, modified, withoutId, duplicates };
  }

  function analyzeImport(text) {
    const p = prepareImport(text);
    return { table: p.table, n: p.n, added: p.added, modified: p.modified, withoutId: p.withoutId, duplicates: p.duplicates };
  }

  async function importCsvText(text) {
    const p = prepareImport(text);
    if (p.table === "tout") {
      const merged = SYNC.mergeStates(localPayload(), p.doc);
      adoptTables(merged);
    } else {
      const byId = new Map(state[p.table].map(l => [l.id, l]));
      p.rows.forEach(l => byId.set(l.id, l));
      state[p.table] = [...byId.values()];
      if (p.table === "reglages") state.reglages = state.reglages.slice(-1);
    }
    migrateData();
    state.demoActive = false;
    await persist();
    return { table: p.table, n: p.n };
  }

  // The tables as they are, and the tombstones. The full file.
  function exportAll() {
    download("cafes.csv", csvSerialize(state.cafes, COFFEE_COLS));
    download("extractions.csv", csvSerialize(state.extractions, EXT_COLS));
    download("recettes.csv", csvRecipes());
    download("tasses.csv", csvSerialize(state.tasses, CUP_COLS));
    download("achats.csv", csvSerialize(state.achats, PURCHASE_COLS));
    download("reglages.csv", csvSerialize(state.reglages, SETTINGS_COLS));
    download("carnet-complet.json", JSON.stringify({ ...localPayload(), exporte_le: new Date().toISOString() }),
      "application/json;charset=utf-8");
  }

  function exportCoffees() { download("cafes.csv", csvSerialize(state.cafes, COFFEE_COLS)); }
  function exportExtractions(list) {
    download("extractions.csv", csvSerialize(list || state.extractions, EXT_COLS));
  }
  function exportRecipes() { download("recettes.csv", csvRecipes()); }

  // ---------- Demo ----------

  /* The demo data set is loaded ON DEMAND: it only serves the button of the
     welcome dialog, which Chris will never see again since he has his data.
     Precached anyway, so the demo works offline like everything else. */
  function loadDemoScript() {
    if (typeof DEMO_COFFEES_CSV !== "undefined") return Promise.resolve(true);
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = TOOLS.versionedUrl("js/demo-data.js");
      s.onload = () => resolve(typeof DEMO_COFFEES_CSV !== "undefined");
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  /* THE DEMO GETS YOUNGER (v8.38). Its dates are hard-coded in the CSV: six
     weeks after they were written, the last 30 days of the dashboard were
     empty, the week's figures at zero, and the chart drew a trend over a
     month without a single cup. Everything that carries a date (cups, roast,
     coffee added) shifts by the same number of whole days, so that the last
     cup lands yesterday: the gaps between dates, hence the age of the bags and
     the streaks, stay exactly those of the original set. */
  function rejuvenateDemo(coffees, extractions) {
    const dates = extractions.map(e => String(e.date_heure).slice(0, 10)).filter(Boolean).sort();
    if (!dates.length) return;
    const lastDay = new Date(dates[dates.length - 1] + "T12:00");
    const yesterday = new Date(); yesterday.setHours(12, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
    const days = Math.round((yesterday - lastDay) / 86400000);
    if (days <= 0) return;
    const shift = v => {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(v || ""))) return v;
      const d = new Date(String(v).slice(0, 10) + "T12:00");
      d.setDate(d.getDate() + days);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return iso + String(v).slice(10);
    };
    extractions.forEach(e => { e.date_heure = shift(e.date_heure); });
    coffees.forEach(c => {
      c.date_torrefaction = shift(c.date_torrefaction);
      c.date_ajout = shift(c.date_ajout);
    });
  }

  async function loadDemo() {
    // A failure leaves the data in place rather than half-emptying the state.
    if (!await loadDemoScript()) throw new Error("Jeu de démonstration indisponible.");
    state.cafes = csvParse(DEMO_COFFEES_CSV).map(normalizeCoffee);
    state.extractions = csvParse(DEMO_EXTRACTIONS_CSV).map(normalizeExtraction);
    rejuvenateDemo(state.cafes, state.extractions);
    state.recettes = defaultRecipes();
    state.tasses = defaultCups();
    // The demo has no purchases file: the migration builds one implicit bag
    // per coffee, which is enough to bring the stock to life in the demo.
    state.achats = [];
    migrateData();
    /* These implicit bags have no opening date, and without it no cup has a
       bag day: the coffee record showed an empty curve and the "bag age" rule
       never spoke in the demo (v8.46). So the demo opens each bag on the day
       it buys it. */
    state.achats.forEach(a => { if (!a.date_ouverture) a.date_ouverture = a.date_achat; });
    state.demoActive = true;
    await saveLocal();
    notify();
  }

  async function clearData() {
    /* Tombstones for everything that goes (v8.71): without them, the next
       sync brought everything back from the server, and "empty" emptied nothing. */
    const keepSeeded = (table, seeded) => state[table]
      .filter(l => !seeded.some(s => s.id === l.id)).forEach(l => markDeleted(table, l.id));
    state.extractions.forEach(l => markDeleted("extractions", l.id));
    state.achats.forEach(l => markDeleted("achats", l.id));
    keepSeeded("cafes", STARTER_COFFEES);
    keepSeeded("recettes", STARTER_RECIPES);
    keepSeeded("tasses", STARTER_CUPS);
    state.extractions = [];
    state.cafes = STARTER_COFFEES.map(normalizeCoffee);
    state.recettes = defaultRecipes();
    state.tasses = defaultCups();
    state.achats = [];
    state.demoActive = false;
    await persist();
  }

  // ---------- Mutations ----------

  // ---------- Sync between devices ----------

  // A burst of changes (editing a recipe, back-to-back entries) must not
  // produce a burst of requests.
  const SYNC_DEBOUNCE_MS = 1500;
  let syncTimer = null;
  let syncInFlight = false;
  let syncRequeued = false;
  let generation = 0;
  // Retries after a failure: 5 s, 15 s, 1 min, then every 5 min.
  const RETRY_DELAYS_MS = [5000, 15000, 60000, 300000];
  let syncFailures = 0;
  let retryTimer = null;

  function localPayload() {
    return {
      tables: {
        cafes: state.cafes,
        extractions: state.extractions,
        recettes: state.recettes,
        tasses: state.tasses,
        achats: state.achats,
        reglages: state.reglages,
      },
      tombes: state.tombes,
      // The tab states its version: the server refuses a tab older than the
      // document, which would erase the columns it does not know (v8.71).
      schema: CURRENT_SCHEMA,
    };
  }

  // Adopts merged, normalised tables, with the starter recipes and cups as a fallback.
  function adoptTables(merged) {
    state.cafes = (merged.tables.cafes || []).map(normalizeCoffee);
    state.extractions = (merged.tables.extractions || []).map(normalizeExtraction);
    state.recettes = (merged.tables.recettes || []).map(normalizeRecipe);
    state.tasses = (merged.tables.tasses || []).map(normalizeCup);
    state.achats = (merged.tables.achats || []).map(normalizePurchase);
    state.reglages = (merged.tables.reglages || []).map(normalizeSettings).slice(0, 1);
    state.tombes = merged.tombes || SYNC.emptyTombstones();
    if (!state.recettes.length) state.recettes = defaultRecipes();
    if (!state.tasses.length) state.tasses = defaultCups();
  }

  function syncPossible() {
    // NEVER in demo: without this guard, loading the demo on a device
    // would send 62 fake extractions into the real data.
    return typeof SYNC !== "undefined" && SYNC.isAvailable() && !state.demoActive;
  }

  /* Exchanges with the server and ADOPTS the merged result. Does not go
     through persist(): that would restart a sync in a loop. */
  async function synchronize(manual) {
    if (!syncPossible()) {
      state.syncState = typeof SYNC === "undefined" || !SYNC.isAvailable() ? "local" : "demo";
      if (manual) notify();
      return state.syncState;
    }
    /* A sync requested while another is in flight is no longer lost
       (v8.71): it starts again as soon as the first one is done. */
    if (syncInFlight) { syncRequeued = true; return state.syncState; }
    syncInFlight = true;
    syncRequeued = false;
    state.syncState = "encours";
    notify("sync");
    let tablesBefore = null;

    const sentGeneration = generation;
    try {
      const received = await SYNC.exchange(localPayload());
      tablesBefore = JSON.stringify(localPayload().tables);
      setClockOffset((Number(received.serverTime) || Date.now()) - Date.now());
      /* MERGED with the state as it is on return, no longer substituted:
         whatever was entered during the exchange stays. */
      adoptTables(SYNC.mergeStates(received, localPayload()));
      state.syncSize = Number(received.taille) || 0;
      state.syncCap = Number(received.plafond) || 0;
      migrateData();
      await saveLocal();
      saveFiles();
      state.syncState = "ok";
      state.syncedAt = Date.now();
      syncFailures = 0;
      if (generation !== sentGeneration) syncRequeued = true;
    } catch (error) {
      // The local data is kept as is: a failed sync must never lose an
      // entry. Retry with a growing delay (v8.71), unless the server says
      // this tab is too old: it has to reload.
      state.syncState = error && error.code ? error.code : "erreur";
      if (state.syncState !== "version-perimee" && state.syncState !== "session-expiree") {
        const delay = RETRY_DELAYS_MS[Math.min(syncFailures, RETRY_DELAYS_MS.length - 1)];
        syncFailures++;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => synchronize(false), delay);
      }
    } finally {
      syncInFlight = false;
      // Nothing moved in the tables: only the sync status dot changes.
      notify(tablesBefore !== null && tablesBefore !== JSON.stringify(localPayload().tables) ? undefined : "sync");
      if (syncRequeued) scheduleSync();
    }
    return state.syncState;
  }

  function scheduleSync() {
    if (!syncPossible()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { synchronize(false); }, SYNC_DEBOUNCE_MS);
  }

  /* Every persist bumps the generation: a sync that comes back knows whether
     something moved during its flight. A failed local write (storage full)
     is reported, and the sync goes out anyway: the cup no longer lives only
     in memory (v8.71). */
  async function persist() {
    generation++;
    try {
      await saveLocal();
    } catch (e) {
      console.error("Stockage local impossible", e);
      if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("carnet-stockage-ko"));
    }
    saveFiles();
    notify();
    scheduleSync();
  }

  /* Re-inserts a deleted extraction UNDER ITS ORIGINAL ID. Used to undo a
     deletion: the row is already gone, tombstone included, and this later
     write brings it back everywhere, including on the other devices. */
  async function restoreExtraction(ext) {
    if (!ext || !ext.id) return null;
    const e = stampRow(normalizeExtraction(ext));
    e.id = ext.id;
    const i = state.extractions.findIndex(x => x.id === e.id);
    if (i >= 0) state.extractions[i] = e;
    else state.extractions.push(e);
    await persist();
    return e;
  }

  async function addExtraction(ext) {
    const e = stampRow(normalizeExtraction(ext));
    e.id = newId("e", state.extractions);
    state.extractions.push(e);
    await persist();
    return e;
  }

  async function editExtraction(id, ext) {
    const idx = state.extractions.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const e = stampRow(normalizeExtraction(ext));
    e.id = id;
    state.extractions[idx] = e;
    await persist();
    return e;
  }

  async function deleteExtraction(id) {
    markDeleted("extractions", id);
    state.extractions = state.extractions.filter(x => x.id !== id);
    await persist();
  }

  async function addCoffee(coffee) {
    const c = stampRow(normalizeCoffee(coffee));
    c.id = newId("c", state.cafes);
    if (!c.date_ajout) c.date_ajout = localDateToday();
    state.cafes.push(c);
    await persist();
    return c;
  }

  async function editCoffee(id, coffee) {
    const idx = state.cafes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const c = stampRow(normalizeCoffee(coffee));
    c.id = id;
    // The date added is not editable: keep the one in place.
    if (!c.date_ajout) c.date_ajout = state.cafes[idx].date_ajout || "";
    state.cafes[idx] = c;
    await persist();
    return c;
  }

  // ---------- Recipes: mutations ----------

  function isOriginalRecipe(id) {
    return STARTER_RECIPES.some(r => r.id === id);
  }

  async function addRecipe(recipe) {
    const r = stampRow(normalizeRecipe(recipe));
    let n = 1;
    let id = "r" + n;
    while (state.recettes.some(x => x.id === id)) { n++; id = "r" + n; }
    r.id = id;
    state.recettes.push(r);
    await persist();
    return r;
  }

  async function editRecipe(id, recipe) {
    const idx = state.recettes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const oldName = state.recettes[idx].nom;
    const r = stampRow(normalizeRecipe(recipe));
    r.id = id;
    // An original recipe keeps its structural markers (4:6 variants).
    if (isOriginalRecipe(id)) {
      const originalRecipe = STARTER_RECIPES.find(x => x.id === id);
      r.variantes = originalRecipe.variantes;
    }
    state.recettes[idx] = r;
    // If the name changes, follow it in the extractions and the coffees.
    if (oldName && r.nom !== oldName) {
      state.extractions.forEach(e => { if (e.recette === oldName) e.recette = r.nom; });
      state.cafes.forEach(c => { if (c.recette_recommandee === oldName) c.recette_recommandee = r.nom; });
    }
    await persist();
    return r;
  }

  async function resetRecipe(id) {
    const originalRecipe = STARTER_RECIPES.find(x => x.id === id);
    if (!originalRecipe) return null;
    const idx = state.recettes.findIndex(x => x.id === id);
    const r = normalizeRecipe({
      ...originalRecipe,
      etapes: originalRecipe.etapes.map(e => ({ ...e })),
      cafesAssocies: [...originalRecipe.cafesAssocies],
    });
    stampRow(r);
    if (idx < 0) state.recettes.push(r);
    else {
      const oldName = state.recettes[idx].nom;
      state.recettes[idx] = r;
      if (oldName && oldName !== r.nom) {
        state.extractions.forEach(e => { if (e.recette === oldName) e.recette = r.nom; });
        state.cafes.forEach(c => { if (c.recette_recommandee === oldName) c.recette_recommandee = r.nom; });
      }
    }
    await persist();
    return r;
  }

  async function deleteRecipe(id) {
    if (isOriginalRecipe(id)) return false;
    markDeleted("recettes", id);
    state.recettes = state.recettes.filter(x => x.id !== id);
    await persist();
    return true;
  }

  // ---------- Cups: mutations ----------

  async function addCup(label, capacity) {
    let n = 1, id = "tp" + n;
    while (state.tasses.some(x => x.id === id)) { n++; id = "tp" + n; }
    state.tasses.push(stampRow(normalizeCup({ id, nom: label, contenance_ml: capacity })));
    await persist();
  }

  async function deleteCup(id) {
    markDeleted("tasses", id);
    state.tasses = state.tasses.filter(x => x.id !== id);
    if (!state.tasses.length) state.tasses = defaultCups();
    await persist();
  }

  // ---------- Initialisation ----------

  async function init() {
    await openDB();
    const coffees = await kvGet("cafes");
    const extractions = await kvGet("extractions");
    const recipes = await kvGet("recettes");
    const cups = await kvGet("tasses");
    const purchases = await kvGet("achats");
    const settingsRows = await kvGet("reglages");
    const demoActive = await kvGet("demoActive");
    if (Array.isArray(coffees)) state.cafes = coffees.map(normalizeCoffee);
    if (Array.isArray(extractions)) state.extractions = extractions.map(normalizeExtraction);
    if (Array.isArray(recipes) && recipes.length) state.recettes = recipes;
    else state.recettes = defaultRecipes();
    if (Array.isArray(cups) && cups.length) state.tasses = cups;
    else state.tasses = defaultCups();
    if (Array.isArray(purchases)) state.achats = purchases.map(normalizePurchase);
    if (Array.isArray(settingsRows)) state.reglages = settingsRows.map(normalizeSettings).slice(0, 1);
    state.demoActive = !!demoActive;
    const handle = await kvGet("dirHandle");
    if (handle) {
      state.dirHandle = handle;
      // The permission will be requested on the first user gesture; we try a
      // silent re-read if it is already granted.
      try {
        if (await handle.queryPermission({ mode: "readwrite" }) === "granted") {
          const tc = await readFile(state.dirHandle, "cafes.csv");
          const te = await readFile(state.dirHandle, "extractions.csv");
          const tr = await readFile(state.dirHandle, "recettes.csv");
          const tt = await readFile(state.dirHandle, "tasses.csv");
          const ta = await readFile(state.dirHandle, "achats.csv");
          const tg = await readFile(state.dirHandle, "reglages.csv");
          if (tc !== null) state.cafes = carryTimestamps(csvParse(tc).map(normalizeCoffee), state.cafes, COFFEE_COLS);
          if (te !== null) state.extractions = carryTimestamps(csvParse(te).map(normalizeExtraction), state.extractions, EXT_COLS);
          if (tr !== null) state.recettes = carryTimestamps(csvParse(tr).map(normalizeRecipe), state.recettes, RECIPE_COLS);
          if (tt !== null) state.tasses = carryTimestamps(csvParse(tt).map(normalizeCup), state.tasses, CUP_COLS);
          if (ta !== null) state.achats = carryTimestamps(csvParse(ta).map(normalizePurchase), state.achats, PURCHASE_COLS);
          if (tg !== null) state.reglages = carryTimestamps(csvParse(tg).map(normalizeSettings), state.reglages, SETTINGS_COLS).slice(0, 1);
        }
      } catch (e) { console.warn("Relecture du dossier lié impossible", e); }
    }
    const tombstones = await kvGet("tombes");
    if (tombstones && typeof tombstones === "object") state.tombes = tombstones;

    migrateData();
    await saveLocal();

    /* No more sync here (v8.72): it blocked the first display. It is app.js
       that starts it right after the first render, and that only opens the
       welcome dialog if the server returned nothing either. */
    return state.cafes.length > 0 || state.extractions.length > 0;
  }

  return {
    state, subscribe, notify, init, dataRevision,
    synchronize, syncPossible, carryTimestamps,
    /* csvRecipes is exposed so the CSV round trip is testable on the REAL
       export path: that is the one that lost puissance_feu. */
    csvParse, csvSerialize, csvRecipes, COFFEE_COLS, EXT_COLS, RECIPE_COLS, PURCHASE_COLS,
    currentBag, bagStock, addPurchase, deletePurchase, correctStock,
    calcs, coffeeOf,
    linkFolder, unlinkFolder, reauthorizeFolder, saveFiles,
    importCsvText, analyzeImport, exportAll, exportCoffees, exportExtractions, exportRecipes,
    loadDemo, clearData,
    addExtraction, editExtraction, deleteExtraction, restoreExtraction,
    addCoffee, editCoffee,
    addRecipe, editRecipe, resetRecipe, deleteRecipe, isOriginalRecipe,
    // Exposed for the tests: it decides that an empty temperature stays
    // empty instead of dropping to 0, and that a heat level survives.
    bagAtDate,
    normalizeRecipe, normalizeSettings, normalizeExtraction,
    currentSettings, updateSettings, SETTINGS_COLS, SETTINGS_ID,
    // Exposed for the tests: it catches up the STORED recipes when the
    // seeded values change, and that catch-up is marked once.
    migrateData,
    addCup, deleteCup,
    kvGet, kvSet,
  };
})();
