/* Legacy names: the French names the logbook stored until v9.05.
 *
 * Until v9.05 every PERSISTED name was French: the tables (cafes, recettes,
 * tasses, achats, reglages), their columns (nom, note_sur_10, maj_le...), the
 * tombstones (tombes), the CSV file names and headers, the localStorage keys,
 * the entry draft and the screen hashes. v9.06 renamed them all to English.
 * Chris's data still exists in the old shape in many places that the code does
 * not control: the IndexedDB copy of each device, the linked folder, the CSV
 * files he exported, the D1 document and its thirty daily backups, the
 * localStorage of each browser, his bookmarks. So the old names are accepted
 * FOREVER, on read, through the tables below, and nothing else in the site
 * knows them.
 *
 * One table per layer:
 *   DATA      TABLES, DOCUMENT, FIELDS, STEP_FIELDS, DRAWINGS (rows and documents)
 *   STORAGE   PREF_KEYS, PREF_VALUES (localStorage)
 *   DRAFT     DRAFT_KEYS, DRAFT_IDS (the entry draft JSON)
 *   ROUTES    ROUTES (screen hashes, bookmarks, PWA shortcuts)
 *
 * THE DATA TABLES ARE COPIED in worker/legacy-names.js, which renames the D1
 * document with exactly the same rules: a test compares the two
 * (worker/sync.test.mjs). Any change here goes there too.
 *
 * The rule when a row carries both names: the NEW key wins, the old one is
 * dropped. Only names are translated here; stored values that are user
 * content (coffee names, recipe texts, roast "Foncée", descriptors,
 * diagnostics) never change. The only VALUES translated are the codes that
 * were names themselves: the drawing names kept in settings.drawings, and
 * the preference codes (theme, tabs, views). */
"use strict";

const LEGACY = (() => {

  // ---------- DATA ----------

  const TABLES = {
    cafes: "coffees", recettes: "recipes", tasses: "cups", achats: "purchases", reglages: "settings",
  };

  // Top-level keys of a document (sync payload, D1 document, full JSON export).
  const DOCUMENT = { tombes: "tombstones", exporte_le: "exported_at" };

  // Old column name to new, per table (new table names).
  const FIELDS = {
    coffees: {
      maj_le: "updated_at", nom: "name", torrefacteur: "roaster", origine: "origin", espece: "species",
      procede: "process", torrefaction: "roast", deja_moulu: "pre_ground",
      pourcentage_cafe_reel: "real_coffee_pct", notes_annoncees: "roaster_notes",
      format_grammes: "bag_size_g", prix_vnd: "price_vnd", date_torrefaction: "roast_date",
      machine_recommandee: "recommended_method", recette_recommandee: "recommended_recipe",
      date_ajout: "added_date", actif: "active",
    },
    extractions: {
      maj_le: "updated_at", date_heure: "date_time", cafe_id: "coffee_id", methode: "method",
      recette: "recipe", eau_g: "water_g", mouture_dial: "grind_dial", temps_total_s: "total_time_s",
      temps_ecoulement_s: "flow_time_s", volume_extrait_ml: "yield_ml",
      // Name of the same field before v8 (volume_extrait_ml wins when both are there).
      volume_tasse_ml: "yield_ml",
      eau_ajoutee_ml: "added_water_ml", lait_ml: "milk_ml", agitation_nb: "stir_count", tasse: "cup",
      eau_prechauffee: "preheated_water", note_sur_10: "score_10", descripteurs: "descriptors",
      commentaire: "comment", puissance_feu: "heat_level", ratee: "failed", chauffe_s: "heating_s",
    },
    // Both shapes of a recipe: the CSV row (snake_case) and the stored object (camelCase).
    recipes: {
      maj_le: "updated_at", nom: "name", numero: "number", methode: "method", famille: "family",
      variante: "variant", sous_titre: "subtitle", sousTitre: "subtitle", eau_g: "water_g", eau: "water",
      temp_texte: "temp_text", tempTexte: "tempText", mouture_dial: "grind_dial",
      ratio_texte: "ratio_text", ratioTexte: "ratioText", total_texte: "total_text", totalTexte: "totalText",
      lait: "milk", etapes: "steps", pour_qui: "best_for", pourQui: "bestFor",
      cafes_associes: "paired_coffees", cafesAssocies: "pairedCoffees", par_defaut: "is_default",
      parDefaut: "isDefault", avancee: "advanced", variantes: "has_variants", actif: "active",
      puissance_feu: "heat_level", volume_typique: "typical_volume", volumeTypique: "typicalVolume",
    },
    cups: { maj_le: "updated_at", nom: "name", contenance_ml: "capacity_ml" },
    purchases: {
      maj_le: "updated_at", cafe_id: "coffee_id", date_achat: "purchase_date", format_grammes: "bag_size_g",
      prix_vnd: "price_vnd", date_torrefaction: "roast_date", date_ouverture: "opened_date",
      restant_g: "remaining_g", restant_le: "remaining_at",
    },
    settings: {
      maj_le: "updated_at", puissance_feu: "heat_level", mouture_dial: "grind_dial", ebullition_s: "boil_s",
      pas_crans: "step_clicks", pas_degres: "step_degrees", pas_feu: "step_heat", pas_eau_g: "step_water_g",
      pas_dose_g: "step_dose_g", dessins: "drawings", bulles_s: "bubbles_s",
    },
  };

  // Keys of one recipe step, { t, texte } until v9.05.
  const STEP_FIELDS = { texte: "text" };

  // Drawing names kept in settings.drawings ("etagere,!horloge,podium").
  const DRAWINGS = {
    etagere: "shelf", frise: "ribbon", horloge: "clock", moulin: "grinder", progression: "progress",
    spectre: "spectrum",
  };

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const blank = v => v === undefined || v === null || v === "";

  /* Renames the keys of one object, in place order. A new key already present
     wins over its old name; two old names for one new key (volume_extrait_ml,
     volume_tasse_ml) keep the first non-empty one. Returns the SAME object
     when nothing is old, so an up-to-date row costs nothing. */
  function renameKeys(obj, aliases) {
    if (!isObject(obj)) return obj;
    let old = false;
    for (const k in obj) if (own(obj, k) && own(aliases, k)) { old = true; break; }
    if (!old) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      if (!own(aliases, k)) { out[k] = obj[k]; continue; }
      const target = aliases[k];
      if (own(obj, target)) continue;
      if (!own(out, target) || (blank(out[target]) && !blank(obj[k]))) out[target] = obj[k];
    }
    return out;
  }

  function renameDrawings(value) {
    if (typeof value !== "string" || value === "") return value;
    return value.split(",").map(part => {
      const hidden = part.startsWith("!");
      const nameKey = hidden ? part.slice(1) : part;
      return (hidden ? "!" : "") + (own(DRAWINGS, nameKey) ? DRAWINGS[nameKey] : nameKey);
    }).join(",");
  }

  // The new name of a table, whatever the name it arrives under.
  function tableName(nameKey) {
    return own(TABLES, nameKey) ? TABLES[nameKey] : nameKey;
  }

  /* One row, old shape to new shape. `table` is the new or the old name.
     Recipe steps and the drawing names of the settings row follow. */
  function renameRow(table, row) {
    const name = tableName(table);
    if (!isObject(row) || !own(FIELDS, name)) return row;
    let out = renameKeys(row, FIELDS[name]);
    if (name === "recipes" && Array.isArray(out.steps) && out.steps.some(s => isObject(s) && own(s, "texte"))) {
      out = { ...out, steps: out.steps.map(s => renameKeys(s, STEP_FIELDS)) };
    }
    if (name === "settings" && typeof out.drawings === "string") {
      const drawings = renameDrawings(out.drawings);
      if (drawings !== out.drawings) out = { ...out, drawings };
    }
    return out;
  }

  const stamp = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  /* Rows of one table found under BOTH names (a device that wrote the new
     name while an old tab kept writing the old one): merged by id, the most
     recent updated_at wins, the new-name row on a tie. */
  function mergeById(oldRows, newRows) {
    const byId = new Map();
    for (const row of oldRows) if (isObject(row)) byId.set(row.id, row);
    for (const row of newRows) {
      if (!isObject(row)) continue;
      const prev = byId.get(row.id);
      if (!prev || stamp(row.updated_at) >= stamp(prev.updated_at)) byId.set(row.id, row);
    }
    return [...byId.values()];
  }

  // The tables of a document, every table and every row under its new names.
  function renameTables(tables) {
    if (!isObject(tables)) return tables;
    const out = {};
    for (const key of Object.keys(tables)) {
      const name = tableName(key);
      const rows = Array.isArray(tables[key]) ? tables[key].map(r => renameRow(name, r)) : tables[key];
      if (!own(out, name)) { out[name] = rows; continue; }
      if (!Array.isArray(rows) || !Array.isArray(out[name])) {
        if (Array.isArray(rows)) out[name] = rows;
        continue;
      }
      out[name] = key === name ? mergeById(out[name], rows) : mergeById(rows, out[name]);
    }
    return out;
  }

  // Adds one table's marks to `out`, keeping the latest mark of each id.
  function addMarks(out, name, marks) {
    if (!isObject(marks)) { if (!own(out, name)) out[name] = marks; return; }
    const merged = isObject(out[name]) ? { ...out[name] } : {};
    for (const [id, ts] of Object.entries(marks)) {
      if (!own(merged, id) || stamp(ts) > stamp(merged[id])) merged[id] = ts;
    }
    out[name] = merged;
  }

  // Tombstones { table: { id: timestamp } }: new table names, latest mark kept.
  function renameTombstones(marks) {
    if (!isObject(marks)) return marks;
    const out = {};
    for (const key of Object.keys(marks)) addMarks(out, tableName(key), marks[key]);
    return out;
  }

  /* A whole document: { tables, tombes, schema, ... } in any mix of old and
     new names comes out with new names only. Unknown keys pass through. */
  function renameDocument(doc) {
    if (!isObject(doc)) return doc;
    const out = {};
    for (const key of Object.keys(doc)) if (!own(DOCUMENT, key)) out[key] = doc[key];
    for (const [oldKey, newKey] of Object.entries(DOCUMENT)) {
      if (!own(doc, oldKey)) continue;
      if (!own(doc, newKey)) out[newKey] = doc[oldKey];
      else if (newKey === "tombstones" && isObject(doc[oldKey]) && isObject(doc.tombstones)) {
        const merged = renameTombstones(doc.tombstones);
        const old = renameTombstones(doc[oldKey]);
        for (const name of Object.keys(old)) addMarks(merged, name, old[name]);
        out.tombstones = merged;
      }
    }
    if (own(out, "tables")) out.tables = renameTables(out.tables);
    if (own(out, "tombstones")) out.tombstones = renameTombstones(out.tombstones);
    return out;
  }

  // ---------- STORAGE (localStorage) ----------

  const PREF_KEYS = {
    langue: "lang", sombre: "palette", bips: "beeps", "historique-vue": "history-view",
    "guide-onglet": "guide-tab", "guide-filtre": "guide-filter", "guide-recettes-ouvertes": "guide-open-recipes",
    "analyse-onglet": "analysis-tab", "brouillon-saisie": "entry-draft", "recap-ferme": "recap-closed",
    "replis-saisie": "entry-fallbacks", "replis-repris": "fallbacks-migrated", "inclure-ratees": "include-failed",
    "brassage-unite": "brew-unit", "gouts-toutes-familles": "tastes-all-families",
  };

  // Stored values that were French codes, per NEW key.
  const PREF_VALUES = {
    theme: { sombre: "dark", clair: "light" },
    palette: { nuit: "night" },
    "history-view": { sachet: "bag" },
    "guide-tab": {
      accueil: "home", recettes: "recipes", moulin: "grinder", regles: "rules", vocabulaire: "vocabulary",
      boutiques: "shops", materiel: "gear",
    },
    "guide-filter": { tout: "all" },
    "analysis-tab": { cafes: "coffees", recettes: "recipes", gouts: "tastes", aromes: "aromas", mouture: "grind" },
  };

  /* Moves every old key to its new name, translating its value, then removes
     the old key. The new key wins when both exist. Runs once per page load,
     before any other script reads a preference; idempotent. */
  function migratePrefs(storage) {
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store) return;
      for (const [oldKey, newKey] of Object.entries(PREF_KEYS)) {
        const value = store.getItem(oldKey);
        if (value === null) continue;
        if (store.getItem(newKey) === null) store.setItem(newKey, value);
        store.removeItem(oldKey);
      }
      for (const [key, values] of Object.entries(PREF_VALUES)) {
        const value = store.getItem(key);
        if (value !== null && own(values, value)) store.setItem(key, values[value]);
      }
    } catch (e) { /* storage unavailable: nothing to move */ }
  }

  // ---------- DRAFT (entry draft JSON) ----------

  const DRAFT_KEYS = {
    le: "savedAt", methode: "method", descripteurs: "descriptors", noteVide: "ratingEmpty", valeurs: "values",
  };

  // Form field ids of a draft saved before the ids went English (v9.02).
  const DRAFT_IDS = {
    "f-cafe": "f-coffee", "f-recette": "f-recipe", "f-eau": "f-water", "f-mouture": "f-grind",
    "f-chauffe-min": "f-heat-min", "f-chauffe-sec": "f-heat-sec", "f-eau-ajoutee": "f-water-added",
    "f-lait": "f-milk", "f-tasse": "f-cup", "f-note": "f-rating", "f-commentaire": "f-comment",
    "f-ecoulement-min": "f-flow-min", "f-ecoulement-sec": "f-flow-sec", "f-puissance": "f-power",
    "f-prechauffe": "f-preheat", "f-ajout-eau-oui": "f-add-water-yes", "f-ratee": "f-failed",
    "f-agitation-oui": "f-agitation-yes",
  };

  function renameDraft(draft) {
    const out = renameKeys(draft, DRAFT_KEYS);
    if (isObject(out) && isObject(out.values)) return { ...out, values: renameKeys(out.values, DRAFT_IDS) };
    return out;
  }

  // ---------- ROUTES (screen hashes) ----------

  /* "reference" merged into "guide" (v7): the reference and the buying guide
     talked about the same equipment and were read one after the other. */
  const ROUTES = {
    tableau: "dashboard", saisie: "entry", historique: "history", reglages: "tuning", parametres: "settings",
    refaire: "redo", reference: "guide",
  };

  function route(nameKey) {
    return own(ROUTES, nameKey) ? ROUTES[nameKey] : nameKey;
  }

  migratePrefs();

  return {
    TABLES, DOCUMENT, FIELDS, STEP_FIELDS, DRAWINGS, PREF_KEYS, PREF_VALUES, DRAFT_KEYS, DRAFT_IDS, ROUTES,
    renameKeys, renameRow, renameTables, renameTombstones, renameDocument, renameDrawings, tableName,
    migratePrefs, renameDraft, route,
  };
})();
