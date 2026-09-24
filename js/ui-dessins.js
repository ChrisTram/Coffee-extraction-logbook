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

  // ---------- Le tableau de bord ----------

  function rendreDessins() {
    if (!$("#carte-dessins")) return;
    dessinerEtagere("dessin-etagere");
    dessinerHorloge("dessin-horloge");
    dessinerSpectre("dessin-spectre");
    dessinerMoulin("dessin-moulin");
  }

  /* Les raccourcis. Un dessin résume une page : le toucher y mène. Un bocal, lui,
     porte data-fiche et ouvre la fiche de son café (délégation de ui-fiche.js). */
  const RACCOURCIS = {
    cafes: () => UI.ouvrirModaleCafes(),
    historique: () => activerEcran("historique"),
    diagnostics: () => {
      const onglet = $("#onglet-diagnostics");
      if (onglet) { onglet.click(); onglet.scrollIntoView({ behavior: "smooth", block: "start" }); }
    },
    moulin: () => {
      activerEcran("guide");
      const cible = $("#ref-moulin");
      if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };

  function cablerDessins() {
    const carte = $("#carte-dessins");
    if (!carte) return;
    carte.addEventListener("click", ev => {
      if (ev.target.closest("[data-fiche]")) return;
      const zone = ev.target.closest("[data-raccourci]");
      if (zone && RACCOURCIS[zone.dataset.raccourci]) RACCOURCIS[zone.dataset.raccourci]();
    });
    // Les bocaux se prennent aussi au clavier.
    carte.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const b = ev.target.closest("[data-fiche]");
      if (b) { ev.preventDefault(); UI.ouvrirFiche(b.dataset.fiche); }
    });
    DATA.abonner(() => { if (nav.ecran === "tableau") rendreDessins(); });
  }

  Object.assign(UI, {
    cablerDessins, dessinerMoulin, donneesEtagere, donneesMoulin, donneesSpectre, positionDiagnostic: position,
    rendreDessins,
  });
})();
