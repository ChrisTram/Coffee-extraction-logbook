/* Tests of the morph group (v9.26): R15, everything transforms.
 *
 *   node tools/morph.test.mjs
 *
 * The pure parts of js/ui-morph.js (the boxes cut to the window, the FLIP of
 * a shared text, which texts say the same thing, the layers) run here with a
 * stub of the interface core. Then the calm paths: with reduced motion, a
 * hidden page or a source out of view, the update runs once and nothing
 * moves. Last, the hooks the screens carry are read in their files.
 * boot.test.mjs runs the site for real. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, f), "utf8");

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

/* ---------- A fake page, enough for the file ---------- */

function load(opts) {
  const o = opts || {};
  const UI = { nav: { screenName: "history" } };
  const listeners = [];
  const document = {
    visibilityState: o.hidden ? "hidden" : "visible",
    documentElement: { style: {}, clientWidth: 1280, clientHeight: 900 },
    body: { appendChild() {} },
    addEventListener: (k, fn) => listeners.push(k),
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
  };
  const window = { innerWidth: 1280, innerHeight: 900 };
  const matchMedia = q => ({ matches: q.includes("reduce") ? !!o.calm : false });
  new Function("UI", "document", "window", "matchMedia", "getComputedStyle", "setTimeout", "clearTimeout", read("js/ui-morph.js"))(
    UI, document, window, matchMedia, () => ({}), () => 0, () => {});
  return { UI, document, listeners };
}

// An element of the fake page: a box, and the ability to animate.
function el(rect, extra) {
  return {
    nodeType: 1, isConnected: true, style: {}, animate: () => ({ finished: Promise.resolve(), cancel() {} }),
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] }),
    ...(extra || {}),
  };
}

const { UI } = load();
const M = UI.morphMath;

/* ---------- The boxes ---------- */
{
  const c = M.clampRect;
  const inView = c({ left: 10, top: 20, width: 100, height: 50 }, 1280, 900, 24);
  check("a box in the window stays as it is", inView && inView.left === 10 && inView.top === 20 && inView.width === 100 && inView.height === 50);
  const tall = c({ left: 0, top: -500, width: 400, height: 1000 }, 1280, 900, 24);
  check("a long card scrolled half out starts from what shows of it, give or take the margin",
    tall && tall.top === -24 && tall.height === 524 && tall.width === 400, JSON.stringify(tall));
  check("a box out of the window, or only in its margin, is nothing to grow from",
    c({ left: 0, top: 910, width: 100, height: 40 }, 1280, 900, 24) === null &&
    c({ left: 0, top: -30, width: 100, height: 20 }, 1280, 900, 24) === null);
  check("a box with no size (a hidden row, a closed window) is nothing either",
    c({ left: 0, top: 0, width: 0, height: 40 }, 1280, 900, 24) === null && c(null, 1280, 900, 0) === null);
  const u = M.union({ left: 10, top: 10, width: 10, height: 10 }, { left: 30, top: 0, width: 5, height: 5 });
  check("the box around two boxes", u.left === 10 && u.top === 0 && u.width === 25 && u.height === 20, JSON.stringify(u));
  check("a box holds what lies inside it, not what leaves it",
    M.contains({ left: 0, top: 0, width: 100, height: 100 }, { left: 10, top: 10, width: 50, height: 50 }) &&
    !M.contains({ left: 0, top: 0, width: 100, height: 100 }, { left: -40, top: 10, width: 50, height: 50 }));
}

/* ---------- The FLIP of a shared text ---------- */
{
  const f = M.flipText;
  // The same size: the text moves by exactly the distance between the two places.
  const same = f({ left: 900, top: 100, width: 300, height: 40 }, { left: 900, top: 100, width: 120, height: 40 },
    { left: 300, top: 400, width: 120, height: 40 }, 1);
  check("at the same size, the text moves by the distance between its two places", same.dx === -600 && same.dy === 300, JSON.stringify(same));
  /* Scaled down by half from its top left corner: the left edges and the
     middle lines meet. Point p of the element lands at box + d + k (p - box). */
  const box = { left: 900, top: 100, width: 300, height: 60 }, text = { left: 910, top: 110, width: 200, height: 40 };
  const from = { left: 300, top: 400, width: 100, height: 20 }, k = 0.5;
  const d = f(box, text, from, k);
  const landsLeft = box.left + d.dx + k * (text.left - box.left);
  const landsMid = box.top + d.dy + k * (text.top + text.height / 2 - box.top);
  check("scaled, the text's left edge lands on the source's", Math.abs(landsLeft - from.left) < 1e-9, String(landsLeft));
  check("scaled, the text's middle line lands on the source's", Math.abs(landsMid - (from.top + from.height / 2)) < 1e-9, String(landsMid));
}

/* ---------- Which texts glide ---------- */
{
  const s = M.sameText;
  check("the same name glides, whatever the case or the accents", s("Là Việt Balanced", "LA VIET balanced") && s("Cà Phê Mít Liberica", "Ca Phe Mit Liberica"));
  check("a recipe glides into the panel's line that holds it too",
    s("Brikka classique (eau préchauffée)", "Brikka · Brikka classique (eau préchauffée)"));
  check("a card's figures glide into the brew mode's", s("14 g / 150 g", "14 g · 150 g") && s("Brikka · 14 g / 150 g · 90 °C", "14 g · 150 g"));
  check("a comment never flies into a coffee's name", !s("« Superbe, notes de jacquier bien mûres »", "Bana Cofe G4"));
  check("a score is a score: 8,5 is not 8, nor 5", s("8,5", "8,5") && !s("8", "8,5") && !s("8,5", "5") && s("9", "9"));
  check("nothing is never the same as anything", !s("", "Bana") && !s("Bana", "") && !s("…", "·"));

  const pairs = M.matchKeys(
    [{ key: "name", text: "Bana Cofe G4" }, { key: "score", text: "9" }, { key: "recipe", text: "Brikka classique" }, { key: "name", text: "other" }],
    [{ key: "recipe", text: "Brikka · Brikka classique" }, { key: "name", text: "Bana Cofe G4" }, { key: "score", text: "8,5" }]);
  check("keys pair by name, once each, and only when they say the same thing",
    pairs.map(p => p.key).join(",") === "name,recipe", pairs.map(p => p.key).join(","));
  check("a key the detail does not show glides nowhere", M.matchKeys([{ key: "score", text: "9" }], [{ key: "name", text: "9" }]).length === 0);
}

/* ---------- Colours and layers ---------- */
{
  const c = M.isClear;
  check("a colour that paints nothing is clear", c("transparent") && c("rgba(0, 0, 0, 0)") && c("rgb(0 0 0 / 0)") && c("") && c(undefined));
  check("a real colour, even half seen, is not", !c("rgb(27, 27, 30)") && !c("rgba(18, 18, 20, 0.5)") && !c("rgb(0 0 0 / 0.4)"));
  check("a gradient card lends its last solid stop to the ghost, not its accent wash",
    M.gradientColor("linear-gradient(160deg, rgba(229, 147, 90, 0.13), rgb(20, 29, 42) 70%)") === "rgb(20, 29, 42)" &&
    M.gradientColor("none") === null && M.gradientColor("linear-gradient(rgba(0, 0, 0, 0.2), transparent)") === null);
  const l = M.layerOf;
  check("a modal window is above everything: the ghost only has to be above the page", l({ topLayer: true, z: null }).ghost === 1000 && l({ topLayer: true }).raise === null);
  check("the side panel keeps its layer, the ghost flies just under it", l({ topLayer: false, z: 147 }).ghost === 146 && l({ z: 147 }).raise === null);
  check("a row or a screen is lifted above the ghost for the trip", l({ z: null }).ghost === 1 && l({ z: null }).raise === 2);
  const over = l({ z: null, over: true });
  check("from a whole screen (the brew mode), the ghost covers the bars and the row rises above it", over.ghost === 1000 && over.raise === 1001);
  check("the pieces of the detail arrive after half the trip, one by one, then together",
    M.restDelay(0, 440) === 220 && M.restDelay(1, 440) === 260 && M.restDelay(30, 440) === M.restDelay(8, 440));
  check("one timing for every morph, under 450 ms, and the tiles of Analyses read it",
    UI.MOTION.duration <= 450 && UI.MOTION.back <= UI.MOTION.duration && /UI\.MOTION/.test(read("js/ui-analytics.js")));
}

/* ---------- The calm paths: the update always runs, once ---------- */
{
  const tries = [
    ["reduced motion", load({ calm: true }), el([10, 10, 100, 40])],
    ["a hidden page", load({ hidden: true }), el([10, 10, 100, 40])],
    ["a source out of view", load(), el([10, 2000, 100, 40])],
    ["no source", load(), null],
    ["a source that cannot animate", load(), el([10, 10, 100, 40], { animate: undefined })],
  ];
  tries.forEach(([label, page, source]) => {
    let runs = 0;
    const moved = page.UI.morphOpen(source, () => { runs += 1; }, () => null);
    check("with " + label + ": no morph, the update runs once", moved === false && runs === 1, moved + " " + runs);
  });
  // Closing with nothing remembered: the plain close, once; with a fade asked and no movement possible, the same.
  const page = load({ calm: true });
  let closes = 0;
  page.UI.morphBack(el([0, 0, 400, 900]), () => { closes += 1; }, { fade: true });
  page.UI.morphBack(null, () => { closes += 1; });
  check("closing without a way back closes at once, once each", closes === 2, String(closes));
  check("no morph runs, no view transition is held back", page.UI.morphing() === false);
}

/* ---------- The hooks in the screens ---------- */
{
  const core = read("js/ui-core.js");
  check("a screen opened by a morph switches without a view transition (it would freeze the page over the ghost)",
    /UI\.morphing\(\)/.test(core) && /reducedMotion \|\| cache \|\| morphing \|\|/.test(core));
  const panel = read("js/ui-panel.js");
  check("a touched cup grows into the side panel, or into the entry on the phone",
    panel.includes('UI.morphOpen(touched, show, "#side-panel"') && panel.includes('UI.morphOpen(touched, load, "#screen-entry"'));
  check("the panel's Close and Escape fold it back into its row, the other closings do not",
    panel.includes('closePanel(true); return;') && panel.includes("UI.morphBack($(\"#side-panel\")") &&
    read("js/ui-shortcuts.js").includes("UI.closePanel(true)"));
  check("the home's latest cups and its big card open through openCup", read("js/ui-dashboard.js").includes("UI.openCup(ext, li)"));
  check("Ctrl K: a coffee or a cup result grows into what opens", /UI\.morphOpen\(row, go, UI\.morphDetail\)/.test(read("js/ui-palette.js")));
  const guide = read("js/ui-guide.js"), brew = read("js/ui-brew.js");
  check("a recipe card grows into the brew mode", guide.includes('UI.morphOpen(card, UI.openBrew, "#modal-brew"') &&
    guide.includes('brewRecipe(b.dataset.brew, b.closest(".recipe-card"))'));
  check("the brew mode folds back into its card, or fades; saving and completing close at once",
    brew.includes("UI.morphBack(m,") && brew.includes("{ fade: true }") && brew.includes("closeBrew(true);") &&
    brew.includes('addEventListener("cancel"'));
  const src = read("js/ui-morph.js");
  check("the colours are copied before the classes change", src.indexOf("const destLook = lookOf(dest);") < src.indexOf('dest.classList.add("morph-dest")'));
  check("a second tap or key ends the trip, and two timers end it without frames",
    src.includes('addEventListener("pointerdown", t.stop, true)') && src.includes('addEventListener("keydown", t.stop, true)') &&
    /setTimeout\(t\.stop, total \+ 120\)/.test(src));
  check("the ghost never takes a tap", /\.morph-ghost \{[^}]*pointer-events: none;/.test(read("css/morph.css")));
  const html = read("index.html"), sw = read("sw.js");
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="css\/([\w-]+)\.css\?v=/g)].map(m => m[1]);
  check("morph.css is the last sheet, and precached with the script", sheets[sheets.length - 1] === "morph" &&
    sw.includes('"./css/morph.css"') && sw.includes('"./js/ui-morph.js"') && /ui-feel\.js\?v=[\d.]+"><\/script>\n<script defer src="js\/ui-morph\.js/.test(html));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
