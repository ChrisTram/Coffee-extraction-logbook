/* Best setting PER COFFEE.
 *
 * Deliberately per coffee and not in general: the best setting for a Sáng Tạo 4
 * pre-ground at 82 percent coffee has nothing to do with the one for a whole
 * bean Balanced. A global average would mix both and be actionable for
 * neither.
 *
 * A COMBINATION is the set of levers Chris controls when making the cup:
 * the recipe, the grind, the heat power, the preheating. The coffee is not
 * one of them, it is the grouping key. Nor are the score and the diagnosis,
 * those are results.
 *
 * File separate from app.js and with no DOM dependency at all: the
 * calculation is thus testable without a browser, which matters all the more
 * since the agent's browser pane cannot run this site (see the technical
 * debt in AUDIT.md).
 */

/* Moving average over a window of RATED cups, not days: at one or two cups
   per active day, a window in days would be full of holes and the curve
   would jump as much as the raw points.

   Returns one value per rated brew, in chronological order, and null until
   the window is full: showing an average of two cups as if it were one of
   five would lie about how solid it is. */
function rollingAverage(extractions, windowSize) {
  const n = windowSize || 5;
  const sorted = extractions
    .filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined && e.date_heure)
    .slice()
    .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
  return sorted.map((e, i) => {
    if (i < n - 1) return { date: e.date_heure, value: null };
    const f = sorted.slice(i - n + 1, i + 1).map(x => Number(x.note_sur_10));
    return { date: e.date_heure, value: Math.round(f.reduce((s, x) => s + x, 0) / n * 100) / 100 };
  });
}

/* Levers examined, in order of preference at equal gap: first what Chris
   really sets when making the cup, then what he undergoes.
   The value function returns null when the lever is not filled in, the cup
   is then ignored FOR THAT LEVER only. */
const LEVERS = [
  { key: "heat", value: e => (e.methode !== "Brikka" || e.puissance_feu === "" || e.puissance_feu === undefined
      ? null : String(e.puissance_feu)) },
  { key: "preheat", value: e => (e.methode !== "Brikka" ? null
      : Number(e.eau_prechauffee) === 1 ? "oui" : "non") },
  { key: "recipe", value: e => e.recette || null },
  { key: "dose", value: e => (Number(e.dose_g) > 0 ? String(Math.round(Number(e.dose_g))) : null) },
  { key: "grind", value: e => e.mouture_dial || null },
  { key: "bag_age", value: e => {
      const days = e._c && e._c.jours_ouvert;
      if (days === "" || days === undefined || days === null) return null;
      return days <= 7 ? "frais" : days <= 21 ? "median" : "vieux";
    } },
];

/* Looks, in a homogeneous batch of cups, for the lever whose best group
   stands out most from the rest. Returns null if none passes the safeguards.

   The safeguards are the same as the dashboard insights and they are not
   negotiable: at least minPerGroup cups on each side, and at least minGap
   points of difference. Below that, any correlation is noise and an
   assertive sentence would be a lie. */
function bestLever(cups, minPerGroup, minGap) {
  const minN = minPerGroup || 3;
  const minE = minGap || 0.4;
  let best = null;

  for (const lever of LEVERS) {
    const groups = new Map();
    cups.forEach(e => {
      const v = lever.value(e);
      if (v === null) return;
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(Number(e.note_sur_10));
    });
    const eligible = [...groups.entries()].filter(([, n]) => n.length >= minN);
    // At least TWO groups are needed: a lever that never varied cannot
    // explain anything, even if its cups are excellent.
    if (eligible.length < 2) continue;

    const avg = n => n.reduce((s, x) => s + x, 0) / n.length;
    const classes = eligible.map(([v, n]) => ({ value: v, mean: avg(n), n: n.length }))
      .sort((a, b) => b.mean - a.mean);
    // The winner against ALL THE REST pooled, not against the second: with
    // three values or more, the gap to the second is always tiny.
    const rest = eligible.filter(([v]) => v !== classes[0].value).flatMap(([, n]) => n);
    if (!rest.length) continue;
    const gap = classes[0].mean - avg(rest);
    if (gap < minE) continue;

    if (!best || gap > best.gap) {
      best = {
        lever: lever.key, value: classes[0].value, gap: gap,
        high: classes[0].mean, low: avg(rest), n: classes[0].n, nRest: rest.length,
      };
    }
  }
  return best;
}

/* One finding per (coffee, machine) pair, from most to least documented.
   Isolating the machine is not a detail: the same heat power means nothing
   for a Switch, and mixing both would produce an average that describes no
   real cup. */
function findingsByCoffee(coffees, extractions, options) {
  const o = options || {};
  const minBatch = o.minBatch || 6;
  const rated = extractions.filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined);
  const batches = new Map();
  rated.forEach(e => {
    const k = e.cafe_id + "|" + e.methode;
    if (!batches.has(k)) batches.set(k, []);
    batches.get(k).push(e);
  });

  return [...batches.entries()]
    .filter(([, cups]) => cups.length >= minBatch)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, cups]) => {
      const [coffeeId, method] = k.split("|");
      const found = bestLever(cups, o.minPerGroup, o.minGap);
      if (!found) return null;
      const coffee = coffees.find(c => c.id === coffeeId);
      return { coffee: coffee || null, coffeeId, methode: method, total: cups.length, ...found };
    })
    .filter(Boolean);
}

/* TWIN CUPS (v8.44). At brew time: this setting, what did it give the
   previous times?

   Twin does NOT mean identical. The first version compared everything
   (temperature, dose, heat), and Chris corrected it before it even existed:
   a cup at 94 °C instead of 92 is still the same cup. A twin is therefore
   the SAME RECIPE and a dial within TWIN_CLICKS clicks (3 clicks, 25 µm).
   The coffee is not required, but cups of the same coffee come first, then
   the closest dial, then the most recent. A pre-ground coffee has no dial:
   its twins are then the cups of the same recipe on that same coffee.

   Only RATED cups count (a twin without a score says nothing), and the
   caller drops the failed ones as everywhere else in what gives advice. */
const TWIN_CLICKS = 3;
function twins(extractions, target, count) {
  if (!target || !target.recette) return [];
  const ground = !!target.ground;
  const pc = ground ? null : GRIND.parseDial(String(target.mouture_dial || ""));
  const found = [];
  extractions.forEach(e => {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined || e.recette !== target.recette) return;
    const sameCoffee = e.cafe_id === target.cafe_id;
    let clickGap = 0;
    if (pc) {
      const pe = GRIND.parseDial(String(e.mouture_dial || ""));
      if (!pe) return;
      clickGap = pe.clicks - pc.clicks;
      if (Math.abs(clickGap) > TWIN_CLICKS) return;
    } else if (!sameCoffee) {
      return;
    }
    found.push({ ext: e, sameCoffee, gap: clickGap });
  });
  found.sort((a, b) =>
    (b.sameCoffee - a.sameCoffee) || (Math.abs(a.gap) - Math.abs(b.gap)) ||
    String(b.ext.date_heure).localeCompare(String(a.ext.date_heure)));
  return found.slice(0, count || 3);
}

/* THE QUANTIFIED CORRECTION (v8.48). From a diagnosis to a setting: "Un peu
   amer" on a 1.4.2 dial becomes "1.4.2 → 1.5.0".

   Nothing is hard-coded here: the DIRECTION comes from DIAGNOSTIC_LEVERS
   (recipes.js), the STEPS from the settings row (Settings), the starting
   value from the cup, and the grind bounds from its machine's range (GRIND).
   Changing a step, a range or a recipe changes the proposal without touching
   the code.

   Several diagnoses ticked: for each lever, the strongest wins; two
   diagnoses pulling a lever in opposite directions cancel it out, which is
   the case for uneven extraction. A pre-ground coffee has no dial. Returns
   the list of levers in the order to apply them (grind, heat, ratio), empty
   if there is nothing to quantify. The first is the proposal, the others
   "if that is not enough". */
function quantifiedCorrection(ext, steps, ground) {
  const p = Object.assign({ pas_crans: 2, pas_degres: 2, pas_feu: 1, pas_eau_g: 15, pas_dose_g: 1 }, steps || {});
  const direction = {};
  String(ext && ext.diagnostic || "").split("|").filter(Boolean).forEach(d => {
    const l = (typeof DIAGNOSTIC_LEVERS !== "undefined" && DIAGNOSTIC_LEVERS[d]) || {};
    Object.entries(l).forEach(([k, v]) => {
      if (direction[k] === undefined) direction[k] = v;
      else if (Math.sign(direction[k]) !== Math.sign(v)) direction[k] = 0;
      else if (Math.abs(v) > Math.abs(direction[k])) direction[k] = v;
    });
  });
  const num = v => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const levers = [];
  if (direction.grind && !ground) {
    const d = GRIND.parseDial(String(ext.mouture_dial || ""));
    const range = GRIND.METHODS.find(m => m.id === String(ext.methode || "").toLowerCase());
    if (d) {
      let c = d.clicks + direction.grind * p.pas_crans;
      if (range) c = clamp(c, range.minC, range.maxC);
      c = clamp(c, 0, GRIND.MAX_CLICKS);
      if (c !== d.clicks) {
        levers.push({ lever: "grind", field: "mouture_dial", from: ext.mouture_dial, to: GRIND.dialFromClicks(c),
          gap: c - d.clicks, microns: [Math.round(d.microns), Math.round(c * GRIND.MICRONS_PER_CLICK)] });
      }
    }
  }
  if (direction.heat) {
    if (ext.methode === "Switch" && num(ext.temperature_c) !== null) {
      const t = clamp(num(ext.temperature_c) + direction.heat * p.pas_degres, 80, 100);
      if (t !== num(ext.temperature_c)) levers.push({ lever: "temperature", field: "temperature_c", from: num(ext.temperature_c), to: t });
    } else if (ext.methode === "Brikka" && num(ext.puissance_feu) !== null && direction.heat < 0) {
      // On the Brikka, never more heat (v8.74): it overheats the aluminium.
      const f = clamp(num(ext.puissance_feu) + direction.heat * p.pas_feu, 1, 10);
      if (f !== num(ext.puissance_feu)) levers.push({ lever: "heat", field: "puissance_feu", from: num(ext.puissance_feu), to: f });
    }
  }
  if (direction.ratio) {
    if (ext.methode === "Switch" && num(ext.eau_g) > 0) {
      const e = Math.max(num(ext.dose_g) > 0 ? num(ext.dose_g) * 8 : 60, num(ext.eau_g) + direction.ratio * p.pas_eau_g);
      if (e !== num(ext.eau_g)) levers.push({ lever: "water", field: "eau_g", from: num(ext.eau_g), to: e });
    }
    // No quantified ratio on the Brikka (v8.74): its basket is full and levelled.
  }
  return levers;
}

/* CONSISTENCY, AT EQUAL COFFEE (v8.54). The mean gap of each cup to the
   average of the cups of the SAME coffee on the SAME recipe, over all the
   cups that have at least one twin. The old calculation took the gap to the
   average of the whole history: a Liberica at 8 and a Strong at 4, each
   remade identically, gave a big gap. That was the variety of the coffees,
   not the consistency of the hand. Returns null until some coffee and
   recipe pair has two rated cups. */
function gapAtSameCoffee(cups) {
  const groups = {};
  cups.forEach(e => {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined) return;
    const k = e.cafe_id + "|" + e.recette;
    (groups[k] = groups[k] || []).push(Number(e.note_sur_10));
  });
  let sum = 0, n = 0;
  Object.values(groups).filter(g => g.length >= 2).forEach(g => {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    g.forEach(x => { sum += Math.abs(x - m); n += 1; });
  });
  return n ? sum / n : null;
}

const TUNING = (() => {
  // Same threshold as the insights: under three cups, an average is chance.
  const MIN_CUPS = 3;

  const str = v => (v === null || v === undefined ? "" : String(v));

  /* Signature of a combination. Empty values count: "no grind" is
     information about a pre-ground coffee, not missing data. */
  function signature(e) {
    return [
      str(e.recette),
      str(e.mouture_dial),
      str(e.puissance_feu),
      Number(e.eau_prechauffee) === 1 ? "1" : "",
    ].join("|");
  }

  // Defined once, in tools.js. Returns null on an empty list, where the
  // local copy returned NaN and let "NaN" reach the screen.
  const average = TOOLS.average;

  /* Returns a coffee's summary: its average over all cups, and the best
     combination if it reaches the threshold.

     `raison` explains the absence of a result instead of leaving an empty
     card, and distinguishes the two cases that do not call for the same
     action: not enough cups in total, or enough cups but scattered over too
     many settings. */
  function forCoffee(coffeeId, extractions, minCups) {
    const threshold = minCups || MIN_CUPS;
    const rated = extractions.filter(e => e.cafe_id === coffeeId && e.note_sur_10 !== "");
    if (!rated.length) return { total: 0, average: null, best: null, reason: "aucune" };

    const groups = new Map();
    rated.forEach(e => {
      const s = signature(e);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(e);
    });

    const eligible = [...groups.entries()]
      .filter(([, list]) => list.length >= threshold)
      .map(([s, list]) => {
        const notes = list.map(e => Number(e.note_sur_10));
        const avg = average(notes);
        // The reference cup: the best rated of the combination, the most
        // recent on a tie. It is the one we duplicate to remake it.
        const ref = [...list].sort((a, b) =>
          Number(b.note_sur_10) - Number(a.note_sur_10) ||
          String(b.date_heure).localeCompare(String(a.date_heure)))[0];
        const [recipe, grind, power, preheat] = s.split("|");
        return {
          signature: s, recette: recipe, grind, power,
          preheat: preheat === "1",
          average: avg, n: list.length, referenceId: ref.id,
        };
      })
      .sort((a, b) => b.average - a.average || b.n - a.n);

    const summary = {
      total: rated.length,
      average: average(rated.map(e => Number(e.note_sur_10))),
      best: eligible[0] || null,
      combinations: groups.size,
      reason: "",
    };
    /* A "BEST" BELOW THE AVERAGE IS NOT ONE (v8.38). When all the settings
       remade at least three times stay below the coffee's average, the good
       cups come from settings tried once or twice: crowning the least bad of
       the repeated settings advised remaking a cup worse than usual. We
       instead point to the setting of the BEST cup, and what is missing to
       know whether it holds. */
    if (summary.best && summary.best.average < summary.average - 0.2) {
      const top = [...rated].sort((a, b) =>
        Number(b.note_sur_10) - Number(a.note_sur_10) ||
        String(b.date_heure).localeCompare(String(a.date_heure)))[0];
      const k = groups.get(signature(top)).length;
      summary.best = null;
      summary.reason = "sous_moyenne";
      summary.bestCup = { id: top.id, note: Number(top.note_sur_10), times: k };
      summary.missing = Math.max(1, threshold - k);
      return summary;
    }
    if (!summary.best) {
      summary.reason = rated.length < threshold ? "pas_assez" : "eparpille";
      // How many cups the most played combination is missing: that is the
      // concrete action, remake the same one rather than trying one more.
      const mostPlayed = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      summary.missing = threshold - mostPlayed.length;
    }
    return summary;
  }

  /* All coffees, active ones first, those with a result on top. A coffee
     without any rated cup is returned anyway: its lack of a result is
     information. */
  function forAllCoffees(coffees, extractions, minCups) {
    return coffees
      .map(c => ({ coffee: c, ...forCoffee(c.id, extractions, minCups) }))
      .sort((a, b) => {
        const byActive = (a.coffee.actif === 0 ? 1 : 0) - (b.coffee.actif === 0 ? 1 : 0);
        if (byActive) return byActive;
        const byFound = (b.best ? 1 : 0) - (a.best ? 1 : 0);
        if (byFound) return byFound;
        return (b.best ? b.best.average : b.average || 0) -
          (a.best ? a.best.average : a.average || 0);
      });
  }

  return { MIN_CUPS, signature, forCoffee, forAllCoffees, rollingAverage, bestLever, findingsByCoffee, LEVERS,
    TWIN_CLICKS, twins, quantifiedCorrection, gapAtSameCoffee };
})();
