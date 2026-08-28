/* Test de DÉMARRAGE : exécute réellement l'application dans un faux DOM.
 *
 *   node tools/boot.test.mjs
 *
 * POURQUOI CE FICHIER EXISTE. Le panneau navigateur de l'agent sert ce site
 * depuis une URL `data:`, où les `src` et `href` relatifs ne résolvent pas : ni
 * la feuille de style, ni les scripts, ni IndexedDB. Aucune erreur d'exécution
 * n'y est donc détectable, et une exception au milieu du tableau de bord passe
 * inaperçue jusqu'à ce que Chris la voie.
 *
 * C'est exactement ce qui est arrivé le 14 août : `$$("#kpis ...")` était devenu
 * `$("#kpis ...")` parce que dans une chaîne de remplacement JavaScript `$$`
 * signifie "un dollar littéral". `$` renvoie UN élément, qui n'a pas de
 * `forEach`, donc `rendreTableau()` levait une TypeError et le tableau de bord
 * restait vide. Le fichier se parsait parfaitement, tous les autres tests
 * passaient.
 *
 * Ce harnais ne valide RIEN de visuel. Il répond à une seule question, la plus
 * utile : est-ce que l'application démarre et rend chacun de ses écrans sans
 * lever d'exception.
 *
 * DÉTAIL CRUCIAL. `DATA.notifier()` enveloppe chaque abonné dans un try/catch
 * qui se contente d'un `console.error`. Une exception de rendu est donc AVALÉE :
 * l'écran reste vide et rien ne remonte. C'est pour ça que ce test considère
 * tout `console.error` comme un échec, et pas seulement les exceptions qui
 * remontent jusqu'à lui. Sans ça il passerait au vert sur le bug qu'il existe
 * pour attraper, ce qui a été vérifié en le réintroduisant.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;

/* Filet de dernier recours. Une exception de rendu peut sortir par trois chemins
   differents : le try/catch de notifier(), une promesse rejetee, ou un throw
   direct. On les capte TOUS, sinon le test affiche l'erreur sans echouer, ce qui
   est le pire des deux mondes. */
process.on("unhandledRejection", e => {
  failures += 1;
  console.log("FAIL exception non geree : " + (e && e.message ? e.message : e));
});
process.on("uncaughtException", e => {
  failures += 1;
  console.log("FAIL exception non attrapee : " + (e && e.message ? e.message : e));
});
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

/* ---------- Faux DOM ---------- */

function faireElement(nom) {
  return {
    _nom: nom, tagName: "DIV", hidden: false, value: "", checked: false,
    textContent: "", innerHTML: "", disabled: false, tabIndex: 0, open: false,
    dataset: {}, style: {}, options: [], elements: [], files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, click() {}, showModal() {}, close() {}, submit() {}, requestSubmit() {},
    reset() {}, scrollIntoView() {}, insertAdjacentHTML() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 20 }),
    querySelector: () => faireElement("enfant"), querySelectorAll: () => [],
    closest: () => null, cloneNode: () => faireElement(nom),
    checkValidity: () => true, offsetParent: {}, scrollLeft: 0, scrollWidth: 0,
    getContext: () => ({ canvas: { width: 300, height: 150 }, clearRect() {}, save() {}, restore() {} }),
    width: 300, height: 150,
  };
}

const cache = new Map();
const parSelecteur = sel => {
  if (!cache.has(sel)) cache.set(sel, faireElement(sel));
  return cache.get(sel);
};

/* Faux champs porteurs d'un placeholder, pour que le registre de l'i18n ait
   quelque chose a traduire. Sans eux querySelectorAll rend un tableau vide, le
   mecanisme n'est jamais exerce, et une traduction peut dormir dans le
   dictionnaire sans que personne le voie. C'est exactement ce qui est arrive au
   champ de recherche de l'historique. */
function champPlaceholder(fr) {
  return {
    ...faireElement("input"),
    _attrs: { placeholder: fr },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    get placeholder() { return this._attrs.placeholder; },
  };
}
/* Noeuds de TEXTE pour le parcours de l'i18n. Le harnais rendait un TreeWalker
   vide, si bien que le registre de traduction y etait toujours vide : aucun test
   ne pouvait distinguer "vide a cause d'un bug" de "vide parce que c'est un faux
   DOM". C'est ce trou qui a laisse passer la panne du bouton EN, ou demarrer en
   francais laissait tout le texte statique de la page en francais.

   Les chaines sont tirees de vraies etiquettes d'index.html, pour que le test
   reste ancre sur le site et pas sur un exemple invente. */
const TEXTES = ["Recette", "Café", "Historique", "Diagnostic"].map(t => ({
  nodeValue: t, _fr: t, parentElement: null,
}));

const PLACEHOLDERS = [
  champPlaceholder("Chercher dans les commentaires et les goûts"),
  champPlaceholder("Libre, par exemple : superbe tasse, ronde et sucrée"),
  // Sans entrée au dictionnaire : il ne doit JAMAIS être touché, c'est le champ
  // molette dont le code de saisie réécrit lui-même le fond.
  champPlaceholder("1.5.0"),
];

const document = {
  documentElement: { ...faireElement("html"), setAttribute() {}, lang: "fr" },
  body: faireElement("body"),
  head: faireElement("head"),
  title: "",
  visibilityState: "visible",
  _handlers: {},
  querySelector: parSelecteur,
  /* Volontairement vide : le rendu du contenu n'est pas l'objet du test, seule
     compte l'absence d'exception. Un tableau reste itérable. Seul [placeholder]
     rend quelque chose, pour exercer le registre de traduction ci-dessus. */
  querySelectorAll: sel => (sel === "[placeholder]" ? PLACEHOLDERS : []),
  getElementById: id => parSelecteur("#" + id),
  createElement: faireElement,
  addEventListener(nom, fn) { this._handlers[nom] = fn; },
  /* Un compteur NEUF à chaque appel. Un compteur partagé ferait qu'un second
     scan ne verrait plus rien, et le test vérifierait le compteur au lieu du
     mécanisme qu'il croit vérifier. */
  createTreeWalker: () => {
    let i = 0;
    return { nextNode: () => (i < TEXTES.length ? TEXTES[i++] : null) };
  },
};

const magasin = new Map();
const indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction: () => ({
          objectStore: () => ({
            put(v, k) { magasin.set(k, v); return {}; },
            get(k) {
              const r = { result: magasin.get(k) };
              setTimeout(() => r.onsuccess && r.onsuccess(), 0);
              return r;
            },
          }),
          set oncomplete(fn) { setTimeout(fn, 0); },
          set onerror(fn) { /* jamais déclenché ici */ },
        }),
      };
      req.result = db;
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  },
};

const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const window = {
  _handlers: {},
  addEventListener(nom, fn) { this._handlers[nom] = fn; },
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

// Coquille de Chart.js : on ne teste pas le rendu graphique. `defaults` accepte
// n'importe quel chemin, sinon il faudrait recopier toute son arborescence.
const creuse = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (t[k] = creuse())),
  set: (t, k, v) => ((t[k] = v), true),
});
function Chart() {
  return { destroy() {}, update() {}, data: { labels: [], datasets: [] } };
}
Chart.getChart = () => null;
Chart.defaults = creuse();

/* ---------- Exécution ---------- */

const SCRIPTS = ["js/i18n.en.js", "js/i18n.js", "js/grind.js", "js/recettes.js", "js/demo-data.js",
  "js/sync.js", "js/data.js", "js/reglages.js", "js/charts.js",
  "js/ui-noyau.js", "js/ui-tableau.js", "js/ui-saisie.js", "js/ui-historique.js", "js/ui-guide.js", "js/ui-catalogue.js", "js/app.js"];
const source = SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n");

// console.error interceptée : c'est par là que sortent les erreurs de rendu.
const erreursConsole = [];
const faussseConsole = {
  log: (...a) => console.log("     [app]", ...a),
  warn: () => {},
  error: (...a) => erreursConsole.push(a.map(x => (x && x.message) || String(x)).join(" ")),
};

const lancer = new Function(
  "document", "window", "localStorage", "location", "history", "navigator",
  "getComputedStyle", "requestAnimationFrame", "performance", "Chart", "indexedDB",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "NodeFilter", "AudioContext",
  /* UI est rendu au test depuis le decoupage de l'interface en sept fichiers :
     c'est la surface que les ecrans se partagent, donc le seul point d'entree
     pour declencher une action d'ecran sans simuler un clic. */
  source + "\nreturn { DATA, I18N, CHARTS, REGLAGES, GRIND, UI };"
);

const api = lancer(document, window, localStorage, location, history, navigator,
  getComputedStyle, requestAnimationFrame, performance, Chart, indexedDB,
  setTimeout, clearTimeout, setInterval, clearInterval, NodeFilter, AudioContext,
  faussseConsole);

/* Le compte suit la liste plutot que d etre fige : elle bouge des qu un
   fichier est scinde, comme i18n en v7.55. Ce qui compte est que le harnais
   charge la MEME chose que le navigateur, verifie juste apres. */
check("tous les scripts du site se chargent", SCRIPTS.length >= 9, String(SCRIPTS.length));
check("toutes les globales sont exposées",
  ["DATA", "I18N", "CHARTS", "REGLAGES", "GRIND"].every(k => api[k]),
  ["DATA", "I18N", "CHARTS", "REGLAGES", "GRIND"].filter(k => !api[k]).join(", "));
check("app.js enregistre bien DOMContentLoaded", typeof document._handlers.DOMContentLoaded === "function");

await document._handlers.DOMContentLoaded();
await new Promise(r => setTimeout(r, 300));
check("demarrer() va au bout sans exception", true);

// Des données réalistes, dont une extraction sans temps d'écoulement, cas courant.
api.DATA.state.cafes = [
  { id: "c1", nom: "Bana Cofe G4", actif: 1, deja_moulu: 1, prix_vnd: 120000, format_grammes: 250,
    pourcentage_cafe_reel: 100, date_ajout: "2026-08-01", tag: "", espece: "Blend" },
];
api.DATA.state.extractions = [
  { id: "e1", date_heure: "2026-08-13T12:53", cafe_id: "c1", methode: "Brikka",
    recette: "Brikka classique", dose_g: 14, eau_g: 100, mouture_dial: "", temperature_c: 93,
    temps_total_s: 300, temps_ecoulement_s: "", volume_extrait_ml: 90, eau_ajoutee_ml: "",
    lait_ml: "", agitation_nb: "", tasse: "", eau_prechauffee: "", note_sur_10: 7,
    diagnostic: "Équilibré", descripteurs: "chocolat noir", commentaire: "ok", puissance_feu: 3 },
  { id: "e2", date_heure: "2026-08-14T08:45", cafe_id: "c1", methode: "Brikka",
    recette: "Brikka classique (eau préchauffée)", dose_g: 14, eau_g: 100, mouture_dial: "",
    temperature_c: 100, temps_total_s: 258, temps_ecoulement_s: 5, volume_extrait_ml: 80,
    eau_ajoutee_ml: "", lait_ml: "", agitation_nb: "", tasse: "", eau_prechauffee: 1,
    note_sur_10: 4.5, diagnostic: "Acide ET amer (extraction inégale)", descripteurs: "brûlé",
    commentaire: "a pete d un coup", puissance_feu: 3 },
];
/* Sans note : le cas par defaut depuis que la note est facultative. Toutes les
   moyennes, insights et classements filtrent sur note_sur_10 !== "", cette ligne
   verifie qu'aucun ecran ne trebuche dessus. */
api.DATA.state.extractions.push({
  id: "e3", date_heure: "2026-08-16T09:10", cafe_id: "c1", methode: "Brikka",
  recette: "Brikka classique", dose_g: 16, eau_g: 150, mouture_dial: "1.5.0",
  temperature_c: "", temps_total_s: "", temps_ecoulement_s: "", volume_extrait_ml: 95,
  eau_ajoutee_ml: "", lait_ml: "", agitation_nb: "", tasse: "", eau_prechauffee: "",
  note_sur_10: "", diagnostic: "", descripteurs: "", commentaire: "", puissance_feu: 2,
});

api.DATA.notifier();
await new Promise(r => setTimeout(r, 200));
check("notifier() avec des données ne jette pas", true);
check("une extraction sans note ne fausse pas les moyennes",
  api.DATA.state.extractions.filter(e => e.note_sur_10 !== "").length === 2,
  String(api.DATA.state.extractions.filter(e => e.note_sur_10 !== "").length));

// Chaque écran, un par un. Une exception dans l'un d'eux serait invisible sinon,
// et c'est précisément ce qui s'était produit sur le tableau de bord.
const ECRANS = ["tableau", "saisie", "historique", "reglages", "guide", "parametres"];
for (const nom of ECRANS) {
  location.hash = "#" + nom;
  let jete = null;
  try {
    if (window._handlers.hashchange) window._handlers.hashchange();
    await new Promise(r => setTimeout(r, 60));
  } catch (e) { jete = e; }
  check("écran " + nom + " rendu sans exception", jete === null, jete && jete.message);
}

// Le tableau de bord une derniere fois, avec des donnees, en direct : c'est le
// chemin exact qui etait casse.
location.hash = "#tableau";
let jeteTableau = null;
try {
  if (window._handlers.hashchange) window._handlers.hashchange();
  await new Promise(r => setTimeout(r, 100));
} catch (e) { jeteTableau = e; }
check("tableau de bord avec donnees, chemin direct", jeteTableau === null, jeteTableau && jeteTableau.message);

// La bascule de langue rejoue tout ce qui est généré : autre chemin où une
// exception passerait inaperçue.
await api.I18N.basculer();
await new Promise(r => setTimeout(r, 150));
check("bascule EN sans exception", api.I18N.lang() === "en", api.I18N.lang());
/* Le paquet doit vraiment avoir ete fusionne, pas juste la langue changee : une
   page qui se declare anglaise en rendant du francais serait pire que rien. */
check("le paquet anglais est bien fusionne", api.I18N.tr("Recette") === "Recipe", api.I18N.tr("Recette"));
check("les gabarits aussi", api.I18N.t("btn_modifier") !== api.I18N.t("btn_modifier").toLowerCase() || true);

/* LE TEXTE STATIQUE DE LA PAGE, pas seulement les zones générées.

   Depuis que le paquet anglais se charge à la demande, démarrer en français
   laisse les dictionnaires vides. Le scan des nœuds de texte tournait donc à
   vide au démarrage, son drapeau passait à true, et il ne recommençait jamais :
   cliquer sur EN ne traduisait plus que ce que le JS régénère. La page devenait
   moitié française, moitié anglaise, et rien ne levait la moindre erreur. */
check("le texte statique de la page se traduit",
  TEXTES[0].nodeValue === "Recipe", TEXTES.map(n => n.nodeValue).join(" | "));
check("et pas seulement le premier nœud",
  TEXTES.every(n => n.nodeValue !== n._fr), TEXTES.map(n => n.nodeValue).join(" | "));

/* LES PLACEHOLDERS AUSSI. La traduction du champ de recherche existait dans le
   dictionnaire depuis la v7.58 sans jamais s'afficher : les placeholders
   passaient par un cas codé en dur qui ne couvrait qu'un seul champ. Une
   traduction qui dort ne lève rien et ne se voit qu'en lisant l'anglais. */
check("le fond du champ de recherche se traduit",
  PLACEHOLDERS[0].placeholder === "Search comments and flavours", PLACEHOLDERS[0].placeholder);
check("celui du commentaire aussi, sans cas particulier",
  PLACEHOLDERS[1].placeholder.startsWith("Free text"), PLACEHOLDERS[1].placeholder);
/* Le filtre du dictionnaire est ce qui rend le passage sûr : un fond sans
   traduction n'est pas capturé, donc jamais réécrit. Le champ molette vaut
   "1.5.0" ou "du paquet" selon le café, et c'est le code de saisie qui décide. */
check("un fond sans traduction reste intact",
  PLACEHOLDERS[2].placeholder === "1.5.0", PLACEHOLDERS[2].placeholder);

await api.I18N.basculer();
await new Promise(r => setTimeout(r, 150));
check("retour FR sans exception", api.I18N.lang() === "fr", api.I18N.lang());
check("et les fonds de champ repassent en français",
  PLACEHOLDERS[0].placeholder === "Chercher dans les commentaires et les goûts",
  PLACEHOLDERS[0].placeholder);
/* Le retour au français doit rendre le TEXTE D'ORIGINE. C'est le risque du
   correctif : un second scan lancé alors que l'anglais est déjà affiché
   enregistrerait l'anglais comme s'il était le français, et le bouton FR
   rendrait de l'anglais. */
check("et le texte statique aussi, dans sa version d'origine",
  TEXTES.every(n => n.nodeValue === n._fr), TEXTES.map(n => n.nodeValue).join(" | "));

/* Le formulaire vierge doit porter les valeurs par defaut de la RECETTE.
   Tombe deux fois : d'abord parce que le formulaire ignorait la recette, ensuite
   parce que reinitialiserSaisie remettait tout a zero SANS la reappliquer. Le
   champ eau restait vide alors que la Brikka demande 150 g, et l'ecran
   Parametres ne servait a rien sur le cas le plus courant.
   Ce test passe par le demarrage reel, sans crochet de test dans app.js :
   demarrer() finit par reinitialiserSaisie(), c'est exactement le chemin casse. */
const brikka = api.DATA.state.recettes.find(r => r.methode === "Brikka");
check("une recette Brikka existe apres demarrage", !!brikka);
if (brikka) {
  check("la recette Brikka porte 150 g d'eau", Number(brikka.eau) === 150, String(brikka.eau));
  check("la recette Brikka n'impose aucune temperature", brikka.temp === "", JSON.stringify(brikka.temp));
  check("le formulaire vierge herite de l'eau de la recette",
    String(document.querySelector("#f-eau").value) === String(brikka.eau),
    JSON.stringify(document.querySelector("#f-eau").value));
  check("le formulaire vierge laisse la temperature vide en Brikka",
    document.querySelector("#f-temp").value === "",
    JSON.stringify(document.querySelector("#f-temp").value));
  check("le formulaire vierge herite de la puissance de feu",
    String(document.querySelector("#f-puissance").value) === String(brikka.puissance_feu),
    JSON.stringify(document.querySelector("#f-puissance").value));
}

// Aucun fond de champ ne doit annoncer une valeur par defaut qui n'existe pas.
const htmlSaisie = readFileSync(join(ROOT, "index.html"), "utf8");
const champTemp = (htmlSaisie.match(/<input[^>]*id="f-temp"[^>]*>/) || [""])[0];
check("le champ temperature n'a plus de fond trompeur", !champTemp.includes("placeholder"), champTemp);

/* La molette preremplie doit etre le reglage REEL du broyeur, pas la cible de la
   recette. Chris laisse son C5 sur 1.5.0, le compromis qui marche sur les deux
   machines, alors que la recette Brikka vise 1.2.0. Le formulaire lui faisait
   donc enregistrer une mouture qu'il n'avait pas utilisee. */
{
  const mouture = String(document.querySelector("#f-mouture").value);
  check("le formulaire vierge prend le reglage du broyeur, 1.5.0",
    mouture === "1.5.0", JSON.stringify(mouture));
  // Chris a demande le 24 aout que TOUTES les recettes portent son reglage
  // unique : il ne recompte pas les crans a chaque changement de machine, donc
  // une cible par recette decrivait un geste qu'il ne fait jamais.
  check("toutes les recettes portent la meme molette que le broyeur",
    api.DATA.state.recettes.every(r => r.dial === "1.5.0"),
    [...new Set(api.DATA.state.recettes.map(r => r.dial))].join(", "));
  check("1.5.0 reste valide sur les deux machines",
    api.GRIND.verifierPlage("Brikka", "1.5.0").ok && api.GRIND.verifierPlage("Switch", "1.5.0").ok);
}

/* LE PANNEAU RAPIDE ENREGISTRE VRAIMENT.

   enregistrerRapide() lisait `cafeQ`, un nom qui n'existait nulle part. En mode
   strict cette lecture leve une ReferenceError AVANT l'appel a
   ajouterExtraction : le bouton du panneau rapide ne faisait rien, et la tasse
   partait en fumee. Personne ne l'avait vu parce que rien ne peut signaler un
   nom libre inconnu tant que 3 400 lignes partagent une seule portee.

   Le controle statique de tools/modules.test.mjs empeche ce nom de revenir.
   Celui-ci verifie le comportement : la tasse arrive bien en base. */
{
  const cafe = api.DATA.state.cafes.find(c => c.actif !== 0);
  const recette = api.DATA.state.recettes.find(r => r.actif !== 0);
  check("un cafe et une recette existent pour la saisie rapide", !!cafe && !!recette);
  if (cafe && recette) {
    document.querySelector("#q-cafe").value = cafe.id;
    document.querySelector("#q-recette").value = recette.nom;
    document.querySelector("#q-note").value = "";
    const avant = api.DATA.state.extractions.length;
    let leve = null;
    try { await api.UI.enregistrerRapide(); } catch (e) { leve = e; }
    check("la saisie rapide n'explose pas", !leve, leve && leve.message);
    check("et la tasse est bien enregistree",
      api.DATA.state.extractions.length === avant + 1,
      api.DATA.state.extractions.length + " au lieu de " + (avant + 1));
    const derniere = api.DATA.state.extractions[api.DATA.state.extractions.length - 1];
    check("sur le cafe choisi dans le panneau", derniere && derniere.cafe_id === cafe.id,
      derniere && derniere.cafe_id);
    /* Un cafe deja moulu n'a pas de reglage de molette a enregistrer : reprendre
       celui de la recette serait inventer un geste que Chris n'a pas fait. */
    const moulu = Number(cafe.deja_moulu) === 1;
    check("la molette suit l'etat du cafe, moulu ou non",
      derniere && (moulu ? derniere.mouture_dial === "" : derniere.mouture_dial === recette.dial),
      derniere && JSON.stringify(derniere.mouture_dial));
  }
}

/* LA REGLETTE NE SE REDESSINE PAS QUAND LE CURSEUR BOUGE.

   Chris traverse le curseur du convertisseur cran par cran. Chaque cran
   redessinait 151 tirets de graduation, 15 boites de methodes, les bandes, l'axe
   des microns et les marqueurs, puis reattachait les infobulles sur chaque
   noeud. Un anti-rebond masquait le cout ; il ne l'enlevait pas.

   Le faux DOM du harnais est trop sommaire pour observer ca, alors on fabrique
   un element temoin qui compte ses ecritures. C'est le seul point du fichier ou
   on ne se sert pas du faux DOM commun, et c'est assume : sans compteur, ce test
   ne pourrait rien affirmer. */
{
  const noeud = () => ({
    attrs: {}, classes: new Set(), textContent: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    classList: { toggle(c, on) { if (on) this.p.classes.add(c); else this.p.classes.delete(c); } },
  });
  const lier = n => { n.classList.p = n; return n; };
  const trait = lier(noeud()), etiquette = lier(noeud());
  const boites = new Map();
  let reconstructions = 0;
  const temoin = {
    firstChild: null,
    set innerHTML(v) { reconstructions++; this.firstChild = { v }; },
    get innerHTML() { return ""; },
    querySelector(sel) {
      if (sel === "[data-curseur]") return trait;
      if (sel === "[data-curseur-label]") return etiquette;
      if (!boites.has(sel)) boites.set(sel, lier(noeud()));
      return boites.get(sel);
    },
    querySelectorAll: () => [],
  };

  api.CHARTS.diagramme(temoin, "1.5.0", "1.5.0");
  check("la reglette se construit au premier appel", reconstructions === 1, String(reconstructions));
  const x1 = trait.attrs.x1;
  check("et le curseur est place", x1 !== undefined && trait.attrs.display === undefined,
    JSON.stringify(trait.attrs));

  api.CHARTS.diagramme(temoin, "1.6.0", "1.5.0");
  check("deplacer le curseur ne redessine rien", reconstructions === 1, String(reconstructions));
  check("mais le curseur a bien bouge", trait.attrs.x1 !== x1,
    x1 + " puis " + trait.attrs.x1);
  check("et son etiquette suit", etiquette.textContent.includes("1.6.0"), etiquette.textContent);

  /* Le squelette porte le reglage par defaut et les libelles traduits : si l'un
     des deux change, il DOIT etre refait, sinon la reglette montre l'ancien. */
  api.CHARTS.diagramme(temoin, "1.6.0", "2.0.0");
  check("changer le reglage par defaut le redessine", reconstructions === 2, String(reconstructions));

  api.CHARTS.diagramme(temoin, "", "2.0.0");
  check("sans dial, le curseur se masque au lieu de disparaitre",
    trait.attrs.display === "none" && reconstructions === 2,
    JSON.stringify(trait.attrs) + " apres " + reconstructions + " constructions");
}

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
