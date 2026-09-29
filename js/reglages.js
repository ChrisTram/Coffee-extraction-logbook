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
function moyenneGlissante(extractions, windowSize) {
  const n = windowSize || 5;
  const sorted = extractions
    .filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined && e.date_heure)
    .slice()
    .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
  return sorted.map((e, i) => {
    if (i < n - 1) return { date: e.date_heure, valeur: null };
    const f = sorted.slice(i - n + 1, i + 1).map(x => Number(x.note_sur_10));
    return { date: e.date_heure, valeur: Math.round(f.reduce((s, x) => s + x, 0) / n * 100) / 100 };
  });
}

/* Levers examined, in order of preference at equal gap: first what Chris
   really sets when making the cup, then what he undergoes.
   The value function returns null when the lever is not filled in, the cup
   is then ignored FOR THAT LEVER only. */
const LEVIERS = [
  { cle: "feu", valeur: e => (e.methode !== "Brikka" || e.puissance_feu === "" || e.puissance_feu === undefined
      ? null : String(e.puissance_feu)) },
  { cle: "prechauffage", valeur: e => (e.methode !== "Brikka" ? null
      : Number(e.eau_prechauffee) === 1 ? "oui" : "non") },
  { cle: "recette", valeur: e => e.recette || null },
  { cle: "dose", valeur: e => (Number(e.dose_g) > 0 ? String(Math.round(Number(e.dose_g))) : null) },
  { cle: "mouture", valeur: e => e.mouture_dial || null },
  { cle: "paquet", valeur: e => {
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
function meilleurLevier(cups, minPerGroup, minGap) {
  const minN = minPerGroup || 3;
  const minE = minGap || 0.4;
  let best = null;

  for (const lever of LEVIERS) {
    const groups = new Map();
    cups.forEach(e => {
      const v = lever.valeur(e);
      if (v === null) return;
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(Number(e.note_sur_10));
    });
    const eligible = [...groups.entries()].filter(([, n]) => n.length >= minN);
    // At least TWO groups are needed: a lever that never varied cannot
    // explain anything, even if its cups are excellent.
    if (eligible.length < 2) continue;

    const avg = n => n.reduce((s, x) => s + x, 0) / n.length;
    const classes = eligible.map(([v, n]) => ({ valeur: v, moy: avg(n), n: n.length }))
      .sort((a, b) => b.moy - a.moy);
    // The winner against ALL THE REST pooled, not against the second: with
    // three values or more, the gap to the second is always tiny.
    const rest = eligible.filter(([v]) => v !== classes[0].valeur).flatMap(([, n]) => n);
    if (!rest.length) continue;
    const gap = classes[0].moy - avg(rest);
    if (gap < minE) continue;

    if (!best || gap > best.ecart) {
      best = {
        levier: lever.cle, valeur: classes[0].valeur, ecart: gap,
        haut: classes[0].moy, bas: avg(rest), n: classes[0].n, nReste: rest.length,
      };
    }
  }
  return best;
}

/* One finding per (coffee, machine) pair, from most to least documented.
   Isolating the machine is not a detail: the same heat power means nothing
   for a Switch, and mixing both would produce an average that describes no
   real cup. */
function constatsParCafe(cafes, extractions, options) {
  const o = options || {};
  const minLot = o.minLot || 6;
  const rated = extractions.filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined);
  const batches = new Map();
  rated.forEach(e => {
    const k = e.cafe_id + "|" + e.methode;
    if (!batches.has(k)) batches.set(k, []);
    batches.get(k).push(e);
  });

  return [...batches.entries()]
    .filter(([, cups]) => cups.length >= minLot)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, cups]) => {
      const [cafeId, methode] = k.split("|");
      const found = meilleurLevier(cups, o.minParGroupe, o.minEcart);
      if (!found) return null;
      const cafe = cafes.find(c => c.id === cafeId);
      return { cafe: cafe || null, cafeId, methode, total: cups.length, ...found };
    })
    .filter(Boolean);
}

/* TWIN CUPS (v8.44). At brew time: this setting, what did it give the
   previous times?

   Twin does NOT mean identical. The first version compared everything
   (temperature, dose, heat), and Chris corrected it before it even existed:
   a cup at 94 °C instead of 92 is still the same cup. A twin is therefore
   the SAME RECIPE and a dial within JUMELLE_CRANS clicks (3 clicks, 25 µm).
   The coffee is not required, but cups of the same coffee come first, then
   the closest dial, then the most recent. A pre-ground coffee has no dial:
   its twins are then the cups of the same recipe on that same coffee.

   Only RATED cups count (a twin without a score says nothing), and the
   caller drops the failed ones as everywhere else in what gives advice. */
const JUMELLE_CRANS = 3;
function jumelles(extractions, target, count) {
  if (!target || !target.recette) return [];
  const ground = !!target.moulu;
  const pc = ground ? null : GRIND.parseDial(String(target.mouture_dial || ""));
  const found = [];
  extractions.forEach(e => {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined || e.recette !== target.recette) return;
    const memeCafe = e.cafe_id === target.cafe_id;
    let ecart = 0;
    if (pc) {
      const pe = GRIND.parseDial(String(e.mouture_dial || ""));
      if (!pe) return;
      ecart = pe.crans - pc.crans;
      if (Math.abs(ecart) > JUMELLE_CRANS) return;
    } else if (!memeCafe) {
      return;
    }
    found.push({ ext: e, memeCafe, ecart });
  });
  found.sort((a, b) =>
    (b.memeCafe - a.memeCafe) || (Math.abs(a.ecart) - Math.abs(b.ecart)) ||
    String(b.ext.date_heure).localeCompare(String(a.ext.date_heure)));
  return found.slice(0, count || 3);
}

/* THE QUANTIFIED CORRECTION (v8.48). From a diagnosis to a setting: "Un peu
   amer" on a 1.4.2 dial becomes "1.4.2 → 1.5.0".

   Nothing is hard-coded here: the DIRECTION comes from DIAGNOSTIC_LEVIERS
   (recettes.js), the STEPS from the settings row (Settings), the starting
   value from the cup, and the grind bounds from its machine's range (GRIND).
   Changing a step, a range or a recipe changes the proposal without touching
   the code.

   Several diagnoses ticked: for each lever, the strongest wins; two
   diagnoses pulling a lever in opposite directions cancel it out, which is
   the case for uneven extraction. A pre-ground coffee has no dial. Returns
   the list of levers in the order to apply them (grind, heat, ratio), empty
   if there is nothing to quantify. The first is the proposal, the others
   "if that is not enough". */
function correctionChiffree(ext, steps, ground) {
  const p = Object.assign({ pas_crans: 2, pas_degres: 2, pas_feu: 1, pas_eau_g: 15, pas_dose_g: 1 }, steps || {});
  const direction = {};
  String(ext && ext.diagnostic || "").split("|").filter(Boolean).forEach(d => {
    const l = (typeof DIAGNOSTIC_LEVIERS !== "undefined" && DIAGNOSTIC_LEVIERS[d]) || {};
    Object.entries(l).forEach(([k, v]) => {
      if (direction[k] === undefined) direction[k] = v;
      else if (Math.sign(direction[k]) !== Math.sign(v)) direction[k] = 0;
      else if (Math.abs(v) > Math.abs(direction[k])) direction[k] = v;
    });
  });
  const num = v => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const levers = [];
  if (direction.mouture && !ground) {
    const d = GRIND.parseDial(String(ext.mouture_dial || ""));
    const range = GRIND.METHODES.find(m => m.id === String(ext.methode || "").toLowerCase());
    if (d) {
      let c = d.crans + direction.mouture * p.pas_crans;
      if (range) c = clamp(c, range.minC, range.maxC);
      c = clamp(c, 0, GRIND.CRANS_MAX);
      if (c !== d.crans) {
        levers.push({ levier: "mouture", champ: "mouture_dial", de: ext.mouture_dial, vers: GRIND.dialDepuisCrans(c),
          ecart: c - d.crans, microns: [Math.round(d.microns), Math.round(c * GRIND.MICRONS_PAR_CRAN)] });
      }
    }
  }
  if (direction.chaleur) {
    if (ext.methode === "Switch" && num(ext.temperature_c) !== null) {
      const t = clamp(num(ext.temperature_c) + direction.chaleur * p.pas_degres, 80, 100);
      if (t !== num(ext.temperature_c)) levers.push({ levier: "temperature", champ: "temperature_c", de: num(ext.temperature_c), vers: t });
    } else if (ext.methode === "Brikka" && num(ext.puissance_feu) !== null && direction.chaleur < 0) {
      // On the Brikka, never more heat (v8.74): it overheats the aluminium.
      const f = clamp(num(ext.puissance_feu) + direction.chaleur * p.pas_feu, 1, 10);
      if (f !== num(ext.puissance_feu)) levers.push({ levier: "feu", champ: "puissance_feu", de: num(ext.puissance_feu), vers: f });
    }
  }
  if (direction.ratio) {
    if (ext.methode === "Switch" && num(ext.eau_g) > 0) {
      const e = Math.max(num(ext.dose_g) > 0 ? num(ext.dose_g) * 8 : 60, num(ext.eau_g) + direction.ratio * p.pas_eau_g);
      if (e !== num(ext.eau_g)) levers.push({ levier: "eau", champ: "eau_g", de: num(ext.eau_g), vers: e });
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
function ecartACafeEgal(cups) {
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

const REGLAGES = (() => {
  // Same threshold as the insights: under three cups, an average is chance.
  const MIN_TASSES = 3;

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

  // Defined once, in outils.js. Returns null on an empty list, where the
  // local copy returned NaN and let "NaN" reach the screen.
  const moyenne = OUTILS.moyenne;

  /* Returns a coffee's summary: its average over all cups, and the best
     combination if it reaches the threshold.

     `raison` explains the absence of a result instead of leaving an empty
     card, and distinguishes the two cases that do not call for the same
     action: not enough cups in total, or enough cups but scattered over too
     many settings. */
  function pourCafe(cafeId, extractions, minTasses) {
    const threshold = minTasses || MIN_TASSES;
    const rated = extractions.filter(e => e.cafe_id === cafeId && e.note_sur_10 !== "");
    if (!rated.length) return { total: 0, moyenne: null, meilleure: null, raison: "aucune" };

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
        const avg = moyenne(notes);
        // The reference cup: the best rated of the combination, the most
        // recent on a tie. It is the one we duplicate to remake it.
        const ref = [...list].sort((a, b) =>
          Number(b.note_sur_10) - Number(a.note_sur_10) ||
          String(b.date_heure).localeCompare(String(a.date_heure)))[0];
        const [recette, mouture, puissance, prechauffe] = s.split("|");
        return {
          signature: s, recette, mouture, puissance,
          prechauffe: prechauffe === "1",
          moyenne: avg, n: list.length, referenceId: ref.id,
        };
      })
      .sort((a, b) => b.moyenne - a.moyenne || b.n - a.n);

    const summary = {
      total: rated.length,
      moyenne: moyenne(rated.map(e => Number(e.note_sur_10))),
      meilleure: eligible[0] || null,
      combinaisons: groups.size,
      raison: "",
    };
    /* A "BEST" BELOW THE AVERAGE IS NOT ONE (v8.38). When all the settings
       remade at least three times stay below the coffee's average, the good
       cups come from settings tried once or twice: crowning the least bad of
       the repeated settings advised remaking a cup worse than usual. We
       instead point to the setting of the BEST cup, and what is missing to
       know whether it holds. */
    if (summary.meilleure && summary.meilleure.moyenne < summary.moyenne - 0.2) {
      const top = [...rated].sort((a, b) =>
        Number(b.note_sur_10) - Number(a.note_sur_10) ||
        String(b.date_heure).localeCompare(String(a.date_heure)))[0];
      const k = groups.get(signature(top)).length;
      summary.meilleure = null;
      summary.raison = "sous_moyenne";
      summary.meilleureTasse = { id: top.id, note: Number(top.note_sur_10), fois: k };
      summary.manque = Math.max(1, threshold - k);
      return summary;
    }
    if (!summary.meilleure) {
      summary.raison = rated.length < threshold ? "pas_assez" : "eparpille";
      // How many cups the most played combination is missing: that is the
      // concrete action, remake the same one rather than trying one more.
      const mostPlayed = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      summary.manque = threshold - mostPlayed.length;
    }
    return summary;
  }

  /* All coffees, active ones first, those with a result on top. A coffee
     without any rated cup is returned anyway: its lack of a result is
     information. */
  function tous(cafes, extractions, minTasses) {
    return cafes
      .map(c => ({ cafe: c, ...pourCafe(c.id, extractions, minTasses) }))
      .sort((a, b) => {
        const byActive = (a.cafe.actif === 0 ? 1 : 0) - (b.cafe.actif === 0 ? 1 : 0);
        if (byActive) return byActive;
        const byFound = (b.meilleure ? 1 : 0) - (a.meilleure ? 1 : 0);
        if (byFound) return byFound;
        return (b.meilleure ? b.meilleure.moyenne : b.moyenne || 0) -
          (a.meilleure ? a.meilleure.moyenne : a.moyenne || 0);
      });
  }

  return { MIN_TASSES, signature, pourCafe, tous, moyenneGlissante, meilleurLevier, constatsParCafe, LEVIERS,
    JUMELLE_CRANS, jumelles, correctionChiffree, ecartACafeEgal };
})();
