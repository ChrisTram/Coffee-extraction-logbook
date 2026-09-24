/* LES DESSINS (v8.49) : tes cafés en formes, et chacune est un raccourci.
 *
 * La roue des arômes a montré ce qui marche ici : une forme se lit d'un coup, une
 * table se compte. Ce fichier dessine les autres, en SVG maison comme le
 * calendrier, à partir des seules données déjà saisies :
 *
 *   - l'étagère : les sachets en bocaux, remplis de ce qui reste, liseré de
 *     fraîcheur ; un bocal ouvre la fiche de son café ;
 *   - l'horloge : chaque tasse à son heure, plus loin du centre mieux notée ;
 *   - le spectre : les diagnostics sur une ligne, de sous-extrait à sur-extrait,
 *     une rangée par recette ;
 *   - la carte du moulin : chaque tasse à ses microns, dans la plage de sa machine.
 *
 * Quatre d'entre eux vivent sur le tableau de bord, dans la carte « Tes cafés en
 * dessins », chacun avec son raccourci (Mes cafés, l'historique, l'onglet
 * Diagnostics, le moulin du Guide). La fiche café reprend la carte du moulin pour
 * un seul café, et y ajoute l'empreinte et la trajectoire (v8.50).
 *
 * Rien n'est écrit en dur sur les cafés ni les réglages : les plages viennent de
 * GRIND, les familles de goûts de DESCRIPTEURS_GROUPES, le sens des diagnostics de
 * DIAGNOSTIC_LEVIERS. Un dessin sans assez de données le dit en une phrase au lieu
 * de dessiner du vide. */
"use strict";

(() => {

  const { $, activerEcran, extAnalysables, fmtDecimal, moyenne, nav, replis } = UI;

  const echap = s => String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const note1 = n => fmtDecimal(n, 1);
  // La teinte d'une note, en opacité de l'accent : 5 pâle, 8,5 plein, comme la roue.
  const opacite = n => Math.max(0.18, Math.min(1, 0.18 + ((n - 5) / 3.5) * 0.82)).toFixed(2);
  const MIN = 3;

  function poserDessin(id, svg, lecture) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = svg;
    const l = document.getElementById(id + "-lecture");
    if (l) l.textContent = lecture || "";
  }
  const muet = (id, cle, v) => poserDessin(id, "", I18N.t(cle, v));

  // ---------- L'étagère ----------

  /* Un bocal par café actif qui a un sachet enregistré, le moins rempli d'abord :
     c'est celui qu'on vient regarder. Le liseré dit la fraîcheur, telle que la
     fiche café l'apprend : dans la fenêtre, avant, après, ou inconnue. */
  function donneesEtagere() {
    return DATA.state.cafes.filter(c => c.actif !== 0).map(c => {
      const stock = DATA.stockSachet(c.id, replis.dose);
      if (!stock) return null;
      const doses = DATA.state.extractions.filter(e => e.cafe_id === c.id && Number(e.dose_g) > 0).map(e => Number(e.dose_g));
      const dose = doses.length ? moyenne(doses) : replis.dose;
      const reste = Math.max(0, stock.restant);
      const notees = extAnalysables().filter(e => e.cafe_id === c.id && e.note_sur_10 !== "");
      const moy = notees.length ? moyenne(notees.map(e => Number(e.note_sur_10))) : 0;
      const f = UI.fenetreFraicheur(notees, moy).fenetre;
      const jc = UI.jourSachet(c.id);
      const etat = !f || !jc ? "inconnu" : jc.jour < f.debut ? "avant" : jc.jour > f.fin ? "apres" : "dedans";
      return { cafe: c, pc: Math.min(100, (reste / stock.format) * 100), tasses: Math.floor(reste / dose), etat };
    }).filter(Boolean).sort((a, b) => a.pc - b.pc).slice(0, 6);
  }

  function court(nom, max) {
    const n = String(nom);
    return n.length <= max ? n : n.slice(0, max - 1).trimEnd() + "…";
  }

  function dessinerEtagere(id) {
    const bocaux = donneesEtagere();
    if (!bocaux.length) { muet(id, "de_etagere_vide"); return; }
    const L = 320, pas = L / Math.max(bocaux.length, 4), w = Math.min(46, pas - 14);
    let s = '<line x1="8" y1="128" x2="' + (L - 8) + '" y2="128" class="de-planche"></line>';
    bocaux.forEach((b, i) => {
      const x = pas * i + (pas - w) / 2, top = 26, bas = 126, niveau = bas - ((bas - top - 4) * b.pc) / 100;
      s += '<g class="de-bocal de-' + b.etat + '" data-fiche="' + echap(b.cafe.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_bocal_aria", { c: b.cafe.nom, n: b.tasses })) + '"><title>' + echap(b.cafe.nom) + "</title>" +
        '<rect x="' + x.toFixed(1) + '" y="' + top + '" width="' + w.toFixed(1) + '" height="' + (bas - top) + '" rx="7" class="de-verre"></rect>' +
        '<rect x="' + (x + 3).toFixed(1) + '" y="' + niveau.toFixed(1) + '" width="' + (w - 6).toFixed(1) + '" height="' +
        Math.max(0, bas - 3 - niveau).toFixed(1) + '" rx="4" class="de-grains" style="fill-opacity:' + (b.tasses <= 3 ? 0.45 : 0.85) + '"></rect>' +
        '<rect x="' + (x + 8).toFixed(1) + '" y="' + (top - 7) + '" width="' + (w - 16).toFixed(1) + '" height="7" rx="2" class="de-couvercle"></rect>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="143" text-anchor="middle" class="de-fort">' + echap(court(b.cafe.nom, 11)) + "</text>" +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="155" text-anchor="middle">' + echap(I18N.t("de_tasses", { n: b.tasses })) + "</text></g>";
    });
    const bas = bocaux.filter(b => b.tasses <= 3);
    poserDessin(id, s, bas.length
      ? I18N.t("de_etagere_racheter", { c: bas.map(b => b.cafe.nom).join(", ") })
      : I18N.t("de_etagere_ok"));
  }

  // ---------- L'horloge ----------

  /* Les tasses notées des 90 derniers jours, à leur heure. Rayon : la note. La
     couleur est celle de la machine, la seule série qui a le droit de la porter.
     La lecture compare les moments de la journée, mêmes seuils que les constats. */
  function dessinerHorloge(id) {
    const depuis = new Date(); depuis.setDate(depuis.getDate() - 90);
    const tasses = extAnalysables().filter(e => e.note_sur_10 !== "" && new Date(e.date_heure) >= depuis)
      .map(e => ({ h: Number(String(e.date_heure).slice(11, 13)) + Number(String(e.date_heure).slice(14, 16)) / 60,
        n: Number(e.note_sur_10), m: e.methode }))
      .filter(t => Number.isFinite(t.h));
    if (tasses.length < MIN) { muet(id, "de_horloge_vide", { n: MIN }); return; }
    const C = [104, 100], R0 = 20, R1 = 84;
    const pt = (h, r) => { const a = -Math.PI / 2 + (h / 24) * Math.PI * 2; return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]; };
    let s = '<circle cx="' + C[0] + '" cy="' + C[1] + '" r="' + R1 + '" class="de-cadran"></circle>' +
      '<circle cx="' + C[0] + '" cy="' + C[1] + '" r="' + ((R0 + R1) / 2) + '" class="de-cadran-mi"></circle>';
    [0, 6, 12, 18].forEach(h => {
      const [x, y] = pt(h, R1 + 9);
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="middle">' + h + " h</text>";
    });
    tasses.forEach(t => {
      const [x, y] = pt(t.h, R0 + ((Math.max(3, t.n) - 3) / 7) * (R1 - R0));
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" class="de-point-' + String(t.m || "").toLowerCase() + '"></circle>';
    });
    const moments = [["de_matin", t => t.h < 12], ["de_aprem", t => t.h >= 12 && t.h < 18], ["de_soir", t => t.h >= 18]]
      .map(([cle, f]) => { const ns = tasses.filter(f).map(t => t.n); return { cle, n: ns.length, moy: ns.length ? moyenne(ns) : null }; })
      .filter(m => m.n >= MIN);
    let y = 58;
    moments.forEach(m => {
      s += '<text x="214" y="' + y + '" class="de-fort">' + echap(I18N.t(m.cle)) + "</text>" +
        '<text x="214" y="' + (y + 13) + '">' + echap(I18N.t("de_moyenne", { m: note1(m.moy), n: m.n })) + "</text>";
      y += 36;
    });
    const tri = moments.slice().sort((a, b) => b.moy - a.moy);
    poserDessin(id, s, tri.length >= 2 && tri[0].moy - tri[tri.length - 1].moy >= 0.4
      ? I18N.t("de_horloge_lecture", { a: I18N.t(tri[0].cle), b: I18N.t(tri[tri.length - 1].cle) })
      : I18N.t("de_horloge_egal"));
  }

  // ---------- Le spectre d'extraction ----------

  /* La position d'un diagnostic sur l'axe sous-extrait / sur-extrait : le SENS de
     la mouture dans DIAGNOSTIC_LEVIERS (plus grossier veut dire trop extrait),
     « Équilibré » au milieu. Les diagnostics de ratio ou du café n'ont pas de
     place ici : ils ne parlent pas d'extraction. */
  function position(diag) {
    if (diag === "Équilibré") return 0;
    const l = DIAGNOSTIC_LEVIERS[diag];
    return l && l.mouture ? l.mouture : null;
  }

  function donneesSpectre() {
    const parRecette = {};
    extAnalysables().forEach(e => {
      const pos = String(e.diagnostic || "").split("|").map(position).filter(v => v !== null);
      if (!pos.length || !e.recette) return;
      // Une tasse, un point : le diagnostic le plus franc la place.
      const v = pos.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
      (parRecette[e.recette] = parRecette[e.recette] || []).push(v);
    });
    return Object.entries(parRecette).filter(([, v]) => v.length >= MIN)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([recette, vals]) => ({ recette, vals, moy: moyenne(vals) }));
  }

  function dessinerSpectre(id) {
    const rangs = donneesSpectre();
    if (!rangs.length) { muet(id, "de_spectre_vide", { n: MIN }); return; }
    const x = v => 24 + ((v + 2) / 4) * 272, H = 26 + rangs.length * 40;
    let s = '<rect x="' + x(-0.4).toFixed(1) + '" y="8" width="' + (x(0.4) - x(-0.4)).toFixed(1) + '" height="' + (H - 18) + '" rx="6" class="de-zone"></rect>';
    rangs.forEach((r, i) => {
      const y = 36 + i * 40;
      s += '<line x1="' + x(-2) + '" y1="' + y + '" x2="' + x(2) + '" y2="' + y + '" class="de-axe"></line>' +
        '<text x="' + x(-2) + '" y="' + (y - 14) + '" class="de-fort">' + echap(court(I18N.tr(r.recette), 30)) + "</text>";
      const pile = {};
      r.vals.forEach(v => {
        const k = (pile[v] = (pile[v] || 0) + 1) - 1;
        // Au-dessus puis au-dessous de la ligne, sans monter sur la rangée voisine.
        const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.min(2, Math.ceil(k / 2)) * 4.5;
        s += '<circle cx="' + x(v).toFixed(1) + '" cy="' + (y + dy) + '" r="3.6" class="' +
          (v === 0 ? "de-juste" : "de-ecart") + '"></circle>';
      });
      s += '<path d="M' + x(r.moy).toFixed(1) + " " + (y + 4) + ' l-4 7 l8 0 z" class="de-moyenne"></path>';
    });
    s += '<text x="' + x(-2) + '" y="' + (H + 2) + '">' + echap(I18N.t("de_sous")) + "</text>" +
      '<text x="' + x(0) + '" y="' + (H + 2) + '" text-anchor="middle" class="de-fort">' + echap(I18N.t("de_equilibre")) + "</text>" +
      '<text x="' + x(2) + '" y="' + (H + 2) + '" text-anchor="end">' + echap(I18N.t("de_sur")) + "</text>";
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (H + 8));
    const penche = rangs.filter(r => Math.abs(r.moy) >= 0.4).sort((a, b) => Math.abs(b.moy) - Math.abs(a.moy))[0];
    poserDessin(id, s, penche
      ? I18N.t(penche.moy > 0 ? "de_spectre_sur" : "de_spectre_sous", { r: I18N.tr(penche.recette) })
      : I18N.t("de_spectre_centre"));
  }

  // ---------- La carte du moulin ----------

  /* Chaque tasse à ses microns, sur la plage de sa machine (GRIND.METHODES). La
     zone dorée : la fenêtre de trois crans où les tasses notées font la meilleure
     moyenne, dès trois tasses. Un café déjà moulu n'a pas de molette et n'y paraît
     pas. cafeId restreint la carte à un café (fiche café). */
  function donneesMoulin(cafeId) {
    return ["Brikka", "Switch"].map(m => {
      const plage = GRIND.METHODES.find(x => x.id === m.toLowerCase());
      const tasses = extAnalysables().filter(e => e.methode === m && e.note_sur_10 !== "" && (!cafeId || e.cafe_id === cafeId))
        .map(e => ({ d: GRIND.parseDial(String(e.mouture_dial || "")), n: Number(e.note_sur_10) })).filter(t => t.d);
      let doree = null;
      tasses.forEach(t => {
        const dedans = tasses.filter(u => u.d.crans >= t.d.crans && u.d.crans <= t.d.crans + 2);
        if (dedans.length < MIN) return;
        const moy = moyenne(dedans.map(u => u.n));
        if (!doree || moy > doree.moy) doree = { de: t.d.crans, a: t.d.crans + 2, moy, n: dedans.length };
      });
      return { m, plage, tasses, doree };
    }).filter(r => r.tasses.length);
  }

  function dessinerMoulin(id, cafeId) {
    const rangs = donneesMoulin(cafeId);
    if (!rangs.length) { muet(id, "de_moulin_vide"); return; }
    const x = um => 16 + ((um - 300) / 600) * 290;
    let s = "";
    [400, 500, 600, 700, 800].forEach(um => {
      s += '<line x1="' + x(um).toFixed(1) + '" y1="16" x2="' + x(um).toFixed(1) + '" y2="' + (rangs.length * 50 + 6) + '" class="de-grille"></line>' +
        '<text x="' + x(um).toFixed(1) + '" y="' + (rangs.length * 50 + 20) + '" text-anchor="middle">' + um + "</text>";
    });
    rangs.forEach((r, i) => {
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
          opacite(t.n) + '"></circle>';
      });
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (rangs.length * 50 + 26));
    const d = rangs.filter(r => r.doree).sort((a, b) => b.doree.moy - a.doree.moy)[0];
    poserDessin(id, s, d ? I18N.t("de_moulin_lecture", {
      m: I18N.machine(d.m), a: GRIND.dialDepuisCrans(d.doree.de), b: GRIND.dialDepuisCrans(d.doree.a),
      x: note1(d.doree.moy), n: d.doree.n,
    }) : I18N.t("de_moulin_sans_zone", { n: MIN }));
  }

  // ---------- L'empreinte d'un café (fiche café, v8.50) ----------

  /* Un radar des familles du vocabulaire (DESCRIPTEURS_GROUPES) : la part de
     chaque famille dans les goûts cochés sur ce café, contre la même part sur
     tous tes cafés. Chaque profil est ramené à sa famille la plus cochée, pour
     comparer des formes et pas des volumes. */
  function profil(tasses) {
    const n = {};
    let total = 0;
    tasses.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => {
      const g = DESCRIPTEURS_GROUPES.find(x => x.tags.includes(t));
      if (!g) return;
      n[g.nom] = (n[g.nom] || 0) + 1;
      total += 1;
    }));
    const parts = DESCRIPTEURS_GROUPES.map(g => (total ? (n[g.nom] || 0) / total : 0));
    const max = Math.max(...parts, 0.0001);
    return { parts, norm: parts.map(p => p / max), total };
  }

  function dessinerEmpreinte(id, cafeId) {
    const toutes = extAnalysables();
    const aTags = e => String(e.descripteurs || "").trim() !== "";
    const siennes = toutes.filter(e => e.cafe_id === cafeId && aTags(e));
    if (siennes.length < MIN) { muet(id, "de_empreinte_vide", { n: MIN }); return; }
    const a = profil(siennes), b = profil(toutes.filter(aTags));
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
    // La lecture : la famille où ce café dépasse le plus tes autres, et celle où il manque.
    const ecarts = a.parts.map((p, i) => ({ g: DESCRIPTEURS_GROUPES[i].nom, d: p - b.parts[i] })).sort((x, y) => y.d - x.d);
    const plus = ecarts[0], moins = ecarts[ecarts.length - 1];
    poserDessin(id, s, plus.d >= 0.05 && moins.d <= -0.05
      ? I18N.t("de_empreinte_lecture", { p: I18N.groupe(plus.g).toLowerCase(), m: I18N.groupe(moins.g).toLowerCase() })
      : I18N.t("de_empreinte_proche"));
  }

  // ---------- Ta trajectoire (fiche café, v8.50) ----------

  /* Les tasses d'un café dans le plan molette × chaleur (degrés au Switch, feu à la
     Brikka), reliées dans l'ordre où tu les as faites, sur la recette la plus
     faite sur ce café : d'une recette à l'autre la molette change de sens, et une
     Sherrycipe à 2.0.2 écrasait l'échelle de tout le reste. La teinte est la note,
     la dernière tasse cerclée. */
  function dessinerTrajectoire(id, cafeId) {
    const avecDial = extAnalysables().filter(e => e.cafe_id === cafeId && e.note_sur_10 !== "" && GRIND.parseDial(String(e.mouture_dial || "")));
    const compte = {};
    avecDial.forEach(e => { if (e.recette) compte[e.recette] = (compte[e.recette] || 0) + 1; });
    const recette = Object.keys(compte).sort((a, b) => compte[b] - compte[a])[0];
    const machine = (avecDial.find(e => e.recette === recette) || {}).methode;
    const chaleur = e => Number(machine === "Switch" ? e.temperature_c : e.puissance_feu);
    const tasses = avecDial.filter(e => e.recette === recette)
      .filter(e => Number.isFinite(chaleur(e)) && chaleur(e) > 0)
      .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)))
      .map(e => ({ c: GRIND.parseDial(String(e.mouture_dial)).crans, y: chaleur(e), n: Number(e.note_sur_10), dial: e.mouture_dial }));
    if (tasses.length < MIN) { muet(id, "de_trajectoire_vide", { n: MIN }); return; }
    const cs = tasses.map(t => t.c), ys = tasses.map(t => t.y);
    const c0 = Math.min(...cs) - 2, c1 = Math.max(...cs) + 2, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const x = c => 36 + ((c - c0) / (c1 - c0)) * 270, y = v => 150 - ((v - y0) / (y1 - y0)) * 130;
    let s = "";
    const pasC = Math.max(1, Math.round((c1 - c0) / 4));
    for (let c = Math.ceil(c0); c <= c1; c += pasC) {
      s += '<line x1="' + x(c).toFixed(1) + '" y1="16" x2="' + x(c).toFixed(1) + '" y2="152" class="de-grille"></line>' +
        '<text x="' + x(c).toFixed(1) + '" y="166" text-anchor="middle">' + GRIND.dialDepuisCrans(c) + "</text>";
    }
    [y0 + 1, (y0 + y1) / 2, y1 - 1].forEach(v => {
      s += '<text x="30" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + fmtDecimal(v, 0) + (machine === "Switch" ? "°" : "") + "</text>";
    });
    s += '<path d="M' + tasses.map(t => x(t.c).toFixed(1) + " " + y(t.y).toFixed(1)).join(" L") + '" class="de-chemin"></path>';
    tasses.forEach((t, i) => {
      const der = i === tasses.length - 1;
      s += '<circle cx="' + x(t.c).toFixed(1) + '" cy="' + y(t.y).toFixed(1) + '" r="' + (der ? 6.5 : 4.2) + '" class="de-grain' + (der ? " de-derniere" : "") +
        '" style="fill-opacity:' + opacite(t.n) + '"></circle>';
    });
    const meilleure = tasses.slice().sort((a, b) => b.n - a.n)[0];
    const unite = v => machine === "Switch" ? I18N.t("de_degres", { v: fmtDecimal(v, 0) }) : I18N.t("j_feu", { f: v });
    poserDessin(id, s, I18N.t("de_trajectoire_lecture", {
      r: I18N.tr(recette || ""), n: tasses.length, d: meilleure.dial, c: unite(meilleure.y), x: note1(meilleure.n),
    }));
  }

  // ---------- Le récap de la semaine (v8.51) ----------

  /* La semaine PASSÉE, lundi à dimanche, en tête du tableau de bord pendant la
     semaine suivante, jusqu'à ce qu'on la referme. Seulement des FAITS, et chacun
     ne s'écrit que s'il est vrai : l'écart avec la semaine d'avant (0,4 point et
     trois tasses notées de chaque côté, les seuils des constats), le café de la
     semaine s'il en fait la moitié, les sachets ouverts ou finis, la meilleure
     tasse. Moins de deux tasses dans la semaine : pas de récap. */
  const CLE_RECAP = "recap-ferme";
  function lundiDe(d) {
    const l = new Date(d); l.setHours(0, 0, 0, 0);
    l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
    return l;
  }
  const dansSemaine = (e, debut) => {
    const t = new Date(e.date_heure), fin = new Date(debut); fin.setDate(fin.getDate() + 7);
    return t >= debut && t < fin;
  };

  function donneesRecap(maintenant) {
    const debut = lundiDe(maintenant || new Date()); debut.setDate(debut.getDate() - 7);
    const avant = new Date(debut); avant.setDate(avant.getDate() - 7);
    const tasses = DATA.state.extractions.filter(e => dansSemaine(e, debut));
    if (tasses.length < 2) return null;
    const notees = extAnalysables().filter(e => e.note_sur_10 !== "" && dansSemaine(e, debut));
    const noteesAvant = extAnalysables().filter(e => e.note_sur_10 !== "" && dansSemaine(e, avant));
    const moy = notees.length ? moyenne(notees.map(e => Number(e.note_sur_10))) : null;
    const moyAvant = noteesAvant.length ? moyenne(noteesAvant.map(e => Number(e.note_sur_10))) : null;
    const jours = Array.from({ length: 7 }, (_, i) => {
      const j = new Date(debut); j.setDate(j.getDate() + i);
      return { date: j, n: tasses.filter(e => String(e.date_heure).slice(0, 10) === UI.cleLocale(j)).length };
    });
    const faits = [];
    if (moy !== null && moyAvant !== null && notees.length >= MIN && noteesAvant.length >= MIN && Math.abs(moy - moyAvant) >= 0.4) {
      faits.push(I18N.t(moy > moyAvant ? "rc_mieux" : "rc_moins", { x: note1(Math.abs(moy - moyAvant)), s: Math.abs(moy - moyAvant) >= 2 ? "s" : "" }));
    }
    const parCafe = {};
    tasses.forEach(e => { parCafe[e.cafe_id] = (parCafe[e.cafe_id] || 0) + 1; });
    const [cafeId, nCafe] = Object.entries(parCafe).sort((a, b) => b[1] - a[1])[0];
    const cafe = DATA.state.cafes.find(c => c.id === cafeId);
    if (cafe && nCafe * 2 >= tasses.length && Object.keys(parCafe).length > 1) {
      faits.push(I18N.t("rc_cafe", { c: cafe.nom, n: nCafe, t: tasses.length }));
    }
    const finSemaine = new Date(debut); finSemaine.setDate(finSemaine.getDate() + 7);
    DATA.state.achats.filter(a => a.date_ouverture && new Date(a.date_ouverture + "T12:00") >= debut &&
      new Date(a.date_ouverture + "T12:00") < finSemaine).forEach(a => {
      const c = DATA.state.cafes.find(x => x.id === a.cafe_id);
      if (c) faits.push(I18N.t("rc_ouvert", { c: c.nom, j: new Date(a.date_ouverture + "T12:00").toLocaleDateString(I18N.locale(), { weekday: "long" }) }));
    });
    const meilleure = notees.slice().sort((a, b) => Number(b.note_sur_10) - Number(a.note_sur_10))[0];
    return { debut, tasses: tasses.length, notees: notees.length, moy, moyAvant, jours, faits, meilleure };
  }

  function rendreRecap() {
    const carte = $("#carte-recap");
    if (!carte) return;
    const r = donneesRecap();
    let ferme = null;
    try { ferme = localStorage.getItem(CLE_RECAP); } catch (e) { /* sans stockage, on la montre */ }
    if (!r || ferme === UI.cleLocale(r.debut)) { carte.hidden = true; carte.innerHTML = ""; return; }
    const fin = new Date(r.debut); fin.setDate(fin.getDate() + 6);
    const jour = d => d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" });
    const max = Math.max(1, ...r.jours.map(j => j.n));
    const barres = r.jours.map(j =>
      '<span class="rc-jour' + (j.n ? "" : " vide") + '" title="' + echap(j.date.toLocaleDateString(I18N.locale(), { weekday: "long" }) + " : " + j.n) + '">' +
      '<i style="height:' + (j.n ? Math.max(12, (j.n / max) * 100) : 6).toFixed(0) + '%"></i><small>' +
      echap(j.date.toLocaleDateString(I18N.locale(), { weekday: "narrow" })) + "</small></span>").join("");
    const m = r.meilleure;
    const cafeM = m ? DATA.state.cafes.find(c => c.id === m.cafe_id) : null;
    carte.hidden = false;
    carte.innerHTML =
      '<div class="rc-tete"><h3>' + echap(I18N.t("rc_titre", {
        // « du 14 au 20 septembre » : le mois ne s'écrit qu'une fois s'il est le même.
        a: r.debut.getMonth() === fin.getMonth() ? String(r.debut.getDate()) : jour(r.debut), b: jour(fin) })) + "</h3>" +
      '<button type="button" class="dessin-lien" id="recap-fermer">' + echap(I18N.t("rc_fermer")) + "</button></div>" +
      '<div class="rc-corps">' +
      '<div class="rc-chiffre"><b>' + r.tasses + "</b><span>" + echap(I18N.t("rc_tasses")) + "</span></div>" +
      (r.moy !== null ? '<div class="rc-chiffre"><b>' + note1(r.moy) + "</b><span>" + echap(I18N.t("rc_moyenne", { n: r.notees })) + "</span></div>" : "") +
      (m ? '<div class="rc-chiffre"><b>' + note1(Number(m.note_sur_10)) + "</b><span>" + echap(I18N.t("rc_meilleure", {
        c: cafeM ? cafeM.nom : "", j: new Date(m.date_heure).toLocaleDateString(I18N.locale(), { weekday: "long" }) })) + "</span></div>" : "") +
      '<div class="rc-semaine" aria-label="' + echap(I18N.t("rc_barres")) + '">' + barres + "</div></div>" +
      (r.faits.length ? '<ul class="rc-faits">' + r.faits.map(f => "<li>" + echap(f) + "</li>").join("") + "</ul>" : "");
    $("#recap-fermer").addEventListener("click", () => {
      try { localStorage.setItem(CLE_RECAP, UI.cleLocale(r.debut)); } catch (e) { /* tant pis, elle reviendra */ }
      carte.hidden = true;
    });
  }

  // ---------- Le podium des recettes (v8.53) ----------

  /* Les trois recettes à la meilleure moyenne, dès trois tasses notées chacune :
     une recette essayée une fois ne monte pas. La plus haute marche au milieu,
     comme un vrai podium. Toucher une marche ouvre la recette dans le Guide. */
  function donneesPodium() {
    const par = {};
    extAnalysables().filter(e => e.note_sur_10 !== "" && e.recette)
      .forEach(e => (par[e.recette] = par[e.recette] || []).push(Number(e.note_sur_10)));
    return Object.entries(par).filter(([, n]) => n.length >= MIN)
      .map(([nom, n]) => ({ nom, moy: moyenne(n), n: n.length, r: UI.trouverRecette(nom) }))
      .sort((a, b) => b.moy - a.moy || b.n - a.n).slice(0, 3);
  }

  function dessinerPodium(id) {
    const p = donneesPodium();
    if (!p.length) { muet(id, "de_podium_vide", { n: MIN }); return; }
    // Ordre des marches : deuxième, premier, troisième.
    const places = [p[1], p[0], p[2]];
    const hauteurs = [70, 96, 52];
    let s = '<line x1="14" y1="130" x2="306" y2="130" class="de-planche"></line>';
    places.forEach((m, i) => {
      if (!m) return;
      const rang = i === 1 ? 1 : i === 0 ? 2 : 3;
      const x = 22 + i * 96, w = 84, h = hauteurs[i], top = 130 - h;
      const lien = m.r ? ' data-guide-recette="' + echap(m.r.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_podium_aria", { r: I18N.tr(m.nom), m: note1(m.moy) })) + '"' : "";
      s += '<g class="de-marche de-rang-' + rang + '"' + lien + "><title>" + echap(I18N.tr(m.nom)) + "</title>" +
        '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="6" class="de-marche-bloc"></rect>' +
        '<text x="' + (x + w / 2) + '" y="' + (top + 26) + '" text-anchor="middle" class="de-marche-note">' + note1(m.moy) + "</text>" +
        '<text x="' + (x + w / 2) + '" y="' + (top - 7) + '" text-anchor="middle" class="de-fort">' + echap(court(I18N.tr(m.nom), 17)) + "</text>" +
        '<text x="' + (x + w / 2) + '" y="144" text-anchor="middle">' + echap(I18N.t("de_podium_n", { n: m.n })) + "</text></g>";
    });
    poserDessin(id, s, I18N.t("de_podium_lecture", { r: I18N.tr(p[0].nom), m: note1(p[0].moy), n: p[0].n }));
  }

  // ---------- Ta progression (v8.54) ----------

  /* La moyenne glissante sur cinq tasses notées (REGLAGES.moyenneGlissante), sur
     tout l'historique, avec ses JALONS : chaque sachet ouvert, et chaque recette
     faite pour la première fois. On voit ce qui a fait bouger la courbe. Les trois
     jalons les plus récents portent leur nom, les autres restent des points. */
  function dessinerProgression(id) {
    const notees = extAnalysables().filter(e => e.note_sur_10 !== "");
    const serie = REGLAGES.moyenneGlissante(notees, 5).filter(p => p.valeur !== null);
    if (serie.length < 2) { muet(id, "de_progression_vide"); return; }
    const t = d => new Date(d).getTime();
    const t0 = t(serie[0].date), t1 = Math.max(t(serie[serie.length - 1].date), t0 + 86400000);
    const vals = serie.map(p => p.valeur);
    const v0 = Math.floor(Math.min(...vals)) , v1 = Math.ceil(Math.max(...vals));
    const bas = v1 - v0 < 2 ? v1 - 2 : v0;
    const x = d => 26 + ((t(d) - t0) / (t1 - t0)) * 284, y = v => 112 - ((v - bas) / (v1 - bas)) * 96;
    let s = "";
    for (let v = bas; v <= v1; v += 1) {
      s += '<line x1="26" y1="' + y(v).toFixed(1) + '" x2="310" y2="' + y(v).toFixed(1) + '" class="de-grille"></line>' +
        '<text x="20" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + v + "</text>";
    }
    const d = "M" + serie.map(p => x(p.date).toFixed(1) + " " + y(p.valeur).toFixed(1)).join(" L");
    s += '<path d="' + d + " L" + x(serie[serie.length - 1].date).toFixed(1) + " 112 L26 112 Z" + '" class="de-aire"></path>' +
      '<path d="' + d + '" class="de-courbe"></path>';
    // Les jalons, dans la période de la courbe.
    const jalons = [];
    DATA.state.achats.forEach(a => {
      const quand = a.date_ouverture || "";
      const c = DATA.state.cafes.find(x => x.id === a.cafe_id);
      if (quand && c) jalons.push({ date: quand + "T12:00", lib: I18N.t("de_jalon_sachet", { c: court(c.nom, 16) }) });
    });
    const vues = new Set();
    notees.slice().sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure))).forEach(e => {
      if (!e.recette || vues.has(e.recette)) return;
      vues.add(e.recette);
      jalons.push({ date: e.date_heure, lib: I18N.t("de_jalon_recette", { r: court(I18N.tr(e.recette), 16) }) });
    });
    const dans = jalons.filter(j => t(j.date) > t0 && t(j.date) <= t1).sort((a, b) => t(a.date) - t(b.date));
    const valeurA = d => { let v = serie[0].valeur; serie.forEach(p => { if (t(p.date) <= t(d)) v = p.valeur; }); return v; };
    const nommes = dans.slice(-3);
    dans.forEach(j => {
      const jx = x(j.date), jy = y(valeurA(j.date));
      s += '<line x1="' + jx.toFixed(1) + '" y1="' + jy.toFixed(1) + '" x2="' + jx.toFixed(1) + '" y2="118" class="de-jalon-trait"></line>' +
        '<circle cx="' + jx.toFixed(1) + '" cy="' + jy.toFixed(1) + '" r="3.6" class="de-jalon"><title>' + echap(j.lib) + "</title></circle>";
    });
    nommes.forEach((j, k) => {
      s += '<text x="' + x(j.date).toFixed(1) + '" y="' + (130 + k * 10) + '" text-anchor="' + (x(j.date) > 250 ? "end" : "middle") + '">' + echap(j.lib) + "</text>";
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (132 + nommes.length * 10));
    const debut = serie[0], fin = serie[serie.length - 1];
    const jour = s2 => new Date(s2).toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" });
    poserDessin(id, s, I18N.t(fin.valeur >= debut.valeur ? "de_progression_monte" : "de_progression_baisse", {
      a: note1(debut.valeur), b: note1(fin.valeur), d: jour(debut.date),
    }));
  }

  // ---------- La frise des sachets (v8.55) ----------

  /* Un ruban par sachet, de son ouverture (ou de son achat) à sa fin : le jour de
     la dernière tasse de ce café avant le sachet suivant du même café, ou
     aujourd'hui pour un sachet en cours qui n'est pas vide. La teinte est la note
     moyenne de ses tasses. Les trois derniers mois, huit sachets au plus. Un ruban
     ouvre la fiche de son café. */
  function donneesFrise(maintenant) {
    const auj = maintenant ? new Date(maintenant) : new Date();
    const depuis = new Date(auj); depuis.setDate(depuis.getDate() - 90);
    const jourDe = s => new Date(String(s).slice(0, 10) + "T12:00");
    return DATA.state.achats.map(a => {
      const debut = jourDe(a.date_ouverture || a.date_achat);
      if (isNaN(debut)) return null;
      const suivants = DATA.state.achats.filter(b => b.cafe_id === a.cafe_id && b !== a &&
        jourDe(b.date_ouverture || b.date_achat) > debut).map(b => jourDe(b.date_ouverture || b.date_achat)).sort((x, y) => x - y);
      const limite = suivants[0] || null;
      const tasses = DATA.state.extractions.filter(e => e.cafe_id === a.cafe_id && new Date(e.date_heure) >= debut &&
        (!limite || new Date(e.date_heure) < limite));
      const derniere = tasses.reduce((m, e) => (new Date(e.date_heure) > m ? new Date(e.date_heure) : m), debut);
      const stock = limite ? null : DATA.stockSachet(a.cafe_id, replis.dose);
      const enCours = !limite && stock && stock.restant > 0;
      const fin = enCours ? auj : derniere;
      if (fin < depuis) return null;
      const notes = extAnalysables().filter(e => tasses.some(t => t.id === e.id) && e.note_sur_10 !== "").map(e => Number(e.note_sur_10));
      const cafe = DATA.state.cafes.find(c => c.id === a.cafe_id);
      return cafe ? { cafe, debut, fin, enCours, n: tasses.length, moy: notes.length ? moyenne(notes) : null } : null;
    }).filter(Boolean).sort((a, b) => a.debut - b.debut).slice(-8);
  }

  function dessinerFrise(id) {
    const sachets = donneesFrise();
    if (!sachets.length) { muet(id, "de_frise_vide"); return; }
    const auj = new Date();
    const t0 = Math.min(...sachets.map(s => s.debut.getTime())), t1 = Math.max(auj.getTime(), ...sachets.map(s => s.fin.getTime()));
    const x = d => 10 + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * 300;
    const H = 16 + sachets.length * 18;
    let s = "";
    // Un repère par début de mois.
    const m = new Date(t0); m.setDate(1); m.setMonth(m.getMonth() + 1); m.setHours(12);
    for (; m.getTime() < t1; m.setMonth(m.getMonth() + 1)) {
      s += '<line x1="' + x(m).toFixed(1) + '" y1="6" x2="' + x(m).toFixed(1) + '" y2="' + H + '" class="de-grille"></line>' +
        '<text x="' + x(m).toFixed(1) + '" y="' + (H + 12) + '" text-anchor="middle">' + echap(m.toLocaleDateString(I18N.locale(), { month: "short" })) + "</text>";
    }
    sachets.forEach((b, i) => {
      const y = 10 + i * 18, a = x(b.debut), w = Math.max(10, x(b.fin) - a);
      const lib = court(b.cafe.nom, 18) + (b.moy !== null ? " · " + note1(b.moy) : "");
      s += '<g class="de-ruban' + (b.enCours ? " en-cours" : "") + '" data-fiche="' + echap(b.cafe.id) + '" tabindex="0" role="button" aria-label="' +
        echap(I18N.t("de_ruban_aria", { c: b.cafe.nom, n: b.n })) + '"><title>' + echap(b.cafe.nom) + "</title>" +
        '<rect x="' + a.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="13" rx="6.5" class="de-ruban-bloc" style="fill-opacity:' +
        (b.moy === null ? 0.18 : opacite(b.moy)) + '"></rect>' +
        '<text x="' + Math.min(a + 6, 250).toFixed(1) + '" y="' + (y + 10) + '" class="de-ruban-texte">' + echap(lib) + "</text></g>";
    });
    const el = document.getElementById(id);
    if (el) el.setAttribute("viewBox", "0 0 320 " + (H + 18));
    const notes = sachets.filter(b => b.moy !== null && b.n >= MIN).sort((a, b) => b.moy - a.moy);
    poserDessin(id, s, notes.length >= 2
      ? I18N.t("de_frise_lecture", { a: notes[0].cafe.nom, x: note1(notes[0].moy), b: notes[notes.length - 1].cafe.nom, y: note1(notes[notes.length - 1].moy) })
      : I18N.t("de_frise_courte"));
  }

  // ---------- Le tableau de bord ----------

  function rendreDessins() {
    rendreRecap();
    if (!$("#carte-dessins")) return;
    dessinerEtagere("dessin-etagere");
    dessinerFrise("dessin-frise");
    dessinerPodium("dessin-podium");
    dessinerProgression("dessin-progression");
    dessinerHorloge("dessin-horloge");
    dessinerSpectre("dessin-spectre");
    dessinerMoulin("dessin-moulin");
  }

  /* Les raccourcis. Un dessin résume une page : le toucher y mène. Un bocal, lui,
     porte data-fiche et ouvre la fiche de son café (délégation de ui-fiche.js). */
  const RACCOURCIS = {
    cafes: () => UI.ouvrirModaleCafes(),
    historique: () => activerEcran("historique"),
    guide: () => { activerEcran("guide"); UI.montrerGuide("ref-recettes"); },
    diagnostics: () => {
      const onglet = $("#onglet-diagnostics");
      if (onglet) { onglet.click(); onglet.scrollIntoView({ behavior: "smooth", block: "start" }); }
    },
    moulin: () => {
      activerEcran("guide");
      UI.montrerGuide("ref-moulin");
    },
  };

  function cablerDessins() {
    const carte = $("#carte-dessins");
    if (!carte) return;
    carte.addEventListener("click", ev => {
      if (ev.target.closest("[data-fiche]")) return;
      // Une marche du podium ouvre SA recette dans le Guide.
      const marche = ev.target.closest("[data-guide-recette]");
      if (marche) { activerEcran("guide"); UI.montrerRecette(marche.dataset.guideRecette); return; }
      const zone = ev.target.closest("[data-raccourci]");
      if (zone && RACCOURCIS[zone.dataset.raccourci]) RACCOURCIS[zone.dataset.raccourci]();
    });
    // Les bocaux se prennent aussi au clavier.
    carte.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const b = ev.target.closest("[data-fiche]");
      if (b) { ev.preventDefault(); UI.ouvrirFiche(b.dataset.fiche); return; }
      const m = ev.target.closest("[data-guide-recette]");
      if (m) { ev.preventDefault(); activerEcran("guide"); UI.montrerRecette(m.dataset.guideRecette); }
    });
    DATA.abonner(() => { if (nav.ecran === "tableau") rendreDessins(); });
  }

  Object.assign(UI, {
    cablerDessins, donneesFrise, donneesPodium, donneesRecap, dessinerEmpreinte, dessinerMoulin, dessinerTrajectoire, donneesEtagere, donneesMoulin, donneesSpectre, positionDiagnostic: position,
    rendreDessins,
  });
})();
