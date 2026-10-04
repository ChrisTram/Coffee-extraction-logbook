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
    .filter(e => e.score_10 !== "" && e.score_10 !== undefined && e.date_time)
    .slice()
    .sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));
  return sorted.map((e, i) => {
    if (i < n - 1) return { date: e.date_time, value: null };
    // The window is full here (n cups), so the shared mean is the sum over n (H1, v9.19).
    const f = sorted.slice(i - n + 1, i + 1).map(x => Number(x.score_10));
    return { date: e.date_time, value: Math.round(TOOLS.average(f) * 100) / 100 };
  });
}

/* Levers examined, in order of preference at equal gap: first what Chris
   really sets when making the cup, then what he undergoes.
   The value function returns null when the lever is not filled in, the cup
   is then ignored FOR THAT LEVER only. */
const LEVERS = [
  { key: "heat", value: e => (e.method !== "Brikka" || e.heat_level === "" || e.heat_level === undefined
      ? null : String(e.heat_level)) },
  { key: "preheat", value: e => (e.method !== "Brikka" ? null
      : Number(e.preheated_water) === 1 ? "oui" : "non") },
  { key: "recipe", value: e => e.recipe || null },
  { key: "dose", value: e => (Number(e.dose_g) > 0 ? String(Math.round(Number(e.dose_g))) : null) },
  { key: "grind", value: e => e.grind_dial || null },
  { key: "bag_age", value: e => {
      const days = e._c && e._c.days_open;
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
      groups.get(v).push(Number(e.score_10));
    });
    const eligible = [...groups.entries()].filter(([, n]) => n.length >= minN);
    // At least TWO groups are needed: a lever that never varied cannot
    // explain anything, even if its cups are excellent.
    if (eligible.length < 2) continue;

    // The shared mean (H1, v9.19): every list here holds at least minN scores, never an empty one.
    const avg = TOOLS.average;
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
  const rated = extractions.filter(e => e.score_10 !== "" && e.score_10 !== undefined);
  const batches = new Map();
  rated.forEach(e => {
    const k = e.coffee_id + "|" + e.method;
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
      return { coffee: coffee || null, coffeeId, method: method, total: cups.length, ...found };
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
  if (!target || !target.recipe) return [];
  const ground = !!target.ground;
  const pc = ground ? null : GRIND.parseDial(String(target.grind_dial || ""));
  const found = [];
  extractions.forEach(e => {
    if (e.score_10 === "" || e.score_10 === undefined || e.recipe !== target.recipe) return;
    const sameCoffee = e.coffee_id === target.coffee_id;
    let clickGap = 0;
    if (pc) {
      const pe = GRIND.parseDial(String(e.grind_dial || ""));
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
    String(b.ext.date_time).localeCompare(String(a.ext.date_time)));
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
  const p = Object.assign({ step_clicks: 2, step_degrees: 2, step_heat: 1, step_water_g: 15, step_dose_g: 1 }, steps || {});
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
    const d = GRIND.parseDial(String(ext.grind_dial || ""));
    const range = GRIND.METHODS.find(m => m.id === String(ext.method || "").toLowerCase());
    if (d) {
      let c = d.clicks + direction.grind * p.step_clicks;
      if (range) c = clamp(c, range.minC, range.maxC);
      c = clamp(c, 0, GRIND.MAX_CLICKS);
      if (c !== d.clicks) {
        levers.push({ lever: "grind", field: "grind_dial", from: ext.grind_dial, to: GRIND.dialFromClicks(c),
          gap: c - d.clicks, microns: [Math.round(d.microns), Math.round(c * GRIND.MICRONS_PER_CLICK)] });
      }
    }
  }
  if (direction.heat) {
    if (ext.method === "Switch" && num(ext.temperature_c) !== null) {
      const t = clamp(num(ext.temperature_c) + direction.heat * p.step_degrees, 80, 100);
      if (t !== num(ext.temperature_c)) levers.push({ lever: "temperature", field: "temperature_c", from: num(ext.temperature_c), to: t });
    } else if (ext.method === "Brikka" && num(ext.heat_level) !== null && direction.heat < 0) {
      // On the Brikka, never more heat (v8.74): it overheats the aluminium.
      const f = clamp(num(ext.heat_level) + direction.heat * p.step_heat, 1, 10);
      if (f !== num(ext.heat_level)) levers.push({ lever: "heat", field: "heat_level", from: num(ext.heat_level), to: f });
    }
  }
  if (direction.ratio) {
    if (ext.method === "Switch" && num(ext.water_g) > 0) {
      const e = Math.max(num(ext.dose_g) > 0 ? num(ext.dose_g) * 8 : 60, num(ext.water_g) + direction.ratio * p.step_water_g);
      if (e !== num(ext.water_g)) levers.push({ lever: "water", field: "water_g", from: num(ext.water_g), to: e });
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
    if (e.score_10 === "" || e.score_10 === undefined) return;
    const k = e.coffee_id + "|" + e.recipe;
    (groups[k] = groups[k] || []).push(Number(e.score_10));
  });
  let sum = 0, n = 0;
  Object.values(groups).filter(g => g.length >= 2).forEach(g => {
    const m = TOOLS.average(g);
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
      str(e.recipe),
      str(e.grind_dial),
      str(e.heat_level),
      Number(e.preheated_water) === 1 ? "1" : "",
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
    const rated = extractions.filter(e => e.coffee_id === coffeeId && e.score_10 !== "");
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
        const notes = list.map(e => Number(e.score_10));
        const avg = average(notes);
        // The reference cup: the best rated of the combination, the most
        // recent on a tie. It is the one we duplicate to remake it.
        const ref = [...list].sort((a, b) =>
          Number(b.score_10) - Number(a.score_10) ||
          String(b.date_time).localeCompare(String(a.date_time)))[0];
        const [recipe, grind, power, preheat] = s.split("|");
        return {
          signature: s, recipe: recipe, grind, power,
          preheat: preheat === "1",
          average: avg, n: list.length, referenceId: ref.id,
        };
      })
      .sort((a, b) => b.average - a.average || b.n - a.n);

    const summary = {
      total: rated.length,
      average: average(rated.map(e => Number(e.score_10))),
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
        Number(b.score_10) - Number(a.score_10) ||
        String(b.date_time).localeCompare(String(a.date_time)))[0];
      const k = groups.get(signature(top)).length;
      summary.best = null;
      summary.reason = "below_average";
      summary.bestCup = { id: top.id, note: Number(top.score_10), times: k };
      summary.missing = Math.max(1, threshold - k);
      return summary;
    }
    if (!summary.best) {
      summary.reason = rated.length < threshold ? "not_enough" : "scattered";
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
        const byActive = (a.coffee.active === 0 ? 1 : 0) - (b.coffee.active === 0 ? 1 : 0);
        if (byActive) return byActive;
        const byFound = (b.best ? 1 : 0) - (a.best ? 1 : 0);
        if (byFound) return byFound;
        return (b.best ? b.best.average : b.average || 0) -
          (a.best ? a.best.average : a.average || 0);
      });
  }

  /* ---------- O3 (v9.19): the winning settings, as a table ----------

     The best combination of each coffee existed one coffee at a time (its
     sheet, Ctrl K). Three readings are added, all pure, all on the
     analysable cups the caller passes:
     - winningRows: one row per coffee whose best setting is proven by the
       same rule as above (MIN_CUPS cups on one combination), with its
       reference cup, the one « Refaire » duplicates; the coffees on their
       way to it apart, with the reason;
     - toRetry: a cup scored high ONCE whose setting was never made again,
       on a coffee still in use: the cup worth a second chance;
     - safestSettings: per machine, the value of a lever that lifts the cups
       above their own coffee's average, across coffees. */
  const RETRY_MIN_SCORE = 8;
  const SAFE_MIN_CUPS = 4;
  const rated = e => e.score_10 !== "" && e.score_10 !== undefined && e.score_10 !== null;
  const num = v => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));

  function winningRows(coffees, extractions, minCups) {
    const rows = [], pending = [];
    coffees.forEach(c => {
      const s = forCoffee(c.id, extractions, minCups);
      if (s.best) {
        const ref = extractions.find(e => e.id === s.best.referenceId) || null;
        rows.push({ coffee: c, best: s.best, average: s.average, total: s.total, ref: ref });
      } else if (s.total > 0 && c.active !== 0) {
        pending.push({ coffee: c, ...s });
      }
    });
    // The coffees in use first, then the best score, then the most documented.
    rows.sort((a, b) => (a.coffee.active === 0) - (b.coffee.active === 0) ||
      b.best.average - a.best.average || b.best.n - a.best.n);
    pending.sort((a, b) => b.total - a.total);
    return { rows, pending };
  }

  function toRetry(coffees, extractions, options) {
    const o = options || {};
    const minScore = o.minScore || RETRY_MIN_SCORE;
    const times = new Map();
    extractions.forEach(e => {
      if (!rated(e)) return;
      const k = e.coffee_id + "#" + signature(e);
      times.set(k, (times.get(k) || 0) + 1);
    });
    const bests = new Map();
    const found = [];
    extractions.forEach(e => {
      if (!rated(e) || !(Number(e.score_10) >= minScore)) return;
      if (times.get(e.coffee_id + "#" + signature(e)) !== 1) return;
      const coffee = coffees.find(c => c.id === e.coffee_id);
      if (!coffee || coffee.active === 0) return;
      if (!bests.has(coffee.id)) bests.set(coffee.id, forCoffee(coffee.id, extractions, o.minCups).best);
      // Below the proven best of its coffee, a lucky cup is not worth a retry.
      const best = bests.get(coffee.id);
      if (best && Number(e.score_10) <= best.average) return;
      found.push({ ext: e, coffee: coffee, score: Number(e.score_10) });
    });
    found.sort((a, b) => b.score - a.score || String(b.ext.date_time).localeCompare(String(a.ext.date_time)));
    return found.slice(0, o.limit || 3);
  }

  /* The levers read across coffees, per machine: the water temperature and
     the grind at the Switch, the grind and the heat at the Brikka. Each cup
     counts as its gap to its OWN coffee's average on that machine: a good
     coffee does not make its temperature look good. */
  const SAFE_LEVERS = {
    Switch: [
      { key: "temperature", value: e => (num(e.temperature_c) === null ? null : String(Math.round(num(e.temperature_c)))) },
      { key: "grind", value: e => e.grind_dial || null },
    ],
    Brikka: [
      { key: "grind", value: e => e.grind_dial || null },
      { key: "heat", value: e => (num(e.heat_level) === null ? null : String(num(e.heat_level))) },
    ],
  };
  function safestSettings(extractions, options) {
    const o = options || {};
    const minN = o.minCups || SAFE_MIN_CUPS;
    const minGap = o.minGap === undefined ? 0.2 : o.minGap;
    const scored = extractions.filter(e => rated(e) && num(e.score_10) !== null);
    const out = [];
    ["Switch", "Brikka"].forEach(method => {
      const cups = scored.filter(e => e.method === method);
      const perCoffee = new Map();
      cups.forEach(e => {
        if (!perCoffee.has(e.coffee_id)) perCoffee.set(e.coffee_id, []);
        perCoffee.get(e.coffee_id).push(Number(e.score_10));
      });
      const means = new Map([...perCoffee.entries()].map(([id, list]) => [id, average(list)]));
      let best = null;
      SAFE_LEVERS[method].forEach(lever => {
        const groups = new Map();
        cups.forEach(e => {
          const v = lever.value(e);
          if (v === null) return;
          if (!groups.has(v)) groups.set(v, []);
          groups.get(v).push(e);
        });
        // A lever that never moved says nothing: two values at least, each documented.
        const documented = [...groups.entries()].filter(([, list]) => list.length >= minN);
        if (documented.length < 2) return;
        documented.forEach(([v, list]) => {
          const coffeeCount = new Set(list.map(e => e.coffee_id)).size;
          if (coffeeCount < 2) return;
          const gap = average(list.map(e => Number(e.score_10) - means.get(e.coffee_id)));
          if (gap < minGap) return;
          if (!best || gap > best.gap) best = { method, lever: lever.key, value: v, gap, n: list.length, coffees: coffeeCount };
        });
      });
      if (best) out.push(best);
    });
    return out;
  }

  /* D2, in O3 (v9.19): « Chez toi » on a Guide recipe card. The rated cups
     of this recipe in date order (the curve), their average, and the best
     setting made on it: same coffee, same grind, same water (the degree at
     the Switch, the heat and the preheating at the Brikka), proven by at
     least RECIPE_BEST_MIN cups. */
  const RECIPE_BEST_MIN = 2;
  function recipeHome(recipeName, extractions) {
    const cups = extractions.filter(e => e.recipe === recipeName && rated(e) && num(e.score_10) !== null)
      .slice().sort((a, b) => String(a.date_time).localeCompare(String(b.date_time)));
    if (!cups.length) return { n: 0, average: null, points: [], best: null };
    const groups = new Map();
    cups.forEach(e => {
      const water = e.method === "Brikka"
        ? "f" + str(e.heat_level) + (Number(e.preheated_water) === 1 ? "p" : "")
        : str(num(e.temperature_c) === null ? "" : Math.round(num(e.temperature_c)));
      const k = [e.coffee_id, str(e.grind_dial), water].join("|");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    const best = [...groups.values()].filter(list => list.length >= RECIPE_BEST_MIN)
      .map(list => {
        const ref = [...list].sort((a, b) => Number(b.score_10) - Number(a.score_10) ||
          String(b.date_time).localeCompare(String(a.date_time)))[0];
        return { list, ref, average: average(list.map(e => Number(e.score_10))) };
      })
      .sort((a, b) => b.average - a.average || b.list.length - a.list.length ||
        String(b.ref.date_time).localeCompare(String(a.ref.date_time)))[0];
    return {
      n: cups.length,
      average: average(cups.map(e => Number(e.score_10))),
      points: cups.map(e => ({ id: e.id, date: e.date_time, score: Number(e.score_10) })),
      best: best ? {
        coffeeId: best.ref.coffee_id, method: best.ref.method, grind: best.ref.grind_dial || "",
        temperature: best.ref.method === "Switch" ? num(best.ref.temperature_c) : null,
        heat: best.ref.method === "Brikka" ? num(best.ref.heat_level) : null,
        preheat: Number(best.ref.preheated_water) === 1,
        average: best.average, n: best.list.length, referenceId: best.ref.id,
      } : null,
    };
  }

  /* O4 (v9.19): THE RECIPE TO START WITH, for a first coffee. The coffee and
     recipe table of the Guide (COFFEE_RECIPE_MATRIX, recipes.js) picks it
     from the process and the roast; the brewers ticked in the welcome
     narrow it: the cell's recipe, else its alternative, else the everyday
     recipe of the brewer at hand. `temp` is the cell's own text when it
     has one ("92 °C"), empty otherwise. */
  function starterRecipe(coffee, gear, recipes) {
    const has = m => !gear || gear[m] !== false;
    const live = (recipes || []).filter(r => r.active !== 0);
    const byId = id => live.find(r => r.id === id);
    const p = typeof coffeeProfile === "function" ? coffeeProfile(coffee) : { row: null, column: null };
    const cell = typeof COFFEE_RECIPE_MATRIX !== "undefined" && p.row && p.column
      ? COFFEE_RECIPE_MATRIX.cells[p.row + "|" + p.column] : null;
    const tries = cell ? [[cell.recipe, cell.temp], [cell.alternative, ""]] : [];
    for (const [id, temp] of tries) {
      const r = id ? byId(id) : null;
      if (r && has(r.method)) return { recipe: r, temp: temp || "", fromTable: true };
    }
    const everyday = has("Switch") ? byId("chronicler") || live.find(r => r.method === "Switch")
      : byId("brikka-classique") || live.find(r => r.method === "Brikka");
    return everyday ? { recipe: everyday, temp: "", fromTable: false } : null;
  }

  return { MIN_CUPS, signature, forCoffee, forAllCoffees, rollingAverage, bestLever, findingsByCoffee, LEVERS,
    TWIN_CLICKS, twins, quantifiedCorrection, gapAtSameCoffee,
    RETRY_MIN_SCORE, SAFE_MIN_CUPS, RECIPE_BEST_MIN, winningRows, toRetry, safestSettings, recipeHome, starterRecipe };
})();
