// Grind engine for the Timemore C5 ESP, S2C 38 mm burrs.
// The dial reads in three parts: rotation.number.click
// 5 clicks per number, 10 numbers per rotation, 50 clicks per rotation.
// Basis: official Timemore chart, 8.32 microns per click,
// hard stop at 3 rotations (150 clicks), i.e. 1248 microns.
"use strict";

const GRIND = (() => {

  const MICRONS_PER_CLICK = 8.32;
  const MAX_CLICKS = 150; // hard stop at 3.0.0
  const MICRONS_AT_STOP = Math.round(MAX_CLICKS * MICRONS_PER_CLICK); // 1248

  function dialFromClicks(clicks) {
    const c = Math.max(0, Math.min(MAX_CLICKS, Math.round(clicks)));
    const rotation = Math.floor(c / 50);
    const number = Math.floor((c % 50) / 5);
    const click = c % 5;
    return rotation + "." + number + "." + click;
  }

  // Ranges per method, official Timemore C5 ESP chart.
  // The dial notation is computed from the clicks, capped at the 3.0.0 stop.
  function m(id, label, minU, maxU, minC, maxC) {
    return {
      id, nom: label, minU, maxU, minC, maxC,
      dialText: dialFromClicks(Math.min(minC, MAX_CLICKS)) + " à " + dialFromClicks(Math.min(maxC, MAX_CLICKS)),
    };
  }

  const METHODS = [
    m("turkish",  "Turkish",                       39,  219,  5,   26),
    m("espresso", "Espresso",                      178, 380,  21,  46),
    m("brikka",   "Moka Pot (Brikka)",             358, 659,  43,  79),
    m("v60",      "V60",                           398, 698,  48,  84),
    m("aeropress","Aeropress",                     319, 959,  38,  115),
    m("pourover", "Pour Over",                     409, 929,  49,  112),
    m("siphon",   "Siphon",                        371, 803,  45,  96),
    // Up to 100 clicks (v8.74): 2.0.0, the grind of the 4:6 and the Sherrycipe, was out of range.
    m("switch",   "Steep-and-release (Switch)",    447, 832,  54,  100),
    m("filtermachine", "Filter Coffee Machine",    299, 896,  36,  108),
    m("cupping",  "Cupping",                       457, 849,  55,  102),
    m("colddrip", "Cold Drip",                     815, 1268, 98,  152),
    m("frenchpress", "French Press",               688, 1298, 83,  156),
    m("coldbrew", "Cold Brew",                     795, 1436, 96,  173),
  ];

  // Particle size bands, in microns.
  const GRIND_BANDS = [
    { nom: "Extra Fine",    min: 0,    max: 200 },
    { nom: "Fine",          min: 200,  max: 400 },
    { nom: "Medium Fine",   min: 400,  max: 600 },
    { nom: "Medium",        min: 600,  max: 800 },
    { nom: "Medium Coarse", min: 800,  max: 1000 },
    { nom: "Coarse",        min: 1000, max: 1200 },
    { nom: "Extra Coarse",  min: 1200, max: Infinity },
  ];

  // Chris's reference settings. Chart colours:
  // Brikka #2a78d6, shared #cc79a7, Switch #eb6834.
  const REFERENCES = [
    { dial: "1.2.0", clicks: 60,  usage: "Brikka", color: "#2a78d6" },
    { dial: "1.5.0", clicks: 75,  usage: "Réglage commun aux deux machines", color: "#cc79a7" },
    { dial: "1.6.0", clicks: 80,  usage: "Switch, percolation puis immersion", color: "#eb6834" },
    { dial: "2.0.0", clicks: 100, usage: "Switch, Tetsu 4:6 et Sherrycipe", color: "#eb6834" },
  ];

  // Range used by the tracker to validate an extraction for the chosen method.
  const ENTRY_METHOD_RANGES = {
    "Brikka": METHODS.find(x => x.id === "brikka"),
    "Switch": METHODS.find(x => x.id === "switch"),
  };

  // Parses an entry in rotation.number.click format, for example 1.5.0
  // Returns null if invalid.
  function parseDial(text) {
    if (typeof text !== "string") return null;
    const t = text.trim();
    const res = t.match(/^([0-3])\s*[.,]\s*([0-9])\s*[.,]\s*([0-4])$/);
    if (!res) return null;
    const rotation = parseInt(res[1], 10);
    const number = parseInt(res[2], 10);
    const click = parseInt(res[3], 10);
    const clicks = rotation * 50 + number * 5 + click;
    if (clicks > MAX_CLICKS) return null; // beyond the 3.0.0 stop
    return { rotation, numero: number, click, clicks, microns: clicks * MICRONS_PER_CLICK };
  }

  function bandOf(microns) {
    return GRIND_BANDS.find(b => microns >= b.min && microns < b.max) || GRIND_BANDS[GRIND_BANDS.length - 1];
  }

  function compatibleMethods(microns) {
    return METHODS.filter(x => microns >= x.minU && microns <= x.maxU);
  }

  // Checks the grind for the entry method (Brikka or Switch).
  // Returns { ok, message } without ever blocking.
  function checkRange(method, dial) {
    const p = parseDial(dial);
    if (!p) return { ok: false, message: I18N.t("grind_format") };
    const range = ENTRY_METHOD_RANGES[method];
    if (!range) return { ok: true, message: "" };
    if (p.clicks < range.minC) {
      return { ok: false, message: I18N.t("grind_too_fine", { m: method, dial: I18N.dialRange(range.dialText) }) };
    }
    if (p.clicks > range.maxC) {
      return { ok: false, message: I18N.t("grind_too_coarse", { m: method, dial: I18N.dialRange(range.dialText) }) };
    }
    return { ok: true, message: "" };
  }

  return {
    MICRONS_PER_CLICK, MAX_CLICKS, MICRONS_AT_STOP, METHODS, GRIND_BANDS, REFERENCES,
    parseDial, dialFromClicks, bandOf, compatibleMethods, checkRange,
  };
})();
