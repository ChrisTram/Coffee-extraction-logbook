// Moteur de mouture pour le Timemore C5 ESP, meules S2C 38 mm.
// Lecture du cadran en trois parties : rotation.numero.cran
// 5 crans par numero, 10 numeros par rotation, 50 crans par rotation.
// Base : diagramme officiel Timemore, 8,32 microns par cran,
// butee a 3 rotations (150 crans) soit 1248 microns.
"use strict";

const GRIND = (() => {

  const MICRONS_PAR_CRAN = 8.32;
  const CRANS_MAX = 150; // butee a 3.0.0
  const MICRONS_BUTEE = Math.round(CRANS_MAX * MICRONS_PAR_CRAN); // 1248

  function dialDepuisCrans(crans) {
    const c = Math.max(0, Math.min(CRANS_MAX, Math.round(crans)));
    const rotation = Math.floor(c / 50);
    const numero = Math.floor((c % 50) / 5);
    const cran = c % 5;
    return rotation + "." + numero + "." + cran;
  }

  // Plages par methode, diagramme officiel Timemore C5 ESP.
  // La notation molette est calculee depuis les crans, bornee a la butee 3.0.0.
  function m(id, nom, minU, maxU, minC, maxC) {
    return {
      id, nom, minU, maxU, minC, maxC,
      molette: dialDepuisCrans(Math.min(minC, CRANS_MAX)) + " à " + dialDepuisCrans(Math.min(maxC, CRANS_MAX)),
    };
  }

  const METHODES = [
    m("turkish",  "Turkish",                       39,  219,  5,   26),
    m("espresso", "Espresso",                      178, 380,  21,  46),
    m("brikka",   "Moka Pot (Brikka)",             358, 659,  43,  79),
    m("v60",      "V60",                           398, 698,  48,  84),
    m("aeropress","Aeropress",                     319, 959,  38,  115),
    m("pourover", "Pour Over",                     409, 929,  49,  112),
    m("siphon",   "Siphon",                        371, 803,  45,  96),
    m("switch",   "Steep-and-release (Switch)",    447, 825,  54,  99),
    m("filtermachine", "Filter Coffee Machine",    299, 896,  36,  108),
    m("cupping",  "Cupping",                       457, 849,  55,  102),
    m("colddrip", "Cold Drip",                     815, 1268, 98,  152),
    m("frenchpress", "French Press",               688, 1298, 83,  156),
    m("coldbrew", "Cold Brew",                     795, 1436, 96,  173),
  ];

  // Bandes de granulometrie, en microns.
  const BANDES = [
    { nom: "Extra Fine",    min: 0,    max: 200 },
    { nom: "Fine",          min: 200,  max: 400 },
    { nom: "Medium Fine",   min: 400,  max: 600 },
    { nom: "Medium",        min: 600,  max: 800 },
    { nom: "Medium Coarse", min: 800,  max: 1000 },
    { nom: "Coarse",        min: 1000, max: 1200 },
    { nom: "Extra Coarse",  min: 1200, max: Infinity },
  ];

  // Reglages de reference de Chris. Couleurs du diagramme :
  // Brikka #2a78d6, commun #1baf7a, Switch #eb6834.
  const REFERENCES = [
    { dial: "1.2.0", crans: 60,  usage: "Brikka", couleur: "#2a78d6" },
    { dial: "1.5.0", crans: 75,  usage: "Réglage commun aux deux machines", couleur: "#1baf7a" },
    { dial: "1.6.0", crans: 80,  usage: "Switch recettes 1 et 2", couleur: "#eb6834" },
    { dial: "2.0.0", crans: 100, usage: "Switch recettes 5 et 6", couleur: "#eb6834" },
  ];

  // Plage utilisee par le tracker pour valider une extraction selon la methode choisie.
  const PLAGE_PAR_METHODE_SAISIE = {
    "Brikka": METHODES.find(x => x.id === "brikka"),
    "Switch": METHODES.find(x => x.id === "switch"),
  };

  // Analyse une saisie au format rotation.numero.cran, par exemple 1.5.0
  // Retourne null si invalide.
  function parseDial(texte) {
    if (typeof texte !== "string") return null;
    const t = texte.trim();
    const res = t.match(/^([0-3])\s*[.,]\s*([0-9])\s*[.,]\s*([0-4])$/);
    if (!res) return null;
    const rotation = parseInt(res[1], 10);
    const numero = parseInt(res[2], 10);
    const cran = parseInt(res[3], 10);
    const crans = rotation * 50 + numero * 5 + cran;
    if (crans > CRANS_MAX) return null; // au dela de la butee 3.0.0
    return { rotation, numero, cran, crans, microns: crans * MICRONS_PAR_CRAN };
  }

  function bande(microns) {
    return BANDES.find(b => microns >= b.min && microns < b.max) || BANDES[BANDES.length - 1];
  }

  function methodesCompatibles(microns) {
    return METHODES.filter(x => microns >= x.minU && microns <= x.maxU);
  }

  // Verifie la mouture pour la methode de saisie (Brikka ou Switch).
  // Retourne { ok, message } sans jamais bloquer.
  function verifierPlage(methode, dial) {
    const p = parseDial(dial);
    if (!p) return { ok: false, message: I18N.t("g_format") };
    const plage = PLAGE_PAR_METHODE_SAISIE[methode];
    if (!plage) return { ok: true, message: "" };
    if (p.crans < plage.minC) {
      return { ok: false, message: I18N.t("g_fine", { m: methode, mol: I18N.mol(plage.molette) }) };
    }
    if (p.crans > plage.maxC) {
      return { ok: false, message: I18N.t("g_grosse", { m: methode, mol: I18N.mol(plage.molette) }) };
    }
    return { ok: true, message: "" };
  }

  return {
    MICRONS_PAR_CRAN, CRANS_MAX, MICRONS_BUTEE, METHODES, BANDES, REFERENCES,
    parseDial, dialDepuisCrans, bande, methodesCompatibles, verifierPlage,
  };
})();
