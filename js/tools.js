/* PURE helpers, shared by every layer.
 *
 * First script on the page: nothing here depends on the DOM, the data or any
 * other file, and everything runs as is in Node for the tests.
 *
 * Why this file exists: average() lived in tuning.js AND in the interface
 * core, localDateKey() in charts.js AND in the core, and the same local date was
 * recomputed a third time in data.js. Three copies of a calculation function
 * drift apart one day, silently, and two screens then show two numbers for
 * the same thing. A single definition, here.
 *
 * Admission rule: a function comes in here if at least two layers (data,
 * charts, interface) need it AND it touches neither the DOM nor the state.
 * Otherwise it stays at home. */
"use strict";

const TOOLS = (() => {

  /* Arithmetic mean, or null on an empty list. Null and not NaN: NaN spreads
     silently all the way to the display and ends up as "NaN / 10" on screen,
     null is tested in one word where we decide what to show. */
  function average(list) {
    if (!list || !list.length) return null;
    return list.reduce((a, b) => a + b, 0) / list.length;
  }

  /* Day key in LOCAL time, "2026-09-06". Never toISOString: it works in UTC
     and, at UTC+7, an evening cup would land on the next day. */
  function localDateKey(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  /* Site version, read ONCE from index.html's <meta name="app-version">.
     It is the only source: the footer shows it, and every file loaded on
     demand (Chart.js, the English pack, the demo) adds it as a URL parameter
     so the browser can keep it cached as long as the version does not
     change. Outside a browser (Node tests) there is no meta: "" and the URLs
     stay bare. */
  let cachedVersion = null;
  function versionSite() {
    if (cachedVersion !== null) return cachedVersion;
    let v = "";
    try {
      const meta = typeof document !== "undefined" && document.querySelector
        ? document.querySelector('meta[name="app-version"]') : null;
      v = meta && typeof meta.content === "string" ? meta.content.trim() : "";
    } catch (e) { v = ""; }
    cachedVersion = v;
    return v;
  }

  function versionedUrl(path) {
    const v = versionSite();
    return v ? path + "?v=" + encodeURIComponent(v) : path;
  }

  /* A SINGLE ESCAPE (v8.73). There were six uneven copies of it (the Brew
     mode one did not escape quotes). For any text going into HTML, as
     content or as an attribute. */
  function escapeHtml(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* AWAY (v9.37): the periods Chris is away (a trip), days with no cup on
     purpose. Stored as one settings text, "2026-10-14/2026-10-28;...", each
     period from and to included. The streak jumps over them, the calendar and
     the day bars draw them apart, the daily averages and a bag's pace leave
     them out. Pure, like everything here. */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function awayParse(text) {
    return String(text || "").split(";").map(p => p.trim().split("/").map(x => x.trim()))
      .filter(([a, b]) => DAY_RE.test(a || "") && DAY_RE.test(b || "") && a <= b)
      .map(([from, to]) => ({ from, to }))
      .sort((x, y) => x.from.localeCompare(y.from)).slice(0, 60);
  }
  function awaySerialize(list) {
    return (list || []).map(r => r.from + "/" + r.to).join(";");
  }
  function isAway(list, key) {
    return !!key && (list || []).some(r => key >= r.from && key <= r.to);
  }
  // How many away days between two day keys, both included.
  function awayDaysBetween(list, fromKey, toKey) {
    let n = 0;
    (list || []).forEach(r => {
      const a = r.from > fromKey ? r.from : fromKey, b = r.to < toKey ? r.to : toKey;
      if (a <= b) n += Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 86400000) + 1;
    });
    return n;
  }

  /* THE BLEND (v9.56): a cup made of two coffees, the end of a bag topped up
     with another one. The cup keeps ONE dose (dose_g, the total, the one the
     ratio reads) and says how many of those grams came from a second coffee:
     blend_coffee_id and blend_g. Two rules follow, and every layer reads them
     here:
       - the stock: each bag gives its own grams (gramsFrom);
       - the analyses: the score describes neither coffee, so a blend is left
         out of everything that advises, like a botched cup, and it is no
         record either (isBlend).
     A second coffee equal to the first, or without grams, is no blend. */
  function blendGrams(e) {
    if (!e || !e.blend_coffee_id || e.blend_coffee_id === e.coffee_id) return 0;
    const g = Number(e.blend_g);
    if (!Number.isFinite(g) || !(g > 0)) return 0;
    const dose = Number(e.dose_g);
    return dose > 0 ? Math.min(g, dose) : g;
  }
  function isBlend(e) { return blendGrams(e) > 0; }
  // Whether the cup took grams from this coffee, as its first or its second one.
  function drawsFrom(e, coffeeId) {
    return !!e && !!coffeeId && (e.coffee_id === coffeeId || (isBlend(e) && e.blend_coffee_id === coffeeId));
  }
  /* The grams the cup took from this coffee. A cup without a dose counts the
     default one, as the stock always did. */
  function gramsFrom(e, coffeeId, defaultDose) {
    if (!e || !coffeeId) return 0;
    const total = Number(e.dose_g) || Number(defaultDose) || 0;
    const second = Math.min(blendGrams(e), total);
    return (e.coffee_id === coffeeId ? total - second : 0) + (second > 0 && e.blend_coffee_id === coffeeId ? second : 0);
  }

  return { average, localDateKey, versionSite, versionedUrl, escapeHtml, awayParse, awaySerialize, isAway, awayDaysBetween,
    blendGrams, isBlend, drawsFrom, gramsFrom };
})();
