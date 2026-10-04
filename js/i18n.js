// Internationalisation: French by default, English as a toggle.
// Three mechanisms:
// 1. UI: text mapping for all the static content of the page.
//    Each French text fragment is the key, the English text the value.
// 2. T: templates for strings built in JavaScript, with variables.
// 3. Display maps for data values (diagnostics, descriptors):
//    the stored value stays French, only the display changes.
"use strict";

const I18N = (() => {

  let lang = "fr";
  /* Saved wish, NOT the current language: switching before the bundle is here
     would show a page that declares itself English and renders French as fallback.
     prepare(), called at startup, decides once the bundle has arrived. */
  let wantedLanguage = "fr";
  try {
    const l = localStorage.getItem("lang");
    if (l === "en") wantedLanguage = "en";
  } catch (e) { /* unavailable */ }

  // ---------- 1. Static content: French to English ----------

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const UI = {};

  // ---------- 2. Templates for dynamic strings ----------

  /* The French templates live in js/i18n.fr.js since v9.18 (size cap), the
     screens of v9.18 and after in js/i18n.fr2.js since v9.21. The English
     bundle adds its halves to this same object, in place. */
  const T = I18N_FR;

  // ---------- 3. Display maps for data values ----------

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const DIAG = {};

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const TAGS = {};

  // Short definition of each descriptor, shown as a tooltip and under the
  // block when a tag is ticked. Format: { fr, en }. No double quotes
  // in the texts (they go into title attributes).
  /* The definitions, in French here, in English in i18n.en.js. */
  const TAGS_INFO = {
    "acidité vive": "Vivacité agréable, qui rend la tasse vivante. Une qualité, pas un défaut.",
    "acidulé": "Petite pointe acide franche et plaisante, comme une pomme croquante.",
    "aigre": "Acidité sèche et agressive, sans profondeur. Signature d une sous extraction.",
    "citronné": "Acidité qui tire vers le citron. Agréable dosée, mordante si elle domine.",
    "vinaigré": "Acidité poussée jusqu au vinaigre. Toujours un défaut.",
    "astringent": "Sensation TACTILE, pas un goût : la bouche s assèche et se resserre, comme après un thé trop infusé.",
    "rugueux": "Texture râpeuse et rude en bouche, sans finesse.",
    "aqueux": "Aucune matière, la tasse ressemble à de l eau colorée.",
    "rance": "Goût de gras oxydé, de vieille noix. Café trop vieux ou mal conservé.",
    "phénolique": "Note médicamenteuse ou de plastique. Défaut du grain, aucun réglage ne l enlève.",
    "rond": "Sensation pleine et douce en bouche, sans angle ni agressivité.",
    "sirupeux": "Épais et enveloppant, coule comme un sirop.",
    "crémeux": "Texture riche qui rappelle la crème, sans lait ajouté.",
    "beurré": "Fondant et gras comme du beurre, typique des cafés rang bơ vietnamiens.",
    "gras": "Texture huileuse qui nappe le palais, plus lourd que crémeux.",
    "velouté": "Doux et dense à la fois, comme un velouté de légumes.",
    "soyeux": "Lisse et fluide, glisse comme de la soie.",
    "liquoreux": "Riche et concentré comme un vin doux ou un porto.",
    "sec": "Finale qui assèche la bouche, comme un vin tannique.",
    "léger": "Corps mince, proche du thé, peu de matière.",
    "chocolat noir": "Cacao intense, amertume noble du chocolat à 70 pour cent et plus.",
    "chocolat au lait": "Chocolat doux et sucré, plus rond que le chocolat noir.",
    "cacao": "Poudre de cacao sec, moins sucré que le chocolat.",
    "noisette": "Noix douce et grillée, classique des arabicas lavés.",
    "amande": "Note de noix plus fine, légèrement sucrée.",
    "cacahuète": "Arachide grillée, fréquent sur les robustas.",
    "caramel": "Sucre cuit, doux et légèrement grillé.",
    "sucre roux": "Sucré rustique, cassonade ou sucre complet.",
    "miel": "Douceur florale et parfumée.",
    "vanille": "Douceur ronde de gousse ou de crème vanillée.",
    "mélasse": "Sucre foncé et dense, presque réglissé.",
    "praliné": "Noix caramélisée, entre noisette et caramel.",
    "banane": "Fruit jaune bien mûr, souvent sur les naturals fermentés.",
    "jacquier": "Fruit tropical sucré et musqué, signature du Liberica.",
    "fruits tropicaux": "Mangue, ananas, litchi : exotique et juteux.",
    "fruit de la passion": "Tropical très aromatique, acidité tranchante.",
    "fruits mûrs": "Fruité confit, très mûr, presque compoté.",
    "fruits rouges": "Fraise, framboise : fruité vif et acidulé.",
    "cerise": "Fruit rouge foncé, entre sucré et acidulé.",
    "fruits secs": "Raisin sec, datte, figue : fruité concentré et sucré.",
    "raisin": "Jus de raisin frais, tirant vers le vineux.",
    "pomme": "Acidité croquante et propre, comme une pomme verte.",
    "agrume": "Citron, orange, pamplemousse : acidité brillante.",
    "pêche": "Fruit à noyau doux, acidité délicate.",
    "floral": "Parfum de fleurs, délicat et aérien.",
    "jasmin": "Floral précis et parfumé, typique des arabicas clairs.",
    "rose": "Floral intense, presque parfum de loukoum.",
    "thé noir": "Tanins fins et finale sèche de thé infusé.",
    "thé vert": "Végétal frais, léger et herbacé.",
    "épices": "Chaleur épicée générale, difficile à isoler.",
    "cannelle": "Épice douce et boisée.",
    "clou de girofle": "Épice chaude, presque médicinale, très aromatique.",
    "réglisse": "Anisé et sucré-amer, note sombre.",
    "poivre": "Piquant léger en fin de bouche, courant sur les robustas.",
    "malt": "Céréale sucrée, rappelle la bière blonde ou l'Ovomaltine.",
    "pain grillé": "Croûte de pain, signe d'une torréfaction bien menée.",
    "biscuit": "Pâtisserie sèche et beurrée, douceur céréalière.",
    "vineux": "Rappelle le vin rouge : acidité et rondeur fermentées.",
    "fermenté": "Fruité alcooleux ou lacté, typique des process anaérobies.",
    "rhum": "Alcool sucré et boisé, canne à sucre fermentée.",
    "fumé": "Fumée de bois, feu de camp, thé lapsang : marqué mais pas âcre.",
    "tabac": "Feuille de tabac blond séchée, sucré-boisé, plutôt noble.",
    "cuir": "Cuir, selle, un peu animal : fréquent sur les robustas et les vieux natural.",
    "salé": "Une sensation salée et creuse, comme l'eau salée de la calibration : la signature d'une sous-extraction.",
    "métallique": "Goût de fer, de pièce de monnaie. À la Brikka : flamme trop forte en fin d'écoulement, ou panier mal rincé.",
    "cassis": "Baie noire acidulée, typique des lavés du Kenya.",
    "prune": "Fruit à noyau sombre et juteux, entre la cerise et le pruneau.",
    "orange": "Agrume doux et sucré, moins mordant que le citron.",
    "sucre de canne": "Sucré clair et propre, moins profond que la cassonade.",
    "brûlé": "Torréfaction poussée trop loin : âcre, carbonisé, désagréable.",
    "cendre": "Cendre froide, sec et poussiéreux : défaut net.",
    "caoutchouc": "Pneu ou gomme, défaut classique des robustas poussés.",
    "terreux": "Terre humide, sous-bois, champignon : un trait courant des robustas, pas forcément un défaut.",
    "boisé": "Bois sec, crayon, tonneau : un trait du liberica, ou le signe d'un café vieilli.",
    "moisi": "Humidité et moisissure, défaut de stockage du grain.",
    "papier": "Carton ou papier mouillé, café éventé ou filtre mal rincé.",
  };

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const GROUPS = {};

  const METHODS = {}; // filled by js/i18n.en.js

  const MACHINES = {}; // filled by js/i18n.en.js

  // ---------- Engine ----------

  const registry = []; // { node, fr, en }
  const attrEntries = []; // { el, attr, fr, en }: placeholder, title, aria-label
  let scanDone = false;
  /* Did the scan have a dictionary at hand? In French there is none,
     and an empty scan records nothing: it must be redone when the
     English bundle arrives. See mergeBundle(). */
  let scanHadDict = false;

  const ZONES_JS = "#grid-recipes,#h-body,#kpis,#latest-list,#recipes-list,#coffees-list," +
    "#conv-result,#table-ranges,#warnings,#aside-recipe,#aside-coffee,#duel-machines," +
    "#tetsu-block,#wt-steps,#g-heatmap,#ruler,#f-diagnostic,#f-descriptors,#f-recipe,#f-coffee," +
    "#h-coffee,#h-diagnostic,#q-coffee,#q-recipe,#c-recipe,#db-status,#toast,#wt-params," +
    "#insights,#sync-status,#heatmap-stats,#version-site,#comparison-count,#tuning-list," +
    "#comparison-summary,#comparison-titles,#comparison-body," +
    "#empty-grind,#empty-tastes,#empty-duel,#rating-tastes,#param-recipes,#rating-shown," +
    "#aside-twins,#wheel-detail,#reading-aromas,#empty-aromas,#f-dictate-text,#sheet-content," +
    "#br-machine,#br-title,#br-dose,#br-over,#br-target,#br-valve,#br-instruction,#br-next,#br-timeline," +
    "#br-go,#br-rating-spoken," +
    "#drawing-etagere,#drawing-horloge,#drawing-spectre,#drawing-moulin," +
    "#drawing-etagere-reading,#drawing-horloge-reading,#drawing-spectre-reading,#drawing-moulin-reading," +
    "#card-recap,#legend-30d,#aside-video,#matrix-recipes,#sheet-comparison,#sheet-duo,#sheet-footprint,#sheet-trajectory,#sheet-grinder," +
    "#drawings-panel,#bubble-cup,#drawing-frise,#drawing-podium,#drawing-progression,#drawing-frise-reading,#drawing-podium-reading,#drawing-progression-reading," +
    // home (v9.21): the home's and the Analyses page's zones drawn in JS.
    "#home-week,#home-week-line,#home-bags,#home-finding,#home-brew,#home-band,#kpis-secondary,#an-highlight,#an-story," +
    "#tile-month-title,#tile-month-meta,#tile-month,#tile-coffees,#tile-podium,#tile-podium-reading,#tile-recipes-list," +
    "#tile-tastes,#tile-wheel,#tile-wheel-detail,#tile-grinder,#tile-grinder-reading,#heatmap-title,#story-stage,#story-bars," +
    // moments (v9.23): the milestones tile of Analyses.
    "#tile-milestones";

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "PRE" || tag === "CODE" || tag === "TEXTAREA") {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest(ZONES_JS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const raw = n.nodeValue;
      const key = raw.trim();
      if (!key || !UI[key]) continue;
      const lead = (raw.match(/^\s*/) || [""])[0];
      const trail = /\s$/.test(raw) ? " " : "";
      registry.push({ node: n, fr: raw, en: lead + UI[key] + trail });
    }

    /* TEXT ATTRIBUTES. The walk above only sees text nodes:
       placeholders, tooltips and screen reader labels escape it,
       and so stayed French in English mode.

       Same rule as for text, and that is what makes the pass safe: recorded
       ONLY if they have a dictionary entry. The grinder field placeholder
       is "1.5.0" or "du paquet" depending on whether the coffee is pre-ground,
       and the entry code decides that: with no entry, it is never captured, so
       never rewritten here.

       Zones regenerated by JS are excluded, as for text. Keeping a
       reference to them would be worse than useless: the node is replaced on
       every render, and the code regenerating it already translates what it writes. */
    ["placeholder", "title", "aria-label"].forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        if (el.closest && el.closest(ZONES_JS)) return;
        const fr = el.getAttribute(attr);
        if (fr && UI[fr]) attrEntries.push({ el, attr, fr, en: UI[fr] });
      });
    });
    scanDone = true;
    scanHadDict = Object.keys(UI).length > 0;
  }

  function applyStatic() {
    if (!scanDone) scan();
    registry.forEach(r => {
      try { r.node.nodeValue = lang === "en" ? r.en : r.fr; } catch (e) { /* node gone */ }
    });
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.title = t("doc_title");
    attrEntries.forEach(a => {
      try { a.el.setAttribute(a.attr, lang === "en" ? a.en : a.fr); } catch (e) { /* node gone */ }
    });
  }

  function t(key, vars) {
    const e = T[key];
    let s = e ? (e[lang] || e.fr) : key;
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  // hasOwnProperty (v8.77): a coffee named « constructor » showed a function in English.
  function tr(text) { return lang === "en" && Object.prototype.hasOwnProperty.call(UI, text) ? UI[text] : text; }
  // Grinder range "0.8.3 à 1.5.4": the "à" becomes "to" in English.
  function dialRange(s) { return lang === "en" ? String(s).replace(" à ", " to ") : s; }
  function diag(d) { return lang === "en" ? (DIAG[d] || d) : d; }
  function tag(d) { return lang === "en" ? (TAGS[d] || d) : d; }
  /* The values are French STRINGS, and the English bundle replaces them
     with a { fr, en } pair on load. So both forms are accepted:
     a bare string means French. */
  function tagInfo(d) {
    const e = TAGS_INFO[d];
    if (!e) return "";
    return typeof e === "string" ? e : (e[lang] || e.fr);
  }
  function group(g) { return lang === "en" ? (GROUPS[g] || g) : g; }
  function method(m) { return lang === "en" ? (METHODS[m] || m) : m; }
  function machine(m) { return lang === "en" ? (MACHINES[m] || m) : m; }
  function locale() { return lang === "en" ? "en-GB" : "fr-FR"; }
  function days() { return t("weekdays").split("|"); }
  function months() { return t("months_short").split("|"); }

  const subscribers = [];
  function subscribe(fn) { subscribers.push(fn); }

  /* LOADING THE ENGLISH BUNDLE.

     The dictionaries above are empty in French, on purpose:
     tr(), diag(), tag() and friends return their input unchanged as long as
     the language is "fr", and templates fall back on their French half.
     French therefore has literally no use for 29 KB gzipped of English.

     The bundle fills them IN PLACE, without reassigning the constants: the rest
     of the file keeps its references, nothing needs rewiring. */
  let enBundle = null;

  function mergeBundle(p) {
    if (!p) return false;
    /* The previous scan ran without a dictionary, so it recorded
       nothing: it must be redone now that the bundle is here. The
       condition matters. Rescanning after a translation was already applied
       would record the displayed English as the French text, and
       switching back to French would render English. */
    if (!scanHadDict) { scanDone = false; registry.length = 0; attrEntries.length = 0; }
    Object.entries(p.T || {}).forEach(([k, v]) => { if (T[k]) T[k].en = v; });
    Object.entries(p.TAGS_INFO || {}).forEach(([k, v]) => {
      if (TAGS_INFO[k] !== undefined) TAGS_INFO[k] = { fr: TAGS_INFO[k], en: v };
    });
    [["UI", UI], ["DIAG", DIAG], ["TAGS", TAGS], ["GROUPS", GROUPS],
      ["METHODS", METHODS], ["MACHINES", MACHINES]].forEach(([name, target]) => {
      Object.assign(target, p[name] || {});
    });
    return true;
  }

  function loadEnglish() {
    if (enBundle) return enBundle;
    if (typeof I18N_EN !== "undefined") { mergeBundle(I18N_EN); enBundle = Promise.resolve(true); return enBundle; }
    enBundle = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = TOOLS.versionedUrl("js/i18n.en.js");
      s.onload = () => resolve(mergeBundle(typeof I18N_EN !== "undefined" ? I18N_EN : null));
      // Load failure: stay in French rather than show a half
      // translated site. enBundle goes back to null to allow a retry.
      s.onerror = () => { enBundle = null; resolve(false); };
      document.head.appendChild(s);
    });
    return enBundle;
  }

  function applyLanguage(next) {
    lang = next;
    try { localStorage.setItem("lang", lang); } catch (e) { /* unavailable */ }
    applyStatic();
    subscribers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  async function toggleLanguage() {
    const target = lang === "fr" ? "en" : "fr";
    if (target === "en" && !await loadEnglish()) return;
    applyLanguage(target);
  }

  /* Called at startup when the saved language is English: the bundle
     must be here BEFORE the first render, otherwise the page shows in French and then
     flickers. */
  async function prepare(wantedLang) {
    if (wantedLang !== "en") return;
    if (await loadEnglish()) lang = "en";
  }

  return {
    t, tr, dialRange, diag, tag, tagInfo, group, method, machine, locale, days, months,
    subscribe, toggleLanguage, applyStatic, prepare,
    wantedLanguage: () => wantedLanguage,
    lang: () => lang,
  };
})();
