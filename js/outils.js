/* PURE helpers, shared by every layer.
 *
 * First script on the page: nothing here depends on the DOM, the data or any
 * other file, and everything runs as is in Node for the tests.
 *
 * Why this file exists: average() lived in reglages.js AND in the interface
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

  return { average, localDateKey, versionSite, versionedUrl, escapeHtml };
})();
