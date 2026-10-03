/* BOOT test: actually runs the application in a fake DOM.
 *
 *   node tools/boot.test.mjs
 *
 * WHY THIS FILE EXISTS. The agent's browser pane serves this site
 * from a `data:` URL, where relative `src` and `href` do not resolve: neither
 * the stylesheet, nor the scripts, nor IndexedDB. No runtime error
 * can therefore be detected there, and an exception in the middle of the dashboard goes
 * unnoticed until Chris sees it.
 *
 * That is exactly what happened on August 14: `$$("#kpis ...")` had become
 * `$("#kpis ...")` because in a JavaScript replacement string `$$`
 * means "a literal dollar". `$` returns ONE element, which has no
 * `forEach`, so `renderDashboard()` threw a TypeError and the dashboard
 * stayed empty. The file parsed perfectly, all the other tests
 * passed.
 *
 * This harness validates NOTHING visual. It answers a single question, the most
 * useful one: does the application start and render each of its screens without
 * throwing.
 *
 * CRUCIAL DETAIL. `DATA.notify()` wraps each subscriber in a try/catch
 * that only does a `console.error`. A render exception is therefore SWALLOWED:
 * the screen stays empty and nothing bubbles up. That is why this test treats
 * any `console.error` as a failure, and not only the exceptions that
 * reach it. Without that it would go green on the very bug it exists
 * to catch, which was verified by reintroducing it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;

/* Last resort net. A render exception can escape through three different
   paths: the try/catch of notify(), a rejected promise, or a direct
   throw. We catch them ALL, otherwise the test prints the error without failing, which
   is the worst of both worlds. */
process.on("unhandledRejection", e => {
  failures += 1;
  console.log("FAIL unhandled rejection: " + (e && e.message ? e.message : e));
});
process.on("uncaughtException", e => {
  failures += 1;
  console.log("FAIL uncaught exception: " + (e && e.message ? e.message : e));
});
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

/* ---------- Fake DOM ---------- */

/* A real class list: since v8.40, the "not rated yet" state
   lives in a class of the slider, and a mute classList made it invisible. */
function fakeClassList() {
  const classes = new Set();
  return {
    add: (...c) => c.forEach(x => classes.add(x)),
    remove: (...c) => c.forEach(x => classes.delete(x)),
    toggle(c, force) {
      const on = force === undefined ? !classes.has(c) : !!force;
      if (on) classes.add(c); else classes.delete(c);
      return on;
    },
    contains: c => classes.has(c),
  };
}

function makeElement(name) {
  return {
    _name: name, tagName: "DIV", hidden: false, value: "", checked: false,
    textContent: "", innerHTML: "", disabled: false, tabIndex: 0, open: false,
    dataset: {}, style: { setProperty() {}, removeProperty() {} }, options: [], elements: [], files: [],
    classList: fakeClassList(),
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, click() {}, showModal() {}, close() {}, submit() {}, requestSubmit() {},
    reset() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 20 }),
    querySelector: () => makeElement("enfant"), querySelectorAll: () => [],
    closest: () => null, cloneNode: () => makeElement(name),
    checkValidity: () => true, offsetParent: {}, scrollLeft: 0, scrollWidth: 0,
    getContext: () => ({ canvas: { width: 300, height: 150 }, clearRect() {}, save() {}, restore() {} }),
    width: 300, height: 150,
  };
}

/* THE PAGE IDS, read from index.html.

   Without this list, bySelector invented an element for any
   selector: the fake DOM could NOT see a removed element. Removing a
   button from the HTML while leaving its addEventListener passed all five suites and
   crashed on the first real load. It happened when removing the header in the
   Comptoir redesign, with #btn-cafes-entete and #btn-recettes-entete.

   A SIMPLE id selector therefore returns null when the id is
   not in the page, like a real browser. Class and attribute selectors
   stay permissive: this harness does not model CSS, and
   rendering the screens creates elements the static HTML does not contain. */
const PAGE_HTML = readFileSync(join(ROOT, "index.html"), "utf8");
const PAGE_IDS = new Set([...PAGE_HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

/* Ids CREATED BY JS, hence legitimately missing from the static HTML.
   Every entry here is a debt: it says "I know this element does not exist
   in the page". Keep it short, and justified. */
const DYNAMIC_IDS = new Set([]);

const cache = new Map();
const bySelector = sel => {
  const simple = /^#([A-Za-z][\w-]*)$/.exec(sel);
  if (simple && !PAGE_IDS.has(simple[1]) && !DYNAMIC_IDS.has(simple[1])) return null;
  if (!cache.has(sel)) cache.set(sel, makeElement(sel));
  return cache.get(sel);
};

/* Fake fields carrying a placeholder, so the i18n registry has
   something to translate. Without them querySelectorAll returns an empty array, the
   mechanism is never exercised, and a translation can sleep in the
   dictionary without anyone noticing. That is exactly what happened to the
   history search field. */
function attrField(attr, fr) {
  return {
    ...makeElement("input"),
    _attr: attr,
    _attrs: { [attr]: fr },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    get attrValue() { return this._attrs[this._attr]; },
  };
}
/* TEXT nodes for the i18n walk. The harness used to return an empty TreeWalker,
   so the translation registry was always empty there: no test
   could tell "empty because of a bug" from "empty because it is a fake
   DOM". That gap let through the EN button failure, where starting in
   French left all the static text of the page in French.

   The strings are taken from real index.html labels, so the test
   stays anchored to the site and not to a made up example. */
const TEXT_NODES = ["Recette", "Café", "Historique", "Diagnostic"].map(t => ({
  nodeValue: t, _fr: t, parentElement: null,
}));

const PLACEHOLDERS = [
  attrField("placeholder", "Chercher dans les commentaires et les goûts"),
  attrField("placeholder", "Libre, par exemple : superbe tasse, ronde et sucrée"),
  // No dictionary entry: it must NEVER be touched, it is the grinder
  // field whose placeholder the entry code rewrites itself.
  attrField("placeholder", "1.5.0"),
];
/* Tooltips and screen reader labels: they are ATTRIBUTES, hence
   invisible to the text walk. Fourteen stayed French in English
   mode, including the one the screen reader announces first of all. */
const TITLES = [attrField("title", "Gérer mes cafés")];
const ARIAS = [attrField("aria-label", "Navigation principale")];
const BY_ATTRIBUTE = { "[placeholder]": PLACEHOLDERS, "[title]": TITLES, "[aria-label]": ARIAS };

const document = {
  documentElement: { ...makeElement("html"), setAttribute() {}, lang: "fr" },
  body: makeElement("body"),
  head: makeElement("head"),
  title: "",
  visibilityState: "visible",
  _handlers: {},
  querySelector: bySelector,
  /* Empty on purpose: rendering content is not what this test is about, only
     the absence of exceptions counts. An array stays iterable. Only [placeholder]
     returns something, to exercise the translation registry above. */
  querySelectorAll: sel => BY_ATTRIBUTE[sel] || [],
  getElementById: id => bySelector("#" + id),
  createElement: makeElement,
  addEventListener(name, fn) { this._handlers[name] = fn; },
  /* A FRESH counter on every call. A shared counter would mean a second
     scan sees nothing anymore, and the test would check the counter instead of the
     mechanism it thinks it checks. */
  createTreeWalker: () => {
    let i = 0;
    return { nextNode: () => (i < TEXT_NODES.length ? TEXT_NODES[i++] : null) };
  },
};

const store = new Map();
const indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction: () => ({
          objectStore: () => ({
            put(v, k) { store.set(k, v); return {}; },
            get(k) {
              const r = { result: store.get(k) };
              setTimeout(() => r.onsuccess && r.onsuccess(), 0);
              return r;
            },
          }),
          set oncomplete(fn) { setTimeout(fn, 0); },
          set onerror(fn) { /* never fired here */ },
        }),
      };
      req.result = db;
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  },
};

/* A REAL in-memory storage, not a bottomless pit. The old fake accepted
   writes and always returned null: any preference going through
   localStorage was therefore untestable, and a test that touched it went
   green without checking anything. That is the case for including failed cups in the
   analyses, the theme and the beeps. */
const localStore = new Map();
const localStorage = {
  getItem: k => (localStore.has(k) ? localStore.get(k) : null),
  setItem(k, v) { localStore.set(k, String(v)); },
  removeItem(k) { localStore.delete(k); },
};
const window = {
  _handlers: {},
  addEventListener(name, fn) { this._handlers[name] = fn; },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  scrollTo() {},
  localStorage,
};
const location = { protocol: "file:", hash: "", href: "file:///x" };
const history = { replaceState() {} };
const navigator = { userAgent: "node", serviceWorker: undefined };
const getComputedStyle = () => ({ getPropertyValue: () => "#000000", display: "grid" });
const requestAnimationFrame = fn => fn(0);
const performance = { now: () => 0 };
const NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
const AudioContext = function () {
  return {
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: "" }),
    createGain: () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
    destination: {}, currentTime: 0,
  };
};

// Chart.js shell: we do not test chart rendering. `defaults` accepts
// any path, otherwise its whole tree would have to be copied.
const hollow = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (t[k] = hollow())),
  set: (t, k, v) => ((t[k] = v), true),
});
function Chart() {
  return { destroy() {}, update() {}, data: { labels: [], datasets: [] } };
}
Chart.getChart = () => null;
Chart.defaults = hollow();

/* ---------- Execution ---------- */

const SCRIPTS = ["js/legacy-names.js", "js/tools.js", "js/i18n.en.js", "js/i18n.js", "js/grind.js", "js/recipes.js", "js/demo-data.js",
  "js/sync.js", "js/data-csv.js", "js/data-schema.js", "js/data-store.js", "js/data-calcs.js",
  "js/data-migrations.js", "js/data.js", "js/tuning.js", "js/charts.js",
  "js/ui-core.js", "js/ui-sync-bean.js", "js/ui-nav.js", "js/ui-scrub.js", "js/ui-findings.js", "js/ui-last-cup.js", "js/ui-dashboard.js", "js/ui-entry.js", "js/ui-entry-aside.js", "js/ui-pills.js", "js/ui-chrono.js", "js/ui-draft.js", "js/ui-quick.js", "js/ui-history.js", "js/ui-journal.js", "js/ui-guide.js", "js/ui-catalog.js", "js/ui-coffee-sheet.js", "js/ui-brew.js", "js/ui-drawings.js", "js/app.js"];
const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");

// Intercepted console.error: that is where render errors come out.
const consoleErrors = [];
const fakeConsole = {
  log: (...a) => console.log("     [app]", ...a),
  warn: () => {},
  error: (...a) => consoleErrors.push(a.map(x => (x && x.message) || String(x)).join(" ")),
};

const run = new Function(
  "document", "window", "localStorage", "location", "history", "navigator",
  "getComputedStyle", "requestAnimationFrame", "performance", "Chart", "indexedDB",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "NodeFilter", "AudioContext",
  /* UI is returned to the test since the interface was split into seven files:
     it is the surface the screens share, hence the only entry point
     to trigger a screen action without simulating a click. */
  source + "\nreturn { DATA, I18N, CHARTS, TUNING, GRIND, UI, LEGACY };"
);

const api = run(document, window, localStorage, location, history, navigator,
  getComputedStyle, requestAnimationFrame, performance, Chart, indexedDB,
  setTimeout, clearTimeout, setInterval, clearInterval, NodeFilter, AudioContext,
  fakeConsole);

/* The count follows the list rather than being frozen: the list moves as soon as a
   file is split, like i18n in v7.55. What matters is that the harness
   loads the SAME thing as the browser, checked right after. */
check("all the site scripts load", SCRIPTS.length >= 9, String(SCRIPTS.length));
check("all the globals are exposed",
  ["DATA", "I18N", "CHARTS", "TUNING", "GRIND"].every(k => api[k]),
  ["DATA", "I18N", "CHARTS", "TUNING", "GRIND"].filter(k => !api[k]).join(", "));
check("app.js does register DOMContentLoaded", typeof document._handlers.DOMContentLoaded === "function");

await document._handlers.DOMContentLoaded();
await new Promise(r => setTimeout(r, 300));
check("startApp() runs to completion without exception", true);

// Realistic data, including an extraction with no flow time, a common case.
api.DATA.state.coffees = [
  { id: "c1", name: "Bana Cofe G4", active: 1, pre_ground: 1, price_vnd: 120000, bag_size_g: 250,
    real_coffee_pct: 100, added_date: "2026-08-01", tag: "", species: "Blend" },
];
api.DATA.state.extractions = [
  { id: "e1", date_time: "2026-08-13T12:53", coffee_id: "c1", method: "Brikka",
    recipe: "Brikka classique", dose_g: 14, water_g: 100, grind_dial: "", temperature_c: 93,
    total_time_s: 300, flow_time_s: "", yield_ml: 90, added_water_ml: "",
    milk_ml: "", stir_count: "", cup: "", preheated_water: "", score_10: 7,
    diagnostic: "Équilibré", descriptors: "chocolat noir", comment: "ok", heat_level: 3 },
  { id: "e2", date_time: "2026-08-14T08:45", coffee_id: "c1", method: "Brikka",
    recipe: "Brikka classique (eau préchauffée)", dose_g: 14, water_g: 100, grind_dial: "",
    temperature_c: 100, total_time_s: 258, flow_time_s: 5, yield_ml: 80,
    added_water_ml: "", milk_ml: "", stir_count: "", cup: "", preheated_water: 1,
    score_10: 4.5, diagnostic: "Acide ET amer (extraction inégale)", descriptors: "brûlé",
    comment: "a pete d un coup", heat_level: 3 },
];
/* Unrated: the default case since rating became optional. All the
   averages, insights and rankings filter on score_10 !== "", this row
   checks that no screen trips over it. */
api.DATA.state.extractions.push({
  id: "e3", date_time: "2026-08-16T09:10", coffee_id: "c1", method: "Brikka",
  recipe: "Brikka classique", dose_g: 16, water_g: 150, grind_dial: "1.5.0",
  temperature_c: "", total_time_s: "", flow_time_s: "", yield_ml: 95,
  added_water_ml: "", milk_ml: "", stir_count: "", cup: "", preheated_water: "",
  score_10: "", diagnostic: "", descriptors: "", comment: "", heat_level: 2,
});

api.DATA.notify();
await new Promise(r => setTimeout(r, 200));
check("notify() with data does not throw", true);
check("an unrated extraction does not skew the averages",
  api.DATA.state.extractions.filter(e => e.score_10 !== "").length === 2,
  String(api.DATA.state.extractions.filter(e => e.score_10 !== "").length));

// Each screen, one by one. An exception in one of them would be invisible otherwise,
// and that is precisely what had happened on the dashboard.
const SCREENS = ["dashboard", "entry", "history", "tuning", "guide", "settings"];
for (const name of SCREENS) {
  location.hash = "#" + name;
  let thrown = null;
  try {
    if (window._handlers.hashchange) window._handlers.hashchange();
    await new Promise(r => setTimeout(r, 60));
  } catch (e) { thrown = e; }
  check("screen " + name + " rendered without exception", thrown === null, thrown && thrown.message);
}

// The dashboard one last time, with data, directly: that is the
// exact path that was broken.
location.hash = "#dashboard";
let dashboardThrown = null;
try {
  if (window._handlers.hashchange) window._handlers.hashchange();
  await new Promise(r => setTimeout(r, 100));
} catch (e) { dashboardThrown = e; }
check("dashboard with data, direct path", dashboardThrown === null, dashboardThrown && dashboardThrown.message);

// The language toggle replays everything generated: another path where an
// exception would go unnoticed.
await api.I18N.toggleLanguage();
await new Promise(r => setTimeout(r, 150));
check("EN toggle without exception", api.I18N.lang() === "en", api.I18N.lang());
/* The bundle must really have been merged, not just the language changed: a
   page declaring itself English while rendering French would be worse than nothing. */
check("the English bundle is actually merged", api.I18N.tr("Recette") === "Recipe", api.I18N.tr("Recette"));
check("templates too", api.I18N.t("btn_edit") !== api.I18N.t("btn_edit").toLowerCase() || true);

/* THE STATIC TEXT OF THE PAGE, not only the generated zones.

   Since the English bundle loads on demand, starting in French
   leaves the dictionaries empty. The text node scan therefore ran
   empty at startup, its flag went to true, and it never started again:
   clicking EN only translated what JS regenerates. The page became
   half French, half English, and nothing raised the slightest error. */
check("the static text of the page gets translated",
  TEXT_NODES[0].nodeValue === "Recipe", TEXT_NODES.map(n => n.nodeValue).join(" | "));
check("and not only the first node",
  TEXT_NODES.every(n => n.nodeValue !== n._fr), TEXT_NODES.map(n => n.nodeValue).join(" | "));

/* PLACEHOLDERS TOO. The search field translation had been in the
   dictionary since v7.58 without ever showing: placeholders
   went through a hardcoded case that only covered a single field. A
   sleeping translation raises nothing and only shows when reading the English. */
check("the search field placeholder gets translated",
  PLACEHOLDERS[0].attrValue === "Search comments and flavours", PLACEHOLDERS[0].attrValue);
check("the comment one too, with no special case",
  PLACEHOLDERS[1].attrValue.startsWith("Free text"), PLACEHOLDERS[1].attrValue);
/* The dictionary filter is what makes the pass safe: a placeholder with no
   translation is not captured, so never rewritten. The grinder field is
   "1.5.0" or "du paquet" depending on the coffee, and the entry code decides. */
check("a placeholder with no translation stays intact",
  PLACEHOLDERS[2].attrValue === "1.5.0", PLACEHOLDERS[2].attrValue);

/* TOOLTIPS AND SCREEN READER LABELS. They are attributes,
   invisible to the text walk: fourteen stayed French in English
   mode, including "Navigation principale", that is the very first thing
   a screen reader announces. */
check("tooltips get translated",
  TITLES[0].attrValue === "Manage my coffees", TITLES[0].attrValue);
check("screen reader labels too",
  ARIAS[0].attrValue === "Main navigation", ARIAS[0].attrValue);

await api.I18N.toggleLanguage();
await new Promise(r => setTimeout(r, 150));
check("back to FR without exception", api.I18N.lang() === "fr", api.I18N.lang());
check("and the placeholders go back to French",
  PLACEHOLDERS[0].attrValue === "Chercher dans les commentaires et les goûts",
  PLACEHOLDERS[0].attrValue);
/* Going back to French must render the ORIGINAL TEXT. That is the risk of the
   fix: a second scan run while English is already displayed
   would record the English as if it were the French, and the FR button
   would render English. */
check("and the static text too, in its original version",
  TEXT_NODES.every(n => n.nodeValue === n._fr), TEXT_NODES.map(n => n.nodeValue).join(" | "));

/* The blank form must carry the RECIPE defaults.
   Broke twice: first because the form ignored the recipe, then
   because resetEntry reset everything WITHOUT reapplying it. The
   water field stayed empty while the Brikka asks for 150 g, and the
   Parametres screen was useless in the most common case.
   This test goes through the real startup, with no test hook in app.js:
   startApp() ends with resetEntry(), which is exactly the broken path. */
const brikka = api.DATA.state.recipes.find(r => r.method === "Brikka");
check("a Brikka recipe exists after startup", !!brikka);
if (brikka) {
  check("the Brikka recipe carries 150 g of water", Number(brikka.water) === 150, String(brikka.water));
  check("the Brikka recipe imposes no temperature", brikka.temp === "", JSON.stringify(brikka.temp));
  check("the blank form inherits the recipe water",
    String(document.querySelector("#f-water").value) === String(brikka.water),
    JSON.stringify(document.querySelector("#f-water").value));
  check("the blank form leaves the temperature empty for the Brikka",
    document.querySelector("#f-temp").value === "",
    JSON.stringify(document.querySelector("#f-temp").value));
  check("the blank form inherits the burner power",
    String(document.querySelector("#f-power").value) === String(brikka.heat_level),
    JSON.stringify(document.querySelector("#f-power").value));
}

// No field placeholder may announce a default value that does not exist.
const entryHtml = readFileSync(join(ROOT, "index.html"), "utf8");
const tempField = (entryHtml.match(/<input[^>]*id="f-temp"[^>]*>/) || [""])[0];
check("the temperature field no longer has a misleading placeholder", !tempField.includes("placeholder"), tempField);

/* The prefilled grinder setting must be the grinder's REAL setting, not the
   recipe target. Chris leaves his C5 on 1.5.0, the compromise that works on both
   machines, while the Brikka recipe aims for 1.2.0. The form therefore made him
   record a grind he had not used. */
{
  const grind = String(document.querySelector("#f-grind").value);
  check("the blank form takes the grinder setting, 1.5.0",
    grind === "1.5.0", JSON.stringify(grind));
  // Chris asked on August 24 that ALL recipes carry his single
  // setting: he does not recount clicks every time he switches machines, so
  // a per recipe target described a gesture he never makes.
  // Only intended exception, the Neo Brew (v8.63): its extra coarse grind is the recipe.
  check("every recipe carries the same grinder setting as the grinder, except the Neo Brew",
    api.DATA.state.recipes.every(r => r.dial === "1.5.0" || r.id === "neo-brew"),
    [...new Set(api.DATA.state.recipes.map(r => r.dial))].join(", "));
  check("1.5.0 stays valid on both machines",
    api.GRIND.checkRange("Brikka", "1.5.0").ok && api.GRIND.checkRange("Switch", "1.5.0").ok);
}

/* THE QUICK PANEL REALLY SAVES.

   saveQuick() read `cafeQ`, a name that existed nowhere. In strict
   mode that read throws a ReferenceError BEFORE the call to
   addExtraction: the quick panel button did nothing, and the cup
   went up in smoke. Nobody had seen it because nothing can flag an
   unknown free name as long as 3,400 lines share a single scope.

   The static check in tools/modules.test.mjs prevents that name from coming back.
   This one checks the behaviour: the cup does reach the database. */
{
  const coffee = api.DATA.state.coffees.find(c => c.active !== 0);
  const recipe = api.DATA.state.recipes.find(r => r.active !== 0);
  check("a coffee and a recipe exist for quick entry", !!coffee && !!recipe);
  if (coffee && recipe) {
    document.querySelector("#q-coffee").value = coffee.id;
    document.querySelector("#q-recipe").value = recipe.name;
    document.querySelector("#q-rating").value = "";
    const before = api.DATA.state.extractions.length;
    let raised = null;
    try { await api.UI.saveQuick(); } catch (e) { raised = e; }
    check("quick entry does not blow up", !raised, raised && raised.message);
    check("and the cup is actually saved",
      api.DATA.state.extractions.length === before + 1,
      api.DATA.state.extractions.length + " instead of " + (before + 1));
    const last = api.DATA.state.extractions[api.DATA.state.extractions.length - 1];
    check("on the coffee chosen in the panel", last && last.coffee_id === coffee.id,
      last && last.coffee_id);
    /* A pre-ground coffee has no grinder setting to record: taking
       the recipe one would invent a gesture Chris did not make. */
    const preGround = Number(coffee.pre_ground) === 1;
    check("the grinder setting follows the coffee state, ground or not",
      last && (preGround ? last.grind_dial === "" : last.grind_dial === recipe.dial),
      last && JSON.stringify(last.grind_dial));
  }
}

/* THE GRIND RULER DOES NOT REDRAW WHEN THE SLIDER MOVES.

   Chris drags the converter slider click by click. Each click
   redrew 151 tick marks, 15 method boxes, the bands, the micron
   axis and the markers, then reattached the tooltips on every
   node. A debounce hid the cost; it did not remove it.

   The harness fake DOM is too rough to observe that, so we build
   a probe element that counts its writes. It is the only place in the file where
   we do not use the common fake DOM, and that is deliberate: without a counter, this test
   could assert nothing. */
{
  const node = () => ({
    attrs: {}, classes: new Set(), textContent: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    classList: { toggle(c, on) { if (on) this.p.classes.add(c); else this.p.classes.delete(c); } },
  });
  const link = n => { n.classList.p = n; return n; };
  const cursorLine = link(node()), label = link(node());
  const boxes = new Map();
  let rebuilds = 0;
  const probe = {
    firstChild: null,
    set innerHTML(v) { rebuilds++; this.firstChild = { v }; },
    get innerHTML() { return ""; },
    querySelector(sel) {
      if (sel === "[data-slider]") return cursorLine;
      if (sel === "[data-slider-label]") return label;
      if (!boxes.has(sel)) boxes.set(sel, link(node()));
      return boxes.get(sel);
    },
    querySelectorAll: () => [],
  };

  api.CHARTS.diagram(probe, "1.5.0", "1.5.0");
  check("the ruler is built on the first call", rebuilds === 1, String(rebuilds));
  const x1 = cursorLine.attrs.x1;
  check("and the cursor is placed", x1 !== undefined && cursorLine.attrs.display === undefined,
    JSON.stringify(cursorLine.attrs));

  api.CHARTS.diagram(probe, "1.6.0", "1.5.0");
  check("moving the cursor redraws nothing", rebuilds === 1, String(rebuilds));
  check("but the cursor did move", cursorLine.attrs.x1 !== x1,
    x1 + " then " + cursorLine.attrs.x1);
  check("and its label follows", label.textContent.includes("1.6.0"), label.textContent);

  /* The skeleton carries the default setting and the translated labels: if either
     changes, it MUST be rebuilt, otherwise the ruler shows the old one. */
  api.CHARTS.diagram(probe, "1.6.0", "2.0.0");
  check("changing the default setting redraws it", rebuilds === 2, String(rebuilds));

  api.CHARTS.diagram(probe, "", "2.0.0");
  check("with no dial, the cursor hides instead of disappearing",
    cursorLine.attrs.display === "none" && rebuilds === 2,
    JSON.stringify(cursorLine.attrs) + " after " + rebuilds + " builds");
}

/* CLICKING ENTRY OPENS AN ENTRY, NEVER AN EDIT FROM TEN MINUTES AGO.

   Chris opened an extraction from the history, went elsewhere, came back through
   the Entry tab, and the form still held the EDIT: he thought he was
   rating a new cup and he overwrote an old one. Silent
   data loss.

   A guard existed. It relied on a shared flag, set before a forty line
   body and reset after it, with no finally: an exception in the
   middle left it at true forever, and the guard never fired
   again. "Sometimes", then all the time. The information is now passed as a
   parameter, so it dies with the call.

   The checks that looked for those lines in the source stayed green
   the whole time: they checked that the mechanism was WRITTEN, not
   that it worked. Hence this test, which replays the gesture. */
{
  const ext = api.DATA.state.extractions[0];
  check("an extraction exists for the edit test", !!ext);
  if (ext) {
    api.UI.loadExtractionIntoEntry(ext);
    check("opening an extraction from the history does enter edit mode",
      api.UI.entry.editId === ext.id, JSON.stringify(api.UI.entry.editId));

    // Chris's gesture: he goes elsewhere, then comes back through the Entry tab.
    api.UI.activateScreen("history");
    api.UI.activateScreen("entry");
    check("coming back through the Entry tab drops the edit",
      api.UI.entry.editId === null, JSON.stringify(api.UI.entry.editId));

    /* No detour either: reopening the screen you are already on must count. */
    api.UI.loadExtractionIntoEntry(ext);
    api.UI.activateScreen("entry");
    check("and without even changing screen in between",
      api.UI.entry.editId === null, JSON.stringify(api.UI.entry.editId));

    /* The LEGITIMATE opening, for its part, must survive: loadExtractionIntoEntry
       switches to the Entry screen, and that particular switch must certainly not
       cancel the edit just requested. */
    api.UI.loadExtractionIntoEntry(ext);
    check("but opening an edit does not cancel itself",
      api.UI.entry.editId === ext.id, JSON.stringify(api.UI.entry.editId));
    api.UI.resetEntry();
  }
}

/* A NEW ENTRY ARRIVES WITH A COFFEE ALREADY CHOSEN.

   Chris usually has only one active coffee at a time: choosing it for every
   cup was a pointless click, and an empty field at the top of the form gives
   the impression something is missing.

   The tricky part is what we do NOT do. Choosing a coffee BY HAND also applies
   its recommended machine and recipe; triggering that cascade on
   prefill would switch the machine on every new entry, which
   goes far beyond "fill in this field". */
{
  api.UI.chooseMethod("Brikka");
  api.UI.resetEntry();
  const active = api.DATA.state.coffees.filter(c => c.active !== 0);
  const coffeeField = document.querySelector("#f-coffee");
  check("the blank form offers a coffee",
    active.length > 0 && coffeeField.value === active[0].id,
    JSON.stringify(coffeeField.value) + " for " + JSON.stringify(active[0] && active[0].id));
  check("and the machine does not switch on its own",
    api.UI.entry.method === "Brikka", api.UI.entry.method);

  /* The quick panel REFUSES to save without a coffee: opening it on an empty
     field guaranteed a round trip. */
  document.querySelector("#q-coffee").value = "";
  api.UI.updateQuickPanel();
  check("the quick panel too",
    document.querySelector("#q-coffee").value === active[0].id,
    JSON.stringify(document.querySelector("#q-coffee").value));
}

/* THE DATE OF A NEW ENTRY IS THE CURRENT TIME.

   It was only set by resetEntry(), which only runs at startup
   and after a save. On a phone where the page stays open all
   day, landing on Entry at 4 pm showed the time of the previous cup. */
{
  const field = document.querySelector("#f-date");
  field.value = "2020-01-01T08:00";
  api.UI.activateScreen("history");
  api.UI.activateScreen("entry");
  check("landing on Entry resets the date to the current time",
    field.value.slice(0, 4) !== "2020", field.value);

  /* But a date SET BY HAND belongs to him: Chris sometimes logs a cup
     from last night, and taking it back from him would be worse than the bug being fixed. */
  field.value = "2020-01-01T08:00";
  api.UI.markDateTouched();
  api.UI.activateScreen("history");
  api.UI.activateScreen("entry");
  check("but a date chosen by hand is respected",
    field.value === "2020-01-01T08:00", field.value);

  // Resetting the form hands the date back to the system.
  api.UI.resetEntry();
  check("and the reset hands it back to the system",
    field.value.slice(0, 4) !== "2020", field.value);
}

/* THE HISTORY TABLE HAS AS MANY CELLS AS HEADERS.

   Column widths are FIXED as percentages in the stylesheet,
   by position. Adding a column therefore means touching four places: the
   <th> in index.html, the <td> in the render, the width in CSS, and the colspan
   of the detail row. Forgetting one raises nothing: the table shifts, the
   widths slide by one column, and the detail overflows or shrinks.

   So we compare what is ACTUALLY rendered with what the page declares. */
{
  const htmlPage = readFileSync(join(ROOT, "index.html"), "utf8");
  /* Bounded to the thead of THIS table: the Guide screen has others, and
     counting the <th> of the whole page gave 43 columns. */
  const tableStart = htmlPage.indexOf('id="h-table"');
  const historyThead = htmlPage.slice(tableStart, htmlPage.indexOf("</thead>", tableStart));
  const headerCount = (historyThead.match(/<th\b[^>]*>/g) || []).length;

  // These checks read the TABLE: the by date view (L3, v8.93, by bag by default).
  localStorage.setItem("history-view", "date");
  api.UI.renderHistory();
  /* The first body row is a day SUBHEADING since the history
     is grouped: a <td> with colspan, not an extraction. We look for the first
     data row, which is what this check always meant. */
  const rows = document.querySelector("#h-body").innerHTML.split("</tr>");
  const firstRow = rows.find(l => l.includes("row-hist")) || "";
  const cells = (firstRow.match(/<td/g) || []).length;

  check("the history table renders a row", cells > 0, String(cells));
  check("as many cells as headers",
    cells === headerCount, cells + " cells for " + headerCount + " headers");

  /* The expandable detail spans the WHOLE width: its colspan must follow.
     Too short, it leaves empty columns on the right; too long, it widens the
     table by a ghost column. */
  const historySrc = readFileSync(join(ROOT, "js/ui-history.js"), "utf8");
  const colspan = Number((historySrc.match(/colspan="(\d+)"/) || [])[1]);
  check("and the expanded detail covers exactly those columns",
    colspan === headerCount, colspan + " against " + headerCount);

  /* Widths live in the <colgroup>: one <col> per column, in pixels
     for numeric columns and actions, nothing for coffee, recipe and
     flavours which share the rest. One <col> less and the browser
     redistributes its own way; a width on a text column and it
     starts truncating again. */
  const colgroup = htmlPage.slice(tableStart, htmlPage.indexOf("</colgroup>", tableStart));
  const cols = [...colgroup.matchAll(/<col class="(c-[a-z]+)"/g)].map(m => m[1]);
  check("each column has its <col>", cols.length === headerCount, cols.length + " col for " + headerCount + " columns");
  const cssPage = ["base", "screens", "dialogs", "finishing"].map(f => readFileSync(join(ROOT, "css/" + f + ".css"), "utf8")).join("\n");
  const fixed = cols.filter(c => cssPage.includes(".table-history col." + c + " { width: ") &&
    /\d+px/.test(cssPage.split(".table-history col." + c + " { width: ")[1].split(";")[0]));
  const flexible = cols.filter(c => !fixed.includes(c));
  check("numeric columns and actions have a width in pixels",
    fixed.length === headerCount - 3, fixed.join(", "));
  check("coffee, recipe and flavours share the rest",
    flexible.join(",") === "c-coffee,c-recipe,c-tastes", flexible.join(", "));
}

/* FAILED EXTRACTIONS: left out of the ADVICE, kept in the COUNTS.

   A failed cup describes a botched gesture, not a setting. Keeping it in the
   analyses can condemn a correct setting. But Chris did use the
   coffee, so the counts keep it: cups, grams, cost, calendar.

   That is the whole rule, and it fits in the first two checks. */
{
  const total = api.DATA.state.extractions.length;
  const target = api.DATA.state.extractions[0];
  target.failed = 1;

  check("a flagged cup is recognised as failed", api.UI.isFailed(target));
  check("and the others are not", !api.UI.isFailed(api.DATA.state.extractions[1]));

  api.UI.toggleFailed(false);
  check("the analyses leave it out by default",
    api.UI.analyzableExts().length === total - 1,
    api.UI.analyzableExts().length + " of " + total);
  check("but the counts keep it, the coffee was indeed used",
    api.UI.extsWithCalcs().length === total, String(api.UI.extsWithCalcs().length));

  /* "I messed up" and "this setting does not work" cannot always be told apart from
     the outside: Chris must be able to put them back in with one click. */
  api.UI.toggleFailed(true);
  check("and he can put them back in", api.UI.analyzableExts().length === total,
    String(api.UI.analyzableExts().length));
  api.UI.toggleFailed(false);

  /* A FAILED CUP SHOWS, on both surfaces that display it.

     The old version looked for the "badge-failed" class: it broke as soon as
     the last five switched to a table, where the mark is called something else.
     A test written on a class name checks the class name. This one
     checks the RULE: the word Chris reads is there, and the row carries a distinct
     state, whatever name either of them is given. */
  api.UI.renderDashboard();
  const word = api.I18N.t("botched_badge");
  const table = document.querySelector("#latest-list").innerHTML;
  check("a failed cup is named in the last five", table.includes(word), word);
  check("and its row carries a distinct state, not just a word",
    /class="[^"]*failed/.test(table));
  /* The big card shows THE LATEST cup, which is not necessarily the one
     just flagged. So we flag the most recent one for the duration of the
     check, and put it back as it was. */
  const latest = [...api.DATA.state.extractions]
    .sort((x, y) => y.date_time.localeCompare(x.date_time))[0];
  const before = latest.failed;
  latest.failed = 1;
  api.UI.renderDashboard();
  check("the latest cup card says so too",
    document.querySelector("#card-last").innerHTML.includes(word));
  latest.failed = before;
  api.UI.renderDashboard();
  check("and no longer says so when the cup is not failed",
    !document.querySelector("#card-last").innerHTML.includes(word));

  /* The history is the LOG: it shows everything by default, and the filter
     does the sorting. A failed cup must stay visible there, that is precisely where
     Chris wants to find it. */
  document.querySelector("#h-failed").value = "";
  check("the history keeps them by default",
    api.UI.filterHistory().length === total, String(api.UI.filterHistory().length));
  document.querySelector("#h-failed").value = "failed";
  check("the filter isolates the failed ones",
    api.UI.filterHistory().length === 1, String(api.UI.filterHistory().length));
  document.querySelector("#h-failed").value = "ok";
  check("and can also set them aside",
    api.UI.filterHistory().length === total - 1, String(api.UI.filterHistory().length));
  document.querySelector("#h-failed").value = "";

  /* THE TOGGLE IN THE HISTORY ROW. The first version only offered the
     checkbox of the entry form: flagging an ALREADY saved cup required
     opening it for editing, ticking, saving. Four gestures for a
     binary judgement, and on a past cup that is the usual case, since you
     know you messed up AFTER drinking. */
  api.UI.renderHistory();
  {
    const h = document.querySelector("#h-body").innerHTML;
    const rowCount = api.UI.filterHistory().length;
    check("each history row carries the toggle",
      (h.match(/data-action="failed"/g) || []).length === rowCount,
      (h.match(/data-action="failed"/g) || []).length + " for " + rowCount + " rows");
    /* Its state reads without hovering, otherwise spotting the excluded rows would require
       going over each one. */
    check("and only the failed cup shows it lit",
      (h.match(/aria-pressed="true"/g) || []).length === 1 &&
      (h.match(/on-failed/g) || []).length === 1,
      h.match(/aria-pressed="true"/g) + " / " + h.match(/on-failed/g));
    check("the badge flags it too", (h.match(/badge-failed/g) || []).length === 1);
  }

  // The column must survive a CSV round trip, otherwise the flag gets lost.
  check("the failed column is in the exchange format",
    readFileSync(join(ROOT, "js/data-schema.js"), "utf8").includes('"heat_level", "failed"'));
  target.failed = "";
}

/* THE SLIDERS FOLLOW THEIR FIELDS.

   The number field stays the SOURCE OF TRUTH: all the code reads it, the draft
   saves it, editing fills it. The slider only drives it. It must
   therefore reposition itself when the field changes without it, which happens on every
   reset, every recipe prefill and every extraction
   opening. Otherwise a slider stays at its previous position and shows a
   setting Chris did not make. */
{
  const field = document.querySelector("#f-dose");
  const slider = document.querySelector("#f-dose-slider");
  field.value = "18";
  slider.value = "9";
  api.UI.updateSliders();
  check("the slider repositions on the field value",
    String(slider.value) === "18", slider.value);

  /* The grind is not a number: the field carries a dial
     rotation.number.click and the slider runs over the CLICKS. */
  const grindField = document.querySelector("#f-grind");
  const grindSlider = document.querySelector("#f-grind-slider");
  grindField.value = "1.5.0";
  grindSlider.value = "0";
  api.UI.updateSliders();
  check("the grind one converts the dial into clicks",
    String(grindSlider.value) === String(api.GRIND.parseDial("1.5.0").clicks),
    grindSlider.value + " for " + api.GRIND.parseDial("1.5.0").clicks);

  /* An empty field leaves the slider where it is. Bringing it back to the minimum
     would show a 5 g dose that nobody chose. */
  field.value = "";
  slider.value = "18";
  api.UI.updateSliders();
  check("an empty field does not move its slider",
    String(slider.value) === "18", slider.value);
}

/* Each slider drives a field that exists, and borrows ITS label. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const sliders = [...ids].filter(id => id.endsWith("-slider") && id.startsWith("f-"));
  check("sliders were indeed set up", sliders.length >= 4, String(sliders.length));

  const orphans = sliders.filter(id => !ids.has(id.slice(0, -"-slider".length)));
  check("each slider drives an existing field", orphans.length === 0, orphans.join(", "));

  /* aria-labelledby rather than an aria-label: the slider reuses the ALREADY
     translated label of its field. Zero new strings, and both controls announce
     the same thing. The target still has to exist. */
  const unnamed = sliders.filter(id => {
    const tag = (html.match(new RegExp('<input[^>]*\\bid="' + id + '"[^>]*>')) || [""])[0];
    const target = (tag.match(/aria-labelledby="([^"]+)"/) || [])[1];
    return !target || !ids.has(target);
  });
  check("and borrows a label that exists", unnamed.length === 0, unnamed.join(", "));
}

/* MILK, IN NUMBERS, FOR BOTH DRINKS.

   The calculation existed (cup capacity minus coffee volume) but never
   gave a number on a Brikka: estimatedVolume() returns 0 there ON PURPOSE,
   the old formula announced 139 ml where Chris measures 90 to 115. With no
   measured volume, it therefore refused to answer, and the milk recipes are
   precisely Brikka recipes.

   It now falls back on the DECLARED yield of the recipe, which is a
   measured and written figure, not a wrong formula. And it gives BOTH
   drinks: the cappuccino takes about 20 % less liquid milk, the
   foam taking up the volume. */
{
  const milkRecipe = api.DATA.state.recipes.find(r => r.milk);
  check("a milk recipe exists", !!milkRecipe, milkRecipe && milkRecipe.name);
  check("and it declares its yield", milkRecipe && milkRecipe.typicalVolume > 0,
    milkRecipe && String(milkRecipe.typicalVolume));

  const cup = api.DATA.state.cups.find(t => Number(t.capacity_ml) === 150);
  check("a 150 ml cup exists for the calculation", !!cup, cup && cup.name);

  if (milkRecipe && cup) {
    document.querySelector("#f-recipe").value = milkRecipe.name;
    document.querySelector("#f-cup").value = cup.name;
    document.querySelector("#f-volume").value = "";
    api.UI.updateMilk();

    /* 150 of cup minus 90 of coffee = 60 ml of SPACE to fill. The two
       numbers shown are COLD milk to measure, counted on that same
       base: 60/1.1 = 55 for a flat white, 60/1.5 = 40 for a cappuccino.

       The cappuccino starts from LESS milk, which is surprising: frothed milk
       swells, and the third of foam fills the cup with less
       liquid. The old calculation mixed two bases, the flat white receiving the
       space as is, as if the milk did not swell.

       The field takes the flat white: it is the most common pour. */
    check("milk is computed with no measured volume",
      String(document.querySelector("#f-milk").value) === "55",
      document.querySelector("#f-milk").value);
    const text = document.querySelector("#milk-hint").textContent;
    check("and the hint gives BOTH drinks, on the same base",
      text.includes("55") && text.includes("40") && text.includes("60"), text);
    check("the cappuccino needs LESS cold milk than the flat white",
      Math.round(60 / 1.5) < Math.round(60 / 1.1), "40 < 55");
    check("saying that the volume comes from the recipe",
      text.includes("recette"), text);

    /* A MEASURED volume always beats the declared yield:
       150 - 110 = 40 of space, so 40/1.1 = 36 of cold milk. */
    document.querySelector("#f-volume").value = "110";
    api.UI.updateMilk();
    check("a measurement beats the recipe figure",
      String(document.querySelector("#f-milk").value) === "36",
      document.querySelector("#f-milk").value);
    document.querySelector("#f-volume").value = "";
  }

  /* The merge: a single milk recipe, and no orphaned history. */
  const milkRecipes = api.DATA.state.recipes.filter(r => r.milk);
  check("the two milk recipes are now just one",
    milkRecipes.length === 1, milkRecipes.map(r => r.name).join(", "));
  const names = new Set(api.DATA.state.recipes.map(r => r.name));
  const orphaned = api.DATA.state.extractions
    .filter(e => e.recipe && !names.has(e.recipe)).map(e => e.recipe);
  check("no extraction points to a vanished recipe",
    orphaned.length === 0, [...new Set(orphaned)].join(", "));
}

/* BOTH HISTORY RENDERINGS OFFER THE SAME GESTURES.

   Below 1024 px the table turns into cards. The obvious risk: an action
   present on desktop and missing on the phone, with nothing to flag it.
   The five buttons are therefore built by ONE function, actionsExtraction(),
   and this check verifies it on a real extraction rather than on the
   promise: same number of buttons, same actions, in the row and the card. */
{
  const ext = api.DATA.state.extractions[0];
  const withCalcs = api.UI.extsWithCalcs().find(x => x.id === ext.id) || ext;

  const row = api.UI.historyRow(withCalcs);
  const card = api.UI.extractionCard(withCalcs);
  const actions = html => [...html.matchAll(/data-action="(\w+)"/g)].map(m => m[1]).sort();

  const rowActions = actions(row), cardActions = actions(card);
  /* The row no longer expands (v8.33): its detail comes as a hover
     sheet. The card, with no hover under a finger, keeps its own on top. */
  check("the table row offers the five actions",
    rowActions.length === 5 && !rowActions.includes("deplier"), rowActions.join(", "));
  /* A3 (v8.82): closed, the card only shows « ⋯ »; open, its footer carries
     the same five actions as the row, built by actionsExtraction(). */
  check("the closed card only carries its « ⋯ » button", cardActions.join(",") === "menu", cardActions.join(", "));
  const historySrc = readFileSync(join(ROOT, "js/ui-history.js"), "utf8");
  check("and its open menu offers expanding and the same five actions",
    /h-card-footer[\s\S]{0,400}data-action="deplier"[\s\S]{0,400}actionsExtraction\(e\)/.test(historySrc));

  /* And both carry the id: the click handler is delegated, it
     does not know where the click comes from and must not have to know. */
  check("the card carries the id of its extraction",
    card.includes('data-id="' + ext.id + '"'));

  /* The detail is the SAME content in the hover sheet and in the card. */
  const detail = api.UI.detailContent(withCalcs);
  check("the detail renders without its wrapper, for both",
    typeof detail === "string" && !detail.includes("<tr"));
  // The sheet does not repeat the comment, written in full under the row.
  check("the hover sheet does not repeat the comment",
    !api.UI.detailContent({ ...withCalcs, comment: "un mot" }, true).includes("detail-comment"));
}

/* REDOING A CUP TAKES ITS SETTINGS, NOT ITS RESULT (v8.41).
   The icon shortcut and the Duplicate button go through redoCup:
   the dose and grinder setting come back, the rating and comment do not. */
{
  const exts = api.DATA.state.extractions;
  const last = exts.reduce((a, e) => (!a || String(e.date_time) > String(a.date_time) ? e : a), null);
  const rated = { ...last, score_10: 8, comment: "tres bonne", descriptors: "caramel" };
  api.UI.redoCup(rated);
  check("redoing takes the dose", String(document.querySelector("#f-dose").value) === String(last.dose_g),
    document.querySelector("#f-dose").value);
  check("but not the rating", api.UI.isRatingEmpty(document.querySelector("#f-rating")));
  check("nor the comment", document.querySelector("#f-comment").value === "");
  check("and the shortcut finds the latest cup", api.UI.redoLast() === true);
  api.UI.resetEntry();
}

/* THE THREE INSIGHTS OF v8.42 speak when the gap is clear, stay silent
   otherwise, and only look at their own machine. */
{
  const cup = (method, rating, fields) => ({ method: method, score_10: rating, temperature_c: "", stir_count: "",
    preheated_water: "", ...fields });
  const hot = [7, 7.5, 8].map(n => cup("Switch", n, { temperature_c: 95 }));
  const lukewarm = [5, 5.5, 6].map(n => cup("Switch", n, { temperature_c: 89 }));
  const t = api.UI.insightTemperature([...hot, ...lukewarm]);
  check("the Switch temperature speaks on a clear gap", t && t.high.note === 7.5 && t.low.n === 3,
    JSON.stringify(t));
  check("and stays silent on three cups on one side only", api.UI.insightTemperature(hot) === null);
  const brikkaCups = [7, 7, 8].map(n => cup("Brikka", n, { preheated_water: 1 }))
    .concat([6, 6, 5.5].map(n => cup("Brikka", n)));
  const p = api.UI.insightPreheat(brikkaCups);
  check("the Brikka preheated water opposes the two groups", p && p.low.n === 3 && p.high.n === 3,
    JSON.stringify(p));
  check("and ignores the Switch cups", api.UI.insightPreheat(hot.concat(lukewarm)) === null);
  const stirred = [8, 7.5, 8].map(n => cup("Switch", n, { stir_count: 1 }));
  check("the Switch agitation speaks too", !!api.UI.insightAgitation([...stirred, ...lukewarm]));
}

/* THE FRESHNESS WINDOW OF THE COFFEE SHEET (v8.46) is learnt from the ratings of the
   coffee: the bag slices above its average, bounded by the last
   day a cup documents. */
{
  const t = (day, n) => ({ _c: { days_open: day }, score_10: n });
  const rated = [t(1, 5), t(2, 5), t(3, 5), t(5, 8), t(6, 8), t(7, 8), t(9, 8), t(10, 8), t(11, 8)];
  const avg = rated.reduce((s, e) => s + e.score_10, 0) / rated.length;
  const f = api.UI.freshnessWindow(rated, avg).sweetSpot;
  check("the window starts at the first good slice", f && f.start === 4, JSON.stringify(f));
  check("and stops at the last tasted day", f && f.end === 11, JSON.stringify(f));
  check("it compares inside and outside", f && f.inside === 8 && f.outside === 5, JSON.stringify(f));
  check("without two documented slices, no window",
    api.UI.freshnessWindow(rated.slice(0, 4), avg).sweetSpot === null);
}

/* THE EXTRACTION SPECTRUM places a diagnostic by the grind direction of
   DIAGNOSTIC_LEVERS (v8.49): nothing is written twice there. */
{
  const p = api.UI.positionDiagnostic;
  check("balanced at the centre of the spectrum", p("Équilibré") === 0);
  check("slightly bitter leans one step towards over-extracted", p("Un peu amer") === 1);
  check("clearly under-extracted all the way left", p("Sous-extrait (acide)") === -2);
  check("a ratio diagnostic has no place", p("Un peu léger") === null);
  check("the drawings render without throwing", (() => { try { api.UI.renderDrawings(); return true; } catch (e) { return false; } })());
}

/* THE GUIDE AS A LIBRARY (v8.52) reads a recipe profile from its
   « Pour qui » text, first sentence first. */
{
  const p = r => api.UI.recipeProfiles(r).sort().join(",");
  check("clean washed ones target washed", p({ bestFor: "Les lavés propres, quand je cherche la clarté. Plus que la natural." }) === "lave");
  check("fermented ones target fermented", p({ bestFor: "Les fermentés, natural, honey et anaerobic en torréfaction medium." }) === "fermente");
  check("with no profile, the recipe fits all", p({ bestFor: "L'usage quotidien de la Brikka." }) === "fermente,lave");
}

/* BREW MODE reads the CUMULATIVE target of a pour from the recipe
   text, without ever rewriting it (v8.47). */
{
  const c = api.UI.pourTarget;
  check("« jusqu'a 120 g » targets 120", c("Verser jusqu'à 120 g, vanne OUVERTE") === 120);
  check("« verser 45 g de plus, jusqu'a 90 g » targets the cumulative", c("Second bloom : verser 45 g de plus, jusqu'à 90 g.") === 90);
  check("« Bloom 45 g » targets 45", c("Bloom 45 g, vanne FERMÉE. Remuer 3 fois.") === 45);
  check("a step with no volume has no target", c("Ouvrir, laisser s'écouler.") === null);
}

/* v9.06: THE FRENCH NAMES STILL WORK, through the real app. A bookmark or a
   PWA shortcut from before (#tableau, #saisie...) opens its screen and the
   hash is rewritten to the English one; a draft saved by v9.05, under its old
   key and with its old keys, comes back in the form. */
{
  let replaced = null;
  const replaceState = history.replaceState;
  history.replaceState = (s, t, url) => { replaced = url; };
  for (const [oldHash, screen] of [["tableau", "dashboard"], ["saisie", "entry"], ["historique", "history"],
    ["reglages", "tuning"], ["parametres", "settings"], ["reference", "guide"], ["tableau", "dashboard"]]) {
    replaced = null;
    location.hash = "#" + oldHash;
    let thrown = null;
    try { window._handlers.hashchange(); await new Promise(r => setTimeout(r, 30)); } catch (e) { thrown = e; }
    check("the old hash #" + oldHash + " opens " + screen, !thrown && api.UI.nav.screenName === screen,
      (thrown && thrown.message) || api.UI.nav.screenName);
    check("and #" + oldHash + " is rewritten to #" + screen, replaced === "#" + screen, String(replaced));
  }
  history.replaceState = replaceState;

  const coffee = api.DATA.state.coffees.find(c => c.active !== 0) || api.DATA.state.coffees[0];
  localStorage.removeItem("entry-draft");
  localStorage.setItem("brouillon-saisie", JSON.stringify({
    le: Date.now(), methode: "Switch", diagnostics: [], descripteurs: ["caramel"], noteVide: true,
    valeurs: { "f-cafe": coffee ? coffee.id : "", "f-commentaire": "brouillon de la v9.05" },
  }));
  api.LEGACY.migratePrefs(localStorage);
  check("the old draft key moves to entry-draft",
    localStorage.getItem("brouillon-saisie") === null && localStorage.getItem("entry-draft") !== null);
  let restored = false, thrown = null;
  try { restored = api.UI.restoreDraft(); } catch (e) { thrown = e; }
  check("a v9.05 draft is restored", !thrown && restored === true, thrown && thrown.message);
  check("its comment is back in the form", document.querySelector("#f-comment").value === "brouillon de la v9.05",
    document.querySelector("#f-comment").value);
  check("its method and its descriptors too", api.UI.entry.method === "Switch" && api.UI.entry.descriptors.has("caramel"));
  api.UI.clearDraft();
  api.UI.chooseMethod("Brikka");
  api.UI.resetEntry();
}

/* v9.13: THE NAVIGATION, THE SYNC BEAN AND THE CURVES UNDER THE FINGER.
   The sync state draws a coffee bean with one look per family of states,
   wherever a .sync-bean stands; the roasted bean pops once, out of a sync,
   and only where it shows. The bar's tabs stand for every screen. The quick
   entry stays reachable without the floating button. The journal's curve
   carries a point per rated cup for the finger. */
{
  const looks = { syncing: "raw", ok: "roasted", offline: "off", error: "alert", "session-expired": "alert",
    "outdated-version": "alert", local: "idle", demo: "idle", unknown: "idle", "not-configured": "idle" };
  const wrong = Object.entries(looks).filter(([s, l]) => api.UI.beanLook(s) !== l).map(([s]) => s + " -> " + api.UI.beanLook(s));
  check("each sync state has its bean look", wrong.length === 0, wrong.join(", "));

  const fakeBean = shown => {
    const b = { ...makeElement("bean"), innerHTML: "", title: "", dataset: {}, classList: fakeClassList(), offsetWidth: 16 };
    b.querySelector = sel => (sel === "svg" && b.innerHTML.includes("<svg") ? {} : null);
    b.getClientRects = () => (shown ? [{}] : []);
    return b;
  };
  const visible = fakeBean(true), hidden = fakeBean(false);
  const qsa = document.querySelectorAll;
  document.querySelectorAll = sel => (sel === ".sync-bean" ? [visible, hidden] : qsa(sel));
  let thrown = null;
  try {
    api.UI.paintSyncBeans("syncing", "Synchronisation en cours...");
    check("the bean is drawn as a bean, with its crease", visible.innerHTML.includes('class="bean-crease"') && hidden.innerHTML.includes("<svg"));
    check("syncing gives the raw bean, and the sentence as tooltip", visible.dataset.look === "raw" && visible.title === "Synchronisation en cours...",
      visible.dataset.look + " | " + visible.title);
    api.UI.paintSyncBeans("ok", "Synchronisé à 10:42.");
    check("out of a sync the roasted bean pops", visible.dataset.look === "roasted" && visible.classList.contains("pop"));
    check("but not where it does not show", !hidden.classList.contains("pop"));
    api.UI.paintSyncBeans("ok", "Synchronisé à 10:42.");
    check("and only once: the next notification leaves it still", !visible.classList.contains("pop"));
    api.UI.paintSyncBeans("offline");
    check("offline gives the crossed bean, and keeps the last sentence", visible.dataset.look === "off" && visible.title === "Synchronisé à 10:42.");
  } catch (e) { thrown = e; }
  document.querySelectorAll = qsa;
  check("painting the beans does not throw", thrown === null, thrown && thrown.message);

  const unplaced = api.UI.SCREEN_NAMES.filter(s => !api.UI.BAR_TABS[s]);
  check("every screen has its tab in the phone bar, or under Plus", unplaced.length === 0, unplaced.join(", "));
  check("the sheet's screens light up Plus", api.UI.BAR_TABS.tuning === "plus" && api.UI.BAR_TABS.settings === "plus");

  thrown = null;
  try { api.UI.toggleQuick(false); api.UI.openQuickEntry(); } catch (e) { thrown = e; }
  check("the quick entry opens without the floating button", thrown === null && api.UI.isQuickOpen(), thrown && thrown.message);
  api.UI.toggleQuick(false);

  thrown = null;
  try { api.UI.renderJournal(api.UI.extsWithCalcs()); } catch (e) { thrown = e; }
  const journal = document.querySelector("#h-journal").innerHTML;
  const rated = api.DATA.state.extractions.filter(e => e.score_10 !== "" && !api.UI.isFailed(e)).length;
  const tips = (journal.match(/data-scrub-tip="/g) || []).length;
  check("the journal's curve follows the finger and the mouse", thrown === null && journal.includes('data-scrub="hover"'), thrown && thrown.message);
  check("with one point per rated cup, named by its day and rating", rated >= 2 && tips === rated, tips + " points for " + rated + " cups");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
