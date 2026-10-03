/* Computed fields, never stored, and bag lookups.
 *
 * Read-only on the state: these functions derive (ratio, cost, bag age,
 * remaining stock) and write nothing. `forState(state)` binds them to the state
 * that data.js owns; the DATA facade exposes them under their old names. */
"use strict";

const DATA_CALCS = (() => {

  function forState(state) {

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
    function bagAtDate(coffeeId, date) {
      const day = String(date || "").slice(0, 10);
      const candidates = state.purchases
        .filter(a => a.coffee_id === coffeeId && (!day || String(a.purchase_date).slice(0, 10) <= day))
        .filter(a => !(day && a.opened_date && String(a.opened_date).slice(0, 10) > day));
      const opened = candidates.filter(a => a.opened_date)
        .sort((a, b) => String(b.opened_date).localeCompare(String(a.opened_date)));
      if (opened.length) return opened[0];
      return candidates.sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)))[0] || null;
    }

    function currentBag(coffeeId) {
      return bagAtDate(coffeeId, TOOLS.localDateKey(new Date()));
    }

    /* Remaining stock of the current bag, in grams.
       Only extractions AFTER the purchase date count: that is the whole point
       of the table, a bag bought again starts from its full size without the
       previous bag's history emptying it. An extraction without a dose counts
       as DEFAULT_DOSE_G, otherwise a forgotten entry would suggest untouched
       stock. */
    function bagStock(coffeeId, defaultDose) {
      const bag = currentBag(coffeeId);
      const coffee = state.coffees.find(c => c.id === coffeeId);
      const format = bag ? bag.bag_size_g : (coffee ? coffee.bag_size_g : "");
      if (format === "" || !(Number(format) > 0)) return null;

      /* Since the OPENING when it is known (v8.96), and no longer since the
         purchase: a bag bought ahead counted the cups drunk meanwhile from the
         OLD one, and emptied before it had been used. */
      const since = bag ? (bag.opened_date || bag.purchase_date) : (coffee ? coffee.added_date : "");
      /* THE MANUAL COUNT comes first (v8.96): Chris weighed or estimated the
         bag, the stock restarts from there, and only the cups AFTER it are
         subtracted. It is the fallback when the calculation is wrong (bag not
         entered, cups from another bag, forgotten dose), without having to
         understand why. */
      const manualCount = bag && bag.remaining_g !== "" && bag.remaining_at ? bag : null;
      const used = state.extractions
        .filter(e => e.coffee_id === coffeeId)
        .filter(e => manualCount
          ? String(e.date_time) > String(manualCount.remaining_at)
          : !since || String(e.date_time).slice(0, 10) >= since)
        .reduce((total, e) => total + (Number(e.dose_g) || defaultDose || 0), 0);

      const remaining = (manualCount ? Number(manualCount.remaining_g) : Number(format)) - used;
      return {
        format: Number(format),
        consumed: Math.round(used * 10) / 10,
        remaining: Math.round(remaining * 10) / 10,
        since: since,
        roastDate: bag ? bag.roast_date : (coffee ? coffee.roast_date : ""),
        bags: state.purchases.filter(a => a.coffee_id === coffeeId).length,
        // When the manual count was made, empty if the stock comes from the calculation alone.
        corrected: manualCount ? manualCount.remaining_at : "",
      };
    }

    /* THE USUAL DOSE of a coffee (v9.13): the average of its cups that carry
       one, the fallback dose otherwise. The corner, the sheet and the shelf
       each computed it on their own; the jar needs the same figure as them. */
    function usualDose(coffeeId, defaultDose) {
      const doses = state.extractions.filter(e => e.coffee_id === coffeeId && Number(e.dose_g) > 0)
        .map(e => Number(e.dose_g));
      return doses.length ? doses.reduce((a, b) => a + b, 0) / doses.length : Number(defaultDose) || 0;
    }

    /* WHAT A JAR DRAWS (v9.13, Q8). The grams left in the current bag, never
       below zero (a negative stock is a count to redo, the jar shows it empty),
       the bag size the graduations run to, the usual dose, the cups left at
       that dose, and LOW below three of them: the threshold the corner and the
       sheet already used. Null when no bag size is known, like bagStock. */
    const LOW_CUPS = 3;
    function bagGauge(coffeeId, defaultDose) {
      const stock = bagStock(coffeeId, defaultDose);
      if (!stock) return null;
      const dose = usualDose(coffeeId, defaultDose);
      const grams = Math.max(0, stock.remaining);
      return {
        grams: grams,
        remaining: stock.remaining,
        bag: stock.format,
        dose: dose,
        cups: dose > 0 ? Math.floor(grams / dose) : 0,
        low: dose > 0 ? grams < LOW_CUPS * dose : grams <= 0,
        empty: grams <= 0,
      };
    }

    /* THE RECORD OF THE BAG IN STOCK (v9.13, J6). The cup beats every earlier
       rated cup of the coffee's CURRENT bag, not the whole history: an old bag
       of the same coffee was another coffee, roasted another day. It needs at
       least two earlier rated cups on that bag, otherwise the second cup of a
       bag would be a record half the time, and a record that frequent no
       longer means anything. A tie is not a record. Returns the previous best
       and the day it was brewed (the latest cup holding it), or null. */
    function bagRecord(ext) {
      if (!ext || ext.score_10 === "" || ext.score_10 === undefined || ext.score_10 === null) return null;
      const score = Number(ext.score_10);
      if (!Number.isFinite(score)) return null;
      const bag = currentBag(ext.coffee_id);
      const own = bag ? bagAtDate(ext.coffee_id, ext.date_time) : null;
      if (!own || own.id !== bag.id) return null;
      const when = String(ext.date_time);
      const earlier = state.extractions.filter(e => e.id !== ext.id && e.coffee_id === ext.coffee_id &&
        e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null && Number.isFinite(Number(e.score_10)) &&
        String(e.date_time) < when && (bagAtDate(e.coffee_id, e.date_time) || {}).id === bag.id);
      if (earlier.length < 2) return null;
      const previous = Math.max(...earlier.map(e => Number(e.score_10)));
      if (!(score > previous)) return null;
      const holder = earlier.filter(e => Number(e.score_10) === previous)
        .sort((a, b) => String(b.date_time).localeCompare(String(a.date_time)))[0];
      return {
        score: score,
        previous: previous,
        gap: Math.round((score - previous) * 10) / 10,
        previousDate: String(holder.date_time).slice(0, 10),
        previousId: holder.id,
        earlier: earlier.length,
        bagId: bag.id,
      };
    }

    function coffeeOf(ext) {
      return state.coffees.find(c => c.id === ext.coffee_id) || null;
    }

    function calcs(ext) {
      const coffee = coffeeOf(ext);
      const dial = GRIND.parseDial(ext.grind_dial);
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
      const isBrikka = ext.method === "Brikka";
      if (ext.dose_g > 0 && ext.water_g) {
        ratio = ext.water_g / ext.dose_g;
        ratioBase = isBrikka ? "boiler" : "infusion";
      }
      /* CUP ratio, secondary and only when measured. It describes what really
         comes out of the Brikka, but it compares to no recipe. */
      const cupRatio = ext.dose_g > 0 && ext.yield_ml !== "" && Number(ext.yield_ml) > 0
        ? Number(ext.yield_ml) / ext.dose_g
        : "";
      /* Days since the bag was OPENED. That is the useful freshness variable:
         Chris has a roast date on no coffee and will not have one, but he
         always knows when he opened a pack. */
      let daysOpen = "";
      if (ext.coffee_id && ext.date_time) {
        const bag = bagAtDate(ext.coffee_id, ext.date_time);
        if (bag && bag.opened_date) {
          const d1 = new Date(bag.opened_date + "T00:00");
          const d2 = new Date(ext.date_time);
          if (!isNaN(d1) && !isNaN(d2)) daysOpen = Math.max(0, Math.floor((d2 - d1) / 86400000));
        }
      }
      let age = "";
      if (coffee && coffee.roast_date && ext.date_time) {
        const d1 = new Date(coffee.roast_date + "T00:00");
        const d2 = new Date(ext.date_time);
        if (!isNaN(d1) && !isNaN(d2)) age = Math.floor((d2 - d1) / 86400000);
      }
      let retention = "";
      if (ext.water_g !== "" && ext.yield_ml !== "") retention = ext.water_g - ext.yield_ml;
      /* LIQUID volume: extraction plus added water plus cold milk. On a
         cappuccino the cup will look fuller than this number, and that is
         normal: foam is air. It takes up volume without adding anything to
         drink, and above all without diluting anything, so it goes neither
         here nor into the drink ratio. */
      let drink = "";
      if (ext.yield_ml !== "") {
        drink = ext.yield_ml + (ext.added_water_ml || 0) + (ext.milk_ml || 0);
      }
      let cost = "", realCost = "";
      if (coffee && coffee.price_vnd && coffee.bag_size_g && ext.dose_g) {
        cost = Math.round(coffee.price_vnd / coffee.bag_size_g * ext.dose_g);
        const pct = coffee.real_coffee_pct === "" || coffee.real_coffee_pct === undefined ? 100 : Number(coffee.real_coffee_pct);
        if (pct < 100 && pct > 0) {
          realCost = Math.round(coffee.price_vnd / (coffee.bag_size_g * pct / 100) * ext.dose_g);
        }
      }
      return {
        ratio,
        ratioText: ratio === "" ? "" : "1:" + ratio.toFixed(1),
        ratioBase,
        cupRatio,
        cupRatioText: cupRatio === "" ? "" : "1:" + cupRatio.toFixed(1),
        // Drink ratio: includes the lengthening water and the cold milk, the
        // only two liquids added. On a lengthened Brikka, this is the one that
        // describes what you actually drink.
        drinkRatio: (() => {
          if (!(ext.dose_g > 0) || drink === "" || !(Number(drink) > 0)) return "";
          const added = (Number(ext.added_water_ml) || 0) + (Number(ext.milk_ml) || 0);
          if (!added) return "";
          return "1:" + (Number(drink) / ext.dose_g).toFixed(1);
        })(),
        clicks: dial ? dial.clicks : "",
        microns: dial ? Math.round(dial.microns) : "",
        age_days: age,
        days_open: daysOpen,
        retention_ml: retention,
        drink_ml: drink,
        cup_cost_vnd: cost,
        real_cost_vnd: realCost,
        coffee_name: coffee ? coffee.name : (ext.coffee_id ? "Café supprimé" : "Sans café"),
        ground: coffee ? Number(coffee.pre_ground) === 1 : false,
      };
    }

    return { coffeeOf, calcs, bagAtDate, currentBag, bagStock, usualDose, bagGauge, bagRecord };
  }

  /* WEIGHING THE JAR (v9.13, Q8). The scale shows the jar AND the coffee;
     the empty jar, weighed once in Settings, comes off. Pure, so the sheet and
     the tests read the same rule. A French comma is accepted. The two checks
     catch the two real mistakes: the jar not entirely on the scale (less than
     the empty jar), and something else left on it (more than a bag and a
     fifth). Without a bag size, only the first one applies. */
  function weighJar(reading, tare, bagSize) {
    const read = v => {
      const s = String(v === undefined || v === null ? "" : v).replace(/\s/g, "").replace(",", ".");
      return s === "" ? NaN : Number(s);
    };
    const total = read(reading), jar = read(tare), bag = Number(bagSize) || 0;
    if (!(jar > 0)) return { error: "no_tare" };
    if (!(total > 0)) return { error: "no_reading", tare: jar };
    const net = Math.round((total - jar) * 10) / 10;
    if (net < 0) return { error: "below_jar", total: total, tare: jar, net: net };
    if (bag > 0 && net > bag * 1.2) return { error: "above_bag", total: total, tare: jar, net: net, bag: bag };
    return { error: "", total: total, tare: jar, net: net };
  }

  return { forState, weighJar };
})();
