// Charts: Chart.js bundled locally, plus a home-made SVG heatmap and ruler.
// Data colours validated for colour blindness, do not change them
// lightly: Brikka #2a78d6, Switch #eb6834, both machines #cc79a7.
// These three describe a MACHINE, and nothing else may borrow them.
//
// The trio comes from the Okabe-Ito palette, the reference for colours safe
// for colour blindness: blue, vermilion, pink-purple. Both machines used an
// emerald green #1baf7a, safe as well but garish on an entirely warm palette
// and impossible to look at for long. The powder pink keeps the property and
// loses the garishness.
"use strict";

const CHARTS = (() => {

  const C_BRIKKA = "#2a78d6";
  const C_SWITCH = "#eb6834";
  const C_DEUX = "#cc79a7";

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
    if (typeof Chart === "undefined") return;
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
    // No animation when the system asks for less motion (v8.75).
    Chart.defaults.animation.duration = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700;
    Chart.defaults.animation.easing = "easeOutQuart";
    Chart.defaults.maintainAspectRatio = false;
  }

  /* LOADING CHART.JS ON DEMAND.

     The library weighs 68 KB gzipped, that is 30 % of the site's weight, and
     serves ONLY on the dashboard. The heatmap and the grinder ruler are
     home-made SVG and do not depend on it: opening the site on Entry, History
     or Guide must therefore download none of it.

     It stays PRECACHED by the service worker: the deferred load therefore
     also works offline, it simply reads the cache instead of the network.

     The queue keeps the LAST call per canvas. During the download, a render
     may be requested several times (language toggle, data notification):
     replaying everything would be waste, and replaying the first one would
     show a stale chart. */
  let chartReady = typeof Chart !== "undefined";
  let chartLoading = null;
  const enAttente = new Map();

  function chargerChart() {
    if (chartReady) return Promise.resolve(true);
    if (!chartLoading) {
      chartLoading = new Promise(resolve => {
        const s = document.createElement("script");
        s.src = OUTILS.urlVersionnee("js/vendor/chart.umd.js");
        s.onload = () => {
          chartReady = true;
          appliquerDefauts();
          resolve(true);
        };
        // A failure must not break the dashboard: the KPIs, the insights
        // and the SVG heatmap stay perfectly readable without the charts.
        s.onerror = () => { chartLoading = null; resolve(false); };
        document.head.appendChild(s);
      });
    }
    return chartLoading;
  }

  function flushQueue() {
    const jobs = [...enAttente.entries()];
    enAttente.clear();
    jobs.forEach(([id, config]) => creer(id, config));
  }

  function creer(idCanvas, config) {
    const el = document.getElementById(idCanvas);
    if (!el) return null;
    if (!chartReady) {
      enAttente.set(idCanvas, config);
      chargerChart().then(ok => { if (ok) flushQueue(); else enAttente.clear(); });
      return null;
    }
    /* UPDATE RATHER THAN RECREATE (v8.75). Every render destroyed then
       rebuilt the charts, with 700 ms of animation, even in the closed
       tabs. Same canvas, same type: we change the data and the options,
       without animation. */
    const ancien = registre[idCanvas];
    if (ancien && ancien.canvas === el && ancien.config.type === config.type) {
      ancien.data = config.data;
      ancien.options = config.options || {};
      ancien.update("none");
      return ancien;
    }
    if (ancien) ancien.destroy();
    registre[idCanvas] = new Chart(el.getContext("2d"), config);
    return registre[idCanvas];
  }

  function toutDetruire() {
    Object.keys(registre).forEach(k => { registre[k].destroy(); delete registre[k]; });
    enAttente.clear();
  }

  // Bars of the number of extractions per day, the day's average rating as a
  // line, grams of coffee as a dotted line, caffeine and detail in the tooltip.
  /* Three visible series and not four. The coffee grams curve was a fourth
     line on a chart that already carried three, on a hidden axis on top of
     that: it loaded the view without being readable. The figure moved into
     the tooltip, where it is looked up when one wants it. */
  function barresEtLigne30j(idCanvas, labels, comptes, moyennes, details, tendance, coffeesPerDay) {
    const lowest = Math.min(...moyennes.filter(n => n !== null), 10);
    const plancher = lowest < 4 ? Math.max(0, Math.floor(lowest / 2) * 2) : 4;
    /* ONE BLOCK PER CUP (v8.58). A full bar in a sixty-pixel band graduated
       up to 3: a one-cup day and a two-cup day looked alike, and Chris makes
       one or two almost every day. Each cup is now a stacked block, separated
       from the next by a hairline of the card colour: we COUNT them instead
       of reading a height. The scale stops at the month's biggest day (at
       least 2), with one tick per cup. */
    const maxCups = Math.max(2, ...comptes.map(Number).filter(Number.isFinite));
    const filet = cssVar("--panneau");
    /* THE COFFEE COLOUR (v8.61): the k-th block of a day takes the tint of
       the coffee of that day's k-th cup (rank computed by UI.rendreCafes30j,
       which writes the legend with the same tokens). Without a rank, neutral grey. */
    const neutre = cssVar("--barre-neutre");
    const teintes = [1, 2, 3, 4, 5].map(n => cssVar("--cafe-" + n));
    const teinte = (i, k) => {
      const r = coffeesPerDay && coffeesPerDay[i] ? coffeesPerDay[i][k] : -1;
      return r >= 0 && teintes[r] ? teintes[r] : neutre;
    };
    const paves = Array.from({ length: maxCups }, (_, k) => ({
      type: "bar", label: I18N.t("l_tasses_jour"), pave: k + 1, yAxisID: "y", stack: "tasses",
      data: comptes.map(c => (Number(c) > k ? 1 : null)),
      // The hairline between two blocks is the card colour, not a series colour.
      backgroundColor: comptes.map((_, i) => teinte(i, k)), borderColor: filet,
      borderWidth: 1.5, borderSkipped: false, borderRadius: 3, maxBarThickness: 16,
    }));
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
            /* Trend: same rating axis as the raw points, otherwise we would
               compare two different scales without seeing it. Thick stroke
               and no point, so it reads as a background and not as one more
               measure. The COLOUR serves the same intent: that of the
               rating it smooths, translucent. A foreign tint made it pass
               for a third piece of data, which it is not. */
            type: "line", label: I18N.t("l_tendance"), data: tendance || [], yAxisID: "y2",
            borderColor: cssVar("--tendance"), backgroundColor: cssVar("--tendance"),
            spanGaps: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 3,
            fill: false,
          },
          ...paves,
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          /* The blocks leave the legend: their colour is the coffees', named
             under the chart by the coffee legend. */
          legend: { labels: { filter: (item, data) => !data.datasets[item.datasetIndex].pave } },
          tooltip: {
            // In the tooltip too: the first block carries the day's total.
            filter: item => !(item.dataset.pave > 1) && !(item.dataset.pave === 1 && !Number(comptes[item.dataIndex])),
            callbacks: {
              label: item => (item.dataset.pave
                ? I18N.t("l_tasses_jour") + " : " + comptes[item.dataIndex]
                : item.dataset.label + " : " + (item.formattedValue || "")),
              afterBody: items => {
                const i = items.length ? items[0].dataIndex : -1;
                if (i < 0 || !details || !details[i]) return "";
                return details[i];
              },
            },
          },
        },
        /* TWO STACKED BANDS (v8.39) and not two overlaid axes. The cup bars
           and the rating line shared the same height, one graduated on the
           left, the other on the right: you had to guess which graduation
           read what, and the day's number of cups did not read at a
           glance. Here, the rating on top over two thirds, the cups at the
           bottom over one third, each with its graduation on the left, the
           same day axis below. */
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          /* Chart.js stacks the axes of one stack in the order they are
             declared, from bottom to top: the cups first, the rating next. */
          y: {
            stack: "trente", stackWeight: 1, position: "left", stacked: true, min: 0, max: maxCups,
            ticks: { stepSize: 1 },
            grid: { color: cssVar("--lignes-douces"), drawTicks: false },
            title: { display: true, text: I18N.t("axe_tasses") },
          },
          y2: {
            stack: "trente", stackWeight: 2, position: "left", min: plancher, max: 10,
            ticks: { stepSize: 2 },
            title: { display: true, text: I18N.t("axe_note_court") },
          },
        },
      },
    });
  }

  /* SHORT LABEL for axes and legends. In a one-column card,
     "The Coffee Chronicler's Recipe (Sweet)" was cut mid-word and gave
     "icler's Recipe (Sweet)", which names nothing. We truncate at a whole
     word with an ellipsis; the full name stays in the tooltip, which
     Chart.js builds separately. */
  const MAX_LABEL = 18;
  function shortLabel(texte) {
    const t = String(texte == null ? "" : texte);
    if (t.length <= MAX_LABEL) return t;
    return t.slice(0, MAX_LABEL).replace(/\s+\S*$/, "") + "…";
  }

  function barresHorizontales(idCanvas, items, couleurs, xTitle, max) {
    creer(idCanvas, {
      type: "bar",
      data: {
        /* The SHORT label on the axis, the full one in the tooltip: it is the
           tooltip title below that restores it. */
        labels: items.map(i => shortLabel(i.label)),
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
          tooltip: { callbacks: {
            title: ctx => (items[ctx[0].dataIndex] || {}).label || "",
            label: ctx => {
              const it = items[ctx.dataIndex];
              const extra = it.extra ? " (" + it.extra + ")" : "";
              return " " + ctx.parsed.x.toFixed(1) + extra;
            },
          } },
        },
        scales: {
          x: { beginAtZero: true, max: max || undefined, title: xTitle ? { display: true, text: xTitle } : undefined },
          y: { grid: { display: false } },
        },
      },
    });
  }

  function comparatifMachines(idCanvas, coffeeLabels, brikkaScores, switchScores) {
    creer(idCanvas, {
      type: "bar",
      data: {
        labels: coffeeLabels,
        datasets: [
          { label: "Brikka", data: brikkaScores, backgroundColor: C_BRIKKA, borderRadius: 5, maxBarThickness: 24 },
          { label: "Switch", data: switchScores, backgroundColor: C_SWITCH, borderRadius: 5, maxBarThickness: 24 },
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

  function nuage(idCanvas, brikkaPoints, switchPoints, xTitle, unite) {
    creer(idCanvas, {
      type: "scatter",
      data: {
        datasets: [
          { label: "Brikka", data: brikkaPoints, backgroundColor: C_BRIKKA + "cc", pointRadius: 5, pointHoverRadius: 7 },
          { label: "Switch", data: switchPoints, backgroundColor: C_SWITCH + "cc", pointRadius: 5, pointHoverRadius: 7 },
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
          x: { title: { display: true, text: xTitle } },
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
        plugins: {
          /* The ring's legend lives in a narrow column: "Acide ET amer
             (extraction inegale)" fitted there in three pixels. It is
             shortened at a whole word, and the tooltip gives the full name. */
          legend: {
            position: "right",
            labels: { generateLabels: ch => Chart.defaults.plugins.legend.labels
              .generateLabels(ch).map(l => ({ ...l, text: shortLabel(l.text) })) },
          },
          tooltip: { callbacks: { title: ctx => labels[ctx[0].dataIndex] || "" } },
        },
      },
    });
  }

  // ---------- Calendar heatmap in SVG ----------

  // Date key in local time, defined only once in outils.js.
  const cleLocale = OUTILS.cleLocale;

  function heatmap(conteneur, parJour, infoParJour, weekCount) {
    const el = typeof conteneur === "string" ? document.getElementById(conteneur) : conteneur;
    if (!el) return;
    const semaines = weekCount || 16;
    const cell = 17, gap = 4, gauche = 34, haut = 22;
    const largeur = gauche + semaines * (cell + gap);
    const hauteur = haut + 7 * (cell + gap);

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    // Goes back to the Monday of the current week then up weekCount minus 1.
    const dayOfWeek = (aujourdhui.getDay() + 6) % 7; // 0 = Monday
    const debut = new Date(aujourdhui);
    debut.setDate(debut.getDate() - dayOfWeek - (semaines - 1) * 7);

    const JOURS = I18N.jours();
    const MONTHS = I18N.mois();
    const todayKey = cleLocale(aujourdhui);

    // ABSOLUTE SCALE, not relative to the maximum. With a relative scale, a
    // one-extraction day was painted in the darkest tint as soon as the
    // maximum was 1, and the same colour changed meaning as soon as the
    // maximum moved. Here a colour always means the same thing, which makes
    // the legend useful: 1, 2, 3, 4 and more.
    const levelOf = v => (v <= 0 ? 0 : Math.min(4, v));

    let svg = '<svg viewBox="0 0 ' + largeur + " " + hauteur + '" class="heatmap-svg" role="img" aria-label="' + I18N.t("hm_aria") + '">';
    [0, 2, 4, 6].forEach(j => {
      svg += '<text x="0" y="' + (haut + j * (cell + gap) + cell - 4) + '" class="hm-label">' + JOURS[j] + "</text>";
    });

    let lastMonth = -1;
    const d = new Date(debut);
    for (let s = 0; s < semaines; s++) {
      for (let j = 0; j < 7; j++) {
        if (d > aujourdhui) break;
        const cle = cleLocale(d);
        const v = parJour[cle] || 0;
        const niveau = levelOf(v);
        const x = gauche + s * (cell + gap);
        const y = haut + j * (cell + gap);
        // Month label on the column that holds the 1st: more reliable than
        // testing the Monday, which could skip a month.
        if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          svg += '<text x="' + x + '" y="12" class="hm-label">' + MONTHS[lastMonth] + "</text>";
        }
        const info = infoParJour[cle] || "";
        const localDate = d.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long" });
        const compte = v === 0 ? I18N.t("hm_aucune") : I18N.t(v > 1 ? "hm_ns" : "hm_n", { n: v });
        // The current day is circled: without a landmark, finding your way in
        // a grid of more than a hundred cells means counting the columns.
        const isToday = cle === todayKey;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
          '" rx="3" class="hm-cell hm-n' + niveau + (isToday ? " hm-aujourdhui" : "") +
          '" tabindex="0" data-tip="' +
          localDate + " : " + compte + (info ? ", " + info : "") + '"></rect>';
        d.setDate(d.getDate() + 1);
      }
    }
    svg += "</svg>";
    el.innerHTML = svg;
    // On a small screen, show the recent period first (on the right).
    el.scrollLeft = el.scrollWidth;
    attacherTooltips(el);
  }

  // ---------- Official particle size chart of the C5 ESP, in SVG ----------
  // Two aligned axes (rotations on top, microns at the bottom), method boxes,
  // particle size bands, hatched area beyond the stop, personal markers, and
  // highlighting of the methods compatible with the setting entered in the
  // converter.

  const DIAG_ROWS = [
    ["espresso", "v60", "coldbrew"],
    ["turkish", "brikka", "frenchpress"],
    ["aeropress"],
    ["pourover"],
    ["siphon", "colddrip"],
    ["switch"],
    ["filtermachine"],
    ["cupping"],
  ];

  /* Skeleton of the ruler, kept per container. It only depends on the default
     setting and the language: as long as those two do not move, moving the
     cursor must redraw nothing but the cursor. */
  const rulers = new WeakMap();

  function diagramme(conteneur, currentDial, defaultDial) {
    const el = typeof conteneur === "string" ? document.getElementById(conteneur) : conteneur;
    if (!el) return;
    let cache = rulers.get(el);
    // The language matters: the method names and the tooltips are in the SVG.
    if (!cache || cache.defaut !== defaultDial || cache.lang !== I18N.lang() || !el.firstChild) {
      cache = buildRuler(el, defaultDial);
      rulers.set(el, cache);
    }
    placeCursor(cache, currentDial);
  }

  function buildRuler(el, defaultDial) {
    const maxU = 1400;
    const largeur = 900, gauche = 14, droite = 14;
    const zone = largeur - gauche - droite;
    const axisTop = 34;          // rotations axis
    const boxesTop = 48;
    const rowH = 34;
    const boxH = 24;
    const bandsY = boxesTop + DIAG_ROWS.length * rowH + 8;
    const bandsH = 24;
    const hauteur = bandsY + bandsH + 34;
    const x = u => gauche + Math.max(0, Math.min(maxU, u)) / maxU * zone;
    const umPerStep = GRIND.MICRONS_PAR_CRAN;

    let svg = '<svg viewBox="0 0 ' + largeur + " " + hauteur + '" class="diagramme-svg" role="img" aria-label="' + I18N.t("rg_aria") + '">';
    svg += '<defs><pattern id="hachures" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="9" class="dg-hachure"></line></pattern></defs>';

    // Area out of the grinder's reach, beyond the stop.
    const xStop = x(GRIND.MICRONS_BUTEE);
    svg += '<rect x="' + xStop + '" y="' + axisTop + '" width="' + (x(maxU) - xStop) + '" height="' + (bandsY - axisTop) + '" fill="url(#hachures)" class="dg-zone-hors"></rect>';

    // Top axis: rotations, a graduation every 0.2.0 (10 clicks), a tick per click.
    svg += '<text x="' + gauche + '" y="12" class="dg-titre-axe">' + I18N.t("dg_rotations") + "</text>";
    for (let c = 0; c <= GRIND.CRANS_MAX; c++) {
      const gx = x(c * umPerStep);
      const major = c % 10 === 0;
      svg += '<line x1="' + gx + '" y1="' + (axisTop - (major ? 9 : 4)) + '" x2="' + gx + '" y2="' + axisTop + '" class="dg-tick"></line>';
      if (major) {
        svg += '<text x="' + gx + '" y="' + (axisTop - 13) + '" text-anchor="middle" class="dg-axe">' + GRIND.dialDepuisCrans(c) + "</text>";
      }
    }
    svg += '<line x1="' + gauche + '" y1="' + axisTop + '" x2="' + x(GRIND.MICRONS_BUTEE) + '" y2="' + axisTop + '" class="dg-ligne"></line>';

    /* Method boxes. The compatibility classes are NOT set here: they depend
       on the cursor, so they change on every click. We keep the bounds of
       each box to be able to replay them without rereading everything. */
    const boites = [];
    DIAG_ROWS.forEach((rangee, i) => {
      const y = boxesTop + i * rowH;
      rangee.forEach(id => {
        const m = GRIND.METHODES.find(v => v.id === id);
        if (!m) return;
        const x1 = x(m.minU), x2 = x(Math.min(m.maxU, maxU));
        const isOwn = id === "brikka" || id === "switch";
        boites.push({ id, minU: m.minU, maxU: m.maxU });
        svg += '<g class="dg-boite' + (isOwn ? " dg-boite-perso" : "") + '" data-boite="' + id + '" data-tip="' +
          I18N.methode(m.nom) + " : " + I18N.t("rg_tip_court", { min: m.minU, max: m.maxU, minC: m.minC, maxC: m.maxC, mol: I18N.mol(m.molette) }) + '">' +
          '<rect x="' + x1 + '" y="' + y + '" width="' + Math.max(4, x2 - x1) + '" height="' + boxH + '" rx="4"' +
          (isOwn ? ' style="stroke:' + (id === "brikka" ? C_BRIKKA : C_SWITCH) + '"' : "") + "></rect>" +
          '<text x="' + ((x1 + x2) / 2) + '" y="' + (y + boxH / 2 + 4) + '" text-anchor="middle" class="dg-nom">' + I18N.methode(m.nom) + "</text></g>";
      });
    });

    // Particle size bands and the microns axis.
    GRIND.BANDES.forEach(b => {
      const bandEnd = b.max === Infinity ? maxU : b.max;
      const x1 = x(b.min), x2 = x(bandEnd);
      svg += '<rect x="' + x1 + '" y="' + bandsY + '" width="' + (x2 - x1) + '" height="' + bandsH + '" class="dg-bande"></rect>' +
        '<text x="' + ((x1 + x2) / 2) + '" y="' + (bandsY + bandsH / 2 + 4) + '" text-anchor="middle" class="dg-bande-nom">' + b.nom + "</text>";
    });
    for (let u = 0; u <= maxU; u += 200) {
      svg += '<text x="' + x(u) + '" y="' + (bandsY + bandsH + 18) + '" text-anchor="middle" class="dg-axe">' + u + (u === maxU ? " µm" : "") + "</text>";
    }

    // Personal markers.
    GRIND.REFERENCES.forEach(r => {
      const u = r.crans * umPerStep;
      const gx = x(u);
      svg += '<line x1="' + gx + '" y1="' + axisTop + '" x2="' + gx + '" y2="' + (bandsY + bandsH) + '" class="dg-ref" style="stroke:' + r.couleur + '"></line>' +
        '<circle cx="' + gx + '" cy="' + (axisTop + 5) + '" r="4.5" style="fill:' + r.couleur + '" class="dg-ref-point" data-tip="' +
        r.dial + " : " + I18N.tr(r.usage) + ", " + r.crans + " " + I18N.t("cv_crans") + ", " + I18N.t("cv_environ") + " " + Math.round(u) + ' µm"></circle>';
    });

    /* Chris's default setting, thick green stroke. Distinct from the black
       cursor: while sliding, he must see at a glance how far he strays from
       what he really has on the grinder. */
    const pd = defaultDial ? GRIND.parseDial(defaultDial) : null;
    if (pd) {
      const dx = x(pd.microns);
      svg += '<line x1="' + dx + '" y1="' + (axisTop - 4) + '" x2="' + dx + '" y2="' + (bandsY + bandsH) + '" class="dg-defaut"></line>';
    }

    /* Converter cursor. It is ALWAYS in the skeleton, hidden by display, the SVG attribute, when
       there is nothing to show: creating and destroying it as it moves
       would mean redoing by hand exactly what we are trying to avoid. */
    svg += '<line x1="0" y1="' + (axisTop - 10) + '" x2="0" y2="' + (bandsY + bandsH) + '" class="dg-curseur" data-curseur display="none"></line>' +
      '<text x="0" y="' + (hauteur - 2) + '" text-anchor="middle" class="dg-curseur-label" data-curseur-label display="none"></text>';

    svg += "</svg>";
    el.innerHTML = svg;
    attacherTooltips(el);

    return {
      defaut: defaultDial, lang: I18N.lang(), x, boites,
      trait: el.querySelector("[data-curseur]"),
      etiquette: el.querySelector("[data-curseur-label]"),
      noeuds: new Map(boites.map(b => [b.id, el.querySelector('[data-boite="' + b.id + '"]')])),
    };
  }

  /* The only work redone on every click: moving two nodes and replaying two
     classes per box. Nothing like the full redraw. */
  function placeCursor(cache, currentDial) {
    const p = currentDial ? GRIND.parseDial(currentDial) : null;
    const { trait, etiquette } = cache;
    if (!p) {
      if (trait) trait.setAttribute("display", "none");
      if (etiquette) etiquette.setAttribute("display", "none");
    } else {
      const gx = cache.x(p.microns);
      if (trait) {
        trait.setAttribute("x1", gx);
        trait.setAttribute("x2", gx);
        trait.removeAttribute("display");
      }
      if (etiquette) {
        etiquette.setAttribute("x", gx);
        etiquette.textContent = "▲ " + currentDial;
        etiquette.removeAttribute("display");
      }
    }
    for (const b of cache.boites) {
      const n = cache.noeuds.get(b.id);
      if (!n) continue;
      const compatible = !!p && p.microns >= b.minU && p.microns <= b.maxU;
      n.classList.toggle("dg-boite-compatible", compatible);
      n.classList.toggle("dg-boite-eteinte", !!p && !compatible);
    }
  }

  // ---------- Home-made tooltip for the SVGs ----------

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
        // On the phone: a tap shows the detail.
        tipEl.textContent = n.getAttribute("data-tip");
        tipEl.removeAttribute("hidden");
        tipEl.style.left = Math.min(e.clientX + 10, window.innerWidth - 220) + "px";
        tipEl.style.top = (e.clientY + 10) + "px";
        setTimeout(() => tipEl.setAttribute("hidden", ""), 2500);
      });
    });
  }

  /* THE AROMA WHEEL (v8.45), in home-made SVG like the calendar.

     The ten families of the vocabulary (DESCRIPTEURS_GROUPES) in the centre,
     their tastes around. The share of each arc: how many times it was ticked
     on the rated cups. Its tint: the average rating of those cups, as accent
     opacity, from WHEEL_LOW_SCORE (pale) to WHEEL_HIGH_SCORE (full). Touching
     a family unfolds it and lists its tastes, with their rating and count.

     Returns the number of tastes drawn: zero, and the caller shows the empty card.
     The "chosen family" state lives here, by wheel id, to survive the
     dashboard re-renders. */
  const WHEEL_LOW_SCORE = 5, WHEEL_HIGH_SCORE = 8.5;
  const wheelChoice = new Map();
  function roueAromes(notees, ids) {
    const o = Object.assign({ svg: "roue-aromes", detail: "roue-detail", lecture: "lecture-aromes" }, ids || {});
    const svg = document.getElementById(o.svg);
    if (!svg) return 0;
    const parTag = {};
    notees.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => {
      (parTag[t] = parTag[t] || []).push(Number(e.note_sur_10));
    }));
    const moy = a => a.reduce((s, x) => s + x, 0) / a.length;
    const familles = DESCRIPTEURS_GROUPES.map(g => {
      const gouts = g.tags.filter(t => parTag[t]).map(t => ({ tag: t, n: parTag[t].length, note: moy(parTag[t]) }));
      const n = gouts.reduce((s, x) => s + x.n, 0);
      return { nom: g.nom, gouts, n, note: n ? gouts.reduce((s, x) => s + x.n * x.note, 0) / n : 0 };
    }).filter(f => f.n > 0);
    const total = familles.reduce((s, f) => s + f.n, 0);
    const detail = document.getElementById(o.detail), lecture = document.getElementById(o.lecture);
    if (!total) {
      svg.innerHTML = "";
      if (detail) detail.innerHTML = "";
      if (lecture) lecture.textContent = "";
      return 0;
    }
    const mostTicked = familles.slice().sort((a, b) => b.n - a.n)[0];
    if (!familles.some(f => f.nom === wheelChoice.get(o.svg))) wheelChoice.set(o.svg, mostTicked.nom);

    const C = 150, TURN = Math.PI * 2, GAP = 0.01;
    const opacite = note => Math.max(0.16, Math.min(1,
      0.16 + ((note - WHEEL_LOW_SCORE) / (WHEEL_HIGH_SCORE - WHEEL_LOW_SCORE)) * 0.84));
    const pt = (r, a) => (C + r * Math.sin(a)).toFixed(2) + " " + (C - r * Math.cos(a)).toFixed(2);
    const sector = (r0, r1, a0, a1) => {
      const g = a1 - a0 > Math.PI ? 1 : 0;
      return "M" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 " + g + " 1 " + pt(r1, a1) +
        " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 " + g + " 0 " + pt(r0, a0) + " Z";
    };
    const note1 = n => Number(n.toFixed(1)).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 });
    const echap = OUTILS.echap;

    function peindre() {
      const choisie = wheelChoice.get(o.svg);
      let a = 0, html = "";
      familles.forEach(f => {
        // A family alone makes the full circle: we leave a gap so that
        // the arc stays an arc and does not close on itself.
        const af = Math.min((f.n / total) * TURN, TURN - 0.001);
        const actif = f.nom === choisie;
        const familyName = I18N.groupe(f.nom);
        html += '<path d="' + sector(46, 92, a + GAP, a + af - GAP) + '" class="roue-famille' + (actif ? " choisie" : "") +
          '" data-famille="' + echap(f.nom) + '" tabindex="0" role="button" aria-pressed="' + actif +
          '" aria-label="' + echap(familyName + ", " + note1(f.note)) + '"><title>' + echap(familyName) + "</title></path>";
        let b = a;
        f.gouts.forEach(g => {
          const ag = (g.n / total) * TURN;
          html += '<path d="' + sector(96, actif ? 146 : 138, b + GAP, b + ag - GAP) + '" class="roue-gout" style="fill-opacity:' +
            opacite(g.note).toFixed(2) + '" data-famille="' + echap(f.nom) + '"><title>' +
            echap(I18N.tag(g.tag) + " : " + note1(g.note) + ", " + I18N.t("roue_fois", { n: g.n })) + "</title></path>";
          b += ag;
        });
        a += af;
      });
      const f = familles.find(x => x.nom === choisie);
      const court = I18N.groupe(f.nom);
      html += '<text x="150" y="146" text-anchor="middle" class="roue-centre-nom">' +
        echap(court.length > 14 ? court.split(" ")[0] : court) + "</text>" +
        '<text x="150" y="170" text-anchor="middle" class="roue-centre-note">' + note1(f.note) + "</text>";
      svg.innerHTML = html;
      if (detail) {
        detail.innerHTML = '<h4 class="roue-titre">' + echap(I18N.groupe(f.nom)) + "</h4>" +
          f.gouts.slice().sort((x, y) => y.note - x.note).map(g =>
            '<div class="roue-ligne"><span>' + echap(I18N.tag(g.tag)) + "</span><span>" +
            I18N.t("roue_fois", { n: g.n }) + "</span><b>" + note1(g.note) + "</b></div>").join("");
      }
    }
    peindre();
    if (lecture) {
      const mieux = familles.filter(x => x.n >= 3).sort((x, y) => y.note - x.note)[0];
      lecture.textContent = I18N.t(mieux && mieux.nom !== mostTicked.nom ? "roue_lecture" : "roue_lecture_seule", {
        f: I18N.groupe(mostTicked.nom), n: mostTicked.n, m: mieux ? I18N.groupe(mieux.nom) : "", x: mieux ? note1(mieux.note) : "",
      });
    }
    // Wired ONCE per wheel: the SVG survives re-renders, only its content changes.
    if (!svg.dataset.branche) {
      svg.dataset.branche = "1";
      const choisir = ev => {
        const p = ev.target.closest(".roue-famille, .roue-gout");
        if (!p) return;
        if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        wheelChoice.set(o.svg, p.dataset.famille);
        svg._peindre();
        if (ev.type === "keydown") {
          const cible = [...svg.querySelectorAll(".roue-famille")].find(x => x.dataset.famille === p.dataset.famille);
          if (cible) cible.focus();
        }
      };
      svg.addEventListener("click", choisir);
      svg.addEventListener("keydown", choisir);
    }
    svg._peindre = peindre;
    return familles.reduce((s, x) => s + x.gouts.length, 0);
  }

  return {
    C_BRIKKA, C_SWITCH, C_DEUX, C_DIAG, roueAromes,
    appliquerDefauts, toutDetruire, chargerChart,
    barresEtLigne30j, barresHorizontales, comparatifMachines, nuage, anneauDiagnostics,
    heatmap, diagramme,
  };
})();
