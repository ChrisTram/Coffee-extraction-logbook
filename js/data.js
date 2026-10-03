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
  const { openDB, kvGet, kvSet, kvSetMany, kvDeleteMany, checkPermission, writeFile, readFile, download } = DATA_STORE;

  const state = {
    coffees: [],
    extractions: [],
    recipes: [],
    cups: [],
    // One purchase = one bag. Without this table, a re-bought coffee kept ONE
    // single roast date, so freshness lied from the second bag on, and the
    // remaining stock could not be computed.
    purchases: [],
    settings: [],
    dirHandle: null,
    fsAvailable: typeof window !== "undefined" && "showDirectoryPicker" in window,
    demoActive: false,

    // Sync between devices. `tombstones` remembers deletions
    // ({table: {id: timestamp}}): without them, a row deleted on the phone
    // would come back at the next exchange with the desktop, which still has it.
    // Outside the CSV files: this is sync machinery, not coffee data.
    tombstones: typeof SYNC === "undefined" ? {} : SYNC.emptyTombstones(),
    syncState: "unknown",
    syncedAt: null,
    // Size of the document on the server and the cap it accepts, in bytes.
    // Returned on every exchange; the Data panel warns past the halfway mark.
    syncSize: 0,
    syncCap: 0,
  };

  /* Read-only helpers and catch-ups, bound to the state above. The functions
     passed as helpers are declarations, so already hoisted at this point. */
  const { coffeeOf, calcs, bagAtDate, currentBag, bagStock, usualDose, bagGauge, bagRecord } = DATA_CALCS.forState(state);
  const { migrateData, applySchema, CURRENT_SCHEMA } =
    DATA_MIGRATIONS.forState(state, { markDeleted, currentSettings });

  /* Lays a tombstone. The date is used to decide against a possible rewrite
     of the same row on the other device. */
  function markDeleted(table, id) {
    if (!state.tombstones[table]) state.tombstones[table] = {};
    state.tombstones[table][id] = clockNow();
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
    return state.settings[0] || normalizeSettings({});
  }

  /* Writes the settings and makes them travel. Like every mutation, it stamps:
     the device that sets last wins the merge, which is exactly what we want
     for a preference. */
  async function updateSettings(partial) {
    const merged = stampRow(normalizeSettings({ ...currentSettings(), ...partial }));
    state.settings = [merged];
    await persist();
    return merged;
  }

  function csvRecipes() {
    return csvSerialize(state.recipes.map(recipeToRow), RECIPE_COLS);
  }

  async function addPurchase(purchase) {
    const a = stampRow(normalizePurchase(purchase));
    a.id = newId("a", state.purchases);
    state.purchases.push(a);
    // The coffee record follows the latest bag: format, price and roast date
    // shown elsewhere must stay consistent with it.
    const coffee = state.coffees.find(c => c.id === a.coffee_id);
    if (coffee) {
      if (a.bag_size_g !== "") coffee.bag_size_g = a.bag_size_g;
      if (a.price_vnd !== "") coffee.price_vnd = a.price_vnd;
      coffee.roast_date = a.roast_date;
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
      const coffee = state.coffees.find(c => c.id === coffeeId);
      if (!coffee) return null;
      return addPurchase({
        coffee_id: coffeeId, purchase_date: when.slice(0, 10),
        bag_size_g: Number(coffee.bag_size_g) > 0 ? coffee.bag_size_g : Math.max(g, 1),
        price_vnd: coffee.price_vnd, roast_date: coffee.roast_date,
        remaining_g: g, remaining_at: when,
      });
    }
    bag.remaining_g = g;
    bag.remaining_at = when;
    stampRow(bag);
    await persist();
    return bag;
  }

  async function deletePurchase(id) {
    markDeleted("purchases", id);
    state.purchases = state.purchases.filter(x => x.id !== id);
    await persist();
  }

  async function saveLocal() {
    await kvSetMany({
      coffees: state.coffees, extractions: state.extractions, recipes: state.recipes,
      cups: state.cups, demoActive: state.demoActive, purchases: state.purchases,
      settings: state.settings, tombstones: state.tombstones,
    });
  }

  // ---------- File System Access ----------

  /* THE CSV FILES of the linked folder, one per table, in writing order.
     English names since v9.06 (coffees.csv, recipes.csv...). A folder still
     holding the French files (cafes.csv, recettes.csv...) is read through
     them when the English one is missing, and the English files are written
     at the first save. The French files are left in place: they are Chris's,
     the site never deletes a file. */
  const CSV_TEXT = {
    coffees: () => csvSerialize(state.coffees, COFFEE_COLS),
    extractions: list => csvSerialize(list || state.extractions, EXT_COLS),
    recipes: () => csvRecipes(),
    cups: () => csvSerialize(state.cups, CUP_COLS),
    purchases: () => csvSerialize(state.purchases, PURCHASE_COLS),
    settings: () => csvSerialize(state.settings, SETTINGS_COLS),
  };
  const TABLE_NAMES = Object.keys(CSV_TEXT);
  const csvFileName = table => table + ".csv";
  const legacyCsvFileName = table =>
    (Object.keys(LEGACY.TABLES).find(k => LEGACY.TABLES[k] === table) || table) + ".csv";

  async function writeCsvFiles() {
    for (const table of TABLE_NAMES) await writeFile(state.dirHandle, csvFileName(table), CSV_TEXT[table]());
  }

  // { table: text or null }, the English file first, the French one otherwise.
  async function readCsvFiles() {
    const texts = {};
    for (const table of TABLE_NAMES) {
      let text = await readFile(state.dirHandle, csvFileName(table));
      if (text === null && legacyCsvFileName(table) !== csvFileName(table)) {
        text = await readFile(state.dirHandle, legacyCsvFileName(table));
      }
      texts[table] = text;
    }
    return texts;
  }

  // The tables read from the folder, stamps carried over (carryTimestamps).
  function adoptCsvFiles(texts) {
    for (const table of TABLE_NAMES) {
      if (texts[table] === null) continue;
      const def = IMPORT[table];
      state[table] = carryTimestamps(csvParse(texts[table]).map(def.norm), state[table], def.cols());
    }
    state.settings = state.settings.slice(0, 1);
  }

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
          await writeCsvFiles();
          resolve(true);
        } catch (e) {
          console.error("Could not write the file", e);
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
      state.extractions = []; state.purchases = [];
      state.coffees = STARTER_COFFEES.map(normalizeCoffee);
      state.recipes = defaultRecipes(); state.cups = defaultCups();
    }
    if (create) {
      if (!state.coffees.length) state.coffees = STARTER_COFFEES.map(normalizeCoffee);
      if (!state.recipes.length) state.recipes = defaultRecipes();
      if (!state.cups.length) state.cups = defaultCups();
      state.demoActive = false;
      await writeCsvFiles();
    } else {
      const texts = await readCsvFiles();
      if (texts.coffees === null && texts.extractions === null) {
        throw new Error("Ce dossier ne contient ni coffees.csv (ou cafes.csv) ni extractions.csv.");
      }
      adoptCsvFiles(texts);
      if (texts.recipes === null && !state.recipes.length) state.recipes = defaultRecipes();
      migrateData();
      await writeCsvFiles();
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
    // A French header (cafe_id, pour_qui...) counts under its English name.
    const keys = Object.keys(rows[0]).flatMap(k =>
      [k, ...Object.values(LEGACY.FIELDS).map(f => f[k]).filter(Boolean)]);
    if (keys.includes("purchase_date")) return "purchases";
    if (keys.includes("capacity_ml")) return "cups";
    if (keys.includes("best_for") || keys.includes("subtitle")) return "recipes";
    if (keys.includes("coffee_id") || keys.includes("diagnostic")) return "extractions";
    if (keys.includes("roaster") || keys.includes("recommended_method")) return "coffees";
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
    coffees: { cols: () => COFFEE_COLS, norm: r => normalizeCoffee(r), pref: "c" },
    extractions: { cols: () => EXT_COLS, norm: r => normalizeExtraction(r), pref: "e" },
    recipes: { cols: () => RECIPE_COLS, norm: r => normalizeRecipe(r), pref: "r" },
    cups: { cols: () => CUP_COLS, norm: r => normalizeCup(r), pref: "t" },
    purchases: { cols: () => PURCHASE_COLS, norm: r => normalizePurchase(r), pref: "a" },
    settings: { cols: () => SETTINGS_COLS, norm: r => normalizeSettings(r), pref: "g" },
  };

  function prepareImport(text) {
    if (/^\s*\{/.test(text)) {
      let doc;
      try { doc = JSON.parse(text); } catch (e) { throw new Error(I18N.t("import_json_unreadable")); }
      if (!doc || !doc.tables) throw new Error(I18N.t("import_json_unreadable"));
      // A file exported before v9.06 carries the French names: translated here.
      doc = LEGACY.renameDocument(doc);
      const n = Object.values(doc.tables).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
      return { table: "all", doc, n, added: 0, modified: 0, withoutId: 0, duplicates: 0 };
    }
    const rows = csvParse(text);
    const table = detectTable(rows);
    if (!table) throw new Error(I18N.t("import_unknown"));
    const def = IMPORT[table];
    const currentRows = state[table];
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
    const modified = stamped.filter(l => known.has(l.id) && l.updated_at !== known.get(l.id).updated_at).length;
    return { table, rows: stamped, n: stamped.length, added, modified, withoutId, duplicates };
  }

  function analyzeImport(text) {
    const p = prepareImport(text);
    return { table: p.table, n: p.n, added: p.added, modified: p.modified, withoutId: p.withoutId, duplicates: p.duplicates };
  }

  async function importCsvText(text) {
    const p = prepareImport(text);
    if (p.table === "all") {
      const merged = SYNC.mergeStates(localPayload(), p.doc);
      adoptTables(merged);
    } else {
      const byId = new Map(state[p.table].map(l => [l.id, l]));
      p.rows.forEach(l => byId.set(l.id, l));
      state[p.table] = [...byId.values()];
      if (p.table === "settings") state.settings = state.settings.slice(-1);
    }
    migrateData();
    state.demoActive = false;
    await persist();
    return { table: p.table, n: p.n };
  }

  // The tables as they are, and the tombstones. The full file.
  function exportAll() {
    TABLE_NAMES.forEach(table => download(csvFileName(table), CSV_TEXT[table]()));
    download("logbook-full.json", JSON.stringify({ ...localPayload(), exported_at: new Date().toISOString() }),
      "application/json;charset=utf-8");
  }

  function exportCoffees() { download(csvFileName("coffees"), CSV_TEXT.coffees()); }
  function exportExtractions(list) { download(csvFileName("extractions"), CSV_TEXT.extractions(list)); }
  function exportRecipes() { download(csvFileName("recipes"), CSV_TEXT.recipes()); }

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
    const dates = extractions.map(e => String(e.date_time).slice(0, 10)).filter(Boolean).sort();
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
    extractions.forEach(e => { e.date_time = shift(e.date_time); });
    coffees.forEach(c => {
      c.roast_date = shift(c.roast_date);
      c.added_date = shift(c.added_date);
    });
  }

  async function loadDemo() {
    // A failure leaves the data in place rather than half-emptying the state.
    if (!await loadDemoScript()) throw new Error("Demo dataset unavailable.");
    state.coffees = csvParse(DEMO_COFFEES_CSV).map(normalizeCoffee);
    state.extractions = csvParse(DEMO_EXTRACTIONS_CSV).map(normalizeExtraction);
    rejuvenateDemo(state.coffees, state.extractions);
    state.recipes = defaultRecipes();
    state.cups = defaultCups();
    // The demo has no purchases file: the migration builds one implicit bag
    // per coffee, which is enough to bring the stock to life in the demo.
    state.purchases = [];
    migrateData();
    /* These implicit bags have no opening date, and without it no cup has a
       bag day: the coffee record showed an empty curve and the "bag age" rule
       never spoke in the demo (v8.46). So the demo opens each bag on the day
       it buys it. */
    state.purchases.forEach(a => { if (!a.opened_date) a.opened_date = a.purchase_date; });
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
    state.purchases.forEach(l => markDeleted("purchases", l.id));
    keepSeeded("coffees", STARTER_COFFEES);
    keepSeeded("recipes", STARTER_RECIPES);
    keepSeeded("cups", STARTER_CUPS);
    state.extractions = [];
    state.coffees = STARTER_COFFEES.map(normalizeCoffee);
    state.recipes = defaultRecipes();
    state.cups = defaultCups();
    state.purchases = [];
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
        coffees: state.coffees,
        extractions: state.extractions,
        recipes: state.recipes,
        cups: state.cups,
        purchases: state.purchases,
        settings: state.settings,
      },
      tombstones: state.tombstones,
      // The tab states its version: the server refuses a tab older than the
      // document, which would erase the columns it does not know (v8.71).
      schema: CURRENT_SCHEMA,
    };
  }

  // Adopts merged, normalised tables, with the starter recipes and cups as a fallback.
  function adoptTables(merged) {
    state.coffees = (merged.tables.coffees || []).map(normalizeCoffee);
    state.extractions = (merged.tables.extractions || []).map(normalizeExtraction);
    state.recipes = (merged.tables.recipes || []).map(normalizeRecipe);
    state.cups = (merged.tables.cups || []).map(normalizeCup);
    state.purchases = (merged.tables.purchases || []).map(normalizePurchase);
    state.settings = (merged.tables.settings || []).map(normalizeSettings).slice(0, 1);
    state.tombstones = merged.tombstones || SYNC.emptyTombstones();
    if (!state.recipes.length) state.recipes = defaultRecipes();
    if (!state.cups.length) state.cups = defaultCups();
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
    state.syncState = "syncing";
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
      state.syncSize = Number(received.size) || 0;
      state.syncCap = Number(received.cap) || 0;
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
      state.syncState = error && error.code ? error.code : "error";
      if (state.syncState !== "outdated-version" && state.syncState !== "session-expired") {
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
      console.error("Local storage unavailable", e);
      if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("carnet-storage-failed"));
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
    c.id = newId("c", state.coffees);
    if (!c.added_date) c.added_date = localDateToday();
    state.coffees.push(c);
    await persist();
    return c;
  }

  async function editCoffee(id, coffee) {
    const idx = state.coffees.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const c = stampRow(normalizeCoffee(coffee));
    c.id = id;
    // The date added is not editable: keep the one in place.
    if (!c.added_date) c.added_date = state.coffees[idx].added_date || "";
    state.coffees[idx] = c;
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
    while (state.recipes.some(x => x.id === id)) { n++; id = "r" + n; }
    r.id = id;
    state.recipes.push(r);
    await persist();
    return r;
  }

  async function editRecipe(id, recipe) {
    const idx = state.recipes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const oldName = state.recipes[idx].name;
    const r = stampRow(normalizeRecipe(recipe));
    r.id = id;
    // An original recipe keeps its structural markers (4:6 variants).
    if (isOriginalRecipe(id)) {
      const originalRecipe = STARTER_RECIPES.find(x => x.id === id);
      r.has_variants = originalRecipe.has_variants;
    }
    state.recipes[idx] = r;
    // If the name changes, follow it in the extractions and the coffees.
    if (oldName && r.name !== oldName) {
      state.extractions.forEach(e => { if (e.recipe === oldName) e.recipe = r.name; });
      state.coffees.forEach(c => { if (c.recommended_recipe === oldName) c.recommended_recipe = r.name; });
    }
    await persist();
    return r;
  }

  async function resetRecipe(id) {
    const originalRecipe = STARTER_RECIPES.find(x => x.id === id);
    if (!originalRecipe) return null;
    const idx = state.recipes.findIndex(x => x.id === id);
    const r = normalizeRecipe({
      ...originalRecipe,
      steps: originalRecipe.steps.map(e => ({ ...e })),
      pairedCoffees: [...originalRecipe.pairedCoffees],
    });
    stampRow(r);
    if (idx < 0) state.recipes.push(r);
    else {
      const oldName = state.recipes[idx].name;
      state.recipes[idx] = r;
      if (oldName && oldName !== r.name) {
        state.extractions.forEach(e => { if (e.recipe === oldName) e.recipe = r.name; });
        state.coffees.forEach(c => { if (c.recommended_recipe === oldName) c.recommended_recipe = r.name; });
      }
    }
    await persist();
    return r;
  }

  async function deleteRecipe(id) {
    if (isOriginalRecipe(id)) return false;
    markDeleted("recipes", id);
    state.recipes = state.recipes.filter(x => x.id !== id);
    await persist();
    return true;
  }

  // ---------- Cups: mutations ----------

  async function addCup(label, capacity) {
    let n = 1, id = "tp" + n;
    while (state.cups.some(x => x.id === id)) { n++; id = "tp" + n; }
    state.cups.push(stampRow(normalizeCup({ id, name: label, capacity_ml: capacity })));
    await persist();
  }

  async function deleteCup(id) {
    markDeleted("cups", id);
    state.cups = state.cups.filter(x => x.id !== id);
    if (!state.cups.length) state.cups = defaultCups();
    await persist();
  }

  // ---------- Initialisation ----------

  /* THE LOCAL COPY UNDER ITS OLD KEYS (v9.06). IndexedDB kept the tables
     under their French names until v9.05 (cafes, recettes, tasses, achats,
     reglages, tombes; "extractions" is the same word in both). Both key sets
     are read: a device that has only the French ones is converted, and one
     that has both (an old tab kept writing next to a new one) gets them merged
     by id, the most recent row winning. The French keys are removed once the
     English ones are written, never before. */
  async function readStoredDocument() {
    const raw = { tables: {} };
    const legacyKeys = [];
    for (const key of [...TABLE_NAMES, ...Object.keys(LEGACY.TABLES)]) {
      const value = await kvGet(key);
      if (value === undefined || value === null) continue;
      raw.tables[key] = value;
      if (LEGACY.tableName(key) !== key) legacyKeys.push(key);
    }
    for (const key of ["tombstones", "tombes"]) {
      const value = await kvGet(key);
      if (value === undefined || value === null) continue;
      raw[key] = value;
      if (key !== "tombstones") legacyKeys.push(key);
    }
    return { doc: LEGACY.renameDocument(raw), legacyKeys };
  }

  async function init() {
    await openDB();
    const { doc, legacyKeys } = await readStoredDocument();
    const { coffees, extractions, recipes, cups, purchases, settings: settingsRows } = doc.tables;
    const demoActive = await kvGet("demoActive");
    if (Array.isArray(coffees)) state.coffees = coffees.map(normalizeCoffee);
    if (Array.isArray(extractions)) state.extractions = extractions.map(normalizeExtraction);
    if (Array.isArray(recipes) && recipes.length) state.recipes = recipes.map(normalizeRecipe);
    else state.recipes = defaultRecipes();
    if (Array.isArray(cups) && cups.length) state.cups = cups.map(normalizeCup);
    else state.cups = defaultCups();
    if (Array.isArray(purchases)) state.purchases = purchases.map(normalizePurchase);
    if (Array.isArray(settingsRows)) state.settings = settingsRows.map(normalizeSettings).slice(0, 1);
    state.demoActive = !!demoActive;
    const handle = await kvGet("dirHandle");
    if (handle) {
      state.dirHandle = handle;
      // The permission will be requested on the first user gesture; we try a
      // silent re-read if it is already granted.
      try {
        if (await handle.queryPermission({ mode: "readwrite" }) === "granted") adoptCsvFiles(await readCsvFiles());
      } catch (e) { console.warn("Could not reread the linked folder", e); }
    }
    if (doc.tombstones && typeof doc.tombstones === "object") state.tombstones = doc.tombstones;

    migrateData();
    await saveLocal();
    if (legacyKeys.length) await kvDeleteMany(legacyKeys);

    /* No more sync here (v8.72): it blocked the first display. It is app.js
       that starts it right after the first render, and that only opens the
       welcome dialog if the server returned nothing either. */
    return state.coffees.length > 0 || state.extractions.length > 0;
  }

  return {
    state, subscribe, notify, init, dataRevision,
    synchronize, syncPossible, carryTimestamps,
    /* csvRecipes is exposed so the CSV round trip is testable on the REAL
       export path: that is the one that lost heat_level. */
    csvParse, csvSerialize, csvRecipes, COFFEE_COLS, EXT_COLS, RECIPE_COLS, PURCHASE_COLS,
    currentBag, bagStock, addPurchase, deletePurchase, correctStock,
    // The jar, the record of the bag and the weighing (v9.13), in data-calcs.js.
    usualDose, bagGauge, bagRecord, weighJar: DATA_CALCS.weighJar,
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
