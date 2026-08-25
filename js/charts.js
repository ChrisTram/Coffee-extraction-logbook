// Graphiques : Chart.js embarqué localement, plus heatmap et réglette en SVG maison.
// Couleurs de données validées pour le daltonisme, ne pas les changer :
// Brikka #2a78d6, Switch #eb6834, les deux machines #1baf7a.
"use strict";

const CHARTS = (() => {

  const C_BRIKKA = "#2a78d6";
  const C_SWITCH = "#eb6834";
  const C_DEUX = "#1baf7a";

  const C_DIAG = {
    "Équilibré": C_DEUX,
    "Sous-extrait (acide)": "#d9a410",
    "Sur-extrait (amer)": "#8a4a2b",
    "Astringent": "#9467bd",
    "Acide ET amer (extraction inégale)": "#e17aa4",
    "Trop léger (aqueux)": "#74b3e3",
    "Trop fort (concentré)": "#4a6fa5",
    "Creux, plat (café éventé)": "#b5a642",
    "Brûlé (défaut du sachet)": "#7f7f7f",
  };

  const registre = {};

  function cssVar(nom) {
    return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  }

  function appliquerDefauts() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar("--attenue");
    Chart.defaults.borderColor = cssVar("--lignes-graphe");
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar("--tooltip-fond");
    Chart.defaults.plugins.tooltip.titleColor = cssVar("--tooltip-texte");
    Chart.defaults.plugins.tooltip.bodyColor = cssVar("--tooltip-texte");
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.animation.duration = 700;
    Chart.defaults.animation.easing = "easeOutQuart";
    Chart.defaults.maintainAspectRatio = false;
  }

  function creer(idCanvas, config) {
    const el = document.getElementById(idCanvas);
    if (!el) return null;
    if (registre[idCanvas]) registre[idCanvas].destroy();
    registre[idCanvas] = new Chart(el.getContext("2d"), config);
    return registre[idCanvas];
  }

  function toutDetruire() {
    Object.keys(registre).forEach(k => { registre[k].destroy(); delete registre[k]; });
  }

  // Barres du nombre d'extractions par jour, note moyenne du jour en ligne,
  // grammes de café en ligne pointillée, caféine et détail dans le tooltip.
  function barresEtLigne30j(idCanvas, labels, comptes, moyennes, grammes, details) {
    creer(idCanvas, {
      data: {
        labels,
        datasets: [
          {
            type: "line", label: I18N.t("l_note_jour"), data: moyennes, yAxisID: "y2",
            borderColor: cssVar("--accent"), backgroundColor: cssVar("--accent"),
            spanGaps: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2,
          },
          {
            type: "line", label: I18N.t("l_cafe_g"), data: grammes, yAxisID: "y3",
            borderColor: C_DEUX, backgroundColor: C_DEUX,
            borderDash: [5, 4], borderWidth: 1.5, pointRadius: 2, pointHoverRadius: 4,
            spanGaps: false, tension: 0.3,
          },
          {
            type: "bar", label: I18N.t("l_extractions"), data: comptes, yAxisID: "y",
            backgroundColor: cssVar("--barre-neutre"), borderRadius: 4, maxBarThickness: 22,
          },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: items => {
                const i = items.length ? items[0].dataIndex : -1;
                if (i < 0 || !details || !details[i]) return "";
                return details[i];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: I18N.t("l_extractions") } },
          y2: { position: "right", min: 0, max: 10, grid: { drawOnChartArea: false }, title: { display: true, text: I18N.t("axe_note") } },
          y3: { display: false, beginAtZero: true },
        },
      },
    });
  }

  function barresHorizontales(idCanvas, items, couleurs, titreX, max) {
    creer(idCanvas, {
      type: "bar",
      data: {
        labels: items.map(i => i.label),
        datasets: [{
          data: items.map(i => i.value),
          backgroundColor: couleurs || items.map(() => cssVar("--accent")),
          borderRadius: 5, maxBarThickness: 26,
        }],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const it = items[ctx.dataIndex];
            const extra = it.extra ? " (" + it.extra + ")" : "";
            return " " + ctx.parsed.x.toFixed(1) + extra;
          } } },
        },
        scales: {
          x: { beginAtZero: true, max: max || undefined, title: titreX ? { display: true, text: titreX } : undefined },
          y: { grid: { display: false } },
        },
      },
    });
  }

  function comparatifMachines(idCanvas, cafesLabels, notesBrikka, notesSwitch) {
    creer(idCanvas, {
      type: "bar",
      data: {
        labels: cafesLabels,
        datasets: [
          { label: "Brikka", data: notesBrikka, backgroundColor: C_BRIKKA, borderRadius: 5, maxBarThickness: 24 },
          { label: "Switch", data: notesSwitch, backgroundColor: C_SWITCH, borderRadius: 5, maxBarThickness: 24 },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, max: 10, title: { display: true, text: I18N.t("axe_note_moy") } },
        },
      },
    });
  }

  function nuage(idCanvas, ptsBrikka, ptsSwitch, titreX, unite) {
    creer(idCanvas, {
      type: "scatter",
      data: {
        datasets: [
          { label: "Brikka", data: ptsBrikka, backgroundColor: C_BRIKKA + "cc", pointRadius: 5, pointHoverRadius: 7 },
          { label: "Switch", data: ptsSwitch, backgroundColor: C_SWITCH + "cc", pointRadius: 5, pointHoverRadius: 7 },
        ],
      },
      options: {
        plugins: {
          tooltip: { callbacks: { label: ctx => {
            const p = ctx.raw;
            return " " + (p.nom || "") + " : " + p.x + " " + unite + ", note " + p.y;
          } } },
        },
        scales: {
          x: { title: { display: true, text: titreX } },
          y: { min: 0, max: 10, title: { display: true, text: I18N.t("axe_note") } },
        },
      },
    });
  }

  function anneauDiagnostics(idCanvas, labels, valeurs) {
    creer(idCanvas, {
      type: "doughnut",
      data: {
        labels: labels.map(l => I18N.diag(l)),
        datasets: [{
          data: valeurs,
          backgroundColor: labels.map(l => C_DIAG[l] || "#999"),
          borderColor: cssVar("--panneau"),
          borderWidth: 3, hoverOffset: 8,
        }],
      },
      options: {
        cutout: "62%",
        plugins: { legend: { position: "right" } },
      },
    });
  }

  // ---------- Heatmap calendaire en SVG ----------

  // Clé de date en heure LOCALE (toISOString serait en UTC et décalerait d'un jour).
  function cleLocale(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const j = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + j;
  }

  function heatmap(conteneur, parJour, infoParJour, nbSemaines) {
    const el = typeof conteneur === "string" ? document.getElementById(conteneur) : conteneur;
    if (!el) return;
    const semaines = nbSemaines || 16;
    const cell = 17, gap = 4, gauche = 34, haut = 22;
    const largeur = gauche + semaines * (cell + gap);
    const hauteur = haut + 7 * (cell + gap);

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    // Recule jusqu'au lundi de la semaine courante puis remonte nbSemaines moins 1.
    const jourSem = (aujourdhui.getDay() + 6) % 7; // 0 = lundi
    const debut = new Date(aujourdhui);
    debut.setDate(debut.getDate() - jourSem - (semaines - 1) * 7);

    const JOURS = I18N.jours();
    const MOIS = I18N.mois();
    const cleAujourdhui = cleLocale(aujourdhui);

    // ÉCHELLE ABSOLUE, et pas relative au maximum. Avec une échelle relative,
    // un jour à une extraction se peignait dans la teinte la plus foncée dès
    // que le maximum valait 1, et la même couleur changeait de sens dès que le
    // maximum bougeait. Ici une couleur veut toujours dire la même chose, ce qui
    // rend la légende utile : 1, 2, 3, 4 et plus.
    const niveauDe = v => (v <= 0 ? 0 : Math.min(4, v));

    let svg = '<svg viewBox="0 0 ' + largeur + " " + hauteur + '" class="heatmap-svg" role="img" aria-label="' + I18N.t("hm_aria") + '">';
    [0, 2, 4, 6].forEach(j => {
      svg += '<text x="0" y="' + (haut + j * (cell + gap) + cell - 4) + '" class="hm-label">' + JOURS[j] + "</text>";
    });

    let dernierMois = -1;
    const d = new Date(debut);
    for (let s = 0; s < semaines; s++) {
      for (let j = 0; j < 7; j++) {
        if (d > aujourdhui) break;
        const cle = cleLocale(d);
        const v = parJour[cle] || 0;
        const niveau = niveauDe(v);
        const x = gauche + s * (cell + gap);
        const y = haut + j * (cell + gap);
        // Étiquette de mois sur la colonne qui contient le 1er : plus fiable que
        // de tester le lundi, qui pouvait sauter un mois.
        if (d.getDate() <= 7 && d.getMonth() !== dernierMois) {
          dernierMois = d.getMonth();
          svg += '<text x="' + x + '" y="12" class="hm-label">' + MOIS[dernierMois] + "</text>";
        }
        const info = infoParJour[cle] || "";
        const dateLoc = d.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long" });
        const compte = v === 0 ? I18N.t("hm_aucune") : I18N.t(v > 1 ? "hm_ns" : "hm_n", { n: v });
        // Le jour courant est cerclé : sans repère, s'orienter dans une grille de
        // plus de cent cases demande de compter les colonnes.
        const estAujourdhui = cle === cleAujourdhui;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
          '" rx="3" class="hm-cell hm-n' + niveau + (estAujourdhui ? " hm-aujourdhui" : "") +
          '" tabindex="0" data-tip="' +
          dateLoc + " : " + compte + (info ? ", " + info : "") + '"></rect>';
        d.setDate(d.getDate() + 1);
      }
    }
    svg += "</svg>";
    el.innerHTML = svg;
    // Sur petit écran, montre d'abord la période récente (à droite).
    el.scrollLeft = el.scrollWidth;
    attacherTooltips(el);
  }

  // ---------- Diagramme officiel de granulométrie du C5 ESP, en SVG ----------
  // Deux axes alignés (rotations en haut, microns en bas), boîtes de méthodes,
  // bandes de granulométrie, zone hachurée au delà de la butée, marqueurs
  // personnels, et mise en évidence des méthodes compatibles avec le réglage
  // saisi dans le convertisseur.

  const DIAG_RANGEES = [
    ["espresso", "v60", "coldbrew"],
    ["turkish", "brikka", "frenchpress"],
    ["aeropress"],
    ["pourover"],
    ["siphon", "colddrip"],
    ["switch"],
    ["filtermachine"],
    ["cupping"],
  ];

  function diagramme(conteneur, dialCourant, dialDefaut) {
    const el = typeof conteneur === "string" ? document.getElementById(conteneur) : conteneur;
    if (!el) return;
    const maxU = 1400;
    const largeur = 900, gauche = 14, droite = 14;
    const zone = largeur - gauche - droite;
    const hautAxe = 34;          // axe des rotations
    const debutBoites = 48;
    const ligneH = 34;
    const hBoite = 24;
    const yBandes = debutBoites + DIAG_RANGEES.length * ligneH + 8;
    const hBandes = 24;
    const hauteur = yBandes + hBandes + 34;
    const x = u => gauche + Math.max(0, Math.min(maxU, u)) / maxU * zone;
    const uCran = GRIND.MICRONS_PAR_CRAN;
    const p = dialCourant ? GRIND.parseDial(dialCourant) : null;

    let svg = '<svg viewBox="0 0 ' + largeur + " " + hauteur + '" class="diagramme-svg" role="img" aria-label="' + I18N.t("rg_aria") + '">';
    svg += '<defs><pattern id="hachures" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="9" class="dg-hachure"></line></pattern></defs>';

    // Zone hors de portée du moulin, au delà de la butée.
    const xButee = x(GRIND.MICRONS_BUTEE);
    svg += '<rect x="' + xButee + '" y="' + hautAxe + '" width="' + (x(maxU) - xButee) + '" height="' + (yBandes - hautAxe) + '" fill="url(#hachures)" class="dg-zone-hors"></rect>';

    // Axe du haut : rotations, graduation tous les 0.2.0 (10 crans), tirets par cran.
    svg += '<text x="' + gauche + '" y="12" class="dg-titre-axe">' + I18N.t("dg_rotations") + "</text>";
    for (let c = 0; c <= GRIND.CRANS_MAX; c++) {
      const gx = x(c * uCran);
      const majeur = c % 10 === 0;
      svg += '<line x1="' + gx + '" y1="' + (hautAxe - (majeur ? 9 : 4)) + '" x2="' + gx + '" y2="' + hautAxe + '" class="dg-tick"></line>';
      if (majeur) {
        svg += '<text x="' + gx + '" y="' + (hautAxe - 13) + '" text-anchor="middle" class="dg-axe">' + GRIND.dialDepuisCrans(c) + "</text>";
      }
    }
    svg += '<line x1="' + gauche + '" y1="' + hautAxe + '" x2="' + x(GRIND.MICRONS_BUTEE) + '" y2="' + hautAxe + '" class="dg-ligne"></line>';

    // Boîtes de méthodes.
    DIAG_RANGEES.forEach((rangee, i) => {
      const y = debutBoites + i * ligneH;
      rangee.forEach(id => {
        const m = GRIND.METHODES.find(v => v.id === id);
        if (!m) return;
        const x1 = x(m.minU), x2 = x(Math.min(m.maxU, maxU));
        const estSaisie = id === "brikka" || id === "switch";
        const compatible = p && p.microns >= m.minU && p.microns <= m.maxU;
        svg += '<g class="dg-boite' + (estSaisie ? " dg-boite-perso" : "") + (compatible ? " dg-boite-compatible" : "") + (p && !compatible ? " dg-boite-eteinte" : "") + '" data-tip="' +
          I18N.methode(m.nom) + " : " + I18N.t("rg_tip_court", { min: m.minU, max: m.maxU, minC: m.minC, maxC: m.maxC, mol: I18N.mol(m.molette) }) + '">' +
          '<rect x="' + x1 + '" y="' + y + '" width="' + Math.max(4, x2 - x1) + '" height="' + hBoite + '" rx="4"' +
          (estSaisie ? ' style="stroke:' + (id === "brikka" ? C_BRIKKA : C_SWITCH) + '"' : "") + "></rect>" +
          '<text x="' + ((x1 + x2) / 2) + '" y="' + (y + hBoite / 2 + 4) + '" text-anchor="middle" class="dg-nom">' + I18N.methode(m.nom) + "</text></g>";
      });
    });

    // Bandes de granulométrie et axe des microns.
    GRIND.BANDES.forEach(b => {
      const fin = b.max === Infinity ? maxU : b.max;
      const x1 = x(b.min), x2 = x(fin);
      svg += '<rect x="' + x1 + '" y="' + yBandes + '" width="' + (x2 - x1) + '" height="' + hBandes + '" class="dg-bande"></rect>' +
        '<text x="' + ((x1 + x2) / 2) + '" y="' + (yBandes + hBandes / 2 + 4) + '" text-anchor="middle" class="dg-bande-nom">' + b.nom + "</text>";
    });
    for (let u = 0; u <= maxU; u += 200) {
      svg += '<text x="' + x(u) + '" y="' + (yBandes + hBandes + 18) + '" text-anchor="middle" class="dg-axe">' + u + (u === maxU ? " µm" : "") + "</text>";
    }

    // Marqueurs personnels.
    GRIND.REFERENCES.forEach(r => {
      const u = r.crans * uCran;
      const gx = x(u);
      svg += '<line x1="' + gx + '" y1="' + hautAxe + '" x2="' + gx + '" y2="' + (yBandes + hBandes) + '" class="dg-ref" style="stroke:' + r.couleur + '"></line>' +
        '<circle cx="' + gx + '" cy="' + (hautAxe + 5) + '" r="4.5" style="fill:' + r.couleur + '" class="dg-ref-point" data-tip="' +
        r.dial + " : " + I18N.tr(r.usage) + ", " + r.crans + " " + I18N.t("cv_crans") + ", " + I18N.t("cv_environ") + " " + Math.round(u) + ' µm"></circle>';
    });

    /* Réglage par défaut de Chris, trait vert épais. Distinct du curseur noir :
       en glissant, il doit voir d'un coup d'oeil de combien il s'écarte de ce
       qu'il a réellement sur le moulin. */
    const pd = dialDefaut ? GRIND.parseDial(dialDefaut) : null;
    if (pd) {
      const dx = x(pd.microns);
      svg += '<line x1="' + dx + '" y1="' + (hautAxe - 4) + '" x2="' + dx + '" y2="' + (yBandes + hBandes) + '" class="dg-defaut"></line>';
    }

    // Curseur du convertisseur.
    if (p) {
      const gx = x(p.microns);
      svg += '<line x1="' + gx + '" y1="' + (hautAxe - 10) + '" x2="' + gx + '" y2="' + (yBandes + hBandes) + '" class="dg-curseur"></line>' +
        '<text x="' + gx + '" y="' + (hauteur - 2) + '" text-anchor="middle" class="dg-curseur-label">▲ ' + dialCourant + "</text>";
    }

    svg += "</svg>";
    el.innerHTML = svg;
    attacherTooltips(el);
  }

  // ---------- Tooltip maison pour les SVG ----------

  let tipEl = null;
  function attacherTooltips(racine) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "svg-tooltip";
      tipEl.setAttribute("hidden", "");
      document.body.appendChild(tipEl);
    }
    racine.querySelectorAll("[data-tip]").forEach(n => {
      n.addEventListener("mouseenter", e => {
        tipEl.textContent = n.getAttribute("data-tip");
        tipEl.removeAttribute("hidden");
      });
      n.addEventListener("mousemove", e => {
        const marge = 14;
        let xx = e.clientX + marge, yy = e.clientY + marge;
        const r = tipEl.getBoundingClientRect();
        if (xx + r.width > window.innerWidth - 8) xx = e.clientX - r.width - marge;
        if (yy + r.height > window.innerHeight - 8) yy = e.clientY - r.height - marge;
        tipEl.style.left = xx + "px";
        tipEl.style.top = yy + "px";
      });
      n.addEventListener("mouseleave", () => tipEl.setAttribute("hidden", ""));
      n.addEventListener("click", e => {
        // Sur téléphone : un appui montre le détail.
        tipEl.textContent = n.getAttribute("data-tip");
        tipEl.removeAttribute("hidden");
        tipEl.style.left = Math.min(e.clientX + 10, window.innerWidth - 220) + "px";
        tipEl.style.top = (e.clientY + 10) + "px";
        setTimeout(() => tipEl.setAttribute("hidden", ""), 2500);
      });
    });
  }

  return {
    C_BRIKKA, C_SWITCH, C_DEUX, C_DIAG,
    appliquerDefauts, toutDetruire,
    barresEtLigne30j, barresHorizontales, comparatifMachines, nuage, anneauDiagnostics,
    heatmap, diagramme,
  };
})();
