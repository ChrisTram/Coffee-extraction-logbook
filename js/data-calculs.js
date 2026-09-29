/* Computed fields, never stored, and bag lookups.
 *
 * Read-only on the state: these functions derive (ratio, cost, bag age,
 * remaining stock) and write nothing. `pour(state)` binds them to the state
 * that data.js owns; the DATA facade exposes them under their old names. */
"use strict";

const DATA_CALCULS = (() => {

  function pour(state) {

    /* Current bag of a coffee: the last one bought. Returns null if the coffee
       has no purchase, in which case the caller falls back on the coffee card's
       fields, which remain the source for a single-bag coffee. */
    /* The bag in use at a given DATE, and not simply the last one bought.
       Without this, an extraction on 10 August would be tied to the bag bought
       on the 20th and would show a negative age. */
    /* THE BAG IN THE CUPBOARD IS NOT THE CURRENT BAG (v8.72). The bag was
       picked by purchase date: a bag bought ahead became "the current bag",
       the stock went back to full and the bag's day vanished while Chris was
       still drinking the old one. The form says "leave the opening date empty
       while it sleeps": a bag opened by the wanted date therefore comes before
       a bag without an opening date, and a bag opened LATER is never the one
       of an earlier cup. With no opened bag at all, we keep the last one
       bought, as before. */
    function sachetALaDate(cafeId, date) {
      const day = String(date || "").slice(0, 10);
      const candidates = state.achats
        .filter(a => a.cafe_id === cafeId && (!day || String(a.date_achat).slice(0, 10) <= day))
        .filter(a => !(day && a.date_ouverture && String(a.date_ouverture).slice(0, 10) > day));
      const opened = candidates.filter(a => a.date_ouverture)
        .sort((a, b) => String(b.date_ouverture).localeCompare(String(a.date_ouverture)));
      if (opened.length) return opened[0];
      return candidates.sort((a, b) => String(b.date_achat).localeCompare(String(a.date_achat)))[0] || null;
    }

    function sachetCourant(cafeId) {
      return sachetALaDate(cafeId, OUTILS.cleLocale(new Date()));
    }

    /* Remaining stock of the current bag, in grams.
       Only extractions AFTER the purchase date count: that is the whole point
       of the table, a bag bought again starts from its full size without the
       previous bag's history emptying it. An extraction without a dose counts
       as DEFAULT_DOSE_G, otherwise a forgotten entry would suggest untouched
       stock. */
    function stockSachet(cafeId, defaultDose) {
      const bag = sachetCourant(cafeId);
      const coffee = state.cafes.find(c => c.id === cafeId);
      const format = bag ? bag.format_grammes : (coffee ? coffee.format_grammes : "");
      if (format === "" || !(Number(format) > 0)) return null;

      /* Since the OPENING when it is known (v8.96), and no longer since the
         purchase: a bag bought ahead counted the cups drunk meanwhile from the
         OLD one, and emptied before it had been used. */
      const since = bag ? (bag.date_ouverture || bag.date_achat) : (coffee ? coffee.date_ajout : "");
      /* THE MANUAL COUNT comes first (v8.96): Chris weighed or estimated the
         bag, the stock restarts from there, and only the cups AFTER it are
         subtracted. It is the fallback when the calculation is wrong (bag not
         entered, cups from another bag, forgotten dose), without having to
         understand why. */
      const manualCount = bag && bag.restant_g !== "" && bag.restant_le ? bag : null;
      const used = state.extractions
        .filter(e => e.cafe_id === cafeId)
        .filter(e => manualCount
          ? String(e.date_heure) > String(manualCount.restant_le)
          : !since || String(e.date_heure).slice(0, 10) >= since)
        .reduce((total, e) => total + (Number(e.dose_g) || defaultDose || 0), 0);

      const remaining = (manualCount ? Number(manualCount.restant_g) : Number(format)) - used;
      return {
        format: Number(format),
        consomme: Math.round(used * 10) / 10,
        restant: Math.round(remaining * 10) / 10,
        depuis: since,
        dateTorrefaction: bag ? bag.date_torrefaction : (coffee ? coffee.date_torrefaction : ""),
        sachets: state.achats.filter(a => a.cafe_id === cafeId).length,
        // When the manual count was made, empty if the stock comes from the calculation alone.
        corrige: manualCount ? manualCount.restant_le : "",
      };
    }

    function cafeDe(ext) {
      return state.cafes.find(c => c.id === ext.cafe_id) || null;
    }

    function calculs(ext) {
      const coffee = cafeDe(ext);
      const dial = GRIND.parseDial(ext.mouture_dial);
      /* RATIO: two logics, one per machine, because "eau" does not mean the
         same thing on both sides.

         SWITCH, percolation: the poured water goes through the coffee and ends
         up in the cup. The classic brew ratio, water over dose, is right (1:15).

         BRIKKA: "eau" is the BOILER volume. Part of it stays as steam and never
         reaches the cup. Using water over dose would give 1:9.4 where the cup
         really is 1:5.6, and above all that number would never move since the
         boiler is always filled the same. So we take the EXTRACTED VOLUME, like
         an espresso's brew ratio.
         Without an extracted volume we fall back on the boiler, but the tooltip
         says so clearly instead of passing one number off as the other. */
      let ratio = "", ratioBase = "";
      const isBrikka = ext.methode === "Brikka";
      if (ext.dose_g > 0 && ext.eau_g) {
        ratio = ext.eau_g / ext.dose_g;
        ratioBase = isBrikka ? "chaudiere" : "infusion";
      }
      /* CUP ratio, secondary and only when measured. It describes what really
         comes out of the Brikka, but it compares to no recipe. */
      const ratioTasse = ext.dose_g > 0 && ext.volume_extrait_ml !== "" && Number(ext.volume_extrait_ml) > 0
        ? Number(ext.volume_extrait_ml) / ext.dose_g
        : "";
      /* Days since the bag was OPENED. That is the useful freshness variable:
         Chris has a roast date on no coffee and will not have one, but he
         always knows when he opened a pack. */
      let daysOpen = "";
      if (ext.cafe_id && ext.date_heure) {
        const bag = sachetALaDate(ext.cafe_id, ext.date_heure);
        if (bag && bag.date_ouverture) {
          const d1 = new Date(bag.date_ouverture + "T00:00");
          const d2 = new Date(ext.date_heure);
          if (!isNaN(d1) && !isNaN(d2)) daysOpen = Math.max(0, Math.floor((d2 - d1) / 86400000));
        }
      }
      let age = "";
      if (coffee && coffee.date_torrefaction && ext.date_heure) {
        const d1 = new Date(coffee.date_torrefaction + "T00:00");
        const d2 = new Date(ext.date_heure);
        if (!isNaN(d1) && !isNaN(d2)) age = Math.floor((d2 - d1) / 86400000);
      }
      let retention = "";
      if (ext.eau_g !== "" && ext.volume_extrait_ml !== "") retention = ext.eau_g - ext.volume_extrait_ml;
      /* LIQUID volume: extraction plus added water plus cold milk. On a
         cappuccino the cup will look fuller than this number, and that is
         normal: foam is air. It takes up volume without adding anything to
         drink, and above all without diluting anything, so it goes neither
         here nor into the drink ratio. */
      let drink = "";
      if (ext.volume_extrait_ml !== "") {
        drink = ext.volume_extrait_ml + (ext.eau_ajoutee_ml || 0) + (ext.lait_ml || 0);
      }
      let cost = "", realCost = "";
      if (coffee && coffee.prix_vnd && coffee.format_grammes && ext.dose_g) {
        cost = Math.round(coffee.prix_vnd / coffee.format_grammes * ext.dose_g);
        const pct = coffee.pourcentage_cafe_reel === "" || coffee.pourcentage_cafe_reel === undefined ? 100 : Number(coffee.pourcentage_cafe_reel);
        if (pct < 100 && pct > 0) {
          realCost = Math.round(coffee.prix_vnd / (coffee.format_grammes * pct / 100) * ext.dose_g);
        }
      }
      return {
        ratio,
        ratioTexte: ratio === "" ? "" : "1:" + ratio.toFixed(1),
        ratioBase,
        ratioTasse,
        ratioTasseTexte: ratioTasse === "" ? "" : "1:" + ratioTasse.toFixed(1),
        // Drink ratio: includes the lengthening water and the cold milk, the
        // only two liquids added. On a lengthened Brikka, this is the one that
        // describes what you actually drink.
        ratioBoisson: (() => {
          if (!(ext.dose_g > 0) || drink === "" || !(Number(drink) > 0)) return "";
          const added = (Number(ext.eau_ajoutee_ml) || 0) + (Number(ext.lait_ml) || 0);
          if (!added) return "";
          return "1:" + (Number(drink) / ext.dose_g).toFixed(1);
        })(),
        crans: dial ? dial.crans : "",
        microns: dial ? Math.round(dial.microns) : "",
        age_jours: age,
        jours_ouvert: daysOpen,
        retention_ml: retention,
        volume_boisson_ml: drink,
        cout_tasse_vnd: cost,
        cout_reel_vnd: realCost,
        cafe_nom: coffee ? coffee.nom : (ext.cafe_id ? "Café supprimé" : "Sans café"),
        moulu: coffee ? Number(coffee.deja_moulu) === 1 : false,
      };
    }

    return { cafeDe, calculs, sachetALaDate, sachetCourant, stockSachet };
  }

  return { pour };
})();
