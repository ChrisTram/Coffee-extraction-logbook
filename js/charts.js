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
  const C_BOTH = "#cc79a7";

  const C_DIAG = {
    "Équilibré": C_BOTH,
    "Sous-extrait (acide)": "#d9a410",
    "Sur-extrait (amer)": "#8a4a2b",
    "Astringent": "#9467bd",
    "Acide ET amer (extraction inégale)": "#e17aa4",
    "Trop léger (aqueux)": "#74b3e3",
    "Trop fort (concentré)": "#4a6fa5",
    "Creux, plat (café éventé)": "#b5a642",
    "Brûlé (défaut du sachet)": "#7f7f7f",
  };

  const registry = {};

  function cssVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function applyDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar("--muted");
    Chart.defaults.borderColor = cssVar("--lines-chart");
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar("--tooltip-bg");
    Chart.defaults.plugins.tooltip.titleColor = cssVar("--tooltip-text");
    Chart.defaults.plugins.tooltip.bodyColor = cssVar("--tooltip-text");
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
  const pending = new Map();

  function loadChart() {
    if (chartReady) return Promise.resolve(true);
    if (!chartLoading) {
      chartLoading = new Promise(resolve => {
        const s = document.createElement("script");
        s.src = TOOLS.versionedUrl("js/vendor/chart.umd.js");
        s.onload = () => {
          chartReady = true;
          applyDefaults();
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
    const jobs = [...pending.entries()];
    pending.clear();
    jobs.forEach(([id, config]) => create(id, config));
  }

  function create(idCanvas, config) {
    const el = document.getElementById(idCanvas);
    if (!el) return null;
    if (!chartReady) {
      pending.set(idCanvas, config);
      loadChart().then(ok => { if (ok) flushQueue(); else pending.clear(); });
      return null;
    }
    /* UPDATE RATHER THAN RECREATE (v8.75). Every render destroyed then
       rebuilt the charts, with 700 ms of animation, even in the closed
       tabs. Same canvas, same type: we change the data and the options,
       without animation. */
    const existing = registry[idCanvas];
    if (existing && existing.canvas === el && existing.config.type === config.type) {
      existing.data = config.data;
      existing.options = config.options || {};
      existing.update("none");
      return existing;
    }
    if (existing) existing.destroy();
    registry[idCanvas] = new Chart(el.getContext("2d"), config);
    return registry[idCanvas];
  }

  function destroyAll() {
    Object.keys(registry).forEach(k => { registry[k].destroy(); delete registry[k]; });
    pending.clear();
  }

  // Bars of the number of extractions per day, the day's average rating as a
  // line, grams of coffee as a dotted line, caffeine and detail in the tooltip.
  /* Three visible series and not four. The coffee grams curve was a fourth
     line on a chart that already carried three, on a hidden axis on top of
     that: it loaded the view without being readable. The figure moved into
     the tooltip, where it is looked up when one wants it. */
  function barsAndLine30d(idCanvas, labels, counts, averages, details, trend, coffeesPerDay) {
    const lowest = Math.min(...averages.filter(n => n !== null), 10);
    const yFloor = lowest < 4 ? Math.max(0, Math.floor(lowest / 2) * 2) : 4;
    /* ONE BLOCK PER CUP (v8.58). A full bar in a sixty-pixel band graduated
       up to 3: a one-cup day and a two-cup day looked alike, and Chris makes
       one or two almost every day. Each cup is now a stacked block, separated
       from the next by a hairline of the card colour: we COUNT them instead
       of reading a height. The scale stops at the month's biggest day (at
       least 2), with one tick per cup. */
    const maxCups = Math.max(2, ...counts.map(Number).filter(Number.isFinite));
    const borderTint = cssVar("--panel");
    /* THE COFFEE COLOUR (v8.61): the k-th block of a day takes the tint of
       the coffee of that day's k-th cup (rank computed by UI.renderCoffees30d,
       which writes the legend with the same tokens). Without a rank, neutral grey. */
    const neutral = cssVar("--bar-neutral");
    const tints = [1, 2, 3, 4, 5].map(n => cssVar("--coffee-" + n));
    const tint = (i, k) => {
      const r = coffeesPerDay && coffeesPerDay[i] ? coffeesPerDay[i][k] : -1;
      return r >= 0 && tints[r] ? tints[r] : neutral;
    };
    const tiles = Array.from({ length: maxCups }, (_, k) => ({
      type: "bar", label: I18N.t("chart_cups_per_day"), isTile: k + 1, yAxisID: "y", stack: "tasses",
      data: counts.map(c => (Number(c) > k ? 1 : null)),
      // The hairline between two blocks is the card colour, not a series colour.
      backgroundColor: counts.map((_, i) => tint(i, k)), borderColor: borderTint,
      borderWidth: 1.5, borderSkipped: false, borderRadius: 3, maxBarThickness: 16,
    }));
    create(idCanvas, {
      data: {
        labels,
        datasets: [
          {
            type: "line", label: I18N.t("chart_daily_score"), data: averages, yAxisID: "y2",
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
            type: "line", label: I18N.t("chart_trend"), data: trend || [], yAxisID: "y2",
            borderColor: cssVar("--trend"), backgroundColor: cssVar("--trend"),
            spanGaps: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 3,
            fill: false,
          },
          ...tiles,
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          /* The blocks leave the legend: their colour is the coffees', named
             under the chart by the coffee legend. */
          legend: { labels: { filter: (item, data) => !data.datasets[item.datasetIndex].isTile } },
          tooltip: {
            // In the tooltip too: the first block carries the day's total.
            filter: item => !(item.dataset.isTile > 1) && !(item.dataset.isTile === 1 && !Number(counts[item.dataIndex])),
            callbacks: {
              label: item => (item.dataset.isTile
                ? I18N.t("chart_cups_per_day") + " : " + counts[item.dataIndex]
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
            grid: { color: cssVar("--lines-soft"), drawTicks: false },
            title: { display: true, text: I18N.t("axis_cups") },
          },
          y2: {
            stack: "trente", stackWeight: 2, position: "left", min: yFloor, max: 10,
            ticks: { stepSize: 2 },
            title: { display: true, text: I18N.t("axis_score_short") },
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
  function shortLabel(text) {
    const t = String(text == null ? "" : text);
    if (t.length <= MAX_LABEL) return t;
    return t.slice(0, MAX_LABEL).replace(/\s+\S*$/, "") + "…";
  }

  function horizontalBars(idCanvas, items, colors, xTitle, max) {
    create(idCanvas, {
      type: "bar",
      data: {
        /* The SHORT label on the axis, the full one in the tooltip: it is the
           tooltip title below that restores it. */
        labels: items.map(i => shortLabel(i.label)),
        datasets: [{
          data: items.map(i => i.value),
          backgroundColor: colors || items.map(() => cssVar("--accent")),
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

  function machineComparison(idCanvas, coffeeLabels, brikkaScores, switchScores) {
    create(idCanvas, {
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
          y: { beginAtZero: true, max: 10, title: { display: true, text: I18N.t("axis_average_score") } },
        },
      },
    });
  }

  function scatter(idCanvas, brikkaPoints, switchPoints, xTitle, unit) {
    create(idCanvas, {
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
            return " " + (p.nom || "") + " : " + p.x + " " + unit + ", note " + p.y;
          } } },
        },
        scales: {
          x: { title: { display: true, text: xTitle } },
          y: { min: 0, max: 10, title: { display: true, text: I18N.t("axis_score") } },
        },
      },
    });
  }

  function diagnosticsRing(idCanvas, labels, values) {
    create(idCanvas, {
      type: "doughnut",
      data: {
        labels: labels.map(l => I18N.diag(l)),
        datasets: [{
          data: values,
          backgroundColor: labels.map(l => C_DIAG[l] || "#999"),
          borderColor: cssVar("--panel"),
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

  // Date key in local time, defined only once in tools.js.
  const localDateKey = TOOLS.localDateKey;

  function heatmap(container, perDay, infoByDay, weekCount) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;
    const weeks = weekCount || 16;
    const cell = 17, gap = 4, left = 34, high = 22;
    const width = left + weeks * (cell + gap);
    const height = high + 7 * (cell + gap);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Goes back to the Monday of the current week then up weekCount minus 1.
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(today);
    start.setDate(start.getDate() - dayOfWeek - (weeks - 1) * 7);

    const DAY_NAMES = I18N.days();
    const MONTHS = I18N.months();
    const todayKey = localDateKey(today);

    // ABSOLUTE SCALE, not relative to the maximum. With a relative scale, a
    // one-extraction day was painted in the darkest tint as soon as the
    // maximum was 1, and the same colour changed meaning as soon as the
    // maximum moved. Here a colour always means the same thing, which makes
    // the legend useful: 1, 2, 3, 4 and more.
    const levelOf = v => (v <= 0 ? 0 : Math.min(4, v));

    let svg = '<svg viewBox="0 0 ' + width + " " + height + '" class="heatmap-svg" role="img" aria-label="' + I18N.t("heatmap_aria") + '">';
    [0, 2, 4, 6].forEach(j => {
      svg += '<text x="0" y="' + (high + j * (cell + gap) + cell - 4) + '" class="hm-label">' + DAY_NAMES[j] + "</text>";
    });

    let lastMonth = -1;
    const d = new Date(start);
    for (let s = 0; s < weeks; s++) {
      for (let j = 0; j < 7; j++) {
        if (d > today) break;
        const key = localDateKey(d);
        const v = perDay[key] || 0;
        const level = levelOf(v);
        const x = left + s * (cell + gap);
        const y = high + j * (cell + gap);
        // Month label on the column that holds the 1st: more reliable than
        // testing the Monday, which could skip a month.
        if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          svg += '<text x="' + x + '" y="12" class="hm-label">' + MONTHS[lastMonth] + "</text>";
        }
        const info = infoByDay[key] || "";
        const localDate = d.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long" });
        const count = v === 0 ? I18N.t("heatmap_none") : I18N.t(v > 1 ? "heatmap_many" : "heatmap_one", { n: v });
        // The current day is circled: without a landmark, finding your way in
        // a grid of more than a hundred cells means counting the columns.
        const isToday = key === todayKey;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
          '" rx="3" class="hm-cell hm-n' + level + (isToday ? " hm-today" : "") +
          '" tabindex="0" data-tip="' +
          localDate + " : " + count + (info ? ", " + info : "") + '"></rect>';
        d.setDate(d.getDate() + 1);
      }
    }
    svg += "</svg>";
    el.innerHTML = svg;
    // On a small screen, show the recent period first (on the right).
    el.scrollLeft = el.scrollWidth;
    attachTooltips(el);
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

  function diagram(container, currentDial, defaultDial) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    if (!el) return;
    let cache = rulers.get(el);
    // The language matters: the method names and the tooltips are in the SVG.
    if (!cache || cache.defaultDial !== defaultDial || cache.lang !== I18N.lang() || !el.firstChild) {
      cache = buildRuler(el, defaultDial);
      rulers.set(el, cache);
    }
    placeCursor(cache, currentDial);
  }

  function buildRuler(el, defaultDial) {
    const maxU = 1400;
    const width = 900, left = 14, right = 14;
    const zone = width - left - right;
    const axisTop = 34;          // rotations axis
    const boxesTop = 48;
    const rowH = 34;
    const boxH = 24;
    const bandsY = boxesTop + DIAG_ROWS.length * rowH + 8;
    const bandsH = 24;
    const height = bandsY + bandsH + 34;
    const x = u => left + Math.max(0, Math.min(maxU, u)) / maxU * zone;
    const umPerStep = GRIND.MICRONS_PER_CLICK;

    let svg = '<svg viewBox="0 0 ' + width + " " + height + '" class="diagram-svg" role="img" aria-label="' + I18N.t("range_aria") + '">';
    svg += '<defs><pattern id="hatching" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="9" class="dg-hatch"></line></pattern></defs>';

    // Area out of the grinder's reach, beyond the stop.
    const xStop = x(GRIND.MICRONS_AT_STOP);
    svg += '<rect x="' + xStop + '" y="' + axisTop + '" width="' + (x(maxU) - xStop) + '" height="' + (bandsY - axisTop) + '" fill="url(#hatching)" class="dg-zone-out"></rect>';

    // Top axis: rotations, a graduation every 0.2.0 (10 clicks), a tick per click.
    svg += '<text x="' + left + '" y="12" class="dg-title-axis">' + I18N.t("grind_dial_rotations") + "</text>";
    for (let c = 0; c <= GRIND.MAX_CLICKS; c++) {
      const gx = x(c * umPerStep);
      const major = c % 10 === 0;
      svg += '<line x1="' + gx + '" y1="' + (axisTop - (major ? 9 : 4)) + '" x2="' + gx + '" y2="' + axisTop + '" class="dg-tick"></line>';
      if (major) {
        svg += '<text x="' + gx + '" y="' + (axisTop - 13) + '" text-anchor="middle" class="dg-axis">' + GRIND.dialFromClicks(c) + "</text>";
      }
    }
    svg += '<line x1="' + left + '" y1="' + axisTop + '" x2="' + x(GRIND.MICRONS_AT_STOP) + '" y2="' + axisTop + '" class="dg-row"></line>';

    /* Method boxes. The compatibility classes are NOT set here: they depend
       on the cursor, so they change on every click. We keep the bounds of
       each box to be able to replay them without rereading everything. */
    const boxes = [];
    DIAG_ROWS.forEach((rowIds, i) => {
      const y = boxesTop + i * rowH;
      rowIds.forEach(id => {
        const m = GRIND.METHODS.find(v => v.id === id);
        if (!m) return;
        const x1 = x(m.minU), x2 = x(Math.min(m.maxU, maxU));
        const isOwn = id === "brikka" || id === "switch";
        boxes.push({ id, minU: m.minU, maxU: m.maxU });
        svg += '<g class="dg-box' + (isOwn ? " dg-box-own" : "") + '" data-box="' + id + '" data-tip="' +
          I18N.method(m.nom) + " : " + I18N.t("range_tip_short", { min: m.minU, max: m.maxU, minC: m.minC, maxC: m.maxC, dial: I18N.dialRange(m.dialText) }) + '">' +
          '<rect x="' + x1 + '" y="' + y + '" width="' + Math.max(4, x2 - x1) + '" height="' + boxH + '" rx="4"' +
          (isOwn ? ' style="stroke:' + (id === "brikka" ? C_BRIKKA : C_SWITCH) + '"' : "") + "></rect>" +
          '<text x="' + ((x1 + x2) / 2) + '" y="' + (y + boxH / 2 + 4) + '" text-anchor="middle" class="dg-name">' + I18N.method(m.nom) + "</text></g>";
      });
    });

    // Particle size bands and the microns axis.
    GRIND.GRIND_BANDS.forEach(b => {
      const bandEnd = b.max === Infinity ? maxU : b.max;
      const x1 = x(b.min), x2 = x(bandEnd);
      svg += '<rect x="' + x1 + '" y="' + bandsY + '" width="' + (x2 - x1) + '" height="' + bandsH + '" class="dg-band"></rect>' +
        '<text x="' + ((x1 + x2) / 2) + '" y="' + (bandsY + bandsH / 2 + 4) + '" text-anchor="middle" class="dg-band-name">' + b.nom + "</text>";
    });
    for (let u = 0; u <= maxU; u += 200) {
      svg += '<text x="' + x(u) + '" y="' + (bandsY + bandsH + 18) + '" text-anchor="middle" class="dg-axis">' + u + (u === maxU ? " µm" : "") + "</text>";
    }

    // Personal markers.
    GRIND.REFERENCES.forEach(r => {
      const u = r.clicks * umPerStep;
      const gx = x(u);
      svg += '<line x1="' + gx + '" y1="' + axisTop + '" x2="' + gx + '" y2="' + (bandsY + bandsH) + '" class="dg-ref" style="stroke:' + r.color + '"></line>' +
        '<circle cx="' + gx + '" cy="' + (axisTop + 5) + '" r="4.5" style="fill:' + r.color + '" class="dg-ref-point" data-tip="' +
        r.dial + " : " + I18N.tr(r.usage) + ", " + r.clicks + " " + I18N.t("conv_clicks") + ", " + I18N.t("conv_about") + " " + Math.round(u) + ' µm"></circle>';
    });

    /* Chris's default setting, thick green stroke. Distinct from the black
       cursor: while sliding, he must see at a glance how far he strays from
       what he really has on the grinder. */
    const pd = defaultDial ? GRIND.parseDial(defaultDial) : null;
    if (pd) {
      const dx = x(pd.microns);
      svg += '<line x1="' + dx + '" y1="' + (axisTop - 4) + '" x2="' + dx + '" y2="' + (bandsY + bandsH) + '" class="dg-default"></line>';
    }

    /* Converter cursor. It is ALWAYS in the skeleton, hidden by display, the SVG attribute, when
       there is nothing to show: creating and destroying it as it moves
       would mean redoing by hand exactly what we are trying to avoid. */
    svg += '<line x1="0" y1="' + (axisTop - 10) + '" x2="0" y2="' + (bandsY + bandsH) + '" class="dg-slider" data-slider display="none"></line>' +
      '<text x="0" y="' + (height - 2) + '" text-anchor="middle" class="dg-slider-label" data-slider-label display="none"></text>';

    svg += "</svg>";
    el.innerHTML = svg;
    attachTooltips(el);

    return {
      defaultDial, lang: I18N.lang(), x, boxes,
      sliderEl: el.querySelector("[data-slider]"),
      labelEl: el.querySelector("[data-slider-label]"),
      nodes: new Map(boxes.map(b => [b.id, el.querySelector('[data-box="' + b.id + '"]')])),
    };
  }

  /* The only work redone on every click: moving two nodes and replaying two
     classes per box. Nothing like the full redraw. */
  function placeCursor(cache, currentDial) {
    const p = currentDial ? GRIND.parseDial(currentDial) : null;
    const { sliderEl, labelEl } = cache;
    if (!p) {
      if (sliderEl) sliderEl.setAttribute("display", "none");
      if (labelEl) labelEl.setAttribute("display", "none");
    } else {
      const gx = cache.x(p.microns);
      if (sliderEl) {
        sliderEl.setAttribute("x1", gx);
        sliderEl.setAttribute("x2", gx);
        sliderEl.removeAttribute("display");
      }
      if (labelEl) {
        labelEl.setAttribute("x", gx);
        labelEl.textContent = "▲ " + currentDial;
        labelEl.removeAttribute("display");
      }
    }
    for (const b of cache.boxes) {
      const n = cache.nodes.get(b.id);
      if (!n) continue;
      const compatible = !!p && p.microns >= b.minU && p.microns <= b.maxU;
      n.classList.toggle("dg-box-compatible", compatible);
      n.classList.toggle("dg-box-off", !!p && !compatible);
    }
  }

  // ---------- Home-made tooltip for the SVGs ----------

  let tipEl = null;
  function attachTooltips(root) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "svg-tooltip";
      tipEl.setAttribute("hidden", "");
      document.body.appendChild(tipEl);
    }
    root.querySelectorAll("[data-tip]").forEach(n => {
      n.addEventListener("mouseenter", e => {
        tipEl.textContent = n.getAttribute("data-tip");
        tipEl.removeAttribute("hidden");
      });
      n.addEventListener("mousemove", e => {
        const margin = 14;
        let xx = e.clientX + margin, yy = e.clientY + margin;
        const r = tipEl.getBoundingClientRect();
        if (xx + r.width > window.innerWidth - 8) xx = e.clientX - r.width - margin;
        if (yy + r.height > window.innerHeight - 8) yy = e.clientY - r.height - margin;
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

     The ten families of the vocabulary (DESCRIPTOR_GROUPS) in the centre,
     their tastes around. The share of each arc: how many times it was ticked
     on the rated cups. Its tint: the average rating of those cups, as accent
     opacity, from WHEEL_LOW_SCORE (pale) to WHEEL_HIGH_SCORE (full). Touching
     a family unfolds it and lists its tastes, with their rating and count.

     Returns the number of tastes drawn: zero, and the caller shows the empty card.
     The "chosen family" state lives here, by wheel id, to survive the
     dashboard re-renders. */
  const WHEEL_LOW_SCORE = 5, WHEEL_HIGH_SCORE = 8.5;
  const wheelChoice = new Map();
  function aromaWheel(rated, ids) {
    const o = Object.assign({ svg: "wheel-aromas", detail: "wheel-detail", reading: "reading-aromas" }, ids || {});
    const svg = document.getElementById(o.svg);
    if (!svg) return 0;
    const byTag = {};
    rated.forEach(e => String(e.descripteurs || "").split("|").filter(Boolean).forEach(t => {
      (byTag[t] = byTag[t] || []).push(Number(e.note_sur_10));
    }));
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const families = DESCRIPTOR_GROUPS.map(g => {
      const tastes = g.tags.filter(t => byTag[t]).map(t => ({ tag: t, n: byTag[t].length, note: mean(byTag[t]) }));
      const n = tastes.reduce((s, x) => s + x.n, 0);
      return { nom: g.nom, tastes, n, note: n ? tastes.reduce((s, x) => s + x.n * x.note, 0) / n : 0 };
    }).filter(f => f.n > 0);
    const total = families.reduce((s, f) => s + f.n, 0);
    const detail = document.getElementById(o.detail), reading = document.getElementById(o.reading);
    if (!total) {
      svg.innerHTML = "";
      if (detail) detail.innerHTML = "";
      if (reading) reading.textContent = "";
      return 0;
    }
    const mostTicked = families.slice().sort((a, b) => b.n - a.n)[0];
    if (!families.some(f => f.nom === wheelChoice.get(o.svg))) wheelChoice.set(o.svg, mostTicked.nom);

    const C = 150, TURN = Math.PI * 2, GAP = 0.01;
    const opacity = rating => Math.max(0.16, Math.min(1,
      0.16 + ((rating - WHEEL_LOW_SCORE) / (WHEEL_HIGH_SCORE - WHEEL_LOW_SCORE)) * 0.84));
    const pt = (r, a) => (C + r * Math.sin(a)).toFixed(2) + " " + (C - r * Math.cos(a)).toFixed(2);
    const sector = (r0, r1, a0, a1) => {
      const g = a1 - a0 > Math.PI ? 1 : 0;
      return "M" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 " + g + " 1 " + pt(r1, a1) +
        " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 " + g + " 0 " + pt(r0, a0) + " Z";
    };
    const fmtRating = n => Number(n.toFixed(1)).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 });
    const escapeHtml = TOOLS.escapeHtml;

    function paint() {
      const chosen = wheelChoice.get(o.svg);
      let a = 0, html = "";
      families.forEach(f => {
        // A family alone makes the full circle: we leave a gap so that
        // the arc stays an arc and does not close on itself.
        const af = Math.min((f.n / total) * TURN, TURN - 0.001);
        const isActive = f.nom === chosen;
        const familyName = I18N.group(f.nom);
        html += '<path d="' + sector(46, 92, a + GAP, a + af - GAP) + '" class="wheel-family' + (isActive ? " chosen" : "") +
          '" data-family="' + escapeHtml(f.nom) + '" tabindex="0" role="button" aria-pressed="' + isActive +
          '" aria-label="' + escapeHtml(familyName + ", " + fmtRating(f.note)) + '"><title>' + escapeHtml(familyName) + "</title></path>";
        let b = a;
        f.tastes.forEach(g => {
          const ag = (g.n / total) * TURN;
          html += '<path d="' + sector(96, isActive ? 146 : 138, b + GAP, b + ag - GAP) + '" class="wheel-taste" style="fill-opacity:' +
            opacity(g.note).toFixed(2) + '" data-family="' + escapeHtml(f.nom) + '"><title>' +
            escapeHtml(I18N.tag(g.tag) + " : " + fmtRating(g.note) + ", " + I18N.t("wheel_times", { n: g.n })) + "</title></path>";
          b += ag;
        });
        a += af;
      });
      const f = families.find(x => x.nom === chosen);
      const brief = I18N.group(f.nom);
      html += '<text x="150" y="146" text-anchor="middle" class="wheel-center-name">' +
        escapeHtml(brief.length > 14 ? brief.split(" ")[0] : brief) + "</text>" +
        '<text x="150" y="170" text-anchor="middle" class="wheel-center-rating">' + fmtRating(f.note) + "</text>";
      svg.innerHTML = html;
      if (detail) {
        detail.innerHTML = '<h4 class="wheel-title">' + escapeHtml(I18N.group(f.nom)) + "</h4>" +
          f.tastes.slice().sort((x, y) => y.note - x.note).map(g =>
            '<div class="wheel-row"><span>' + escapeHtml(I18N.tag(g.tag)) + "</span><span>" +
            I18N.t("wheel_times", { n: g.n }) + "</span><b>" + fmtRating(g.note) + "</b></div>").join("");
      }
    }
    paint();
    if (reading) {
      const better = families.filter(x => x.n >= 3).sort((x, y) => y.note - x.note)[0];
      reading.textContent = I18N.t(better && better.nom !== mostTicked.nom ? "wheel_reading" : "wheel_reading_alone", {
        f: I18N.group(mostTicked.nom), n: mostTicked.n, m: better ? I18N.group(better.nom) : "", x: better ? fmtRating(better.note) : "",
      });
    }
    // Wired ONCE per wheel: the SVG survives re-renders, only its content changes.
    if (!svg.dataset.branch) {
      svg.dataset.branch = "1";
      const choose = ev => {
        const p = ev.target.closest(".wheel-family, .wheel-taste");
        if (!p) return;
        if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        wheelChoice.set(o.svg, p.dataset.family);
        svg._paint();
        if (ev.type === "keydown") {
          const target = [...svg.querySelectorAll(".wheel-family")].find(x => x.dataset.family === p.dataset.family);
          if (target) target.focus();
        }
      };
      svg.addEventListener("click", choose);
      svg.addEventListener("keydown", choose);
    }
    svg._paint = paint;
    return families.reduce((s, x) => s + x.tastes.length, 0);
  }

  return {
    C_BRIKKA, C_SWITCH, C_BOTH, C_DIAG, aromaWheel,
    applyDefaults, destroyAll, loadChart,
    barsAndLine30d, horizontalBars, machineComparison, scatter, diagnosticsRing,
    heatmap, diagram,
  };
})();
