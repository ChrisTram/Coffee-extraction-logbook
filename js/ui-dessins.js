/* THE DRAWINGS (v8.49): your coffees as shapes, and each one is a shortcut.
 *
 * The aroma wheel showed what works here: a shape is read at a glance, a
 * table has to be counted. This file draws the others, in home-made SVG like
 * the calendar, from nothing but the data already entered:
 *
 *   - the shelf: bags as jars, filled with what is left, with a freshness
 *     rim; a jar opens its coffee's sheet;
 *   - the clock: each cup at its hour, the further from the center the better rated;
 *   - the spectrum: the diagnostics on one line, from under- to over-extracted,
 *     one row per recipe;
 *   - the grinder map: each cup at its microns, within its machine's range.
 *
 * Four of them live on the dashboard, in the "Tes cafés en dessins" card,
 * each with its shortcut (Mes cafés, the history, the Diagnostics tab, the
 * Guide's grinder). The coffee sheet reuses the grinder map for a single
 * coffee, and adds the fingerprint and the trajectory to it (v8.50).
 *
 * Nothing is hard-coded about the coffees or the settings: the ranges come from
 * GRIND, the taste families from DESCRIPTEURS_GROUPES, the direction of the
 * diagnostics from DIAGNOSTIC_LEVIERS. A drawing without enough data says so
 * in one sentence instead of drawing emptiness. */
"use strict";

(() => {

  const { $, activerEcran, extAnalysables, fmtDecimal, moyenne, nav, replis } = UI;

  const echap = OUTILS.echap;
  const note1 = n => fmtDecimal(n, 1);
  // The tint of a rating, as accent opacity: 5 pale, 8.5 full, like the wheel.
  const opacite = n => Math.max(0.18, Math.min(1, 0.18 + ((n - 5) / 3.5) * 0.82)).toFixed(2);
  const MIN = 3;

  function setDrawing(id, svg, reading) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = svg;
    const l = document.getElementById(id + "-lecture");
    if (l) l.textContent = reading || "";
  }
  const muet = (id, key, v) => setDrawing(id, "", I18N.t(key, v));

  // ---------- The shelf ----------

  /* One jar per active coffee that has a recorded bag, the least full first:
     that is the one you come to look at. The rim shows freshness, as the
     coffee sheet learns it: inside the window, before, after, or unknown. */
  function donneesEtagere() {
    return DATA.state.cafes.filter(c => c.actif !== 0).map(c => {
      const stock = DATA.stockSachet(c.id, replis.dose);
      if (!stock) return null;
      const doses = DATA.state.extractions.filter(e => e.cafe_id === c.id && Number(e.dose_g) > 0).map(e => Number(e.dose_g));
      const dose = doses.length ? moyenne(doses) : replis.dose;
      const left = Math.max(0, stock.restant);
      const rated = extAnalysables().filter(e => e.cafe_id === c.id && e.note_sur_10 !== "");
      const avg = rated.length ? moyenne(rated.map(e => Number(e.note_sur_10))) : 0;
      const f = UI.fenetreFraicheur(rated, avg).fenetre;
      const jc = UI.jourSachet(c.id);
      const state = !f || !jc ? "inconnu" : jc.jour < f.debut ? "avant" : jc.jour > f.fin ? "apres" : "dedans";
      return { cafe: c, pc: Math.min(100, (left / stock.format) * 100), tasses: Math.floor(left / dose), etat: state };
    }).filter(Boolean).sort((a, b) => a.pc - b.pc).slice(0, 6);
  }

  function court(name, max) {
    const n = String(name);
    return n.length <= max ? n : n.slice(0, max - 1).trimEnd() + "…";
  }

  function drawShelf(id) {
    const jars = donneesEtagere();
    if (!jars.length) { muet(id, "de_etagere_vide"); return; }
    const L = 320, step = L / Math.max(jars.length, 4), w = Math.min(46, step - 14);
    let s = '<line x1="8" y1="128" x2="' + (L - 8) + '" y2="128" class="de-planche"></line>';
    jars.forEach((b, i) => {
      const x = step * i + (step - w) / 2, top = 26, low = 126, level = low - ((low - top - 4) * b.pc) / 100;
      s += '<g class="de-bocal de-' + b.etat + '" data-fiche="' + echap(b.cafe.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_bocal_aria", { c: b.cafe.nom, n: b.tasses })) + '"><title>' + echap(b.cafe.nom) + "</title>" +
        '<rect x="' + x.toFixed(1) + '" y="' + top + '" width="' + w.toFixed(1) + '" height="' + (low - top) + '" rx="7" class="de-verre"></rect>' +
        '<rect x="' + (x + 3).toFixed(1) + '" y="' + level.toFixed(1) + '" width="' + (w - 6).toFixed(1) + '" height="' +
        Math.max(0, low - 3 - level).toFixed(1) + '" rx="4" class="de-grains" style="fill-opacity:' + (b.tasses <= 3 ? 0.45 : 0.85) + '"></rect>' +
        '<rect x="' + (x + 8).toFixed(1) + '" y="' + (top - 7) + '" width="' + (w - 16).toFixed(1) + '" height="7" rx="2" class="de-couvercle"></rect>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="143" text-anchor="middle" class="de-fort">' + echap(court(b.cafe.nom, 11)) + "</text>" +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="155" text-anchor="middle">' + echap(b.tasses === 0 ? I18N.t("de_vide") : I18N.t(b.tasses === 1 ? "de_tasse_reste" : "de_tasses", { n: b.tasses })) + "</text></g>";
    });
    const low = jars.filter(b => b.tasses <= 3);
    setDrawing(id, s, low.length
      ? I18N.t("de_etagere_racheter", { c: low.map(b => b.cafe.nom).join(", ") })
      : I18N.t("de_etagere_ok"));
  }

  // ---------- The clock ----------

  /* Rated cups from the last 90 days, at their hour. Radius: the rating. The
     color is the machine's, the only series allowed to carry it.
     The reading compares times of day, same thresholds as the insights. */
  function drawClock(id) {
    const since = new Date(); since.setDate(since.getDate() - 90);
    const cups = extAnalysables().filter(e => e.note_sur_10 !== "" && new Date(e.date_heure) >= since)
      .map(e => ({ h: Number(String(e.date_heure).slice(11, 13)) + Number(String(e.date_heure).slice(14, 16)) / 60,
        n: Number(e.note_sur_10), m: e.methode, id: e.id }))
      .filter(t => Number.isFinite(t.h));
    if (cups.length < MIN) { muet(id, "de_horloge_vide", { n: MIN }); return; }
    const C = [104, 100], R0 = 20, R1 = 84;
    const pt = (h, r) => { const a = -Math.PI / 2 + (h / 24) * Math.PI * 2; return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]; };
    let s = '<circle cx="' + C[0] + '" cy="' + C[1] + '" r="' + R1 + '" class="de-cadran"></circle>' +
      '<circle cx="' + C[0] + '" cy="' + C[1] + '" r="' + ((R0 + R1) / 2) + '" class="de-cadran-mi"></circle>';
    [0, 6, 12, 18].forEach(h => {
      const [x, y] = pt(h, R1 + 9);
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="middle">' + h + " h</text>";
    });
    cups.forEach(t => {
      const [x, y] = pt(t.h, R0 + ((Math.max(3, t.n) - 3) / 7) * (R1 - R0));
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" class="de-point-' + String(t.m || "").toLowerCase() + '"' + ' data-tasse="' + echap(t.id) + '"></circle>';
    });
    const moments = [["de_matin", t => t.h < 12], ["de_aprem", t => t.h >= 12 && t.h < 18], ["de_soir", t => t.h >= 18]]
      .map(([key, f]) => { const ns = cups.filter(f).map(t => t.n); return { cle: key, n: ns.length, moy: ns.length ? moyenne(ns) : null }; })
      .filter(m => m.n >= MIN);
    let y = 58;
    moments.forEach(m => {
      s += '<text x="214" y="' + y + '" class="de-fort">' + echap(I18N.t(m.cle)) + "</text>" +
        '<text x="214" y="' + (y + 13) + '">' + echap(I18N.t("de_moyenne", { m: note1(m.moy), n: m.n })) + "</text>";
      y += 36;
    });
    const sorted = moments.slice().sort((a, b) => b.moy - a.moy);
    setDrawing(id, s, sorted.length >= 2 && sorted[0].moy - sorted[sorted.length - 1].moy >= 0.4
      ? I18N.t("de_horloge_lecture", { a: I18N.t(sorted[0].cle), b: I18N.t(sorted[sorted.length - 1].cle) })
      : I18N.t("de_horloge_egal"));
  }

  // ---------- The extraction spectrum ----------

  /* A diagnostic's position on the under-extracted / over-extracted axis: the
     grind DIRECTION in DIAGNOSTIC_LEVIERS (coarser means over-extracted),
     "Équilibré" in the middle. Ratio or coffee diagnostics have no place
     here: they are not about extraction. */
  function position(diag) {
    if (diag === "Équilibré") return 0;
    const l = DIAGNOSTIC_LEVIERS[diag];
    return l && l.mouture ? l.mouture : null;
  }

  function donneesSpectre() {
    const byRecipe = {};
    extAnalysables().forEach(e => {
      const pos = String(e.diagnostic || "").split("|").map(position).filter(v => v !== null);
      if (!pos.length || !e.recette) return;
      // One cup, one point: the most clear-cut diagnostic places it.
      const v = pos.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
      (byRecipe[e.recette] = byRecipe[e.recette] || []).push({ v, id: e.id });
    });
    return Object.entries(byRecipe).filter(([, v]) => v.length >= MIN)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([recipe, l]) => ({ recette: recipe, vals: l.map(x => x.v), ids: l.map(x => x.id), moy: moyenne(l.map(x => x.v)) }));
  }

  function drawSpectrum(id) {
    const rows = donneesSpectre();
    if (!rows.length) { muet(id, "de_spectre_vide", { n: MIN }); return; }
    const x = v => 24 + ((v + 2) / 4) * 272, H = 26 + rows.length * 40;
    let s = '<rect x="' + x(-0.4).toFixed(1) + '" y="8" width="' + (x(0.4) - x(-0.4)).toFixed(1) + '" height="' + (H - 18) + '" rx="6" class="de-zone"></rect>';
    rows.forEach((r, i) => {
      const y = 36 + i * 40;
      s += '<line x1="' + x(-2) + '" y1="' + y + '" x2="' + x(2) + '" y2="' + y + '" class="de-axe"></line>' +
        '<text x="' + x(-2) + '" y="' + (y - 14) + '" class="de-fort">' + echap(court(I18N.tr(r.recette), 30)) + "</text>";
      const stack = {};
      r.vals.forEach((v, j) => {
        const k = (stack[v] = (stack[v] || 0) + 1) - 1;
        // Above then below the line, without climbing onto the neighbouring row.
        const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.min(2, Math.ceil(k / 2)) * 4.5;
        s += '<circle cx="' + x(v).toFixed(1) + '" cy="' + (y + dy) + '" r="3.6" class="' +
          (v === 0 ? "de-juste" : "de-ecart") + '"' + ' data-tasse="' + echap(r.ids[j]) + '"></circle>';
      });
      s += '<path d="M' + x(r.moy).toFixed(1) + " " + (y + 4) + ' l-4 7 l8 0 z" class="de-moyenne"></path>';
    });
    s += '<text x="' + x(-2) + '" y="' + (H + 2) + '">' + echap(I18N.t("de_sous")) + "</text>" +
      '<text x="' + x(0) + '" y="' + (H + 2) + '" text-anchor="middle" class="de-fort">' + echap(I18N.t("de_equilibre")) + "</text>" +
      '<text x="' + x(2) + '" y="' + (H + 2) + '" text-anchor="end">' + echap(I18N.t("de_sur")) + "</text>";
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (H + 8));
    const leaning = rows.filter(r => Math.abs(r.moy) >= 0.4).sort((a, b) => Math.abs(b.moy) - Math.abs(a.moy))[0];
    setDrawing(id, s, leaning
      ? I18N.t(leaning.moy > 0 ? "de_spectre_sur" : "de_spectre_sous", { r: I18N.tr(leaning.recette) })
      : I18N.t("de_spectre_centre"));
  }

  // ---------- The grinder map ----------

  /* Each cup at its microns, on its machine's range (GRIND.METHODES). The
     golden zone: the three-click window where the rated cups have the best
     average, from three cups up. A pre-ground coffee has no dial and does not
     appear. coffeeId restricts the map to one coffee (coffee sheet). */
  function donneesMoulin(coffeeId) {
    return ["Brikka", "Switch"].map(m => {
      const range = GRIND.METHODES.find(x => x.id === m.toLowerCase());
      const cups = extAnalysables().filter(e => e.methode === m && e.note_sur_10 !== "" && (!coffeeId || e.cafe_id === coffeeId))
        .map(e => ({ d: GRIND.parseDial(String(e.mouture_dial || "")), n: Number(e.note_sur_10), id: e.id })).filter(t => t.d);
      let golden = null;
      cups.forEach(t => {
        const inside = cups.filter(u => u.d.crans >= t.d.crans && u.d.crans <= t.d.crans + 2);
        if (inside.length < MIN) return;
        const avg = moyenne(inside.map(u => u.n));
        if (!golden || avg > golden.moy) golden = { de: t.d.crans, a: t.d.crans + 2, moy: avg, n: inside.length };
      });
      return { m, plage: range, tasses: cups, doree: golden };
    }).filter(r => r.tasses.length);
  }

  function dessinerMoulin(id, coffeeId) {
    const rows = donneesMoulin(coffeeId);
    if (!rows.length) { muet(id, "de_moulin_vide"); return; }
    const x = um => 16 + ((um - 300) / 600) * 290;
    let s = "";
    [400, 500, 600, 700, 800].forEach(um => {
      s += '<line x1="' + x(um).toFixed(1) + '" y1="16" x2="' + x(um).toFixed(1) + '" y2="' + (rows.length * 50 + 6) + '" class="de-grille"></line>' +
        '<text x="' + x(um).toFixed(1) + '" y="' + (rows.length * 50 + 20) + '" text-anchor="middle">' + um + "</text>";
    });
    rows.forEach((r, i) => {
      const y = 34 + i * 50;
      if (r.plage) {
        s += '<rect x="' + x(r.plage.minU).toFixed(1) + '" y="' + (y - 11) + '" width="' + (x(r.plage.maxU) - x(r.plage.minU)).toFixed(1) +
          '" height="22" rx="11" class="de-plage"></rect>';
      }
      s += '<text x="' + x(300) + '" y="' + (y - 15) + '" class="de-fort">' + echap(I18N.machine(r.m)) + "</text>";
      if (r.doree) {
        const a = x(r.doree.de * GRIND.MICRONS_PAR_CRAN) - 5, b = x(r.doree.a * GRIND.MICRONS_PAR_CRAN) + 5;
        s += '<rect x="' + a.toFixed(1) + '" y="' + (y - 13) + '" width="' + (b - a).toFixed(1) + '" height="26" rx="7" class="de-doree"></rect>';
      }
      r.tasses.forEach((t, k) => {
        s += '<circle cx="' + x(t.d.microns).toFixed(1) + '" cy="' + (y + ((k % 3) - 1) * 5) + '" r="3.8" class="de-grain" style="fill-opacity:' +
          opacite(t.n) + '"' + ' data-tasse="' + echap(t.id) + '"></circle>';
      });
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (rows.length * 50 + 26));
    const d = rows.filter(r => r.doree).sort((a, b) => b.doree.moy - a.doree.moy)[0];
    setDrawing(id, s, d ? I18N.t("de_moulin_lecture", {
      m: I18N.machine(d.m), a: GRIND.dialDepuisCrans(d.doree.de), b: GRIND.dialDepuisCrans(d.doree.a),
      x: note1(d.doree.moy), n: d.doree.n,
    }) : I18N.t("de_moulin_sans_zone", { n: MIN }));
  }

  // ---------- A coffee's fingerprint (coffee sheet, v8.50) ----------

  /* A radar of the vocabulary families (DESCRIPTEURS_GROUPES): each family's
     share of the tastes checked on this coffee, against the same share over
     all your coffees. Each profile is scaled to its most checked family, to
     compare shapes and not volumes. */
  function profil(cups) {
    const n = {};
    let total = 0;
    cups.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => {
      const g = DESCRIPTEURS_GROUPES.find(x => x.tags.includes(t));
      if (!g) return;
      n[g.nom] = (n[g.nom] || 0) + 1;
      total += 1;
    }));
    const parts = DESCRIPTEURS_GROUPES.map(g => (total ? (n[g.nom] || 0) / total : 0));
    const max = Math.max(...parts, 0.0001);
    return { parts, norm: parts.map(p => p / max), total };
  }

  /* otherId (v8.56, "Comparer avec…"): the reference shape is that other coffee
     instead of all your coffees, and the sentence names it. */
  function dessinerEmpreinte(id, coffeeId, otherId) {
    const all = extAnalysables();
    const hasTags = e => String(e.descripteurs || "").trim() !== "";
    const own = all.filter(e => e.cafe_id === coffeeId && hasTags(e));
    if (own.length < MIN) { muet(id, "de_empreinte_vide", { n: MIN }); return; }
    const others = otherId ? all.filter(e => e.cafe_id === otherId && hasTags(e)) : all.filter(hasTags);
    if (otherId && others.length < MIN) { muet(id, "de_empreinte_vide_autre", { n: MIN }); return; }
    const a = profil(own), b = profil(others);
    const other = otherId ? DATA.state.cafes.find(c => c.id === otherId) : null;
    const N = DESCRIPTEURS_GROUPES.length, C = [160, 104], R = 72;
    const pt = (i, r) => { const ang = -Math.PI / 2 + (i / N) * Math.PI * 2; return [C[0] + Math.cos(ang) * r, C[1] + Math.sin(ang) * r]; };
    let s = "";
    [0.5, 1].forEach(k => {
      s += '<polygon points="' + DESCRIPTEURS_GROUPES.map((_, i) => pt(i, R * k).map(v => v.toFixed(1)).join(",")).join(" ") + '" class="de-toile"></polygon>';
    });
    DESCRIPTEURS_GROUPES.forEach((g, i) => {
      const [x, y] = pt(i, R + 13);
      s += '<line x1="' + C[0] + '" y1="' + C[1] + '" x2="' + pt(i, R)[0].toFixed(1) + '" y2="' + pt(i, R)[1].toFixed(1) + '" class="de-rayon"></line>' +
        '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="' + (x < C[0] - 8 ? "end" : x > C[0] + 8 ? "start" : "middle") + '">' +
        echap(I18N.groupe(g.nom).split(" ")[0]) + "</text>";
    });
    const poly = (v, cls) => '<polygon points="' + v.map((k, i) => pt(i, R * k).map(n => n.toFixed(1)).join(",")).join(" ") + '" class="' + cls + '"></polygon>';
    s += poly(b.norm, "de-empreinte-tous") + poly(a.norm, "de-empreinte-cafe");
    // The reading: the family where this coffee exceeds your others most, and the one where it lacks.
    const gaps = a.parts.map((p, i) => ({ g: DESCRIPTEURS_GROUPES[i].nom, d: p - b.parts[i] })).sort((x, y) => y.d - x.d);
    const most = gaps[0], least = gaps[gaps.length - 1];
    const v = { p: I18N.groupe(most.g).toLowerCase(), m: I18N.groupe(least.g).toLowerCase(), c: other ? other.nom : "" };
    setDrawing(id, s, most.d >= 0.05 && least.d <= -0.05
      ? I18N.t(other ? "de_empreinte_lecture_autre" : "de_empreinte_lecture", v)
      : I18N.t(other ? "de_empreinte_proche_autre" : "de_empreinte_proche", v));
  }

  // ---------- Your trajectory (coffee sheet, v8.50) ----------

  /* A coffee's cups in the dial × heat plane (degrees on the Switch, heat on the
     Brikka), linked in the order you made them, on the recipe made most often
     with this coffee: from one recipe to another the dial changes direction,
     and a Sherrycipe at 2.0.2 crushed the scale for everything else. The tint
     is the rating, the last cup circled. */
  function dessinerTrajectoire(id, coffeeId) {
    const withDial = extAnalysables().filter(e => e.cafe_id === coffeeId && e.note_sur_10 !== "" && GRIND.parseDial(String(e.mouture_dial || "")));
    const recipeCounts = {};
    withDial.forEach(e => { if (e.recette) recipeCounts[e.recette] = (recipeCounts[e.recette] || 0) + 1; });
    const recipe = Object.keys(recipeCounts).sort((a, b) => recipeCounts[b] - recipeCounts[a])[0];
    const machine = (withDial.find(e => e.recette === recipe) || {}).methode;
    const heat = e => Number(machine === "Switch" ? e.temperature_c : e.puissance_feu);
    const cups = withDial.filter(e => e.recette === recipe)
      .filter(e => Number.isFinite(heat(e)) && heat(e) > 0)
      .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)))
      .map(e => ({ c: GRIND.parseDial(String(e.mouture_dial)).crans, y: heat(e), n: Number(e.note_sur_10), dial: e.mouture_dial, id: e.id }));
    if (cups.length < MIN) { muet(id, "de_trajectoire_vide", { n: MIN }); return; }
    const cs = cups.map(t => t.c), ys = cups.map(t => t.y);
    const c0 = Math.min(...cs) - 2, c1 = Math.max(...cs) + 2, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const x = c => 36 + ((c - c0) / (c1 - c0)) * 270, y = v => 150 - ((v - y0) / (y1 - y0)) * 130;
    let s = "";
    const stepC = Math.max(1, Math.round((c1 - c0) / 4));
    for (let c = Math.ceil(c0); c <= c1; c += stepC) {
      s += '<line x1="' + x(c).toFixed(1) + '" y1="16" x2="' + x(c).toFixed(1) + '" y2="152" class="de-grille"></line>' +
        '<text x="' + x(c).toFixed(1) + '" y="166" text-anchor="middle">' + GRIND.dialDepuisCrans(c) + "</text>";
    }
    [y0 + 1, (y0 + y1) / 2, y1 - 1].forEach(v => {
      s += '<text x="30" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + fmtDecimal(v, 0) + (machine === "Switch" ? "°" : "") + "</text>";
    });
    s += '<path d="M' + cups.map(t => x(t.c).toFixed(1) + " " + y(t.y).toFixed(1)).join(" L") + '" class="de-chemin"></path>';
    cups.forEach((t, i) => {
      const isLast = i === cups.length - 1;
      s += '<circle cx="' + x(t.c).toFixed(1) + '" cy="' + y(t.y).toFixed(1) + '" r="' + (isLast ? 6.5 : 4.2) + '" class="de-grain' + (isLast ? " de-derniere" : "") +
        '" style="fill-opacity:' + opacite(t.n) + '"' + ' data-tasse="' + echap(t.id) + '"></circle>';
    });
    const best = cups.slice().sort((a, b) => b.n - a.n)[0];
    const unit = v => machine === "Switch" ? I18N.t("de_degres", { v: fmtDecimal(v, 0) }) : I18N.t("j_feu", { f: v });
    setDrawing(id, s, I18N.t("de_trajectoire_lecture", {
      r: I18N.tr(recipe || ""), n: cups.length, d: best.dial, c: unit(best.y), x: note1(best.n),
    }));
  }

  // ---------- The weekly recap (v8.51) ----------

  /* LAST week, Monday to Sunday, at the top of the dashboard during the
     following week, until it is closed. Only FACTS, and each one is only
     written if it is true: the gap with the week before (0.4 points and
     three rated cups on each side, the insights thresholds), the coffee of
     the week if it makes up half, the bags opened or finished, the best
     cup. Fewer than two cups in the week: no recap. */
  const RECAP_KEY = "recap-ferme";
  function mondayOf(d) {
    const l = new Date(d); l.setHours(0, 0, 0, 0);
    l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
    return l;
  }
  const inWeek = (e, start) => {
    const t = new Date(e.date_heure), end = new Date(start); end.setDate(end.getDate() + 7);
    return t >= start && t < end;
  };

  function donneesRecap(now) {
    const start = mondayOf(now || new Date()); start.setDate(start.getDate() - 7);
    const before = new Date(start); before.setDate(before.getDate() - 7);
    const cups = DATA.state.extractions.filter(e => inWeek(e, start));
    if (cups.length < 2) return null;
    const rated = extAnalysables().filter(e => e.note_sur_10 !== "" && inWeek(e, start));
    const ratedBefore = extAnalysables().filter(e => e.note_sur_10 !== "" && inWeek(e, before));
    const avg = rated.length ? moyenne(rated.map(e => Number(e.note_sur_10))) : null;
    const avgBefore = ratedBefore.length ? moyenne(ratedBefore.map(e => Number(e.note_sur_10))) : null;
    const days = Array.from({ length: 7 }, (_, i) => {
      const j = new Date(start); j.setDate(j.getDate() + i);
      const key = UI.cleLocale(j);
      const dayNotes = rated.filter(e => String(e.date_heure).slice(0, 10) === key).map(e => Number(e.note_sur_10));
      return { date: j, cle: key, n: cups.filter(e => String(e.date_heure).slice(0, 10) === key).length,
        moy: dayNotes.length ? moyenne(dayNotes) : null };
    });
    const facts = [];
    if (avg !== null && avgBefore !== null && rated.length >= MIN && ratedBefore.length >= MIN && Math.abs(avg - avgBefore) >= 0.4) {
      facts.push(I18N.t(avg > avgBefore ? "rc_mieux" : "rc_moins", { x: note1(Math.abs(avg - avgBefore)), s: Math.abs(avg - avgBefore) >= 2 ? "s" : "" }));
    }
    const byCoffee = {};
    cups.forEach(e => { byCoffee[e.cafe_id] = (byCoffee[e.cafe_id] || 0) + 1; });
    const [coffeeId, coffeeCount] = Object.entries(byCoffee).sort((a, b) => b[1] - a[1])[0];
    const coffee = DATA.state.cafes.find(c => c.id === coffeeId);
    if (coffee && coffeeCount * 2 >= cups.length && Object.keys(byCoffee).length > 1) {
      facts.push(I18N.t("rc_cafe", { c: coffee.nom, n: coffeeCount, t: cups.length }));
    }
    const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 7);
    DATA.state.achats.filter(a => a.date_ouverture && new Date(a.date_ouverture + "T12:00") >= start &&
      new Date(a.date_ouverture + "T12:00") < weekEnd).forEach(a => {
      const c = DATA.state.cafes.find(x => x.id === a.cafe_id);
      if (c) facts.push(I18N.t("rc_ouvert", { c: c.nom, j: new Date(a.date_ouverture + "T12:00").toLocaleDateString(I18N.locale(), { weekday: "long" }) }));
    });
    const best = rated.slice().sort((a, b) => Number(b.note_sur_10) - Number(a.note_sur_10))[0];
    return { debut: start, tasses: cups.length, notees: rated.length, moy: avg, moyAvant: avgBefore, jours: days, faits: facts, meilleure: best };
  }

  function renderRecap() {
    const card = $("#carte-recap");
    if (!card) return;
    const r = donneesRecap();
    let closed = null;
    try { closed = localStorage.getItem(RECAP_KEY); } catch (e) { /* without storage, show it */ }
    if (!r || closed === UI.cleLocale(r.debut)) { card.hidden = true; card.innerHTML = ""; return; }
    const end = new Date(r.debut); end.setDate(end.getDate() + 6);
    const formatDay = d => d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" });
    const max = Math.max(1, ...r.jours.map(j => j.n));
    /* A8 (v8.87): THE HEIGHT COUNTS THE CUPS, THE TINT SHOWS THEIR RATING. From 4
       and below (pale) to 9 and above (full); a day without a rating stays at half tint.
       A day with cups can be tapped and opens that day's history. */
    const tint = avg => avg === null ? 0.5 : Math.max(0.28, Math.min(1, (avg - 4) / 5));
    const bars = r.jours.map(j => {
      const name = j.date.toLocaleDateString(I18N.locale(), { weekday: "long" });
      const title = j.n ? I18N.t(j.moy !== null ? "rc_jour_note" : "rc_jour", { j: name, n: j.n, s: j.n > 1 ? "s" : "", m: j.moy !== null ? note1(j.moy) : "" }) : name + " : 0";
      const bar = '<i style="--h:' + (j.n ? Math.max(0.12, j.n / max) : 0.06).toFixed(2) + ";--o:" + tint(j.moy).toFixed(2) + '"></i><small>' +
        echap(j.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" })) + "</small>";
      return j.n
        ? '<button type="button" class="rc-jour" data-jour="' + j.cle + '" title="' + echap(title) + '" aria-label="' + echap(title) + '">' + bar + "</button>"
        : '<span class="rc-jour vide" title="' + echap(title) + '">' + bar + "</span>";
    }).join("");
    const m = r.meilleure;
    const bestCoffee = m ? DATA.state.cafes.find(c => c.id === m.cafe_id) : null;
    card.hidden = false;
    card.innerHTML =
      '<div class="rc-tete"><h3>' + echap(I18N.t("rc_titre", {
        // "du 14 au 20 septembre": the month is written only once if it is the same.
        a: r.debut.getMonth() === end.getMonth() ? String(r.debut.getDate()) : formatDay(r.debut), b: formatDay(end) })) + "</h3>" +
      // The facts on the title line (v8.67): in the page header, one line less.
      (r.faits.length ? '<ul class="rc-faits">' + r.faits.map(f => "<li>" + echap(f) + "</li>").join("") + "</ul>" : "") +
      '<button type="button" class="dessin-lien" id="recap-fermer">' + echap(I18N.t("rc_fermer")) + "</button></div>" +
      '<div class="rc-corps">' +
      '<div class="rc-chiffre"><b>' + r.tasses + "</b><span>" + echap(I18N.t("rc_tasses")) + "</span></div>" +
      (r.moy !== null ? '<div class="rc-chiffre"><b>' + note1(r.moy) + "</b><span>" + echap(I18N.t("rc_moyenne", { n: r.notees })) + "</span></div>" : "") +
      /* The best cup states its coffee AND its recipe (v8.60): "Là Việt Balanced,
         mercredi" alone did not let you remake it, since the same coffee goes
         through several recipes. The whole thing opens the cup in a bubble. */
      (m ? '<div class="rc-chiffre rc-meilleure" data-tasse="' + echap(m.id) + '"><b>' + note1(Number(m.note_sur_10)) + "</b><span>" +
        echap(I18N.t("rc_meilleure", { j: new Date(m.date_heure).toLocaleDateString(I18N.locale(), { weekday: "long" }) })) +
        "</span><em>" + echap(bestCoffee ? bestCoffee.nom : I18N.t("rc_sans_cafe")) + "</em><em>" +
        echap(m.recette ? I18N.tr(m.recette) : I18N.t("rc_sans_recette")) + "</em></div>" : "") +
      '<div class="rc-semaine" aria-label="' + echap(I18N.t("rc_barres")) + '">' + bars + "</div></div>";
    card.querySelectorAll("[data-jour]").forEach(b => b.addEventListener("click", () =>
      UI.ouvrirHistoriqueSur({ "h-du": b.dataset.jour, "h-au": b.dataset.jour })));
    $("#recap-fermer").addEventListener("click", () => {
      try { localStorage.setItem(RECAP_KEY, UI.cleLocale(r.debut)); } catch (e) { /* never mind, it will come back */ }
      card.hidden = true;
    });
  }

  // ---------- The recipe podium (v8.53) ----------

  /* The three recipes with the best average, from three rated cups each: a
     recipe tried once does not get on it. The highest step is in the middle,
     like a real podium. Tapping a step opens the recipe in the Guide. */
  function donneesPodium() {
    const ratingsByRecipe = {};
    extAnalysables().filter(e => e.note_sur_10 !== "" && e.recette)
      .forEach(e => (ratingsByRecipe[e.recette] = ratingsByRecipe[e.recette] || []).push(Number(e.note_sur_10)));
    return Object.entries(ratingsByRecipe).filter(([, n]) => n.length >= MIN)
      .map(([name, n]) => ({ nom: name, moy: moyenne(n), n: n.length, r: UI.trouverRecette(name) }))
      .sort((a, b) => b.moy - a.moy || b.n - a.n).slice(0, 3);
  }

  function drawPodium(id) {
    const p = donneesPodium();
    if (!p.length) { muet(id, "de_podium_vide", { n: MIN }); return; }
    // Order of the steps: second, first, third.
    const places = [p[1], p[0], p[2]];
    const heights = [70, 96, 52];
    let s = '<line x1="14" y1="130" x2="306" y2="130" class="de-planche"></line>';
    places.forEach((m, i) => {
      if (!m) return;
      const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
      const x = 22 + i * 96, w = 84, h = heights[i], top = 130 - h;
      const link = m.r ? ' data-guide-recette="' + echap(m.r.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_podium_aria", { r: I18N.tr(m.nom), m: note1(m.moy) })) + '"' : "";
      s += '<g class="de-marche de-rang-' + rank + '"' + link + "><title>" + echap(I18N.tr(m.nom)) + "</title>" +
        '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="6" class="de-marche-bloc"></rect>' +
        '<text x="' + (x + w / 2) + '" y="' + (top + 26) + '" text-anchor="middle" class="de-marche-note">' + note1(m.moy) + "</text>" +
        '<text x="' + (x + w / 2) + '" y="' + (top - 7) + '" text-anchor="middle" class="de-fort">' + echap(court(I18N.tr(m.nom), 17)) + "</text>" +
        '<text x="' + (x + w / 2) + '" y="144" text-anchor="middle">' + echap(I18N.t("de_podium_n", { n: m.n })) + "</text></g>";
    });
    setDrawing(id, s, I18N.t("de_podium_lecture", { r: I18N.tr(p[0].nom), m: note1(p[0].moy), n: p[0].n }));
  }

  // ---------- Your progress (v8.54) ----------

  /* The moving average over five rated cups (REGLAGES.moyenneGlissante), over
     the whole history, with its MILESTONES: each bag opened, and each recipe
     made for the first time. You can see what moved the curve. The three most
     recent milestones carry their name, the others stay as points. */
  function drawProgress(id) {
    const rated = extAnalysables().filter(e => e.note_sur_10 !== "");
    const series = REGLAGES.moyenneGlissante(rated, 5).filter(p => p.valeur !== null);
    if (series.length < 2) { muet(id, "de_progression_vide"); return; }
    const t = d => new Date(d).getTime();
    const t0 = t(series[0].date), t1 = Math.max(t(series[series.length - 1].date), t0 + 86400000);
    const vals = series.map(p => p.valeur);
    const v0 = Math.floor(Math.min(...vals)) , v1 = Math.ceil(Math.max(...vals));
    const low = v1 - v0 < 2 ? v1 - 2 : v0;
    const x = d => 26 + ((t(d) - t0) / (t1 - t0)) * 284, y = v => 112 - ((v - low) / (v1 - low)) * 96;
    let s = "";
    for (let v = low; v <= v1; v += 1) {
      s += '<line x1="26" y1="' + y(v).toFixed(1) + '" x2="310" y2="' + y(v).toFixed(1) + '" class="de-grille"></line>' +
        '<text x="20" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + v + "</text>";
    }
    const d = "M" + series.map(p => x(p.date).toFixed(1) + " " + y(p.valeur).toFixed(1)).join(" L");
    s += '<path d="' + d + " L" + x(series[series.length - 1].date).toFixed(1) + " 112 L26 112 Z" + '" class="de-aire"></path>' +
      '<path d="' + d + '" class="de-courbe"></path>';
    // The milestones, within the curve's period.
    const milestones = [];
    DATA.state.achats.forEach(a => {
      const when = a.date_ouverture || "";
      const c = DATA.state.cafes.find(x => x.id === a.cafe_id);
      if (when && c) milestones.push({ date: when + "T12:00", lib: I18N.t("de_jalon_sachet", { c: court(c.nom, 16) }) });
    });
    const seenRecipes = new Set();
    rated.slice().sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure))).forEach(e => {
      if (!e.recette || seenRecipes.has(e.recette)) return;
      seenRecipes.add(e.recette);
      milestones.push({ date: e.date_heure, lib: I18N.t("de_jalon_recette", { r: court(I18N.tr(e.recette), 16) }) });
    });
    const inRange = milestones.filter(j => t(j.date) > t0 && t(j.date) <= t1).sort((a, b) => t(a.date) - t(b.date));
    const valueAt = d => { let v = series[0].valeur; series.forEach(p => { if (t(p.date) <= t(d)) v = p.valeur; }); return v; };
    const named = inRange.slice(-3);
    inRange.forEach(j => {
      const jx = x(j.date), jy = y(valueAt(j.date));
      s += '<line x1="' + jx.toFixed(1) + '" y1="' + jy.toFixed(1) + '" x2="' + jx.toFixed(1) + '" y2="118" class="de-jalon-trait"></line>' +
        '<circle cx="' + jx.toFixed(1) + '" cy="' + jy.toFixed(1) + '" r="3.6" class="de-jalon"><title>' + echap(j.lib) + "</title></circle>";
    });
    named.forEach((j, k) => {
      s += '<text x="' + x(j.date).toFixed(1) + '" y="' + (130 + k * 10) + '" text-anchor="' + (x(j.date) > 250 ? "end" : "middle") + '">' + echap(j.lib) + "</text>";
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (132 + named.length * 10));
    const start = series[0], end = series[series.length - 1];
    const formatDay = s2 => new Date(s2).toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" });
    setDrawing(id, s, I18N.t(end.valeur >= start.valeur ? "de_progression_monte" : "de_progression_baisse", {
      a: note1(start.valeur), b: note1(end.valeur), d: formatDay(start.date),
    }));
  }

  // ---------- The bag timeline (v8.55) ----------

  /* One ribbon per bag, from its opening (or its purchase) to its end: the day
     of this coffee's last cup before the next bag of the same coffee, or
     today for an ongoing bag that is not empty. The tint is the average rating
     of its cups. The last three months, eight bags at most. A ribbon opens
     its coffee's sheet.

     ONGOING = A RECENT CUP (v8.66). "Not empty" was not enough: the stock is
     computed from the doses entered, and a bag finished without a cup logged
     down to the last gram, given away, thrown out or put away, stayed
     "ongoing" and stretched all the way to today. Chris had been drinking
     only Là Việt Balanced for weeks and the timeline showed three open
     coffees. A bag is ongoing if it has coffee left AND it was used in the
     last DORMANT_BAG_DAYS days (or has just been opened); otherwise its ribbon
     stops at its last cup. An old bag without any cup is not drawn. */
  const DORMANT_BAG_DAYS = 14;
  function donneesFrise(now) {
    const today = now ? new Date(now) : new Date();
    const since = new Date(today); since.setDate(since.getDate() - 90);
    const dayOf = s => new Date(String(s).slice(0, 10) + "T12:00");
    // Cups grouped by coffee once, instead of a filter over the whole history per bag (v8.75).
    const byCoffee = {};
    DATA.state.extractions.forEach(e => { (byCoffee[e.cafe_id] = byCoffee[e.cafe_id] || []).push(e); });
    return DATA.state.achats.map(a => {
      const start = dayOf(a.date_ouverture || a.date_achat);
      if (isNaN(start)) return null;
      const laterBags = DATA.state.achats.filter(b => b.cafe_id === a.cafe_id && b !== a &&
        dayOf(b.date_ouverture || b.date_achat) > start).map(b => dayOf(b.date_ouverture || b.date_achat)).sort((x, y) => x - y);
      const limit = laterBags[0] || null;
      const cups = (byCoffee[a.cafe_id] || []).filter(e => new Date(e.date_heure) >= start &&
        (!limit || new Date(e.date_heure) < limit));
      const last = cups.reduce((m, e) => (new Date(e.date_heure) > m ? new Date(e.date_heure) : m), start);
      const stock = limit ? null : DATA.stockSachet(a.cafe_id, replis.dose);
      const recent = (today - last) / 86400000 <= DORMANT_BAG_DAYS;
      const ongoing = !limit && !!stock && stock.restant > 0 && recent;
      if (!cups.length && !ongoing) return null;
      const end = ongoing ? today : last;
      if (end < since) return null;
      const notes = extAnalysables().filter(e => cups.some(t => t.id === e.id) && e.note_sur_10 !== "").map(e => Number(e.note_sur_10));
      const coffee = DATA.state.cafes.find(c => c.id === a.cafe_id);
      return coffee ? { cafe: coffee, debut: start, fin: end, enCours: ongoing, n: cups.length, moy: notes.length ? moyenne(notes) : null } : null;
    }).filter(Boolean).sort((a, b) => a.debut - b.debut).slice(-8);
  }

  function drawTimeline(id) {
    const bags = donneesFrise();
    if (!bags.length) { muet(id, "de_frise_vide"); return; }
    const today = new Date();
    const t0 = Math.min(...bags.map(s => s.debut.getTime())), t1 = Math.max(today.getTime(), ...bags.map(s => s.fin.getTime()));
    const x = d => 10 + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * 300;
    const H = 16 + bags.length * 18;
    let s = "";
    // One marker per start of month.
    const m = new Date(t0); m.setDate(1); m.setMonth(m.getMonth() + 1); m.setHours(12);
    for (; m.getTime() < t1; m.setMonth(m.getMonth() + 1)) {
      s += '<line x1="' + x(m).toFixed(1) + '" y1="6" x2="' + x(m).toFixed(1) + '" y2="' + H + '" class="de-grille"></line>' +
        '<text x="' + x(m).toFixed(1) + '" y="' + (H + 12) + '" text-anchor="middle">' + echap(m.toLocaleDateString(I18N.locale(), { month: "short" })) + "</text>";
    }
    bags.forEach((b, i) => {
      const y = 10 + i * 18, a = x(b.debut), w = Math.max(10, x(b.fin) - a);
      const label = court(b.cafe.nom, 18) + (b.moy !== null ? " · " + note1(b.moy) : "");
      s += '<g class="de-ruban' + (b.enCours ? " en-cours" : "") + '" data-fiche="' + echap(b.cafe.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_ruban_aria", { c: b.cafe.nom, n: b.n })) + '"><title>' + echap(b.cafe.nom) + "</title>" +
        '<rect x="' + a.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="13" rx="6.5" class="de-ruban-bloc" style="fill-opacity:' +
        (b.moy === null ? 0.18 : opacite(b.moy)) + '"></rect>' +
        '<text x="' + Math.min(a + 6, 250).toFixed(1) + '" y="' + (y + 10) + '" class="de-ruban-texte">' + echap(label) + "</text></g>";
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (H + 18));
    const notes = bags.filter(b => b.moy !== null && b.n >= MIN).sort((a, b) => b.moy - a.moy);
    setDrawing(id, s, notes.length >= 2
      ? I18N.t("de_frise_lecture", { a: notes[0].cafe.nom, x: note1(notes[0].moy), b: notes[notes.length - 1].cafe.nom, y: note1(notes[notes.length - 1].moy) })
      : I18N.t("de_frise_courte"));
  }

  // ---------- Every point is a cup (v8.55) ----------

  /* Any drawing point carrying data-tasse is a real cup: tapping it opens
     its card in a bubble (date, coffee, recipe, settings, tastes, rating), with
     "Modifier" and "Refaire". ONE bubble for all the drawings, on the dashboard
     as on the coffee sheet. It moves into the open dialog if there is one:
     outside of it, it would sit under the sheet, which occupies the top layer. */
  let bubbleId = null;
  function closeBubble() {
    const b = $("#bulle-tasse");
    if (b) b.hidden = true;
    bubbleId = null;
  }
  function showBubble(id, ev) {
    const e = UI.extAvecCalculs().find(x => x.id === id);
    const b = $("#bulle-tasse");
    if (!e || !b) return;
    const host = ev.target.closest("dialog") || document.body;
    if (b.parentNode !== host) host.appendChild(b);
    const coffee = DATA.state.cafes.find(c => c.id === e.cafe_id);
    const d = new Date(e.date_heure);
    const when = isNaN(d) ? "" : d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) + ", " +
      d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
    // The bubble is named after its cup (v8.76), no longer a generic "Une tasse".
    b.setAttribute("aria-label", I18N.t("bulle_aria", { q: when || e.date_heure }) + (coffee ? ", " + coffee.nom : ""));
    const settings = [e.dose_g ? e.dose_g + " g" : "", e.eau_g ? e.eau_g + " g" : "", e.mouture_dial,
      e.methode === "Switch" && e.temperature_c !== "" ? e.temperature_c + " °C" : "",
      e.methode === "Brikka" && e.puissance_feu !== "" ? I18N.t("j_feu", { f: e.puissance_feu }) : ""].filter(Boolean).join(" · ");
    const tastes = String(e.descripteurs || "").split("|").filter(Boolean).slice(0, 4).map(t => echap(I18N.tag(t))).join(", ");
    b.innerHTML =
      '<div class="bt-tete"><span class="bt-quand">' + echap(when) + "</span>" +
      '<button type="button" class="bt-fermer" data-bulle="fermer" aria-label="' + echap(I18N.t("bt_fermer")) + '">×</button></div>' +
      '<div class="bt-corps"><div><b class="bt-cafe">' + echap(coffee ? coffee.nom : "") + "</b>" +
      '<span><i class="pastille-methode ' + String(e.methode || "").toLowerCase() + '"></i>' + echap(I18N.tr(e.recette || "")) + "</span>" +
      "<span>" + echap(settings) + "</span>" + (tastes ? '<span class="bt-gouts">' + tastes + "</span>" : "") + "</div>" +
      '<b class="bt-note">' + (e.note_sur_10 === "" ? "·" : note1(Number(e.note_sur_10))) + "</b></div>" +
      '<div class="bt-actions"><button type="button" class="btn btn-petit" data-bulle="modifier">' + echap(I18N.t("btn_modifier")) + "</button>" +
      '<button type="button" class="btn btn-petit btn-primaire" data-bulle="refaire">' + echap(I18N.t("bt_refaire")) + "</button></div>";
    b.hidden = false;
    bubbleId = id;
    // As close as possible to the tap, without leaving the screen.
    const l = b.offsetWidth || 260, h = b.offsetHeight || 150;
    b.style.left = Math.round(Math.max(8, Math.min(ev.clientX + 12, window.innerWidth - l - 8))) + "px";
    b.style.top = Math.round(Math.max(8, Math.min(ev.clientY + 12, window.innerHeight - h - 8))) + "px";
  }
  function onBubbleClick(ev) {
    const a = ev.target.closest("[data-bulle]");
    if (!a) return;
    const ext = DATA.state.extractions.find(x => x.id === bubbleId);
    const action = a.dataset.bulle;
    closeBubble();
    if (!ext || action === "fermer") return;
    const sheet = $("#modale-fiche");
    if (sheet && sheet.open) sheet.close();
    if (action === "modifier") UI.chargerExtractionDansSaisie(ext, false);
    else UI.refaireTasse(ext);
  }
  // Tapping a point, anywhere: caught before the drawings' shortcuts.
  function onPointClick(ev) {
    const p = ev.target.closest && ev.target.closest("[data-tasse]");
    if (!p) return;
    ev.stopPropagation();
    showBubble(p.dataset.tasse, ev);
  }

  /* THE COFFEES OF THE 30 DAYS (v8.61). Each block of the "Note et tasses" chart
     has been a cup since v8.58; it now takes the color of ITS coffee. The
     five most drunk coffees of the month each have their tint (--cafe-1 to 5,
     in order of cup count), the rest and the cups without a coffee share the
     neutral grey. The legend under the chart names them, with their count, and
     each name opens its coffee's sheet. Returns, day by day and in cup order,
     the color rank of each one (-1 = neutral). */
  const COFFEE_TINTS = 5;
  function rendreCafes30j(exts) {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = UI.cleLocale(d);
      days.push(exts.filter(e => String(e.date_heure).slice(0, 10) === key)
        .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure))));
    }
    const counts = new Map();
    days.flat().forEach(e => { const c = DATA.cafeDe(e); if (c) counts.set(c.id, (counts.get(c.id) || 0) + 1); });
    const classes = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const rank = new Map(classes.slice(0, COFFEE_TINTS).map(([id], i) => [id, i]));
    const others = days.flat().length - classes.slice(0, COFFEE_TINTS).reduce((s, [, n]) => s + n, 0);
    const zone = $("#legende-30j");
    if (zone) {
      zone.hidden = !classes.length;
      zone.innerHTML = classes.slice(0, COFFEE_TINTS).map(([id, n], i) => {
        const c = DATA.state.cafes.find(x => x.id === id) || {};
        return '<button type="button" class="lc-cafe" data-fiche="' + echap(id) + '" title="' + echap(I18N.t("lc_fiche")) + '">' +
          '<i style="background:var(--cafe-' + (i + 1) + ')"></i>' + echap(c.nom || "") + "<small>" + n + "</small></button>";
      }).join("") + (others > 0
        ? '<span class="lc-cafe lc-autres"><i></i>' + echap(I18N.t("lc_autres")) + "<small>" + others + "</small></span>" : "");
    }
    return days.map(j => j.map(e => { const c = DATA.cafeDe(e); return c && rank.has(c.id) ? rank.get(c.id) : -1; }));
  }

  // ---------- The dashboard ----------

  /* YOUR DRAWINGS, YOUR WAY (v8.57). The order and the hidden ones live in the
     settings row (replis.dessins, "etagere,!horloge,…"), so they follow from
     one device to another. A new drawing, absent from the saved choice, shows
     up visible at the end of the list. A hidden drawing is not computed. */
  const DRAWINGS = {
    etagere: () => drawShelf("dessin-etagere"),
    frise: () => drawTimeline("dessin-frise"),
    podium: () => drawPodium("dessin-podium"),
    progression: () => drawProgress("dessin-progression"),
    horloge: () => drawClock("dessin-horloge"),
    spectre: () => drawSpectrum("dessin-spectre"),
    moulin: () => dessinerMoulin("dessin-moulin"),
  };
  function ordreDessins() {
    const parsed = String(replis.dessins || "").split(",").filter(Boolean)
      .map(x => ({ cle: x.replace(/^!/, ""), visible: !x.startsWith("!") })).filter(x => DRAWINGS[x.cle]);
    const seenKeys = new Set(parsed.map(x => x.cle));
    return parsed.concat(Object.keys(DRAWINGS).filter(k => !seenKeys.has(k)).map(key => ({ cle: key, visible: true })));
  }
  function applyOrder(order) {
    const grid = $(".dessins-grille");
    if (!grid) return;
    order.forEach(o => {
      const el = grid.querySelector('[data-dessin="' + o.cle + '"]');
      if (!el) return;
      el.hidden = !o.visible;
      grid.appendChild(el);
    });
    const noneMsg = $("#dessins-aucun");
    if (noneMsg) noneMsg.hidden = order.some(o => o.visible);
  }
  function rendreDessins() {
    renderRecap();
    if (!$("#carte-dessins")) return;
    const order = ordreDessins();
    applyOrder(order);
    order.filter(o => o.visible).forEach(o => DRAWINGS[o.cle]());
    if (!$("#dessins-panneau").hidden) renderPanel();
  }

  function renderPanel() {
    const order = ordreDessins();
    const name = key => { const t = document.querySelector('[data-dessin="' + key + '"] h4'); return t ? t.textContent : key; };
    $("#dessins-panneau").innerHTML = '<p class="dp-aide">' + echap(I18N.t("dp_aide")) + "</p><ol class=\"dp-liste\">" +
      order.map((o, i) => '<li><label><input type="checkbox" data-dp-voir="' + o.cle + '"' + (o.visible ? " checked" : "") + "> " +
        echap(name(o.cle)) + '</label><span class="dp-fleches">' +
        '<button type="button" class="btn-ligne" data-dp-monter="' + o.cle + '"' + (i === 0 ? " disabled" : "") +
        ' aria-label="' + echap(I18N.t("dp_monter", { d: name(o.cle) })) + '">↑</button>' +
        '<button type="button" class="btn-ligne" data-dp-descendre="' + o.cle + '"' + (i === order.length - 1 ? " disabled" : "") +
        ' aria-label="' + echap(I18N.t("dp_descendre", { d: name(o.cle) })) + '">↓</button></span></li>').join("") +
      '</ol><div class="dp-pied"><button type="button" class="btn btn-petit" data-dp-origine>' + echap(I18N.t("dp_origine")) + "</button>" +
      '<button type="button" class="btn btn-petit btn-primaire" data-dp-fini>' + echap(I18N.t("dp_fini")) + "</button></div>";
  }
  async function saveOrder(order) {
    replis.dessins = order.map(o => (o.visible ? "" : "!") + o.cle).join(",");
    rendreDessins();
    await UI.ecrireReplis();
  }
  function togglePanel(show) {
    const p = $("#dessins-panneau");
    p.hidden = !show;
    $("#dessins-arranger").setAttribute("aria-expanded", String(show));
    if (show) renderPanel();
  }
  function wirePanel() {
    $("#dessins-arranger").addEventListener("click", ev => { ev.stopPropagation(); togglePanel($("#dessins-panneau").hidden); });
    const p = $("#dessins-panneau");
    p.addEventListener("click", ev => {
      ev.stopPropagation();
      const b = ev.target.closest("button");
      if (!b) return;
      const order = ordreDessins();
      const i = order.findIndex(o => o.cle === (b.dataset.dpMonter || b.dataset.dpDescendre));
      if (b.dataset.dpMonter && i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; saveOrder(order); }
      else if (b.dataset.dpDescendre && i >= 0 && i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; saveOrder(order); }
      else if (b.hasAttribute("data-dp-origine")) { replis.dessins = ""; rendreDessins(); UI.ecrireReplis(); }
      else if (b.hasAttribute("data-dp-fini")) togglePanel(false);
    });
    p.addEventListener("change", ev => {
      const c = ev.target.closest("[data-dp-voir]");
      if (!c) return;
      const order = ordreDessins().map(o => (o.cle === c.dataset.dpVoir ? { ...o, visible: c.checked } : o));
      saveOrder(order);
    });
  }

  /* The shortcuts. A drawing sums up a page: tapping it leads there. A jar, for
     its part, carries data-fiche and opens its coffee's sheet (delegated to ui-fiche.js). */
  const SHORTCUTS = {
    cafes: () => UI.ouvrirModaleCafes(),
    historique: () => activerEcran("historique"),
    guide: () => { activerEcran("guide"); UI.montrerGuide("ref-recettes"); },
    diagnostics: () => {
      const tab = $("#onglet-diagnostics");
      if (tab) { tab.click(); tab.scrollIntoView({ behavior: "smooth", block: "start" }); }
    },
    moulin: () => {
      activerEcran("guide");
      UI.montrerGuide("ref-moulin");
    },
  };

  function cablerDessins() {
    const card = $("#carte-dessins");
    if (!card) return;
    card.addEventListener("click", ev => {
      if (ev.target.closest("[data-fiche]")) return;
      // A podium step opens ITS recipe in the Guide.
      const podiumStep = ev.target.closest("[data-guide-recette]");
      if (podiumStep) { activerEcran("guide"); UI.montrerRecette(podiumStep.dataset.guideRecette); return; }
      const zone = ev.target.closest("[data-raccourci]");
      if (zone && SHORTCUTS[zone.dataset.raccourci]) SHORTCUTS[zone.dataset.raccourci]();
    });
    // Jars can also be reached with the keyboard.
    card.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const b = ev.target.closest("[data-fiche]");
      if (b) { ev.preventDefault(); UI.ouvrirFiche(b.dataset.fiche); return; }
      const m = ev.target.closest("[data-guide-recette]");
      if (m) { ev.preventDefault(); activerEcran("guide"); UI.montrerRecette(m.dataset.guideRecette); }
    });
    // No subscription here (v8.75): rendreEcranCourant already redraws the drawings with the dashboard.
    wirePanel();

    // The drawings' points, on the dashboard and in the coffee sheet.
    card.addEventListener("click", onPointClick, true);
    const sheet = $("#fiche-contenu");
    if (sheet) sheet.addEventListener("click", onPointClick, true);
    // And the best cup of the weekly recap.
    const recap = $("#carte-recap");
    if (recap) recap.addEventListener("click", onPointClick, true);
    const bubble = $("#bulle-tasse");
    if (bubble) bubble.addEventListener("click", onBubbleClick);
    document.addEventListener("click", ev => {
      if (bubbleId && !ev.target.closest("#bulle-tasse") && !ev.target.closest("[data-tasse]")) closeBubble();
    });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeBubble(); });
    window.addEventListener("scroll", closeBubble, { passive: true });
  }

  Object.assign(UI, {
    cablerDessins, ordreDessins, donneesFrise, donneesPodium, donneesRecap, dessinerEmpreinte, dessinerMoulin, dessinerTrajectoire, donneesEtagere, donneesMoulin, donneesSpectre, positionDiagnostic: position,
    rendreDessins, rendreCafes30j,
  });
})();
