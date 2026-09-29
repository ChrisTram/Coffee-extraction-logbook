/* Data schema: columns, normalisation, seed values.
 *
 * Pure: none of these functions reads or writes state, they turn a row into
 * a row. This is the layer that decides what a valid brew is, which columns
 * go into a CSV and which never do (maj_le), and what the seeded recipes and
 * cups are worth. Depends on GRIND (dial validation) and on the seeds in
 * recettes.js. */
"use strict";

const DATA_SCHEMA = (() => {

  const COFFEE_COLS = ["id", "nom", "torrefacteur", "origine", "espece", "procede", "torrefaction",
    "deja_moulu", "pourcentage_cafe_reel", "tag", "notes_annoncees", "format_grammes", "prix_vnd",
    "date_torrefaction", "machine_recommandee", "recette_recommandee", "date_ajout", "actif"];

  const EXT_COLS = ["id", "date_heure", "cafe_id", "methode", "recette", "dose_g", "eau_g",
    "mouture_dial", "temperature_c", "temps_total_s", "temps_ecoulement_s",
    "volume_extrait_ml", "eau_ajoutee_ml", "lait_ml", "agitation_nb", "tasse", "eau_prechauffee",
    "note_sur_10", "diagnostic", "descripteurs", "commentaire", "puissance_feu", "ratee", "chauffe_s"];

  /* Settings for Chris's equipment. ONE single row, with a fixed id, because
     there is a single user: see normalizeSettings for why it is a table.
     maj_le is not in the columns, as everywhere else. */
  const SETTINGS_ID = "moi";

  const SETTINGS_COLS = ["id", "dose_g", "puissance_feu", "mouture_dial", "schema_version", "ebullition_s",
    "pas_crans", "pas_degres", "pas_feu", "pas_eau_g", "pas_dose_g", "dessins", "bulles_s"];

  const RECIPE_COLS = ["id", "nom", "numero", "methode", "famille", "variante", "sous_titre", "dose_g", "eau_g",
    "temperature_c", "temp_texte", "mouture_dial", "ratio_texte", "total_texte", "lait",
    "etapes", "pour_qui", "cafes_associes", "note", "par_defaut", "avancee", "variantes", "actif",
    "puissance_feu", "volume_typique", "video"];

  const CUP_COLS = ["id", "nom", "contenance_ml"];

  /* BACKFILL value for Brikka brews already saved, which did not have this
     field. This is NOT the form default (see DEFAULT_PUISSANCE_FEU in app.js,
     at 4): history keeps what was plausible when it was entered, we do not
     rewrite the past when the current setting changes. */
  const HISTORICAL_FIRE_POWER = 3;

  const PURCHASE_COLS = ["id", "cafe_id", "date_achat", "format_grammes", "prix_vnd", "date_torrefaction", "date_ouverture",
    "restant_g", "restant_le"];

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
    row.maj_le = clockNow();
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
     ESSENTIAL: CSVs do not carry `maj_le`, so rereading the linked folder
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
      row.maj_le = same ? (Number(prev.maj_le) || 0) : clockNow();
      return row;
    });
  }

  function normalizeCoffee(r) {
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      maj_le: Number(r.maj_le) || 0,
      nom: safeText(r.nom), torrefacteur: safeText(r.torrefacteur), origine: safeText(r.origine),
      espece: safeText(r.espece), procede: safeText(r.procede), torrefaction: safeText(r.torrefaction),
      deja_moulu: Number(r.deja_moulu) === 1 ? 1 : 0,
      pourcentage_cafe_reel: r.pourcentage_cafe_reel === "" || r.pourcentage_cafe_reel === undefined
        ? 100 : Math.max(1, Math.min(100, Number(r.pourcentage_cafe_reel) || 100)),
      tag: safeText(r.tag),
      notes_annoncees: safeText(r.notes_annoncees),
      format_grammes: r.format_grammes === "" || r.format_grammes === undefined ? "" : Number(r.format_grammes),
      prix_vnd: r.prix_vnd === "" || r.prix_vnd === undefined ? "" : Number(r.prix_vnd),
      date_torrefaction: r.date_torrefaction || "",
      machine_recommandee: safeText(r.machine_recommandee),
      recette_recommandee: safeText(r.recette_recommandee),
      date_ajout: r.date_ajout || "",
      actif: Number(r.actif) === 0 ? 0 : 1,
    };
  }

  // Today's date in LOCAL time (never toISOString, UTC+7 offset). Same
  // definition as everywhere else: outils.js.
  function localDateToday() {
    return TOOLS.localDateKey(new Date());
  }

  function normalizeExtraction(r) {
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      maj_le: Number(r.maj_le) || 0,
      date_heure: r.date_heure || "",
      cafe_id: r.cafe_id || "",
      methode: safeText(r.methode),
      recette: safeText(r.recette),
      dose_g: numberOrEmpty(r.dose_g),
      eau_g: numberOrEmpty(r.eau_g),
      mouture_dial: safeText(r.mouture_dial),
      temperature_c: numberOrEmpty(r.temperature_c),
      temps_total_s: numberOrEmpty(r.temps_total_s),
      temps_ecoulement_s: numberOrEmpty(r.temps_ecoulement_s),
      // volume_tasse_ml is the field's old name, accepted on read.
      volume_extrait_ml: (() => {
        const v = r.volume_extrait_ml !== undefined && r.volume_extrait_ml !== "" ? r.volume_extrait_ml : r.volume_tasse_ml;
        return v === "" || v === undefined ? "" : Number(v);
      })(),
      eau_ajoutee_ml: r.eau_ajoutee_ml === "" || r.eau_ajoutee_ml === undefined ? "" : Number(r.eau_ajoutee_ml),
      lait_ml: r.lait_ml === "" || r.lait_ml === undefined ? "" : Number(r.lait_ml),
      agitation_nb: r.agitation_nb === "" || r.agitation_nb === undefined ? "" : Number(r.agitation_nb),
      tasse: safeText(r.tasse),
      eau_prechauffee: Number(r.eau_prechauffee) === 1 ? 1 : "",
      // Heat power, personal scale from 1 to 10. Clamped and rounded: an
      // out-of-range value edited in a spreadsheet is brought back in, not dropped.
      puissance_feu: r.puissance_feu === "" || r.puissance_feu === undefined || r.puissance_feu === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.puissance_feu)) || 1)),
      note_sur_10: numberOrEmpty(r.note_sur_10),
      diagnostic: safeText(r.diagnostic),
      descripteurs: safeText(r.descripteurs),
      commentaire: safeText(r.commentaire),
      /* Failed: 1 or empty. Empty means "not said", not "successful", and it
         is the value of every cup older than the flag. No migration is needed
         for all that: a column missing from an old CSV reads back empty,
         which is exactly the right default. */
      ratee: Number(r.ratee) === 1 ? 1 : "",
      /* Time the kettle spent on the heat, in seconds, Switch only. This is
         Chris's measurement; the stored temperature is its estimate,
         correctable by hand. Empty for the Brikka and for all earlier
         history: a missing column reads back empty, no migration. */
      chauffe_s: r.chauffe_s === "" || r.chauffe_s === undefined || r.chauffe_s === null
        ? "" : Math.max(0, Math.round(Number(r.chauffe_s)) || 0),
    };
  }

  // Recipe: internal JS shape <-> CSV row readable in a spreadsheet.
  // Steps are encoded one per segment "m:ss text" or "- text",
  // separated by " || ". Associated coffees are separated by " ; ".
  /* Equipment settings. A one-row TABLE rather than a dedicated mechanism:
     merging by maj_le, tombstones and network sanitising already exist.
     These three values describe Chris's EQUIPMENT, not his device: his
     grinder dial is the same seen from the phone and the computer, whereas
     the theme and the beeps rightly stay in localStorage. */
  function normalizeSettings(r) {
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    return {
      id: SETTINGS_ID,
      maj_le: Number(r && r.maj_le) || 0,
      dose_g: num(r && r.dose_g, 0.1, 100, 15),
      /* 3, like the interface's factory fallback and the recipe seed: three
         places, one single value, otherwise a new logbook and an existing
         logbook do not announce the same heat. */
      puissance_feu: num(r && r.puissance_feu, 1, 10, 3),
      mouture_dial: typeof (r && r.mouture_dial) === "string" && GRIND.parseDial(r.mouture_dial)
        ? r.mouture_dial : "1.5.0",
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
      ebullition_s: num(r && r.ebullition_s, 30, 1800, 120),
      /* The kettle's second marker (v8.59): the first bubbles RISING, around
         88 °C. It bends the degree estimate (recettes.js). 1:30 by default,
         what Chris timed; a row from before v8.59 takes it without
         migration. A marker set after the boil is not refused here: the
         model replaces it with three quarters of the boil time. */
      bulles_s: num(r && r.bulles_s, 10, 1790, 90),
      /* The STEPS of the quantified correction (v8.48), for a "slightly"
         diagnosis; a strong diagnosis doubles them. Defaults drawn from the
         correction sentences ("un ou deux crans", "2 à 3 degrés", "un gramme
         de café"), adjustable in Settings. A row from before v8.48 lacks these
         columns: it takes the defaults, without migration. */
      pas_crans: num(r && r.pas_crans, 1, 10, 2),
      pas_degres: num(r && r.pas_degres, 1, 6, 2),
      pas_feu: num(r && r.pas_feu, 1, 3, 1),
      pas_eau_g: num(r && r.pas_eau_g, 5, 60, 15),
      pas_dose_g: num(r && r.pas_dose_g, 0.5, 3, 1),
      /* The dashboard drawings (v8.57), in the chosen order, "!" in front of
         hidden ones: "etagere,!horloge,podium". Empty = the original order,
         all visible. An unknown name is ignored on read. */
      dessins: String(r && r.dessins || "").replace(/[^a-z!,]/g, "").slice(0, 200),
    };
  }

  function normalizeRecipe(r) {
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      maj_le: Number(r.maj_le) || 0,
      nom: safeText(r.nom),
      numero: safeText(r.numero),
      methode: r.methode === "Switch" ? "Switch" : "Brikka",
      famille: safeText(r.famille),
      variante: safeText(r.variante),
      lait: r.lait !== undefined && r.lait !== "" ? (Number(r.lait) === 1 || r.lait === true) : false,
      sousTitre: safeText(r.sous_titre !== undefined ? r.sous_titre : r.sousTitre),
      dose: Number(r.dose_g !== undefined ? r.dose_g : r.dose) || 0,
      eau: Number(r.eau_g !== undefined ? r.eau_g : r.eau) || 0,
      // "" means NO target, which is not the same thing as 0 degrees.
      // On the Brikka the temperature depends on the flame, fixing it makes no sense.
      temp: (() => {
        const v = r.temperature_c !== undefined ? r.temperature_c : r.temp;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      // Heat power targeted by the recipe, Brikka only. Prefills the entry
      // form like the dose and the dial do.
      puissance_feu: r.puissance_feu === "" || r.puissance_feu === undefined || r.puissance_feu === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.puissance_feu)) || 1)),
      /* TYPICAL cup yield, declared by the recipe. It is not a computed
         estimate: the Brikka deliberately has none, the old formula announced
         139 ml where Chris measures 90 to 115. It is a measured figure,
         written in the recipe, and it is used to compute the milk when the
         cup volume was not recorded. */
      volumeTypique: (() => {
        const v = r.volume_typique !== undefined ? r.volume_typique : r.volumeTypique;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      tempTexte: safeText(r.temp_texte !== undefined ? r.temp_texte : r.tempTexte),
      dial: safeText(r.mouture_dial !== undefined ? r.mouture_dial : r.dial),
      ratioTexte: safeText(r.ratio_texte !== undefined ? r.ratio_texte : r.ratioTexte),
      totalTexte: safeText(r.total_texte !== undefined ? r.total_texte : r.totalTexte),
      etapes: (Array.isArray(r.etapes) ? r.etapes
        : textToSteps(String(r.etapes || "").split("||").join("\n"))).map(e => ({ ...e, texte: safeText(e.texte) })),
      pourQui: safeText(r.pour_qui !== undefined ? r.pour_qui : r.pourQui),
      cafesAssocies: (Array.isArray(r.cafesAssocies) ? r.cafesAssocies
        : String(r.cafes_associes || "").split(";").map(s => s.trim()).filter(Boolean)).map(safeText),
      note: safeText(r.note),
      /* The recipe video (v8.64): a link, YouTube or other. The Guide embeds
         the player when it is YouTube, otherwise it gives the link. Only
         http and https pass: a "javascript:" link is never written. */
      video: /^https?:\/\//i.test(String(r.video || "").trim()) ? String(r.video).trim().slice(0, 300) : "",
      parDefaut: r.par_defaut !== undefined ? Number(r.par_defaut) === 1 : !!r.parDefaut,
      avancee: r.avancee !== undefined && r.avancee !== "" ? (Number(r.avancee) === 1 || r.avancee === true) : false,
      variantes: r.variantes !== undefined && r.variantes !== "" ? (Number(r.variantes) === 1 || r.variantes === true) : false,
      actif: Number(r.actif) === 0 ? 0 : 1,
    };
  }

  function recipeToRow(r) {
    return {
      id: r.id, nom: r.nom, numero: r.numero, methode: r.methode, famille: r.famille,
      variante: r.variante,
      sous_titre: r.sousTitre,
      dose_g: r.dose, eau_g: r.eau, temperature_c: r.temp, temp_texte: r.tempTexte,
      mouture_dial: r.dial, ratio_texte: r.ratioTexte, total_texte: r.totalTexte,
      lait: r.lait ? 1 : 0,
      etapes: stepsToText(r.etapes).split("\n").filter(Boolean).join(" || "),
      pour_qui: r.pourQui,
      cafes_associes: r.cafesAssocies.join(" ; "),
      note: r.note,
      par_defaut: r.parDefaut ? 1 : 0,
      avancee: r.avancee ? 1 : 0,
      variantes: r.variantes ? 1 : 0,
      actif: r.actif,
      /* puissance_feu was missing here although it has been in RECIPE_COLS
         since it existed: csvSerialize reads ligne[colonne], so the column
         came out EMPTY. Exporting the recipes then reading them back erased
         the heat target of all ten recipes, silently. The covered-columns
         check, in tools/data.test.mjs, now prevents the omission. */
      puissance_feu: r.puissance_feu,
      volume_typique: r.volumeTypique,
      video: r.video,
    };
  }

  function defaultRecipes() {
    return STARTER_RECIPES.map(r => normalizeRecipe({
      ...r,
      etapes: r.etapes.map(e => ({ ...e })),
      cafesAssocies: [...r.cafesAssocies],
    }));
  }

  function normalizePurchase(r) {
    return {
      id: safeId(r.id),
      maj_le: Number(r.maj_le) || 0,
      cafe_id: r.cafe_id || "",
      date_achat: r.date_achat || "",
      format_grammes: r.format_grammes === "" || r.format_grammes === undefined ? "" : Number(r.format_grammes),
      prix_vnd: r.prix_vnd === "" || r.prix_vnd === undefined ? "" : Number(r.prix_vnd),
      date_torrefaction: r.date_torrefaction || "",
      /* Day the bag was OPENED, the only freshness that counts here. Empty
         while it sleeps in the cupboard, which is information in itself. */
      date_ouverture: r.date_ouverture || "",
      /* THE MANUAL COUNT (v8.96): the grams Chris weighed or estimated in the
         bag, and when ("AAAA-MM-JJTHH:MM", the cups' local time). Stock
         restarts from this figure instead of the full bag size, and only the
         cups after it are subtracted. */
      restant_g: r.restant_g === "" || r.restant_g === undefined || r.restant_g === null ||
        !Number.isFinite(Number(r.restant_g)) ? "" : Number(r.restant_g),
      restant_le: r.restant_le || "",
    };
  }

  function normalizeCup(r) {
    return {
      id: safeId(r.id),
      // Sync timestamp. KEPT as is here: normalising runs on load as well
      // as on write, and restamping on load would make every device believe
      // it is the most recent. Mutations do the stamping, explicitly. Never
      // in CSVs: the exported columns are listed by hand (see csvSerialize).
      maj_le: Number(r.maj_le) || 0,
      nom: safeText(r.nom),
      contenance_ml: Number(r.contenance_ml) || 0,
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
