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
 *   data-calculs.js     derived fields and bag lookups (read only)
 *   data-migrations.js  schema version and catch-ups of existing data
 *
 * The DATA facade returned at the bottom exposes the same name as before for
 * each function, wherever it lives: the rest of the site did not move. */
"use strict";

const DATA = (() => {

  const { csvParse, csvSerialiser } = DATA_CSV;
  const { CAFE_COLS, EXT_COLS, REGLAGE_ID, REGLAGE_COLS, RECETTE_COLS, TASSE_COLS, ACHAT_COLS,
    estampiller, reporterHorodatage, nouvelId, dateLocaleAujourdhui, maintenant, reglerDecalage,
    normaliserCafe, normaliserExtraction, normaliserReglages, normaliserRecette, normaliserAchat,
    normaliserTasse, recetteVersLigne, recettesDefaut, tassesDefaut } = DATA_SCHEMA;
  const { ouvrirDB, kvGet, kvSet, kvSetPlusieurs, verifierPermission, ecrireFichier, lireFichier, telecharger } = DATA_STORE;

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
    fsDisponible: typeof window !== "undefined" && "showDirectoryPicker" in window,
    demoActive: false,

    // Sync between devices. `tombes` remembers deletions
    // ({table: {id: timestamp}}): without them, a row deleted on the phone
    // would come back at the next exchange with the desktop, which still has it.
    // Outside the CSV files: this is sync machinery, not coffee data.
    tombes: typeof SYNC === "undefined" ? {} : SYNC.tombesVides(),
    syncEtat: "inconnu",
    syncLe: null,
    // Size of the document on the server and the cap it accepts, in bytes.
    // Returned on every exchange; the Data panel warns past the halfway mark.
    syncTaille: 0,
    syncPlafond: 0,
  };

  /* Read-only helpers and catch-ups, bound to the state above. The functions
     passed as helpers are declarations, so already hoisted at this point. */
  const { cafeDe, calculs, sachetALaDate, sachetCourant, stockSachet } = DATA_CALCULS.pour(state);
  const { migrerDonnees, appliquerSchema, SCHEMA_ACTUEL } =
    DATA_MIGRATIONS.pour(state, { marquerSupprime, reglagesCourants });

  /* Lays a tombstone. The date is used to decide against a possible rewrite
     of the same row on the other device. */
  function marquerSupprime(table, id) {
    if (!state.tombes[table]) state.tombes[table] = {};
    state.tombes[table][id] = maintenant();
  }

  /* THE REVISION (v8.75): it changes with every notification that touches the
     data. The interface keeps its per-cup calculations as long as it does not
     move, instead of recomputing everything on every render and keystroke. A
     "sync" notification (only the sync status) does not change it, and the
     subscribers know they have nothing to redraw but the status dot. */
  const abonnes = [];
  let revision = 0;
  function abonner(fn) { abonnes.push(fn); }
  function notifier(genre) {
    if (genre !== "sync") revision++;
    abonnes.forEach(fn => { try { fn(genre); } catch (e) { console.error(e); } });
  }
  function revisionDonnees() { return revision; }

  function reglagesCourants() {
    return state.reglages[0] || normaliserReglages({});
  }

  /* Writes the settings and makes them travel. Like every mutation, it stamps:
     the device that sets last wins the merge, which is exactly what we want
     for a preference. */
  async function majReglages(partiel) {
    const fusion = estampiller(normaliserReglages({ ...reglagesCourants(), ...partiel }));
    state.reglages = [fusion];
    await persister();
    return fusion;
  }

  function csvRecettes() {
    return csvSerialiser(state.recettes.map(recetteVersLigne), RECETTE_COLS);
  }

  async function ajouterAchat(achat) {
    const a = estampiller(normaliserAchat(achat));
    a.id = nouvelId("a", state.achats);
    state.achats.push(a);
    // The coffee record follows the latest bag: format, price and roast date
    // shown elsewhere must stay consistent with it.
    const cafe = state.cafes.find(c => c.id === a.cafe_id);
    if (cafe) {
      if (a.format_grammes !== "") cafe.format_grammes = a.format_grammes;
      if (a.prix_vnd !== "") cafe.prix_vnd = a.prix_vnd;
      cafe.date_torrefaction = a.date_torrefaction;
      estampiller(cafe);
    }
    await persister();
    return a;
  }

  /* CORRECTING THE STOCK BY HAND (v8.96). Writes the count on the current
     bag; with no bag recorded for this coffee, creates one dated today, in the
     coffee's format, to hold the count. The time is the cups' one, local and to
     the minute, so that "the cups after" compares as text. */
  async function corrigerStock(cafeId, grammes) {
    const g = Math.round(Number(grammes) * 10) / 10;
    if (!Number.isFinite(g) || g < 0) return null;
    const d = new Date(maintenant());
    const le = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const sachet = sachetCourant(cafeId);
    if (!sachet) {
      const cafe = state.cafes.find(c => c.id === cafeId);
      if (!cafe) return null;
      return ajouterAchat({
        cafe_id: cafeId, date_achat: le.slice(0, 10),
        format_grammes: Number(cafe.format_grammes) > 0 ? cafe.format_grammes : Math.max(g, 1),
        prix_vnd: cafe.prix_vnd, date_torrefaction: cafe.date_torrefaction,
        restant_g: g, restant_le: le,
      });
    }
    sachet.restant_g = g;
    sachet.restant_le = le;
    estampiller(sachet);
    await persister();
    return sachet;
  }

  async function supprimerAchat(id) {
    marquerSupprime("achats", id);
    state.achats = state.achats.filter(x => x.id !== id);
    await persister();
  }

  async function saveLocal() {
    await kvSetPlusieurs({
      cafes: state.cafes, extractions: state.extractions, recettes: state.recettes,
      tasses: state.tasses, demoActive: state.demoActive, achats: state.achats,
      reglages: state.reglages, tombes: state.tombes,
    });
  }

  // ---------- File System Access ----------

  let pendingWrite = null;
  async function sauverFichiers() {
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
          if (state.fichierAReautoriser !== !ok) { state.fichierAReautoriser = !ok; notifier(); }
          if (!ok) { resolve(false); return; }
          await ecrireFichier(state.dirHandle, "cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
          await ecrireFichier(state.dirHandle, "extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
          await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
          await ecrireFichier(state.dirHandle, "tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
          await ecrireFichier(state.dirHandle, "achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
          await ecrireFichier(state.dirHandle, "reglages.csv", csvSerialiser(state.reglages, REGLAGE_COLS));
          resolve(true);
        } catch (e) {
          console.error("Écriture fichier impossible", e);
          resolve(false);
        }
      }, 400);
    });
  }

  async function lierDossier(creer) {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await verifierPermission(handle)) throw new Error("Permission refusée");
    state.dirHandle = handle;
    /* Linking a folder while leaving the demo (v8.71): the 62 demo cups
       would have become real data, then gone to the server. */
    if (state.demoActive) {
      state.extractions = []; state.achats = [];
      state.cafes = CAFES_DEPART.map(normaliserCafe);
      state.recettes = recettesDefaut(); state.tasses = tassesDefaut();
    }
    if (creer) {
      if (!state.cafes.length) state.cafes = CAFES_DEPART.map(normaliserCafe);
      if (!state.recettes.length) state.recettes = recettesDefaut();
      if (!state.tasses.length) state.tasses = tassesDefaut();
      state.demoActive = false;
      await ecrireFichier(state.dirHandle, "cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
      await ecrireFichier(state.dirHandle, "extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
      await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
      await ecrireFichier(state.dirHandle, "tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
      await ecrireFichier(state.dirHandle, "achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
      await ecrireFichier(state.dirHandle, "reglages.csv", csvSerialiser(state.reglages, REGLAGE_COLS));
    } else {
      const tc = await lireFichier(state.dirHandle, "cafes.csv");
      const te = await lireFichier(state.dirHandle, "extractions.csv");
      const tr = await lireFichier(state.dirHandle, "recettes.csv");
      const tt = await lireFichier(state.dirHandle, "tasses.csv");
      const ta = await lireFichier(state.dirHandle, "achats.csv");
      const tg = await lireFichier(state.dirHandle, "reglages.csv");
      if (tc === null && te === null) {
        throw new Error("Ce dossier ne contient ni cafes.csv ni extractions.csv.");
      }
      if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
      if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
      if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
      else if (!state.recettes.length) state.recettes = recettesDefaut();
      if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
      if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
      if (tg !== null) state.reglages = reporterHorodatage(csvParse(tg).map(normaliserReglages), state.reglages, REGLAGE_COLS).slice(0, 1);
      migrerDonnees();
      await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
      state.demoActive = false;
    }
    await kvSet("dirHandle", handle);
    await saveLocal();
    notifier();
    return handle.name;
  }

  // On a tap of the "to re-authorise" badge: a real gesture, the request goes through.
  async function reautoriserDossier() {
    if (!state.dirHandle) return false;
    const ok = await verifierPermission(state.dirHandle);
    state.fichierAReautoriser = !ok;
    if (ok) await sauverFichiers();
    notifier();
    return ok;
  }

  async function delierDossier() {
    state.dirHandle = null;
    await kvSet("dirHandle", null);
    notifier();
  }

  // ---------- Import and export ----------

  function detectTable(rows) {
    if (!rows.length) return null;
    const cles = Object.keys(rows[0]);
    if (cles.includes("date_achat")) return "achats";
    if (cles.includes("contenance_ml")) return "tasses";
    if (cles.includes("pour_qui") || cles.includes("sous_titre")) return "recettes";
    if (cles.includes("cafe_id") || cles.includes("diagnostic")) return "extractions";
    if (cles.includes("torrefacteur") || cles.includes("machine_recommandee")) return "cafes";
    return null;
  }

  /* THE IMPORT (v8.71). Three defects fixed at once:
     - a table without a branch (the purchases) fell into the "else" and
       OVERWROTE all the extractions; each table now has its branch, and an
       unknown table is refused;
     - the table was replaced whole: the import now MERGES by id, a row
       missing from the file stays in place;
     - a row identical to the one we have keeps its date, only new or
       changed rows are stamped (reporterHorodatage).
     A row without an id gets one; a duplicated id keeps its last row.
     analyserImport describes all of this BEFORE, for the confirmation.
     The full exported file (JSON) can be re-imported too, through the same
     merge as the sync. */
  const IMPORT = {
    cafes: { cols: () => CAFE_COLS, norm: r => normaliserCafe(r), pref: "c" },
    extractions: { cols: () => EXT_COLS, norm: r => normaliserExtraction(r), pref: "e" },
    recettes: { cols: () => RECETTE_COLS, norm: r => normaliserRecette(r), pref: "r" },
    tasses: { cols: () => TASSE_COLS, norm: r => normaliserTasse(r), pref: "t" },
    achats: { cols: () => ACHAT_COLS, norm: r => normaliserAchat(r), pref: "a" },
    reglages: { cols: () => REGLAGE_COLS, norm: r => normaliserReglages(r), pref: "g" },
  };

  function prepareImport(texte) {
    if (/^\s*\{/.test(texte)) {
      let doc;
      try { doc = JSON.parse(texte); } catch (e) { throw new Error(I18N.t("imp_json_illisible")); }
      if (!doc || !doc.tables) throw new Error(I18N.t("imp_json_illisible"));
      const n = Object.values(doc.tables).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
      return { table: "tout", doc, n, nouvelles: 0, modifiees: 0, sansId: 0, doublons: 0 };
    }
    const rows = csvParse(texte);
    const table = detectTable(rows);
    if (!table) throw new Error(I18N.t("imp_inconnue"));
    const def = IMPORT[table];
    const actuelles = table === "reglages" ? state.reglages : state[table];
    const parId = new Map();
    let sansId = 0, doublons = 0;
    rows.map(def.norm).forEach(l => {
      if (!l.id) { l.id = nouvelId(def.pref, [...actuelles, ...parId.values()]); sansId++; }
      if (parId.has(l.id)) doublons++;
      parId.set(l.id, l);
    });
    const lignes = reporterHorodatage([...parId.values()], actuelles, def.cols());
    const connues = new Map(actuelles.map(l => [l.id, l]));
    const nouvelles = lignes.filter(l => !connues.has(l.id)).length;
    const modifiees = lignes.filter(l => connues.has(l.id) && l.maj_le !== connues.get(l.id).maj_le).length;
    return { table, lignes, n: lignes.length, nouvelles, modifiees, sansId, doublons };
  }

  function analyserImport(texte) {
    const p = prepareImport(texte);
    return { table: p.table, n: p.n, nouvelles: p.nouvelles, modifiees: p.modifiees, sansId: p.sansId, doublons: p.doublons };
  }

  async function importerTexteCSV(texte) {
    const p = prepareImport(texte);
    if (p.table === "tout") {
      const fusion = SYNC.fusionner(localPayload(), p.doc);
      adoptTables(fusion);
    } else {
      const parId = new Map(state[p.table].map(l => [l.id, l]));
      p.lignes.forEach(l => parId.set(l.id, l));
      state[p.table] = [...parId.values()];
      if (p.table === "reglages") state.reglages = state.reglages.slice(-1);
    }
    migrerDonnees();
    state.demoActive = false;
    await persister();
    return { table: p.table, n: p.n };
  }

  // The tables as they are, and the tombstones. The full file.
  function exporterTout() {
    telecharger("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
    telecharger("extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
    telecharger("recettes.csv", csvRecettes());
    telecharger("tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
    telecharger("achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
    telecharger("reglages.csv", csvSerialiser(state.reglages, REGLAGE_COLS));
    telecharger("carnet-complet.json", JSON.stringify({ ...localPayload(), exporte_le: new Date().toISOString() }),
      "application/json;charset=utf-8");
  }

  function exporterCafes() { telecharger("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS)); }
  function exporterExtractions(liste) {
    telecharger("extractions.csv", csvSerialiser(liste || state.extractions, EXT_COLS));
  }
  function exporterRecettes() { telecharger("recettes.csv", csvRecettes()); }

  // ---------- Demo ----------

  /* The demo data set is loaded ON DEMAND: it only serves the button of the
     welcome dialog, which Chris will never see again since he has his data.
     Precached anyway, so the demo works offline like everything else. */
  function loadDemoScript() {
    if (typeof DEMO_CAFES_CSV !== "undefined") return Promise.resolve(true);
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = OUTILS.urlVersionnee("js/demo-data.js");
      s.onload = () => resolve(typeof DEMO_CAFES_CSV !== "undefined");
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
  function rejuvenateDemo(cafes, extractions) {
    const dates = extractions.map(e => String(e.date_heure).slice(0, 10)).filter(Boolean).sort();
    if (!dates.length) return;
    const derniere = new Date(dates[dates.length - 1] + "T12:00");
    const hier = new Date(); hier.setHours(12, 0, 0, 0); hier.setDate(hier.getDate() - 1);
    const jours = Math.round((hier - derniere) / 86400000);
    if (jours <= 0) return;
    const shift = v => {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(v || ""))) return v;
      const d = new Date(String(v).slice(0, 10) + "T12:00");
      d.setDate(d.getDate() + jours);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return iso + String(v).slice(10);
    };
    extractions.forEach(e => { e.date_heure = shift(e.date_heure); });
    cafes.forEach(c => {
      c.date_torrefaction = shift(c.date_torrefaction);
      c.date_ajout = shift(c.date_ajout);
    });
  }

  async function chargerDemo() {
    // A failure leaves the data in place rather than half-emptying the state.
    if (!await loadDemoScript()) throw new Error("Jeu de démonstration indisponible.");
    state.cafes = csvParse(DEMO_CAFES_CSV).map(normaliserCafe);
    state.extractions = csvParse(DEMO_EXTRACTIONS_CSV).map(normaliserExtraction);
    rejuvenateDemo(state.cafes, state.extractions);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    // The demo has no purchases file: the migration builds one implicit bag
    // per coffee, which is enough to bring the stock to life in the demo.
    state.achats = [];
    migrerDonnees();
    /* These implicit bags have no opening date, and without it no cup has a
       bag day: the coffee record showed an empty curve and the "bag age" rule
       never spoke in the demo (v8.46). So the demo opens each bag on the day
       it buys it. */
    state.achats.forEach(a => { if (!a.date_ouverture) a.date_ouverture = a.date_achat; });
    state.demoActive = true;
    await saveLocal();
    notifier();
  }

  async function viderDonnees() {
    /* Tombstones for everything that goes (v8.71): without them, the next
       sync brought everything back from the server, and "empty" emptied nothing. */
    const keepSeeded = (table, semees) => state[table]
      .filter(l => !semees.some(s => s.id === l.id)).forEach(l => marquerSupprime(table, l.id));
    state.extractions.forEach(l => marquerSupprime("extractions", l.id));
    state.achats.forEach(l => marquerSupprime("achats", l.id));
    keepSeeded("cafes", CAFES_DEPART);
    keepSeeded("recettes", RECETTES_DEPART);
    keepSeeded("tasses", TASSES_DEPART);
    state.extractions = [];
    state.cafes = CAFES_DEPART.map(normaliserCafe);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    state.achats = [];
    state.demoActive = false;
    await persister();
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
      schema: SCHEMA_ACTUEL,
    };
  }

  // Adopts merged, normalised tables, with the starter recipes and cups as a fallback.
  function adoptTables(fusion) {
    state.cafes = (fusion.tables.cafes || []).map(normaliserCafe);
    state.extractions = (fusion.tables.extractions || []).map(normaliserExtraction);
    state.recettes = (fusion.tables.recettes || []).map(normaliserRecette);
    state.tasses = (fusion.tables.tasses || []).map(normaliserTasse);
    state.achats = (fusion.tables.achats || []).map(normaliserAchat);
    state.reglages = (fusion.tables.reglages || []).map(normaliserReglages).slice(0, 1);
    state.tombes = fusion.tombes || SYNC.tombesVides();
    if (!state.recettes.length) state.recettes = recettesDefaut();
    if (!state.tasses.length) state.tasses = tassesDefaut();
  }

  function syncPossible() {
    // NEVER in demo: without this guard, loading the demo on a device
    // would send 62 fake extractions into the real data.
    return typeof SYNC !== "undefined" && SYNC.disponible() && !state.demoActive;
  }

  /* Exchanges with the server and ADOPTS the merged result. Does not go
     through persister(): that would restart a sync in a loop. */
  async function synchroniser(manuelle) {
    if (!syncPossible()) {
      state.syncEtat = typeof SYNC === "undefined" || !SYNC.disponible() ? "local" : "demo";
      if (manuelle) notifier();
      return state.syncEtat;
    }
    /* A sync requested while another is in flight is no longer lost
       (v8.71): it starts again as soon as the first one is done. */
    if (syncInFlight) { syncRequeued = true; return state.syncEtat; }
    syncInFlight = true;
    syncRequeued = false;
    state.syncEtat = "encours";
    notifier("sync");
    let tablesBefore = null;

    const sentGeneration = generation;
    try {
      const recu = await SYNC.echanger(localPayload());
      tablesBefore = JSON.stringify(localPayload().tables);
      reglerDecalage((Number(recu.serverTime) || Date.now()) - Date.now());
      /* MERGED with the state as it is on return, no longer substituted:
         whatever was entered during the exchange stays. */
      adoptTables(SYNC.fusionner(recu, localPayload()));
      state.syncTaille = Number(recu.taille) || 0;
      state.syncPlafond = Number(recu.plafond) || 0;
      migrerDonnees();
      await saveLocal();
      sauverFichiers();
      state.syncEtat = "ok";
      state.syncLe = Date.now();
      syncFailures = 0;
      if (generation !== sentGeneration) syncRequeued = true;
    } catch (error) {
      // The local data is kept as is: a failed sync must never lose an
      // entry. Retry with a growing delay (v8.71), unless the server says
      // this tab is too old: it has to reload.
      state.syncEtat = error && error.code ? error.code : "erreur";
      if (state.syncEtat !== "version-perimee" && state.syncEtat !== "session-expiree") {
        const delai = RETRY_DELAYS_MS[Math.min(syncFailures, RETRY_DELAYS_MS.length - 1)];
        syncFailures++;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => synchroniser(false), delai);
      }
    } finally {
      syncInFlight = false;
      // Nothing moved in the tables: only the sync status dot changes.
      notifier(tablesBefore !== null && tablesBefore !== JSON.stringify(localPayload().tables) ? undefined : "sync");
      if (syncRequeued) scheduleSync();
    }
    return state.syncEtat;
  }

  function scheduleSync() {
    if (!syncPossible()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { synchroniser(false); }, SYNC_DEBOUNCE_MS);
  }

  /* Every persist bumps the generation: a sync that comes back knows whether
     something moved during its flight. A failed local write (storage full)
     is reported, and the sync goes out anyway: the cup no longer lives only
     in memory (v8.71). */
  async function persister() {
    generation++;
    try {
      await saveLocal();
    } catch (e) {
      console.error("Stockage local impossible", e);
      if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("carnet-stockage-ko"));
    }
    sauverFichiers();
    notifier();
    scheduleSync();
  }

  /* Re-inserts a deleted extraction UNDER ITS ORIGINAL ID. Used to undo a
     deletion: the row is already gone, tombstone included, and this later
     write brings it back everywhere, including on the other devices. */
  async function restaurerExtraction(ext) {
    if (!ext || !ext.id) return null;
    const e = estampiller(normaliserExtraction(ext));
    e.id = ext.id;
    const i = state.extractions.findIndex(x => x.id === e.id);
    if (i >= 0) state.extractions[i] = e;
    else state.extractions.push(e);
    await persister();
    return e;
  }

  async function ajouterExtraction(ext) {
    const e = estampiller(normaliserExtraction(ext));
    e.id = nouvelId("e", state.extractions);
    state.extractions.push(e);
    await persister();
    return e;
  }

  async function modifierExtraction(id, ext) {
    const idx = state.extractions.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const e = estampiller(normaliserExtraction(ext));
    e.id = id;
    state.extractions[idx] = e;
    await persister();
    return e;
  }

  async function supprimerExtraction(id) {
    marquerSupprime("extractions", id);
    state.extractions = state.extractions.filter(x => x.id !== id);
    await persister();
  }

  async function ajouterCafe(cafe) {
    const c = estampiller(normaliserCafe(cafe));
    c.id = nouvelId("c", state.cafes);
    if (!c.date_ajout) c.date_ajout = dateLocaleAujourdhui();
    state.cafes.push(c);
    await persister();
    return c;
  }

  async function modifierCafe(id, cafe) {
    const idx = state.cafes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const c = estampiller(normaliserCafe(cafe));
    c.id = id;
    // The date added is not editable: keep the one in place.
    if (!c.date_ajout) c.date_ajout = state.cafes[idx].date_ajout || "";
    state.cafes[idx] = c;
    await persister();
    return c;
  }

  // ---------- Recipes: mutations ----------

  function estRecetteDorigine(id) {
    return RECETTES_DEPART.some(r => r.id === id);
  }

  async function ajouterRecette(recette) {
    const r = estampiller(normaliserRecette(recette));
    let n = 1;
    let id = "r" + n;
    while (state.recettes.some(x => x.id === id)) { n++; id = "r" + n; }
    r.id = id;
    state.recettes.push(r);
    await persister();
    return r;
  }

  async function modifierRecette(id, recette) {
    const idx = state.recettes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const oldName = state.recettes[idx].nom;
    const r = estampiller(normaliserRecette(recette));
    r.id = id;
    // An original recipe keeps its structural markers (4:6 variants).
    if (estRecetteDorigine(id)) {
      const origine = RECETTES_DEPART.find(x => x.id === id);
      r.variantes = origine.variantes;
    }
    state.recettes[idx] = r;
    // If the name changes, follow it in the extractions and the coffees.
    if (oldName && r.nom !== oldName) {
      state.extractions.forEach(e => { if (e.recette === oldName) e.recette = r.nom; });
      state.cafes.forEach(c => { if (c.recette_recommandee === oldName) c.recette_recommandee = r.nom; });
    }
    await persister();
    return r;
  }

  async function reinitialiserRecette(id) {
    const origine = RECETTES_DEPART.find(x => x.id === id);
    if (!origine) return null;
    const idx = state.recettes.findIndex(x => x.id === id);
    const r = normaliserRecette({
      ...origine,
      etapes: origine.etapes.map(e => ({ ...e })),
      cafesAssocies: [...origine.cafesAssocies],
    });
    estampiller(r);
    if (idx < 0) state.recettes.push(r);
    else {
      const oldName = state.recettes[idx].nom;
      state.recettes[idx] = r;
      if (oldName && oldName !== r.nom) {
        state.extractions.forEach(e => { if (e.recette === oldName) e.recette = r.nom; });
        state.cafes.forEach(c => { if (c.recette_recommandee === oldName) c.recette_recommandee = r.nom; });
      }
    }
    await persister();
    return r;
  }

  async function supprimerRecette(id) {
    if (estRecetteDorigine(id)) return false;
    marquerSupprime("recettes", id);
    state.recettes = state.recettes.filter(x => x.id !== id);
    await persister();
    return true;
  }

  // ---------- Cups: mutations ----------

  async function ajouterTasse(nom, contenance) {
    let n = 1, id = "tp" + n;
    while (state.tasses.some(x => x.id === id)) { n++; id = "tp" + n; }
    state.tasses.push(estampiller(normaliserTasse({ id, nom, contenance_ml: contenance })));
    await persister();
  }

  async function supprimerTasse(id) {
    marquerSupprime("tasses", id);
    state.tasses = state.tasses.filter(x => x.id !== id);
    if (!state.tasses.length) state.tasses = tassesDefaut();
    await persister();
  }

  // ---------- Initialisation ----------

  async function init() {
    await ouvrirDB();
    const cafes = await kvGet("cafes");
    const extractions = await kvGet("extractions");
    const recettes = await kvGet("recettes");
    const tasses = await kvGet("tasses");
    const achats = await kvGet("achats");
    const reglages = await kvGet("reglages");
    const demoActive = await kvGet("demoActive");
    if (Array.isArray(cafes)) state.cafes = cafes.map(normaliserCafe);
    if (Array.isArray(extractions)) state.extractions = extractions.map(normaliserExtraction);
    if (Array.isArray(recettes) && recettes.length) state.recettes = recettes;
    else state.recettes = recettesDefaut();
    if (Array.isArray(tasses) && tasses.length) state.tasses = tasses;
    else state.tasses = tassesDefaut();
    if (Array.isArray(achats)) state.achats = achats.map(normaliserAchat);
    if (Array.isArray(reglages)) state.reglages = reglages.map(normaliserReglages).slice(0, 1);
    state.demoActive = !!demoActive;
    const handle = await kvGet("dirHandle");
    if (handle) {
      state.dirHandle = handle;
      // The permission will be requested on the first user gesture; we try a
      // silent re-read if it is already granted.
      try {
        if (await handle.queryPermission({ mode: "readwrite" }) === "granted") {
          const tc = await lireFichier(state.dirHandle, "cafes.csv");
          const te = await lireFichier(state.dirHandle, "extractions.csv");
          const tr = await lireFichier(state.dirHandle, "recettes.csv");
          const tt = await lireFichier(state.dirHandle, "tasses.csv");
          const ta = await lireFichier(state.dirHandle, "achats.csv");
          const tg = await lireFichier(state.dirHandle, "reglages.csv");
          if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
          if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
          if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
          if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
          if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
          if (tg !== null) state.reglages = reporterHorodatage(csvParse(tg).map(normaliserReglages), state.reglages, REGLAGE_COLS).slice(0, 1);
        }
      } catch (e) { console.warn("Relecture du dossier lié impossible", e); }
    }
    const tombes = await kvGet("tombes");
    if (tombes && typeof tombes === "object") state.tombes = tombes;

    migrerDonnees();
    await saveLocal();

    /* No more sync here (v8.72): it blocked the first display. It is app.js
       that starts it right after the first render, and that only opens the
       welcome dialog if the server returned nothing either. */
    return state.cafes.length > 0 || state.extractions.length > 0;
  }

  return {
    state, abonner, notifier, init, revisionDonnees,
    synchroniser, syncPossible, reporterHorodatage,
    /* csvRecettes is exposed so the CSV round trip is testable on the REAL
       export path: that is the one that lost puissance_feu. */
    csvParse, csvSerialiser, csvRecettes, CAFE_COLS, EXT_COLS, RECETTE_COLS, ACHAT_COLS,
    sachetCourant, stockSachet, ajouterAchat, supprimerAchat, corrigerStock,
    calculs, cafeDe,
    lierDossier, delierDossier, reautoriserDossier, sauverFichiers,
    importerTexteCSV, analyserImport, exporterTout, exporterCafes, exporterExtractions, exporterRecettes,
    chargerDemo, viderDonnees,
    ajouterExtraction, modifierExtraction, supprimerExtraction, restaurerExtraction,
    ajouterCafe, modifierCafe,
    ajouterRecette, modifierRecette, reinitialiserRecette, supprimerRecette, estRecetteDorigine,
    // Exposed for the tests: it decides that an empty temperature stays
    // empty instead of dropping to 0, and that a heat level survives.
    sachetALaDate,
    normaliserRecette, normaliserReglages, normaliserExtraction,
    reglagesCourants, majReglages, REGLAGE_COLS, REGLAGE_ID,
    // Exposed for the tests: it catches up the STORED recipes when the
    // seeded values change, and that catch-up is marked once.
    migrerDonnees,
    ajouterTasse, supprimerTasse,
    kvGet, kvSet,
  };
})();
