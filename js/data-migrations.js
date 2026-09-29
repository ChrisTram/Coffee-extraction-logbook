/* Migrations: schema version and fixes to existing data.
 *
 * Everything that rewrites already stored data to follow a code change
 * lives here, and nowhere else. `forState(state, helpers)` binds the steps to the
 * state owned by data.js; `helpers` brings what writes into the state outside
 * the tables (tombstones, settings reading). The normalisers and the seeds
 * come from DATA_SCHEMA. */
"use strict";

const DATA_MIGRATIONS = (() => {

  function forState(state, helpers) {
    const { markDeleted, currentSettings } = helpers;
    const { HISTORICAL_FIRE_POWER, stampRow, newId, localDateToday, normalizeSettings,
      normalizeRecipe, normalizePurchase, defaultRecipes, defaultCups } = DATA_SCHEMA;

    // ---------- Migration: old recipe names and old coffee cards ----------
    // Idempotent: can run on every load without side effects.
    /* ---------- SCHEMA VERSION ----------

       There were six one-off fixes, each marked by a flag in
       `localStorage`, so PER DEVICE, while the data they fix is SHARED
       between devices. A device starting with empty storage set its flags on
       nothing, then received the unmigrated document from the server, and
       never migrated it again. This is not theoretical: it happened with the
       Brikka's 150 g boiler.

       Now: a version number stored in the `reglages` row, so synced with
       everything else. We apply the steps whose number exceeds the document's
       version, then write the new version. A new device receiving an already
       migrated document replays nothing, and a document that is behind is
       caught up by the first device that opens it, whichever it is.

       TO ADD A MIGRATION: one more step at the END, with the next number,
       and `CURRENT_SCHEMA` incremented. Never renumber, never insert in the
       middle: the number already written at Chris's is a promise.

       Each step touches ONLY the previously seeded value. A step that
       overwrote a deliberately chosen setting would be a bug, not a migration. */
    const CURRENT_SCHEMA = 20;

    // Fix of the fire power of Brikka recipes: Chris's scale has moved
    // twice, 3 then 4 then 2.
    const setBrikkaFire = (applies, value) => () => {
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.methode !== "Brikka" || !applies(rec)) return;
        rec.puissance_feu = value;
        stampRow(rec);
        changed = true;
      });
      return changed;
    };

    const SCHEMA_STEPS = [
      { v: 1, name: "heat 3 becomes 4", apply: setBrikkaFire(r => Number(r.puissance_feu) === 3, 4) },
      { v: 2, name: "heat 4 becomes 2", apply: setBrikkaFire(r => Number(r.puissance_feu) === 4, 2) },
      // Recipes seeded before the field existed carry nothing: the Fire column
      // of Settings stayed empty and only the fallback saved the prefill.
      { v: 3, name: "empty heat becomes 2",
        apply: setBrikkaFire(r => r.puissance_feu === "" || r.puissance_feu === undefined, 2) },
      // 100 g was an estimate, 150 g is the real capacity of the boiler.
      // And no more target temperature: on the Brikka the flame decides.
      { v: 4, name: "Brikka boiler at 150 g", apply: () => {
        let changed = false;
        state.recettes.forEach(rec => {
          if (rec.methode !== "Brikka" || Number(rec.eau) !== 100) return;
          rec.eau = 150;
          rec.temp = "";
          stampRow(rec);
          changed = true;
        });
        return changed;
      } },
      /* Single dial. Chris's Timemore stays set on 1.5.0, the compromise that
         works on both brewers: one target per recipe described a gesture he
         never makes. Applies to all ten recipes, Switch ones included.
         A recipe seeded AFTER this step with another dial (the Neo Brew,
         v8.63, extra coarse) is not affected: on a new logbook, which plays
         every step, it fell back to 1.5.0. */
      { v: 5, name: "single dial at 1.5.0", apply: () => {
        let changed = false;
        state.recettes.forEach(rec => {
          if (rec.dial === "1.5.0") return;
          const seed = STARTER_RECIPES.find(d => d.id === rec.id);
          if (seed && seed.dial !== "1.5.0") return;
          rec.dial = "1.5.0";
          stampRow(rec);
          changed = true;
        });
        return changed;
      } },
      /* Chronicler and Sweet: 240 g, not 225. The source document says "15 g / 240 g,
         ratio 1:16" with a first pour of 120 g; the original transcription
         had shrunk the recipe by 6 %. */
      { v: 6, name: "Chronicler at 240 g", apply: () => {
        let changed = false;
        state.recettes.forEach(rec => {
          if (rec.famille !== "chronicler" || Number(rec.eau) !== 225) return;
          rec.eau = 240;
          rec.ratioTexte = "ratio 1:16, environ 210 ml en tasse";
          rec.etapes = (rec.etapes || []).map(e => ({
            ...e,
            texte: String(e.texte).split("112 g").join("120 g").split("225 g").join("240 g"),
          }));
          rec.note = String(rec.note || "").split("225 g").join("240 g").split("affiche 225").join("affiche 240");
          stampRow(rec);
          changed = true;
        });
        return changed;
      } },

      /* Three TEXT corrections, checked on 3 September 2026.

         1. The Brikka is filled with COLD WATER. That is Bialetti's instruction
            for this model specifically: its weighted valve is calibrated on the
            pressure rise that cold water produces, and preheated water is the
            Moka Express method. The so-called "classic" recipe prescribed 80
            to 90 degrees, so neither what Chris does nor what the maker
            recommends.

         2. "Flow under 10 seconds, the grind is too fine: go to 1.4.0" sent
            the wrong way. 1.4.0 is 582 µm, so FINER than 1.5.0 which is 624.
            The diagnosis is right, a bed packed too tight makes the valve
            release all at once; the remedy must be COARSER.

         3. The Costaud (Bloom) promised "finer" while step v5 aligned all ten
            recipes on 1.5.0. The text described a setting the recipe card no
            longer carries.

         Each replacement TARGETS the old text: a recipe Chris had already
         rewritten by hand is not touched. */
      { v: 7, name: "cold water in the Brikka and grind direction", apply: () => {
        let changed = false;
        const replaceIn = (rec, field, before, after) => {
          if (String(rec[field] || "").indexOf(before) < 0) return false;
          rec[field] = String(rec[field]).split(before).join(after);
          return true;
        };
        state.recettes.forEach(rec => {
          let moved = false;
          // The classic one carries variant "Standard", not an empty string.
          if (rec.famille === "brikka-classique" && rec.variante !== "Eau préchauffée") {
            const steps = (rec.etapes || []).map(e => {
              if (String(e.texte).indexOf("Préchauffer l'eau à 80 ou 90 degrés") < 0) return e;
              moved = true;
              return { ...e, texte: "Remplir la chaudière à l'eau FROIDE : c'est la consigne Bialetti pour la Brikka, dont la soupape lestée est calibrée sur cette montée en pression. L'eau préchauffée est la méthode de la Moka Express, pas celle-ci." };
            });
            if (moved) rec.etapes = steps;
          }
          if (replaceIn(rec, "note", "la mouture est trop fine : passer à 1.4.0.",
            "la mouture est trop fine et la soupape lâche d'un coup : passer à 1.6.0, plus grossier.")) moved = true;
          if (replaceIn(rec, "pourQui",
            "seuls la température de départ, la flamme et la mouture changent.",
            "seuls la température de départ, la flamme et la mouture changent. À savoir avant de comparer : Bialetti recommande l'eau FROIDE pour la Brikka, l'eau préchauffée étant la méthode de la Moka Express. Cette recette applique donc volontairement l'autre méthode.")) moved = true;
          if (replaceIn(rec, "pourQui", "Plus chaud, plus fin, plus long.",
            "Plus chaud et plus long. Pour le plus fin, descendre d'un cran à la main : les dix recettes portent 1.5.0 depuis que je ne recompte plus les crans à chaque changement de machine.")) moved = true;
          if (moved) { stampRow(rec); changed = true; }
        });
        return changed;
      } },

      /* The two Brikka milk recipes merge: same dose, same water, same dial,
         same fire, and their steps both said "extract exactly like the
         classic Brikka". Only the milk texture changed. The renaming
         reattaches the history, this step removes the extra recipe.

         Only if it still carries its original name: renamed, it has become a
         personal recipe and no longer belongs to us. */
      { v: 8, name: "merge of the two Brikka milk recipes", apply: () => {
        let changed = false;
        const before = state.recettes.length;
        state.recettes = state.recettes.filter(rec =>
          !(rec.id === "brikka-cappuccino" && rec.nom === "Brikka cappuccino"));
        if (state.recettes.length !== before) {
          markDeleted("recettes", "brikka-cappuccino");
          changed = true;
        }
        /* The SURVIVOR takes the merged name and the seed's content. Without
           that, the renamed history would point to "Brikka au lait" while the
           recipe would still be called "Brikka flat white": an orphan recipe
           name, which breaks the side panel and the prefill.

           The original name still in place serves as proof that the recipe
           has not been edited by hand. Renamed, it belongs to Chris and we
           leave it alone. */
        const merged = STARTER_RECIPES.find(d => d.id === "brikka-flatwhite");
        state.recettes.forEach(rec => {
          if (rec.id !== "brikka-flatwhite" || rec.nom !== "Brikka flat white" || !merged) return;
          ["nom", "sousTitre", "etapes", "pourQui", "note", "volumeTypique", "lait", "cafesAssocies"]
            .forEach(field => { rec[field] = merged[field]; });
          stampRow(rec);
          changed = true;
        });
        return changed;
      } },

    /* Two pure percolation recipes join the seed in v7.92, in second and
       third positions: Better 1 Cup (Hoffmann) and One and Done (Lance
       Hedrick). The « Recette N » labels of the following original recipes
       shift, and the Sweet, a variant of the Chronicler shown on the same
       card, takes back its family's label. Targeted on the old label: a
       label rewritten by hand is not touched. The display ORDER, for its
       part, is restored on every load by migrateData. */
    { v: 9, name: "recipe numbers after Hoffmann and One and Done", apply: () => {
      const newNumbers = { "sweet": ["Recette 2", "Recette 1"], "costaud-bloom": ["Recette 3", "Recette 4"],
        "costaud-immersion": ["Recette 4", "Recette 5"], "tetsu-devil": ["Recette 5", "Recette 6"],
        "sherrycipe": ["Recette 6", "Recette 7"] };
      let changed = false;
      state.recettes.forEach(rec => {
        const n = newNumbers[rec.id];
        if (!n || rec.numero !== n[0]) return;
        rec.numero = n[1];
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* The Sweet moves to the end of the list (v7.95) and takes the label « Recette 8 ».
       Targeted on the label set by step v9, otherwise nothing. */
    { v: 10, name: "the Sweet last", apply: () => {
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "sweet" || rec.numero !== "Recette 1") return;
        rec.numero = "Recette 8";
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* The factory 4:00 of the first versions had been WRITTEN into the synced
       settings, so moving the default to zero (v7.95) never erased it: Chris
       still saw « elle bout en 4:00 ». His kettle makes lots of small bubbles
       at the bottom, a few of which rise, around 1:30: that is 85 to 90
       degrees, and the full boil follows some thirty seconds later, so 2:00.
       Targeted on the invented value only: a duration timed by hand is not
       touched. */
    { v: 11, name: "kettle moved from 4:00 to 2:00", apply: () => {
      const r = currentSettings();
      if (Number(r.ebullition_s) !== 240) return false;
      state.reglages = [stampRow(normalizeSettings({ ...r, ebullition_s: 120 }))];
      return true;
    } },

    /* Hoffmann, Better 1 Cup: the swirl happens DURING the first bloom, to wet
       the whole bed, and the recipe step did not say it clearly enough
       (Chris's request, 14 September 2026). Targeted on the old text: a
       recipe rewritten by hand is not touched. */
    { v: 12, name: "Hoffmann, swirl during the bloom", apply: () => {
      const before = "Bloom : verser 50 g lentement, en quinze secondes environ, vanne OUVERTE. Tourbillon doux de la carafe.";
      const after = "Bloom : verser 50 g lentement, en quinze secondes environ, vanne OUVERTE. PENDANT le bloom, tourbillon doux du porte-filtre pour mouiller tout le lit, aucune poche sèche.";
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "hoffmann-1cup") return;
        const steps = (rec.etapes || []).map(e => (e.texte === before ? { ...e, texte: after } : e));
        if (steps.every((e, i) => e === rec.etapes[i])) return;
        rec.etapes = steps;
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* The « AUCUNE cuillère » of the last Hoffmann step was not his: the
       original video says a gentle swirl, and Part 2 accepts a quick stir
       with a spoon when the dripper cannot be swirled, which is the case of a
       Switch on the scale. Chris spotted it on 14 September 2026.
       Targeted on the old text, the note too. */
    { v: 13, name: "Hoffmann, the spoon is allowed", apply: () => {
      const before = "Tourbillon doux, AUCUNE cuillère. Laisser s'écouler, fin vers 2:45 à 3:15.";
      const after = "Tourbillon doux du porte-filtre, ou un petit coup de cuillère, un aller et un retour, si le Switch est trop lourd à faire tourner sur la balance : même effet, décoller la mouture des parois et aplanir le lit. Laisser s'écouler, fin vers 2:45 à 3:15.";
      const noteBefore = "Il conseille medium-fine, un cran plus fin qu'en 500 ml.";
      const noteAfter = "Il conseille medium-fine, un cran plus fin qu'en 500 ml. Dans la Part 2 il accepte la cuillère à la place du tourbillon final, en douceur.";
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "hoffmann-1cup") return;
        let moved = false;
        const steps = (rec.etapes || []).map(e => {
          if (e.texte !== before) return e;
          moved = true;
          return { ...e, texte: after };
        });
        const noteText = String(rec.note || "");
        if (noteText.includes(noteBefore) && !noteText.includes(noteAfter)) {
          rec.note = noteText.split(noteBefore).join(noteAfter);
          moved = true;
        }
        if (!moved) return;
        rec.etapes = steps;
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* Fire goes back to 3, Chris's request. Third move of this scale after
       3 to 4 (v1) and 4 to 2 (v2): ALREADY saved recipes must follow the
       seed, otherwise an existing logbook stays at 2 while a new logbook
       starts at 3.

       Only touches Brikkas still at 2, the seeded value: a recipe Chris
       set himself to something else keeps its number. */
    { v: 14, name: "heat 2 back to 3",
      apply: setBrikkaFire(r => Number(r.puissance_feu) === 2, 3) },

    /* The kettle heats along a curve (v8.59), no longer a straight line: the
       degrees estimated under the old model were too low mid-heating (82
       instead of 88 at 1:30). A Switch cup whose temperature equals EXACTLY
       the old estimate from its heating time was not corrected by hand: it
       takes the new one. A retouched degree no longer matches the line and
       is not touched. Idempotent: after the pass, the cup no longer matches
       the line, except at both ends, where the two models say the same
       thing. */
    { v: 15, name: "kettle as a curve", apply: () => {
      const r = currentSettings();
      const e = Number(r.ebullition_s);
      if (!(e > 0)) return false;
      let changed = false;
      state.extractions.forEach(x => {
        if (x.methode !== "Switch" || x.chauffe_s === "" || x.chauffe_s === undefined) return;
        const s = Number(x.chauffe_s);
        if (!Number.isFinite(s) || s < 0 || x.temperature_c === "" || x.temperature_c === undefined) return;
        const linear = Math.round(28 + 72 * Math.min(1, s / e));
        if (Number(x.temperature_c) !== linear) return;
        const curved = temperatureFromHeating(s, e, r.bulles_s);
        if (curved === "" || curved === linear) return;
        x.temperature_c = curved;
        stampRow(x);
        changed = true;
      });
      return changed;
    } },

    /* Recipe videos (v8.64): an already stored original recipe receives its
       seed's link. Targeted on an EMPTY field: a link set by hand is not
       replaced. */
    { v: 16, name: "recipe videos", apply: () => {
      let changed = false;
      state.recettes.forEach(rec => {
        const seed = STARTER_RECIPES.find(d => d.id === rec.id);
        if (!seed || !seed.video || rec.video) return;
        rec.video = seed.video;
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* « The Tetsu Devil » becomes « Tetsu 4:6 » (v8.65, Chris's request): the
       recipe is the 4:6 method, not Tetsu's « Devil », which is made at two
       temperatures. The stored recipe is renamed if it still carries the old
       name (a name edited by hand is not touched). Its cups and coffees
       follow through RECIPE_RENAMES, in step 1 of migrateData. */
    { v: 17, name: "Tetsu Devil becomes Tetsu 4:6", apply: () => {
      const before = "The Tetsu Devil", after = "Tetsu 4:6";
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "tetsu-devil" || rec.nom !== before) return;
        rec.nom = after;
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },

    /* The Brikka au lait carried number 3, shown next to the « Recette 3 »
       (One and Done) of the Guide (v8.74). Targeted on the original value. */
    { v: 18, name: "Brikka with milk without a number", apply: () => {
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "brikka-flatwhite" || String(rec.numero) !== "3") return;
        rec.numero = "";
        stampRow(rec);
        changed = true;
      });
      return changed;
    } },
    /* Two bag columns, restant_g and restant_le (v8.96). Nothing to catch
       up: empty, they keep the previous computation. The step only exists
       to bump the version, so that a tab still on the old one is rejected
       by the sync instead of erasing these columns it does not know. */
    { v: 19, name: "hand count of the bags", apply: () => false },
    /* Tetsu 4:6 (v9.00): the recipe card gives the temperature by roast
       (Philocoffea: 93, 88, 83 °C), is poured by eye and no longer every 45
       seconds, and its note cites the original video. Field by field,
       targeted on the previously seeded text: a field edited by hand is not
       touched. */
    { v: 20, name: "Tetsu 4:6, temperature by roast", apply: () => {
      const original = defaultRecipes().find(d => d.id === "tetsu-devil");
      if (!original) return false;
      const before = {
        tempTexte: "93 °C",
        totalTexte: "total environ 3:25",
        pourQui: "Les cafés complexes et chers que je ne veux pas rater, et ceux dont je veux régler moi même l'équilibre. Vanne OUVERTE du début à la fin. Verser dès que le lit vient de s'assécher en surface, environ toutes les 30 à 45 secondes.",
        note: "La méthode 4:6 de Tetsu Kasuya, champion du monde 2016 : 40 pour cent de l'eau règle l'acidité et le sucre, 60 pour cent le corps. Ne pas confondre avec sa recette « Devil », à deux températures (90 puis 70 °C), dont elle portait le nom jusqu'à la v8.65. Mouture medium coarse, 2.0.0 : cinq numéros plus ouverts que la zone commune avec la Brikka (25 crans). La vidéo est une démonstration de TALES COFFEE, pas de Tetsu lui même.",
      };
      let changed = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "tetsu-devil") return;
        let edited = false;
        Object.keys(before).forEach(k => {
          if (rec[k] === before[k]) { rec[k] = original[k]; edited = true; }
        });
        if (edited) { stampRow(rec); changed = true; }
      });
      return changed;
    } },
    ];

    /* Applies the missing steps and writes the new version. Returns true if
       something moved, so the caller knows it must persist. */
    function applySchema() {
      const version = Number(currentSettings().schema_version) || 0;
      if (version >= CURRENT_SCHEMA) return false;
      SCHEMA_STEPS.filter(p => p.v > version).forEach(p => p.apply());
      state.reglages = [stampRow(normalizeSettings({
        ...currentSettings(),
        schema_version: CURRENT_SCHEMA,
      }))];
      return true;
    }

    function migrateData() {
      // 1. Renames old recipes in the history and the coffees.
      /* STAMPED (v8.65): without a new update date, the sync kept the
         server row, with the old name, and each device renamed on its own
         side on every load without ever publishing it. A renamed row no
         longer carries a name from the table, so it is stamped only
         once. */
      state.extractions.forEach(e => {
        if (RECIPE_RENAMES[e.recette]) { e.recette = RECIPE_RENAMES[e.recette]; stampRow(e); }
      });
      state.cafes.forEach(c => {
        if (RECIPE_RENAMES[c.recette_recommandee]) { c.recette_recommandee = RECIPE_RENAMES[c.recette_recommandee]; stampRow(c); }
      });
      // 2. Removes the original recipes of the old generation, keeps the
      //    personal recipes, and guarantees the new ones are present.
      const hadOldOnes = state.recettes.some(r => OLD_SEED_IDS.includes(r.id));
      if (hadOldOnes) {
        const personal = state.recettes.filter(r => !OLD_SEED_IDS.includes(r.id) && !STARTER_RECIPES.some(d => d.id === r.id));
        state.recettes = defaultRecipes().concat(personal);
      } else {
        STARTER_RECIPES.forEach(d => {
          const idx = state.recettes.findIndex(r => r.id === d.id);
          if (idx < 0) {
            state.recettes.push(normalizeRecipe({ ...d, etapes: d.etapes.map(e => ({ ...e })), cafesAssocies: [...d.cafesAssocies] }));
            return;
          }
          // Structural upgrade: families and variants (v7), without touching
          // the parameters the user may have edited.
          const ex = state.recettes[idx];
          if ((d.variante || "") && (ex.variante || "") !== d.variante) {
            if (ex.nom !== d.nom) {
              state.extractions.forEach(e => { if (e.recette === ex.nom) e.recette = d.nom; });
              state.cafes.forEach(c => { if (c.recette_recommandee === ex.nom) c.recette_recommandee = d.nom; });
              ex.nom = d.nom;
            }
            ex.famille = d.famille;
            ex.variante = d.variante;
          }
        });
      }
      // 2 bis. Display ORDER: the original recipes in the seed's order, the
      //    personal ones afterwards in their own order. Idempotent. Without it,
      //    a recipe added to the seed landed at the end of the list for anyone
      //    who already had data, whatever its position in STARTER_RECIPES.
      const rank = new Map(STARTER_RECIPES.map((d, i) => [d.id, i]));
      state.recettes = state.recettes
        .map((r, i) => ({ r, key: rank.has(r.id) ? rank.get(r.id) : STARTER_RECIPES.length + i }))
        .sort((x, y) => x.key - y.key)
        .map(x => x.r);
      // 3. Updates the Sáng Tạo 4 and Balanced cards if they have not
      //    received their corrections yet (marked by the tag).
      const c1 = state.cafes.find(c => c.id === "c1" && (c.nom || "").includes("Sáng Tạo"));
      if (c1 && !c1.tag) {
        Object.assign(c1, {
          espece: "Blend Arabica, Robusta, Excelsa, Catimor",
          procede: "Torréfaction traditionnelle avec additifs",
          notes_annoncees: "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.",
          format_grammes: 340, prix_vnd: 148800, deja_moulu: 1,
          pourcentage_cafe_reel: 82, tag: "café aromatisé",
          machine_recommandee: "Brikka", recette_recommandee: "Brikka classique",
        });
      }
      const c4 = state.cafes.find(c => c.id === "c4" && (c.nom || "").includes("Balanced"));
      if (c4 && !c4.tag) {
        Object.assign(c4, {
          notes_annoncees: "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté",
          pourcentage_cafe_reel: 100, tag: "café de référence",
          machine_recommandee: "Les deux", recette_recommandee: "The Coffee Chronicler's Recipe",
        });
      }
      // 4. Default cups if missing.
      if (!state.tasses.length) state.tasses = defaultCups();
      // 5. Date the coffees were added: if missing, take the date of the
      //    coffee's first extraction (best approximation for existing data).
      //    Coffees never extracted stay without a date (nothing shown).
      state.cafes.forEach(c => {
        if (c.date_ajout) return;
        const dates = state.extractions
          .filter(e => e.cafe_id === c.id && e.date_heure)
          .map(e => e.date_heure).sort();
        if (dates.length) c.date_ajout = dates[0].slice(0, 10);
      });
      // 6 ter. Fire power: 3 on every Brikka extraction that has none.
      //    Without a starting value, the field would stay empty across the whole
      //    history and no comparison would be possible for weeks.
      //    IDEMPOTENT: only touches rows whose field is empty, so a value
      //    entered or corrected by hand is never overwritten.
      state.extractions.forEach(e => {
        if (e.methode === "Brikka" && (e.puissance_feu === "" || e.puissance_feu === undefined)) {
          e.puissance_feu = HISTORICAL_FIRE_POWER;
          stampRow(e);
        }
      });

      // The fixes of seeded values live in SCHEMA_STEPS, above:
      // they depend on a version number stored WITH the data.
      applySchema();

      // 6 bis. Extractions made with preheated water leave "Brikka
      //    classique" for the dedicated variant. Preheating is not a serving
      //    detail: it changes the pressure rise, the duration and the
      //    behaviour of the valve, so it is a distinct protocol that deserves
      //    its own line in the comparisons.
      //    IDEMPOTENT by construction: after the move, `recette` is no longer
      //    "Brikka classique", so a reload moves nothing again. And we only
      //    touch rows carrying exactly the old name, an extraction already
      //    filed by hand is left in place.
      const PREHEATED_RECIPE = "Brikka classique (eau préchauffée)";
      state.extractions.forEach(e => {
        if (e.recette === "Brikka classique" && Number(e.eau_prechauffee) === 1) {
          e.recette = PREHEATED_RECIPE;
          stampRow(e);
        }
      });

      // 7. Purchases: an implicit bag for each coffee that has a size but no
      //    purchase. IDEMPOTENT thanks to the "no purchase for this coffee" test,
      //    so it recreates nothing on each load and overwrites no purchase entered
      //    by hand. Without it, stock could not be computed for all existing data.
      state.cafes.forEach(c => {
        if (!(Number(c.format_grammes) > 0)) return;
        if (state.achats.some(a => a.cafe_id === c.id)) return;
        const dates = state.extractions
          .filter(e => e.cafe_id === c.id && e.date_heure)
          .map(e => e.date_heure).sort();
        const date = c.date_ajout || (dates.length ? dates[0].slice(0, 10) : localDateToday());
        state.achats.push(normalizePurchase({
          id: newId("a", state.achats),
          cafe_id: c.id,
          date_achat: date,
          format_grammes: c.format_grammes,
          prix_vnd: c.prix_vnd,
          date_torrefaction: c.date_torrefaction,
        }));
      });
    }

    return { CURRENT_SCHEMA, SCHEMA_STEPS, applySchema, migrateData };
  }

  return { forState };
})();
