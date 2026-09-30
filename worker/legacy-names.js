/* Legacy names, server side: the French names the logbook stored until v9.05.
 *
 * A COPY of the DATA part of js/legacy-names.js, which explains the why. The
 * D1 document, its daily backups and the payloads of tabs still open on an
 * old version may carry the French names (cafes, nom, maj_le, tombes...):
 * sync.js renames BOTH the stored document and every incoming payload with
 * these tables before merging, so that the merge only ever sees English
 * names. worker/sync.test.mjs checks that the two copies are identical: any
 * change here goes into js/legacy-names.js too. */

// ---------- DATA ----------

export const TABLES = {
  cafes: "coffees", recettes: "recipes", tasses: "cups", achats: "purchases", reglages: "settings",
};

// Top-level keys of a document (sync payload, D1 document, full JSON export).
export const DOCUMENT = { tombes: "tombstones", exporte_le: "exported_at" };

// Old column name to new, per table (new table names).
export const FIELDS = {
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
export const STEP_FIELDS = { texte: "text" };

// Drawing names kept in settings.drawings ("etagere,!horloge,podium").
export const DRAWINGS = {
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
export function renameKeys(obj, aliases) {
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

export function renameDrawings(value) {
  if (typeof value !== "string" || value === "") return value;
  return value.split(",").map(part => {
    const hidden = part.startsWith("!");
    const nameKey = hidden ? part.slice(1) : part;
    return (hidden ? "!" : "") + (own(DRAWINGS, nameKey) ? DRAWINGS[nameKey] : nameKey);
  }).join(",");
}

// The new name of a table, whatever the name it arrives under.
export function tableName(nameKey) {
  return own(TABLES, nameKey) ? TABLES[nameKey] : nameKey;
}

/* One row, old shape to new shape. `table` is the new or the old name.
   Recipe steps and the drawing names of the settings row follow. */
export function renameRow(table, row) {
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
export function renameTables(tables) {
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
export function renameTombstones(marks) {
  if (!isObject(marks)) return marks;
  const out = {};
  for (const key of Object.keys(marks)) addMarks(out, tableName(key), marks[key]);
  return out;
}

/* A whole document: { tables, tombes, schema, ... } in any mix of old and
   new names comes out with new names only. Unknown keys pass through. */
export function renameDocument(doc) {
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
