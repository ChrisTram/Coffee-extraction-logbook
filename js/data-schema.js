/* Data schema: columns, normalisation, seed values.
 *
 * Pure: none of these functions reads or writes state, they turn a row into
 * a row. This is the layer that decides what a valid brew is, which columns
 * go into a CSV and which never do (updated_at), and what the seeded recipes and
 * cups are worth. Depends on GRIND (dial validation) and on the seeds in
 * recipes.js. */
"use strict";

const DATA_SCHEMA = (() => {

  const COFFEE_COLS = ["id", "name", "roaster", "origin", "species", "process", "roast",
    "pre_ground", "real_coffee_pct", "tag", "roaster_notes", "bag_size_g", "price_vnd",
    "roast_date", "recommended_method", "recommended_recipe", "added_date", "active"];

  const EXT_COLS = ["id", "date_time", "coffee_id", "method", "recipe", "dose_g", "water_g",
    "grind_dial", "temperature_c", "total_time_s", "flow_time_s",
    "yield_ml", "added_water_ml", "milk_ml", "stir_count", "cup", "preheated_water",
    "score_10", "diagnostic", "descriptors", "comment", "heat_level", "failed", "heating_s"];

  /* Settings for Chris's equipment. ONE single row, with a fixed id, because
     there is a single user: see normalizeSettings for why it is a table.
     updated_at is not in the columns, as everywhere else. */
  const SETTINGS_ID = "moi";

  const SETTINGS_COLS = ["id", "dose_g", "heat_level", "grind_dial", "schema_version", "boil_s",
    "step_clicks", "step_degrees", "step_heat", "step_water_g", "step_dose_g", "drawings", "bubbles_s"];

  const RECIPE_COLS = ["id", "name", "number", "method", "family", "variant", "subtitle", "dose_g", "water_g",
    "temperature_c", "temp_text", "grind_dial", "ratio_text", "total_text", "milk",
    "steps", "best_for", "paired_coffees", "note", "is_default", "advanced", "has_variants", "active",
    "heat_level", "typical_volume", "video"];

  const CUP_COLS = ["id", "name", "capacity_ml"];

  /* BACKFILL value for Brikka brews already saved, which did not have this
     field. This is NOT the form default (see DEFAULT_PUISSANCE_FEU in app.js,
     at 4): history keeps what was plausible when it was entered, we do not
     rewrite the past when the current setting changes. */
  const HISTORICAL_FIRE_POWER = 3;

  const PURCHASE_COLS = ["id", "coffee_id", "purchase_date", "bag_size_g", "price_vnd", "roast_date", "opened_date",
    "remaining_g", "remaining_at"];

  /* THE LOGBOOK CLOCK (v8.71): the device clock corrected by its offset from
     the server, measured on every sync. A phone ten minutes fast won every
     merge for ten minutes. An offset under two seconds is network noise:
     ignored. */
  let clockOffset = 0;
  function clockNow() { return Date.now() + clockOffset; }
  function setClockOffset(ms) {
    const n = Number(ms);
    clockOffset = Number.isFinite(n) && Math.abs(n) > 2000 ? n : 0;
  }

  /* Stamps a row that was just written, so the merge knows which is the
     most recent. Call it in MUTATIONS only. */
  function stampRow(row) {
    row.updated_at = clockNow();
    return row;
  }

  /* NO TAG CAN GET IN (v8.73). Entered text (names, comments, recipes) is
     rendered as HTML in dozens of places: a booby-trapped name arriving via a
     CSV or the sync ("<img onerror=…>") would have run code on the site, with
     access to the logbook. Angle brackets are replaced on input with their
     typographic cousins ‹ ›, which read the same and never form a tag. Second
     lock: the Worker's security policy forbids any inline script. Ids only
     keep safe characters. */
  const safeText = v => String(v === undefined || v === null ? "" : v).replace(/</g, "‹").replace(/>/g, "›");
  const safeId = v => String(v === undefined || v === null ? "" : v).trim().replace(/[^\w\-.@]/g, "");

  // A number, or empty when the value is missing: never 0 by default (v8.71).
  // A CSV without a score column gave scores of 0/10.
  const numberOrEmpty = v => (v === "" || v === undefined || v === null ? "" : Number(v));

  /* Carries known timestamps over to rows coming from a CSV.
     ESSENTIAL: CSVs do not carry `updated_at`, so rereading the linked folder
     would reset everything to zero. Consequence if we skip it, and it was a
     real bug: editing a brew offline then RELOADING the page before the sync
     ran lost the edit, overwritten by the server version, which was stamped.

     If the CONTENT changed compared with what we had in memory, we stamp it
     now: a spreadsheet edit is a deliberate act, it must win the merge. An
     unknown row is new, so it is stamped too. */
  function carryTimestamps(readRows, known, cols) {
    const byId = new Map((known || []).map(r => [r.id, r]));
    const fields = cols.filter(c => c !== "id");
    return readRows.map(row => {
      const prev = byId.get(row.id);
      if (!prev) return stampRow(row);
      const same = fields.every(c => {
        const a = prev[c], b = row[c];
        return String(a === undefined || a === null ? "" : a) === String(b === undefined || b === null ? "" : b);
      });
      row.updated_at = same ? (Number(prev.updated_at) || 0) : clockNow();
      return row;
    });
  }

  /* EVERY ROW ENTERS THROUGH HERE, and its French names from before v9.06
     (nom, note_sur_10, maj_le...) are translated first, whatever it comes
     from: IndexedDB, a CSV, the server, the demo. See js/legacy-names.js. */
  const fromLegacy = (table, r) => LEGACY.renameRow(table, r || {});

  function normalizeCoffee(r) {
    r = fromLegacy("coffees", r);
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      updated_at: Number(r.updated_at) || 0,
      name: safeText(r.name), roaster: safeText(r.roaster), origin: safeText(r.origin),
      species: safeText(r.species), process: safeText(r.process), roast: safeText(r.roast),
      pre_ground: Number(r.pre_ground) === 1 ? 1 : 0,
      real_coffee_pct: r.real_coffee_pct === "" || r.real_coffee_pct === undefined
        ? 100 : Math.max(1, Math.min(100, Number(r.real_coffee_pct) || 100)),
      tag: safeText(r.tag),
      roaster_notes: safeText(r.roaster_notes),
      bag_size_g: r.bag_size_g === "" || r.bag_size_g === undefined ? "" : Number(r.bag_size_g),
      price_vnd: r.price_vnd === "" || r.price_vnd === undefined ? "" : Number(r.price_vnd),
      roast_date: r.roast_date || "",
      recommended_method: safeText(r.recommended_method),
      recommended_recipe: safeText(r.recommended_recipe),
      added_date: r.added_date || "",
      active: Number(r.active) === 0 ? 0 : 1,
    };
  }

  // Today's date in LOCAL time (never toISOString, UTC+7 offset). Same
  // definition as everywhere else: tools.js.
  function localDateToday() {
    return TOOLS.localDateKey(new Date());
  }

  function normalizeExtraction(r) {
    r = fromLegacy("extractions", r);
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      updated_at: Number(r.updated_at) || 0,
      date_time: r.date_time || "",
      coffee_id: r.coffee_id || "",
      method: safeText(r.method),
      recipe: safeText(r.recipe),
      dose_g: numberOrEmpty(r.dose_g),
      water_g: numberOrEmpty(r.water_g),
      grind_dial: safeText(r.grind_dial),
      temperature_c: numberOrEmpty(r.temperature_c),
      total_time_s: numberOrEmpty(r.total_time_s),
      flow_time_s: numberOrEmpty(r.flow_time_s),
      // volume_tasse_ml, the field's name before v8, is translated by fromLegacy.
      yield_ml: r.yield_ml === "" || r.yield_ml === undefined ? "" : Number(r.yield_ml),
      added_water_ml: r.added_water_ml === "" || r.added_water_ml === undefined ? "" : Number(r.added_water_ml),
      milk_ml: r.milk_ml === "" || r.milk_ml === undefined ? "" : Number(r.milk_ml),
      stir_count: r.stir_count === "" || r.stir_count === undefined ? "" : Number(r.stir_count),
      cup: safeText(r.cup),
      preheated_water: Number(r.preheated_water) === 1 ? 1 : "",
      // Heat power, personal scale from 1 to 10. Clamped and rounded: an
      // out-of-range value edited in a spreadsheet is brought back in, not dropped.
      heat_level: r.heat_level === "" || r.heat_level === undefined || r.heat_level === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.heat_level)) || 1)),
      score_10: numberOrEmpty(r.score_10),
      diagnostic: safeText(r.diagnostic),
      descriptors: safeText(r.descriptors),
      comment: safeText(r.comment),
      /* Failed: 1 or empty. Empty means "not said", not "successful", and it
         is the value of every cup older than the flag. No migration is needed
         for all that: a column missing from an old CSV reads back empty,
         which is exactly the right default. */
      failed: Number(r.failed) === 1 ? 1 : "",
      /* Time the kettle spent on the heat, in seconds, Switch only. This is
         Chris's measurement; the stored temperature is its estimate,
         correctable by hand. Empty for the Brikka and for all earlier
         history: a missing column reads back empty, no migration. */
      heating_s: r.heating_s === "" || r.heating_s === undefined || r.heating_s === null
        ? "" : Math.max(0, Math.round(Number(r.heating_s)) || 0),
    };
  }

  // Recipe: internal JS shape <-> CSV row readable in a spreadsheet.
  // Steps are encoded one per segment "m:ss text" or "- text",
  // separated by " || ". Associated coffees are separated by " ; ".
  /* Equipment settings. A one-row TABLE rather than a dedicated mechanism:
     merging by updated_at, tombstones and network sanitising already exist.
     These three values describe Chris's EQUIPMENT, not his device: his
     grinder dial is the same seen from the phone and the computer, whereas
     the theme and the beeps rightly stay in localStorage. */
  function normalizeSettings(r) {
    r = fromLegacy("settings", r);
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    return {
      id: SETTINGS_ID,
      updated_at: Number(r && r.updated_at) || 0,
      dose_g: num(r && r.dose_g, 0.1, 100, 15),
      /* 3, like the interface's factory fallback and the recipe seed: three
         places, one single value, otherwise a new logbook and an existing
         logbook do not announce the same heat. */
      heat_level: num(r && r.heat_level, 1, 10, 3),
      grind_dial: typeof (r && r.grind_dial) === "string" && GRIND.parseDial(r.grind_dial)
        ? r.grind_dial : "1.5.0",
      // Schema version of the document, see SCHEMA_STEPS. Stored here because
      // this row is the only synced place that is not coffee data: the
      // version must travel with the data it describes.
      schema_version: num(r && r.schema_version, 0, 999, 0),
      /* Time Chris's kettle takes to boil from tap water, in seconds.
         Describes his EQUIPMENT, so synced like the dial. Used to estimate the
         Switch temperature from the heating time.

         120 SECONDS by default, not zero. The original choice was zero, with
         a valid reason: without a measurement, an INVENTED factory value
         would produce wrong degrees that look serious. Its cost was that the
         feature stayed off until you went to set it, and nothing said so
         when you typed a heating time. Chris has since measured his kettle,
         2 minutes from tap to rolling boil: the value is no longer invented,
         and the original reasoning no longer applies. THIS default is what
         feeds fallbacks.boil, not the interface constant. */
      boil_s: num(r && r.boil_s, 30, 1800, 120),
      /* The kettle's second marker (v8.59): the first bubbles RISING, around
         88 °C. It bends the degree estimate (recipes.js). 1:30 by default,
         what Chris timed; a row from before v8.59 takes it without
         migration. A marker set after the boil is not refused here: the
         model replaces it with three quarters of the boil time. */
      bubbles_s: num(r && r.bubbles_s, 10, 1790, 90),
      /* The STEPS of the quantified correction (v8.48), for a "slightly"
         diagnosis; a strong diagnosis doubles them. Defaults drawn from the
         correction sentences ("un ou deux crans", "2 à 3 degrés", "un gramme
         de café"), adjustable in Settings. A row from before v8.48 lacks these
         columns: it takes the defaults, without migration. */
      step_clicks: num(r && r.step_clicks, 1, 10, 2),
      step_degrees: num(r && r.step_degrees, 1, 6, 2),
      step_heat: num(r && r.step_heat, 1, 3, 1),
      step_water_g: num(r && r.step_water_g, 5, 60, 15),
      step_dose_g: num(r && r.step_dose_g, 0.5, 3, 1),
      /* The dashboard drawings (v8.57), in the chosen order, "!" in front of
         hidden ones: "shelf,!clock,podium". Empty = the original order,
         all visible. An unknown name is ignored on read. */
      drawings: String(r && r.drawings || "").replace(/[^a-z!,]/g, "").slice(0, 200),
    };
  }

  function normalizeRecipe(r) {
    r = fromLegacy("recipes", r);
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      updated_at: Number(r.updated_at) || 0,
      name: safeText(r.name),
      number: safeText(r.number),
      method: r.method === "Switch" ? "Switch" : "Brikka",
      family: safeText(r.family),
      variant: safeText(r.variant),
      milk: r.milk !== undefined && r.milk !== "" ? (Number(r.milk) === 1 || r.milk === true) : false,
      subtitle: safeText(r.subtitle),
      dose: Number(r.dose_g !== undefined ? r.dose_g : r.dose) || 0,
      water: Number(r.water_g !== undefined ? r.water_g : r.water) || 0,
      // "" means NO target, which is not the same thing as 0 degrees.
      // On the Brikka the temperature depends on the flame, fixing it makes no sense.
      temp: (() => {
        const v = r.temperature_c !== undefined ? r.temperature_c : r.temp;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      // Heat power targeted by the recipe, Brikka only. Prefills the entry
      // form like the dose and the dial do.
      heat_level: r.heat_level === "" || r.heat_level === undefined || r.heat_level === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.heat_level)) || 1)),
      /* TYPICAL cup yield, declared by the recipe. It is not a computed
         estimate: the Brikka deliberately has none, the old formula announced
         139 ml where Chris measures 90 to 115. It is a measured figure,
         written in the recipe, and it is used to compute the milk when the
         cup volume was not recorded. */
      typicalVolume: (() => {
        const v = r.typical_volume !== undefined ? r.typical_volume : r.typicalVolume;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      tempText: safeText(r.temp_text !== undefined ? r.temp_text : r.tempText),
      dial: safeText(r.grind_dial !== undefined ? r.grind_dial : r.dial),
      ratioText: safeText(r.ratio_text !== undefined ? r.ratio_text : r.ratioText),
      totalText: safeText(r.total_text !== undefined ? r.total_text : r.totalText),
      steps: (Array.isArray(r.steps) ? r.steps
        : textToSteps(String(r.steps || "").split("||").join("\n"))).map(e => ({ ...e, text: safeText(e.text) })),
      bestFor: safeText(r.best_for !== undefined ? r.best_for : r.bestFor),
      pairedCoffees: (Array.isArray(r.pairedCoffees) ? r.pairedCoffees
        : String(r.paired_coffees || "").split(";").map(s => s.trim()).filter(Boolean)).map(safeText),
      note: safeText(r.note),
      /* The recipe video (v8.64): a link, YouTube or other. The Guide embeds
         the player when it is YouTube, otherwise it gives the link. Only
         http and https pass: a "javascript:" link is never written. */
      video: /^https?:\/\//i.test(String(r.video || "").trim()) ? String(r.video).trim().slice(0, 300) : "",
      isDefault: r.is_default !== undefined ? Number(r.is_default) === 1 : !!r.isDefault,
      advanced: r.advanced !== undefined && r.advanced !== "" ? (Number(r.advanced) === 1 || r.advanced === true) : false,
      has_variants: r.has_variants !== undefined && r.has_variants !== "" ? (Number(r.has_variants) === 1 || r.has_variants === true) : false,
      active: Number(r.active) === 0 ? 0 : 1,
    };
  }

  function recipeToRow(r) {
    return {
      id: r.id, name: r.name, number: r.number, method: r.method, family: r.family,
      variant: r.variant,
      subtitle: r.subtitle,
      dose_g: r.dose, water_g: r.water, temperature_c: r.temp, temp_text: r.tempText,
      grind_dial: r.dial, ratio_text: r.ratioText, total_text: r.totalText,
      milk: r.milk ? 1 : 0,
      steps: stepsToText(r.steps).split("\n").filter(Boolean).join(" || "),
      best_for: r.bestFor,
      paired_coffees: r.pairedCoffees.join(" ; "),
      note: r.note,
      is_default: r.isDefault ? 1 : 0,
      advanced: r.advanced ? 1 : 0,
      has_variants: r.has_variants ? 1 : 0,
      active: r.active,
      /* heat_level was missing here although it has been in RECIPE_COLS
         since it existed: csvSerialize reads ligne[colonne], so the column
         came out EMPTY. Exporting the recipes then reading them back erased
         the heat target of all ten recipes, silently. The covered-columns
         check, in tools/data.test.mjs, now prevents the omission. */
      heat_level: r.heat_level,
      typical_volume: r.typicalVolume,
      video: r.video,
    };
  }

  function defaultRecipes() {
    return STARTER_RECIPES.map(r => normalizeRecipe({
      ...r,
      steps: r.steps.map(e => ({ ...e })),
      pairedCoffees: [...r.pairedCoffees],
    }));
  }

  function normalizePurchase(r) {
    r = fromLegacy("purchases", r);
    return {
      id: safeId(r.id),
      updated_at: Number(r.updated_at) || 0,
      coffee_id: r.coffee_id || "",
      purchase_date: r.purchase_date || "",
      bag_size_g: r.bag_size_g === "" || r.bag_size_g === undefined ? "" : Number(r.bag_size_g),
      price_vnd: r.price_vnd === "" || r.price_vnd === undefined ? "" : Number(r.price_vnd),
      roast_date: r.roast_date || "",
      /* Day the bag was OPENED, the only freshness that counts here. Empty
         while it sleeps in the cupboard, which is information in itself. */
      opened_date: r.opened_date || "",
      /* THE MANUAL COUNT (v8.96): the grams Chris weighed or estimated in the
         bag, and when ("AAAA-MM-JJTHH:MM", the cups' local time). Stock
         restarts from this figure instead of the full bag size, and only the
         cups after it are subtracted. */
      remaining_g: r.remaining_g === "" || r.remaining_g === undefined || r.remaining_g === null ||
        !Number.isFinite(Number(r.remaining_g)) ? "" : Number(r.remaining_g),
      remaining_at: r.remaining_at || "",
    };
  }

  function normalizeCup(r) {
    r = fromLegacy("cups", r);
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      updated_at: Number(r.updated_at) || 0,
      name: safeText(r.name),
      capacity_ml: Number(r.capacity_ml) || 0,
    };
  }

  function defaultCups() {
    return STARTER_CUPS.map(t => normalizeCup(t));
  }

  /* IDS THAT NO LONGER COLLIDE (v8.71). The id used to be "list length + 1":
     the phone and the computer both produced "e124", and on sync one of the
     two cups silently overwrote the other. Now: the time in base 36 plus
     four random characters. Old ids stay valid, no code reads them as
     numbers. */
  function newId(prefix, list) {
    let id;
    do {
      id = prefix + clockNow().toString(36) + Math.random().toString(36).slice(2, 6);
    } while (list.some(x => x.id === id));
    return id;
  }

  return {
    COFFEE_COLS, EXT_COLS, SETTINGS_ID, SETTINGS_COLS, RECIPE_COLS, CUP_COLS, PURCHASE_COLS,
    HISTORICAL_FIRE_POWER,
    stampRow, carryTimestamps, newId, localDateToday, clockNow, setClockOffset,
    normalizeCoffee, normalizeExtraction, normalizeSettings, normalizeRecipe, normalizePurchase,
    normalizeCup, recipeToRow, defaultRecipes, defaultCups,
  };
})();
